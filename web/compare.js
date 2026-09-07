/*
 * Pagina di confronto: la stessa sagoma ritagliata con tutte le modalita' di
 * adattamento, affiancate. Serve a scegliere guardando invece che descrivendo.
 */

import { polygonsOf, clusterPolygons, renderFlagMask, FIT_MODES } from './flagmask.js';

/* Paesi scelti per coprire i casi limite:
 *  - IRL, PRT, CHL: sagoma stretta e alta, con "ritaglia" si vede una fascia
 *  - RUS, NOR, USA, JPN: sagoma che riempie male il proprio ingombro
 *  - ITA, FRA, ESP, DEU, GBR: i piu' guardati, devono restare belli
 *  - GRC, IDN: arcipelaghi
 *  - NPL, CHE: bandiere non rettangolari o quadrate
 */
const PAESI = [
  'IRL', 'PRT', 'CHL', 'NOR', 'RUS', 'USA', 'JPN', 'ITA',
  'FRA', 'ESP', 'DEU', 'GBR', 'GRC', 'IDN', 'NPL', 'CHE', 'ARG', 'SWE',
];

let lato = 150;
let proiezione = 'mercator';
let features = new Map();

async function main() {
  const res = await fetch('data/countries.geojson');
  const json = await res.json();
  for (const f of json.features) features.set(f.properties.code, f);
  await disegna();
}

async function disegna() {
  const t0 = performance.now();
  const tabella = document.getElementById('tabella');
  const stato = document.getElementById('stato');
  tabella.innerHTML = '';

  // intestazione
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  tr.appendChild(Object.assign(document.createElement('th'), { className: 'paese', textContent: 'Paese' }));
  for (const m of FIT_MODES) {
    const th = document.createElement('th');
    th.innerHTML = `${m.label}<small>${m.hint}</small>`;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  tabella.appendChild(thead);

  const tbody = document.createElement('tbody');
  tabella.appendChild(tbody);

  let generate = 0;
  for (const code of PAESI) {
    let feature = features.get(code);
    if (!feature) continue;
    if (feature.mask) {
      const res = await fetch(`data/country-shapes/${encodeURIComponent(code)}.geojson`);
      if (!res.ok) throw new Error(`Sagoma ${code}: HTTP ${res.status}`);
      feature = await res.json();
      features.set(code, feature);
    }

    const polys = polygonsOf(feature.geometry);
    const clusters = clusterPolygons(polys);
    if (!clusters.length) continue;
    // si mostra il blocco piu' grande: e' quello che si guarda sulla mappa
    let blocco = clusters[0];
    let areaMax = 0;
    for (const c of clusters) {
      const a = (c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1]);
      if (a > areaMax) { areaMax = a; blocco = c; }
    }

    const riga = document.createElement('tr');
    const intestazione = document.createElement('td');
    intestazione.className = 'paese';
    intestazione.innerHTML =
      `<b>${feature.properties.name}</b><span>${code} · ${clusters.length} blocc${clusters.length === 1 ? 'o' : 'hi'}</span>`;
    riga.appendChild(intestazione);

    for (const m of FIT_MODES) {
      const td = document.createElement('td');
      try {
        const r = await renderFlagMask(blocco.polys, blocco.bbox, feature.properties.iso2, {
          proiezione,
          fit: m.id,
          lato: 512,
        });
        if (r) {
          const c = document.createElement('canvas');
          const scala = lato / Math.max(r.canvas.width, r.canvas.height);
          c.width = Math.max(1, Math.round(r.canvas.width * scala));
          c.height = Math.max(1, Math.round(r.canvas.height * scala));
          c.getContext('2d').drawImage(r.canvas, 0, 0, c.width, c.height);
          td.appendChild(c);
          generate++;
        } else {
          td.textContent = '—';
        }
      } catch (e) {
        td.textContent = 'errore';
        td.title = e.message;
      }
      riga.appendChild(td);
    }
    tbody.appendChild(riga);
  }

  stato.textContent =
    `${generate} immagini generate in ${Math.round(performance.now() - t0)} ms · maschera: ${proiezione}`;
}

for (const radio of document.querySelectorAll('input[name=proj]')) {
  radio.addEventListener('change', (e) => {
    if (!e.target.checked) return;
    proiezione = e.target.value;
    disegna();
  });
}

document.getElementById('size').addEventListener('change', (e) => {
  lato = Number(e.target.value);
  disegna();
});

main().catch((e) => {
  console.error(e);
  document.getElementById('stato').textContent = `Errore: ${e.message}`;
});
