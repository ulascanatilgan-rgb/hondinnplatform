'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const FILE_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const PASS = process.env.APP_PASSWORD || '';
const PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);
if (PRODUCTION && !PASS) { console.error('Set APP_PASSWORD in Railway before launching.'); process.exit(1); }
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('hondinn:' + PASS).digest('hex');
const MAX_BODY = 23 * 1024 * 1024;
fs.mkdirSync(FILE_DIR, { recursive: true });
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const defaultDB = () => ({
  clients: [], reservations: [], ideas: [], checklist: [], notes: {}, files: [], walks: [],
  news: [], newsHistory: [], newsUpdated: null,
  projects: [
    {id:'spa',title:'Hondinn Hamam',type:'project',subtitle:'Dog spa & bathing',status:'Exploring',description:'Explore gentle dog bathing, drying, grooming, drainage and hygienic finishes.'},
    {id:'taxi',title:'Dog Taxi',type:'project',subtitle:'Safe pet transport',status:'Exploring',description:'A safe pick-up and drop-off service for hotel guests.'},
    {id:'robot',title:'RoboHond',type:'project',subtitle:'Smart room companion',status:'Research',description:'Mobile robot for room temperature, humidity, video and treat delivery.'}
  ],
  renovations: [
    {id:'stairs',title:'Stairs',type:'renovation',status:'In progress'},
    {id:'rooms',title:'Dog Rooms',type:'renovation',status:'In progress'},
    {id:'kitchen',title:'Dog Kitchen',type:'renovation',status:'Planned'},
    {id:'bathroom',title:'Dog Bathroom & Corridor',type:'renovation',status:'Planned'},
    {id:'garden',title:'Garden',type:'renovation',status:'In progress'}
  ]
});
let db;
try { db = {...defaultDB(), ...JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}; }
catch { db = defaultDB(); }
function save() { const tmp=DB_FILE+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,DB_FILE); }
if (!fs.existsSync(DB_FILE)) save();
const json = (res,status,data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data)); };
function cookie(req,key){return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='))?.slice(key.length+1)||'';}
function sign(payload){return crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');}
function validSession(req){
  if(!PASS && !PRODUCTION) return true;
  const token=cookie(req,'hondinn_session'); const pieces=token.split('.');
  if(pieces.length!==2) return false;
  const [data,sig]=pieces; const wanted=sign(data);
  if(Buffer.byteLength(sig)!==Buffer.byteLength(wanted)||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(wanted)))return false;
  const expiry=Number(Buffer.from(data,'base64url').toString());return Number.isFinite(expiry)&&expiry>Date.now();
}
function readBody(req){return new Promise((resolve,reject)=>{
 let size=0,chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){reject(Object.assign(new Error('File too large (max 15 MB)'),{status:413}));req.destroy();return;}chunks.push(chunk);});
 req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'));}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}));}});req.on('error',reject);
});}
function safeText(v,max=6000){return String(v??'').trim().slice(0,max);}
function clean(o,fields){const p={};for(const [k,n] of Object.entries(fields))p[k]=safeText(o[k],n);return p;}
function entity(str){return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));}
function tag(chunk,name){let m=chunk.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));return m?entity(m[1].trim()):'';}
async function fetchNews(){
 const queries=['dog boarding kennel animal welfare Europe when:45d','dog daycare pet hotel innovation dog enrichment when:45d'];
 const entries=[];
 for (const query of queries){
   const url='https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl=en&gl=BE&ceid=BE:en';
   const signal=AbortSignal.timeout(9000);const response=await fetch(url,{signal,headers:{'User-Agent':'Mozilla/5.0 HondinnDashboard/1.0'}});
   if(!response.ok) throw new Error('News source unavailable ('+response.status+').');
   const xml=await response.text(); const matches=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(v=>v[1]);
   for (const chunk of matches){
     const title=tag(chunk,'title').replace(/\s+-\s+[^-]{2,65}$/,'');
     const link=tag(chunk,'link'); const date=tag(chunk,'pubDate'); const source=tag(chunk,'source');
     if(!title||!/^https:\/\//.test(link))continue;
     if(!/(dog|pet|canine|kennel|animal|veterinar|pupp|boarding|groom|welfare)/i.test(title))continue;
     entries.push({id:crypto.createHash('sha1').update(link).digest('hex').slice(0,16),title,link,date:date?new Date(date).toISOString():now(),source:source||'Google News',category:/welfare|health|veterinar/i.test(title)?'Welfare':'Industry'});
   }
 }
 const unique=[...new Map(entries.map(n=>[n.title.toLowerCase(),n])).values()].sort((a,b)=>b.date.localeCompare(a.date));
 if(!unique.length) throw new Error('No relevant new articles were found.');
 const next=unique.slice(0,5);const old=db.news.filter(n=>!next.some(v=>v.id===n.id));
 db.newsHistory=[...old,...db.newsHistory].filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i).slice(0,150);
 db.news=next;db.newsUpdated=now();save();return next;
}
let refreshPromise=null;
function updateNews(){if(!refreshPromise)refreshPromise=fetchNews().finally(()=>{refreshPromise=null;});return refreshPromise;}
const extMime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.ico':'image/x-icon'};
function staticFile(res,pathname){
 let relative=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/, '');
 const target=path.resolve(PUBLIC,relative); if(!target.startsWith(PUBLIC+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':extMime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);});
}
function reservationError(item){
 if(!item.clientId||!db.clients.some(x=>x.id===item.clientId))return 'Choose an existing dog client.';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(item.start)||!/^\d{4}-\d{2}-\d{2}$/.test(item.end)||item.end<item.start)return 'Invalid booking dates.';
 if(item.type!=='Daycare'&&item.end===item.start)return 'For overnight stays, checkout must be after check-in.';
 const bookings=db.reservations.filter(x=>x.status!=='Cancelled'&&x.id!==item.id);
 for(let d=item.start;d<=(item.type==='Daycare'?item.start:new Date(Date.parse(item.end+'T00:00:00Z')-86400000).toISOString().slice(0,10));d=new Date(Date.parse(d+'T00:00:00Z')+86400000).toISOString().slice(0,10)){
   const total=bookings.filter(x=>x.start<=d&&(x.type==='Daycare'?x.start===d:x.end>d)).length;
   if(total>=4&&item.status!=='Cancelled')return `Capacity would exceed 4 dogs on ${d}.`;
 }
 return '';
}
async function handler(req,res){
 try{
  const url=new URL(req.url,'http://localhost'); const p=url.pathname;
  res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  if(p==='/api/config')return json(res,200,{authRequired:!!PASS,authenticated:validSession(req),pawpass:process.env.PAWPASS_URL||'',walkApp:process.env.WALK_APP_URL||'',arlo:process.env.ARLO_URL||'https://my.arlo.com/'});
  if(p==='/api/login'&&req.method==='POST'){
    const body=await readBody(req);const given=String(body.password||'');
    if(!PASS)return json(res,200,{ok:true});
    const a=crypto.createHash('sha256').update(given).digest(); const b=crypto.createHash('sha256').update(PASS).digest();
    if(!crypto.timingSafeEqual(a,b))return json(res,401,{error:'Incorrect password.'});
    const token=Buffer.from(String(Date.now()+14*86400000)).toString('base64url');
    res.setHeader('Set-Cookie',`hondinn_session=${token+'.'+sign(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${14*86400}${PRODUCTION?'; Secure':''}`);
    return json(res,200,{ok:true});
  }
  if(p==='/api/logout'&&req.method==='POST'){res.setHeader('Set-Cookie','hondinn_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});}
  if(p.startsWith('/api/')&&!validSession(req))return json(res,401,{error:'Please sign in.'});
  if(p==='/api/state'&&req.method==='GET')return json(res,200,db);
  if(p==='/api/news/refresh'&&req.method==='POST'){
    try{await updateNews();return json(res,200,{news:db.news,history:db.newsHistory,updated:db.newsUpdated});}
    catch(e){return json(res,503,{error:'Could not refresh live news: '+e.message});}
  }
  if(p==='/api/news'&&req.method==='GET'){
    if(!db.newsUpdated||Date.now()-Date.parse(db.newsUpdated)>86400000) updateNews().catch(e=>console.warn('News: '+e.message));
    return json(res,200,{news:db.news,history:db.newsHistory,updated:db.newsUpdated});
  }
  if(p==='/api/item'&&req.method==='POST'){
    const body=await readBody(req);const collection=safeText(body.collection,30);
    const schemas={
     clients:{dog:100,owner:100,breed:90,birth:30,phone:50,email:160,emergency:160,health:3000,notes:5000,dhp:30,lepto:30,kennel:30},
     reservations:{clientId:50,start:12,end:12,type:40,status:35,notes:1800},
     ideas:{title:140,detail:6000,status:40},
     projects:{title:130,subtitle:180,status:60,description:4000,type:20},
     renovations:{title:130,status:60,type:20},
     walks:{title:150,date:30,duration:20,notes:3000},
     checklist:{title:150,dueDate:30,note:3000}
    };
    if(!schemas[collection])return json(res,400,{error:'Unknown collection.'});
    const id=safeText(body.item?.id,80);const incoming=clean(body.item||{},schemas[collection]);
    if(collection==='clients'&&(!incoming.dog||!incoming.owner))return json(res,400,{error:'Dog name and owner are required.'});
    if(collection==='ideas'&&!incoming.title)return json(res,400,{error:'Idea title is required.'});
    if(collection==='checklist'){
      if(!incoming.title)return json(res,400,{error:'Task title is required.'});
      if(incoming.dueDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(incoming.dueDate)||Number.isNaN(Date.parse(incoming.dueDate))))return json(res,400,{error:'Invalid due date.'});
    }
    if(['projects','renovations','walks','checklist'].includes(collection)&&!incoming.title)return json(res,400,{error:'Title is required.'});
    const arr=db[collection];let row=arr.find(x=>x.id===id);
    const item={...row,...incoming,id:row?.id||uid(),updatedAt:now(),createdAt:row?.createdAt||now()};
    if(collection==='checklist')item.done=typeof body.item?.done==='boolean'?body.item.done:!!row?.done;
    if(collection==='reservations'){const err=reservationError(item);if(err)return json(res,400,{error:err});}
    if(row)arr[arr.indexOf(row)]=item;else arr.unshift(item);save();return json(res,200,{item});
  }
  if(p==='/api/item'&&req.method==='DELETE'){
    const {collection,id}=await readBody(req);
    if(!['clients','reservations','ideas','projects','renovations','walks','checklist'].includes(collection))return json(res,400,{error:'Invalid collection.'});
    if(collection==='clients'&&db.reservations.some(r=>r.clientId===id))return json(res,400,{error:'Delete this dog’s reservations first.'});
    const idx=db[collection].findIndex(x=>x.id===id);if(idx===-1)return json(res,404,{error:'Item not found.'});
    db[collection].splice(idx,1);save();return json(res,200,{ok:true});
  }
  if(p==='/api/note'&&req.method==='POST'){
    const {key,value}=await readBody(req); const noteKey=safeText(key,150);if(!/^(project|renovation|general):[a-zA-Z0-9-]{1,80}$/.test(noteKey))return json(res,400,{error:'Invalid note.'});
    db.notes[noteKey]=safeText(value,20000);save();return json(res,200,{ok:true});
  }
  if(p==='/api/upload'&&req.method==='POST'){
    const b=await readBody(req);const collection=safeText(b.collection,20),parentId=safeText(b.parentId,100);
    if(!['document','renovation','walk','project'].includes(collection))return json(res,400,{error:'Invalid upload section.'});
    const name=safeText(b.name,180).replace(/[\\/]/g,'_');const mime=safeText(b.mime,90);
    const types=['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'];
    if(!types.includes(mime))return json(res,400,{error:'Only PDF, JPG, PNG, WEBP or HEIC files are supported.'});
    const encoded=String(b.data||'').replace(/^data:[^,]+,/, '');
    if(encoded.length>21*1024*1024)return json(res,413,{error:'Files must be smaller than 15 MB.'});
    const bytes=Buffer.from(encoded,'base64');if(!bytes.length||bytes.length>15*1024*1024)return json(res,400,{error:'Invalid file size.'});
    const safeExt={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/heic':'.heic','image/heif':'.heif'}[mime];
    const id=uid(), filename=id+safeExt;fs.writeFileSync(path.join(FILE_DIR,filename),bytes,{flag:'wx'});
    const item={id,name,mime,size:bytes.length,collection,parentId,clientId:safeText(b.clientId,90),createdAt:now(),filename};db.files.unshift(item);save();return json(res,200,{item});
  }
  if(p.startsWith('/api/files/')&&req.method==='GET'){
    const id=p.split('/').pop();const item=db.files.find(f=>f.id===id);if(!item)return json(res,404,{error:'File not found.'});
    const pathname=path.join(FILE_DIR,item.filename);if(!fs.existsSync(pathname))return json(res,404,{error:'File missing from storage.'});
    res.writeHead(200,{'Content-Type':item.mime,'Content-Disposition':`${url.searchParams.has('download')?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(item.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});
    return fs.createReadStream(pathname).pipe(res);
  }
  if(p==='/api/file'&&req.method==='DELETE'){
    const {id}=await readBody(req); const idx=db.files.findIndex(f=>f.id===id);if(idx<0)return json(res,404,{error:'File not found.'});
    const [f]=db.files.splice(idx,1);try{fs.unlinkSync(path.join(FILE_DIR,f.filename));}catch{}save();return json(res,200,{ok:true});
  }
  if(p.startsWith('/api/'))return json(res,404,{error:'Unknown endpoint.'});
  if(req.method==='GET'||req.method==='HEAD')return staticFile(res,p);
  return json(res,405,{error:'Method not allowed.'});
 }catch(error){console.error(error);if(!res.headersSent)json(res,error.status||500,{error:error.message||'Unexpected error'});}
}
http.createServer(handler).listen(PORT,'0.0.0.0',()=>console.log(`Hondinn Platform http://localhost:${PORT}`));
