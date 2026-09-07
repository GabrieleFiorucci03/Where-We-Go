/*
 * Prepara il pacchetto dei dati derivati da pubblicare come Release.
 *
 * Perche' esiste: 82 delle 198 fonti regionali sono ODbL e 14 sono CC BY-SA.
 * Distribuire l'app su uno store e' uso pubblico del database derivato, e
 * l'ODbL (4.6) chiede in quel caso di rendere disponibile il database derivato
 * — o le alterazioni in forma macchina-leggibile — sotto la stessa licenza.
 * Il metodo e' gia' pubblico: sono gli script di questa cartella. Qui si
 * produce l'altra meta', cioe' i dati.
 *
 * Il pacchetto tiene **un file per paese**, che non e' un dettaglio di comodo:
 * cosi' nessuna geometria ODbL finisce nello stesso file di una CC BY-SA, e la
 * questione della compatibilita' fra le due licenze non si pone. Ogni file
 * dichiara al proprio interno la licenza della fonte da cui viene.
 *
 * Uso: node tools/pacchetto_odbl.js
 * Uscita: dist/dati-derivati/ (poi zippata e allegata alla Release)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TABELLA = path.join(__dirname, 'livelli_regioni.json');
const DATA = path.resolve(process.env.CONFINI_DATA_DIR || path.join(ROOT, 'web', 'data'));
const REGIONI = path.join(DATA, 'regions');
const NAZIONI = path.join(DATA, 'countries.geojson');
const TILE = path.join(DATA, 'boundaries.pmtiles');
const LICENZE = path.join(ROOT, 'docs', 'LICENZE_REGIONI.md');
const OUT = path.resolve(process.env.DERIVATI_OUT_DIR || path.join(ROOT, 'dist', 'dati-derivati'));

const SHARE_ALIKE = /Open Data Commons Open Database License|Attribution-ShareAlike/i;

/*
 * Le chiavi nazionali dell'app vengono da ADM0_A3 di Natural Earth e per tre
 * paesi non coincidono con boundaryISO di geoBoundaries: la stessa tabella sta
 * in prepara_regioni.js, ed e' la ragione per cui i file derivati si chiamano
 * PSX, SDS e KOS. Il manifest conserva entrambi i codici, cosi' il confronto
 * con l'originale resta possibile.
 */
const CODICI_APP = { PSE: 'PSX', SSD: 'SDS', XKX: 'KOS' };

const sha256 = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Le modifiche applicate alla fonte, elencate perche' ODbL e CC BY-SA le vogliono dichiarate. */
function modifiche(v) {
  const elenco = [
    `scelta del livello amministrativo: ${v.livello} (${v.motivo || 'livello dichiarato dalla fonte'})`,
    'correzione dei nomi con codifica guasta (mojibake)',
    'codici sintetici ISO3.slug al posto degli identificatori della fonte',
    'fusione delle suddivisioni omonime arrivate come feature separate',
    'riduzione geometrica per la resa a schermo e arrotondamento delle coordinate',
    'rimozione degli attributi non usati dall’app',
  ];
  if (v.fonte === 'ne') elenco[0] = 'ripiego su Natural Earth admin-1 (pubblico dominio)';
  return elenco;
}

function main() {
  const defaultOut = path.join(ROOT, 'dist', 'dati-derivati');
  const auditOut = path.join(ROOT, 'data_raw', 'confini-audit') + path.sep;
  if (OUT !== defaultOut && !(OUT.startsWith(auditOut) && path.basename(OUT) === 'dati-derivati')) {
    throw new Error('Output consentito solo in dist/dati-derivati o in una build confini-audit/dati-derivati');
  }
  if (fs.existsSync(OUT) && fs.realpathSync(OUT) !== OUT) {
    throw new Error('La cartella di output non puo essere un collegamento');
  }
  if (!fs.existsSync(REGIONI)) {
    throw new Error(`manca ${path.relative(ROOT, REGIONI)}: esegui prima tools/pipeline_confini.ps1`);
  }
  const { paesi, generato } = JSON.parse(fs.readFileSync(TABELLA, 'utf8'));

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'regioni'), { recursive: true });

  const voci = [];
  let saltati = 0;

  for (const [isoFonte, v] of Object.entries(paesi)) {
    if (v.fonte === 'nessuna') {
      saltati++;
      continue;
    }
    const iso = CODICI_APP[isoFonte] || isoFonte;
    const sorgente = path.join(REGIONI, `${iso}.geojson`);
    // Un paese dichiarato nella tabella ma senza file derivato sarebbe una
    // fonte distribuita e non divulgata: per 96 paesi su 198 e' un obbligo di
    // licenza, quindi qui si ferma tutto invece di saltare in silenzio.
    if (!fs.existsSync(sorgente)) {
      throw new Error(`${isoFonte}: manca ${path.relative(ROOT, sorgente)}, rigenera i dati derivati`);
    }

    // I membri estranei di una FeatureCollection sono leciti in GeoJSON (RFC
    // 7946 §6.1) e sono il posto giusto per la provenienza: chi apre il file
    // trova la licenza dentro il file, non in un allegato che si perde.
    const dati = JSON.parse(fs.readFileSync(sorgente, 'utf8'));
    // Il catalogo dell'app ora contiene centri Point. Il pacchetto pubblico
    // deve contenere le geometrie, non soltanto i punti dell'indice.
    dati.features = dati.features.map(f => f.mask
      ? JSON.parse(fs.readFileSync(path.join(DATA, 'region-shapes', `${f.properties.code}.geojson`), 'utf8'))
      : f);
    const licenza = v.dettaglioLicenza ? `${v.licenza} — ${v.dettaglioLicenza}` : v.licenza;
    dati.wherewego = {
      paese: v.paese,
      iso3: iso,
      iso3Fonte: isoFonte,
      fonte: v.fonte === 'gb' ? 'geoBoundaries gbOpen' : 'Natural Earth admin-1',
      livello: v.livello,
      anno: v.anno || null,
      licenzaFonte: licenza,
      licenzaUrl: v.licenzaUrl || null,
      fonteDati: v.fonteDati || null,
      originale: v.geojson || null,
      shareAlike: SHARE_ALIKE.test(licenza),
      modifiche: modifiche(v),
    };

    const destinazione = path.join(OUT, 'regioni', `${iso}.geojson`);
    fs.writeFileSync(destinazione, JSON.stringify(dati));
    voci.push({
      iso3: iso,
      iso3Fonte: isoFonte,
      paese: v.paese,
      file: `regioni/${iso}.geojson`,
      suddivisioni: dati.features.length,
      byte: fs.statSync(destinazione).size,
      sha256: sha256(destinazione),
      fonte: dati.wherewego.fonte,
      livello: v.livello,
      licenzaFonte: licenza,
      licenzaUrl: v.licenzaUrl || null,
      fonteDati: v.fonteDati || null,
      originale: v.geojson || null,
      shareAlike: dati.wherewego.shareAlike,
    });
  }

  // Separare i contorni nazionali derivati dalle regioni dai ripieghi NE:
  // anche l'unione regionale eredita la provenienza della fonte nazionale.
  const canonFile = path.join(DATA, 'canonical-report.json');
  const adopted = fs.existsSync(canonFile) ? JSON.parse(fs.readFileSync(canonFile, 'utf8')).adopted : {};
  const confiniDerivati = [];
  if (fs.existsSync(NAZIONI)) {
    const nazioni = JSON.parse(fs.readFileSync(NAZIONI, 'utf8'));
    const riferimento = [];
    for (const entry of nazioni.features) {
      const f = entry.mask
        ? JSON.parse(fs.readFileSync(path.join(DATA, 'country-shapes', `${entry.properties.code}.geojson`), 'utf8'))
        : entry;
      const iso = f.properties.code;
      if (!adopted[iso]) { riferimento.push(f); continue; }
      const voce = voci.find(v => v.iso3 === iso);
      if (!voce) throw new Error(`fonte del contorno ${iso} non disponibile`);
      const file = `confini-nazionali/${iso}.geojson`;
      fs.mkdirSync(path.join(OUT, 'confini-nazionali'), { recursive: true });
      fs.writeFileSync(path.join(OUT, file), JSON.stringify({ type:'FeatureCollection', features:[f], wherewego:{
        ...voce, modifiche:[...modifiche(paesi[voce.iso3Fonte]), 'unione delle regioni per ricavare il contorno nazionale'],
      }}));
      confiniDerivati.push({ ...voce, file, byte:fs.statSync(path.join(OUT,file)).size, sha256:sha256(path.join(OUT,file)) });
    }
    fs.writeFileSync(path.join(OUT, 'confini-nazionali.geojson'), JSON.stringify({type:'FeatureCollection',features:riferimento}));
  }
  fs.copyFileSync(LICENZE, path.join(OUT, 'LICENZE.md'));

  const shareAlike = voci.filter((r) => r.shareAlike);
  const suddivisioni = voci.reduce((n, r) => n + r.suddivisioni, 0);

  const manifest = {
    nome: 'Where We Go — dati derivati delle suddivisioni amministrative',
    versione: generato,
    generato: new Date().toISOString().slice(0, 10),
    licenza:
      'Ogni file conserva la licenza della propria fonte (campo licenzaFonte). ' +
      'I file derivati da fonti ODbL sono offerti sotto ODbL 1.0; quelli derivati ' +
      'da fonti CC BY-SA sotto la stessa CC BY-SA.',
    ricetta: 'https://github.com/GabrieleFiorucci03/Where-We-Go/tree/main/tools',
    script: [
      'tools/genera_livelli.js — sceglie la fonte e il livello, paese per paese',
      'tools/scarica_confini.js — scarica geoBoundaries ai commit fissati in livelli_regioni.json',
      'tools/prepara_regioni.js — normalizza nomi, codici e geometrie',
      'tools/prepara_confini.js — genera i tile PMTiles e le sagome dell’APK',
      'tools/pacchetto_odbl.js — costruisce questo pacchetto',
    ],
    conteggi: {
      paesi: voci.length,
      suddivisioni,
      shareAlike: shareAlike.length,
      senzaSuddivisioni: saltati,
    },
    tileDistribuiti: fs.existsSync(TILE)
      ? {
          file: 'boundaries.pmtiles',
          nota: 'Allegato alla Release come asset separato: è la forma effettivamente inclusa nell’app.',
          byte: fs.statSync(TILE).size,
          sha256: sha256(TILE),
        }
      : null,
    paesi: voci,
    confiniNazionaliDerivati: confiniDerivati,
  };
  fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 1), 'utf8');

  fs.writeFileSync(path.join(OUT, 'LEGGIMI.md'), leggimi(manifest), 'utf8');

  const byte = voci.reduce((n, r) => n + r.byte, 0);
  console.log(
    `${path.relative(ROOT, OUT)}: ${voci.length} paesi, ${suddivisioni} suddivisioni, ` +
      `${(byte / 1048576).toFixed(1)} MB, ${shareAlike.length} share-alike`
  );
}

function leggimi(m) {
  return `# Dati derivati di Where We Go — suddivisioni amministrative

Questo pacchetto è il **database derivato** usato dall'app [Where We Go](https://github.com/GabrieleFiorucci03/Where-We-Go).
Viene pubblicato per assolvere l'obbligo di ODbL 1.0 (§4.6) e delle licenze
CC BY-SA: chi usa pubblicamente un database derivato deve renderlo disponibile,
o renderne disponibili le alterazioni in forma macchina-leggibile, sotto la
stessa licenza. Il metodo — cioè gli script che lo producono — è pubblico nel
repository; qui ci sono i dati.

## Cosa c'è dentro

- \`regioni/<ISO3>.geojson\` — ${m.conteggi.paesi} file, uno per paese o territorio,
  ${m.conteggi.suddivisioni} suddivisioni in tutto. Ogni file dichiara al proprio interno,
  nel membro \`wherewego\`, la fonte, la licenza, l'URL dell'originale e l'elenco
  delle modifiche applicate.
- \`confini-nazionali.geojson\` — contorni mantenuti da Natural Earth, pubblico dominio.
- \`confini-nazionali/<ISO3>.geojson\` — ${m.confiniNazionaliDerivati.length} contorni ricavati
  dall'unione delle regioni; ciascuno dichiara la fonte e la licenza nel file.
- \`MANIFEST.json\` — l'elenco macchina-leggibile: per ogni paese fonte, livello,
  licenza, URL dell'originale, numero di suddivisioni, byte e SHA-256.
- \`LICENZE.md\` — la tabella completa delle licenze dichiarate, paese per paese.

## Licenze — un file per paese, e c'è un motivo

Le fonti nazionali aggregate da geoBoundaries **non hanno tutte la stessa
licenza**: ${m.conteggi.shareAlike} dei ${m.conteggi.paesi} paesi qui dentro vengono da fonti
share-alike (ODbL 1.0 o CC BY-SA), gli altri da fonti ad attribuzione semplice o
di pubblico dominio.

Tenere **un file per paese** significa che nessuna geometria ODbL viene fusa con
una CC BY-SA: ogni file resta un derivato di una sola fonte e ne eredita la
licenza, senza che le due si debbano rendere compatibili fra loro. La licenza di
ciascun file è nel campo \`wherewego.licenzaFonte\` e nel manifest.

I file derivati da fonti ODbL sono offerti sotto **ODbL 1.0**; quelli derivati da
fonti CC BY-SA sotto la **stessa CC BY-SA** dichiarata dalla fonte.

## Modifiche rispetto all'originale

Per ogni paese: scelta del livello amministrativo che corrisponde a una «regione»
di viaggio (non sempre ADM1 — le autorità statistiche nazionali non concordano su
cosa sia il livello 1), correzione dei nomi con codifica guasta, codici sintetici
\`ISO3.slug\`, fusione delle suddivisioni omonime arrivate spezzate, riduzione
geometrica per la resa a schermo, rimozione degli attributi inutilizzati.
L'elenco puntuale sta dentro ogni file.

**Le geometrie sono semplificate**: servono a disegnare una mappa a scala
mondiale, non a misurare confini. Per usi che richiedono precisione, partire
dalle fonti originali, i cui URL — fissati al commit di geoBoundaries usato — sono
nel manifest.

## Attribuzione

> Suddivisioni amministrative: geoBoundaries gbOpen (<https://www.geoboundaries.org>)
> e le fonti nazionali indicate in \`LICENZE.md\`, con le licenze lì dichiarate.
> Confini nazionali: Natural Earth e unioni regionali, con provenienza dichiarata nei file.
> Dati modificati come descritto in questo pacchetto.

## Come si rigenera

${m.script.map((s) => `- \`${s.split(' — ')[0]}\` — ${s.split(' — ')[1]}`).join('\n')}

Versione della tabella delle fonti: **${m.versione}** — pacchetto generato il ${m.generato}.
`;
}

main();
