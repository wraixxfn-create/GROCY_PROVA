import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('android/app/src/main/assets'), downloads=path.resolve('downloads');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.apk':'application/vnd.android.package-archive','.json':'application/json'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://preview');let p=decodeURIComponent(url.pathname);
  const base=p.startsWith('/downloads/')?downloads:root;
  const file=path.resolve(base,p.startsWith('/downloads/')?p.slice(11):p==='/'?'index.html':p.slice(1));
  if(!file.startsWith(base+path.sep)){res.writeHead(403);return res.end('Accesso negato');}
  const data=await readFile(file);const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
  if(file.endsWith('.apk'))headers['Content-Disposition']='attachment; filename="'+path.basename(file)+'"';
  res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('File non trovato.');}
}).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Grocy Locale: http://0.0.0.0:'+(process.env.PORT||3000)));
