# Crediti e licenze delle fonti

Questo progetto usa dati e librerie di altri. Qui c'è chi sono, con quale licenza
si usano e — dove serve — cosa comporta per chi vuole ridistribuirli.

## Dati

### geoBoundaries gbOpen — suddivisioni amministrative (le regioni)

<https://www.geoboundaries.org>

L'app sceglie per ciascun paese il livello amministrativo che corrisponde meglio
a una «regione» di viaggio. Usa geoBoundaries per 198 paesi o territori e
Natural Earth per 14 ripieghi; 12 paesi restano senza suddivisioni. I file
geoBoundaries sono quelli semplificati pubblicati dal progetto, fissati ai commit
indicati in `tools/livelli_regioni.json`.

La licenza non si riduce a una sola riga: le fonti nazionali aggregate da
geoBoundaries conservano licenze proprie. **96 su 198 sono ODbL o CC BY-SA**, e
quindi hanno obblighi share-alike oltre all'attribuzione. L'elenco completo per
paese, con anno, licenza e fonte dichiarata, è in
[`docs/LICENZE_REGIONI.md`](docs/LICENZE_REGIONI.md).

Le elaborazioni applicate dal progetto sono: scelta del livello, correzione di
alcuni nomi con codifica guasta, codici sintetici `ISO3.slug`, semplificazione
delle sagome usate nell'interfaccia e creazione dei tile vettoriali.

### GeoNames — le città

<https://www.geonames.org> — licenza **CC BY 4.0**

I 450.848 punti città e i loro nomi alternativi vengono da `allCountries.txt`.
La licenza consente la ridistribuzione **con attribuzione**: chi pubblica i dati
derivati (i tile `cities.pmtiles`, l'indice `citta.db`) deve citare GeoNames.

### Natural Earth — confini nazionali e ripieghi regionali

<https://www.naturalearthdata.com> — **pubblico dominio**

Pubblico dominio. Oltre ai confini nazionali, è usato per i 14 territori elencati
nell'appendice delle licenze regionali, nei quali geoBoundaries non offre il
livello editoriale scelto.

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
