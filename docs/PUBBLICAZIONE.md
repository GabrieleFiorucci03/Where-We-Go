# Pubblicare Where We Go su uno store — elenco operativo

Tutto quello che serve, in ordine di esecuzione. Il ragionamento dietro ogni scelta sta in
**§14 di `docs/PIANO.md`**; qui ci sono solo le cose da fare, con lo stato di oggi.

- `[ ]` da fare · `[x]` fatto e verificato · `[~]` fatto a metà o da riverificare
- **Data di questo stato: 2026-09-21** per la Fase 4 e le righe di tabella che ne dipendono; il resto è del 2026-09-12. I valori correnti sono stati riletti dal repository, non
  dedotti dal piano. Rispetto al 2026-09-09 sono cambiate due cose: **l'app è diventata
  multilingue** (inglese nativo, italiano quando il telefono è in italiano — vedi §9.0 di
  `PIANO.md`), e la **Release ODbL risulta già pubblicata**, cosa che la versione precedente di
  questo documento dava ancora per fare. **Il vincolo del peso, che comandava tutto, è caduto il
  2026-09-21**: i dati sono passati in un asset pack install-time e il modulo base è sceso a
  141,6 MB compressi — vedi Fase 4.
- Le regole delle console cambiano: ogni soglia, formato e scadenza qui sotto va riverificato
  nella Play Console il giorno in cui si esegue il passo.

## Valori di oggi, da cambiare prima di pubblicare

| Cosa | Oggi | Deve diventare |
|---|---|---|
| `applicationId` | `com.provamappa.globe` | dominio definitivo, scelto una volta per sempre |
| `versionName` / `versionCode` | ✅ `1.3.3` / `7` | va bene così; il `versionCode` sale a ogni caricamento |
| `compileSdk` / `targetSdk` | 35 / 35 | 36 / 36 — **scaduto**, vedi Fase 3 |
| AGP / Gradle | 8.7.3 / 8.11.1 | versioni che reggono l'SDK 36 |
| buildType | solo `debug` | `debug` + `release` firmato |
| Firma | chiave di debug | keystore personale + Play App Signing |
| Artefatto | ✅ AAB con asset pack: modulo base **141,6 MB** compressi, pacchetto `dati` **69,7 MB** (misurati sull'AAB di debug del 2026-09-21) | resta da leggere il download stimato in Console |
| Assets della WebView | `web/` senza i dati (li porta l'asset pack), banco di prova ancora compreso | in release togliere anche le pagine di officina, vedi Fase 3 |
| Debug della WebView | acceso sempre (`MainActivity.kt:91`) | solo in `BuildConfig.DEBUG` |
| Lingua | ✅ inglese nativo + italiano, segue il telefono | va bene così; la **scheda dello store** va però scritta in inglese per prima, vedi Fase 7 |

---

## Fase 0 — Decisioni che sbloccano tutto

Nessuna di queste è lavoro di codice, e tutte bloccano qualcosa a valle.

- [x] **Come si assolve l'ODbL — deciso il 2026-09-06: si pubblica l'archivio derivato** come
      Release del repository pubblico, e il metodo resta pubblico perché gli script della pipeline
      sono già versionati. Il pacchetto lo costruisce `tools/pacchetto_odbl.js`: 212 file GeoJSON
      di suddivisioni più 212 di confini nazionali, uno per paese, 3.343 suddivisioni, ciascuno con
      fonte, licenza, URL dell'originale, modifiche applicate e SHA-256 nel manifest.
      **Generato il 2026-09-08 in `dist/`: 198 MB sciolti, 72 MB in `dati-derivati.zip`** — non i
      10 MB scritti qui prima, che erano di una versione con geometrie più semplificate; resta
      sotto il limite dei 2 GB per allegato di una Release. **Un file per paese** è la scelta
      che risolve il nodo giuridico: nessuna geometria ODbL finisce nello stesso file di una
      CC BY-SA, quindi le due licenze non si devono rendere compatibili fra loro.
      **La Release esiste**: è la `v1.3.3`, pubblicata l'8 settembre (Fase 5).
- [ ] **Package definitivo**, cioè il dominio da cui deriva l'`applicationId`. Serve prima del
      rename, ed è irreversibile dopo la prima pubblicazione.
- [ ] **Tipo di account**: personale oppure organizzazione. L'organizzazione richiede un D-U-N-S e
      più verifiche; il personale espone i contatti verificati sulla scheda pubblica.
- [ ] **Indirizzo e contatto pubblici.** Per un account personale finiscono in vetrina: se non va
      bene l'indirizzo di casa, procurarsene un altro **prima** della verifica, non dopo.
- [ ] **Nome pubblico**: verificare che «Where We Go» non collida con un marchio o con un'app già
      in catalogo, prima di stamparlo su icona, scheda e URL.
- [ ] **Paesi di distribuzione**: tutti, o un sottoinsieme. Una mappa mondiale con confini
      contestati (Kashmir, Crimea, Cipro, Taiwan, Palestina, Sahara occidentale) attira
      segnalazioni in alcuni paesi; è una scelta consapevole, non un dettaglio.

## Fase 1 — Account e accesso alla produzione (la coda più lunga: avviarla per prima)

- [ ] Registrare l'account sviluppatore Google Play — **25 $ una tantum**.
- [ ] Completare la **verifica d'identità**: nome, indirizzo, telefono, documento. Richiede giorni,
      a volte più di una settimana.
- [ ] Creare l'app nella Console e riservare il nome.
- [ ] Configurare il **test interno** (nessun requisito, serve per provare l'AAB reale).
- [ ] Avviare il **test chiuso**: per gli account personali servono **almeno 12 tester opted-in per
      14 giorni continuativi** prima di poter chiedere l'accesso alla produzione. Servono 12
      persone vere che installino e tengano installata l'app: è la voce con più tempo di attesa
      dell'intero progetto, e non si accorcia con il codice.
- [ ] Chiedere l'**accesso alla produzione** al termine dei 14 giorni.

## Fase 2 — Le scelte irreversibili (fare il backup prima di toccarle)

- [ ] **Esportare un backup JSON dall'app** e verificarlo. Le marcature stanno nel `localStorage`
      della WebView, cioè dentro la cartella dati del package: il rename le lascia indietro.
- [ ] **Rinominare l'`applicationId`** da `com.provamappa.globe` al package definitivo (e con esso
      `namespace`, cartelle dei sorgenti, import). Dopo la pubblicazione non si cambia più.
- [ ] **Ripristinare il backup** sull'app rinominata e controllare che tutto sia tornato.
- [ ] **Generare il keystore personale** (`keytool -genkeypair`), fuori da git, con copia
      conservata **fuori dal PC**.
- [ ] **Attivare Play App Signing** al primo caricamento: Google tiene la chiave di distribuzione,
      la nostra resta la *upload key*, sostituibile se la si perde. È l'unica configurazione in cui
      perdere il portachiavi non chiude il progetto.
- [x] **Versione pubblicabile: fatto.** `versionName 1.3.3`, `versionCode 7`, allineati ai tag del
      repository. Resta solo la regola permanente: ogni caricamento, test interni compresi, vuole
      un `versionCode` nuovo e più alto.

## Fase 3 — Build di release (oggi non esiste)

- [ ] Aggiungere il buildType **`release`** in `android/app/build.gradle.kts` con `signingConfig`,
      `isMinifyEnabled = true`, `isShrinkResources = true` e `proguardFiles`.
- [ ] **Provare il ponte JS↔Kotlin sull'APK offuscato**, non solo verificare che compili: le regole
      di default tengono i metodi `@JavascriptInterface`, ma è la cosa che R8 rompe per prima.
      Il restringimento delle risorse non tocca gli `assets`, quindi i PMTiles non rischiano.
- [ ] Condizionare `WebView.setWebContentsDebuggingEnabled(true)`
      (`android/app/src/main/java/com/provamappa/globe/MainActivity.kt:91`) a `BuildConfig.DEBUG`.
      **Un ostacolo in meno dal 2026-09-12**: `buildFeatures { buildConfig = true }` è già acceso
      in `build.gradle.kts` — serviva allo User-Agent di Wikimedia — quindi `BuildConfig` esiste
      già e resta solo la riga da condizionare.
- [ ] **Escludere dagli assets di release il banco di prova.** `build.gradle.kts:40` include tutta
      `../web` così com'è, quindi nell'APK finiscono anche `compare.html`, `pmtiles-test.html`,
      `android.html` e **`web/data/firenze.pmtiles` (6,3 MB)**, che servivano allo sviluppo. Non è
      solo peso: sono pagine di officina dentro un'app pubblica.
- [ ] Portare `compileSdk` e `targetSdk` a **36**, aggiornando AGP e Gradle di conseguenza (oggi
      AGP 8.7.3 e Gradle 8.11.1, che l'SDK 36 non lo reggono). **La scadenza Play del 31 agosto
      2026 è passata**: il 36 non è più un adeguamento da fare con calma, senza non si carica né
      un'app nuova né un aggiornamento.
- [ ] Verificare la **predictive back**, attiva di default con `targetSdk` 36: i `BackHandler` di
      menu, galleria, indice e schermata «Informazioni e licenze» non devono far uscire dall'app
      per sbaglio. Dichiarare `android:enableOnBackInvokedCallback` esplicitamente: oggi nel
      manifest non c'è.
- [ ] Verificare il supporto alle **pagine da 16 KB** sull'artefatto finale (l'app non ha librerie
      native proprie, ma il controllo è richiesto).
- [ ] Definire le regole di backup (`dataExtractionRules`): finché lo stato vive nel `localStorage`
      della WebView, il comportamento al cambio di telefono dipende dal backup automatico. Oggi il
      manifest non dichiara né `allowBackup` né le regole, quindi il comportamento è quello di
      default — cioè non scelto da noi.
- [ ] Controllare che `android:debuggable` non finisca nel manifest di release e che non restino
      log verbosi di sviluppo.

## Fase 4 — Peso e formato dell'artefatto

> **Risolto nella struttura il 2026-09-21, da confermare in Console.** I dati geografici non
> stanno più nel modulo base: sono un **asset pack install-time** (`android/dati/`), che Play
> consegna insieme all'app. I due tetti sono separati — secondo la tabella della Play Console
> **500 MB il modulo base**, 4 GB cumulativi gli asset pack install-time — e il taglio li rispetta
> entrambi con margine. Attenzione: il **200 MB** citato nelle versioni precedenti di questo
> documento è la cifra della vecchia guida; quella che comanda il caricamento è la tabella della
> Console, da rileggere il giorno in cui si carica.

- [x] **La divisione è fatta e misurata.** Il criterio non è la dimensione ma **come il file viene
      letto**, ed è scritto in `android/app/build.gradle.kts`:

      | Cosa | Dove sta ora | Perché |
      |---|---|---|
      | `boundaries`, `cities`, `border-lines`, `firenze` (115 MB) | modulo base | si leggono a pezzi con `openFd`, che vuole asset **non compressi**: `noCompress` lo garantisce qui, dentro un pacchetto passerebbe per la configurazione del bundle |
      | `citta.db` (57 MB) | modulo base | SQLite lo copia fuori al primo avvio, non cambia nulla |
      | `region-shapes` + `country-shapes` + `regions` (198 MB, 3.592 file) | **asset pack `dati`** | si leggono in streaming (`assets.open`, WebViewAssetLoader): la compressione non dà fastidio e fa risparmiare |

- [x] **AAB generato e pesato** (debug, 2026-09-21): **212,2 MB** in tutto — modulo base 232,5 MB
      sciolti → **141,6 MB compressi**, pacchetto `dati` 198,4 MB → **69,7 MB compressi**. Nessuna
      sagoma è rimasta nel modulo base (verificato contando le voci dell'AAB, non a occhio).
- [x] **I PMTiles restano leggibili a pezzi.** Verificato sull'APK prodotto **dal bundle**
      (`packageDebugUniversalApk`), non su quello compilato: tutti e quattro risultano `STORED`.
      Il `BundleConfig.pb` dell'AAB porta il glob `**[pP][mM][tT][iI][lL][eE][sS]`, cioè
      `noCompress` sopravvive al passaggio per il bundle.
- [ ] **Leggere il download stimato nella Play Console** al primo caricamento: è l'unico numero
      che conta davvero, e da qui non si può calcolare.
- [ ] **Provare l'AAB su un telefono vero**, con `bundletool --local-testing` o dal test interno:
      resta da vedere sul campo che `context.assets` veda gli asset del pacchetto install-time
      (deve, ma se non lo facesse le sagome sparirebbero in silenzio).
- [ ] Ricompattare le sagome resta possibile e ora è **facoltativo**: non è più ciò che sblocca la
      pubblicazione, solo peso in meno per chi installa.

### Quello che l'asset pack è costato

- **Un APK compilato con `assembleDebug` non contiene più le sagome**: gli asset pack esistono solo
  nell'AAB. Il giro corto — compila, installa via cavo, manda l'APK per Telegram — si fa ora con
  **`./gradlew :app:assembleDebug -PdatiNelPacchetto=false`**, che rimette tutto dentro un pacchetto
  unico e autosufficiente (**240,4 MB**, misurato). Senza quella bandierina l'app si apre con
  bandiere e regioni mancanti, e **nessun errore lo dice**.
- **Sul telefono le sagome occupano di più.** Play consegna gli asset pack install-time **non
  compressi**: 198 MB sul dispositivo invece dei 77 MB che occupavano compressi dentro l'APK.
  AGP non espone l'opzione del bundle che li comprimerebbe.
- **L'installazione chiede il doppio dello spazio libero** degli asset pack, perché è un requisito
  della consegna install-time.

## Fase 5 — Obblighi legali

- [x] **Pubblicare l'archivio derivato ODbL — fatto.** Verificato il 2026-09-12 sulla Release
      vera, non sul piano: `v1.3.3` è pubblicata dall'8 settembre, è quella che risponde a
      `releases/latest` — cioè l'indirizzo a cui punta la schermata «Informazioni e licenze» — e
      porta allegati `dati-derivati.zip` (72 MB), `boundaries.pmtiles` (44 MB),
      `border-lines.pmtiles` (28 MB) e l'APK. L'obbligo è assolto e la promessa della schermata
      è vera. **Da rifare a ogni rigenerazione dei dati**, ed è l'unica parte che resta viva:
      una Release ferma mentre i dati cambiano torna a essere una pagina che non contiene i
      dati dell'app.
- [ ] **Privacy policy** a un URL pubblico e stabile (basta GitHub Pages), collegata dall'app e
      dichiarata nella Console. Contenuto: nessun account, nessuna raccolta, tutto in locale;
      l'unica uscita in rete è la galleria, che facendo vedere una foto fa arrivare l'indirizzo IP
      a Wikimedia. **Nel repository oggi non ne esiste il testo**, in nessuna forma: è da scrivere,
      non da pubblicare e basta. Serve a tutti gli store, non solo a Play.
- [x] **Attribuzioni dei dati** in `CREDITI.md`, `docs/LICENZE_REGIONI.md` e nella schermata
      dell'app: geoBoundaries e GeoNames CC BY 4.0, Natural Earth pubblico dominio, ODbL e CC BY-SA
      dichiarate con i conteggi per licenza.
- [x] **Attribuzione per singola foto** di Commons: autore e licenza arrivano da
      `extmetadata` (`Artist|LicenseShortName`) e il tocco apre la pagina originale.
- [~] **Avvisi delle dipendenze**: la schermata elenca MapLibre GL JS (BSD-3), pmtiles.js (BSD-3),
      flag-icons, e Compose/AndroidX/WebKit/Browser/Coroutines/Coil come Apache 2.0. Resta da
      **generarli** in pipeline invece che mantenerli a mano: un elenco scritto a mano è sbagliato
      al primo aggiornamento di libreria.

## Fase 6 — «Contenuti dell'app» nella Console

- [ ] **Sicurezza dei dati (Data safety)**: nessun dato raccolto né condiviso. Il backup lo esporta
      l'utente con il selettore di sistema e non passa da noi.
- [ ] **Classificazione dei contenuti**: questionario IARC. Da compilare sapendo che la galleria
      mostra contenuti di terzi non curati.
- [ ] **Pubblico di destinazione**: non bambini, altrimenti si entra nelle politiche Famiglie, che
      sono un altro insieme di requisiti.
- [ ] **Un modo per segnalare una foto** della galleria. `GalleriaCommons` usa `geosearch` sulle
      coordinate, tiene solo il namespace `File:` e scarta non-foto e immagini orbitali, quindi il
      rischio è stretto — ma chiunque può geotaggare qualunque file nel raggio di ricerca, e in
      vetrina la responsabilità è nostra.
- [ ] Dichiarazioni residue: nessuna pubblicità, nessun login («accesso all'app»), non è un'app di
      notizie, né governativa, né finanziaria, né sanitaria.
- [ ] Categoria, tag e contatti dello sviluppatore.

## Fase 7 — Scheda dello store

> In `dist/promo/` ci sono già quattro immagini fatte il 2026-09-08 (`globo-1.3.3.png`,
> `europa-bandiere-1.3.3.png`, `wherewego-globo.png`, `wherewego-linkedin.png`): sono materiale
> buono da cui ritagliare, ma **nessuna è in un formato di scheda**. I formati qui sotto vanno
> prodotti apposta.

- [ ] **Titolo** entro 30 caratteri.
- [ ] **Descrizione breve** entro 80 caratteri.
- [ ] **Descrizione lunga** entro 4000 caratteri.
- [ ] **Icona** 512×512 PNG a 32 bit (si ricava da `assets-sorgente/icona-globo.png` con lo stesso
      criterio geometrico di §4.3 del piano).
- [ ] **Immagine in evidenza** 1024×500.
- [ ] **Screenshot**: almeno due per telefono, più quelli per tablet. Vanno presi sul globo con le
      bandiere accese — è la cosa che distingue l'app dalle altre del genere.
- [ ] Video promozionale (facoltativo).
- [ ] **Scrivere prima l'inglese, poi l'italiano.** Dal 2026-09-12 l'app è nativamente inglese, e
      la lingua di default della scheda deve corrispondere: una scheda italiana su un'app che si
      apre in inglese è la prima incoerenza che vede chi la installa. L'italiano si aggiunge come
      traduzione della scheda, esattamente come `values-it/` è una traduzione dell'app.
- [ ] **Dire nella descrizione che l'app segue la lingua del telefono**, e che da Android 13 la si
      può forzare dal selettore di sistema: è una cosa che nessuno va a cercare da sé.

## Fase 8 — Collaudo prima del rilascio

- [x] Giro completo su dispositivo reale della build di debug: mappa, ricerca, regioni, galleria,
      backup (2026-08-12).
- [~] **Ricompilare e provare la schermata «Informazioni e licenze»**. Fatto sull'emulatore il
      2026-09-06: si apre dal menu, i collegamenti ci sono, il tasto indietro la chiude senza
      uscire dall'app. Ci è stata aggiunta la nota sui confini contesi. Resta da vedere su un
      telefono vero.
- [ ] Ripetere lo stesso giro sulla build **release** (offuscata e firmata), non su quella di debug.
      Il giro è automatizzabile: `tools/collaudo_apk.cjs` guida la WebView via DevTools, misura le
      sagome e fotografa lo schermo. Attenzione: sulla release `setWebContentsDebuggingEnabled`
      sarà spento, quindi lo strumento serve **prima** di chiudere quel varco, o con una release
      di prova che lo lascia aperto.
- [ ] Provare l'**aggiornamento sopra**: installare una release, marcare qualcosa, installare la
      successiva, verificare che i dati siano ancora lì.
- [ ] Provare l'app **in aereo**: tutto deve funzionare tranne la galleria.
- [x] **Le due lingue, su emulatore API 35 (2026-09-12).** Provate davvero, non solo compilate:
      telefono in inglese → interfaccia e nomi dei paesi inglesi, numeri `440,273`; selettore
      per-app su italiano **a sistema ancora inglese** → tutto italiano e numeri `440.273`, che è
      la prova che il ponte `AndroidUI.lingua()` serve (`navigator.language` avrebbe risposto
      «inglese»); telefono in francese → ripiego completo sull'inglese, nome del paese compreso.
      Verificata anche la ricerca interlingua: «Germania» digitato sull'app inglese trova Germany.
- [ ] Ripetere il giro delle lingue **sulla build release**, dove R8 ha rimosso il codice non
      raggiungibile: le risorse tradotte non si perdono, ma `@JavascriptInterface fun lingua()` è
      un metodo chiamato solo da JavaScript, cioè esattamente la forma che R8 toglie per prima.
      Se sparisce, i nomi dei paesi restano in italiano e non c'è nessun errore a dirlo.
- [ ] Usare il **pre-launch report** della Console: gira gratis su modelli che non abbiamo.
- [ ] Verificare l'app su schermo grande (tablet) e in orizzontale.

## Fase 9 — Rilascio

- [ ] Caricare l'AAB sul **test interno** e provarlo dal Play Store, non via ADB.
- [ ] Promuovere al **test chiuso** e far girare i 14 giorni con i 12 tester (Fase 1).
- [ ] Note di rilascio.
- [ ] Rilascio in **produzione**, con rollout graduale (per esempio 20%) invece che al 100%.
- [ ] Guardare **Android vitals** e i crash nei primi giorni.

## Dopo la pubblicazione — impegni che restano

- [ ] Alzare il `targetSdk` ogni anno, entro la scadenza di Play.
- [ ] Rispondere alle recensioni e alle segnalazioni sulle foto.
- [ ] Tenere aggiornato l'archivio ODbL a ogni rigenerazione dei dati.
- [ ] Ricompilare quando cambiano le policy (Data safety, dichiarazioni).

---

## Debiti che non bloccano lo store ma peseranno subito dopo

- [ ] **Room** (il buco di M2): oggi la verità sullo stato utente è il `localStorage` della WebView,
      con una copia in Kotlin per gli elenchi — due posti che devono restare d'accordo. Su un'app
      pubblica significa che il cambio di telefono dipende dal backup automatico.
- [x] **Allineamento dei confini** (§«Allineamento dei confini» di `PIANO.md`, 2026-09-06): la
      causa principale erano le maschere delle bandiere, che perdevano isole intere — corretta,
      scarto sotto mezzo pixel a zoom 12. Il 2026-09-07 il caso misto viene corretto usando
      l'unione regionale per tutti i 212 paesi con suddivisioni, anche a dettaglio spento.
      Restano i disaccordi territoriali gia presenti fra fonti regionali.
      **Costo misurato: la build del 2026-09-06 pesava 179,3 MB, quella del 2026-09-08 ne pesa
      252.** Non è più un debito che «peserà subito dopo»: è il vincolo di Fase 4.
- [ ] **Stemmi delle regioni** (§7.3): esclusi per decisione, non per dimenticanza. Va detto nella
      descrizione, non lasciato scoprire.

## Su quali store, e in che ordine

Il grosso del lavoro — keystore, build di release, privacy policy, Release ODbL, testi e immagini
della scheda — è **comune a tutti**: si fa una volta sola, e non dipende da quale store si sceglie.
Le differenze sono solo su cosa ciascuno pretende in più. Da qui l'ordine:

1. **Google Play è la destinazione**, perché è dove sta il pubblico. Ma l'account e la verifica
  d'identità vanno aperti **subito, per primi**, prima ancora di toccare il codice: fra verifica e
  i 14 giorni di test chiuso con 12 tester (Fase 1) passano settimane che nessuna riga di codice
  accorcia. È anche l'unico store dove il peso di Fase 4 diventa un problema strutturale.
2. **Galaxy Store come prima uscita vera**, mentre quei giorni passano. Account gratuito,
  requisiti più leggeri, accetta l'APK, stessi materiali di scheda, **nessun obbligo dei 12
  tester** e limiti di dimensione molto più larghi — cioè si può pubblicare *senza* aver prima
  risolto Play Asset Delivery. Coerente col dispositivo di riferimento del progetto. Il rapporto
  fatica/risultato migliore, e serve anche da collaudo dei materiali prima che li veda Play.
3. **Amazon Appstore** per ultimo: gratuito, accetta l'APK, pubblico piccolo. Una volta che i
  materiali esistono costa quasi nulla aggiungerlo.

Gli scartati, per non ripensarci ogni volta:
- **F-Droid**: nello spirito del progetto, ma compila **dai sorgenti** nella propria
  infrastruttura: i dati versionati sarebbero blob binari da rigenerare in build, e la pipeline
  scarica 2,19 GB. Solo accettando di riscrivere la build.
- **App Store di Apple**: fuori portata — 99 $ l'anno e una shell da riscrivere. Non esiste
  nessun progetto iOS qui dentro. Il globo nella WebView si porterebbe dietro, tutta
  l'interfaccia Compose no.

## Cose che non servono, per non cercarle

Nessun account utente, quindi niente cancellazione dell'account né istruzioni di accesso; nessun
acquisto in-app e nessuna pubblicità; nessun permesso pericoloso da giustificare — l'unico è
`INTERNET`, di livello normale (`AndroidManifest.xml`), e serve solo alla galleria.
