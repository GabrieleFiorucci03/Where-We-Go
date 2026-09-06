/**
 * genera_icona.js — dall'immagine sorgente del globo alle icone di lancio
 * Android, in tutte le densita'.
 *
 *   node tools/genera_icona.js [sorgente.png]
 *
 * Perche' uno script e non cinque PNG ritagliati a mano: l'icona va rifatta
 * ogni volta che si tocca il disegno, e rifarla a mano significa dieci file
 * che prima o poi non corrispondono piu' fra loro. Qui la sorgente e' una
 * sola e il resto e' derivato.
 *
 * Cosa produce, sotto android/app/src/main/res/:
 *
 *   mipmap-DENSITA/ic_launcher_foreground.png   il globo per l'icona adattiva
 *   mipmap-DENSITA/ic_launcher.png              icona classica (fallback)
 *   mipmap-DENSITA/ic_launcher_round.png        idem, per i launcher che la chiedono
 *
 * I due XML in mipmap-anydpi-v26/ e il colore di sfondo sono scritti a mano
 * una volta sola: non dipendono dall'immagine.
 *
 * Sulla geometria dell'icona adattiva: la tela e' 108dp, ma i launcher ne
 * mostrano solo i 72dp centrali — i 18dp per lato servono al ritaglio e al
 * parallasse. Il globo e' un cerchio, quindi lo si porta a **esattamente**
 * 72dp di diametro: sui launcher con maschera tonda tocca il bordo senza
 * essere tagliato, su quelli con maschera quadrata resta inscritto.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const RADICE = path.join(__dirname, '..');
const RES = path.join(RADICE, 'android', 'app', 'src', 'main', 'res');
const SORGENTE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(RADICE, 'assets-sorgente', 'icona-mappamondo.jpg');

// dp per densita': mdpi = 1x e si sale da li'
const DENSITA = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

const LATO_ADATTIVA = 108;  // dp, tela intera dell'icona adattiva
const DIAMETRO_SICURO = 72; // dp, la parte che i launcher mostrano davvero
const LATO_CLASSICA = 48;   // dp, icona di lancio tradizionale
const DIAMETRO_CLASSICA = 44; // dp: un filo di margine, come vuole la vecchia guida

/** Ritaglia l'immagine sul rettangolo dei pixel non trasparenti. */
function ritagliaSuAlfa(img, soglia = 8) {
  let minx = img.width, miny = img.height, maxx = -1, maxy = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(img.width * y + x) * 4 + 3] > soglia) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  if (maxx < 0) throw new Error('immagine tutta trasparente');

  // il globo e' tondo: si tiene il quadrato che lo contiene, centrato sul suo
  // centro, cosi' il cerchio non si deforma se il ritaglio esce rettangolare
  const cx = (minx + maxx + 1) / 2;
  const cy = (miny + maxy + 1) / 2;
  const lato = Math.max(maxx - minx + 1, maxy - miny + 1);
  const x0 = Math.round(cx - lato / 2);
  const y0 = Math.round(cy - lato / 2);

  const out = new PNG({ width: lato, height: lato });
  for (let y = 0; y < lato; y++) {
    for (let x = 0; x < lato; x++) {
      const sx = x0 + x, sy = y0 + y;
      const d = (lato * y + x) * 4;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) {
        out.data[d] = out.data[d + 1] = out.data[d + 2] = out.data[d + 3] = 0;
      } else {
        const s = (img.width * sy + sx) * 4;
        out.data[d] = img.data[s];
        out.data[d + 1] = img.data[s + 1];
        out.data[d + 2] = img.data[s + 2];
        out.data[d + 3] = img.data[s + 3];
      }
    }
  }
  return out;
}

/**
 * Riduce a `lato` pixel facendo la media sull'area del pixel sorgente.
 * La media va fatta sui colori **premoltiplicati** per l'alfa: sommare i
 * colori RGB dei pixel trasparenti sporcherebbe il bordo del globo di nero,
 * ed e' esattamente il bordo che si nota.
 */
function riduci(img, lato) {
  const out = new PNG({ width: lato, height: lato });
  const scala = img.width / lato;
  for (let y = 0; y < lato; y++) {
    const sy0 = y * scala, sy1 = (y + 1) * scala;
    const iy0 = Math.floor(sy0), iy1 = Math.min(img.height, Math.ceil(sy1));
    for (let x = 0; x < lato; x++) {
      const sx0 = x * scala, sx1 = (x + 1) * scala;
      const ix0 = Math.floor(sx0), ix1 = Math.min(img.width, Math.ceil(sx1));

      let r = 0, g = 0, b = 0, a = 0, peso = 0;
      for (let sy = iy0; sy < iy1; sy++) {
        const py = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (py <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          const px = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (px <= 0) continue;
          const w = px * py;
          const s = (img.width * sy + sx) * 4;
          const al = img.data[s + 3] / 255;
          r += img.data[s] * al * w;
          g += img.data[s + 1] * al * w;
          b += img.data[s + 2] * al * w;
          a += img.data[s + 3] * w;
          peso += w;
        }
      }

      const d = (lato * y + x) * 4;
      if (peso === 0 || a === 0) {
        out.data[d] = out.data[d + 1] = out.data[d + 2] = out.data[d + 3] = 0;
      } else {
        const alfa = a / peso;              // 0..255
        const smoltiplica = peso * (alfa / 255); // per tornare da premoltiplicato
        out.data[d] = Math.round(Math.min(255, r / smoltiplica));
        out.data[d + 1] = Math.round(Math.min(255, g / smoltiplica));
        out.data[d + 2] = Math.round(Math.min(255, b / smoltiplica));
        out.data[d + 3] = Math.round(alfa);
      }
    }
  }
  return out;
}

/** Mette `globo` (quadrato) al centro di una tela `lato` x `lato` trasparente. */
function centraSuTela(globo, lato) {
  const out = new PNG({ width: lato, height: lato });
  out.data.fill(0);
  const off = Math.round((lato - globo.width) / 2);
  for (let y = 0; y < globo.height; y++) {
    const ty = y + off;
    if (ty < 0 || ty >= lato) continue;
    for (let x = 0; x < globo.width; x++) {
      const tx = x + off;
      if (tx < 0 || tx >= lato) continue;
      const s = (globo.width * y + x) * 4;
      const d = (lato * ty + tx) * 4;
      out.data[d] = globo.data[s];
      out.data[d + 1] = globo.data[s + 1];
      out.data[d + 2] = globo.data[s + 2];
      out.data[d + 3] = globo.data[s + 3];
    }
  }
  return out;
}

/**
 * Legge la sorgente, PNG o JPEG.
 *
 * Il JPEG e' arrivato dopo: la prima icona era un globo disegnato su
 * trasparenza, la seconda e' un'icona gia' composta — badge, sfondo, disegno
 * dentro — e viene da un generatore che produce JPEG. Le due strade divergono
 * subito dopo, in `estraiSoggetto`.
 */
function leggiImmagine(file) {
  if (/\.jpe?g$/i.test(file)) {
    const jpeg = require('jpeg-js');
    const d = jpeg.decode(fs.readFileSync(file), { useTArray: true });
    const png = new PNG({ width: d.width, height: d.height });
    png.data.set(d.data);
    return png;
  }
  return PNG.sync.read(fs.readFileSync(file));
}

/** Quanti pixel dell'immagine hanno un alfa che non sia opaco. */
function haTrasparenza(img) {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 250) return true;
  return false;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const pixel = (img, x, y) => {
  const i = (img.width * y + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

/**
 * Riquadro del badge dentro un'immagine opaca.
 *
 * La sorgente e' un'icona posata su una pagina di colore uniforme: il badge e'
 * tutto cio' che da quel colore si discosta. Il colore della pagina si legge
 * dall'angolo, non si assume bianco — nella sorgente attuale e' un grigio caldo.
 */
function riquadroBadge(img) {
  const pagina = pixel(img, 2, 2);
  let b = [img.width, img.height, -1, -1];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (dist(pixel(img, x, y), pagina) > 20) {
        if (x < b[0]) b[0] = x;
        if (y < b[1]) b[1] = y;
        if (x > b[2]) b[2] = x;
        if (y > b[3]) b[3] = y;
      }
    }
  }
  if (b[2] < 0) throw new Error('nessun badge distinguibile dallo sfondo della pagina');
  return b;
}

/** Ritaglia un rettangolo. */
function ritaglia(img, [x0, y0, x1, y1]) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (img.width * (y0 + y) + (x0 + x)) * 4;
      const d = (w * y + x) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
      out.data[d + 3] = img.data[s + 3];
    }
  }
  return out;
}

/**
 * Separa il disegno dal fondo del badge, stimando il fondo **riga per riga**.
 *
 * Il badge non e' a tinta piatta: ha un gradiente verticale, da #1b314a in alto
 * a #142239 in basso, piu' una leggera vignettatura ai lati. Qualunque soglia su
 * un colore solo prende anche il fondo da una parte o perde il disegno
 * dall'altra — provato, restituisce il badge intero. Riga per riga il fondo e'
 * invece quasi costante, e cio' che se ne discosta e' disegno.
 *
 * Il fondo si campiona dentro la maschera del badge **erosa** di una ventina di
 * pixel. L'erosione non e' un dettaglio: sul bordo netto fra badge e pagina il
 * JPEG lascia un alone di artefatti largo una decina di pixel, e sulle righe che
 * attraversano gli angoli arrotondati quel bordo e' quasi orizzontale, quindi in
 * orizzontale l'alone si allarga a dismisura. Rientrare di una misura fissa
 * bastava a meta' immagine e non all'altra; erodere risolve gli angoli per
 * costruzione.
 *
 * Restituisce il solo disegno su trasparenza, ritagliato sul suo ingombro
 * **vero**: misurarlo sulle linee centrali lo sottostima, perche' l'orbita
 * tratteggiata e' un'ellisse che si allarga in diagonale, e il globo finiva
 * tagliato dalla maschera tonda del launcher.
 */
function disegnoSuTrasparenza(img, b) {
  const W = img.width;
  const pagina = pixel(img, 2, 2);

  // maschera del badge, poi erosa
  const badge = new Uint8Array(W * img.height);
  for (let y = b[1]; y <= b[3]; y++) {
    for (let x = b[0]; x <= b[2]; x++) {
      if (dist(pixel(img, x, y), pagina) > 20) badge[W * y + x] = 1;
    }
  }
  const R = 22;
  const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < img.height && badge[W * y + x];
  const eroso = new Uint8Array(W * img.height);
  const raggi = [
    [R, 0], [-R, 0], [0, R], [0, -R],
    [16, 16], [16, -16], [-16, 16], [-16, -16],
  ];
  for (let y = b[1]; y <= b[3]; y++) {
    for (let x = b[0]; x <= b[2]; x++) {
      if (!badge[W * y + x]) continue;
      if (raggi.every(([dx, dy]) => dentro(x + dx, y + dy))) eroso[W * y + x] = 1;
    }
  }

  const alfa = new Float32Array(W * img.height);
  let a = [W, img.height, -1, -1];

  for (let y = b[1]; y <= b[3]; y++) {
    const xs = [];
    for (let x = b[0]; x <= b[2]; x++) if (eroso[W * y + x]) xs.push(x);
    if (xs.length < 80) continue; // riga troppo corta: e' un angolo, non c'e' disegno

    // mediana di dodici campioni per lato, presi ai bordi della parte erosa:
    // la mediana e non la media, per non farsi sballare da un artefatto isolato
    const campioni = [];
    for (let k = 0; k < 12; k++) {
      campioni.push(pixel(img, xs[k], y));
      campioni.push(pixel(img, xs[xs.length - 1 - k], y));
    }
    const fondo = [0, 1, 2].map((c) => {
      const v = campioni.map((p) => p[c]).sort((m, n) => m - n);
      return v[Math.floor(v.length / 2)];
    });

    for (const x of xs) {
      // sfumato e non a soglia netta: il disegno e' antialiasato sul fondo, e un
      // taglio secco gli lascerebbe un bordo scuro tutto attorno
      // rampa corta: il disegno deve diventare opaco in fretta. Con una rampa
      // lunga i tratti sottili della rosa dei venti — che il JPEG circonda di
      // artefatti — restavano a meta strada, e ridotti a 72dp si sfarinavano
      const v = Math.max(0, Math.min(1, (dist(pixel(img, x, y), fondo) - 22) / 14));
      if (v <= 0) continue;
      alfa[W * y + x] = v;
      if (v > 0.5) {
        if (x < a[0]) a[0] = x;
        if (y < a[1]) a[1] = y;
        if (x > a[2]) a[2] = x;
        if (y > a[3]) a[3] = y;
      }
    }
  }
  if (a[2] < 0) throw new Error('nessun disegno riconoscibile dentro il badge');

  chiudiBuchi(alfa, W, img.height, a);

  // quadrato centrato sull'ingombro: il disegno va scalato senza deformarlo
  const cx = (a[0] + a[2] + 1) / 2;
  const cy = (a[1] + a[3] + 1) / 2;
  const lato = Math.max(a[2] - a[0] + 1, a[3] - a[1] + 1);
  const x0 = Math.round(cx - lato / 2);
  const y0 = Math.round(cy - lato / 2);

  const out = new PNG({ width: lato, height: lato });
  for (let y = 0; y < lato; y++) {
    for (let x = 0; x < lato; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      const d = (lato * y + x) * 4;
      if (sx < 0 || sy < 0 || sx >= W || sy >= img.height) {
        out.data[d] = out.data[d + 1] = out.data[d + 2] = out.data[d + 3] = 0;
        continue;
      }
      const s = (W * sy + sx) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
      out.data[d + 3] = Math.round(alfa[W * sy + sx] * 255);
    }
  }
  return out;
}

/**
 * Chiude i buchi lasciati dal ritaglio dentro le figure piene.
 *
 * Una dilatazione seguita da un erosione, cioe una chiusura morfologica: i
 * pixel isolati rimasti trasparenti dentro una figura vengono riempiti, mentre
 * il contorno esterno torna dove era. Serve alla rosa dei venti, i cui raggi
 * sottili il JPEG circonda di artefatti: senza, a 72dp diventava una polvere.
 *
 * Raggio 2 su una sorgente da 660 px: sparisce nel ridimensionamento, e non
 * ingrossa ne i tratteggi dell orbita ne il profilo del globo.
 */
function chiudiBuchi(alfa, W, H, riquadro) {
  const R = 2;
  const [x0, y0, x1, y1] = riquadro;
  const dilatato = new Float32Array(alfa.length);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let m = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const v = alfa[W * yy + xx];
          if (v > m) m = v;
        }
      }
      dilatato[W * y + x] = m;
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let m = 1;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const v = dilatato[W * yy + xx];
          if (v < m) m = v;
        }
      }
      alfa[W * y + x] = Math.max(alfa[W * y + x], m);
    }
  }
}

/** Scrive il colore di sfondo dell'icona adattiva in values/colors.xml. */
function scriviColoreSfondo(rgb) {
  const file = path.join(RES, 'values', 'colors.xml');
  const esa = '#FF' + rgb.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Sfondo dell'icona adattiva, **generato** da tools/genera_icona.js: e' il
         colore del badge campionato dalla sorgente, non una scelta a mano. Deve
         essere quello, altrimenti dove il launcher mostra piu' dei 108dp del
         primo piano si vedrebbe una cornice di un altro colore.

         Lo si tocca solo cambiando la sorgente dell'icona e rilanciando lo script. -->
    <color name="sfondo_icona">${esa}</color>
</resources>
`;
  fs.writeFileSync(file, xml, 'utf8');
  console.log(`  ${path.relative(RADICE, file)}  sfondo_icona = ${esa}`);
}

function scrivi(cartella, nome, img) {
  fs.mkdirSync(cartella, { recursive: true });
  const f = path.join(cartella, nome);
  fs.writeFileSync(f, PNG.sync.write(img));
  console.log(`  ${path.relative(RADICE, f)}  ${img.width}x${img.height}`);
}

function main() {
  if (!fs.existsSync(SORGENTE)) {
    console.error(`sorgente non trovata: ${SORGENTE}`);
    process.exit(1);
  }
  console.log(`sorgente: ${path.relative(RADICE, SORGENTE)}`);
  const originale = leggiImmagine(SORGENTE);

  // Due sorgenti possibili, riconosciute da sole. Un disegno su trasparenza e'
  // il globo di prima, da centrare su una tela; un'immagine opaca e' un'icona
  // gia' composta, da cui vanno tolti la pagina attorno e il colore di fondo.
  if (haTrasparenza(originale)) daGloboSuTrasparenza(originale);
  else daIconaComposta(originale);

  console.log('\nfatto.');
}

/** La strada storica: un globo tondo disegnato su trasparenza. */
function daGloboSuTrasparenza(originale) {
  const globo = ritagliaSuAlfa(originale);
  console.log(`globo ritagliato: ${globo.width}x${globo.height}\n`);

  for (const [densita, fattore] of DENSITA) {
    const cartella = path.join(RES, `mipmap-${densita}`);

    // --- icona adattiva: globo a 72dp dentro una tela di 108dp
    const latoAdattiva = Math.round(LATO_ADATTIVA * fattore);
    const diametro = Math.round(DIAMETRO_SICURO * fattore);
    scrivi(cartella, 'ic_launcher_foreground.png',
      centraSuTela(riduci(globo, diametro), latoAdattiva));

    // --- icona classica: globo quasi a filo di una tela di 48dp
    const latoClassica = Math.round(LATO_CLASSICA * fattore);
    const diametroClassica = Math.round(DIAMETRO_CLASSICA * fattore);
    const classica = centraSuTela(riduci(globo, diametroClassica), latoClassica);
    scrivi(cartella, 'ic_launcher.png', classica);
    scrivi(cartella, 'ic_launcher_round.png', classica);
  }
}

/**
 * La strada nuova: un'icona gia' composta — badge colorato, disegno dentro,
 * pagina attorno.
 *
 * Il badge **non** si porta a filo della tela da 108dp: cosi' il disegno
 * finirebbe a 90dp e i launcher con maschera tonda ne taglierebbero orbita e
 * rosa dei venti. Si scala perche' sia il **disegno** a stare nei 72dp che
 * vengono mostrati sempre, e il badge cade dove cade.
 */
function daIconaComposta(originale) {
  const b = riquadroBadge(originale);
  const badge = ritaglia(originale, b);
  const disegno = disegnoSuTrasparenza(originale, b);
  console.log(`badge ${badge.width}x${badge.height}, disegno ${disegno.width}x${disegno.height}`);

  // Il colore di sfondo dell'icona adattiva e' quello del badge, campionato a
  // meta' altezza: il badge ha un gradiente, e il punto di mezzo e' il
  // compromesso che si nota meno sopra e sotto.
  const sfondo = pixel(originale, b[0] + 12, Math.round((b[1] + b[3]) / 2));
  scriviColoreSfondo(sfondo);
  console.log('');

  const pagina = pixel(originale, 2, 2);

  for (const [densita, fattore] of DENSITA) {
    const cartella = path.join(RES, `mipmap-${densita}`);

    // --- adattiva: il **disegno** a 72dp su una tela di 108, il resto lo mette
    //     il livello di sfondo. E' la scomposizione che Android si aspetta:
    //     mettere li' il badge intero significherebbe dargli una sagoma nostra,
    //     quando la sagoma la decide il launcher.
    const latoTela = Math.round(LATO_ADATTIVA * fattore);
    const lato = Math.round(DIAMETRO_SICURO * fattore);
    scrivi(cartella, 'ic_launcher_foreground.png',
      centraSuTela(riduci(disegno, lato), latoTela));

    // --- classica: il badge tale e quale, con i suoi angoli arrotondati. Vale
    //     solo sotto Android 8, che il minSdk 26 esclude, ma il file va scritto
    //     lo stesso perche' il manifest lo dichiara.
    const latoClassica = Math.round(LATO_CLASSICA * fattore);
    const classica = smarginaPagina(riduci(badge, latoClassica), pagina);
    scrivi(cartella, 'ic_launcher.png', classica);
    scrivi(cartella, 'ic_launcher_round.png', classica);
  }
}

/**
 * Rende trasparente il colore della pagina rimasto fuori dagli angoli
 * arrotondati del badge. Sfumato e non a soglia netta, altrimenti l'angolo
 * diventa una scaletta.
 */
function smarginaPagina(img, pagina) {
  const out = new PNG({ width: img.width, height: img.height });
  out.data.set(img.data);
  for (let i = 0; i < out.data.length; i += 4) {
    const d = dist([out.data[i], out.data[i + 1], out.data[i + 2]], pagina);
    out.data[i + 3] = Math.round(Math.max(0, Math.min(1, d / 40)) * 255);
  }
  return out;
}

main();
