// Snapshot immutabile dei soli prodotti geografici, mai dello stato utente.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'data_raw/confini-audit/baseline');
if (fs.existsSync(dest)) throw new Error('Baseline gia presente: non viene sovrascritta');
fs.mkdirSync(dest, { recursive: true });
const files = ['web/data/countries.geojson', 'web/data/boundaries.pmtiles',
  'data_raw/confini/regions.ndjson', 'data_raw/confini/countries.ndjson',
  'tools/pipeline_confini.ps1', 'tools/prepara_regioni.js', 'tools/livelli_regioni.json', 'web/app.js'];
for (const dir of ['regions','region-shapes','country-shapes']) {
  if (fs.existsSync(path.join(root,'web/data',dir))) {
    for (const name of fs.readdirSync(path.join(root,'web/data',dir))) files.push(`web/data/${dir}/${name}`);
  }
}
if (fs.existsSync(path.join(root,'web/data/canonical-report.json'))) files.push('web/data/canonical-report.json');
const manifest = { created: new Date().toISOString(), node: process.version, files: {} };
for (const file of files) {
  const source = path.join(root, file), target = path.join(dest, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  manifest.files[file] = { bytes: fs.statSync(source).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex') };
}
fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(dest);
