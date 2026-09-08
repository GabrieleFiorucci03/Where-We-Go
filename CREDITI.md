# Crediti e licenze delle fonti

Questo progetto usa dati e librerie di altri. Qui c'è chi sono, con quale licenza
si usano e — dove serve — cosa comporta per chi vuole ridistribuirli.

## Dati

### geoBoundaries gbOpen — suddivisioni amministrative (le regioni)

<https://www.geoboundaries.org>

L'app sceglie per ciascun paese il livello amministrativo che corrisponde meglio
a una «regione» di viaggio. Usa geoBoundaries per 197 paesi o territori e
Natural Earth per 15 ripieghi; 12 paesi restano senza suddivisioni. I file
geoBoundaries sono quelli semplificati pubblicati dal progetto, fissati ai commit
indicati in `tools/livelli_regioni.json`.

La licenza non si riduce a una sola riga: le fonti nazionali aggregate da
geoBoundaries conservano licenze proprie. **95 su 197 sono ODbL o CC BY-SA**, e
quindi hanno obblighi share-alike oltre all'attribuzione. L'elenco completo per
paese, con anno, licenza e fonte dichiarata, è in
[`docs/LICENZE_REGIONI.md`](docs/LICENZE_REGIONI.md).

Le elaborazioni applicate dal progetto sono: scelta del livello, correzione di
alcuni nomi con codifica guasta, codici sintetici `ISO3.slug`, semplificazione
delle sagome usate nell'interfaccia e creazione dei tile vettoriali.
I vuoti fra piu paesi vengono completati entro la copertura amministrativa
Natural Earth, ripartendo la superficie aggiunta fra le regioni adiacenti.
L'intervento e additivo: non rimuove isole o rivendicazioni delle fonti.
Le sole linee di visualizzazione sono deduplicate in un archivio separato:
nelle sovrapposizioni si da precedenza alla superficie nazionale piu piccola,
con spareggio per codice. I perimetri esterni regionali non vengono ripetuti.
Per tutti i 212 paesi con suddivisioni disponibili, anche
il contorno nazionale è ricavato dall'unione delle regioni. Questi contorni
mantengono la provenienza della fonte regionale: l'elenco effettivo viene
generato in `web/data/canonical-report.json` e il pacchetto dati li separa
in `confini-nazionali/<ISO3>.geojson`, con attribuzioni per file.

#### I dati derivati sono pubblicati

L'ODbL chiede che chi usa pubblicamente un database derivato lo renda
disponibile. Il pacchetto sta fra gli asset delle
[Release del repository](https://github.com/GabrieleFiorucci03/Where-We-Go/releases/latest):
**un file GeoJSON per paese** — 212 file, 3.343 suddivisioni — ciascuno con
dentro la propria fonte, la propria licenza, l'URL dell'originale e l'elenco
delle modifiche, più un `MANIFEST.json` con gli SHA-256. Un file per paese
significa che nessuna geometria ODbL viene fusa con una CC BY-SA: ogni file
resta derivato da una sola fonte e ne eredita la licenza.

Lo costruisce `tools/pacchetto_odbl.js`, e va rifatto a ogni rigenerazione dei
dati. Il metodo, cioè l'intera pipeline, è pubblico in `tools/`.

### GeoNames — le città

<https://www.geonames.org> — licenza **CC BY 4.0**

I 450.848 punti città e i loro nomi alternativi vengono da `allCountries.txt`.
La licenza consente la ridistribuzione **con attribuzione**: chi pubblica i dati
derivati (i tile `cities.pmtiles`, l'indice `citta.db`) deve citare GeoNames.

### Natural Earth — confini nazionali e ripieghi regionali

<https://www.naturalearthdata.com> — **pubblico dominio**

Pubblico dominio. È la fonte dei confini nazionali di riferimento e dei 37 ripieghi
senza suddivisioni regionali disponibili. È usato anche per i 15 territori elencati
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
