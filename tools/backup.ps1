# Backup del progetto, preservando la struttura delle cartelle.
#
# Si escludono le cose rigenerabili o enormi: node_modules, gli artefatti di
# build Android, i dati grezzi scaricati (GeoNames, geoBoundaries) e i PMTiles. Resta
# tutto cio' che non si puo' ricreare: sorgenti, script della pipeline,
# documentazione, dati elaborati leggeri.
#
# Uso:  powershell -File tools/backup.ps1 [cartella_destinazione]

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$progetto = Split-Path -Parent $PSScriptRoot
$destDir = if ($args.Count -ge 1) { $args[0] } else { Split-Path -Parent $progetto }
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$zip = Join-Path $destDir ("ProvaMappa-backup-$stamp.zip")

$cartelleEscluse = @('node_modules', 'build', '.gradle', 'data_raw', '.git', '.idea')
$estensioniEscluse = @('.pmtiles', '.zip')

$radice = (Resolve-Path $progetto).Path
$tutti = Get-ChildItem -Path $radice -Recurse -File
$scelti = @()
foreach ($f in $tutti) {
  $rel = $f.FullName.Substring($radice.Length + 1)
  $parti = $rel -split '\\'
  $saltare = $false
  foreach ($p in $parti) { if ($cartelleEscluse -contains $p) { $saltare = $true } }
  if ($estensioniEscluse -contains $f.Extension) { $saltare = $true }
  if (-not $saltare) { $scelti += [pscustomobject]@{ Percorso = $f.FullName; Relativo = $rel } }
}

if (Test-Path $zip) { [System.IO.File]::Delete($zip) }
$archivio = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
try {
  foreach ($s in $scelti) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archivio, $s.Percorso, ($s.Relativo -replace '\\', '/'), 'Optimal') | Out-Null
  }
} finally {
  $archivio.Dispose()
}

$mb = (Get-Item $zip).Length / 1MB
Write-Output ("backup: {0}" -f $zip)
Write-Output ("{0} file, {1:N1} MB" -f $scelti.Count, $mb)
