package com.provamappa.globe

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/**
 * Cosa l'utente ha selezionato sulla mappa.
 *
 * `stato` porta la chiave salvata — `visited` / `wanted` / `none` — non la sua
 * traduzione: l'italiano vive solo dove si disegna (§9.0 del piano).
 */
data class Selezione(
    val tipo: String,      // "countries" | "regions" | "places"
    val codice: String,
    val nome: String,
    val gerarchia: String, // "Lombardia · Italia", gia' composta dal JS
    val stato: String,
    /** Quante suddivisioni ha la nazione; 0 se non ne ha o se non e' una nazione. */
    val numeroRegioni: Int = 0,
    /** Se il dettaglio regionale di questa nazione e' acceso. */
    val regioniAccese: Boolean = false,
    /**
     * Cosa scrivere nel motore di ricerca per «Guarda com'e'»: "Milano Italia".
     *
     * Campo a se' e non [gerarchia], che e' una riga da **leggere** e per le
     * citta' porta la popolazione: usarla come query mandava a cercare
     * `Milan 1.378.689 abitanti · IT`, dove il nome del posto si perde fra
     * cifre e sigle. Se il JavaScript non lo manda si ricade su [nome], che
     * male non fa.
     */
    val ricerca: String = "",
    /**
     * Dove sta il posto, per la galleria di Commons (§9.6).
     *
     * **Valorizzate solo per le citta'.** Di una nazione il centroide non
     * significa niente — le foto attorno al centro geometrico dell'Italia non
     * sono «l'Italia» — quindi per nazioni e regioni restano a zero e
     * l'approfondimento resta quello sul web.
     */
    val lat: Double = 0.0,
    val lon: Double = 0.0,
) {
    /** Una citta' con coordinate vere: l'unico caso in cui la galleria ha senso. */
    val haPosizione: Boolean get() = tipo == "places" && (lat != 0.0 || lon != 0.0)
}

/**
 * Ponte fra la mappa e l'interfaccia nativa.
 *
 * Separato da [TileFiles] apposta: quello serve byte, questo serve eventi
 * d'interfaccia. Tenerli distinti evita che la superficie esposta a JavaScript
 * diventi un raccoglitore di tutto.
 *
 * **I metodi arrivano su un thread di WebView**, non sul principale: ogni
 * aggiornamento di stato va rimandato al Looper principale, altrimenti Compose
 * ricompone da un thread sbagliato e il difetto si manifesta a intermittenza.
 */
class PonteUi(
    private val onSelezione: (Selezione?) -> Unit,
    private val onMappaPronta: () -> Unit,
    private val onStatoUtente: (Map<String, String>) -> Unit,
    private val onImmaginePronta: (String) -> Unit,
) {
    private val principale = Handler(Looper.getMainLooper())

    /**
     * Copia dello stato dell'utente, per gli elenchi nativi.
     *
     * Gli elenchi devono mostrare cosa e' gia' marcato, ma non possono leggere
     * il `localStorage` della pagina. Finche' la verita' sta nel JavaScript,
     * questa e' una copia di sola lettura che arriva dopo ogni modifica —
     * comprese quelle indirette, per esempio una nazione che cambia perche' e'
     * cambiata una sua regione (Regola 2 di §8.1).
     *
     * Quando lo stato passera' a Room la copia sparisce e resta una fonte sola.
     */
    @JavascriptInterface
    fun onStato(json: String) {
        val mappa = HashMap<String, String>()
        try {
            val root = org.json.JSONObject(json)
            for (tipo in listOf("countries", "regions", "places")) {
                val sezione = root.optJSONObject(tipo) ?: continue
                for (k in sezione.keys()) mappa["$tipo:$k"] = sezione.getString(k)
            }
        } catch (e: Exception) {
            android.util.Log.e("PonteUi", "stato illeggibile", e)
            return
        }
        principale.post { onStatoUtente(mappa) }
    }

    @JavascriptInterface
    fun onFeatureTap(
        tipo: String,
        codice: String,
        nome: String,
        gerarchia: String,
        stato: String,
        numeroRegioni: Int,
        regioniAccese: Boolean,
        ricerca: String,
        lat: Double,
        lon: Double,
    ) {
        principale.post {
            onSelezione(
                Selezione(
                    tipo, codice, nome, gerarchia, stato, numeroRegioni, regioniAccese, ricerca,
                    lat, lon
                )
            )
        }
    }

    /** La mappa segnala che si e' toccato il vuoto: la scheda si chiude. */
    @JavascriptInterface
    fun onDeselect() {
        principale.post { onSelezione(null) }
    }

    @JavascriptInterface
    fun onMapReady() {
        principale.post { onMappaPronta() }
    }

    /**
     * L'immagine del globo, in base64.
     *
     * Arriva da qui e non dal valore di ritorno di `evaluateJavascript` perche'
     * la cattura e' asincrona — bisogna aspettare il fotogramma successivo — e
     * perche' un PNG a schermo intero supera facilmente il limite pratico dei
     * valori restituiti da quella chiamata.
     */
    @JavascriptInterface
    fun onImmagine(base64: String) {
        principale.post { onImmaginePronta(base64) }
    }
}
