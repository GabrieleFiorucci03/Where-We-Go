/*
 * Nomi dei paesi nelle lingue dell'app -> web/data/country-names.json
 *
 * **Perche' un file a parte e non un campo in piu' nei dati.** Il nome del
 * paese oggi e' cotto dentro tre artefatti generati: `countries.geojson`, il
 * campo `countryName` dei 3.343 file di `region-shapes`, e la tabella `nazione`
 * di `citta.db` (57 MB). Aggiungere una lingua rifacendo quei tre significa
 * rigenerare 205 MB di sagome per 249 stringhe. Qui invece la lingua e' una
 * tabellina di 11 KB che si sovrappone a runtime: aggiungerne un'altra costa
 * una riga in [LINGUE] e una rigenerazione di questo solo file.
 *
 * **Da dove vengono i nomi.** Natural Earth 1:50m Admin 0 porta gia' una
 * ventina di colonne `NAME_xx` — pubblico dominio, stessa fonte da cui l'app
 * prende i confini di riferimento. Le sole traduzioni scritte a mano sono i
 * sette casi di [FUORI_NE] e i due di [PREFERENZE], entrambi motivati sotto.
 *
 * **Non si lancia a mano.** Lo chiama `pipeline_confini.ps1` subito dopo
 * `prepara_confini.js`, e il prodotto passa dalla verifica e dalla
 * pubblicazione atomica insieme al `countries.geojson` da cui deriva. Lanciarlo
 * per conto proprio scrive sui dati in linea, saltando quel controllo.
 *
 * Uso:  node tools/nomi_paesi.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NE = path.join(ROOT, 'data_raw', 'countries_50m.geojson');

/**
 * La stessa cartella su cui lavora `prepara_confini.js`.
 *
 * Senza questa variabile lo script scriverebbe sempre in `web/data`, cioe' sui
 * dati **in linea**, saltando la verifica e il rollback della pipeline. Con
 * essa la tabella nasce in staging accanto al `countries.geojson` da cui
 * deriva, viene verificata insieme a lui e pubblicata dallo stesso passo: i due
 * file non possono separarsi.
 */
const DATA = path.resolve(process.env.CONFINI_DATA_DIR || path.join(ROOT, 'web', 'data'));
const PAESI = path.join(DATA, 'countries.geojson');
const USCITA = path.join(DATA, 'country-names.json');

/**
 * Le lingue che l'app parla, nell'ordine in cui le dichiara
 * `res/xml/locales_config.xml`. La prima e' il default.
 *
 * Aggiungerne una qui **non basta**: senza il corrispondente
 * `res/values-xx/strings.xml` si otterrebbe un'app con l'interfaccia in inglese
 * e i nomi dei paesi in un'altra lingua, che e' peggio di entrambe.
 */
const LINGUE = ['en', 'it'];

/**
 * I sette che Natural Earth non elenca come paesi a se'.
 *
 * Sono i dipartimenti d'oltremare francesi (che NE fonde nella Francia), i
 * Paesi Bassi caraibici e le Svalbard: l'app li tratta come entita' separate
 * perche' li trattano cosi' le fonti dei confini, quindi il nome va scritto qui.
 * Sette righe a mano, e si sa quali sono: meglio di un ripiego silenzioso che
 * lascia «Guiana francese» su un telefono inglese.
 */
const FUORI_NE = {
  GUF: { en: 'French Guiana', it: 'Guiana francese' },
  GLP: { en: 'Guadeloupe', it: 'Guadalupa' },
  MTQ: { en: 'Martinique', it: 'Martinica' },
  REU: { en: 'Réunion', it: 'Riunione' },
  MYT: { en: 'Mayotte', it: 'Mayotte' },
  BES: { en: 'Caribbean Netherlands', it: 'Caraibi olandesi' },
  SJM: { en: 'Svalbard and Jan Mayen', it: 'Svalbard e Jan Mayen' },
};

/**
 * I due casi in cui `NAME_EN` sta su un registro diverso da tutto il resto.
 *
 * Natural Earth usa il nome ufficiale dello stato per questi due e quello
 * corrente per gli altri 240: accanto a «Germany» e «Japan», «People's Republic
 * of China» stona, e in italiano la stessa riga dice «Cina». Verificati uno per
 * uno sui 242: gli altri nomi formali — «Repubblica Ceca», «Repubblica
 * Democratica del Congo» — lo sono in **entrambe** le lingue, quindi restano.
 *
 * Non si tocca `NAME`, la colonna che NE cura per le etichette cartografiche:
 * quella abbrevia («Marshall Is.», «S. Geo. and the Is.») e in un elenco, dove
 * l'italiano scrive «Isole Marshall» per intero, sarebbe la scelta peggiore.
 */
const PREFERENZE = {
  CHN: { en: 'China' },
  CYN: { en: 'Northern Cyprus' },
};

function leggiJson(f) {
  if (!fs.existsSync(f)) {
    console.error(`Manca ${f}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/**
 * Indice delle feature di Natural Earth per ogni codice a tre lettere che
 * dichiarano.
 *
 * Piu' chiavi per la stessa feature perche' i codici non coincidono sempre:
 * `ADM0_A3` e' quello che NE usa per se', `ISO_A3` vale -99 per una decina di
 * entita' contese, e `ISO_A3_EH` e' la variante «senza casi speciali». L'app
 * usa i suoi, quindi si accettano tutte le porte d'ingresso. La prima vince:
 * `ADM0_A3` e' il piu' specifico.
 */
function perCodice(ne) {
  const out = new Map();
  for (const f of ne.features) {
    const p = f.properties;
    for (const c of [p.ADM0_A3, p.ISO_A3, p.ISO_A3_EH, p.SOV_A3]) {
      if (c && c !== '-99' && !out.has(c)) out.set(c, p);
    }
  }
  return out;
}

const ne = perCodice(leggiJson(NE));
const paesi = leggiJson(PAESI);

const nomi = {};
const senzaNome = [];

for (const f of paesi.features) {
  const codice = f.properties.code;
  const proprio = f.properties.name; // il nome cotto nei dati: oggi italiano
  const esplicito = FUORI_NE[codice];
  const preferito = PREFERENZE[codice];
  const p = ne.get(codice);

  const voce = {};
  for (const lingua of LINGUE) {
    const da_ne = p && p[`NAME_${lingua.toUpperCase()}`];
    // L'ordine dei ripieghi conta: le due tabelle scritte a mano battono NE
    // (esistono proprio per i casi in cui NE non basta), NE batte il nome cotto
    // nei dati, e il nome cotto e' l'ultima rete — meglio un nome nella lingua
    // sbagliata che un codice ISO a tre lettere davanti all'utente.
    voce[lingua] =
      (preferito && preferito[lingua]) ||
      (esplicito && esplicito[lingua]) ||
      da_ne ||
      proprio ||
      codice;
  }

  if (!esplicito && !p) senzaNome.push(`${codice} (${proprio})`);
  nomi[codice] = voce;
}

const uscita = {
  generato: new Date().toISOString().slice(0, 10),
  fonte:
    'Natural Earth 1:50m Admin 0, colonne NAME_xx — pubblico dominio. ' +
    'Sette entita\' non elencate da NE hanno il nome in tools/nomi_paesi.js.',
  lingue: LINGUE,
  nomi,
};

fs.writeFileSync(USCITA, JSON.stringify(uscita, null, 0) + '\n', 'utf8');

const kb = (fs.statSync(USCITA).size / 1024).toFixed(1);
console.log(`${path.relative(ROOT, USCITA)}: ${Object.keys(nomi).length} paesi, ${kb} KB`);
console.log(`lingue: ${LINGUE.join(', ')}`);
if (senzaNome.length) {
  // Non e' un errore fatale — il ripiego sul nome cotto funziona — ma va
  // visto: significa che un paese esce in italiano anche in inglese.
  console.warn(
    `\nATTENZIONE: ${senzaNome.length} senza corrispondenza in Natural Earth ` +
      `ne' in FUORI_NE, restano col nome dei dati:\n  ${senzaNome.join('\n  ')}`
  );
}
