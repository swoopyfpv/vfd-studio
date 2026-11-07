/* ============================================================
   MEDIA + FONTS (shared by Studio and Builder)
   ============================================================ */
const GFONTS=['Press Start 2P','VT323','Silkscreen','Pixelify Sans','Tiny5','Micro 5','Jersey 10','DotGothic16','Sixtyfour','Workbench','Monoton','Orbitron','Audiowide','Michroma','Zen Dots','Tilt Neon','Bungee','Righteous','Russo One','Major Mono Display','Rubik Mono One','Syncopate','Share Tech Mono','Space Mono','Josefin Sans','Poppins','Comfortaa','Archivo Black','Bebas Neue','Big Shoulders Display','Unica One','Black Ops One','Wallpoet','Codystar'];
const CHARSETS={'ASCII + Umlauts':()=>asciiChars()+'ÄÖÜäöüß°€·','ASCII':()=>asciiChars(),'Uppercase + digits':()=>' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ.,:;!?-+/%°·','Clock digits':()=>' 0123456789:.-'};
function asciiChars(){let s='';for(let c=32;c<127;c++)s+=String.fromCharCode(c);return s;}
const loadedG=new Set();
async function ensureGoogleFont(fam){
  if(!loadedG.has(fam)){const l=document.createElement('link');l.rel='stylesheet';l.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g,'+')}&display=block`;document.head.appendChild(l);loadedG.add(fam);
    await new Promise(r=>{l.onload=r;l.onerror=r;setTimeout(r,4000);});}
}
async function bakeFont({family,size,thr,sp,chars}){
  await document.fonts.load(`${size}px "${family}"`,chars).catch(()=>{});
  const c=document.createElement('canvas'),x=c.getContext('2d',{willReadFrequently:true});
  const setF=()=>{x.font=`${size}px "${family}"`;x.textBaseline='alphabetic';x.fillStyle='#fff';};
  setF();let asc=0,desc=0;for(const ch of chars){const m=x.measureText(ch);asc=Math.max(asc,m.actualBoundingBoxAscent||0);desc=Math.max(desc,m.actualBoundingBoxDescent||0);}
  asc=Math.ceil(asc);desc=Math.ceil(desc);const h=Math.max(1,Math.min(48,asc+desc));
  const ws=[],parts=[];
  for(const ch of chars){
    setF();const m=x.measureText(ch),left=Math.max(0,Math.ceil(m.actualBoundingBoxLeft||0)),right=Math.ceil(m.actualBoundingBoxRight||0);
    const w=Math.max(1,Math.min(64,Math.max(Math.round(m.width),left+right)));
    c.width=w+8;c.height=h+8;setF();x.clearRect(0,0,c.width,c.height);x.fillText(ch,4+left,4+asc);
    const d=x.getImageData(4,4,w,h).data,st=(w+7)>>3,b=new Uint8Array(st*h);
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(d[(yy*w+xx)*4+3]>thr)b[yy*st+(xx>>3)]|=1<<(xx&7);
    ws.push(w);parts.push(b);
  }
  const all=new Uint8Array(parts.reduce((a,b)=>a+b.length,0));let o=0;for(const b of parts){all.set(b,o);o+=b.length;}
  return{name:`${family} ${size}`,h,sp,chars,w:ws,data:b64e(all)};
}

function ditherFrame(src,sw,sh,o){
  const c=document.createElement('canvas');c.width=o.w;c.height=o.h;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#000';x.fillRect(0,0,o.w,o.h);
  let dw=o.w,dh=o.h;if(o.fit!=='stretch'){const s=(o.fit==='contain'?Math.min:Math.max)(o.w/sw,o.h/sh);dw=sw*s;dh=sh*s;}
  x.drawImage(src,(o.w-dw)/2,(o.h-dh)/2,dw,dh);
  const d=x.getImageData(0,0,o.w,o.h).data,w=o.w,h=o.h,g=new Float32Array(w*h),f=(1+o.con)/(1-o.con*0.99);
  for(let i=0;i<w*h;i++){g[i]=((0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2])-128)*f+128;}
  const out=new Uint8Array(w*h),B=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){const i=y*w+xx,v=g[i];
    if(o.mode==='bayer'){out[i]=v>(B[(y&3)*4+(xx&3)]+0.5)*16+(o.thr-128)?1:0;continue;}
    const n=v>o.thr?255:0;out[i]=n?1:0;if(o.mode==='none')continue;const e=v-n;
    const add=(dx,dy,k)=>{const X=xx+dx,Y=y+dy;if(X>=0&&X<w&&Y<h)g[Y*w+X]+=e*k;};
    if(o.mode==='floyd'){add(1,0,7/16);add(-1,1,3/16);add(0,1,5/16);add(1,1,1/16);}else{const k=1/8;add(1,0,k);add(2,0,k);add(-1,1,k);add(0,1,k);add(1,1,k);add(0,2,k);}}
  if(o.inv)for(let i=0;i<out.length;i++)out[i]^=1;
  return out;
}
/* GIF decoder (works on plain-HTTP pages too, where the browser's ImageDecoder is unavailable) */
function gifLzw(data,minCode,npix){
  const out=new Uint8Array(npix),clear=1<<minCode,eoi=clear+1,prefix=new Int16Array(4096),suffix=new Uint8Array(4096),stack=new Uint8Array(4097);
  for(let i=0;i<clear;i++){prefix[i]=-1;suffix[i]=i;}
  let size=minCode+1,mask=(1<<size)-1,next=eoi+1,bits=0,acc=0,bp=0,old=-1,first=0,op=0;
  while(op<npix){
    while(bits<size){if(bp>=data.length)return out;acc|=data[bp++]<<bits;bits+=8;}
    let code=acc&mask;acc>>>=size;bits-=size;
    if(code===clear){size=minCode+1;mask=(1<<size)-1;next=eoi+1;old=-1;continue;}
    if(code===eoi)break;
    if(old===-1){out[op++]=suffix[code];old=code;first=code;continue;}
    const cur=code;let sp=0;
    if(code>=next){stack[sp++]=first;code=old;}
    while(code>=clear){stack[sp++]=suffix[code];code=prefix[code];}
    first=suffix[code];stack[sp++]=first;
    while(sp>0&&op<npix)out[op++]=stack[--sp];
    if(next<4096){prefix[next]=old;suffix[next]=first;next++;if((next&mask)===0&&next<4096){size++;mask=(1<<size)-1;}}
    old=cur;
  }
  return out;
}
function decodeGif(u8,maxFrames){
  let p=0;const rd=()=>u8[p++],rd16=()=>{const v=u8[p]|(u8[p+1]<<8);p+=2;return v;};
  if(!/^GIF8[79]a$/.test(String.fromCharCode(...u8.subarray(0,6))))throw new Error('not a GIF');p=6;
  const W=rd16(),H2=rd16(),pk=rd();p+=2;
  let gct=null;if(pk&0x80){const n=2<<(pk&7);gct=u8.subarray(p,p+n*3);p+=n*3;}
  const img=new ImageData(W,H2),frames=[];let gce={delay:10,disp:0,ti:-1};
  while(p<u8.length&&frames.length<maxFrames){
    const b=rd();
    if(b===0x3B)break;
    if(b===0x21){const lab=rd();
      if(lab===0xF9){const n=rd(),f=u8[p];gce={disp:(f>>2)&7,delay:u8[p+1]|(u8[p+2]<<8),ti:(f&1)?u8[p+3]:-1};p+=n;rd();}
      else{for(let n=rd();n;n=rd())p+=n;}
      continue;}
    if(b!==0x2C)break;
    const fx=rd16(),fy=rd16(),fw=rd16(),fh=rd16(),ip=rd();
    let ct=gct;if(ip&0x80){const n=2<<(ip&7);ct=u8.subarray(p,p+n*3);p+=n*3;}
    const minCode=rd(),chunks=[];let tot=0;for(let n=rd();n;n=rd()){chunks.push(u8.subarray(p,p+n));tot+=n;p+=n;}
    const data=new Uint8Array(tot);{let o=0;for(const c of chunks){data.set(c,o);o+=c.length;}}
    const idx=gifLzw(data,minCode,fw*fh),prev=gce.disp===3?new Uint8ClampedArray(img.data):null;
    const rows=[];if(ip&0x40){for(const[s0,st]of[[0,8],[4,8],[2,4],[1,2]])for(let y=s0;y<fh;y+=st)rows.push(y);}
    for(let i=0;i<fh;i++){const y=fy+(rows.length?rows[i]:i);if(y>=H2)continue;
      for(let x=0;x<fw;x++){const ci=idx[i*fw+x],X=fx+x;if(ci===gce.ti||X>=W||!ct||ci*3+2>=ct.length)continue;
        const o=(y*W+X)*4;img.data[o]=ct[ci*3];img.data[o+1]=ct[ci*3+1];img.data[o+2]=ct[ci*3+2];img.data[o+3]=255;}}
    const c=document.createElement('canvas');c.width=W;c.height=H2;c.getContext('2d').putImageData(img,0,0);
    frames.push({canvas:c,delay:(gce.delay||10)*10});
    if(gce.disp===2){for(let y=fy;y<Math.min(H2,fy+fh);y++)for(let x=fx;x<Math.min(W,fx+fw);x++)img.data.fill(0,(y*W+x)*4,(y*W+x)*4+4);}
    else if(gce.disp===3&&prev)img.data.set(prev);
    gce={delay:10,disp:0,ti:-1};
  }
  return{w:W,h:H2,frames};
}

function fontHash(F){let h=2166136261;const s=F.h+'|'+(F.sp??1)+'|'+F.chars+'|'+F.w.join(',')+'|'+F.data;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16);}

function usedFonts(P){return[...new Set(P.layers.filter(l=>l.font&&l.font!=='small'&&l.font!=='medium').map(l=>l.font))];}
