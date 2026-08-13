/*
 * Ripara la doppia codifica UTF-8 nei file di testo.
 *
 * Causa: un passaggio con Get-Content/Set-Content in Windows PowerShell 5.1,
 * che legge in Windows-1252 e riscrive in UTF-8. Ogni carattere non ASCII
 * diventa due o tre caratteri: "à" -> "Ã ", "·" -> "Â·", "—" -> "â€”".
 *
 * Attenzione: la codifica di lettura e' Windows-1252, NON Latin-1. Differiscono
 * nell'intervallo 0x80-0x9F, che e' esattamente quello che produce le sequenze
 * con "â€". Riparare assumendo Latin-1 lascia intatte proprio quelle.
 *
 * Uso:  node tools/fix_mojibake.js file [file...]
 */

const fs = require('fs');

/** Caratteri che in Windows-1252 occupano l'intervallo 0x80-0x9F. */
const CP1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84,
  '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/** Testo -> byte secondo Windows-1252; null se un carattere non e' mappabile. */
function toCp1252(testo) {
  const out = Buffer.alloc(testo.length);
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    const cp = c.codePointAt(0);
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) out[i] = cp;
    else if (CP1252[c] !== undefined) out[i] = CP1252[c];
    else return null; // carattere non rappresentabile: la riga non e' mojibake
  }
  return out;
}

// una riga sospetta contiene uno dei caratteri iniziali tipici della sequenza
const sospetto = /[ÂÃâ]/;

let totale = 0;
for (const file of process.argv.slice(2)) {
  let testo = fs.readFileSync(file, 'utf8');

  let bom = false;
  if (testo.charCodeAt(0) === 0xfeff) {
    testo = testo.slice(1);
    bom = true;
  }

  const righe = testo.split('\n');
  let corrette = 0;
  for (let i = 0; i < righe.length; i++) {
    if (!sospetto.test(righe[i])) continue;
    const byte = toCp1252(righe[i]);
    if (!byte) continue;
    const riparata = byte.toString('utf8');
    // la riparazione vale solo se produce UTF-8 valido e cambia qualcosa
    if (riparata !== righe[i] && !riparata.includes('�')) {
      console.log(`  ${file}:${i + 1}`);
      console.log(`    prima: ${righe[i].trim().slice(0, 100)}`);
      console.log(`    dopo : ${riparata.trim().slice(0, 100)}`);
      righe[i] = riparata;
      corrette++;
    }
  }

  if (corrette || bom) {
    fs.writeFileSync(file, righe.join('\n'), 'utf8');
    console.log(`${file}: ${corrette} righe riparate${bom ? ', BOM rimosso' : ''}`);
    totale += corrette;
  } else {
    console.log(`${file}: nulla da fare`);
  }
}
console.log(`totale righe riparate: ${totale}`);
