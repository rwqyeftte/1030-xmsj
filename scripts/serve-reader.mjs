import {createServer} from 'node:http';
import {createReaderHandler,deepSeekKey} from './reader-api.mjs';

const origin=process.env.READER_SITE_ORIGIN;
if (!origin || new URL(origin).origin!==origin || !origin.startsWith('https://')) {
  throw Error('请将 READER_SITE_ORIGIN 设置为前端 HTTPS 来源，例如 https://rwqyeftte.github.io');
}
if (!deepSeekKey()) throw Error('服务端需要 DEEPSEEK_API_KEY。');
const handler=createReaderHandler(origin);
const server=createServer((req,res)=>{
  if(req.url!=='/api/reader'){res.writeHead(404);res.end();return;}
  handler(req,res);
});
server.requestTimeout=60000;
server.listen(Number(process.env.PORT || 8787),'0.0.0.0');
