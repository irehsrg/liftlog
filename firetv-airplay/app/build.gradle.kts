plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.liftlog.airplay"
    compileSdk = 34
    ndkVersion = "26.3.11579264"

    defaultConfig {
        applicationId = "com.liftlog.airplay"
        // Fire OS 7 (Fire TV Stick 4K / Lite / 3rd gen) is API 28; Fire OS 8 is API 30.
        // 22 keeps older sticks in range without costing anything.
        minSdk = 22
        // Deliberately 30: targeting 31+ pulls in foreground-service-type and
        // POST_NOTIFICATIONS churn that a sideloaded personal app does not need.
        targetSdk = 30
        versionCode = 1
        versionName = "1.0"

        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86_64")
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    lint {
        // This app is sideloaded onto a Fire TV, never published, so the Play
        // Store's minimum-target-API rule does not apply.
        disable += "ExpiredTargetSdkVersion"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    packaging {
        resources.excludes += setOf("META-INF/*")
    }
}

dependencies {
    // Ed25519 / X25519 / AES-CTR / SHA-512. The platform JCE on Fire OS 7 has no
    // Ed25519, so we use BouncyCastle's lightweight API directly rather than JCE.
    implementation("org.bouncycastle:bcprov-jdk18on:1.78.1")
    // Apple binary property lists (RTSP SETUP / GET /info bodies).
    implementation("com.googlecode.plist:dd-plist:1.28")
    // mDNS. Android's NsdManager cannot express the '@'-prefixed _raop instance
    // name or the full TXT record set that AirPlay clients look for.
    implementation("org.jmdns:jmdns:3.5.9")

    testImplementation("junit:junit:4.13.2")
}
