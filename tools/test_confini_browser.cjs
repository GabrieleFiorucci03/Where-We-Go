// Collaudo del rendering reale MapLibre in un contesto browser isolato.
// NODE_PATH puo' puntare al runtime Playwright fornito dall'ambiente.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const label = process.argv[2] || 'current';
const data = path.resolve(process.argv[3] || 'web/data');
const out = path.join(root, 'data_raw/confini-audit', label);
fs.mkdirSync(out, { recursive: true });
const views = [
  {name:'alpi', center:[11.2,46.9]}, {name:'costa', center:[10.3,43.5]},
  {name:'isole', center:[12.0,36.8]}, {name:'filippine', center:[120.5,12.3]},
  {name:'oltremare', center:[-53.1,4.2]}, {name:'kashmir', center:[75,35]},
  {name:'giappone', center:[139.783,35.550]}, {name:'cuba', center:[-82.35,23.13]},
];
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport:{width:1000,height:760}, deviceScaleFactor:1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/app.js', async route => {
    const source = fs.readFileSync(path.join(root,'web/app.js'),'utf8');
    await route.fulfill({contentType:'text/javascript', body:source +
      '\nwindow.__confini = {get map(){return map}, get store(){return store}, get flags(){return activeFlags}, refreshOpacity, attivaRegioni, disattivaRegioni, sagoma};'});
  });
  // Sostituisce solo le risorse dati. Gli archivi supportano le Range request.
  await page.route('**/data/**', async route => {
    const rel = new URL(route.request().url()).pathname.split('/data/')[1];
    const filename = path.resolve(data,rel);
    if (!filename.startsWith(data + path.sep) || !fs.existsSync(filename)) return route.continue();
    const size=fs.statSync(filename).size, range=route.request().headers().range;
    if (range) {
      const [,a,b] = /bytes=(\d+)-(\d*)/.exec(range);
      const start=Number(a), end=Math.min(b?Number(b):size-1,size-1);
      const body=Buffer.alloc(end-start+1), fd=fs.openSync(filename,'r');
      try { fs.readSync(fd,body,0,body.length,start); } finally { fs.closeSync(fd); }
      return route.fulfill({status:206,headers:{'content-range':`bytes ${start}-${end}/${size}`},body});
    }
    return route.fulfill({path:filename});
  });
  await page.goto('http://localhost:8080');
  await page.waitForFunction(()=>window.__confini?.map?.isStyleLoaded(), null, {timeout:90000});
  await page.addStyleTag({content:'#hud,#toast {display:none!important}'});
  if (process.env.CONFINI_MIXED_ONLY) {
    try { await require('./test_confini_misti.cjs')(page,out); }
    finally { await browser.close(); }
    return;
  }
  const invariants = await page.evaluate(()=>({min:__confini.map.getMinZoom(),max:__confini.map.getMaxZoom()}));
  assert.deepEqual(invariants,{min:0.5,max:12});
  await page.evaluate(()=>{window.__mapErrors=[];__confini.map.on('error',e=>__mapErrors.push(String(e.error)));});
  for (const iso of ['ITA','AUT','CHE','FRA','PHL','IND','PAK','CHN','JPN','CUB']) await page.evaluate(iso=>window.regioniDaApp(iso,true),iso);
  const captures=[];
  for (const view of views.filter(v=>!process.env.CONFINI_VIEWS || process.env.CONFINI_VIEWS.split(',').includes(v.name))) {
    for (const z of [4,4.24,4.26,6,8,9,10,12]) {
      const start=Date.now();
      await page.evaluate(({center,z})=>__confini.map.jumpTo({center,zoom:z}),{center:view.center,z});
      await page.waitForFunction(()=>__confini.map.areTilesLoaded(),null,{timeout:60000});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      captures.push({view:view.name,z,settleMs:Date.now()-start,...await page.evaluate(()=>({
        countries:__confini.map.queryRenderedFeatures({layers:['countries-fill']}).length,
        regions:__confini.map.queryRenderedFeatures({layers:['regions-fill']}).length,
      }))});
      if ([6,12].includes(z)) await page.screenshot({path:path.join(out,`${view.name}-${z}.png`)});
    }
  }
  // Tocco reale alla soglia: stessi pixel, prima paese poi regione.
  const empty = {versione:2,stato:{countries:{},regions:{},places:{},regioniAttive:['ITA']}};
  for(const z of [4.24,4.26]){
    await page.evaluate(({empty,z})=>{window.ripristinaDaApp(JSON.stringify(empty));__confini.map.jumpTo({center:[11,43],zoom:z});},{empty,z});
    await page.waitForFunction(()=>__confini.map.areTilesLoaded());
    await page.mouse.click(500,380);
    await page.waitForFunction(()=>Object.keys(__confini.store.countries).length+Object.keys(__confini.store.regions).length>0);
    const selected=await page.evaluate(()=>structuredClone(__confini.store));
    if(z<4.25)assert.equal(selected.countries.ITA,'visited');
    else assert.equal(selected.regions['ITA.toscana'],'visited');
  }
  await page.evaluate(()=>{
    window.regioniDaApp('ITA',true);
    window.impostaDaApp('regions','ITA.toscana','visited');
    __confini.map.jumpTo({center:[10.3,43.5],zoom:9});
  });
  await page.waitForFunction(()=>__confini.flags.has('regions:ITA.toscana'),null,{timeout:30000});
  await page.screenshot({path:path.join(out,'bandiera-toscana-9.png')});
  const saved = await page.evaluate(()=>JSON.parse(window.statoDaApp()));
  await page.evaluate(()=>window.impostaDaApp('regions','ITA.toscana','wanted'));
  await page.evaluate(saved=>window.ripristinaDaApp(JSON.stringify(saved)),saved);
  assert.equal(await page.evaluate(()=>__confini.store.regions['ITA.toscana']),'visited');
  // Le bandiere nazionali devono leggere la stessa unione usata dai tile.
  const countryMask = await page.evaluate(async()=>{
    const f=await __confini.sagoma('countries','ITA');
    return {code:f.properties.code,type:f.geometry.type};
  });
  assert.equal(countryMask.code,'ITA');
  assert(['Polygon','MultiPolygon'].includes(countryMask.type));
  await require('./test_confini_misti.cjs')(page,out);
  const mapErrors=await page.evaluate(()=>window.__mapErrors);
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({invariants,captures,errors,mapErrors,backupRoundTrip:true,touchThreshold:true},null,2));
  assert.deepEqual(errors,[]);
  assert.deepEqual(mapErrors,[]);
  console.log(`${label}: ${captures.length} inquadrature, zoom e backup verificati`);
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
