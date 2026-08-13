package com.provamappa.globe

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest

/**
 * «Guarda com'e'» dentro l'app: le foto del posto da Wikimedia Commons (§9.6).
 *
 * Due cose la governano, e vengono entrambe dalla misura di copertura fatta
 * prima di scriverla (vedi [GalleriaCommons]):
 *
 * - **la distanza sta sotto ogni foto.** Per piu' di meta' delle citta'
 *   dell'indice non c'e' niente entro 2 km, e cio' che salva il risultato sono
 *   le foto dei dintorni. Mostrarle come se fossero del posto sarebbe una
 *   bugia, quindi si dicono per quello che sono, e stanno in una sezione a
 *   parte sotto le vicine.
 * - **il pulsante per il web non e' un ripiego.** Per la maggioranza delle
 *   citta' — Messico, Cina, Peru' — sara' l'unica strada che porta a qualcosa,
 *   quindi e' sempre in fondo allo schermo, non nascosto in un caso d'errore.
 */
@Composable
fun SchermataGalleria(
    selezione: Selezione,
    onWeb: () -> Unit,
    onApriFoto: (Foto) -> Unit,
    onChiudi: () -> Unit,
) {
    // Senza questo il tasto indietro non chiude la galleria: **esce dall'app**.
    // I pannelli del menu sono `ModalBottomSheet` e se ne occupano da soli, una
    // schermata piena no. E' proprio guardando delle foto che il gesto viene
    // spontaneo.
    BackHandler(onBack = onChiudi)

    var esito by remember(selezione.codice) { mutableStateOf<Esito?>(null) }

    LaunchedEffect(selezione.codice) {
        esito = GalleriaCommons.foto(selezione.lat, selezione.lon)
    }

    Surface(Modifier.fillMaxSize()) {
        // `safeDrawingPadding` e non niente: con `targetSdk = 35` Android 15
        // disegna da bordo a bordo, quindi senza questo il titolo finisce
        // sotto l'orologio e il pulsante sotto la barra dei gesti. La scheda
        // di selezione e i pannelli del menu lo fanno gia', ciascuno a modo
        // suo (`statusBarsPadding`, `navigationBarsPadding`); qui servono
        // entrambi i lati.
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            Row(
                Modifier.fillMaxWidth().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onChiudi) {
                    Icon(Icons.Filled.Close, contentDescription = "Chiudi")
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        selezione.nome,
                        style = MaterialTheme.typography.titleLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (selezione.gerarchia.isNotEmpty()) {
                        Text(
                            selezione.gerarchia,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (val e = esito) {
                    null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                    is Esito.Trovate -> Griglia(e.foto, onApriFoto)
                    Esito.Vuoto -> Spiegazione(
                        "Nessuna foto qui",
                        "Wikimedia Commons non ha fotografie geolocalizzate entro 10 km da " +
                            "${selezione.nome}. Non vuol dire che non ci sia niente da vedere: " +
                            "la copertura di Commons è ottima in Europa e negli Stati Uniti, " +
                            "molto scarsa altrove.",
                    )
                    is Esito.Errore -> Spiegazione("Non ha funzionato", e.messaggio)
                }
            }

            HorizontalDivider()
            FilledTonalButton(
                onClick = onWeb,
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            ) {
                Icon(Icons.Filled.Search, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
                Text("Cerca sul web — apre il browser")
            }
        }
    }
}

@Composable
private fun Griglia(foto: List<Foto>, onApri: (Foto) -> Unit) {
    val vicine = foto.filter { it.metri <= GalleriaCommons.VICINA }
    val dintorni = foto.filter { it.metri > GalleriaCommons.VICINA }

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(vicine, key = { it.miniatura }) { f -> Riquadro(f, onApri) }

        // L'intestazione compare solo se c'e' qualcosa sopra da distinguere:
        // quando entro 2 km non c'e' niente — piu' di meta' delle volte — non
        // ha senso annunciare «nei dintorni» a uno schermo che comincia li'.
        if (dintorni.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    if (vicine.isEmpty()) "Solo nei dintorni" else "Nei dintorni",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            items(dintorni, key = { it.miniatura }) { f -> Riquadro(f, onApri) }
        }
    }
}

@Composable
private fun Riquadro(f: Foto, onApri: (Foto) -> Unit) {
    val contesto = LocalContext.current
    Column(Modifier.clickable { onApri(f) }) {
        AsyncImage(
            // Non basta passare l'indirizzo: **anche le miniature vogliono lo
            // User-Agent descrittivo** di [GalleriaCommons.UA]. Coil scarica con
            // OkHttp, che si presenta come `okhttp/4.x`, e a quello
            // `upload.wikimedia.org` risponde 403 — quindi si vedevano i
            // riquadri con titolo, distanza e credito, e dentro il grigio dello
            // sfondo. Il difetto non ha modo di annunciarsi: la ricerca e'
            // andata bene, sono le foto a non arrivare.
            model = ImageRequest.Builder(contesto)
                .data(f.miniatura)
                .setHeader("User-Agent", GalleriaCommons.UA)
                .crossfade(true)
                .build(),
            contentDescription = f.titolo,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
        Text(
            GalleriaCommons.distanzaScritta(f.metri),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(
            f.titolo,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        // Autore e licenza: su Commons sono in gran parte CC BY o BY-SA, che
        // l'attribuzione la chiedono. Costa una riga ed e' la cosa giusta —
        // lo stesso punto che §7.3 aveva segnato come critico per gli stemmi.
        val credito = listOf(f.autore, f.licenza).filter { it.isNotEmpty() }.joinToString(" · ")
        if (credito.isNotEmpty()) {
            Text(
                credito,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun Spiegazione(titolo: String, testo: String) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(titolo, style = MaterialTheme.typography.titleMedium)
        Text(
            testo,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}
