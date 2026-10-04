import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
let root=path.resolve(here,'..');
let urlArg='';
for(let i=2;i<process.argv.length;i++){
  const arg=process.argv[i];
  if(arg==='--root'){root=path.resolve(process.argv[++i]||'');continue;}
  if(!urlArg)urlArg=arg;
}
if(!urlArg)throw new Error('Usage: node development/configure_public_url.mjs https://example.com/path/ [--root /path/to/package]');
let pageUrl;
try{pageUrl=new URL(urlArg);}catch{throw new Error('Public URL must be a valid absolute http(s) URL');}
if(!/^https?:$/.test(pageUrl.protocol))throw new Error('Public URL must use http or https');
if(!pageUrl.pathname.endsWith('/'))pageUrl.pathname+='/';
pageUrl.search='';pageUrl.hash='';
const release=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8')).id;
const page=pageUrl.href;
const image=new URL(`assets/ogp-card.png?release=${encodeURIComponent(release)}`,pageUrl).href;
const indexPath=path.join(root,'index.html');
let html=fs.readFileSync(indexPath,'utf8');
const upsert=(regex,line,after)=>{
  if(regex.test(html)){html=html.replace(regex,line);return;}
  const pos=html.indexOf(after);
  if(pos<0)throw new Error(`Cannot find insertion anchor: ${after}`);
  html=html.slice(0,pos+after.length)+'\n'+line+html.slice(pos+after.length);
};
upsert(/<link rel="canonical" href="[^"]*">/,`<link rel="canonical" href="${page}">`,'<title>個体値ぶっこみスキャン for Pokémon Sleep</title>');
upsert(/<meta property="og:url" content="[^"]*">/,`<meta property="og:url" content="${page}">`,'<meta property="og:type" content="website">');
html=html.replace(/<meta property="og:image" content="[^"]*">/,`<meta property="og:image" content="${image}">`);
html=html.replace(/<meta name="twitter:image" content="[^"]*">/,`<meta name="twitter:image" content="${image}">`);
fs.writeFileSync(indexPath,html);

const manifestPath=path.join(root,'public_package_manifest.json');
if(fs.existsSync(manifestPath)){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const files=[];
  const walk=dir=>{
    for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,ent.name);
      if(ent.isDirectory())walk(full);
      else if(ent.isFile()){
        const rel=path.relative(root,full).split(path.sep).join('/');
        if(rel==='public_package_manifest.json')continue;
        const data=fs.readFileSync(full);
        files.push({path:rel,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
      }
    }
  };
  walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
  manifest.files=files;
  manifest.publicUrl={page,image,configuredAt:new Date().toISOString()};
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}
console.log(`Configured public page URL: ${page}`);
console.log(`Configured OGP image URL: ${image}`);
