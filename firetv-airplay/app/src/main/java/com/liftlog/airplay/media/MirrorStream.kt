package com.liftlog.airplay.media

import android.util.Log
import java.io.DataInputStream
import java.io.EOFException
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.util.concurrent.atomic.AtomicBoolean

/** Where decoded-ready video goes. Implemented by the service. */
interface VideoSink {
    fun onFormat(width: Int, height: Int, sps: ByteArray, pps: ByteArray)
    fun onAccessUnit(data: ByteArray, length: Int, presentationTimeUs: Long)
    fun onStreamEnded()
}

/**
 * AirPlay length-prefixes each NAL unit with a 4-byte big-endian size, whereas
 * MediaCodec wants Annex-B start codes. The two are the same width, so the
 * conversion is an in-place overwrite.
 */
internal object AnnexB {
    /**
     * Rewrites the prefixes in `buffer[offset, offset + length)`.
     * Returns false if the region does not parse as a NAL sequence — in
     * practice that means decryption produced garbage.
     */
    fun rewriteInPlace(buffer: ByteArray, offset: Int, length: Int): Boolean {
        var pos = 0
        while (pos < length) {
            if (pos + 4 > length) return false
            val nalLength = readIntBE(buffer, offset + pos)
            if (nalLength <= 0 || pos + 4 + nalLength > length) return false

            buffer[offset + pos] = 0
            buffer[offset + pos + 1] = 0
            buffer[offset + pos + 2] = 0
            buffer[offset + pos + 3] = 1

            // forbidden_zero_bit must be clear in a well-formed NAL header.
            if (buffer[offset + pos + 4].toInt() and 0x80 != 0) return false

            pos += 4 + nalLength
        }
        return pos == length
    }

    private fun readIntBE(b: ByteArray, offset: Int): Int =
        ((b[offset].toInt() and 0xFF) shl 24) or
            ((b[offset + 1].toInt() and 0xFF) shl 16) or
            ((b[offset + 2].toInt() and 0xFF) shl 8) or
            (b[offset + 3].toInt() and 0xFF)
}

/**
 * Reads the mirroring video stream.
 *
 * The client opens a plain TCP connection to the port we hand back in RTSP
 * SETUP and writes a sequence of [128-byte header][payload] records. The header
 * carries the payload length (little-endian), a type byte, and a timestamp.
 */
class MirrorStream(private val cipher: MirrorCipher, private val sink: VideoSink) {

    private val serverSocket = ServerSocket(0).apply { soTimeout = ACCEPT_TIMEOUT_MS }
    private val running = AtomicBoolean(true)
    private var thread: Thread? = null
    private var client: Socket? = null

    /** The port to advertise in the SETUP response. */
    val port: Int get() = serverSocket.localPort

    /** Parameter sets from the most recent unencrypted type-1 packet. */
    private var pendingParameterSets: ByteArray? = null
    private var pendingTimestamp: Long = 0

    fun start() {
        thread = Thread(::run, "airplay-mirror").apply {
            isDaemon = true
            start()
        }
    }

    private fun run() {
        while (running.get()) {
            val socket = try {
                serverSocket.accept()
            } catch (e: java.net.SocketTimeoutException) {
                continue
            } catch (e: Exception) {
                if (running.get()) Log.e(TAG, "accept failed", e)
                return
            }

            client = socket
            Log.i(TAG, "mirroring client connected from ${socket.inetAddress}")
            try {
                socket.tcpNoDelay = true
                socket.keepAlive = true
                readStream(socket)
            } catch (e: EOFException) {
                Log.i(TAG, "mirroring stream closed by client")
            } catch (e: SocketException) {
                if (running.get()) Log.i(TAG, "mirroring stream reset: ${e.message}")
            } catch (e: Exception) {
                Log.e(TAG, "mirroring stream failed", e)
            } finally {
                runCatching { socket.close() }
                client = null
                pendingParameterSets = null
                sink.onStreamEnded()
            }
        }
    }

    private fun readStream(socket: Socket) {
        val input = DataInputStream(socket.getInputStream().buffered(64 * 1024))
        val header = ByteArray(128)

        while (running.get()) {
            input.readFully(header)

            val payloadSize = readIntLE(header, 0)
            if (payloadSize < 0 || payloadSize > MAX_PAYLOAD) {
                throw IllegalStateException("implausible payload size $payloadSize")
            }
            val type = header[4].toInt() and 0xFF
            val timestampRaw = readLongLE(header, 8)

            val payload = ByteArray(payloadSize)
            if (payloadSize > 0) input.readFully(payload)

            when (type) {
                TYPE_VIDEO -> handleVideo(payload, timestampRaw)
                TYPE_PARAMETER_SETS -> handleParameterSets(header, payload, timestampRaw)
                TYPE_HEARTBEAT, TYPE_STREAM_REPORT -> Unit
                else -> Log.d(TAG, "ignoring mirror packet type 0x%02x".format(type))
            }
        }
    }

    /**
     * Encrypted VCL NAL units. AirPlay length-prefixes each NAL with a 4-byte
     * big-endian size; MediaCodec wants Annex-B start codes, so we overwrite the
     * prefixes in place.
     */
    private fun handleVideo(payload: ByteArray, timestampRaw: Long) {
        val prefix = pendingParameterSets?.takeIf { timestampRaw == pendingTimestamp }
        if (pendingParameterSets != null && prefix == null) {
            // Parameter sets always immediately precede the IDR they describe.
            Log.w(TAG, "discarding parameter sets with mismatched timestamp")
            pendingParameterSets = null
        }

        val prefixLength = prefix?.size ?: 0
        val out = ByteArray(prefixLength + payload.size)
        prefix?.copyInto(out, 0)
        pendingParameterSets = null

        cipher.decrypt(payload, payload.size, out, prefixLength)

        if (!AnnexB.rewriteInPlace(out, prefixLength, payload.size)) {
            // Almost always means the key is wrong; a decoder fed this would
            // simply produce garbage or wedge.
            Log.w(TAG, "dropping packet that did not decrypt to valid H.264")
            return
        }

        sink.onAccessUnit(out, out.size, ntpToMicros(timestampRaw))
    }

    /**
     * Unencrypted SPS + PPS, sent whenever the video format changes and always
     * immediately before the IDR frame that uses them.
     */
    private fun handleParameterSets(header: ByteArray, payload: ByteArray, timestampRaw: Long) {
        if (payload.size < 12) {
            Log.e(TAG, "parameter-set packet too short (${payload.size} bytes)")
            return
        }
        if (payload.size > 8 && String(payload, 4, 4, Charsets.US_ASCII) == "hvc1") {
            // Only reachable if the SupportsScreenMultiCodec feature bit is set,
            // which this receiver deliberately leaves off.
            Log.e(TAG, "client sent H.265 parameter sets; only H.264 is supported")
            return
        }

        val spsSize = readShortBE(payload, 6)
        if (spsSize <= 0 || 8 + spsSize + 3 > payload.size) {
            Log.e(TAG, "malformed SPS in parameter-set packet")
            return
        }
        val ppsSize = readShortBE(payload, spsSize + 9)
        if (ppsSize <= 0 || spsSize + 11 + ppsSize > payload.size) {
            Log.e(TAG, "malformed PPS in parameter-set packet")
            return
        }

        val sps = ByteArray(4 + spsSize)
        sps[3] = 1
        payload.copyInto(sps, 4, 8, 8 + spsSize)

        val pps = ByteArray(4 + ppsSize)
        pps[3] = 1
        payload.copyInto(pps, 4, spsSize + 11, spsSize + 11 + ppsSize)

        // Dimensions live in the 128-byte header as IEEE floats holding integers.
        val width = readFloatLE(header, 56).toInt()
        val height = readFloatLE(header, 60).toInt()
        if (width > 0 && height > 0) {
            sink.onFormat(width, height, sps, pps)
        } else {
            Log.w(TAG, "parameter-set packet had no usable dimensions")
        }

        pendingParameterSets = sps + pps
        pendingTimestamp = timestampRaw
    }

    fun stop() {
        running.set(false)
        runCatching { client?.close() }
        runCatching { serverSocket.close() }
        thread?.join(1000)
        thread = null
    }

    private companion object {
        const val TAG = "AirPlayMirror"
        const val ACCEPT_TIMEOUT_MS = 1000
        const val MAX_PAYLOAD = 8 * 1024 * 1024

        const val TYPE_VIDEO = 0x00
        const val TYPE_PARAMETER_SETS = 0x01
        const val TYPE_HEARTBEAT = 0x02
        const val TYPE_STREAM_REPORT = 0x05

        fun readIntLE(b: ByteArray, offset: Int): Int =
            (b[offset].toInt() and 0xFF) or
                ((b[offset + 1].toInt() and 0xFF) shl 8) or
                ((b[offset + 2].toInt() and 0xFF) shl 16) or
                ((b[offset + 3].toInt() and 0xFF) shl 24)

        fun readLongLE(b: ByteArray, offset: Int): Long {
            var value = 0L
            for (i in 7 downTo 0) {
                value = (value shl 8) or (b[offset + i].toLong() and 0xFF)
            }
            return value
        }

        fun readIntBE(b: ByteArray, offset: Int): Int =
            ((b[offset].toInt() and 0xFF) shl 24) or
                ((b[offset + 1].toInt() and 0xFF) shl 16) or
                ((b[offset + 2].toInt() and 0xFF) shl 8) or
                (b[offset + 3].toInt() and 0xFF)

        fun readShortBE(b: ByteArray, offset: Int): Int =
            ((b[offset].toInt() and 0xFF) shl 8) or (b[offset + 1].toInt() and 0xFF)

        fun readFloatLE(b: ByteArray, offset: Int): Float =
            java.lang.Float.intBitsToFloat(readIntLE(b, offset))

        /**
         * Mirror timestamps are NTP-style fixed point counting from the client's
         * boot rather than from 1900, so no epoch adjustment is applied.
         */
        fun ntpToMicros(raw: Long): Long {
            val seconds = raw ushr 32
            val fraction = raw and 0xFFFFFFFFL
            return seconds * 1_000_000L + ((fraction * 1_000_000L) ushr 32)
        }
    }
}
