import http from 'node:http';
import {readFile} from 'node:fs/promises';
const file=new URL('./dist/index.html',import.meta.url);
const port=Number(process.env.PORT??3011);
http.createServer(async(_req,res)=>{try{res.setHeader('content-type','text/html; charset=utf-8');res.end(await readFile(file));}catch{res.statusCode=500;res.end('Run npm run build:showcase first.');}}).listen(port,'0.0.0.0',()=>console.log(`Sentinel showcase: http://localhost:${port}`));
