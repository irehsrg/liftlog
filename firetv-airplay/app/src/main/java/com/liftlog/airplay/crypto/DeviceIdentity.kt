package com.liftlog.airplay.crypto

import android.content.Context
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.security.SecureRandom

/**
 * The receiver's long-lived identity: an Ed25519 key pair plus a stable
 * pseudo-MAC used as the AirPlay `deviceid`.
 *
 * Both are generated once and persisted. Clients remember the public key, so
 * regenerating it on every launch would make iOS re-pair (and sometimes refuse
 * to connect) each time.
 */
class DeviceIdentity private constructor(
    private val privateKey: Ed25519PrivateKeyParameters,
    /** Six bytes rendered as `AA:BB:CC:DD:EE:FF`. */
    val deviceId: String
) {
    val publicKey: ByteArray = privateKey.generatePublicKey().encoded

    val publicKeyHex: String = publicKey.joinToString("") { "%02x".format(it) }

    /** Raw six bytes of [deviceId], as used in the _raop service instance name. */
    val deviceIdBytes: ByteArray =
        deviceId.split(":").map { it.toInt(16).toByte() }.toByteArray()

    fun sign(message: ByteArray): ByteArray {
        val signer = Ed25519Signer()
        signer.init(true, privateKey)
        signer.update(message, 0, message.size)
        return signer.generateSignature()
    }

    companion object {
        /** Builds an identity from an existing key, for tests. */
        internal fun of(privateKey: Ed25519PrivateKeyParameters, deviceId: String) =
            DeviceIdentity(privateKey, deviceId)

        private const val PREFS = "airplay_identity"
        private const val KEY_PRIVATE = "ed25519_private"
        private const val KEY_DEVICE_ID = "device_id"

        fun load(context: Context): DeviceIdentity {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

            val storedKey = prefs.getString(KEY_PRIVATE, null)
            val privateKey = if (storedKey != null) {
                Ed25519PrivateKeyParameters(hexToBytes(storedKey), 0)
            } else {
                Ed25519PrivateKeyParameters(SecureRandom()).also {
                    prefs.edit().putString(KEY_PRIVATE, bytesToHex(it.encoded)).apply()
                }
            }

            val deviceId = prefs.getString(KEY_DEVICE_ID, null) ?: run {
                val mac = ByteArray(6).also { SecureRandom().nextBytes(it) }
                // Locally administered, unicast: the two low bits of the first
                // octet are what distinguish that from a real vendor address.
                mac[0] = ((mac[0].toInt() and 0xFE) or 0x02).toByte()
                val formatted = mac.joinToString(":") { "%02X".format(it) }
                prefs.edit().putString(KEY_DEVICE_ID, formatted).apply()
                formatted
            }

            return DeviceIdentity(privateKey, deviceId)
        }

        private fun bytesToHex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }

        private fun hexToBytes(hex: String) = ByteArray(hex.length / 2) {
            hex.substring(it * 2, it * 2 + 2).toInt(16).toByte()
        }
    }
}
