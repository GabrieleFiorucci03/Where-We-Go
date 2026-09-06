package com.provamappa.globe

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Le tre famiglie di voci, con l'etichetta che si legge sul filtro. */
private enum class Tipo(val chiave: String, val etichetta: String) {
    NAZIONI("countries", "Nazioni"),
    REGIONI("regions", "Regioni"),
    CITTA("places", "Città"),
}

/**
 * L'elenco di cio' che l'utente ha marcato (§9.5), aperto dalle statistiche.
 *
 * Le statistiche dicevano **quanto** — undici nazioni visitate — senza dire
 * *quali*, e un conteggio che non si puo' aprire e' un numero da fidarsi e
 * basta. Qui le stesse righe diventano una porta.
 *
 * **Da dove vengono i nomi.** Il salvataggio conserva soltanto le chiavi:
 * `ITA`, `ITA.toscana`, `g:3173435`. I nomi stanno in tre posti diversi e si
 * uniscono qui — le nazioni e le citta' nell'indice SQLite, le regioni nei
 * GeoJSON degli asset (vedi [IndiceRegioni]). Una voce di cui non si trova il
 * nome non sparisce: si mostra la chiave, perche' una cosa marcata che non
 * compare nell'elenco sembrerebbe persa.
 *
 * Il filtro per nazione elenca **solo i paesi che compaiono davvero** in cio'
 * che si e' marcato: un elenco di 242 voci per sceglierne una fra le sei in cui
 * si e' stati sarebbe da scorrere invece che da usare.
 */
@Composable
fun SchermataMarcati(
    indice: IndiceCitta,
    regioni: IndiceRegioni,
    /** Lo specchio dello stato: "countries:ITA" -> "visited". */
    statoUtente: Map<String, String>,
    /** Lo stato da cui partire, scelto dalla riga delle statistiche che si e' toccata. */
    statoIniziale: Stato,
    tipoIniziale: String,
    onImposta: (Voce, Stato) -> Unit,
    onApri: (Voce) -> Unit,
    onChiudi: () -> Unit,
) {
    var stato by remember { mutableStateOf(statoIniziale) }
    var tipo by remember {
        mutableStateOf(Tipo.entries.firstOrNull { it.chiave == tipoIniziale } ?: Tipo.NAZIONI)
    }
    /** ISO3 della nazione su cui si e' ristretto, o "" per tutte. */
    var nazione by remember { mutableStateOf("") }

    val righe = remember { mutableStateListOf<Voce>() }
    val paesi = remember { mutableStateListOf<Pair<String, String>>() } // ISO3 -> nome

    BackHandler { onChiudi() }

    // Ogni cambio di filtro rilegge: sono al massimo qualche migliaio di chiavi,
    // ma i nomi arrivano da SQLite e da GeoJSON, quindi mai sul thread
    // dell'interfaccia. Vale anche per le regioni, che la prima volta per una
    // nazione costano l'analisi del suo file.
    LaunchedEffect(stato, tipo, nazione, statoUtente) {
        val esito = withContext(Dispatchers.IO) {
            risolvi(indice, regioni, statoUtente, stato, tipo, nazione)
        }
        // Se la nazione su cui si era ristretto non compare fra quelle che hanno
        // qualcosa sotto il tipo appena scelto, il filtro si toglie da se'.
        // Altrimenti passando da "regioni dell'Italia" a "citta'", senza citta'
        // italiane marcate, si otterrebbe un elenco vuoto con selezionata una
        // linguetta che non puo' dare risultati.
        if (tipo != Tipo.NAZIONI && nazione.isNotEmpty() && esito.paesi.none { it.first == nazione }) {
            nazione = ""
            return@LaunchedEffect
        }
        righe.clear()
        righe += esito.voci
        paesi.clear()
        paesi += esito.paesi
    }

    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding()) {
            Row(
                Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onChiudi) {
                    Icon(Icons.Filled.Close, contentDescription = "Chiudi")
                }
                Text("Cosa hai segnato", style = MaterialTheme.typography.titleMedium)
            }

            // Stato e tipo: due file di filtri, sempre visibili. Sono le due
            // domande che si fanno insieme — "le città che voglio visitare" —
            // e nasconderne una dietro un menu obbligherebbe a due tocchi per
            // esprimerne una sola.
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (s in listOf(Stato.VISITATA, Stato.IN_PROGRAMMA)) {
                    FilterChip(
                        selected = s == stato,
                        onClick = { stato = s },
                        label = { Text(s.etichetta, maxLines = 1) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = s.colore,
                            selectedLabelColor = Color.White,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (t in Tipo.entries) {
                    FilterChip(
                        selected = t == tipo,
                        onClick = { tipo = t },
                        label = { Text(t.etichetta, maxLines = 1) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // Il filtro per nazione non ha senso sulle nazioni stesse, e con una
            // sola nazione in gioco non ha niente da scegliere.
            if (tipo != Tipo.NAZIONI && paesi.size > 1) {
                Row(
                    Modifier.fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(
                        selected = nazione.isEmpty(),
                        onClick = { nazione = "" },
                        label = { Text("Tutte") },
                    )
                    for ((codice, nome) in paesi) {
                        FilterChip(
                            selected = nazione == codice,
                            onClick = { nazione = codice },
                            label = { Text(nome, maxLines = 1) },
                        )
                    }
                }
            }

            if (righe.isEmpty()) {
                Text(
                    "Niente di segnato qui",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            }

            LazyColumn {
                items(righe, key = { it.tipo + it.codice }) { v ->
                    RigaVoce(
                        voce = v,
                        stato = Stato.da(statoUtente["${v.tipo}:${v.codice}"] ?: "none"),
                        onImposta = { onImposta(v, it) },
                        onApri = { onApri(v) },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

/**
 * Le voci da mostrare e i paesi fra cui si puo' scegliere, calcolati insieme.
 *
 * `Elenco` e non `Esito`: quel nome e' gia' preso da GalleriaCommons, nello
 * stesso pacchetto.
 */
private class Elenco(val voci: List<Voce>, val paesi: List<Pair<String, String>>)

/**
 * Dalle chiavi salvate alle righe con un nome.
 *
 * I paesi del filtro si ricavano **prima** di applicare il filtro stesso,
 * altrimenti scegliendo l'Italia sparirebbero tutte le altre dalla barra e non
 * si potrebbe piu' cambiare idea.
 */
private fun risolvi(
    indice: IndiceCitta,
    regioni: IndiceRegioni,
    statoUtente: Map<String, String>,
    stato: Stato,
    tipo: Tipo,
    nazione: String,
): Elenco {
    // le nazioni servono sempre: danno i nomi del filtro, e la corrispondenza
    // ISO2 -> ISO3 senza la quale una citta' non si sa attribuire a un paese
    val nazioni = indice.nazioni()
    val perIso3 = nazioni.associateBy { it.codice }
    val iso3diIso2 = nazioni.filter { it.iso2.isNotEmpty() }.associate { it.iso2 to it.codice }

    val chiavi = statoUtente.entries
        .filter { it.value == stato.chiave && it.key.startsWith("${tipo.chiave}:") }
        .map { it.key.removePrefix("${tipo.chiave}:") }

    val voci: List<Voce> = when (tipo) {
        Tipo.NAZIONI -> chiavi.map { c ->
            perIso3[c] ?: Voce("countries", c, c, "nazione")
        }

        Tipo.REGIONI -> chiavi.map { gid ->
            val iso3 = IndiceRegioni.paeseDi(gid)
            val trovata = regioni.di(iso3).firstOrNull { it.codice == gid }
            val paese = perIso3[iso3]?.nome ?: iso3
            // il sotto diventa il nome del paese: in un elenco che mescola le
            // regioni di piu' nazioni, "Lombardia" da sola non basta
            trovata?.copy(sotto = paese) ?: Voce("regions", gid, gid, paese)
        }

        Tipo.CITTA -> {
            // le chiavi sono `g:<geonameid>` dai tile e `n:<...>` dal GeoJSON di
            // ripiego: solo le prime esistono nell'indice
            val id = chiavi.mapNotNull { it.removePrefix("g:").toLongOrNull() }
            val trovate = indice.cittaPerId(id).associateBy { it.codice }
            chiavi.map { c -> trovate["g:${c.removePrefix("g:")}"] ?: Voce("places", c, c, "") }
        }
    }

    val paeseDi: (Voce) -> String = { v ->
        when (v.tipo) {
            "regions" -> IndiceRegioni.paeseDi(v.codice)
            "places" -> iso3diIso2[v.iso2] ?: ""
            else -> v.codice
        }
    }

    val paesi = voci.map(paeseDi).filter { it.isNotEmpty() }.distinct()
        .map { it to (perIso3[it]?.nome ?: it) }
        .sortedBy { it.second }

    // Il filtro vale solo dove l'utente lo vede. Sulle nazioni le linguette sono
    // nascoste — filtrare le nazioni per nazione lascerebbe al massimo se stessa —
    // e applicarlo lo stesso significava un elenco vuoto per un filtro invisibile,
    // che non si poteva nemmeno togliere. Resta ricordato: tornando su regioni o
    // citta' le linguette ricompaiono, e con loro la scelta di prima.
    val filtrate =
        if (nazione.isEmpty() || tipo == Tipo.NAZIONI) voci
        else voci.filter { paeseDi(it) == nazione }
    return Elenco(filtrate.sortedBy { senzaAccenti(it.nome) }, paesi)
}
