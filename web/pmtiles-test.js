/*
 * Spike M0-B: prova che un archivio PMTiles su disco sia leggibile dalla
 * WebView Android attraverso il ponte Kotlin, e che MapLibre lo renderizzi.
 *
 * Ogni passo scrive l'esito nel riquadro in basso e in console, cosi' il
 * risultato e' leggibile sia guardando lo schermo sia da logcat.
 */

import * as maplibregl from './vendor/maplibre-gl.mjs';
import { AndroidBridgeSource, suAndroid, dimensioneFile, elencoFile } from './android-source.js';

const NOME = 'firenze.pmtiles';
const riquadro = document.getElementById('log');

function scrivi(testo, classe = '') {
  const riga = document.createElement('div');
  if (classe) riga.className = classe;
  riga.textContent = testo;
  riquadro.appendChild(riga);
  riquadro.scrollTop = riquadro.scrollHeight;
  const fn = classe === 'ko' ? console.error : console.log;
  fn(`[pmtiles-test] ${testo}`);
}

async function main() {
  scrivi(`ambiente: ${suAndroid ? 'WebView Android (ponte Kotlin)' : 'browser desktop (HTTP Range)'}`, 'info');
  scrivi(`user agent: ${navigator.userAgent}`);

  // --- 1. WebGL, che e' il prerequisito del globo -------------------------
  const gl = document.createElement('canvas').getContext('webgl2');
  if (gl) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'sconosciuto';
    scrivi(`WebGL2: disponibile — ${renderer}`, 'ok');
  } else {
    scrivi('WebGL2: NON disponibile: il globo non puo funzionare', 'ko');
  }

  // --- 2. il file c'e'? ----------------------------------------------------
  let source;
  if (suAndroid) {
    const elenco = elencoFile();
    scrivi(`PMTiles sul dispositivo: ${JSON.stringify(elenco)}`);
    const byte = dimensioneFile(NOME);
    if (byte <= 0) {
      scrivi(`${NOME} non trovato sul dispositivo`, 'ko');
      return;
    }
    scrivi(`${NOME}: ${(byte / 1048576).toFixed(2)} MB`, 'ok');
    source = new AndroidBridgeSource(NOME);
  } else {
    source = new pmtiles.FetchSource(`data/${NOME}`);
    scrivi(`sorgente HTTP: data/${NOME}`);
  }

  // --- 3. intestazione: e' la prima lettura a offset 0 ---------------------
  const archivio = new pmtiles.PMTiles(source);
  let header;
  try {
    header = await archivio.getHeader();
    scrivi(
      `intestazione letta: zoom ${header.minZoom}-${header.maxZoom}, ` +
        `centro ${header.centerLon.toFixed(3)},${header.centerLat.toFixed(3)}, ` +
        `tipo ${header.tileType}`,
      'ok'
    );
  } catch (e) {
    scrivi(`lettura intestazione FALLITA: ${e.message}`, 'ko');
    return;
  }

  // --- 4. la prova vera: letture a offset diversi dallo zero ---------------
  // E' qui che le Range request della WebView fallivano.
  let tileOk = 0;
  let tileKo = 0;
  const z = Math.min(header.maxZoom, header.minZoom + 4);
  const n = 2 ** z;
  const cx = Math.floor(((header.centerLon + 180) / 360) * n);
  const latRad = (header.centerLat * Math.PI) / 180;
  const cy = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) {
    try {
      const t = await archivio.getZxy(z, cx + dx, cy + dy);
      if (t && t.data && t.data.byteLength) {
        tileOk++;
      } else {
        // un tile vuoto e' legittimo: fuori dall'area coperta
        tileOk++;
      }
    } catch (e) {
      tileKo++;
      scrivi(`tile ${z}/${cx + dx}/${cy + dy} FALLITO: ${e.message}`, 'ko');
    }
  }
  scrivi(`letture di tile a offset sparsi: ${tileOk} riuscite, ${tileKo} fallite`, tileKo ? 'ko' : 'ok');
  if (suAndroid) scrivi(`statistiche ponte: ${JSON.stringify(source.statistiche())}`);

  if (tileKo > 0) {
    scrivi('CONCLUSIONE: il ponte non regge le letture sparse, va rivista la strategia', 'ko');
    return;
  }

  // --- 5. e ora attraverso MapLibre ---------------------------------------
  const protocol = new pmtiles.Protocol();
  protocol.add(archivio);
  maplibregl.addProtocol('pmtiles', protocol.tile);

  const map = new maplibregl.Map({
    container: 'map',
    center: [header.centerLon, header.centerLat],
    zoom: 12,
    attributionControl: { compact: true, customAttribution: 'OpenStreetMap · Protomaps' },
    style: {
      version: 8,
      sources: {
        prova: { type: 'vector', url: `pmtiles://${archivio.source.getKey()}`, attribution: 'Protomaps' },
      },
      layers: [
        { id: 'sfondo', type: 'background', paint: { 'background-color': '#eef1f3' } },
        {
          id: 'terra',
          type: 'fill',
          source: 'prova',
          'source-layer': 'earth',
          paint: { 'fill-color': '#ffffff' },
        },
        {
          id: 'acqua',
          type: 'fill',
          source: 'prova',
          'source-layer': 'water',
          paint: { 'fill-color': '#b9d4e6' },
        },
        {
          id: 'strade',
          type: 'line',
          source: 'prova',
          'source-layer': 'roads',
          paint: { 'line-color': '#7a7a7a', 'line-width': 0.8 },
        },
        {
          id: 'edifici',
          type: 'fill',
          source: 'prova',
          'source-layer': 'buildings',
          paint: { 'fill-color': '#d9d2c6' },
        },
      ],
    },
  });

  map.on('error', (e) => scrivi(`errore MapLibre: ${e?.error?.message || e}`, 'ko'));
  map.on('load', () => scrivi('stile caricato', 'ok'));
  map.on('idle', () => {
    const disegnati = map.queryRenderedFeatures().length;
    scrivi(
      disegnati > 0
        ? `RIUSCITO: MapLibre ha disegnato ${disegnati} geometrie dai PMTiles locali`
        : 'mappa ferma ma nessuna geometria disegnata: da indagare',
      disegnati > 0 ? 'ok' : 'ko'
    );
    if (suAndroid) scrivi(`statistiche ponte finali: ${JSON.stringify(source.statistiche())}`);
  });
}

main().catch((e) => {
  scrivi(`eccezione non gestita: ${e.message}`, 'ko');
  console.error(e);
});
