package com.liftlog.airplay

/**
 * Values the receiver advertises about itself.
 *
 * The model and version strings matter: iOS decides what it is talking to from
 * these, and reporting an Apple TV 3 is what keeps it in the plain H.264
 * mirroring mode this receiver implements.
 */
object ReceiverConfig {
    const val RTSP_PORT = 7000

    const val MODEL = "AppleTV3,2"
    const val SOURCE_VERSION = "220.68"

    /**
     * AirPlay feature bits. Bit 27 ("supports legacy pairing") is on, which is
     * what drives the /pair-setup + /pair-verify exchange. Bit 42
     * (SupportsScreenMultiCodec) is deliberately off so clients send H.264
     * rather than HEVC.
     */
    const val FEATURES_LOW = 0x5A7FFEE6L
    const val FEATURES_HIGH = 0x0L

    val features: Long get() = (FEATURES_HIGH shl 32) or FEATURES_LOW
    val featuresText: String get() = "0x%X,0x%X".format(FEATURES_LOW, FEATURES_HIGH)

    /** Advertised display geometry. */
    const val WIDTH = 1920
    const val HEIGHT = 1080
    const val REFRESH_RATE = 60
    const val MAX_FPS = 60

    const val PI = "2e388006-13ba-4041-9a67-25dd4a43d536"
    const val DISPLAY_UUID = "e0ff8a27-6738-3d56-8a16-cc53aacee925"

    fun defaultName(): String = "Fire TV"
}
