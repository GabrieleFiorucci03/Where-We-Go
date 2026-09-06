package com.provamappa.globe

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.LayersClear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.decode.SvgDecoder
import coil.request.ImageRequest

/** I tre stati, con il nome che l'utente legge (§9.0). Le chiavi restano inglesi. */
enum class Stato(val chiave: String, val etichetta: String, val colore: Color) {
    NON_VISITATA("none", "Non visitata", Color(0xFFD33333)),
    // "Da visitare" e non "in programma" come in §9.0: sul pulsante dice cosa si
    // sta per fare invece di nominare uno stato, ed e' la coppia naturale di
    // "Visitata" accanto. La chiave salvata resta `wanted`, quindi i backup e i
    // dati di prima continuano a leggersi.
    IN_PROGRAMMA("wanted", "Da visitare", Color(0xFFF08A24)),
    VISITATA("visited", "Visitata", Color(0xFF2E9E4F));

    companion object {
        fun da(chiave: String) = entries.firstOrNull { it.chiave == chiave } ?: NON_VISITATA
    }
}

/**
 * Scheda che compare **in alto** quando si seleziona qualcosa sulla mappa.
 *
 * Sta in alto perche' il dito e la cosa toccata sono in basso: una scheda che
 * sale dal fondo coprirebbe proprio cio' che si e' appena selezionato (§9.2).
 *
 * Toccare la mappa **non cambia piu' nulla**: seleziona e basta, e la modifica
 * avviene qui con tre azioni esplicite. Prima un tocco faceva ruotare lo stato,
 * quindi non si poteva guardare una cosa senza modificarla e un tocco
 * accidentale alterava i dati.
 */
@Composable
fun SchedaSelezione(
    selezione: Selezione?,
    onImposta: (Stato) -> Unit,
    onRegioni: (Boolean) -> Unit,
    onApprofondisci: (Selezione) -> Unit,
    onChiudi: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = selezione != null,
        enter = slideInVertically { -it },
        exit = slideOutVertically { -it },
        modifier = modifier,
    ) {
        // durante l'animazione di uscita `selezione` e' gia' null: si tiene
        // l'ultimo valore per non far sfarfallare il testo mentre scorre via
        val s = selezione ?: ultimaSelezione ?: return@AnimatedVisibility
        ultimaSelezione = s

        Card(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        ) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Solo per le nazioni. Su una regione o una citta' quella
                    // del paese ripeterebbe cio' che la riga di gerarchia sotto
                    // gia' dice; e tre nazioni fra quelle nei dati — Somaliland,
                    // Cipro del Nord, Kashmir — non hanno una bandiera
                    // riconosciuta e arrivano con `iso2` vuoto. In entrambi i
                    // casi resta il solo nome, senza buchi nel layout.
                    if (s.tipo == "countries" && s.iso2.isNotEmpty()) {
                        Bandiera(s.iso2, Modifier.padding(end = 12.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            s.nome,
                            style = MaterialTheme.typography.titleLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (s.gerarchia.isNotEmpty()) {
                            Text(
                                s.gerarchia,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    IconButton(onClick = onChiudi) {
                        Icon(Icons.Filled.Close, contentDescription = "Chiudi")
                    }
                }

                val attuale = Stato.da(s.stato)
                Row(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for (stato in Stato.entries) {
                        FilterChip(
                            selected = stato == attuale,
                            onClick = { onImposta(stato) },
                            label = { Text(stato.etichetta, maxLines = 1) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = stato.colore,
                                selectedLabelColor = Color.White,
                            ),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                // Approfondisci: cerca immagini del luogo sul web (§9). E'
                // l'unica funzione dell'app che richiede la rete, e va detto —
                // tutto il resto funziona in aereo.
                TextButton(
                    onClick = { onApprofondisci(s) },
                    modifier = Modifier.padding(top = 4.dp),
                ) {
                    Icon(
                        Icons.Filled.Search,
                        contentDescription = null,
                        modifier = Modifier.padding(end = 8.dp),
                    )
                    Text("Guarda com'è — richiede la rete")
                }

                // Il dettaglio regionale si accendeva con una pressione
                // prolungata sulla nazione: un gesto che nessuno indovina, e che
                // nell'app non lasciava nemmeno un messaggio di conferma. Il
                // posto giusto e' qui, sulla nazione appena selezionata.
                if (s.numeroRegioni > 0) {
                    TextButton(
                        onClick = { onRegioni(!s.regioniAccese) },
                        modifier = Modifier.padding(top = 4.dp),
                    ) {
                        Icon(
                            if (s.regioniAccese) Icons.Filled.LayersClear else Icons.Filled.Layers,
                            contentDescription = null,
                            modifier = Modifier.padding(end = 8.dp),
                        )
                        Text(
                            if (s.regioniAccese) "Nascondi le ${s.numeroRegioni} regioni"
                            else "Mostra le ${s.numeroRegioni} regioni"
                        )
                    }
                }
            }
        }
    }
}

/**
 * La bandiera di una nazione, dagli stessi SVG che usa la mappa: negli asset
 * stanno in `flags/`, perche' l'intera cartella `web/` e' una sorgente di asset
 * (vedi build.gradle.kts). Nessun secondo insieme di immagini da tenere allineato.
 *
 * `ContentScale.Fit` dentro un riquadro fisso, e non una misura imposta: le
 * proporzioni delle bandiere non sono affatto costanti — la Svizzera e'
 * quadrata, il Nepal e' piu' alto che largo, gli Stati Uniti sono quasi 2:1 — e
 * una cornice unica le deformerebbe tutte tranne le 3:2. Cosi' ognuna entra con
 * le proprie, e la riga non cambia altezza a seconda del paese selezionato.
 *
 * Il bordo non e' decorazione: le bandiere che finiscono in bianco sul bordo —
 * Giappone, Finlandia, Israele — su una scheda bianca altrimenti si spezzano.
 */
@Composable
private fun Bandiera(iso2: String, modifier: Modifier = Modifier) {
    val angoli = RoundedCornerShape(3.dp)
    AsyncImage(
        model = ImageRequest.Builder(LocalContext.current)
            .data("file:///android_asset/flags/$iso2.svg")
            // Coil da solo non decodifica gli SVG: il decoder va chiesto qui,
            // sulla singola richiesta, invece di configurare un ImageLoader
            // globale che la galleria di Commons non usa.
            .decoderFactory(SvgDecoder.Factory())
            .build(),
        // decorativa: il nome accanto dice gia' di che paese si tratta, e
        // leggere "bandiera dell'Italia · Italia" sarebbe solo rumore
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier
            .size(width = 34.dp, height = 24.dp)
            .clip(angoli)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, angoli),
    )
}

/** Vedi il commento dentro [SchedaSelezione]: serve solo all'animazione d'uscita. */
private var ultimaSelezione: Selezione? = null
