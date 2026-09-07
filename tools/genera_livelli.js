/*
 * Sceglie, per ogni paese, da quale fonte e a quale livello prendere le
 * suddivisioni amministrative. Scrive la decisione in tools/livelli_regioni.json.
 *
 * PERCHE' SERVE UNA TABELLA E NON UNA REGOLA SOLA
 *
 * "ADM1" non significa la stessa cosa ovunque. geoBoundaries prende il livello
 * 1 da cio' che dichiara l'autorita' statistica nazionale, e le autorita' non
 * concordano fra loro:
 *
 *   ITA  ADM1 =   5   le ripartizioni ISTAT (Nord-Ovest, Nord-Est, Centro...)
 *   ITA  ADM2 =  20   le regioni. Queste.
 *   ITA  ADM3 = 107   le province.
 *   MLT  ADM1 =  68   i consigli locali di un paese di 316 km2.
 *
 * Migrare a livello fisso avrebbe messo 5 macro-aree al posto delle 20 regioni
 * italiane, cioe' avrebbe rotto il paese guardato piu' spesso.
 *
 * IL CRITERIO NON E' "SOMIGLIA A GADM"
 *
 * Nei backup non risulta marcata nemmeno una regione (`regions` e' vuoto in
 * visitati-importato.json e in DA VISITARE-importato.json), quindi non c'e'
 * continuita' da preservare e GADM non ha piu' autorita'. In piu' punti e'
 * fermo a suddivisioni abolite: le 19 contee norvegesi accorpate nel 2020, i 3
 * distretti lussemburghesi aboliti nel 2015, le 5 province finlandesi abolite
 * nel 2010.
 *
 * Il criterio e' quale unita' un viaggiatore chiama "regione". GADM resta come
 * riferimento di grandezza, solo per far emergere gli scarti da guardare.
 *
 * Uso:  node tools/genera_livelli.js
 *
 * Legge:   data_raw/gb_meta_ADM1.json, _ADM2, _ADM3
 *          scaricati da https://www.geoboundaries.org/api/current/gbOpen/ALL/ADMn/
 *          data_raw/regions_gadm_raw.geojson (facoltativo: solo riferimento GADM)
 * Scrive:  tools/livelli_regioni.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GREZZI = path.join(ROOT, 'data_raw');
const USCITA = path.join(__dirname, 'livelli_regioni.json');

/**
 * Decisioni prese a mano, ognuna con il motivo.
 *
 * `fonte: 'gb'` = geoBoundaries gbOpen al livello indicato.
 * `fonte: 'ne'` = ripiego su Natural Earth admin-1, pubblico dominio: si usa
 *                 dove nessun livello geoBoundaries corrisponde a cio' che un
 *                 viaggiatore riconosce come regione.
 * `fonte: 'escluso'` = niente suddivisioni per questo codice.
 */
const ECCEZIONI = {
  // --- dove geoBoundaries ha ragione e GADM e' fermo a unita' abolite ---
  ITA: { fonte: 'gb', livello: 'ADM2', motivo: 'ADM1 sono le 5 ripartizioni ISTAT; le 20 regioni stanno a ADM2' },
  NOR: { fonte: 'gb', livello: 'ADM1', motivo: 'le contee sono state accorpate nel 2020: 11, non le 19 di GADM' },
  FIN: { fonte: 'gb', livello: 'ADM1', motivo: '19 e\' il numero reale delle regioni; i 5 di GADM sono le province abolite nel 2010' },
  LUX: { fonte: 'gb', livello: 'ADM1', motivo: 'i 3 distretti di GADM sono aboliti dal 2015; restano i 12 cantoni' },
  TWN: { fonte: 'gb', livello: 'ADM1', motivo: '22 divisioni e\' il conteggio corretto' },
  MDG: { fonte: 'gb', livello: 'ADM1', motivo: 'riorganizzato in 22 regioni; i 6 di GADM sono le province abolite nel 2009' },
  NPL: { fonte: 'gb', livello: 'ADM1', motivo: '7 province dalla costituzione del 2015; i 5 di GADM sono le regioni di sviluppo abolite' },

  // --- dove il livello 1 e' amministrativo ma non e' cio' che si marca ---
  UGA: { fonte: 'gb', livello: 'ADM1', motivo: 'le 4 regioni; i 58 di GADM sono distretti, troppo minuti per una mappa di viaggio' },
  BWA: { fonte: 'gb', livello: 'ADM1', motivo: '10 distretti contro i 16 di GADM, che include le sottodivisioni urbane' },
  PRK: { fonte: 'gb', livello: 'ADM1', motivo: '11 province e citta\' a statuto speciale' },
  OMN: { fonte: 'gb', livello: 'ADM1', motivo: '7 governatorati nella fonte nazionale' },
  KGZ: { fonte: 'gb', livello: 'ADM1', motivo: '7 regioni; GADM conta a parte Bishkek e Osh' },
  NER: { fonte: 'gb', livello: 'ADM1', motivo: '6 regioni nella fonte nazionale' },
  GMB: { fonte: 'gb', livello: 'ADM1', motivo: '8 divisioni contro le 6 di GADM' },
  PHL: { fonte: 'gb', livello: 'ADM1', motivo: '17 regioni; gli 81 di GADM sono province, un livello sotto' },
  MKD: { fonte: 'gb', livello: 'ADM1', motivo: '8 regioni; gli 81 di GADM sono comuni, troppo minuti per un paese di 25.700 km2' },
  MWI: { fonte: 'gb', livello: 'ADM1', motivo: '3 regioni; i 28 di GADM sono distretti' },
  LKA: { fonte: 'gb', livello: 'ADM1', motivo: '9 province; i 25 di GADM sono distretti' },

  // --- territori senza ADM1, ma con un livello piu' profondo utilizzabile ---
  // La regola automatica ripiegherebbe su Natural Earth, buttando via dati che
  // ci sono: Porto Rico ha a ADM2 gli stessi 78 municipios che aveva in GADM.
  PRI: { fonte: 'gb', livello: 'ADM2', motivo: '78 municipios; il territorio non ha un ADM1' },
  GUM: { fonte: 'gb', livello: 'ADM2', motivo: '19 villaggi; nessun ADM1' },
  MNP: { fonte: 'gb', livello: 'ADM2', motivo: '4 comuni; nessun ADM1' },
  GUF: { fonte: 'gb', livello: 'ADM3', motivo: 'arrondissement: unico livello presente per i dipartimenti francesi d\'oltremare' },
  MTQ: { fonte: 'gb', livello: 'ADM3', motivo: 'arrondissement: unico livello presente' },
  REU: { fonte: 'gb', livello: 'ADM3', motivo: 'arrondissement: unico livello presente' },

  // --- dove il ripiego Natural Earth funziona ---
  IRL: { fonte: 'ne', livello: null, motivo: 'le 26 contee non sono un livello amministrativo (ADM1 sono 4 province, ADM2 sono 166); Natural Earth ne ha 34, che sono le contee' },
  ASM: { fonte: 'ne', livello: null, motivo: 'presente solo a ADM3 in geoBoundaries; Natural Earth ne ha 5' },
  VIR: { fonte: 'ne', livello: null, motivo: 'presente solo a ADM3 in geoBoundaries; Natural Earth ne ha 3' },
  MDV: { fonte: 'ne', livello: null, motivo: 'in geoBoundaries sei atolli (Raa, Thaa, Vaavu, Lhaviyani, Dhaalu, Faafu) sono rettangoli di mare da 6-11 vertici: l'unione regionale dava un contorno nazionale di 30.000 km2 d'oceano invece di isole. Natural Earth 10m ha tutti e 21 gli atolli come isole vere' },

  // --- dove nessuna fonte libera ha la granularita' giusta: nessuna regione ---
  //
  // Il ripiego su Natural Earth qui non funziona, e va detto perche': NE ha lo
  // stesso difetto di geoBoundaries, cioe' e' troppo FINE, non troppo grosso.
  // Malta 68 consigli, Slovenia 193 comuni, Lettonia 119, Azerbaigian 78: sono
  // liste di comuni, non di regioni.
  //
  // Meglio nessuna suddivisione che suddivisioni sbagliate. Il paese resta
  // marcabile come nazione, ed e' uno stato previsto: IndiceRegioni.kt dice
  // che "un paese senza suddivisioni non ha il file, e non e' un guasto".
  //
  // Costo noto e accettato: le 4 regioni maltesi marcate nel backup del
  // 2026-09-06 non hanno una destinazione e vanno perse. Restano nel backup,
  // e Malta resta segnata come nazione visitata.
  MLT: { fonte: 'nessuna', livello: null, motivo: 'le 5 regioni statistiche non esistono in nessuna fonte libera: geoBoundaries e Natural Earth danno entrambi i 68 consigli locali' },
  SVN: { fonte: 'nessuna', livello: null, motivo: 'le 12 regioni statistiche non ci sono: geoBoundaries ha 2 regioni di coesione o 213 comuni, Natural Earth 193 comuni' },
  LVA: { fonte: 'nessuna', livello: null, motivo: 'le regioni storiche non ci sono: geoBoundaries ha i 43 comuni della riforma 2021, Natural Earth 119' },
  AZE: { fonte: 'nessuna', livello: null, motivo: 'geoBoundaries ha 2 sole unita\', Natural Earth 78 distretti: niente di intermedio' },
};

/**
 * Codici del vecchio insieme GADM che non sono paesi e non vanno portati dietro.
 *
 * I `Z0n` sono la codifica GADM delle aree contese (Kashmir, Xinjiang, Xizang,
 * Arunachal Pradesh): duplicavano le stesse suddivisioni sotto codici diversi.
 * `NA` e `?` sono record guasti. Non compaiono nella tabella perche' non
 * superano il filtro sul formato ISO3 in conteggiGadm(), che li elenca a video:
 * la loro sparizione va vista, non subita in silenzio.
 *
 * Escluderli e' una scelta esplicita. E' anche cio' che fa geoBoundaries, che
 * ritaglia le aree contese secondo le definizioni del Dipartimento di Stato USA.
 */

/** Oltre questi rapporti rispetto a GADM, il paese va guardato a mano. */
const TOLLERANZA = [0.6, 1.6];

// --- ingressi ---------------------------------------------------------------

function leggiMeta(livello) {
  const file = path.join(GREZZI, `gb_meta_${livello}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `manca ${path.relative(ROOT, file)}\n` +
      `scaricalo con: curl -sL "https://www.geoboundaries.org/api/current/gbOpen/ALL/${livello}/" -o "${path.relative(ROOT, file)}"`
    );
  }
  const righe = JSON.parse(fs.readFileSync(file, 'utf8'));
  const per = new Map();
  for (const r of righe) {
    per.set(r.boundaryISO, {
      unita: parseInt(r.admUnitCount, 10) || 0,
      licenza: r.boundaryLicense || 'sconosciuta',
      dettaglioLicenza: r.licenseDetail && r.licenseDetail !== 'nan' ? r.licenseDetail : '',
      licenzaUrl: r.licenseSource || '',
      fonteDati: r.boundarySource || '',
      anno: r.boundaryYearRepresented || '',
      nome: r.boundaryName || '',
      geojson: r.gjDownloadURL || '',
      geojsonSemplificato: r.simplifiedGeometryGeoJSON || '',
    });
  }
  return per;
}

/**
 * Conteggio Natural Earth admin-1 per paese.
 *
 * Serve per due cose, e la seconda e' nata da un errore: il ripiego su Natural
 * Earth era stato scelto per Malta, Slovenia, Lettonia e Azerbaigian dandolo
 * per buono senza guardarlo. Guardandolo, NE ha lo stesso difetto di
 * geoBoundaries su quei paesi - 68 consigli maltesi, 193 comuni sloveni - ed e'
 * troppo fine, non piu' grosso. Da qui il controllo automatico piu' sotto:
 * un ripiego non si dichiara utilizzabile finche' non se ne contano le unita'.
 */
function leggiNaturalEarth() {
  const file = path.join(GREZZI, 'regions_10m.geojson');
  if (!fs.existsSync(file)) return null;
  const g = JSON.parse(fs.readFileSync(file, 'utf8'));
  const per = new Map();
  for (const f of g.features) {
    const iso = f.properties.adm0_a3;
    if (iso) per.set(iso, (per.get(iso) || 0) + 1);
  }
  return per;
}

/**
 * Conteggio GADM per paese, se il grezzo c'e'. Serve solo da riferimento.
 * Restituisce anche i codici scartati, che vanno mostrati: sono le aree contese
 * e i record guasti descritti sopra.
 */
async function conteggiGadm() {
  // Non usare data_raw/confini/regions.ndjson: e' un *prodotto* della nuova
  // pipeline e viene sovrascritto con geoBoundaries. Usarlo come ingresso
  // rendeva il generatore non idempotente e al secondo giro perdeva i paesi
  // presenti soltanto nel vecchio insieme GADM.
  const file = path.join(GREZZI, 'regions_gadm_raw.geojson');
  if (!fs.existsSync(file)) return null;
  const per = new Map();
  const scartati = new Map();
  const features = JSON.parse(fs.readFileSync(file, 'utf8')).features || [];
  for (const feature of features) {
    const codice = feature.properties.code || '';
    // il Ghana ha codici senza punto ("GHA1_2"): si prendono le prime tre
    // lettere, non il pezzo prima del punto, altrimenti finisce fra i paesi.
    // E' lo stesso difetto per cui oggi paeseDiRegione('GHA1_2') non trova
    // il Ghana: qui non si ripropone, perche' i codici li generiamo noi.
    const iso = codice.slice(0, 3).toUpperCase();
    if (/^[A-Z]{3}$/.test(iso)) per.set(iso, (per.get(iso) || 0) + 1);
    else scartati.set(codice.split('.')[0] || codice, (scartati.get(codice.split('.')[0] || codice) || 0) + 1);
  }
  return { per, scartati };
}

// --- decisione --------------------------------------------------------------

function decidi(iso, meta, ne) {
  const unitaNe = ne ? ne.get(iso) || 0 : 0;
  const ecc = ECCEZIONI[iso];
  let d;
  if (ecc) {
    const m = ecc.fonte === 'gb' ? meta[ecc.livello].get(iso) : null;
    d = { ...ecc, unita: ecc.fonte === 'gb' ? (m ? m.unita : null) : ecc.fonte === 'ne' ? unitaNe : null, deciso: 'a mano' };
  } else {
    // regola automatica: ADM1, che e' il livello 1 dichiarato dal paese stesso
    const m1 = meta.ADM1.get(iso);
    d = m1 && m1.unita
      ? { fonte: 'gb', livello: 'ADM1', unita: m1.unita, motivo: 'livello 1 dichiarato dalla fonte nazionale', deciso: 'automatico' }
      : { fonte: 'ne', livello: null, unita: unitaNe, motivo: 'assente da geoBoundaries a ogni livello', deciso: 'automatico' };
  }

  // Una sola suddivisione non e' una suddivisione: coincide con la nazione, che
  // e' gia' marcabile per conto suo. Meglio dichiararlo che avere una regione
  // fantasma sovrapposta al paese.
  if (d.fonte !== 'nessuna' && d.unita === 1) {
    return { fonte: 'nessuna', livello: null, unita: null, deciso: d.deciso,
      motivo: `l'unica suddivisione disponibile coincide con la nazione (${d.fonte === 'gb' ? 'geoBoundaries ' + d.livello : 'Natural Earth'})` };
  }
  // Un ripiego senza dati non e' un ripiego.
  if (d.fonte === 'ne' && !d.unita) {
    return { fonte: 'nessuna', livello: null, unita: null, deciso: d.deciso,
      motivo: 'assente sia da geoBoundaries sia da Natural Earth' };
  }
  return d;
}

// --- esecuzione -------------------------------------------------------------

(async () => {
  const precedenti = fs.existsSync(USCITA)
    ? Object.keys(JSON.parse(fs.readFileSync(USCITA, 'utf8')).paesi || {})
    : [];
  const meta = { ADM1: leggiMeta('ADM1'), ADM2: leggiMeta('ADM2'), ADM3: leggiMeta('ADM3') };
  const rif = await conteggiGadm();
  const gadm = rif ? rif.per : null;
  const ne = leggiNaturalEarth();
  if (!ne) console.warn('avviso: manca data_raw/regions_10m.geojson, i ripieghi non sono verificabili');

  // l'insieme dei paesi: quelli noti a geoBoundaries piu' quelli che avevamo
  // in GADM e che geoBoundaries non conosce (finiranno tutti sul ripiego)
  const paesi = new Set([...meta.ADM1.keys(), ...meta.ADM2.keys(), ...meta.ADM3.keys()]);
  // La tabella versionata e' anche il catalogo dei territori che non esistono
  // in geoBoundaries. Senza questo seme, una macchina nuova priva del grezzo
  // GADM perderebbe silenziosamente i ripieghi Natural Earth alla rigenerazione.
  for (const iso of precedenti) paesi.add(iso);
  if (gadm) for (const iso of gadm.keys()) paesi.add(iso);

  const tabella = {};
  const daGuardare = [];
  for (const iso of [...paesi].sort()) {
    const d = decidi(iso, meta, ne);
    const m = d.livello ? meta[d.livello].get(iso) : meta.ADM1.get(iso);
    tabella[iso] = {
      paese: (m && m.nome) || '',
      fonte: d.fonte,
      livello: d.livello,
      unita: d.unita ?? null,
      licenza: d.fonte === 'gb' && m ? m.licenza : d.fonte === 'ne' ? 'Public Domain (Natural Earth)' : null,
      dettaglioLicenza: d.fonte === 'gb' && m ? m.dettaglioLicenza : null,
      licenzaUrl: d.fonte === 'gb' && m ? m.licenzaUrl : null,
      fonteDati: d.fonte === 'gb' && m ? m.fonteDati : null,
      anno: d.fonte === 'gb' && m ? m.anno : null,
      geojson: d.fonte === 'gb' && m ? m.geojson : null,
      geojsonSemplificato: d.fonte === 'gb' && m ? m.geojsonSemplificato : null,
      deciso: d.deciso || 'a mano',
      motivo: d.motivo,
    };
    // segnala gli automatici che si discostano molto da GADM: non sono errori
    // per forza, ma sono i punti dove vale la pena guardare
    if (gadm && d.deciso === 'automatico' && d.fonte === 'gb' && gadm.has(iso)) {
      const r = d.unita / gadm.get(iso);
      if (r < TOLLERANZA[0] || r > TOLLERANZA[1]) {
        daGuardare.push({ iso, gadm: gadm.get(iso), gb: d.unita, rapporto: +r.toFixed(2),
          adm2: meta.ADM2.get(iso)?.unita || null, adm3: meta.ADM3.get(iso)?.unita || null });
      }
    }
  }

  const conta = (f) => Object.values(tabella).filter((v) => v.fonte === f).length;
  const unitaGb = Object.values(tabella).reduce((s, v) => s + (v.fonte === 'gb' ? v.unita || 0 : 0), 0);

  fs.writeFileSync(USCITA, JSON.stringify({
    generato: new Date().toISOString().slice(0, 10),
    fonti: {
      gb: 'geoBoundaries gbOpen — https://www.geoboundaries.org',
      ne: 'Natural Earth admin-1 — pubblico dominio',
    },
    nota: 'Generato da tools/genera_livelli.js. Le voci con deciso="a mano" vengono da ECCEZIONI in quello script: modificare li, non qui.',
    paesi: tabella,
  }, null, 1) + '\n', 'utf8');

  const neAMano = Object.values(tabella).filter((v) => v.fonte === 'ne' && v.deciso === 'a mano').length;
  console.log(`tabella scritta: ${path.relative(ROOT, USCITA)}`);
  console.log(`  paesi totali:          ${Object.keys(tabella).length}`);
  console.log(`  da geoBoundaries:      ${conta('gb')}  (${unitaGb} suddivisioni)`);
  console.log(`  ripiego Natural Earth: ${conta('ne')}  (${neAMano} per scelta, ${conta('ne') - neAMano} perche' assenti da geoBoundaries)`);
  console.log(`  senza suddivisioni:    ${conta('nessuna')}`);
  console.log(`  decisi a mano:         ${Object.values(tabella).filter((v) => v.deciso === 'a mano').length}`);

  // Il controllo che sarebbe servito prima: un ripiego automatico con molte
  // unita' e' quasi sempre una lista di comuni, non di regioni. Non lo si
  // corregge da soli - dipende dal paese - ma non deve passare in silenzio.
  const ripieghiSospetti = Object.entries(tabella)
    .filter(([, v]) => v.fonte === 'ne' && v.deciso === 'automatico' && (v.unita || 0) > 40);
  if (ripieghiSospetti.length) {
    console.log(`\n=== RIPIEGHI DA GUARDARE: ${ripieghiSospetti.length} ===`);
    ripieghiSospetti.forEach(([iso, v]) => console.log(`  ${iso}: Natural Earth ne ha ${v.unita}, probabile lista di comuni`));
    console.log('Se sono comuni e non regioni, la voce va messa in ECCEZIONI con fonte "nessuna".');
  }

  if (rif && rif.scartati.size) {
    const tot = [...rif.scartati.values()].reduce((s, n) => s + n, 0);
    console.log(`\n=== CODICI GADM SCARTATI: ${tot} suddivisioni sotto ${rif.scartati.size} codici non-ISO3 ===`);
    console.log([...rif.scartati].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}(${n})`).join(' '));
    console.log('Aree contese GADM (Z0n) e record guasti: usciti di proposito, vedi ESCLUSI.');
  }

  if (daGuardare.length) {
    console.log(`\n=== AUTOMATICI FUORI TOLLERANZA RISPETTO A GADM (${daGuardare.length}) ===`);
    console.log('iso   GADM   ADM1   ADM2   ADM3   rapporto');
    daGuardare.sort((a, b) => b.gadm - a.gadm).forEach((d) =>
      console.log(`${d.iso} ${String(d.gadm).padStart(6)} ${String(d.gb).padStart(6)} ` +
        `${String(d.adm2 ?? '-').padStart(6)} ${String(d.adm3 ?? '-').padStart(6)}   ${d.rapporto}`));
    console.log('\nNon sono errori per forza: spesso e\' GADM a essere vecchio.');
    console.log('Chi va deciso finisce in ECCEZIONI dentro tools/genera_livelli.js.');
  } else {
    console.log('\nNessun automatico fuori tolleranza.');
  }
})();
