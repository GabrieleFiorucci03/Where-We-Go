/*
 * Fonde i file GADM livello 1 scaricati da fetch_gadm_level1.ps1 in un unico
 * web/data/regions.geojson snello.
 *
 * GADM livello 1 e', per costruzione, la PRIMA suddivisione amministrativa di
 * ogni stato: regioni in Italia, stati negli USA, Laender in Germania,
 * prefetture in Giappone. E' il concetto che vogliamo, a differenza
 * dell'"admin-1" di Natural Earth che mescola province e regioni.
 *
 * Scrive in streaming: l'insieme dei poligoni mondiali non entrerebbe comodo
 * in memoria come singola stringa JSON.
 *
 * Uso:  node tools/build_regions_gadm.js [decimali] [file_output]
 *
 * Conviene scrivere il grezzo in data_raw/ e ricavare da li' la versione
 * semplificata con mapshaper, cosi' si puo' ritarare la semplificazione senza
 * rifondere ogni volta i 214 file di partenza:
 *
 *   node tools/build_regions_gadm.js 3 data_raw/regions_gadm_raw.geojson
 *   npx mapshaper data_raw/regions_gadm_raw.geojson -simplify 12% keep-shapes \
 *       -clean -o force precision=0.001 web/data/regions.geojson
 */

const fs = require('fs');
const path = require('path');
const { nomeSuddivisione } = require('./region_names');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data_raw', 'gadm_json');
const DEC = Number(process.argv[2]) || 3;
const OUT = process.argv[3]
  ? path.resolve(ROOT, process.argv[3])
  : path.join(ROOT, 'web', 'data', 'regions.geojson');

if (!fs.existsSync(SRC)) {
  console.error(`Manca ${SRC}. Esegui prima tools/fetch_gadm_level1.ps1`);
  process.exit(1);
}

// ISO3 -> ISO2, serve per trovare il file della bandiera
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'data', 'countries.geojson'), 'utf8'));
const iso2By3 = new Map();
for (const f of countries.features) {
  if (f.properties.iso2) iso2By3.set(f.properties.code, f.properties.iso2);
}

function roundRing(ring, f) {
  const out = [];
  let px = NaN;
  let py = NaN;
  for (const [x, y] of ring) {
    const rx = Math.round(x * f) / f;
    const ry = Math.round(y * f) / f;
    if (rx === px && ry === py) continue;
    out.push([rx, ry]);
    px = rx;
    py = ry;
  }
  if (out.length >= 3) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
  }
  return out.length >= 4 ? out : null;
}

function roundGeometry(geom, dec) {
  const f = 10 ** dec;
  if (!geom) return null;
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates.map((r) => roundRing(r, f)).filter(Boolean);
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  if (geom.type === 'MultiPolygon') {
    const polys = geom.coordinates
      .map((p) => p.map((r) => roundRing(r, f)).filter(Boolean))
      .filter((p) => p.length);
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
  }
  return null;
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).sort();
console.log(`file GADM da fondere: ${files.length}`);

const out = fs.createWriteStream(OUT, { encoding: 'utf8' });
out.write('{"type":"FeatureCollection","features":[');

let id = 0;
let scartate = 0;
let paesi = 0;
const perPaese = [];

for (const file of files) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
  } catch (e) {
    console.error(`  ${file}: illeggibile (${e.message})`);
    continue;
  }
  if (!json.features || !json.features.length) continue;

  paesi++;
  let n = 0;
  for (const f of json.features) {
    const p = f.properties || {};
    const code = p.GID_1;
    if (!code) {
      scartate++;
      continue;
    }
    const geom = roundGeometry(f.geometry, DEC);
    if (!geom) {
      scartate++;
      continue;
    }
    const iso3 = p.GID_0;
    const feature = {
      type: 'Feature',
      id: ++id,
      properties: {
        code,
        name: nomeSuddivisione(code, p.NAME_1) || code,
        country: iso3,
        countryName: p.COUNTRY || null,
        iso2: iso2By3.get(iso3) || null,
        // ISO 3166-2 e HASC sono chiavi alternative: servono a rimappare i
        // segnalibri se un domani si aggiorna la versione di GADM (i GID_1
        // non sono stabili fra release). Vedi docs/PIANO.md sezione 2.
        iso3166_2: p.ISO_1 && p.ISO_1 !== 'NA' ? p.ISO_1 : null,
        hasc: p.HASC_1 && p.HASC_1 !== 'NA' ? p.HASC_1 : null,
        type: p.ENGTYPE_1 || null,
      },
      geometry: geom,
    };
    out.write((id === 1 ? '' : ',') + JSON.stringify(feature));
    n++;
  }
  perPaese.push([json.features[0]?.properties?.GID_0 || file, n]);
}

out.write(']}');
out.end();

out.on('finish', () => {
  const mb = fs.statSync(OUT).size / 1024 / 1024;
  console.log(`\nscritte ${id} suddivisioni da ${paesi} paesi -> ${mb.toFixed(1)} MB`);
  if (scartate) console.log(`scartate ${scartate} feature senza GID_1 o senza geometria valida`);

  const interessanti = ['ITA', 'USA', 'FRA', 'DEU', 'ESP', 'GBR', 'JPN', 'BRA', 'AUS', 'CAN'];
  console.log('\ncontrollo di sanita:');
  for (const c of interessanti) {
    const row = perPaese.find((r) => r[0] === c);
    if (row) console.log(`  ${c}: ${row[1]}`);
  }
  console.log('\nAtteso: ITA 20, USA 51, FRA 18 (13 metropolitane + 5 oltremare), DEU 16, JPN 47.');
});
