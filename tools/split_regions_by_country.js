/*
 * Divide web/data/regions.geojson in un file per paese.
 *
 * Motivo: le regioni servono solo per i paesi che l'utente ha scelto di
 * dettagliare. Caricarle tutte all'avvio significa leggere e tenere in memoria
 * 3.583 poligoni sempre, anche per chi non ne guarda nessuno — ed e' la
 * ragione principale della lentezza e del crash su dispositivi da 2 GB.
 *
 * Con un file per paese si carica solo cio' che e' attivo: l'Italia sono
 * 20 poligoni e poche decine di KB.
 *
 * Gli id numerici delle feature restano quelli globali del file di partenza,
 * cosi' `feature-state` continua a funzionare quando i paesi vengono uniti in
 * un'unica sorgente.
 *
 * Uso:  node tools/split_regions_by_country.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'data', 'regions');

// Il file monolitico vive fuori da web/: l'app non lo usa piu' e dentro web/
// finirebbe negli asset dell'APK, duplicando 12,6 MB inutili.
const CANDIDATI = [
  path.join(ROOT, 'data_raw', 'regions_simplified.geojson'),
  path.join(ROOT, 'web', 'data', 'regions.geojson'),
];
const SRC = CANDIDATI.find((p) => fs.existsSync(p));

if (!SRC) {
  console.error(`Nessun file sorgente trovato. Cercati:\n  ${CANDIDATI.join('\n  ')}`);
  console.error('Esegui prima build_regions_gadm.js e mapshaper.');
  process.exit(1);
}
console.log(`sorgente: ${path.relative(ROOT, SRC)}`);

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.geojson')) fs.unlinkSync(path.join(OUT, f));
}

const json = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const perPaese = new Map();

for (const f of json.features) {
  const c = f.properties.country;
  if (!c) continue;
  if (!perPaese.has(c)) perPaese.set(c, []);
  perPaese.get(c).push(f);
}

const indice = {};
let totaleByte = 0;

for (const [code, features] of [...perPaese].sort()) {
  const file = path.join(OUT, `${code}.geojson`);
  fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features }));
  const byte = fs.statSync(file).size;
  totaleByte += byte;
  indice[code] = { n: features.length, byte };
}

// L'indice permette all'app di sapere quali paesi hanno regioni disponibili
// senza tentare di scaricare file inesistenti.
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(indice));

const grandi = Object.entries(indice)
  .sort((a, b) => b[1].byte - a[1].byte)
  .slice(0, 8)
  .map(([c, v]) => `${c} ${(v.byte / 1024).toFixed(0)} KB (${v.n})`);

console.log(`paesi con regioni: ${perPaese.size}`);
console.log(`totale: ${(totaleByte / 1048576).toFixed(1)} MB, in media ${(totaleByte / perPaese.size / 1024).toFixed(0)} KB per paese`);
console.log(`piu' pesanti: ${grandi.join(', ')}`);
console.log(`Italia: ${indice.ITA ? (indice.ITA.byte / 1024).toFixed(0) + ' KB, ' + indice.ITA.n + ' regioni' : 'assente'}`);
