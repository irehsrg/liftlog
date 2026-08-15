package com.liftlog.airplay.crypto

import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.security.SecureRandom

/**
 * AirPlay "legacy" pairing: /pair-setup followed by a two-stage /pair-verify.
 *
 * The point of the exchange is the X25519 shared secret. It is not used to
 * encrypt anything on the wire here, but it is mixed into the mirroring AES key
 * (see [com.liftlog.airplay.net.AirPlayConnection]), so getting it right is what
 * makes the video stream decryptable at all.
 */
class PairingSession(private val identity: DeviceIdentity) {

    private var ourEphemeral: X25519PrivateKeyParameters? = null
    private var ourPublic: ByteArray? = null
    private var theirPublic: ByteArray? = null
    private var theirEd: ByteArray? = null

    /** Non-null once /pair-verify stage 1 has run. */
    var sharedSecret: ByteArray? = null
        private set

    var verified: Boolean = false
        private set

    /** The client's Ed25519 public key, once it has identified itself. */
    var clientPublicKey: ByteArray? = null
        private set

    /** POST /pair-setup: the client just wants our public key. */
    fun pairSetup(): ByteArray = identity.publicKey

    /**
     * POST /pair-verify stage 1. [data] is `01 00 00 00` followed by the
     * client's X25519 public key and its Ed25519 public key.
     *
     * Returns our X25519 public key followed by our signature over both
     * ephemeral public keys, encrypted with keys derived from the shared secret.
     */
    fun pairVerifyStart(data: ByteArray): ByteArray? {
        if (data.size != 4 + 32 + 32) return null

        val clientEcdh = data.copyOfRange(4, 36)
        val clientEd = data.copyOfRange(36, 68)
        theirPublic = clientEcdh
        theirEd = clientEd
        clientPublicKey = clientEd

        val ephemeral = X25519PrivateKeyParameters(SecureRandom())
        val publicKey = ephemeral.generatePublicKey().encoded
        ourEphemeral = ephemeral
        ourPublic = publicKey

        val secret = ByteArray(32)
        ephemeral.generateSecret(X25519PublicKeyParameters(clientEcdh, 0), secret, 0)
        sharedSecret = secret

        val signature = identity.sign(publicKey + clientEcdh)
        val encrypted = AesCtr(deriveKey(SALT_KEY), deriveKey(SALT_IV)).process(signature)

        return publicKey + encrypted
    }

    /**
     * POST /pair-verify stage 2: `00 00 00 00` followed by the client's
     * encrypted signature over the same two keys, in the opposite order.
     */
    fun pairVerifyFinish(data: ByteArray): Boolean {
        if (data.size != 4 + 64) return false
        val ourKey = ourPublic ?: return false
        val theirKey = theirPublic ?: return false
        val clientEd = theirEd ?: return false

        val cipher = AesCtr(deriveKey(SALT_KEY), deriveKey(SALT_IV))
        // The client's signature is the *second* block of the keystream: stage 1
        // consumed the first 64 bytes encrypting our own signature.
        cipher.skip(64)
        val signature = cipher.process(data.copyOfRange(4, 68))

        val verifier = Ed25519Signer()
        verifier.init(false, Ed25519PublicKeyParameters(clientEd, 0))
        val message = theirKey + ourKey
        verifier.update(message, 0, message.size)

        verified = verifier.verifySignature(signature)
        return verified
    }

    private fun deriveKey(salt: String): ByteArray {
        val secret = sharedSecret ?: ByteArray(32)
        return sha512(salt.toByteArray(Charsets.UTF_8), secret).copyOf(16)
    }

    private companion object {
        const val SALT_KEY = "Pair-Verify-AES-Key"
        const val SALT_IV = "Pair-Verify-AES-IV"
    }
}
