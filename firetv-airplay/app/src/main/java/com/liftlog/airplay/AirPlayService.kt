package com.liftlog.airplay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import android.view.Surface
import com.liftlog.airplay.crypto.DeviceIdentity
import com.liftlog.airplay.media.VideoDecoder
import com.liftlog.airplay.media.VideoSink
import com.liftlog.airplay.net.MdnsAdvertiser
import com.liftlog.airplay.net.RtspServer
import com.liftlog.airplay.net.SessionListener

/**
 * Runs the receiver.
 *
 * Lives in a foreground service rather than the activity so that discovery and
 * the control server keep running while the UI is being recreated, and so Fire
 * OS does not reclaim it between casts.
 */
class AirPlayService : Service(), VideoSink, SessionListener {

    /** Called on the main thread as the receiver's state changes. */
    interface StateListener {
        fun onStateChanged(state: State)
    }

    data class State(
        val advertising: Boolean,
        val deviceName: String,
        val address: String?,
        val connectedClient: String?,
        val streaming: Boolean,
        val error: String?
    )

    inner class LocalBinder : Binder() {
        val service: AirPlayService get() = this@AirPlayService
    }

    private val binder = LocalBinder()
    private val mainHandler = Handler(Looper.getMainLooper())

    private var server: RtspServer? = null
    private var advertiser: MdnsAdvertiser? = null

    /**
     * The decoder is created and torn down from the main thread (as surfaces
     * come and go) but fed from the mirroring thread, so every touch of it goes
     * through [decoderLock].
     */
    private val decoderLock = Any()
    private var decoder: VideoDecoder? = null

    private var multicastLock: WifiManager.MulticastLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var wakeLock: PowerManager.WakeLock? = null

    @Volatile
    private var surface: Surface? = null

    /** Retained so the decoder can be rebuilt when a Surface arrives late. */
    private var lastWidth = 0
    private var lastHeight = 0
    private var lastSps: ByteArray? = null
    private var lastPps: ByteArray? = null

    private var stateListener: StateListener? = null

    private var state = State(
        advertising = false,
        deviceName = ReceiverConfig.defaultName(),
        address = null,
        connectedClient = null,
        streaming = false,
        error = null
    )

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, buildNotification())
        acquireLocks()
        startReceiver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder = binder

    // ---- Lifecycle -------------------------------------------------------

    private fun startReceiver() {
        val identity = DeviceIdentity.load(this)
        val name = deviceName()

        try {
            val rtsp = RtspServer(ReceiverConfig.RTSP_PORT, identity, name, this, this)
            rtsp.start()
            server = rtsp

            val mdns = MdnsAdvertiser(identity, name, rtsp.port)
            mdns.start()
            advertiser = mdns

            updateState {
                it.copy(
                    advertising = true,
                    deviceName = name,
                    address = mdns.address?.hostAddress,
                    error = null
                )
            }
            Log.i(TAG, "receiver started as '$name'")
        } catch (e: Exception) {
            Log.e(TAG, "failed to start receiver", e)
            updateState { it.copy(advertising = false, error = e.message ?: e.javaClass.simpleName) }
        }
    }

    private fun deviceName(): String {
        val model = Build.MODEL?.takeIf { it.isNotBlank() }
        return model?.let { if (it.contains("Fire", true)) it else "$it (Fire TV)" }
            ?: ReceiverConfig.defaultName()
    }

    override fun onDestroy() {
        advertiser?.stop()
        server?.stop()
        synchronized(decoderLock) {
            decoder?.release()
            decoder = null
        }
        releaseLocks()
        super.onDestroy()
    }

    private fun acquireLocks() {
        val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        // Without a multicast lock, Android silently drops the mDNS traffic that
        // discovery depends on.
        multicastLock = wifi?.createMulticastLock("airplay-mdns")?.apply {
            setReferenceCounted(false)
            acquire()
        }
        @Suppress("DEPRECATION")
        wifiLock = wifi?.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "airplay-wifi")?.apply {
            setReferenceCounted(false)
            acquire()
        }
        val power = getSystemService(Context.POWER_SERVICE) as? PowerManager
        wakeLock = power?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "airplay:receiver")?.apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseLocks() {
        runCatching { multicastLock?.release() }
        runCatching { wifiLock?.release() }
        runCatching { wakeLock?.release() }
        multicastLock = null
        wifiLock = null
        wakeLock = null
    }

    // ---- UI plumbing -----------------------------------------------------

    fun setStateListener(listener: StateListener?) {
        stateListener = listener
        listener?.onStateChanged(state)
    }

    /** Hands the decoder somewhere to draw, or null when the surface goes away. */
    fun setSurface(surface: Surface?) {
        this.surface = surface
        synchronized(decoderLock) {
            if (surface == null) {
                decoder?.release()
                decoder = null
                return
            }
            // A stream may already be running; rebuild the decoder against the
            // new surface using the parameter sets we last saw.
            val sps = lastSps
            val pps = lastPps
            if (sps != null && pps != null && lastWidth > 0) {
                decoder?.release()
                decoder = VideoDecoder(surface).apply { configure(lastWidth, lastHeight, sps, pps) }
            }
        }
    }

    private fun updateState(transform: (State) -> State) {
        state = transform(state)
        mainHandler.post { stateListener?.onStateChanged(state) }
    }

    // ---- VideoSink -------------------------------------------------------

    override fun onFormat(width: Int, height: Int, sps: ByteArray, pps: ByteArray) {
        lastWidth = width
        lastHeight = height
        lastSps = sps
        lastPps = pps

        val target = surface
        if (target == null) {
            Log.w(TAG, "video format received with no surface attached")
            return
        }
        synchronized(decoderLock) {
            val existing = decoder
            if (existing == null) {
                decoder = VideoDecoder(target).apply { configure(width, height, sps, pps) }
            } else {
                existing.configure(width, height, sps, pps)
            }
        }
        updateState { it.copy(streaming = true) }
    }

    override fun onAccessUnit(data: ByteArray, length: Int, presentationTimeUs: Long) {
        synchronized(decoderLock) {
            decoder?.submit(data, length, presentationTimeUs)
        }
    }

    override fun onStreamEnded() {
        synchronized(decoderLock) {
            decoder?.release()
            decoder = null
        }
        lastSps = null
        lastPps = null
        lastWidth = 0
        lastHeight = 0
        updateState { it.copy(streaming = false) }
    }

    // ---- SessionListener -------------------------------------------------

    override fun onSessionStarted(clientName: String?) {
        updateState { it.copy(connectedClient = clientName ?: "iPhone") }
    }

    override fun onSessionEnded() {
        updateState { it.copy(connectedClient = null, streaming = false) }
    }

    // ---- Notification ----------------------------------------------------

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "AirPlay Receiver", NotificationManager.IMPORTANCE_LOW)
            )
        }

        val intent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
        )

        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("AirPlay Receiver")
            .setContentText("Discoverable on the local network")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentIntent(intent)
            .setOngoing(true)
            .build()
    }

    private companion object {
        const val TAG = "AirPlayService"
        const val CHANNEL_ID = "airplay_receiver"
        const val NOTIFICATION_ID = 1
    }
}
