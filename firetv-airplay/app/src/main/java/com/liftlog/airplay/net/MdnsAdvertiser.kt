package com.liftlog.airplay.net

import android.util.Log
import com.liftlog.airplay.ReceiverConfig
import com.liftlog.airplay.crypto.DeviceIdentity
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import javax.jmdns.JmDNS
import javax.jmdns.ServiceInfo

/**
 * Publishes the two Bonjour services an AirPlay client looks for:
 * `_airplay._tcp` (the receiver itself) and `_raop._tcp` (its audio endpoint).
 *
 * Both point at the same RTSP port. The _raop instance name must be the device
 * ID with the separators stripped, followed by '@' and the display name — iOS
 * matches the two services by that prefix.
 */
class MdnsAdvertiser(
    private val identity: DeviceIdentity,
    private val deviceName: String,
    private val port: Int
) {
    private var jmdns: JmDNS? = null

    /** The address the services were published on, for display in the UI. */
    var address: InetAddress? = null
        private set

    fun start() {
        val local = findLocalAddress() ?: throw IllegalStateException("no usable IPv4 address")
        address = local

        val dns = JmDNS.create(local, deviceName.replace(' ', '-'))
        jmdns = dns

        dns.registerService(
            ServiceInfo.create(
                "_airplay._tcp.local.",
                deviceName,
                port,
                0,
                0,
                TxtRecords.airplay(identity, deviceName)
            )
        )
        dns.registerService(
            ServiceInfo.create(
                "_raop._tcp.local.",
                "${identity.deviceId.replace(":", "")}@$deviceName",
                port,
                0,
                0,
                TxtRecords.raop(identity)
            )
        )
        Log.i(TAG, "advertising '$deviceName' on ${local.hostAddress}:$port")
    }

    fun stop() {
        jmdns?.let {
            runCatching { it.unregisterAllServices() }
            runCatching { it.close() }
        }
        jmdns = null
        address = null
    }

    private fun findLocalAddress(): InetAddress? {
        val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
        for (nic in interfaces) {
            if (!nic.isUp || nic.isLoopback) continue
            for (addr in nic.inetAddresses) {
                if (addr is Inet4Address && !addr.isLoopbackAddress && !addr.isLinkLocalAddress) {
                    return addr
                }
            }
        }
        return null
    }

    private companion object {
        const val TAG = "AirPlayMdns"
    }
}
