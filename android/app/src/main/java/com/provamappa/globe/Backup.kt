package com.provamappa.globe

import android.content.Context
import android.net.Uri
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Backup e ripristino dei segnalibri.
 *
 * Il piano non usa mezzi termini (§8): *perdere anni di segnalibri e' il
 * fallimento peggiore possibile per un'app del genere*. Per questo il backup
 * arriva prima delle statistiche, che i dati li mostrano soltanto, e prima del
 * cambio di package di M7, che se fatto senza un salvataggio in mano li lascia
 * dentro un'app che non si aggiorna piu'.
 *
 * Il file e' JSON e lo sceglie l'utente con il selettore di sistema: finisce
 * dove vuole lui — Download, Drive, una chiavetta — e non in una cartella
 * dell'app, che sparisce con la disinstallazione.
 */
object Backup {

    fun nomeSuggerito(): String {
        val quando = SimpleDateFormat("yyyyMMdd-HHmm", Locale.ITALY).format(Date())
        return "wherewego-$quando.json"
    }

    fun scrivi(context: Context, uri: Uri, contenuto: String): Boolean = try {
        context.contentResolver.openOutputStream(uri)?.use { out ->
            out.write(contenuto.toByteArray(Charsets.UTF_8))
        } ?: throw IllegalStateException("flusso di scrittura non disponibile")
        Log.i(TAG, "backup scritto: ${contenuto.length} caratteri")
        true
    } catch (e: Exception) {
        Log.e(TAG, "backup non scritto", e)
        false
    }

    fun scriviBinario(context: Context, uri: Uri, dati: ByteArray): Boolean = try {
        context.contentResolver.openOutputStream(uri)?.use { it.write(dati) }
            ?: throw IllegalStateException("flusso di scrittura non disponibile")
        Log.i(TAG, "immagine scritta: ${dati.size / 1024} KB")
        true
    } catch (e: Exception) {
        Log.e(TAG, "immagine non scritta", e)
        false
    }

    fun leggi(context: Context, uri: Uri): String? = try {
        context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
    } catch (e: Exception) {
        Log.e(TAG, "backup non letto", e)
        null
    }

    const val TAG = "Backup"
}
