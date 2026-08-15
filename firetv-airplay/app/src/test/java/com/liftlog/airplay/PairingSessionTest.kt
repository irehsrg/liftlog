package com.liftlog.airplay

import com.liftlog.airplay.crypto.AesCtr
import com.liftlog.airplay.crypto.PairingSession
import com.liftlog.airplay.crypto.sha512
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.SecureRandom

/**
 * Drives [PairingSession] with a stand-in for the iOS side of /pair-verify.
 *
 * If this passes, both halves agree on the X25519 shared secret — which is what
 * the mirroring AES key is derived from, so it is the difference between a
 * picture and noise.
 */
class PairingSessionTest {

    private val identity = TestIdentity.create()

    @Test
    fun `pair-verify completes and both sides agree on the secret`() {
        val session = PairingSession(identity.deviceIdentity)

        val clientEcdh = X25519PrivateKeyParameters(SecureRandom())
        val clientEcdhPublic = clientEcdh.generatePublicKey().encoded
        val clientEd = Ed25519PrivateKeyParameters(SecureRandom())
        val clientEdPublic = clientEd.generatePublicKey().encoded

        // Stage 1: client sends its ephemeral and identity public keys.
        val request = byteArrayOf(1, 0, 0, 0) + clientEcdhPublic + clientEdPublic
        val reply = session.pairVerifyStart(request)
        assertNotNull("stage 1 should produce a reply", reply)
        reply!!

        val serverEcdhPublic = reply.copyOfRange(0, 32)
        val encryptedSignature = reply.copyOfRange(32, 96)

        // The client derives the same secret from its own private key.
        val clientSecret = ByteArray(32)
        clientEcdh.generateSecret(X25519PublicKeyParameters(serverEcdhPublic, 0), clientSecret, 0)
        assertArrayEquals(clientSecret, session.sharedSecret)

        // ...and can therefore decrypt and check the receiver's signature.
        val aesKey = sha512("Pair-Verify-AES-Key".toByteArray(), clientSecret).copyOf(16)
        val aesIv = sha512("Pair-Verify-AES-IV".toByteArray(), clientSecret).copyOf(16)
        val signature = AesCtr(aesKey, aesIv).process(encryptedSignature)

        val verifier = Ed25519Signer()
        verifier.init(false, Ed25519PublicKeyParameters(identity.deviceIdentity.publicKey, 0))
        val signed = serverEcdhPublic + clientEcdhPublic
        verifier.update(signed, 0, signed.size)
        assertTrue("receiver signature must verify", verifier.verifySignature(signature))

        // Stage 2: client signs the keys in the opposite order, encrypted with
        // the second 64 bytes of the same keystream.
        val clientSigner = Ed25519Signer()
        clientSigner.init(true, clientEd)
        val clientMessage = clientEcdhPublic + serverEcdhPublic
        clientSigner.update(clientMessage, 0, clientMessage.size)
        val clientSignature = clientSigner.generateSignature()

        val stream = AesCtr(aesKey, aesIv)
        stream.skip(64)
        val encryptedClientSignature = stream.process(clientSignature)

        assertTrue(session.pairVerifyFinish(byteArrayOf(0, 0, 0, 0) + encryptedClientSignature))
        assertTrue(session.verified)
    }

    @Test
    fun `a signature from the wrong key is rejected`() {
        val session = PairingSession(identity.deviceIdentity)

        val clientEcdh = X25519PrivateKeyParameters(SecureRandom())
        val clientEd = Ed25519PrivateKeyParameters(SecureRandom())
        val request = byteArrayOf(1, 0, 0, 0) +
            clientEcdh.generatePublicKey().encoded +
            clientEd.generatePublicKey().encoded

        val reply = session.pairVerifyStart(request)!!
        val serverEcdhPublic = reply.copyOfRange(0, 32)

        val secret = ByteArray(32)
        clientEcdh.generateSecret(X25519PublicKeyParameters(serverEcdhPublic, 0), secret, 0)
        val aesKey = sha512("Pair-Verify-AES-Key".toByteArray(), secret).copyOf(16)
        val aesIv = sha512("Pair-Verify-AES-IV".toByteArray(), secret).copyOf(16)

        // Sign with a key the receiver was never told about.
        val impostor = Ed25519PrivateKeyParameters(SecureRandom())
        val signer = Ed25519Signer()
        signer.init(true, impostor)
        val message = clientEcdh.generatePublicKey().encoded + serverEcdhPublic
        signer.update(message, 0, message.size)

        val stream = AesCtr(aesKey, aesIv)
        stream.skip(64)
        val forged = stream.process(signer.generateSignature())

        assertFalse(session.pairVerifyFinish(byteArrayOf(0, 0, 0, 0) + forged))
        assertFalse(session.verified)
    }

    @Test
    fun `malformed stage 1 payloads are refused`() {
        val session = PairingSession(identity.deviceIdentity)
        assertTrue(session.pairVerifyStart(ByteArray(10)) == null)
        assertFalse(session.pairVerifyFinish(ByteArray(10)))
    }
}
