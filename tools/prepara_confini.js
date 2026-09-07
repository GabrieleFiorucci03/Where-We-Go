/*
 * Confini -> NDJSON pronto per tippecanoe.
 *
 * Due flussi separati, che diventeranno due livelli dello stesso archivio:
 *   countries.ndjson   riferimento NE; canonizza_confini.py lo sostituisce
 *                      con le unioni regionali prima della generazione tile
 *   regions.ndjson     suddivisioni scelte paese per paese (geoBoundaries/NE)
 *
 * Perche' un solo archivio con due livelli e non due archivi: sul telefono
 * ogni archivio in piu' e' un file da gestire nel ponte Kotlin, e i confini
 * insieme pesano poco.
 *
 * Uso:  node tools/prepara_confini.js
 */

const fs = require('fs');
const path = require('path');
const { preparaRegioni } = require('./prepara_regioni');

const ROOT = path.join(__dirname, '..');

// Le regioni vengono preparate da `prepara_regioni.js`: usa le geometrie
// semplificate pubblicate da geoBoundaries per i tile e ne ricava una copia
// ancora piu' leggera per le maschere incluse nell'APK.
const FILE_STATI = path.join(ROOT, 'web', 'data', 'countries.geojson');
// La canonizzazione non deve diventare la propria fonte alla build seguente.
const RIFERIMENTO_STATI = path.join(ROOT, 'data_raw', 'confini', 'countries_reference.geojson');
const USCITA = path.resolve(process.env.CONFINI_WORK_DIR || path.join(ROOT, 'data_raw', 'confini'));
const OUT_DATA = path.resolve(process.env.CONFINI_DATA_DIR || path.join(ROOT, 'web', 'data'));

// scrittura sincrona: i confini sono una quindicina di MB, e con lo stream il
// file non era ancora su disco quando lo si misurava subito dopo
function scrivi(file, features) {
  const righe = features.map((f) => {
    const riga = {
      type: 'Feature',
      properties: f.properties,
      geometry: f.geometry,
    };
    return JSON.stringify(riga);
  });
  fs.writeFileSync(file, righe.join('\n') + '\n', 'utf8');
  return features.length;
}

fs.mkdirSync(USCITA, { recursive: true });
fs.mkdirSync(OUT_DATA, { recursive: true });
if (!fs.existsSync(RIFERIMENTO_STATI)) {
  fs.mkdirSync(path.dirname(RIFERIMENTO_STATI), { recursive: true });
  fs.copyFileSync(FILE_STATI, RIFERIMENTO_STATI);
}
if (path.join(OUT_DATA, 'countries.geojson') !== FILE_STATI) {
  fs.copyFileSync(RIFERIMENTO_STATI, path.join(OUT_DATA, 'countries.geojson'));
}

// --- stati -----------------------------------------------------------------
const stati = JSON.parse(fs.readFileSync(RIFERIMENTO_STATI, 'utf8')).features;
const senzaCodice = stati.filter((f) => !f.properties.code).length;
if (senzaCodice) throw new Error(`${senzaCodice} stati senza 'code': sarebbero immarcabili`);
const nStati = scrivi(path.join(USCITA, 'countries.ndjson'), stati);

// --- regioni ---------------------------------------------------------------
const esitoRegioni = preparaRegioni();

// --- resoconto -------------------------------------------------------------
console.log(`stati:   ${nStati.toLocaleString('it')} da ${path.basename(FILE_STATI)}`);
console.log(`regioni: ${esitoRegioni.totale.toLocaleString('it')} normalizzate da geoBoundaries/Natural Earth`);
for (const n of ['countries.ndjson', 'regions.ndjson']) {
  const mb = fs.statSync(path.join(USCITA, n)).size / 1024 / 1024;
  console.log(`  ${n}: ${mb.toFixed(1)} MB`);
}
