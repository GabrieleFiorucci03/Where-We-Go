plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

/*
 * Dove finiscono le sagome: nell'asset pack (normale) o dentro il pacchetto
 * dell'app (`-PdatiNelPacchetto=false`).
 *
 * Serve perche' un APK compilato con `assembleDebug` **non contiene** gli asset
 * pack: e' una cosa che esiste solo nell'AAB, quindi nel giro corto — compila,
 * installa via cavo, manda l'APK per Telegram — l'app si aprirebbe con le
 * bandiere e le regioni mancanti, e senza un errore che lo dica. Con la
 * bandierina a `false` si torna al pacchetto unico e autosufficiente di prima.
 *
 * Per lo store vale sempre l'altra strada, che e' la predefinita.
 */
val datiNelPacchetto =
    (project.findProperty("datiNelPacchetto") as String? ?: "true").toBoolean()

android {
    namespace = "com.provamappa.globe"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.provamappa.globe"
        minSdk = 26
        targetSdk = 35
        versionCode = 7
        versionName = "1.3.3"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
        // Da AGP 8 va chiesto esplicitamente. Serve a `BuildConfig.VERSION_NAME`,
        // che finisce nello User-Agent mandato a Wikimedia: scritto a mano era
        // rimasto a `0.6` mentre l'app era alla 1.3.3, cioe' diceva una cosa
        // falsa proprio a chi la legge per identificarci.
        buildConfig = true
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
        // Il prototipo web vive fuori dal progetto Android, ma non si include
        // piu' `../web` per intero: i dati geografici vanno nell'asset pack e
        // qui resta il resto. La cartella qui sotto la riempie `preparaWeb`,
        // in fondo a questo file, che e' anche dove sta scritto il criterio.
        layout.buildDirectory.dir("assets-web"),
    )

    // Play Asset Delivery: le sagome viaggiano in un pacchetto a parte, fuori
    // dal modulo base e dal suo tetto. Vedi dati/build.gradle.kts.
    if (datiNelPacchetto) assetPacks += listOf(":dati")

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

/*
 * Chi tiene che cosa: la divisione fra modulo base e asset pack.
 *
 * Il vincolo e' di Fase 4 di docs/PUBBLICAZIONE.md: il modulo base ha un tetto
 * suo, le sagome da sole ne pesano piu' di 200 MB. L'asset pack toglie proprio
 * quelle dal conteggio del modulo base.
 *
 * La riga di taglio **non e' la dimensione, e' il modo in cui il file viene
 * letto**:
 *
 * - i PMTiles restano nel modulo base. Si leggono a pezzi con `openFd`
 *   (TileFiles), che funziona solo su asset non compressi, ed e' `noCompress`
 *   qui sopra a garantirlo. Dentro un asset pack quella garanzia passerebbe per
 *   la configurazione del bundle: piu' anelli nella catena, e il guasto sarebbe
 *   una mappa vuota. Non compressi pesano 111 MB, che nel modulo base ci stanno
 *   comodi.
 * - tutto il resto di `web/data` — le 3.592 sagome GeoJSON, 205 MB — va
 *   nell'asset pack. Si legge in streaming (`assets.open` di IndiceRegioni, e
 *   il WebViewAssetLoader per la pagina), quindi la compressione non solo non
 *   da' fastidio: fa risparmiare, perche' il GeoJSON si comprime molto.
 *
 * Le due copie sono compiti `Sync`: cancellano cio' che non c'e' piu' in
 * origine, e dopo la prima volta non ricopiano i file gia' uguali.
 */
val preparaWeb by tasks.registering(Sync::class) {
    description = "Copia il prototipo web negli asset del modulo base."
    from(rootProject.file("../web")) {
        // con la bandierina a `false` passa tutto di qua, sagome comprese
        if (datiNelPacchetto) exclude("data/**")
    }
    if (datiNelPacchetto) {
        // i PMTiles sono l'eccezione: letti a pezzi, quindi restano di qua
        from(rootProject.file("../web/data")) {
            include("*.pmtiles")
            into("data")
        }
    }
    into(layout.buildDirectory.dir("assets-web"))
}

val preparaDati by tasks.registering(Sync::class) {
    description = "Copia le sagome geografiche negli asset dell'asset pack."
    onlyIf { datiNelPacchetto }
    from(rootProject.file("../web/data")) {
        exclude("*.pmtiles")
    }
    into(rootProject.file("dati/src/main/assets/data"))
}

// `preBuild` e' il gancio piu' presto disponibile e copre il modulo base.
tasks.named("preBuild") {
    dependsOn(preparaWeb, preparaDati)
}

// L'asset pack no: AGP lo legge dalla cartella del modulo `dati` con compiti
// suoi, che non passano da `preBuild`. Senza questa riga Gradle sarebbe libero
// di imbustare il pacchetto prima che la copia sia arrivata — e un pacchetto
// vuoto non fallisce la build, si vede solo a mappa aperta.
tasks.matching { it.name.contains("AssetPack") }.configureEach {
    dependsOn(preparaDati)
}
