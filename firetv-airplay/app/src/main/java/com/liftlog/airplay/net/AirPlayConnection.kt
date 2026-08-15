package com.liftlog.airplay.net

import android.util.Log
import com.dd.plist.BinaryPropertyListParser
import com.dd.plist.BinaryPropertyListWriter
import com.dd.plist.NSArray
import com.dd.plist.NSData
import com.dd.plist.NSDictionary
import com.dd.plist.NSNumber
import com.dd.plist.NSObject
import com.dd.plist.NSString
import com.liftlog.airplay.ReceiverConfig
import com.liftlog.airplay.crypto.DeviceIdentity
import com.liftlog.airplay.crypto.FairPlaySession
import com.liftlog.airplay.crypto.PairingSession
import com.liftlog.airplay.crypto.sha512
import com.liftlog.airplay.media.AudioStream
import com.liftlog.airplay.media.MirrorCipher
import com.liftlog.airplay.media.MirrorStream
import com.liftlog.airplay.media.VideoSink
import java.net.DatagramSocket
import java.net.Socket

// dd-plist only accepts NSObject values, so wrap the primitives we set.
private operator fun NSDictionary.set(key: String, value: String) = put(key, NSString(value))
private operator fun NSDictionary.set(key: String, value: Boolean) = put(key, NSNumber(value))
private operator fun NSDictionary.set(key: String, value: Double) = put(key, NSNumber(value))

/** Told when a client picks up and puts down the receiver. */
interface SessionListener {
    fun onSessionStarted(clientName: String?)
    fun onSessionEnded()
}

/**
 * One client's control connection.
 *
 * Handles the whole RTSP/HTTP conversation: pairing, the FairPlay key exchange,
 * stream setup, and teardown. Each connection owns the streams it creates.
 */
class AirPlayConnection(
    private val socket: Socket,
    private val identity: DeviceIdentity,
    private val deviceName: String,
    private val sink: VideoSink,
    private val listener: SessionListener
) : Runnable {

    private val pairing = PairingSession(identity)
    private val fairplay = FairPlaySession()

    private var sessionKey: ByteArray? = null
    private var sessionIv: ByteArray? = null

    private var timingSocket: DatagramSocket? = null
    private var mirrorStream: MirrorStream? = null
    private var audioStream: AudioStream? = null

    private var sessionActive = false

    override fun run() {
        try {
            socket.tcpNoDelay = true
            val input = socket.getInputStream().buffered()
            val output = socket.getOutputStream()

            while (!socket.isClosed) {
                val request = RtspRequest.read(input) ?: break
                Log.d(TAG, "<- $request")

                val response = RtspResponse(request.protocol)
                response.header("Server", "AirTunes/${ReceiverConfig.SOURCE_VERSION}")
                val cseq = request.header("CSeq")
                if (cseq != null) {
                    response.header("CSeq", cseq)
                    if (request.method != "RECORD") {
                        response.header("Audio-Jack-Status", "connected; type=digital")
                    }
                }

                try {
                    dispatch(request, response)
                } catch (e: Exception) {
                    Log.e(TAG, "handler failed for ${request.method} ${request.url}", e)
                    response.setStatus(500, "Internal Server Error")
                    response.body = ByteArray(0)
                }

                response.write(output)
                if (response.disconnect) break
            }
        } catch (e: Exception) {
            Log.i(TAG, "control connection ended: ${e.message}")
        } finally {
            close()
        }
    }

    private fun dispatch(request: RtspRequest, response: RtspResponse) {
        val path = request.path
        when {
            request.method == "GET" && path.contains("/info") -> handleInfo(request, response)
            request.method == "POST" && path == "/pair-setup" -> handlePairSetup(request, response)
            request.method == "POST" && path == "/pair-verify" -> handlePairVerify(request, response)
            request.method == "POST" && path == "/fp-setup" -> handleFpSetup(request, response)
            request.method == "POST" && path == "/feedback" -> Unit
            request.method == "POST" && path == "/audioMode" -> Unit
            request.method == "OPTIONS" ->
                response.header("Public", "SETUP, RECORD, FLUSH, TEARDOWN, OPTIONS, GET_PARAMETER, SET_PARAMETER")
            request.method == "SETUP" -> handleSetup(request, response)
            request.method == "RECORD" -> response.header("Audio-Latency", "11025")
            request.method == "GET_PARAMETER" -> handleGetParameter(response)
            request.method == "SET_PARAMETER" -> Unit
            request.method == "FLUSH" -> Unit
            request.method == "TEARDOWN" -> handleTeardown(request, response)
            else -> {
                Log.w(TAG, "unhandled request ${request.method} ${request.url}")
                response.setStatus(501, "Not Implemented")
            }
        }
    }

    // ---- Discovery -------------------------------------------------------

    private fun handleInfo(request: RtspRequest, response: RtspResponse) {
        val info = NSDictionary()

        // The client's opening GET /info asks for a TXT record by name, either
        // as a plist `qualifier` or (over Bluetooth LE discovery) in the URL.
        // Those requests want only the blob, nothing else.
        val qualifier = requestedQualifier(request)
        if (qualifier != null) {
            when (qualifier) {
                "txtAirPlay" -> info["txtAirPlay"] =
                    NSData(TxtRecords.encode(TxtRecords.airplay(identity, deviceName)))
                "txtRAOP" -> info["txtRAOP"] = NSData(TxtRecords.encode(TxtRecords.raop(identity)))
            }
            if (request.header("Content-Type") != null) {
                response.binaryPlist(BinaryPropertyListWriter.writeToArray(info))
                return
            }
        }

        info["deviceID"] = identity.deviceId
        info["macAddress"] = identity.deviceId
        info["pk"] = NSData(identity.publicKey)
        info["features"] = NSNumber(ReceiverConfig.features)
        info["name"] = deviceName
        info["pi"] = ReceiverConfig.PI
        info["vv"] = NSNumber(2L)
        info["statusFlags"] = NSNumber(68L)
        info["keepAliveLowPower"] = NSNumber(1L)
        info["keepAliveSendStatsAsBody"] = true
        info["sourceVersion"] = ReceiverConfig.SOURCE_VERSION
        info["model"] = ReceiverConfig.MODEL

        // A probe with no CSeq is part of Bluetooth LE service discovery and
        // stops at the identity fields.
        if (request.header("CSeq") == null) {
            response.binaryPlist(BinaryPropertyListWriter.writeToArray(info))
            return
        }

        info["initialVolume"] = 0.0

        info["audioLatencies"] = NSArray(
            audioLatency(100L),
            audioLatency(101L)
        )
        info["audioFormats"] = NSArray(
            audioFormat(100L),
            audioFormat(101L)
        )

        val display = NSDictionary()
        display["uuid"] = ReceiverConfig.DISPLAY_UUID
        display["width"] = NSNumber(ReceiverConfig.WIDTH.toLong())
        display["height"] = NSNumber(ReceiverConfig.HEIGHT.toLong())
        display["widthPixels"] = NSNumber(ReceiverConfig.WIDTH.toLong())
        display["heightPixels"] = NSNumber(ReceiverConfig.HEIGHT.toLong())
        display["widthPhysical"] = NSNumber(0L)
        display["heightPhysical"] = NSNumber(0L)
        display["rotation"] = false
        display["refreshRate"] = 1.0 / ReceiverConfig.REFRESH_RATE
        display["maxFPS"] = NSNumber(ReceiverConfig.MAX_FPS.toLong())
        display["overscanned"] = false
        display["features"] = NSNumber(14L)
        info["displays"] = NSArray(display)

        response.binaryPlist(BinaryPropertyListWriter.writeToArray(info))
    }

    /** Which TXT record the client asked for, if any. */
    private fun requestedQualifier(request: RtspRequest): String? {
        val contentType = request.header("Content-Type")
        if (contentType != null && contentType.contains("binary-plist") && request.body.isNotEmpty()) {
            val body = runCatching {
                BinaryPropertyListParser.parse(request.body) as? NSDictionary
            }.getOrNull()
            val qualifiers = body?.get("qualifier") as? NSArray
            val first = qualifiers?.array?.firstOrNull()?.toJavaObject() as? String
            if (first != null) return first
        }
        // Bluetooth LE discovery puts it in the URL instead.
        return when {
            request.url.contains("txtAirPlay") -> "txtAirPlay"
            request.url.contains("txtRAOP") -> "txtRAOP"
            else -> null
        }
    }

    private fun audioLatency(type: Long): NSDictionary = NSDictionary().apply {
        this["type"] = NSNumber(type)
        this["audioType"] = "default"
        this["inputLatencyMicros"] = NSNumber(0L)
        this["outputLatencyMicros"] = false
    }

    private fun audioFormat(type: Long): NSDictionary = NSDictionary().apply {
        this["type"] = NSNumber(type)
        this["audioInputFormats"] = NSNumber(0x3fffffcL)
        this["audioOutputFormats"] = NSNumber(0x3fffffcL)
    }

    // ---- Pairing and FairPlay -------------------------------------------

    private fun handlePairSetup(request: RtspRequest, response: RtspResponse) {
        if (request.body.size != 32) {
            Log.w(TAG, "unexpected pair-setup body of ${request.body.size} bytes")
            response.setStatus(400, "Bad Request")
            return
        }
        response.octetStream(pairing.pairSetup())
    }

    private fun handlePairVerify(request: RtspRequest, response: RtspResponse) {
        val body = request.body
        if (body.isEmpty()) {
            response.setStatus(400, "Bad Request")
            return
        }
        when (body[0].toInt()) {
            1 -> {
                val reply = pairing.pairVerifyStart(body)
                if (reply == null) {
                    response.setStatus(400, "Bad Request")
                } else {
                    response.octetStream(reply)
                }
            }
            0 -> {
                if (pairing.pairVerifyFinish(body)) {
                    response.header("Content-Type", "application/octet-stream")
                } else {
                    Log.e(TAG, "pair-verify signature did not check out")
                    response.setStatus(400, "Bad Request")
                    response.disconnect = true
                }
            }
            else -> response.setStatus(400, "Bad Request")
        }
    }

    private fun handleFpSetup(request: RtspRequest, response: RtspResponse) {
        val reply = when (request.body.size) {
            16 -> fairplay.setup(request.body)
            164 -> fairplay.handshake(request.body)
            else -> {
                Log.e(TAG, "unexpected fp-setup body of ${request.body.size} bytes")
                null
            }
        }
        if (reply == null) {
            response.setStatus(400, "Bad Request")
        } else {
            response.octetStream(reply)
        }
    }

    // ---- Stream setup ----------------------------------------------------

    private fun handleSetup(request: RtspRequest, response: RtspResponse) {
        val body = BinaryPropertyListParser.parse(request.body) as? NSDictionary
        if (body == null) {
            response.setStatus(400, "Bad Request")
            return
        }
        val result = NSDictionary()

        val ekey = (body["ekey"] as? NSData)?.bytes()
        val eiv = (body["eiv"] as? NSData)?.bytes()
        if (ekey != null && eiv != null) {
            if (!establishSession(body, ekey, eiv, result)) {
                response.setStatus(400, "Bad Request")
                response.disconnect = true
                return
            }
        }

        val streams = body["streams"] as? NSArray
        if (streams != null) {
            val descriptions = ArrayList<NSObject>()
            for (element in streams.array) {
                val stream = element as? NSDictionary ?: continue
                val type = (stream["type"] as? NSNumber)?.longValue() ?: continue
                when (type) {
                    STREAM_MIRROR -> startMirroring(stream)?.let { descriptions.add(it) }
                    STREAM_AUDIO -> startAudio(stream)?.let { descriptions.add(it) }
                    else -> Log.w(TAG, "ignoring unsupported stream type $type")
                }
            }
            if (descriptions.isEmpty()) {
                response.setStatus(400, "Bad Request")
                response.disconnect = true
                return
            }
            result["streams"] = NSArray(*descriptions.toTypedArray())
        }

        response.binaryPlist(BinaryPropertyListWriter.writeToArray(result))
    }

    /** First SETUP: unwrap the session key and report our timing port. */
    private fun establishSession(
        body: NSDictionary,
        ekey: ByteArray,
        eiv: ByteArray,
        result: NSDictionary
    ): Boolean {
        if (ekey.size != 72 || eiv.size < 16) {
            Log.e(TAG, "SETUP had ekey/eiv of the wrong size (${ekey.size}/${eiv.size})")
            return false
        }

        val unwrapped = fairplay.decrypt(ekey)
        if (unwrapped == null) {
            Log.e(TAG, "FairPlay key unwrap failed; did fp-setup complete?")
            return false
        }

        // When legacy pairing ran, the unwrapped key is additionally hashed with
        // the pairing shared secret. Without this the video will not decrypt.
        val secret = pairing.sharedSecret
        sessionKey = if (secret != null) {
            sha512(unwrapped, secret).copyOf(16)
        } else {
            unwrapped
        }
        sessionIv = eiv.copyOf(16)

        // We never poll the client's clock, but it still expects a port here.
        val timing = DatagramSocket(0)
        timingSocket = timing
        result["timingPort"] = NSNumber(timing.localPort.toLong())
        result["eventPort"] = NSNumber(0L)

        val clientName = (body["name"] as? NSObject)?.toJavaObject() as? String
        if (!sessionActive) {
            sessionActive = true
            listener.onSessionStarted(clientName)
        }
        Log.i(TAG, "session established with ${clientName ?: "client"}")
        return true
    }

    private fun startMirroring(stream: NSDictionary): NSDictionary? {
        val key = sessionKey ?: run {
            Log.e(TAG, "mirroring requested before the session key was set up")
            return null
        }
        val streamConnectionId = (stream["streamConnectionID"] as? NSNumber)?.longValue() ?: run {
            Log.e(TAG, "mirroring stream had no streamConnectionID")
            return null
        }

        mirrorStream?.stop()
        val mirror = MirrorStream(MirrorCipher(key, streamConnectionId), sink)
        mirror.start()
        mirrorStream = mirror
        Log.i(TAG, "mirroring stream listening on port ${mirror.port}")

        return NSDictionary().apply {
            this["type"] = NSNumber(STREAM_MIRROR)
            this["dataPort"] = NSNumber(mirror.port.toLong())
        }
    }

    private fun startAudio(stream: NSDictionary): NSDictionary? {
        val key = sessionKey ?: return null
        val iv = sessionIv ?: return null
        val compressionType = (stream["ct"] as? NSNumber)?.longValue()?.toInt() ?: 0

        audioStream?.stop()
        val audio = AudioStream(key, iv, compressionType)
        if (!audio.start()) {
            audioStream = null
            // Video is the point; keep the session alive without sound.
            Log.w(TAG, "continuing without audio")
            return NSDictionary().apply {
                this["type"] = NSNumber(STREAM_AUDIO)
                this["dataPort"] = NSNumber(audio.dataPort.toLong())
                this["controlPort"] = NSNumber(audio.controlPort.toLong())
            }
        }
        audioStream = audio
        Log.i(TAG, "audio stream listening on port ${audio.dataPort} (ct=$compressionType)")

        return NSDictionary().apply {
            this["type"] = NSNumber(STREAM_AUDIO)
            this["dataPort"] = NSNumber(audio.dataPort.toLong())
            this["controlPort"] = NSNumber(audio.controlPort.toLong())
        }
    }

    private fun handleGetParameter(response: RtspResponse) {
        response.header("Content-Type", "text/parameters")
        response.body = "volume: 0.000000\r\n".toByteArray(Charsets.UTF_8)
    }

    private fun handleTeardown(request: RtspRequest, response: RtspResponse) {
        val body = runCatching {
            if (request.body.isEmpty()) null
            else BinaryPropertyListParser.parse(request.body) as? NSDictionary
        }.getOrNull()

        val streams = body?.get("streams") as? NSArray
        if (streams == null) {
            // No stream list means the whole session is going away.
            stopStreams()
            endSession()
            response.disconnect = true
            return
        }

        for (element in streams.array) {
            val stream = element as? NSDictionary ?: continue
            when ((stream["type"] as? NSNumber)?.longValue()) {
                STREAM_MIRROR -> {
                    mirrorStream?.stop()
                    mirrorStream = null
                    sink.onStreamEnded()
                }
                STREAM_AUDIO -> {
                    audioStream?.stop()
                    audioStream = null
                }
            }
        }
    }

    private fun stopStreams() {
        mirrorStream?.stop()
        mirrorStream = null
        audioStream?.stop()
        audioStream = null
        timingSocket?.close()
        timingSocket = null
    }

    private fun endSession() {
        if (sessionActive) {
            sessionActive = false
            listener.onSessionEnded()
        }
    }

    fun close() {
        stopStreams()
        endSession()
        runCatching { socket.close() }
    }

    private companion object {
        const val TAG = "AirPlayConn"
        const val STREAM_MIRROR = 110L
        const val STREAM_AUDIO = 96L
    }
}
