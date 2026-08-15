package com.liftlog.airplay

import com.liftlog.airplay.crypto.sha512
import com.liftlog.airplay.media.MirrorCipher
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Random
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * The mirroring stream is one continuous AES-CTR keystream over the
 * concatenation of every packet payload, even though packets rarely land on a
 * 16-byte boundary. These tests pin that down against a plain CTR reference.
 */
class MirrorCipherTest {

    private val sessionKey = ByteArray(16) { it.toByte() }
    private val streamConnectionId = -7028356748706488128L // exercises the unsigned path

    private fun referenceKeystreamDecrypt(cipherText: ByteArray): ByteArray {
        val id = java.lang.Long.toUnsignedString(streamConnectionId)
        val key = sha512("AirPlayStreamKey$id".toByteArray(), sessionKey).copyOf(16)
        val iv = sha512("AirPlayStreamIV$id".toByteArray(), sessionKey).copyOf(16)
        val cipher = Cipher.getInstance("AES/CTR/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
        return cipher.doFinal(cipherText)
    }

    @Test
    fun `block aligned packets match plain CTR`() {
        val payloads = listOf(ByteArray(64), ByteArray(32), ByteArray(16))
        val random = Random(1)
        payloads.forEach { random.nextBytes(it) }

        assertMatchesReference(payloads)
    }

    @Test
    fun `unaligned packets carry the keystream across boundaries`() {
        // Sizes chosen so every packet leaves a different partial block behind.
        val sizes = listOf(20, 1, 15, 17, 33, 7, 100, 3)
        val random = Random(2)
        val payloads = sizes.map { ByteArray(it).also(random::nextBytes) }

        assertMatchesReference(payloads)
    }

    @Test
    fun `packet shorter than the carried over keystream is handled`() {
        // 20 leaves 12 bytes of keystream; the next two packets consume it in
        // pieces, which the reference C implementation never had to do.
        val sizes = listOf(20, 5, 4, 40)
        val random = Random(3)
        val payloads = sizes.map { ByteArray(it).also(random::nextBytes) }

        assertMatchesReference(payloads)
    }

    @Test
    fun `empty packets do not disturb the keystream`() {
        val random = Random(4)
        val payloads = listOf(
            ByteArray(21).also(random::nextBytes),
            ByteArray(0),
            ByteArray(30).also(random::nextBytes)
        )

        assertMatchesReference(payloads)
    }

    private fun assertMatchesReference(payloads: List<ByteArray>) {
        val concatenated = payloads.reduce { a, b -> a + b }
        val expected = referenceKeystreamDecrypt(concatenated)

        val cipher = MirrorCipher(sessionKey, streamConnectionId)
        val actual = ByteArray(concatenated.size)
        var offset = 0
        for (payload in payloads) {
            cipher.decrypt(payload, payload.size, actual, offset)
            offset += payload.size
        }

        assertEquals(expected.size, actual.size)
        assertArrayEquals(expected, actual)
    }
}
