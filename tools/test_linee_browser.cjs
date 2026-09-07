const fs=require('fs'), path=require('path'), assert=require('node:assert/strict');
const {PNG}=require('pngjs');
module.exports=async(page,out,probesFile,old)=>{
  const probes=JSON.parse(fs.readFileSync(probesFile,'utf8'));
  assert.equal(await page.evaluate(()=>__confini.map.getLayer('countries-line').source),old?'boundaries':'border-lines');
  const initial=await page.evaluate(()=>__confini.map.getStyle().layers);
  await page.evaluate(()=>{
    window.ripristinaDaApp(JSON.stringify({versione:2,stato:{countries:{},regions:{},places:{},regioniAttive:[]}}));
    const m=__confini.map;
    for(const layer of m.getStyle().layers)
      if(!['ocean','countries-line','regions-line'].includes(layer.id))m.setLayoutProperty(layer.id,'visibility','none');
    m.setPaintProperty('ocean','background-color','#fff');
    for(const id of ['countries-line','regions-line'])m.setPaintProperty(id,'line-color','#000');
  });
  const records=[];
  for(const probe of probes)for(const active of [[],[probe.countries[0]],[probe.countries[1]],probe.countries]){
    await page.evaluate(async({all,active})=>{
      for(const c of all)__confini.disattivaRegioni(c);
      for(const c of active)await __confini.attivaRegioni(c);
    },{all:[...new Set(probes.flatMap(p=>p.countries))],active});
    for(const target of ['obsolete','retained']){
      const rendered=await page.evaluate(async point=>{
        const m=__confini.map;m.jumpTo({center:point,zoom:10});
        await new Promise(r=>m.once('idle',r));
        const p=m.project(point);
        return {country:m.queryRenderedFeatures(p,{layers:['countries-line']}).length,
          region:m.queryRenderedFeatures(p,{layers:['regions-line']}).length};
      },probe[target]);
      const buffer=await page.locator('canvas.maplibregl-canvas').screenshot();
      const png=PNG.sync.read(buffer);
      let darkest=255;
      // I segmenti GeoJSON sono rettilinei in lon/lat, i tile in Mercatore:
      // sulle lunghe diagonali il punto interpolato puo discostarsi dal
      // segmento proiettato. Il raggio resta inferiore alla separazione
      // misurata tra i due bordi in tutti i campioni.
      const cx=Math.floor(png.width/2),cy=Math.floor(png.height/2);
      for(let y=cy-20;y<=cy+20;y++)for(let x=cx-20;x<=cx+20;x++)darkest=Math.min(darkest,png.data[(y*png.width+x)*4]);
      const line=darkest<180;
      records.push({countries:probe.countries,active,target,line,darkest,hits:rendered,point:probe[target]});
      if(active.length===2)fs.writeFileSync(path.join(out,`${probe.countries.join('-')}-${target}.png`),buffer);
    }
  }
  fs.writeFileSync(path.join(out,'lines.json'),JSON.stringify(records,null,2));
  if(old) assert(records.filter(r=>r.target==='obsolete'&&r.hits.country+r.hits.region>=2).length>=4,'La baseline non riproduce i doppioni');
  else {
    assert.deepEqual(records.filter(r=>r.target==='obsolete'&&r.hits.country+r.hits.region>1),[],'Doppie linee ancora visibili');
    assert.deepEqual(records.filter(r=>r.target==='retained'&&!r.line),[],'Confini validi scomparsi');
    await page.evaluate(initial=>{
      const m=__confini.map;
      for(const layer of initial)m.setLayoutProperty(layer.id,'visibility',layer.layout?.visibility||'visible');
      m.setPaintProperty('ocean','background-color',initial.find(l=>l.id==='ocean').paint['background-color']);
      for(const id of ['countries-line','regions-line'])m.setPaintProperty(id,'line-color',initial.find(l=>l.id===id).paint['line-color']);
      window.ripristinaDaApp(JSON.stringify({versione:2,stato:{countries:{},regions:{},places:{},regioniAttive:[]}}));
      window.impostaDaApp('countries','ITA','visited');window.impostaDaApp('countries','SVN','visited');
      m.jumpTo({center:[13.62,45.94],zoom:8});
    },initial);
    await page.waitForFunction(()=>__confini.flags.has('countries:ITA')&&__confini.flags.has('countries:SVN'),null,{timeout:60000});
    await page.evaluate(()=>new Promise(r=>__confini.map.once('idle',r)));
    await page.screenshot({path:path.join(out,'italia-slovenia-bandiere.png')});
    await page.evaluate(async()=>{
      window.ripristinaDaApp(JSON.stringify({versione:2,stato:{countries:{},regions:{},places:{},regioniAttive:[]}}));
      for(const c of ['CHN','IND','PAK'])await __confini.attivaRegioni(c);
    });
    for(const zoom of [6,8,10,12]){
      await page.evaluate(async zoom=>{
        const m=__confini.map;m.jumpTo({center:zoom===6?[76.8,35.5]:[76.697982,35.800665],zoom});
        await new Promise(r=>m.once('idle',r));
      },zoom);
      await page.screenshot({path:path.join(out,`cina-india-pakistan-${zoom}.png`)});
    }
  }
  console.log(`${old?'Baseline':'Linee uniche'}: ${records.length} controlli su ${probes.length} confini`);
};
