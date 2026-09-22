import fs from 'node:fs/promises';
import {analyze} from './wyckoff.js';
const HL='https://api.hyperliquid.xyz/info';
const top=(await (await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false')).json()).map(x=>String(x.symbol).toUpperCase()).filter(Boolean).slice(0,100);
const meta=await (await fetch(HL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'metaAndAssetCtxs'})})).json();
const avail=new Set((meta[0]?.universe||[]).map(x=>String(x.name).toUpperCase()));
const coins=top.filter(x=>avail.has(x)), intervals=['15m','1h','4h','1d'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function one(coin,interval){const end=Date.now(),span={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[interval];for(let attempt=0;attempt<6;attempt++){const r=await fetch(HL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'candleSnapshot',req:{coin,interval,startTime:end-span*120,endTime:end}})});if(r.ok){const rows=await r.json();return analyze(rows.map(x=>({o:+x.o,h:+x.h,l:+x.l,c:+x.c,v:+x.v,T:+x.T})),coin,interval)}if(r.status===429||r.status>=500){await sleep(3000*(attempt+1));continue}throw Error(`${r.status}`)}throw Error('429 after retries')}
const items=[];const errors=[];let i=0;const workers=Array.from({length:2},async()=>{while(i<coins.length){const coin=coins[i++];for(const interval of intervals){try{const x=await one(coin,interval);if(x)items.push({...x,zone:x.fvg_min!=null?`${x.fvg_min}-${x.fvg_max}`:undefined})}catch(e){errors.push(`${coin}/${interval}:${e.message}`)}await sleep(1200)}}});await Promise.all(workers);
await fs.mkdir('public',{recursive:true});const generatedAt=new Date().toISOString();const result={ok:errors.length<coins.length,items,errors,trackedCoins:coins.length,generatedAt};await fs.writeFile('public/wyckoff-alerts.json',JSON.stringify(result,null,2));await fs.writeFile('public/health.json',JSON.stringify({ok:result.ok,generatedAt,trackedCoins:coins.length,alerts:items.length,errorCount:errors.length,errors:errors.slice(0,20)},null,2));
console.log(JSON.stringify({trackedCoins:coins.length,alerts:items.length,errors:errors.length}));
