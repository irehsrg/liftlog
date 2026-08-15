package com.liftlog.airplay

import com.liftlog.airplay.media.AnnexB
import com.liftlog.airplay.net.RtspRequest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

class RtspRequestTest {

    private fun parse(text: String, body: ByteArray = ByteArray(0)): RtspRequest? {
        val stream = ByteArrayInputStream(text.toByteArray(Charsets.UTF_8) + body)
        return RtspRequest.read(stream)
    }

    @Test
    fun `parses an RTSP request with a binary body`() {
        val body = byteArrayOf(0x62, 0x70, 0x6C, 0x69, 0x73, 0x74, 0x00, 0x00.toByte(), 0xFF.toByte())
        val request = parse(
            "SETUP rtsp://192.168.1.5/1234 RTSP/1.0\r\n" +
                "CSeq: 4\r\n" +
                "Content-Type: application/x-apple-binary-plist\r\n" +
                "Content-Length: ${body.size}\r\n" +
                "\r\n",
            body
        )!!

        assertEquals("SETUP", request.method)
        assertEquals("rtsp://192.168.1.5/1234", request.url)
        assertEquals("RTSP/1.0", request.protocol)
        assertEquals("4", request.header("CSeq"))
        assertArrayEquals(body, request.body)
    }

    @Test
    fun `header lookup is case insensitive`() {
        val request = parse(
            "POST /fp-setup HTTP/1.1\r\nCONTENT-LENGTH: 0\r\nX-Apple-Device-ID: 42\r\n\r\n"
        )!!
        assertEquals("42", request.header("x-apple-device-id"))
        assertEquals("42", request.header("X-Apple-Device-ID"))
        assertNull(request.header("Missing"))
    }

    @Test
    fun `strips the query string from the path`() {
        val request = parse("GET /info?txtAirPlay&txtRAOP HTTP/1.1\r\n\r\n")!!
        assertEquals("/info", request.path)
        assertEquals("/info?txtAirPlay&txtRAOP", request.url)
    }

    @Test
    fun `two requests can be read from one stream`() {
        val text = "OPTIONS * RTSP/1.0\r\nCSeq: 1\r\n\r\n" +
            "GET /info RTSP/1.0\r\nCSeq: 2\r\n\r\n"
        val stream = ByteArrayInputStream(text.toByteArray(Charsets.UTF_8))

        assertEquals("OPTIONS", RtspRequest.read(stream)!!.method)
        assertEquals("2", RtspRequest.read(stream)!!.header("CSeq"))
        assertNull("stream is drained", RtspRequest.read(stream))
    }

    @Test
    fun `a body split across reads is fully consumed`() {
        // A stream that hands back one byte at a time, like a slow socket.
        val body = ByteArray(64) { it.toByte() }
        val bytes = ("POST /pair-verify RTSP/1.0\r\nContent-Length: 64\r\n\r\n")
            .toByteArray(Charsets.UTF_8) + body
        val trickle = object : java.io.InputStream() {
            private var pos = 0
            override fun read(): Int = if (pos < bytes.size) bytes[pos++].toInt() and 0xFF else -1
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (pos >= bytes.size) return -1
                b[off] = bytes[pos++]
                return 1
            }
        }

        assertArrayEquals(body, RtspRequest.read(trickle)!!.body)
    }
}

class AnnexBTest {

    /** Builds a length-prefixed NAL sequence like the one AirPlay sends. */
    private fun lengthPrefixed(vararg nals: ByteArray): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        for (nal in nals) {
            out.write(byteArrayOf(
                (nal.size ushr 24).toByte(),
                (nal.size ushr 16).toByte(),
                (nal.size ushr 8).toByte(),
                nal.size.toByte()
            ))
            out.write(nal)
        }
        return out.toByteArray()
    }

    @Test
    fun `rewrites every prefix to a start code`() {
        // Type 5 (IDR) followed by type 1 (non-IDR).
        val first = byteArrayOf(0x65, 0x11, 0x22)
        val second = byteArrayOf(0x41, 0x33)
        val buffer = lengthPrefixed(first, second)

        assertTrue(AnnexB.rewriteInPlace(buffer, 0, buffer.size))
        assertArrayEquals(
            byteArrayOf(0, 0, 0, 1, 0x65, 0x11, 0x22, 0, 0, 0, 1, 0x41, 0x33),
            buffer
        )
    }

    @Test
    fun `honours the offset so prepended parameter sets survive`() {
        val prefix = byteArrayOf(0, 0, 0, 1, 0x67, 0x42) // an SPS already in Annex-B
        val payload = lengthPrefixed(byteArrayOf(0x65, 0x01))
        val buffer = prefix + payload

        assertTrue(AnnexB.rewriteInPlace(buffer, prefix.size, payload.size))
        assertArrayEquals(prefix, buffer.copyOf(prefix.size))
        assertArrayEquals(byteArrayOf(0, 0, 0, 1, 0x65, 0x01), buffer.copyOfRange(prefix.size, buffer.size))
    }

    @Test
    fun `rejects a length that overruns the buffer`() {
        val buffer = byteArrayOf(0, 0, 0, 0x40, 0x65, 0x01)
        assertFalse(AnnexB.rewriteInPlace(buffer, 0, buffer.size))
    }

    @Test
    fun `rejects a NAL header with the forbidden bit set`() {
        // 0x80 in the NAL header means this did not decrypt correctly.
        val buffer = lengthPrefixed(byteArrayOf(0x85.toByte(), 0x01))
        assertFalse(AnnexB.rewriteInPlace(buffer, 0, buffer.size))
    }

    @Test
    fun `rejects a truncated prefix and a zero length`() {
        assertFalse(AnnexB.rewriteInPlace(byteArrayOf(0, 0, 1), 0, 3))
        assertFalse(AnnexB.rewriteInPlace(byteArrayOf(0, 0, 0, 0, 0x65), 0, 5))
    }
}
