import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dest=path.join(root,'mobile/www');await mkdir(dest,{recursive:true});
// Source HTML resolves shared assets directly for browser previews. The APK bundles them locally.
const html=await readFile(path.join(root,'mobile/index.html'),'utf8');
await writeFile(path.join(dest,'index.html'),html.replaceAll('../aqualicious website/frontend/css/','').replaceAll('../aqualicious website/frontend/js/',''));
for(const f of ['mobile.css','splash.js'])await copyFile(path.join(root,'mobile',f),path.join(dest,f));
for(const [folder,files] of [['css',['shared.css','live.css']],['js',['api.js','shared.js']]])for(const f of files)await copyFile(path.join(root,'aqualicious website/frontend',folder,f),path.join(dest,f));
console.log('Mobile assets synchronized.');
