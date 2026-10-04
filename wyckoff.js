export const CFG={cons:20,wick:2};
export function rsi(c,n=14){let o=Array(c.length).fill(50),g=0,l=0;if(c.length<=n)return o;for(let i=1;i<=n;i++){let d=c[i].c-c[i-1].c;g+=Math.max(d,0);l+=Math.max(-d,0)}let ag=g/n,al=l/n;for(let i=n;i<c.length;i++){if(i>n){let d=c[i].c-c[i-1].c;ag=(ag*(n-1)+Math.max(d,0))/n;al=(al*(n-1)+Math.max(-d,0))/n}o[i]=al?100-100/(1+ag/al):100}return o}
export function atr(c,n=14){if(c.length<n+1)return c.at(-1).c*.01;let t=[];for(let i=1;i<c.length;i++)t.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));return t.slice(-n).reduce((a,b)=>a+b,0)/n}
function wick(x,s){let b=Math.abs(x.c-x.o),r=x.h-x.l,w=s==='S'?x.h-Math.max(x.o,x.c):Math.min(x.o,x.c)-x.l;return r>0&&(b/r<=.4||w>=b*CFG.wick)}
export function analyze(rows,coin,tf){let c=rows.filter(x=>x.T<Date.now());if(c.length<25)return null;let i=c.length-3,s=c[i],m=c[i+1],z=c.slice(i-CFG.cons,i),hi=Math.max(...z.map(x=>x.h)),lo=Math.min(...z.map(x=>x.l)),a=atr(c.slice(0,i)),d=s.h>hi+.1*a&&wick(s,'S')?'SHORT':s.l<lo-.1*a&&wick(s,'L')?'LONG':null;if(!d)return null;
  // MSS is a structure break confirmed by the close after the liquidity sweep.
  // FVG remains a quality enhancer, not a hard gate for every valid MSS.
  let mss=d==='SHORT'?m.c<c[i-1].l:m.c>c[i-1].h;if(!mss)return null;
  let f=d==='SHORT'&&m.h<c[i-1].l?[m.h,c[i-1].l]:d==='LONG'&&m.l>c[i-1].h?[c[i-1].h,m.l]:null;
  let e=m.c,sl=d==='LONG'?s.l-.1*a:s.h+.1*a,r=Math.abs(e-sl),rv=rsi(c);return {source:'Hyperliquid',instrument:coin,timeframe:tf,timestamp:new Date(m.T).toISOString(),direction:d,stage:1,...(f?{fvg_min:Math.min(...f),fvg_max:Math.max(...f)}:{}),price:e,sl,tp1:d==='LONG'?e+2*r:e-2*r,tp2:d==='LONG'?e+3*r:e-3*r,sl_pct:100*r/e,rsi:rv[i+1],status:f?'MSS_FVG_CONFIRMED':'MSS_CONFIRMED'};}
