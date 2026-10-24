import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

// android/secrets.properties (gitignored): URLs, APP_KEY and the pinned public keys (Section 6.3).
val secrets = Properties().apply {
    val f = rootProject.file("secrets.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(name: String, fallback: String = ""): String = (secrets.getProperty(name) ?: fallback).trim()

// android/keystore.properties (gitignored): release signing. A dedicated key, never the SDK debug key
// (debug signing + SMS permissions is what makes Play Protect refuse a sideloaded APK).
val keyProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "app.satya"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.satya"
        minSdk = 30
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "GATEWAY_URL", "\"${secret("GATEWAY_URL", "https://satya-gateway.vercel.app")}\"")
        buildConfigField("String", "VIVEK_URL", "\"${secret("VIVEK_URL")}\"")
        buildConfigField("String", "APP_KEY", "\"${secret("APP_KEY")}\"")
        buildConfigField("String", "ROOT_PK", "\"${secret("ROOT_PK")}\"")
        buildConfigField("String", "RECEIPT_PK", "\"${secret("RECEIPT_PK")}\"")
        buildConfigField("String", "DOCTOR_BOX_PK", "\"${secret("DOCTOR_BOX_PK")}\"")

    }

    signingConfigs {
        create("release") {
            if (keyProps.isNotEmpty()) {
                storeFile = rootProject.file(keyProps.getProperty("storeFile"))
                storePassword = keyProps.getProperty("storePassword")
                keyAlias = keyProps.getProperty("keyAlias")
                keyPassword = keyProps.getProperty("keyPassword")
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        release {
            // R8 stays off: lazysodium (JNA) and ML Kit are reflection-heavy, and a stage demo
            // cannot afford a missing keep rule. The rules are still in proguard-rules.pro.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (keyProps.isNotEmpty()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
            // Every Samsung (and every phone sold in India since ~2019) is ARM; x86_64 only adds ~22 MB of ML Kit for emulators.
            ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources.excludes += setOf("META-INF/{AL2.0,LGPL2.1}", "META-INF/LICENSE*", "META-INF/NOTICE*")
        jniLibs.useLegacyPackaging = false
    }
    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

// The Doctor runs the shared spec vectors on the phone (D8, D9, D13): bundle them from ../spec.
val specAssetsDir = file("build/generated/specAssets")
val copySpecAssets = tasks.register<Copy>("copySpecAssets") {
    from(rootProject.file("../spec")) { include("rule_cases.json", "mask_vectors.json", "crypto_vectors.json", "hash_vectors.json") }
    into(File(specAssetsDir, "spec"))
}
android.sourceSets.getByName("main").assets.srcDir(specAssetsDir)
tasks.named("preBuild") { dependsOn(copySpecAssets) }
afterEvaluate {
    tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach { dependsOn(copySpecAssets) }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(project(":core"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.animation)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.navigation.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.service)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.savedstate.ktx)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.work.runtime.ktx)
    implementation(libs.datastore.preferences)

    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    implementation("${libs.lazysodium.android.get()}@aar")
    implementation("${libs.jna.get()}@aar")

    implementation(libs.mlkit.text)
    implementation(libs.mlkit.text.devanagari)
    implementation(libs.mlkit.face)

    testImplementation(kotlin("test"))
}
