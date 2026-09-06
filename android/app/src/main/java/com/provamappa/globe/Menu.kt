package com.provamappa.globe

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Menu a scomparsa, dietro il pulsante in basso a destra.
 *
 * Non e' mai visibile mentre si guarda la mappa: sostituisce la barra laterale
 * fissa del prototipo web, che era un attrezzo da officina (§9.1).
 *
 * Le voci sono tutte collegate: elenchi e ricerca passano da [IndiceCitta] —
 * i tile non si possono interrogare, serviva l'indice SQLite di §9.5 — e se
 * quel database non si apre restano visibili ma spente, con scritto perche'.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Menu(
    indiceDisponibile: Boolean,
    /** Cosa dice l'indice di se stesso: vedi IndiceCitta.diagnostica(). */
    statoIndice: String,
    onElenchi: () -> Unit,
    onStatistiche: () -> Unit,
    onEsportaImmagine: () -> Unit,
    onSalvaBackup: () -> Unit,
    onRipristina: () -> Unit,
    onChiudi: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onChiudi,
        sheetState = rememberModalBottomSheetState(),
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 16.dp)) {
            ListItem(
                headlineContent = { Text("Cerca una città o una nazione") },
                supportingContent = {
                    // I numeri **veri**, contati all'apertura del menu. Erano
                    // scritti a mano — "Fra 440.273 città" — quindi comparivano
                    // identici anche con il database vuoto o non aperto, ed e'
                    // esattamente il caso in cui servirebbe accorgersene.
                    Text(statoIndice)
                },
                leadingContent = { Icon(Icons.Filled.Search, contentDescription = null) },
                modifier = Modifier.clickable(enabled = indiceDisponibile, onClick = onElenchi),
            )
            ListItem(
                headlineContent = { Text("Elenco delle nazioni") },
                supportingContent = {
                    Text(statoIndice)
                },
                leadingContent = { Icon(Icons.Filled.List, contentDescription = null) },
                modifier = Modifier.clickable(enabled = indiceDisponibile, onClick = onElenchi),
            )
            ListItem(
                headlineContent = { Text("Statistiche") },
                supportingContent = { Text("Quanto mondo hai visto") },
                leadingContent = { Icon(Icons.Filled.Info, contentDescription = null) },
                modifier = Modifier.clickable(onClick = onStatistiche),
            )
            ListItem(
                headlineContent = { Text("Salva l'immagine del globo") },
                supportingContent = { Text("Un PNG di come si vede adesso") },
                leadingContent = { Icon(Icons.Filled.Image, contentDescription = null) },
                modifier = Modifier.clickable(onClick = onEsportaImmagine),
            )
            HorizontalDivider()
            // Il backup sta nel menu principale e non sepolto in "impostazioni":
            // perdere anni di segnalibri e' il fallimento peggiore possibile per
            // un'app del genere (§8), quindi salvarli dev'essere facile da
            // trovare quanto guardarli.
            ListItem(
                headlineContent = { Text("Salva un backup") },
                supportingContent = { Text("Un file JSON, dove vuoi tu") },
                leadingContent = { Icon(Icons.Filled.Save, contentDescription = null) },
                modifier = Modifier.clickable(onClick = onSalvaBackup),
            )
            ListItem(
                headlineContent = { Text("Ripristina da un backup") },
                supportingContent = { Text("Sostituisce tutto ciò che hai segnato") },
                leadingContent = { Icon(Icons.Filled.Restore, contentDescription = null) },
                modifier = Modifier.clickable(onClick = onRipristina),
            )
        }
    }
}
