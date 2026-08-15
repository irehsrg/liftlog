package com.liftlog.airplay.net

import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.InputStream
import java.io.OutputStream

/**
 * A request on the AirPlay control connection.
 *
 * Clients use the same socket for RTSP/1.0 requests (SETUP, RECORD, TEARDOWN)
 * and HTTP/1.1 ones (POST /pair-setup, GET /info), so both are parsed the same
 * way and the response echoes whichever protocol token arrived.
 */
class RtspRequest(
    val method: String,
    val url: String,
    val protocol: String,
    private val headers: Map<String, String>,
    val body: ByteArray
) {
    fun header(name: String): String? = headers[name.lowercase()]

    /** The path with any query string removed. */
    val path: String get() = url.substringBefore('?')

    override fun toString(): String = "$method $url $protocol (${body.size} bytes)"

    companion object {
        private const val MAX_HEADER_BYTES = 16 * 1024
        private const val MAX_BODY_BYTES = 8 * 1024 * 1024

        /** Reads one request, or returns null at end of stream. */
        fun read(input: InputStream): RtspRequest? {
            val headerBytes = readHeaderSection(input) ?: return null
            val lines = String(headerBytes, Charsets.UTF_8).split("\r\n").filter { it.isNotEmpty() }
            if (lines.isEmpty()) return null

            val requestLine = lines[0].split(" ")
            if (requestLine.size < 3) throw IllegalStateException("malformed request line: ${lines[0]}")

            val headers = HashMap<String, String>()
            for (i in 1 until lines.size) {
                val separator = lines[i].indexOf(':')
                if (separator <= 0) continue
                headers[lines[i].substring(0, separator).trim().lowercase()] =
                    lines[i].substring(separator + 1).trim()
            }

            val length = headers["content-length"]?.toIntOrNull() ?: 0
            if (length < 0 || length > MAX_BODY_BYTES) {
                throw IllegalStateException("implausible Content-Length: $length")
            }
            val body = ByteArray(length)
            var read = 0
            while (read < length) {
                val n = input.read(body, read, length - read)
                if (n < 0) throw EOFException("truncated request body")
                read += n
            }

            return RtspRequest(requestLine[0], requestLine[1], requestLine[2], headers, body)
        }

        /** Reads through the blank line that terminates the header section. */
        private fun readHeaderSection(input: InputStream): ByteArray? {
            val buffer = ByteArrayOutputStream(512)
            var matched = 0
            while (true) {
                val b = input.read()
                if (b < 0) return if (buffer.size() == 0) null else throw EOFException("truncated headers")
                buffer.write(b)
                if (buffer.size() > MAX_HEADER_BYTES) throw IllegalStateException("header section too large")

                // Look for CRLFCRLF.
                matched = when {
                    b == '\r'.code && (matched == 0 || matched == 2) -> matched + 1
                    b == '\n'.code && (matched == 1 || matched == 3) -> matched + 1
                    else -> 0
                }
                if (matched == 4) {
                    val bytes = buffer.toByteArray()
                    return bytes.copyOf(bytes.size - 4)
                }
            }
        }
    }
}

/** A response on the AirPlay control connection. */
class RtspResponse(private val protocol: String) {
    var status: Int = 200
    var reason: String = "OK"
    var body: ByteArray = ByteArray(0)

    /** Set when the connection should be dropped after this response. */
    var disconnect: Boolean = false

    private val headers = LinkedHashMap<String, String>()

    fun setStatus(status: Int, reason: String) {
        this.status = status
        this.reason = reason
    }

    fun header(name: String, value: String) {
        headers[name] = value
    }

    fun binaryPlist(data: ByteArray) {
        header("Content-Type", "application/x-apple-binary-plist")
        body = data
    }

    fun octetStream(data: ByteArray) {
        header("Content-Type", "application/octet-stream")
        body = data
    }

    fun write(output: OutputStream) {
        val builder = StringBuilder()
        builder.append("$protocol $status $reason\r\n")
        for ((name, value) in headers) {
            builder.append("$name: $value\r\n")
        }
        builder.append("Content-Length: ${body.size}\r\n\r\n")

        output.write(builder.toString().toByteArray(Charsets.UTF_8))
        if (body.isNotEmpty()) output.write(body)
        output.flush()
    }
}
