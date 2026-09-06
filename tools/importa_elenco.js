/**
 * importa_elenco.js — da un elenco scritto a mano al file di backup dell'app.
 *
 *   node tools/importa_elenco.js elenco.txt [backup-attuale.json]
 *
 * Nasce per travasare i dati di un'app di viaggi precedente (Places Been)
 * senza rimarcare 400 citta' a dito. La strada e' il **ripristino da backup**,
 * che nell'app esiste gia' ed e' provato: nessun codice nuovo dentro l'app,
 * e se il risultato non convince si ripristina il backup di prima.
 *
 * ---------------------------------------------------------------------------
 * IL FORMATO DELL'ELENCO
 * ---------------------------------------------------------------------------
 *
 *   #VISITATI
 *   Italia: Milano, Roma, Firenze
 *   Giappone: Kyoto, Osaka
 *   Peru:
 *
 *   #WANTED
 *   Portogallo: Lisbona
 *
 * - l'intestazione decide lo stato delle righe che seguono;
 * - `Paese:` marca il paese; cio' che segue i due punti sono **citta'**,
 *   separate da virgola o punto e virgola;
 * - un paese senza citta' si scrive lo stesso, coi due punti o senza;
 * - una riga che comincia con spazi o con `-` continua l'elenco di citta' del
 *   paese precedente, cosi' un elenco incollato da un'altra app va bene com'e';
 * - maiuscole, accenti e spazi non contano da nessuna parte.
 *
 * Le **regioni non si importano**: si marcano a mano nell'app. Non e' una
 * limitazione tecnica ma una misura — il 42,7% dei nomi di regione (1.525 su
 * 3.570) e' anche il nome di una citta' dello stesso paese, tipicamente il
 * capoluogo: `Harare`, `Lusaka`, `Ibb`. Dovendo indovinare da un elenco di
 * nomi nudi si sbaglierebbe una volta su due proprio dove i due insiemi si
 * toccano, e un errore silenzioso qui e' peggio di una riga in meno.
 *
 * ---------------------------------------------------------------------------
 * COME SI RICONOSCONO I NOMI
 * ---------------------------------------------------------------------------
 *
 * Le citta' nell'indice hanno il nome **inglese** di GeoNames — `Milan`, non
 * `Milano` — e questo sarebbe stato il costo vero dell'importazione, se non ci
 * fosse la colonna `alias`: sono i nomi alternativi di GeoNames, italiano
 * compreso, e ce l'hanno 207.403 citta' su 440.273 (tutte le grandi). Quindi
 * `Firenze` arriva a `Florence` da solo, senza tabelle scritte a mano.
 *
 * L'ordine dei tentativi e' dal piu' sicuro al piu' azzardato, e **quello che
 * ha funzionato viene scritto nel rapporto**, cosi' si sa quali righe fidarsi:
 *
 *   1. nome esatto (o la sua forma senza accenti);
 *   2. nome alternativo, cercato come frase nell'indice FTS;
 *   3. elenco completo dei nomi alternativi, dalla sorgente grezza di GeoNames;
 *   4. refuso, ma **solo la lettera ribattuta** (vedi [refusoSicuro]).
 *
 * L'ordine fra il terzo e il quarto e' stato pagato: con la somiglianza prima,
 * `Jesolo` finiva su `Iesolo` per caso e `Mdina` su `Imdina` — mentre erano
 * corrispondenze vere che il terzo tentativo trova per la via giusta. E
 * soprattutto la somiglianza larga prendeva `Duino`->`Luino`, `Murano`->`Marino`,
 * `Folzano`->`Bolzano`: posti veri e diversi, marcati al posto dell'originale
 * senza che nessuno se ne accorgesse mai. Ogni altra somiglianza oggi non
 * entra: diventa una proposta nell'elenco di cio' che resta da fare a mano.
 *
 * Fra piu' candidati vince **il piu' popoloso**, che e' quasi sempre quello che
 * si intendeva. Ma se il secondo e' abbastanza grande da poter essere lui, la
 * riga finisce fra i **dubbi** invece che essere decisa in silenzio: in Messico
 * ci sono 33 «El Paraiso», e sceglierne uno senza dirlo sarebbe un'invenzione.
 *
 * ---------------------------------------------------------------------------
 * LA FUSIONE
 * ---------------------------------------------------------------------------
 *
 * Il ripristino dell'app **sostituisce** tutto lo stato, non lo aggiunge:
 * importare senza fondere cancellerebbe quello che si e' gia' marcato a mano.
 * Per questo si passa anche il backup attuale, e per ogni voce si tiene il
 * valore piu' forte fra il vecchio e il nuovo — `visited` batte `wanted`, che
 * batte `none`. Regioni e `regioniAttive` del backup si ricopiano intatte:
 * questo strumento non le tocca.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const D = require('better-sqlite3');

const RADICE = path.join(__dirname, '..');
const DB = path.join(RADICE, 'android', 'app', 'src', 'main', 'assets', 'citta.db');
const GEOJSON_NAZIONI = path.join(RADICE, 'web', 'data', 'countries.geojson');
const CARTELLA_REGIONI = path.join(RADICE, 'web', 'data', 'regions');

/** Forza dei tre stati: serve a fondere senza mai retrocedere una voce. */
const FORZA = { none: 0, wanted: 1, visited: 2 };

/**
 * Confronto fra nomi scritti da un umano e nomi che vengono da un archivio.
 *
 * Si tolgono accenti, maiuscole, punteggiatura **e spazi**: senza togliere gli
 * spazi `United States` non incontrerebbe mai il `UnitedStates` di GADM, che li
 * ha persi per strada nella sua pipeline.
 */
const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Come sopra ma con gli spazi: serve alle ricerche per frase su FTS. */
const normFrase = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Nomi che nessun archivio conosce ma che una persona scrive.
 *
 * Non e' una tabella di traduzione — quella la fanno i dati — ma l'elenco delle
 * scorciatoie e dei nomi storici che in italiano si usano al posto di quello
 * ufficiale. Ogni voce e' una cosa che un archivio non puo' sapere.
 */
const SINONIMI = {
  usa: 'USA', america: 'USA', statiuniti: 'USA', unitedstates: 'USA',
  uk: 'GBR', inghilterra: 'GBR', granbretagna: 'GBR', unitedkingdom: 'GBR',
  scozia: 'GBR', galles: 'GBR',
  olanda: 'NLD', holland: 'NLD',
  cechia: 'CZE', repubblicaceca: 'CZE', czechrepublic: 'CZE',
  birmania: 'MMR', burma: 'MMR',
  coreadelsud: 'KOR', southkorea: 'KOR', corea: 'KOR',
  coreadelnord: 'PRK', northkorea: 'PRK',
  emiratiarabiuniti: 'ARE', emirati: 'ARE', uae: 'ARE', dubai: 'ARE',
  costadavorio: 'CIV', ivorycoast: 'CIV',
  capoverde: 'CPV', caboverde: 'CPV',
  svizzera: 'CHE', switzerland: 'CHE',
  cittadelvaticano: 'VAT', vaticano: 'VAT',
  repubblicadominicana: 'DOM',
  sudafrica: 'ZAF', southafrica: 'ZAF',
  nuovazelanda: 'NZL', newzealand: 'NZL',
  arabiasaudita: 'SAU', saudiarabia: 'SAU',
  turchia: 'TUR', turkiye: 'TUR',
  macedoniadelnord: 'MKD', macedonia: 'MKD',
  bosnia: 'BIH', bosniaerzegovina: 'BIH',
  laos: 'LAO', vietnam: 'VNM', filippine: 'PHL', philippines: 'PHL',
  maldive: 'MDV', mauritius: 'MUS', seychelles: 'SYC',
  hongkong: 'HKG', macao: 'MAC', taiwan: 'TWN',
  polinesiafrancese: 'PYF', tahiti: 'PYF',
  principatodimonaco: 'MCO', montecarlo: 'MCO',
  gibilterra: 'GIB', gibraltar: 'GIB',
  repubblicadisanmarino: 'SMR',
};

// ---------------------------------------------------------------------------
// Tabelle dei nomi
// ---------------------------------------------------------------------------

/**
 * nome (comunque scritto) -> ISO3.
 *
 * Si mettono insieme tre fonti perche' nessuna basta: l'indice e il GeoJSON
 * danno i nomi **italiani** (`Germania`), i file delle regioni di GADM danno
 * quelli **inglesi** (`Germany`), e i codici ISO2/ISO3 servono a chi scrive
 * `DE` o `DEU`. In caso di conflitto vince chi e' arrivato prima, cioe'
 * l'italiano: e' la lingua in cui e' scritto l'elenco.
 */
function tabellaNazioni(db) {
  const t = new Map();
  const metti = (chiave, iso3) => {
    const k = norm(chiave);
    if (k && !t.has(k)) t.set(k, iso3);
  };

  for (const r of db.prepare('SELECT codice, nome, nome_ascii, iso2 FROM nazione').all()) {
    metti(r.nome, r.codice);
    metti(r.nome_ascii, r.codice);
    metti(r.codice, r.codice);
    if (r.iso2) metti(r.iso2, r.codice);
  }

  const geo = JSON.parse(fs.readFileSync(GEOJSON_NAZIONI, 'utf8'));
  for (const f of geo.features) {
    const p = f.properties;
    metti(p.name, p.code);
    metti(p.code, p.code);
    if (p.iso2) metti(p.iso2, p.code);
  }

  // I nomi inglesi stanno dentro i file delle regioni, uno per paese. Si legge
  // solo la testa del file e si estrae con una espressione regolare: parsarli
  // tutti sarebbero 14 MB di GeoJSON per ricavarne 224 stringhe.
  for (const nome of fs.readdirSync(CARTELLA_REGIONI)) {
    if (!nome.endsWith('.geojson')) continue;
    const iso3 = nome.replace('.geojson', '');
    let testa;
    try {
      const fd = fs.openSync(path.join(CARTELLA_REGIONI, nome), 'r');
      const buf = Buffer.alloc(4096);
      const letti = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      testa = buf.subarray(0, letti).toString('utf8');
    } catch (e) {
      continue;
    }
    const m = testa.match(/"countryName"\s*:\s*"([^"]+)"/);
    if (m) metti(m[1], iso3);
  }

  for (const [k, v] of Object.entries(SINONIMI)) metti(k, v);
  return t;
}

// ---------------------------------------------------------------------------
// Lettura dell'elenco
// ---------------------------------------------------------------------------

/**
 * Dal testo alle righe interpretate.
 *
 * Volutamente permissivo: l'elenco lo scrive una persona, e il compito di
 * questo strumento e' risparmiarle lavoro, non darle una sintassi da imparare.
 */
function leggiElenco(testo) {
  const voci = [];   // { stato, paese, citta: [] }
  let stato = 'visited';
  let ultima = null;
  // Vero quando la nazione e' stata dichiarata con i due punti e **nulla dopo**:
  // allora le righe seguenti sono le sue citta', una per riga, anche se
  // cominciano a inizio riga. E' la forma piu' naturale da scrivere a mano, ed
  // e' quella in cui e' arrivato l'elenco vero. Fuori da un blocco cosi', una
  // riga senza due punti resta una nazione senza citta'.
  let blocco = false;
  const problemi = [];

  testo.split(/\r?\n/).forEach((riga, i) => {
    const numero = i + 1;
    const grezza = riga.replace(/\s+$/, '');
    if (!grezza.trim()) return;

    // Intestazione di sezione. Il cancelletto e' il modo previsto, ma non
    // l'unico riconosciuto: un elenco scritto a mano comincia con `DA VISITARE`
    // e basta, e pretendere il cancelletto significherebbe che quella riga
    // finisce fra le nazioni e **l'intero elenco entra come visitato**. Un
    // errore da 60 citta' marcate all'incontrario, e silenzioso.
    const h = norm(grezza);
    const senzaDuePunti = !grezza.includes(':');
    const daVisitare = h.startsWith('davisit') || h.startsWith('davedere') ||
      h.includes('want') || h.includes('programma') || h.includes('desider');
    if (grezza.trim().startsWith('#') || (senzaDuePunti && (daVisitare || h.includes('visit')))) {
      // L'ordine qui e' tutto: `davisitare` contiene `visit`, quindi la
      // domanda «e' una lista di desideri?» va fatta **prima** di quella «e'
      // una lista di visitati?», o «DA VISITARE» diventa «visitati».
      if (daVisitare) stato = 'wanted';
      else if (h.includes('visit')) stato = 'visited';
      else problemi.push(`riga ${numero}: intestazione «${grezza.trim()}» non riconosciuta, resto su «${stato}»`);
      ultima = null;
      blocco = false;
      return;
    }

    // Citta' che continua l'elenco di sopra: o perche' la riga e' rientrata o
    // comincia con un trattino, o perche' siamo dentro un blocco aperto da una
    // nazione con i due punti e niente dopo.
    const continuazione = !grezza.includes(':') && (/^[\s\-*•]/.test(grezza) || blocco);
    if (continuazione) {
      if (!ultima) {
        problemi.push(`riga ${numero}: «${grezza.trim()}» non ha un paese sopra a cui attaccarsi, saltata`);
        return;
      }
      ultima.citta.push(...spezza(grezza));
      return;
    }

    const duePunti = grezza.indexOf(':');
    const paese = (duePunti >= 0 ? grezza.slice(0, duePunti) : grezza).trim();
    const coda = duePunti >= 0 ? grezza.slice(duePunti + 1) : '';
    if (!paese) {
      problemi.push(`riga ${numero}: «${grezza.trim()}» comincia con i due punti, saltata`);
      return;
    }
    ultima = { stato, paese, citta: spezza(coda), riga: numero };
    blocco = duePunti >= 0 && !coda.trim();
    voci.push(ultima);
  });

  return { voci, problemi };
}

const spezza = (s) =>
  s.split(/[,;]/).map((x) => x.replace(/^[\s\-*•]+/, '').trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Riconoscimento delle citta'
// ---------------------------------------------------------------------------

/**
 * Il refuso di cui ci si puo' fidare: la lettera battuta due volte.
 *
 * Serve a separare `Viicenza`→`Vicenza` e `Azzzano Mella`→`Azzano Mella`, che
 * sono scivoloni di tastiera, da `Duino`→`Luino`, `Murano`→`Marino`,
 * `Folzano`→`Bolzano`: a distanza di edit sono la stessa cosa — una o due
 * lettere — ma i secondi sono **posti veri e diversi**, e importarli al posto
 * dell'originale e' un errore che nessuno noterebbe mai piu'.
 *
 * Il criterio: schiacciando le lettere ripetute i due nomi devono diventare
 * identici. E' una classe di errore stretta, e tutto il resto della somiglianza
 * resta una proposta da confermare a mano.
 */
const collassa = (s) => s.replace(/(.)\1+/g, '$1');
const refusoSicuro = (a, b) => collassa(norm(a)) === collassa(norm(b));

/** Distanza di edit, fermata appena supera [tetto]: serve solo per i refusi. */
function distanza(a, b, tetto = 2) {
  if (Math.abs(a.length - b.length) > tetto) return tetto + 1;
  let prec = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let minRiga = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + costo);
      if (cur[j] < minRiga) minRiga = cur[j];
    }
    if (minRiga > tetto) return tetto + 1;
    prec = cur;
  }
  return prec[b.length];
}

class Riconoscitore {
  constructor(db) {
    this.db = db;
    this.perPaese = new Map(); // iso2 -> righe della citta', caricate a richiesta
    this.qCitta = db.prepare('SELECT id, nome, nome_ascii, alias, pop FROM citta WHERE paese = ?');
    this.qFts = db.prepare(
      `SELECT c.id, c.nome, c.pop FROM citta_fts f JOIN citta c ON c.rowid = f.rowid
       WHERE citta_fts MATCH ? AND c.paese = ? ORDER BY c.pop DESC LIMIT 20`
    );
  }

  citta(iso2) {
    if (!this.perPaese.has(iso2)) {
      const righe = this.qCitta.all(iso2);
      for (const r of righe) {
        r.n = norm(r.nome);
        r.na = norm(r.nome_ascii);
      }
      this.perPaese.set(iso2, righe);
    }
    return this.perPaese.get(iso2);
  }

  /**
   * Trova una citta' dentro un paese. Restituisce sempre come ci si e'
   * arrivati: una corrispondenza esatta e una per somiglianza non meritano la
   * stessa fiducia, e il rapporto deve poterlo dire.
   */
  trova(nome, iso2) {
    const q = norm(nome);
    if (!q) return { esito: 'vuoto' };
    const tutte = this.citta(iso2);

    const esatte = tutte.filter((r) => r.n === q || r.na === q);
    if (esatte.length) return this.scegli(esatte, 'nome');

    // nome alternativo: si cerca la frase intera nell'indice FTS, che copre
    // nome, nome_ascii e alias. La frase, e non le parole sciolte: `alias`
    // e' un elenco separato da spazi, e cercare parola per parola farebbe
    // incontrare «Monaco» dentro «Monaco di Baviera» di un'altra citta'.
    const frase = normFrase(nome);
    if (frase) {
      let viaAlias = [];
      try {
        viaAlias = this.qFts.all(`"${frase}"`, iso2);
      } catch (e) {
        viaAlias = []; // sintassi FTS rifiutata: si passa oltre, non e' fatale
      }
      if (viaAlias.length) {
        const complete = viaAlias.map((v) => tutte.find((r) => r.id === v.id)).filter(Boolean);
        if (complete.length) return this.scegli(complete, 'alias');
      }
    }

    // **La somiglianza non decide qui**, e non e' un dettaglio d'ordine: prima
    // deve passare il ripescaggio dalla sorgente grezza (vedi [secondoGiro]),
    // altrimenti un nome che ha una corrispondenza vera fra i nomi alternativi
    // viene rubato da un refuso plausibile. E' successo davvero: `Jesolo` e'
    // `Iesolo` nell'indice e `Mdina` e' `Imdina`, ma la somiglianza li aveva
    // gia' presi. Qui si calcolano solo le proposte, che il chiamante usera'
    // se e solo se non e' rimasto niente di meglio.
    return { esito: 'assente', proposte: this.vicine(q, iso2), suggerimenti: this.suggerisci(q, iso2) };
  }

  /**
   * Fra piu' candidati vince il piu' popoloso — ma se il secondo e' almeno un
   * quinto del primo, la scelta non e' ovvia e va dichiarata dubbia invece che
   * fatta di nascosto.
   */
  scegli(candidati, come) {
    const ord = [...candidati].sort((a, b) => b.pop - a.pop);
    const primo = ord[0];
    const secondo = ord[1];
    const dubbio = !!secondo && (primo.pop === 0 || secondo.pop >= primo.pop * 0.2);
    return {
      esito: 'trovata',
      come,
      scelta: primo,
      dubbio,
      alternative: dubbio ? ord.slice(1, 4) : [],
      quante: ord.length,
    };
  }

  /**
   * Le citta' del paese che somigliano al nome cercato, in ordine di
   * popolazione. Solo quelle con una popolazione dichiarata: fra le decine di
   * migliaia di frazioni a zero abitanti la somiglianza pesca a caso.
   */
  vicine(q, iso2) {
    return this.citta(iso2)
      .filter((r) => r.pop > 0 && distanza(q, r.n) <= 2)
      .sort((a, b) => b.pop - a.pop);
  }

  /** Per le assenti: i tre nomi piu' vicini, da mettere nel rapporto. */
  suggerisci(q, iso2) {
    return this.citta(iso2)
      .filter((r) => r.pop > 5000 && (r.n.startsWith(q.slice(0, 3)) || distanza(q, r.n, 3) <= 3))
      .sort((a, b) => b.pop - a.pop)
      .slice(0, 3)
      .map((r) => `${r.nome} (${r.pop.toLocaleString('it')})`);
  }
}

// ---------------------------------------------------------------------------
// Secondo giro: i nomi che l'indice non conosce
// ---------------------------------------------------------------------------

/**
 * Ripesca gli orfani dalla sorgente grezza di GeoNames.
 *
 * Serve perche' la colonna `alias` dell'indice e' **volutamente parziale**:
 * `prepara_indice.js` tiene solo i nomi alternativi che cominciano con la
 * stessa lettera del nome internazionale (vedi `stessaIniziale`, e il commento
 * che lo motiva: senza quel filtro Venezia porta con se' `Benatky`, `Benetke` e
 * ogni traslitterazione slava). E' una buona regola per la ricerca dentro
 * l'app, ma taglia via proprio gli esonimi che cambiano iniziale:
 *
 *   Colonia -> Koln          Salonicco -> Thessaloniki
 *   Amburgo -> Hamburg       Citta del Messico -> Mexico City
 *
 * Qui non ci sono i vincoli di dimensione dell'indice — si gira una volta sola
 * su un file che sta gia' sul disco — quindi si guarda l'elenco completo dei
 * nomi alternativi, senza il filtro sull'iniziale.
 *
 * Il file e' 1,78 GB, dodici milioni di righe. Per non pagarne il prezzo si
 * legge **solo il primo campo** di ogni riga, l'identificativo: se non e' fra
 * le citta' dei paesi che ci interessano — poche decine di migliaia — la riga
 * si butta senza nemmeno spezzarla nei suoi diciannove campi.
 */
function secondoGiro(orfani, db) {
  const GREZZO = path.join(RADICE, 'data_raw', 'geonames', 'allCountries.txt');
  if (!orfani.length || !fs.existsSync(GREZZO)) {
    return { trovati: new Map(), fuoriIndice: new Map() };
  }

  const paesi = [...new Set(orfani.map((o) => o.iso2))];
  const candidati = new Map(); // geonameid -> riga dell'indice
  const q = db.prepare('SELECT id, nome, pop FROM citta WHERE paese = ?');
  for (const p of paesi) for (const r of q.all(p)) candidati.set(r.id, { ...r, paese: p });

  // nome cercato -> le richieste che lo aspettano (lo stesso nome puo' essere
  // stato scritto per due paesi diversi)
  const cercati = new Map();
  for (const o of orfani) {
    const k = norm(o.nome);
    if (!cercati.has(k)) cercati.set(k, []);
    cercati.get(k).push(o);
  }

  process.stderr.write(
    `secondo giro su allCountries.txt: ${orfani.length} nomi, ` +
      `${candidati.size.toLocaleString('it')} città in ${paesi.length} paesi...\n`
  );

  const trovati = new Map(); // chiave "nome|iso2" -> riga scelta
  const t0 = Date.now();
  let righe = 0;

  /**
   * Nello stesso giro si risponde anche a un'altra domanda, che decide cosa
   * scrivere nell'elenco delle cose da fare a mano: **il posto esiste in
   * GeoNames ma fuori dai dati dell'app?**
   *
   * Non e' un dettaglio da archivisti. Per l'Italia `filtro_citta.js` tiene
   * solo le sedi amministrative, cioe' i comuni: Murano, Porto Cervo, Lido di
   * Jesolo e Folzano esistono, con la loro popolazione, ma sono frazioni e
   * spariscono da indice **e** tile insieme. Dire a qualcuno «marcala a mano»
   * per una di queste sarebbe mandarlo a cercare una cosa che nell'app non
   * c'e': l'unica mossa possibile e' marcare il comune.
   *
   * Costa una prova di espressione regolare per riga, e si spezza in colonne
   * solo quando colpisce.
   */
  const fuoriIndice = new Map();
  const scappa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nomiOrfani = [...new Set(orfani.map((o) => o.nome.trim()))].filter((n) => n.length > 2);
  const re = nomiOrfani.length
    ? new RegExp('\\t(' + nomiOrfani.map(scappa).join('|') + ')\\t', 'i')
    : null;

  // A flusso e non tutto in memoria: 1,78 GB non entrano in una stringa di
  // Node, che si ferma molto prima. Stessa lettura di `prepara_indice.js`.
  const rl = readline.createInterface({
    input: fs.createReadStream(GREZZO, { encoding: 'utf8', highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });

  return new Promise((risolvi) => {
    rl.on('line', (line) => {
      righe++;
      const primoTab = line.indexOf('\t');
      if (primoTab <= 0) return;
      const riga = candidati.get(+line.slice(0, primoTab));
      if (!riga) {
        // non e' fra le citta' dell'app: si guarda solo se e' uno dei nomi
        // orfani, per poter dire poi *perche'* non e' entrato
        if (re) {
          const m = re.exec(line);
          if (m) {
            const c = line.split('\t');
            if (c[6] === 'P' && paesi.includes(c[8])) {
              const k = `${norm(m[1])}|${c[8]}`;
              const g = fuoriIndice.get(k);
              if (!g || +c[14] > g.pop) {
                fuoriIndice.set(k, { nome: c[1], fc: c[7], pop: +c[14] || 0 });
              }
            }
          }
        }
        return;
      }

      // solo ora vale la pena spezzare: sono poche decine di migliaia di righe
      const c = line.split('\t');
      const nomi = [c[1], c[2], ...(c[3] ? c[3].split(',') : [])];
      for (const n of nomi) {
        const richieste = cercati.get(norm(n));
        if (!richieste) continue;
        for (const o of richieste) {
          if (o.iso2 !== riga.paese) continue;
          const chiave = `${norm(o.nome)}|${o.iso2}`;
          const gia = trovati.get(chiave);
          if (!gia || riga.pop > gia.pop) trovati.set(chiave, riga);
        }
      }
    });
    rl.on('close', () => {
      process.stderr.write(
        `  ${(righe / 1e6).toFixed(1)}M righe in ${((Date.now() - t0) / 1000).toFixed(0)} s, ` +
          `${trovati.size} nomi recuperati\n`
      );
      risolvi({ trovati, fuoriIndice });
    });
  });
}

// ---------------------------------------------------------------------------
// Programma
// ---------------------------------------------------------------------------

async function main() {
  const [fileElenco, fileBackup] = process.argv.slice(2);
  if (!fileElenco) {
    console.error('uso: node tools/importa_elenco.js elenco.txt [backup-attuale.json]');
    process.exit(1);
  }

  const db = new D(DB, { readonly: true });
  const nazioni = tabellaNazioni(db);
  const iso2Di = new Map(
    db.prepare('SELECT codice, iso2, nome FROM nazione').all().map((r) => [r.codice, r])
  );

  /**
   * Le entita' che l'app sa davvero colorare.
   *
   * Non coincidono con quelle che si possono **nominare**: Gibilterra ha un
   * codice ISO3, ha due citta' nell'indice — Gibraltar, 26.544 abitanti — ma
   * **non e' fra le 242 entita' di `countries.geojson`**, cioe' sulla mappa
   * non esiste come paese. Scriverle uno stato vorrebbe dire mettere nel
   * backup una chiave che non corrisponde a niente: nessun errore, nessun
   * colore, e l'utente che si chiede dove sia finita. Meglio dirlo.
   */
  const codiciApp = new Set(
    JSON.parse(fs.readFileSync(GEOJSON_NAZIONI, 'utf8')).features.map((f) => f.properties.code)
  );

  /**
   * ISO3 -> ISO2 per i territori che la tabella delle nazioni non elenca.
   *
   * Serve alle **citta'**: quelle stanno nell'indice con il loro codice paese
   * di GeoNames anche quando l'entita' nazionale non c'e'. Senza questo,
   * Gibilterra perdeva anche la citta', e non solo il paese.
   */
  const ISO2_FUORI_TABELLA = { GIB: 'GI' };
  for (const [iso3, iso2] of Object.entries(ISO2_FUORI_TABELLA)) {
    if (!iso2Di.has(iso3)) iso2Di.set(iso3, { codice: iso3, iso2, nome: iso3 });
  }
  const ric = new Riconoscitore(db);

  const { voci, problemi } = leggiElenco(fs.readFileSync(fileElenco, 'utf8'));

  // Si parte dal backup esistente: il ripristino sostituisce tutto, quindi
  // quello che non entra qui dentro e' perso.
  let store = { countries: {}, regions: {}, places: {}, regioniAttive: [] };
  if (fileBackup) {
    const letto = JSON.parse(fs.readFileSync(fileBackup, 'utf8'));
    const s = letto.stato || letto;
    store = {
      countries: { ...(s.countries || {}) },
      regions: { ...(s.regions || {}) },
      places: { ...(s.places || {}) },
      regioniAttive: s.regioniAttive || [],
    };
  }
  const prima = {
    n: Object.keys(store.countries).length,
    c: Object.keys(store.places).length,
    r: Object.keys(store.regions).length,
  };

  const imposta = (sezione, chiave, stato) => {
    const vecchio = store[sezione][chiave];
    if (!vecchio || FORZA[stato] > FORZA[vecchio]) {
      store[sezione][chiave] = stato;
      return vecchio ? 'alzata' : 'nuova';
    }
    return 'invariata';
  };

  const rapporto = { paesiIgnoti: [], dubbie: [], somiglianze: [], recuperate: [], nazioniFuori: [] };
  const risolte = [];
  const orfani = [];
  let nazioniOk = 0;

  // --- primo giro: quello che l'indice sa gia'
  for (const v of voci) {
    const iso3 = nazioni.get(norm(v.paese));
    if (!iso3) {
      rapporto.paesiIgnoti.push(`riga ${v.riga}: «${v.paese}» (con ${v.citta.length} città)`);
      continue;
    }
    // La nazione si marca solo se l'app la conosce: vedi [codiciApp]. Le sue
    // citta' invece si provano lo stesso — nell'indice possono esserci.
    if (codiciApp.has(iso3)) {
      imposta('countries', iso3, v.stato);
      nazioniOk++;
    } else {
      rapporto.nazioniFuori.push(
        `${v.paese} (${iso3}) — non è fra le 242 entità della mappa, quindi come nazione ` +
          `non si può marcare${v.citta.length ? '; le sue città sì' : ''}`
      );
    }

    const info = iso2Di.get(iso3);
    if (!info || !info.iso2) {
      if (v.citta.length) {
        rapporto.paesiIgnoti.push(
          `riga ${v.riga}: «${v.paese}» → ${iso3}, ma non ha città nell'indice: ${v.citta.length} saltate`
        );
      }
      continue;
    }

    for (const nomeCitta of v.citta) {
      const t = ric.trova(nomeCitta, info.iso2);
      if (t.esito === 'trovata') {
        risolte.push({ input: nomeCitta, paese: info.nome, stato: v.stato, ...t });
      } else {
        orfani.push({
          nome: nomeCitta,
          iso2: info.iso2,
          paese: info.nome,
          stato: v.stato,
          proposte: t.proposte || [],
          suggerimenti: t.suggerimenti || [],
        });
      }
    }
  }

  // --- secondo giro: gli orfani, cercati nell'elenco completo dei nomi
  // alternativi. Costa un minuto e recupera gli esonimi che cambiano iniziale,
  // che l'indice dell'app non porta per scelta (vedi [secondoGiro]).
  const { trovati: recuperati, fuoriIndice } = await secondoGiro(orfani, db);
  const assenti = [];       // esistono nell'app: si possono marcare a mano
  const nonImportabili = []; // non ci sono proprio: l'unica mossa e' il comune
  for (const o of orfani) {
    const trovata = recuperati.get(`${norm(o.nome)}|${o.iso2}`);
    if (trovata) {
      risolte.push({
        input: o.nome,
        paese: o.paese,
        stato: o.stato,
        come: 'grezzo',
        scelta: trovata,
        dubbio: false,
        alternative: [],
        quante: 1,
      });
      rapporto.recuperate.push(`${o.nome} → ${trovata.nome} (${o.paese})`);
      continue;
    }

    // Ultima spiaggia, e solo per la classe di refuso di cui ci si puo' fidare:
    // la lettera ribattuta. Tutto il resto della somiglianza diventa una
    // proposta da confermare a mano — meglio una riga in piu' da marcare che
    // una citta' sbagliata marcata al posto giusto.
    const p = o.proposte[0];
    if (p && refusoSicuro(o.nome, p.nome)) {
      risolte.push({
        input: o.nome,
        paese: o.paese,
        stato: o.stato,
        come: 'refuso',
        scelta: p,
        dubbio: false,
        alternative: [],
        quante: 1,
      });
      rapporto.somiglianze.push(`${o.nome} → ${p.nome} (${o.paese})`);
      continue;
    }

    // Esiste in GeoNames ma fuori dai dati dell'app? Allora non e' una citta'
    // che «non ho saputo trovare»: e' una che nell'app non c'e' e non ci sara'.
    const fuori = fuoriIndice.get(`${norm(o.nome)}|${o.iso2}`);
    if (fuori) {
      nonImportabili.push(
        `${o.nome} (${o.paese}) — esiste in GeoNames (${fuori.fc}, ${fuori.pop.toLocaleString('it')} ab.) ` +
          `ma non è un comune, quindi è fuori dai dati dell'app: marca il comune di cui fa parte`
      );
      continue;
    }

    assenti.push(
      `${o.nome} (${o.paese})` +
        (p ? ` — forse ${p.nome}?` : '') +
        (!p && o.suggerimenti.length ? ` — forse: ${o.suggerimenti.join(', ')}` : '')
    );
  }

  // --- si scrive nello store solo adesso, quando tutto e' stato deciso
  const perCome = { nome: 0, alias: 0, grezzo: 0, refuso: 0 };
  for (const r of risolte) {
    imposta('places', `g:${r.scelta.id}`, r.stato);
    perCome[r.come] = (perCome[r.come] || 0) + 1;
    if (r.dubbio) {
      rapporto.dubbie.push(
        `${r.input} (${r.paese}): ho preso ${r.scelta.nome} con ${r.scelta.pop.toLocaleString('it')} ab.` +
          ` — altri ${r.quante - 1} omonimi, i più grossi: ` +
          r.alternative.map((a) => `${a.nome} (${a.pop.toLocaleString('it')})`).join(', ')
      );
    }
  }
  const cittaOk = risolte.length;

  // Tabella completa di cosa e' diventato cosa. Il rapporto elenca solo i casi
  // dubbi, ma con quattrocento citta' serve poter ripassare **tutto** senza
  // fidarsi: qui c'e' una riga per ogni nome scritto nell'elenco.
  const fileCorrispondenze = fileElenco.replace(/\.[^.]+$/, '') + '-corrispondenze.txt';
  fs.writeFileSync(
    fileCorrispondenze,
    risolte
      .map(
        (r) =>
          `${r.stato === 'visited' ? 'V' : 'W'}  ${r.input.padEnd(28)} → ${r.scelta.nome} ` +
          `(${r.paese}, ${r.scelta.pop.toLocaleString('it')} ab.)  [${r.come}]` +
          (r.dubbio ? '  ← DUBBIO' : '')
      )
      .join('\n') + '\n',
    'utf8'
  );

  const uscita = fileElenco.replace(/\.[^.]+$/, '') + '-importato.json';
  fs.writeFileSync(
    uscita,
    JSON.stringify({ versione: 2, salvato: Date.now(), stato: store }, null, 0)
  );

  // Elenco ausiliario: cio' che non e' entrato e va marcato a mano nell'app.
  // File a parte e non solo una sezione del rapporto perche' e' una lista di
  // lavoro — si tiene aperta e si spunta — e ogni riga porta il nome del paese,
  // che nell'app serve per arrivare alla citta' dagli elenchi.
  const fileAMano = fileElenco.replace(/\.[^.]+$/, '') + '-da-fare-a-mano.txt';
  const aMano = [];
  aMano.push('DA MARCARE A MANO NELL\'APP');
  aMano.push('');
  if (rapporto.paesiIgnoti.length) {
    aMano.push(`— NAZIONI non riconosciute (${rapporto.paesiIgnoti.length})`);
    rapporto.paesiIgnoti.forEach((r) => aMano.push(`   ${r}`));
    aMano.push('');
  }
  if (assenti.length) {
    aMano.push(`— CITTÀ da cercare a mano nell'app (${assenti.length})`);
    aMano.push('   non le ho sapute agganciare, ma nell\'app dovrebbero esserci');
    assenti.forEach((r) => aMano.push(`   ${r}`));
    aMano.push('');
  }
  if (nonImportabili.length) {
    aMano.push(`— NON IMPORTABILI: non esistono nei dati dell'app (${nonImportabili.length})`);
    aMano.push('   inutile cercarle: sono frazioni, e la pipeline tiene solo i comuni');
    aMano.push('   (filtro_citta.js, SOLO_SEDI). L\'unica mossa è marcare il comune.');
    nonImportabili.forEach((r) => aMano.push(`   ${r}`));
    aMano.push('');
  }
  if (rapporto.dubbie.length) {
    aMano.push(`— CITTÀ entrate ma DA VERIFICARE, sono omonime (${rapporto.dubbie.length})`);
    aMano.push('   ho preso la più popolosa: se era un\'altra, correggi nell\'app');
    rapporto.dubbie.forEach((r) => aMano.push(`   ${r}`));
    aMano.push('');
  }
  if (rapporto.somiglianze.length) {
    aMano.push(`— CITTÀ entrate per somiglianza, forse refusi (${rapporto.somiglianze.length})`);
    aMano.push('   controlla che sia davvero il posto che intendevi');
    rapporto.somiglianze.forEach((r) => aMano.push(`   ${r}`));
    aMano.push('');
  }
  if (aMano.length <= 2) aMano.push('Niente: è entrato tutto.');
  fs.writeFileSync(fileAMano, aMano.join('\n') + '\n', 'utf8');

  // ---- rapporto
  const R = [];
  const chieste = cittaOk + assenti.length + nonImportabili.length;
  R.push(`elenco letto: ${voci.length} righe di paese`);
  R.push(`nazioni riconosciute: ${nazioniOk}/${voci.length}`);
  R.push(`città riconosciute:   ${cittaOk}/${chieste}`);
  R.push(
    `  per nome: ${perCome.nome} · nome alternativo: ${perCome.alias} · ` +
      `ripescate dalla sorgente grezza: ${perCome.grezzo} · refusi corretti: ${perCome.refuso}`
  );
  R.push('');
  R.push(`backup di partenza: ${prima.n} nazioni, ${prima.r} regioni, ${prima.c} città`);
  R.push(
    `backup prodotto:    ${Object.keys(store.countries).length} nazioni, ` +
      `${Object.keys(store.regions).length} regioni, ${Object.keys(store.places).length} città`
  );
  R.push(`da ripristinare:  ${path.relative(RADICE, uscita)}`);
  R.push(`corrispondenze:   ${path.relative(RADICE, fileCorrispondenze)}`);
  R.push(`da fare a mano:   ${path.relative(RADICE, fileAMano)}`);

  const sezione = (titolo, righe) => {
    if (!righe.length) return;
    R.push('', `--- ${titolo} (${righe.length})`);
    righe.forEach((r) => R.push(`  ${r}`));
  };
  sezione('DA CONTROLLARE: paesi non riconosciuti', rapporto.paesiIgnoti);
  sezione('NAZIONI che l.app non ha fra le sue entità', rapporto.nazioniFuori);
  sezione('DA CONTROLLARE: città da cercare a mano', assenti);
  sezione('NON IMPORTABILI: frazioni, non sono nei dati dell.app', nonImportabili);
  sezione('DA CONTROLLARE: omonimi, ho scelto il più popoloso', rapporto.dubbie);
  sezione('riconosciute per somiglianza (probabili refusi)', rapporto.somiglianze);
  sezione('ripescate dalla sorgente grezza (esonimi con altra iniziale)', rapporto.recuperate);
  sezione('righe malformate', problemi);

  console.log(R.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
