package com.liftlog.airplay

import com.liftlog.airplay.crypto.DeviceIdentity
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import java.security.SecureRandom

/** A [DeviceIdentity] built without touching Android storage. */
class TestIdentity private constructor(val deviceIdentity: DeviceIdentity) {
    companion object {
        fun create(): TestIdentity = TestIdentity(
            DeviceIdentity.of(Ed25519PrivateKeyParameters(SecureRandom()), "02:11:22:33:44:55")
        )
    }
}
