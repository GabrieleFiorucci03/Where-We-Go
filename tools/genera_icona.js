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
  : path.join(RADICE, 'assets-sorgente', 'icona-globo.png');

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

  const originale = PNG.sync.read(fs.readFileSync(SORGENTE));
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

  console.log('\nfatto.');
}

main();
