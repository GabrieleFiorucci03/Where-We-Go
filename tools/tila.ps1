# Esegue tippecanoe dentro il container, mai sul volume montato.
#
# Misurato il 2026-08-12: con l'output su /dati, cioe' sul bind mount verso
# NTFS, tippecanoe scriveva 4 MB al minuto con la CPU all'1% e 17 thread fermi
# — cinquantun minuti per 41 MB di tile. Non erano ne' CPU ne' RAM (251 MB
# usati su 7,6 GB, 16 core assegnati e inutilizzati): ogni operazione fine
# attraversava il confine fra la VM Linux e il filesystem Windows. Confronto
# sullo stesso campione di 20.000 voci, stesso output di 1,70 MB:
#
#     output su /dati (bind mount)          71,8 s
#     lavoro in /lavoro dentro il container   2,6 s      <- 27x
#
# Da qui questo script: si copiano gli ingressi dentro il container, si tila
# li', si ricopia fuori il solo risultato. Le due copie sono sequenziali, che
# il mount regge bene.
#
# Vive separato apposta: incollato dentro una singola pipeline, la seconda lo
# ricopia e la terza se lo dimentica.
#
# Uso:
#   & tools\tila.ps1 -Cartella $geonames -Ingressi cities.ndjson `
#       -Uscita cities_full.pmtiles `
#       -Argomenti @('--layer=cities','--minimum-zoom=4','/lavoro/cities.ndjson')

param(
  # cartella del progetto montata su /dati: contiene gli ingressi e riceve l'uscita
  [Parameter(Mandatory)][string]$Cartella,
  # nomi dei file da copiare dentro il container, relativi a $Cartella
  [Parameter(Mandatory)][string[]]$Ingressi,
  # nome del file prodotto, che verra' riportato in $Cartella
  [Parameter(Mandatory)][string]$Uscita,
  # argomenti di tippecanoe, che devono riferirsi ai percorsi /lavoro/...
  [Parameter(Mandatory)][string[]]$Argomenti,
  [string]$Immagine = 'tippecanoe-locale'
)

foreach ($i in $Ingressi) {
  if (-not (Test-Path (Join-Path $Cartella $i))) { throw "Manca $Cartella\$i" }
}

$copie = ($Ingressi | ForEach-Object { "cp /dati/$_ /lavoro/$_" }) -join "`n"
$comando = "tippecanoe -o /lavoro/$Uscita " + ($Argomenti -join ' ')

$script = @"
set -e
mkdir -p /lavoro
$copie
$comando
cp /lavoro/$Uscita /dati/$Uscita
"@

# tippecanoe scrive l'avanzamento su stderr, e Windows PowerShell 5.1 con
# ErrorActionPreference='Stop' considera fatale ogni riga di stderr di un
# eseguibile nativo. Si allenta la regola qui e si controlla il codice di
# uscita, che e' l'unico segnale attendibile.
$precedente = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  docker run --rm -v "${Cartella}:/dati" --entrypoint sh $Immagine -c $script
  # NON chiamarlo $uscita: PowerShell non distingue maiuscole e minuscole nei
  # nomi di variabile, quindi cancellerebbe il parametro -Uscita con lo zero
  $codice = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $precedente
}

if ($codice -ne 0) { throw "tippecanoe e' uscito con codice $codice" }
$prodotto = Join-Path $Cartella $Uscita
if (-not (Test-Path $prodotto)) { throw "tippecanoe non ha prodotto $Uscita" }
Write-Output ("  {0}: {1:N1} MB" -f $Uscita, ((Get-Item $prodotto).Length / 1MB))
