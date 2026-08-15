package com.liftlog.airplay.net

import android.util.Log
import com.liftlog.airplay.crypto.DeviceIdentity
import com.liftlog.airplay.media.VideoSink
import java.net.ServerSocket
import java.util.Collections
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Accepts AirPlay control connections.
 *
 * Clients open more than one: short-lived ones to probe GET /info, and a
 * long-lived one that carries the actual session. Each gets its own thread and
 * its own [AirPlayConnection] state.
 */
class RtspServer(
    port: Int,
    private val identity: DeviceIdentity,
    private val deviceName: String,
    private val sink: VideoSink,
    private val listener: SessionListener
) {
    private val serverSocket = ServerSocket(port).apply { soTimeout = ACCEPT_TIMEOUT_MS }
    private val running = AtomicBoolean(true)
    private val connections = Collections.synchronizedList(ArrayList<AirPlayConnection>())
    private var thread: Thread? = null

    val port: Int get() = serverSocket.localPort

    fun start() {
        thread = Thread(::run, "airplay-rtsp").apply {
            isDaemon = true
            start()
        }
        Log.i(TAG, "control server listening on port $port")
    }

    private fun run() {
        while (running.get()) {
            val socket = try {
                serverSocket.accept()
            } catch (e: java.net.SocketTimeoutException) {
                continue
            } catch (e: Exception) {
                if (running.get()) Log.e(TAG, "accept failed", e)
                return
            }

            val connection = AirPlayConnection(socket, identity, deviceName, sink, listener)
            connections.add(connection)
            Thread({
                try {
                    connection.run()
                } finally {
                    connections.remove(connection)
                }
            }, "airplay-conn-${socket.port}").apply {
                isDaemon = true
                start()
            }
        }
    }

    fun stop() {
        running.set(false)
        runCatching { serverSocket.close() }
        synchronized(connections) {
            for (connection in ArrayList(connections)) connection.close()
            connections.clear()
        }
        thread?.join(1000)
        thread = null
    }

    private companion object {
        const val TAG = "AirPlayServer"
        const val ACCEPT_TIMEOUT_MS = 1000
    }
}
