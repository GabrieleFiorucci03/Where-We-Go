# Pipeline dei confini: da GeoJSON a un unico PMTiles con due livelli.
#
# Sostituisce il caricamento a GeoJSON di stati e regioni, che era il rischio
# 3b di docs/PIANO.md §11: 14 MB caricati tutti insieme fanno crashare il
# rendering su un dispositivo con 2 GB di RAM. I tile si caricano per riquadro
# inquadrato, quindi il problema sparisce per costruzione.
#
# Prerequisiti: Docker Desktop avviato, immagine tippecanoe-locale compilata.
#
# Uso:  powershell -File tools/pipeline_confini.ps1

$ErrorActionPreference = 'Stop'
$progetto = Split-Path -Parent $PSScriptRoot
$confini = Join-Path $progetto 'data_raw\confini'
$inizio = Get-Date

function Passo($n, $testo) {
  $t = (Get-Date) - $inizio
  Write-Output ""
  Write-Output ("=== [{0}] {1}  (trascorsi {2:mm\:ss}) ===" -f $n, $testo, $t)
}

# Zoom massimo e semplificazione sono tarabili senza toccare lo script:
#   $env:ZOOM_MAX_CONFINI='10'; $env:SEMPLIFICAZIONE='2'
# Un giro costa una manciata di secondi, quindi conviene provare invece di
# decidere a naso.
$zoomMax = if ($env:ZOOM_MAX_CONFINI) { $env:ZOOM_MAX_CONFINI } else { '8' }
$semplificazione = if ($env:SEMPLIFICAZIONE) { $env:SEMPLIFICAZIONE } else { '4' }

Passo 1 'Preparazione degli ingressi'
# il grezzo GADM e' un file da 73 MB: serve piu' spazio del predefinito
& node --max-old-space-size=4096 (Join-Path $PSScriptRoot 'prepara_confini.js')
if ($LASTEXITCODE -ne 0) { throw 'prepara_confini.js e uscito con errore' }

Passo 2 'Generazione dei tile'
# Due livelli in un archivio solo: -L <nome>:<file>. Niente
# --use-attribute-for-id, che vuole un identificativo numerico: qui sono
# stringhe ("ZWE", "ITA.16_1") e vanno dichiarate con `promoteId` nello stile.
#
# --drop-densest-as-needed NON va usato sui confini: scarterebbe interi stati
# nelle zone fitte, ed e' esattamente cio' che non deve succedere a un
# poligono marcabile. Si tiene invece --simplification, che riduce i vertici
# senza togliere entita'.
& (Join-Path $PSScriptRoot 'tila.ps1') `
  -Cartella $confini `
  -Ingressi @('countries.ndjson', 'regions.ndjson') `
  -Uscita 'boundaries.pmtiles' `
  -Argomenti @(
    '-L', 'countries:/lavoro/countries.ndjson',
    '-L', 'regions:/lavoro/regions.ndjson',
    '--minimum-zoom=0', "--maximum-zoom=$zoomMax",
    "--simplification=$semplificazione",
    '--no-tiny-polygon-reduction',
    '--maximum-tile-bytes=500000', '--quiet', '--force'
  )

Passo 3 'Messa in linea e verifica'
$destinazione = Join-Path $progetto 'web\data\boundaries.pmtiles'
Copy-Item (Join-Path $confini 'boundaries.pmtiles') $destinazione -Force

$b = [System.IO.File]::ReadAllBytes($destinazione)[0..0x65]
$magic = [System.Text.Encoding]::ASCII.GetString($b[0..6])
Write-Output ("formato: {0} v{1}, zoom {2}-{3}" -f $magic, $b[7], $b[0x64], $b[0x65])
Write-Output ("dimensione: {0:N1} MB" -f ((Get-Item $destinazione).Length / 1MB))
if ($magic -ne 'PMTiles') { throw "Il file prodotto non e' un PMTiles valido" }

$durata = (Get-Date) - $inizio
Write-Output ""
Write-Output ("=== COMPLETATO in {0:hh\:mm\:ss} ===" -f $durata)
