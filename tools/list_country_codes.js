/* Stampa gli ISO3 presenti in web/data/countries.geojson, uno per riga. */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'web', 'data', 'countries.geojson');
const json = JSON.parse(fs.readFileSync(file, 'utf8'));
const codes = [...new Set(json.features.map((f) => f.properties.code).filter(Boolean))].sort();
console.log(codes.join('\n'));
