package com.liftlog.airplay

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.view.WindowManager
import android.widget.TextView

/**
 * Full-screen host for the mirrored picture.
 *
 * The activity owns nothing but the Surface and the idle overlay; the receiver
 * itself lives in [AirPlayService].
 */
class MainActivity : Activity(), AirPlayService.StateListener {

    private lateinit var surfaceView: SurfaceView
    private lateinit var overlay: View
    private lateinit var statusTitle: TextView
    private lateinit var statusDetail: TextView

    private var service: AirPlayService? = null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            val bound = (binder as? AirPlayService.LocalBinder)?.service ?: return
            service = bound
            bound.setStateListener(this@MainActivity)
            if (surfaceView.holder.surface?.isValid == true) {
                bound.setSurface(surfaceView.holder.surface)
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)

        surfaceView = findViewById(R.id.surface)
        overlay = findViewById(R.id.overlay)
        statusTitle = findViewById(R.id.status_title)
        statusDetail = findViewById(R.id.status_detail)

        surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                service?.setSurface(holder.surface)
            }

            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
                service?.setSurface(holder.surface)
            }

            override fun surfaceDestroyed(holder: SurfaceHolder) {
                service?.setSurface(null)
            }
        })

        val intent = Intent(this, AirPlayService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    override fun onDestroy() {
        service?.setStateListener(null)
        service?.setSurface(null)
        runCatching { unbindService(connection) }
        super.onDestroy()
    }

    override fun onStateChanged(state: AirPlayService.State) {
        if (state.streaming) {
            overlay.visibility = View.GONE
            return
        }

        overlay.visibility = View.VISIBLE
        when {
            state.error != null -> {
                statusTitle.text = getString(R.string.status_error)
                statusDetail.text = state.error
            }
            state.connectedClient != null -> {
                statusTitle.text = getString(R.string.status_connected, state.connectedClient)
                statusDetail.text = getString(R.string.status_waiting_for_video)
            }
            state.advertising -> {
                statusTitle.text = state.deviceName
                statusDetail.text = state.address?.let { getString(R.string.status_ready, it) }
                    ?: getString(R.string.status_ready_no_address)
            }
            else -> {
                statusTitle.text = getString(R.string.status_starting)
                statusDetail.text = ""
            }
        }
    }
}
