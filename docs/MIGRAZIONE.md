# Migrazione da GADM a geoBoundaries

Stato del lavoro sul ramo `migrazione-geoboundaries`. Il ramo `main` è fermo al
tag `v1.2-stabile`, che è il punto a cui tornare se qualcosa si rompe.

## Cose da fare prima dello store

La migrazione dati è chiusa, ma la pubblicazione richiede ancora il passaggio
release/licenze descritto nella roadmap. L'elenco completo dei requisiti degli
store — account e test chiuso, firma, build di release, peso dell'AAB, licenze,
dichiarazioni e materiali della scheda — sta in **§14 di `docs/PIANO.md`**, con la
lista da spuntare in **[`docs/PUBBLICAZIONE.md`](PUBBLICAZIONE.md)**; qui
resta il promemoria di quello che tocca la migrazione:

- [~] ricompilare e collaudare la schermata «Informazioni e licenze»: fatto
      sull'emulatore il 2026-09-06 (`tools/collaudo_apk.cjs`), resta il telefono vero;
- [ ] produrre una release firmata e un AAB con keystore personale;
- [ ] portare `targetSdk` ad API 36;
- [~] obblighi ODbL: pacchetto dei dati derivati pronto (`tools/pacchetto_odbl.js`), resta da
      creare la Release del repository e allegarcelo;
- [ ] includere/verificare gli avvisi Apache 2.0 delle dipendenze Android;
- [ ] aggiungere privacy policy pubblica e dichiarazione Data safety;
- [ ] rifinire il controllo per-file delle foto Commons;
- [x] allineamento dei confini: fatto il 2026-09-06, vedi la nota qui sotto e la
      sezione «Allineamento dei confini» di `docs/PIANO.md`.

### Nota sul mismatch dei confini — risolto in parte, il 2026-09-06

**Aggiornamento 2026-09-07:** il caso misto (regioni accese solo da un lato)
richiede la stessa sagoma in entrambe le modalita. Ora tutti i 212 paesi con
regioni usano la loro unione anche per il contorno nazionale e la bandiera;
i 37 senza regioni restano su Natural Earth. Le divergenze della fonte
regionale sono riportate nel rapporto, senza ritagliare i territori contesi.
Vedi «Correzione dei confini misti» in `PIANO.md`. Le misure sotto si
riferiscono alla correzione parziale precedente.

L'ipotesi era che il difetto stesse nella topologia: geometrie da Natural
Earth, da geoBoundaries e maschere semplificate separatamente, da riconciliare
in una topologia canonica da cui derivare tutto.

Misurando si è visto che **la causa principale erano le maschere delle
bandiere**: il `-simplify 12%` non spostava il contorno di qualche metro, gli
cancellava componenti insulari intere — in Italia 3.824 km² di differenza e uno
scostamento di 3.771 px a zoom 12, cioè la Sicilia mancante. Rifatte con una
tolleranza in metri, lo scarto scende a 0,38 km² e mezzo pixel.

Il contorno nazionale dall'unione delle regioni funziona, ma solo dove si può
dimostrare che non invade il vicino: **10 paesi su 249, tutti insulari**
(Giappone, Madagascar, Cuba, Sri Lanka, Porto Rico, Giamaica, Trinidad e
Tobago, Samoa, Mauritius, Dominica). Gli altri 239 restano su Natural Earth con
il motivo registrato. Le fonti di India, Pakistan e Cina si sovrappongono per
quasi 190.000 km² perché dichiarano cose diverse: nessuna operazione geometrica
lo risolve senza scegliere in silenzio a chi dare il Kashmir.

Nessun overdraw. Il prezzo è nell'APK: le sagome passano da 9,8 MB a ~30 MB
compressi, un file per regione caricato su richiesta.

## Perché

GADM vieta la ridistribuzione: è il motivo per cui `web/data/` e `data_raw/`
non stanno nel repository. geoBoundaries si può ridistribuire, quindi un giorno
l'APK potrà contenere i dati e avere una Release vera.

L'obbligo però non è solo citare la fonte: **96 dei 198 paesi hanno licenze
share-alike** (ODbL o CC BY-SA). Va scritto in `CREDITI.md` con onestà.

## Fatto

| passo | commit | esito |
|---|---|---|
| 1. ramo separato | — | `main` fermo su `v1.2-stabile` |
| 2. tabella dei livelli | `af06f50`, `780633f` | 198 paesi da geoBoundaries, 14 da Natural Earth, 12 senza suddivisioni |
| 3. scaricamento | `32e6bfb` | 198 file su 198, 3.241 suddivisioni, 2,19 GB |
| 4. geometrie semplificate | questo commit | 198 file, 130,1 MB, verificati paese per paese |
| 5. normalizzazione | questo commit | 3.343 regioni in 212 paesi, codici `paese.slug`; sagome APK 9,8 MB |
| 6. compatibilità backup | questo commit | 50 marcature rimappate, 4 maltesi senza equivalenza |
| 7. nomi | questo commit | 24 mojibake corretti; nomi italiani indicizzati sui nuovi codici |
| 8. attribuzioni | questo commit | appendice per 198 fonti in `docs/LICENZE_REGIONI.md` |
| 9. pipeline | questo commit | `prepara_confini.js` usa geoBoundaries/NE e genera tile e sagome dalla stessa normalizzazione |

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

## Implementazione

4. **Versione semplificata.** `tools/scarica_confini.js` usa per default
   `simplifiedGeometryGeoJSON` e scrive in `data_raw/geoboundaries_simplified`;
   `--completi` conserva la modalità a piena risoluzione.
5. **Codici `ISO3.slug`** generati da noi (`ITA.toscana`), non gli `shapeID`
   opachi di geoBoundaries, la cui stabilità fra release è dubbia. Lo slug
   conserva il prefisso, quindi i due punti che ricavano il paese dal codice
   continuano a funzionare. Tre prefissi restano quelli storici dell'app per
   non rompere le nazioni già salvate: `PSX`, `SDS`, `KOS` al posto di
   `PSE`, `SSD`, `XKX`.
   - `web/app.js:1124` — `code.split('.')[0]`
   - `android/…/IndiceRegioni.kt:104` — `codiceRegione.substringBefore('.')`
6. **Tabella di rimappatura.** `web/region-aliases.js` copre tutte le vecchie
   regioni dei sei paesi interessati, non solo quelle marcate, più gli scarti
   espliciti di Malta. Si applica sia allo stato vivo sia ai backup versione 1.
7. **Nomi.** `tools/region_names.js` ripara il mojibake e usa i nuovi codici;
   `tools/prepara_regioni.js` ferma la build davanti a collisioni non decise.
8. **Licenze.** `CREDITI.md` riassume gli obblighi e
   `docs/LICENZE_REGIONI.md` registra licenza, anno e fonte per paese.
9. **Pipeline.** `prepara_confini.js` chiama la nuova preparazione. I tile
   ricevono i 117,3 MB semplificati da geoBoundaries; le sole sagome delle
   bandiere vengono ridotte ulteriormente al 12%, per 9,8 MB nell'APK.

### Le 54 regioni marcate

Dal backup del 2026-09-06. **Prima di installare la build nuova, salvarne uno
aggiornato dall'app** — menu → «Salva un backup».

```
ITA 20 -> geoBoundaries ADM2 (20)     FRA  7 -> ADM1 (13)
DEU  9 -> ADM1 (16)                   ESP  6 -> ADM1 (19)
NLD  3 -> ADM1 (12)                   POL  5 -> ADM1 (16)
MLT  4 -> nessuna suddivisione: si perdono
```

Il test sul backup reale produce esattamente 50 codici validi e 4 scarti, senza
alias mancanti.

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
Ungheria 19 e non 20 (manca Budapest), Iran 32 e non 33, Namibia 13 nel file
completo ma 14 in quello semplificato, Turkmenistan 5 e non 6 (manca Ashgabat), Kosovo 7 distretti
mentre i metadati contano i 48 comuni. Per tutti e cinque Natural Earth è stato
guardato e non è migliore.
