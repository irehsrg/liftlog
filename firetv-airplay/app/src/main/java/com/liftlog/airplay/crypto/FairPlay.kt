package com.liftlog.airplay.crypto

/**
 * FairPlay SAP v2.5, the handshake an AirPlay client runs before it will hand
 * over the AES key that protects the mirroring stream.
 *
 * The exchange is:
 *   1. POST /fp-setup with 16 bytes  -> we reply with a canned 142-byte message
 *   2. POST /fp-setup with 164 bytes -> we reply with a 32-byte header + echo,
 *      and remember the 164-byte message
 *   3. RTSP SETUP carries a 72-byte wrapped key, which [decrypt] unwraps using
 *      the message from step 2.
 */
object FairPlay {
    init {
        System.loadLibrary("airplayfp")
    }

    @JvmStatic
    private external fun nativeSetup(request: ByteArray): ByteArray?

    @JvmStatic
    private external fun nativeDecrypt(keyMessage: ByteArray, cipherText: ByteArray): ByteArray?

    internal fun setupReply(request: ByteArray): ByteArray? = nativeSetup(request)

    internal fun unwrapKey(keyMessage: ByteArray, cipherText: ByteArray): ByteArray? =
        nativeDecrypt(keyMessage, cipherText)
}

/** Per-connection FairPlay state. */
class FairPlaySession {

    private val header = byteArrayOf(
        0x46, 0x50, 0x4c, 0x59, 0x03, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x14
    )

    /** The 164-byte message from handshake(); needed to unwrap the stream key. */
    private var keyMessage: ByteArray? = null

    /** First fp-setup exchange: 16 bytes in, 142 bytes out. */
    fun setup(request: ByteArray): ByteArray? = FairPlay.setupReply(request)

    /** Second fp-setup exchange: 164 bytes in, 32 bytes out. */
    fun handshake(request: ByteArray): ByteArray? {
        if (request.size != 164 || request[4] != 0x03.toByte()) return null
        keyMessage = request.copyOf()
        val reply = ByteArray(32)
        header.copyInto(reply, 0)
        request.copyInto(reply, 12, 144, 164)
        return reply
    }

    /** Unwraps the 72-byte `ekey` from RTSP SETUP into the 16-byte AES key. */
    fun decrypt(wrappedKey: ByteArray): ByteArray? {
        val message = keyMessage ?: return null
        if (wrappedKey.size != 72) return null
        return FairPlay.unwrapKey(message, wrappedKey)
    }
}
