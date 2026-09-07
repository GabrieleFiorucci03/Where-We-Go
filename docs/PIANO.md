# Where We Go — Piano di progetto

App Android (Samsung) con globo 3D in bianco e nero, confini di stati e regioni, centri abitati,
e marcatura di ogni entità come **visited** / **wanted**. Le entità visitate si colorano con la
bandiera dello stato o lo stemma della regione.

Ispirazione: *Countries Been*, con l'aggiunta del riempimento a bandiera.

> **Aggiornamento 2026-09-06:** le regioni sono migrate da GADM a
> geoBoundaries gbOpen, con livello scelto paese per paese e ripieghi Natural
> Earth. I dettagli operativi e le decisioni sono in `docs/MIGRAZIONE.md`.
> Le sezioni che misurano GADM restano come cronologia della scelta originaria,
> non come descrizione della pipeline corrente.

## Da fare prima della pubblicazione

### Linee internazionali uniche — 2026-09-07

Il riempimento corretto conservava le sovrapposizioni delle fonti; tracciare
ogni perimetro produceva quindi bordi neri paralleli. `linee_confini.py`
costruisce una partizione destinata solo al disegno: nelle sovrapposizioni
da precedenza al paese con superficie piu piccola, per conservare anche
microstati ed enclavi (a parita decide il codice). Non modifica poligoni,
maschere, codici o selezione. Questa e una regola grafica, non un arbitrato
sui territori contesi.

`border-lines.pmtiles` contiene i livelli `country-borders` e `region-borders`:
ogni tratto nazionale e emesso una volta, le regioni emettono solo i bordi
interni ritagliati nella partizione visibile. La pipeline genera questo
archivio insieme ai riempimenti e lo include nella verifica e nel manifest.
`test_linee_browser.cjs` verifica separatamente la scomparsa dei vecchi bordi
e la presenza di quelli conservati, anche nelle modalita miste.

### Continuita della copertura internazionale — 2026-09-07

La correzione del caso misto descritta sotto non bastava: due modalita
identiche potevano condividere lo stesso vuoto. `allinea_confini.py` cerca
ora i vuoti nell'intera copertura mondiale, confrontandola con il riferimento
amministrativo Natural Earth. Completa le parti scoperte che toccano almeno
due paesi, anche se aperte sulla costa, e le ripartisce secondo quel riferimento.
All'interno del paese usa la prossimita ai bordi regionali; un vuoto lungo
piu regioni viene suddiviso, senza assegnarlo tutto a una sola regione.

E una correzione additiva: nessuna parte delle geometrie sorgenti viene
cancellata. Le sovrapposizioni gia dichiarate dalle fonti nei territori
contesi restano; il mare esterno al riferimento e i fori interni a un solo
paese non vengono completati. Il riferimento e amministrativo: comprende
anche le porzioni lacustri assegnate ai paesi, come nel precedente livello
nazionale Natural Earth. Non e una maschera fisica delle terre emerse.

Le aggiunte entrano nei tile regionali, nelle relative bandiere e nell'unione
nazionale: nessun livello di sfondo nasconde i vuoti. Ogni superficie corretta
e registrata in `shared-border-gaps.geojson`; un audit indipendente ne verifica
la copertura sui file prodotti. `test_confini_vuoti.cjs` aggiunge controlli
assoluti su punti prima scoperti, oltre al confronto fra modalita.

### Correzione dei confini misti — 2026-09-07

Il controllo precedente sui contorni nazionali (fase 3 sotto) manteneva due
fonti diverse per 202 paesi con regioni: accendendo il dettaglio da un solo
lato del confine apparivano strisce vuote. La pipeline ora deriva **tutti i
212 contorni nazionali disponibili dall'unione delle rispettive regioni**.
Natural Earth resta il ripiego per i 37 paesi senza suddivisioni. Il cambio
di modalita conserva quindi la stessa superficie; nessuna regione viene
ritagliata o attribuita a un altro paese.

Le divergenze territoriali e le componenti del riferimento Natural Earth
non coperte dalla fonte regionale restano documentate in `canonical-report.json`.
Non sono piu un motivo per reintrodurre un secondo contorno: cio significa
che anche la vista nazionale adotta ora la copertura della fonte regionale,
incluse le sue omissioni e le sovrapposizioni nei territori contesi.

Anche le bandiere nazionali usano questa unione, caricata su richiesta da
`country-shapes/<ISO3>.geojson` nella cache da 8 MiB condivisa con le regioni.
Il catalogo iniziale conserva le geometrie leggere di riferimento solo per
gli strumenti che leggono i metadati; queste non disegnano la mappa.
`audit_confini.py` controlla l'identita geometrica per ogni paese;
`test_confini_misti.cjs` confronta la copertura renderizzata nelle quattro
combinazioni acceso/spento, alla soglia e fino a zoom 12.

Per la build condivisa del 2026-09-07 l'audit ha controllato tutti i 27.030
vuoti candidati e non ne ha lasciato nessuno scoperto. Il collaudo browser ha
superato 72 controlli assoluti sui nove punti campione internazionali, oltre a
112 confronti fra modalità miste (massimo 5 pixel isolati). Il PMTiles misura
42,0 MB; le sagome regionali compresse 36,0 MiB e vengono caricate a richiesta.

Le misure e i criteri della fase 3 sotto descrivono la versione precedente.

Collaudo della build `data_raw/confini-audit/mixed-20260907`: **212 identita
geometriche verificate, zero differenze**; tutti i 249 codici nazionali e
3.343 regionali presenti nel campione di tile z9. Il confronto browser
esegue 112 combinazioni su quattro inquadrature delle Alpi e della costa
italo-francese, a sette zoom da 4,24 a 12: la versione precedente fallisce
68 prove, quella nuova le supera tutte (massimo 5 pixel isolati diversi,
nessuna differenza da zoom 8 in su). Superati inoltre 24 inquadrature con
lo stile normale, selezione alla soglia, caricamento sagome e backup.
Rapporti in `mixed-before/`, `mixed-after/` e nella cartella `work/` della
build; archivio dei confini 42,1 MiB.
APK debug compilato offline: 209.480.938 byte (199,8 MiB). Verificati gli
hash di tutti i 3.808 asset dati rispetto al manifest collaudato, il codice
web incorporato e `boundaries.pmtiles` non compresso. Il nuovo APK e in
`dist/WhereWeGo-confini-misti.apk`; il collaudo del rendering e in browser,
resta da provarlo sul telefono.

> **L'elenco completo dei requisiti degli store — account, firma, build di release, licenze,
> dichiarazioni, materiali della scheda — è in §14, e in forma di lista da spuntare in
> [`docs/PUBBLICAZIONE.md`](PUBBLICAZIONE.md).** Qui restano le cose che riguardano l'app in sé,
> indipendenti dal canale con cui viene distribuita.

- [x] Ricompilare e verificare l'APK dopo l'aggiunta di «Informazioni e licenze».
      Fatto il 2026-09-06: schermata aperta dal menu, collegamenti presenti,
      ritorno indietro corretto.
- [~] Eseguire il collaudo finale su un telefono reale: mappa offline, ricerca,
      regioni e migrazione del backup. **Fatto sull'emulatore** con
      `tools/collaudo_apk.cjs` (nessun errore, backup superato); resta il
      telefono vero, dove vanno rimisurati i 7,6 s del Nunavut.
- [ ] Aggiungere una build `release` firmata con un keystore personale e
      pubblicare un Android App Bundle (AAB), senza mettere il keystore in git (§14.2, §14.3).
- [ ] Aggiornare `compileSdk`/`targetSdk` ad Android 16 (API 36), richiesto da
      Google Play per nuove app e aggiornamenti dal 31 agosto 2026 (§14.3).
- [ ] Pubblicare a un URL HTTPS stabile l'archivio dati derivato o il metodo/diff
      macchina-legibile richiesto da ODbL e collegarlo dalla schermata licenze.
      **È il vincolo che decide se si può pubblicare**, vedi §14.5.
- [ ] Verificare che l'APK distribuito contenga gli avvisi completi delle
      dipendenze Android (Apache 2.0 e licenze degli artefatti).
- [ ] Pubblicare una privacy policy accessibile dall'app e dalla Play Console e
      completare la sezione Data safety (§14.5, §14.6).
- [ ] Controllare le attribuzioni delle singole foto Wikimedia Commons quando la
      galleria viene usata: autore, licenza e collegamento alla pagina originale.
- [ ] Decidere che limite dare alla galleria di Commons: pubblicando, i contenuti
      di terzi non curati diventano un problema di classificazione (§14.6).
- [x] Allineamento dei confini: misurato, corretto e verificato il 2026-09-06.
      Le maschere delle bandiere erano la causa principale ed erano riparabili;
      i disaccordi fra le fonti no. Restano il collaudo su telefono e la
      rimisura del peso (§14.4). Vedi la sezione qui sotto.

### Allineamento dei confini — eseguito il 2026-09-06

Il problema non dipendeva da un solo file: convivevano i confini Natural Earth
dei paesi, i confini geoBoundaries delle regioni, la semplificazione di
Tippecanoe nei PMTiles e le geometrie ancora più leggere usate dalle maschere
delle bandiere. La strategia adottata — **misurare, provare su un campione,
verificare, estendere** — serviva proprio a non attribuire ogni fessura alla
topologia dei dati prima di aver guardato.

Ha avuto ragione: **la causa principale non erano i confini, erano le
maschere.** Le tre cause si sono rivelate di peso molto diverso, e solo una si
poteva sanare senza prendere posizione su questioni territoriali.

Gli artefatti della misura stanno in `data_raw/confini-audit/` (baseline,
candidate, final, e le catture PNG dei tre passaggi); la pipeline rifà tutto da
capo in staging (§«Come si rifà»).

#### Fase 1 — Cosa ha detto la misura

Campione: Italia, Austria e Svizzera per i confini alpini; coste e isole
italiane; Filippine per l'arcipelago; Francia per l'oltremare; India, Pakistan e
Cina per un confine conteso. Aree e distanze misurate in proiezione metrica, non
in gradi; scostamenti convertiti in pixel a zoom 12.

| Causa | Misura sul campione | Verdetto |
|---|---|---|
| Maschere delle bandiere | Italia **3.824,7 km²** di differenza dalla sorgente, con scostamento massimo **3.771 px** a zoom 12 (Sicilia) | Difetto vero e riparabile |
| Divergenza fra i dataset | Italia: 3.354,7 km² di Stato fuori dalle sue regioni, 4.013,8 km² di regioni fuori dallo Stato | Reale, ma è disaccordo fra fonti |
| Sovrapposizioni fra Stati nelle fonti | ITA/CHE 11,2 km², ITA/AUT 2,4 km², AUT/CHE 1,1 km² — ma IND/PAK **81.608 km²** e IND/CHN **106.857 km²** | Non è geometria: sono rivendicazioni |

Il `-simplify 12% keep-shapes` delle sagome non spostava soltanto il contorno:
**cancellava componenti insulari intere.** Uno scostamento di 3.771 px non è una
fessura, è la Sicilia che non c'è. Ed è questo che si vedeva sullo schermo:
non un bordo disallineato di un pixel, ma la bandiera che sborda o non copre.

La misura ha anche trovato **6 geometrie sorgenti non valide** (`IRL.cork`,
`IRL.galway`, `IRL.limerick`, `IRL.tipperary`, `IRL.waterford`,
`IRN.mazandaran`): erano già così nei dati precedenti.

#### Fase 2 — Le maschere, rifatte

- Semplificazione con **errore massimo in metri** invece della percentuale, e
  ogni componente conservata. Sul campione lo scostamento resta **entro mezzo
  pixel a zoom 12**: Italia da 3.824,7 a **0,38 km²** e da 3.771 a **0,50 px**,
  Austria 0,12 km², Svizzera 0,14 km².
- Le 6 sorgenti non valide vengono **riparate** in pipeline
  (`tools/verifica_sagome.py --repair`), non aggirate.
- 5 sagome che la semplificazione rendeva comunque non valide — `CAN.nunavut`,
  `CAN.ontario`, `MDG.menabe`, `NOR.more-og-romsdal`, `SDN.red-sea` — usano la
  **geometria sorgente**, senza semplificazione. Meglio pesanti che rotte.
- Nei tile, `--no-simplification-of-shared-nodes` insieme a
  `--simplification-at-maximum-zoom=1` e `--full-detail=13`: due poligoni
  adiacenti non vengono più semplificati ciascuno per conto proprio.

#### Fase 3 — I contorni nazionali, solo dove si poteva dimostrare

`tools/canonizza_confini.py` prova per ogni paese l'unione delle sue regioni al
posto del contorno Natural Earth, e la **adotta soltanto se supera tutti** i
controlli: copertura del riferimento ≥ 95 %, variazione d'area ≤ 10 %, nessun
punto interno del vecchio contorno scoperto (è il controllo che protegge isole
ed enclavi), e **nessuna nuova sovrapposizione con un paese vicino** oltre
0,01 km². Nessuno snapping internazionale implicito: se il candidato si mangia
un pezzo del vicino, viene scartato e il motivo finisce nel rapporto.

Su 249 paesi ne sono passati **10** — e sono tutti isole o stati insulari, cioè
esattamente i casi in cui non c'è un vicino con cui litigare:

| Paese | Differenza Stato/regioni prima | Dopo |
|---|---|---|
| Giappone | 19.664 km² | 0 |
| Madagascar | 10.834 km² | 0 |
| Cuba | 7.136 km² | 0 |
| Sri Lanka | 2.128 km² | 0 |
| Porto Rico, Giamaica, Trinidad e Tobago, Samoa, Mauritius, Dominica | da 112 a 603 km² | 0 |

Gli altri **239 restano su Natural Earth**, con il motivo registrato in
`canonical-report.json`: 102 perché l'unione invadeva un vicino, 100 per
copertura insufficiente, 37 perché non hanno regioni.

**Questa è la parte onesta del risultato.** Far combaciare due bordi non li
rende più precisi, e l'India è il caso che lo dimostra: le fonti di India,
Pakistan e Cina si sovrappongono per quasi 190.000 km² perché *dichiarano cose
diverse*. Nessuna semplificazione, nessun dissolve e nessun overdraw sistemano
quello, e provarci significherebbe scegliere in silenzio a chi dare il Kashmir.
Resta com'è, e §14.6 dice che va detto nella schermata delle licenze.

#### Fase 4 — Verifica

- **Presenza:** 249 paesi e 3.343 regioni ritrovati nei tile a zoom 9 nei punti
  campionati, nessuna regressione rispetto alla baseline. È un campione — un
  vertice di confine e le tessere vicine per entità — non una scansione
  esaustiva di tutti i tile.
- **Rendering reale:** 64 catture con MapLibre in browser headless su 8
  inquadrature (Alpi, costa, isole, Filippine, oltremare, Kashmir, Giappone,
  Cuba) a zoom 4 / 4,24 / 4,26 / 6 / 8 / 9 / 10 / 12, con regioni e bandiere
  accese. Zero errori di pagina, zero errori della mappa, giro completo del
  backup superato e soglia di tocco a 4,25 confermata.
- **Messa in linea coordinata:** `tools/pubblica_confini.js` ricontrolla gli
  SHA-256 del manifest verificato prima di copiare, e conserva il pacchetto
  precedente in `previous/` per il ripristino. I dati in linea non vengono
  toccati se un controllo fallisce.
- **Sull'APK vero** (`tools/collaudo_apk.cjs`, emulatore API 35): l'app parte,
  legge i tile dal ponte Kotlin, carica 249 stati e 212 paesi con regioni,
  mappa pronta in 3,0 s. Sei inquadrature fotografate dallo schermo, marcature
  e giro del backup superati, **nessun errore JS e nessuna maschera nulla**.
  Le sagome arrivano davvero dagli asset dell'APK: 44 KB letti in 10 ms per la
  Toscana, maschera completa in 49 ms.

Le due catture che contano:

- **`seam-toscana-umbria-z9`**: i due riempimenti si toccano esattamente lungo
  un bordo frastagliato, senza fessura e senza sovrapposizione. È il caso per
  cui il lavoro è stato fatto, allo zoom per cui i dati sono pensati.
- **`seam-brennero-z12`**: qui il difetto residuo si vede, e non è quello che
  ci si aspettava. La maschera regionale è precisa a mezzo pixel, ma **la linea
  di confine disegnata sopra è dato di zoom 9 ingrandito**, quindi più grossa
  della maschera; e il riempimento austriaco viene da Natural Earth, che con
  geoBoundaries non concorda. A zoom 10–12 lo scarto che resta è della linea,
  non più della maschera. Chiuderlo vorrebbe dire alzare il massimo zoom
  dell'archivio, che è un intervento distinto e qui fuori portata.

#### Il prezzo

| Prodotto | Prima | Dopo |
|---|---|---|
| Sagome delle bandiere | 9,8 MB nei cataloghi | 89,2 MB in 3.343 file, **~29,9 MB compressi nell'APK** |
| Cataloghi delle regioni | (contenevano le geometrie) | 0,8 MB: nomi, codici e centri |
| `boundaries.pmtiles` | 42,7 MB | 44,8 MB |
| `countries.geojson` | 1,69 MB | 3,95 MB |

Le sagome non stanno più dentro il catalogo del paese: **una regione, un file**,
caricato solo quando serve davvero una maschera, con una cache LRU da 8 MB. La
sagoma più grossa è 12,5 MB e sopra il budget si usa e si rilascia senza
occupare la cache. Aprire l'elenco delle regioni di un paese non legge più
nessuna geometria — è il motivo per cui `IndiceRegioni` non fa più il parsing
dei poligoni per mostrare dei nomi.

**L'APK di debug passa da 150,6 a 179,3 MB** (+28,7 MB, misurato il
2026-09-06). È la voce da rimisurare in §14.4 quando si genera l'AAB: il
margine sotto il tetto del modulo base si assottiglia parecchio.

#### Vincoli preservati — verificati, non assunti

| Aspetto | Valore | Verifica |
|---|---|---|
| Zoom navigabile della mappa | 0,5–12 | letto dalla mappa in ogni cattura |
| Livelli generati nell'archivio confini | 0–9 | intestazione del PMTiles, la pipeline rifiuta altri valori |
| Regioni disponibili nei tile | da zoom 3 | verifica dei tile |
| Regioni visibili e selezionabili | da zoom 4,25 | catture a 4,24 e 4,26 |
| Città e loro etichette | 4–5 e da 7 | invariati, non toccati dal lavoro |
| Codici, marcature, backup | invariati | giro completo del backup nel test |

A zoom 10–12 la mappa ingrandisce i tile di zoom 9: il limite dell'archivio non
limita la navigazione. Aumentare il dettaglio oltre zoom 9 resta un intervento
distinto, non fatto qui.

#### Come si rifà

```
powershell -File tools/pipeline_confini.ps1 -Python python
node tools/pubblica_confini.js data_raw/confini-audit/<build>
```

La pipeline produce **in staging** dentro `data_raw/confini-audit/`, non in
linea, e si ferma se validità, verifica o audit non passano. La copia di
riferimento delle sagome nazionali sta in
`data_raw/confini/countries_reference.geojson`: serve a evitare che la
canonizzazione diventi la propria fonte alla build successiva, cioè che il
contorno del Giappone venga rifuso ogni volta a partire da sé stesso.

#### Il caso Nunavut — l'unico prezzo misurato

Marcare il Nunavut blocca la mappa per **7,6 secondi** sull'emulatore. Non è il
formato a un file per regione: leggere i 12 MB dagli asset costa 154 ms e
analizzarli 181 ms. Il resto è la rasterizzazione della maschera.

Il motivo è che il Nunavut **è** 18.833 isole, con 319.451 vertici, e adesso ci
sono tutte. La vecchia maschera ne aveva 449: la semplificazione al 12 % aveva
buttato via il 97,6 % delle isole. Quindi non è una regressione gratuita, è il
conto della correzione — ma è un conto vero, e va pagato o negoziato.

È un caso isolato: la sagoma mediana pesa 8,2 KB, solo 8 file su 3.343 superano
1 MB, e il secondo per numero di poligoni (Ontario, 4.427) rende in 497 ms. Il
costo cresce però più che linearmente con i poligoni, quindi il Nunavut non è
semplicemente «quattro volte l'Ontario».

Le strade, in ordine di quanto costano:

1. **Scartare nel disegno i poligoni sotto il pixel della canvas.** La maschera
   si rasterizza su una canvas di lato 512: un'isola più piccola di un pixel di
   quella canvas non può produrre nulla di visibile, per costruzione. Si tocca
   `web/flagmask.js`, non i dati, che restano completi su disco. Va misurato su
   un campione prima di adottarlo, con la stessa disciplina usata qui.
2. **Rasterizzare fuori dal thread della pagina** (OffscreenCanvas in un
   worker): non riduce il costo, ma smette di bloccare la mappa.
3. **Lasciarlo così.** Riguarda una regione su 3.343, e chi marca il Nunavut lo
   fa una volta.

Non è stato deciso qui perché è una scelta di resa visiva del §7, non di
confini, e cambia il comportamento di tutte le maschere.

#### Cosa resta aperto

- **Le divergenze fra dataset** (Stato Natural Earth contro unione delle sue
  regioni geoBoundaries) restano per i 239 paesi non canonizzati. Sono
  disaccordo fra fonti, non un difetto di build.
- **I confini contesi** restano come li dichiarano le fonti. Vedi §14.6.
- **Il collaudo su telefono reale.** Fatto sull'emulatore, non ancora su un
  dispositivo vero: i 7,6 s del Nunavut e la fluidità con le sagome caricate
  una alla volta vanno rimisurati sul telefono di riferimento, dove la canvas
  non passa da SwiftShader.
- **Il Nunavut**, con le tre strade qui sopra.
- **La dipendenza Python della pipeline.** Shapely e pyproj stanno in
  `data_raw/confini-audit/python`, installati per **Python 3.12**: con un
  interprete di versione diversa `import shapely.lib` fallisce. Il file
  `tools/requirements-confini.txt` dice cosa serve, ma l'ambiente va rifatto se
  si cambia interprete, e `pipeline_confini.ps1 -Python` va puntato a quello
  giusto.

---

## 0. Decisioni prese

| Ambito | Scelta |
|---|---|
| Nome | **Where We Go** |
| Stack | Kotlin + Jetpack Compose (shell nativa) + WebView con MapLibre GL JS ≥ 5 (globo) |
| Dati | 100% offline, nessun tile server |
| Granularità città | Massima possibile a costo zero → GeoNames, feature class `P` (~4,8 M centri abitati) |
| Regioni | **Opzionali, mai attive di default**: si accendono per paese, vedi §6.2 |
| Tema | **Chiaro di default**, scuro selezionabile nelle impostazioni. Vedi §6.1 |
| Suddivisioni | **Ci si ferma alle regioni**; livello geoBoundaries scelto paese per paese. Niente province né comuni: vedi §13 e `docs/MIGRAZIONE.md` |
| Approfondimento | Città → galleria di foto da Wikimedia Commons dentro l'app; nazioni e regioni → Chrome Custom Tab. Vedi §9.6 |
| Distribuzione | **Store, dopo il passaggio di §14.** Fin qui è stata nessuna — APK compilato in locale e installato a mano (§4, che resta come cronologia); la pubblicazione aggiunge i requisiti elencati in §14 |
| Costi | **Zero per dati e strumenti.** La pubblicazione su Google Play costa **25 $ una tantum** (§14); nessun costo ricorrente |

---

## 1. Architettura

```
┌─────────────────────────────────────────────────────────┐
│  App Android (Kotlin, Jetpack Compose)                  │
│                                                         │
│  ┌───────────────┐   JS Bridge    ┌──────────────────┐  │
│  │ UI nativa     │◄──────────────►│ WebView          │  │
│  │ - bottom sheet│  @JavascriptI. │  MapLibre GL JS 6│  │
│  │ - ricerca     │  evaluateJS()  │  projection:globe│  │
│  │ - statistiche │                │  stile B/N       │  │
│  │ - impostazioni│                └────────┬─────────┘  │
│  └───────┬───────┘                         │            │
│          │                                 │ getBytes() │
│  ┌───────▼───────┐              ┌──────────▼─────────┐  │
│  │ Room / SQLite │              │ PMTiles su disco   │  │
│  │ stato utente  │              │ (asset pack)       │  │
│  │ + FTS ricerca │              │ boundaries + città │  │
│  └───────────────┘              └────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Perché WebView e non nativo:** la proiezione `globe` è nata su MapLibre GL JS 5.0 (gennaio 2025)
ed è oggi la più matura; ha `setFeatureState`, custom layer WebGL, `ImageSource` warpati sulla
sfera. La controparte nativa è più indietro. La WebView è un dettaglio implementativo: tutta la UI
(sheet, liste, statistiche, impostazioni) resta Compose nativa, la WebView mostra **solo** il globo.

**Bridge (contratto minimo):**

- Kotlin → JS: `setStatus(type, id, status)`, `flyTo(lat, lon, zoom)`, `setLayerMode(mode)`,
  `setRegionsEnabled(bool)`, `bulkState(json)`
- JS → Kotlin: `onFeatureTap(type, id, name, lat, lon)`, `onZoomLevelClass(cls)`, `onMapReady()`,
  `readBytes(file, offset, length)` (per PMTiles, vedi §5)

---

## 2. Sorgenti dati e licenze

Tutto gratuito. La pipeline corrente usa **geoBoundaries gbOpen** per 198
paesi/territori e Natural Earth per 14 ripieghi. Le licenze nazionali aggregate
sono miste: 96 fonti sono ODbL o CC BY-SA. Vedi `CREDITI.md` e
`docs/LICENZE_REGIONI.md` per l'attribuzione completa.

Il testo seguente documenta la scelta originaria di GADM, ora superata dalla
migrazione ma utile per capire quali problemi la nuova tabella per paese risolveva.

> Se un domani si volesse distribuire l'app, GADM va sostituito. Per questo la pipeline (§3) va
> tenuta agnostica sulla sorgente: un solo script di import da cambiare, non lo schema dei tile.
> Il sostituto non e' pero' equivalente, per il motivo qui sotto.

**Perche' non Natural Earth per le regioni** (verificato sui dati durante lo spike M0):
il suo livello "admin-1" non e' lo stesso concetto in tutti i paesi. Contiene 16 Laender per la
Germania e 51 stati per gli USA — corretto — ma **110 province per l'Italia** e 101 dipartimenti
per la Francia, cioe' Milano e Brescia invece di Lombardia. Il campo `region`, che sembrerebbe
il raggruppamento superiore, non risolve: per l'Italia da' correttamente le 20 regioni, ma per
gli USA comprime i 51 stati in 4 macro-aree statistiche, e manca del tutto in 204 paesi su 251.
GADM livello 1 e' invece definito ovunque come la prima suddivisione amministrativa dello stato,
che e' esattamente il concetto voluto.

| Livello | Fonte | Licenza | Note |
|---|---|---|---|
| Stati (z 0-5) | Natural Earth `admin_0_countries` 1:50m | Public domain | ~258 poligoni, leggerissimo |
| Stati (z 6+) | GADM livello 0, oppure OSM `admin_level=2` | GADM non-commerciale / ODbL | Confini precisi allo zoom alto |
| Regioni | **GADM livello 1** | Non-commerciale, uso personale OK | Unico livello coerente nel mondo, vedi riquadro sotto |
| ~~Province e comuni~~ | ~~GADM livelli 2-3~~ | — | **Non usati**: ci si ferma al livello 1. I comuni restano i punti città di GeoNames, non poligoni. Vedi §13 |

> **I confini nazionali e quelli regionali non combaciano, ed è accettato.** Vengono da due
> rilevamenti indipendenti — Natural Earth per gli stati, GADM per le regioni — quindi il contorno
> esterno delle regioni di un paese non coincide con la sagoma dello stato. Misurato sullo scarto
> massimo dei riquadri: **2,8 km per la Germania, 3,0 per l'Austria, 4,4 per la Svizzera**; agli
> zoom alti si vede.
>
> L'unica cura strutturale sarebbe ricavare la sagoma dello stato **fondendo le sue regioni GADM**,
> così i due contorni condividerebbero gli stessi vertici e coinciderebbero per costruzione.
> **Scartata**, e non per costi — GADM è gratuito, il suo vincolo è sulla ridistribuzione, non sul
> prezzo — ma per non estendere la dipendenza: oggi gli stati sono Natural Earth, di pubblico
> dominio, e se un domani si volesse distribuire l'app basterebbe sostituire i dati delle regioni.
> Fondendo, andrebbero sostituiti anche quelli degli stati. Si tiene il disallineamento e si
> conserva l'opzione.
>
> Cambierebbe anche *cosa* è un paese: la Francia di GADM è la sola metropolitana, quella di
> Natural Earth comprende l'oltremare — con effetti sulla marcatura e sulla maschera della bandiera.
| Città | GeoNames `allCountries`, feature class `P`, filtrata (§2.1) | CC BY 4.0 | 4,74 M punti dopo il filtro |
| Bandiere | `flag-icons` / `country-flags` (SVG) | MIT / PD | ~250 file, pochi MB, bundle in app |
| Stemmi regionali | Wikidata P94 → Wikimedia Commons | **licenze miste** | Vedi §7.3 — punto critico |

### 2.1 Comuni sì, frazioni no — il filtro delle città

Obiettivo: fra le città devono comparire i comuni veri, non le frazioni. **GeoNames non permette
di distinguerli in modo uniforme**: il 90,1% della classe P è `PPL` generico, e i codici che
dichiarano esplicitamente una frazione (`PPLL`) o un quartiere (`PPLX`) coprono solo il 6,7%.

In alcuni paesi però i comuni sono codificati come *sedi di divisione amministrativa*
(`PPLA`…`PPLA5`), e lì il filtro diventa preciso. Confronto coi numeri reali:

| paese | sedi amministrative | comuni reali | esito |
|---|---|---|---|
| Italia | 8.378 | 7.896 | **ottimo**, scarto 6% |
| Germania | 7.587 | 10.786 | parziale, ne mancano 3.200 |
| Spagna | 6.089 | 8.131 | parziale |
| Stati Uniti | 3.061 | 19.495 | inutilizzabile |
| Francia | 368 | 34.935 | inutilizzabile |
| India | 210 | — | inutilizzabile |

Da qui la scelta: **tabella per paese** (`tools/filtro_citta.js`), stesso schema delle eccezioni
per le bandiere. Ovunque si scartano i codici che non sono mai un comune — frazioni, quartieri,
villaggi rurali, abbandonati, storici. Nei soli paesi con codifica verificata si tengono
esclusivamente le sedi amministrative. Oggi la lista contiene la sola Italia; aggiungere un paese
richiede prima di confrontarne il conteggio con il numero reale dei suoi comuni, perché una
codifica incompleta cancellerebbe l'intero paese.

**Filtro stretto — quello adottato.** Alle esclusioni per codice si aggiunge la regola: si tiene
una voce solo se ha una **popolazione dichiarata** oppure se è **sede di divisione
amministrativa**. È il criterio che, con i dati disponibili, meglio approssima il concetto di
comune. Risultato: da 5.220.638 voci di classe P a **450.848**, cioè **−90,5%**.

Verifiche dove il numero reale è noto: Finlandia 601 tenute per 309 comuni, Corea del Sud 309 per
226, Italia 8.378 per 7.896, Francia 34.239 per 34.935.

> **Prezzo accettato:** in una novantina di paesi GeoNames non dichiara quasi mai la popolazione —
> Bangladesh, Marocco, Congo — e lì spariscono anche comuni veri, indistinguibili dai villaggi.
> Senza il filtro resterebbero però 4,3 milioni di frazioni a coprire la mappa. La regola è
> reversibile: `FILTRO_LARGO=1` nell'ambiente la disattiva.

**Zoom di comparsa esplicito.** Ogni città porta un `tippecanoe.minzoom` calcolato dalla sua
importanza. Serve perché `--drop-densest-as-needed` da solo produce il risultato opposto a quello
voluto: gli scarti colpiscono le zone fitte, quindi **Milano spariva** — sta nel punto più denso
d'Italia — mentre il paese alpino isolato sopravviveva. `--order-descending-by` non aiuta: governa
l'ordine di scrittura, non gli scarti.

Il livello si ricava dalla popolazione (oltre il milione a zoom 4, oltre centomila a 6, oltre
ventimila a 8) e, **solo quando la popolazione manca**, dal ruolo amministrativo. Quest'ultima
condizione è essenziale: applicare il ruolo sempre faceva comparire a zoom 6 `Hinterrhein`, 61
abitanti, perché capoluogo di secondo livello nei Grigioni, e centinaia di Gemeinden austriache da
poche centinaia di abitanti.

**Esclusioni per nome:** gli arrondissement municipali francesi sono codificati `PPL` con la
popolazione del quartiere (`Paris 15 Vaugirard`, 229.713 abitanti) e comparivano come città a sé,
riempiendo di doppioni la mappa di Parigi.

### 2.2 Quartieri delle metropoli — marcati e nascosti

GeoNames non distingue **Iztapalapa** (municipio interno a Città del Messico) da **Ciampino**
(comune autonomo presso Roma): entrambi centri abitati con popolazione, vicini a una città molto
più grande. Nessun filtro sui codici li separa, perché sono `PPL` generici.

Procedimento in tre passi (`tools/retrocessione_quartieri.js`):

1. **Sospetto** chi non ha ruolo amministrativo, sta entro il raggio dovuto alla taglia di una
   metropoli vicina (25-60 km secondo la sua popolazione) ed è almeno 5 volte più piccolo. Sono
   **12.825 voci, il 2,8%** dei 450.848 centri abitati.
2. **Arbitrato** di ciascun sospetto contro i record amministrativi di GeoNames (classe A, ADM2-5,
   457.568 record): se entro 15 km esiste una divisione con lo stesso nome — confronto per parole
   con le qualifiche di ente rimosse, vedi §2.3 — è un comune vero. **2.232 salvati.**
3. **Protezione** nei sei paesi privi di livello comunale: altri **18** salvati dalla soglia di
   popolazione (§2.3).

I restanti **10.575** restano **nei tile** con la proprietà `q`, e lo stile della mappa li esclude
dal disegno (`filter: ['!=', ['get','q'], 1]`). L'elenco completo è in `quartieri_nascosti.json`.

> **Perché nascondere e non ritardare la comparsa:** è una scelta d'uso. Chi visita Parigi vuole
> segnare "Parigi", non venti quartieri: un elenco di cose da spuntare che non corrisponde a come
> si viaggia è peggio di una mappa affollata.
>
> **Perché marcare e non cancellare:** l'arbitrato non è infallibile. Armenia, Irlanda e Hong Kong
> hanno 82, 31 e 18 record amministrativi in tutto, quindi lì boccia villaggi veri per assenza di
> riferimento, non per demerito. Marcandoli si torna indietro togliendo un filtro, senza
> rigenerare i tile.

### 2.3 Protezione dal nascondimento — RISOLTO

**Stato: deciso e implementato.** La soglia di popolazione unica, che era la proposta iniziale, è
stata **scartata dopo averla misurata**, e sostituita da una correzione del confronto fra nomi più
una soglia ristretta a sei paesi.

**Perché la soglia unica non andava bene.** Classificando a mano tutte le 62 voci nascoste sopra i
300.000 abitanti — comune vero = ente locale autonomo, quartiere = circoscrizione interna — il
bilancio era **25 comuni salvati contro 29 quartieri rimessi in mappa**, cioè un lancio di moneta.
E peggiorava alzando la soglia (a 500.000: 8 contro 13), perché **le voci più popolose fra i
nascosti sono proprio i mega-quartieri delle mega-città**: Soweto 1,7 M, Sadr City 1,2 M,
Gustavo A. Madero 1,2 M, Victoria 957 k. Una soglia alta li prende tutti per primi: è l'opposto
dell'effetto voluto.

**La vera causa, trovata guardando i dati grezzi.** Per la maggior parte dei casi il record
amministrativo *esisteva ed era vicinissimo*: non era un problema di copertura né di distanza, ma
di **nome**. GeoNames scrive gli enti con la qualifica del tipo davanti:

| centro abitato | record amministrativo | distanza |
|---|---|---|
| Pasay (PH) | `City of Pasay` | 1,4 km |
| Bogor (ID) | `Kecamatan Bogor Tengah` | 1,0 km |
| Bến Cát (VN) | `Thị Xã Bến Cát` | 5,2 km |
| South Tangerang (ID) | `Kota Tangerang Selatan` | 0,8 km |

Il vecchio confronto lavorava per prefisso sulla stringa compattata, quindi `pasay` contro
`cityofpasay` non corrispondeva. **Tre modi di fallire distinti**, non uno:

1. **qualifica nel nome dell'ente** — il caso più frequente, riparabile;
2. **nome locale contro esonimo inglese** (`Tangerang Selatan` / `South Tangerang`) — riparabile
   con gli alternatenames di GeoNames;
3. **assenza vera di un livello comunale** — India (gli ADM3 sono i blocchi di sviluppo), Kenya
   (solo sub-location), Egitto: qui nessuna correzione del confronto può funzionare.

**La soluzione adottata**, in `tools/retrocessione_quartieri.js`:

- `nucleo()` riduce ogni nome alle sole parole significative, togliendo dalle estremità le
  qualifiche di ente (`QUALIFICHE`: *city, of, kota, kecamatan, thi xa, municipio, markaz…*).
  L'elenco è ricavato dai token più frequenti dei 461.433 nomi ADM1-5 con almeno due parole,
  tenendo **solo** quelli che sono davvero qualifiche: restano fuori apposta `san`, `santa`, `sao`,
  `los`, `el` — parti del toponimo — e i punti cardinali (`selatan`, `barat`, `west`), che
  distinguono un ente da un altro e vanno confrontati.
- il confronto avviene fra sequenze di parole, per uguaglianza o prefisso;
- se il nome ufficiale non basta si provano gli **alternatenames** dell'ente (solo allora: sono
  decine per record e scomporli sempre costerebbe troppo);
- `PAESI_SENZA_LIVELLO_COMUNALE` = **IN, KE, EG, BR, AU, KR**: solo lì vale ancora la soglia dei
  300.000 abitanti (`SOGLIA_PROTEZIONE`, sovrascrivibile da ambiente). Ogni paese è stato aggiunto
  dopo aver guardato i suoi casi, come la tabella per paese di `filtro_citta.js`.

> **La Malesia è esclusa di proposito.** Anche lì restano nascoste due città autonome, Pasir Gudang
> e Iskandar Puteri, ma aggiungerla ne recupera 2 e rimette in mappa 4 kampung veri dell'area di
> Johor Bahru. Scambio sfavorevole, e vale la pena ricordarlo prima di "sistemare" quei due casi.

**Esito misurato**, sulle 62 voci sopra i 300.000 abitanti classificate a mano: **23 comuni veri su
25 recuperati, contro 5 quartieri e 2 ambigui rimessi in mappa** — dove la soglia unica dava 25
contro 29. In tutto **599 voci** sono tornate visibili (581 dal confronto sui nomi, 18 dalla
soglia) e **nessuna** è stata persa: vedi il riquadro sul soprainsieme in `stessoNome`.

**Costo residuo accettato:** restano visibili cinque quartieri veri — Sadr City (IQ), Fengxiang
(CN), Borivli (IN), Gia Lâm (VN) e Percut (ID) — più due casi ambigui, Ambattur e Shyamnagar.
Passano perché *sono* divisioni amministrative, solo non comuni: è il limite di fondo
dell'arbitrato, che sa riconoscere un ente ma non se quell'ente è autonomo.

> **Iztapalapa, cioè l'esempio con cui si apre la §2.2, non è risolta** — e non lo era nemmeno
> prima di questo lavoro. GeoNames le assegna un record `ADM2` con lo stesso identico nome a
> distanza zero, perché l'alcaldía *è* una divisione amministrativa: l'arbitrato la riconosce e la
> salva. È lo stesso limite di Sadr City, solo sul caso più citato. Il rimedio non è nascondere di
> più, ma ritardare: vedi §2.4.

### 2.4 Affollamento attorno alle metropoli — comparsa ritardata

**Il difetto.** L'arbitrato esenta in partenza le sedi amministrative, e i quartieri delle grandi
città sono quasi sempre codificati così: i **cinque borough di New York sono tutti `PPLA2`**, i
distretti di Hong Kong sono `PPLA`. Non vengono mai nemmeno sospettati, e la mappa attorno alle
metropoli resta affollata.

**Togliere l'esenzione non è la cura, ed è stato misurato.** Delle 1.918 sedi che stanno dentro il
raggio di una metropoli, 459 passerebbero a nascoste — ma fra queste ci sono **Islamabad**
(capitale del Pakistan, codificata "presso Rawalpindi"), Johor Bahru, Xianyang e Langfang. E non
risolverebbe nemmeno il caso di partenza: Brooklyn, Queens, Manhattan e il Bronx sopravviverebbero
comunque, perché i loro county portano il nome del borough negli `alternatenames`.

La premessa dell'arbitrato — *se esiste un ente con lo stesso nome allora è un comune* — per i
quartieri è semplicemente falsa: Brooklyn e Iztapalapa **sono** divisioni amministrative. GeoNames,
in questi campi, non porta l'informazione che distingue una divisione autonoma da una interna a una
città, e nessuna raffinatezza sul confronto dei nomi può ricavarla.

**Quindi non si nasconde: si ritarda.** Chi sta dentro il corpo urbano di una metropoli non compare
prima dello zoom 10. Da lontano si vede la metropoli, da vicino i suoi pezzi. Nessuna capitale
sparisce e tutto resta marcabile. **11.341 voci ritardate**, di cui 7.982 erano comunque già
nascoste: l'effetto reale è su **3.359 voci visibili**.

> **Perché 10 e non 11**, che pure è il livello massimo dei tile ed era libero. Fra i due non c'è
> differenza sotto lo zoom 10, ed è lì — agli zoom intermedi, dove sono in mappa poche decine di
> migliaia di voci — che l'affollamento si vede: una metropoli che mostra venti pezzi mentre il
> resto del mondo ne mostra pochi. Al livello 10 sono già visibili 439.507 città, quindi tremila in
> più non cambiano la densità percepita. Portarle a 11 avrebbe aggiunto un solo costo: città
> autonome grandi ma vicine a una metropoli — Kawasaki, Saitama, Guarulhos, Thāne, i comuni della
> banlieue parigina e dell'hinterland milanese — invisibili fino a esserci praticamente dentro.
> Tutto il beneficio sta nel toglierle dagli zoom bassi, non nel confinarle all'ultimo.

I criteri del ritardo sono più stretti di quelli del nascondimento, e vengono dalle distanze reali:

| quartieri veri | | città autonome | |
|---|---|---|---|
| Petare | 7,9 km | Johor Bahru | 22,1 km |
| Manhattan | 8,4 km | Xianyang | 22,6 km |
| Brooklyn | 8,6 km | Long Beach | 32,1 km |
| Iztapalapa | 10,6 km | Bogor | 42,7 km |
| Queens | 14,7 km | Langfang | 50,9 km |
| Staten Island | 20,3 km | | |

Da cui **25 km** (il raggio del nascondimento, 25-60 km secondo la taglia, è troppo largo per questo
scopo), **dominanza 3×** invece di 5× — altrimenti i borough più grossi sfuggono, Brooklyn è solo
3,22 volte più piccola di New York — e il vincolo dello **stesso paese**, l'unico davvero
principiato: Johor Bahru è dominata da Singapore, ma un centro abitato non può essere il quartiere
di una metropoli che sta in un altro stato. Le capitali nazionali (`PPLC`) non si ritardano mai.

> **Limiti dichiarati:** su venti casi di prova ne sbaglia due, entrambi per eccesso — South
> Tangerang e Xianyang compaiono solo allo zoom 11 pur essendo città autonome. Errori miti, perché
> la voce resta visibile e marcabile. Le due soglie sono tarate su una dozzina di casi guardati a
> mano: se ne emergeranno altri, il rimedio non è spostare i 25 km a occhio ma misurare su un
> campione più largo.

**Quello che nessuno ha ancora misurato** sono i 2.232 salvati dall'arbitrato: la classificazione a
mano ha riguardato solo le voci *nascoste* sopra i 300.000 abitanti, cioè i falsi negativi. Quanti
Iztapalapa ci siano fra i salvati non lo sappiamo — il ritardo di questa sezione li copre come
effetto collaterale, ma non li conta.

**Nota metodologica.** La classe A di GeoNames combacia con i conteggi reali dei comuni in modo
notevole: Italia ADM3 = 7.896 contro 7.896 reali, Spagna 8.124 contro 8.131, Brasile ADM2 = 5.570
esatti. Sarebbe una base alternativa ai centri abitati, ma il livello cambia da paese a paese
(ADM3 in Italia, ADM4 in Francia, ADM2 in Messico) e nei paesi a comuni giganti — Danimarca 98,
Svezia 290 — lascerebbe la mappa quasi vuota. Per questo è usata come **giudice** e non come base.

**Nota metodologica.** La classe A di GeoNames combacia con i conteggi reali dei comuni in modo
notevole: Italia ADM3 = 7.896 contro 7.896 reali, Spagna 8.124 contro 8.131, Brasile ADM2 = 5.570
esatti. Sarebbe una base alternativa ai centri abitati, ma il livello cambia da paese a paese
(ADM3 in Italia, ADM4 in Francia, ADM2 in Messico) e nei paesi a comuni giganti — Danimarca 98,
Svezia 290 — lascerebbe la mappa quasi vuota. Per questo è usata come **giudice** e non come base.

**Automazione:** `tools/pipeline_citta.ps1` esegue backup, conversione, tiling e messa in linea
senza intervento.

> **Il tiling non deve mai scrivere sul volume montato — misurato, vale 27×.**
> Con `-o /dati/...` sul bind mount, tippecanoe procedeva a **4 MB al minuto** con la CPU all'1% e
> 17 thread fermi: cinquantun minuti per 41 MB di tile. Non erano né CPU né RAM (251 MB usati su
> 7,6 GB, 16 core assegnati e inutilizzati): ogni operazione fine attraversava il confine fra la VM
> Linux e NTFS. Confronto sullo stesso campione di 20.000 voci, stesso output di 1,70 MB:
>
> | metodo | durata |
> |---|---|
> | output su `/dati` (bind mount) | 71,8 s |
> | lavoro in `/lavoro` dentro il container | **2,6 s** |
>
> Da qui la forma attuale del passo 3: si copia l'NDJSON dentro il container, si tila lì, si
> ricopia fuori il PMTiles finito. Le due copie sono sequenziali, che il mount regge bene. Serve
> `--entrypoint sh` perché l'immagine ha `ENTRYPOINT ["tippecanoe"]`.
>
> Vale la pena verificare anche l'esclusione della cartella da Windows Defender (`(Get-MpPreference).ExclusionPath`,
> richiede un terminale da amministratore): la scansione in tempo reale su ogni scrittura è una
> causa classica dello stesso sintomo e potrebbe spiegare perché il mount è così lento.

> **Popolazione quasi sempre assente:** solo il 9% dei centri ha un valore di popolazione
> (485.173 su 5,16 M). È il criterio con cui tippecanoe decide chi sopravvive ai livelli di zoom
> bassi, quindi per il restante 91% la selezione la fa la densità. In pratica allontanandosi si
> vedono le città vere, e i villaggi compaiono solo da vicino: l'effetto voluto, ma ottenuto per
> metà dal caso.

**Identificatori stabili** (fondamentali: sono la chiave del database utente):

- Stato → ISO 3166-1 alpha-3 (`ITA`)
- Regione → codice sintetico `paese.slug` (`ITA.toscana`), indipendente dagli
  identificativi opachi della fonte
- Città → `geonameid` (intero GeoNames)

**Difetti noti di GADM 4.1 sui nomi** (misurati durante lo spike): in **906 record su 3.583** del
livello 1 gli spazi sono stati mangiati (`Valled'Aosta`, `Friuli-VeneziaGiulia`), e in diversi
casi si usa l'esonimo inglese invece del nome locale (`Apulia`, `Sicily`). `VARNAME_1` non aiuta
perche' e' troncato a una trentina di caratteri. Serve una passata di correzione in pipeline
(`tools/region_names.js`): riparazione automatica degli spazi piu' una tabella di nomi locali.

> I `GID` di GADM **cambiano tra le versioni** del dataset. Poiché sono la chiave del database
> utente, va congelata una versione (4.1) e ogni futuro aggiornamento richiede una migrazione con
> mappatura esplicita. In alternativa, salvare accanto al GID anche il centroide, così una
> rimappatura per prossimità è sempre possibile. Questa è la trappola più insidiosa del progetto:
> un aggiornamento dati fatto male cancella anni di segnalibri.

Questi ID vanno scritti nei tile e dichiarati con `promoteId` nello style, così `setFeatureState`
funziona senza lookup.

---

## 3. Pipeline dati (build-time, sul tuo PC)

Gira una volta (e a ogni aggiornamento dati), non sul telefono. Tutti strumenti gratuiti e open source.

```
download → normalizzazione → tiling → PMTiles
  ogr2ogr / DuckDB spatial      tippecanoe        pmtiles convert
```

1. **Confini**: `ogr2ogr` da shapefile Natural Earth a GeoJSONSeq, join con la tabella ISO,
   semplificazione per livello di zoom.
2. **Città**: `allCountries.txt` → DuckDB → filtro `feature_class = 'P'` → GeoJSONSeq con
   `geonameid`, nome, nome ASCII, popolazione, country code, admin1 code.
3. **Tiling**: `tippecanoe -Z0 -z12 --drop-densest-as-needed --extend-zooms-if-still-dropping`
   con `--maximum-tile-bytes` per tenere i tile sotto controllo; ordinamento per popolazione
   decrescente così ai bassi zoom sopravvivono le città grandi.
4. **PMTiles**: un archivio unico per i confini (piccolo, poche decine di MB) e archivi separati
   per continente per le città.

> Stima peso città: 4,8 M punti → **250-600 MB** complessivi in PMTiles. Va misurato subito
> (è la prima cosa da fare, vedi milestone M1): se sfora, si scende a `population > 0 OR
> feature_code IN (PPLA*, PPLC)` che taglia molto senza perdere i comuni veri.

**Automatizzare** la pipeline in uno script (`tools/build_tiles/`) versionato: i dati grezzi non
vanno in git, solo lo script e i checksum.

---

## 4. Installazione (app personale, nessuna distribuzione)

> **Aggiornamento 2026-09-06:** questa sezione descrive come l'app arriva sul telefono *durante lo
> sviluppo*, e in quel ruolo vale ancora. Non è più il punto d'arrivo: la distribuzione sugli store
> è ora una decisione presa, con requisiti e ordine dei passi in §14.

### 4.1 Come arriva l'app sul telefono

Build in locale con Gradle (`./gradlew assembleRelease`) → APK firmato → sul telefono. Tre modi,
tutti gratuiti e senza alcun account:

1. **ADB via cavo o wireless debugging**: `adb install -r app-release.apk`. È il metodo usato
   durante lo sviluppo e resta **sempre esente** dalla verifica sviluppatori Google.
2. **Copia manuale**: APK su Drive / Telegram / cartella USB, tap sul file dal telefono. Richiede
   di autorizzare una volta "Installa app sconosciute" per il file manager o il browser.
3. **Wireless ADB** dalla stessa rete Wi-Fi, comodo per non ricollegare il cavo ogni volta.

**Firma:** genera **un keystore tuo** (`keytool -genkeypair`) invece di usare quello di debug, e
**salvane una copia fuori dal PC**. Se lo perdi non puoi più aggiornare l'app sopra a quella
installata: dovresti disinstallare, perdendo il database dei luoghi segnati (a meno di esportarlo
prima). Il keystore non va in git.

**Aggiornamenti:** ricompili e reinstalli sopra. Stessa firma → i dati Room sopravvivono.

**Nota sulla verifica sviluppatori 2027:** dal 2027 in Italia l'installazione toccando un APK
richiederà il "flusso avanzato" per app non verificate, pensato proprio per questo caso d'uso.
L'installazione via ADB resta comunque esente senza condizioni. Nessun impatto sul progetto.

### 4.2 Conseguenze sugli asset — tutto molto più semplice

Niente store significa niente limiti di dimensione, niente Play Asset Delivery, **niente
downloader**. I file PMTiles stanno semplicemente su disco:

- Posizione: `/sdcard/Android/data/<package>/files/tiles/`, raggiungibile da Windows via USB in
  MTP senza root e senza permessi speciali.
- Li copi a mano quando la pipeline (§3) ne produce di nuovi. Nessun codice di rete, nessuna
  verifica SHA-256, nessuna gestione di ripresa del download.
- Aggiornare i dati non richiede reinstallare l'app, e viceversa: le due cose sono indipendenti.
- All'avvio l'app elenca i `.pmtiles` presenti e attiva i livelli corrispondenti; se manca il pack
  di un continente, quel continente semplicemente non mostra le città.
- Non serve neanche imbustarli negli `assets` dell'APK (che li comprimerebbe, rompendo l'accesso
  random-access e raddoppiando lo spazio occupato).

> **In pratica si è fatto il contrario, e senza pagarne il prezzo.** Il flusso qui sopra presuppone
> il cavo USB; per mandare l'app via Telegram serve **un file solo**, quindi i PMTiles stanno negli
> `assets`. I due timori del punto sopra non si avverano:
>
> - **non vengono compressi**, grazie a `noCompress += listOf("pmtiles")` in `build.gradle.kts`;
> - **non raddoppiano lo spazio**, perché non vengono estratti: essendo non compressi stanno in un
>   tratto contiguo dell'APK, e `TileFiles` ne legge un pezzo qualsiasi posizionando il canale a
>   `startOffset + offset` (`assets.openFd`). Copiarli fuori al primo avvio, come faceva lo spike,
>   avrebbe significato 87 MB nell'APK più 87 sul telefono.
>
> **La cartella su disco resta prioritaria**: se un file esiste in `tiles/`, vince su quello
> imbustato. Così si aggiornano i dati copiandoceli sopra, senza reinstallare — il vantaggio che
> §4.2 voleva, conservato.
>
> Quella cartella è ora `getExternalFilesDir`, non `filesDir`: la memoria interna non è
> raggiungibile via USB senza root, e con `filesDir` il flusso descritto qui sarebbe stato
> impossibile fin dall'inizio.

Sparisce quindi tutta l'astrazione `AssetPackProvider`: resta un `TileRepository` che elenca file
in una cartella. Un pomeriggio di lavoro in meno e una fonte di bug in meno.

**Attenzione:** la cartella `Android/data/<package>` viene cancellata alla disinstallazione. Tieni
i PMTiles anche sul PC (sono rigenerabili dalla pipeline, ma servono ore).

### 4.3 Nome e icona (2026-08-13)

Sotto l'icona il telefono scrive **Where We Go** (§0 e §13), non più `Mappamondo`: il manifest
punta a `@string/app_name`, così il nome sta in un posto solo. È la prima volta che questo
progetto ha una cartella `res/` — fino a ieri il tema veniva da `@android:style` e di risorse
proprie non ce n'erano.

L'icona è il globo di `assets-sorgente/icona-globo.png`, e nell'APK ci arriva come **icona
adattiva**: sfondo e primo piano separati, con la sagoma — cerchio, quadrato smussato, goccia —
decisa dal launcher e non da noi. Si può fare senza compromessi perché `minSdk` è 26, cioè
esattamente la versione che le ha introdotte.

La geometria è l'unica cosa che va capita, ed è la ragione per cui i PNG non sono il file
originale rimpicciolito. La tela dell'icona adattiva è 108 dp, ma i launcher ne mostrano solo i
**72 dp centrali**: i 18 dp per lato servono al ritaglio e al parallasse. Il globo è un cerchio,
quindi lo si porta a esattamente 72 dp di diametro — su maschera tonda tocca il bordo senza
tagliarsi, su maschera quadrata resta inscritto. Un'immagine a tutta tela verrebbe mangiata sui
bordi; una centrata "a occhio" sarebbe più piccola del dovuto.

I file li genera `node tools/genera_icona.js` (istantaneo), che dalla sorgente ricava, per le
cinque densità: il primo piano dell'icona adattiva, l'icona classica di riserva e la sua variante
tonda. Sono quindici PNG che nessuno deve tenere allineati a mano: si rigenerano. Due dettagli che
lo script si porta dietro e che a rifarlo a mano si sbagliano — la riduzione fa la media sui
colori **premoltiplicati per l'alfa** (altrimenti il bordo del globo si sporca di nero, ed è
proprio il bordo che si nota), e il ritaglio sull'alfa è forzato quadrato, altrimenti un
rettangolo di un pixel storto deformerebbe la sfera.

Resta a mano quello che non dipende dall'immagine: i due `adaptive-icon` in `mipmap-anydpi-v26/`,
il colore di sfondo (bianco: il globo è saturo e scuro sul bordo, su un blu qualsiasi si
impasterebbe con gli oceani; e si vede solo agli angoli delle maschere non tonde) e il
`monochrome` per le icone a tema di Android 13+, che è un mappamondo **disegnato a tratto**: il
globo dipinto, appiattito a una tinta sola, diventerebbe un disco pieno.

---

## 5. PMTiles dentro la WebView — attenzione

Il protocollo PMTiles legge porzioni di file con **HTTP Range request**. Nella WebView Android le
Range request su `file://` e su `WebViewAssetLoader` sono inaffidabili (errori `net::ERR_FAILED`
su range diversi dal primo). Due soluzioni, in ordine di preferenza:

1. **Custom `Source` JS che chiama Kotlin** — si implementa l'interfaccia `Source` di `pmtiles.js`
   con un `getBytes(offset, length)` che passa da `@JavascriptInterface` e legge con
   `RandomAccessFile` dal disco, restituendo base64. Nessun server, nessun problema di Range.
   *Costo:* overhead base64 (~33%), mitigabile con una cache LRU dei tile lato JS.
   Reso semplice dal fatto che i PMTiles sono file veri su disco (§4.2), non asset compressi.
2. **Server HTTP locale su 127.0.0.1** (NanoHTTPD) che implementa correttamente `Range`.
   Più semplice da far funzionare, ma apre una porta e consuma un thread.

> **Un solo `addProtocol`, condiviso da tutti gli archivi.** `maplibregl.addProtocol` associa un
> **unico** gestore a uno schema: chiamarlo due volte fa sostituire il primo. Con un
> `pmtiles.Protocol()` per sorgente, città e confini si escludevano a vicenda e sopravviveva solo
> l'ultimo registrato — sul telefono le città sparivano del tutto.
>
> **Sul desktop il difetto non si vede**, ed è la parte insidiosa: lì gli URL sono HTTP assoluti e
> il protocollo li risolve chiunque l'abbia registrato. Sul telefono ogni archivio è invece
> registrato per chiave (`android://<nome>`) *dentro l'istanza che lo conosce*, quindi il gestore
> sbagliato non ha modo di trovarlo. È un difetto che esiste solo con due archivi e solo su
> Android: è emerso alla prima prova reale con città e confini insieme.

**Verificato: la soluzione 1 funziona.** Su emulatore Android 15, WebView Chrome 124, un archivio
PMTiles di 6,3 MB su disco è stato letto attraverso il ponte e disegnato da MapLibre: 6 letture a
offset sparsi, 0 errori, 548 KB trasferiti, 244 geometrie renderizzate. Il rischio numero uno del
progetto è chiuso. Il ponte è in `android/app/src/main/java/com/provamappa/globe/TileFiles.kt`,
la sorgente JavaScript in `web/android-source.js`, la prova in `web/pmtiles-test.html`.

Due accorgimenti risultati indispensabili:
- `androidResources { noCompress += "pmtiles" }` nel build Gradle, altrimenti l'archivio finisce
  compresso nell'APK e la lettura casuale è impossibile;
- `WebViewAssetLoader` per servire i file su un'origine `https://` fittizia: su `file://` ogni file
  è un'origine diversa e i moduli ES vengono bloccati dal browser.

---

## 6. Rendering della mappa

### 6.1 Stile

**Tema chiaro di default, scuro opzionale.** Il B/N si presta all'inversione: il tema scuro scambia
oceano e terre (oceano quasi nero, terre grigio scuro, confini grigio chiaro) e lascia invariati i
colori di stato di §6.3, che devono restare riconoscibili su entrambi i fondi. Impostazione
persistente in Compose, applicata alla WebView con una chiamata di bridge (`setTheme(mode)`) che
scambia solo `paint` esistenti — nessuna ricostruzione di sorgenti. Non segue il tema di sistema
finché non lo si chiede esplicitamente: la scelta è dell'utente ed è una sola.

- `projection: { type: "globe" }`, sfondo oceano bianco (o grigio 5%), terre bianche, confini neri
  sottili, nessuna etichetta di default se non i nomi degli stati.
- Atmosfera/alone: `sky` layer, tenue, per dare la sensazione di sfera.
- Attenzione: MapLibre passa automaticamente da globo a Mercatore intorno a **z12**. È esattamente
  la zona di zoom in cui si lavora sulle città, quindi la transizione va provata e, se stona,
  gestita con un'animazione o alzando la soglia.

### 6.2 Logica per livello di zoom

| Zoom | Entità attive | Comportamento |
|---|---|---|
| 0 – 3.5 | Stati | Poligoni stato colorati, nessun puntino |
| 3.5 – 6 | Regioni **dei soli paesi accesi** | Crossfade stato → regione; gli altri paesi restano stati |
| 6 – 9 | Regioni + città maggiori | Compaiono i puntini |
| 9 + | Città | Tutti i centri abitati disponibili nel tile |

**Il dettaglio regionale è per paese e su richiesta.** Le regioni non si caricano tutte: l'utente
accende quelle che gli interessano (pressione lunga sullo stato) e solo quelle vengono lette e
disegnate. Gli altri paesi restano entità singole, colorate se visitate. La scelta è persistente.

> **Deciso: le regioni non sono mai attive di default.** Nemmeno agli zoom in cui potrebbero
> comparire. Finché l'utente non accende un paese, quel paese resta un poligono unico a ogni zoom.
> Oltre al carico (i numeri qui sotto), è una scelta d'uso: chi vuole giocare a "quanti stati ho
> visto" non deve trovarsi la mappa spezzettata in suddivisioni che non gli interessano. Serve
> quindi anche un interruttore globale nelle impostazioni, che spegne tutte le regioni accese in
> una volta senza perdere le marcature già fatte.

Motivo, misurato: caricare tutte le regioni costa **12,58 MB** e 3.583 poligoni all'avvio, anche
a chi non ne guarda nessuna. Con un file per paese il carico iniziale scende da **14,43 MB a
1,86 MB (−87%)** e l'Italia, quando serve, sono 80 KB. È anche la cura per il crash su
dispositivi con poca memoria (§11, rischio 3b).

Nell'app definitiva la stessa logica vale con i tile: si scaricano solo i pacchetti regionali dei
paesi accesi, invece di distribuirli tutti.

Realizzazione: `feature-state` `r` sul paese guida l'opacità del suo riempimento
(`OPACITA_STATI`), così accendere o spegnere un paese non ricostruisce nulla; la sorgente delle
regioni contiene esclusivamente i paesi attivi.

> **Trappola dello style spec, costata un bug silenzioso:** l'espressione `zoom` può stare solo al
> livello più esterno di `interpolate`/`step`. Scrivere
> `['case', ['==',['feature-state','r'],true], ['interpolate',['zoom'],…], 1]` non è valido:
> MapLibre lo segnala nell'evento `error` — che va quindi sempre agganciato — e ignora la
> proprietà, quindi l'effetto semplicemente non si vede. La forma corretta inverte la struttura:
> interpolazione sullo zoom all'esterno, valore dipendente dai dati come estremo dell'intervallo.

La transizione è un'interpolazione di opacità su `zoom`, non uno switch secco, altrimenti "salta".

### 6.3 Colori di stato

Tutto guidato da `feature-state`, zero ricostruzioni di sorgenti:

```js
// città
'circle-color': [
  'case',
  ['==', ['feature-state','s'], 'visited'], '#2e9e4f',
  ['==', ['feature-state','s'], 'wanted'],  '#f08a24',
  '#d33'   // non visitata
]
```

**Deciso: le città non visitate restano rosse.** Il timore del "tappeto rosso" agli zoom alti era
fondato quando le voci erano 4,8 M; dopo il filtro sono 450.848, e l'affollamento attorno alle
metropoli è governato dal ritardo di §2.4. Se guardando la mappa il rosso risulterà comunque
eccessivo, la via è quella già proposta — grigio chiaro di default con un'opzione "evidenzia non
visitate" — ed è un cambio di sole espressioni di stile, senza rigenerare i tile.

### 6.4 Etichette dei nomi sotto i puntini

**Deciso: sì.** Un puntino senza nome non dice nulla, e in un'app che serve a spuntare luoghi
sapere *quale* luogo sia non è decorazione.

**I glifi non sono un problema, misurato sui 450.848 nomi:**

| | caratteri |
|---|---|
| ASCII base | 4.712.957 |
| latino esteso (accenti) | 135.459 |
| cirillico, greco, CJK, arabo | **399 in tutto** |

GeoNames nella colonna `name` usa la forma romanizzata (`Bến Cát`, `Kāmārhāti`, `Pudong`), e gli
8.985 caratteri fuori dai due blocchi principali sono quasi tutti latino esteso addizionale (ḩ, ṯ,
ṟ) e diacritici combinanti. Servono quindi le sole fasce latine: **una decina di file PBF, sotto il
megabyte** per un peso del font, invece dei venti-trenta MB che avrebbero richiesto CJK, arabo e
devanagari. Vanno impacchettati nell'APK: l'app è offline, non c'è un server dei glifi.

**Due accortezze, entrambe necessarie:**

- **Collisioni.** A zoom 10 sono in mappa 380.809 città. MapLibre nasconde da solo le etichette
  sovrapposte, ma *quali* sopravvivono lo decide lui: senza governo si vede il nome del paesino e
  non quello del capoluogo. Serve `symbol-sort-key` sulla popolazione, così nelle collisioni vince
  la città più grande. È lo stesso problema di `--drop-densest-as-needed` in §2.1, con la stessa cura.
- **Prestazioni — è il rischio vero.** I layer `symbol` sono i più costosi di MapLibre: rifanno il
  collision detection a ogni spostamento. Su un Galaxy di fascia media dentro una WebView è il
  rischio 3 di §11. **Da provare su telefono presto, non a fine progetto.**

Mitigazione naturale per entrambe: mostrare le etichette **solo da uno zoom in poi** — indicativamente
dal 7-8, dove le città in mappa sono qualche migliaio invece di trecentomila.

**Realizzato nel prototipo.** Layer `places-label` in `web/app.js`, con:

- `glyphs: 'fonts/{fontstack}/{range}.pbf'` — file locali, non un servizio. Le sei fasce latine
  stanno in `web/fonts/Noto Sans Regular/`, 526 KB, licenza SIL OFL 1.1 (vedi `web/fonts/LICENZA.md`).
  Gli asset Android includono già `../web`, quindi finiscono nell'APK senza lavoro aggiuntivo.
- `minzoom: 7`, per le ragioni di prestazioni dette sopra.
- `symbol-sort-key` sulla popolazione **negata**: MapLibre nelle collisioni tiene la chiave più
  bassa, quindi senza il segno meno sopravviverebbe il nome del paesino e si perderebbe quello del
  capoluogo.
- `text-optional: true`: fra puntino ed etichetta, se lo spazio manca vince il puntino — che è
  anche l'area sensibile al tocco.
- Lo stesso `filter` dei puntini sui quartieri nascosti: senza, riapparirebbero come sole scritte.

Restano scoperti una quindicina di caratteri CJK e arabi nell'intero dataset, che si vedranno come
rettangoli vuoti. Le fasce corrispondenti si aggiungono dallo stesso pacchetto se daranno fastidio.

Regioni e stati: `fill-color` bianco / arancio, e per i visitati il riempimento a bandiera (§7).

---

## 7. Riempimento con bandiera / stemma — il punto difficile

`fill-pattern` **non** va bene: ripete l'immagine a mosaico invece di adattarla alla forma, e su
un paese grande si vedrebbero decine di bandierine.

### 7.0 Come adattare la bandiera alla sagoma — misurato sui dati

Il ritaglio "cover" (bandiera ingrandita fino a coprire il rettangolo, proporzioni rispettate) e'
la scelta ovvia ed e' **sbagliata quasi ovunque**. Quasi tutte le bandiere sono orizzontali
(proporzioni 1,5-2,0) mentre quasi tutti i paesi hanno un rettangolo di ingombro piu' alto che
largo. Censimento su 239 paesi:

| Bandiera visibile con "cover" | Paesi |
|---|---|
| meno del 25% | 11 |
| meno del 50% | 76 (32%) |
| meno del 75% | **169 (71%)** |

Esempi: Cile 17%, Irlanda 33%, Portogallo 33%, Italia 56%. Dell'Irlanda si vede solo la banda
bianca centrale, e sembra che la bandiera non compaia affatto.

Esiste una **seconda causa indipendente**: sagome che riempiono poco il proprio rettangolo. La
Russia mostra il 99% della bandiera, ma la sua sagoma occupa solo il 39% del rettangolo, quindi
dentro i confini se ne vede comunque una fascia. Norvegia 11%, Giappone 8%, USA 19%, Italia 27%.
55 paesi stanno sotto il 30%.

**Scelta fatta dopo il confronto visivo: la bandiera intera stirata sul rettangolo del blocco.**

Per una sagoma piu' alta che larga, mostrare la bandiera *intera*, *non deformata* e *grande*
sono tre obiettivi incompatibili: e' geometria, se ne possono avere due su tre. Le alternative
provate e scartate:

| Modalita' | Cosa sacrifica | Esito |
|---|---|---|
| **Deforma** (adottata) | fedelta' delle proporzioni | a occhio disturba poco, si vede sempre tutta la bandiera |
| Ritaglia (cover) | completezza | dell'Irlanda mostra la sola banda bianca: sembra non visitata |
| Estendi (intera + bordi prolungati) | dimensione | bandiera piccola al centro di una sagoma di bande stirate |
| Inscritto (rettangolo massimo inscritto) | dimensione, gravemente | il rettangolo inscritto e' quasi sempre una fascia sottile: riduce la bandiera a un francobollo. **Idea sbagliata** |
| Nucleo (zona di massa reale) | proporzioni, in modo variabile | buono sulla Russia, incoerente altrove |

Resta implementata anche una modalita' **automatica** che misura, a caselle, quanta bandiera si
vede attraverso la sagoma e sceglie di conseguenza. Non e' quella adottata, ma il codice della
misura (`flagVisibility`) e' utile e va tenuto.

**Eccezioni per paese, non regole generali.** Alcuni paesi hanno bisogno di un trattamento
speciale, ma ogni tentativo di dedurne una regola automatica ha finito per cambiare la resa di
decine di paesi che andavano bene. Meglio una tabella esplicita, con una voce per volta motivata
da una misura (`ECCEZIONI_BANDIERA` in `web/app.js`). Oggi contiene un solo caso:

- **Russia**, `ignoraIsoleMinori`: il rettangolo arrivava a 81,9° per Novaja Zemlja e le altre
  isole artiche, mentre la terraferma si ferma a 77,7° (Tajmyr). In Mercatore quei gradi valgono
  un terzo dell'altezza, quindi la banda bianca cadeva quasi tutta sull'oceano. Calcolando il
  rettangolo sui soli poligoni sopra l'1% dell'area — le isole restano colorate, per prolungamento
  dei bordi — le bande passano da 5,6/53,6/40,8% a **17,2/57,3/25,5%**. Canada e Norvegia,
  verificati, restano invariati al decimale.

Casi limite risolti a parte, indipendenti dall'adattamento:
- **blocchi di poligoni vicini** (§7.1): la Francia ne produce 5, cosi' la metropolitana ha il suo
  tricolore invece dell'1,3% di un rettangolo largo 118 gradi;
- **fasce di longitudine**: l'Antartide e' un unico poligono largo 360 gradi, irrappresentabile con
  un quad; viene reso in 3 fasce da 120 gradi che condividono il posizionamento della bandiera.

**Proiezione della maschera: Mercatore.** Confermato visivamente nello spike. La maschera va
disegnata sul canvas in coordinate di Mercatore sferico, non in latitudine lineare: e' cosi' che
MapLibre deforma il quad di una `image source`. Con l'equirettangolare la bandiera risulta slittata
rispetto ai confini, in modo tanto piu' marcato quanto piu' ci si allontana dall'equatore.
Attenzione al segno: nel canvas la `y` cresce verso il basso mentre la `y` di Mercatore cresce
verso l'alto, quindi va invertita — dimenticarlo produce un'altezza negativa e nessuna maschera.

### 7.1 Approccio consigliato: maschera a runtime + ImageSource

> **Il limite di Mercatore, ±85,051°.** Oltre quella latitudine la proiezione diverge e un
> `image source` con quelle coordinate **non viene disegnato affatto**: si vede il riempimento
> pieno e nessuna bandiera. Riguarda **un solo caso al mondo**, l'Antartide, che nei dati arriva a
> −89,999 — gli altri 241 paesi ci stanno dentro. Il taglio va applicato al bbox del cluster
> (`LAT_MAX_MERCATORE` in `flagmask.js`), **non** alle coordinate del riquadro: quel bbox serve
> anche a rasterizzare la maschera, e limitarlo solo alla fine la comprimerebbe verticalmente,
> sfalsandola rispetto alla costa.

Per ogni entità marcata come visited:

1. Si prende la geometria dell'outline (da un GeoJSON a bassa risoluzione bundle-ato, non dai tile
   che sono ritagliati).
2. Su un `<canvas>` offscreen si disegna il poligono, si applica `clip()`, si disegna sopra la
   bandiera SVG scalata al bounding box.
3. Il PNG risultante (con alfa trasparente fuori dai confini) diventa un `ImageSource` con le
   coordinate dei quattro angoli del bbox; MapLibre lo deforma correttamente sul globo.

Vantaggi: nessun asset pre-renderizzato da distribuire, funziona identico per bandiere e stemmi,
risoluzione adattiva. Costi da controllare: un canvas per entità visitata → cache LRU, generazione
solo per le entità nel viewport, tetto di ~40 immagini simultanee.

Per i paesi che attraversano l'antimeridiano (Russia, Fiji, USA con le Aleutine) serve gestione
speciale: bbox spezzato in due immagini.

### 7.2 Bassi zoom — la bandiera si vede sempre, il canvas si rimpicciolisce

**Prima soluzione, poi scartata:** sotto zoom 3 le bandiere non si disegnavano affatto e restava un
`fill-color` pieno con il colore dominante della bandiera (precalcolato in pipeline, 250 valori in
un JSON).

**Scartata alla prova sul telefono.** Allontanandosi il globo diventava monocolore e la marcatura
perdeva proprio la sua ricompensa: la bandiera è il motivo per cui si segna un paese, e la vista
d'insieme è quella in cui la si guarda di più. La soglia non era però un capriccio grafico, ma
**memoria** (§11, rischio 4): a zoom basso sono inquadrate *tutte* le entità visitate del mondo, e
un canvas da 1024 pixel per ciascuna è il caso peggiore possibile.

**La cura è dimensionare il canvas su quanto l'entità occupa davvero a schermo** — larghezza del
mondo in pixel di dispositivo, `512 · 2^zoom · dpr`, quantizzata a potenze di due. Misurato sui
bbox veri dei 239 paesi, nel caso peggiore in cui siano **tutti visitati e tutti inquadrati**:

| zoom | canvas fisso da 1024 | canvas adattivo |
|---|---|---|
| 0 | 777 MB | **21 MB** |
| 2 | 777 MB | 100 MB |
| 4 | 777 MB | 345 MB |

I 777 MB sono la ragione per cui la soglia esisteva. Le due difese ora si completano: **a zoom
basso** tutto è inquadrato ma minuscolo, **a zoom alto** i canvas sono grandi ma in vista ce ne
sono pochi e lo scarico fuori vista (`sfoltisciBandiere`) funziona. San Marino resta a 128 pixel a
ogni zoom, la Russia parte già da 512.

Tre conseguenze, tutte necessarie:

- **il lato è per fascia, non per entità.** Sull'ingombro complessivo la Francia — dalla Guyana a
  Riunione — chiederebbe il lato massimo a qualunque zoom, e il risparmio sparirebbe proprio dove
  serve. Le fasce di uno stesso blocco spezzato (l'Antartide) hanno per costruzione lo stesso
  ingombro, quindi non c'è salto di nitidezza fra l'una e l'altra.
- **avvicinandosi la maschera va rifatta.** È rasterizzata una volta sola: senza un secondo passo
  su `moveend`, una bandiera nata a zoom 0 resterebbe da 128 pixel anche a zoom 8. Solo verso
  l'alto — allontanandosi, una maschera troppo fine non si vede e rifarla costerebbe soltanto.
- **il tetto dei 120 livelli va reso applicabile.** Da lontano non c'è nulla fuori vista da
  scaricare, quindi prima restava semplicemente sforato. Si cede allora sulle **più piccole**, dove
  la bandiera vale pochi pixel e il colore dominante la sostituisce senza che si noti. Vanno però
  ricordate (`bandiereMinute`), altrimenti la spazzata successiva le rimette e si rasterizza a
  vuoto a ogni panoramica; e una marcatura esplicita dell'utente vince sempre sulla rinuncia.

**Il colore dominante resta**, ma cambia ruolo: non è più ciò che si vede a zoom basso, è ciò che
sta sotto ogni bandiera — quello che compare mentre la maschera si rasterizza e per le entità a cui
il tetto rinuncia.

### 7.3 Stemmi delle regioni — problema aperto

Non esiste un dataset libero, completo e coerente di stemmi per le ~4.600 suddivisioni mondiali.
Wikidata (proprietà P94) copre bene Europa e Nord America, molto male il resto, e le immagini su
Commons hanno licenze eterogenee (alcune non ridistribuibili, alcuni stemmi sono anche protetti
da normative nazionali indipendentemente dal copyright).

Strategia proposta:
1. Estrarre da Wikidata la lista con licenza per ogni immagine, tenere **solo** PD e CC-BY/CC-BY-SA.
2. Bundle-are quelle (probabilmente 1.500-2.500 regioni coperte, con file di attribuzione in app).
3. Per le regioni scoperte: bandiera nazionale desaturata + bordo verde, oppure verde pieno.
4. Mai scaricare al volo da Commons senza cache e senza attribuzione.

Questo è un lavoro di curation, non di codice: va messo in conto come attività a sé.

---

## 8.1 Regole dei tre stati — definizione normativa

I tre stati sono **non visitato**, **wanted** (da visitare) e **visited**. Queste quattro regole
sono la definizione autorevole del comportamento: ogni dubbio futuro si risolve qui.

**Regola 1 — regioni spente.** La nazione è un'entità unica e porta direttamente uno dei tre
stati. Nessun calcolo, nessuna derivazione.

**Regola 2 — regioni accese, stato della nazione.** Se **almeno una** regione è marcata, lo stato
della nazione non è più impostabile direttamente: si ricava dalle sue regioni.

| condizione | stato della nazione |
|---|---|
| almeno una regione è *visited* | **visited** |
| nessuna *visited*, almeno una *wanted* | **wanted** |
| **nessuna regione marcata** | la nazione **conserva il proprio stato** (Regola 3) |

**Regola 3 — accensione delle regioni: nessuna ereditarietà.** Le regioni nascono **vuote** e la
nazione conserva lo stato che aveva. La derivazione della Regola 2 entra in vigore solo dal momento
in cui viene marcata almeno una regione. Gli stati regionali salvati in passato restano dov'erano.

> **Perché non si eredita più.** La regola precedente copiava lo stato della nazione su tutte le
> sue regioni alla prima accensione, per non perdere il segno quando la Regola 2 prendeva il
> comando. Ma affermava molto più di quanto l'utente avesse detto: *«sono stato in Italia»*
> diventava *«sono stato in tutte e venti le regioni italiane»*, e aprire il dettaglio per dire
> **dove** si era stati lo trovava già tutto spuntato. Il segno si conserva meglio lasciandolo
> sulla nazione che copiandolo su venti entità mai visitate.

**Regola 4 — spegnimento delle regioni.** La nazione conserva l'aggregato calcolato con la
Regola 2 al momento dello spegnimento; se nessuna regione era marcata, tiene lo stato che già
aveva. Gli stati regionali restano salvati. Accendere e rispegnere senza toccare nulla non cambia
niente.

**Regola 5 — modifica della nazione a regioni spente.** Cancella gli stati regionali salvati di
quella nazione. Serve a risolvere il conflitto fra Regola 1 e Regola 3: senza, marcare una
nazione come non visitata a regioni spente e poi riaccenderle farebbe riemergere un vecchio
dettaglio che contraddice la scelta appena fatta. Detto in breve: **l'ultima cosa che tocchi
vince**.

Le regole di transizione sono coerenti fra loro: accendere e rispegnere senza toccare nulla
lascia lo stato invariato, e il dettaglio regionale sopravvive a meno che non sia l'utente stesso
a contraddirlo dal livello nazionale.

**Regola 6 — città.** Sono pallini con gli stessi tre stati, ma **completamente indipendenti**
da nazione e regione: nessuna ereditarietà, nessuna aggregazione in nessuna delle due direzioni.
Segnare Milano non cambia la Lombardia né l'Italia, e viceversa.

| stato | colore |
|---|---|
| non visitata | **rosso** |
| in programma | arancio |
| visitata | verde |

Compaiono solo oltre una soglia di zoom, per non coprire la mappa di pallini, e il raggio è
tarato perché siano centrabili col dito: il cerchio disegnato è anche l'area sensibile al tocco.

### Note di realizzazione

- La Regola 2 è applicata a ogni modifica di una regione (`aggiornaPaeseDaRegioni`), non solo
  allo spegnimento, così il colore a basso zoom è sempre aggiornato.
- `statoDaRegioni` restituisce **`null`**, non `'none'`, quando nessuna regione è marcata: sono due
  cose diverse — "le regioni dicono che non ci sei stato" contro "le regioni non hanno nulla da
  dire". È il perno della Regola 3, e confonderle rimetterebbe l'ereditarietà dalla finestra.
- Ricostruendo la sorgente delle regioni, gli stati grafici delle regioni **senza** stato salvato
  vanno azzerati esplicitamente (`removeFeatureState`), non solo saltati: MapLibre li conserva per
  identificativo anche quando la sorgente viene ricostruita, e restavano colorate regioni che non
  avevano più alcuno stato — si vedeva riaccendendo le regioni dopo che la Regola 5 aveva
  cancellato il dettaglio.
- Toccare la nazione con le regioni accese applica lo stato a **tutte** le sue regioni: è la
  scorciatoia per "ci sono stato" senza dettagliare, e resta compatibile con la Regola 2.
- I contatori tengono stati e regioni separati: sommarli darebbe numeri privi di significato.
- Spegnendo le regioni vanno rimossi esplicitamente i loro livelli-bandiera: sono `image source`
  indipendenti e non spariscono svuotando la sorgente dei poligoni.

## 8. Stato utente

Room, tabella unica:

```kotlin
@Entity(primaryKey = ["entityType", "entityId"])
data class MarkEntity(
  val entityType: String,  // "country" | "region" | "city"
  val entityId: String,    // "ITA" | "IT-52" | "3169070"
  val status: String,      // "visited" | "wanted"
  val markedAt: Long,
  val note: String? = null,
  val visitYear: Int? = null
)
```

- All'avvio si legge tutto (sono al massimo qualche migliaio di righe) e si spinge in WebView con
  una sola `bulkState()`.
- `setFeatureState` va **riapplicato quando arrivano nuovi tile**: agganciarsi all'evento
  `sourcedata` e riapplicare gli stati per le feature appena caricate. È un errore classico:
  altrimenti scrollando la mappa i colori spariscono.
- **Backup/export**: JSON esportabile e importabile (e Android Auto Backup attivo). Perdere anni di
  segnalibri è il fallimento peggiore possibile per un'app del genere.
- Propagazione: marcare una città come visitata **non** marca automaticamente lo stato; però le
  statistiche mostrano "hai visitato 3 città in Francia, vuoi segnare la Francia?" come suggerimento.

---

## 8.2 Importare da un'app precedente (2026-08-13)

**Fatto**, per travasare i segnalibri di *Places Been* — una decina di nazioni e circa 400 città —
senza rimarcarle a dito. Lo strumento è `tools/importa_elenco.js`:

```
node tools/importa_elenco.js elenco.txt backup-attuale.json
```

**Passa dal ripristino, non da un APK con i dati dentro.** Era la richiesta iniziale e non
funzionerebbe: le marcature non stanno nell'APK ma nel `localStorage` della WebView, cioè nella
cartella dati del package, che un'installazione sopra non tocca. Servirebbe codice nuovo che al
primo avvio legge un seme dagli asset e decide se sovrascrivere — un pezzo delicato aggiunto per
usarlo una volta sola. Il ripristino invece esiste già, è provato, ed è reversibile: se il
risultato non convince si ricarica il backup di prima.

**Si fonde, non si sostituisce.** Il ripristino dell'app rimpiazza tutto lo stato, quindi lo
strumento vuole *anche* il backup attuale e per ogni voce tiene il valore più forte fra vecchio e
nuovo (`visited` > `wanted` > `none`). Regioni e `regioniAttive` si ricopiano intatte: l'import non
le tocca.

**Le regioni non si importano**, si marcano a mano. Non è una limitazione tecnica ma una misura:
il **42,7% dei nomi di regione (1.525 su 3.570) è anche il nome di una città dello stesso paese**,
tipicamente il capoluogo — Harare, Lusaka, Ibb. Da un elenco di nomi nudi si sbaglierebbe una volta
su due proprio dove i due insiemi si toccano.

**Il riconoscimento dei nomi va in quattro tentativi**, dal più sicuro al più azzardato, e quello
che ha funzionato finisce nel rapporto, così si sa di quali righe fidarsi. Sull'elenco vero — 11
nazioni e 367 città, importate il 2026-08-13 — sono andate così:

| tentativo | cosa risolve | quante |
|---|---|---:|
| nome esatto | `Adro`, `Rijeka`, `Melliea`→`Mellieħa` | 318 |
| nome alternativo dell'indice | `Firenze`→`Florence`, `Losanna`→`Lausanne`, `Lubljana`→`Ljubljana` | 25 |
| sorgente grezza GeoNames | `Jesolo`→`Iesolo`, `Klausen`→`Chiusa`, `Mdina`→`Imdina` | 5 |
| refuso a lettera ribattuta | `Viicenza`→`Vicenza`, `Azzzano Mella` | 3 |
| **totale importate** | | **351** |

**Il risultato finale**, unendo il secondo elenco (`DA VISITARE.txt`, 12 nazioni e 83 città):
**16 nazioni e 433 città** — 11 nazioni e 351 città visitate, 5 nazioni e 82 città in programma.
Non importata **una sola città su 450**, Marina di Ragusa, che è frazione di Ragusa (già in
elenco). Il secondo giro è la prova che la fusione regge: zero voci del primo import alterate.

> **La somiglianza larga è stata tolta, ed è la correzione più importante di questo strumento.**
> Alla prima passata «distanza di edit ≤ 2» aveva prodotto `Duino`→**Luino**, `Murano`→**Marino**,
> `Folzano`→**Bolzano**, `Brozzo`→**Arezzo**, `Bornato`→**Corato**: posti veri, esistenti, e
> completamente diversi da quelli scritti — cioè sei città marcate al posto sbagliato senza che
> niente lo segnalasse. Sei sbagliate su tredici. Oggi entra solo la classe di refuso in cui i due
> nomi diventano identici schiacciando le lettere ripetute; ogni altra somiglianza è una
> **proposta** nell'elenco di ciò che resta da fare a mano. L'ordine conta anche: la somiglianza
> gira **dopo** il ripescaggio dalla sorgente grezza, altrimenti ruba i nomi che avrebbero una
> corrispondenza vera (`Jesolo` finiva su `Iesolo` per caso invece che per la via giusta).

Il terzo tentativo esiste per il filtro `stessaIniziale` di §9.5: l'indice dell'app **non porta**
gli esonimi che cambiano lettera iniziale. Qui non ci sono i vincoli di dimensione dell'indice, e
`allCountries.txt` è già sul disco — 13,5 M di righe lette in 7 secondi, leggendo solo il primo
campo di ogni riga e spezzando in colonne unicamente quelle poche decine di migliaia il cui
identificativo appartiene ai paesi dell'elenco.

**Fra omonimi vince il più popoloso, ma la scelta si dichiara.** In Messico ci sono 207 «El
Paraíso»: prenderne uno in silenzio sarebbe un'invenzione, quindi se il secondo candidato è almeno
un quinto del primo la riga finisce fra i dubbi. Oltre al rapporto lo strumento scrive un file di
**corrispondenze con una riga per ogni nome dell'elenco** — con quattrocento città serve poter
ripassare tutto, non solo i casi segnalati.

> **Per un paese con le regioni accese e almeno una regione marcata, lo stato importato della
> nazione non sopravvive al ripristino**: lo ricalcola la Regola 2 di §8.1, che con le regioni
> accese le considera la fonte della verità. Non è un difetto dell'import ed è giusto che vada
> così; va solo saputo prima, perché fa sembrare che una nazione «non sia entrata».

### Le frazioni non ci sono, e l'elenco di ciò che resta da fare deve dirlo

Delle 19 città non importate, **15 non sono importabili affatto**, e non per un difetto del
riconoscimento: Murano, Porto Cervo, Lido di Jesolo, Madonna di Campiglio, Duino, Folzano,
Bornato, Brozzo, Pievedizio, Fantasina esistono in GeoNames con la loro popolazione — Lido di
Jesolo ne ha 10.523 — ma **sono frazioni, non comuni**, e per l'Italia `filtro_citta.js` tiene
solo le sedi amministrative (`SOLO_SEDI`, riga 42: *8.378 sedi contro 7.896 comuni reali*).
Verificato: nessuna di loro è in `cities.ndjson`, il file da cui nascono **sia l'indice sia i
tile**, quindi non stanno nemmeno sulla mappa.

Da qui una distinzione che l'elenco delle cose da fare a mano tiene separate, perché sono due
lavori diversi:

- **da cercare a mano** — l'app ce l'ha, non l'ho saputa agganciare io (4 casi: due refusi da
  correggere, `Golfo arnaci` e `Poatija`, e due nomi che non risolvo, `Brebbero` e
  `Buffalore-Bettole`);
- **non importabili** — nell'app non ci sono e non ci saranno: mandare qualcuno a cercarle
  sarebbe farlo girare a vuoto. L'unica mossa possibile è marcare il comune di cui fanno parte,
  che nella maggior parte dei casi è già nell'elenco (Murano→Venezia, Porto Cervo→Arzachena,
  Lido di Jesolo→Jesolo, Prosecco-Contovello→Trieste, Folzano e Fantasina→Brescia).

La classificazione è automatica e non costa una passata in più: si fa nello stesso giro su
`allCountries.txt`, con una prova di espressione regolare sulle righe il cui identificativo non
appartiene all'indice.

### Due trappole del secondo elenco, che valgono per qualunque prossimo import

> **`DA VISITARE` contiene `visit`.** L'elenco dei desideri è arrivato con quell'intestazione,
> senza cancelletto. Riconoscere le sezioni solo dal `#` l'avrebbe presa per una nazione e avrebbe
> importato **83 città come visitate invece che in programma** — un errore muto, del genere che si
> scopre mesi dopo guardando la mappa. Ora l'intestazione si riconosce anche senza cancelletto, e
> la domanda «è una lista di desideri?» viene **prima** di «è una lista di visitati?», altrimenti
> `davisitare` cade nel ramo sbagliato per via di quella sottostringa.
>
> **Nominabile non vuol dire marcabile.** Gibilterra ha un codice ISO3, ha due città nell'indice —
> Gibraltar, 26.544 abitanti — ma **non è fra le 242 entità di `countries.geojson`**: sulla mappa
> come paese non esiste. Scriverle uno stato metteva nel backup una chiave che non corrisponde a
> nulla, senza errori e senza colore. Ora lo strumento marca una nazione solo se l'app ce l'ha, e
> lo dice quando non è così — ma le sue **città** le importa lo stesso, perché quelle ci sono.

---

## 9. Interfaccia dell'app

Questa sezione descrive **l'app vera in Compose**, non il prototipo web. Il prototipo resta il
banco di prova di mappa e dati; la sua barra laterale fissa a destra è un attrezzo da officina e
nell'app non esiste.

### 9.0 Terminologia — è normativa

Tutto ciò che l'utente legge è in italiano, e i tre stati si chiamano **sempre** così:

| stato | come si chiama | colore |
|---|---|---|
| `none` | **non visitata** | rosso |
| `wanted` | **in programma** | arancio |
| `visited` | **visitata** | verde |

> **Le chiavi salvate restano in inglese.** `visited` / `wanted` / `none` sono i valori scritti nel
> database e nell'export: tradurli spezzerebbe i salvataggi esistenti e i backup. L'italiano vive
> solo nello strato di presentazione. Confondere le due cose è il modo classico di perdere i dati
> di un utente in un aggiornamento.

### 9.1 Struttura dello schermo

**La mappa occupa tutto.** Niente pannelli fissi: lo schermo di un telefono è piccolo e il globo è
il contenuto, non un riquadro dentro una cornice.

- **Menu dietro un pulsante.** Impostazioni, statistiche, elenchi e backup stanno in un pannello
  che si apre da un pulsante e si richiude. Non è mai visibile mentre guardi la mappa.
- **Scheda di selezione in alto.** Vedi §9.2.
- **Ricerca** raggiungibile dalla stessa barra del pulsante menu.

> **Le due cose che una schermata piena deve fare, e che i pannelli fanno da sé.** Menu e
> statistiche sono `ModalBottomSheet`: gestiscono il tasto indietro e le barre di sistema senza che
> nessuno ci pensi. Ricerca e galleria sono invece `Surface` a tutto schermo, e lì entrambe le cose
> vanno scritte a mano — non erano scritte, e il difetto è stato trovato **rileggendo prima di
> installare**, non provando:
>
> - **`BackHandler`.** Senza, il tasto indietro non chiude la schermata: **esce dall'app.** Sulla
>   ricerca c'era da sempre. Deve fare la stessa cosa del pulsante in alto a sinistra — dalle città
>   risale alla nazione, poi chiude — perché due comandi per la stessa cosa non possono comportarsi
>   in due modi.
> - **`safeDrawingPadding`.** Con `targetSdk = 35` Android 15 disegna da bordo a bordo: senza, il
>   campo di ricerca finisce sotto l'orologio e i pulsanti in fondo sotto la barra dei gesti. La
>   scheda di selezione lo faceva già (`statusBarsPadding`), le schermate piene no.

### 9.2 La scheda di selezione — toccare non cambia più nulla

**Toccare una nazione, una regione o una città la SELEZIONA e basta.** Non ne cambia lo stato.

Si apre una scheda nella parte **alta** dello schermo con: il nome, la gerarchia (città → regione →
nazione), la popolazione se è una città, lo stato attuale, e **tre azioni esplicite** — *non
visitata*, *in programma*, *visitata*.

> **Perché sparisce il ciclo a tocco.** Finora un tocco faceva ruotare lo stato
> `non visitata → visitata → in programma → non visitata`. È comodo da programmare e pessimo da
> usare: non puoi selezionare qualcosa per guardarlo senza modificarlo, un tocco accidentale
> cambia i dati, e per passare da "visitata" a "non visitata" ne servono due. La funzione `cycle()`
> non serve più.
>
> **Perché in alto e non in fondo.** Il dito e la cosa toccata stanno in basso: una scheda che sale
> dal fondo coprirebbe proprio ciò che hai appena selezionato. In alto resta visibile.
>
> **Il prezzo, dichiarato:** i tre bottoni finiscono lontani dal pollice. Da verificare sul
> dispositivo reale, e se dà fastidio la via d'uscita è tenere le informazioni in alto e i tre
> bottoni in una barra in fondo — non spostare tutto giù.

### 9.3 Elenchi: nazioni → città

Il menu contiene un **elenco delle nazioni**. Aprendone una si ottiene l'elenco delle sue città,
**ordinate per popolazione decrescente** e caricate a blocchi mentre si scorre, con una ricerca
interna all'elenco. Ogni riga porta i tre stati, impostabili senza aprire altro.

L'ordinamento per popolazione non è un dettaglio: **il Messico ha 118.418 città, la Francia 34.230,
gli Stati Uniti 30.552**, mentre la mediana per paese è 108. Un elenco alfabetico sarebbe
inservibile proprio nei paesi grandi; per popolazione, le prime venti righe sono quelle che uno
cerca davvero.

### 9.4 Ricerca

Copre **tutte le 440.273 città** più le 242 nazioni. Trova per nome, anche digitando senza accenti
(`Kamarhati` per `Kāmārhāti`). Selezionando un risultato la mappa ci vola sopra e si apre la scheda
di §9.2. Ha un **pulsante suo sulla mappa**, accanto al menu: dentro il menu era sepolta sotto due
tocchi e un'etichetta generica.

> **FTS5 non funziona su Android: usare FTS4.** L'SQLite di Node lo supporta e quello di Android
> no, quindi l'indice si generava senza errori e sul telefono la ricerca **non trovava mai una
> città** — la query falliva e restituiva una lista vuota. Le nazioni si trovavano lo stesso perché
> usano `LIKE`: è stata quella asimmetria a indicare la causa. FTS4 c'è nell'SQLite di Android da
> sempre.
>
> Il testo digitato va **ripulito da ciò che per FTS è sintassi** — virgolette, asterischi,
> parentesi, trattini — altrimenti la query fallisce e il sintomo è di nuovo "non trova nulla".

> **I nomi sono in forma internazionale: senza alias non si trova niente in italiano.** GeoNames
> scrive `Rome`, `Milan`, `Florence`, quindi cercando *Roma* o *Firenze* non usciva nulla —
> proprio per le città più note, che sono quelle che uno cerca. La cura sono gli `alternatenames`,
> che quei dati contengono.
>
> **Prenderne i primi N non basta**: sono in ordine alfabetico, e per Venezia i primi otto danno
> `Benatky`, `Benetia`, `Benetke` mentre `Venezia` sta alla posizione 27 su 66. Il criterio adottato
> è **l'iniziale condivisa** con il nome internazionale — Venezia/Venice, Roma/Rome,
> Firenze/Florence, Napoli/Naples, Monaco/Munich — che scarta da sé le traslitterazioni da altre
> lingue. Tetto di 12 alias, alzato a 40 sopra i centomila abitanti, perché Londra e Parigi hanno
> decine di varianti con la stessa iniziale e il tetto si riempiva prima di arrivare all'italiano.
>
> **Misurato su venti nomi italiani di città note: ne trova diciassette.** Restano fuori Varsavia,
> Pechino e Città del Messico, che cambiano iniziale: è il limite dichiarato del criterio.

### 9.5 L'indice — il pezzo che manca

**I tile non si possono interrogare.** Portano solo ciò che è inquadrato: né l'elenco delle città
di una nazione né la ricerca possono uscire da lì. Serve un **indice separato**, cioè un database
SQLite generato in pipeline e imbustato nell'APK:

```
citta(geonameid, nome, nome_ascii, paese, popolazione)  +  indice FTS su nome e nome_ascii
```

- Le **nazioni non ci vanno**: sono 242, stanno già in memoria dal GeoJSON delle sagome.
- Le **regioni** nemmeno, per ora: sono 3.583 e si possono tenere in memoria allo stesso modo.
- **Misurato: 56,8 MB**, e l'APK passa da 101 a 163. Erano 41,8 MB prima di aggiungere i nomi
  alternativi di §9.4, che valgono quindi 15 MB — il prezzo per trovare le città in italiano.
- L'insieme delle città viene dallo stesso `cities.ndjson` che alimenta i tile, così elenco,
  ricerca e mappa non possono divergere. Da `allCountries.txt` si prendono in più i soli nomi
  alternativi, che nei tile non stanno perché li gonfierebbero.

> **SQLite ha bisogno di un file vero**: non sa leggere da dentro l'APK, al contrario dei PMTiles
> che invece si leggono in posto (§4.2). Quindi al primo avvio l'indice si copia fuori una volta
> sola, e la copia va confrontata per dimensione con `assets.open().available()` — **non** con
> `openFd().length`, che funziona solo sugli asset non compressi ed è la strada dei PMTiles. Usare
> `openFd` qui solleva un'eccezione e l'indice non si apre affatto: il sintomo è "indice non
> disponibile" su elenchi e ricerca.

> **Gli esonimi che cambiano iniziale non sono cercabili, ed è una scelta.** Il filtro
> `stessaIniziale` di `prepara_indice.js` tiene solo i nomi alternativi che cominciano con la
> stessa lettera del nome internazionale: senza, Venezia si porta dietro `Benatky`, `Benetke` e
> ogni traslitterazione slava, e i tetti di 12/40 alias si riempiono di roba inutile. Il prezzo,
> già scritto nel commento di quella funzione, è che **`Colonia` non trova `Köln`**, `Salonicco`
> non trova `Thessaloníki`, `Amburgo` non trova `Hamburg`, `Città del Messico` non trova
> `Mexico City`. Vale per la ricerca dentro l'app, non per l'importazione di §8.2, che quei nomi
> se li va a ripescare dalla sorgente grezza.

---

### 9.6 «Guarda com'è» dentro l'app — la galleria di Commons

**Deciso e realizzato.** Il pulsante non apre più solo il browser: per le **città** apre una
schermata dell'app con le fotografie del posto, prese da **Wikimedia Commons**. Per **nazioni e
regioni** resta il Custom Tab, con le query di §9.2.

**Perché Commons e non un motore di immagini.** È l'unica fonte compatibile con §0: nessuna chiave,
nessun account, nessun costo. Unsplash, Flickr e la Custom Search di Google vogliono tutte una
registrazione. La ricerca è `generator=geosearch`, «le foto geolocalizzate attorno a questo punto»:
ha senso su un centro abitato — di cui abbiamo lat/lon — e non su una nazione, dove le foto vicine
al centroide non c'entrano nulla col paese. È questa, e non la pigrizia, la ragione della divisione
fra città e resto.

**Il permesso `INTERNET` ora c'è.** Era l'unica app senza permessi, e il manifest lo dichiarava con
un commento. Finché la pagina la apriva il browser la rete la usava lui; scaricando le foto la usa
l'app. È di livello *normale* — nessuna finestra all'utente, nessun accesso a dati suoi — e tutto il
resto continua a funzionare in aereo. È l'unico permesso aggiunto: il secondo che si vede nell'APK,
`DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, lo dichiara `androidx.core` ed era già lì.

#### La copertura è geografica, ed è molto disuguale — misurata prima di scrivere il codice

Su un campione stratificato di 450 città dell'indice:

| insieme | 0 foto entro 2 km | ≥5 foto entro 2 km | 0 foto entro 10 km | ≥5 foto entro 10 km |
|---|---:|---:|---:|---:|
| **una città a caso dell'indice** | **57%** | 28% | **23%** | 63% |
| Germania | 5% | 90% | 0% | 100% |
| Italia | 15% | 75% | 0% | 100% |
| Francia | 15% | 65% | 0% | 100% |
| Stati Uniti | 30% | 55% | 0% | 100% |
| Austria | 15% | 50% | 0% | 100% |
| Indonesia | 70% | 10% | 5% | 65% |
| Perù | 80% | 15% | 30% | 30% |
| **Messico** (27% dell'indice) | 85% | 10% | 35% | 60% |
| Romania | 90% | 5% | 5% | 60% |
| Cina | 90% | 10% | 55% | 25% |

**La prima misura diceva 92% ed era sbagliata due volte.** Vale la pena tenerne memoria, perché
sono due errori che si rifanno facilmente:

1. **Stratificare per popolazione misurava la geografia senza dirlo.** I paesini da 1-5 k
   risultavano coperti *meglio* delle cittadine da 5-20 k — perché la prima fascia è fatta di
   villaggi francesi e austriaci e nella seconda erano capitati Brasile, India e Tanzania. L'asse
   giusto è il paese, non la taglia. È lo stesso errore che §2.1 evita con la tabella per paese.
2. **L'archivio orbitale.** Commons ospita le fotografie degli astronauti, geotaggate sul punto
   della Terra inquadrato: `ISS043-E-240293 - View of Earth.jpg`. Sono l'**11% di tutti i
   risultati**, e nei paesi scoperti erano la maggioranza di ciò che si trovava — cioè proprio dove
   falsavano la conclusione. Il filtro `ORBITALE` in `GalleriaCommons.kt` le toglie.

#### Cosa ne discende, scritto nel codice

- **Una sola chiamata a 10 km, non due.** `geosearch` restituisce già in ordine di distanza, quindi
  chiedere il raggio largo e guardare i primi equivale a cercare prima vicino, con una richiesta
  invece di due. Il taglio fra «vicine» e «nei dintorni» si fa in casa, a 2 km.
- **La distanza sta sotto ogni foto.** Passando da 2 a 10 km il «nessuna foto» scende dal 57% al
  23%, ma quelle foto sono di *un altro posto*: il raggio largo non misura la copertura, la
  nasconde. Mostrarle senza dirlo sarebbe una bugia, quindi si scrive «a 6,4 km».
- **Il pulsante «cerca sul web» è sempre in fondo allo schermo**, non in un ramo d'errore: per la
  maggioranza dell'indice — Messico, Cina, Perù — è l'unica strada che porta a qualcosa.
- **Autore e licenza sotto ogni foto**, da `extmetadata`: su Commons sono in gran parte CC BY o
  BY-SA, che l'attribuzione la chiedono. È lo stesso punto che §7.3 segnala per gli stemmi.

> **Il tetto dell'API, che costava una galleria povera senza un errore.** Chiedendo 50 risultati la
> risposta è completa; chiedendone 60 torna **a metà** — `imageinfo` ne elabora 50 per richiesta e
> `coordinates` appena **10**, e la risposta arriva con un token `continue` invece che con un
> errore. A Roma significava dieci foto invece di cinquanta, proprio dove Commons è ricchissimo.
> Cura: `ggslimit=50` **e** `colimit=50`, più un avviso nel log se `continue` ricompare.

> **Wikimedia pretende uno `User-Agent` descrittivo**: con quello di default risponde 403. È la
> causa numero uno per cui «l'API gratuita non funziona».
>
> **E la regola vale due volte, cosa che è costata un difetto vero (2026-08-13).** L'header era
> messo sulle chiamate all'API, ma le *fotografie* non le scarica quel codice: le scarica Coil, con
> OkHttp, che si presenta come `okhttp/4.x`. A quello `upload.wikimedia.org` risponde **403**, e il
> sintomo è ingannevole — la galleria si apriva con tutti i suoi riquadri, titolo, distanza, autore
> e licenza al posto giusto, e dentro il grigio dello sfondo. Sembrava un problema di immagini,
> era lo stesso 403 di sopra su un altro host. Cura: le miniature si chiedono con un
> `ImageRequest` che porta `GalleriaCommons.UA`, e per questo la costante non è più privata.
> Verificato con `curl`: `okhttp/4.12.0` → 403, UA descrittivo → 200.

---

## 9-bis. Altre interazioni

> **Due trappole del tocco, entrambe costate un difetto vero.**
>
> **`queryRenderedFeatures` non garantisce l'ordine dei risultati.** Il codice prendeva `hits[0]`
> dando per scontato che fosse il livello più in alto: bastava che uscisse prima `countries-fill`
> perché toccare una regione marcasse l'intero stato — e con le regioni accese `impostaPaese`
> applica lo stato a *tutte* le regioni, quindi il dettaglio spariva. Va scelto esplicitamente il
> livello più specifico fra quelli colpiti (città → regione → stato), mai il primo che torna.
>
> **La soglia del tocco deve coincidere con quella del disegno.** Le regioni si interrogavano da
> `regionFull` (zoom 5) ma si disegnano da `regionStart` (3,5), sfumando fra i due: nella fascia
> intermedia si vedevano senza poterle toccare, e il tocco cadeva sulla nazione sottostante.
> Ciò che si vede dev'essere ciò che si tocca.
- **Approfondisci** → Chrome Custom Tab su una ricerca immagini (`https://www.google.com/search?tbm=isch&q=…`),
  più scorciatoie a Wikipedia e Google Maps. Nessuna API key, nessun costo. Da segnalare
  chiaramente all'utente che questa funzione richiede la rete, dato che il resto è offline.

  > **La query non è la riga della scheda, ed è un campo a sé.** Si riusava `gerarchia`, che per una
  > città porta la popolazione: si finiva a cercare `Milan 1.378.689 abitanti · IT`, cioè il nome
  > del posto annegato fra cifre e sigle che portano fuori strada. Ora il ponte manda un campo
  > `ricerca`, composto da `terminiRicerca` in `web/app.js`:
  >
  > | entità | query |
  > |---|---|
  > | nazione | `Italia attractions -map -flag` |
  > | regione | `Lombardia Italia attractions -map -flag` |
  > | città | `Milano Italia -map -flag` |
  >
  > **Il paese accompagna sempre regione e città**, perché di Springfield ce ne sono decine. Non la
  > regione accanto al nome di una città: restringe a immagini di cartine.
  >
  > **`attractions` c'è per nazioni e regioni, non per le città.** Porta a fotografie di luoghi
  > invece che a pagine istituzionali e a stemmi, ma su un comune piccolo non trova nulla e
  > restringe troppo. **`-map -flag`** vale ovunque: toglie ciò che di quel nome esce per primo e
  > non è il posto — cartine e bandiere.
  >
  > **L'ISO2 va confrontato a cassa unica.** Nel GeoJSON degli stati è minuscolo (`it`), perché lì
  > serve a comporre il nome del file della bandiera (`flags/it.svg`), mentre GeoNames scrive il
  > codice paese maiuscolo. Misurato prima di accorgersene: **zero città su 440.273** trovavano il
  > proprio paese — e non si sarebbe visto un errore, solo la sigla al posto del nome. Corretto:
  > **99,95%**. Le 199 scoperte sono i territori francesi d'oltremare (Mayotte, Riunione,
  > Guadalupa, Martinica, Guyana), che in Natural Earth stanno dentro la Francia e non hanno un
  > ISO2 proprio; per loro resta la sigla, e il nome distintivo rende la ricerca comunque buona.
- **Ricerca**: tabella FTS4 su nome + nome ASCII + paese, generata in pipeline e distribuita come
  DB SQLite pre-popolato (~4,8 M righe, indicizzato: qualche centinaio di MB → probabilmente da
  limitare alle città sopra una soglia, oppure ricerca gerarchica paese → regione → città).
- **Long press** su una regione → marca l'intera regione.

---

## 10. Statistiche e condivisione

- % di stati visitati (su 195), per continente, numero di città, "world domination %".
- Timeline per anno se l'utente compila `visitYear`.
- Export dell'immagine del globo in PNG per condividerla — è la funzione che fa girare queste app.

---

## 11. Rischi principali

| # | Rischio | Mitigazione |
|---|---|---|
| 1 | Range request PMTiles rotte in WebView | Custom `Source` via bridge Kotlin — **da provare in M0** |
| 2 | Peso dati città eccessivo per download e spazio su disco | Pack per continente on-demand; soglia di popolazione |
| 3 | Performance WebView su Galaxy di fascia media | Test presto su device reale; ridurre i punti per tile |
| 3b | **Memoria**: con 2 GB di RAM il processo di rendering va in crash caricando i GeoJSON grezzi del prototipo (13 MB di regioni). Con 4 GB carica in 5 s | Confermato in emulatore. È la ragione per cui i dati definitivi **devono** essere tile vettoriali e non GeoJSON: i tile si caricano a pezzi, i GeoJSON tutti insieme |
| 4 | Maschera bandiera lenta / memoria | Cache LRU, tetto sulle immagini attive, fallback colore |
| 5 | Stemmi regionali non disponibili/licenziati | Copertura parziale dichiarata + fallback (§7.3) |
| 6 | Mappa illeggibile con milioni di puntini rossi | Puntini neutri di default, evidenziazione opzionale |
| 7 | Transizione globo→Mercatore a z12 visibile | Verifica visiva, eventuale tuning della soglia |

---

## 12. Roadmap

| Milestone | Contenuto | Esito atteso |
|---|---|---|
| **M0-A — Prototipo web** ✅ | Globo MapLibre, stile B/N, regioni GADM, ritaglio bandiere | **Fatto.** Globo confermato, adattamento "deforma" scelto, maschera in Mercatore confermata |
| **M0-B — Spike Android** ✅ | WebView + MapLibre + PMTiles letti via ponte Kotlin | **Confermato su dispositivo reale** il 2026-08-12, con il prototipo completo — non più la pagina dello spike — e **due archivi insieme**, città e confini. È lì che è emerso il difetto dell'`addProtocol` unico (§5), invisibile sul desktop |
| **M1 — Pipeline dati** ✅ | Script Natural Earth + GeoNames + geoBoundaries → PMTiles | **Fatto.** Città: 450.848 voci in 40,7 MB. Confini migrati: 249 stati/territori + 3.343 regioni in **40,7 MB** (`boundaries.pmtiles`, zoom 0-9); sagome regionali per l'APK 9,8 MB. Il rischio 3b è chiuso: i tile si caricano per riquadro, non tutti insieme |
| **M2 — Scheda di selezione** ◐ | Mappa a tutto schermo, menu dietro un pulsante, **scheda di selezione in alto** (§9.2), pulsante per le regioni | **Interfaccia fatta e provata su dispositivo.** Manca Room: lo stato è ancora nel `localStorage` della pagina, con una copia mandata a Kotlin per gli elenchi — due posti che devono restare d'accordo. Con Room si sposteranno anche le sei regole di §8.1 |
| **M2-bis — Indice, elenchi e ricerca** ✅ | Indice SQLite in pipeline (§9.5), elenco nazioni → città (§9.3), ricerca (§9.4) | **Fatto e provato.** 440.273 città e 242 nazioni in 56,8 MB; ricerca in italiano, elenchi per popolazione, marcatura diretta dalle righe |
| **M3 — Bandiere** ✅ | Maschera runtime, cache, fallback colore | **Fatto**, meno gli stemmi. Le bandiere seguono lo schermo: tetto di 120 livelli, si scaricano quelle fuori vista e si rifanno quando rientrano (§11 rischio 4). **Si vedono a ogni zoom**: il canvas è dimensionato su quanto l'entità occupa a schermo, che nel caso peggiore vale 21 MB invece di 777 (§7.2). **Gli stemmi delle regioni (§7.3) sono esclusi per decisione**: sono lavoro di curation, non di codice |
| **M4 — Regioni** ✅ | Livello admin-1, transizione per zoom, toggle nelle impostazioni | **Fatto e lasciato così per decisione.** Regioni nei tile, filtrate per paese acceso, dissolvenza per zoom, accensione dal pulsante nella scheda di selezione |
| **M5 — Città** ✅ | Puntini, caricamento dei PMTiles presenti nella cartella | **Fatto.** 440.273 città nei tile, marcabili dalla mappa e dagli elenchi, con etichette dei nomi da zoom 7 e comparsa ritardata attorno alle metropoli (§2.4) |
| **M6 — UX** ✅ | Ricerca, statistiche, export PNG, backup/restore, Custom Tab | **Fatto.** Ricerca (§9.4); statistiche su 195 stati sovrani; backup e ripristino in JSON con il selettore di sistema, e il ripristino dice quante voci sono entrate; export del globo in PNG (richiede `preserveDrawingBuffer` alla costruzione della mappa); «Guarda com'è» ora è una **galleria di Commons dentro l'app** per le città, Custom Tab per nazioni e regioni (§9.6). **Tutto confermato su dispositivo reale il 2026-08-12**, galleria compresa e giro del backup compreso: M6 è chiusa davvero, non solo scritta |
| **M7 — Rifinitura** ← *in corso* | ~~Icona~~, ~~**nome dell'app**~~, keystore personale + backup, versione da alzare, **rinominare il package** | APK stabile che aggiorni quando vuoi. **Fatti il 2026-08-13 icona e nome**: il manifest dice `Where We Go` e l'icona è il globo di `assets-sorgente/icona-globo.png`, in icona adattiva (§4.3). Restano keystore, versione e rename. Il rename dell'`applicationId` va fatto **dopo** aver salvato un backup: cambiarlo non aggiorna l'app installata, ne affianca una seconda, e i dati della prima restano dentro quella vecchia |
| **M8 — Pubblicazione** | Account e test chiuso, build di release firmata e AAB, obblighi ODbL assolti, privacy policy, dichiarazioni e materiali della scheda (§14) | App scaricabile da Google Play. La coda più lunga non è il codice ma l'accesso alla produzione (§14.1), quindi si avvia per prima; il vincolo che può fermare tutto è l'ODbL (§14.5) |

---

## 12.1 Da dove ripartire

**Stato al 2026-08-12, fine giornata.** APK di debug da 153,7 MB con la galleria di §9.6, **provato
su dispositivo reale e funzionante in tutte le sue parti**, incluso il giro salva → modifica →
ripristina che fino a oggi era verificato solo leggendo il codice. Chiusi M0-A, M0-B, M1, M2-bis,
M3 (meno gli stemmi, esclusi per decisione), M4, M5, M6.

**Aggiornamento del 2026-08-13: di M7 sono fatti nome e icona** (§4.3). L'app si chiama *Where We
Go* sotto l'icona e ha il globo come icona adattiva; l'APK di debug compila e le risorse sono
dentro. **Non è ancora stato provato su dispositivo**: il nome e l'icona si guardano sul telefono,
non nel log del build. Restano di M7 il keystore, la versione da alzare e il rename del package —
ed è quest'ultimo che va per ultimo, per il motivo nel riquadro qui sotto.

Sempre il 2026-08-13, **corretto un difetto della galleria di §9.6**: le foto non si vedevano mai,
perché lo `User-Agent` descrittivo che Wikimedia pretende stava solo sulle chiamate all'API e non
sulle miniature, che le scarica Coil. Da riprovare sul dispositivo insieme a nome e icona.

**Il prossimo passo è M7, la rifinitura, deciso il 2026-08-12.** Inverte l'ordine che questa
sezione consigliava — prima Room — ed è una scelta legittima: Room è un debito che cresce, ma non
impedisce di usare l'app, mentre senza keystore proprio ogni APK installato è un vicolo cieco per
gli aggiornamenti.

> **L'ordine dentro M7 non è libero, ed è la cosa da leggere prima di cominciare.** Il rename
> dell'`applicationId` va fatto **per ultimo e dopo aver esportato un backup**, e con questa
> architettura il motivo è più stringente del solito: le marcature stanno nel `localStorage` della
> WebView, cioè **dentro la cartella dati del package**. Cambiando package Android non aggiorna
> l'app installata, ne affianca una seconda con una cartella dati vuota — e la vecchia resta lì con
> tutto dentro. Senza il backup esportato prima e ripristinato dopo, quello che hai marcato non
> torna indietro. Nome, icona e keystore invece si possono fare in qualsiasi ordine.

**Dopo M7 il punto di ripartenza torna a essere Room — è ciò che manca a M2, ed è l'unico debito
che cresce.**

Oggi la verità sullo stato dell'utente sta nel `localStorage` della pagina, e Kotlin ne tiene una
copia che il JavaScript gli manda dopo ogni modifica e una volta all'avvio. Serve agli elenchi
nativi, che non possono leggere il `localStorage`. Sono **due posti che devono restare d'accordo**,
e ogni funzione nuova che legge lo stato o la usa così — legandosi a un ponte provvisorio — o va
scritta due volte.

Con Room si spostano anche **le sei regole di §8.1**, che oggi vivono nel JavaScript. Vanno
insieme: le statistiche e l'export dovranno contare interrogando il database, non chiedendolo alla
pagina.

Tre cose da tenere presenti quando si comincia:

1. **La migrazione dei dati esistenti.** Quello che è già marcato sta nel `localStorage` e va
   travasato, non perso. Il formato del backup (§9, `window.statoDaApp`) è già il contratto: se
   Room legge e scrive quello, i file salvati oggi restano validi.
2. **Le chiavi restano in inglese** — `visited` / `wanted` / `none` (§9.0). L'italiano vive solo
   dove si disegna.
3. **Provare prima il giro del backup** sul dispositivo: salva, modifica, ripristina. È l'unica
   funzione di M6 verificata solo leggendo il codice, ed è quella su cui un errore costa di più.

---

## 13. Decisioni prese sui punti aperti

- **Città non visitate**: puntini **rossi** (§6.3). L'alternativa grigia resta come rimedio se il
  risultato reale sarà illeggibile, ed è un cambio di sole espressioni di stile.
- **Etichette col nome sotto i puntini**: sì, con `symbol-sort-key` sulla popolazione e solo dagli
  zoom medi in su. Glifi: sole fasce latine, sotto il megabyte (§6.4).
- **Stemmi regionali**: copertura parziale dichiarata apertamente. Si bundle-ano solo le immagini
  PD / CC-BY / CC-BY-SA estratte da Wikidata; per le regioni scoperte, bandiera nazionale
  desaturata con bordo verde.
- **Distribuzione**: **sugli store**, Google Play per primo e Galaxy Store come alternativa a basso
  attrito (§14.8). La scelta originaria — nessuna distribuzione, APK compilato in locale e
  installato a mano (§4) — resta valida come modo di lavorare durante lo sviluppo, ma non è più il
  punto d'arrivo. Requisiti, obblighi e ordine dei passi sono in §14.
- **Dati suddivisioni**: geoBoundaries gbOpen con livello per paese e ripieghi
  Natural Earth; attribuzioni in `docs/LICENZE_REGIONI.md`.
- **Protezione dal nascondimento**: risolta, vedi §2.3. Non una soglia unica di popolazione, ma
  correzione del confronto fra nomi più soglia ristretta a sei paesi.
- **Icona**: il globo di `assets-sorgente/icona-globo.png`, in icona adattiva su sfondo bianco,
  con i PNG generati da `tools/genera_icona.js` invece che ritagliati a mano (§4.3). Cambiare
  disegno vuol dire sostituire quel file e rilanciare lo script.
- **Nome dell'app**: **Where We Go**, dal 2026-08-13 anche nel manifest, via `@string/app_name`.
  (Il package Android è ancora `com.provamappa.globe`: va
  rinominato, ma solo in M7 — cambiare `applicationId` dopo aver installato l'APK crea una seconda
  app affiancata alla prima invece di aggiornarla, e il database della vecchia va esportato prima.)
- **Regioni**: opzionali, mai attive di default, accese per paese più un interruttore globale (§6.2).
- **Tema**: chiaro di default, scuro selezionabile, non legato al tema di sistema (§6.1).
- **Livelli amministrativi**: **ci si ferma alle regioni**, scegliendo ADM1/2/3
  per paese quando la nomenclatura nazionale lo richiede. Niente province o comuni
  come nuovo livello dell'interfaccia: i comuni restano i punti
  città di GeoNames. Se un giorno si volessero le province come semplice riferimento grafico,
  la misura da rifare è quella di §6.2: il peso non dipende dall'essere selezionabili o no —
  togliere l'interattività vale solo il −30% dei confini condivisi, mentre il risparmio grosso
  (−86%) verrebbe dal poterle semplificare molto, cosa che solo un livello decorativo consente.

### Ancora da decidere

**Nessun punto aperto sulle scelte di prodotto.** Restano solo verifiche che si fanno guardando il
risultato reale, non decisioni da prendere a tavolino:

1. Se il rosso delle città non visitate risulti illeggibile agli zoom alti (§6.3): il rimedio è già
   scritto e non richiede di rigenerare i tile.
2. Se le etichette dei nomi reggano su un Galaxy reale (§6.4): è il rischio 3 di §11 e va provato
   presto, perché i layer `symbol` sono i più costosi di MapLibre.
3. Se le due soglie del ritardo dell'affollamento (§2.4) siano tarate bene: rifare la pipeline ora
   costa tre minuti e mezzo, quindi provare una variante è quasi gratis.

---

## 14. Pubblicazione sugli store

Questa sezione sostituisce la decisione «nessuna distribuzione» di §0 e §4, che resta scritta
sopra come cronologia della scelta iniziale. Pubblicare non è la stessa app con un canale in più:
cambia tre cose che finora non esistevano.

1. **Costa.** L'account Google Play è **25 $ una tantum**, non ricorrenti. Il «costo zero assoluto»
   di §0 vale ancora per i dati e per gli strumenti, non per la pubblicazione.
2. **Rende reali gli obblighi sulle licenze.** Finché l'APK sta su un telefono solo, i dati non
   sono ridistribuiti. Su uno store lo sono, e le 96 fonti share-alike di `docs/LICENZE_REGIONI.md`
   diventano un vincolo con una risposta obbligata (§14.5).
3. **Rende irreversibili due scelte tecniche** — `applicationId` e chiave di firma — che oggi si
   cambiano con un rebuild (§14.2).

> Le regole delle console cambiano spesso. Ogni numero e ogni scadenza qui sotto va riverificato
> nella Play Console il giorno in cui si comincia, non dato per buono perché scritto qui.

> **L'elenco operativo, in ordine di esecuzione e con lo stato di ogni voce, è in
> [`docs/PUBBLICAZIONE.md`](PUBBLICAZIONE.md).** Questa sezione dice il perché; quel file dice cosa
> fare e in che ordine.

### 14.1 Account e accesso alla produzione — è il cammino critico

Non è lavoro di codice, ma è la parte che dura settimane, quindi va avviata **per prima**, in
parallelo a tutto il resto.

- [ ] Registrare l'account sviluppatore (25 $) e completare la **verifica d'identità**: nome,
      indirizzo, telefono. Per un account personale i contatti verificati vengono mostrati sulla
      scheda pubblica dell'app; chi non vuole il proprio indirizzo di casa in vetrina deve
      procurarsene uno alternativo prima, non dopo.
- [ ] Per gli account personali: **test chiuso con almeno 12 tester per 14 giorni continuativi**
      prima di poter chiedere l'accesso alla produzione. Servono 12 persone vere che installino
      l'app e la tengano installata: è la voce con più tempo di attesa dell'intero piano.
- [ ] Compilare la sezione «Contenuti dell'app» per intero: privacy policy, annunci, accesso,
      classificazione, pubblico di destinazione, sicurezza dei dati (§14.6).

### 14.2 Le due scelte irreversibili

- [ ] **Rinominare l'`applicationId`** (oggi `com.provamappa.globe`) *prima* della prima
      pubblicazione. Dopo, è l'identità dell'app per sempre: cambiarlo significa pubblicare
      un'app diversa e perdere installazioni e recensioni. Vale ancora l'avvertenza di §12.1 —
      esportare il backup prima, perché le marcature stanno nel `localStorage` della WebView,
      cioè dentro la cartella dati del package.
- [ ] **Firma**: generare il keystore personale (già previsto da M7) e attivare **Play App
      Signing**. Con Play App Signing la chiave di distribuzione la tiene Google e la nostra
      diventa la *upload key*, che in caso di smarrimento si può far sostituire: è l'unica
      configurazione in cui perdere il portachiavi non chiude il progetto. Copia del keystore
      fuori dal PC, mai in git.
- [ ] `versionName` da `0.6-backup` a qualcosa di pubblicabile (`1.0`), `versionCode` monotono:
      ogni caricamento ne vuole uno nuovo e più alto, anche per i test.

### 14.3 Build di release — oggi non esiste

`android/app/build.gradle.kts` ha **solo il buildType `debug`**. Servono:

- [ ] un buildType `release` con `isMinifyEnabled = true`, `isShrinkResources = true` e le regole
      ProGuard. Il ponte JS→Kotlin è la cosa che R8 può rompere: le regole di default tengono i
      metodi annotati `@JavascriptInterface`, ma va **provato sull'APK offuscato**, non solo
      verificato che compili. Il restringimento delle risorse non tocca gli `assets`, quindi i
      PMTiles non corrono rischi da questa parte.
- [ ] condizionare `WebView.setWebContentsDebuggingEnabled(true)`
      (`android/app/src/main/java/com/provamappa/globe/MainActivity.kt:69`) a `BuildConfig.DEBUG`:
      lasciarlo acceso in release espone il contenuto della WebView a chiunque colleghi il
      telefono.
- [ ] portare `compileSdk` e `targetSdk` a **36**, con l'aggiornamento di AGP e Gradle che ne
      consegue. È il requisito Play per le app nuove e per gli aggiornamenti.
- [ ] con `targetSdk` 36 la **predictive back** è attiva di default: provare che i `BackHandler`
      di menu, galleria e schermata «Informazioni e licenze» non facciano uscire dall'app per
      sbaglio, e dichiarare `android:enableOnBackInvokedCallback` in modo esplicito.
- [ ] verificare il supporto alle **pagine da 16 KB**: l'app non ha librerie native proprie, ma il
      controllo è richiesto e si fa sull'artefatto finale.
- [ ] definire esplicitamente le regole di backup (`dataExtractionRules`): finché lo stato vive nel
      `localStorage` della WebView, quello che succede cambiando telefono dipende dal backup
      automatico, cioè oggi dal caso. Con Room (il debito di M2) la questione si semplifica.

### 14.4 Peso e formato — il punto da misurare per primo

L'APK di debug di oggi pesa **144 MB**: 57 MB di `citta.db` più circa 100 MB di `web/data`, e i
PMTiles non si comprimono perché sono già impacchettati.

- [ ] Generare l'**AAB** e leggere la dimensione di download stimata nella Console. Il tetto del
      modulo base è dell'ordine dei 200 MB: ci si sta, ma il margine è sottile e cresce a ogni
      aggiornamento dei dati.
- [ ] Se si sfora, la strada è **Play Asset Delivery** con un asset pack install-time — cioè
      esattamente il meccanismo che §4.2 si vantava di non dover usare. Non è un dramma, ma è
      lavoro vero e va saputo prima, non scoperto al primo caricamento rifiutato.
- [ ] **Provare l'AAB convertito in APK con `bundletool`, installarlo e aprire la mappa.** La
      lettura a pezzi dei PMTiles dipende da `noCompress` (§4.2) e dalla lista che il bundle si
      porta dietro: se la conversione li comprime, `assets.openFd` smette di funzionare e la mappa
      resta vuota. È un guasto che l'APK compilato direttamente non mostra.

### 14.5 Licenze — è qui che si decide se si può pubblicare

- [x] **ODbL — deciso il 2026-09-06.** 96 delle 198 fonti regionali sono share-alike, e
      distribuire l'app è uso pubblico del database derivato. Si assolve **pubblicando i dati**,
      non solo il metodo: `tools/pacchetto_odbl.js` costruisce un archivio con **un file GeoJSON per
      paese** (212 file, 3.343 suddivisioni, 10 MB), ognuno con fonte, licenza, URL dell'originale,
      elenco delle modifiche e SHA-256 nel manifest. Un file per paese non è una comodità: è ciò che
      evita di fondere geometrie ODbL e CC BY-SA nello stesso file, cioè l'unico punto in cui le due
      licenze sarebbero incompatibili. L'archivio va allegato a una Release del repository pubblico
      insieme a `boundaries.pmtiles`; la schermata «Informazioni e licenze» ci punta già.
- [ ] **Attribuzioni dei dati** già presenti in `CREDITI.md` e in `docs/LICENZE_REGIONI.md`:
      GeoNames CC BY 4.0, geoBoundaries CC BY 4.0, Natural Earth in pubblico dominio. Verificare
      che la schermata dell'app le mostri tutte, non solo le principali.
- [ ] **Avvisi delle dipendenze**: Apache 2.0 per AndroidX e Coil, BSD-3 per MapLibre GL JS,
      licenze di `pmtiles.js`, dei font e dei glifi. Da **generare** in pipeline, non da scrivere a
      mano: un elenco compilato a mano è sbagliato al primo aggiornamento di libreria.
- [ ] **Foto di Commons**: autore, licenza e collegamento alla pagina originale accanto a ogni
      immagine mostrata, non un avviso generico in fondo alla schermata.
- [ ] **Nome**: verificare che «Where We Go» non collida con un marchio o con un'app già in
      catalogo, prima di stamparlo su icona, scheda e URL.
- [ ] **Privacy policy** a un URL pubblico e stabile (basta GitHub Pages), collegata dall'app e
      dichiarata nella Console. Dice l'unica cosa vera: nessun account, nessuna raccolta, tutto in
      locale; l'unica uscita in rete è la galleria, che aprendo una foto fa arrivare l'indirizzo IP
      a Wikimedia.

### 14.6 Dichiarazioni e contenuti

- [ ] **Sicurezza dei dati**: «nessun dato raccolto né condiviso». Il backup lo esporta l'utente
      con il selettore di sistema e non passa da noi.
- [ ] **Classificazione dei contenuti** (questionario IARC) e pubblico di destinazione: **non**
      bambini, altrimenti si entra nelle politiche Famiglie, che sono un altro mondo di requisiti.
- [ ] **La galleria di Commons resta il punto sensibile della classificazione.** Non è una ricerca
      libera per nome: `GalleriaCommons` interroga `generator=geosearch` sulle coordinate, tiene
      solo il namespace `File:` e scarta per nome le non-foto e le immagini orbitali. Il rischio è
      quindi molto più stretto di quanto sembri — ma resta contenuto di terzi non curato, perché
      chiunque può geotaggare qualunque file entro il raggio di ricerca. Prima di pubblicare serve
      almeno **un modo per segnalare una foto** e una risposta pronta al questionario IARC; il
      filtro più stretto (immagine principale da Wikidata) è un ripiego se la classificazione
      diventa un problema, non un lavoro da fare adesso.
- [x] **Confini contestati** — detto nella schermata licenze il 2026-09-06: la mappa mostra quello
      che dichiara la fonte di ciascun paese, le fonti si contraddicono (India/Pakistan e
      India/Cina si sovrappongono per quasi 190.000 km², misurati) e l'app non arbitra. Resta
      valido il resto: una mappa mondiale dice qualcosa su Kashmir, Crimea, Cipro, Taiwan,
      Palestina e Sahara occidentale, e in alcuni paesi attira segnalazioni. Non impedisce la
      pubblicazione; conviene sapere quale fonte sta parlando e dirlo nella schermata licenze.
- [ ] **Materiali della scheda**: icona 512×512 PNG a 32 bit, immagine in evidenza 1024×500,
      almeno due screenshot per telefono più quelli per tablet, titolo entro 30 caratteri,
      descrizione breve entro 80 e lunga entro 4000. Gli screenshot vanno presi sul globo con le
      bandiere accese: è la cosa che distingue l'app dalle altre del genere.
- [ ] Dichiarazioni residue: nessuna pubblicità, nessun login, non è un'app di notizie, né
      governativa, né finanziaria, né sanitaria.

### 14.7 Collaudo prima della prima release

- [ ] Provare su telefono reale la build **release**, non quella di debug: mappa offline, ricerca,
      regioni, galleria e giro completo del backup.
- [ ] Usare il **pre-launch report** della Console: gira gratis su modelli che non abbiamo e
      raccoglie i crash prima che li veda un utente.
- [ ] Provare l'**aggiornamento sopra**: installare una release, marcare qualcosa, installare la
      successiva, verificare che i dati siano ancora lì.

### 14.8 Gli altri store

- **Galaxy Store** — coerente col dispositivo di riferimento (§0): account gratuito, requisiti più
  leggeri, stessi materiali di scheda, nessun obbligo dei 12 tester. È lo store col rapporto
  fatica/risultato migliore se Play si impantana.
- **Amazon Appstore** — gratuito, accetta l'APK, pubblico piccolo. Costa poco aggiungerlo una volta
  che i materiali esistono.
- **F-Droid** — nello spirito del progetto, ma compila **dai sorgenti** nella propria
  infrastruttura: i dati versionati sarebbero blob binari da rigenerare in build, e la pipeline
  scarica 2,19 GB (§3 e `docs/MIGRAZIONE.md`). Da prendere in considerazione solo accettando di
  riscrivere la build.
- **App Store di Apple** — fuori portata, e non per volontà: 99 $ l'anno e una shell da riscrivere.
  Il globo nella WebView si porterebbe dietro, tutta l'interfaccia Compose no.

### 14.9 Ordine consigliato

1. **Decidere come si assolve l'ODbL** (§14.5). Se non c'è una risposta, il resto è tempo speso a
   vuoto.
2. **Avviare l'account e il test chiuso** (§14.1): è la coda più lunga, e scorre mentre si lavora.
3. **Rename dell'`applicationId`, keystore, buildType release** (§14.2, §14.3), in quest'ordine e
   con il backup esportato prima.
4. **Misurare l'AAB** e decidere se serve Play Asset Delivery (§14.4).
5. **Privacy policy, avvisi delle licenze, limite alla galleria** (§14.5, §14.6).
6. **Materiali della scheda e collaudo** (§14.6, §14.7), poi produzione.
