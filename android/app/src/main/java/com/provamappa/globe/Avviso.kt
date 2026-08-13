package com.provamappa.globe

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * Messaggio temporaneo in fondo allo schermo.
 *
 * Serve soprattutto al backup: chi ha appena salvato o ripristinato anni di
 * segnalibri deve **vedere** com'e' andata. Il testo del ripristino dice quante
 * nazioni, regioni e citta' sono entrate, non un generico "fatto": e' l'unico
 * modo per accorgersi subito di aver aperto il file sbagliato.
 */
@Composable
fun Avviso(testo: String, onFine: () -> Unit) {
    LaunchedEffect(testo) {
        delay(4000)
        onFine()
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        Snackbar(
            modifier = Modifier.padding(16.dp).navigationBarsPadding(),
            action = { },
        ) { Text(testo) }
    }
}
