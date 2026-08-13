/*
 * Applica le correzioni dei nomi (tools/region_names.js) a un GeoJSON di
 * suddivisioni gia' prodotto, senza rifare l'intera pipeline.
 *
 * Uso:  node tools/fix_region_names.js [file]
 */

const fs = require('fs');
const path = require('path');
const { nomeSuddivisione } = require('./region_names');

const file = path.resolve(
  process.argv[2] || path.join(__dirname, '..', 'web', 'data', 'regions.geojson')
);

const json = JSON.parse(fs.readFileSync(file, 'utf8'));
let cambiati = 0;
const esempi = [];

for (const f of json.features) {
  const prima = f.properties.name;
  const dopo = nomeSuddivisione(f.properties.code, prima);
  if (dopo !== prima) {
    f.properties.name = dopo;
    cambiati++;
    if (esempi.length < 12) esempi.push(`${prima} -> ${dopo}`);
  }
}

fs.writeFileSync(file, JSON.stringify(json));
console.log(`nomi corretti: ${cambiati} su ${json.features.length}`);
for (const e of esempi) console.log('  ' + e);
