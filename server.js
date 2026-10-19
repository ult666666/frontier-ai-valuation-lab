import http from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Readable} from 'node:stream';
import {handleRequest} from './lib/http.js';

const PUBLIC=fileURLToPath(new URL('./public/',import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.csv':'text/csv; charset=utf-8','.txt':'text/plain; charset=utf-8','.zip':'application/zip'};
export function createAppServer() {
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')){
        const init={method:req.method,headers:req.headers};
        if(req.method!=='GET'&&req.method!=='HEAD'){init.body=Readable.toWeb(req);init.duplex='half';}
        const response=await handleRequest(new Request(url,init));
        res.writeHead(response.status,Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
      const requested=decodeURIComponent(url.pathname);
      if(requested.includes('\0')||requested.includes('\\')){res.writeHead(400).end();return;}
      const destination=path.resolve(PUBLIC,'.'+(requested==='/'?'/index.html':requested));
      if(!destination.startsWith(PUBLIC)||path.relative(PUBLIC,destination).split(path.sep).some(p=>p.startsWith('.'))){res.writeHead(403).end();return;}
      let resolved;
      try {resolved=await realpath(destination);if(!(await stat(resolved)).isFile())throw new Error();}
      catch {res.writeHead(404).end('Not found');return;}
      if(!resolved.startsWith(PUBLIC)){res.writeHead(403).end();return;}
      const type=MIME[path.extname(resolved)];if(!type){res.writeHead(404).end();return;}
      const content=await readFile(resolved);
      res.writeHead(200,{'Content-Type':type,'Content-Length':content.length,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:content);
    } catch(error) {res.writeHead(error instanceof URIError?400:500).end('Request could not be served.');}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const port=Number(process.env.PORT||4321), host=process.env.HOST||'127.0.0.1';
  const server=createAppServer();server.listen(port,host,()=>console.log(`Frontier AI Valuation Lab: http://${host}:${server.address().port}`));
}
