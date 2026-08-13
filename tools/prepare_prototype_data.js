/*
 * Prepara i dati per il prototipo web (fase A dello spike M0).
 *
 * Prende i GeoJSON grezzi di Natural Earth scaricati in web/data/ e produce
 * versioni snelle: solo le proprieta' che servono, coordinate arrotondate.
 * L'arrotondamento a 3 decimali (~110 m all'equatore) e' invisibile ai livelli
 * di zoom del prototipo e taglia il peso dei file di circa l'80%.
 *
 * Uso:  node tools/prepare_prototype_data.js
 */

const fs = require('fs');
const path = require('path');

// I GeoJSON grezzi di Natural Earth stanno in data_raw/ e non in web/:
// tutto cio' che sta in web/ finisce negli asset dell'APK, e sono 45 MB di
// sorgenti che servono solo qui.
const GREZZI = path.join(__dirname, '..', 'data_raw');
const DATA = path.join(__dirname, '..', 'web', 'data');

/** Arrotonda a `dec` decimali eliminando i punti consecutivi diventati identici. */
function roundRing(ring, dec) {
  const f = 10 ** dec;
  const out = [];
  let prevX = NaN;
  let prevY = NaN;
  for (const [x, y] of ring) {
    const rx = Math.round(x * f) / f;
    const ry = Math.round(y * f) / f;
    if (rx === prevX && ry === prevY) continue;
    out.push([rx, ry]);
    prevX = rx;
    prevY = ry;
  }
  // un anello chiuso deve restare chiuso e avere almeno 4 vertici
  if (out.length >= 3) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
  }
  return out.length >= 4 ? out : null;
}

function roundGeometry(geom, dec) {
  if (!geom) return null;
  if (geom.type === 'Point') {
    const f = 10 ** dec;
    return {
      type: 'Point',
      coordinates: geom.coordinates.map((v) => Math.round(v * f) / f),
    };
  }
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates.map((r) => roundRing(r, dec)).filter(Boolean);
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  if (geom.type === 'MultiPolygon') {
    const polys = geom.coordinates
      .map((poly) => poly.map((r) => roundRing(r, dec)).filter(Boolean))
      .filter((poly) => poly.length > 0);
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
  }
  return geom;
}

function convert(inFile, outFile, dec, mapProps) {
  const src = path.join(GREZZI, inFile);
  if (!fs.existsSync(src)) {
    console.error(`  SALTATO: manca data_raw/${inFile}`);
    return;
  }
  const json = JSON.parse(fs.readFileSync(src, 'utf8'));
  const features = [];
  let dropped = 0;
  let nextId = 1;

  for (const f of json.features) {
    const props = mapProps(f.properties);
    if (!props) {
      dropped++;
      continue;
    }
    const geom = roundGeometry(f.geometry, dec);
    if (!geom) {
      dropped++;
      continue;
    }
    // L'id della feature deve essere numerico: feature-state con id stringa non
    // e' affidabile su MapLibre. Il codice testuale (ITA, IT-52, ...) resta in
    // `code` ed e' quello che finira' nel database utente.
    features.push({ type: 'Feature', id: nextId++, properties: props, geometry: geom });
  }

  const out = path.join(DATA, outFile);
  fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }));
  const before = fs.statSync(src).size / 1024 / 1024;
  const after = fs.statSync(out).size / 1024 / 1024;
  console.log(
    `  ${outFile.padEnd(22)} ${String(features.length).padStart(5)} feature  ` +
      `${before.toFixed(1)} MB -> ${after.toFixed(1)} MB` +
      (dropped ? `  (${dropped} scartate)` : '')
  );
}

console.log('Preparazione dati prototipo...');

// --- Stati -----------------------------------------------------------------
// ISO_A2 vale "-99" per diverse entita' (Francia, Norvegia, Kosovo...):
// ISO_A2_EH e' la variante che le risolve ed e' quella giusta per le bandiere.
convert('countries_50m.geojson', 'countries.geojson', 3, (p) => {
  const iso2 = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
  const id = p.ADM0_A3 || p.SOV_A3;
  if (!id) return null;
  return {
    code: id,
    name: p.NAME_IT || p.NAME || p.ADMIN,
    iso2: iso2 && iso2 !== '-99' ? iso2.toLowerCase() : null,
    continent: p.CONTINENT || null,
  };
});

// --- Regioni ---------------------------------------------------------------
// NON si generano piu' da Natural Earth. Il suo "admin-1" non e' un livello
// coerente: per Germania e USA sono Laender e stati, ma per Italia e Francia
// sono province e dipartimenti (110 e 101 feature invece di 20 e 18). Il campo
// `region` non salva la situazione, perche' per gli USA raggruppa i 51 stati
// in 4 macro-aree e manca del tutto in 204 paesi su 251.
//
// Le regioni arrivano ora da GADM livello 1, che per costruzione e' la prima
// suddivisione amministrativa di ogni stato:
//   powershell -File tools/fetch_gadm_level1.ps1
//   node tools/build_regions_gadm.js

// --- Citta' ----------------------------------------------------------------
convert('places_50m.geojson', 'places.geojson', 4, (p) => {
  const id = p.ne_id != null ? String(p.ne_id) : null;
  if (!id) return null;
  return {
    code: id,
    name: p.name || p.nameascii,
    country: p.adm0_a3,
    region: p.adm1name || null,
    pop: p.pop_max || 0,
    capital: p.adm0cap === 1,
  };
});

console.log('Fatto.');
