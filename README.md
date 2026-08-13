# Where We Go

Un mappamondo su cui segnare **dove sei stato** e **dove vuoi andare**. App Android
personale: globo 3D a schermo intero, e ogni nazione, regione o città si marca
*visitata* / *in programma* / *niente*. Le nazioni visitate si riempiono con la
propria bandiera. Funziona **senza rete**: i dati stanno nell'APK.

Non è su nessuno store, e non è pensata per andarci: si compila e si installa a mano.

## Com'è fatta

La mappa è **MapLibre GL JS dentro una WebView**; tutto il resto dell'interfaccia —
scheda di selezione, menu, elenchi, ricerca, galleria — è **Compose nativo** sopra
di essa. Le due metà si parlano attraverso due ponti JavaScript↔Kotlin (`AndroidTiles`
per i byte dei tile, `AndroidUI` per gli eventi).

I dati geografici sono **PMTiles letti a pezzi direttamente dentro l'APK**, senza
estrarli: sono dichiarati `noCompress` e si leggono posizionando il canale sul
punto giusto. La ricerca fra 440.273 città passa da un **indice SQLite con FTS4**
generato in pipeline.

- **~2.160 righe di Kotlin**, 12 file
- **~2.900 righe di JavaScript** per mappa, bandiere e stato
- **24 script** in `tools/`, fra pipeline dei dati e strumenti di servizio

## I dati non sono in questo repository

Non per pigrizia: le suddivisioni amministrative vengono da **GADM**, la cui licenza
consente l'uso personale ma **vieta la ridistribuzione**. Pubblicarle qui sarebbe
ridistribuirle. Quindi il repository contiene la ricetta e non gli ingredienti — gli
script li ricostruiscono scaricando le fonti, e ogni copia dei dati nasce sotto la
licenza accettata da chi la scarica.

C'è anche una ragione pratica: `allCountries.txt` di GeoNames pesa 1,7 GB, contro
un limite di 100 MB per file su GitHub.

Dettagli in [CREDITI.md](CREDITI.md).

### Rigenerarli

Servono **Docker Desktop** (per tippecanoe) e **Node 18+**.

```sh
npm install

# 1. le città: da GeoNames ai tile. Serve data_raw/geonames/allCountries.txt,
#    scaricato da https://download.geonames.org/export/dump/
powershell -File tools/pipeline_citta.ps1            # ~3'30"

# 2. i confini: stati (Natural Earth) e regioni (GADM) in un solo PMTiles
powershell -File tools/pipeline_confini.ps1          # ~40 s

# 3. l'indice per elenchi e ricerca (57 MB)
node --max-old-space-size=4096 tools/prepara_indice.js
```

Le pipeline sono in PowerShell perché il progetto è nato su Windows; il lavoro vero
lo fanno gli script Node che chiamano, quindi portarle su `sh` è meccanico.

## Compilare l'app

```sh
cd android
./gradlew assembleDebug        # su Windows: .\gradlew.bat assembleDebug
```

L'APK esce in `android/app/build/outputs/apk/debug/`. Con tutti i dati dentro pesa
circa 150 MB: 45 MB di confini, 41 di città, 57 di indice.

L'icona di lancio si rigenera dalla sorgente con `node tools/genera_icona.js`.

## Provare senza Android

```sh
node tools/serve.js 8080       # poi apri http://localhost:8080
```

`web/index.html` è il prototipo da cui è nata l'app: stessa mappa, stesso codice
JavaScript, con in più una barra laterale da officina che dentro l'app resta
nascosta.

## Il documento che conta

**[`docs/PIANO.md`](docs/PIANO.md)** è il documento vivo del progetto: non un
manuale, ma il registro delle decisioni con le misure che le hanno prodotte.
Perché GADM e non Natural Earth per le regioni, perché FTS4 e non FTS5, perché un
solo `addProtocol` per più archivi PMTiles, perché le città hanno nomi inglesi e
cosa costa. Se questo repository serve a qualcosa a qualcuno, probabilmente è
quello.

## Struttura

```
android/          l'app: Kotlin + Compose, la WebView e i due ponti
web/              la mappa: MapLibre, bandiere, stato dell'utente
  vendor/         MapLibre GL JS e pmtiles.js
  flags/          255 bandiere SVG (flag-icons)
  fonts/          glifi Noto Sans per le etichette
tools/            la pipeline dei dati e gli strumenti di servizio
docs/PIANO.md     le decisioni, con le misure
```

## Licenza

Il codice è [MIT](LICENSE). I dati no: hanno licenze proprie e non sono qui —
vedi [CREDITI.md](CREDITI.md).
