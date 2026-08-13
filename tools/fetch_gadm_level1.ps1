# Scarica GADM 4.1 livello 1 (prima suddivisione amministrativa) per tutti i
# paesi presenti in web/data/countries.geojson.
#
# GADM e' liberamente utilizzabile per uso personale e accademico; ne sono
# vietati la ridistribuzione e l'uso commerciale. Va bene per questa app, che
# non viene distribuita: vedi docs/PIANO.md sezione 2.
#
# I paesi senza suddivisioni (Monaco, Vaticano, citta'-stato...) rispondono 404:
# e' normale e viene solo registrato.
#
# Uso:  powershell -File tools/fetch_gadm_level1.ps1

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $root 'data_raw\gadm'
$extracted = Join-Path $root 'data_raw\gadm_json'
New-Item -ItemType Directory -Force -Path $cache, $extracted | Out-Null

# elenco ISO3 dai confini gia' scaricati
$codes = @(node (Join-Path $PSScriptRoot 'list_country_codes.js') | Where-Object { $_ -match '^[A-Z]{3}$' })
if ($codes.Count -eq 0) {
  Write-Output "ERRORE: nessun codice paese ottenuto. Hai gia' eseguito prepare_prototype_data.js?"
  exit 1
}

Write-Output "paesi da scaricare: $($codes.Count)"
$scaricati = 0; $saltati = 0; $errori = 0; $i = 0

foreach ($c in $codes) {
  $i++
  $zip = Join-Path $cache "gadm41_${c}_1.json.zip"
  $json = Join-Path $extracted "gadm41_${c}_1.json"

  if (Test-Path $json) { $scaricati++; continue }

  if (-not (Test-Path $zip)) {
    $url = "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_${c}_1.json.zip"
    try {
      Invoke-WebRequest -Uri $url -OutFile $zip -TimeoutSec 120 -UseBasicParsing
    } catch {
      if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        $saltati++
        Write-Output ("[{0,3}/{1}] {2}  nessuna suddivisione (404)" -f $i, $codes.Count, $c)
      } else {
        $errori++
        Write-Output ("[{0,3}/{1}] {2}  ERRORE: {3}" -f $i, $codes.Count, $c, $_.Exception.Message)
      }
      continue
    }
  }

  try {
    Expand-Archive -Path $zip -DestinationPath $extracted -Force
    $scaricati++
    $mb = (Get-Item $zip).Length / 1MB
    Write-Output ("[{0,3}/{1}] {2}  {3,7:N2} MB" -f $i, $codes.Count, $c, $mb)
  } catch {
    $errori++
    Write-Output ("[{0,3}/{1}] {2}  ERRORE estrazione: {3}" -f $i, $codes.Count, $c, $_.Exception.Message)
  }
}

Write-Output "---"
Write-Output "ottenuti: $scaricati | senza suddivisioni: $saltati | errori: $errori"
