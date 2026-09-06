/* Genera l'appendice di attribuzione dalle stesse scelte usate dalla build. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TABELLA = path.join(__dirname, 'livelli_regioni.json');
const USCITA = path.join(ROOT, 'docs', 'LICENZE_REGIONI.md');

const esc = (s) => String(s || '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const riferimento = (s) => {
  const valore = String(s || '').trim();
  if (!valore || valore === 'nan') return '—';
  if (/^https?:\/\//i.test(valore)) return `<${valore}>`;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(valore)) return `<https://${valore}>`;
  return esc(valore);
};

const { paesi } = JSON.parse(fs.readFileSync(TABELLA, 'utf8'));
const gb = Object.entries(paesi).filter(([, v]) => v.fonte === 'gb');
const ne = Object.entries(paesi).filter(([, v]) => v.fonte === 'ne');
const nessuna = Object.entries(paesi).filter(([, v]) => v.fonte === 'nessuna');
const shareAlike = gb.filter(([, v]) =>
  /Open Data Commons Open Database License|Attribution-ShareAlike/i.test(v.licenza)
).length;

const righe = [
  '# Licenze delle suddivisioni amministrative',
  '',
  'Appendice generata da `tools/genera_crediti_regioni.js` a partire da',
  '`tools/livelli_regioni.json`. Le scelte e gli URL sono fissati alle release',
  'indicate nei metadati: aggiornare la sorgente richiede rigenerare anche questa pagina.',
  '',
  `- ${gb.length} paesi o territori da geoBoundaries gbOpen;`,
  `- ${ne.length} ripieghi da Natural Earth, pubblico dominio;`,
  `- ${nessuna.length} senza suddivisioni;`,
  `- ${shareAlike} delle ${gb.length} fonti geoBoundaries sono ODbL o CC BY-SA.`,
  '',
  'I confini geoBoundaries sono distribuiti attraverso **gbOpen**. Ogni riga',
  'conserva inoltre la licenza e l’attribuzione della fonte sottostante dichiarata',
  'dai relativi metadati. Le elaborazioni dell’app consistono in selezione del',
  'livello, correzione della codifica dei nomi, riduzione geometrica e tiling.',
  '',
  '## Fonti geoBoundaries',
  '',
  '| codice | paese/territorio | livello | anno | licenza dichiarata | fonte dati | riferimento |',
  '|---|---|---:|---:|---|---|---|',
];

for (const [iso, v] of gb) {
  const licenza = v.dettaglioLicenza ? `${v.licenza} — ${v.dettaglioLicenza}` : v.licenza;
  righe.push(`| ${iso} | ${esc(v.paese)} | ${v.livello} | ${esc(v.anno)} | ${esc(licenza)} | ${esc(v.fonteDati)} | ${riferimento(v.licenzaUrl)} |`);
}

righe.push('', '## Ripieghi Natural Earth', '',
  'Natural Earth dichiara questi dati di pubblico dominio:', '',
  ne.map(([iso]) => `\`${iso}\``).join(', '), '',
  '## Paesi senza suddivisioni', '',
  nessuna.map(([iso]) => `\`${iso}\``).join(', '), '',
  'Per il motivo editoriale di ciascuna esclusione vedere `tools/livelli_regioni.json`.', '');

fs.writeFileSync(USCITA, righe.join('\n'), 'utf8');
console.log(`${path.relative(ROOT, USCITA)}: ${gb.length} attribuzioni, ${shareAlike} share-alike`);
