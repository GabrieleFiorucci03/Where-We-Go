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

/**
 * Territori da staccare dallo stato che li ingloba.
 *
 * In `admin_0_countries` di Natural Earth sono poligoni della madre, perche'
 * quel livello elenca gli **stati sovrani** e non le loro unita' costitutive.
 * Sulla mappa il risultato e' che toccando la Guadalupa si marca la Francia, e
 * sopra ci finisce il tricolore steso su tutto l'insieme.
 *
 * Il criterio per stare in questa tabella non e' "e' un'isola lontana" —
 * altrimenti ci finirebbe mezzo mondo — ma **non esistere a nessun livello**:
 * ne' come nazione, ne' come regione. Le Canarie e le Azzorre non ci sono
 * perche' GADM le ha come regioni di Spagna e Portogallo, quindi si raggiungono
 * gia' accendendo il dettaglio regionale; la Groenlandia e Porto Rico nemmeno,
 * perche' nei dati sono gia' nazioni a se'. Questi sette invece erano invisibili
 * ovunque, e le loro citta' — 179 in tutto — restavano orfane nell'indice.
 *
 * Il taglio e' **geografico**: si staccano i poligoni della madre che cadono
 * dentro uno dei riquadri. Dire "il ventottesimo poligono della Norvegia"
 * funzionerebbe fino al prossimo aggiornamento di Natural Earth, dove l'ordine
 * non e' garantito da niente; il riquadro invece descrive cio' che si vuole
 * davvero, e se un giorno non trovasse nulla lo dice invece di tagliare via il
 * pezzo sbagliato in silenzio.
 *
 * **Le suddivisioni non si aggiungono**: GADM livello 1 non ne ha per nessuno di
 * questi, quindi `data/regions/index.json` non li elenchera' e la scheda non
 * offrira' il dettaglio regionale. E' il comportamento normale di un centinaio
 * di paesi, non un caso da gestire a parte.
 *
 * I riquadri sono piu' d'uno dove il territorio e' sparso: e non devono
 * sovrapporsi fra voci diverse, perche' due che rivendicano lo stesso poligono
 * se lo prenderebbero in ordine di tabella, cioe' per caso.
 */
const TERRITORI_STACCATI = [
  {
    madre: 'FRA',
    code: 'GUF',
    name: 'Guiana francese',
    // minuscolo come tutti gli altri: e' il nome del file in web/flags/
    iso2: 'gf',
    continent: 'South America',
    riquadri: [[-60, 0, -50, 10]], // minLon, minLat, maxLon, maxLat
  },
  {
    madre: 'FRA',
    code: 'GLP',
    name: 'Guadalupa',
    iso2: 'gp',
    continent: 'North America',
    // Stretto apposta verso il basso: la Martinica sta appena sotto, fra 14,43 e
    // 14,88, ed e' la voce qui sotto. Marie-Galante e Les Saintes, che invece
    // della Guadalupa fanno parte, stanno a 15,89 e ci rientrano.
    riquadri: [[-62, 15.5, -61, 17]],
  },
  {
    madre: 'FRA',
    code: 'MTQ',
    name: 'Martinica',
    iso2: 'mq',
    continent: 'North America',
    // un'isola sola, fra 14,43 e 14,88: il riquadro le sta largo di mezzo grado
    // per lato e si ferma ben prima della Guadalupa, che comincia a 15,89
    riquadri: [[-61.5, 14, -60.5, 15.2]],
  },
  {
    madre: 'FRA',
    code: 'REU',
    name: 'Riunione',
    iso2: 're',
    // Africa e non Europe come la madre: nel modello a sette continenti le due
    // isole dell'Oceano Indiano stanno li'
    continent: 'Africa',
    riquadri: [[54.5, -22, 56.5, -20]],
  },
  {
    madre: 'FRA',
    code: 'MYT',
    name: 'Mayotte',
    iso2: 'yt',
    continent: 'Africa',
    riquadri: [[44.5, -13.5, 45.8, -12]],
  },
  {
    madre: 'NLD',
    code: 'BES',
    name: 'Caraibi olandesi',
    iso2: 'bq',
    continent: 'North America',
    // Bonaire a 12,0 piu' Saba e Sint Eustatius a 17,5: un riquadro solo li
    // prende tutti e tre, perche' fra i due estremi non c'e' nient'altro di
    // olandese. Curacao, Aruba e Sint Maarten sono gia' nazioni a se' nei dati,
    // quindi non sono poligoni dei Paesi Bassi e non rischiano di finirci dentro.
    riquadri: [[-69, 11.5, -62.5, 17.9]],
  },
  {
    madre: 'NOR',
    code: 'SJM',
    // ISO 3166 assegna un codice solo a Svalbard **e** Jan Mayen, ed e' lo
    // stesso che usano la bandiera (`sj.svg`) e GeoNames per le citta'. Tenerli
    // separati vorrebbe dire un'entita' chiamata "Svalbard e Jan Mayen" che di
    // Jan Mayen non contiene niente.
    name: 'Svalbard e Jan Mayen',
    iso2: 'sj',
    continent: 'Europe',
    riquadri: [
      // Svalbard: nove poligoni sopra i 74 gradi, da Bjornoya a Kvitoya. La
      // terraferma norvegese si ferma a 71,18, quindi la soglia a 74 non tocca
      // nulla del continente.
      [10, 74, 34, 81],
      // Jan Mayen, dall'altra parte: e' l'unico poligono norvegese a longitudine
      // negativa, e un riquadro unico con Svalbard si porterebbe via le isole di
      // Finnmark che stanno fra 70,9 e 71,14.
      [-10, 70.5, -7.5, 71.5],
    ],
  },
];

/**
 * Stacca dalle rispettive madri i territori di [TERRITORI_STACCATI].
 *
 * Si lavora sul file gia' scritto da `convert`, in sequenza: ogni territorio
 * toglie i propri poligoni da quelli che restano alla madre, cosi' due riquadri
 * non possono rivendicare lo stesso pezzo.
 */
function staccaTerritori() {
  const file = path.join(DATA, 'countries.geojson');
  if (!fs.existsSync(file)) return;
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));

  let prossimoId = Math.max(...json.features.map((f) => f.id || 0)) + 1;
  const restano = {};

  for (const t of TERRITORI_STACCATI) {
    if (json.features.some((f) => f.properties.code === t.code)) {
      console.log(`  ${t.name}: gia' separata`);
      continue;
    }

    const madre = json.features.find((f) => f.properties.code === t.madre);
    if (!madre || madre.geometry.type !== 'MultiPolygon') {
      console.error(`  ${t.name}: ${t.madre} non e' una MultiPolygon, niente da staccare`);
      continue;
    }

    const dentro = (poly) =>
      t.riquadri.some(([minLon, minLat, maxLon, maxLat]) =>
        poly.every((anello) =>
          anello.every(([x, y]) => x >= minLon && x <= maxLon && y >= minLat && y <= maxLat)
        )
      );

    const suoi = madre.geometry.coordinates.filter(dentro);
    if (!suoi.length) {
      console.error(`  ${t.name}: nessun poligono nei riquadri, dati cambiati?`);
      continue;
    }
    madre.geometry.coordinates = madre.geometry.coordinates.filter((p) => !dentro(p));
    restano[t.madre] = madre.geometry.coordinates.length;

    json.features.push({
      type: 'Feature',
      id: prossimoId++,
      properties: {
        code: t.code,
        name: t.name,
        iso2: t.iso2,
        continent: t.continent,
      },
      geometry: { type: 'MultiPolygon', coordinates: suoi },
    });
    console.log(`  ${t.name}: ${suoi.length} poligono/i staccati da ${t.madre}`);
  }

  for (const [madre, n] of Object.entries(restano)) {
    console.log(`  a ${madre} ne restano ${n}`);
  }
  fs.writeFileSync(file, JSON.stringify(json));
}

staccaTerritori();

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
