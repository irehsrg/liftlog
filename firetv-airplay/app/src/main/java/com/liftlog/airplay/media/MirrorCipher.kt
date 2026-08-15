package com.liftlog.airplay.media

import com.liftlog.airplay.crypto.AesCtr
import com.liftlog.airplay.crypto.sha512

/**
 * Decrypts the mirroring video stream.
 *
 * The key and IV are derived from the session AES key plus the
 * `streamConnectionID` the client sends in RTSP SETUP. One CTR keystream runs
 * for the whole stream, but the client only ever advances it in whole 16-byte
 * blocks: when a packet does not end on a block boundary, the remainder of that
 * block's keystream is carried over and applied to the start of the next packet.
 * [carryOver] holds it.
 */
class MirrorCipher(sessionKey: ByteArray, streamConnectionId: Long) {

    private val cipher: AesCtr

    /** Leftover keystream bytes from the previous packet's partial block. */
    private val carryOver = ByteArray(16)
    private var carryOverCount = 0

    init {
        // streamConnectionID is formatted as an unsigned decimal string.
        val id = java.lang.Long.toUnsignedString(streamConnectionId)
        val key = sha512("AirPlayStreamKey$id".toByteArray(Charsets.UTF_8), sessionKey).copyOf(16)
        val iv = sha512("AirPlayStreamIV$id".toByteArray(Charsets.UTF_8), sessionKey).copyOf(16)
        cipher = AesCtr(key, iv)
    }

    /**
     * Decrypts [length] bytes of [input] into [output] at [outOffset].
     * Both buffers may be the same array.
     */
    fun decrypt(input: ByteArray, length: Int, output: ByteArray, outOffset: Int) {
        // Finish the block the previous packet left hanging.
        val leading = minOf(carryOverCount, length)
        for (i in 0 until leading) {
            output[outOffset + i] = (input[i].toInt() xor carryOver[16 - carryOverCount + i].toInt()).toByte()
        }
        if (leading < carryOverCount) {
            // Packet was shorter than the carry-over; keep what is left of it.
            carryOverCount -= leading
            return
        }
        carryOverCount = 0

        val remaining = length - leading
        val wholeBlocks = (remaining / 16) * 16
        if (wholeBlocks > 0) {
            cipher.process(input, leading, wholeBlocks, output, outOffset + leading)
        }

        val tail = remaining % 16
        if (tail > 0) {
            val tailStart = leading + wholeBlocks
            // Decrypt a full padded block: the bytes past the real data come out
            // as raw keystream, which is exactly what the next packet needs.
            java.util.Arrays.fill(carryOver, 0)
            input.copyInto(carryOver, 0, tailStart, tailStart + tail)
            cipher.process(carryOver, 0, 16, carryOver, 0)
            carryOver.copyInto(output, outOffset + tailStart, 0, tail)
            carryOverCount = 16 - tail
        }
    }
}
