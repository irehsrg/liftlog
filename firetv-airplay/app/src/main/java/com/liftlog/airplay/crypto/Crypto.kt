package com.liftlog.airplay.crypto

import org.bouncycastle.crypto.digests.SHA512Digest
import org.bouncycastle.crypto.engines.AESEngine
import org.bouncycastle.crypto.modes.CBCBlockCipher
import org.bouncycastle.crypto.modes.SICBlockCipher
import org.bouncycastle.crypto.params.KeyParameter
import org.bouncycastle.crypto.params.ParametersWithIV

fun sha512(vararg parts: ByteArray): ByteArray {
    val digest = SHA512Digest()
    for (part in parts) digest.update(part, 0, part.size)
    val out = ByteArray(digest.digestSize)
    digest.doFinal(out, 0)
    return out
}

/**
 * AES-128-CTR as a continuous keystream.
 *
 * AirPlay relies on the counter carrying across calls, so a single instance
 * must be reused for the whole stream rather than re-initialised per packet.
 */
class AesCtr(key: ByteArray, iv: ByteArray) {
    private val cipher = SICBlockCipher.newInstance(AESEngine.newInstance()).apply {
        init(true, ParametersWithIV(KeyParameter(key), iv))
    }

    fun process(input: ByteArray, offset: Int, length: Int, output: ByteArray, outOffset: Int) {
        cipher.processBytes(input, offset, length, output, outOffset)
    }

    fun process(input: ByteArray): ByteArray {
        val out = ByteArray(input.size)
        process(input, 0, input.size, out, 0)
        return out
    }

    /** Advances the keystream by [length] bytes, discarding the output. */
    fun skip(length: Int) {
        val waste = ByteArray(length)
        cipher.processBytes(waste, 0, length, waste, 0)
    }
}

/** AES-128-CBC decryption where the IV is reset before every packet. */
class AesCbcPacketDecryptor(private val key: ByteArray, private val iv: ByteArray) {
    private val cipher = CBCBlockCipher.newInstance(AESEngine.newInstance())

    /** Decrypts [length] bytes (must be a multiple of 16) starting at [offset]. */
    fun decrypt(input: ByteArray, offset: Int, length: Int, output: ByteArray, outOffset: Int) {
        cipher.init(false, ParametersWithIV(KeyParameter(key), iv))
        var pos = 0
        while (pos < length) {
            cipher.processBlock(input, offset + pos, output, outOffset + pos)
            pos += 16
        }
    }
}
