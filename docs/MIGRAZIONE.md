# Migrazione da GADM a geoBoundaries

Stato del lavoro sul ramo `migrazione-geoboundaries`. Il ramo `main` è fermo al
tag `v1.2-stabile`, che è il punto a cui tornare se qualcosa si rompe.

## Perché

GADM vieta la ridistribuzione: è il motivo per cui `web/data/` e `data_raw/`
non stanno nel repository. geoBoundaries si può ridistribuire, quindi un giorno
l'APK potrà contenere i dati e avere una Release vera.

L'obbligo però non è solo citare la fonte: **97 dei 198 paesi hanno licenze
share-alike** (ODbL o CC BY-SA). Va scritto in `CREDITI.md` con onestà.

## Fatto

| passo | commit | esito |
|---|---|---|
| 1. ramo separato | — | `main` fermo su `v1.2-stabile` |
| 2. tabella dei livelli | `af06f50`, `780633f` | 198 paesi da geoBoundaries, 14 da Natural Earth, 12 senza suddivisioni |
| 3. scaricamento | `32e6bfb` | 198 file su 198, 3.241 suddivisioni, 2,19 GB |

### La scoperta che ha guidato tutto

`ADM1` non significa la stessa cosa ovunque: è il livello 1 dichiarato
dall'autorità statistica di ciascun paese, e le autorità non concordano.
L'Italia a ADM1 ha le **5 ripartizioni ISTAT**, non le 20 regioni, che stanno a
ADM2. Malta a ADM1 ha 68 consigli locali. Una migrazione a livello fisso
avrebbe messo 5 macro-aree al posto delle regioni italiane.

Da qui `tools/livelli_regioni.json`: una decisione per paese, con il motivo
scritto accanto. Le 31 decisioni a mano stanno in `ECCEZIONI` dentro
`tools/genera_livelli.js` — si modificano lì, non nel JSON generato.

## Deciso

- **Malta, Slovenia, Lettonia, Azerbaigian: nessuna suddivisione.** Nessuna
  fonte libera ha la granularità giusta, e Natural Earth ha lo stesso difetto di
  geoBoundaries su questi paesi: è troppo *fine*, non più grosso. Meglio niente
  che regioni sbagliate; il paese resta marcabile come nazione.
  **Costo accettato:** le 4 regioni maltesi marcate nel backup si perdono.
- **Geometrie semplificate** (`simplifiedGeometryGeoJSON`) invece della piena
  risoluzione. I file completi sono 2,19 GB contro i 75 MB del grezzo GADM: il
  solo Canada ha 16,5 milioni di vertici e le Filippine 11,3, cioè due paesi
  valgono sei volte l'intero mondo GADM. La mappa arriva a zoom 9, dove un tile
  copre ~78 km su 4096 unità (~19 m per unità): sotto quella soglia il dettaglio
  non è visibile. Il Canada semplificato passa da 618 MB a 26.
  Questo **contraddice** il commento in `prepara_confini.js` che dice di non
  pre-semplificare. Quel ragionamento resta giusto per un ingresso da 75 MB, non
  per uno da 2,19 GB.

## Da fare

4. **Riscaricare in versione semplificata.** Gli URL sono nei metadati, campo
   `simplifiedGeometryGeoJSON`. Serve un'opzione in `tools/scarica_confini.js`
   e rigenerare la tabella perché ci metta quell'URL.
5. **Codici `ISO3.slug`** generati da noi (`ITA.toscana`), non gli `shapeID`
   opachi di geoBoundaries, la cui stabilità fra release è dubbia. Lo slug
   conserva il prefisso, quindi i due punti che ricavano il paese dal codice
   continuano a funzionare senza modifiche:
   - `web/app.js:1124` — `code.split('.')[0]`
   - `android/…/IndiceRegioni.kt:104` — `codiceRegione.substringBefore('.')`
6. **Tabella di rimappatura per le 54 regioni marcate.** Vedi sotto.
7. **Nomi**: riparare il mojibake (19 casi, `RegiÃ³n de Atacama`) e riscrivere
   `tools/region_names.js`, oggi indicizzato sui GID di GADM (`ITA.16_1`).
8. **`CREDITI.md`**: licenze per paese, con la nota sullo share-alike.
9. **Pipeline**: `prepara_confini.js` cambia sorgente; `pipeline_confini.ps1` no.

### Le 54 regioni marcate

Dal backup del 2026-09-06. **Prima di installare la build nuova, salvarne uno
aggiornato dall'app** — menu → «Salva un backup».

```
ITA 20 -> geoBoundaries ADM2 (20)     FRA  7 -> ADM1 (13)
DEU  9 -> ADM1 (16)                   ESP  6 -> ADM1 (19)
NLD  3 -> ADM1 (12)                   POL  5 -> ADM1 (16)
MLT  4 -> nessuna suddivisione: si perdono
```

50 su 54 si rimappano per nome, su sei paesi soltanto: verificabile a mano.

Un caso da tenere d'occhio: `NLD.14_1` si chiama letteralmente `"NA"` nei dati
GADM attuali ed è **Zuid-Holland**, marcata come visitata. Le 14 «regioni»
olandesi di GADM includono anche due specchi d'acqua (IJsselmeer,
Zeeuwsemeren). geoBoundaries ha le 12 province vere, col nome giusto.

## Difetti dei dati attuali che la migrazione sana

- **Ghana**: i codici sono `GHA1_2` senza il punto, quindi oggi
  `paeseDiRegione('GHA1_2')` restituisce `GHA1_2` e le 16 regioni ghanesi non
  risultano appartenere al Ghana, né in `app.js` né in `IndiceRegioni.kt`.
- **14 suddivisioni sotto 11 codici non-ISO3**: le aree contese di GADM
  (`Z01`–`Z09`: Kashmir, Xinjiang, Xizang, Arunachal Pradesh) e due record
  guasti (`NA`, `?`). Escono di proposito.

## Cinque paesi dove i metadati mentono

`admUnitCount` è compilato a parte e diverge dalla geometria. Fa fede il file, e
i conteggi veri sono in `CONTEGGI_VERI` dentro `tools/scarica_confini.js`:
Ungheria 19 e non 20 (manca Budapest), Iran 32 e non 33, Namibia 13 e non 14
(confini pre-2013), Turkmenistan 5 e non 6 (manca Ashgabat), Kosovo 7 distretti
mentre i metadati contano i 48 comuni. Per tutti e cinque Natural Earth è stato
guardato e non è migliore.
