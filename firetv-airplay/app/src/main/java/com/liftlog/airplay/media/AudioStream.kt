package com.liftlog.airplay.media

import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.util.Log
import com.liftlog.airplay.crypto.AesCbcPacketDecryptor
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Mirroring audio: AAC-ELD (or AAC-LC) in RTP over UDP, AES-128-CBC encrypted
 * with the session key and a fresh IV per packet.
 *
 * This is the "bonus" half of the receiver and is deliberately simple: packets
 * are decoded in arrival order with no jitter buffer and no retransmit
 * requests, and playback is not synchronised against the video clock.
 */
class AudioStream(
    sessionKey: ByteArray,
    sessionIv: ByteArray,
    /** Compression type from the SETUP stream description: 8 = AAC-ELD, 4 = AAC-LC. */
    private val compressionType: Int
) {
    private val dataSocket = DatagramSocket(0).apply { soTimeout = SOCKET_TIMEOUT_MS }
    private val controlSocket = DatagramSocket(0).apply { soTimeout = SOCKET_TIMEOUT_MS }
    private val decryptor = AesCbcPacketDecryptor(sessionKey, sessionIv)
    private val running = AtomicBoolean(true)

    private var dataThread: Thread? = null
    private var controlThread: Thread? = null
    private var codec: MediaCodec? = null
    private var track: AudioTrack? = null

    val dataPort: Int get() = dataSocket.localPort
    val controlPort: Int get() = controlSocket.localPort

    fun start(): Boolean {
        if (!startDecoder()) return false

        dataThread = Thread(::readAudio, "airplay-audio").apply {
            isDaemon = true
            start()
        }
        // The client expects the control port to exist even though we never ask
        // for retransmits; draining it keeps the socket buffer from filling.
        controlThread = Thread(::drainControl, "airplay-audio-control").apply {
            isDaemon = true
            start()
        }
        return true
    }

    private fun startDecoder(): Boolean {
        val csd = when (compressionType) {
            CT_AAC_ELD -> byteArrayOf(0xF8.toByte(), 0xE8.toByte(), 0x50, 0x00)
            CT_AAC_LC -> byteArrayOf(0x12, 0x10)
            else -> {
                Log.w(TAG, "unsupported audio compression type $compressionType; audio disabled")
                return false
            }
        }
        val profile = if (compressionType == CT_AAC_ELD) {
            MediaCodecInfo.CodecProfileLevel.AACObjectELD
        } else {
            MediaCodecInfo.CodecProfileLevel.AACObjectLC
        }

        return try {
            val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, CHANNELS).apply {
                setInteger(MediaFormat.KEY_AAC_PROFILE, profile)
                setInteger(MediaFormat.KEY_IS_ADTS, 0)
                setByteBuffer("csd-0", ByteBuffer.wrap(csd))
            }
            codec = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).apply {
                configure(format, null, null, 0)
                start()
            }

            val bufferSize = maxOf(
                AudioTrack.getMinBufferSize(
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_STEREO,
                    AudioFormat.ENCODING_PCM_16BIT
                ),
                MIN_TRACK_BUFFER
            )
            @Suppress("DEPRECATION")
            track = AudioTrack(
                AudioManager.STREAM_MUSIC,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_STEREO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize,
                AudioTrack.MODE_STREAM
            ).apply { play() }
            true
        } catch (e: Exception) {
            Log.e(TAG, "failed to start audio decoder", e)
            releaseDecoder()
            false
        }
    }

    private fun readAudio() {
        val buffer = ByteArray(MAX_PACKET)
        val packet = DatagramPacket(buffer, buffer.size)
        val info = MediaCodec.BufferInfo()

        while (running.get()) {
            try {
                dataSocket.receive(packet)
            } catch (e: java.net.SocketTimeoutException) {
                continue
            } catch (e: Exception) {
                if (running.get()) Log.e(TAG, "audio receive failed", e)
                return
            }

            // 12-byte RTP header; packets with no payload are keepalives.
            val payloadSize = packet.length - RTP_HEADER_SIZE
            if (payloadSize <= 0) continue

            val decoded = ByteArray(payloadSize)
            val wholeBlocks = (payloadSize / 16) * 16
            if (wholeBlocks > 0) {
                decryptor.decrypt(buffer, RTP_HEADER_SIZE, wholeBlocks, decoded, 0)
            }
            // The trailing partial block is sent in the clear.
            System.arraycopy(buffer, RTP_HEADER_SIZE + wholeBlocks, decoded, wholeBlocks, payloadSize - wholeBlocks)

            feedDecoder(decoded, info)
        }
    }

    private fun feedDecoder(frame: ByteArray, info: MediaCodec.BufferInfo) {
        val decoder = codec ?: return
        val output = track ?: return
        try {
            val index = decoder.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
            if (index >= 0) {
                decoder.getInputBuffer(index)?.let {
                    it.clear()
                    it.put(frame)
                    decoder.queueInputBuffer(index, 0, frame.size, 0, 0)
                }
            }

            while (true) {
                val outIndex = decoder.dequeueOutputBuffer(info, 0)
                if (outIndex < 0) break
                val outBuffer = decoder.getOutputBuffer(outIndex)
                if (outBuffer != null && info.size > 0) {
                    val pcm = ByteArray(info.size)
                    outBuffer.position(info.offset)
                    outBuffer.get(pcm)
                    output.write(pcm, 0, pcm.size)
                }
                decoder.releaseOutputBuffer(outIndex, false)
            }
        } catch (e: IllegalStateException) {
            Log.e(TAG, "audio decode failed", e)
            running.set(false)
        }
    }

    private fun drainControl() {
        val buffer = ByteArray(MAX_PACKET)
        val packet = DatagramPacket(buffer, buffer.size)
        while (running.get()) {
            try {
                controlSocket.receive(packet)
            } catch (e: java.net.SocketTimeoutException) {
                continue
            } catch (e: Exception) {
                return
            }
        }
    }

    fun stop() {
        running.set(false)
        runCatching { dataSocket.close() }
        runCatching { controlSocket.close() }
        dataThread?.join(500)
        controlThread?.join(500)
        releaseDecoder()
    }

    private fun releaseDecoder() {
        codec?.let {
            runCatching { it.stop() }
            runCatching { it.release() }
        }
        codec = null
        track?.let {
            runCatching { it.stop() }
            runCatching { it.release() }
        }
        track = null
    }

    private companion object {
        const val TAG = "AirPlayAudio"
        const val SAMPLE_RATE = 44100
        const val CHANNELS = 2
        const val RTP_HEADER_SIZE = 12
        const val MAX_PACKET = 2048
        const val SOCKET_TIMEOUT_MS = 1000
        const val DEQUEUE_TIMEOUT_US = 10_000L
        const val MIN_TRACK_BUFFER = 16 * 1024
        const val CT_AAC_LC = 4
        const val CT_AAC_ELD = 8
    }
}
