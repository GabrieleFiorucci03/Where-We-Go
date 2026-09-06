package com.provamappa.globe

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Quante righe si chiedono per volta: il Messico ne ha 118.418 (§9.3). */
private const val BLOCCO = 100

/**
 * Elenchi e ricerca (§9.3 e §9.4).
 *
 * Due livelli: le nazioni, e aprendone una le sue citta' per popolazione
 * decrescente. La ricerca in cima attraversa entrambi e non dipende da dove ci
 * si trova.
 *
 * Tutto viene da [IndiceCitta], non dai tile: quelli portano solo cio' che e'
 * inquadrato e non si possono interrogare.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchermataIndice(
    indice: IndiceCitta,
    statoDi: (String, String) -> String,
    onImposta: (Voce, Stato) -> Unit,
    onApri: (Voce) -> Unit,
    onChiudi: () -> Unit,
) {
    var testo by remember { mutableStateOf("") }
    var nazione by remember { mutableStateOf<Voce?>(null) }

    // Il tasto indietro faceva **uscire dall'app** invece di chiudere gli
    // elenchi: questa e' una schermata piena, non un `ModalBottomSheet` come i
    // pannelli del menu, e li' nessuno gestiva il gesto. Fa la stessa cosa del
    // pulsante in alto a sinistra — prima risale dalle citta' alla nazione, poi
    // chiude — perche' due comandi che stanno per la stessa cosa non possono
    // comportarsi in due modi.
    BackHandler {
        if (nazione != null) nazione = null else onChiudi()
    }

    val righe = remember { mutableStateListOf<Voce>() }
    var finito by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    // Le interrogazioni girano su un thread di I/O, non sul principale: sono
    // rapide (l'elenco del Messico, 118.418 righe, esce in un millisecondo
    // grazie all'indice su paese e popolazione) ma leggono da disco, e bloccare
    // il thread dell'interfaccia mentre si scorre si vede subito.
    LaunchedEffect(testo, nazione) {
        val nuove = withContext(Dispatchers.IO) {
            when {
                testo.isNotBlank() -> indice.cerca(testo)
                nazione != null -> indice.cittaDi(isoDi(nazione!!), 0, BLOCCO)
                else -> indice.nazioni()
            }
        }
        righe.clear()
        righe += nuove
        // ricerca ed elenco delle nazioni escono interi: solo le citta' di una
        // nazione arrivano a blocchi
        finito = testo.isNotBlank() || nazione == null
    }

    // caricamento a blocchi: si chiede il pezzo successivo quando la coda si
    // avvicina, non tutto insieme
    LaunchedEffect(nazione, testo) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { ultimo ->
                val n = nazione
                if (finito || testo.isNotBlank() || n == null) return@collect
                if (ultimo >= righe.size - 20) {
                    val altre = withContext(Dispatchers.IO) {
                        indice.cittaDi(isoDi(n), righe.size, BLOCCO)
                    }
                    if (altre.isEmpty()) finito = true else righe += altre
                }
            }
    }

    Surface(Modifier.fillMaxSize()) {
        // Stessa dimenticanza della galleria, e antecedente: con
        // `targetSdk = 35` il campo di ricerca finiva sotto l'orologio.
        Column(Modifier.safeDrawingPadding()) {
            Row(
                Modifier.fillMaxWidth().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = {
                    when {
                        nazione != null -> nazione = null
                        else -> onChiudi()
                    }
                }) {
                    Icon(
                        if (nazione != null) Icons.AutoMirrored.Filled.ArrowBack else Icons.Filled.Close,
                        contentDescription = if (nazione != null) "Indietro" else "Chiudi",
                    )
                }
                OutlinedTextField(
                    value = testo,
                    onValueChange = { testo = it },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    placeholder = {
                        Text(nazione?.let { "Cerca ovunque" } ?: "Cerca una città o una nazione")
                    },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    trailingIcon = {
                        if (testo.isNotEmpty()) {
                            IconButton(onClick = { testo = "" }) {
                                Icon(Icons.Filled.Close, contentDescription = "Pulisci")
                            }
                        }
                    },
                )
            }

            nazione?.takeIf { testo.isBlank() }?.let {
                Text(
                    it.nome,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(start = 16.dp, bottom = 8.dp),
                )
            }

            if (righe.isEmpty()) {
                Text(
                    if (testo.isNotBlank()) "Nessun risultato" else "Nessuna voce",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            }

            LazyColumn(state = listState) {
                items(righe, key = { it.tipo + it.codice }) { v ->
                    RigaVoce(
                        voce = v,
                        stato = Stato.da(statoDi(v.tipo, v.codice)),
                        onImposta = { onImposta(v, it) },
                        onApri = {
                            // una nazione si apre per vederne le citta'; una
                            // citta' si apre volandoci sopra sulla mappa
                            if (v.tipo == "countries") {
                                nazione = v
                                testo = ""
                            } else {
                                onApri(v)
                            }
                        },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

/** Le citta' sono indicizzate per ISO2, le nazioni hanno l'ISO3 come chiave. */
private fun isoDi(v: Voce): String = v.iso2
