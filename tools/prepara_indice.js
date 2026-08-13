/*
 * Indice delle citta' per elenchi e ricerca (§9.5 del piano).
 *
 * Perche' esiste: i tile non si possono interrogare. Portano solo cio' che e'
 * inquadrato, quindi ne' l'elenco delle citta' di una nazione ne' la ricerca
 * possono uscire da li'. Serve un database a se'.
 *
 * L'insieme delle citta' viene dallo **stesso** cities.ndjson che alimenta i
 * tile, cosi' mappa, elenco e ricerca non possono divergere. Da
 * allCountries.txt si prendono in piu' i soli nomi alternativi, che nei tile
 * non ci sono perche' li gonfierebbero.
 *
 * Uso:  node --max-old-space-size=4096 tools/prepara_indice.js [uscita.db]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const IN = path.join(ROOT, 'data_raw', 'geonames', 'cities.ndjson');
const GEONAMES = path.join(ROOT, 'data_raw', 'geonames', 'allCountries.txt');
const OUT = process.argv[2] || path.join(ROOT, 'data_raw', 'geonames', 'citta.db');

/**
 * Quanti nomi alternativi tenere per citta'.
 *
 * Il tetto da solo non basta: gli alternatenames sono in ordine alfabetico, e
 * prendendone i primi otto per Venezia si ottenevano `Benatky`, `Benetia`,
 * `Benetke` — traslitterazioni ceche e slovene — mentre `Venezia` sta alla
 * posizione 27 su 66. Vedi [stessaIniziale].
 */
const MAX_ALIAS = 12;

/**
 * Le citta' grandi ne meritano di piu'.
 *
 * Londra e Parigi hanno decine di varianti che cominciano per L e per P, e con
 * dodici il tetto si riempiva prima di arrivare a `Londra` e `Parigi`. Sopra i
 * centomila abitanti sono circa cinquemila citta': alzare il tetto solo per
 * loro costa poco e copre proprio quelle che si cercano per nome italiano.
 */
const MAX_ALIAS_GRANDI = 40;
const POP_GRANDE = 100000;

const senzaAccenti = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');

/** Solo alfabeti latini: cirillico, CJK e arabo non li cercherebbe nessuno qui. */
const latino = (s) => /^[\x20-\x7eÀ-ɏ]+$/.test(s);

/**
 * L'esonimo condivide l'iniziale con il nome internazionale?
 *
 * E' il criterio che separa i nomi utili dalle traslitterazioni: Venezia/Venice,
 * Roma/Rome, Firenze/Florence, Napoli/Naples, Torino/Turin, Monaco/Munich
 * condividono tutti la prima lettera, mentre Benatky, Mleci e V'nise — sempre
 * per Venezia — no.
 *
 * Sbaglia dove l'esonimo cambia iniziale, per esempio Amburgo per Hamburg: sono
 * casi che restano non trovabili in italiano, ed e' un prezzo accettabile
 * rispetto a indicizzare ogni variante in ogni lingua del mondo.
 */
const stessaIniziale = (a, b) =>
  senzaAccenti(a).slice(0, 1).toLowerCase() === senzaAccenti(b).slice(0, 1).toLowerCase();

if (!fs.existsSync(IN)) {
  console.error(`Manca ${IN}: genera prima i tile delle citta'.`);
  process.exit(1);
}

// --- 1. l'insieme autorevole, da cities.ndjson -----------------------------
const citta = new Map();
let lette = 0;
let nascoste = 0;
const t0 = Date.now();

const leggiCitta = () =>
  new Promise((risolvi) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(IN, { encoding: 'utf8', highWaterMark: 1 << 20 }),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      if (!line) return;
      lette++;
      const f = JSON.parse(line);
      const p = f.properties;
      // i quartieri nascosti non si disegnano (§2.2): non devono nemmeno essere
      // trovabili, altrimenti la ricerca porterebbe su un punto invisibile
      if (p.q === 1) {
        nascoste++;
        return;
      }
      const [lon, lat] = f.geometry.coordinates;
      citta.set(p.geonameid, {
        nome: p.name,
        paese: p.cc,
        pop: p.pop || 0,
        lat,
        lon,
        alias: '',
      });
    });
    rl.on('close', risolvi);
  });

/**
 * 2. I nomi alternativi, da allCountries.txt.
 *
 * GeoNames scrive la colonna `name` in forma internazionale — `Rome`, `Milan`,
 * `Munich` — quindi cercando in italiano non si trovava proprio nulla delle
 * citta' piu' note, che sono quelle che uno cerca. Gli alternatenames
 * contengono `Roma`, `Milano`, `Monaco di Baviera`.
 *
 * Si tengono i soli nomi in alfabeto latino, deduplicati e limitati a
 * MAX_ALIAS: la colonna completa arriva a centinaia di varianti in ogni lingua
 * del mondo, e indicizzarle tutte gonfierebbe l'indice senza aiutare.
 */
const leggiAlias = () =>
  new Promise((risolvi) => {
    let n = 0;
    let conAlias = 0;
    const rl = readline.createInterface({
      input: fs.createReadStream(GEONAMES, { encoding: 'utf8', highWaterMark: 1 << 20 }),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      if (++n % 4000000 === 0) console.error(`  ${(n / 1e6).toFixed(0)}M righe...`);
      const t = line.indexOf('\t');
      if (t < 0) return;
      const id = +line.slice(0, t);
      const voce = citta.get(id);
      if (!voce) return;
      const c = line.split('\t');
      const grezzi = c[3];
      if (!grezzi) return;
      const visti = new Set([voce.nome.toLowerCase()]);
      const tenuti = [];
      const tetto = voce.pop >= POP_GRANDE ? MAX_ALIAS_GRANDI : MAX_ALIAS;
      for (const a of grezzi.split(',')) {
        if (tenuti.length >= tetto) break;
        const s = a.trim();
        if (s.length < 2 || !latino(s)) continue;
        if (!stessaIniziale(s, voce.nome)) continue;
        const k = s.toLowerCase();
        if (visti.has(k)) continue;
        visti.add(k);
        tenuti.push(s);
      }
      if (tenuti.length) {
        // il nome accentato e la sua forma piana: si cerca in entrambi i modi
        voce.alias = [...tenuti, ...tenuti.map(senzaAccenti)]
          .filter((x, i, arr) => x && arr.indexOf(x) === i)
          .join(' ');
        conAlias++;
      }
    });
    rl.on('close', () => {
      console.log(`nomi alternativi: ${conAlias.toLocaleString('it')} citta' ne hanno`);
      risolvi();
    });
  });

async function main() {
  await leggiCitta();
  console.log(`lette ${citta.size.toLocaleString('it')} citta' in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  if (fs.existsSync(GEONAMES)) await leggiAlias();
  else console.warn(`manca ${path.basename(GEONAMES)}: nessun nome alternativo`);

  fs.rmSync(OUT, { force: true });
  const db = new DatabaseSync(OUT);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;

    CREATE TABLE citta (
      id          INTEGER PRIMARY KEY,
      nome        TEXT NOT NULL,
      nome_ascii  TEXT NOT NULL,
      alias       TEXT NOT NULL DEFAULT '',
      paese       TEXT NOT NULL,
      pop         INTEGER NOT NULL,
      lat         REAL NOT NULL,
      lon         REAL NOT NULL
    );

    -- L'elenco di una nazione e' per popolazione decrescente (§9.3): con
    -- 118.418 citta' messicane l'ordine alfabetico sarebbe inservibile.
    CREATE INDEX idx_paese_pop ON citta(paese, pop DESC);

    -- **FTS4 e non FTS5.** FTS5 funziona con l'SQLite di Node ma non con
    -- quello di Android: la query falliva in silenzio e la ricerca delle
    -- citta' non trovava mai nulla, mentre le nazioni — che usano LIKE —
    -- si trovavano. FTS4 c'e' su Android da sempre.
    CREATE VIRTUAL TABLE citta_fts USING fts4(
      nome, nome_ascii, alias, content='citta', tokenize=unicode61
    );

    CREATE TABLE nazione (
      codice      TEXT PRIMARY KEY,
      nome        TEXT NOT NULL,
      nome_ascii  TEXT NOT NULL,
      iso2        TEXT,
      citta       INTEGER NOT NULL DEFAULT 0
    );
  `);

  const ins = db.prepare('INSERT INTO citta VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  for (const [id, v] of citta) {
    ins.run(id, v.nome, senzaAccenti(v.nome), v.alias, v.paese, v.pop, v.lat, v.lon);
  }
  db.exec('COMMIT');

  const paesi = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'web', 'data', 'countries.geojson'), 'utf8')
  ).features;
  const perIso2 = db
    .prepare('SELECT paese, count(*) n FROM citta GROUP BY paese')
    .all()
    .reduce((acc, r) => ((acc[r.paese] = r.n), acc), {});
  const insN = db.prepare('INSERT INTO nazione VALUES (?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  let nNazioni = 0;
  for (const f of paesi) {
    const p = f.properties;
    if (!p.code) continue;
    const iso2 = (p.iso2 || '').toUpperCase();
    insN.run(p.code, p.name, senzaAccenti(p.name), iso2 || null, perIso2[iso2] || 0);
    nNazioni++;
  }
  db.exec('COMMIT');

  const t1 = Date.now();
  db.exec("INSERT INTO citta_fts(citta_fts) VALUES('rebuild')");
  console.log(`indice FTS4 in ${((Date.now() - t1) / 1000).toFixed(0)}s`);

  db.exec('VACUUM');
  db.close();

  const mb = fs.statSync(OUT).size / 1048576;
  console.log(`\nlette:       ${lette.toLocaleString('it')}`);
  console.log(`nascoste:    ${nascoste.toLocaleString('it')} (escluse)`);
  console.log(`indicizzate: ${citta.size.toLocaleString('it')}`);
  console.log(`nazioni:     ${nNazioni}`);
  console.log(`\n${path.basename(OUT)}: ${mb.toFixed(1)} MB`);
}

main();
