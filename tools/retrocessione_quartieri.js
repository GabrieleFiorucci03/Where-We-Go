/*
 * Individua i probabili quartieri di metropoli e li nasconde.
 *
 * Il problema: GeoNames non distingue Iztapalapa (municipio interno a Citta'
 * del Messico) da Ciampino (comune autonomo presso Roma). Entrambi sono centri
 * abitati con popolazione, vicini a una citta' molto piu' grande.
 *
 * Criterio in tre passi:
 *   1. e' sospetto chi non ha alcun ruolo amministrativo, sta entro il raggio
 *      dovuto alla taglia di una metropoli vicina ed e' almeno 5 volte piu'
 *      piccolo di quella.
 *   2. ogni sospetto viene confrontato con i record amministrativi di GeoNames
 *      (classe A, ADM2-5): se esiste una divisione con lo stesso nome nel
 *      raggio di 15 km, e' un comune vero e viene lasciato stare.
 *   3. nei paesi dove GeoNames non ha affatto un livello comunale, il passo 2
 *      non puo' funzionare: li' protegge una soglia di popolazione (§2.3 del
 *      piano, PAESI_SENZA_LIVELLO_COMUNALE qui sotto).
 *
 * Chi resta sospetto viene **marcato e nascosto**, non cancellato: resta nei
 * tile con la proprieta' `q`, e lo stile della mappa lo esclude dal disegno.
 *
 * Nascondere e non ritardare e' una scelta d'uso, non tecnica: chi visita
 * Parigi vuole segnare "Parigi", non venti quartieri. Un elenco di cose da
 * spuntare che non corrisponde a come si viaggia e' peggio di una mappa
 * affollata.
 *
 * Non si cancella perche' l'arbitrato non e' infallibile: marcandoli si puo'
 * tornare indietro, o dare all'utente un interruttore, senza rigenerare i tile.
 */

/**
 * Raggio di ricerca attorno a una metropoli, in funzione della sua taglia.
 *
 * Un raggio unico non funziona: l'area urbanizzata di Londra ha un raggio
 * equivalente di circa 24 km, quella di Citta' del Messico 27, ma New York
 * arriva a 61 e Tokyo a 51. Con 15 km si copriva solo il nucleo centrale.
 * Allargare a tutti sarebbe pero' peggio: a 60 km da una citta' di un milione
 * puo' esserci una citta' autonoma di centocinquantamila abitanti.
 */
const RAGGI_PER_POPOLAZIONE = [
  [10000000, 60],
  [5000000, 45],
  [3000000, 35],
  [1000000, 25],
];

function raggioMetropoli(popolazione) {
  for (const [soglia, km] of RAGGI_PER_POPOLAZIONE) if (popolazione >= soglia) return km;
  return 0;
}

const RAGGIO_MASSIMO_KM = RAGGI_PER_POPOLAZIONE[0][1];
const FATTORE_DOMINANZA = 5;
const POP_METROPOLI = RAGGI_PER_POPOLAZIONE[RAGGI_PER_POPOLAZIONE.length - 1][0];

/**
 * Distanza entro cui un record amministrativo vale come conferma.
 *
 * 6 km erano troppo pochi: il centroide di un comune esteso non coincide col
 * suo centro urbano, e Guarulhos veniva scambiata per un quartiere di San
 * Paolo perche' il suo ADM2 dista 10,8 km dal punto abitato.
 */
const RAGGIO_MATCH_KM = 15;

const SEDI = new Set(['PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG']);

/**
 * Zoom a cui viene spostato tutto cio' che sta dentro l'area di una metropoli.
 *
 * Nasce da un difetto che nascondere non risolve. L'arbitrato esenta le sedi
 * amministrative (SEDI), e i quartieri delle grandi citta' sono quasi sempre
 * codificati cosi': i cinque borough di New York sono tutti PPLA2, i distretti
 * di Hong Kong sono PPLA. Non vengono mai nemmeno sospettati, e la mappa
 * attorno alle metropoli resta affollata.
 *
 * Togliere l'esenzione non e' la cura, ed e' stato misurato: delle 1.918 sedi
 * dentro il raggio di una metropoli, 459 passerebbero a nascoste, ma fra queste
 * ci sono **Islamabad** (capitale del Pakistan, "presso Rawalpindi"), Johor
 * Bahru, Xianyang e Langfang. E non risolverebbe nemmeno il caso di partenza:
 * Brooklyn, Queens, Manhattan e il Bronx sopravvivrebbero comunque, perche' i
 * loro county portano il nome del borough negli alternatenames.
 *
 * Il difetto e' nella premessa dell'arbitrato — "se esiste un ente con lo stesso
 * nome allora e' un comune" — che per i quartieri e' falsa: Brooklyn e
 * Iztapalapa *sono* divisioni amministrative. GeoNames, in questi campi, non
 * porta l'informazione che distingue una divisione autonoma da una interna.
 *
 * Quindi non si nasconde: si **ritarda**. Chi sta nell'area di una metropoli ed
 * e' molto piu' piccolo di essa compare tardi. Da lontano si vede la metropoli,
 * da vicino i suoi pezzi. Nessuna capitale scompare, e la marcatura resta
 * possibile per tutto.
 *
 * **Perche' 10 e non 11**, che pure e' il livello massimo dei tile ed era
 * libero: fra i due non c'e' differenza sotto lo zoom 10, ed e' li' — agli
 * zoom intermedi, dove sono in mappa poche decine di migliaia di voci — che
 * l'affollamento si vede. Al livello 10 sono gia' visibili 439.507 citta',
 * quindi tremila in piu' non cambiano la densita' percepita. Portarle a 11
 * avrebbe aggiunto un solo costo: citta' autonome grandi ma vicine a una
 * metropoli — Kawasaki, Saitama, Guarulhos, Thane, la banlieue parigina —
 * invisibili fino a esserci praticamente dentro. Tutto il beneficio sta nel
 * toglierle dagli zoom bassi, non nel confinarle all'ultimo.
 */
const ZOOM_AFFOLLAMENTO = Number(process.env.ZOOM_AFFOLLAMENTO) || 10;

/**
 * Il ritardo usa criteri **piu' stretti** di quelli del nascondimento, misurati
 * sulle distanze reali. Un primo tentativo che riusava gli stessi criteri
 * seppelliva allo zoom 11 citta' autonome da un milione di abitanti.
 *
 *   quartieri veri        Brooklyn 8,6 km · Manhattan 8,4 · Petare 7,9
 *                         Iztapalapa 10,6 · Queens 14,7 · Staten Island 20,3
 *   citta' autonome       Johor Bahru 22,1 · Xianyang 22,6 · Long Beach 32,1
 *                         Bogor 42,7 · Langfang 50,9
 *
 * Da cui i 25 km: un quartiere sta dentro il corpo urbano, una citta' satellite
 * no. Il raggio del nascondimento (25-60 km secondo la taglia) e' troppo largo
 * per questo scopo.
 *
 * La dominanza scende invece da 5x a 3x, altrimenti i borough piu' grossi
 * sfuggono: Brooklyn e' 3,22 volte piu' piccola di New York, Queens 3,80.
 *
 * Il vincolo sullo stesso paese e' l'unico davvero principiato dei tre: Johor
 * Bahru e' dominata da Singapore, ma un centro abitato non puo' essere il
 * quartiere di una metropoli che sta in un altro stato.
 *
 * > Onesta' sui limiti: le due soglie sono tarate su una dozzina di casi
 * > guardati a mano, non su una verifica sistematica. Su venti casi di prova
 * > ne sbaglia due, entrambi per eccesso: South Tangerang (kota autonoma a
 * > 16,3 km da Giacarta) e Xianyang (citta' a livello di prefettura, 22,6 km
 * > da Xi'an) compaiono solo allo zoom 11. Sono errori miti — la voce resta
 * > visibile e marcabile, solo piu' tardi — e portare il raggio a 22 km
 * > salverebbe Xianyang, ma il margine con Sha Tin (21,6 km, quartiere vero)
 * > sarebbe di un chilometro: taratura sul rumore. Se emergeranno altri casi
 * > il rimedio non e' spostare la soglia a occhio, ma misurare su un campione
 * > piu' largo.
 */
const RAGGIO_AFFOLLAMENTO_KM = 25;
const DOMINANZA_AFFOLLAMENTO = 3;

/** Le capitali nazionali non si ritardano mai: vedi Islamabad presso Rawalpindi. */
const MAI_RITARDATI = new Set(['PPLC']);

/**
 * Popolazione oltre la quale non si nasconde comunque nulla, ma solo nei paesi
 * elencati sotto. Vedi §2.3 del piano.
 */
const SOGLIA_PROTEZIONE = Number(process.env.SOGLIA_PROTEZIONE) || 300000;

/**
 * Paesi in cui GeoNames non ha un livello amministrativo che corrisponda al
 * comune, quindi il passo 2 boccia per assenza di riferimento e non per
 * demerito. Misurato caso per caso sui nascosti sopra la soglia:
 *
 *   IN  ADM3 sono i blocchi di sviluppo, non i comuni: Bhatpara, Panihati,
 *       Kamarhati e Maheshtala non hanno alcun record corrispondente
 *   KE  esistono solo le sub-location (ADMD), sotto il livello comunale
 *   EG  il record piu' vicino a 6th of October City e' a 20 km ed e' il markaz
 *   BR  copertura ADM2 perfetta (5.570 municipi), ma il centroide di
 *       Sao Jose dos Pinhais cade oltre i 15 km dal suo centro abitato
 *   AU  Logan City non ha un ADM corrispondente vicino
 *   KR  Kimhae/Gimhae idem
 *
 * NON comprende la Malesia, dove pure due citta' autonome restano nascoste
 * (Pasir Gudang, Iskandar Puteri): aggiungerla ne recupera 2 ma rimette in
 * mappa 4 kampung veri dell'area di Johor Bahru. Scambio sfavorevole.
 *
 * Ogni paese qui dentro va aggiunto solo dopo aver guardato i suoi casi: la
 * soglia e' cieca, e in un paese dove l'arbitrato funziona rimette in mappa
 * quartieri veri. Stesso criterio della tabella per paese di filtro_citta.js.
 */
const PAESI_SENZA_LIVELLO_COMUNALE = new Set(['IN', 'KE', 'EG', 'BR', 'AU', 'KR']);

/**
 * Parole che nei nomi amministrativi indicano il *tipo* di ente, non il luogo.
 *
 * Sono la causa principale dei falsi negativi del passo 2: il record esiste, a
 * pochi centinaia di metri, ma si chiama "City of Pasay" contro "Pasay",
 * "Kecamatan Bogor" contro "Bogor", "Thi Xa Ben Cat" contro "Ben Cat". Il
 * confronto per prefisso non li vede perche' la qualifica sta davanti.
 *
 * L'elenco e' ricavato dai token piu' frequenti dei 461.433 nomi ADM1-5 con
 * almeno due parole, tenendo solo quelli che sono davvero qualifiche. Restano
 * fuori apposta:
 *   - "san", "santa", "sao", "los", "las", "el", "la": parti del toponimo
 *   - i punti cardinali ("selatan", "barat", "west", "north"...) e i numerali,
 *     che distinguono un ente da un altro e vanno confrontati
 */
const QUALIFICHE = new Set([
  // inglese
  'city', 'town', 'township', 'village', 'municipality', 'borough', 'county',
  'district', 'subdistrict', 'prefecture', 'province', 'of', 'the',
  // indonesiano e malese
  'kota', 'kabupaten', 'kecamatan', 'kelurahan', 'desa', 'kampung', 'gampong',
  'nagari', 'distrik', 'daerah', 'mukim', 'bandaraya', 'majlis', 'perbandaran',
  // vietnamita
  'thi', 'xa', 'thanh', 'pho', 'quan', 'huyen', 'phuong', 'tinh',
  // lingue romanze
  'municipio', 'municipi', 'comuna', 'commune', 'comune', 'corregimiento',
  'departamento', 'provincia', 'arrondissement', 'canton', 'concelho', 'freguesia',
  // arabo traslitterato
  'markaz', 'qism', 'muhafazat', 'mudiriyah',
  // asia meridionale
  'tehsil', 'taluk', 'taluka', 'mandal', 'municipal',
  // altri
  'rayon', 'raion', 'okrug', 'gorod', 'obshtina', 'opstina', 'gmina', 'powiat',
  'amphoe', 'changwat', 'barangay', 'sub', 'shi', 'ku', 'gun',
]);

const R_TERRA = 6371;
const RAD = Math.PI / 180;

function distanzaKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD * Math.cos(((a.lat + b.lat) / 2) * RAD);
  return R_TERRA * Math.sqrt(dLat * dLat + dLon * dLon);
}

/** Nome confrontabile: senza accenti, punteggiatura e maiuscole. */
function normalizza(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Nome ridotto alle sue parole significative, senza le qualifiche di ente. */
function nucleo(s) {
  let t = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let cambiato = true;
  while (cambiato && t.length > 1) {
    cambiato = false;
    if (QUALIFICHE.has(t[0])) { t = t.slice(1); cambiato = true; }
    if (t.length > 1 && QUALIFICHE.has(t[t.length - 1])) { t = t.slice(0, -1); cambiato = true; }
  }
  return t;
}

/**
 * Due nuclei indicano lo stesso luogo?
 *
 * Uguaglianza della sequenza di parole, oppure una sequenza che e' prefisso
 * dell'altra: il record amministrativo porta spesso una specificazione che il
 * centro abitato non ha ("Tlalnepantla de Baz" contro "Tlalnepantla"). La
 * lunghezza minima evita accostamenti casuali fra nomi corti.
 *
 * Il confronto per parole da' solo non basta, e non e' un dettaglio: i due
 * record possono spezzare lo stesso nome in modo diverso — "Nishi-Tokyo-shi"
 * contro "Nishitokyo Shi", "Dolgoprudnyy" contro "Dolgoprudnyy Gorod" — e
 * allora le sequenze non combaciano pur essendo lo stesso luogo. Servono
 * quindi anche le forme compattate, che sono poi il criterio con cui questa
 * funzione lavorava prima delle qualifiche: cosi' il confronto nuovo e' un
 * soprainsieme del vecchio e nessun comune gia' riconosciuto torna indietro.
 * Senza questa aggiunta 24 comuni veri sparivano dalla mappa, fra cui
 * Nishi-Tokyo-shi, Dolgoprudnyy, Bishop's Stortford e Hostomel.
 */
function prefissoCompatto(a, b) {
  const [corto, lungo] = a.length <= b.length ? [a, b] : [b, a];
  return corto.length >= 5 && lungo.startsWith(corto);
}

function stessoNome(a, b) {
  if (a.length === b.length && a.every((x, i) => x === b[i])) return true;
  const [corto, lungo] = a.length <= b.length ? [a, b] : [b, a];
  if (!corto.length || corto.join('').length < 5) return false;
  if (corto.every((x, i) => x === lungo[i])) return true;
  return prefissoCompatto(corto.join(''), lungo.join(''));
}

/** Indice a griglia di mezzo grado, ~55 km: abbondante per i raggi in gioco. */
function indicizza(elementi) {
  const g = new Map();
  elementi.forEach((p, i) => {
    const k = Math.floor(p.lon * 2) + '|' + Math.floor(p.lat * 2);
    let a = g.get(k);
    if (!a) { a = []; g.set(k, a); }
    a.push(i);
  });
  return g;
}

function vicini(griglia, elementi, p, raggio) {
  const out = [];
  const gx = Math.floor(p.lon * 2);
  const gy = Math.floor(p.lat * 2);
  // una cella e' mezzo grado, ~55 km in latitudine: si allarga la finestra
  // quanto serve, altrimenti i raggi grandi perdono i vicini agli angoli
  const span = Math.max(1, Math.ceil(raggio / 55) + 1);
  for (let dx = -span; dx <= span; dx++) {
    for (let dy = -span; dy <= span; dy++) {
      const cella = griglia.get((gx + dx) + '|' + (gy + dy));
      if (!cella) continue;
      for (const j of cella) {
        if (distanzaKm(p, elementi[j]) <= raggio) out.push(elementi[j]);
      }
    }
  }
  return out;
}

/**
 * Il record amministrativo corrisponde al sospetto?
 *
 * Si prova prima col nome ufficiale, poi con gli alternatenames: servono per i
 * casi in cui GeoNames chiama il centro abitato con l'esonimo inglese e l'ente
 * col nome locale ("South Tangerang" contro "Kota Tangerang Selatan"). Gli
 * alternatenames si scompongono solo quando il nome ufficiale ha gia' fallito,
 * altrimenti il costo esplode: sono decine per record.
 */
function corrisponde(sospetto, a) {
  if (stessoNome(sospetto.nuc, a.nuc)) return true;
  // confronto sui nomi grezzi, cioe' il criterio in uso prima delle
  // qualifiche: tenerlo garantisce che nessun comune gia' riconosciuto si
  // perda per un diverso modo di spezzare il nome in parole
  if (prefissoCompatto(sospetto.compat, a.compat)) return true;
  if (!a.alt) return false;
  if (a.altNuc === undefined) {
    a.altNuc = a.alt.split(',').slice(0, 12).map(nucleo);
  }
  return a.altNuc.some((t) => stessoNome(sospetto.nuc, t));
}

/**
 * @param {Array} citta   oggetti { nome, cc, code, pop, lon, lat, zoom }
 * @param {Array} admin   oggetti { nome, alt, lon, lat } dai record di classe A
 * @returns statistiche; marca `quartiere` in loco sui sospetti non riconosciuti
 */
function retrocediQuartieri(citta, admin) {
  const gCitta = indicizza(citta);
  const gAdmin = indicizza(admin);

  for (const a of admin) {
    a.nuc = nucleo(a.nome);
    a.compat = normalizza(a.nome);
  }

  let sospetti = 0;
  let salvati = 0;
  let protetti = 0;
  let nascosti = 0;
  let ritardati = 0;

  for (const c of citta) {
    if (c.pop <= 0) continue;

    // Ritardo della comparsa: criteri stretti, e vale per tutti, sedi
    // comprese. E' il solo provvedimento che tocca i quartieri codificati come
    // sedi — Brooklyn, i distretti di Hong Kong, le alcaldias di Citta' del
    // Messico — perche' l'arbitrato piu' sotto non li guarda nemmeno.
    if (!MAI_RITARDATI.has(c.code) && c.zoom < ZOOM_AFFOLLAMENTO) {
      const dentroUnaMetropoli = vicini(gCitta, citta, c, RAGGIO_AFFOLLAMENTO_KM).some(
        (b) => b !== c && b.cc === c.cc && b.pop >= POP_METROPOLI && b.pop >= c.pop * DOMINANZA_AFFOLLAMENTO
      );
      if (dentroUnaMetropoli) {
        c.zoom = ZOOM_AFFOLLAMENTO;
        ritardati++;
      }
    }

    // si cerca nel raggio massimo, poi si verifica quello dovuto alla taglia
    // della metropoli trovata
    const metropoli = vicini(gCitta, citta, c, RAGGIO_MASSIMO_KM).find(
      (b) =>
        b !== c &&
        b.pop >= POP_METROPOLI &&
        b.pop >= c.pop * FATTORE_DOMINANZA &&
        distanzaKm(c, b) <= raggioMetropoli(b.pop)
    );
    if (!metropoli) continue;

    // L'arbitrato che nasconde riguarda invece i soli non-sede: una sede
    // amministrativa e' quasi sempre un comune vero, e nasconderla sarebbe
    // peggio del male (vedi il riquadro su ZOOM_AFFOLLAMENTO).
    if (SEDI.has(c.code)) continue;
    sospetti++;

    c.nuc = nucleo(c.nome);
    c.compat = normalizza(c.nome);
    if (vicini(gAdmin, admin, c, RAGGIO_MATCH_KM).some((a) => corrisponde(c, a))) {
      salvati++;
      continue;
    }

    // dove non esiste un livello comunale da interrogare, l'arbitrato non ha
    // potuto giudicare: sopra la soglia si sbaglia per eccesso di prudenza
    if (PAESI_SENZA_LIVELLO_COMUNALE.has(c.cc) && c.pop >= SOGLIA_PROTEZIONE) {
      protetti++;
      continue;
    }

    c.quartiere = true;
    c.presso = metropoli.nome;
    nascosti++;
  }

  return { sospetti, salvati, protetti, nascosti, ritardati };
}

module.exports = {
  retrocediQuartieri,
  normalizza,
  nucleo,
  stessoNome,
  corrisponde,
  raggioMetropoli,
  QUALIFICHE,
  PAESI_SENZA_LIVELLO_COMUNALE,
  SOGLIA_PROTEZIONE,
  ZOOM_AFFOLLAMENTO,
  RAGGIO_AFFOLLAMENTO_KM,
  DOMINANZA_AFFOLLAMENTO,
  MAI_RITARDATI,
};
