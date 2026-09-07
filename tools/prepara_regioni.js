/*
 * Converte le fonti scelte paese per paese nel formato unico dell'app.
 *
 * Legge `tools/livelli_regioni.json`: geoBoundaries dalla cartella delle
 * geometrie semplificate, Natural Earth per i ripieghi dichiarati, niente per
 * i paesi senza suddivisioni. Produce contemporaneamente:
 *
 *   data_raw/confini/regions.ndjson       ingresso di tippecanoe
 *   web/data/regions/<ISO3>.geojson       catalogo leggero con centri
 *   web/data/region-shapes/<code>.geojson sagome caricate singolarmente
 *   web/data/regions/index.json           paesi con dettaglio disponibile
 *
 * I due prodotti condividono codici e proprieta'. Le sagome hanno una
 * tolleranza geometrica esplicita, verificata rispetto all'ingresso dei tile.
 *
 * Uso: node tools/prepara_regioni.js
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { riparaMojibake, nomeSuddivisione } = require('./region_names');

const ROOT = path.join(__dirname, '..');
const TABELLA = path.join(__dirname, 'livelli_regioni.json');
const GB = path.join(ROOT, 'data_raw', 'geoboundaries_simplified');
const NE = path.join(ROOT, 'data_raw', 'regions_10m.geojson');
const NAZIONI = path.join(ROOT, 'web', 'data', 'countries.geojson');
const OUT_DATA = path.resolve(process.env.CONFINI_DATA_DIR || path.join(ROOT, 'web', 'data'));
const WORK = path.resolve(process.env.CONFINI_WORK_DIR || path.join(ROOT, 'data_raw', 'confini'));
const OUT_WEB = path.join(OUT_DATA, 'regions');
const OUT_SHAPES = path.join(OUT_DATA, 'region-shapes');
const OUT_NDJSON = path.join(WORK, 'regions.ndjson');
const SAGOME_GREZZE = path.join(WORK, 'regions_sagome_raw.geojson');
const SAGOME = path.join(WORK, 'regions_sagome.geojson');
const ZOOM_MINIMO_REGIONI = 3;

/**
 * Le chiavi nazionali dell'app vengono da ADM0_A3 di Natural Earth e per tre
 * paesi non coincidono con boundaryISO di geoBoundaries. Non si cambiano: sono
 * gia' nel database utente e sono anche le chiavi dell'indice delle nazioni.
 */
const CODICI_APP = { PSE: 'PSX', SSD: 'SDS', XKX: 'KOS' };

/** Collisioni reali: stesso slug, suddivisioni diverse. */
const SLUG_ESPLICITI = {
  "SYC|Grand Anse": 'grand-anse-praslin',
  "SYC|Grand'Anse": 'grand-anse-mahe',
};

/** Nomi distintivi per le due Grand Anse delle Seychelles. */
const NOMI_ESPLICITI = {
  "SYC|Grand Anse": 'Grand Anse (Praslin)',
  "SYC|Grand'Anse": "Grand'Anse (Mahé)",
};

function slug(nome) {
  return nome
    .replace(/[łŁ]/g, 'l').replace(/[đĐðÐ]/g, 'd').replace(/[þÞ]/g, 'th')
    .replace(/[æÆ]/g, 'ae').replace(/[œŒ]/g, 'oe').replace(/[øØ]/g, 'o')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function poligoni(geometria) {
  if (!geometria) return [];
  if (geometria.type === 'Polygon') return [geometria.coordinates];
  if (geometria.type === 'MultiPolygon') return geometria.coordinates;
  throw new Error(`geometria regionale non supportata: ${geometria.type}`);
}

function unisciGeometrie(a, b) {
  const tutti = [...poligoni(a), ...poligoni(b)];
  return tutti.length === 1
    ? { type: 'Polygon', coordinates: tutti[0] }
    : { type: 'MultiPolygon', coordinates: tutti };
}

function leggiJson(file) {
  if (!fs.existsSync(file)) throw new Error(`manca ${path.relative(ROOT, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function indiceNazioni() {
  const out = new Map();
  for (const f of leggiJson(NAZIONI).features || []) {
    const p = f.properties || {};
    if (p.code) out.set(p.code, { nome: p.name || p.code, iso2: p.iso2 || null });
  }
  return out;
}

function indiceNaturalEarth() {
  const out = new Map();
  for (const f of leggiJson(NE).features || []) {
    const iso = f.properties && f.properties.adm0_a3;
    if (!iso) continue;
    if (!out.has(iso)) out.set(iso, []);
    out.get(iso).push(f);
  }
  return out;
}

function grezzeGeoBoundaries(iso, livello) {
  const file = path.join(GB, `${iso}-${livello}.geojson`);
  return (leggiJson(file).features || []).map((f) => ({
    nome: f.properties && f.properties.shapeName,
    geometry: f.geometry,
  }));
}

function grezzeNaturalEarth(iso, perPaese) {
  const out = [];
  for (const f of perPaese.get(iso) || []) {
    // L'interfaccia e' italiana, quando NE possiede il nome italiano lo usa.
    const nome = f.properties.name_it || f.properties.name_local || f.properties.name;
    // Natural Earth contiene un poligono AIA+99? senza alcun nome: non puo'
    // comparire in un indice ne' essere riconosciuto dall'utente.
    if (!nome) {
      console.warn(`${iso}: scartata suddivisione Natural Earth senza nome (${f.properties.adm1_code || '?'})`);
      continue;
    }
    out.push({ nome, geometry: f.geometry });
  }
  return out;
}

/**
 * Assegna codici sintetici e fonde le feature omonime.
 *
 * Due casi noti arrivano spezzati in feature separate: Mazandaran in Iran e
 * quattro contee/citta' irlandesi. Per l'app sono una sola regione marcabile,
 * quindi condividono codice e geometria. Una collisione fra nomi diversi,
 * invece, ferma la build finche' non viene decisa in SLUG_ESPLICITI.
 */
function normalizzaPaese(iso, grezze, nazione, prossimoId) {
  const perCodice = new Map();
  let fuse = 0;
  for (const g of grezze) {
    const nomeGrezzo = riparaMojibake(String(g.nome || '').trim());
    if (!nomeGrezzo) throw new Error(`${iso}: suddivisione senza nome`);
    const chiave = `${iso}|${nomeGrezzo}`;
    const parte = SLUG_ESPLICITI[chiave] || slug(nomeGrezzo);
    if (!parte) throw new Error(`${iso}: impossibile creare lo slug da ${JSON.stringify(nomeGrezzo)}`);
    const codice = `${iso}.${parte}`;
    const nome = NOMI_ESPLICITI[chiave] || nomeSuddivisione(codice, nomeGrezzo);
    const gia = perCodice.get(codice);
    if (gia) {
      if (gia.properties.name !== nome) {
        throw new Error(`${iso}: collisione sul codice ${codice}: ${gia.properties.name} / ${nome}`);
      }
      gia.geometry = unisciGeometrie(gia.geometry, g.geometry);
      fuse++;
      continue;
    }
    perCodice.set(codice, {
      type: 'Feature',
      id: prossimoId(),
      properties: {
        code: codice,
        name: nome,
        country: iso,
        countryName: nazione.nome,
        iso2: nazione.iso2,
        type: 'Region',
      },
      geometry: g.geometry,
    });
  }
  return { features: [...perCodice.values()].sort((a, b) => a.properties.code.localeCompare(b.properties.code)), fuse };
}

function preparaRegioni() {
  const { paesi } = leggiJson(TABELLA);
  const nazioni = indiceNazioni();
  const serveNe = Object.values(paesi).some((v) => v.fonte === 'ne');
  const ne = serveNe ? indiceNaturalEarth() : new Map();

  fs.mkdirSync(OUT_WEB, { recursive: true });
  fs.mkdirSync(OUT_SHAPES, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_NDJSON), { recursive: true });
  // Gli output vengono preparati in staging dalla pipeline; non cancellare
  // in anticipo le sagome valide se una fonte o la semplificazione falliscono.
  fs.writeFileSync(OUT_NDJSON, '', 'utf8');

  let id = 1;
  const prossimoId = () => id++;
  let totale = 0;
  let fuse = 0;
  const tutte = [];

  for (const [isoSorgente, scelta] of Object.entries(paesi)) {
    if (scelta.fonte === 'nessuna') continue;
    const iso = CODICI_APP[isoSorgente] || isoSorgente;
    const nazione = nazioni.get(iso);
    if (!nazione) throw new Error(`${isoSorgente}: nazione ${iso} assente da web/data/countries.geojson`);
    const grezze = scelta.fonte === 'gb'
      ? grezzeGeoBoundaries(isoSorgente, scelta.livello)
      : grezzeNaturalEarth(isoSorgente, ne);
    if (!grezze.length) throw new Error(`${iso}: fonte ${scelta.fonte} senza suddivisioni`);

    const pronte = normalizzaPaese(iso, grezze, nazione, prossimoId);
    fuse += pronte.fuse;
    totale += pronte.features.length;
    tutte.push(...pronte.features);

    const righe = pronte.features.map((f) => JSON.stringify({
      type: 'Feature',
      properties: f.properties,
      geometry: f.geometry,
      tippecanoe: { minzoom: ZOOM_MINIMO_REGIONI },
    })).join('\n');
    fs.appendFileSync(OUT_NDJSON, righe + '\n', 'utf8');
  }

  // Errore in Mercatore, quindi proporzionale ai pixel della mappa: 10 metri
  // valgono circa 0,52 pixel CSS a zoom 12. La percentuale globale eliminava
  // isole e poteva spostare i bordi di chilometri. Esplodere prima di
  // keep-shapes protegge ogni componente, non solo la maggiore della regione.
  fs.writeFileSync(SAGOME_GREZZE, JSON.stringify({ type: 'FeatureCollection', features: tutte }), 'utf8');
  const mapshaper = path.join(ROOT, 'node_modules', 'mapshaper', 'bin', 'mapshaper');
  if (!fs.existsSync(mapshaper)) {
    throw new Error('manca mapshaper: esegui npm install prima di preparare le sagome regionali');
  }
  childProcess.execFileSync(process.execPath, [
    mapshaper, SAGOME_GREZZE,
    '-explode',
    '-proj', 'webmercator',
    '-simplify', 'dp', 'interval=10', 'keep-shapes',
    '-proj', 'wgs84',
    '-o', 'force', 'precision=0.000001', SAGOME,
  ], { stdio: 'inherit' });

  const originali = new Map(tutte.map((f) => [f.properties.code, f]));
  const ricomposte = new Map();
  for (const f of leggiJson(SAGOME).features || []) {
    const code = f.properties.code;
    if (!originali.has(code)) throw new Error(`sagoma con codice sconosciuto: ${code}`);
    const precedente = ricomposte.get(code);
    if (precedente) precedente.geometry = unisciGeometrie(precedente.geometry, f.geometry);
    else ricomposte.set(code, { ...originali.get(code), geometry: f.geometry });
  }
  // keep-shapes non protegge i fori. Se la semplificazione perde componenti
  // o anelli, conservare la geometria sorgente di quella regione.
  const anelli = g => poligoni(g).reduce((n, p) => n + p.length, 0);
  let ripieghi = 0;
  const perPaese = new Map();
  for (const [code, originale] of originali) {
    let f = ricomposte.get(code);
    if (!f || poligoni(f.geometry).length !== poligoni(originale.geometry).length ||
        anelli(f.geometry) !== anelli(originale.geometry)) {
      f = originale;
      ripieghi++;
    }
    const iso = f.properties.country;
    if (!perPaese.has(iso)) perPaese.set(iso, []);
    perPaese.get(iso).push(f);
  }

  const indice = {};
  let totaleByte = 0;
  for (const [iso, features] of [...perPaese].sort()) {
    features.sort((a, b) => a.properties.code.localeCompare(b.properties.code));
    const catalogo = features.map(f => {
      const source = originali.get(f.properties.code);
      let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
      for (const p of poligoni(source.geometry)) for (const ring of p) for (const [x,y] of ring) {
        x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y);
      }
      const testo = JSON.stringify(f);
      fs.writeFileSync(path.join(OUT_SHAPES, `${f.properties.code}.geojson`), testo);
      totaleByte += Buffer.byteLength(testo);
      return { ...f, mask: true, geometry: {type:'Point', coordinates:[(x0+x1)/2,(y0+y1)/2]} };
    });
    const file = path.join(OUT_WEB, `${iso}.geojson`);
    fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features: catalogo }));
    const byte = fs.statSync(file).size;
    totaleByte += byte;
    indice[iso] = { n: features.length, byte, maschere: 'singole' };
  }
  fs.writeFileSync(path.join(OUT_WEB, 'index.json'), JSON.stringify(indice), 'utf8');
  fs.unlinkSync(SAGOME_GREZZE);
  const ndjsonMb = fs.statSync(OUT_NDJSON).size / 1048576;
  console.log(`regioni: ${totale.toLocaleString('it')} in ${Object.keys(indice).length} paesi`);
  console.log(`feature omonime fuse: ${fuse}`);
  console.log(`sagome web: ${(totaleByte / 1048576).toFixed(1)} MB`);
  console.log(`sagome con geometria sorgente per conservare componenti/anelli: ${ripieghi}`);
  console.log(`regions.ndjson: ${ndjsonMb.toFixed(1)} MB, minzoom ${ZOOM_MINIMO_REGIONI}`);
  console.log(`Italia: ${indice.ITA ? indice.ITA.n + ' regioni' : 'assente'}`);
  return { totale, paesi: Object.keys(indice).length, fuse };
}

if (require.main === module) preparaRegioni();

module.exports = { slug, preparaRegioni };
