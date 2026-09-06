/*
 * Scarica le suddivisioni amministrative, un file per paese.
 *
 * Legge tools/livelli_regioni.json e per ogni paese con fonte "gb" prende il
 * GeoJSON all'URL che la tabella porta gia' con se'. I paesi con fonte "ne"
 * non si scaricano: Natural Earth e' un file solo, gia' in data_raw. Quelli
 * con fonte "nessuna" non hanno suddivisioni per scelta.
 *
 * PERCHE' NON IL COMPOSITO GLOBALE
 *
 * geoBoundaries pubblica anche CGAZ, un unico file da 344 MB con tutto il
 * mondo. Non serve, anzi non funziona: e' a livello fisso, quindi per l'Italia
 * conterrebbe le 5 ripartizioni ISTAT invece delle 20 regioni. Il livello
 * giusto cambia da paese a paese (vedi tools/genera_livelli.js), e prendere
 * ognuno al suo livello vuol dire prenderli uno per uno.
 *
 * GLI URL SONO FISSATI A UN COMMIT
 *
 * I gjDownloadURL dei metadati puntano a un commit preciso del repository di
 * geoBoundaries, non a "main". Rilanciando fra un anno si riscarica lo stesso
 * dato, non quello che nel frattempo e' cambiato: e' la stessa ragione per cui
 * la tabella e' versionata e i dati no.
 *
 * Uso:  node tools/scarica_confini.js [--forza]
 *
 *   --forza   riscarica anche i file gia' presenti e validi
 *
 * Scrive: data_raw/geoboundaries/<ISO>-<LIVELLO>.geojson
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TABELLA = path.join(__dirname, 'livelli_regioni.json');
const USCITA = path.join(ROOT, 'data_raw', 'geoboundaries');

const FORZA = process.argv.includes('--forza');

/** Quante richieste insieme. Sei e' gentile con GitHub e comunque veloce. */
const PARALLELE = 6;
/** Tentativi per file prima di arrendersi. */
const TENTATIVI = 3;

/**
 * Conta le occorrenze di una sequenza nei byte di un file, senza mai
 * costruirne la stringa.
 *
 * Serve perche' il Canada a piena risoluzione e' un file da 618 MB, e Node non
 * sa fare stringhe oltre i ~512 MB: `JSON.parse(readFileSync(f,'utf8'))` muore
 * con ERR_STRING_TOO_LONG su un file perfettamente integro. Un controllo che
 * bocciava il Canada perche' e' grande sarebbe stato peggio che non averlo.
 */
function contaNeiByte(file, sequenza) {
  const ago = Buffer.from(sequenza);
  const fd = fs.openSync(file, 'r');
  const DIM = 1 << 22;
  const buf = Buffer.alloc(DIM + ago.length);
  let pos = 0, coda = 0, n = 0;
  try {
    for (;;) {
      const letti = fs.readSync(fd, buf, coda, DIM, pos);
      if (letti <= 0) break;
      pos += letti;
      const fine = coda + letti;
      for (let i = 0; ;) {
        const j = buf.indexOf(ago, i);
        if (j < 0 || j + ago.length > fine) break;
        n++; i = j + 1;
      }
      // si riporta in testa la coda che potrebbe contenere un ago spezzato
      // a cavallo fra due blocchi
      coda = Math.min(ago.length - 1, fine);
      buf.copy(buf, 0, fine - coda, fine);
    }
  } finally {
    fs.closeSync(fd);
  }
  return n;
}

/** Oltre questa dimensione si conta sui byte invece di parsare. */
const SOGLIA_PARSE = 400 * 1024 * 1024;

/**
 * Paesi dove il file NON contiene il numero di unita' che i metadati
 * dichiarano, e dove ha ragione il file.
 *
 * L'`admUnitCount` dell'API geoBoundaries e' un campo dei metadati, compilato a
 * parte: dove le due cose divergono, quella scaricata e' la geometria, quindi
 * e' il file a fare fede. Sono registrati qui uno per uno perche' un avviso che
 * ricompare a ogni esecuzione senza mai cambiare smette di essere letto, e il
 * giorno che ne compare uno nuovo non lo si nota.
 *
 * Per tutti e cinque Natural Earth e' stato guardato e non e' migliore:
 * sull'Ungheria ha 43 unita' (province piu' citta' contate a parte), sulla
 * Namibia gli stessi nomi pre-2013, sul Kosovo nessun dato.
 */
const CONTEGGI_VERI = {
  HUN: { unita: 19, perche: 'le 19 province; Budapest, che porterebbe a 20, non e\' nel file' },
  IRN: { unita: 32, perche: 'i metadati ne dichiarano 33; Natural Earth ne ha 31, che e\' il numero delle province' },
  NAM: { unita: 13, perche: 'confini pre-2013, con Caprivi e Kavango non ancora rinominate e divise; Natural Earth e\' fermo agli stessi' },
  TKM: { unita: 5, perche: 'le 5 province; la citta\' di Ashgabat, che porterebbe a 6, non e\' nel file' },
  XKX: { unita: 7, perche: 'i 7 distretti; i metadati contano i 48 comuni, che sono un altro livello' },
};

/**
 * Un file scaricato vale solo se contiene il numero di suddivisioni che la
 * tabella dichiara.
 *
 * Un download troncato produce JSON invalido e si nota subito; ma un file
 * valido con il numero sbagliato di poligoni no, e sarebbe il difetto peggiore:
 * silenzioso, e scoperto solo guardando la mappa mesi dopo.
 */
function verifica(file, atteseUnita, iso) {
  const noto = CONTEGGI_VERI[iso];
  if (noto) atteseUnita = noto.unita;
  let n;
  if (fs.statSync(file).size > SOGLIA_PARSE) {
    n = contaNeiByte(file, '"shapeType"');
  } else {
    try {
      n = (JSON.parse(fs.readFileSync(file, 'utf8')).features || []).length;
    } catch (e) {
      return { ok: false, perche: 'JSON illeggibile' };
    }
  }
  if (!n) return { ok: false, perche: 'nessuna feature' };
  if (atteseUnita && n !== atteseUnita) {
    return { ok: false, perche: `${n} unita' invece delle ${atteseUnita} dichiarate` };
  }
  return { ok: true, unita: n };
}

async function scarica(url, destinazione) {
  let ultimo;
  for (let t = 1; t <= TENTATIVI; t++) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) throw new Error('risposta vuota');
      fs.writeFileSync(destinazione, buf);
      return buf.length;
    } catch (e) {
      ultimo = e;
      // attesa crescente: 1s, 2s. Non e' un ciclo di ritentativi cieco, sono
      // tre colpi e poi il file finisce fra i falliti, che vengono elencati.
      if (t < TENTATIVI) await new Promise((ok) => setTimeout(ok, t * 1000));
    }
  }
  throw ultimo;
}

(async () => {
  if (!fs.existsSync(TABELLA)) {
    throw new Error('manca tools/livelli_regioni.json: lancia prima node tools/genera_livelli.js');
  }
  const { paesi } = JSON.parse(fs.readFileSync(TABELLA, 'utf8'));
  fs.mkdirSync(USCITA, { recursive: true });

  const lavori = [];
  for (const [iso, v] of Object.entries(paesi)) {
    if (v.fonte !== 'gb') continue;
    if (!v.geojson) {
      console.warn(`  ${iso}: fonte "gb" ma nessun URL in tabella, saltato`);
      continue;
    }
    lavori.push({ iso, livello: v.livello, unita: v.unita, url: v.geojson,
      file: path.join(USCITA, `${iso}-${v.livello}.geojson`) });
  }

  console.log(`da prendere: ${lavori.length} paesi da geoBoundaries`);
  const altri = Object.values(paesi).filter((v) => v.fonte !== 'gb');
  console.log(`(${altri.filter((v) => v.fonte === 'ne').length} da Natural Earth, gia' in data_raw; ` +
    `${altri.filter((v) => v.fonte === 'nessuna').length} senza suddivisioni)\n`);

  let saltati = 0, presi = 0, byte = 0;
  const falliti = [], sospetti = [];
  let prossimo = 0;

  async function operaio() {
    while (prossimo < lavori.length) {
      const l = lavori[prossimo++];
      // gia' presente e valido: non si riscarica
      if (!FORZA && fs.existsSync(l.file)) {
        const v = verifica(l.file, l.unita, l.iso);
        if (v.ok) { saltati++; continue; }
      }
      try {
        const n = await scarica(l.url, l.file);
        const v = verifica(l.file, l.unita, l.iso);
        if (!v.ok) {
          sospetti.push(`${l.iso} ${l.livello}: ${v.perche}`);
        } else {
          presi++; byte += n;
        }
      } catch (e) {
        falliti.push(`${l.iso} ${l.livello}: ${e.message}`);
      }
      const fatti = saltati + presi + falliti.length + sospetti.length;
      if (fatti % 25 === 0) console.log(`  ${fatti}/${lavori.length}...`);
    }
  }

  const inizio = Date.now();
  await Promise.all(Array.from({ length: PARALLELE }, operaio));
  const durata = ((Date.now() - inizio) / 1000).toFixed(0);

  console.log(`\n=== FATTO in ${durata}s ===`);
  console.log(`  scaricati:  ${presi}  (${(byte / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`  gia' presenti e validi: ${saltati}`);

  if (sospetti.length) {
    console.log(`\n=== CONTEGGIO NON CORRISPONDENTE: ${sospetti.length} ===`);
    sospetti.forEach((s) => console.log('  ' + s));
    console.log('Il file c\'e\' ma non contiene cio\' che la tabella dichiara.');
    console.log('Puo\' voler dire che geoBoundaries ha aggiornato il paese: va guardato.');
  }
  if (falliti.length) {
    console.log(`\n=== NON SCARICATI: ${falliti.length} ===`);
    falliti.forEach((f) => console.log('  ' + f));
    console.log('Rilancia lo script: riprende solo questi.');
  }
  if (!sospetti.length && !falliti.length) {
    console.log('\nTutti i paesi presenti e col numero di unita\' dichiarato.');
  }
  process.exitCode = falliti.length || sospetti.length ? 1 : 0;
})();
