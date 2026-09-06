package com.provamappa.globe

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.withContext
import androidx.webkit.WebViewAssetLoader

/**
 * Guscio nativo dell'app.
 *
 * La mappa vive nella WebView e occupa tutto lo schermo; l'interfaccia — scheda
 * di selezione, menu, in seguito elenchi e ricerca — e' Compose sopra di essa
 * (§1 e §9 del piano). Non ci sono pannelli fissi: lo schermo di un telefono e'
 * piccolo e il globo e' il contenuto, non un riquadro dentro una cornice.
 */
class MainActivity : ComponentActivity() {

    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val tileFiles = TileFiles(this)
        Log.i(TAG, "cartella dei tile: ${tileFiles.percorso}")
        Log.i(TAG, "archivi presenti: ${tileFiles.list()}")

        // I file locali sono serviti su un'origine https finta: su file://
        // ogni file e' un'origine diversa e i moduli ES vengono bloccati.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        WebView.setWebContentsDebuggingEnabled(true)

        val indice = IndiceCitta(this)
        // Le regioni non stanno nell'indice SQLite: si leggono dai GeoJSON degli
        // asset, una nazione alla volta e con la cache. Vedi IndiceRegioni.
        val regioni = IndiceRegioni(this)

        setContent {
            MaterialTheme {
                var selezione by remember { mutableStateOf<Selezione?>(null) }
                var menuAperto by remember { mutableStateOf(false) }
                var elenchiAperti by remember { mutableStateOf(false) }
                var statisticheAperte by remember { mutableStateOf(false) }
                // Quale elenco del marcato e' aperto, con la sua porta: una riga
                // delle statistiche.
                var marcati by remember { mutableStateOf<Pair<Stato, String>?>(null) }
                // la citta' di cui si stanno guardando le foto: e' una copia e
                // non un riferimento a `selezione`, cosi' chiudendo la galleria
                // la scheda sotto e' ancora quella di prima
                var galleria by remember { mutableStateOf<Selezione?>(null) }
                var statoUtente by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
                var avviso by remember { mutableStateOf<String?>(null) }
                // l'immagine catturata resta in attesa del selettore di file:
                // la cattura e' asincrona e arriva dal ponte, non da una chiamata
                var immagine by remember { mutableStateOf<String?>(null) }
                val contesto = LocalContext.current

                // I selettori di sistema: il file finisce dove decide l'utente —
                // Download, Drive, una chiavetta — e non in una cartella dell'app,
                // che sparirebbe con la disinstallazione.
                val salva = rememberLauncherForActivityResult(
                    ActivityResultContracts.CreateDocument("application/json")
                ) { uri ->
                    if (uri == null) return@rememberLauncherForActivityResult
                    esporta { json ->
                        avviso = if (Backup.scrivi(contesto, uri, json)) "Backup salvato"
                        else "Backup non riuscito"
                    }
                }
                val apri = rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument()
                ) { uri ->
                    if (uri == null) return@rememberLauncherForActivityResult
                    val json = Backup.leggi(contesto, uri)
                    if (json == null) {
                        avviso = "File non leggibile"
                        return@rememberLauncherForActivityResult
                    }
                    ripristina(json) { esito -> avviso = esito }
                }

                val salvaPng = rememberLauncherForActivityResult(
                    ActivityResultContracts.CreateDocument("image/png")
                ) { uri ->
                    val b64 = immagine
                    immagine = null
                    if (uri == null || b64.isNullOrEmpty()) return@rememberLauncherForActivityResult
                    avviso = if (Backup.scriviBinario(
                            contesto, uri, android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
                        )
                    ) "Immagine salvata" else "Immagine non salvata"
                }

                // appena l'immagine arriva dal ponte si apre il selettore: la
                // cattura e' asincrona, quindi non si puo' fare tutto d'un fiato
                LaunchedEffect(immagine) {
                    if (!immagine.isNullOrEmpty()) {
                        salvaPng.launch("wherewego-${System.currentTimeMillis() / 1000}.png")
                    }
                }

                Box(Modifier.fillMaxSize()) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { ctx ->
                            WebView(ctx).apply {
                                layoutParams = ViewGroup.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                )
                                settings.apply {
                                    javaScriptEnabled = true
                                    domStorageEnabled = true
                                    allowFileAccess = false
                                    allowContentAccess = false
                                    mediaPlaybackRequiresUserGesture = false
                                }
                                webViewClient = object : WebViewClient() {
                                    override fun shouldInterceptRequest(
                                        view: WebView,
                                        request: WebResourceRequest,
                                    ): WebResourceResponse? =
                                        assetLoader.shouldInterceptRequest(request.url)

                                    override fun onPageFinished(view: WebView, url: String) {
                                        Log.i(TAG, "pagina caricata: $url")
                                    }
                                }
                                // i messaggi della console finiscono in logcat: e' il
                                // modo per seguire la pagina senza guardare lo schermo
                                webChromeClient = object : WebChromeClient() {
                                    override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                                        Log.i(
                                            TAG_JS,
                                            "[${m.messageLevel()}] ${m.message()} (${m.sourceId()}:${m.lineNumber()})",
                                        )
                                        return true
                                    }
                                }
                                addJavascriptInterface(tileFiles, "AndroidTiles")
                                addJavascriptInterface(
                                    PonteUi(
                                        onSelezione = { selezione = it },
                                        onMappaPronta = { Log.i(TAG, "mappa pronta") },
                                        onStatoUtente = { statoUtente = it },
                                        onImmaginePronta = { b64 -> immagine = b64 },
                                    ),
                                    "AndroidUI",
                                )
                                loadUrl("https://appassets.androidplatform.net/assets/index.html")
                                webView = this
                            }
                        },
                    )

                    SchedaSelezione(
                        selezione = selezione,
                        onImposta = { stato ->
                            val s = selezione ?: return@SchedaSelezione
                            impostaStato(s.tipo, s.codice, stato.chiave)
                            selezione = s.copy(stato = stato.chiave)
                        },
                        onRegioni = { accendi ->
                            val s = selezione ?: return@SchedaSelezione
                            regioni(s.codice, accendi)
                            selezione = s.copy(regioniAccese = accendi)
                        },
                        // Le citta' hanno le coordinate e quindi una galleria;
                        // di una nazione le foto attorno al centroide non
                        // vorrebbero dire niente, e li' si va sul web (§9.6).
                        onApprofondisci = { s ->
                            if (s.haPosizione) galleria = s else approfondisci(contesto, s)
                        },
                        onChiudi = { selezione = null },
                        modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding(),
                    )

                    // Ricerca e menu, affiancati sulla mappa. La ricerca ha un
                    // pulsante suo perche' dentro il menu era sepolta sotto due
                    // tocchi e un'etichetta generica: §9.1 la voleva a portata
                    // di mano, ed e' la via piu' rapida per marcare un posto
                    // senza andarlo a cercare sul globo.
                    //
                    // `navigationBarsPadding` prima del padding: con targetSdk 35
                    // l'app disegna sotto le barre di sistema, e senza quella riga
                    // i due tasti finivano dietro la fascia dei comandi — indietro,
                    // home, recenti — sui telefoni che la tengono a pulsanti. E' la
                    // stessa cura gia' usata da Avviso, Menu e Statistiche: era
                    // questo l'unico punto in basso a restarne scoperto. Un numero
                    // fisso non andrebbe bene, perche' quella fascia e' alta il
                    // doppio a pulsanti rispetto a quando si naviga a gesti, e su
                    // chi non ce l'ha affatto sposterebbe i tasti per niente.
                    Row(
                        Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(20.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        FilledTonalIconButton(onClick = { elenchiAperti = true }) {
                            Icon(Icons.Filled.Search, contentDescription = "Cerca")
                        }
                        FilledTonalIconButton(onClick = { menuAperto = true }) {
                            Icon(Icons.Filled.Menu, contentDescription = "Menu")
                        }
                    }

                    if (menuAperto) {
                        // contato all'apertura e non a ogni ricomposizione: sono
                        // tre `count(*)`, rapidi ma pur sempre letture da disco
                        var statoIndice by remember { mutableStateOf("controllo l'indice…") }
                        LaunchedEffect(Unit) {
                            statoIndice = withContext(kotlinx.coroutines.Dispatchers.IO) {
                                indice.diagnostica()
                            }
                        }
                        Menu(
                            indiceDisponibile = indice.disponibile,
                            statoIndice = statoIndice,
                            onElenchi = {
                                menuAperto = false
                                elenchiAperti = true
                            },
                            onEsportaImmagine = {
                                menuAperto = false
                                catturaImmagine()
                            },
                            onStatistiche = {
                                menuAperto = false
                                statisticheAperte = true
                            },
                            onSalvaBackup = {
                                menuAperto = false
                                salva.launch(Backup.nomeSuggerito())
                            },
                            onRipristina = {
                                menuAperto = false
                                apri.launch(arrayOf("application/json", "text/plain", "*/*"))
                            },
                            onChiudi = { menuAperto = false },
                        )
                    }

                    if (statisticheAperte) {
                        Statistiche(
                            statoUtente,
                            onApri = { stato, tipo ->
                                statisticheAperte = false
                                marcati = stato to tipo
                            },
                            onChiudi = { statisticheAperte = false },
                        )
                    }

                    marcati?.let { (stato, tipo) ->
                        SchermataMarcati(
                            indice = indice,
                            regioni = regioni,
                            statoUtente = statoUtente,
                            statoIniziale = stato,
                            tipoIniziale = tipo,
                            onImposta = { voce, s ->
                                impostaStato(voce.tipo, voce.codice, s.chiave)
                            },
                            onApri = { voce ->
                                marcati = null
                                selezione = null
                                volaSu(voce)
                            },
                            onChiudi = { marcati = null },
                        )
                    }

                    avviso?.let { testo ->
                        Avviso(testo, onFine = { avviso = null })
                    }

                    galleria?.let { s ->
                        SchermataGalleria(
                            selezione = s,
                            onWeb = { approfondisci(contesto, s) },
                            onApriFoto = { f -> apriPagina(contesto, f.pagina) },
                            onChiudi = { galleria = null },
                        )
                    }

                    if (elenchiAperti) {
                        SchermataIndice(
                            indice = indice,
                            statoDi = { tipo, codice -> statoUtente["$tipo:$codice"] ?: "none" },
                            onImposta = { voce, stato ->
                                impostaStato(voce.tipo, voce.codice, stato.chiave)
                            },
                            onApri = { voce ->
                                // una citta' scelta dall'elenco: si chiude tutto e
                                // la mappa ci vola sopra
                                elenchiAperti = false
                                volaSu(voce.lat, voce.lon)
                            },
                            onChiudi = { elenchiAperti = false },
                        )
                    }
                }
            }
        }
    }

    /**
     * Applica lo stato passando dalla mappa.
     *
     * Per ora le sei regole di §8.1 vivono ancora nel JavaScript, che e' dove
     * sono state scritte e verificate: Kotlin gli dice cosa fare e lui applica
     * regole, colori e salvataggio. Il passaggio a Room, con le regole portate
     * qui, e' il pezzo successivo di M2 — farlo insieme all'interfaccia
     * avrebbe significato cambiare due cose alla volta.
     */
    private fun impostaStato(tipo: String, codice: String, stato: String) {
        val js = "window.impostaDaApp(${cita(tipo)}, ${cita(codice)}, ${cita(stato)})"
        webView?.evaluateJavascript(js, null)
    }

    /**
     * Chiede alla pagina tutto lo stato, per il backup.
     *
     * `evaluateJavascript` restituisce il risultato **gia' codificato come
     * JSON**, quindi una stringa torna fra virgolette e con gli escape: va
     * decodificata, altrimenti il file salvato conterrebbe un JSON dentro una
     * stringa invece del JSON vero.
     */
    private fun esporta(poi: (String) -> Unit) {
        webView?.evaluateJavascript("window.statoDaApp()") { risultato ->
            poi(org.json.JSONTokener(risultato ?: "\"\"").nextValue() as? String ?: "")
        }
    }

    private fun ripristina(json: String, poi: (String) -> Unit) {
        val arg = org.json.JSONObject.quote(json)
        webView?.evaluateJavascript("window.ripristinaDaApp($arg)") { risultato ->
            val testo = org.json.JSONTokener(risultato ?: "\"\"").nextValue() as? String
            val esito = runCatching { org.json.JSONObject(testo ?: "") }.getOrNull()
            poi(
                if (esito?.optBoolean("ok") == true) {
                    val base = "Ripristinati ${esito.optInt("nazioni")} nazioni, " +
                        "${esito.optInt("regioni")} regioni, ${esito.optInt("citta")} città"
                    val rimappate = esito.optInt("regioniRimappate")
                    val scartate = esito.optInt("regioniScartate")
                    if (rimappate > 0 || scartate > 0) {
                        "$base ($rimappate regioni convertite, $scartate senza equivalenza)"
                    } else base
                } else {
                    "Ripristino non riuscito: ${esito?.optString("errore") ?: "file non valido"}"
                }
            )
        }
    }

    /**
     * Apre una ricerca immagini del luogo selezionato.
     *
     * Chrome Custom Tab e non un browser esterno: si resta dentro l'app e si
     * torna indietro con un gesto. Nessuna chiave API, nessun costo — ma e'
     * **l'unica funzione che richiede la rete**, ed e' scritto sul pulsante:
     * tutto il resto dell'app funziona in aereo.
     */
    private fun approfondisci(contesto: android.content.Context, s: Selezione) {
        // `ricerca` e non `gerarchia`: quella e' la riga da leggere sulla scheda
        // e per le citta' contiene la popolazione, che nella query annegava il
        // nome del posto fra cifre e sigle
        val cosa = s.ricerca.ifBlank { s.nome }
        apriPagina(contesto, "https://www.google.com/search?tbm=isch&q=" + android.net.Uri.encode(cosa))
    }

    /**
     * Apre un indirizzo in Chrome Custom Tab.
     *
     * Serve in due punti — la ricerca sul web e la pagina di una foto su
     * Commons, che si apre per vederne originale, autore e licenza — quindi sta
     * qui invece che essere copiata due volte.
     */
    private fun apriPagina(contesto: android.content.Context, url: String) {
        if (url.isBlank()) return
        try {
            androidx.browser.customtabs.CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
                .launchUrl(contesto, android.net.Uri.parse(url))
        } catch (e: Exception) {
            Log.e(TAG, "impossibile aprire $url", e)
        }
    }

    /**
     * Chiede alla pagina il globo come PNG (§10).
     *
     * Il risultato non torna da qui ma dal ponte, in `onImmagine`: la cattura
     * deve aspettare il fotogramma successivo, e un PNG a schermo intero
     * supererebbe comunque il limite pratico dei valori restituiti da
     * `evaluateJavascript`.
     */
    private fun catturaImmagine() {
        webView?.evaluateJavascript(
            "window.immagineDaApp().then(b => window.AndroidUI.onImmagine(b))", null
        )
    }

    private fun volaSu(lat: Double, lon: Double, zoom: Double = 9.0) {
        webView?.evaluateJavascript("window.volaDaApp($lat, $lon, $zoom)", null)
    }

    /**
     * Porta la mappa su una voce di elenco, se sa dove si trova.
     *
     * Le nazioni **non** lo sanno: nell'indice non hanno coordinate, e volare a
     * (0, 0) porterebbe nel Golfo di Guinea. Li' il tocco non fa niente, che e'
     * meglio di un salto in mezzo all'oceano.
     *
     * Lo zoom cambia con cio' che si apre: una citta' si vuole vedere da vicino,
     * una regione va inquadrata intera, e sono due distanze diverse.
     */
    private fun volaSu(voce: Voce) {
        if (voce.lat == 0.0 && voce.lon == 0.0) return
        volaSu(voce.lat, voce.lon, if (voce.tipo == "regions") 5.5 else 9.0)
    }

    private fun regioni(codice: String, accendi: Boolean) {
        webView?.evaluateJavascript("window.regioniDaApp(${cita(codice)}, $accendi)", null)
    }

    /** I codici arrivano dai dati, non da noi: vanno passati come stringhe JSON. */
    private fun cita(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    companion object {
        const val TAG = "Mappamondo"
        const val TAG_JS = "MappamondoJS"
    }
}
