# Pipeline dei confini: da GeoJSON a un unico PMTiles con due livelli.
#
# Sostituisce il caricamento a GeoJSON di stati e regioni, che era il rischio
# 3b di docs/PIANO.md §11: 14 MB caricati tutti insieme fanno crashare il
# rendering su un dispositivo con 2 GB di RAM. I tile si caricano per riquadro
# inquadrato, quindi il problema sparisce per costruzione.
#
# Prerequisiti: Docker Desktop avviato, immagine tippecanoe-locale compilata.
#
# Uso: powershell -File tools/pipeline_confini.ps1 -Python python
# Produce in staging; dopo il collaudo: node tools/pubblica_confini.js <build>

param(
  [string]$Python = 'python',
  [string]$BuildDirectory = '',
  [string]$Baseline = ''
)

$ErrorActionPreference = 'Stop'
$progetto = Split-Path -Parent $PSScriptRoot
$audit = Join-Path $progetto 'data_raw\confini-audit'
if (-not $BuildDirectory) { $BuildDirectory = Join-Path $audit ('build-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$build = [System.IO.Path]::GetFullPath($BuildDirectory)
if (-not $build.StartsWith($audit + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'La build deve stare dentro data_raw/confini-audit'
}
if (Test-Path -LiteralPath $build) { throw 'Usare una cartella build nuova' }
if (-not $Baseline) { $Baseline = Join-Path $audit 'baseline' }
if (-not (Test-Path (Join-Path $Baseline 'manifest.json'))) {
  & node (Join-Path $PSScriptRoot 'baseline_confini.js')
  if ($LASTEXITCODE -ne 0) { throw 'Baseline non disponibile' }
}
$confini = Join-Path $build 'work'
$dati = Join-Path $build 'data'
New-Item -ItemType Directory -Path $confini,$dati -Force | Out-Null
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
# Il predefinito e' 9 e non 8, che era il valore di prima: l'archivio in linea e'
# sempre stato a zoom 9 — lo dice il suo stesso intestazione — quindi con l'8 chi
# rilanciava la pipeline sostituiva 45,6 MB di tile con 26,5, perdendo dettaglio
# sui confini agli zoom alti senza che niente lo segnalasse. Un predefinito che
# non ricostruisce cio' che e' in produzione e' una trappola, non un'impostazione.
$zoomMax = if ($env:ZOOM_MAX_CONFINI) { $env:ZOOM_MAX_CONFINI } else { '9' }
$semplificazione = if ($env:SEMPLIFICAZIONE) { $env:SEMPLIFICAZIONE } else { '4' }
if ($zoomMax -ne '9') { throw 'Questa pipeline preserva il massimo zoom dati 9' }
if ($semplificazione -notmatch '^\d+(\.\d+)?$') { throw 'Semplificazione non valida' }

Passo 1 'Preparazione degli ingressi'
# La normalizzazione legge circa 130 MB di geometrie geoBoundaries e crea
# anche le sagome leggere per l'APK: il margine evita dipendenze dalla heap
# predefinita della versione di Node installata.
$previousData = $env:CONFINI_DATA_DIR
$previousWork = $env:CONFINI_WORK_DIR
try {
  $env:CONFINI_DATA_DIR = $dati
  $env:CONFINI_WORK_DIR = $confini
  & node --max-old-space-size=4096 (Join-Path $PSScriptRoot 'prepara_confini.js')
  if ($LASTEXITCODE -ne 0) { throw 'prepara_confini.js e uscito con errore' }
} finally {
  $env:CONFINI_DATA_DIR = $previousData
  $env:CONFINI_WORK_DIR = $previousWork
}
& $Python (Join-Path $PSScriptRoot 'verifica_sagome.py') --data $dati --work $confini --repair
if ($LASTEXITCODE -ne 0) { throw 'Validita delle sagome non verificata' }
& $Python (Join-Path $PSScriptRoot 'canonizza_confini.py') --data $dati --work $confini `
  --reference (Join-Path $progetto 'data_raw\confini\countries_reference.geojson')
if ($LASTEXITCODE -ne 0) { throw 'Canonizzazione fallita; dati in linea invariati' }
& $Python (Join-Path $PSScriptRoot 'simplify_corrected_masks.py') $build
if ($LASTEXITCODE -ne 0) { throw 'Riduzione delle sagome corrette fallita' }

Passo 2 'Generazione dei tile'
# Due livelli in un archivio solo: -L <nome>:<file>. Niente
# --use-attribute-for-id, che vuole un identificativo numerico: qui sono
# stringhe ("ZWE", "ITA.toscana") e vanno dichiarate con `promoteId` nello stile.
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
    '--simplification-at-maximum-zoom=1', '--full-detail=13',
    '--no-simplification-of-shared-nodes',
    '--no-tiny-polygon-reduction',
    '--maximum-tile-bytes=500000', '--quiet', '--force'
  )

Passo 3 'Verifica dei prodotti in staging'
& (Join-Path $PSScriptRoot 'pipeline_linee.ps1') -Data $dati -Work $confini -Python $Python
$destinazione = Join-Path $dati 'boundaries.pmtiles'
Copy-Item (Join-Path $confini 'boundaries.pmtiles') $destinazione -Force
& node (Join-Path $PSScriptRoot 'verifica_confini.js') $dati $confini $Baseline
if ($LASTEXITCODE -ne 0) { throw 'Verifica fallita; dati in linea invariati' }
& $Python (Join-Path $PSScriptRoot 'audit_confini.py') --data $dati --raw $confini --out (Join-Path $confini 'geometry-audit.json')
if ($LASTEXITCODE -ne 0) { throw 'Audit geometrico fallito; dati in linea invariati' }

$durata = (Get-Date) - $inizio
Write-Output ""
Write-Output ("=== COMPLETATO in {0:hh\:mm\:ss} ===" -f $durata)
Write-Output "Prodotti verificati: $build. Collaudare prima di pubblicare con tools/pubblica_confini.js."
