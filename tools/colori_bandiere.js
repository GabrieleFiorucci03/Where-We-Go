/*
 * Colore dominante di ogni bandiera (§7.2 del piano).
 *
 * A zoom basso la bandiera di San Marino occupa tre pixel: rasterizzare un
 * canvas da mille per disegnarne tre e' spreco puro, e sono proprio gli zoom in
 * cui le entita' visitate sono tante e tutte piccole. Sotto una soglia si usa
 * un colore pieno, e la bandiera vera compare avvicinandosi.
 *
 * Il colore si calcola qui una volta sola, non sul telefono: e' un JSON di
 * poche centinaia di voci.
 *
 * Uso:  node tools/colori_bandiere.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'web', 'flags');
const OUT = path.join(ROOT, 'web', 'data', 'colori_bandiere.json');

/**
 * Si legge l'SVG come testo invece di rasterizzarlo.
 *
 * Le bandiere di flag-icons sono fatte di poche forme piene con colori
 * dichiarati esplicitamente: contare quanto "pesa" ciascun colore nel testo
 * approssima bene la superficie, senza tirarsi dentro una libreria di
 * rendering per una stima che serve solo a scegliere una tinta.
 */
const RE_COLORE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b|\b(?:fill|stop-color)\s*[:=]\s*["']?([a-z]+)["']?/g;

/** Colori che non contano: sono contorni, sfondi tecnici o trasparenze. */
const IGNORATI = new Set(['none', 'transparent', 'currentcolor']);

const NOMI = {
  red: '#d22', blue: '#2244aa', green: '#2e8b2e', yellow: '#f4d000',
  white: '#ffffff', black: '#111111', orange: '#f08a24',
};

function normalizza(c) {
  if (!c) return null;
  const s = c.toLowerCase();
  if (IGNORATI.has(s)) return null;
  if (NOMI[s]) return NOMI[s];
  if (!s.startsWith('#')) return null;
  if (s.length === 4) return '#' + [...s.slice(1)].map((x) => x + x).join('');
  return s;
}

/** Quanto un colore "risalta": il bianco perde, perche' e' quasi sempre sfondo. */
function peso(colore, occorrenze) {
  const r = parseInt(colore.slice(1, 3), 16);
  const g = parseInt(colore.slice(3, 5), 16);
  const b = parseInt(colore.slice(5, 7), 16);
  const chiarezza = (r + g + b) / 765;
  // Bianco e nero valgono un quarto. Il bianco perche' una bandiera bianca e
  // rossa deve risultare rossa, altrimenti a zoom basso sparisce sul mare; il
  // nero perche' quasi sempre non e' una fascia ma il contorno di uno stemma —
  // San Marino ed Egitto risultavano neri per quello.
  const penalita = chiarezza > 0.92 || chiarezza < 0.12 ? 0.25 : 1;
  return occorrenze * penalita;
}

const file = fs.readdirSync(DIR).filter((f) => f.endsWith('.svg'));
const colori = {};
let senzaColore = 0;

for (const nome of file) {
  const svg = fs.readFileSync(path.join(DIR, nome), 'utf8');
  const conteggi = new Map();
  let ordine = 0;
  for (const m of svg.matchAll(RE_COLORE)) {
    const c = normalizza(m[1] ? '#' + m[1] : m[2]);
    if (!c) continue;
    // I primi colori distinti sono le fasce di fondo, disegnate per prime e
    // grandi quanto la bandiera; quelli che vengono dopo sono stemmi e
    // dettagli, che nel testo occorrono tante volte ma coprono pochi pixel.
    // Senza questa correzione San Marino risultava nero per i contorni del suo
    // stemma, invece che azzurro.
    const nuovo = !conteggi.has(c);
    const spinta = nuovo && ordine++ < 3 ? 8 : 1;
    conteggi.set(c, (conteggi.get(c) || 0) + spinta);
  }
  if (!conteggi.size) {
    senzaColore++;
    continue;
  }
  const migliore = [...conteggi].sort((a, b) => peso(b[0], b[1]) - peso(a[0], a[1]))[0][0];
  colori[nome.replace('.svg', '')] = migliore;
}

fs.writeFileSync(OUT, JSON.stringify(colori, null, 0));
const kb = fs.statSync(OUT).size / 1024;
console.log(`bandiere lette:   ${file.length}`);
console.log(`senza colore:     ${senzaColore}`);
console.log(`colori scritti:   ${Object.keys(colori).length}`);
console.log(`${path.basename(OUT)}: ${kb.toFixed(1)} KB`);
console.log('\nqualche esempio:');
for (const k of ['it', 'fr', 'de', 'jp', 'br', 'gb', 'ch', 'sm']) {
  if (colori[k]) console.log(`  ${k}: ${colori[k]}`);
}
