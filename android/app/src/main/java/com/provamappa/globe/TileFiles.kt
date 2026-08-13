package com.provamappa.globe

import android.content.Context
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer

/**
 * Ponte fra JavaScript e i file PMTiles su disco.
 *
 * Perche' esiste: il protocollo PMTiles legge porzioni di file con Range
 * request HTTP, e nella WebView Android le Range su risorse locali sono
 * inaffidabili — la prima funziona, le successive falliscono con ERR_FAILED.
 * Invece di combatterci, JavaScript chiede i byte direttamente a Kotlin, che
 * li legge con RandomAccessFile. Nessun server locale, nessuna porta aperta.
 *
 * Il prezzo e' il Base64, che gonfia il trasferimento di circa un terzo; e'
 * accettabile perche' i blocchi richiesti sono piccoli e la cache di pmtiles.js
 * evita di rileggere piu' volte le stesse porzioni.
 *
 * Tutto avviene dentro [tilesDir]: i nomi ricevuti da JavaScript vengono
 * ripuliti e il percorso risultante viene verificato, cosi' una pagina non puo'
 * farsi leggere file arbitrari del dispositivo.
 */
class TileFiles(context: Context) {

    private val appContext = context.applicationContext

    /**
     * Cartella dei tile: quella **esterna** dell'app, non `filesDir`.
     *
     * `/sdcard/Android/data/<package>/files/tiles/` si raggiunge da Windows via
     * USB in MTP senza root e senza permessi speciali, ed e' il presupposto del
     * flusso descritto in §4.2 del piano: i PMTiles si copiano a mano quando la
     * pipeline ne produce di nuovi, senza reinstallare l'app. Con `filesDir`,
     * che sta nella memoria interna, quella copia sarebbe impossibile.
     *
     * Attenzione: questa cartella viene cancellata alla disinstallazione, quindi
     * i PMTiles vanno tenuti anche sul PC.
     */
    private val tilesDir: File =
        File(context.getExternalFilesDir(null) ?: context.filesDir, "tiles").apply { mkdirs() }

    /** Percorso completo, da mostrare all'utente che deve copiarci i file. */
    val percorso: String get() = tilesDir.absolutePath

    private fun resolve(name: String): File? {
        // niente separatori: si accede solo ai file direttamente in tilesDir
        val pulito = File(name).name
        if (pulito.isEmpty() || pulito == "." || pulito == "..") return null
        val f = File(tilesDir, pulito)
        if (f.canonicalPath != File(tilesDir, pulito).canonicalPath) return null
        if (!f.canonicalPath.startsWith(tilesDir.canonicalPath + File.separator)) return null
        return f
    }

    /** Cartella in cui l'utente deve copiare i PMTiles, da mostrare in caso di errore. */
    @JavascriptInterface
    fun cartella(): String = tilesDir.absolutePath

    /**
     * Descrittore di un PMTiles imbustato negli asset dell'APK.
     *
     * Gli asset sono dichiarati `noCompress` per l'estensione pmtiles, quindi
     * dentro l'APK stanno **non compressi** e in un tratto contiguo: si puo'
     * leggerne un pezzo qualsiasi posizionando il canale a
     * `startOffset + offset`, senza estrarre nulla.
     *
     * E' la differenza fra spedire un solo file e raddoppiare lo spazio
     * occupato: copiare i 87 MB di archivi fuori dagli asset al primo avvio
     * significherebbe 87 nell'APK piu' 87 su disco.
     */
    private fun assetFd(name: String) = try {
        appContext.assets.openFd("data/$name")
    } catch (e: Exception) {
        null // asset assente, oppure compresso: in entrambi i casi non e' leggibile a pezzi
    }

    /**
     * Elenco dei PMTiles disponibili, come JSON: [{"nome":...,"byte":...}]
     *
     * Comprende sia quelli copiati a mano in [tilesDir] sia quelli imbustati
     * nell'APK. A parita' di nome vince il file su disco: e' cosi' che si
     * aggiornano i dati senza reinstallare l'app.
     */
    @JavascriptInterface
    fun list(): String {
        val trovati = LinkedHashMap<String, Long>()
        try {
            for (n in appContext.assets.list("data").orEmpty()) {
                if (!n.endsWith(".pmtiles")) continue
                assetFd(n)?.use { trovati[n] = it.length }
            }
        } catch (e: Exception) {
            Log.w(TAG, "elenco asset non leggibile", e)
        }
        tilesDir.listFiles { f -> f.isFile && f.name.endsWith(".pmtiles") }
            ?.forEach { trovati[it.name] = it.length() }
        return trovati.entries.joinToString(prefix = "[", postfix = "]") {
            """{"nome":"${it.key}","byte":${it.value}}"""
        }
    }

    /** Dimensione in byte, -1 se il file non c'e' ne' su disco ne' negli asset. */
    @JavascriptInterface
    fun size(name: String): Double {
        val f = resolve(name)
        if (f != null && f.isFile) return f.length().toDouble()
        val pulito = File(name).name
        assetFd(pulito)?.use { return it.length.toDouble() }
        return -1.0
    }

    /**
     * Legge [length] byte a partire da [offset] e li restituisce in Base64.
     * Stringa vuota se la richiesta non e' soddisfacibile.
     *
     * offset e' un Double perche' i numeri JavaScript non sono interi a 64 bit;
     * per file sotto i 9 petabyte la conversione e' esatta.
     */
    @JavascriptInterface
    fun readBase64(name: String, offset: Double, length: Int): String {
        if (length <= 0 || length > MAX_CHUNK) {
            Log.w(TAG, "readBase64: lunghezza fuori scala $length")
            return ""
        }
        val start = offset.toLong()
        if (start < 0) return ""

        // il file su disco ha la precedenza: e' cosi' che si aggiornano i dati
        // senza reinstallare l'app
        val f = resolve(name)
        if (f != null && f.isFile) return leggiDaFile(f, name, start, length)

        return leggiDaAsset(File(name).name, start, length)
    }

    private fun leggiDaFile(f: File, name: String, start: Long, length: Int): String {
        if (start >= f.length()) {
            Log.w(TAG, "readBase64: offset fuori dal file $start/${f.length()}")
            return ""
        }
        val effettivo = minOf(length.toLong(), f.length() - start).toInt()
        return try {
            RandomAccessFile(f, "r").use { raf ->
                raf.seek(start)
                val buf = ByteArray(effettivo)
                raf.readFully(buf)
                Base64.encodeToString(buf, Base64.NO_WRAP)
            }
        } catch (e: Exception) {
            Log.e(TAG, "readBase64 fallita su $name @$start+$effettivo", e)
            ""
        }
    }

    /**
     * Legge un pezzo di PMTiles direttamente dagli asset dell'APK.
     *
     * Non estrae niente: si posiziona il canale a `startOffset + start`, dove
     * `startOffset` e' il punto in cui l'asset comincia dentro il file APK.
     * Funziona **solo** perche' `noCompress` tiene i pmtiles non compressi:
     * su un asset compresso `openFd` fallisce, ed e' il motivo per cui quella
     * riga in build.gradle.kts non va tolta.
     */
    private fun leggiDaAsset(nome: String, start: Long, length: Int): String {
        val fd = assetFd(nome)
        if (fd == null) {
            Log.w(TAG, "readBase64: $nome non e' ne' su disco ne' negli asset")
            return ""
        }
        return fd.use { afd ->
            if (start >= afd.length) {
                Log.w(TAG, "readBase64: offset fuori dall'asset $start/${afd.length}")
                return@use ""
            }
            val effettivo = minOf(length.toLong(), afd.length - start).toInt()
            try {
                FileInputStream(afd.fileDescriptor).use { fis ->
                    val canale = fis.channel
                    canale.position(afd.startOffset + start)
                    val buf = ByteBuffer.allocate(effettivo)
                    while (buf.hasRemaining()) {
                        if (canale.read(buf) < 0) break
                    }
                    Base64.encodeToString(buf.array(), Base64.NO_WRAP)
                }
            } catch (e: Exception) {
                Log.e(TAG, "lettura asset fallita su $nome @$start+$effettivo", e)
                ""
            }
        }
    }

    companion object {
        const val TAG = "TileFiles"

        /** Un blocco piu' grande di cosi' non arriva mai da pmtiles.js. */
        const val MAX_CHUNK = 8 * 1024 * 1024
    }
}
