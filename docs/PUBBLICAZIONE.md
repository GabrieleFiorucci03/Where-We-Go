# Pubblicare Where We Go su uno store — elenco operativo

Tutto quello che serve, in ordine di esecuzione. Il ragionamento dietro ogni scelta sta in
**§14 di `docs/PIANO.md`**; qui ci sono solo le cose da fare, con lo stato di oggi.

- `[ ]` da fare · `[x]` fatto e verificato · `[~]` fatto a metà o da riverificare
- **Data di questo stato: 2026-09-06.** I valori correnti sono stati letti dal repository, non
  dedotti dal piano.
- Le regole delle console cambiano: ogni soglia, formato e scadenza qui sotto va riverificato
  nella Play Console il giorno in cui si esegue il passo.

## Valori di oggi, da cambiare prima di pubblicare

| Cosa | Oggi | Deve diventare |
|---|---|---|
| `applicationId` | `com.provamappa.globe` | dominio definitivo, scelto una volta per sempre |
| `versionName` / `versionCode` | `0.6-backup` / `6` | `1.0` / `7` o più |
| `compileSdk` / `targetSdk` | 35 / 35 | 36 / 36 |
| buildType | solo `debug` | `debug` + `release` firmato |
| Firma | chiave di debug | keystore personale + Play App Signing |
| Artefatto | APK di debug, **179 MB** (era 144 prima dell'allineamento dei confini) | AAB, download stimato sotto il tetto |
| Debug della WebView | acceso sempre (`MainActivity.kt:69`) | solo in `BuildConfig.DEBUG` |

---

## Fase 0 — Decisioni che sbloccano tutto

Nessuna di queste è lavoro di codice, e tutte bloccano qualcosa a valle.

- [x] **Come si assolve l'ODbL — deciso il 2026-09-06: si pubblica l'archivio derivato** come
      Release del repository pubblico, e il metodo resta pubblico perché gli script della pipeline
      sono già versionati. Il pacchetto lo costruisce `tools/pacchetto_odbl.js`: 212 file GeoJSON,
      uno per paese, 3.343 suddivisioni, 10 MB (3,5 MB zippati), ciascuno con fonte, licenza, URL
      dell'originale, modifiche applicate e SHA-256 nel manifest. **Un file per paese** è la scelta
      che risolve il nodo giuridico: nessuna geometria ODbL finisce nello stesso file di una
      CC BY-SA, quindi le due licenze non si devono rendere compatibili fra loro.
      Resta da **creare la Release** (Fase 5).
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
- [ ] Portare `versionName` a `1.0` e alzare `versionCode`: ogni caricamento, test compresi, ne
      vuole uno nuovo e più alto.

## Fase 3 — Build di release (oggi non esiste)

- [ ] Aggiungere il buildType **`release`** in `android/app/build.gradle.kts` con `signingConfig`,
      `isMinifyEnabled = true`, `isShrinkResources = true` e `proguardFiles`.
- [ ] **Provare il ponte JS↔Kotlin sull'APK offuscato**, non solo verificare che compili: le regole
      di default tengono i metodi `@JavascriptInterface`, ma è la cosa che R8 rompe per prima.
      Il restringimento delle risorse non tocca gli `assets`, quindi i PMTiles non rischiano.
- [ ] Condizionare `WebView.setWebContentsDebuggingEnabled(true)`
      (`android/app/src/main/java/com/provamappa/globe/MainActivity.kt:69`) a `BuildConfig.DEBUG`.
- [ ] Portare `compileSdk` e `targetSdk` a **36**, aggiornando AGP e Gradle di conseguenza.
- [ ] Verificare la **predictive back**, attiva di default con `targetSdk` 36: i `BackHandler` di
      menu, galleria, indice e schermata «Informazioni e licenze» non devono far uscire dall'app
      per sbaglio. Dichiarare `android:enableOnBackInvokedCallback` esplicitamente.
- [ ] Verificare il supporto alle **pagine da 16 KB** sull'artefatto finale (l'app non ha librerie
      native proprie, ma il controllo è richiesto).
- [ ] Definire le regole di backup (`dataExtractionRules`): finché lo stato vive nel `localStorage`
      della WebView, il comportamento al cambio di telefono dipende dal backup automatico.
- [ ] Controllare che `android:debuggable` non finisca nel manifest di release e che non restino
      log verbosi di sviluppo.

## Fase 4 — Peso e formato dell'artefatto

- [ ] **Generare l'AAB** (`bundleRelease`) e leggere la **dimensione di download stimata** nella
      Console. Oggi l'APK di debug pesa **179 MB**: 57 MB di `citta.db`, ~100 MB di `web/data` e
      ~30 MB di sagome regionali, e i PMTiles non si comprimono. Il margine sotto il tetto del
      modulo base si è assottigliato: è la misura da fare per prima.
- [ ] **Convertire l'AAB in APK con `bundletool`, installarlo e aprire la mappa.** La lettura a
      pezzi dei PMTiles dipende da `noCompress`: se la conversione li comprime, `assets.openFd`
      smette di funzionare e la mappa resta vuota. È un guasto che l'APK compilato direttamente
      non mostra.
- [ ] Se il download stimato sfora il tetto del modulo base (dell'ordine dei 200 MB): introdurre
      **Play Asset Delivery** con un asset pack install-time, e riprovare il giro qui sopra.

## Fase 5 — Obblighi legali

- [~] **Pubblicare l'archivio derivato ODbL.** Il pacchetto si genera con
      `node tools/pacchetto_odbl.js` (esce in `dist/`, non versionato) e la schermata
      «Informazioni e licenze» punta già a `github.com/GabrieleFiorucci03/Where-We-Go/releases/latest`.
      **Resta da creare la Release** e allegarci `dati-derivati.zip` più `boundaries.pmtiles`, che è
      la forma effettivamente inclusa nell'app. Da rifare a ogni rigenerazione dei dati.
- [ ] **Privacy policy** a un URL pubblico e stabile (basta GitHub Pages), collegata dall'app e
      dichiarata nella Console. Contenuto: nessun account, nessuna raccolta, tutto in locale;
      l'unica uscita in rete è la galleria, che facendo vedere una foto fa arrivare l'indirizzo IP
      a Wikimedia.
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

- [ ] **Titolo** entro 30 caratteri.
- [ ] **Descrizione breve** entro 80 caratteri.
- [ ] **Descrizione lunga** entro 4000 caratteri.
- [ ] **Icona** 512×512 PNG a 32 bit (si ricava da `assets-sorgente/icona-globo.png` con lo stesso
      criterio geometrico di §4.3 del piano).
- [ ] **Immagine in evidenza** 1024×500.
- [ ] **Screenshot**: almeno due per telefono, più quelli per tablet. Vanno presi sul globo con le
      bandiere accese — è la cosa che distingue l'app dalle altre del genere.
- [ ] Video promozionale (facoltativo).
- [ ] Traduzioni della scheda, se si distribuisce fuori dall'Italia.

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
      **La build del 2026-09-06 pesava 179,3 MB**: rimisurare quella nuova e l'AAB (§14.4).
- [ ] **Stemmi delle regioni** (§7.3): esclusi per decisione, non per dimenticanza. Va detto nella
      descrizione, non lasciato scoprire.

## Se Google Play si impantana — gli altri store

- **Galaxy Store** (coerente col dispositivo di riferimento): account gratuito, requisiti più
  leggeri, stessi materiali di scheda, **nessun obbligo dei 12 tester**. Il rapporto
  fatica/risultato migliore.
- **Amazon Appstore**: gratuito, accetta l'APK, pubblico piccolo. Costa poco una volta che i
  materiali esistono.
- **F-Droid**: nello spirito del progetto, ma compila **dai sorgenti** nella propria
  infrastruttura: i dati versionati sarebbero blob binari da rigenerare in build, e la pipeline
  scarica 2,19 GB. Solo accettando di riscrivere la build.
- **App Store di Apple**: fuori portata — 99 $ l'anno e una shell da riscrivere. Il globo nella
  WebView si porterebbe dietro, tutta l'interfaccia Compose no.

## Cose che non servono, per non cercarle

Nessun account utente, quindi niente cancellazione dell'account né istruzioni di accesso; nessun
acquisto in-app e nessuna pubblicità; nessun permesso pericoloso da giustificare — l'unico è
`INTERNET`, di livello normale (`AndroidManifest.xml`), e serve solo alla galleria.
