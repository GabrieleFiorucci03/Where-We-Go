# Pipeline completa delle citta', da GeoNames ai tile pronti per l'app.
#
# Esegue in sequenza, senza intervento:
#   1. backup del progetto
#   2. conversione e filtro di GeoNames in NDJSON
#   3. generazione dei tile vettoriali con tippecanoe (in Docker)
#   4. messa in linea in web/data/ e verifica del risultato
#
# Prerequisiti: Docker Desktop avviato, immagine tippecanoe-locale gia'
# compilata, data_raw/geonames/allCountries.txt gia' scaricato.
#
# Uso:  powershell -File tools/pipeline_citta.ps1
# Per tornare all'insieme completo, frazioni comprese:
#       $env:FILTRO_LARGO='1'; powershell -File tools/pipeline_citta.ps1

$ErrorActionPreference = 'Stop'
$progetto = Split-Path -Parent $PSScriptRoot
$geonames = Join-Path $progetto 'data_raw\geonames'
$inizio = Get-Date

function Passo($n, $testo) {
  $t = (Get-Date) - $inizio
  Write-Output ""
  Write-Output ("=== [{0}] {1}  (trascorsi {2:mm\:ss}) ===" -f $n, $testo, $t)
}

Passo 1 'Backup del progetto'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup.ps1')

Passo 2 'Conversione e filtro di GeoNames'
if (-not (Test-Path (Join-Path $geonames 'allCountries.txt'))) {
  throw "Manca $geonames\allCountries.txt: scaricalo prima."
}
& node --max-old-space-size=4096 (Join-Path $PSScriptRoot 'geonames_to_ndjson.js') 2>&1 |
  Where-Object { $_ -notmatch 'MaxListeners|righe lette' }

$ndjson = Join-Path $geonames 'cities.ndjson'
if (-not (Test-Path $ndjson)) { throw 'La conversione non ha prodotto cities.ndjson' }
Write-Output ("NDJSON: {0:N1} MB" -f ((Get-Item $ndjson).Length / 1MB))

Passo 3 'Generazione dei tile con tippecanoe'
# Il lavoro avviene dentro il container, non sul volume montato: vedi
# tools/tila.ps1 per la misura che lo motiva (27x).
& (Join-Path $PSScriptRoot 'tila.ps1') `
  -Cartella $geonames `
  -Ingressi 'cities.ndjson' `
  -Uscita 'cities_full.pmtiles' `
  -Argomenti @(
    '--layer=cities',
    '--minimum-zoom=4', '--maximum-zoom=11',
    '--use-attribute-for-id=geonameid',
    '--drop-densest-as-needed',
    '--maximum-tile-bytes=500000', '--quiet', '--force',
    '/lavoro/cities.ndjson'
  )

$tile = Join-Path $geonames 'cities_full.pmtiles'

Passo 4 'Messa in linea e verifica'
$destinazione = Join-Path $progetto 'web\data\cities.pmtiles'
Copy-Item $tile $destinazione -Force

$b = [System.IO.File]::ReadAllBytes($destinazione)[0..0x65]
$magic = [System.Text.Encoding]::ASCII.GetString($b[0..6])
Write-Output ("formato: {0} v{1}, zoom {2}-{3}" -f $magic, $b[7], $b[0x64], $b[0x65])
Write-Output ("dimensione: {0:N1} MB" -f ((Get-Item $destinazione).Length / 1MB))
if ($magic -ne 'PMTiles') { throw "Il file prodotto non e' un PMTiles valido" }

$durata = (Get-Date) - $inizio
Write-Output ""
Write-Output ("=== COMPLETATO in {0:hh\:mm\:ss} ===" -f $durata)
Write-Output 'Ricarica il prototipo con Ctrl+Shift+R per vedere il risultato.'
