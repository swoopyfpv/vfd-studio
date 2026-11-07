
"use strict";
/* ============================================================
   RENDER CORE — mirrored 1:1 by the firmware (C++).
   Keep it small and deterministic: same project + same time = same pixels.
   ============================================================ */
const W=256,H=48;

class FB{
  constructor(){this.p=new Uint8Array(W*H);this.color=1;this.clip=null;this.track=null;this.ox=0;this.oy=0;}
  clear(){this.p.fill(0);}
  px(x,y){
    x=Math.round(x)+this.ox;y=Math.round(y)+this.oy;
    if(x<0||y<0||x>=W||y>=H)return;
    const c=this.clip; if(c&&(x<c[0]||y<c[1]||x>=c[2]||y>=c[3]))return;
    const i=y*W+x; this.p[i]=this.color===2?this.p[i]^1:this.color;
    const t=this.track; if(t){if(x<t[0])t[0]=x;if(y<t[1])t[1]=y;if(x>t[2])t[2]=x;if(y>t[3])t[3]=y;}
  }
  hl(x,y,w){for(let i=0;i<w;i++)this.px(x+i,y);}
  vl(x,y,h){for(let i=0;i<h;i++)this.px(x,y+i);}
  box(x,y,w,h){for(let j=0;j<h;j++)this.hl(x,y+j,w);}
  frame(x,y,w,h){if(w<1||h<1)return;this.hl(x,y,w);if(h>1)this.hl(x,y+h-1,w);if(h>2){this.vl(x,y+1,h-2);if(w>1)this.vl(x+w-1,y+1,h-2);}}
  line(x0,y0,x1,y1,dash){
    x0|=0;y0|=0;x1|=0;y1|=0;
    const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy,n=0;
    for(;;){ if(!(dash>0&&Math.floor(n/dash)%2))this.px(x0,y0); n++;
      if(x0===x1&&y0===y1)break; const e2=2*e; if(e2>=dy){e+=dy;x0+=sx;} if(e2<=dx){e+=dx;y0+=sy;} }
  }
  xbm(x,y,w,h,b,inv){ // XBM / u8g2 drawXBM layout: rows, LSB first, transparent zeros
    const st=(w+7)>>3;
    for(let r=0;r<h;r++)for(let c=0;c<w;c++){let v=(b[r*st+(c>>3)]>>(c&7))&1;if(inv)v^=1;if(v)this.px(x+c,y+r);}
  }
}

/* ---------- PRNG (mulberry32) — identical in firmware ---------- */
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function hash(a,b){return (Math.imul(a>>>0,2654435761)^Math.imul((b|0)+1,40503))>>>0;}

/* ---------- integer trig (identical table in firmware) ---------- */
const SIN256=[0,101,201,301,401,501,601,700,799,897,995,1092,1189,1285,1380,1474,1567,1660,1751,1842,1931,2019,2106,2191,2276,2359,2440,2520,2598,2675,2751,2824,2896,2967,3035,3102,3166,3229,3290,3349,3406,3461,3513,3564,3612,3659,3703,3745,3784,3822,3857,3889,3920,3948,3973,3996,4017,4036,4052,4065,4076,4085,4091,4095,4096,4095,4091,4085,4076,4065,4052,4036,4017,3996,3973,3948,3920,3889,3857,3822,3784,3745,3703,3659,3612,3564,3513,3461,3406,3349,3290,3229,3166,3102,3035,2967,2896,2824,2751,2675,2598,2520,2440,2359,2276,2191,2106,2019,1931,1842,1751,1660,1567,1474,1380,1285,1189,1092,995,897,799,700,601,501,401,301,201,101,0,-101,-201,-301,-401,-501,-601,-700,-799,-897,-995,-1092,-1189,-1285,-1380,-1474,-1567,-1660,-1751,-1842,-1931,-2019,-2106,-2191,-2276,-2359,-2440,-2520,-2598,-2675,-2751,-2824,-2896,-2967,-3035,-3102,-3166,-3229,-3290,-3349,-3406,-3461,-3513,-3564,-3612,-3659,-3703,-3745,-3784,-3822,-3857,-3889,-3920,-3948,-3973,-3996,-4017,-4036,-4052,-4065,-4076,-4085,-4091,-4095,-4096,-4095,-4091,-4085,-4076,-4065,-4052,-4036,-4017,-3996,-3973,-3948,-3920,-3889,-3857,-3822,-3784,-3745,-3703,-3659,-3612,-3564,-3513,-3461,-3406,-3349,-3290,-3229,-3166,-3102,-3035,-2967,-2896,-2824,-2751,-2675,-2598,-2520,-2440,-2359,-2276,-2191,-2106,-2019,-1931,-1842,-1751,-1660,-1567,-1474,-1380,-1285,-1189,-1092,-995,-897,-799,-700,-601,-501,-401,-301,-201,-101];
const isin=a=>SIN256[a&255], icos=a=>SIN256[(a+64)&255];
const PI=3.141592653589793;
const jround=Math.round;
// atan for |x|<=1, same polynomial and operation order as the firmware
function fatan(x){const x2=x*x;return x*(0.9998660+x2*(-0.3302995+x2*(0.1801410+x2*(-0.0851330+x2*0.0208351))));}
function fatan2(y,x){if(x===0&&y===0)return 0;const ax=Math.abs(x),ay=Math.abs(y);let r=ax>=ay?fatan(ay/ax):PI/2-fatan(ax/ay);if(x<0)r=PI-r;return y<0?-r:r;}

/* ---------- Fonts ---------- */
// medium: classic 5x7 (column bytes, bit0 = top), ASCII 0x20–0x5F
const F57=[0,0,0,0,0, 0,0,95,0,0, 0,7,0,7,0, 20,127,20,127,20, 36,42,127,42,18, 35,19,8,100,98, 54,73,86,32,80, 0,8,7,3,0,
0,28,34,65,0, 0,65,34,28,0, 42,28,127,28,42, 8,8,62,8,8, 0,128,112,48,0, 8,8,8,8,8, 0,0,96,96,0, 32,16,8,4,2,
62,81,73,69,62, 0,66,127,64,0, 114,73,73,73,70, 33,65,73,77,51, 24,20,18,127,16, 39,69,69,69,57, 60,74,73,73,49, 65,33,17,9,7,
54,73,73,73,54, 70,73,73,41,30, 0,0,20,0,0, 0,64,52,0,0, 0,8,20,34,65, 20,20,20,20,20, 0,65,34,20,8, 2,1,89,9,6,
62,65,93,89,78, 124,18,17,18,124, 127,73,73,73,54, 62,65,65,65,34, 127,65,65,65,62, 127,73,73,73,65, 127,9,9,9,1, 62,65,65,81,115,
127,8,8,8,127, 0,65,127,65,0, 32,64,65,63,1, 127,8,20,34,65, 127,64,64,64,64, 127,2,28,2,127, 127,4,8,16,127, 62,65,65,65,62,
127,9,9,9,6, 62,65,81,33,94, 127,9,25,41,70, 38,73,73,73,50, 3,1,127,1,3, 63,64,64,64,63, 31,32,64,32,31, 63,64,56,64,63,
99,20,8,20,99, 3,4,120,4,3, 97,89,73,77,67, 0,127,65,65,65, 2,4,8,16,32, 0,65,65,65,127, 4,2,1,2,4, 64,64,64,64,64];
// small: 3x5, defined as rows
const F35SRC={' ':'000000000000000','!':'010010010000010','"':'101101000000000','#':'101111101111101','%':'101001010100101',"'":'010010000000000',
'(':'001010010010001',')':'100010010010100','*':'000101010101000','+':'000010111010000',',':'000000000010100','-':'000000111000000','.':'000000000000010','/':'001001010100100',
'0':'111101101101111','1':'010110010010111','2':'111001111100111','3':'111001111001111','4':'101101111001001','5':'111100111001111','6':'111100111101111','7':'111001001010010','8':'111101111101111','9':'111101111001111',
':':'000010000010000',';':'000010000010100','<':'001010100010001','=':'000111000111000','>':'100010001010100','?':'111001011000010','@':'111101111100111',
A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',
J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',P:'110101110100100',Q:'010101101110011',R:'110101110101101',
S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111',
'[':'110100100100110',']':'011001001001011','_':'000000000000111','|':'010010010010010','^':'010101000000000','°':'010101010000000'};
const FONTS={
  small:{h:5,sp:1,g:{}},
  medium:{h:8,sp:1,g:{}}
};
for(const k in F35SRC){const s=F35SRC[k],cols=[];for(let c=0;c<3;c++){let b=0;for(let r=0;r<5;r++)if(s[r*3+c]==='1')b|=1<<r;cols.push(b);}FONTS.small.g[k]=cols;}
for(let i=0;i<64;i++)FONTS.medium.g[String.fromCharCode(32+i)]=F57.slice(i*5,i*5+5);
FONTS.medium.g['°']=[0,6,9,6,0];FONTS.medium.g['·']=[0,0,8,0,0];FONTS.small.g['·']=[0,4,0];
const UMLAUT={'Ä':'A','Ö':'O','Ü':'U','ä':'A','ö':'O','ü':'U','ß':'S'};
function mapCh(ch){return UMLAUT[ch]||(ch>='a'&&ch<='z'?ch.toUpperCase():ch);}
// custom fonts (baked in the studio, stored in the project): {name,h,sp,chars,w:[],data(base64 rows, LSB first)}
let CUR_FONTS={},FONTLIB={};
function compileFont(F){
  if(F._c)return F._c;
  const bits=b64d(F.data),map=new Map();let off=0;
  [...F.chars].forEach((ch,i)=>{const w=F.w[i]|0;map.set(ch,{w,off});off+=((w+7)>>3)*F.h;});
  return F._c={h:F.h,sp:F.sp??1,map,bits,custom:true};
}
function fontOf(key){if(key==='medium')return FONTS.medium;if(key==='small'||!key)return FONTS.small;const F=CUR_FONTS[key];return F?compileFont(F):FONTS.small;}
function fontH(key){return fontOf(key).h;}
// returns {w, draw(fb,x,y,sc)} for one character
function glyphOf(f,ch){
  if(f.custom){
    const g=f.map.get(ch)||f.map.get(mapCh(ch))||f.map.get('?');
    if(!g)return{w:Math.max(1,f.h>>2),off:-1};
    return g;
  }
  const c=mapCh(ch);return f.g[c]||f.g['?']||f.g[' '];
}
function glyphW(f,g){return f.custom?g.w:g.length;}
function drawGlyph(fb,x,y,f,g,sc){
  if(f.custom){
    if(g.off<0)return;const st=(g.w+7)>>3;
    for(let r=0;r<f.h;r++)for(let c=0;c<g.w;c++)if((f.bits[g.off+r*st+(c>>3)]>>(c&7))&1){if(sc===1)fb.px(x+c,y+r);else fb.box(x+c*sc,y+r*sc,sc,sc);}
    return;
  }
  for(let c=0;c<g.length;c++)for(let r=0;r<f.h;r++)if((g[c]>>r)&1){if(sc===1)fb.px(x+c,y+r);else fb.box(x+c*sc,y+r*sc,sc,sc);}
}
function textW(str,font,sc=1){const f=fontOf(font);let w=0;for(const ch of str)w+=(glyphW(f,glyphOf(f,ch))+f.sp)*sc;return Math.max(0,w-f.sp*sc);}
function drawText(fb,x,y,str,font,sc=1){
  const f=fontOf(font);
  for(const ch of str){const g=glyphOf(f,ch);drawGlyph(fb,x,y,f,g,sc);x+=(glyphW(f,g)+f.sp)*sc;}
  return x;
}

/* ---------- Time ---------- */
const NAMES={
  en:{wd:['SUN','MON','TUE','WED','THU','FRI','SAT'],mon:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']},
  de:{wd:['SO','MO','DI','MI','DO','FR','SA'],mon:['JAN','FEB','MRZ','APR','MAI','JUN','JUL','AUG','SEP','OKT','NOV','DEZ']}
};
function timeObj(ms){
  const d=new Date(ms);
  let tz='';try{tz=(new Intl.DateTimeFormat('en-GB',{timeZoneName:'short'}).formatToParts(d).find(p=>p.type==='timeZoneName')||{}).value||'';}catch(e){}
  return{t:ms,h:d.getHours(),m:d.getMinutes(),s:d.getSeconds(),ms:d.getMilliseconds(),D:d.getDate(),M:d.getMonth(),Y:d.getFullYear(),wd:d.getDay(),
    doy:Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(d.getFullYear(),0,1))/864e5)+1,tz:tz.toUpperCase()};
}
const p2=n=>String(n).padStart(2,'0');
const isLeap=y=>(y%4===0&&y%100!==0)||y%400===0;
const MDAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
const daysInMonth=(y,m)=>m===1&&isLeap(y)?29:MDAYS[m];
function isoWeeks(y){const p=v=>(v+Math.floor(v/4)-Math.floor(v/100)+Math.floor(v/400))%7;return p(y)===4||p(y-1)===3?53:52;}
function isoWeek(T){const iwd=T.wd===0?7:T.wd;const w=Math.floor((T.doy-iwd+10)/7);if(w<1)return isoWeeks(T.Y-1);if(w>isoWeeks(T.Y))return 1;return w;}

/* ---------- System stats (filled by the device or sample values) ---------- */
let SYS={cpu:23,ram:41,fs:12,temp:44.5,rssi:-58,up:93784,ip:'192.168.1.50'};
function fUp(u){const d=Math.floor(u/86400),h=Math.floor(u%86400/3600),m=Math.floor(u%3600/60);return d>0?d+'D '+p2(h)+'H':p2(h)+':'+p2(m);}

/* ---------- Weather (filled by the device or the studio) ---------- */
let WX={ok:false};
const WXTXT={en:['CLEAR','MOSTLY CLEAR','PARTLY CLOUDY','OVERCAST','FOG','DRIZZLE','RAIN','SNOW','SHOWERS','THUNDER'],
             de:['KLAR','HEITER','WOLKIG','BEDECKT','NEBEL','NIESELN','REGEN','SCHNEE','SCHAUER','GEWITTER']};
function wxIdx(c){if(c===0)return 0;if(c===1)return 1;if(c===2)return 2;if(c===3)return 3;if(c===45||c===48)return 4;if(c>=51&&c<=57)return 5;if(c>=61&&c<=67)return 6;if((c>=71&&c<=77)||c===85||c===86)return 7;if(c>=80&&c<=82)return 8;if(c>=95)return 9;return -1;}
function fnum(v,dec){if(dec===0)return String(jround(v)).replace(/^-0$/,'0');const n=jround(v*10),a=Math.abs(n);return(n<0?'-':'')+Math.floor(a/10)+'.'+(a%10);}

function fmt(str,T,lang,salt){
  const N=NAMES[lang]||NAMES.en, de=lang==='de';
  return str.replace(/\{(\w+)\}/g,(m,k)=>{
    switch(k){
      case'HH':return p2(T.h);case'MM':return p2(T.m);case'SS':return p2(T.s);
      case'DD':return p2(T.D);case'MO':return p2(T.M+1);case'MON':return N.mon[T.M];
      case'YYYY':return String(T.Y);case'YY':return p2(T.Y%100);case'WD':return N.wd[T.wd];
      case'DOY':return String(T.doy).padStart(3,'0');case'TZ':return T.tz;
      case'KW':case'WEEK':return p2(isoWeek(T));
      case'DLEFT':return String((isLeap(T.Y)?366:365)-T.doy);
      case'YPCT':return String(Math.floor((T.doy-1)*100/(isLeap(T.Y)?366:365)));
      case'HEX':case'HEX8':{const r=rng(hash(Math.floor(T.t/120),salt));let s='';for(let i=0;i<(k==='HEX'?4:8);i++)s+='0123456789ABCDEF'[Math.floor(r()*16)];return s;}
    }
    const w=WX;
    switch(k){
      case'TEMP':return w.ok?fnum(w.temp,0):'--';case'TEMP1':return w.ok?fnum(w.temp,1):'--';
      case'FEELS':return w.ok?fnum(w.feels,0):'--';case'TMAX':return w.ok?fnum(w.tmax,0):'--';case'TMIN':return w.ok?fnum(w.tmin,0):'--';
      case'HUM':return w.ok?fnum(w.hum,0):'--';case'RAIN':return w.ok?fnum(w.rain,1):'--';case'RAINNOW':return w.ok?fnum(w.rainNow,1):'--';
      case'POP':return w.ok?fnum(w.pop,0):'--';case'WIND':return w.ok?fnum(w.wind,0):'--';
      case'WX':{const i=w.ok?wxIdx(w.code):-1;return i<0?'--':WXTXT[de?'de':'en'][i];}
      case'SUNRISE':return w.ok?w.sunrise:'--:--';case'SUNSET':return w.ok?w.sunset:'--:--';
      case'CITY':return w.city||'';
      case'CPU':return fnum(SYS.cpu,0);case'RAM':return fnum(SYS.ram,0);case'FS':return fnum(SYS.fs,0);case'TEMPC':return fnum(SYS.temp,0);
      case'RSSI':return String(SYS.rssi);case'UPTIME':return fUp(SYS.up);case'IP':return SYS.ip||'';
    }
    return m;
  });
}

/* ---------- Segment digits ---------- */
const SEG={'0':0x3F,'1':0x06,'2':0x5B,'3':0x4F,'4':0x66,'5':0x6D,'6':0x7D,'7':0x07,'8':0x7F,'9':0x6F,'-':0x40};
function segChar(fb,x,y,ch,o){
  const m=SEG[ch]; if(m===undefined)return;
  const {w,h,t,gap,skew,style}=o, half=t>>1, bot=y+h-1;
  const P=(px,py)=>{if(style==='striped'&&((py-y)%3===2))return;fb.px(px+Math.round((bot-py)*skew),py);};
  const xl=x+half,xr=x+w-half,ya=y+half,yg=y+(h>>1),yd=y+h-half;
  const hs=yc=>{for(let i=0;i<t;i++){const ins=(Math.abs(2*i-(t-1))>>1)+gap,yy=yc-half+i,x0=xl+ins,x1=xr-ins,edge=i===0||i===t-1;
    for(let xx=x0;xx<x1;xx++){if(style==='outline'&&!edge&&xx!==x0&&xx!==x1-1)continue;P(xx,yy);}}};
  const vs=(xc,y0,y1)=>{for(let j=0;j<t;j++){const ins=(Math.abs(2*j-(t-1))>>1)+gap,xx=xc-half+j,a=y0+ins,b=y1-ins,edge=j===0||j===t-1;
    for(let yy=a;yy<b;yy++){if(style==='outline'&&!edge&&yy!==a&&yy!==b-1)continue;P(xx,yy);}}};
  if(m&1)hs(ya); if(m&64)hs(yg); if(m&8)hs(yd);
  if(m&32)vs(xl,ya,yg); if(m&2)vs(xr,ya,yg); if(m&16)vs(xl,yg,yd); if(m&4)vs(xr,yg,yd);
}
function clockString(L,T){
  let s=L.format.replace('HH',p2(L.h12?((T.h+11)%12+1):T.h)).replace('MM',p2(T.m)).replace('SS',p2(T.s));
  if(!L.lead0&&s[0]==='0')s=' '+s.slice(1);
  return s;
}
function clockW(L,s){let w=0;for(const ch of s)w+=(ch===':'||ch==='.'?L.t:L.w)+L.spacing;return w-L.spacing;}
function drawClock(fb,L,T){
  const s=clockString(L,T), tw=clockW(L,s);
  let x=L.align==='center'?Math.round(L.x-tw/2):L.align==='right'?L.x-tw:L.x;
  const colonOn=L.colon==='on'||(L.colon==='blink'&&T.ms<500), bot=L.y+L.h-1, half=L.t>>1;
  const dotAt=(cx,cy)=>{for(let j=0;j<L.t;j++)for(let i=0;i<L.t;i++){const py=cy-half+j;if(L.style==='striped'&&((py-L.y)%3===2))continue;fb.px(cx+i+Math.round((bot-py)*L.skew),py);}};
  for(const ch of s){
    if(ch===':'){if(colonOn){dotAt(x,L.y+Math.round(L.h*0.3));dotAt(x,L.y+Math.round(L.h*0.7));}x+=L.t+L.spacing;}
    else if(ch==='.'){dotAt(x,L.y+L.h-half-1);x+=L.t+L.spacing;}
    else{segChar(fb,x,L.y,ch,L);x+=L.w+L.spacing;}
  }
}

/* ---------- fill patterns (1-bit "greys") ---------- */
const PATTERNS=['solid','outline','d25','d50','d75','hlines','vlines','diag','sunset'];
function patOn(fill,px,py,y,h){
  switch(fill){
    case'd25':return(px&1)===0&&(py&1)===0;
    case'd50':return((px+py)&1)===0;
    case'd75':return!((px&1)===0&&(py&1)===0);
    case'hlines':return(py&1)===0;
    case'vlines':return(px&1)===0;
    case'diag':return((px+py)&3)===0;
    case'sunset':{const r=py-y,q=8*r-3*h;if(q<0)return true;return(r%5)>=Math.floor(q/h);}
  }
  return true;
}
/* ---------- shapes: doubled coordinates around the box centre, integer maths only ---------- */
function inShape(kind,dir,X,Y,w,h,t){
  switch(kind){
    case'rect':return X>=-(w-1)&&X<=w-1&&Y>=-(h-1)&&Y<=h-1;
    case'diamond':return Math.abs(X)*h+Math.abs(Y)*w<=w*h;
    case'triangle':{
      let x=X,y=Y,ww=w,hh=h;
      if(dir===1){x=Y;y=-X;ww=h;hh=w;}else if(dir===2){y=-Y;}else if(dir===3){x=Y;y=X;ww=h;hh=w;}
      return y>=-hh&&y<=hh&&Math.abs(x)*2*hh<=(y+hh)*ww;
    }
  }
  if(X*X*h*h+Y*Y*w*w>w*w*h*h)return false;          // ellipse
  if(kind==='ring'){const iw=w-2*t,ih=h-2*t;if(iw>0&&ih>0&&X*X*ih*ih+Y*Y*iw*iw<=iw*iw*ih*ih)return false;}
  if(kind==='half')return dir===0?Y<=0:dir===1?X>=0:dir===2?Y>=0:X<=0;
  if(kind==='quarter')return dir===0?X<=0&&Y<=0:dir===1?X>=0&&Y<=0:dir===2?X>=0&&Y>=0:X<=0&&Y>=0;
  return true;
}
function drawShape(fb,L,T){
  const w=L.w,h=L.h;if(w<1||h<1)return;
  let dir=L.dir&3;if(L.spin>0)dir=(dir+Math.floor(T.t/L.spin))&3;
  const t=Math.max(1,L.t);
  for(let py=L.y;py<L.y+h;py++)for(let px=L.x;px<L.x+w;px++){
    const X=2*(px-L.x)-(w-1),Y=2*(py-L.y)-(h-1);
    if(!inShape(L.kind,dir,X,Y,w,h,t))continue;
    if(L.fill==='outline'){const d=2*t;
      if(inShape(L.kind,dir,X-d,Y,w,h,t)&&inShape(L.kind,dir,X+d,Y,w,h,t)&&inShape(L.kind,dir,X,Y-d,w,h,t)&&inShape(L.kind,dir,X,Y+d,w,h,t))continue;}
    else if(!patOn(L.fill,px,py,L.y,h))continue;
    fb.px(px,py);
  }
}
function parsePts(s){const o=[];String(s||'').trim().split(/\s+/).forEach(p=>{const v=p.split(',');if(v.length===2){const x=parseInt(v[0]),y=parseInt(v[1]);if(!isNaN(x)&&!isNaN(y))o.push(x,y);}});return o;}
function drawPoly(fb,L){
  const p=L._pk===L.pts?L._p:(L._pk=L.pts,L._p=parsePts(L.pts)),n=p.length>>1;if(n<2)return;
  if(L.fill==='outline'){for(let i=0;i<n;i++){const j=(i+1)%n;fb.line(p[2*i],p[2*i+1],p[2*j],p[2*j+1],0);}return;}
  let y0=H,y1=-1;for(let i=0;i<n;i++){y0=Math.min(y0,p[2*i+1]);y1=Math.max(y1,p[2*i+1]);}
  const xs=[];
  for(let y=Math.max(0,y0);y<=Math.min(H-1,y1);y++){
    const yc=y+0.5;xs.length=0;
    for(let i=0;i<n;i++){const j=(i+1)%n,ax=p[2*i],ay=p[2*i+1],bx=p[2*j],by=p[2*j+1];
      if((ay<=yc)!==(by<=yc))xs.push(ax+(yc-ay)*(bx-ax)/(by-ay));}
    xs.sort((a,b)=>a-b);
    for(let k=0;k+1<xs.length;k+=2){const a=Math.ceil(xs[k]-0.5),b=Math.floor(xs[k+1]-0.5);
      for(let x=a;x<=b;x++)if(patOn(L.fill,x,y,y0,y1-y0+1))fb.px(x,y);}
  }
}
/* ---------- 80s perspective floor ---------- */
function drawSynth(fb,L,T){
  const f=(T.t%1000000)/1000*L.speed,ph=f-Math.floor(f),n=Math.max(1,L.lines);
  if(L.horizon)fb.hl(0,L.hy,W);
  for(let i=0;i<n;i++){const tt=(i+ph)/n,y=L.hy+jround((H-1-L.hy)*tt*tt);if(y>L.hy)fb.hl(0,y,W);}
  const sp=Math.max(2,L.spacing),K=Math.ceil(W/2/sp)+1;
  for(let k=-K;k<=K;k++)fb.line(L.vx+jround(k*sp*0.06),L.hy+1,L.vx+k*sp,H-1,0);
}
/* ---------- time in dots ---------- */
function dotsState(L,T){
  const ny=isLeap(T.Y)?366:365;
  switch(L.source){
    case'month':return[daysInMonth(T.Y,T.M),T.D-1];
    case'week':return[168,((T.wd+6)%7)*24+T.h];
    case'day':return[96,T.h*4+Math.floor(T.m/15)];
    case'hour':return[60,T.m];
    case'life':{const by=parseInt(String(L.birth).slice(0,4))||1990,bm=parseInt(String(L.birth).slice(5,7))||1;
      const n=Math.max(1,L.years)*12;return[n,Math.max(0,Math.min(n,(T.Y-by)*12+(T.M+1-bm)))];}
  }
  return[ny,T.doy-1];
}
function drawDots(fb,L,T){
  const[n,done]=dotsState(L,T),cols=Math.max(1,L.cols),c=Math.max(1,L.cell),d=Math.max(1,Math.min(L.dot,c));
  for(let i=0;i<n;i++){const x=L.x+(i%cols)*c,y=L.y+Math.floor(i/cols)*c;
    if(i<done)fb.box(x,y,d,d);
    else if(i===done){if(T.ms<500)fb.box(x,y,d,d);else if(d>2)fb.frame(x,y,d,d);}
    else if(L.future==='dot')fb.px(x+((d-1)>>1),y+((d-1)>>1));
    else if(L.future==='frame'){if(d>2)fb.frame(x,y,d,d);else fb.px(x,y);}
  }
}
/* ---------- spinning globe ---------- */
function globeLUT(L){
  const k=L.r+'|'+L.tilt;if(L._gk===k)return L._g;
  const r=L.r,R=r+0.5,a=jround(L.tilt*256/360)&255,ct=icos(a)/4096,st=isin(a)/4096,out=[];
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    const nx=dx/R,ny=dy/R,d=nx*nx+ny*ny;if(d>1)continue;
    const nz=Math.sqrt(1-d),yu=-ny,y2=yu*ct+nz*st,z2=nz*ct-yu*st;
    const lat=fatan2(y2,Math.sqrt(nx*nx+z2*z2)),lon=fatan2(nx,z2);
    let row=Math.floor((0.5-lat/PI)*128);if(row<0)row=0;if(row>127)row=127;
    const lonFx=Math.floor((lon/(2*PI)+0.5)*16777216);
    const lit=-0.55*nx+0.45*yu+0.7*nz,rim=d>=((R-1)/R)*((R-1)/R);
    out.push(dx,dy,row,lonFx,lit<0?1:0,rim?1:0);
  }
  L._gk=k;L._g=out;return out;
}
function drawGlobe(fb,L,T){
  const g=globeLUT(L),rot=Math.floor((T.t%360000000)/1000*L.speed/360*16777216);
  for(let i=0;i<g.length;i+=6){
    const px=L.x+g[i],py=L.y+g[i+1],row=g[i+2],dark=g[i+4];
    if(L.rim&&g[i+5]){fb.px(px,py);continue;}
    let c=(g[i+3]+rot)%16777216;if(c<0)c+=16777216;const col=Math.floor(c/65536);
    if((LAND[row*32+(col>>3)]>>(col&7))&1){if(!(L.night&&dark)||((px+py)&1)===0)fb.px(px,py);}
    else if(L.ocean==='dots'){if((col&7)===0&&(row&7)===4&&!dark)fb.px(px,py);}
    else if(L.ocean==='grid'){if(((col&31)===0||(row&15)===0)&&((px+py)&1)===0)fb.px(px,py);}
  }
  if(L.marker&&WX.lat!=null&&WX.lon!=null){
    const R=L.r+0.5,colLoc=Math.floor((WX.lon+180)/360*256)*65536;
    let sl=(colLoc-rot)%16777216;if(sl<0)sl+=16777216;
    const lam=Math.floor(sl/65536)-128,phi=jround(WX.lat*256/360);   // 256 steps per turn
    const la=jround(lam),cp=icos(phi)/4096,sp=isin(phi)/4096,x=cp*isin(la)/4096,y2=sp,z2=cp*icos(la)/4096;
    const a=jround(L.tilt*256/360)&255,ct=icos(a)/4096,st=isin(a)/4096,yu=y2*ct-z2*st,nz=y2*st+z2*ct;
    if(nz>0){const mx=L.x+jround(x*R),my=L.y+jround(-yu*R);
      fb.color=2;fb.px(mx,my);if(T.ms<500){fb.px(mx-1,my);fb.px(mx+1,my);fb.px(mx,my-1);fb.px(mx,my+1);}fb.color=1;}
  }
}
/* ---------- weather icon (16x16 grid, scalable) ---------- */
function wxKind(code,day){
  if(code==null)return'cloud';if(code<=1)return day?'clear':'night';if(code===2)return day?'partly':'partlynight';if(code===3)return'cloud';
  if(code===45||code===48)return'fog';if((code>=51&&code<=67)||(code>=80&&code<=82))return'rain';
  if((code>=71&&code<=77)||code===85||code===86)return'snow';if(code>=95)return'storm';return'cloud';
}
function iconBits(kind,fr){
  const g=new Uint8Array(256),set=(x,y,v=1)=>{if(x>=0&&y>=0&&x<16&&y<16)g[y*16+x]=v;};
  const disc=(cx,cy,r,v=1)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++)if((x-cx)*(x-cx)+(y-cy)*(y-cy)<=r*r+r)set(x,y,v);};
  const sun=(cx,cy,r,ray)=>{disc(cx,cy,r);const a=r+2;
    if(fr%2===0){for(let k=0;k<ray;k++){set(cx+a+k,cy);set(cx-a-k,cy);set(cx,cy+a+k);set(cx,cy-a-k);}}
    else{const b=r+1;for(let k=0;k<ray;k++){set(cx+b+k,cy+b+k);set(cx-b-k,cy+b+k);set(cx+b+k,cy-b-k);set(cx-b-k,cy-b-k);}}};
  const moon=(cx,cy,r)=>{disc(cx,cy,r);disc(cx+2,cy-2,r-1,0);};
  const cloud=(ox,oy)=>{const f=new Uint8Array(256);
    const fd=(cx,cy,r)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++)if((x-cx)*(x-cx)+(y-cy)*(y-cy)<=r*r+r)f[y*16+x]=1;};
    fd(ox+4,oy+9,3);fd(ox+8,oy+6,4);fd(ox+12,oy+9,3);for(let y=oy+9;y<=oy+12;y++)for(let x=ox+4;x<=ox+12;x++)if(x>=0&&y>=0&&x<16&&y<16)f[y*16+x]=1;
    const at=(x,y)=>x>=0&&y>=0&&x<16&&y<16&&f[y*16+x];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(f[y*16+x]){const e=!at(x-1,y)||!at(x+1,y)||!at(x,y-1)||!at(x,y+1);set(x,y,e?1:0);}};
  switch(kind){
    case'clear':sun(8,8,3,2);break;
    case'night':moon(8,8,5);break;
    case'partly':sun(5,5,2,1);cloud(1,2);break;
    case'partlynight':moon(5,5,3);cloud(1,2);break;
    case'fog':for(let k=0;k<4;k++){const y=4+k*3,o=((fr+k)%4)<2?0:1;for(let x=2+o;x<14+o;x++)if((x+k)%5!==0)set(x,y);}break;
    case'rain':cloud(0,-2);for(let k=0;k<3;k++){const x=4+k*4,y=11+((fr+k)%3);set(x,y);set(x-1,y+1);}break;
    case'snow':cloud(0,-2);for(let k=0;k<4;k++){const x=3+k*3+(k&1),y=12+((fr+k*2)%4);set(x,y);}break;
    case'storm':cloud(0,-2);if(fr%4!==0){const pts=[9,10,7,12,9,12,7,15];for(let i=0;i<pts.length-2;i+=2){let x0=pts[i],y0=pts[i+1];const x1=pts[i+2],y1=pts[i+3];
      while(true){set(x0,y0);if(x0===x1&&y0===y1)break;if(x0!==x1)x0+=x1>x0?1:-1;if(y0!==y1)y0+=y1>y0?1:-1;}}}break;
    default:cloud(0,0);
  }
  return g;
}
function drawWxIcon(fb,L,T){
  const kind=L.icon==='auto'?wxKind(WX.ok?WX.code:null,WX.ok?WX.day!==false:true):L.icon;
  const fr=L.animate?Math.floor(T.t/250):0,g=iconBits(kind,fr),s=Math.max(1,L.scale);
  for(let i=0;i<256;i++)if(g[i])fb.box(L.x+(i&15)*s,L.y+(i>>4)*s,s,s);
}
/* ---------- hourly graph ---------- */
function drawGraph(fb,L){
  if(!WX.ok)return;const src=L.source==='pop'?WX.hP:L.source==='rain'?WX.hR:WX.hT;if(!src||!src.length)return;
  const n=Math.max(2,Math.min(L.hours,src.length));let lo=0,hi=100;
  if(L.source==='temp'){lo=Infinity;hi=-Infinity;for(let i=0;i<n;i++){lo=Math.min(lo,src[i]);hi=Math.max(hi,src[i]);}if(hi-lo<1)hi=lo+1;}
  else if(L.source==='rain'){lo=0;hi=1;for(let i=0;i<n;i++)hi=Math.max(hi,src[i]);}
  const nv=i=>Math.max(0,Math.min(1,(src[i]-lo)/(hi-lo)));
  if(L.style==='line'){let px=0,py=0;for(let i=0;i<n;i++){const x=L.x+jround(i*(L.w-1)/(n-1)),y=L.y+L.h-1-jround(nv(i)*(L.h-1));if(i)fb.line(px,py,x,y,0);px=x;py=y;}return;}
  const bw=Math.max(1,Math.floor(L.w/n));
  for(let i=0;i<n;i++){const bh=jround(nv(i)*L.h),x=L.x+i*bw;
    if(L.style==='dots'){fb.px(x,L.y+L.h-1);if(bh>0)fb.px(x,L.y+L.h-bh);}
    else{if(bh>0)fb.box(x,L.y+L.h-bh,Math.max(1,bw-1),bh);else fb.px(x,L.y+L.h-1);}}
}
/* ---------- text with animation ---------- */
const SCRAMBLE='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$*+=<>/';
function drawTextLayer(fb,L,T,P,li){
  const phrases=String(L.text).split('|'),np=phrases.length,cyc=L.cycle>0;
  const idx=cyc?Math.floor(T.t/L.cycle)%np:0;
  const s=fmt(phrases[idx],T,P.lang,li),chars=[...s],f=fontOf(L.font),sc=Math.max(1,L.scale|0),ms=Math.max(10,(L.fxMs|0)||60);
  const w=textW(s,L.font,sc);
  let x=L.align==='center'?jround(L.x-w/2):L.align==='right'?L.x-w:L.x;
  const fx=L.fx||'none',tt=TT;
  if(fx==='none'&&!tt){drawText(fb,x,L.y,s,L.font,sc);return;}
  const period=cyc?L.cycle:(chars.length+30)*ms,tp=cyc?T.t%L.cycle:T.t%period;
  const shown=fx==='type'?Math.floor(tp/ms):chars.length,n=chars.length,tShown=tt&&tt.kind==='type'?Math.floor(tt.a*n):n;
  const sf=f.custom?[...f.map.keys()].filter(c=>c!==' '):[...SCRAMBLE];
  for(let ci=0;ci<chars.length;ci++){
    if(ci>=shown){if(Math.floor(T.t/350)%2===0)drawText(fb,x,L.y,'_',L.font,sc);return;}
    if(ci>=tShown)return;
    let ch=chars[ci],dy=0;
    if(fx==='wave')dy=jround(L.amp*isin((Math.floor(T.t*16/ms)+ci*24)&255)/4096);
    else if(fx==='bounce')dy=-Math.abs(jround(L.amp*isin((Math.floor(T.t*16/ms)+ci*24)&255)/4096));
    else if(fx==='scramble'&&ch!==' '&&tp<ci*ms+200){const r=rng(hash(Math.floor(T.t/50),li*131+ci));ch=sf[Math.floor(r()*sf.length)]||ch;}
    else if(fx==='flicker'){const r=rng(hash(Math.floor(T.t/80),li*97+ci));if(r()<L.amp/20)ch=' ';}
    if(tt&&tt.kind==='scramble'&&ch!==' '&&tt.a*n<ci+1){const r=rng(hash(Math.floor(T.t/50),li*131+ci));ch=sf[Math.floor(r()*sf.length)]||ch;}
    const g0=glyphOf(f,chars[ci]),g=glyphOf(f,ch);
    drawGlyph(fb,x,L.y+dy*sc,f,g,sc);x+=(glyphW(f,g0)+f.sp)*sc;
  }
}
/* ---------- layer types ---------- */
const COMMON=[['name','text'],['blink','int','Blink period ms, 0 = off'],['mode','sel',['set','clear','xor']],
  ['move','sel',['none','slide','pingpong','sine','circle']],['moveX','int','Move distance x (px)'],['moveY','int','Move distance y (px)'],['movePeriod','int','Move period ms'],['movePhase','num','Phase 0–1']];
const TRANS=['none','dissolve','wipe','slide','type','scramble'];
const TIMING=[['at','time','Start in the loop (ms), empty = always visible'],['length','int','Length ms, 0 = until loop end'],['in','sel',TRANS],['out','sel',TRANS],['tr','int','Transition ms'],['dip','bool','Brightness dip at start and end']];
const FONTSEL='font';
const TYPES={
  clock:{label:'Segment clock',def:{format:'HH:MM',x:8,y:6,align:'left',w:22,h:36,t:4,gap:1,spacing:4,skew:0.12,style:'solid',colon:'blink',lead0:true,h12:false},
    fields:[['format','text','Tokens HH MM SS, plus : . -'],['x','int'],['y','int'],['align','sel',['left','center','right']],['w','int'],['h','int'],['t','int','Stroke'],['gap','int'],['spacing','int'],['skew','num'],['style','sel',['solid','outline','striped']],['colon','sel',['blink','on','off']],['lead0','bool','Leading zero'],['h12','bool','12-hour']],
    draw:drawClock},
  text:{label:'Text',def:{x:4,y:4,text:'{WD} {DD}.{MON}',font:'medium',scale:1,align:'left',fx:'none',fxMs:60,amp:2,cycle:0},
    fields:[['text','text','Tokens: system {CPU} {RAM} {FS} {TEMPC} {RSSI} {UPTIME} {IP} · time {HH} {MM} {SS} {DD} {MO} {MON} {YYYY} {YY} {WD} {KW} {DOY} {DLEFT} {YPCT} {TZ} {HEX} · weather {TEMP} {TEMP1} {FEELS} {TMAX} {TMIN} {HUM} {RAIN} {RAINNOW} {POP} {WIND} {WX} {SUNRISE} {SUNSET} {CITY} · separate phrases with | and set cycle'],
      ['x','int'],['y','int'],['font',FONTSEL],['scale','int'],['align','sel',['left','center','right']],
      ['fx','sel',['none','type','scramble','wave','bounce','flicker']],['fxMs','int','Effect step ms'],['amp','int','Wave height px / flicker amount'],['cycle','int','ms per phrase, 0 = one phrase']],
    draw:drawTextLayer},
  marquee:{label:'Marquee',def:{x:0,y:40,w:256,text:'HELLO // ',font:'small',scale:1,speed:20},
    fields:[['text','text'],['x','int'],['y','int'],['w','int','Window width'],['font',FONTSEL],['scale','int'],['speed','num','px per second']],
    draw(fb,L,T,P,i){const s=fmt(L.text,T,P.lang,i),f=fontOf(L.font),tw=textW(s,L.font,L.scale)+f.sp*L.scale;if(tw<=0)return;
      const off=Math.floor((T.t/1000*L.speed)%tw);fb.clip=[L.x+fb.ox,L.y+fb.oy,L.x+L.w+fb.ox,L.y+f.h*L.scale+fb.oy];
      for(let x=L.x-off;x<L.x+L.w;x+=tw)drawText(fb,x,L.y,s,L.font,L.scale);fb.clip=null;}},
  shape:{label:'Shape',def:{kind:'circle',x:100,y:4,w:40,h:40,dir:0,fill:'solid',t:2,spin:0},
    fields:[['kind','sel',['circle','ring','half','quarter','triangle','rect','diamond']],['x','int'],['y','int'],['w','int'],['h','int'],['dir','int','Direction 0–3 (half, quarter, triangle)'],['fill','sel',PATTERNS],['t','int','Outline / ring thickness'],['spin','int','Turn 90° every … ms, 0 = off']],
    draw:drawShape},
  poly:{label:'Polygon',def:{pts:'0,47 40,20 70,34 110,12 150,30 190,16 255,47',fill:'solid'},
    fields:[['pts','text','Points "x,y x,y …"'],['fill','sel',PATTERNS]],draw:drawPoly},
  synth:{label:'80s grid',def:{hy:26,vx:128,spacing:24,lines:6,speed:0.6,horizon:true},
    fields:[['hy','int','Horizon y'],['vx','int','Vanishing x'],['spacing','int','Line spacing at bottom'],['lines','int','Horizontal lines'],['speed','num','Lines per second'],['horizon','bool','Horizon line']],draw:drawSynth},
  dots:{label:'Time in dots',def:{x:6,y:14,cols:61,cell:4,dot:3,source:'year',future:'dot',birth:'1990-01',years:80},
    fields:[['source','sel',['year','month','week','day','hour','life']],['x','int'],['y','int'],['cols','int'],['cell','int','Cell pitch px'],['dot','int','Dot size px'],['future','sel',['dot','frame','none']],['birth','text','Life: birth YYYY-MM'],['years','int','Life: years']],
    draw:drawDots},
  globe:{label:'Globe',def:{x:24,y:24,r:22,speed:18,tilt:20,ocean:'dots',night:true,rim:true,marker:true},
    fields:[['x','int','Centre x'],['y','int','Centre y'],['r','int','Radius'],['speed','num','Degrees per second'],['tilt','int','Tilt degrees'],['ocean','sel',['none','dots','grid']],['night','bool','Shade night side'],['rim','bool','Outline'],['marker','bool','Mark your location']],
    draw:drawGlobe},
  wxicon:{label:'Weather icon',def:{x:4,y:4,scale:2,icon:'auto',animate:true},
    fields:[['icon','sel',['auto','clear','night','partly','partlynight','cloud','rain','snow','storm','fog']],['x','int'],['y','int'],['scale','int'],['animate','bool']],draw:drawWxIcon},
  graph:{label:'Weather graph',def:{x:150,y:20,w:100,h:24,source:'temp',style:'bars',hours:24},
    fields:[['source','sel',['temp','pop','rain']],['style','sel',['bars','line','dots']],['x','int'],['y','int'],['w','int'],['h','int'],['hours','int']],draw:drawGraph},
  bar:{label:'Progress bar',def:{x:0,y:44,w:256,h:4,source:'sec',style:'ticks',n:30},
    fields:[['x','int'],['y','int'],['w','int'],['h','int'],['source','sel',['sec','min','hour','day','year','cpu','ram','fs']],['style','sel',['fill','ticks','dots']],['n','int','Ticks']],
    draw(fb,L,T){
      const p=Math.max(0,Math.min(1,{sec:(T.s+T.ms/1000)/60,min:(T.m+T.s/60)/60,hour:(T.h%12+T.m/60)/12,day:(T.h+T.m/60)/24,year:T.doy/365,cpu:SYS.cpu/100,ram:SYS.ram/100,fs:SYS.fs/100}[L.source]||0));
      if(L.style==='fill'){if(L.h>2){fb.frame(L.x,L.y,L.w,L.h);fb.box(L.x+2,L.y+2,Math.round((L.w-4)*p),L.h-4);}else fb.box(L.x,L.y,Math.round(L.w*p),L.h);return;}
      const n=Math.max(1,L.n),pitch=L.w/n,tw=Math.max(1,Math.floor(pitch)-1),lit=Math.floor(p*n);
      for(let i=0;i<n;i++){const tx=L.x+Math.round(i*pitch);
        if(i<lit||(i===lit&&T.ms<500))fb.box(tx,L.y,tw,L.h);
        else if(L.style==='dots')fb.px(tx,L.y+L.h-1); else fb.hl(tx,L.y+L.h-1,tw);}
    }},
  rect:{label:'Rectangle',def:{x:10,y:10,w:40,h:20,fill:false},fields:[['x','int'],['y','int'],['w','int'],['h','int'],['fill','bool','Filled']],
    draw(fb,L){L.fill?fb.box(L.x,L.y,L.w,L.h):fb.frame(L.x,L.y,L.w,L.h);}},
  corners:{label:'Corner brackets',def:{x:0,y:0,w:256,h:48,len:4},fields:[['x','int'],['y','int'],['w','int'],['h','int'],['len','int']],
    draw(fb,L){const{x,y,w,h,len}=L,r=x+w-1,b=y+h-1;fb.hl(x,y,len);fb.vl(x,y+1,len-1);fb.hl(r-len+1,y,len);fb.vl(r,y+1,len-1);fb.hl(x,b,len);fb.vl(x,b-len+1,len-1);fb.hl(r-len+1,b,len);fb.vl(r,b-len+1,len-1);}},
  line:{label:'Line',def:{x1:0,y1:24,x2:255,y2:24,dash:0},fields:[['x1','int'],['y1','int'],['x2','int'],['y2','int'],['dash','int','Dash length, 0 = solid']],
    draw(fb,L){fb.line(L.x1,L.y1,L.x2,L.y2,L.dash);}},
  bitmap:{label:'Bitmap',def:{x:0,y:0,w:8,h:8,invert:false,data:''},fields:[['x','int'],['y','int'],['invert','bool','Invert']],
    draw(fb,L){if(!L._b)L._b=b64d(L.data);fb.xbm(L.x,L.y,L.w,L.h,L._b,L.invert);}},
  anim:{label:'Animation',def:{x:0,y:0,w:8,h:8,n:1,ms:100,invert:false,data:''},fields:[['x','int'],['y','int'],['ms','int','ms per frame'],['invert','bool','Invert']],
    draw(fb,L,T){if(!L._b)L._b=b64d(L.data);const n=Math.max(1,L.n),fsz=((L.w+7)>>3)*L.h,f=Math.floor(T.t/Math.max(10,L.ms))%n;
      fb.xbm(L.x,L.y,L.w,L.h,L._b.subarray(f*fsz,(f+1)*fsz),L.invert);}},
  glitch:{label:'FX · Glitch',fx:true,def:{trigger:'both',intensity:0.6,chance:0.06,dur:600},
    fields:[['trigger','sel',['minute','random','both','always']],['intensity','num','0–1'],['chance','num','Random chance per second'],['dur','int','Duration ms']],
    draw(fb,L,T,P,i){
      let on=FORCE_GLITCH>T.t;
      const intoMin=T.s*1000+T.ms;
      if((L.trigger==='minute'||L.trigger==='both')&&intoMin<L.dur)on=true;
      if(L.trigger==='random'||L.trigger==='both'){const slot=Math.floor(T.t/1000);if(rng(hash(slot,i*7+3))()<L.chance&&(T.t%1000)<L.dur*0.5)on=true;}
      if(L.trigger==='always')on=true;
      if(!on)return;
      const r=rng(hash(Math.floor(T.t/60),i+11)),k=L.intensity,row=new Uint8Array(W);
      const n=1+Math.floor(r()*k*6);
      for(let s=0;s<n;s++){const y0=Math.floor(r()*H),hh=1+Math.floor(r()*(2+6*k)),off=Math.round((r()*2-1)*24*k);
        for(let y=y0;y<Math.min(H,y0+hh);y++){for(let x=0;x<W;x++)row[x]=fb.p[y*W+x];for(let x=0;x<W;x++){const sx=x-off;fb.p[y*W+x]=sx>=0&&sx<W?row[sx]:0;}}}
      if(r()<k*0.6){const bx=Math.floor(r()*W),by=Math.floor(r()*H),bw=4+Math.floor(r()*30*k),bh=1+Math.floor(r()*4);fb.color=2;fb.box(bx,by,bw,bh);fb.color=1;}
    }},
  scan:{label:'FX · Scanline',fx:true,def:{period:5000,dur:700,rows:1},fields:[['period','int','ms'],['dur','int','Sweep ms'],['rows','int']],
    draw(fb,L,T){if(L.period<=0||L.dur<=0)return;const ph=T.t%L.period;if(ph>=L.dur)return;const y=Math.floor(ph/L.dur*(H+L.rows))-L.rows;fb.color=2;for(let r=0;r<L.rows;r++)fb.hl(0,y+r,W);fb.color=1;}},
  noise:{label:'FX · Noise',fx:true,def:{density:0.003},fields:[['density','num','Share of pixels flipped']],
    draw(fb,L,T,P,i){const r=rng(hash(Math.floor(T.t/50),i+29)),n=Math.floor(W*H*L.density);for(let k=0;k<n;k++){const j=Math.floor(r()*W*H);fb.p[j]^=1;}}}
};
let FORCE_GLITCH=0;

function moveOffset(L,T){
  const P=L.movePeriod|0;if(!L.move||L.move==='none'||P<=0)return[0,0];
  const tt=(T.t+Math.floor((L.movePhase||0)*P))%P,mx=L.moveX|0,my=L.moveY|0;
  switch(L.move){
    case'slide':return[Math.floor(mx*tt/P),Math.floor(my*tt/P)];
    case'pingpong':{const f=tt*2<P?2*tt/P:2-2*tt/P;return[jround(mx*f),jround(my*f)];}
    case'sine':{const a=Math.floor(tt*256/P);return[jround(mx*isin(a)/4096),jround(my*isin(a)/4096)];}
    case'circle':{const a=Math.floor(tt*256/P);return[jround(mx*icos(a)/4096),jround(my*isin(a)/4096)];}
  }
  return[0,0];
}
/* ---------- timeline ---------- */
const BAYER8=[0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
const SHIFTS={pos:[[0,0],[1,0],[1,1],[0,1]],neg:[[0,0],[-1,0],[-1,-1],[0,-1]],both:[[0,0],[1,0],[0,1],[-1,0],[0,-1]]};
const timed=L=>L.at!=null&&L.at!=='';
// the sequence start snaps to 50 ms = exactly 3 frames at 60 fps, so loop time and frame grid line up
const FRAME_MS=50/3;
function loopTime(P,T){const n=P.loop|0;if(n<=0)return -1;const t0=Math.floor((P._t0||0)/50)*50;return(((T.t-t0)%n)+n)%n;}
function timing(L,P,lt){  // [amount 0..1, dir: 0 full, 1 in, -1 out]
  if(lt<0||!timed(L))return[1,0];
  const loop=P.loop|0,at=L.at|0,dur=(L.length|0)>0?(L.length|0):loop-at;
  if(lt<at||lt>=at+dur)return[0,0];
  const tr=Math.max(0,L.tr|0);let a=1,dir=0;
  if(tr>0&&L.in&&L.in!=='none'&&lt-at<tr){a=(lt-at)/tr;dir=1;}
  if(tr>0&&L.out&&L.out!=='none'&&at+dur-lt<=tr){const b=(at+dur-lt)/tr;if(b<a){a=b;dir=-1;}}
  return[a,dir];
}
function dipFactor(P,lt){
  if(lt<0)return 1;const loop=P.loop|0;let f=1;
  for(const L of P.layers){if(!L.dip||!timed(L)||L.visible===false)continue;
    const at=L.at|0,dur=(L.length|0)>0?(L.length|0):loop-at,tr=(L.tr|0)>0?(L.tr|0):400;
    for(const e of[at,at+dur]){let d=Math.abs(lt-e);d=Math.min(d,loop-d);if(d<tr)f=Math.min(f,d/tr);}}
  return f;
}
/* keyframes: L.keys={prop:[[t,value,ease],…]} on the loop timeline; props dx dy (offset px), o (opacity 0–100), w h scale */
const KEYPROPS=['dx','dy','o','w','h','scale'],EASES=['linear','in','out','inout','hold'];
function easeF(e,f){switch(e){case'in':return f*f;case'out':return 1-(1-f)*(1-f);case'inout':return f<0.5?2*f*f:1-2*(1-f)*(1-f);case'hold':return 0;}return f;}
function keyVal(a,lt){
  const n=a.length;if(lt<=a[0][0])return a[0][1];if(lt>=a[n-1][0])return a[n-1][1];
  for(let i=0;i<n-1;i++){const k=a[i],m=a[i+1];if(lt<m[0]){const f=(lt-k[0])/(m[0]-k[0]);return k[1]+(m[1]-k[1])*easeF(k[2],f);}}
  return a[n-1][1];
}
function keyVals(L,lt){
  if(lt<0||!L.keys)return null;let out=null;
  lt=Math.floor(lt*3/50)*50/3;   // keyframes are sampled on the 60 fps frame grid: steady steps, no jitter
  for(const p of KEYPROPS){const a=L.keys[p];if(!Array.isArray(a)||!a.length)continue;
    const s=a.filter(k=>Array.isArray(k)&&k.length>=2&&isFinite(k[0])&&isFinite(k[1])).map(k=>[+k[0],+k[1],k[2]||'linear']).sort((x,y)=>x[0]-y[0]);if(!s.length)continue;
    (out=out||{})[p]=keyVal(s,lt);}
  return out;
}
let TT=null;const TMP=new FB();
function renderProject(fb,P,T,trackIdx){
  fb.clear();let bbox=null;CUR_FONTS=Object.assign({},FONTLIB,P.fonts||{});
  const lt=loopTime(P,T);
  P.layers.forEach((L,i)=>{
    if(L.visible===false)return;
    if(L.blink>0&&(T.t%L.blink)>=L.blink/2)return;
    const ty=TYPES[L.type];if(!ty)return;
    const[a,dir]=timing(L,P,lt);if(a<=0)return;
    const col=L.mode==='clear'?0:L.mode==='xor'?2:1;
    let o=ty.fx?[0,0]:moveOffset(L,T),mask=null;
    const kv=ty.fx?null:keyVals(L,lt),saved={};
    let op=1;
    if(kv){if(kv.dx!==undefined)o=[o[0]+jround(kv.dx),o[1]];if(kv.dy!==undefined)o=[o[0],o[1]+jround(kv.dy)];
      if(kv.o!==undefined)op=Math.max(0,Math.min(100,kv.o))/100;
      for(const p of['w','h','scale'])if(kv[p]!==undefined){saved[p]=L[p];L[p]=Math.max(p==='scale'?1:0,jround(kv[p]));}}
    if(op<=0){for(const p in saved)L[p]=saved[p];return;}
    if(dir!==0&&!ty.fx){
      const eff=dir>0?L.in:L.out;
      if(eff==='slide')o=[o[0],o[1]+(dir>0?1:-1)*jround((1-a)*16)];
      else if(L.type==='text'&&(eff==='type'||eff==='scramble'))TT={kind:eff,a};
      else if(eff==='wipe'){const n=Math.floor(a*W);mask=dir>0?(x=>x<n):(x=>x>=W-n);}
      else{const n=Math.floor(a*64);mask=(x,y)=>BAYER8[(y&7)*8+(x&7)]<n;}
    }
    if(op<1){const n=Math.floor(op*64),m0=mask,om=(x,y)=>BAYER8[(y&7)*8+(x&7)]<n;mask=m0?((x,y)=>m0(x,y)&&om(x,y)):om;}
    if(i===trackIdx)fb.track=[W,H,-1,-1];
    const tg=mask?TMP:fb;
    if(mask){TMP.clear();TMP.color=col===2?2:1;TMP.track=fb.track;}else fb.color=col;
    tg.ox=o[0];tg.oy=o[1];
    try{ty.draw(tg,L,T,P,i);}catch(e){console.warn(e);}
    if(mask){for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=y*W+x;if(TMP.p[k]&&mask(x,y))fb.p[k]=col===2?fb.p[k]^1:col;}
      TMP.track=null;TMP.ox=TMP.oy=0;TMP.clip=null;TMP.color=1;}
    TT=null;for(const p in saved)L[p]=saved[p];
    if(i===trackIdx){if(fb.track[2]>=0)bbox=fb.track;fb.track=null;}
    fb.color=1;fb.ox=0;fb.oy=0;fb.clip=null;
  });
  const seq=SHIFTS[P.shift===undefined?'both':P.shift===true?'pos':P.shift];  // default: ±1 px orbit
  if(seq){const k=Math.floor(T.t/300000)%seq.length,dx=seq[k][0],dy=seq[k][1];
    if(dx||dy){const c=fb.p.slice();fb.p.fill(0);
      for(let y=0;y<H;y++){const ny=y+dy;if(ny<0||ny>=H)continue;for(let x=0;x<W;x++){const nx=x+dx;if(nx>=0&&nx<W)fb.p[ny*W+nx]=c[y*W+x];}}}}
  fb.dip=dipFactor(P,lt);
  return bbox;
}

/* ---------- helpers ---------- */
function b64e(u8){let s='';for(let i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return btoa(s);}
function b64d(s){const b=atob(s||''),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
const LAND=b64d("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2P8Ptv8/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHB6/vz///8/AAAAAADIIwABHAAAAAAAAAAAAAAAAAAA8PcH/P///wMAAJ8DAAAAAAB4AAAAAAAAAAAAAAAAAAIL+PP/////BQAAnAAAAAAAAAAAAAAAAAAAAAAAAAAcBDjfAP////8EAAAAAAAAgAEAAG8AAAAAAAAAAAAAAPA/0n8AgP///wEAAAAAAAAHAID//wEAXgcAAAAAAAAAHwD1BAAA////AwAAAAAAwAEA4P9fAAAQAAAAAAAAAID3Hxc/BwD+//8AAAAAAABgAK78////D/gAAAD+//7//w/AxwbA/w8AYP7////z/z//gAQAAAAgADD/fwDw/x+/4z80GP0A9v9/AAAAgH8AABj//////////5s+/AMAAADAzxviCf8HAPj///8PAHAOABAAAAAAAAAAAADADwAAAAAAAMAP8AMA/////wOA4AAACgAAAAAAAAAAAMcBAAAAAAAA9AX7B/D/wP//gQMPAAAAAAAAAAAAAAAAAMD//////9988AP4BwAPAIB//vv//////////////38A+P//////fxCAAfADAAAA8J/////////////////v/wD8//////8fAB4AwAMAAAD4j///////////////f/QHAOAX4P///x8AfgIAAAAAAPAf8P////////////8/CAAAAAsA////PwB+BwAAAAA4MA/+////////////DwAGAACAAAD8////APwPAAAAADgAjv////////////8HgA8AACAAAPb///8H/h8AAAAAYMCD/////////////wGABwAAAAAA8v///x//PwAAAADOwPv/////////////K4ADAAAAAADw////P///AAAAAO75//////////////8vgAEAAAAAAOD//////38AAAAAwP3//////////////y+AAAAAAAAAwP//////gAEAAAAA/v//////////////LwAAAAAAAAAA//////+DAwAAAOD///////////////8vAAAAAAAAAAD//////wMBAAAAgP////f//////////ycAAAAAAAAAAP//////FwAAAACA//0f+cP/////////AwQAAAAAAAAA/////38CAAAAAIC/+Q/w8f////////8hAAAAAAAAAID/////PwAAAAAA/gPzD+Dj////////XzAAAAAAAAAAAP////8fAAAAAAD8Q8aP4+f///////8PAAAAAAAAAAAA/////wcAAAAAAPxAyPj/x///////nwcQAAAAAAAAAAD/////BwAAAAAA/gCI+P/H//////8PBhgAAAAAAAAAAP7///8DAAAAAAB8AITw/8///////38MDgAAAAAAAAAA/P///wMAAAAAAAD/AAD+////////HwwOAAAAAAAAAAD4////AQAAAAAA+H8AAP7///////8fYAEAAAAAAAAAAOD///8AAAAAAAD8/wAA/v///////z9wAAAAAAAAAAAAoP//PwAAAAAAAP7/xwP+////////PwAAAAAAAAAAAAAA//84AAAAAAAA/v////////////8/AAAAAAAAAAAAAAD/D2AAAAAAAAD///9///P//////38AAAAAAAAAAAAAgP4DYAAAAAAAgP/////+5///////PwAAAAAAAAAAAAAA/QdAAAAAAADA//////wf/v////8fAAAAAAAAAAAAAAD5BwABAAAAAOD/////+Y8A/////08AAAAAAAAAAAAAAPADAAAAAAAA4P/////x/wP+////JwAAAAAAAAAAAAAA4AeAAQAAAADw//////P/A/b//v8AAAAAAAAAAAAAAADgBwMGAAAAAPD/////8/8D8D/8TwAAAAAAAAAAAAAAAMCPA3AAAAAA8P/////n/wHwD/hnAAAAAAAAAAAAAAAAAP8BAAAAAADg/////89/APAH+A9AAAAAAAAAAAAAAAAA7AEAAAAAAPD/////zx8A8APoH0AAAAAAAAAAAAAAAADAHwAQAAAA8P////+fBwDgAcA/QAAAAAAAAAAAAAAAAAAeAAAAAADg/////78BAOABQD8AAAAAAAAAAAAAAAAAAAwAAAAAAPD/////fwAAwAFAPgAAAAAAAAAAAAAAAAAAGHwRAAAAwP////9/DwDAAUAMgAAAAAAAAAAAAAAAAACw/R8AAACA//////8PAMAAQACAAgAAAAAAAAAAAAAAAED/PwAAAID//////wcAAAJAAIADAAAAAAAAAAAAAAAAAP5/AAAAAP/7////BwAAAoABCAEAAAAAAAAAAAAAAAAA/v8HAAAATPD///8DAAAAsAMMAAAAAAAAAAAAAAAAAAD+/w8AAAAAgP///wEAAABgAwYAAAAAAAAAAAAAAAAAAP//DwAAAACA////AAAAAMCCDwAAAAAAAAAAAAAAAACA//8PAAAAAID//38AAAAA4OHvAQAAAAAAAAAAAAAAAIH//x8AAAAAwP//PwAAAACAw49EAAAAAAAAAAAAAAAAgP///wAAAACA//8fAAAAAADPJ0AGAQAAAAAAAAAAAACA////DwAAAAD//w8AAAAAAAZiwD8AAAAAAAAAAAAAAMD///8/AAAAAP//DwAAAAAABCAA/gAAAAAAAAAAAAAAgP///38AAAAA/v8PAAAAAAAYAID8QQAAAAAAAAAAAAAA////fwAAAAD+/w8AAAAAAMABIPyBAAAAAAAAAAAAAAD///9/AAAAAP7/DwAAAAAAAAAAMAMEAAAAAAAAAAAAAP7//z8AAAAA/P8fAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//HwAAAAD8/x8AAAAAAAAAQCEAAAAAAAAAAAAAAAD8//8PAAAAAP7/HwgAAAAAAADgIQAAAAAAAAAAAAAAAPz//w8AAAAA/v8fDAAAAAAAAPZgAEAAAAAAAAAAAAAA8P//DwAAAAD//w8HAAAAAAAA/2MAAAAAAAAAAAAAAADg//8PAAAAAP//hwcAAAAAAID/9wAAQAAAAAAAAAAAAMD//w8AAAAA/v+DBwAAAAAAwP//AAAAAAAAAAAAAAAAwP//BwAAAAD+/4EHAAAAAADw//8DAAAAAAAAAAAAAADA//8HAAAAAPz/gQMAAAAAAPz//wMAAAAAAAAAAAAAAMD//wEAAAAA/P+BAwAAAAAA/v//BwAAAAAAAAAAAAAAwP8/AAAAAAD8/4EDAAAAAAD+//8PAAAAAAAAAAAAAADA/x8AAAAAAPh/AAAAAAAAAP7//x8AAAAAAAAAAAAAAMD/HwAAAAAA+H8AAAAAAAAA/v//HwAAAAAAAAAAAAAA4P8fAAAAAADwfwAAAAAAAAD8//8fAAAAAAAAAAAAAADg/w8AAAAAAPA/AAAAAAAAAPz//x8AAAAAAAAAAAAAAOD/BwAAAAAA4B8AAAAAAAAA/M//HwAAAAAAAAAAAAAA4P8HAAAAAADgDwAAAAAAAAD8gP8PAAAAAAAAAAAAAADgvwMAAAAAAEAAAAAAAAAAABwA/QcAAAAAAAAAAAAAAPB/AAAAAAAAAAAAAAAAAAAAAAD6BwAAAAAAAAAAAAAA8H8AAAAAAAAAAAAAAAAAAAAAAPgHABAAAAAAAAAAAADwPwAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAPAPAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAA+AMAAAAAAAAAAAAAAAAAAAAAAIABAAwAAAAAAAAAAAD4AwAAAAAAAAAAAAAAAAAAAAAAgAEABgAAAAAAAAAAAPgDAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAwAEAAAAAAAAAAAD4AQAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAPwBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAYAAAAAAAAAAADwAAAA/9+D8w8AAAAAAAAAAAAAAAAAAwAAAAAAAAAAwP//A////////wAAAAAAAAAAAAAAAPAPAAAAAAAAAIDx///B/////////wMAAAAAAAAAAAAAZA8AAAAADP7/+/////n/////////fwAAAAAAAAAADgBwHwAAAAD//////////v//////////AQAAAADAA4D/3/8fAAAA4P///////////////////x8AAAAA4P//5/z//wMAAAD4////////////////////BwAAAID///////85AAAA+P////////////////////8PAAAA////////bwwA4ID//////////////////////x8AAHDg//////+/owDwAfj/////////////////////AwD//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////w==");
function packXBM(p,w,h){const st=(w+7)>>3,o=new Uint8Array(st*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(p[y*w+x])o[y*st+(x>>3)]|=1<<(x&7);return o;}
const $=id=>document.getElementById(id);
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),1800);}
function uid(){return Math.random().toString(36).slice(2,8);}
function clone(o){return JSON.parse(JSON.stringify(o,(k,v)=>k.startsWith('_')?undefined:v));}

/* ---------- U8g2 / Lopaka code import ---------- */
function parseU8g2(code){
  const arrays={},layers=[];
  const ar=/unsigned\s+char\s+(\w+)\s*\[\s*\d*\s*\]\s*(?:U8X8_PROGMEM|PROGMEM)?\s*=\s*\{([^}]*)\}/g;let m;
  while((m=ar.exec(code)))arrays[m[1]]=m[2].split(',').map(s=>s.trim()).filter(Boolean).map(s=>parseInt(s)&255);
  const call=/\.(drawXBMP?|drawPixel|drawBox|drawFrame|drawLine|drawHLine|drawVLine)\s*\(([^)]*)\)/g;
  while((m=call.exec(code))){
    const a=m[2].split(',').map(s=>s.trim()),n=a.map(v=>parseInt(v));
    switch(m[1]){
      case'drawXBM':case'drawXBMP':{const b=arrays[a[4]];if(!b)break;layers.push({type:'bitmap',name:a[4].replace(/^image_|_bits$/g,''),x:n[0],y:n[1],w:n[2],h:n[3],invert:false,data:b64e(Uint8Array.from(b))});break;}
      case'drawPixel':layers.push({type:'rect',name:'Pixel',x:n[0],y:n[1],w:1,h:1,fill:true});break;
      case'drawBox':layers.push({type:'rect',name:'Box',x:n[0],y:n[1],w:n[2],h:n[3],fill:true});break;
      case'drawFrame':layers.push({type:'rect',name:'Frame',x:n[0],y:n[1],w:n[2],h:n[3],fill:false});break;
      case'drawLine':layers.push({type:'line',name:'Line',x1:n[0],y1:n[1],x2:n[2],y2:n[3],dash:0});break;
      case'drawHLine':layers.push({type:'line',name:'HLine',x1:n[0],y1:n[1],x2:n[0]+n[2]-1,y2:n[1],dash:0});break;
      case'drawVLine':layers.push({type:'line',name:'VLine',x1:n[0],y1:n[1],x2:n[0],y2:n[1]+n[2]-1,dash:0});break;
    }
  }
  return layers;
}

/* ---------- Demo projects ---------- */
const BOOK_LAYERS=/*__BOOK__*/[];
function demos(){return[
  {id:'neon-clock',name:'NEON//CLOCK',v:1,brightness:210,lang:'en',shift:'both',layers:[
    {type:'corners',name:'Frame',x:0,y:0,w:256,h:48,len:4},
    {type:'clock',name:'Time',format:'HH:MM',x:8,y:6,align:'left',w:22,h:36,t:4,gap:1,spacing:4,skew:0.12,style:'solid',colon:'blink',lead0:true,h12:false},
    {type:'text',name:'Sec label',x:131,y:21,text:'SEC',font:'small',scale:1,align:'left'},
    {type:'clock',name:'Seconds',format:'SS',x:130,y:28,align:'left',w:9,h:14,t:2,gap:0,spacing:3,skew:0.12,style:'solid',colon:'on',lead0:true,h12:false},
    {type:'line',name:'Divider',x1:157,y1:4,x2:157,y2:43,dash:2},
    {type:'text',name:'Header',x:163,y:4,text:'SYS//CHRONO',font:'small',scale:1,align:'left'},
    {type:'text',name:'Hex',x:251,y:4,text:'{HEX}',font:'small',scale:1,align:'right'},
    {type:'text',name:'Date',x:163,y:12,text:'{WD} {DD}.{MON}',font:'medium',scale:1,align:'left'},
    {type:'text',name:'Year',x:163,y:22,text:'{YYYY} // {TZ}',font:'small',scale:1,align:'left'},
    {type:'bar',name:'Sec bar',x:163,y:30,w:89,h:4,source:'sec',style:'ticks',n:30},
    {type:'marquee',name:'Ticker',x:163,y:38,w:89,text:'NODE ONLINE // UPLINK STABLE // NO SIGNAL IS ALSO A SIGNAL // ',font:'small',scale:1,speed:18},
    {type:'glitch',name:'Glitch',trigger:'both',intensity:0.6,chance:0.06,dur:600},
    {type:'scan',name:'Scanline',period:5000,dur:700,rows:1}]},
  {id:'stripe-full',name:'STRIPE//FULL',v:1,brightness:230,lang:'en',shift:'both',layers:[
    {type:'clock',name:'Time',format:'HH:MM:SS',x:126,y:2,align:'center',w:30,h:44,t:6,gap:1,spacing:5,skew:0.1,style:'striped',colon:'on',lead0:true,h12:false},
    {type:'glitch',name:'Glitch',trigger:'random',intensity:0.8,chance:0.08,dur:500},
    {type:'noise',name:'Noise',density:0.002}]},
  {id:'grid-minimal',name:'GRID//MINIMAL',v:1,brightness:150,lang:'de',shift:'both',layers:[
    {type:'clock',name:'Time',format:'HH:MM',x:128,y:3,align:'center',w:26,h:38,t:5,gap:1,spacing:6,skew:0,style:'outline',colon:'blink',lead0:true,h12:false},
    {type:'text',name:'Weekday',x:2,y:2,text:'{WD}',font:'small',scale:1,align:'left'},
    {type:'text',name:'Date',x:254,y:2,text:'{DD}.{MO}',font:'small',scale:1,align:'right'},
    {type:'bar',name:'Seconds',x:0,y:46,w:256,h:2,source:'sec',style:'ticks',n:60}]},
  {id:'the-book',name:'THE BOOK (2023)',v:1,brightness:240,lang:'en',shift:'both',layers:BOOK_LAYERS.map(clone)},
  ...DEMOS2.map(clone)
];}
const DEMOS2=/*__DEMOS2__*/[];

