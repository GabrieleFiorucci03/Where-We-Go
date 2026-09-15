package com.provamappa.globe

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp

/**
 * Informazioni, attribuzioni e licenze, raggiungibili dal fondo del menu.
 *
 * **Ogni testo di questa schermata sta nelle risorse**, non qui: sono gli
 * obblighi di attribuzione che le fonti impongono, e vanno letti nella lingua
 * di chi li legge. Le uniche stringhe rimaste nel codice sono gli URL, che non
 * si traducono, e che apposta non stanno in `strings.xml`: un indirizzo
 * duplicato per lingua e' un indirizzo che prima o poi diverge.
 */
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
                title = { Text(stringResource(R.string.about_title)) },
                navigationIcon = {
                    IconButton(onClick = onChiudi) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.action_back),
                        )
                    }
                },
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 28.dp),
            ) {
                item {
                    // Il nome dell'app non e' tradotto: e' un nome, non una frase.
                    Text(
                        stringResource(R.string.app_name),
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text(
                        stringResource(R.string.about_intro),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 6.dp, bottom = 16.dp),
                    )
                }

                item {
                    Sezione(R.string.about_geo_section) {
                        Testo(R.string.about_geo_boundaries)
                        Link(
                            R.string.about_geo_boundaries_link,
                            "https://www.geoboundaries.org/",
                            onApriUrl,
                        )
                        Testo(R.string.about_geo_share)
                        Link(
                            R.string.about_geo_odbl_link,
                            "https://opendatacommons.org/licenses/odbl/1-0/",
                            onApriUrl,
                        )
                        Link(
                            R.string.about_geo_ccbysa_link,
                            "https://creativecommons.org/licenses/by-sa/4.0/",
                            onApriUrl,
                        )
                        Testo(R.string.about_geo_derived)
                        Link(
                            R.string.about_geo_derived_link,
                            "https://github.com/GabrieleFiorucci03/Where-We-Go/releases/latest",
                            onApriUrl,
                        )
                        Testo(R.string.about_geo_naturalearth)
                        Link(
                            R.string.about_geo_naturalearth_link,
                            "https://www.naturalearthdata.com/about/terms-of-use/",
                            onApriUrl,
                        )
                    }
                }

                item {
                    Sezione(R.string.about_cities_section) {
                        Testo(R.string.about_cities)
                        Link(
                            R.string.about_cities_link,
                            "https://www.geonames.org/export/",
                            onApriUrl,
                        )
                    }
                }

                item {
                    Sezione(R.string.about_libs_section) {
                        Testo(R.string.about_libs_intro)
                        Elenco(
                            R.string.about_libs_maplibre,
                            R.string.about_libs_pmtiles,
                            R.string.about_libs_flags,
                            R.string.about_libs_noto,
                            R.string.about_libs_android,
                        )
                        Testo(R.string.about_libs_texts)
                        Link(
                            R.string.about_libs_repo_link,
                            "https://github.com/GabrieleFiorucci03/Where-We-Go",
                            onApriUrl,
                        )
                        Link(
                            R.string.about_libs_maplibre_link,
                            "https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt",
                            onApriUrl,
                        )
                        Link(
                            R.string.about_libs_pmtiles_link,
                            "https://github.com/protomaps/PMTiles/blob/main/LICENSE",
                            onApriUrl,
                        )
                        Link(
                            R.string.about_libs_flags_link,
                            "https://github.com/lipis/flag-icons/blob/main/LICENSE",
                            onApriUrl,
                        )
                        Link(R.string.about_libs_noto_link, "https://openfontlicense.org/", onApriUrl)
                    }
                }

                item {
                    Sezione(R.string.about_photos_section) {
                        Testo(R.string.about_photos)
                        Link(
                            R.string.about_photos_link,
                            "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en",
                            onApriUrl,
                        )
                    }
                }

                item {
                    Sezione(R.string.about_privacy_section) {
                        Testo(R.string.about_privacy)
                        Link(
                            R.string.about_privacy_link,
                            "https://foundation.wikimedia.org/wiki/Policy:Privacy_policy",
                            onApriUrl,
                        )
                    }
                }

                item {
                    HorizontalDivider(Modifier.padding(top = 12.dp))
                    Text(
                        stringResource(R.string.about_disputed),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                    Text(
                        stringResource(R.string.about_accuracy),
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
private fun Sezione(@StringRes titolo: Int, contenuto: @Composable () -> Unit) {
    Text(
        stringResource(titolo),
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.padding(top = 18.dp, bottom = 8.dp),
    )
    contenuto()
}

@Composable
private fun Testo(@StringRes testo: Int) {
    Text(
        stringResource(testo),
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

@Composable
private fun Elenco(@StringRes vararg voci: Int) {
    voci.forEach { voce ->
        Text(
            "• " + stringResource(voce),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(start = 4.dp, bottom = 5.dp),
        )
    }
}

@Composable
private fun Link(@StringRes titolo: Int, url: String, onApri: (String) -> Unit) {
    TextButton(
        onClick = { onApri(url) },
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 0.dp, vertical = 2.dp),
    ) {
        Text(stringResource(titolo), modifier = Modifier.weight(1f))
        Icon(Icons.Filled.OpenInNew, contentDescription = stringResource(R.string.action_open_link))
    }
}
