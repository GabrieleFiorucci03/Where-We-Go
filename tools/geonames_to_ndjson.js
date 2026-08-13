/*
 * GeoNames allCountries.txt -> GeoJSON righe singole (NDJSON), pronto per
 * tippecanoe.
 *
 * Il file di partenza e' un TSV da ~1,5 GB con circa 13 milioni di righe che
 * comprendono monti, fiumi, edifici e altro. A noi servono i centri abitati,
 * cioe' la classe "P", che sono circa 4,8 milioni.
 *
 * Si legge in streaming: caricarlo in memoria non e' un'opzione.
 *
 * Colonne (senza intestazione):
 *   0 geonameid   1 name        2 asciiname   3 alternatenames
 *   4 latitude    5 longitude   6 feature_class  7 feature_code
 *   8 country     9 cc2        10 admin1     11 admin2
 *  12 admin3     13 admin4     14 population 15 elevation
 *  16 dem        17 timezone   18 modified
 *
 * Uso:  node tools/geonames_to_ndjson.js [input] [output]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { tieni, zoomMinimo, SOLO_SEDI } = require('./filtro_citta');
const { retrocediQuartieri } = require('./retrocessione_quartieri');

/** Zoom massimo dei tile: le citta' minori compaiono a questo livello. */
const ZOOM_MASSIMO = Number(process.env.ZOOM_MASSIMO) || 11;

const ROOT = path.join(__dirname, '..');
const IN = process.argv[2] || path.join(ROOT, 'data_raw', 'geonames', 'allCountries.txt');
const OUT = process.argv[3] || path.join(ROOT, 'data_raw', 'geonames', 'cities.ndjson');

if (!fs.existsSync(IN)) {
  console.error(`Manca ${IN}`);
  process.exit(1);
}

const inStream = fs.createReadStream(IN, { encoding: 'utf8', highWaterMark: 1 << 20 });
const out = fs.createWriteStream(OUT, { encoding: 'utf8', highWaterMark: 1 << 20 });
// readline continua a emettere le righe gia' bufferizzate dopo pause(), quindi
// piu' listener 'drain' possono accumularsi: alzare il tetto evita l'avviso
// senza cambiare il comportamento.
out.setMaxListeners(0);
const rl = readline.createInterface({ input: inStream, crlfDelay: Infinity });

let righe = 0;
let scritte = 0;
let scartatePerClasse = 0;
let scartatePerCodice = 0;
let scartatePerCoordinate = 0;
const perClasse = new Map();
const perZoom = {};
/** Citta' accumulate prima della scrittura, per poter analizzare i vicini. */
const citta = [];
/** Divisioni amministrative (classe A), usate per arbitrare i sospetti. */
const amministrativi = [];
const t0 = Date.now();

rl.on('line', (line) => {
  righe++;
  if (righe % 2000000 === 0) {
    const s = (Date.now() - t0) / 1000;
    console.log(`  ${(righe / 1e6).toFixed(0)}M righe lette, ${scritte.toLocaleString('it')} scritte (${s.toFixed(0)}s)`);
  }

  const c = line.split('\t');
  if (c.length < 15) return;

  const classe = c[6];
  perClasse.set(classe, (perClasse.get(classe) || 0) + 1);

  // I record amministrativi servono ad arbitrare i sospetti quartieri: se una
  // voce corrisponde a una divisione amministrativa reale, e' un comune.
  // Si tiene il nome grezzo, non normalizzato: il confronto lavora sulle
  // parole (vedi `nucleo`), e servono anche gli alternatenames per i casi in
  // cui l'ente porta il nome locale e il centro abitato l'esonimo inglese.
  if (classe === 'A' && /^ADM[2-5]$/.test(c[7])) {
    amministrativi.push({ nome: c[1], alt: c[3], lon: +c[5], lat: +c[4] });
    return;
  }

  if (classe !== 'P') {
    scartatePerClasse++;
    return;
  }
  // vedi tools/filtro_citta.js: frazioni e quartieri fuori ovunque, filtro
  // stretto su popolazione o ruolo amministrativo, e nei paesi con codifica
  // verificata si tengono solo le sedi
  if (!tieni(c[8], c[7], c[1], +c[14] || 0)) {
    scartatePerCodice++;
    return;
  }

  const lat = +c[4];
  const lon = +c[5];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    scartatePerCoordinate++;
    return;
  }

  // Le citta' si accumulano in memoria invece di essere scritte subito: la
  // retrocessione dei quartieri ha bisogno di conoscere i vicini di ciascuna,
  // quindi serve l'insieme completo. Sono ~450.000 oggetti, una manciata di
  // centinaia di MB.
  const popolazione = +c[14] || 0;
  citta.push({
    id: +c[0],
    nome: c[1],
    cc: c[8],
    code: c[7],
    pop: popolazione,
    lon: Math.round(lon * 1e5) / 1e5,
    lat: Math.round(lat * 1e5) / 1e5,
    zoom: zoomMinimo(c[7], popolazione, ZOOM_MASSIMO),
  });
});

rl.on('close', () => {
  console.log(`\nlette ${citta.length.toLocaleString('it')} citta e ${amministrativi.length.toLocaleString('it')} divisioni amministrative`);

  console.log('arbitrato dei sospetti quartieri...');
  const esito = retrocediQuartieri(citta, amministrativi);
  console.log(`  sospetti individuati:                ${esito.sospetti.toLocaleString('it')}`);
  console.log(`  riconosciuti comuni veri, visibili:  ${esito.salvati.toLocaleString('it')}`);
  console.log(`  protetti dalla soglia (§2.3):        ${esito.protetti.toLocaleString('it')}`);
  console.log(`  marcati come quartieri, nascosti:    ${esito.nascosti.toLocaleString('it')}`);
  console.log(`  comparsa ritardata (affollamento):   ${esito.ritardati.toLocaleString('it')}`);

  // L'elenco dei nascosti resta su file: serve a poterli riesaminare, e a
  // riattivarli senza rigenerare nulla se un giorno si volesse.
  const elenco = citta
    .filter((c) => c.quartiere)
    .map((c) => ({ id: c.id, nome: c.nome, cc: c.cc, pop: c.pop, presso: c.presso }))
    .sort((a, b) => b.pop - a.pop);
  const fileElenco = path.join(path.dirname(OUT), 'quartieri_nascosti.json');
  fs.writeFileSync(fileElenco, JSON.stringify(elenco, null, 1));
  console.log(`  elenco salvato in ${path.basename(fileElenco)}`);

  for (const c of citta) {
    perZoom[c.zoom] = (perZoom[c.zoom] || 0) + 1;
    scritte++;
    const props = { geonameid: c.id, name: c.nome, cc: c.cc, pop: c.pop };
    // `q` marca i quartieri: restano nei tile ma lo stile non li disegna
    if (c.quartiere) props.q = 1;
    out.write(
      JSON.stringify({
        type: 'Feature',
        tippecanoe: { minzoom: c.zoom },
        properties: props,
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      }) + '\n'
    );
  }

  out.end(() => {
    const s = (Date.now() - t0) / 1000;
    const mb = fs.statSync(OUT).size / 1024 / 1024;
    console.log('\n--- conversione completata ---');
    console.log(`righe lette:        ${righe.toLocaleString('it')}`);
    console.log(`centri abitati:     ${scritte.toLocaleString('it')}`);
    console.log(`scartati non-P:     ${scartatePerClasse.toLocaleString('it')}`);
    console.log(`scartati dal filtro:${scartatePerCodice.toLocaleString('it')}`);
    console.log(`paesi a sole sedi:  ${[...SOLO_SEDI].join(', ')}`);
    console.log(`scartati coord:     ${scartatePerCoordinate.toLocaleString('it')}`);
    console.log(`uscita:             ${(mb / 1024).toFixed(2)} GB in ${s.toFixed(0)}s`);
    console.log('\ncitta per zoom di comparsa:');
    let cumulato = 0;
    for (const z of Object.keys(perZoom).map(Number).sort((a, b) => a - b)) {
      cumulato += perZoom[z];
      console.log(
        `  da zoom ${String(z).padStart(2)}: ${perZoom[z].toLocaleString('it').padStart(9)} nuove, ` +
          `${cumulato.toLocaleString('it').padStart(9)} visibili in totale`
      );
    }

    console.log('\nclassi piu' + "'" + ' frequenti nel file di partenza:');
    for (const [k, v] of [...perClasse].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      console.log(`  ${k || '(vuota)'}: ${v.toLocaleString('it')}`);
    }
  });
});
