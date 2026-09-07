package com.provamappa.globe

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Informazioni, attribuzioni e licenze, raggiungibili dal fondo del menu. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchermataInformazioni(
    onApriUrl: (String) -> Unit,
    onChiudi: () -> Unit,
) {
    BackHandler(onBack = onChiudi)

    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding()) {
            TopAppBar(
                title = { Text("Informazioni e licenze") },
                navigationIcon = {
                    IconButton(onClick = onChiudi) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Indietro")
                    }
                },
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 28.dp),
            ) {
                item {
                    Text("WhereWeGo", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Un mappamondo offline per segnare paesi, regioni e città. " +
                            "Questa pagina raccoglie le attribuzioni richieste dalle fonti.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 6.dp, bottom = 16.dp),
                    )
                }

                item {
                    Sezione("Dati geografici") {
                        Testo(
                            "Suddivisioni regionali: geoBoundaries gbOpen (198 paesi o territori), " +
                                "con il livello scelto paese per paese. I dati sono stati semplificati, " +
                                "rinominati e trasformati in tile PMTiles. geoBoundaries richiede " +
                                "attribuzione; le fonti nazionali dichiarate nei metadati conservano " +
                                "la propria licenza: 82 dataset ODbL e 14 CC BY-SA."
                        )
                        Link("geoBoundaries — licenza e citazione", "https://www.geoboundaries.org/", onApriUrl)
                        Testo(
                            "Per ODbL e CC BY-SA la ridistribuzione commerciale è permessa, ma " +
                                "restano necessari attribuzione, collegamento alla licenza, indicazione " +
                                "delle modifiche e accesso a una copia o al metodo macchina-legibile " +
                                "del database derivato."
                        )
                        Link("Testo ODbL 1.0", "https://opendatacommons.org/licenses/odbl/1-0/", onApriUrl)
                        Link("Testo CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", onApriUrl)
                        Testo(
                            "L'accesso al database derivato è assolto pubblicando i dati che l'app " +
                                "usa: un file per paese, ciascuno con la propria fonte, la propria " +
                                "licenza, l'URL dell'originale e l'elenco delle modifiche. Gli script " +
                                "che li producono stanno nel repository."
                        )
                        Link(
                            "Dati derivati — archivio, manifest e SHA-256",
                            "https://github.com/GabrieleFiorucci03/Where-We-Go/releases/latest",
                            onApriUrl,
                        )
                        Testo("Confini nazionali di riferimento e 14 ripieghi regionali: Natural Earth, pubblico dominio. " +
                            "I contorni dei paesi con regioni disponibili sono ricavati dalla loro unione e mantengono la " +
                            "provenienza e la licenza della relativa fonte, indicate nel pacchetto dei dati derivati.")
                        Link("Natural Earth — termini d'uso", "https://www.naturalearthdata.com/about/terms-of-use/", onApriUrl)
                    }
                }

                item {
                    Sezione("Città e nomi") {
                        Testo(
                            "L'indice delle città deriva da GeoNames allCountries. È distribuito con " +
                                "licenza Creative Commons Attribution: l'attribuzione a GeoNames è " +
                                "conservata in questa pagina."
                        )
                        Link("GeoNames — condizioni e attribuzione", "https://www.geonames.org/export/", onApriUrl)
                    }
                }

                item {
                    Sezione("Librerie e risorse incluse") {
                        Testo("Il codice del progetto è MIT. Le risorse di terzi incluse sono:")
                        Elenco(
                            "MapLibre GL JS — BSD-3-Clause (MapLibre contributors e componenti indicati nel testo della licenza).",
                            "pmtiles.js — BSD-3-Clause (Protomaps; la specifica PMTiles è public domain/CC0 dove applicabile).",
                            "flag-icons — MIT, copyright Panayiotis Lipiridis.",
                            "Glifi Noto Sans — SIL Open Font License 1.1.",
                            "Compose, AndroidX, WebKit, Browser, Kotlin Coroutines e Coil — Apache License 2.0 o licenze dichiarate dai rispettivi artefatti.",
                        )
                        Testo(
                            "I testi completi delle licenze JavaScript, delle bandiere e dei font sono " +
                                "inclusi negli asset dell'app. Le attribuzioni dettagliate per ciascuna " +
                                "fonte regionale sono pubblicate nel repository del progetto."
                        )
                        Link("Repository e attribuzioni complete", "https://github.com/GabrieleFiorucci03/Where-We-Go", onApriUrl)
                        Link("MapLibre GL JS — licenza", "https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt", onApriUrl)
                        Link("Protomaps PMTiles — licenza", "https://github.com/protomaps/PMTiles/blob/main/LICENSE", onApriUrl)
                        Link("flag-icons — licenza", "https://github.com/lipis/flag-icons/blob/main/LICENSE", onApriUrl)
                        Link("Noto Sans — SIL OFL", "https://openfontlicense.org/", onApriUrl)
                    }
                }

                item {
                    Sezione("Fotografie") {
                        Testo(
                            "La galleria usa Wikimedia Commons solo quando l'utente la apre. Le foto " +
                                "non sono incluse nell'APK: per ogni risultato vengono mostrati autore e " +
                                "licenza, e il tocco apre la pagina originale su Commons. I requisiti " +
                                "possono variare da file a file."
                        )
                        Link("Commons — riutilizzare i contenuti", "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en", onApriUrl)
                    }
                }

                item {
                    Sezione("Privacy e rete") {
                        Testo(
                            "Paesi, regioni, città e preferenze restano sul dispositivo. L'app non " +
                                "richiede account, pubblicità o analisi. La rete viene usata solo per la " +
                                "galleria Wikimedia Commons e per il browser quando l'utente sceglie di " +
                                "aprire un approfondimento; Wikimedia riceve la richiesta HTTP e l'indirizzo " +
                                "IP secondo le proprie policy."
                        )
                        Link("Wikimedia — privacy policy", "https://foundation.wikimedia.org/wiki/Policy:Privacy_policy", onApriUrl)
                    }
                }

                item {
                    HorizontalDivider(Modifier.padding(top = 12.dp))
                    Text(
                        "Confini contesi: la mappa mostra quello che dichiara la fonte di ciascun " +
                            "paese, e le fonti non concordano fra loro. Dove si contraddicono — " +
                            "Kashmir, Crimea, Cipro, Taiwan, Palestina, Sahara occidentale — " +
                            "WhereWeGo non sceglie e non intende prendere posizione.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                    Text(
                        "Accuratezza: i dati geografici sono forniti così come disponibili dalle fonti; " +
                            "WhereWeGo non garantisce completezza o precisione dei confini.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun Sezione(titolo: String, contenuto: @Composable () -> Unit) {
    Text(titolo, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 18.dp, bottom = 8.dp))
    contenuto()
}

@Composable
private fun Testo(testo: String) {
    Text(testo, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 8.dp))
}

@Composable
private fun Elenco(vararg voci: String) {
    voci.forEach { voce ->
        Text("• $voce", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 4.dp, bottom = 5.dp))
    }
}

@Composable
private fun Link(titolo: String, url: String, onApri: (String) -> Unit) {
    TextButton(
        onClick = { onApri(url) },
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 0.dp, vertical = 2.dp),
    ) {
        Text(titolo, modifier = Modifier.weight(1f))
        Icon(Icons.Filled.OpenInNew, contentDescription = "Apri collegamento")
    }
}
