package com.liftlog.airplay.media

import android.media.MediaCodec
import android.media.MediaFormat
import android.util.Log
import android.view.Surface
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * H.264 decoder rendering straight to a [Surface].
 *
 * Input is fed from the mirroring stream thread; a second thread drains output
 * buffers and releases them for display immediately. Mirroring wants the lowest
 * latency available, so no attempt is made to schedule frames against the
 * client's clock.
 */
class VideoDecoder(private val surface: Surface) {

    private var codec: MediaCodec? = null
    private var outputThread: Thread? = null
    private val running = AtomicBoolean(false)

    private var width = 0
    private var height = 0

    val isConfigured: Boolean get() = codec != null

    /**
     * (Re)configures the decoder. [sps] and [pps] are Annex-B NAL units
     * including their start codes.
     */
    fun configure(width: Int, height: Int, sps: ByteArray, pps: ByteArray) {
        if (codec != null && width == this.width && height == this.height) {
            // Same geometry: the new parameter sets ride along in the stream.
            return
        }
        release()

        this.width = width
        this.height = height

        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setByteBuffer("csd-0", ByteBuffer.wrap(sps))
            setByteBuffer("csd-1", ByteBuffer.wrap(pps))
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, MAX_INPUT_SIZE)
        }

        try {
            val decoder = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            decoder.configure(format, surface, null, 0)
            decoder.start()
            codec = decoder
            running.set(true)
            outputThread = Thread({ drainOutput(decoder) }, "airplay-video-output").apply {
                isDaemon = true
                start()
            }
            Log.i(TAG, "decoder configured ${width}x$height")
        } catch (e: Exception) {
            Log.e(TAG, "failed to configure decoder", e)
            codec = null
        }
    }

    /** Submits one Annex-B access unit. */
    fun submit(data: ByteArray, length: Int, presentationTimeUs: Long) {
        val decoder = codec ?: return
        try {
            val index = decoder.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
            if (index < 0) {
                // Decoder is behind; dropping is better than growing latency.
                return
            }
            val buffer = decoder.getInputBuffer(index) ?: return
            buffer.clear()
            if (buffer.capacity() < length) {
                decoder.queueInputBuffer(index, 0, 0, presentationTimeUs, 0)
                Log.w(TAG, "access unit of $length bytes exceeds input buffer")
                return
            }
            buffer.put(data, 0, length)
            decoder.queueInputBuffer(index, 0, length, presentationTimeUs, 0)
        } catch (e: IllegalStateException) {
            Log.e(TAG, "decoder rejected input", e)
            release()
        }
    }

    private fun drainOutput(decoder: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        while (running.get()) {
            try {
                val index = decoder.dequeueOutputBuffer(info, DEQUEUE_TIMEOUT_US)
                when {
                    index >= 0 -> decoder.releaseOutputBuffer(index, true)
                    index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED ->
                        Log.i(TAG, "output format ${decoder.outputFormat}")
                }
            } catch (e: IllegalStateException) {
                if (running.get()) Log.e(TAG, "output drain failed", e)
                return
            }
        }
    }

    fun release() {
        running.set(false)
        outputThread?.join(500)
        outputThread = null
        codec?.let {
            runCatching { it.stop() }
            runCatching { it.release() }
        }
        codec = null
        width = 0
        height = 0
    }

    private companion object {
        const val TAG = "AirPlayVideo"
        const val DEQUEUE_TIMEOUT_US = 10_000L
        const val MAX_INPUT_SIZE = 2 * 1024 * 1024
    }
}
