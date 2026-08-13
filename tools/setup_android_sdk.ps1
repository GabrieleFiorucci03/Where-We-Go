# Installa senza interfaccia grafica il minimo necessario a compilare l'APK:
# JDK 21 (Temurin) e Android SDK command-line tools.
#
# Il JDK di sistema e' il 24, che il plugin Android Gradle non supporta ancora:
# per questo se ne installa uno dedicato, senza toccare quello esistente.
#
# Tutto finisce in %USERPROFILE%\Android e non tocca il PATH di sistema.
# Per disinstallare basta cancellare quella cartella.
#
# Uso:  powershell -File tools/setup_android_sdk.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$base = Join-Path $env:USERPROFILE 'Android'
$sdk = Join-Path $base 'Sdk'
$jdk = Join-Path $base 'jdk21'
$tmp = Join-Path $env:TEMP 'androidsetup'
New-Item -ItemType Directory -Force -Path $base, $sdk, $tmp | Out-Null

# --- JDK 21 ----------------------------------------------------------------
if (-not (Test-Path (Join-Path $jdk 'bin\java.exe'))) {
  $zip = Join-Path $tmp 'jdk21.zip'
  if (-not (Test-Path $zip)) {
    Write-Output 'scarico JDK 21 (196 MB)...'
    Invoke-WebRequest -Uri 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile $zip -TimeoutSec 900
  }
  Write-Output 'estraggo JDK...'
  $dest = Join-Path $tmp 'jdkx'
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $dest -Force
  # l'archivio contiene una sola cartella jdk-21.x.y
  $inner = Get-ChildItem $dest -Directory | Select-Object -First 1
  if (Test-Path $jdk) { Remove-Item $jdk -Recurse -Force }
  Move-Item $inner.FullName $jdk
}
Write-Output "JDK: $jdk"
& (Join-Path $jdk 'bin\java.exe') -version

# --- command-line tools ----------------------------------------------------
$cmdlineLatest = Join-Path $sdk 'cmdline-tools\latest'
if (-not (Test-Path (Join-Path $cmdlineLatest 'bin\sdkmanager.bat'))) {
  $zip = Join-Path $tmp 'cmdline-tools.zip'
  if (-not (Test-Path $zip)) {
    Write-Output 'scarico Android command-line tools (140 MB)...'
    Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' -OutFile $zip -TimeoutSec 900
  }
  Write-Output 'estraggo command-line tools...'
  $dest = Join-Path $tmp 'cmdx'
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $dest -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $sdk 'cmdline-tools') | Out-Null
  if (Test-Path $cmdlineLatest) { Remove-Item $cmdlineLatest -Recurse -Force }
  Move-Item (Join-Path $dest 'cmdline-tools') $cmdlineLatest
}
Write-Output "SDK: $sdk"

# --- pacchetti SDK ---------------------------------------------------------
$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$sdkmanager = Join-Path $cmdlineLatest 'bin\sdkmanager.bat'

Write-Output 'accetto le licenze...'
$si = 'y' * 1
$risposte = (1..30 | ForEach-Object { 'y' }) -join "`r`n"
$risposte | & $sdkmanager --sdk_root="$sdk" --licenses | Out-Null

Write-Output 'installo platform-tools, platform 35, build-tools 35...'
& $sdkmanager --sdk_root="$sdk" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

Write-Output '---'
Write-Output 'contenuto installato:'
& $sdkmanager --sdk_root="$sdk" --list_installed
