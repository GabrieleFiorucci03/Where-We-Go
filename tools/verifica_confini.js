// Controlli dei prodotti finali, inclusa la presenza dei codici nei tile z9.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const zlib = require('zlib');
const vm = require('vm');
const { PbfReader } = require('pbf');
const root = path.resolve(__dirname, '..');
const json = f=>JSON.parse(fs.readFileSync(f,'utf8'));
const polys = g=>g.type==='Polygon'?[g.coordinates]:g.coordinates;

function decode(data) {
  const layers=[];
  new PbfReader(new Uint8Array(data)).readFields((tag,l,p)=>{
    if(tag!==3) return;
    const layer={name:'',keys:[],values:[],features:[]};
    p.readMessage((t,o,q)=>{
      if(t===1) o.name=q.readString();
      if(t===3) o.keys.push(q.readString());
      if(t===4) {
        const value={};
        q.readMessage((v,d,r)=>{
          if(v===1)d.v=r.readString();
          if(v===2)d.v=r.readFloat();
          if(v===3)d.v=r.readDouble();
          if(v===4||v===5)d.v=r.readVarint();
          if(v===6)d.v=r.readSVarint();
          if(v===7)d.v=r.readBoolean();
        },value); o.values.push(value.v);
      }
      if(t===2) {
        const f={tags:[]};
        q.readMessage((v,d,r)=>{if(v===2)d.tags=r.readPackedVarint();},f);
        o.features.push(f);
      }
    },layer);
    layers.push(layer);
  },null);
  const found=new Set();
  for(const l of layers)for(const f of l.features)for(let i=0;i<f.tags.length;i+=2){
    if(l.keys[f.tags[i]]==='code')found.add(`${l.name}:${l.values[f.tags[i+1]]}`);
  }
  return found;
}

function openArchive(filename) {
  const ctx={TextDecoder,TextEncoder,console}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'web/vendor/pmtiles.js'),'utf8'),ctx);
  const fd=fs.openSync(filename,'r');
  const source={getKey:()=>filename,getBytes:async(offset,length)=>{
    const b=Buffer.alloc(length);const n=fs.readSync(fd,b,0,length,offset);
    return {data:b.buffer.slice(b.byteOffset,b.byteOffset+n)};
  }};
  const decompress=async(data,type)=>type===2?zlib.gunzipSync(Buffer.from(data)):data;
  const api=ctx.pmtiles, cache=new api.ResolvedValueCache(128,true,decompress);
  const p=new api.PMTiles(source,cache,decompress), tiles=new Map();
  return {close:()=>fs.closeSync(fd),header:()=>p.getHeader(),metadata:()=>p.getMetadata(),
    async codes(z,x,y) {
      const n=2**z; x=((x%n)+n)%n;if(y<0||y>=n)return new Set();
      const key=`${z}/${x}/${y}`;
      if(tiles.has(key))return tiles.get(key);
      const tile=await p.getZxy(z,x,y), result=tile?decode(tile.data):new Set();
      if(tiles.size>=128)tiles.delete(tiles.keys().next().value);
      tiles.set(key,result);return result;
    }};
}

async function present(archive, f, layer) {
  // Un vertice della componente con piu' vertici, piu' le tessere adiacenti:
  // copre gli arrotondamenti e i vertici esattamente sul bordo di una tessera.
  const poly=polys(f.geometry).reduce((a,b)=>a[0].length>=b[0].length?a:b);
  const [lon,lat0]=poly[0][0],lat=Math.max(-85.051128,Math.min(85.051128,lat0));
  const x=Math.floor((lon+180)/360*512);
  const y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*512);
  for(const [dx,dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]) {
    if((await archive.codes(9,x+dx,y+dy)).has(`${layer}:${f.properties.code}`))return true;
  }
  return false;
}

async function verify(data,work,baseline) {
  const raw=fs.readFileSync(path.join(work,'regions.ndjson'),'utf8').trim().split('\n').map(JSON.parse);
  const oldCountries=json(path.join(baseline,'web/data/countries.geojson')).features.map(f=>f.mask
    ? json(path.join(baseline,'web/data/country-shapes',`${f.properties.code}.geojson`)) : f);
  const countryCatalog=json(path.join(data,'countries.geojson')).features;
  const countries=countryCatalog.map(f=>f.mask
    ? json(path.join(data,'country-shapes',`${f.properties.code}.geojson`)) : f);
  assert.deepEqual(countries.map(f=>f.properties).sort((a,b)=>a.code.localeCompare(b.code)),
    oldCountries.map(f=>f.properties).sort((a,b)=>a.code.localeCompare(b.code)),'proprieta nazionali cambiate');
  const byCountry=new Map(),codes=new Set();
  for(const f of raw){
    assert.equal(f.tippecanoe.minzoom,3);assert(!codes.has(f.properties.code),'codice regionale duplicato');
    codes.add(f.properties.code);
    if(!byCountry.has(f.properties.country))byCountry.set(f.properties.country,[]);
    byCountry.get(f.properties.country).push(f);
  }
  // Un cambio di fonte regionale e' voluto, e cambia codici e nomi: il
  // confronto cieco con la baseline lo scambierebbe per un guasto. Va
  // dichiarato con CONFINI_CAMBI_ATTESI=ISO[,ISO...]; per quei paesi il
  // confronto viene sostituito da un resoconto delle differenze, che finisce
  // in verification.json. Chi legge il rapporto vede cosa e' cambiato, invece
  // di non vedere niente.
  const attesi=new Set((process.env.CONFINI_CAMBI_ATTESI||'').split(',').map(s=>s.trim()).filter(Boolean));
  const cambiDichiarati={};
  let maskBytes=0,compressedBytes=0,maxShapeBytes=0,catalogBytes=0;
  const ringCount=g=>polys(g).reduce((n,p)=>n+p.length,0);
  for(const [iso,features] of byCountry){
    const filename=path.join(data,'regions',`${iso}.geojson`),cat=json(filename).features;
    catalogBytes+=fs.statSync(filename).size;
    const before=json(path.join(baseline,'web/data/regions',`${iso}.geojson`)).features;
    const props=fs=>fs.map(f=>f.properties).sort((a,b)=>a.code.localeCompare(b.code));
    if(attesi.has(iso)) {
      const elenco=fs=>fs.map(f=>f.properties.code).sort();
      const prima=elenco(before),dopo=elenco(cat);
      cambiDichiarati[iso]={
        prima:prima.length,dopo:dopo.length,
        rimossi:prima.filter(c=>!dopo.includes(c)),
        aggiunti:dopo.filter(c=>!prima.includes(c)),
      };
    } else assert.deepEqual(props(cat),props(before),`proprieta ${iso}`);
    assert.equal(cat.length,features.length);
    for(const f of features){
      const maskFile=path.join(data,'region-shapes',`${f.properties.code}.geojson`);
      const bytes=fs.readFileSync(maskFile),mask=JSON.parse(bytes);
      assert.deepEqual(mask.properties,f.properties);
      assert.equal(polys(mask.geometry).length,polys(f.geometry).length,`componenti ${f.properties.code}`);
      assert.equal(ringCount(mask.geometry),ringCount(f.geometry),`anelli ${f.properties.code}`);
      maskBytes+=bytes.length;compressedBytes+=zlib.deflateRawSync(bytes).length;
      maxShapeBytes=Math.max(maxShapeBytes,bytes.length);
    }
  }
  // Una dichiarazione che non corrisponde a niente e' rimasta indietro: o il
  // codice e' sbagliato, o il cambiamento non e' avvenuto.
  for(const iso of attesi)assert(cambiDichiarati[iso],`cambio dichiarato per ${iso}, ma il paese non ha regioni nella build`);
  for(const [iso,d] of Object.entries(cambiDichiarati))
    assert(d.rimossi.length||d.aggiunti.length,`cambio dichiarato per ${iso}, ma i codici sono identici alla baseline`);
  assert(catalogBytes<2*1024*1024,'cataloghi oltre 2 MiB');
  // Il completamento globale dei bordi aggiunge geometria reale alle sagome;
  // il limite resta sotto 40 MiB e le sagome vengono comunque caricate una
  // alla volta dalla cache LRU dell'app.
  assert(compressedBytes<40*1024*1024,'sagome compresse oltre 40 MiB');
  assert(fs.statSync(path.join(data,'countries.geojson')).size<=8*1024*1024,'catalogo paesi oltre 8 MiB');
  const archive=openArchive(path.join(data,'boundaries.pmtiles'));
  const old=openArchive(path.join(baseline,'web/data/boundaries.pmtiles'));
  const absent=[],regressions=[];
  try {
    const h=await archive.header();assert.equal(h.minZoom,0);assert.equal(h.maxZoom,9);
    const metadata=await archive.metadata();
    assert.deepEqual(Array.from(metadata.vector_layers,l=>l.id).sort(),['countries','regions']);
    for(const [layer,features] of [['countries',countries],['regions',raw]]){
      for(const f of features){
        if(await present(archive,f,layer))continue;
        absent.push(`${layer}:${f.properties.code}`);
        // Il punto campionato puo' cadere in una componente minuscola gia'
        // assente nella baseline: viene documentato, non contato come perdita.
        const ref=layer==='countries'?oldCountries.find(c=>c.properties.code===f.properties.code):f;
        if(await present(old,ref,layer))regressions.push(`${layer}:${f.properties.code}`);
      }
      console.log(`verificata presenza tile: ${layer}, ${features.length} codici`);
    }
    assert.deepEqual(regressions,[],'entita perse rispetto alla baseline');
    assert(fs.statSync(path.join(data,'boundaries.pmtiles')).size<60*1024*1024,'PMTiles oltre 60 MiB');
    const report={countries:countries.length,regions:raw.length,zoom:[h.minZoom,h.maxZoom],
      maskBytes,compressedBytes,maxShapeBytes,catalogBytes,absentAtSample:absent,regressions,
      declaredChanges:cambiDichiarati,
      tilePresence:'one boundary vertex and neighboring tiles per entity at z9; not an exhaustive tile scan'};
    fs.writeFileSync(path.join(work,'verification.json'),JSON.stringify(report,null,2));
    // La pubblicazione ricontrolla gli hash: una modifica dopo i test invalida il manifest.
    const files=['countries.geojson','boundaries.pmtiles','regions/index.json','canonical-report.json'];
    for(const f of countryCatalog)if(f.mask)files.push(`country-shapes/${f.properties.code}.geojson`);
    for(const iso of byCountry.keys())files.push(`regions/${iso}.geojson`);
    for(const code of codes)files.push(`region-shapes/${code}.geojson`);
    const lineArchive=openArchive(path.join(data,'border-lines.pmtiles'));
    try {
      const lm=await lineArchive.metadata();
      assert.deepEqual(Array.from(lm.vector_layers,l=>l.id).sort(),['country-borders','region-borders']);
      const lh=await lineArchive.header();assert.equal(lh.minZoom,0);assert.equal(lh.maxZoom,9);
    } finally {lineArchive.close();}
    files.push('border-lines.pmtiles');
    const manifest={files:{}};
    for(const file of files)manifest.files[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(data,file))).digest('hex');
    fs.writeFileSync(path.join(work,'verified-manifest.json'),JSON.stringify(manifest,null,2));
    console.log(JSON.stringify(report));return report;
  } finally {archive.close();old.close();}
}
if(require.main===module)verify(path.resolve(process.argv[2]),path.resolve(process.argv[3]),path.resolve(process.argv[4]))
  .catch(e=>{console.error(e);process.exitCode=1});
module.exports={verify,decode,openArchive};
