package com.provamappa.globe

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Cataloghi delle suddivisioni: `assets/data/regions/<ISO3>.geojson`.
 * Contengono nomi, codici e centri Point; le sagome precise delle bandiere
 * stanno in file separati e non vengono analizzate per aprire un elenco.
 *
 * **Perche' non stanno in `citta.db`.** L'indice SQLite ha due tabelle, nazioni
 * e citta', e le regioni non ci sono mai entrate: la pipeline che lo costruisce
 * parte da GeoNames, dove le suddivisioni amministrative non compaiono. Aggiungercele
 * vorrebbe dire rigenerare un file da 57 MB per una manciata di nomi che
 * nell'APK ci sono gia', in chiaro, un file per nazione.
 *
 * Le chiamate restano fuori dal thread principale e la cache tiene il
 * risultato per nazione. centro() legge anche i vecchi cataloghi poligonali,
 * mantenendo la compatibilita' con il precedente formato dei dati.
 */
class IndiceRegioni(context: Context) {

    private val app = context.applicationContext
    private val cache = HashMap<String, List<Voce>>()

    /**
     * Le regioni di una nazione, per nome. Lista vuota se quella nazione non ne
     * ha — e' il caso normale per un centinaio di paesi, non un errore.
     */
    fun di(iso3: String): List<Voce> = synchronized(cache) {
        cache.getOrPut(iso3) { leggi(iso3) }
    }

    private fun leggi(iso3: String): List<Voce> {
        val t0 = System.currentTimeMillis()
        return try {
            val testo = app.assets.open("data/regions/$iso3.geojson")
                .bufferedReader().use { it.readText() }
            val feature = JSONObject(testo).getJSONArray("features")
            val out = ArrayList<Voce>(feature.length())
            for (i in 0 until feature.length()) {
                val f = feature.getJSONObject(i)
                val p = f.optJSONObject("properties") ?: continue
                val codice = p.optString("code")
                val nome = p.optString("name")
                if (codice.isEmpty() || nome.isEmpty()) continue
                val (lat, lon) = centro(f.optJSONObject("geometry"))
                out.add(Voce("regions", codice, nome, sotto = "regione", lat = lat, lon = lon))
            }
            Log.i(TAG, "$iso3: ${out.size} regioni in ${System.currentTimeMillis() - t0} ms")
            out.sortedBy { it.nome }
        } catch (e: Exception) {
            // Un paese senza suddivisioni non ha il file, e non e' un guasto:
            // `indiceRegioni` lato mappa dice quali ne hanno; l'assenza resta
            // quindi un caso previsto, non un errore di lettura.
            Log.i(TAG, "nessuna suddivisione per $iso3")
            emptyList()
        }
    }

    /**
     * Centro dell'ingombro, per inquadrare la regione arrivandoci da un elenco.
     *
     * L'ingombro e non il baricentro: quello vero costerebbe l'area con segno di
     * ogni anello, buchi compresi, e per una regione a ferro di cavallo
     * cadrebbe comunque fuori dalla terraferma. Per portare la mappa "li sopra"
     * il centro del rettangolo basta, e costa una passata sola sui vertici.
     */
    private fun centro(geometria: JSONObject?): Pair<Double, Double> {
        if (geometria == null) return 0.0 to 0.0
        var minLon = Double.MAX_VALUE
        var maxLon = -Double.MAX_VALUE
        var minLat = Double.MAX_VALUE
        var maxLat = -Double.MAX_VALUE

        // I `coordinates` sono annidati a profondita' diversa secondo il tipo —
        // due livelli per un Polygon, tre per un MultiPolygon — quindi si scende
        // finche' non si trova una coppia di numeri, invece di ramificare sul tipo.
        fun scorri(a: JSONArray) {
            if (a.length() >= 2 && a.opt(0) is Number && a.opt(1) is Number) {
                val lon = a.getDouble(0)
                val lat = a.getDouble(1)
                if (lon < minLon) minLon = lon
                if (lon > maxLon) maxLon = lon
                if (lat < minLat) minLat = lat
                if (lat > maxLat) maxLat = lat
                return
            }
            for (i in 0 until a.length()) {
                (a.opt(i) as? JSONArray)?.let { scorri(it) }
            }
        }

        geometria.optJSONArray("coordinates")?.let { scorri(it) }
        if (minLon > maxLon) return 0.0 to 0.0
        return (minLat + maxLat) / 2 to (minLon + maxLon) / 2
    }

    companion object {
        const val TAG = "IndiceRegioni"

        /** Il codice paese che precede lo slug: per esempio "ITA.toscana". */
        fun paeseDi(codiceRegione: String): String = codiceRegione.substringBefore('.')
    }
}

/**
 * Confronto tollerante agli accenti, per filtrare per nome.
 *
 * Senza, cercando "citta" non si trova "Città di Castello" e cercando "emilia"
 * si trova "Emilia-Romagna" solo se si indovina l'accento giusto — e i nomi
 * delle regioni possono essere pieni di segni che sulla tastiera non si battono di
 * getto. La forma NFD separa la lettera dal segno diacritico, e i segni si
 * buttano via: e' lo stesso `senzaAccenti` che la pipeline applica ai nomi
 * delle citta' quando costruisce l'indice.
 */
internal fun senzaAccenti(s: String): String =
    java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .lowercase()
