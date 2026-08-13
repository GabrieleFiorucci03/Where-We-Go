/*
 * Ritaglio della bandiera sulla sagoma di uno stato o di una regione.
 *
 * Modulo condiviso fra il prototipo della mappa (app.js) e la pagina di
 * confronto delle modalita' (compare.js).
 *
 * Il problema centrale: quasi tutte le bandiere sono orizzontali (proporzioni
 * 1,5-2,0) mentre quasi tutte le sagome nazionali hanno un ingombro piu' alto
 * che largo, e per giunta molte riempiono male il proprio ingombro (la Russia
 * ne occupa il 39%, il Giappone l'8%). Non esiste un adattamento che vada bene
 * per tutti: da qui le modalita' alternative, da confrontare a occhio.
 */

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

/** Elenco dei poligoni di una geometria; ogni poligono e' un array di anelli. */
export function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/**
 * Latitudine massima rappresentabile in Mercatore.
 *
 * Oltre questo valore la proiezione diverge, e un `image source` con quelle
 * coordinate non viene disegnato **affatto**: si vedeva il riempimento pieno e
 * nessuna bandiera. Riguarda un solo caso al mondo — l'Antartide, che nei dati
 * arriva a -89,999, cioe' quasi cinque gradi oltre il limite. Tutti gli altri
 * 241 paesi ci stanno dentro.
 *
 * Il taglio va fatto sul bbox del cluster, **non** sulle coordinate del
 * riquadro: quel bbox serve anche a rasterizzare la maschera, e limitarlo solo
 * in fondo la comprimerebbe verticalmente, sfalsandola rispetto alla costa.
 */
export const LAT_MAX_MERCATORE = 85.051129;

const limitaLat = (lat) => Math.max(-LAT_MAX_MERCATORE, Math.min(LAT_MAX_MERCATORE, lat));

export function bboxOfPolygon(poly) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const ring of poly) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

export function mergeBbox(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Distanza fra due bbox: 0 se si toccano o si sovrappongono. */
export function bboxGap(a, b) {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return Math.hypot(dx, dy);
}

/**
 * Raggruppa i poligoni in blocchi geograficamente vicini, uno per immagine.
 *
 * Senza questo, il bbox della Francia e' largo 118 gradi (dalla Guyana a
 * Riunione) e la Francia metropolitana ne occupa l'1,3%: sulla terraferma
 * finisce solo la banda bianca. Sei stati superano i 180 gradi e non erano
 * rappresentabili affatto con un solo quad.
 */
export function clusterPolygons(polys, maxClusters = 8) {
  const items = polys
    .map((poly) => {
      const bbox = bboxOfPolygon(poly);
      return { poly, bbox, area: (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) };
    })
    .sort((a, b) => b.area - a.area);

  const clusters = [];
  for (const item of items) {
    let migliore = null;
    let distanzaMigliore = Infinity;
    for (const c of clusters) {
      const unito = mergeBbox(c.bbox, item.bbox);
      if (unito[2] - unito[0] > 170) continue; // non attraversare l'antimeridiano
      const gap = bboxGap(c.bbox, item.bbox);
      const soglia = Math.max(6, 0.6 * Math.max(c.bbox[2] - c.bbox[0], c.bbox[3] - c.bbox[1]));
      if (gap <= soglia && gap < distanzaMigliore) {
        migliore = c;
        distanzaMigliore = gap;
      }
    }
    if (migliore) {
      migliore.polys.push(item.poly);
      migliore.bbox = mergeBbox(migliore.bbox, item.bbox);
    } else if (clusters.length < maxClusters) {
      clusters.push({ polys: [item.poly], bbox: item.bbox });
    }
    // i poligoni rimanenti restano scoperti: mostrano il colore pieno
  }
  return clusters
    // vedi LAT_MAX_MERCATORE: senza questo taglio l'Antartide non mostra
    // bandiera, perche' il suo riquadro cade fuori dalla proiezione
    .map((c) => ({ ...c, bbox: [c.bbox[0], limitaLat(c.bbox[1]), c.bbox[2], limitaLat(c.bbox[3])] }))
    .filter((c) => c.bbox[2] - c.bbox[0] > 0 && c.bbox[3] - c.bbox[1] > 0);
}

/**
 * Divide un blocco troppo largo in fasce di longitudine renderizzabili.
 *
 * Serve all'Antartide, che in Natural Earth e' un unico poligono largo 360
 * gradi: nessun blocco puo' contenerlo e restava senza bandiera. Le fasce
 * condividono lo stesso `globalBbox`, cosi' la bandiera viene posizionata una
 * volta sola sull'intera estensione e ogni fascia ne disegna la propria parte,
 * senza ripetizioni ne' salti.
 */
export function splitIntoBands(cluster, maxWidth = 160) {
  const [minLon, minLat, maxLon, maxLat] = cluster.bbox;
  const width = maxLon - minLon;
  if (width <= maxWidth) {
    return [{ polys: cluster.polys, bbox: cluster.bbox, globalBbox: cluster.bbox }];
  }
  const n = Math.ceil(width / maxWidth);
  const passo = width / n;
  const fasce = [];
  for (let i = 0; i < n; i++) {
    fasce.push({
      polys: cluster.polys,
      bbox: [minLon + i * passo, minLat, minLon + (i + 1) * passo, maxLat],
      globalBbox: cluster.bbox,
    });
  }
  return fasce;
}

/** Area di un poligono in spazio Mercatore (formula di Gauss); i buchi sottraggono. */
export function areaPoligono(poly) {
  let totale = 0;
  poly.forEach((ring, idx) => {
    let somma = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      somma += ring[i][0] * mercY(ring[i + 1][1]) - ring[i + 1][0] * mercY(ring[i][1]);
    }
    const a = Math.abs(somma / 2);
    totale += idx === 0 ? a : -a;
  });
  return Math.max(0, totale);
}

/**
 * Ingombro dei soli poligoni rilevanti, ignorando le isole minori.
 *
 * Serve dove poche isolette dilatano il rettangolo e sbilanciano la bandiera:
 * il rettangolo della Russia arriva a 81,9 gradi solo per Novaja Zemlja e
 * compagne, mentre la terraferma si ferma al Tajmyr a 77,7 — e in Mercatore
 * quella differenza vale un terzo dell'altezza. Da usare **solo** sui paesi
 * elencati fra le eccezioni: applicarlo a tutti cambierebbe decine di rese
 * che oggi vanno bene.
 */
export function bboxPoligoniMaggiori(polys, frazioneMinima = 0.01) {
  if (polys.length < 2) return null;
  const aree = polys.map(areaPoligono);
  const totale = aree.reduce((s, v) => s + v, 0);
  if (!totale) return null;

  const tenuti = polys.filter((_, i) => aree[i] >= frazioneMinima * totale);
  if (!tenuti.length || tenuti.length === polys.length) return null;

  return tenuti.map(bboxOfPolygon).reduce(mergeBbox);
}

/** Mercatore sferico in "gradi equivalenti", omogeneo con la longitudine. */
export function mercY(lat) {
  const clamped = Math.max(-85.05, Math.min(85.05, lat));
  return (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
}

/**
 * Latitudine -> y del canvas. Il segno meno serve perche' nel canvas la y
 * cresce verso il basso mentre latitudine e y di Mercatore crescono in su.
 */
export function projY(lat, mode) {
  return mode === 'mercator' ? -mercY(lat) : -lat;
}

// ---------------------------------------------------------------------------
// Bandiere
// ---------------------------------------------------------------------------

const flagCache = new Map();

/**
 * Carica una bandiera SVG e la rasterizza una volta sola in un canvas.
 * Si restituisce un canvas e non l'<img> perche' il disegno a nove settori usa
 * drawImage con rettangolo sorgente, inaffidabile su SVG senza dimensioni.
 */
export async function loadFlag(iso2, basePath = 'flags') {
  if (flagCache.has(iso2)) return flagCache.get(iso2);

  const promise = (async () => {
    const res = await fetch(`${basePath}/${iso2}.svg`);
    if (!res.ok) throw new Error(`bandiera mancante: ${iso2}`);
    let svg = await res.text();

    let aspect = 3 / 2;
    const vb = svg.match(/viewBox\s*=\s*["']([-\d.\s,]+)["']/i);
    if (vb) {
      const p = vb[1].trim().split(/[\s,]+/).map(Number);
      if (p.length === 4 && p[2] > 0 && p[3] > 0) aspect = p[2] / p[3];
    }

    const ih = 512;
    const iw = Math.max(1, Math.round(ih * aspect));
    if (!/<svg[^>]*\swidth\s*=/i.test(svg)) {
      svg = svg.replace(/<svg/i, `<svg width="${iw}" height="${ih}"`);
    }

    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error(`SVG non rasterizzabile: ${iso2}`));
      img.src = url;
    });

    const c = document.createElement('canvas');
    c.width = iw;
    c.height = ih;
    c.getContext('2d').drawImage(img, 0, 0, iw, ih);
    URL.revokeObjectURL(url);
    return { canvas: c, aspect };
  })();

  flagCache.set(iso2, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Analisi della sagoma
// ---------------------------------------------------------------------------

/** Griglia binaria a bassa risoluzione della sagoma; serve alle analisi. */
function maskGrid(path, w, h, lato = 96) {
  const scala = Math.min(lato / w, lato / h);
  const gw = Math.max(1, Math.round(w * scala));
  const gh = Math.max(1, Math.round(h * scala));
  const c = document.createElement('canvas');
  c.width = gw;
  c.height = gh;
  const g = c.getContext('2d');
  g.setTransform(scala, 0, 0, scala, 0, 0);
  g.fillStyle = '#000';
  g.fill(path, 'evenodd');
  const dati = g.getImageData(0, 0, gw, gh).data;
  return { gw, gh, scala, pieno: (x, y) => dati[(y * gw + x) * 4 + 3] > 128 };
}

/** Rettangolo massimo interamente contenuto nella sagoma. */
export function largestInscribedRect(path, w, h) {
  const { gw, gh, scala, pieno } = maskGrid(path, w, h);
  const altezze = new Int32Array(gw);
  let migliore = { area: 0, x: 0, y: 0, w: 0, h: 0 };

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) altezze[x] = pieno(x, y) ? altezze[x] + 1 : 0;
    const pila = [];
    for (let x = 0; x <= gw; x++) {
      const altezza = x === gw ? 0 : altezze[x];
      let inizio = x;
      while (pila.length && pila[pila.length - 1].h >= altezza) {
        const top = pila.pop();
        const area = top.h * (x - top.x);
        if (area > migliore.area) {
          migliore = { area, x: top.x, y: y - top.h + 1, w: x - top.x, h: top.h };
        }
        inizio = top.x;
      }
      pila.push({ x: inizio, h: altezza });
    }
  }
  if (!migliore.area) return null;
  return { x: migliore.x / scala, y: migliore.y / scala, w: migliore.w / scala, h: migliore.h / scala };
}

/**
 * Rettangolo del "nucleo" della sagoma: la zona che contiene la parte centrale
 * della sua area, scartando le code (isolotti, penisole sottili, territori
 * remoti gia' sopravvissuti al raggruppamento).
 *
 * A differenza del rettangolo inscritto non deve stare *dentro* la sagoma, e
 * quindi non degenera in una fascia sottile: per la Russia individua la banda
 * di latitudini dove il paese c'e' davvero, invece dell'intero ingombro che
 * scende fino al Caucaso.
 */
export function coreBox(path, w, h, coda = 0.05) {
  const { gw, gh, scala, pieno } = maskGrid(path, w, h);
  const colonne = new Float64Array(gw);
  const righe = new Float64Array(gh);
  let totale = 0;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!pieno(x, y)) continue;
      colonne[x]++;
      righe[y]++;
      totale++;
    }
  }
  if (!totale) return null;

  const bordi = (arr, n) => {
    const obiettivoBasso = totale * coda;
    const obiettivoAlto = totale * (1 - coda);
    let cum = 0;
    let lo = 0;
    let hi = n - 1;
    for (let i = 0; i < n; i++) {
      cum += arr[i];
      if (cum >= obiettivoBasso) { lo = i; break; }
    }
    cum = 0;
    for (let i = 0; i < n; i++) {
      cum += arr[i];
      if (cum >= obiettivoAlto) { hi = i; break; }
    }
    if (hi <= lo) { lo = 0; hi = n - 1; }
    return [lo, hi + 1];
  };

  const [x0, x1] = bordi(colonne, gw);
  const [y0, y1] = bordi(righe, gh);
  return { x: x0 / scala, y: y0 / scala, w: (x1 - x0) / scala, h: (y1 - y0) / scala };
}

/**
 * Quanta parte della bandiera si vede davvero attraverso la sagoma, con la
 * bandiera posata nel rettangolo indicato.
 *
 * E' la misura che conta, e non la forma del paese: l'Italia riempie solo il
 * 27% del proprio rettangolo ma la sua sagoma attraversa tutte e tre le bande
 * verticali del tricolore, quindi si vede bene; la Russia ne riempie il 39% ma
 * la sua bandiera e' a bande orizzontali e la sagoma ne intercetta solo una
 * parte, quindi si vede male. Un semplice rapporto di aree non distinguerebbe
 * i due casi, questo conteggio a caselle si'.
 *
 * @returns frazione fra 0 e 1 delle caselle della bandiera coperte dalla sagoma
 */
export function flagVisibility(path, w, h, rect, caselle = 16) {
  const { gw, gh, scala, pieno } = maskGrid(path, w, h);
  const viste = new Uint8Array(caselle * caselle);
  let n = 0;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!pieno(x, y)) continue;
      const cx = (x + 0.5) / scala;
      const cy = (y + 0.5) / scala;
      const u = (cx - rect.x) / rect.w;
      const v = (cy - rect.y) / rect.h;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const bx = Math.min(caselle - 1, Math.floor(u * caselle));
      const by = Math.min(caselle - 1, Math.floor(v * caselle));
      const i = by * caselle + bx;
      if (!viste[i]) {
        viste[i] = 1;
        n++;
      }
    }
  }
  return n / (caselle * caselle);
}

/**
 * Disegna la bandiera nel rettangolo indicato e ne prolunga i bordi fino a
 * riempire il canvas, come un border-image a nove settori. Sulle bandiere a
 * bande il prolungamento e' invisibile: continua le bande.
 */
export function drawFlagNineSlice(ctx, flag, rx, ry, rw, rh, w, h) {
  const src = flag.canvas;
  const iw = src.width;
  const ih = src.height;

  ctx.drawImage(src, 0, 0, iw, ih, rx, ry, rw, rh);

  const sinistra = rx;
  const destra = w - (rx + rw);
  const sopra = ry;
  const sotto = h - (ry + rh);

  if (sinistra > 0) ctx.drawImage(src, 0, 0, 1, ih, 0, ry, sinistra, rh);
  if (destra > 0) ctx.drawImage(src, iw - 1, 0, 1, ih, rx + rw, ry, destra, rh);
  if (sopra > 0) ctx.drawImage(src, 0, 0, iw, 1, rx, 0, rw, sopra);
  if (sotto > 0) ctx.drawImage(src, 0, ih - 1, iw, 1, rx, ry + rh, rw, sotto);

  if (sinistra > 0 && sopra > 0) ctx.drawImage(src, 0, 0, 1, 1, 0, 0, sinistra, sopra);
  if (destra > 0 && sopra > 0) ctx.drawImage(src, iw - 1, 0, 1, 1, rx + rw, 0, destra, sopra);
  if (sinistra > 0 && sotto > 0) ctx.drawImage(src, 0, ih - 1, 1, 1, 0, ry + rh, sinistra, sotto);
  if (destra > 0 && sotto > 0) ctx.drawImage(src, iw - 1, ih - 1, 1, 1, rx + rw, ry + rh, destra, sotto);
}

// ---------------------------------------------------------------------------
// Modalita' di adattamento
// ---------------------------------------------------------------------------

/**
 * Sotto questa frazione di bandiera visibile, "auto" abbandona il ritaglio.
 * 0,45 lascia in "ritaglia" l'Italia (0,56) e vi toglie l'Irlanda (0,34).
 */
export const SOGLIA_AUTO = 0.45;

export const FIT_MODES = [
  { id: 'auto', label: 'Automatico', hint: 'ritaglio come prima, tranne dove si vedrebbe troppo poca bandiera' },
  { id: 'ritaglia', label: 'Ritaglia', hint: 'proporzioni intatte, si vede solo la fascia centrale' },
  { id: 'deforma', label: 'Deforma', hint: 'bandiera intera stirata sull ingombro' },
  { id: 'nucleo', label: 'Nucleo', hint: 'stirata sulla zona dove il paese c e davvero, bordi prolungati' },
  { id: 'estendi', label: 'Estendi', hint: 'intera e non deformata nell ingombro, bordi prolungati' },
  { id: 'inscritto', label: 'Inscritto', hint: 'intera dentro il rettangolo inscritto, bordi prolungati' },
];

/**
 * Ritaglia la bandiera sulla sagoma e restituisce un data URL PNG.
 * @param {Array} polys poligoni del blocco, ciascuno array di anelli [lon,lat]
 * @param {Array} bbox  [minLon, minLat, maxLon, maxLat] del blocco
 * @param {string} iso2 codice della bandiera
 * @param {object} opzioni { proiezione: 'mercator'|'equirect', fit, lato, basePath }
 */
export async function renderFlagMask(polys, bbox, iso2, opzioni = {}) {
  const proiezione = opzioni.proiezione || 'mercator';
  const fit = opzioni.fit || 'ritaglia';
  const LATO = opzioni.lato || 1024;

  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (maxLon - minLon > 180) return null;

  const yTop = projY(maxLat, proiezione);
  const yBottom = projY(minLat, proiezione);
  const geoW = maxLon - minLon;
  const geoH = yBottom - yTop;
  if (!(geoW > 0) || !(geoH > 0)) return null;

  let w = LATO;
  let h = Math.round((LATO * geoH) / geoW);
  if (h > LATO) {
    h = LATO;
    w = Math.round((LATO * geoW) / geoH);
  }
  w = Math.max(w, 8);
  h = Math.max(h, 8);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const px = (lon) => ((lon - minLon) / geoW) * w;
  const py = (lat) => ((projY(lat, proiezione) - yTop) / geoH) * h;

  const path = new Path2D();
  for (const poly of polys) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const x = px(lon);
        const y = py(lat);
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();
    }
  }

  const flag = await loadFlag(iso2, opzioni.basePath);
  let nota = fit;

  // Se il blocco e' stato spezzato in fasce, la bandiera va posizionata
  // sull'estensione complessiva: questa fascia ne disegna solo la sua parte,
  // e le porzioni fuori dal canvas vengono scartate dal canvas stesso.
  const gb = opzioni.globalBbox || bbox;
  const inFasce = gb !== bbox && (gb[0] !== bbox[0] || gb[2] !== bbox[2]);
  const area = {
    x: px(gb[0]),
    y: py(gb[3]),
    w: px(gb[2]) - px(gb[0]),
    h: py(gb[1]) - py(gb[3]),
  };

  ctx.save();
  ctx.clip(path, 'evenodd'); // evenodd: enclave e laghi restano trasparenti

  /** rettangolo che occuperebbe la bandiera con il ritaglio "cover" */
  const rettangoloCover = () => {
    let dw = area.w;
    let dh = area.w / flag.aspect;
    if (dh < area.h) {
      dh = area.h;
      dw = area.h * flag.aspect;
    }
    return { x: area.x + (area.w - dw) / 2, y: area.y + (area.h - dh) / 2, w: dw, h: dh };
  };

  let fitEffettivo = fit;
  let visibilita = null;

  if (fit === 'auto') {
    // si misura quanta bandiera si vedrebbe con il ritaglio classico e lo si
    // cambia solo se il risultato sarebbe povero: cosi' i paesi che gia'
    // funzionavano restano identici a prima
    visibilita = flagVisibility(path, w, h, rettangoloCover());
    fitEffettivo = visibilita >= SOGLIA_AUTO ? 'ritaglia' : 'nucleo';
    nota = `auto->${fitEffettivo} (${Math.round(visibilita * 100)}% visibile)`;
  }

  // le modalita' basate sull'analisi della sagoma non hanno senso su una
  // singola fascia, che vedrebbe solo un pezzo del paese
  if (inFasce && (fitEffettivo === 'nucleo' || fitEffettivo === 'inscritto')) {
    nota = `${fitEffettivo}->estendi (in fasce)`;
    fitEffettivo = 'estendi';
  }

  if (fitEffettivo === 'deforma') {
    if (opzioni.estendiBordi) {
      // il rettangolo della bandiera è più piccolo della sagoma (eccezione per
      // paese): i bordi vengono prolungati, così le isole escluse prendono il
      // colore della banda più vicina invece di restare scoperte
      drawFlagNineSlice(ctx, flag, area.x, area.y, area.w, area.h, w, h);
    } else {
      ctx.drawImage(flag.canvas, area.x, area.y, area.w, area.h);
    }
  } else if (fitEffettivo === 'nucleo') {
    const box = coreBox(path, w, h) || { x: area.x, y: area.y, w: area.w, h: area.h };
    drawFlagNineSlice(ctx, flag, box.x, box.y, box.w, box.h, w, h);
  } else if (fitEffettivo === 'estendi' || fitEffettivo === 'inscritto') {
    let box = { x: area.x, y: area.y, w: area.w, h: area.h };
    if (fitEffettivo === 'inscritto') {
      const ins = largestInscribedRect(path, w, h);
      // un rettangolo inscritto troppo piccolo o troppo sbilanciato riduce la
      // bandiera a un francobollo circondato da bande stirate
      const proporzionato = ins && Math.max(ins.w / ins.h, ins.h / ins.w) < 4;
      if (ins && proporzionato && ins.w * ins.h >= 0.15 * w * h) box = ins;
      else nota = 'inscritto->ingombro';
    }
    let dw = box.w;
    let dh = box.w / flag.aspect;
    if (dh > box.h) {
      dh = box.h;
      dw = box.h * flag.aspect;
    }
    drawFlagNineSlice(ctx, flag, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh, w, h);
  } else {
    // 'ritaglia' (cover)
    const r = rettangoloCover();
    ctx.drawImage(flag.canvas, r.x, r.y, r.w, r.h);
  }

  ctx.restore();
  return {
    url: canvas.toDataURL('image/png'),
    bbox,
    size: `${w}x${h}`,
    fit: nota,
    fitEffettivo,
    visibilita,
    canvas,
  };
}
