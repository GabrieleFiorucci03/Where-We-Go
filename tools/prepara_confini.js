/*
 * Confini -> NDJSON pronto per tippecanoe.
 *
 * Due flussi separati, che diventeranno due livelli dello stesso archivio:
 *   countries.ndjson   242 stati da Natural Earth
 *   regions.ndjson     3.583 regioni GADM livello 1, oggi divise per paese
 *
 * Perche' un solo archivio con due livelli e non due archivi: sul telefono
 * ogni archivio in piu' e' un file da gestire nel ponte Kotlin, e i confini
 * insieme pesano poco.
 *
 * Uso:  node tools/prepara_confini.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * Le regioni si prendono dal **grezzo**, non dai file per paese di web/data.
 *
 * Quelli sono passati per una semplificazione al 12% con mapshaper, pensata
 * per il prototipo che caricava il GeoJSON in memoria: 757.357 vertici contro
 * i 4.491.407 del grezzo, cioe' l'83% buttato prima ancora di tilare. Con i
 * tile e' controproducente, perche' tippecanoe semplifica **per livello di
 * zoom** e tiene il dettaglio dove serve. Semplificare due volte significa
 * pagare la perdita e non avere il guadagno.
 *
 * Gli stati invece restano quelli di web/data: hanno 99.595 vertici contro i
 * 99.613 della sorgente Natural Earth, cioe' non sono stati semplificati —
 * quel file ha solo le proprieta' ridotte all'essenziale.
 */
const FILE_REGIONI = path.join(ROOT, 'data_raw', 'regions_gadm_raw.geojson');
const DIR_REGIONI = path.join(ROOT, 'web', 'data', 'regions');
const FILE_STATI = path.join(ROOT, 'web', 'data', 'countries.geojson');
const USCITA = path.join(ROOT, 'data_raw', 'confini');

/**
 * Zoom dal quale le regioni entrano nei tile.
 *
 * Sotto il 3 non si vedranno mai — la dissolvenza stato->regione parte da 3,5
 * (Z.regionStart in web/app.js) — e starebbero nei riquadri dei livelli bassi
 * solo a occupare spazio. Gli stati invece servono da zoom 0.
 */
const ZOOM_MINIMO_REGIONI = 3;

// scrittura sincrona: i confini sono una quindicina di MB, e con lo stream il
// file non era ancora su disco quando lo si misurava subito dopo
function scrivi(file, features, conMinzoom) {
  const righe = features.map((f) => {
    const riga = {
      type: 'Feature',
      properties: f.properties,
      geometry: f.geometry,
    };
    if (conMinzoom) riga.tippecanoe = { minzoom: ZOOM_MINIMO_REGIONI };
    return JSON.stringify(riga);
  });
  fs.writeFileSync(file, righe.join('\n') + '\n', 'utf8');
  return features.length;
}

fs.mkdirSync(USCITA, { recursive: true });

// --- stati -----------------------------------------------------------------
const stati = JSON.parse(fs.readFileSync(FILE_STATI, 'utf8')).features;
const senzaCodice = stati.filter((f) => !f.properties.code).length;
if (senzaCodice) throw new Error(`${senzaCodice} stati senza 'code': sarebbero immarcabili`);
const nStati = scrivi(path.join(USCITA, 'countries.ndjson'), stati, false);

// --- regioni ---------------------------------------------------------------
let regioni;
let provenienza;
if (fs.existsSync(FILE_REGIONI)) {
  regioni = JSON.parse(fs.readFileSync(FILE_REGIONI, 'utf8')).features || [];
  provenienza = path.basename(FILE_REGIONI);
} else {
  // ricaduta sui file per paese, gia' semplificati: meno preciso, ma il
  // grezzo non e' versionato e potrebbe non esserci su un'altra macchina
  const file = fs.readdirSync(DIR_REGIONI).filter((f) => f.endsWith('.geojson')).sort();
  regioni = [];
  for (const nome of file) {
    const g = JSON.parse(fs.readFileSync(path.join(DIR_REGIONI, nome), 'utf8'));
    for (const f of g.features || []) regioni.push(f);
  }
  provenienza = `${file.length} file semplificati (manca il grezzo)`;
}

// Il `code` e' il GID di GADM ("ITA.16_1") ed e' la chiave del database utente:
// una regione senza codice non sarebbe marcabile, e il difetto passerebbe
// inosservato fino a quando qualcuno prova a segnarla.
const regioniSenzaCodice = regioni.filter((f) => !f.properties.code);
if (regioniSenzaCodice.length) {
  throw new Error(`${regioniSenzaCodice.length} regioni senza 'code': sarebbero immarcabili`);
}
const nRegioni = scrivi(path.join(USCITA, 'regions.ndjson'), regioni, true);

// --- resoconto -------------------------------------------------------------
console.log(`stati:   ${nStati.toLocaleString('it')} da ${path.basename(FILE_STATI)}`);
console.log(`regioni: ${nRegioni.toLocaleString('it')} da ${provenienza}, minzoom ${ZOOM_MINIMO_REGIONI}`);
for (const n of ['countries.ndjson', 'regions.ndjson']) {
  const mb = fs.statSync(path.join(USCITA, n)).size / 1024 / 1024;
  console.log(`  ${n}: ${mb.toFixed(1)} MB`);
}
