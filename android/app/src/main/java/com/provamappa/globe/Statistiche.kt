package com.provamappa.globe

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Quanti stati sovrani esistono, per la percentuale.
 *
 * 195 = i 193 membri dell'ONU piu' Santa Sede e Palestina, che e' il conteggio
 * usato di solito. **Non** i 242 dell'indice, che comprende dipendenze e
 * territori: dire "il 12% del mondo" contando le Isole Fær Øer accanto alla
 * Cina darebbe un numero senza significato.
 */
private const val STATI_SOVRANI = 195

data class Conteggi(
    val nazioniVisitate: Int,
    val nazioniInProgramma: Int,
    val regioniVisitate: Int,
    val regioniInProgramma: Int,
    val cittaVisitate: Int,
    val cittaInProgramma: Int,
)

/**
 * I contatori tengono nazioni, regioni e citta' **separate**: sommarle darebbe
 * un numero privo di significato (§8.1, note di realizzazione).
 */
fun conta(stato: Map<String, String>): Conteggi {
    var nv = 0; var np = 0; var rv = 0; var rp = 0; var cv = 0; var cp = 0
    for ((chiave, valore) in stato) {
        val tipo = chiave.substringBefore(':')
        when (tipo) {
            "countries" -> if (valore == "visited") nv++ else if (valore == "wanted") np++
            // le regioni da visitare si contavano gia' nel salvataggio ma non
            // comparivano: adesso hanno una riga come le altre, e da li' si apre
            // l'elenco
            "regions" -> if (valore == "visited") rv++ else if (valore == "wanted") rp++
            "places" -> if (valore == "visited") cv++ else if (valore == "wanted") cp++
        }
    }
    return Conteggi(nv, np, rv, rp, cv, cp)
}

/**
 * @param onApri quale elenco aprire: lo stato e il tipo della riga toccata.
 *   Un conteggio che non si puo' aprire e' un numero da prendere per buono, e
 *   "undici nazioni visitate" senza poter vedere **quali** era esattamente
 *   questo.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Statistiche(
    stato: Map<String, String>,
    onApri: (Stato, String) -> Unit,
    onChiudi: () -> Unit,
) {
    val c = conta(stato)
    val percentuale = c.nazioniVisitate.toFloat() / STATI_SOVRANI

    ModalBottomSheet(onDismissRequest = onChiudi, sheetState = rememberModalBottomSheetState()) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Dove sei stato", style = MaterialTheme.typography.headlineSmall)

            Column(
                Modifier.clickable { onApri(Stato.VISITATA, "countries") },
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    "%d nazioni su %d — %.1f%% del mondo".format(
                        c.nazioniVisitate, STATI_SOVRANI, percentuale * 100
                    ),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                LinearProgressIndicator(
                    progress = { percentuale.coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "su 195 stati sovrani, non sulle 242 entità della mappa: " +
                        "dipendenze e territori falserebbero la percentuale",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Riga("Nazioni da visitare", c.nazioniInProgramma) {
                onApri(Stato.IN_PROGRAMMA, "countries")
            }
            Riga("Regioni visitate", c.regioniVisitate) { onApri(Stato.VISITATA, "regions") }
            Riga("Regioni da visitare", c.regioniInProgramma) {
                onApri(Stato.IN_PROGRAMMA, "regions")
            }
            Riga("Città visitate", c.cittaVisitate) { onApri(Stato.VISITATA, "places") }
            Riga("Città da visitare", c.cittaInProgramma) { onApri(Stato.IN_PROGRAMMA, "places") }
        }
    }
}

@Composable
private fun Riga(etichetta: String, valore: Int, onApri: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onApri),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Text(etichetta, style = MaterialTheme.typography.bodyLarge)
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text(
                "%,d".format(valore),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
            )
            // la freccia dice che la riga si apre: senza, un conteggio
            // cliccabile e uno che non lo e' hanno lo stesso aspetto
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
