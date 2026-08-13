# sdkmanager --licenses non e' pilotabile da stdin in modo affidabile su
# Windows. Il metodo usato anche dalle CI e' scrivere direttamente i file di
# licenza con i loro hash: e' equivalente ad averle accettate a mano.
#
# Uso:  powershell -File tools/accept_sdk_licenses.ps1

$ErrorActionPreference = 'Stop'
$sdk = Join-Path $env:USERPROFILE 'Android\Sdk'
$dir = Join-Path $sdk 'licenses'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$licenze = @{
  'android-sdk-license' = @(
    '8933bad161af4178b1185d1a37fbf41ea5269c55',
    'd56f5187479451eabf01fb78af6dfcb131a6481e',
    '24333f8a63b6825ea9c5514f83c2829b004d1fee'
  )
  'android-sdk-preview-license'  = @('84831b9409646a918e30573bab4c9c91346d8abd')
  'android-sdk-arm-dbt-license'  = @('859f317696f67ef3d7f30a50a5560e7834b43903')
  'android-googletv-license'     = @('601085b94cd77f0b54ff86406957099ebe79c4d6')
  'google-gdk-license'           = @('33b6a2b64607f11b759f320ef9dff4ae5c47d97a')
  'mips-android-sysimage-license' = @('e9acab5b5fbb560a72cfaecce8946896ff6aab9d')
}

foreach ($nome in $licenze.Keys) {
  $percorso = Join-Path $dir $nome
  $contenuto = ($licenze[$nome] | ForEach-Object { "`n$_" }) -join ''
  [System.IO.File]::WriteAllText($percorso, $contenuto)
  Write-Output "scritta $nome"
}
Write-Output "licenze in $dir"
