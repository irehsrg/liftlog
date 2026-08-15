package com.liftlog.airplay.net

import com.liftlog.airplay.ReceiverConfig
import com.liftlog.airplay.crypto.DeviceIdentity
import java.io.ByteArrayOutputStream

/**
 * The Bonjour TXT records for the two advertised services.
 *
 * These are needed twice over: mDNS publishes them, and clients also ask for
 * them through `GET /info` with a `qualifier` of "txtAirPlay" or "txtRAOP", so
 * the two paths have to agree.
 */
object TxtRecords {

    fun airplay(identity: DeviceIdentity, deviceName: String): Map<String, String> = linkedMapOf(
        "deviceid" to identity.deviceId,
        "features" to ReceiverConfig.featuresText,
        "flags" to "0x4",
        "model" to ReceiverConfig.MODEL,
        "pk" to identity.publicKeyHex,
        "pi" to ReceiverConfig.PI,
        "srcvers" to ReceiverConfig.SOURCE_VERSION,
        "vv" to "2",
        "pw" to "false"
    )

    fun raop(identity: DeviceIdentity): Map<String, String> = linkedMapOf(
        "txtvers" to "1",
        "ch" to "2",
        // Codecs offered: PCM, ALAC, AAC-LC, AAC-ELD.
        "cn" to "0,1,2,3",
        "da" to "true",
        // Encryption: none, FairPlay, FairPlay SAPv2.5.
        "et" to "0,3,5",
        "ft" to ReceiverConfig.featuresText,
        "am" to ReceiverConfig.MODEL,
        "md" to "0,1,2",
        "rhd" to "5.6.0.0",
        "pw" to "false",
        "sr" to "44100",
        "ss" to "16",
        "sv" to "false",
        "tp" to "UDP",
        "sf" to "0x4",
        "vs" to ReceiverConfig.SOURCE_VERSION,
        "vn" to "65537",
        "vv" to "2",
        "pk" to identity.publicKeyHex
    )

    /** Encodes to DNS-SD wire format: each `key=value` prefixed with its length. */
    fun encode(entries: Map<String, String>): ByteArray {
        val out = ByteArrayOutputStream()
        for ((key, value) in entries) {
            val pair = "$key=$value".toByteArray(Charsets.UTF_8)
            // A single TXT string cannot exceed 255 bytes; none of ours come close.
            if (pair.size > 255) continue
            out.write(pair.size)
            out.write(pair)
        }
        return out.toByteArray()
    }
}
