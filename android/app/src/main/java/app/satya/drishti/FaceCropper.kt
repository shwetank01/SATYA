package app.satya.drishti

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import java.io.ByteArrayOutputStream

/**
 * Video Call Snap (Section 8.1): largest face + 20% margin, 224x224, JPEG q85, each under 60 KB.
 * Only these crops leave the phone, and only after the user chose Video mode.
 */
object FaceCropper {
    private val detector by lazy {
        FaceDetection.getClient(FaceDetectorOptions.Builder().setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST).setMinFaceSize(.12f).build())
    }

    data class Crops(val jpegs: List<ByteArray>, val facesFound: Int)

    suspend fun crop(frames: List<Bitmap>): Crops {
        val out = ArrayList<ByteArray>()
        var found = 0
        for (f in frames) {
            val bmp = if (f.config == Bitmap.Config.HARDWARE) f.copy(Bitmap.Config.ARGB_8888, false) else f
            val faces = detector.process(InputImage.fromBitmap(bmp, 0)).awaitOrNull().orEmpty()
            val face = faces.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }
            val box = face?.boundingBox?.let { b ->
                found++
                val m = (maxOf(b.width(), b.height()) * .2f).toInt()
                Rect(b.left - m, b.top - m, b.right + m, b.bottom + m)
            } ?: centerSquare(bmp)
            box.intersect(0, 0, bmp.width, bmp.height)
            if (box.width() < 16 || box.height() < 16) continue
            val sq = Bitmap.createScaledBitmap(Bitmap.createBitmap(bmp, box.left, box.top, box.width(), box.height()), 224, 224, true)
            out.add(jpeg(sq))
        }
        return Crops(out, found)
    }

    private fun centerSquare(b: Bitmap): Rect {
        val s = minOf(b.width, b.height) * 3 / 5
        val l = (b.width - s) / 2
        val t = (b.height - s) / 3
        return Rect(l, t, l + s, t + s)
    }

    private fun jpeg(b: Bitmap): ByteArray {
        var q = 85
        while (true) {
            val bytes = ByteArrayOutputStream().use { b.compress(Bitmap.CompressFormat.JPEG, q, it); it.toByteArray() }
            if (bytes.size <= 60 * 1024 || q <= 40) return bytes
            q -= 10
        }
    }
}
