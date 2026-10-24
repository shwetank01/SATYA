// "SBI KYC Update (DEMO)": a harmless look-alike used only to demo Know Your App + Suspect Watch.
// No INTERNET permission, stores nothing, sends nothing.
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.demo.fakekyc"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.demo.fakekyc"
        minSdk = 30
        targetSdk = 35
        versionCode = 1
        versionName = "1.0-demo"
    }
    buildTypes { release { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("debug") } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
