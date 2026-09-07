/*
 * Prototipo "Mappamondo Visited / Wanted" — fase A dello spike M0.
 *
 * Serve a rispondere a tre domande prima di scrivere una riga di Kotlin:
 *   1. il globo MapLibre in bianco e nero e' leggibile e piacevole?
 *   2. la bandiera ritagliata sulla sagoma di uno stato/regione funziona
 *      visivamente, e in quale proiezione va disegnata la maschera?
 *   3. la transizione stati -> regioni -> citta' guidata dallo zoom ha senso?
 *
 * Lo stesso codice girera' dentro la WebView Android, quindi qui non si usa
 * nulla che non sia disponibile su Chrome mobile.
 */

// MapLibre 6 e' distribuito solo come ESM e non espone un default export:
// 85 export nominali, quindi serve un namespace import.
import * as maplibregl from './vendor/maplibre-gl.mjs';
import {
  polygonsOf,
  clusterPolygons,
  splitIntoBands,
  bboxPoligoniMaggiori,
  renderFlagMask,
  loadFlag,
  mercY,
} from './flagmask.js';

import {
  AndroidBridgeSource,
  suAndroid,
  dimensioneFile,
  cartellaTile,
  elencoFile,
} from './android-source.js';
import { migraCodiciRegioni } from './region-aliases.js';

/** Nome dell'archivio dei tile delle citta', identico su disco e sul server. */
const TILE_CITTA = 'cities.pmtiles';
const TILE_CONFINI = 'boundaries.pmtiles';
const TILE_LINEE = 'border-lines.pmtiles';

/**
 * Prepara la sorgente delle citta'.
 *
 * Tre casi, nell'ordine in cui si tentano:
 *  1. dentro l'app Android, l'archivio letto dal disco tramite il ponte Kotlin;
 *  2. sul desktop, lo stesso archivio servito via HTTP con le Range request;
 *  3. se l'archivio non c'e', il vecchio GeoJSON dei 1.251 capoluoghi.
 *
 * Il terzo caso serve a non rompere il prototipo finche' i tile non esistono.
 */
/**
 * Protocollo `pmtiles://` condiviso da tutti gli archivi.
 *
 * **Uno solo, registrato una volta sola.** `maplibregl.addProtocol` associa un
 * unico gestore allo schema: chiamandolo due volte, la seconda registrazione
 * sostituisce la prima, e l'archivio dichiarato per primo diventa
 * irraggiungibile. Con un `Protocol` per sorgente, citta' e confini si
 * escludevano a vicenda — sopravviveva l'ultimo registrato.
 *
 * Sul desktop il difetto non si vedeva: li' gli URL sono HTTP e il protocollo
 * sa risolverli comunque, mentre sul telefono ogni archivio e' registrato per
 * chiave (`android://<nome>`) dentro l'istanza che lo conosce.
 */
let protocolloPmtiles = null;

function protocolloCondiviso() {
  if (!protocolloPmtiles) {
    protocolloPmtiles = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocolloPmtiles.tile);
  }
  return protocolloPmtiles;
}

/**
 * true quando la pagina gira dentro l'app, che ha una sua interfaccia nativa.
 *
 * Distinta da `suAndroid`, che dice soltanto se esiste il ponte dei tile: un
 * domani i tile potrebbero arrivare da li' anche senza interfaccia nativa, e
 * viceversa. Confondere le due cose legherebbe fra loro due scelte separate.
 */
const perApp = typeof window !== 'undefined' && !!window.AndroidUI;

// Dentro l'app la barra laterale del prototipo non deve comparire: quella e'
// un attrezzo da officina, e l'interfaccia e' Compose (§9.1). Si nasconde
// subito, prima che venga disegnata, per non farla lampeggiare all'avvio.
if (perApp) {
  document.documentElement.classList.add('per-app');
}

/**
 * Quanto ci si puo' permettere di disegnare su questo telefono.
 *
 * Il globo gira liscio sui dispositivi recenti e a scatti su quelli vecchi, e
 * la differenza non e' un costo solo ma tre che si sommano: i pixel da riempire
 * a ogni fotogramma — che crescono col **quadrato** del `devicePixelRatio` —, le
 * texture delle bandiere tenute vive, e la finezza con cui ciascuna viene
 * rasterizzata. Si decide qui una volta per tutte, e il resto del file legge
 * questo oggetto invece di rifare il ragionamento in tre punti diversi.
 *
 * Le sonde sono due, `deviceMemory` e `hardwareConcurrency`: grossolane — la
 * prima e' arrotondata a potenze di due e su qualche browser manca del tutto —
 * ma sono le uniche disponibili senza indovinare la fascia dal nome della GPU,
 * che vorrebbe una tabella di modelli Adreno e Mali da tenere aggiornata a mano.
 * Se non risponde nessuna delle due si sceglie il profilo pieno: sbagliare
 * verso il telefono buono costa poco, sbagliare verso l'altro si vede.
 *
 * La soglia sbaglia in un caso noto: `deviceMemory` arrotonda per difetto a
 * potenze di due, quindi un telefono da 6 GB si dichiara da 4 e finisce sul
 * profilo leggero pur non meritandolo. Costa un globo un po' meno nitido su un
 * dispositivo che reggeva, che e' il verso giusto in cui sbagliare.
 *
 * Si puo' forzare a mano — `?profilo=leggero`, oppure
 * `localStorage.setItem('wherewego.profilo', 'pieno')` e ricarica, che e' la via
 * praticabile **dentro l'app**, dove l'indirizzo della pagina e' fisso. E' anche
 * l'unico modo di misurare quanto vale: provarli tutti e due sullo stesso
 * telefono, guardando `metricheBandiere()`.
 */
const PROFILO = (() => {
  const forzato =
    new URLSearchParams(location.search).get('profilo') ||
    (() => {
      try {
        return localStorage.getItem('wherewego.profilo');
      } catch (e) {
        return null;
      }
    })();
  const memoria = navigator.deviceMemory || 0; // GB, 0 se il browser tace
  const nuclei = navigator.hardwareConcurrency || 0;
  const debole =
    forzato === 'leggero' ||
    (forzato !== 'pieno' && ((memoria > 0 && memoria <= 4) || (nuclei > 0 && nuclei <= 4)));

  const p = debole
    ? {
        nome: 'leggero',
        // Il costo per fotogramma e' proporzionale ai pixel disegnati, e il
        // devicePixelRatio li moltiplica al quadrato: passare da 3 a 1,5 vuol
        // dire un quarto dei pixel. E' il singolo numero che pesa di piu' su una
        // GPU vecchia, e a occhio si nota molto meno di quanto si teme.
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        maxLivelliBandiera: 40,
        latoMax: { countries: 512, regions: 256 },
      }
    : {
        nome: 'pieno',
        // `undefined` e non un numero: MapLibre ricade sul devicePixelRatio
        // nativo, che sui telefoni recenti va benissimo e va lasciato stare
        pixelRatio: undefined,
        maxLivelliBandiera: 120,
        latoMax: { countries: 1024, regions: 512 },
      };

  console.log(
    `[profilo] ${p.nome}${forzato ? ' (forzato)' : ''} — memoria ${memoria || '?'} GB, ` +
      `${nuclei || '?'} nuclei, dpr ${window.devicePixelRatio || 1} -> ${p.pixelRatio ?? 'nativo'}`
  );
  return p;
})();

/** Riga di contesto sotto il nome: "Lombardia · Italia". */
function gerarchiaDi(kind, feature) {
  const p = feature.properties;
  if (kind === 'countries') return '';
  if (kind === 'regions') return nomePaese(p.country || paeseDiRegione(p.code));
  const pezzi = [];
  if (p.pop) pezzi.push(`${p.pop.toLocaleString('it')} abitanti`);
  if (p.cc) pezzi.push(nomePaeseIso2(p.cc));
  return pezzi.join(' · ');
}

/**
 * Cosa scrivere nel motore di ricerca per «Guarda com'e'».
 *
 * Va tenuta separata da `gerarchiaDi`: quella e' una **riga da leggere**, e
 * riusarla come query mandava a cercare `Milan 1.378.689 abitanti · IT`, cioe'
 * il nome del posto annegato in cifre e sigle che portano fuori strada.
 *
 * La forma e' quella scelta provando le ricerche vere:
 *
 * | entita' | query |
 * |---|---|
 * | nazione | `Italia attractions -map -flag` |
 * | regione | `Lombardia Italia attractions -map -flag` |
 * | citta'  | `Milano Italia -map -flag` |
 *
 * Il paese accompagna sempre nome di regione e citta', perche' di Springfield
 * ce ne sono decine. `attractions` porta a fotografie di luoghi invece che a
 * pagine istituzionali, ed e' escluso per le citta': su un comune piccolo non
 * trova nulla e restringe troppo. Le due esclusioni tolgono cio' che di quel
 * nome esce per primo e non e' il posto — cartine e bandiere.
 */
const ESCLUSIONI_RICERCA = '-map -flag';

function terminiRicerca(kind, feature) {
  const p = feature.properties;
  const nome = p.name || p.code || '';
  if (kind === 'countries') return `${nome} attractions ${ESCLUSIONI_RICERCA}`;
  if (kind === 'regions') {
    const paese = nomePaese(p.country || paeseDiRegione(p.code));
    return `${nome} ${paese} attractions ${ESCLUSIONI_RICERCA}`;
  }
  const paese = p.cc ? ` ${nomePaeseIso2(p.cc)}` : '';
  return `${nome}${paese} ${ESCLUSIONI_RICERCA}`;
}

/** Comunica all'app nativa cosa e' stato selezionato sulla mappa. */
function segnalaSelezione(hit) {
  const kind =
    hit.layer.id === 'places-circle'
      ? 'places'
      : hit.layer.id === 'regions-fill'
        ? 'regions'
        : 'countries';
  const codice = kind === 'places' ? chiaveCitta(hit, cittaDaTile) : hit.properties.code;
  const stato = kind === 'places' ? statoCitta(hit) : statusOf(kind, codice);
  // Per una nazione la scheda deve poter accendere il dettaglio regionale: nel
  // prototipo si faceva con una pressione prolungata, un gesto che nessuno
  // indovina e che nell'app non lasciava nemmeno un messaggio di conferma.
  const haRegioni = kind === 'countries' && !!indiceRegioni[codice];
  // Le coordinate servono alla galleria di Commons, che cerca le foto
  // geolocalizzate attorno a un punto (§9.6). Solo per le citta': di una
  // nazione il centroide non vuol dire niente — le foto vicine al centro
  // dell'Italia non sono «l'Italia» — e infatti li' si va sul web.
  const punto = kind === 'places' ? hit.geometry?.coordinates : null;

  // Il codice a due lettere della bandiera, per la scheda nativa. Si prende dal
  // GeoJSON delle sagome e non dalla feature toccata: quella viene dai tile, che
  // portano solo le proprieta' scelte in pipeline, mentre `countries.geojson` e'
  // in memoria dall'avvio e l'iso2 ce l'ha per costruzione — e' lo stesso da cui
  // le bandiere sulla mappa prendono il proprio.
  //
  // Tre nazioni su 242 non ne hanno: Somaliland, Cipro del Nord e Kashmir, che
  // una bandiera riconosciuta non ce l'hanno. Li' resta stringa vuota e la
  // scheda mostra il solo nome.
  const iso2 =
    kind === 'countries' ? byCode.countries.get(codice)?.properties?.iso2 || '' : '';

  window.AndroidUI.onFeatureTap(
    kind,
    String(codice),
    hit.properties.name || String(codice),
    gerarchiaDi(kind, hit),
    stato,
    haRegioni ? indiceRegioni[codice].n : 0,
    kind === 'countries' && regioniAttive.has(codice),
    terminiRicerca(kind, hit),
    punto ? punto[1] : 0,
    punto ? punto[0] : 0,
    iso2
  );
}

/**
 * Tutto lo stato dell'utente, per il backup.
 *
 * Si esporta l'oggetto `store` intero, non lo specchio appiattito che va agli
 * elenchi: quello perde `regioniAttive`, cioe' quali paesi hai aperto in
 * dettaglio, che fa parte di come hai lasciato l'app.
 *
 * Il formato e' il contratto del backup: quando lo stato passera' a Room
 * dovra' continuare a leggere e scrivere questo, altrimenti i file salvati
 * prima diventerebbero illeggibili.
 */
window.statoDaApp = () => JSON.stringify({ versione: 2, salvato: Date.now(), stato: store });

/**
 * Ripristina un backup. Restituisce un resoconto, non un booleano: chi ha
 * appena rischiato di sovrascrivere anni di segnalibri vuole sapere **cosa** e'
 * entrato, non solo che e' andata bene.
 */
window.ripristinaDaApp = (json) => {
  try {
    const letto = JSON.parse(json);
    const s = letto.stato || letto; // accetta anche un salvataggio grezzo
    if (!s || typeof s !== 'object') throw new Error('formato non riconosciuto');

    const migrazione = migraCodiciRegioni(s.regions || {});
    store = {
      countries: s.countries || {},
      regions: migrazione.regioni,
      places: s.places || {},
      regioniAttive: s.regioniAttive || [],
    };
    saveStore();

    // si riparte da zero sulla mappa: stati grafici e bandiere di prima non
    // hanno piu' nulla a che vedere con quello appena caricato
    for (const key of [...activeFlags.keys()]) {
      const i = key.indexOf(':');
      removeFlagLayer(key.slice(0, i), key.slice(i + 1));
    }
    regioniAttive.clear();
    for (const c of store.regioniAttive) regioniAttive.add(c);
    aggiornaFiltroRegioni();
    applyStoredStates();

    return JSON.stringify({
      ok: true,
      nazioni: Object.keys(store.countries).length,
      regioni: Object.keys(store.regions).length,
      citta: Object.keys(store.places).length,
      regioniRimappate: migrazione.rimappate,
      regioniScartate: migrazione.scartate,
      regioniSconosciute: migrazione.sconosciute,
    });
  } catch (e) {
    console.error('ripristino fallito', e);
    return JSON.stringify({ ok: false, errore: e.message });
  }
};

/**
 * Il globo come immagine PNG, in base64 (§10).
 *
 * Si forza un ridisegno con `triggerRepaint` — la mappa potrebbe essere ferma
 * da prima dell'ultima modifica, e si esporterebbe un globo vecchio di qualche
 * secondo — e si legge il canvas **dentro** l'evento `render`.
 */
window.immagineDaApp = () =>
  new Promise((risolvi) => {
    map.triggerRepaint();
    map.once('render', () => {
      // Sincrono, qui dentro. MapLibre emette `render` subito dopo aver
      // disegnato e prima di restituire il controllo: e' l'unico istante in cui
      // il buffer WebGL si puo' rileggere senza `preserveDrawingBuffer`. C'era
      // invece un `requestAnimationFrame` in mezzo, e rimandare anche di un solo
      // fotogramma e' proprio cio' che rendeva necessaria quell'opzione — con il
      // suo costo su ogni fotogramma della vita dell'app, per una funzione usata
      // una volta ogni tanto.
      try {
        risolvi(map.getCanvas().toDataURL('image/png').split(',')[1] || '');
      } catch (e) {
        console.error('export immagine fallito', e);
        risolvi('');
      }
    });
  });

/**
 * Porta la mappa su un punto scelto da un elenco nativo.
 *
 * Lo zoom predefinito e' 9: abbastanza vicino da vedere la citta' e i suoi
 * dintorni, e oltre la soglia da cui compaiono i puntini, altrimenti si
 * arriverebbe su una mappa vuota proprio nel punto cercato.
 *
 * Gli elenchi lo passano diverso a seconda di cosa si apre — una regione va
 * inquadrata intera, e a 9 se ne vedrebbe un angolo — quindi e' un argomento e
 * non piu' una costante. Chi non lo passa ottiene il 9 di prima.
 */
window.volaDaApp = (lat, lon, zoom = 9) => {
  map.flyTo({ center: [lon, lat], zoom, duration: 1200 });
};

/** Accende o spegne il dettaglio regionale, su richiesta della scheda nativa. */
window.regioniDaApp = (codice, accendi) => {
  if (accendi) attivaRegioni(codice);
  else disattivaRegioni(codice);
};

/**
 * Applica uno stato su richiesta dell'app nativa.
 *
 * Le sei regole di §8.1 restano qui, dove sono state scritte e verificate:
 * Kotlin dice **cosa** marcare, il JavaScript applica regole, colori e
 * salvataggio. Quando lo stato passera' a Room le regole si sposteranno con
 * lui, ma non insieme al cambio d'interfaccia — sarebbero due cose alla volta.
 */
window.impostaDaApp = (tipo, codice, stato) => {
  if (tipo === 'places') {
    // dalla chiave, non dalla feature: l'elenco non ce l'ha (vedi
    // impostaCittaPerChiave)
    impostaCittaPerChiave(codice, stato);
  } else if (tipo === 'countries') {
    impostaPaese(codice, stato);
  } else {
    setStatus(tipo, codice, stato);
  }
};

/** Messaggio d'errore che dice quale file manca e dove va copiato. */
function mancaArchivio(nome) {
  const dove = cartellaTile() || 'Android/data/com.provamappa.globe/files/tiles';
  const presenti = elencoFile().map((f) => f.nome).join(', ') || 'nessuno';
  return `Manca ${nome}. Copialo in:\n${dove}\n\nArchivi presenti: ${presenti}`;
}

async function preparaSorgenteCitta() {
  const protocollo = protocolloCondiviso();

  if (suAndroid && dimensioneFile(TILE_CITTA) > 0) {
    const archivio = new pmtiles.PMTiles(new AndroidBridgeSource(TILE_CITTA));
    protocollo.add(archivio);
    console.log('[citta] tile letti dal disco tramite il ponte Kotlin');
    return { tipo: 'pmtiles', url: `pmtiles://${archivio.source.getKey()}` };
  }

  try {
    const res = await fetch(`data/${TILE_CITTA}`, { method: 'HEAD' });
    if (res.ok) {
      const assoluto = new URL(`data/${TILE_CITTA}`, location.href).href;
      const mb = Number(res.headers.get('content-length') || 0) / 1048576;
      console.log(`[citta] tile via HTTP, ${mb.toFixed(0)} MB`);
      return { tipo: 'pmtiles', url: `pmtiles://${assoluto}` };
    }
  } catch (e) {
    /* nessun archivio: si ricade sul GeoJSON */
  }

  console.log('[citta] nessun archivio di tile, uso il GeoJSON dei capoluoghi');
  return { tipo: 'geojson' };
}

/**
 * Sorgente dei confini: stati e regioni in un unico archivio, due livelli.
 *
 * Stessa scaletta delle citta' — ponte Kotlin su Android, HTTP sul desktop —
 * ma senza ricaduta sul GeoJSON: i confini a tile sono l'unica strada, perche'
 * caricarli tutti insieme e' il rischio 3b di §11 (14 MB di GeoJSON fanno
 * crashare il rendering con 2 GB di RAM).
 */
async function preparaSorgenteConfini(filename = TILE_CONFINI) {
  const protocollo = protocolloCondiviso();

  if (suAndroid) {
    // Il ponte legge gli asset non compressi nell'APK oppure una copia
    // esterna. Un archivio mancante va segnalato senza tentare HTTP.
    if (dimensioneFile(filename) <= 0) throw new Error(mancaArchivio(filename));
    const archivio = new pmtiles.PMTiles(new AndroidBridgeSource(filename));
    protocollo.add(archivio);
    console.log('[confini] tile letti dal disco tramite il ponte Kotlin');
    return { url: `pmtiles://${archivio.source.getKey()}` };
  }

  const res = await fetch(`data/${filename}`, { method: 'HEAD' });
  if (!res.ok) throw new Error(`data/${filename}: HTTP ${res.status}`);
  const assoluto = new URL(`data/${filename}`, location.href).href;
  const mb = Number(res.headers.get('content-length') || 0) / 1048576;
  console.log(`[confini] tile via HTTP, ${mb.toFixed(1)} MB`);
  return { url: `pmtiles://${assoluto}` };
}

/**
 * Chiave con cui una citta' viene salvata.
 *
 * I due formati non vanno confusi: nei tile l'identificatore e' il geonameid
 * di GeoNames, nel GeoJSON di ripiego e' un progressivo che partirebbe da 1 e
 * si sovrapporrebbe a geonameid diversi. Il prefisso li tiene separati.
 */
function chiaveCitta(feature, daTile) {
  return daTile ? `g:${feature.id}` : `n:${feature.id}`;
}

/**
 * Paesi che ricevono un trattamento speciale nel posizionamento della bandiera.
 *
 * `ignoraIsoleMinori`: il rettangolo su cui si stira la bandiera viene calcolato
 * sui soli poligoni sopra l'1% dell'area, e i bordi vengono prolungati verso le
 * isole escluse. Le isole restano colorate, ma non dilatano piu' il rettangolo.
 *
 * Perche' una tabella e non una regola generale: applicare la stessa logica a
 * tutti cambierebbe la resa di decine di paesi che oggi vanno bene. Meglio
 * poche eccezioni dichiarate, ciascuna motivata da una misura.
 *
 * RUS: il rettangolo arriva a 81,9 gradi per Novaja Zemlja, mentre la terraferma
 * si ferma a 77,7 (Tajmyr). In Mercatore quei gradi valgono un terzo
 * dell'altezza, quindi la banda bianca cadeva quasi tutta sull'oceano.
 * Misurato: bianco 5,6% -> 17,2%, blu 53,6% -> 57,3%, rosso 40,8% -> 25,5%.
 */
const ECCEZIONI_BANDIERA = {
  RUS: { ignoraIsoleMinori: true },
};

// ---------------------------------------------------------------------------
// Costanti
// ---------------------------------------------------------------------------

const COLOR = {
  land: '#ffffff',
  landHover: '#f0f0f0',
  border: '#2b2b2b',
  regionBorder: '#9a9a9a',
  ocean: '#e9edf0',
  visited: '#2e9e4f',
  wanted: '#f08a24',
  /** citta' non visitata: rossa, come stabilito nelle regole */
  city: '#d33333',
};

/**
 * Soglie di zoom che governano il passaggio fra i tre livelli.
 *
 * `regione` e' **una sola** soglia, e prima erano due: le regioni entravano
 * dissolvendosi da 3,5 a 5, e nel mezzo convivevano con la nazione mezza
 * trasparente sotto. Il passaggio adesso e' netto — sotto la soglia lo stato,
 * sopra le sue regioni — e questo semplifica tre cose insieme: non c'e' piu' un
 * intervallo in cui si vedono due cose sovrapposte, non c'e' piu' la fascia in
 * cui si vedeva una regione senza poterla toccare (la soglia del tocco e' la
 * stessa del disegno, per costruzione), e la GPU non deve piu' fondere due
 * livelli per un giro e mezzo di zoom.
 *
 * 4,25 e' il punto in cui la vecchia dissolvenza era a meta': lo stesso momento
 * di prima, senza la sfumatura attorno.
 */
const Z = { regione: 4.25, cityStart: 4, cityFull: 5 };

const STORAGE_KEY = 'provamappa.prototipo.v1';

// ---------------------------------------------------------------------------
// Stato applicativo
// ---------------------------------------------------------------------------

/** { countries: {CODE: 'visited'|'wanted'}, regions: {...} } */
let store = loadStore();

/** Indici code -> feature, popolati dopo il caricamento dei GeoJSON. */
const byCode = { countries: new Map(), regions: new Map(), places: new Map() };

/**
 * Paesi per cui il dettaglio regionale e' acceso.
 *
 * Le regioni non si caricano piu' tutte all'avvio: erano 3.583 poligoni letti
 * e tenuti in memoria anche da chi non ne guardava nessuna, ed erano la voce
 * di costo principale del prototipo. Ora ogni paese ha il suo file (l'Italia
 * sono 80 KB contro i 12,6 MB del totale) e viene letto solo se richiesto.
 */
const regioniAttive = new Set();

/** code paese -> array di feature, per i paesi gia' scaricati. */
const regioniCaricate = new Map();

/** Quali paesi hanno regioni disponibili: da data/regions/index.json. */
let indiceRegioni = {};

/** true quando le citta' arrivano dai tile invece che dal GeoJSON di ripiego. */
let cittaDaTile = false;

const opts = {
  cities: true,
  /**
   * Etichette col nome delle citta'. Interruttore separato perche' il layer
   * `symbol` e' il piu' caro di MapLibre — rifa' il collision detection a ogni
   * spostamento — ed e' il primo sospetto quando la mappa diventa lenta.
   */
  labels: true,
  maskProjection: 'mercator',
  /**
   * Come la bandiera si adatta alla sagoma.
   * Scelta 'deforma' dopo il confronto visivo dello spike M0: la bandiera
   * intera viene stirata sul rettangolo del blocco. Sacrifica la fedelta' delle
   * proporzioni, che a occhio disturba poco, e in cambio e' l'unica che mostra
   * sempre tutta la bandiera senza rimpicciolirla ne' spostarla.
   */
  fit: 'deforma',
};

/**
 * Livelli immagine attualmente sulla mappa.
 * Chiave "kind:code" -> elenco degli id dei livelli, uno per blocco di
 * poligoni: uno stato con territori lontani ne ha piu' di uno.
 */
const activeFlags = new Map();

let map;

// ---------------------------------------------------------------------------
// Persistenza (nel prototipo localStorage; nell'app sara' Room)
// ---------------------------------------------------------------------------

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const migrazione = migraCodiciRegioni(parsed.regions || {});
      const caricato = {
        countries: parsed.countries || {},
        regions: migrazione.regioni,
        // le citta' sono indipendenti da nazione e regione: nessuna
        // ereditarieta', nessuna aggregazione
        places: parsed.places || {},
        // paesi per i quali l'utente ha chiesto il dettaglio regionale
        regioniAttive: parsed.regioniAttive || [],
      };
      if (migrazione.rimappate || migrazione.scartate) {
        // La conversione avviene anche sullo stato vivo, non soltanto quando
        // si importa un backup vecchio. Si salva subito: al prossimo avvio non
        // deve dipendere ancora dalla tabella di compatibilita'.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(caricato));
        console.log(
          `[migrazione regioni] ${migrazione.rimappate} rimappate, ` +
          `${migrazione.scartate} senza equivalenza`
        );
      }
      if (migrazione.sconosciute) {
        console.warn(`[migrazione regioni] ${migrazione.sconosciute} vecchi codici senza regola, conservati`);
      }
      return caricato;
    }
  } catch (e) {
    console.warn('store illeggibile, riparto da zero', e);
  }
  return { countries: {}, regions: {}, places: {}, regioniAttive: [] };
}

/**
 * Manda a Kotlin una copia dello stato, per gli elenchi nativi.
 *
 * Quelli devono mostrare cosa e' gia' marcato e non possono leggere il
 * `localStorage` della pagina. Va chiamata **anche all'avvio**, non solo dopo
 * una modifica: altrimenti finche' non si tocca qualcosa gli elenchi
 * mostrerebbero tutto come non visitato, pur avendo i dati salvati.
 */
function specchiaStato() {
  if (!perApp || !window.AndroidUI.onStato) return;
  try {
    window.AndroidUI.onStato(JSON.stringify(store));
  } catch (e) {
    console.warn('specchio dello stato non aggiornato', e);
  }
}

/** Quanti blocchi sono aperti, e se dentro e' stato chiesto un salvataggio. */
let blocchiAperti = 0;
let salvataggioRimandato = false;

function saveStore() {
  if (blocchiAperti > 0) {
    salvataggioRimandato = true;
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  // comprese le modifiche indirette, come una nazione che cambia perche' e'
  // cambiata una sua regione (Regola 2 di §8.1)
  specchiaStato();
}

/**
 * Esegue una modifica in blocco salvando **una volta sola** alla fine.
 *
 * `setStatus` salva a ogni chiamata: per un tocco e' giusto, per un ciclo e'
 * rovinoso. Marcare la Russia sono ottantatre passaggi, e ciascuno serializzava
 * l'intero store due volte — una per `localStorage`, che scrive su disco in modo
 * sincrono, e una per lo specchio che attraversa il ponte JNI verso Kotlin.
 * Centosessantasei serializzazioni e ottantatre scritture per un'operazione che
 * ne chiede una: era li' che l'app si fermava per secondi.
 *
 * Si contano i blocchi invece di tenere un booleano perche' si annidano:
 * `impostaPaese` chiama `setStatus`, che a sua volta puo' propagare.
 */
async function inBlocco(azione) {
  blocchiAperti++;
  try {
    return await azione();
  } finally {
    blocchiAperti--;
    if (blocchiAperti === 0 && salvataggioRimandato) {
      salvataggioRimandato = false;
      saveStore();
    }
  }
}

// ---------------------------------------------------------------------------
// Bandiere
// Geometria, ritaglio e modalita' di adattamento vivono in flagmask.js, cosi'
// che la pagina di confronto (compare.html) usi esattamente lo stesso codice.
// ---------------------------------------------------------------------------

/**
 * Tempi di rasterizzazione, per rispondere con un numero invece che a
 * impressione quando la mappa sembra lenta. Dalla console della WebView:
 * `metricheBandiere()`, e `metricheBandiere(true)` per ripartire da zero.
 */
const metriche = { n: 0, ms: 0, peggiore: 0 };

window.metricheBandiere = (azzera) => {
  const r = {
    profilo: PROFILO.nome,
    maschere: metriche.n,
    totaleMs: Math.round(metriche.ms),
    mediaMs: metriche.n ? +(metriche.ms / metriche.n).toFixed(1) : 0,
    peggioreMs: Math.round(metriche.peggiore),
    livelliVivi: [...activeFlags.values()].reduce((somma, v) => somma + v.ids.length, 0),
    inCoda: codaBandiere.size,
  };
  if (azzera) {
    metriche.n = 0;
    metriche.ms = 0;
    metriche.peggiore = 0;
  }
  return r;
};

/**
 * Lato del canvas della maschera, misurato su quanto l'entita' occupa davvero
 * sullo schermo adesso.
 *
 * Sostituisce la vecchia soglia `ZOOM_BANDIERA = 3`, sotto la quale le bandiere
 * semplicemente non si disegnavano e restava il colore dominante (§7.2). Quel
 * taglio non era estetica ma memoria: allontanandosi sono inquadrate *tutte* le
 * entita' visitate del mondo, e un canvas da 1024 per ciascuna era il caso
 * peggiore (§11, rischio 4).
 *
 * Legando il lato alla resa a schermo il problema si dissolve da se': a zoom 0
 * l'Italia sono quattordici pixel e le bastano 128 (64 KB invece di 4 MB), a
 * zoom 6 ne chiede mille. Il costo totale non e' piu' "quante entita' sono
 * marcate" ma "quanto schermo coprono", che e' limitato per costruzione.
 *
 * Quantizzato a potenze di due perche' e' anche la soglia con cui si decide di
 * rifare una maschera diventata troppo grossolana (`aggiornaBandiereInVista`):
 * un valore continuo la rifarebbe a ogni pizzico di zoom.
 */
const LATO_MIN_BANDIERA = 128;

function latoBandiera(bbox, kind) {
  // le regioni sono molte e piccole: meta' lato significa un quarto dei pixel
  // da disegnare, e a video non si distingue. Il tetto dipende dal profilo del
  // dispositivo: sul telefono lento si dimezza ancora (vedi PROFILO).
  const max = PROFILO.latoMax[kind === 'regions' ? 'regions' : 'countries'];

  // larghezza del mondo in pixel di dispositivo: MapLibre usa tessere da 512 e
  // disegna alla risoluzione vera dello schermo, non a quella CSS — su un
  // telefono con dpr 3 e' il triplo, e ignorarlo darebbe maschere sfocate
  const mondo = 512 * 2 ** map.getZoom() * (window.devicePixelRatio || 1);
  const larghezza = ((bbox[2] - bbox[0]) / 360) * mondo;
  const altezza = ((mercY(bbox[3]) - mercY(bbox[1])) / 360) * mondo;

  // renderFlagMask adatta il lato lungo, quindi comanda il maggiore dei due
  const richiesto = Math.max(larghezza, altezza);
  const quantizzato = 2 ** Math.ceil(Math.log2(Math.max(1, richiesto)));
  return Math.max(LATO_MIN_BANDIERA, Math.min(max, quantizzato));
}

/**
 * Aggiunge il livello bandiera. Ogni passo e' tracciato: durante lo spike ci
 * interessa sapere *dove* fallisce, non solo che e' fallito.
 * Ritorna una diagnostica utilizzabile dalla console.
 */
async function addFlagLayer(kind, feature) {
  const step = { kind, code: feature?.properties?.code, esito: 'in corso' };
  try {
    const code = feature.properties.code;
    const key = `${kind}:${code}`;
    if (activeFlags.has(key)) return { ...step, esito: 'gia-presente' };

    const iso2 = feature.properties.iso2;
    step.iso2 = iso2;
    if (!iso2) {
      console.warn(`[bandiera] ${code}: nessun codice ISO2, resta il colore pieno`);
      return { ...step, esito: 'iso2-mancante' };
    }

    const polys = polygonsOf(feature.geometry);
    const clusters = clusterPolygons(polys);
    // un blocco piu' largo di quanto un quad possa coprire viene reso in fasce
    const bande = clusters.flatMap((c) => splitIntoBands(c));

    // eccezioni per paese: vedi ECCEZIONI_BANDIERA
    const eccezione = kind === 'countries' ? ECCEZIONI_BANDIERA[code] : null;
    if (eccezione?.ignoraIsoleMinori) {
      for (const banda of bande) {
        const cluster = clusters.find((c) => c.bbox === banda.globalBbox);
        const ridotto = cluster && bboxPoligoniMaggiori(cluster.polys);
        if (ridotto) {
          banda.globalBbox = ridotto;
          banda.estendiBordi = true;
          step.eccezione = 'ignoraIsoleMinori';
        }
      }
    }
    step.poligoni = polys.length;
    step.blocchi = clusters.length;
    step.fasce = bande.length;
    if (!bande.length) {
      console.warn(`[bandiera] ${code}: nessun blocco rappresentabile`);
      return { ...step, esito: 'nessun-blocco' };
    }

    const beforeId = kind === 'countries' ? 'countries-line' : 'regions-line';
    step.beforeIdEsiste = !!map.getLayer(beforeId);
    const idsAggiunti = [];
    step.dettaglioBlocchi = [];

    // La fascia piu' grande fa da riferimento per decidere quando la maschera
    // va rifatta piu' fine. Non l'ingombro complessivo: quello della Francia va
    // dalla Guyana a Riunione, chiederebbe il lato massimo a qualunque zoom e il
    // risparmio sparirebbe proprio dove serve.
    const bboxRif = bande.reduce((a, b) => (areaVista(a.bbox) >= areaVista(b.bbox) ? a : b)).bbox;
    const lato = latoBandiera(bboxRif, kind);
    step.lato = lato;

    for (let i = 0; i < bande.length; i++) {
      const banda = bande[i];
      const tRender = performance.now();
      const rendered = await renderFlagMask(banda.polys, banda.bbox, iso2, {
        proiezione: opts.maskProjection,
        fit: opts.fit,
        globalBbox: banda.globalBbox,
        estendiBordi: banda.estendiBordi,
        // ogni fascia al lato che le compete: la Guyana non ha bisogno dei mille
        // pixel della Francia metropolitana. Le fasce di uno stesso blocco
        // spezzato (l'Antartide) hanno per costruzione lo stesso ingombro,
        // quindi non c'e' salto di nitidezza fra l'una e l'altra.
        lato: latoBandiera(banda.bbox, kind),
      });
      const durata = performance.now() - tRender;
      metriche.n++;
      metriche.ms += durata;
      if (durata > metriche.peggiore) metriche.peggiore = durata;
      if (!rendered) continue;

      // lo stato puo' essere cambiato mentre rasterizzavamo
      if (statusOf(kind, code) !== 'visited') break;

      const id = `flag-${kind}-${code}-${i}`;
      if (map.getSource(id)) continue;
      const [minLon, minLat, maxLon, maxLat] = rendered.bbox;

      map.addSource(id, {
        // `canvas` e non `image`: il canvas della maschera diventa texture cosi'
        // com'e'. Prima passava per un data URL PNG, cioe' una compressione
        // deflate sul thread principale e una decodifica subito dopo dentro
        // MapLibre — lo stesso lavoro fatto due volte, e la causa principale
        // degli scatti sui telefoni lenti.
        type: 'canvas',
        canvas: rendered.canvas,
        // Senza, MapLibre darebbe per scontato un canvas animato: ne
        // ricaricherebbe la texture a ogni fotogramma e terrebbe la mappa in
        // ridisegno perpetuo. La maschera invece e' ferma da quando nasce.
        animate: false,
        coordinates: [
          [minLon, maxLat],
          [maxLon, maxLat],
          [maxLon, minLat],
          [minLon, minLat],
        ],
      });
      map.addLayer(
        {
          id,
          type: 'raster',
          source: id,
          // `code` va passato: senza, `layerOpacity` non sa se il paese ha le
          // regioni accese e restituisce sempre 1, cosi' la bandiera nazionale
          // resta piena sopra le regioni invece di sfumare via
          paint: { 'raster-opacity': layerOpacity(kind, code), 'raster-fade-duration': 0 },
        },
        step.beforeIdEsiste ? beforeId : undefined
      );
      idsAggiunti.push(id);
      step.dettaglioBlocchi.push({
        poligoni: banda.polys.length,
        bbox: rendered.bbox.map((v) => +v.toFixed(1)),
        globale: banda.globalBbox.map((v) => +v.toFixed(1)),
        estesa: !!banda.estendiBordi,
        canvas: rendered.size,
        fit: rendered.fit,
      });
    }

    if (!idsAggiunti.length) return { ...step, esito: 'nessun-livello-aggiunto' };

    // Si tiene anche l'ingombro: serve a `sfoltisciBandiere` per capire quali
    // sono fuori dallo schermo e si possono scaricare. `bboxRif` e `lato` vanno
    // in coppia: sono la geometria di riferimento e la risoluzione che le e'
    // stata data, e il loro confronto dice se avvicinandosi e' rimasta indietro.
    activeFlags.set(key, { ids: idsAggiunti, bbox: bboxUnione(bande), bboxRif, lato });
    step.esito = 'ok';
    // JSON e non l'oggetto: in logcat un oggetto diventa "[object Object]"
    console.log(`[bandiera] ${code}: ${idsAggiunti.length} immagini — ${JSON.stringify(step)}`);
    return step;
  } catch (e) {
    step.esito = 'eccezione';
    step.errore = e.message;
    console.error(`[bandiera] ${step.code}: eccezione`, e);
    return step;
  }
}

function removeFlagLayer(kind, code) {
  const key = `${kind}:${code}`;
  // Anche quando non c'e' niente da togliere dalla mappa: potrebbe esserci una
  // richiesta in coda, e servirla dopo che l'entita' e' stata smarcata
  // rimetterebbe una bandiera che nessuno chiede piu'.
  codaBandiere.delete(key);
  const voce = activeFlags.get(key);
  if (!voce) return;
  for (const id of voce.ids) {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  }
  activeFlags.delete(key);
}

/** Rettangolo che contiene tutte le fasce di una bandiera. */
function bboxUnione(bande) {
  let b = null;
  for (const banda of bande) {
    const x = banda.globalBbox || banda.bbox;
    if (!x) continue;
    b = b
      ? [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])]
      : [...x];
  }
  return b || [-180, -90, 180, 90];
}

/**
 * Tetto ai livelli-immagine vivi contemporaneamente.
 *
 * E' il rischio 4 di §11: ogni entita' visitata tiene in memoria le sue fasce,
 * e un canvas da 1024 pixel per fascia si somma in fretta. Con duecento paesi e
 * un centinaio di regioni marcate non ci starebbe nulla.
 *
 * Il numero e' un compromesso: abbastanza alto da coprire un continente intero
 * inquadrato, abbastanza basso da non accumulare il mondo.
 */
const MAX_LIVELLI_BANDIERA = 120;

/**
 * Entita' rinunciate perche' troppo piccole a questa scala (vedi
 * `sfoltisciBandiere`). Non e' una lista nera permanente: si svuota appena
 * torna spazio sotto il tetto, cioe' appena la vista cambia abbastanza da
 * scaricarne altre.
 */
const bandiereMinute = new Set();

function intersecaVista(bbox, vista) {
  return !(
    bbox[2] < vista.getWest() ||
    bbox[0] > vista.getEast() ||
    bbox[3] < vista.getSouth() ||
    bbox[1] > vista.getNorth()
  );
}

/**
 * Scarica le bandiere fuori dallo schermo quando si supera il tetto.
 *
 * Si tolgono solo quelle **non inquadrate**: una bandiera visibile non sparisce
 * mai sotto gli occhi. Se il paese torna in vista la bandiera viene rifatta —
 * costa qualche millisecondo di rasterizzazione, molto meno che tenerle tutte.
 *
 * L'ordine di `Map` e' quello d'inserimento, quindi si parte dalle piu'
 * vecchie: e' una LRU approssimata, e per questo scopo basta.
 */
function sfoltisciBandiere() {
  let livelli = 0;
  for (const v of activeFlags.values()) livelli += v.ids.length;
  if (livelli <= MAX_LIVELLI_BANDIERA) return;

  const vista = map.getBounds();
  const scarica = (key, v) => {
    const i = key.indexOf(':');
    removeFlagLayer(key.slice(0, i), key.slice(i + 1));
    livelli -= v.ids.length;
  };

  let fuori = 0;
  for (const [key, v] of [...activeFlags]) {
    if (livelli <= MAX_LIVELLI_BANDIERA) break;
    if (intersecaVista(v.bbox, vista)) continue;
    scarica(key, v);
    fuori++;
  }

  // Da lontano non c'e' nulla fuori vista da scaricare — il mondo intero e'
  // inquadrato — e prima di questa riga il tetto restava semplicemente
  // sforato. Si cede allora sulle piu' piccole: sono quelle in cui la bandiera
  // vale pochi pixel e il colore dominante del riempimento (§7.2) le sostituisce
  // senza che si noti. Le grandi, dove la bandiera si legge, restano.
  let minute = 0;
  if (livelli > MAX_LIVELLI_BANDIERA) {
    const perArea = [...activeFlags].sort(
      (a, b) => areaVista(a[1].bbox) - areaVista(b[1].bbox)
    );
    for (const [key, v] of perArea) {
      if (livelli <= MAX_LIVELLI_BANDIERA) break;
      scarica(key, v);
      // senza questo la spazzata successiva le rimetterebbe subito — sono in
      // vista, quindi `aggiornaBandiereInVista` le ritrova — e si
      // rasterizzerebbe a vuoto a ogni panoramica
      bandiereMinute.add(key);
      minute++;
    }
  }

  if (fuori || minute) {
    console.log(
      `[bandiere] scaricate ${fuori} fuori vista e ${minute} minute, restano ${livelli} livelli`
    );
  }
}

/** Ingombro in spazio Mercatore, per ordinare le bandiere dalla piu' piccola. */
function areaVista(bbox) {
  return (bbox[2] - bbox[0]) * (mercY(bbox[3]) - mercY(bbox[1]));
}

/**
 * Bandiere da disegnare, una per volta e nei momenti liberi.
 *
 * Il costo di una singola maschera non era il problema: il problema era che
 * arrivavano tutte insieme. Un `moveend` dopo un pizzico sull'Europa metteva in
 * fila venti rasterizzazioni consecutive, e per tutta la loro durata il thread
 * principale non disegnava piu' niente — lo scatto si sentiva alla **fine** del
 * gesto, non durante, ed e' la firma di questo comportamento.
 *
 * Qui le richieste si accumulano e vengono servite una alla volta, cedendo il
 * controllo fra l'una e l'altra: il lavoro totale e' lo stesso, ma spalmato su
 * molti fotogrammi invece che concentrato in uno. Una `Map` e non un array
 * perche' la stessa entita' puo' essere chiesta due volte prima di essere
 * servita — succede a ogni panoramica — e va disegnata una volta sola.
 *
 * Resta immediata la bandiera che nasce da un tocco: chi marca un paese adesso
 * deve vederlo adesso, ed e' una sola.
 */
const codaBandiere = new Map();
let codaInCorso = false;

/**
 * Mette in coda una bandiera. Con `rifai` la richiesta vale anche per
 * un'entita' che una bandiera ce l'ha gia': e' il caso dell'avvicinamento, dove
 * la maschera esiste ma e' rimasta troppo grossolana.
 */
function accodaBandiera(kind, code, rifai = false) {
  const key = `${kind}:${code}`;
  const gia = codaBandiere.get(key);
  // se una delle due richieste chiedeva di rifare, vince quella: sovrascriverla
  // con una semplice aggiunta lascerebbe la maschera vecchia dov'e'
  codaBandiere.set(key, { kind, code, rifai: rifai || !!gia?.rifai });
  serviCoda();
}

/**
 * Cede il thread fino al prossimo momento libero.
 *
 * `requestIdleCallback` con un `timeout`: se il telefono e' occupato aspetta,
 * ma non oltre due decimi di secondo — su una mappa in movimento continuo,
 * senza quel tetto, i momenti liberi non arriverebbero mai e le bandiere non
 * comparirebbero affatto.
 */
function respiro() {
  return new Promise((risolvi) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => risolvi(), { timeout: 200 });
    } else {
      setTimeout(risolvi, 0);
    }
  });
}

async function serviCoda() {
  if (codaInCorso) return;
  codaInCorso = true;
  try {
    while (codaBandiere.size) {
      const [key, voce] = codaBandiere.entries().next().value;
      codaBandiere.delete(key);

      // Fra l'accodamento e adesso puo' essere cambiato tutto: l'entita'
      // smarcata, la bandiera gia' rimessa da un'altra strada, il tetto
      // raggiunto. Si ricontrolla qui, dove si sta per spendere.
      if (statusOf(voce.kind, voce.code) !== 'visited') continue;
      if (bandiereMinute.has(key)) continue;
      if (activeFlags.has(key)) {
        if (!voce.rifai) continue;
        // Il livello vecchio se ne va solo adesso, un istante prima che il nuovo
        // lo sostituisca: toglierlo al momento dell'accodamento farebbe
        // lampeggiare il colore pieno per tutta l'attesa in coda.
        removeFlagLayer(voce.kind, voce.code);
      }

      await aggiungiBandiera(voce.kind, voce.code);
      // il tetto va fatto rispettare qui e non solo a fine spazzata: la coda
      // aggiunge livelli molto dopo che `aggiornaBandiereInVista` ha contato
      sfoltisciBandiere();
      await respiro();
    }
  } catch (e) {
    console.error('[bandiere] coda interrotta', e);
  } finally {
    codaInCorso = false;
  }
}

/**
 * Rimette le bandiere delle entita' visitate che sono rientrate in vista.
 *
 * E' la controparte di `sfoltisciBandiere`: insieme rendono le bandiere una
 * cosa che segue lo schermo invece di accumularsi. Si guarda cosa e' disegnato
 * adesso, non l'intero salvataggio, perche' con i tile le entita' fuori
 * schermo non esistono nemmeno in memoria.
 */
function aggiornaBandiereInVista() {
  if (!map.getLayer('countries-fill')) return;

  // Se il tetto non e' piu' saturo c'e' di nuovo posto, quindi le rinunce
  // dell'ultima spazzata vanno riprovate: e' cio' che le distingue da una lista
  // nera. Il confronto e' stretto, cosi' a tetto esattamente pieno non si
  // riparte da capo a ogni panoramica.
  let vivi = 0;
  for (const v of activeFlags.values()) vivi += v.ids.length;
  if (vivi < MAX_LIVELLI_BANDIERA) bandiereMinute.clear();

  // Avvicinandosi, chi era stato disegnato piccolo va rifatto piu' fine: la
  // maschera e' rasterizzata una volta sola, quindi senza questo passo una
  // bandiera nata a zoom 0 resterebbe da 128 pixel anche a zoom 8. Solo verso
  // l'alto: allontanandosi una maschera troppo fine non si vede, e rifarla
  // costerebbe soltanto.
  const vista = map.getBounds();
  for (const [key, v] of [...activeFlags]) {
    if (!intersecaVista(v.bbox, vista)) continue;
    const i = key.indexOf(':');
    const kind = key.slice(0, i);
    const code = key.slice(i + 1);
    if (latoBandiera(v.bboxRif, kind) <= v.lato) continue;
    accodaBandiera(kind, code, true);
  }

  const livelli = ['countries-fill'];
  if (map.getLayer('regions-fill')) livelli.push('regions-fill');
  for (const f of map.queryRenderedFeatures({ layers: livelli })) {
    const kind = f.layer.id === 'regions-fill' ? 'regions' : 'countries';
    const code = f.properties.code;
    const key = `${kind}:${code}`;
    if (!code || activeFlags.has(key) || bandiereMinute.has(key)) continue;
    if (statusOf(kind, code) === 'visited') accodaBandiera(kind, code);
  }
  sfoltisciBandiere();
}

// ---------------------------------------------------------------------------
// Stato delle feature
// ---------------------------------------------------------------------------

function statusOf(kind, code) {
  return store[kind][code] || 'none';
}

/** Codice del paese che precede lo slug regionale: per esempio "ITA.toscana". */
function paeseDiRegione(code) {
  return code.split('.')[0];
}

function setStatus(kind, code, status, opzioni = {}) {
  if (status === 'none') delete store[kind][code];
  else store[kind][code] = status;
  saveStore();

  // Non serve piu' avere la feature: con `promoteId` l'identificativo e' il
  // codice. Prima si usciva subito se la feature non era in memoria, cosa che
  // coi tile sarebbe sempre vera per tutto cio' che e' fuori schermo.
  map.setFeatureState(riferimento(kind, code), { s: status });

  // una marcatura esplicita vince sempre sulla rinuncia per dimensione: chi
  // segna un paese adesso si aspetta di vederne la bandiera, non il colore
  bandiereMinute.delete(`${kind}:${code}`);
  if (status !== 'visited') removeFlagLayer(kind, code);
  // `differisci` distingue il tocco singolo dalla marcatura in blocco: la
  // bandiera di cio' che si e' appena toccato compare subito, le ottantatre
  // regioni della Russia passano invece dalla coda, una per volta.
  else if (opzioni.differisci) accodaBandiera(kind, code);
  else aggiungiBandiera(kind, code);

  // cambiando una regione, lo stato del paese va ricalcolato
  if (kind === 'regions' && opzioni.propaga !== false) {
    aggiornaPaeseDaRegioni(paeseDiRegione(code));
  }

  if (opzioni.aggiornaConteggi !== false) refreshStats();
}

/**
 * Sagoma di un'entita', per la maschera della bandiera.
 *
 * I tile **non** servono a questo: sono ritagliati per tessera, quindi la
 * geometria che portano e' spezzata e inutilizzabile per una maschera — lo
 * annotava gia' §7.1 del piano. I cataloghi sono riferimenti leggeri;
 * la sagoma precisa si carica per singola entita', con cache limitata. I
 * vecchi pacchetti con geometrie nel catalogo restano leggibili.
 */
const cacheSagome = new Map();
const richiesteSagome = new Map();
let byteSagome = 0;
const MAX_BYTE_SAGOME = 8 * 1024 * 1024; // byte JSON, non stima della heap JS
async function sagoma(kind, code) {
  if (kind === 'regions') {
    const paese = paeseDiRegione(code);
    if (!regioniCaricate.has(paese)) await caricaRegioni(paese);
  }
  const voce = byCode[kind].get(code);
  if (!voce?.mask) return voce || null;
  if (cacheSagome.has(code)) {
    const v = cacheSagome.get(code);
    cacheSagome.delete(code); cacheSagome.set(code, v);
    return v.feature;
  }
  if (richiesteSagome.has(code)) return richiesteSagome.get(code);
  const richiesta = (async () => {
    const cartella = kind === 'countries' ? 'country-shapes' : 'region-shapes';
    const res = await fetch(`data/${cartella}/${encodeURIComponent(code)}.geojson`);
    if (!res.ok) throw new Error(`sagoma ${code}: HTTP ${res.status}`);
    const testo = await res.text();
    const feature = JSON.parse(testo);
    if (feature.properties?.code !== code || !['Polygon','MultiPolygon'].includes(feature.geometry?.type)) {
      throw new Error(`sagoma ${code}: geometria o codice non valido`);
    }
    const bytes = new TextEncoder().encode(testo).length;
    // Una singola geometria oltre budget si usa e si rilascia, senza cache.
    if (bytes <= MAX_BYTE_SAGOME) {
      while (cacheSagome.size && byteSagome + bytes > MAX_BYTE_SAGOME) {
        const primo = cacheSagome.keys().next().value;
        byteSagome -= cacheSagome.get(primo).bytes;
        cacheSagome.delete(primo);
      }
      cacheSagome.set(code, {feature, bytes}); byteSagome += bytes;
    }
    return feature;
  })();
  richiesteSagome.set(code, richiesta);
  try { return await richiesta; }
  finally { richiesteSagome.delete(code); }
}

async function aggiungiBandiera(kind, code) {
  const f = await sagoma(kind, code);
  if (!f) return;
  // lo stato puo' essere cambiato mentre si caricava la sagoma
  if (statusOf(kind, code) !== 'visited') return;
  // `await` e non una chiamata lasciata correre: senza, la coda credeva di aver
  // finito prima ancora che la maschera cominciasse, e le serviva tutte insieme
  // — cioe' esattamente cio' che la coda esiste per evitare
  await addFlagLayer(kind, f);
}

/**
 * Cambia lo stato di una citta'.
 *
 * Separata dalle altre entita' per due motivi: con i tile non esiste un indice
 * di tutte le citta' in memoria — sono milioni e arrivano una tessera alla
 * volta — quindi si lavora sulla feature appena toccata; e serve indicare il
 * `sourceLayer`, che le sorgenti GeoJSON non hanno.
 *
 * MapLibre conserva lo stato per identificativo anche quando la tessera viene
 * scaricata e ricaricata, quindi non serve riapplicarlo a ogni spostamento.
 */
function impostaCitta(feature, status) {
  impostaCittaPerChiave(chiaveCitta(feature, cittaDaTile), status);
}

/**
 * Cambia lo stato di una citta' **a partire dalla sola chiave**.
 *
 * E' la forma generale, e `impostaCitta` non e' che questa con la chiave
 * ricavata dalla feature. Serve perche' l'elenco nativo conosce la chiave —
 * `g:<geonameid>` — ma **non ha la feature**: quelle arrivano una tessera alla
 * volta e di una citta' fuori schermo non si ha nulla in memoria.
 *
 * Prima esisteva solo la versione con la feature, e la richiesta dell'elenco
 * ricadeva sull'ultima citta' toccata *sulla mappa*: marcava quella sbagliata.
 * La chiave porta gia' dentro di se' da dove viene la citta' — `g:` dai tile,
 * `n:` dal GeoJSON — quindi basta lei anche per lo stato grafico.
 */
function impostaCittaPerChiave(chiave, status) {
  const [prefisso, id] = chiave.split(':');
  if (status === 'none') delete store.places[chiave];
  else store.places[chiave] = status;
  saveStore();

  // `rif` e non `riferimento`: quel nome ora e' una funzione globale, e una
  // variabile locale omonima la oscurerebbe
  const rif = { source: 'places', id: Number(id) };
  if (prefisso === 'g') rif.sourceLayer = 'cities';
  map.setFeatureState(rif, { s: status });

  refreshStats();
}

/** Stato salvato di una citta'. */
function statoCitta(feature) {
  return store.places[chiaveCitta(feature, cittaDaTile)] || 'none';
}

/** Regioni di un paese, fra quelle gia' caricate. */
function regioniDi(code) {
  return regioniCaricate.get(code) || [];
}

/**
 * Stato del paese ricavato dalle sue regioni: basta una regione visitata
 * perche' il paese risulti visitato, e con esso la sua bandiera.
 *
 * Restituisce `null` quando **nessuna** regione porta uno stato. Non e' lo
 * stesso di "non visitato": vuol dire che le regioni non hanno nulla da dire
 * sul paese, e quindi il paese conserva il proprio stato (Regola 3-bis).
 */
function statoDaRegioni(code) {
  // Si scandisce il **salvataggio**, non le feature caricate: con i tile le
  // regioni arrivano una tessera alla volta, e ciclare su quelle in memoria
  // darebbe risposte diverse a seconda di dove si sta guardando. I codici
  // iniziano col paese seguito da un punto, quindi il prefisso basta — e' lo
  // stesso trucco che usa `dimenticaRegioniDi`.
  const prefisso = `${code}.`;
  let wanted = false;
  let qualcuna = false;
  for (const [rc, s] of Object.entries(store.regions)) {
    if (!rc.startsWith(prefisso) || !s) continue;
    qualcuna = true;
    if (s === 'visited') return 'visited';
    if (s === 'wanted') wanted = true;
  }
  if (!qualcuna) return null;
  return wanted ? 'wanted' : 'none';
}

/** Riallinea il paese all'aggregato delle sue regioni, se sono accese. */
function aggiornaPaeseDaRegioni(code) {
  if (!code || !regioniAttive.has(code)) return;
  const derivato = statoDaRegioni(code);
  // REGOLA 3-bis: finche' nessuna regione e' marcata, la derivazione tace e il
  // paese resta com'era. Altrimenti aprire il dettaglio di un paese visitato lo
  // dichiarerebbe subito non visitato.
  if (derivato === null) return;
  if (statusOf('countries', code) !== derivato) {
    setStatus('countries', code, derivato, { aggiornaConteggi: false });
  }
}

/**
 * Applica uno stato a un paese. Se il dettaglio regionale e' acceso, lo stato
 * si applica a tutte le sue regioni: con le regioni accese sono loro la fonte
 * della verita', e il colore del paese ne discende.
 */
async function impostaPaese(code, status) {
  // Un solo salvataggio per tutto il paese invece di uno per regione, e le
  // bandiere dalla coda invece che tutte adesso: e' l'operazione piu' pesante
  // che l'app sappia fare, ed era pesante per il modo in cui era scritta piu'
  // che per quello che chiede. Vedi `inBlocco`.
  return inBlocco(async () => {
    if (regioniAttive.has(code)) {
      // Serve l'elenco completo delle regioni del paese, che dai tile non si
      // ricava: portano solo cio' che e' inquadrato. Si carica il GeoJSON delle
      // sagome — ottanta KB per l'Italia — che comunque servirebbe fra un attimo
      // per le bandiere.
      const regioni = regioniDi(code).length ? regioniDi(code) : await caricaRegioni(code);
      for (const f of regioni) {
        setStatus('regions', f.properties.code, status, {
          propaga: false,
          aggiornaConteggi: false,
          differisci: true,
        });
      }
    } else {
      // REGOLA 5: cambiare la nazione a regioni spente invalida il dettaglio
      // regionale salvato, che altrimenti tornerebbe a galla alla prossima
      // accensione contraddicendo la scelta appena fatta.
      dimenticaRegioniDi(code);
    }
    setStatus('countries', code, status);
  });
}

/**
 * Cancella gli stati regionali salvati di un paese.
 * I codici regionali iniziano col paese seguito da un punto
 * ("ITA.toscana"), quindi si possono togliere anche senza avere il file caricato.
 */
function dimenticaRegioniDi(code) {
  const prefisso = `${code}.`;
  let tolti = 0;
  for (const rc of Object.keys(store.regions)) {
    if (rc.startsWith(prefisso)) {
      delete store.regions[rc];
      // Va tolto anche lo stato grafico, e la sua bandiera: MapLibre conserva
      // lo stato per identificativo, quindi la regione resterebbe colorata pur
      // non avendo piu' nulla di salvato. Prima ci pensava la ricostruzione
      // della sorgente GeoJSON, che con i tile non esiste piu'.
      //
      // Si **imposta** a 'none' invece di rimuovere la chiave: e' la strada
      // che il resto del codice usa da sempre e che si sa funzionare, mentre
      // `removeFeatureState` qui non sbiancava le regioni — riaccendendole
      // dopo aver azzerato la nazione ricomparivano verdi.
      map.setFeatureState(riferimento('regions', rc), { s: 'none' });
      removeFlagLayer('regions', rc);
      tolti++;
    }
  }
  if (tolti) console.log(`[regioni] ${code}: ${tolti} stati regionali invalidati`);
  return tolti;
}

function cycle(status) {
  return status === 'none' ? 'visited' : status === 'visited' ? 'wanted' : 'none';
}

// ---------------------------------------------------------------------------
// Dettaglio regionale su richiesta
// ---------------------------------------------------------------------------

/**
 * Carica il catalogo leggero delle regioni. Le sagome precise vengono lette
 * singolarmente da sagoma(); i tile continuano a disegnare i confini.
 */
async function caricaRegioni(code) {
  if (regioniCaricate.has(code)) return regioniCaricate.get(code);
  const t0 = performance.now();
  try {
    const res = await fetch(`data/regions/${code}.geojson`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    regioniCaricate.set(code, json.features);
    for (const f of json.features) byCode.regions.set(f.properties.code, f);
    console.log(
      `[sagome] ${code}: ${json.features.length} regioni in ${Math.round(performance.now() - t0)} ms`
    );
    return json.features;
  } catch (e) {
    console.error(`[sagome] ${code} non caricabile`, e);
    return [];
  }
}

/** Accende il dettaglio regionale di un paese. */
async function attivaRegioni(code) {
  if (regioniAttive.has(code)) return 0;
  if (!indiceRegioni[code]) {
    toast(`${nomePaese(code)}: nessuna suddivisione disponibile`);
    return 0;
  }

  regioniAttive.add(code);
  store.regioniAttive = [...regioniAttive];

  // REGOLA 3-bis (vedi docs/PIANO.md §8.1): **nessuna ereditarieta'**. Le
  // regioni nascono vuote e il paese conserva il suo stato; la derivazione
  // della Regola 2 entra in vigore solo quando almeno una regione viene
  // marcata. La regola precedente copiava lo stato del paese su tutte le sue
  // regioni, cioe' affermava molto piu' di quanto l'utente avesse detto:
  // "sono stato in Italia" diventava "sono stato in tutte e venti le regioni".
  // Gli stati regionali salvati in passato restano dov'erano.
  saveStore();

  map.setFeatureState(riferimento('countries', code), { r: true });

  aggiornaFiltroRegioni();

  // Le bandiere delle regioni visitate vanno rimesse a mano. Lo stato grafico
  // sopravvive allo spegnimento — MapLibre lo conserva per identificativo, ed
  // e' giusto cosi': la Regola 4 vuole che gli stati regionali restino
  // salvati — ma i livelli immagine no, `disattivaRegioni` li ha tolti e il
  // filtro che rimostra le regioni non li riporta indietro. Senza questo, una
  // regione visitata riappare verde piena invece che con la sua bandiera.
  const prefisso = `${code}.`;
  for (const [rc, stato] of Object.entries(store.regions)) {
    if (stato === 'visited' && rc.startsWith(prefisso)) accodaBandiera('regions', rc);
  }
  // con le regioni accese comanda la Regola 2, anche se il paese portava un
  // valore diverso impostato quando erano spente
  aggiornaPaeseDaRegioni(code);
  refreshOpacity();
  refreshRegionsPanel();
  refreshStats();
  // l'indice porta {n, byte}: il conteggio serve solo per il messaggio
  return indiceRegioni[code]?.n || 0;
}

/** Spegne il dettaglio regionale di un paese. I dati restano in cache. */
function disattivaRegioni(code) {
  if (!regioniAttive.has(code)) return;

  // REGOLA 4: spegnendo, la nazione conserva l'aggregato delle sue regioni.
  // Va calcolato prima di rimuovere il paese dall'insieme degli attivi.
  // Se nessuna regione era marcata l'aggregato e' `null` (Regola 3-bis) e la
  // nazione tiene lo stato che gia' aveva: accendere e rispegnere senza
  // toccare nulla non deve cambiare niente.
  const derivato = statoDaRegioni(code);

  // Le bandiere delle regioni sono livelli immagine a se': il filtro che le
  // nasconde non le porta via, vanno tolte esplicitamente. Si cicla sulle
  // bandiere attive, che sono poche, non sulle regioni del paese — che coi
  // tile non si possono nemmeno enumerare senza caricare il GeoJSON.
  const prefisso = `${code}.`;
  for (const key of [...activeFlags.keys()]) {
    if (key.startsWith(`regions:${prefisso}`)) removeFlagLayer('regions', key.slice('regions:'.length));
  }

  regioniAttive.delete(code);
  store.regioniAttive = [...regioniAttive];
  saveStore();

  map.setFeatureState(riferimento('countries', code), { r: false });

  aggiornaFiltroRegioni();
  if (derivato !== null) setStatus('countries', code, derivato);
  refreshOpacity();
  refreshRegionsPanel();
}

function nomePaese(code) {
  return byCode.countries.get(code)?.properties.name || code;
}

/** Indice ISO2 -> nome, riempito pigramente al primo uso da `nomePaeseIso2`. */
const paesiPerIso2 = new Map();

/**
 * Nome del paese a partire dall'ISO2 — le citta' portano quello (`IT`), non
 * l'ISO3 con cui sono indicati gli stati (`ITA`).
 *
 * **Il confronto va fatto a cassa unica.** Nel GeoJSON degli stati `iso2` e'
 * minuscolo (`it`), perche' li' serve a comporre il nome del file della
 * bandiera — `flags/it.svg` —, mentre GeoNames scrive il codice paese
 * maiuscolo. Misurato prima di accorgersene: **zero citta' su 440.273**
 * trovavano il proprio paese, e non si sarebbe visto un errore, solo la sigla
 * al posto del nome.
 *
 * Se il codice non si riconosce si restituisce il codice stesso: meglio una
 * sigla che il nulla, e succede solo per territori che nei due dataset non
 * combaciano.
 */
function nomePaeseIso2(iso2) {
  if (!paesiPerIso2.size) {
    for (const f of byCode.countries.values()) {
      const c = f.properties.iso2;
      if (c) paesiPerIso2.set(c.toUpperCase(), f.properties.name);
    }
  }
  return paesiPerIso2.get(String(iso2).toUpperCase()) || iso2;
}

/** Riapplica tutti gli stati salvati: dopo il caricamento e dopo un reset. */
async function applyStoredStates() {
  // prima si riaccendono i dettagli regionali scelti in passato, cosi' le
  // feature esistono quando si riapplicano stati e bandiere
  for (const code of store.regioniAttive || []) {
    await attivaRegioni(code);
  }

  // Anche stati e regioni ora si applicano per identificativo, come le citta':
  // MapLibre lo conserva e lo usa quando la tessera arriva, quindi funziona
  // anche per cio' che in questo momento e' fuori schermo.
  for (const kind of ['countries', 'regions']) {
    for (const [code, status] of Object.entries(store[kind])) {
      map.setFeatureState(riferimento(kind, code), { s: status });
      // dalla coda: all'avvio si riapplica **tutto** il salvataggio in un colpo,
      // e chi ha marcato mezzo mondo pagava mezzo mondo di rasterizzazioni
      // prima di poter toccare la mappa
      if (status === 'visited') accodaBandiera(kind, code);
    }
  }

  for (const [chiave, status] of Object.entries(store.places)) {
    const [prefisso, id] = chiave.split(':');
    if ((prefisso === 'g') !== cittaDaTile) continue; // chiavi dell'altra sorgente
    const rif = { source: 'places', id: Number(id) };
    if (cittaDaTile) rif.sourceLayer = 'cities';
    map.setFeatureState(rif, { s: status });
  }

  refreshStats();
}

// ---------------------------------------------------------------------------
// Espressioni di stile
// ---------------------------------------------------------------------------

/** Colore dominante per bandiera, calcolato in pipeline da colori_bandiere.js. */
let coloriBandiere = {};

/**
 * Riempimento di stati e regioni.
 *
 * Chi e' visitato prende il colore dominante della **sua** bandiera invece del
 * verde generico, cosi' la mappa resta leggibile come "l'Italia e' verde, la
 * Francia e' rossa". Se il colore manca si ricade sul verde.
 *
 * Non e' piu' cio' che si vede a zoom basso — le bandiere ora si disegnano a
 * ogni scala — ma resta sotto ciascuna di esse: e' quello che compare mentre la
 * maschera si rasterizza, e per le entita' a cui `sfoltisciBandiere` rinuncia
 * perche' troppo minute.
 */
const fillByState = (base) => [
  'case',
  ['==', ['feature-state', 's'], 'visited'], coloreVisitato(),
  ['==', ['feature-state', 's'], 'wanted'], COLOR.wanted,
  base,
];

function coloreVisitato() {
  const voci = Object.entries(coloriBandiere).flat();
  if (!voci.length) return COLOR.visited;
  return ['match', ['get', 'iso2'], ...voci, COLOR.visited];
}

/** Dissolvenza stato -> regione, usata dove il dettaglio regionale e' attivo. */
/**
 * Riferimento a una feature di confine per `setFeatureState`.
 *
 * Stati e regioni vivono nello stesso archivio, distinti dal `source-layer`, e
 * grazie a `promoteId: 'code'` l'identificativo **e'** il codice: `ITA` per lo
 * stato, `ITA.toscana` per la regione. Non serve piu' avere la feature sotto mano,
 * cosa che con i tile sarebbe impossibile — arrivano una tessera alla volta e
 * di una regione fuori schermo non si ha nulla.
 */
function riferimento(kind, code) {
  return { source: 'boundaries', sourceLayer: kind, id: code };
}

/**
 * Filtro delle regioni visibili, costruito con `any` invece che con `in`.
 *
 * `['in', ['get','country'], ['literal', [...]]]` sarebbe piu' compatto, ma con
 * l'elenco **vuoto** — nessun paese acceso, cioe' lo stato iniziale — il
 * controllo di tipo delle espressioni non riesce a dedurre il tipo degli
 * elementi e puo' rifiutare il filtro. Un filtro rifiutato non fa sparire il
 * layer in modo evidente: semplicemente non disegna, e il tocco cade sulla
 * nazione sottostante.
 *
 * `['any']` senza argomenti e' valido e vale sempre falso, quindi la forma qui
 * sotto funziona anche a insieme vuoto.
 */
function filtroRegioni(codici) {
  return ['any', ...codici.map((c) => ['==', ['get', 'country'], c])];
}

const FILTRO_NESSUNA_REGIONE = filtroRegioni([]);

/**
 * Mostra le regioni dei soli paesi accesi.
 *
 * Sostituisce la vecchia `aggiornaSorgenteRegioni`, che ricostruiva la sorgente
 * GeoJSON accumulando le feature dei paesi attivi. Con i tile le regioni del
 * mondo ci sono tutte e la scelta e' un filtro: niente `fetch`, niente
 * `setData`, e nessuno stato grafico da riapplicare a mano — MapLibre lo tiene
 * per identificativo, che ora e' il codice.
 */
function aggiornaFiltroRegioni() {
  const filtro = filtroRegioni([...regioniAttive]);
  for (const id of ['regions-fill', 'regions-line']) {
    if (map.getLayer(id)) map.setFilter(id, filtro);
  }
}

/**
 * Acceso sopra la soglia, spento sotto — e il suo contrario.
 *
 * `step` e non `interpolate`: e' esattamente la differenza fra un passaggio
 * netto e una dissolvenza. Erano `SFUMA_DENTRO` e `SFUMA_VIA`, e producevano
 * l'intervallo 3,5-5 in cui la bandiera della nazione sbiadiva mentre le regioni
 * si facevano strada sotto.
 */
const SOPRA_SOGLIA = ['step', ['zoom'], 0, Z.regione, 1];
const SOTTO_SOGLIA = ['step', ['zoom'], 1, Z.regione, 0];

/**
 * Opacita' del livello immagine di una bandiera.
 * Uno stato con le regioni attive sparisce alla soglia, per lasciare il posto
 * alle sue regioni; tutti gli altri restano visibili a qualunque zoom.
 */
function layerOpacity(kind, code) {
  if (kind === 'regions') return SOPRA_SOGLIA;
  return regioniAttive.has(code) ? SOTTO_SOGLIA : 1;
}

/**
 * Opacita' del riempimento degli stati: solo i paesi marcati con feature-state
 * `r` (dettaglio regionale attivo) spariscono oltre la soglia.
 *
 * L'espressione `zoom` deve stare al livello piu' esterno — MapLibre rifiuta
 * `['case', ..., ['step', ['zoom'], ...]]` — quindi si inverte la struttura:
 * lo scatto sullo zoom fuori, e il valore che ne esce e' quello che dipende dai
 * dati. Sotto la soglia tutti opachi, sopra trasparenti solo i paesi accesi.
 */
const OPACITA_STATI = [
  'step',
  ['zoom'],
  1,
  Z.regione, ['case', ['==', ['feature-state', 'r'], true], 0, 1],
];

function cityColor() {
  return [
    'case',
    ['==', ['feature-state', 's'], 'visited'], COLOR.visited,
    ['==', ['feature-state', 's'], 'wanted'], COLOR.wanted,
    COLOR.city,
  ];
}

function refreshOpacity() {
  map.setPaintProperty('countries-fill', 'fill-opacity', OPACITA_STATI);
  map.setPaintProperty('regions-fill', 'fill-opacity', SOPRA_SOGLIA);
  map.setPaintProperty('regions-line', 'line-opacity', SOPRA_SOGLIA);

  for (const [key, voce] of activeFlags) {
    const [kind, code] = key.split(':');
    for (const id of voce.ids) {
      if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', layerOpacity(kind, code));
    }
  }

  const cityOpacity = opts.cities
    ? ['interpolate', ['linear'], ['zoom'], Z.cityStart, 0, Z.cityFull, 1]
    : 0;
  map.setPaintProperty('places-circle', 'circle-opacity', cityOpacity);
  map.setPaintProperty('places-circle', 'circle-stroke-opacity', cityOpacity);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

let toastTimer;
function toast(text, color) {
  const el = document.getElementById('toast');
  el.innerHTML = color
    ? `<span class="dot" style="background:${color}"></span>${text}`
    : text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

/**
 * I contatori principali riguardano gli stati. Le regioni si contano a parte:
 * sommarle insieme farebbe risultare "4 visitati" per un paese e tre sue
 * regioni, che e' un numero senza significato.
 */
function refreshStats() {
  const conta = (kind, stato) => Object.values(store[kind]).filter((s) => s === stato).length;

  document.getElementById('n-visited').textContent = conta('countries', 'visited');
  document.getElementById('n-wanted').textContent = conta('countries', 'wanted');

  const el = document.getElementById('n-regioni');
  if (el) {
    const righe = [];
    const rv = conta('regions', 'visited');
    const rw = conta('regions', 'wanted');
    const cv = conta('places', 'visited');
    const cw = conta('places', 'wanted');
    if (rv || rw) righe.push(`regioni: ${rv} visitate, ${rw} da visitare`);
    if (cv || cw) righe.push(`città: ${cv} visitate, ${cw} da visitare`);
    el.textContent = righe.join(' · ');
  }
}

function refreshModeLabel() {
  const z = map.getZoom();
  const mode = z < Z.regione ? 'stati' : z < Z.cityFull ? 'stati e regioni' : 'con città';
  document.getElementById('mode').textContent = `zoom ${z.toFixed(2)} · ${mode}`;
}

/** Elenco dei paesi con dettaglio regionale acceso, nel pannello. */
function refreshRegionsPanel() {
  const el = document.getElementById('regioni-attive');
  if (!el) return;
  if (!regioniAttive.size) {
    el.innerHTML = '<i>nessuno</i> — pressione lunga su uno stato per accenderne il dettaglio';
    return;
  }
  const voci = [...regioniAttive]
    .map((c) => {
      const n = regioniCaricate.get(c)?.length || 0;
      return `<button class="chip" data-code="${c}" title="disattiva">${nomePaese(c)} (${n}) ✕</button>`;
    })
    .join(' ');
  el.innerHTML = voci;
  for (const b of el.querySelectorAll('button.chip')) {
    b.addEventListener('click', () => disattivaRegioni(b.dataset.code));
  }
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------

async function loadGeoJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const t0 = performance.now();
  // All'avvio si leggono solo stati e citta'. Le regioni arrivano un paese
  // alla volta, su richiesta: l'indice pesa pochi KB e dice quali paesi ne
  // hanno. Vedi regioniAttive.
  const sorgenteCitta = await preparaSorgenteCitta();
  cittaDaTile = sorgenteCitta.tipo === 'pmtiles';

  const sorgenteConfini = await preparaSorgenteConfini();
  const sorgenteLinee = await preparaSorgenteConfini(TILE_LINEE);

  // countries.geojson non serve piu' a disegnare — a quello pensano i tile —
  // ma conserva i metadati e il riferimento alle sagome nazionali caricate
  // singolarmente da country-shapes (§7.1). Il catalogo pesa circa 1,6 MB.
  const [countries, places, indice, colori] = await Promise.all([
    loadGeoJSON('data/countries.geojson'),
    // il GeoJSON dei capoluoghi si carica solo se non ci sono i tile
    cittaDaTile ? Promise.resolve({ features: [] }) : loadGeoJSON('data/places.geojson'),
    loadGeoJSON('data/regions/index.json'),
    // 3,7 KB: il colore dominante di ogni bandiera, per il riempimento ai
    // bassi zoom (§7.2). Se manca si ricade sul verde generico.
    loadGeoJSON('data/colori_bandiere.json').catch(() => ({})),
  ]);
  coloriBandiere = colori || {};
  indiceRegioni = indice;
  console.log(
    `dati caricati in ${Math.round(performance.now() - t0)} ms ` +
      `(${countries.features.length} stati, ${places.features.length} citta, ` +
      `${Object.keys(indice).length} paesi con regioni disponibili)`
  );

  for (const f of countries.features) byCode.countries.set(f.properties.code, f);
  for (const f of places.features) byCode.places.set(f.properties.code, f);

  map = new maplibregl.Map({
    container: 'map',
    center: [12, 42],
    zoom: 1.6,
    minZoom: 0.5,
    maxZoom: 12,
    // Quanti pixel disegnare davvero: vedi PROFILO. Sul profilo pieno e'
    // `undefined`, e MapLibre usa il devicePixelRatio nativo come sempre.
    pixelRatio: PROFILO.pixelRatio,
    // `false`, ed era `true`.
    //
    // Conservare il buffer di disegno costa su **ogni** fotogramma — impedisce
    // al browser di consegnare il canvas direttamente al compositore — e serviva
    // a una cosa sola: l'export in PNG del menu (§10). Non serve piu', perche'
    // `immagineDaApp` ora legge il canvas dentro l'evento `render`, cioe' nello
    // stesso giro di eventi in cui il disegno e' appena avvenuto e il buffer e'
    // ancora pieno. Il costo fisso se ne va, la funzione resta.
    preserveDrawingBuffer: false,
    attributionControl: { compact: true, customAttribution: 'Natural Earth · flag-icons' },
    style: {
      version: 8,
      projection: { type: 'globe' },
      // Glifi per le etichette. Sono file locali, non un servizio: l'app e'
      // offline. Ci sono le sole fasce latine, che bastano perche' GeoNames
      // scrive i nomi in forma romanizzata — misurato sui 450.848 nomi:
      // 4,7 M caratteri ASCII, 135 mila latini accentati, e solo 399 fra
      // cirillico, greco, CJK e arabo messi insieme. 526 KB in tutto.
      glyphs: 'fonts/{fontstack}/{range}.pbf',
      sky: {
        'sky-color': '#c9d6e0',
        'sky-horizon-blend': 0.6,
        'horizon-color': '#ffffff',
        'horizon-fog-blend': 0.6,
        'fog-color': '#e6e6e6',
        'fog-ground-blend': 0.2,
      },
      sources: {
        // Stati e regioni stanno nello stesso archivio, in due livelli.
        //
        // `promoteId: 'code'` e' il perno di tutto: promuove la proprieta'
        // `code` — codice paese per gli stati, `paese.slug` per le regioni — a
        // identificativo della feature. Senza, `setFeatureState` non avrebbe
        // nulla su cui attaccarsi, perche' i tile non portano un id numerico
        // e `--use-attribute-for-id` di tippecanoe vuole un numero mentre i
        // nostri identificativi sono stringhe. Con questo, lo stato si applica
        // direttamente per codice e non serve piu' tenere in memoria l'indice
        // di tutte le feature.
        boundaries: {
          type: 'vector',
          url: sorgenteConfini.url,
          promoteId: { countries: 'code', regions: 'code' },
        },
        'border-lines': { type: 'vector', url: sorgenteLinee.url },
        places: cittaDaTile
          ? { type: 'vector', url: sorgenteCitta.url }
          : { type: 'geojson', data: places },
      },
      layers: [
        { id: 'ocean', type: 'background', paint: { 'background-color': COLOR.ocean } },
        {
          id: 'countries-fill',
          type: 'fill',
          source: 'boundaries',
          'source-layer': 'countries',
          paint: { 'fill-color': fillByState(COLOR.land), 'fill-opacity': 1 },
        },
        {
          id: 'regions-fill',
          type: 'fill',
          source: 'boundaries',
          'source-layer': 'regions',
          // nei tile ci sono le regioni di tutto il mondo: si disegnano solo
          // quelle dei paesi accesi. Prima la selezione avveniva ricostruendo
          // la sorgente, ora e' un filtro — vedi aggiornaFiltroRegioni()
          filter: FILTRO_NESSUNA_REGIONE,
          paint: { 'fill-color': fillByState(COLOR.land), 'fill-opacity': 0 },
        },
        {
          id: 'regions-line',
          // Solo suddivisioni interne: il perimetro nazionale ha una sola linea.
          type: 'line',
          source: 'border-lines',
          'source-layer': 'region-borders',
          filter: FILTRO_NESSUNA_REGIONE,
          paint: {
            'line-color': COLOR.regionBorder,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 10, 1],
            'line-opacity': 0,
          },
        },
        {
          id: 'countries-line',
          // Rete deduplicata: i poligoni di riempimento possono sovrapporsi.
          type: 'line',
          source: 'border-lines',
          'source-layer': 'country-borders',
          paint: {
            'line-color': COLOR.border,
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 6, 1.4, 10, 2],
          },
        },
        {
          id: 'places-circle',
          type: 'circle',
          source: 'places',
          // il livello dentro i tile si chiama "cities"; col GeoJSON non serve
          ...(cittaDaTile ? { 'source-layer': 'cities' } : {}),
          // I quartieri delle metropoli sono marcati `q` nei tile e non si
          // disegnano: chi visita Parigi vuole segnare Parigi, non venti
          // quartieri. Restano nei dati, quindi bastera' togliere questo
          // filtro per rivederli.
          filter: ['!=', ['get', 'q'], 1],
          paint: {
            'circle-color': cityColor(),
            // abbastanza grandi da poterle centrare col dito: il raggio e'
            // anche l'area sensibile al tocco
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 8, 5, 12, 8],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.2,
            'circle-opacity': 0,
            'circle-stroke-opacity': 0,
          },
        },
        {
          id: 'places-label',
          type: 'symbol',
          source: 'places',
          ...(cittaDaTile ? { 'source-layer': 'cities' } : {}),
          // stesso filtro dei puntini: senza, i quartieri nascosti
          // ricomparirebbero come sole scritte
          filter: ['!=', ['get', 'q'], 1],
          // Non prima dello zoom 7. Piu' in basso le citta' in mappa sono
          // decine di migliaia e il collision detection — la parte cara dei
          // layer `symbol` — diventa il costo dominante del rendering.
          minzoom: 7,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 12, 13],
            'text-anchor': 'top',
            'text-offset': [0, 0.7],
            // l'etichetta puo' sparire, il puntino no: fra i due vince il punto
            'text-optional': true,
            // Nelle collisioni MapLibre tiene chi ha la chiave piu' bassa,
            // quindi si ordina per popolazione **negata**: altrimenti a
            // parita' di spazio sopravvive il nome del paesino e si perde
            // quello del capoluogo. Stesso problema di `--drop-densest-as-needed`
            // in pipeline, stessa cura.
            'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'pop'], 0]],
          },
          paint: {
            'text-color': '#2b2b2b',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.2,
          },
        },
      ],
    },
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  // Pulsante nativo globo/Mercatore: utile per confrontare le due proiezioni
  // e per vedere come si comporta la maschera bandiera in entrambe.
  if (maplibregl.GlobeControl) {
    map.addControl(new maplibregl.GlobeControl(), 'top-right');
  }

  // MapLibre non solleva eccezioni sui fallimenti delle sorgenti: le incanala
  // qui. Senza questo handler un'immagine che non carica sparisce in silenzio.
  map.on('error', (e) => {
    console.error('[maplibre] errore:', e?.error?.message || e?.error || e);
  });

  map.on('load', () => {
    // Ridondante rispetto alla proprieta' di stile, ma innocuo e utile se
    // qualche build ignora `projection` nello style.
    try {
      map.setProjection({ type: 'globe' });
    } catch (e) {
      console.warn('setProjection non disponibile', e);
    }
    refreshOpacity();
    refreshRegionsPanel();
    applyStoredStates();
    refreshModeLabel();
    document.getElementById('loading').classList.add('done');
    console.log(`mappa pronta in ${Math.round(performance.now() - t0)} ms`);
    if (perApp) {
      window.AndroidUI.onMapReady();
      specchiaStato();
    }
  });

  map.on('zoom', refreshModeLabel);

  // Le bandiere seguono lo schermo: quelle rientrate in vista si rifanno,
  // quelle uscite si scaricano se si supera il tetto (§11, rischio 4). A
  // `moveend` e non durante il movimento, altrimenti si rasterizzerebbe a ogni
  // fotogramma di una panoramica.
  map.on('moveend', aggiornaBandiereInVista);

  // --- interazione ---------------------------------------------------------
  /**
   * Livelli interrogabili al livello di zoom corrente.
   * La sorgente delle regioni contiene solo i paesi accesi, quindi non serve
   * piu' alcun interruttore globale: dove non ci sono regioni, il tocco cade
   * naturalmente sullo stato.
   */
  /**
   * Livelli che rispondono al tocco, **ordinati dal piu' specifico al piu'
   * generico**: l'ordine e' significativo, lo usa `colpito()` per decidere.
   *
   * La soglia delle regioni e' la stessa con cui vengono disegnate, e non puo'
   * piu' essere altrimenti: ce n'e' una sola. Quando erano due — si disegnavano
   * sfumando da 3,5 a 5 — nel mezzo si vedevano senza poterle toccare, e il
   * tocco cadeva sulla nazione sotto portandosi dietro tutte le sue regioni.
   * Cio' che si vede dev'essere cio' che si tocca, e ora lo e' per costruzione.
   */
  function livelliInterrogabili(z) {
    const layers = [];
    if (opts.cities && z >= Z.cityStart) layers.push('places-circle');
    if (z >= Z.regione) layers.push('regions-fill');
    layers.push('countries-fill');
    return layers;
  }

  /**
   * Fra le feature sotto il dito vince quella del livello piu' specifico.
   *
   * `queryRenderedFeatures` **non garantisce** che il primo risultato sia il
   * livello piu' in alto, e `hits[0]` lo dava per scontato: bastava che uscisse
   * prima la nazione perche' toccare una regione marcasse l'intero stato.
   */
  function colpito(hits, layers) {
    for (const id of layers) {
      const f = hits.find((h) => h.layer.id === id);
      if (f) return f;
    }
    return hits[0];
  }

  /**
   * Sul telefono una pressione lunga produce `contextmenu` e, al rilascio,
   * spesso anche un `click`. Senza questa finestra di guardia, accendere le
   * regioni faceva anche scattare il ciclo dei tre stati.
   */
  let ultimaPressioneLunga = 0;

  map.on('click', (e) => {
    if (Date.now() - ultimaPressioneLunga < 800) return;
    const layers = livelliInterrogabili(map.getZoom());
    const hits = map.queryRenderedFeatures(e.point, { layers });

    // Dentro l'app il tocco **seleziona e basta**: lo stato lo cambia la scheda
    // nativa con tre azioni esplicite (§9.2). Il ciclo a tocco resta solo nel
    // prototipo web, dove non c'e' una scheda a cui delegare.
    if (perApp) {
      if (!hits.length) {
        window.AndroidUI.onDeselect();
        return;
      }
      segnalaSelezione(colpito(hits, layers));
      return;
    }

    if (!hits.length) return;
    const hit = colpito(hits, layers);

    if (hit.layer.id === 'places-circle') {
      // le citta' hanno gli stessi tre stati, ma del tutto indipendenti da
      // quelli di nazione e regione: nessuna ereditarieta', nessuna aggregazione
      const next = cycle(statoCitta(hit));
      impostaCitta(hit, next);
      const label = { visited: 'visitata', wanted: 'da visitare', none: 'azzerata' }[next];
      const color = { visited: COLOR.visited, wanted: COLOR.wanted, none: COLOR.city }[next];
      toast(`${hit.properties.name} → ${label}`, color);
      return;
    }

    const kind = hit.layer.id === 'regions-fill' ? 'regions' : 'countries';
    const code = hit.properties.code;
    const next = cycle(statusOf(kind, code));
    if (kind === 'countries') impostaPaese(code, next);
    else setStatus(kind, code, next);

    const label = { visited: 'visitato', wanted: 'da visitare', none: 'azzerato' }[next];
    const color = { visited: COLOR.visited, wanted: COLOR.wanted, none: '#888' }[next];
    // dall'indice, non dalle sagome caricate: coi tile potrebbero non esserci
    const nRegioni =
      kind === 'countries' && regioniAttive.has(code) ? indiceRegioni[code]?.n || 0 : 0;
    toast(
      nRegioni
        ? `${hit.properties.name} e le sue ${nRegioni} regioni → ${label}`
        : `${hit.properties.name} → ${label}`,
      color
    );
  });

  map.on('mousemove', (e) => {
    const layers = livelliInterrogabili(map.getZoom());
    map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers }).length ? 'pointer' : '';
  });

  /**
   * Pressione lunga (o tasto destro) su uno stato: accende o spegne il suo
   * dettaglio regionale. MapLibre traduce gia' la pressione prolungata del
   * dito nell'evento contextmenu, quindi funziona identico su telefono e PC.
   */
  map.on('contextmenu', async (e) => {
    // Nell'app il dettaglio regionale si accende dal pulsante nella scheda: la
    // pressione prolungata resta solo nel prototipo, dove non c'e' una scheda.
    // Tenere due strade per la stessa cosa vuol dire tenerne una non provata.
    if (perApp) return;
    ultimaPressioneLunga = Date.now();
    const hits = map.queryRenderedFeatures(e.point, { layers: ['countries-fill'] });
    if (!hits.length) return;
    const code = hits[0].properties.code;
    const nome = hits[0].properties.name;

    if (regioniAttive.has(code)) {
      disattivaRegioni(code);
      toast(`${nome}: dettaglio regionale spento`);
      return;
    }
    if (!indiceRegioni[code]) {
      toast(`${nome}: nessuna suddivisione disponibile`);
      return;
    }
    toast(`${nome}: carico le regioni…`);
    const n = await attivaRegioni(code);
    if (n) {
      toast(`${nome}: ${n} regioni attive`, COLOR.visited);
      if (map.getZoom() < Z.regione) {
        map.easeTo({ center: e.lngLat, zoom: Z.regione + 0.3, duration: 900 });
      }
    }
  });

  // --- controlli HUD -------------------------------------------------------
  document.getElementById('btn-regioni-off').addEventListener('click', () => {
    for (const code of [...regioniAttive]) disattivaRegioni(code);
    toast('dettaglio regionale spento ovunque');
  });

  document.getElementById('opt-cities').addEventListener('change', (e) => {
    opts.cities = e.target.checked;
    refreshOpacity();
  });

  document.getElementById('opt-labels').addEventListener('change', (e) => {
    opts.labels = e.target.checked;
    if (map.getLayer('places-label')) {
      map.setLayoutProperty('places-label', 'visibility', opts.labels ? 'visible' : 'none');
    }
    toast(opts.labels ? 'etichette accese' : 'etichette spente');
  });

  /** Ricostruisce tutte le bandiere gia' sulla mappa con le opzioni correnti. */
  function rigeneraBandiere() {
    const current = [...activeFlags.keys()];
    for (const key of current) {
      const [kind, code] = key.split(':');
      removeFlagLayer(kind, code);
    }
    for (const key of current) {
      const [kind, code] = key.split(':');
      // passa da `aggiungiBandiera`, che sa procurarsi la sagoma anche quando
      // non e' gia' in memoria — con i tile e' il caso normale per le regioni
      aggiungiBandiera(kind, code);
    }
  }

  for (const radio of document.querySelectorAll('input[name=proj]')) {
    radio.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      opts.maskProjection = e.target.value;
      rigeneraBandiere();
      toast(`proiezione maschera: ${opts.maskProjection}`);
    });
  }

  for (const radio of document.querySelectorAll('input[name=fit]')) {
    radio.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      opts.fit = e.target.value;
      rigeneraBandiere();
      toast(`adattamento: ${opts.fit}`);
    });
  }

  document.getElementById('btn-demo').addEventListener('click', () => {
    map.flyTo({ center: [10.5, 45], zoom: 4.2, duration: 2000 });
  });

  // --- diagnostica da console --------------------------------------------
  // Uso:  await diag('ITA')
  window.diag = async function diag(code = 'ITA') {
    const out = { code };
    const kind = byCode.countries.has(code) ? 'countries' : 'regions';
    const feature = await sagoma(kind, code);
    if (!feature) {
      const esempi = [...byCode.countries.keys()].slice(0, 8);
      console.error(`codice "${code}" non trovato. Esempi validi:`, esempi);
      return { errore: 'codice-sconosciuto', esempi };
    }
    out.kind = kind;
    out.proprieta = feature.properties;
    out.geometria = feature.geometry.type;

    // 1. la bandiera SVG e' raggiungibile?
    const iso2 = feature.properties.iso2;
    try {
      const res = await fetch(`flags/${iso2}.svg`);
      out.fetchSvg = `${res.status} ${res.ok ? 'ok' : 'FALLITO'}`;
    } catch (e) {
      out.fetchSvg = `eccezione: ${e.message}`;
    }

    // 2. si rasterizza?
    try {
      const { canvas, aspect } = await loadFlag(iso2);
      out.svgRasterizzato = `${canvas.width}x${canvas.height}, aspect ${aspect.toFixed(3)}`;
      out.svgRasterOk = canvas.width > 0;
    } catch (e) {
      out.svgRasterizzato = `eccezione: ${e.message}`;
      out.svgRasterOk = false;
    }

    // 3. come si raggruppano i poligoni?
    const polys = polygonsOf(feature.geometry);
    const clusters = clusterPolygons(polys);
    out.poligoni = polys.length;
    out.blocchi = clusters.map((c) => ({
      poligoni: c.polys.length,
      bbox: c.bbox.map((v) => +v.toFixed(1)),
      larghezzaGradi: +(c.bbox[2] - c.bbox[0]).toFixed(1),
    }));
    out.poligoniScoperti = polys.length - clusters.reduce((n, c) => n + c.polys.length, 0);

    // 4. le maschere si generano?
    out.maschere = [];
    for (const c of clusters.flatMap((x) => splitIntoBands(x))) {
      try {
        const r = await renderFlagMask(c.polys, c.bbox, iso2, {
          proiezione: opts.maskProjection,
          fit: opts.fit,
          globalBbox: c.globalBbox,
        });
        if (!r) {
          out.maschere.push('null');
          continue;
        }
        // `r.url` ora e' un getter che codifica il PNG a ogni accesso: si legge
        // una volta sola, altrimenti la diagnostica comprime due volte lo stesso
        // canvas per stamparne la dimensione
        const png = r.url;
        const decodificabile = await new Promise((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve(`${probe.naturalWidth}x${probe.naturalHeight}`);
          probe.onerror = () => resolve('NON DECODIFICABILE');
          probe.src = png;
        });
        out.maschere.push(`canvas ${r.size}, PNG ${Math.round(png.length / 1024)} KB, decodifica ${decodificabile}`);
      } catch (e) {
        out.maschere.push(`eccezione: ${e.message}`);
      }
    }

    // 5. cosa c'e' sulla mappa in questo momento
    const ids = activeFlags.get(`${kind}:${code}`)?.ids || [];
    out.livelliSullaMappa = ids.filter((id) => !!map.getLayer(id));
    out.zoomCorrente = +map.getZoom().toFixed(2);
    out.statoSalvato = statusOf(kind, code);
    out.chiaviAttive = [...activeFlags.keys()];
    out.ordineLivelli = map.getStyle().layers.map((l) => l.id);

    console.log('--- diagnostica bandiera ---');
    console.log(JSON.stringify(out, null, 2));
    return out;
  };

  document.getElementById('btn-reset').addEventListener('click', () => {
    for (const key of [...activeFlags.keys()]) {
      const [kind, code] = key.split(':');
      removeFlagLayer(kind, code);
    }
    // Lo stato grafico si toglie **per identificativo**, non passando
    // dall'indice in memoria: coi tile quell'indice non contiene le feature, e
    // l'id del GeoJSON non e' il codice promosso da `promoteId`. Passando di
    // li' non si azzerava nulla, e cio' che era verde restava verde.
    for (const kind of ['countries', 'regions']) {
      for (const code of Object.keys(store[kind])) {
        map.setFeatureState(riferimento(kind, code), { s: 'none' });
      }
    }
    for (const chiave of Object.keys(store.places)) {
      const [prefisso, id] = chiave.split(':');
      if ((prefisso === 'g') !== cittaDaTile) continue; // chiavi dell'altra sorgente
      const rif = { source: 'places', id: Number(id) };
      if (cittaDaTile) rif.sourceLayer = 'cities';
      map.setFeatureState(rif, { s: 'none' });
    }
    // si azzerano i segnalibri, non i dettagli regionali accesi: sono due
    // scelte indipendenti e cancellarle insieme sorprenderebbe l'utente
    store = { countries: {}, regions: {}, places: {}, regioniAttive: [...regioniAttive] };
    saveStore();
    refreshStats();
    toast('segnalibri azzerati');
  });
}

main().catch((e) => {
  console.error(e);
  document.getElementById('loading').textContent = `Errore: ${e.message}`;
});
