/*
 * Normalizzazione dei nomi delle suddivisioni amministrative.
 *
 * La sorgente principale e' geoBoundaries. Alcuni suoi nomi sono stati
 * doppiamente codificati ("RegiÃ³n" invece di "Región"); Natural Earth e le
 * vecchie esportazioni GADM possono inoltre avere spazi o grafie diverse.
 * Questa e' l'unica porta attraverso cui i nomi entrano nei dati dell'app.
 */

/** Caratteri Windows-1252 fuori dagli intervalli ASCII e Latin-1. */
const CP1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86,
  '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

function daCp1252(testo) {
  const out = Buffer.alloc(testo.length);
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    const cp = c.codePointAt(0);
    // Alcuni file portano i byte 0x80-0x9f come controlli Latin-1, altri come
    // i corrispondenti caratteri grafici Windows-1252: accettiamo entrambe le
    // forme perche' sono due manifestazioni dello stesso errore di decodifica.
    if (cp <= 0xff) out[i] = cp;
    else if (CP1252[c] !== undefined) out[i] = CP1252[c];
    else return null;
  }
  return out;
}

/** Ripara una doppia codifica solo quando il risultato e' UTF-8 valido. */
function riparaMojibake(nome) {
  if (!nome || typeof nome !== 'string' || !/[ÂÃâ]/.test(nome)) return nome;
  const byte = daCp1252(nome);
  if (!byte) return nome;
  const riparato = byte.toString('utf8');
  return riparato.includes('�') ? nome : riparato;
}

/** Compatibilita' con i vecchi dati GADM che univano parole adiacenti. */
function riparaSpazi(nome) {
  if (!nome || typeof nome !== 'string') return nome;
  let out = nome;
  out = out.replace(/([a-zà-öø-ÿ])(d')([A-ZÀ-Þ])/g, "$1 $2$3");
  out = out.replace(/([a-zà-öø-ÿ])([A-ZÀ-Þ])/g, '$1 $2');
  return out;
}

/**
 * Eccezioni editoriali indicizzate sui nuovi codici stabili `ISO3.slug`.
 * geoBoundaries usa gia' i nomi locali per l'Italia; la tabella rende
 * esplicita la grafia mostrata dall'app e non dipende dagli shapeID della
 * sorgente.
 */
const NOMI_LOCALI = {
  'ITA.abruzzo': 'Abruzzo',
  'ITA.basilicata': 'Basilicata',
  'ITA.calabria': 'Calabria',
  'ITA.campania': 'Campania',
  'ITA.emilia-romagna': 'Emilia-Romagna',
  'ITA.friuli-venezia-giulia': 'Friuli-Venezia Giulia',
  'ITA.lazio': 'Lazio',
  'ITA.liguria': 'Liguria',
  'ITA.lombardia': 'Lombardia',
  'ITA.marche': 'Marche',
  'ITA.molise': 'Molise',
  'ITA.piemonte': 'Piemonte',
  'ITA.puglia': 'Puglia',
  'ITA.sardegna': 'Sardegna',
  'ITA.sicilia': 'Sicilia',
  'ITA.toscana': 'Toscana',
  'ITA.trentino-alto-adige': 'Trentino-Alto Adige',
  'ITA.umbria': 'Umbria',
  'ITA.valle-d-aosta': "Valle d'Aosta",
  'ITA.veneto': 'Veneto',
};

function nomeSuddivisione(codice, nomeGrezzo) {
  if (NOMI_LOCALI[codice]) return NOMI_LOCALI[codice];
  return riparaSpazi(riparaMojibake(nomeGrezzo));
}

module.exports = { riparaMojibake, riparaSpazi, nomeSuddivisione, NOMI_LOCALI };
