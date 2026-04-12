import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProperties = Properties().also { props ->
    val localFile = rootProject.file("local.properties")
    if (localFile.exists()) props.load(localFile.inputStream())
}

android {
    namespace = "com.hybridcontrol.agent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.hybridcontrol.agent"
        minSdk = 26
        targetSdk = 34
        versionCode = 3
        versionName = "1.2.0"

        val supabaseUrl: String = localProperties.getProperty("SUPABASE_URL") ?: ""
        val supabaseAnonKey: String = localProperties.getProperty("SUPABASE_ANON_KEY") ?: ""
        val backendUrl: String = localProperties.getProperty("BACKEND_URL") ?: ""
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        buildConfigField("String", "BACKEND_URL", "\"$backendUrl\"")
    }

    signingConfigs {
        create("release") {
            storeFile = file("../hybridcontrol-release.jks")
            storePassword = "hybridcontrol2024"
            keyAlias = "hybridcontrol"
            keyPassword = "hybridcontrol2024"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

dependencies {
    // AndroidX
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-ktx:1.8.2")

    // OkHttp for HTTP requests
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Gson for JSON
    implementation("com.google.code.gson:gson:2.10.1")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
}
