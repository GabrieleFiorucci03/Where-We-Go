// Pubblicazione locale coordinata. Mantiene copia recuperabile dei prodotti
// precedenti e ripristina quanto copiato se una scrittura fallisce.
// L'app/browser deve essere chiusa o ricaricata al termine: non e' un hot swap.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const build=path.resolve(process.argv[2]||'');
const allowed=path.join(root,'data_raw/confini-audit')+path.sep;
if(!build.startsWith(allowed))throw new Error('Build fuori dalla cartella di lavoro');
const data=path.join(build,'data'),work=path.join(build,'work');
const manifest=JSON.parse(fs.readFileSync(path.join(work,'verified-manifest.json'),'utf8'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const output=path.join(root,'web/data');
const rollback=path.join(build,'previous');
if(fs.existsSync(rollback))throw new Error('Questa build e gia stata pubblicata o tentata');
const files=Object.keys(manifest.files);
for(const rel of files){
  if(!path.resolve(data,rel).startsWith(data+path.sep)||!path.resolve(output,rel).startsWith(output+path.sep))throw new Error('Percorso non valido');
  if(hash(path.join(data,rel))!==manifest.files[rel])throw new Error(`Prodotto modificato dopo la verifica: ${rel}`);
}
fs.mkdirSync(rollback,{recursive:true});
const previous={};
for(const rel of files){
  const target=path.join(output,rel);
  previous[rel]=fs.existsSync(target)?hash(target):null;
  if(previous[rel]){
    const back=path.join(rollback,rel);fs.mkdirSync(path.dirname(back),{recursive:true});fs.copyFileSync(target,back);
  }
}
fs.writeFileSync(path.join(rollback,'manifest.json'),JSON.stringify(previous,null,2));
const written=[];
try{
  for(const rel of files){
    const target=path.join(output,rel);
    if((fs.existsSync(target)?hash(target):null)!==previous[rel])throw new Error(`Modifica concorrente: ${rel}`);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    written.push(rel);fs.copyFileSync(path.join(data,rel),target);
  }
  fs.writeFileSync(path.join(work,'published.json'),JSON.stringify({at:new Date().toISOString(),files:files.length,rollback},null,2));
  console.log(`Pubblicati ${files.length} file. Copia precedente: ${rollback}`);
}catch(error){
  for(const rel of written.reverse()){
    const target=path.join(output,rel);
    if(previous[rel])fs.copyFileSync(path.join(rollback,rel),target);
    else fs.unlinkSync(target); // solo file nuovi creati da questo tentativo
  }
  throw error;
}
