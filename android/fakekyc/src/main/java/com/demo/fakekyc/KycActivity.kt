package com.demo.fakekyc

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/**
 * DEMO ONLY. Imitates the screen a fake "KYC update" APK shows, so SATYA's Suspect Watch has
 * something to catch. It has no INTERNET permission and discards whatever is typed.
 */
class KycActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad * 3, pad, pad); setBackgroundColor(Color.WHITE) }
        fun label(t: String, size: Float = 16f) = TextView(this).apply { text = t; textSize = size; setTextColor(Color.rgb(20, 40, 90)); setPadding(0, pad / 2, 0, pad / 4) }
        root.addView(label("SBI KYC Update", 26f))
        root.addView(label("DEMO APP for SATYA testing. Not affiliated with any bank. Nothing you type is stored or sent.", 13f))
        root.addView(label("Your KYC is pending. Update now to keep your account active."))
        for ((hint, type) in listOf("Aadhaar number" to InputType.TYPE_CLASS_NUMBER, "PAN" to InputType.TYPE_CLASS_TEXT, "UPI PIN" to (InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD))) {
            root.addView(label(hint))
            root.addView(EditText(this).apply { this.hint = hint; inputType = type })
        }
        root.addView(Button(this).apply {
            text = "Update KYC"; gravity = Gravity.CENTER
            setOnClickListener { Toast.makeText(this@KycActivity, "Demo only: nothing was sent.", Toast.LENGTH_LONG).show() }
        })
        setContentView(root)
    }
}
