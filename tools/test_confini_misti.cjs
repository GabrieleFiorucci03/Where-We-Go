// Stessa copertura sullo schermo nelle quattro combinazioni di due vicini.
// Colori diagnostici e antialias disattivato distinguono un buco geometrico
// dalle linee interne e dall'antialias del bordo di una regione.
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

module.exports = async function mixedModes(page, out) {
  await page.evaluate(() => {
    window.ripristinaDaApp(JSON.stringify({versione:2,stato:{countries:{},regions:{},places:{},regioniAttive:[]}}));
    const m = __confini.map;
    for (const layer of m.getStyle().layers) {
      if (!['ocean','countries-fill','regions-fill'].includes(layer.id)) m.setLayoutProperty(layer.id,'visibility','none');
    }
    m.setPaintProperty('ocean','background-color','#000000');
    for (const id of ['countries-fill','regions-fill']) {
      m.setPaintProperty(id,'fill-color','#ffffff');
      m.setPaintProperty(id,'fill-antialias',false);
      m.setPaintProperty(id,'fill-opacity-transition',{duration:0});
    }
  });
  const cases = [
    {name:'italia-austria',codes:['ITA','AUT'],center:[11.2,46.95]},
    {name:'italia-francia',codes:['ITA','FRA'],center:[6.85,45.1]},
    {name:'svizzera-austria',codes:['CHE','AUT'],center:[9.6,47.1]},
    {name:'costa-italia-francia',codes:['ITA','FRA'],center:[7.53,43.79]},
  ];
  const results = [];
  for (const view of cases) for (const zoom of [4.24,4.26,6,8,9,10,12]) {
    let baseline;
    for (const active of [[],[view.codes[0]],[view.codes[1]],view.codes]) {
      await page.evaluate(async ({view,zoom,active}) => {
        for (const code of ['ITA','AUT','CHE','FRA']) __confini.disattivaRegioni(code);
        for (const code of active) await __confini.attivaRegioni(code);
        __confini.map.jumpTo({center:view.center,zoom});
        await new Promise(resolve=>__confini.map.once('idle',resolve));
      }, {view,zoom,active});
      const buffer = await page.locator('canvas.maplibregl-canvas').screenshot();
      const png = PNG.sync.read(buffer);
      if (!baseline) baseline = png;
      let lost = 0, gained = 0;
      for (let i=0; i<png.data.length; i+=4) {
        const before = baseline.data[i] > 127, after = png.data[i] > 127;
        if (before && !after) lost++;
        if (!before && after) gained++;
      }
      results.push({view:view.name,zoom,active,lostPixels:lost,gainedPixels:gained});
      if (lost || gained || (zoom===9 && active.length===1)) {
        fs.writeFileSync(path.join(out,`mixed-${view.name}-${zoom}-${active.join('-')||'off'}.png`),buffer);
      }
    }
  }
  fs.writeFileSync(path.join(out,'mixed-modes.json'),JSON.stringify(results,null,2));
  // Quantizzazione/rasterizzazione possono cambiare un pixel isolato al
  // vertice; una striscia lungo un confine non rientra in questa tolleranza.
  const failures = results.filter(r=>r.lostPixels+r.gainedPixels>8);
  assert.deepEqual(failures, [], 'La copertura cambia accendendo le regioni');
  console.log(`Modalita miste: ${results.length} confronti, massimo ${Math.max(...results.map(r=>r.lostPixels+r.gainedPixels))} pixel diversi`);
  return results;
};
