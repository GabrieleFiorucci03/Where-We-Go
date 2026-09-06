plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.provamappa.globe"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.provamappa.globe"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "0.6-backup"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets["main"].assets.srcDirs(
        "src/main/assets",
        // il prototipo web vive fuori dal progetto Android e viene incluso
        // cosi' com'e': nessuna copia da tenere sincronizzata
        rootProject.file("../web")
    )

    androidResources {
        // i PMTiles vanno letti a pezzi: compressi nell'APK non sarebbero
        // accessibili in lettura casuale
        noCompress += listOf("pmtiles")

        // I PMTiles **stanno** nell'APK, cosi' l'app e' un file solo da
        // spedire. §4.2 del piano prescriveva il contrario — tile su disco,
        // copiati via USB — ma quel flusso presuppone il cavo: per mandare
        // l'app via Telegram serve un pacchetto autosufficiente.
        //
        // Non c'e' il raddoppio di spazio che §4.2 temeva, perche' `noCompress`
        // qui sopra li tiene non compressi e contigui: TileFiles li legge a
        // pezzi direttamente dentro l'APK, senza estrarli. E la cartella su
        // disco resta prioritaria, quindi si possono comunque aggiornare i dati
        // copiandoceli sopra, senza reinstallare.
    }
}

dependencies {
    // WebViewAssetLoader: serve i file locali su uno schema https:// finto,
    // evitando le restrizioni di origine di file://
    implementation("androidx.webkit:webkit:1.12.1")

    // Interfaccia nativa: la mappa resta nella WebView, tutto il resto —
    // scheda di selezione, menu, elenchi — e' Compose (§1 e §9 del piano).
    val compose = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(compose)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Chrome Custom Tab per l'approfondimento (§9): apre una pagina web senza
    // uscire dall'app e senza portarsi dietro un browser incorporato. Resta
    // anche con la galleria: per oltre meta' dell'indice e' quella la strada
    // che porta a qualcosa (§9.6).
    implementation("androidx.browser:browser:1.8.0")

    // Coil per la galleria: scaricare, decodificare e **tenere in cache su
    // disco** le foto di Commons. Le chiamate JSON si fanno a mano con
    // HttpURLConnection e org.json, che ci sono gia'; la cache delle immagini
    // scritta a mano invece no, ed e' la parte che si sbaglia.
    implementation("io.coil-kt:coil-compose:2.7.0")

    // Le bandiere sono SVG — gli stessi 255 file che usa la mappa — e Coil da
    // solo non li sa decodificare: il decoder sta in un artefatto a parte. Meglio
    // che rasterizzarle in pipeline verso altrettanti PNG, che vorrebbe dire un
    // secondo insieme di file da tenere allineato al primo per ottenere immagini
    // peggiori — un SVG si disegna nitido a qualunque densita' di schermo.
    implementation("io.coil-kt:coil-svg:2.7.0")
}
