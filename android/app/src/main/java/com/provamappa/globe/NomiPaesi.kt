package com.provamappa.globe

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.util.Locale

/**
 * Il nome di un paese nella lingua del telefono.
 *
 * **Perche' serve.** Il nome del paese nei dati e' **cotto in italiano** in tre
 * posti diversi e generati da pipeline distinte: `countries.geojson`, il campo
 * `countryName` delle sagome regionali, e la tabella `nazione` di `citta.db`
 * (57 MB). Tradurli alla sorgente vorrebbe dire rigenerare 205 MB di dati per
 * cambiare 249 stringhe, e rifarlo a ogni lingua aggiunta. Qui invece c'e' una
 * tabellina di 11 KB — `assets/data/country-names.json`, prodotta da
 * `tools/nomi_paesi.js` da Natural Earth — che si sovrappone a cio' che i dati
 * dicono, senza toccarli.
 *
 * Il nome cotto resta la rete di sicurezza: se il file mancasse o un codice non
 * ci fosse, l'app mostra quello che ha sempre mostrato invece di un ISO3.
 *
 * **Citta' e regioni non passano di qui, ed e' voluto.** I nomi delle citta'
 * sono gia' nella forma internazionale di GeoNames (`Rome`, `Milan`), e quelli
 * delle suddivisioni sono endonimi (`Bayern`, non «Baviera» ne' «Bavaria»):
 * entrambi sono gia' neutri rispetto alla lingua, e tradurli sarebbe una perdita
 * di informazione, non un guadagno.
 */
object NomiPaesi {

    private const val TAG = "NomiPaesi"
    private const val FILE = "data/country-names.json"

    /** La lingua del default di `values/strings.xml`: l'ultimo ripiego. */
    private const val DEFAULT = "en"

    /** ISO3 -> (lingua -> nome). Letto una volta sola, e' di sola lettura. */
    @Volatile
    private var tabella: Map<String, Map<String, String>>? = null

    private fun tabella(context: Context): Map<String, Map<String, String>> {
        tabella?.let { return it }
        synchronized(this) {
            tabella?.let { return it }
            val letta = leggi(context)
            tabella = letta
            return letta
        }
    }

    private fun leggi(context: Context): Map<String, Map<String, String>> = try {
        val testo = context.applicationContext.assets.open(FILE)
            .bufferedReader().use { it.readText() }
        val nomi = JSONObject(testo).getJSONObject("nomi")
        val out = HashMap<String, Map<String, String>>(nomi.length())
        for (iso3 in nomi.keys()) {
            val perLingua = nomi.getJSONObject(iso3)
            val voce = HashMap<String, String>(perLingua.length())
            for (lingua in perLingua.keys()) voce[lingua] = perLingua.getString(lingua)
            out[iso3] = voce
        }
        Log.i(TAG, "nomi dei paesi: ${out.size} voci")
        out
    } catch (e: Exception) {
        // Non e' fatale: senza tabella ogni nome resta quello cotto nei dati.
        // Va detto nel log perche' il sintomo — un'app in inglese con i paesi in
        // italiano — altrimenti sembrerebbe una traduzione dimenticata.
        Log.e(TAG, "tabella dei nomi non leggibile: i paesi restano come nei dati", e)
        emptyMap()
    }

    /**
     * La lingua da usare adesso.
     *
     * `Locale.getDefault()` e non una preferenza nostra: cosi' segue sia la
     * lingua del telefono sia quella scelta nel selettore per-app di Android 13,
     * che e' esattamente il comportamento che `locales_config.xml` promette.
     * L'activity viene ricreata a ogni cambio — `locale` non e' fra i
     * `configChanges` del manifest — quindi il valore si rilegge da solo.
     */
    private fun lingua(): String = Locale.getDefault().language

    /**
     * Il nome del paese, o `null` se quel codice non e' in tabella.
     *
     * `null` e non il codice: chi chiama ha quasi sempre in mano un nome di
     * ripiego migliore — quello cotto nei dati — e restituire "ITA" glielo
     * farebbe scartare.
     */
    fun di(context: Context, iso3: String): String? {
        val voce = tabella(context)[iso3] ?: return null
        return voce[lingua()] ?: voce[DEFAULT]
    }

    /**
     * Tutte le forme conosciute di un nome, in ogni lingua della tabella.
     *
     * Serve alla **ricerca**, non a disegnare: chi cerca «Germania» su un
     * telefono inglese deve trovare Germany, e chi cerca «Germany» su un
     * telefono italiano deve trovare Germania. Una ricerca che funziona solo
     * nella lingua dell'interfaccia e' una ricerca che perde proprio l'utente
     * bilingue, cioe' quello piu' probabile per un'app di viaggi.
     */
    fun forme(context: Context, iso3: String): Collection<String> =
        tabella(context)[iso3]?.values ?: emptyList()
}
