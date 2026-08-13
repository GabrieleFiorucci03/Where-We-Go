# Crediti e licenze delle fonti

Questo progetto usa dati e librerie di altri. Qui c'è chi sono, con quale licenza
si usano e — dove serve — cosa comporta per chi vuole ridistribuirli.

## Dati

### GADM 4.1 — suddivisioni amministrative (le regioni)

<https://gadm.org>

**Non ridistribuibili.** La licenza di GADM consente l'uso accademico e personale
ma vieta esplicitamente la ridistribuzione e l'uso commerciale senza permesso.

È il motivo per cui in questo repository **non ci sono dati**: `web/data/` e
`data_raw/` sono esclusi dal versionamento. Gli script in `tools/` li ricostruiscono
scaricando GADM dal sito ufficiale, così ogni copia dei dati nasce sotto la
licenza accettata da chi la scarica.

Se un giorno servisse distribuire l'app con i dati dentro, le regioni vanno
sostituite con una fonte permissiva (Natural Earth admin-1, oppure OpenStreetMap
sotto ODbL). Il piano lo prevede: gli stati vengono già da Natural Earth proprio
per non estendere la dipendenza da GADM (vedi `docs/PIANO.md` §2).

### GeoNames — le città

<https://www.geonames.org> — licenza **CC BY 4.0**

I 450.848 punti città e i loro nomi alternativi vengono da `allCountries.txt`.
La licenza consente la ridistribuzione **con attribuzione**: chi pubblica i dati
derivati (i tile `cities.pmtiles`, l'indice `citta.db`) deve citare GeoNames.

### Natural Earth — i confini nazionali

<https://www.naturalearthdata.com> — **pubblico dominio**

Nessun vincolo.

### Wikimedia Commons — le fotografie della galleria

<https://commons.wikimedia.org> — licenze **miste**, per singola immagine

Non sono ridistribuite: l'app le scarica a richiesta e mostra sotto ognuna
autore e licenza, che è ciò che CC BY e CC BY-SA chiedono. L'accesso all'API
richiede uno User-Agent descrittivo (vedi `GalleriaCommons.kt`).

## Librerie e risorse incluse nel repository

Tutte permettono la ridistribuzione, a patto che il testo della licenza viaggi
insieme ai file. Quindi ognuna ha il suo, copiato dalla fonte originale:

| cosa | dove | licenza | testo |
|---|---|---|---|
| MapLibre GL JS 6.3.0 | `web/vendor/maplibre-gl*` | BSD-3-Clause | `web/vendor/LICENSE-maplibre-gl-js.txt` |
| pmtiles.js | `web/vendor/pmtiles.js` | BSD-3-Clause — © Protomaps LLC | `web/vendor/LICENSE-pmtiles.txt` |
| flag-icons (bandiere SVG) | `web/flags/` | MIT — © Panayiotis Lipiridis | `web/flags/LICENSE-flag-icons.txt` |
| Noto Sans (glifi per MapLibre) | `web/fonts/` | SIL Open Font License 1.1 | `web/fonts/LICENZA.md` |

Le librerie Android (Compose, WebKit, Browser, Coil) sono dipendenze Gradle
sotto licenza Apache 2.0 e non sono incluse qui: le scarica il build.

## L'icona

`assets-sorgente/icona-globo.png` è l'immagine da cui `tools/genera_icona.js`
ricava le icone di lancio. È **generata con un'intelligenza artificiale** su
richiesta dell'autore del progetto: non deriva da un'opera di terzi e si
ridistribuisce insieme al repository. Se lo riusi e vuoi un'identità tua,
sostituiscila e rilancia lo script.
