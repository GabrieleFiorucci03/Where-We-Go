package com.provamappa.globe

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
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
    val cittaVisitate: Int,
    val cittaInProgramma: Int,
)

/**
 * I contatori tengono nazioni, regioni e citta' **separate**: sommarle darebbe
 * un numero privo di significato (§8.1, note di realizzazione).
 */
fun conta(stato: Map<String, String>): Conteggi {
    var nv = 0; var np = 0; var rv = 0; var cv = 0; var cp = 0
    for ((chiave, valore) in stato) {
        val tipo = chiave.substringBefore(':')
        when (tipo) {
            "countries" -> if (valore == "visited") nv++ else if (valore == "wanted") np++
            "regions" -> if (valore == "visited") rv++
            "places" -> if (valore == "visited") cv++ else if (valore == "wanted") cp++
        }
    }
    return Conteggi(nv, np, rv, cv, cp)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Statistiche(stato: Map<String, String>, onChiudi: () -> Unit) {
    val c = conta(stato)
    val percentuale = c.nazioniVisitate.toFloat() / STATI_SOVRANI

    ModalBottomSheet(onDismissRequest = onChiudi, sheetState = rememberModalBottomSheetState()) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Dove sei stato", style = MaterialTheme.typography.headlineSmall)

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
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

            Riga("Nazioni in programma", c.nazioniInProgramma)
            Riga("Regioni visitate", c.regioniVisitate)
            Riga("Città visitate", c.cittaVisitate)
            Riga("Città in programma", c.cittaInProgramma)
        }
    }
}

@Composable
private fun Riga(etichetta: String, valore: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(etichetta, style = MaterialTheme.typography.bodyLarge)
        Text(
            "%,d".format(valore),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
        )
    }
}
