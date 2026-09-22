import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {WebSocket} from 'ws';
import Database from 'better-sqlite3';
import {analyze} from './wyckoff.js';

const PORT=Number(process.env.PORT||8787), TOP=Number(process.env.TOP_LIMIT||100);
const HL='https://api.hyperliquid.xyz/info';
const db=new Database(process.env.DB_PATH||'wyckoff-worker.sqlite3');
db.exec(`CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);
const put=db.prepare('INSERT OR IGNORE INTO alerts VALUES(?,?,?)');
let symbols=[], lastRun=null, lastError=null, lastScanStarted=null, lastScanComplete=null, scanFailures=0, scanRunning=false;
const intervals=['15m','1h','4h','1d'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(url,opts={},attempt=0){try{const r=await fetch(url,{...opts,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`${r.status} ${url}`);return r.json();}catch(e){if(attempt<3){await sleep(500*(2**attempt));return json(url,opts,attempt+1)}throw e}}
async function topSymbols(){const d=await json('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false');return d.map(x=>String(x.symbol).toUpperCase()).filter(Boolean).slice(0,TOP);}
async function available(){const d=await json(HL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'metaAndAssetCtxs'})});return new Set((d?.[0]?.universe||[]).map(x=>String(x.name).toUpperCase()));}
async function refreshSymbols(){const [ranked,avail]=await Promise.all([topSymbols(),available()]);symbols=ranked.filter(x=>avail.has(x));db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('symbols',JSON.stringify(symbols));}
function subscribe(ws,coin,interval){ws.send(JSON.stringify({method:'subscribe',subscription:{type:'candle',coin,interval}}));}
function alertId(x){return `${x.source}:${x.instrument}:${x.timeframe}:${x.timestamp}:${x.direction}`;}
function detect(coin,interval,rows){const c=rows.filter(x=>Number(x.T)<Date.now());if(c.length<25)return null;const x=c.at(-1),p=c.slice(-21,-1),hi=Math.max(...p.map(x=>+x.h)),lo=Math.min(...p.map(x=>+x.l));const range=hi-lo,body=Math.abs(+x.c-+x.o),up=+x.h-Math.max(+x.o,+x.c),down=Math.min(+x.o,+x.c)-+x.l;const direction=+x.h>hi+range*.01&&up>=body*2?'SHORT':(+x.l<lo-range*.01&&down>=body*2?'LONG':null);if(!direction)return null;return {source:'Hyperliquid',instrument:coin,timeframe:interval,timestamp:new Date(+x.T).toISOString(),direction,price:+x.c,stage:1,status:'SETUP_CANDIDATE'};}
async function sendAlert(payload){if(!process.env.ALERT_WEBHOOK_URL)return;await json(process.env.ALERT_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json',...(process.env.ALERT_API_TOKEN?{authorization:`Bearer ${process.env.ALERT_API_TOKEN}`}:{})},body:JSON.stringify(payload)});}
function persist(payload){const id=alertId(payload);const result=put.run(id,JSON.stringify(payload),new Date().toISOString());if(result.changes)sendAlert(payload).catch(e=>{lastError=`alert webhook: ${e.message}`});}
async function scanOnce(){
  if(scanRunning)return;
  scanRunning=true; lastScanStarted=new Date().toISOString(); let failures=0;
  try{
    await refreshSymbols(); let i=0;
    const workers=Array.from({length:6},async()=>{
      while(i<symbols.length){
        const coin=symbols[i++];
        for(const interval of intervals){
          try{
            const end=Date.now(), span={"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000}[interval];
            const rows=await json(HL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'candleSnapshot',req:{coin,interval,startTime:end-span*120,endTime:end}})});
            const a=analyze(rows.map(x=>({o:+x.o,h:+x.h,l:+x.l,c:+x.c,v:+x.v,T:+x.T})),coin,interval); if(a)persist(a);
          }catch(e){failures++;lastError=`${coin}/${interval}: ${e.message}`;}
          await sleep(80);
        }
      }
    });
    await Promise.all(workers);
    if(failures>symbols.length)throw Error(`scan_incomplete:${failures}`);
    lastRun=new Date().toISOString(); lastScanComplete=lastRun; scanFailures=0;
  }catch(e){scanFailures++;lastError=e.message;}finally{scanRunning=false}
}
function authorized(req){const expected=process.env.ALERT_API_TOKEN;return !expected||req.headers.authorization===`Bearer ${expected}`;}
function api(req,res){if(!authorized(req)){res.writeHead(401);return res.end('unauthorized');}if(req.url==='/health'){const stale=!lastScanComplete||Date.now()-Date.parse(lastScanComplete)>30*60*1000;res.writeHead(stale?503:200,{'content-type':'application/json'});return res.end(JSON.stringify({ok:!stale&&!scanFailures,lastRun,lastScanStarted,lastScanComplete,lastError,scanFailures,scanRunning,trackedSymbols:symbols.length}));}if(req.url==='/alerts'){const rows=db.prepare('SELECT payload FROM alerts ORDER BY created_at DESC LIMIT 200').all().map(x=>JSON.parse(x.payload));res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});return res.end(JSON.stringify({ok:true,items:rows,generatedAt:new Date().toISOString()}));}res.writeHead(404);res.end();}
http.createServer(api).listen(PORT,()=>console.log(`worker listening on ${PORT}`));
scanOnce().catch(e=>{lastError=e.message});setInterval(()=>scanOnce().catch(e=>{lastError=e.message}),15*60*1000);
