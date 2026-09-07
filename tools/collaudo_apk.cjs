// Collaudo dell'APK installato su telefono o emulatore.
//
// Playwright non si attacca a una WebView Android; il protocollo DevTools si',
// a mano, e non serve altro che Node: la WebView lo espone perche'
// MainActivity chiama setWebContentsDebuggingEnabled (che in release andra'
// condizionato a BuildConfig.DEBUG, vedi §14.3 del piano).
//
// Uso:
//   adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
//   node tools/collaudo_apk.cjs data_raw/confini-audit/collaudo-apk [serial]
//
// Il <pid> si trova con:
//   adb shell "cat /proc/net/unix | grep webview_devtools"
//
// Verifica tre cose che il test in browser non puo' vedere: che le sagome
// arrivino davvero dagli asset dell'APK, quanto costano sul dispositivo vero e
// che i seam fra riempimenti adiacenti si chiudano sullo schermo.

const fs = require('fs');
const { execFileSync } = require('child_process');

const out = process.argv[2] || 'data_raw/confini-audit/collaudo-apk';
const serial = process.argv[3] || 'emulator-5556';
const adb = (process.env.ANDROID_HOME || process.env.USERPROFILE + '\\Android\\Sdk') + '\\platform-tools\\adb.exe';
fs.mkdirSync(out, { recursive: true });

// Un caso per rischio, non un campione a caso.
const casi = [
  ['ITA', 'paese che resta su Natural Earth'],
  ['JPN', 'paese canonizzato dall unione delle regioni'],
  ['ITA.toscana', 'regione: la sagoma sta in un file suo'],
  ['ITA.sicilia', 'regione insulare: il caso peggiore della baseline'],
  ['JPN.hokkaido', 'regione di un paese canonizzato'],
  ['CAN.nunavut', 'la sagoma piu grande, 12 MB e 18.833 poligoni'],
];

// Inquadrature scelte dove due riempimenti si toccano: e' li' che un seam si
// vedrebbe. Il globo serve a controllare che a scala mondiale non si aprano
// buchi nelle maschere.
const viste = [
  ['seam-toscana-umbria-z9', 43.15, 12.05, 9, 'seam fra due regioni, allo zoom di progetto'],
  ['seam-toscana-umbria-z12', 43.15, 12.05, 12, 'stesso seam, oltre il dettaglio dei tile'],
  ['seam-brennero-z12', 47.005, 11.507, 12, 'seam internazionale: fonti diverse'],
  ['seam-italia-svizzera-z10', 46.17, 8.79, 10, 'confine alpino'],
  ['sicilia-z6', 38.1, 13.3, 6, 'isole minori: sparivano con la vecchia semplificazione'],
  ['globo-z1', 42.0, 12.0, 1, 'scala globale'],
];

async function apriWebView() {
  const lista = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const target = lista.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!target) throw new Error('pagina non trovata: la WebView e in esecuzione e la porta e inoltrata?');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0;
  const attesa = new Map();
  const errori = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && attesa.has(m.id)) { attesa.get(m.id)(m); attesa.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errori.push('eccezione: ' + (d.exception?.description || d.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errori.push('console: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  };
  const invia = (method, params = {}) => new Promise((ok) => {
    const n = ++id; attesa.set(n, ok); ws.send(JSON.stringify({ id: n, method, params }));
  });
  await invia('Runtime.enable');
  const valuta = async (expr) => {
    const r = await invia('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description || 'errore JS');
    }
    return r.result.result.value;
  };
  return { ws, valuta, errori };
}

(async () => {
  const { ws, valuta, errori } = await apriWebView();
  const rapporto = { dispositivo: serial, casi: {}, errori };

  for (const [code, nota] of casi) {
    // Prima il costo grezzo del file, poi il costo totale della maschera: senza
    // separarli non si sa se a pesare e' il formato a un file per regione o la
    // rasterizzazione della geometria.
    const io = await valuta(`
      const t0 = performance.now();
      const res = await fetch('data/region-shapes/${code}.geojson');
      if (!res.ok) return null;
      const testo = await res.text(); const t1 = performance.now();
      JSON.parse(testo); const t2 = performance.now();
      return { kb: Math.round(testo.length / 1024), letturaMs: Math.round(t1 - t0), parseMs: Math.round(t2 - t1) };`);
    const t0 = Date.now();
    let d;
    try { d = await valuta(`return await window.diag(${JSON.stringify(code)});`); }
    catch (e) { d = { errore: e.message }; }
    rapporto.casi[code] = {
      nota, errore: d.errore || null, geometria: d.geometria, poligoni: d.poligoni,
      poligoniScoperti: d.poligoniScoperti, svgRasterOk: d.svgRasterOk,
      mascherePrudotte: Array.isArray(d.maschere) ? d.maschere.length : d.maschere,
      maschereNulle: Array.isArray(d.maschere) ? d.maschere.filter((m) => m === 'null').length : null,
      file: io, totaleMs: Date.now() - t0,
    };
    console.log(`${code.padEnd(14)} ${String(rapporto.casi[code].totaleMs).padStart(6)} ms  ${JSON.stringify(io)}`);
  }

  await valuta(`
    window.regioniDaApp('ITA', true);
    window.impostaDaApp('regions', 'ITA.toscana', 'visited');
    window.impostaDaApp('regions', 'ITA.umbria', 'wanted');
    window.impostaDaApp('regions', 'ITA.sicilia', 'visited');
    window.impostaDaApp('countries', 'AUT', 'wanted');
    window.impostaDaApp('countries', 'CHE', 'visited');
    return true;`);

  for (const [nome, lat, lon, z, nota] of viste) {
    await valuta(`window.volaDaApp(${lat}, ${lon}, ${z}); return true;`);
    // I tile arrivano dal ponte Kotlin: l'attesa e' generosa di proposito,
    // meglio una cattura lenta che una cattura di una mappa a meta'.
    await new Promise((r) => setTimeout(r, 7000));
    const png = execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(`${out}/${nome}.png`, png);
    console.log(`${nome}: ${(png.length / 1024).toFixed(0)} KB — ${nota}`);
  }

  const salvato = await valuta('return window.statoDaApp();');
  const stato = JSON.parse(salvato).stato;
  rapporto.backup = {
    toscana: stato.regions?.['ITA.toscana'], umbria: stato.regions?.['ITA.umbria'],
    austria: stato.countries?.AUT,
    ripristino: await valuta(`return window.ripristinaDaApp(${JSON.stringify(salvato)});`),
  };
  fs.writeFileSync(`${out}/collaudo.json`, JSON.stringify(rapporto, null, 2));
  console.log('\nbackup:', JSON.stringify(rapporto.backup));
  console.log('errori:', errori.length ? errori : 'nessuno');
  ws.close();
})().catch((e) => { console.error('FALLITO:', e.message || e); process.exit(1); });
