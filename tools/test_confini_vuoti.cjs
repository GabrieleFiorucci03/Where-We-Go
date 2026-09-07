// Verifica assoluta: i punti che prima erano vuoti devono avere superficie
// selezionabile, non soltanto rimanere identici cambiando modalita.
const {PNG}=require('pngjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');

module.exports=async function gaps(page,out,filename){
  const features=JSON.parse(fs.readFileSync(filename,'utf8')).features;
  const pairs=[['CHE','DEU'],['CHE','AUT'],['IRN','IRQ'],['IND','PAK'],
    ['USA','CAN'],['CHL','ARG'],['CHN','MNG'],['ZAF','NAM'],['FRA','ITA'],['THA','MMR']];
  const cases=[];
  for(const pair of pairs){
    const f=features.filter(f=>pair.every(c=>f.properties.neighbors.includes(c)))
      .sort((a,b)=>b.properties.area_km2-a.properties.area_km2)[0];
    if(f&&!cases.some(c=>c.properties.id===f.properties.id))cases.push(f);
  }
  assert(cases.length>=8,'Campione globale incompleto');
  await page.evaluate(()=>{
    window.ripristinaDaApp(JSON.stringify({versione:2,stato:{countries:{},regions:{},places:{},regioniAttive:[]}}));
    const m=__confini.map;
    for(const layer of m.getStyle().layers)if(!['ocean','countries-fill','regions-fill'].includes(layer.id))
      m.setLayoutProperty(layer.id,'visibility','none');
    m.setPaintProperty('ocean','background-color','#000000');
    for(const id of ['countries-fill','regions-fill']){
      m.setPaintProperty(id,'fill-color','#ffffff');
      m.setPaintProperty(id,'fill-antialias',false);
      m.setPaintProperty(id,'fill-opacity-transition',{duration:0});
    }
  });
  const records=[];
  let previous=[];
  for(const f of cases){
    const codes=[...new Set([...f.properties.neighbors,...f.properties.owners])];
    const modes=[[],[codes[0]],[codes[1]],codes];
    for(const zoom of [9,12])for(const active of modes){
      const hit=await page.evaluate(async({point,zoom,active,previous})=>{
        for(const code of previous)__confini.disattivaRegioni(code);
        for(const code of active)await __confini.attivaRegioni(code);
        const m=__confini.map;
        m.jumpTo({center:point,zoom});
        await new Promise(resolve=>m.once('idle',resolve));
        const p=m.project(point);
        return {x:p.x,y:p.y,codes:m.queryRenderedFeatures(p,{layers:['countries-fill','regions-fill']}).map(f=>f.properties.code)};
      },{point:f.properties.point,zoom,active,previous});
      previous=active;
      const buffer=await page.locator('canvas.maplibregl-canvas').screenshot();
      const png=PNG.sync.read(buffer);
      const x=Math.max(0,Math.min(png.width-1,Math.floor(hit.x)));
      const y=Math.max(0,Math.min(png.height-1,Math.floor(hit.y)));
      const covered=png.data[(y*png.width+x)*4]>127;
      records.push({gap:f.properties.id,countries:codes,point:f.properties.point,zoom,active,covered,hits:hit.codes});
      if(!covered||(zoom===9&&active.length===codes.length))
        fs.writeFileSync(path.join(out,`gap-${f.properties.id}-${zoom}-${active.join('-')||'off'}.png`),buffer);
    }
  }
  fs.writeFileSync(path.join(out,'gap-coverage.json'),JSON.stringify(records,null,2));
  const failures=records.filter(r=>!r.covered||!r.hits.length);
  assert.equal(failures.length,0,`${failures.length}/${records.length} punti ancora vuoti; vedere gap-coverage.json`);
  console.log(`Vuoti internazionali: ${records.length} controlli assoluti superati su ${cases.length} zone`);
};
