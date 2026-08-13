/*
 * Regole per decidere quali voci di GeoNames sono "citta'" ai fini dell'app.
 *
 * Il problema, misurato: il 90,1% della classe P e' `PPL` generico, cioe'
 * GeoNames non distingue il comune dalla frazione. I codici che dichiarano
 * esplicitamente una frazione o un quartiere coprono solo il 6,7%.
 *
 * In alcuni paesi pero' i comuni sono codificati come sedi amministrative, e
 * li' il filtro diventa preciso. In Italia le sedi sono 8.378 contro 7.896
 * comuni reali, uno scarto del 6%. Altrove la stessa codifica e' inutilizzabile:
 * la Francia ha 368 sedi contro 34.935 comuni, l'India 210 in tutto.
 *
 * Da qui la tabella: sedi amministrative dove la codifica e' verificata,
 * tutti i centri abitati altrove. Stesso schema delle eccezioni per le
 * bandiere: poche voci esplicite, ognuna motivata da un confronto coi dati.
 */

/** Codici che non sono mai un comune: frazioni, quartieri, ruderi. */
const CODICI_ESCLUSI = new Set([
  'PPLL',  // localita' senza status amministrativo: la frazione
  'PPLX',  // sezione di centro abitato: il quartiere
  'PPLF',  // villaggio rurale
  'PPLR',  // centro religioso
  'PPLS',  // insieme di centri
  'STLMT', // insediamento
  'PPLH',  // storico
  'PPLQ',  // abbandonato
  'PPLW',  // distrutto
  'PPLCH', // ex capitale
]);

/** Codici che indicano la sede di una divisione amministrativa. */
const CODICI_SEDE = new Set(['PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG']);

/**
 * Paesi in cui si tengono SOLO le sedi amministrative.
 *
 * Va aggiunto un paese solo dopo aver confrontato il conteggio con il numero
 * reale dei suoi comuni: una codifica incompleta cancellerebbe l'intero paese.
 * Il rapporto fra sedi e totale e' un buon indizio, ma non basta: va verificato.
 */
const SOLO_SEDI = new Set([
  'IT', // 8.378 sedi contro 7.896 comuni reali (scarto 6%) — verificato
]);

/**
 * Filtro stretto: si tiene una voce solo se ha una popolazione dichiarata
 * oppure se e' sede di una divisione amministrativa.
 *
 * E' il criterio che meglio approssima il concetto di comune con i dati
 * disponibili, e riduce l'insieme da 4.740.779 a 450.848 voci (-90,5%).
 * Verificato dove i numeri reali sono noti: Finlandia 601 tenute per 309
 * comuni, Corea del Sud 309 per 226, Italia 8.378 per 7.896.
 *
 * Il prezzo, accettato consapevolmente: in una novantina di paesi GeoNames non
 * dichiara quasi mai la popolazione — Bangladesh, Marocco, Congo — e li'
 * spariscono anche comuni veri, indistinguibili dai villaggi. Senza il filtro
 * resterebbero invece 4,3 milioni di frazioni a coprire la mappa.
 *
 * Reversibile: FILTRO_LARGO=1 nell'ambiente disattiva questa regola.
 */
const SOLO_COMUNI = process.env.FILTRO_LARGO !== '1';

/** true se la voce va tenuta. */
function tieni(countryCode, featureCode, nome, popolazione = 0) {
  if (CODICI_ESCLUSI.has(featureCode)) return false;
  if (nome && NOMI_ESCLUSI.test(nome)) return false;
  if (SOLO_SEDI.has(countryCode)) return CODICI_SEDE.has(featureCode);
  if (SOLO_COMUNI && popolazione <= 0 && !CODICI_SEDE.has(featureCode)) return false;
  return true;
}

/**
 * Zoom dal quale una citta' deve comparire.
 *
 * Serve perche' lasciar decidere a tippecanoe con `--drop-densest-as-needed`
 * produce il risultato opposto a quello voluto: gli scarti colpiscono le zone
 * fitte, quindi Milano sparisce — sta nel punto piu' denso d'Italia, circondata
 * dall'hinterland — mentre il paese alpino isolato sopravvive. `--order-...-by`
 * non c'entra: governa l'ordine di scrittura, non gli scarti.
 *
 * Con un minzoom esplicito per feature la visibilita' diventa deterministica.
 * Si prende il livello piu' basso fra quello dedotto dalla popolazione e quello
 * dedotto dal ruolo amministrativo, cosi' un capoluogo senza popolazione nota
 * compare comunque presto.
 */
const SOGLIE_POPOLAZIONE = [
  [1000000, 4],
  [300000, 5],
  [100000, 6],
  [50000, 7],
  [20000, 8],
  [5000, 9],
  [1, 10],
];

/**
 * Zoom dedotto dal ruolo amministrativo. Si applica **solo quando la
 * popolazione non e' nota**.
 *
 * Applicarlo sempre era il difetto principale della prima versione: promuoveva
 * per ruolo anche i centri minuscoli, e Hinterrhein — 61 abitanti, capoluogo
 * di secondo livello nei Grigioni — compariva a zoom 6 accanto a Milano.
 * Stessa sorte a centinaia di Gemeinden austriache da poche centinaia di
 * abitanti. Quando la popolazione c'e', e' lei il criterio migliore.
 */
const ZOOM_PER_RUOLO = {
  PPLC: 4,   // capitale nazionale
  PPLA: 6,   // capoluogo di regione
  PPLG: 6,   // sede di governo
  PPLA2: 8,  // capoluogo di provincia
  PPLA3: 9,  // capoluogo di comune
  PPLA4: 10,
  PPLA5: 10,
};

/**
 * Voci che non sono comuni ma non sono codificate come tali.
 *
 * Gli arrondissement municipali francesi sono `PPL` con la popolazione del
 * quartiere: "Paris 15 Vaugirard" dichiara 229.713 abitanti e finiva a zoom 6
 * come se fosse una citta' a se', riempiendo la mappa di Parigi di doppioni.
 */
const NOMI_ESCLUSI = /^(Paris|Lyon|Marseille)\s+\d+/;

/** Zoom minimo per una citta'; ZOOM_MASSIMO per tutto il resto. */
function zoomMinimo(featureCode, popolazione, zoomMassimo = 11) {
  let z = zoomMassimo;
  for (const [soglia, livello] of SOGLIE_POPOLAZIONE) {
    if (popolazione >= soglia) {
      z = livello;
      break;
    }
  }
  // il ruolo aiuta solo dove il dato di popolazione manca del tutto
  if (popolazione === 0) {
    const perRuolo = ZOOM_PER_RUOLO[featureCode];
    if (perRuolo !== undefined && perRuolo < z) z = perRuolo;
  }
  return Math.min(z, zoomMassimo);
}

module.exports = {
  CODICI_ESCLUSI,
  CODICI_SEDE,
  SOLO_SEDI,
  NOMI_ESCLUSI,
  SOLO_COMUNI,
  tieni,
  zoomMinimo,
};
