package com.provamappa.globe

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** Una fotografia trovata attorno al posto. */
data class Foto(
    val titolo: String,
    val miniatura: String,
    val pagina: String,
    /** Distanza dal punto della citta'. Si scrive sotto la foto: vedi [GalleriaCommons]. */
    val metri: Int,
    val autore: String,
    val licenza: String,
)

/** Cosa e' successo cercando. */
sealed interface Esito {
    data class Trovate(val foto: List<Foto>) : Esito
    /** Nessuna foto, ma la ricerca e' andata a buon fine: e' il caso piu' frequente. */
    data object Vuoto : Esito
    data class Errore(val messaggio: String) : Esito
}

/**
 * Le foto di un posto da Wikimedia Commons (§9.6 del piano).
 *
 * **Perche' Commons e non un motore di ricerca:** e' l'unica fonte che rispetta
 * i vincoli di §0 — nessuna chiave, nessun account, nessun costo. Unsplash,
 * Flickr e la Custom Search di Google vogliono tutte una registrazione.
 *
 * **Solo per le citta'.** La ricerca e' `geosearch`, cioe' «le foto
 * geolocalizzate attorno a questo punto»: ha senso su un centro abitato, non su
 * una nazione, dove le foto vicine al centroide non c'entrano nulla col paese.
 * Per nazioni e regioni resta il Custom Tab.
 *
 * **La copertura e' geografica, ed e' molto disuguale** — misurato su 450 citta'
 * prese dall'indice prima di scrivere questo file:
 *
 * | | 0 foto entro 2 km | 0 foto entro 10 km |
 * |---|---|---|
 * | una citta' a caso dell'indice | 57% | 23% |
 * | Germania, Italia, Francia, Austria, USA | 5-30% | 0% |
 * | Messico (27% dell'indice), Cina, Peru' | 80-90% | 30-55% |
 *
 * Da qui due conseguenze scritte nel codice invece che sperate:
 *
 * 1. **una sola chiamata a 10 km, non due.** `geosearch` restituisce gia' in
 *    ordine di distanza, quindi chiedere il raggio largo e guardare i primi
 *    equivale a cercare prima vicino — con una richiesta invece di due;
 * 2. **la distanza si scrive sotto ogni foto.** A 10 km da un paesino la foto
 *    e' di un altro posto: mostrarla senza dirlo sarebbe una bugia, e il 10 km
 *    e' proprio cio' che fa scendere il «nessuna foto» dal 57% al 23%.
 */
object GalleriaCommons {

    private const val TAG = "GalleriaCommons"

    /**
     * Wikimedia **pretende uno User-Agent descrittivo**: con quello di default
     * di HttpURLConnection risponde 403. E' la causa numero uno per cui «l'API
     * gratuita non funziona».
     *
     * Non e' privato perche' la regola **non vale solo per l'API**: la vuole
     * anche `upload.wikimedia.org`, cioe' chi serve le miniature, e quelle non
     * le scarica questo file ma Coil. Con lo User-Agent di OkHttp — `okhttp/4.x`,
     * quello che Coil manda se non gli si dice altro — la risposta e' 403 e la
     * galleria si riempie di riquadri grigi: l'elenco arriva, i titoli e le
     * distanze si vedono, le fotografie no. Vedi `SchermataGalleria`.
     */
    const val UA = "WhereWeGo/0.6 (app personale, uso non commerciale)"

    /** Il massimo che `gsradius` accetta. Non c'e' una scelta da fare. */
    private const val RAGGIO = 10_000

    /**
     * Cinquanta, ed e' un tetto dell'API, non una preferenza.
     *
     * Chiedendone 60 la risposta torna **a meta'**: `imageinfo` ne elabora 50
     * per richiesta e `coordinates` appena 10, quindi arrivavano 60 titoli di
     * cui 10 completi, con un token di continuazione da seguire. In Roma
     * significava dieci foto invece di cinquanta, e senza alcun errore — solo
     * una galleria misteriosamente povera proprio dove Commons e' ricchissimo.
     *
     * A 50, con `colimit` alzato altrettanto, la risposta e' completa in una
     * chiamata sola: `batchcomplete` e nessun `continue`.
     */
    private const val QUANTE = 50

    /** Sotto questa distanza la foto e' del posto, non dei dintorni. */
    const val VICINA = 2_000

    /** Solo immagini raster: gli SVG di Commons sono stemmi, cartine e loghi. */
    private val RASTER = Regex("""\.(jpe?g|png|tiff?|webp)$""", RegexOption.IGNORE_CASE)

    /**
     * Cio' che non e' una fotografia del posto.
     *
     * E' la stessa esclusione che nella query web sta scritta `-map -flag`,
     * applicata qui ai titoli dei file.
     */
    private val NON_FOTO = Regex(
        """\b(map|mapa|carte|karte|mappa|flag|bandera|coat[_ ]of[_ ]arms|escudo|wappen|stemma|logo|seal|locator|blank|diagram|chart|plan)\b""",
        RegexOption.IGNORE_CASE,
    )

    /**
     * L'archivio orbitale, ed e' il filtro che conta di piu'.
     *
     * Commons ospita le fotografie degli astronauti, geotaggate sul punto della
     * Terra inquadrato: `ISS043-E-240293 - View of Earth.jpg`. Sono l'**11% di
     * tutti i risultati**, e nei paesi con poca copertura erano la maggioranza
     * di cio' che si trovava. Senza questo filtro la prima misura della
     * copertura dava 92% invece del 63% vero.
     */
    private val ORBITALE = Regex(
        """^(ISS|STS)[-\s]?\d|View of Earth|Sentinel-\d|Landsat|Copernicus Sentinel""",
        RegexOption.IGNORE_CASE,
    )

    suspend fun foto(lat: Double, lon: Double): Esito = withContext(Dispatchers.IO) {
        val url = indirizzo(lat, lon)
        try {
            val corpo = scarica(url)
            val radice = JSONObject(corpo)

            // La risposta incompleta non e' un errore per l'API: torna con i
            // dati a meta' e un token. Se ricompare, e' che qualcuno ha
            // rialzato [QUANTE] sopra il tetto — e il sintomo sarebbe una
            // galleria povera senza nessun messaggio.
            if (radice.has("continue")) {
                Log.w(TAG, "risposta troncata: ${radice.optJSONObject("continue")}")
            }

            // Un errore dell'API arriva con HTTP 200 e un campo `error`: senza
            // questo controllo una coordinata rifiutata o un parametro
            // sbagliato si sarebbero visti come «nessuna foto qui», mandando a
            // cercare il difetto dalla parte opposta.
            radice.optJSONObject("error")?.let { e ->
                Log.e(TAG, "l'API ha risposto con un errore: $e")
                return@withContext Esito.Errore("Wikimedia ha rifiutato la richiesta")
            }

            val pagine = radice.optJSONObject("query")?.optJSONArray("pages")
                ?: return@withContext Esito.Vuoto

            val trovate = ArrayList<Foto>(pagine.length())
            for (i in 0 until pagine.length()) {
                leggiFoto(pagine.getJSONObject(i), lat, lon)?.let { trovate += it }
            }
            trovate.sortBy { it.metri }

            Log.i(TAG, "$lat,$lon: ${trovate.size} foto utili su ${pagine.length()} risultati")
            if (trovate.isEmpty()) Esito.Vuoto else Esito.Trovate(trovate)
        } catch (e: java.net.UnknownHostException) {
            Log.w(TAG, "senza rete", e)
            Esito.Errore("Serve la rete per vedere le foto")
        } catch (e: Exception) {
            Log.e(TAG, "ricerca fallita", e)
            Esito.Errore("Non sono riuscito a caricare le foto")
        }
    }

    private fun indirizzo(lat: Double, lon: Double): String {
        val p = linkedMapOf(
            "action" to "query",
            "format" to "json",
            "formatversion" to "2",
            "generator" to "geosearch",
            // `Locale.ROOT` e sei decimali espliciti: con l'interpolazione
            // diretta una coordinata molto piccola esce in notazione
            // scientifica (`1.0E-4`), che l'API non accetta. Il punto decimale
            // va imposto — su un telefono italiano il separatore e' la virgola.
            "ggscoord" to String.format(java.util.Locale.ROOT, "%.6f|%.6f", lat, lon),
            "ggsradius" to RAGGIO.toString(),
            "ggslimit" to QUANTE.toString(),
            // namespace 6 = File:
            "ggsnamespace" to "6",
            "prop" to "imageinfo|coordinates",
            // senza questo `coordinates` ne elabora dieci: vedi [QUANTE]
            "colimit" to QUANTE.toString(),
            "iiprop" to "url|extmetadata",
            // senza il filtro arrivano decine di campi per foto, quasi tutti inutili
            "iiextmetadatafilter" to "Artist|LicenseShortName",
            // 640 e non 480: i riquadri sono quadrati e la foto viene ritagliata
            // al centro, quindi di una miniatura panoramica 640x360 restano 360
            // pixel per un riquadro che su un telefono ne occupa oltre 500. A
            // 480 il ritaglio ne lasciava 270 e si vedeva la sgranatura.
            "iiurlwidth" to "640",
        )
        val query = p.entries.joinToString("&") { (k, v) ->
            "$k=${URLEncoder.encode(v, "UTF-8")}"
        }
        return "https://commons.wikimedia.org/w/api.php?$query"
    }

    private fun scarica(url: String): String {
        val c = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("User-Agent", UA)
            setRequestProperty("Accept", "application/json")
            connectTimeout = 10_000
            readTimeout = 15_000
        }
        try {
            if (c.responseCode != 200) throw IOException("HTTP ${c.responseCode}")
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally {
            c.disconnect()
        }
    }

    private fun leggiFoto(p: JSONObject, lat: Double, lon: Double): Foto? {
        val titolo = p.optString("title").removePrefix("File:")
        if (!RASTER.containsMatchIn(titolo)) return null
        if (NON_FOTO.containsMatchIn(titolo)) return null
        if (ORBITALE.containsMatchIn(titolo)) return null

        val info = p.optJSONArray("imageinfo")?.optJSONObject(0) ?: return null
        val miniatura = info.optString("thumburl").ifEmpty { return null }

        // Senza coordinate non si puo' scrivere la distanza, e una foto senza
        // distanza qui non ha modo di essere onesta: si scarta.
        val punto = p.optJSONArray("coordinates")?.optJSONObject(0) ?: return null
        val meta = info.optJSONObject("extmetadata")

        return Foto(
            titolo = titolo.substringBeforeLast('.').replace('_', ' '),
            miniatura = miniatura,
            pagina = info.optString("descriptionurl"),
            metri = distanza(lat, lon, punto.optDouble("lat"), punto.optDouble("lon")),
            autore = senzaTag(meta?.optJSONObject("Artist")?.optString("value") ?: ""),
            licenza = senzaTag(meta?.optJSONObject("LicenseShortName")?.optString("value") ?: ""),
        )
    }

    /**
     * `Artist` arriva come HTML — un `<a>` col nome dentro — perche' su Commons
     * l'autore e' un collegamento al suo profilo.
     *
     * Tolti i tag restano le entita': senza scioglierle un autore che si chiama
     * `D'Angelo` compare come `D&#039;Angelo` sotto la foto.
     */
    private fun senzaTag(html: String): String =
        html.replace(Regex("<[^>]*>"), "")
            .replace("&#039;", "'").replace("&#39;", "'").replace("&quot;", "\"")
            .replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">")
            // `&amp;` per ultimo, altrimenti riscrive le entita' gia' sciolte
            .replace("&amp;", "&")
            .trim()

    private fun distanza(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Int {
        val r = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2) * sin(dLon / 2)
        return (2 * r * asin(min(1.0, sqrt(a)))).roundToInt()
    }

    /** «a 350 m», «a 6,4 km»: come si scrive una distanza sotto una foto. */
    fun distanzaScritta(metri: Int): String =
        if (metri < 1000) "a $metri m" else "a %.1f km".format(metri / 1000.0)
}
