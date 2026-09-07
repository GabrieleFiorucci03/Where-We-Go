param([Parameter(Mandatory)][string]$Data, [Parameter(Mandatory)][string]$Work,
      [string]$Python = 'python')
$ErrorActionPreference = 'Stop'
& $Python (Join-Path $PSScriptRoot 'linee_confini.py') --data $Data --work $Work
if ($LASTEXITCODE -ne 0) { throw 'Generazione delle linee fallita' }
& $Python (Join-Path $PSScriptRoot 'audit_linee.py') --work $Work
if ($LASTEXITCODE -ne 0) { throw 'Audit delle linee fallito' }
& (Join-Path $PSScriptRoot 'tila.ps1') -Cartella ([IO.Path]::GetFullPath($Work)) `
    -Ingressi @('border-lines.ndjson') -Uscita 'border-lines.pmtiles' -Argomenti @(
    '/lavoro/border-lines.ndjson', '--minimum-zoom=0', '--maximum-zoom=9',
    '--simplification=4', '--simplification-at-maximum-zoom=1', '--full-detail=13',
    '--no-simplification-of-shared-nodes', '--maximum-tile-bytes=500000', '--quiet', '--force')
Copy-Item -LiteralPath (Join-Path $Work 'border-lines.pmtiles') -Destination (Join-Path $Data 'border-lines.pmtiles')
