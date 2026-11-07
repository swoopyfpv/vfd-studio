/* ============================================================
   BUILDER
   ============================================================ */
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}};
const clampN=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtT=ms=>(ms/1000).toFixed(2)+' s';
const ICON={clock:'8',text:'T',marquee:'⇆',shape:'◐',poly:'◭',synth:'▦',dots:'⁘',globe:'◍',wxicon:'☁',graph:'▃',bar:'▬',rect:'▭',corners:'⌜',line:'╱',bitmap:'▣',anim:'▶',glitch:'≋',scan:'═',noise:'░'};
const PAL=[['Text',[['text','Text'],['marquee','Marquee'],['clock','Segment clock']]],
  ['Shapes',[['shape','Shape'],['rect','Rectangle'],['line','Line'],['poly','Polygon'],['corners','Corners']]],
  ['Data',[['dots','Time in dots'],['bar','Progress bar'],['wxicon','Weather icon'],['graph','Weather graph'],['globe','Globe'],['synth','80s grid']]],
  ['Media',[['@media','Image / GIF…']]],
  ['FX',[['glitch','Glitch'],['scan','Scanline'],['noise','Noise']]]];
const RESIZE=new Set(['shape','rect','corners','bar','graph']);
const KLABEL={dx:'X offset',dy:'Y offset',o:'Opacity %',w:'Width',h:'Height',scale:'Scale'};
const WX_SAMPLE={ok:true,sample:true,temp:7.4,feels:4.6,hum:86,rain:2.3,rainNow:0.2,pop:70,wind:14,code:61,day:true,tmax:9.1,tmin:3.2,sunrise:'07:21',sunset:'16:47',city:'SAMPLE',lat:50.1,lon:8.7,
  hT:[7.4,7.6,7.9,8.3,8.8,9.1,8.9,8.2,7.4,6.6,6.0,5.5,5.1,4.8,4.4,4.1,3.9,3.6,3.4,3.3,3.2,3.6,4.4,5.3],
  hP:[70,75,80,65,40,30,20,15,10,10,15,25,35,45,50,40,30,20,10,5,5,10,20,30],
  hR:[0.2,0.4,0.9,0.6,0.2,0.1,0,0,0,0,0,0.1,0.3,0.5,0.7,0.4,0.2,0,0,0,0,0,0.1,0.2]};
WX=Object.assign({},WX_SAMPLE);

/* ---------- templates ---------- */
function tplBlank(){return{id:'p-'+uid(),name:'UNTITLED',v:1,brightness:200,lang:'en',shift:'both',loop:10000,layers:[]};}
function tplTitles(){return{id:'p-'+uid(),name:'TITLE//SEQUENCE',v:1,brightness:210,lang:'en',shift:'both',loop:9000,layers:[
  {type:'corners',name:'Frame',x:0,y:0,w:256,h:48,len:5},
  {type:'text',name:'Title 1',x:128,y:16,text:'HELLO',font:'medium',scale:2,align:'center',fx:'none',fxMs:60,amp:2,cycle:0,at:0,length:3200,in:'type',out:'dissolve',tr:500},
  {type:'text',name:'Title 2',x:128,y:20,text:'THIS IS A VFD',font:'medium',scale:1,align:'center',fx:'none',fxMs:60,amp:2,cycle:0,at:2700,length:3300,in:'dissolve',out:'dissolve',tr:500,
    keys:{dy:[[2700,8,'out'],[3500,0,'linear']]}},
  {type:'text',name:'Title 3',x:128,y:16,text:'{HH}:{MM}',font:'medium',scale:2,align:'center',fx:'none',fxMs:60,amp:2,cycle:0,at:5500,length:3500,in:'scramble',out:'dissolve',tr:600,dip:true},
  {type:'scan',name:'Scanline',period:4500,dur:700,rows:1}]};}
function tplClock(){return{id:'p-'+uid(),name:'CLOCK',v:1,brightness:200,lang:'en',shift:'both',loop:0,layers:[
  {type:'clock',name:'Clock',...clone(TYPES.clock.def),x:6,y:6},
  {type:'text',name:'Date',x:250,y:8,text:'{WD}',font:'medium',scale:1,align:'right',fx:'none',fxMs:60,amp:2,cycle:0},
  {type:'text',name:'Date 2',x:250,y:20,text:'{DD}.{MON}',font:'medium',scale:1,align:'right',fx:'none',fxMs:60,amp:2,cycle:0},
  {type:'bar',name:'Seconds',...clone(TYPES.bar.def),x:150,y:42,w:100,h:3,n:30}]};}
const TEMPLATES=[['Blank (10 s sequence)',tplBlank],['Title sequence',tplTitles],['Clock',tplClock]];

/* ---------- state ---------- */
const B={
  projects:store.get('vfdb.projects',null),cur:store.get('vfdb.cur',null),sel:-1,ksel:[],
  playing:true,ph:0,speed:1,anchor:Math.floor(Date.now()/50)*50,autoKey:false,tab:'layer',guides:null,
  view:Object.assign({zoom:'fit',snap:true,grid:true,glow:true,safe:false,tint:'#4dffd2',tlh:250},store.get('vfdb.view',{})),
};
if(!Array.isArray(B.projects)||!B.projects.length)B.projects=[tplTitles()];
const proj=()=>B.projects.find(p=>p.id===B.cur)||B.projects[0];
B.cur=proj().id;
let saveT=0,storeWarned=false;
function save(){clearTimeout(saveT);saveT=setTimeout(()=>{
  const ok=store.set('vfdb.projects',B.projects.map(clone))&&store.set('vfdb.cur',B.cur)&&store.set('vfdb.view',B.view);
  if(!ok&&!storeWarned){storeWarned=true;toast('Browser storage is full · export large projects as JSON');}},300);}
function saveLib(){store.set('vfd.fontlib',Object.fromEntries(Object.entries(FONTLIB).map(([k,v])=>[k,clone(v)])));}
function migrateFonts(P){if(!P.fonts)return;for(const[id,F]of Object.entries(P.fonts))if(!FONTLIB[id])FONTLIB[id]=F;delete P.fonts;saveLib();}

/* ---------- undo / redo (snapshots of the current project) ---------- */
const HIST={u:[],r:[],last:null};
const snapP=()=>JSON.stringify(clone(proj()));
function histReset(){HIST.u=[];HIST.r=[];HIST.last=snapP();updUR();}
function commit(){clearTimeout(cT);const s=snapP();if(s===HIST.last)return;HIST.u.push(HIST.last);if(HIST.u.length>200)HIST.u.shift();HIST.last=s;HIST.r=[];updUR();save();}
let cT=0;function commitSoon(){clearTimeout(cT);cT=setTimeout(commit,400);save();}
function restoreSnap(s){const P=proj(),o=JSON.parse(s);for(const k of Object.keys(P))delete P[k];Object.assign(P,o);B.cur=P.id;
  B.sel=Math.min(B.sel,P.layers.length-1);B.ksel=[];refreshAll();save();}
function undo(){commit();if(!HIST.u.length)return toast('Nothing to undo');HIST.r.push(HIST.last);HIST.last=HIST.u.pop();restoreSnap(HIST.last);updUR();}
function redo(){if(!HIST.r.length)return toast('Nothing to redo');HIST.u.push(HIST.last);HIST.last=HIST.r.pop();restoreSnap(HIST.last);updUR();}
function updUR(){$('bUndo').classList.toggle('off',!HIST.u.length);$('bRedo').classList.toggle('off',!HIST.r.length);}

/* ---------- time ---------- */
const loopLen=()=>proj().loop|0;
function lt(){const n=loopLen();return n>0?((B.ph%n)+n)%n:0;}
function setLt(t){const n=loopLen();if(n<=0){B.ph=t;return;}t=clampN(t,0,n-1);B.ph=B.ph-lt()+t;}
function setPlaying(on){B.playing=on;$('tPlay').textContent=on?'❚❚':'▶';}

/* ---------- keyframe helpers ---------- */
const keysOf=(L,p)=>(L.keys&&Array.isArray(L.keys[p]))?L.keys[p]:[];
const hasK=(L,p)=>keysOf(L,p).length>0;
const anyKeys=L=>!!L.keys&&KEYPROPS.some(p=>hasK(L,p));
function keyIdx(L,p,t){return keysOf(L,p).findIndex(k=>Math.abs(k[0]-t)<1);}
function baseVal(L,p){return p==='dx'||p==='dy'?0:p==='o'?100:p==='scale'?(L.scale??1):(L[p]??0);}
function evalProp(L,p,t=lt()){if(loopLen()>0&&hasK(L,p)){const kv=keyVals(L,t);if(kv&&kv[p]!==undefined)return kv[p];}return baseVal(L,p);}
function normVal(p,v){v=+v||0;if(p==='o')return clampN(Math.round(v),0,100);if(p==='scale')return Math.max(1,Math.round(v));if(p==='w'||p==='h')return Math.max(0,Math.round(v));return Math.round(v);}
function setKey(L,p,t,v,ease){t=Math.round(clampN(t,0,Math.max(0,loopLen()-1)));v=normVal(p,v);L.keys=L.keys||{};const a=L.keys[p]=L.keys[p]||[];
  const i=a.findIndex(k=>Math.abs(k[0]-t)<1);if(i>=0){a[i][1]=v;if(ease)a[i][2]=ease;}
  else{const prev=a.filter(k=>k[0]<t).pop();a.push([t,v,ease||(prev?prev[2]:'linear')||'linear']);a.sort((x,y)=>x[0]-y[0]);}}
function delKeyAt(L,p,t){const a=keysOf(L,p),i=a.findIndex(k=>Math.abs(k[0]-t)<1);if(i>=0)a.splice(i,1);cleanKeys(L);}
function cleanKeys(L){if(!L.keys)return;for(const p of Object.keys(L.keys))if(!Array.isArray(L.keys[p])||!L.keys[p].length)delete L.keys[p];if(!Object.keys(L.keys).length)delete L.keys;}
function keyTimes(L){const s=new Set();for(const p of KEYPROPS)for(const k of keysOf(L,p))s.add(k[0]);return[...s].sort((a,b)=>a-b);}
const kselHas=(i,p,t)=>B.ksel.some(k=>k.i===i&&k.p===p&&Math.abs(k.t-t)<1);
function needLoop(){if(loopLen()>0)return true;toast('Set a length first (timeline, top left) · keyframes live on the sequence timeline');return false;}

/* ---------- display painter ---------- */
const SC=6,fb=new FB(),scratch=new FB();
const cvBg=$('cvBg'),cvPx=$('cvPx'),cvG1=$('cvG1'),cvG2=$('cvG2'),cvOv=$('cvOv');
[cvBg,cvPx,cvOv].forEach(c=>{c.width=W*SC;c.height=H*SC;});[cvG1,cvG2].forEach(c=>{c.width=W*2;c.height=H*2;});
const xPx=cvPx.getContext('2d'),xG1=cvG1.getContext('2d'),xG2=cvG2.getContext('2d'),xOv=cvOv.getContext('2d'),xBg=cvBg.getContext('2d');
function paintBg(){xBg.clearRect(0,0,cvBg.width,cvBg.height);if(!B.view.grid)return;xBg.fillStyle=B.view.tint;xBg.globalAlpha=0.05;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)xBg.fillRect(x*SC,y*SC,SC-1,SC-1);xBg.globalAlpha=1;}
function layout(){
  const st=$('stage'),z=B.view.zoom;let w;
  if(z==='fit'){const aw=st.clientWidth-48-30,ah=st.clientHeight-48-30-24;w=Math.max(256,Math.min(aw,ah*W/H));}else w=W*(+z);
  w=Math.floor(w);$('glass').style.width=w+'px';$('glass').style.height=Math.round(w*H/W)+'px';
  document.querySelectorAll('#zoomSeg button').forEach(b=>b.classList.toggle('on',b.dataset.z===String(z)));
}
let hover=null;
function paint(){
  const P=proj(),br=P.brightness??200;
  xPx.clearRect(0,0,cvPx.width,cvPx.height);xPx.fillStyle=B.view.tint;xPx.globalAlpha=0.2+0.8*(br*(fb.dip??1)/255);
  const p=fb.p,s=SC-1;for(let y=0;y<H;y++){const o=y*W;for(let x=0;x<W;x++)if(p[o+x])xPx.fillRect(x*SC,y*SC,s,s);}
  xPx.globalAlpha=1;
  const g=B.view.glow;cvG1.style.display=cvG2.style.display=g?'':'none';
  if(g){xG1.clearRect(0,0,cvG1.width,cvG1.height);xG1.drawImage(cvPx,0,0,cvG1.width,cvG1.height);xG2.clearRect(0,0,cvG2.width,cvG2.height);xG2.drawImage(cvPx,0,0,cvG2.width,cvG2.height);}
  xOv.clearRect(0,0,cvOv.width,cvOv.height);
  if(B.view.safe){const m=P.shift===undefined?'both':P.shift===true?'pos':P.shift;xOv.fillStyle='#ff2e8855';
    if(m==='pos'||m==='both'){xOv.fillRect((W-1)*SC,0,SC,cvOv.height);xOv.fillRect(0,(H-1)*SC,cvOv.width,SC);}
    if(m==='neg'||m==='both'){xOv.fillRect(0,0,SC,cvOv.height);xOv.fillRect(0,0,cvOv.width,SC);}}
  const bb=B.bbox,L=P.layers[B.sel];
  if(bb&&L){const[a,b,c,d]=bb;xOv.strokeStyle='#ff2e88';xOv.lineWidth=2;xOv.setLineDash([7,5]);xOv.strokeRect(a*SC-3,b*SC-3,(c-a+1)*SC+5,(d-b+1)*SC+5);xOv.setLineDash([]);
    if(RESIZE.has(L.type)&&!L.locked){xOv.fillStyle='#ff2e88';xOv.fillRect((c+1)*SC-4,(d+1)*SC-4,10,10);}}
  else if(L&&!TYPES[L.type]?.fx&&L.visible!==false){xOv.fillStyle='#ff2e8899';xOv.font='bold 22px JetBrains Mono, monospace';xOv.fillText('selected layer is not visible at this time',12,30);}
  if(B.guides){xOv.strokeStyle='#ffd23f';xOv.lineWidth=1.5;for(const x of B.guides.x){const X=x*SC+SC/2;xOv.beginPath();xOv.moveTo(X,0);xOv.lineTo(X,cvOv.height);xOv.stroke();}
    for(const y of B.guides.y){const Y=y*SC+SC/2;xOv.beginPath();xOv.moveTo(0,Y);xOv.lineTo(cvOv.width,Y);xOv.stroke();}}
  if(B.dropAt){xOv.strokeStyle='#4dffd2';xOv.lineWidth=2;const[x,y]=B.dropAt;xOv.strokeRect(x*SC-6,y*SC-6,SC+12,SC+12);}
}
// time on the 60 fps frame grid, like the display: each frame starts at its first millisecond
const frameOf=t=>Math.floor(t*3/50),frameStart=f=>Math.ceil(f*50/3);
function renderFrame(){const P=proj();P._t0=B.anchor;B.T=timeObj(frameStart(frameOf(B.anchor+B.ph)));B.bbox=renderProject(fb,P,B.T,B.sel);}
function bboxOf(i){const P=proj();P._t0=B.anchor;const b=renderProject(scratch,P,B.T,i);return b?b.slice():null;}
function allBBoxes(){const P=proj();return P.layers.map((L,i)=>(L.visible===false||TYPES[L.type]?.fx)?null:bboxOf(i));}

/* ---------- main loop ---------- */
let lastNow=performance.now(),lastPaint=-1,lastIdle=0,frames=0,fpsT=0,valsT=0;
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min(200,now-lastNow);lastNow=now;
  if(B.playing)B.ph+=dt*B.speed;
  // playing: one paint per display frame (60 fps grid); paused: still repaint for edits, ~30 times a second
  const f=frameOf(B.anchor+B.ph);if(B.playing){if(f===lastPaint)return;}else if(now-lastIdle<33)return;lastPaint=f;lastIdle=now;
  renderFrame();paint();liveTick();tlTick();
  if(now-valsT>120){valsT=now;refreshVals();}
  frames++;if(now-fpsT>1000){$('fps').textContent=frames+' FPS';frames=0;fpsT=now;}
}

/* ---------- layer operations ---------- */
// text layers are named after their text until someone renames them
const AUTO_NAMED=new Set(['text','marquee']);
function autoName(t){const s=String(t||'').replace(/\|/g,' / ').replace(/\s+/g,' ').trim();return s?(s.length>18?s.slice(0,17)+'…':s):'';}
function isAutoName(L,oldText){const n=L.name||'';return !n||n===TYPES[L.type].label||n===autoName(oldText);}
function newLayer(type){const ty=TYPES[type],L={type,name:ty.label,...clone(ty.def)};if(AUTO_NAMED.has(type))L.name=autoName(L.text)||ty.label;return L;}
function moveLayer(L,o,dx,dy){
  if('x1'in o){L.x1=o.x1+dx;L.x2=o.x2+dx;L.y1=o.y1+dy;L.y2=o.y2+dy;}
  else if(L.type==='poly'){L.pts=String(o.pts||'').trim().split(/\s+/).map(p=>{const v=p.split(',');return(+v[0]+dx)+','+(+v[1]+dy);}).join(' ');}
  else if(L.type==='synth'){L.vx=o.vx+dx;L.hy=o.hy+dy;}
  else if('x'in o){L.x=o.x+dx;L.y=o.y+dy;}
}
function placeAt(L,x,y){
  if(TYPES[L.type].fx)return;
  if('x1'in L){const dx=x-L.x1,dy=y-L.y1;moveLayer(L,clone(L),dx,dy);return;}
  if(L.type==='poly'||L.type==='synth')return;
  if('x'in L){const c=L.type==='globe'||(L.type==='text'&&L.align==='center');L.x=c?x:x-((L.w|0)>>1);L.y=c||L.type==='globe'?y:y-((L.h|0)>>1);
    if(L.type==='text')L.y=y-(fontH(L.font)*(L.scale||1)>>1);if(L.type!=='globe'&&L.type!=='text'&&L.type!=='clock'&&L.type!=='wxicon'&&L.type!=='dots'){L.x=clampN(L.x,-(L.w|0)+1,W-1);L.y=clampN(L.y,-(L.h|0)+1,H-1);}}
}
function addLayer(type,at){
  const P=proj();if(!TYPES[type])return;const L=newLayer(type);
  if(at)placeAt(L,at[0],at[1]);
  if((P.loop|0)>0&&!TYPES[type].fx&&B.view.addTimed){L.at=Math.round(lt()/50)*50;L.length=Math.min(3000,P.loop-L.at);L.in='dissolve';L.out='dissolve';L.tr=300;}
  let idx=TYPES[type].fx?P.layers.length:(B.sel>=0?B.sel+1:P.layers.length);
  P.layers.splice(idx,0,L);B.sel=idx;B.ksel=[];commit();refreshAll();
  if(type==='text')setTimeout(()=>{const i=document.querySelector('#insp [data-k="text"]');if(i){i.focus();i.select();}},30);
}
function delLayer(i){const P=proj();if(i<0||!P.layers[i])return;P.layers.splice(i,1);B.sel=Math.min(i,P.layers.length-1);B.ksel=[];commit();refreshAll();}
function dupLayer(i){const P=proj(),L=P.layers[i];if(!L)return;const c=clone(L);c.name=(c.name||'')+' copy';P.layers.splice(i+1,0,c);B.sel=i+1;commit();refreshAll();}
function moveLayerTo(from,to){const P=proj();if(from===to)return;const[L]=P.layers.splice(from,1);P.layers.splice(to,0,L);B.sel=to;B.ksel=[];commit();refreshAll();}
function select(i){B.sel=i;if(!B.ksel.every(k=>k.i===i))B.ksel=[];renderLayers();renderTL();renderInsp();}

/* ---------- layers panel ---------- */
function renderLayers(){
  const P=proj(),el=$('layers');el.innerHTML='';
  if(!P.layers.length){el.innerHTML='<div class="empty">No layers yet.<br>Click or drag an item from below onto the display.</div>';return;}
  for(let i=P.layers.length-1;i>=0;i--){
    const L=P.layers[i],d=document.createElement('div');
    d.className='lyr'+(i===B.sel?' sel':'')+(L.visible===false?' hid':'');d.draggable=true;d.dataset.i=i;
    const tags=(timed(L)?'⏱':'')+(anyKeys(L)?'◆':'');
    d.innerHTML=`<span class="ic">${ICON[L.type]||'?'}</span><span class="nm">${esc(L.name||TYPES[L.type]?.label||L.type)}</span><span class="tag">${tags}</span>
      <button class="ib${L.locked?'':' off'}" data-a="lock" title="Lock (no dragging on the display)">${L.locked?'🔒':'🔓'}</button><button class="ib${L.visible===false?' off':''}" data-a="eye" title="Show / hide">👁</button>`;
    d.onclick=e=>{const a=e.target.dataset?.a;
      if(a==='eye'){if(L.visible===false)delete L.visible;else L.visible=false;commit();renderLayers();renderTL();return;}
      if(a==='lock'){if(L.locked)delete L.locked;else L.locked=true;commit();renderLayers();return;}
      select(i);};
    d.ondblclick=e=>{if(e.target.dataset?.a)return;const nm=d.querySelector('.nm');nm.innerHTML='<input type="text">';const inp=nm.firstChild;inp.value=L.name||'';inp.focus();inp.select();
      const done=ok=>{if(ok&&inp.value.trim())L.name=inp.value.trim();commit();renderLayers();renderTL();renderInsp();};
      inp.onkeydown=ev=>{if(ev.key==='Enter')done(true);if(ev.key==='Escape')done(false);ev.stopPropagation();};inp.onblur=()=>done(true);};
    d.ondragstart=e=>{e.dataTransfer.setData('text/vfd-layer',String(i));e.dataTransfer.effectAllowed='move';};
    d.ondragover=e=>{if(!e.dataTransfer.types.includes('text/vfd-layer'))return;e.preventDefault();const r=d.getBoundingClientRect(),up=e.clientY<r.top+r.height/2;d.classList.toggle('drop-a',up);d.classList.toggle('drop-b',!up);};
    d.ondragleave=()=>d.classList.remove('drop-a','drop-b');
    d.ondrop=e=>{e.preventDefault();d.classList.remove('drop-a','drop-b');const from=+e.dataTransfer.getData('text/vfd-layer');if(isNaN(from))return;
      const r=d.getBoundingClientRect(),up=e.clientY<r.top+r.height/2;let to=up?i+1:i;if(from<to)to--;moveLayerTo(from,clampN(to,0,P.layers.length-1));};
    el.appendChild(d);
  }
}
function renderPalette(){
  const el=$('palette');el.innerHTML='';
  for(const[g,items]of PAL){const h=document.createElement('div');h.className='pg';h.textContent=g;el.appendChild(h);
    const gr=document.createElement('div');gr.className='pgrid';
    for(const[t,label]of items){const b=document.createElement('div');b.className='pal';b.draggable=true;b.title=t==='@media'?'Import an image or animated GIF':'Click to add · or drag onto the display';
      b.innerHTML=`<i>${t==='@media'?'▣':ICON[t]}</i>${esc(label)}`;
      b.onclick=()=>t==='@media'?mediaModal():addLayer(t);
      b.ondragstart=e=>{e.dataTransfer.setData('text/vfd-add',t);e.dataTransfer.effectAllowed='copy';};
      gr.appendChild(b);}
    el.appendChild(gr);}
}

/* ---------- canvas pointer: select, move, resize, snap ---------- */
function pt(e,float){const r=cvOv.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;return float?[x,y]:[clampN(Math.floor(x),0,W-1),clampN(Math.floor(y),0,H-1)];}
const inBB=(b,p,m=0)=>b&&p[0]>=b[0]-m&&p[0]<=b[2]+m&&p[1]>=b[1]-m&&p[1]<=b[3]+m;
let drag=null;
cvOv.addEventListener('pointermove',e=>{
  hover=pt(e);const P=proj(),L=P.layers[B.sel];
  $('readout').innerHTML=`x <b>${hover[0]}</b> y <b>${hover[1]}</b>`+(B.bbox&&L?` · ${esc(L.name)} <b>${B.bbox[2]-B.bbox[0]+1}×${B.bbox[3]-B.bbox[1]+1}</b>`:'');
  if(!drag){const f=pt(e,true),bb=B.bbox;cvOv.style.cursor=(L&&RESIZE.has(L.type)&&bb&&!L.locked&&Math.abs(f[0]-bb[2]-1)<1.6&&Math.abs(f[1]-bb[3]-1)<1.6)?'nwse-resize':(bb&&inBB(bb,hover)&&!L?.locked?'move':'default');return;}
  dragMove(e);
});
cvOv.addEventListener('pointerleave',()=>{if(!drag)$('readout').textContent='';});
cvOv.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;const P=proj(),p=pt(e),f=pt(e,true);let L=P.layers[B.sel],bb=B.bbox;
  if(L&&bb&&RESIZE.has(L.type)&&!L.locked&&Math.abs(f[0]-bb[2]-1)<1.6&&Math.abs(f[1]-bb[3]-1)<1.6){startDrag(e,'size',B.sel,p,bb);return;}
  if(!(L&&bb&&inBB(bb,p,1)&&!L.locked)){
    const bbs=allBBoxes();let hit=-1;
    for(let i=P.layers.length-1;i>=0;i--)if(bbs[i]&&inBB(bbs[i],p,1)){hit=i;break;}
    if(hit<0){select(-1);return;}
    select(hit);L=P.layers[hit];bb=bbs[hit];if(L.locked)return;
  }
  startDrag(e,'move',B.sel,p,bb);
});
cvOv.addEventListener('dblclick',()=>{if(B.sel<0)return;setTab('layer');const i=document.querySelector('#insp [data-k="text"],#insp [data-k="format"]');if(i){i.focus();i.select();}});
function startDrag(e,mode,i,p,bb){
  const P=proj(),L=P.layers[i];if(!L||TYPES[L.type]?.fx)return;
  const useKeys=loopLen()>0&&(B.autoKey||(mode==='move'?(hasK(L,'dx')||hasK(L,'dy')):(hasK(L,'w')||hasK(L,'h'))));
  const tx=[0,255,127.5],ty=[0,47,23.5];
  if(B.view.snap){const bbs=allBBoxes();bbs.forEach((b,j)=>{if(!b||j===i)return;tx.push(b[0],b[2],(b[0]+b[2])/2);ty.push(b[1],b[3],(b[1]+b[3])/2);});}
  drag={mode,i,p0:p,o:clone(L),bb:bb?bb.slice():null,useKeys,tx,ty,k0:{dx:evalProp(L,'dx'),dy:evalProp(L,'dy'),w:evalProp(L,'w'),h:evalProp(L,'h')},moved:false};
  cvOv.setPointerCapture(e.pointerId);
}
function snapAxis(vals,targets,d,thr){let best=null;for(const v of vals)for(const t of targets){const off=t-(v+d);if(Math.abs(off)<=thr&&(!best||Math.abs(off)<Math.abs(best.off)))best={off,t};}return best;}
function dragMove(e){
  const P=proj(),L=P.layers[drag.i];if(!L)return;const p=pt(e);let dx=p[0]-drag.p0[0],dy=p[1]-drag.p0[1];
  if(e.shiftKey&&drag.mode==='move'){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}
  B.guides=null;
  if(drag.mode==='move'){
    if(B.view.snap&&!e.altKey&&drag.bb){const b=drag.bb,thr=2;
      const sx=snapAxis([b[0],b[2],(b[0]+b[2])/2],drag.tx,dx,thr),sy=snapAxis([b[1],b[3],(b[1]+b[3])/2],drag.ty,dy,thr);
      B.guides={x:[],y:[]};if(sx&&!(e.shiftKey&&dx===0)){dx=Math.round(dx+sx.off);B.guides.x.push(sx.t);}if(sy&&!(e.shiftKey&&dy===0)){dy=Math.round(dy+sy.off);B.guides.y.push(sy.t);}}
    if(drag.useKeys){setKey(L,'dx',lt(),drag.k0.dx+dx);setKey(L,'dy',lt(),drag.k0.dy+dy);}
    else moveLayer(L,drag.o,dx,dy);
  }else{
    let nw=Math.max(1,drag.k0.w+dx),nh=Math.max(1,drag.k0.h+dy);
    if(e.shiftKey&&drag.k0.w&&drag.k0.h){const s=Math.max(nw/drag.k0.w,nh/drag.k0.h);nw=Math.round(drag.k0.w*s);nh=Math.round(drag.k0.h*s);}
    if(drag.useKeys){setKey(L,'w',lt(),nw);setKey(L,'h',lt(),nh);}else{L.w=nw;L.h=nh;}
  }
  drag.moved=dx!==0||dy!==0||drag.moved;refreshVals();
}
cvOv.addEventListener('pointerup',()=>{if(!drag)return;const m=drag.moved,k=drag.useKeys;drag=null;B.guides=null;if(m){commit();if(k){renderTL();renderLayers();}renderInsp();}});
// drops: palette items, layers dragged from the palette, image files
cvOv.addEventListener('dragover',e=>{const t=e.dataTransfer.types;if(t.includes('text/vfd-add')||t.includes('Files')){e.preventDefault();B.dropAt=pt(e);}});
cvOv.addEventListener('dragleave',()=>{B.dropAt=null;});
cvOv.addEventListener('drop',e=>{e.preventDefault();const at=pt(e);B.dropAt=null;
  const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f){mediaModal(f,at);return;}
  const t=e.dataTransfer.getData('text/vfd-add');if(!t)return;if(t==='@media')mediaModal(null,at);else addLayer(t,at);});

/* ---------- timeline ---------- */
function tickStep(n){return n<=3000?[500,100]:n<=8000?[1000,250]:n<=20000?[2000,500]:n<=60000?[5000,1000]:[10000,2000];}
function renderTL(){
  const P=proj(),n=loopLen(),el=$('tlBody');el.innerHTML='';
  $('tLoop').value=n>0?n/1000:'';
  if(n<=0){el.innerHTML=`<div class="tlempty">This project is static (no timeline). <button class="btn sm pri" id="mkSeq">Make it a 10 s sequence</button><br><br><span class="note">A length turns on timing, transitions and keyframes. Layers without timing stay visible all the time.</span></div>`;
    $('mkSeq').onclick=()=>{P.loop=10000;commit();refreshAll();};$('tlHint').textContent='';return;}
  $('tlHint').textContent='Drag bars and ◆ keys · Shift-click selects several · Del removes';
  // ruler
  const ru=document.createElement('div');ru.className='ruler';ru.innerHTML='<div class="nm">LAYERS</div>';const rt=document.createElement('div');rt.className='trk';
  const[big,sm]=tickStep(n);for(let t=0;t<=n;t+=sm){const k=document.createElement('div');const isB=t%big===0;k.className='tick '+(isB?'big':'sm');k.style.left=(t/n*100)+'%';if(isB&&t<n)k.innerHTML=`<span>${t/1000}s</span>`;rt.appendChild(k);}
  rt.onpointerdown=e=>{setPlaying(false);const r=rt.getBoundingClientRect();const go=ev=>setLt(clampN((ev.clientX-r.left)/r.width,0,1)*n);go(e);rt.setPointerCapture(e.pointerId);rt.onpointermove=go;rt.onpointerup=()=>{rt.onpointermove=null;refreshVals();};};
  ru.appendChild(rt);el.appendChild(ru);
  for(let i=P.layers.length-1;i>=0;i--){
    const L=P.layers[i],row=document.createElement('div');row.className='tlrow'+(i===B.sel?' sel':'');
    const props=KEYPROPS.filter(p=>hasK(L,p)),exp=!!L._exp&&props.length;
    const nm=document.createElement('div');nm.className='nm';
    nm.innerHTML=`<span class="caret">${props.length?(exp?'▾':'▸'):''}</span><span class="ic" style="color:var(--tube);width:16px;text-align:center">${ICON[L.type]||''}</span><span class="t">${esc(L.name||L.type)}</span>`;
    nm.onclick=e=>{if(e.target.classList.contains('caret')){L._exp=!L._exp;renderTL();return;}select(i);};
    const tr=document.createElement('div');tr.className='trk';
    const bar=document.createElement('div');
    if(!timed(L)){bar.className='bar always';bar.style.left='0';bar.style.width='100%';bar.title='Always visible · click to give it a time slot at the playhead';
      bar.onclick=()=>{L.at=Math.max(0,Math.min(n-500,Math.round(lt()/50)*50));L.length=Math.min(3000,n-L.at);if(!L.in)L.in='dissolve';if(!L.out)L.out='dissolve';if(!L.tr)L.tr=300;B.sel=i;commit();refreshAll();};}
    else{const at=L.at|0,dur=Math.min((L.length|0)>0?L.length|0:n-at,n-at);bar.className='bar';
      bar.style.left=(at/n*100)+'%';bar.style.width=Math.max(0.4,dur/n*100)+'%';
      bar.title=`${L.name||L.type}: ${fmtT(at)} → ${fmtT(at+dur)}`+(L.in&&L.in!=='none'?` · in: ${L.in}`:'')+(L.out&&L.out!=='none'?` · out: ${L.out}`:'')+(L.dip?' · dip':'');
      const trp=Math.min(50,(L.tr|0)/Math.max(1,dur)*100);
      if(L.in&&L.in!=='none'&&L.tr>0)bar.insertAdjacentHTML('beforeend',`<div class="rp" style="left:0;width:${trp}%;background:linear-gradient(90deg,#06080bcc,transparent)"></div>`);
      if(L.out&&L.out!=='none'&&L.tr>0)bar.insertAdjacentHTML('beforeend',`<div class="rp" style="right:0;width:${trp}%;background:linear-gradient(270deg,#06080bcc,transparent)"></div>`);
      bar.insertAdjacentHTML('beforeend',`<span class="lb">${L.in&&L.in!=='none'?L.in:''}${L.out&&L.out!=='none'?' → '+L.out:''}</span><div class="h l"></div><div class="h r"></div>`);
      bar.onpointerdown=e=>barDrag(e,i,bar,tr);}
    tr.appendChild(bar);
    if(!exp)for(const t of keyTimes(L))tr.appendChild(kfEl(i,null,t,n));
    row.appendChild(nm);row.appendChild(tr);el.appendChild(row);
    if(exp)for(const p of props){const sr=document.createElement('div');sr.className='tlrow sub'+(i===B.sel?' sel':'');
      sr.innerHTML=`<div class="nm"><span class="t">${KLABEL[p]}</span></div>`;const st=document.createElement('div');st.className='trk';
      for(const k of keysOf(L,p))st.appendChild(kfEl(i,p,k[0],n,k[2]));sr.appendChild(st);el.appendChild(sr);}
  }
  if(!P.layers.length)el.insertAdjacentHTML('beforeend','<div class="tlempty">Add layers to see them here.</div>');
  const ph=document.createElement('div');ph.id='ph';ph.title='Drag to scrub';el.appendChild(ph);
  const hd=document.createElement('div');hd.className='phhead';hd.id='phHead';hd.title='Drag to scrub';rt.appendChild(hd);
  const scrub=h=>e=>{e.preventDefault();e.stopPropagation();setPlaying(false);const r=rt.getBoundingClientRect();h.setPointerCapture(e.pointerId);ph.classList.add('drag');
    const go=ev=>{setLt(clampN((ev.clientX-r.left)/r.width,0,1)*n);tlTick();refreshVals();};
    h.onpointermove=go;h.onpointerup=()=>{h.onpointermove=null;ph.classList.remove('drag');refreshVals(true);};};
  ph.onpointerdown=scrub(ph);hd.onpointerdown=scrub(hd);ph.title='Drag to scrub';
  tlTick();
}
function snapTime(t,n,exclude,e){
  if(e&&e.altKey)return Math.round(t);
  const trk=document.querySelector('#tlBody .tlrow .trk'),px=trk?trk.getBoundingClientRect().width:800,thr=7/px*n;
  const cand=[lt(),0,n];proj().layers.forEach((L,j)=>{if(exclude&&exclude.has(j))return;if(timed(L)){const a=L.at|0;cand.push(a,a+((L.length|0)>0?L.length|0:n-a));}for(const k of keyTimes(L))cand.push(k);});
  let best=null;for(const c of cand)if(Math.abs(c-t)<=thr&&(best===null||Math.abs(c-t)<Math.abs(best-t)))best=c;
  return best!==null?best:Math.round(t/50)*50;
}
function barDrag(e,i,bar,tr){
  e.preventDefault();e.stopPropagation();const P=proj(),L=P.layers[i],n=loopLen();if(B.sel!==i){B.sel=i;renderLayers();renderInsp();}
  const mode=e.target.classList.contains('l')?'l':e.target.classList.contains('r')?'r':'m',x0=e.clientX,w=tr.getBoundingClientRect().width,a0=L.at|0,d0=(L.length|0)>0?L.length|0:n-a0;let moved=false;
  bar.setPointerCapture(e.pointerId);const ex=new Set([i]);
  bar.onpointermove=ev=>{const dm=(ev.clientX-x0)/w*n;if(Math.abs(ev.clientX-x0)>2)moved=true;if(!moved)return;
    if(mode==='m'){let na=snapTime(a0+dm,n,ex,ev);const ne=snapTime(a0+dm+d0,n,ex,ev);if(Math.abs(ne-(a0+dm+d0))<Math.abs(na-(a0+dm)))na=ne-d0;L.at=clampN(Math.round(na),0,n-d0);L.length=d0;}
    else if(mode==='r'){L.length=clampN(Math.round(snapTime(a0+d0+dm,n,ex,ev)-a0),50,n-a0);L.at=a0;}
    else{const na=clampN(Math.round(snapTime(a0+dm,n,ex,ev)),0,a0+d0-50);L.at=na;L.length=a0+d0-na;}
    bar.style.left=(L.at/n*100)+'%';bar.style.width=(L.length/n*100)+'%';};
  bar.onpointerup=()=>{bar.onpointermove=null;if(moved){commit();renderTL();renderInsp();}else{renderTL();}};
}
function kfEl(i,p,t,n,ease){
  const d=document.createElement('div'),L=proj().layers[i];
  const props=p?[p]:KEYPROPS.filter(q=>keyIdx(L,q,t)>=0);
  const sel=props.every(q=>kselHas(i,q,t));const e0=ease||(()=>{const q=props[0];const k=keysOf(L,q)[keyIdx(L,q,t)];return k?k[2]:'linear';})();
  d.className='kf'+(sel?' sel':'')+(e0==='hold'?' hold':e0&&e0!=='linear'?' eased':'');d.style.left=(t/n*100)+'%';
  d.title=`${fmtT(t)} · ${props.map(q=>KLABEL[q]+' '+Math.round(keysOf(L,q)[keyIdx(L,q,t)]?.[1]??0)).join(' · ')} · ${e0}`;
  d.onpointerdown=e=>{e.preventDefault();e.stopPropagation();
    if(B.sel!==i){B.sel=i;renderLayers();renderInsp();}
    const items=props.map(q=>({i,p:q,t}));
    if(e.shiftKey){const all=items.every(k=>kselHas(k.i,k.p,k.t));if(all)B.ksel=B.ksel.filter(k=>!(k.i===i&&items.some(x=>x.p===k.p&&Math.abs(x.t-k.t)<1)));else B.ksel.push(...items.filter(k=>!kselHas(k.i,k.p,k.t)));}
    else if(!items.every(k=>kselHas(k.i,k.p,k.t)))B.ksel=items;
    const sel0=B.ksel.map(k=>{const a=keysOf(proj().layers[k.i]||{},k.p);return{...k,ref:a.find(x=>Math.abs(x[0]-k.t)<1)};}),refs=new Set(sel0.map(k=>k.ref)),x0=e.clientX,w=d.parentElement.getBoundingClientRect().width;let moved=false;d.setPointerCapture(e.pointerId);
    d.onpointermove=ev=>{if(Math.abs(ev.clientX-x0)>2)moved=true;if(!moved)return;let dt=(ev.clientX-x0)/w*n;const nt=snapTime(t+dt,n,null,ev);dt=nt-t;
      const P=proj();
      sel0.forEach((k,idx)=>{if(!k.ref)return;const t2=clampN(Math.round(k.t+dt),0,n-1);k.ref[0]=t2;B.ksel[idx].t=t2;});void P;
      d.style.left=(clampN(t+dt,0,n-1)/n*100)+'%';};
    d.onpointerup=()=>{d.onpointermove=null;const P=proj();
      if(moved){for(const k of B.ksel)dedupeKeys(P.layers[k.i],k.p,refs);commit();}
      else{setPlaying(false);setLt(t);}
      renderTL();renderInsp();};
  };
  return d;
}
// after moving keys: sort, and where two keys share a time keep the one that was moved
function dedupeKeys(L,p,refs){const a=keysOf(L,p);if(!a.length)return;a.sort((x,y)=>x[0]-y[0]);
  for(let j=a.length-1;j>0;j--)if(Math.abs(a[j][0]-a[j-1][0])<1)a.splice(refs.has(a[j])?j-1:j,1);}
function tlTick(){
  const n=loopLen(),t=lt();$('tTime').innerHTML=n>0?`${fmtT(t)} <small>/ ${fmtT(n)}</small>`:'<small>static</small>';
  const ph=$('ph');if(!ph)return;const body=$('tlBody'),trk=body.querySelector('.ruler .trk');if(!trk)return;
  const br=body.getBoundingClientRect(),r=trk.getBoundingClientRect();ph.style.left=(r.left-br.left+body.scrollLeft+r.width*(t/n))+'px';ph.style.top='22px';ph.style.height=(body.scrollHeight-22)+'px';
  const hd=$('phHead');if(hd)hd.style.left=(t/n*100)+'%';
}
function jumpKey(dir){const P=proj(),n=loopLen();if(n<=0)return;const ls=B.sel>=0?[P.layers[B.sel]]:P.layers;const ts=[...new Set(ls.flatMap(keyTimes).concat(ls.filter(timed).flatMap(L=>[L.at|0,(L.at|0)+((L.length|0)>0?L.length|0:n-(L.at|0))])))].filter(x=>x<n).sort((a,b)=>a-b);
  const t=lt();const nx=dir>0?ts.find(x=>x>t+1):ts.filter(x=>x<t-1).pop();if(nx!==undefined){setPlaying(false);setLt(nx);refreshVals();}}

/* ---------- inspector ---------- */
const TOKENS=[['Time',['HH','MM','SS','DD','MO','MON','YYYY','WD','KW','DLEFT','YPCT']],['Weather',['TEMP','FEELS','HUM','RAIN','POP','WIND','WX','CITY','SUNSET']],['System',['CPU','RAM','FS','TEMPC','IP','UPTIME']]];
function setTab(t){B.tab=t;document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));renderInsp();}
function fieldsEl(L,list,onCh){
  const g=document.createElement('div');g.className='fields';const P=proj();
  for(const[k,kind,extra]of list){
    const lab=document.createElement('label');lab.textContent=k;lab.title=typeof extra==='string'?extra:k;let inp;
    if(kind==='font'){inp=document.createElement('select');const opts=[['small','small · 3×5'],['medium','medium · 5×7'],...Object.entries(FONTLIB).map(([id,F])=>[id,F.name+' · '+F.h+'px'])];
      if(L[k]&&!opts.some(o=>o[0]===L[k]))opts.push([L[k],L[k]+' (missing)']);
      opts.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;inp.appendChild(o);});inp.value=L[k]??'small';}
    else if(kind==='sel'){inp=document.createElement('select');extra.forEach(o=>{const op=document.createElement('option');op.value=op.textContent=o;inp.appendChild(op);});inp.value=L[k]??extra[0];}
    else if(kind==='bool'){inp=document.createElement('input');inp.type='checkbox';inp.checked=!!L[k];inp.style.width='auto';}
    else{inp=document.createElement('input');inp.type=kind==='text'?'text':'number';if(kind==='num')inp.step='0.01';if(kind==='time'){inp.placeholder='always';inp.step='50';}inp.value=L[k]??'';}
    if(typeof extra==='string')inp.title=extra;inp.dataset.k=k;inp.dataset.kind=kind;
    inp.oninput=()=>{let v=kind==='bool'?inp.checked:kind==='int'||kind==='time'?(inp.value===''?'':parseInt(inp.value)):kind==='num'?parseFloat(inp.value):inp.value;
      if(kind==='time'){if(v===''||isNaN(v))delete L.at;else L.at=Math.max(0,v);}
      else if((kind==='int'||kind==='num')&&(v===''||isNaN(v)))return;
      else if(k==='mode'&&v==='set')delete L.mode;else if(k==='move'&&v==='none')delete L.move;
      else if(k==='text'&&AUTO_NAMED.has(L.type)&&isAutoName(L,L.text)){L.text=v;L.name=autoName(v)||TYPES[L.type].label;const ni=document.querySelector('#insp [data-k="name"]');if(ni)ni.value=L.name;renderLayers();renderTL();}
      else L[k]=v;
      onCh&&onCh(k);commitSoon();};
    g.appendChild(lab);g.appendChild(inp);
    if(k==='text'&&(L.type==='text'||L.type==='marquee')){const tk=document.createElement('div');tk.className='full note';
      tk.innerHTML=TOKENS.map(([gn,ts])=>`${gn}: `+ts.map(t=>`<span class="chip" style="cursor:pointer" data-tok="${t}">${t}</span>`).join(' ')).join('<br>')+(L.type==='text'?'<br>Separate phrases with <b>|</b> and set <b>cycle</b> (ms per phrase).':'');
      tk.onclick=e=>{const t=e.target.dataset.tok;if(!t)return;const s=inp.selectionStart??inp.value.length;inp.value=inp.value.slice(0,s)+'{'+t+'}'+inp.value.slice(inp.selectionEnd??s);inp.oninput();inp.focus();};g.appendChild(tk);}
  }
  return g;
}
function sec(title,body,extra=''){const s=document.createElement('div');s.className='sec';s.innerHTML=`<h5>${title}<span class="grow"></span>${extra}</h5>`;if(body)s.appendChild(body);return s;}
function renderInsp(){
  const el=$('insp'),P=proj(),L=P.layers[B.sel];el.innerHTML='';
  if(B.tab==='project')return inspProject(el,P);
  if(B.tab==='json')return inspJson(el,P);
  if(!L){el.innerHTML='<div class="empty">Select a layer on the display, in the list or in the timeline.<br><br>New here? Add a <b>Text</b> layer from the left, set its time slot in the timeline, then animate it on the <b>Motion</b> tab.</div>';return;}
  if(B.tab==='motion')return inspMotion(el,P,L);
  const ty=TYPES[L.type];
  const head=document.createElement('div');head.className='row';head.style.marginBottom='6px';
  head.innerHTML=`<span class="chip">${esc(ty.label)}</span>${timed(L)?'<span class="chip">⏱ timed</span>':''}${anyKeys(L)?'<span class="chip" style="color:var(--key)">◆ keyframes</span>':''}<span class="grow" style="flex:1"></span>
    <button class="btn sm" id="iDup">Duplicate</button><button class="btn sm hot" id="iDel">Delete</button>`;
  el.appendChild(head);$('iDup').onclick=()=>dupLayer(B.sel);$('iDel').onclick=()=>delLayer(B.sel);
  const onCh=k=>{if(k==='name'){renderLayers();renderTL();}};
  el.appendChild(sec('Properties',fieldsEl(L,[['name','text'],...ty.fields],onCh)));
  if(!ty.fx){
    el.appendChild(sec('Appearance',fieldsEl(L,COMMON.slice(1,3),onCh)));
    el.appendChild(sec('Movement (loops)',fieldsEl(L,COMMON.slice(3),onCh)));
  }
  if(loopLen()>0){
    const ts=sec('Timing',fieldsEl(L,TIMING,k=>{renderTL();renderLayers();}));
    const acts=document.createElement('div');acts.className='row';acts.style.marginTop='8px';
    acts.innerHTML='<button class="btn sm" data-a="here">Start at playhead</button><button class="btn sm" data-a="always">Always visible</button><button class="btn sm" data-a="xd" title="Overlap with the layer that ends just before this one and dissolve between them">Cross-dissolve from previous</button>';
    acts.onclick=e=>{const a=e.target.dataset.a;if(!a)return;const n=loopLen();
      if(a==='always'){['at','length','in','out','tr','dip'].forEach(k=>delete L[k]);}
      if(a==='here'){const d=(L.length|0)>0?L.length:3000;L.at=Math.round(lt()/50)*50;L.length=Math.min(d,n-L.at);if(!L.in)L.in='dissolve';if(!L.out)L.out='dissolve';if(!L.tr)L.tr=300;}
      if(a==='xd'&&!crossDissolve(B.sel))return;
      commit();refreshAll();};
    ts.appendChild(acts);el.appendChild(ts);
  }else el.appendChild(sec('Timing',Object.assign(document.createElement('p'),{className:'note',textContent:'Static project: set a length in the timeline to time layers and use transitions.'})));
  if(L.type==='text'||L.type==='clock'){const s=sec('Pixels',Object.assign(document.createElement('p'),{className:'note',innerHTML:'Turn this layer into a bitmap of what it shows right now. Tokens and effects freeze; fonts are no longer needed on the display.'}));
    const b=document.createElement('button');b.className='btn sm';b.textContent='Convert to bitmap';b.onclick=()=>rasterize(B.sel);s.appendChild(b);el.appendChild(s);}
  if(L.type==='bitmap'||L.type==='anim')el.appendChild(sec('Data',Object.assign(document.createElement('p'),{className:'note',textContent:`${L.type==='anim'?L.n+' frames · ':''}${L.w}×${L.h} px · ${(b64d(L.data).length/1024).toFixed(1)} KB`})));
}
function crossDissolve(i){
  const P=proj(),L=P.layers[i],n=loopLen();if(!timed(L)){toast('Give this layer a time slot first');return false;}
  const at=L.at|0,end=at+((L.length|0)>0?L.length|0:n-at);let best=-1,bd=1e9;
  P.layers.forEach((M,j)=>{if(j===i||!timed(M)||TYPES[M.type]?.fx)return;const e=(M.at|0)+((M.length|0)>0?M.length|0:n-(M.at|0));if(e<=end&&(M.at|0)<at){const d=Math.abs(e-at);if(d<bd){bd=d;best=j;}}});
  if(best<0){toast('No earlier layer found to dissolve from');return false;}
  const M=P.layers[best],tr=Math.max(200,L.tr|0||500),me=(M.at|0)+((M.length|0)>0?M.length|0:n-(M.at|0));
  L.at=Math.max(0,me-tr);L.length=end-L.at;L.in='dissolve';L.tr=tr;M.out='dissolve';M.tr=Math.max(M.tr|0,tr);
  toast(`Cross-dissolve from “${M.name}” over ${tr} ms`);return true;
}
function inspMotion(el,P,L){
  const ty=TYPES[L.type];
  if(ty.fx){el.innerHTML='<div class="empty">FX layers have no keyframes. Use Timing on the Layer tab to switch them on and off.</div>';return;}
  if(loopLen()<=0){el.innerHTML='<div class="empty">Keyframes need a timeline.<br><br><button class="btn pri" id="mkSeq2">Make it a 10 s sequence</button></div>';$('mkSeq2').onclick=()=>{P.loop=10000;commit();refreshAll();};return;}
  const fl=new Set(ty.fields.map(f=>f[0])),props=KEYPROPS.filter(p=>p==='dx'||p==='dy'||p==='o'||fl.has(p));
  const box=document.createElement('div');
  box.innerHTML=`<p class="note">Values at the playhead <b class="val" id="mT">${fmtT(lt())}</b>. Change a value to set a keyframe ◆ there. Positions are offsets from the layer's x / y. Opacity fades by dithering, so two overlapping layers cross-dissolve.</p>`;
  for(const p of props){const r=document.createElement('div');r.className='kp';r.dataset.p=p;
    r.innerHTML=`<button class="dia" title="Add / remove keyframe at the playhead"></button><span class="lbl">${KLABEL[p]}</span><input type="number" step="1"><select title="Ease from this keyframe to the next">${EASES.map(e=>`<option>${e}</option>`).join('')}</select>`;
    const[dia,,inp,es]=r.children;
    dia.onclick=()=>{const t=lt();if(keyIdx(L,p,t)>=0)delKeyAt(L,p,t);else setKey(L,p,t,evalProp(L,p,t));commit();renderTL();renderLayers();refreshVals(true);};
    inp.oninput=()=>{if(inp.value===''||isNaN(+inp.value))return;setKey(L,p,lt(),+inp.value);commitSoon();renderTL();refreshVals(true);};
    inp.onchange=()=>{commit();renderLayers();};
    es.onchange=()=>{const i=keyIdx(L,p,lt());if(i<0)return;L.keys[p][i][2]=es.value;commit();renderTL();};
    box.appendChild(r);}
  el.appendChild(sec('Keyframes',box,`<button class="ib" id="mPrev" title="Previous key">◂◆</button><button class="ib" id="mNext" title="Next key">◆▸</button>`));
  const sp=document.createElement('div');sp.id='mSpeed';el.appendChild(sec('Smooth motion',sp));
  sp.onclick=e=>{const p=e.target.dataset.even;if(!p)return;if(evenSpeed(L,p)){commit();refreshAll();}};
  $('mPrev').onclick=()=>jumpKey(-1);$('mNext').onclick=()=>jumpKey(1);
  const pre=document.createElement('div');pre.className='row';
  const PRE=[['fadein','Fade in'],['fadeout','Fade out'],['left','Slide in ←'],['right','Slide in →'],['up','Rise up'],['drop','Drop in'],['pulse','Blink-fade'],...(fl.has('scale')?[['pop','Pop (scale)']]:[]),['clear','Clear keys']];
  pre.innerHTML=PRE.map(([k,t])=>`<button class="btn sm${k==='clear'?' hot':''}" data-p="${k}">${t}</button>`).join('')+'<div class="full note" style="width:100%">Presets start at the playhead and last 500 ms.</div>';
  pre.onclick=e=>{const k=e.target.dataset.p;if(!k)return;motionPreset(L,k);commit();refreshAll();};
  el.appendChild(sec('Presets',pre));
  // list of all keys
  const all=[];for(const p of KEYPROPS)keysOf(L,p).forEach(k=>all.push([k[0],p,k]));all.sort((a,b)=>a[0]-b[0]||KEYPROPS.indexOf(a[1])-KEYPROPS.indexOf(b[1]));
  const tb=document.createElement('div');
  if(!all.length)tb.innerHTML='<p class="note">No keyframes yet.</p>';
  else{tb.innerHTML=`<table class="keys"><colgroup><col style="width:64px"><col><col style="width:54px"><col style="width:74px"><col style="width:22px"></colgroup>${all.map(([t,p,k],j)=>`<tr data-j="${j}"${kselHas(B.sel,p,t)?' style="background:#ffd23f14"':''}><td><input type="number" step="50" value="${t}" data-f="t"></td><td class="note" title="Click to jump here">${KLABEL[p]}</td><td><input type="number" value="${k[1]}" data-f="v"></td><td><select data-f="e">${EASES.map(e=>`<option${e===k[2]?' selected':''}>${e}</option>`).join('')}</select></td><td><button class="ib" data-f="x">✕</button></td></tr>`).join('')}</table>`;
    tb.onchange=e=>{const tr=e.target.closest('tr');if(!tr)return;const[t,p,k]=all[+tr.dataset.j],f=e.target.dataset.f;
      if(f==='t'){k[0]=clampN(Math.round(+e.target.value||0),0,loopLen()-1);L.keys[p].sort((a,b)=>a[0]-b[0]);}
      if(f==='v')k[1]=normVal(p,e.target.value);if(f==='e')k[2]=e.target.value;commit();refreshAll();};
    tb.onclick=e=>{const tr=e.target.closest('tr');if(!tr)return;const[t,p]=all[+tr.dataset.j];
      if(e.target.dataset.f==='x'){delKeyAt(L,p,t);commit();refreshAll();return;}if(e.target.tagName==='TD'){setPlaying(false);setLt(t);B.ksel=[{i:B.sel,p,t}];renderTL();refreshVals(true);}};}
  el.appendChild(sec('All keyframes (ms)',tb));
  refreshVals(true);
}
/* even motion: on a 1-bit display a move looks smooth only when it advances by the same whole number of pixels
   every frame (or one pixel every n frames). The display draws 60 frames per second. */
function segAt(L,p,t){const a=keysOf(L,p);for(let i=0;i+1<a.length;i++)if(t>=a[i][0]&&t<a[i+1][0])return{a,i,k0:a[i],k1:a[i+1]};return null;}
function evenTarget(pf){if(pf>=1)return Math.round(pf);const k=Math.max(1,Math.round(1/pf));return 1/k;}
function isEven(pf){if(pf===0)return true;const t=evenTarget(pf);return Math.abs(pf-t)/t<0.02;}
function speedHtml(L){
  if(loopLen()<=0)return'';const out=[];
  for(const p of['dx','dy']){const g=segAt(L,p,lt());if(!g)continue;const dv=Math.abs(g.k1[1]-g.k0[1]),dt=g.k1[0]-g.k0[0];if(!dv||!dt)continue;
    const pps=dv/dt*1000,pf=dv/dt*FRAME_MS,lab=p==='dx'?'X':'Y';
    if(g.k0[2]!=='linear'){out.push(`<div class="note">${lab}: eased (${g.k0[2]}), the speed changes on purpose.</div>`);continue;}
    const ev=isEven(pf),t=evenTarget(pf);
    out.push(`<div class="row" style="justify-content:space-between"><span class="note">${lab}: <b>${pps.toFixed(1)} px/s</b> = ${pf.toFixed(2)} px per frame · ${ev?'<span class="val">even</span>':'<span style="color:var(--warn)">uneven steps</span>'}</span>${ev?'':`<button class="btn sm pri" data-even="${p}" title="Retime the next keyframe so the move advances ${t>=1?t+' px every frame':'1 px every '+Math.round(1/t)+' frames'}">Even out → ${(t*60).toFixed(t*60%1?1:0)} px/s</button>`}</div>`);}
  return out.join('')||'<p class="note">Put the playhead inside a linear X or Y move to check its speed. Even speeds at 60 fps: 15, 20, 30, 60, 120, 180 px/s …</p>';
}
function evenSpeed(L,p){
  const g=segAt(L,p,lt());if(!g)return false;const dv=Math.abs(g.k1[1]-g.k0[1]),dt=g.k1[0]-g.k0[0];if(!dv||!dt)return false;
  const t=evenTarget(dv/dt*FRAME_MS),ndt=Math.max(1,Math.round(dv/t*FRAME_MS)),d=g.k0[0]+ndt-g.k1[0];
  const last=g.a[g.a.length-1][0]+d;if(last>=loopLen()){toast('Not enough room before the loop ends: lengthen the sequence first');return false;}
  for(let j=g.i+1;j<g.a.length;j++)g.a[j][0]+=d;   // later keys keep their spacing
  toast(`${p==='dx'?'X':'Y'} move now ${(t*60).toFixed(t*60%1?1:0)} px/s (${d>0?'+':''}${d} ms)`);return true;
}
function motionPreset(L,k){
  const t=Math.round(lt()/50)*50,n=loopLen(),d=500,e=Math.min(n-1,t+d),b=Math.max(0,t-d);
  const pair=(p,v1,v2,ease='out',t1=t,t2=e)=>{setKey(L,p,t1,v1,ease);setKey(L,p,t2,v2,'linear');};
  if(k==='fadein')pair('o',0,100,'linear');
  if(k==='fadeout')pair('o',100,0,'linear');
  if(k==='left'){const bb=B.bbox;pair('dx',-(bb?bb[2]+1:W),0);}
  if(k==='right'){const bb=B.bbox;pair('dx',W-(bb?bb[0]:0),0);}
  if(k==='up')pair('dy',10,0);
  if(k==='drop')pair('dy',-(B.bbox?B.bbox[3]+1:H),0);
  if(k==='pulse'){setKey(L,'o',t,100,'inout');setKey(L,'o',Math.min(n-1,t+250),20,'inout');setKey(L,'o',e,100,'linear');}
  if(k==='pop'){const s=L.scale||1;setKey(L,'scale',t,s,'hold');setKey(L,'scale',Math.min(n-1,t+120),s+1,'hold');setKey(L,'scale',Math.min(n-1,t+360),s,'linear');}
  if(k==='clear')delete L.keys;
  void b;
}
function refreshVals(force){
  const P=proj(),L=P.layers[B.sel];if(!L)return;
  if(B.tab==='motion'){const mt=$('mT');if(mt)mt.textContent=fmtT(lt());const ms=$('mSpeed');if(ms){const h=speedHtml(L);if(ms._h!==h){ms._h=h;ms.innerHTML=h;}}
    document.querySelectorAll('#insp .kp').forEach(r=>{const p=r.dataset.p,[dia,,inp,es]=r.children,t=lt(),ki=keyIdx(L,p,t);
      dia.className='dia'+(ki>=0?' on':hasK(L,p)?' has':'');if(document.activeElement!==inp)inp.value=Math.round(evalProp(L,p,t)*10)/10;
      es.disabled=ki<0;if(ki>=0&&document.activeElement!==es)es.value=L.keys[p][ki][2]||'linear';});}
  else if(B.tab==='layer'){document.querySelectorAll('#insp [data-k]').forEach(i=>{if(document.activeElement===i)return;const v=L[i.dataset.k];if(i.type==='checkbox')i.checked=!!v;else if(i.tagName!=='SELECT')i.value=v??'';else i.value=v??i.options[0]?.value;});}
}
function inspProject(el,P){
  const g=document.createElement('div');g.className='fields';
  g.innerHTML=`<label>Name</label><input type="text" id="pjName"><label>ID</label><input type="text" id="pjId" title="File name on the display: a–z, 0–9, - and _">
    <label>Length</label><div class="row"><input type="number" id="pjLoop" min="0" step="0.5" style="width:80px"><span class="note">s · 0 = static</span></div>
    <label>Brightness</label><div class="row" style="flex-wrap:nowrap"><input type="range" id="pjBr" min="0" max="255"><span class="val" id="pjBrV" style="width:30px"></span></div>
    <label>Pixel shift</label><select id="pjShift"><option value="both">±1 px orbit (default)</option><option value="pos">+1 px</option><option value="neg">−1 px</option><option value="off">off</option></select>
    <label>Language</label><select id="pjLang"><option value="en">English</option><option value="de">Deutsch</option></select>`;
  el.appendChild(sec('Project',g));
  $('pjName').value=P.name||'';$('pjId').value=P.id;$('pjLoop').value=(P.loop|0)/1000;$('pjBr').value=P.brightness??200;$('pjBrV').textContent=P.brightness??200;
  $('pjShift').value=P.shift===undefined?'both':P.shift===true?'pos':P.shift===false?'off':P.shift;$('pjLang').value=P.lang||'en';
  $('pjName').oninput=e=>{P.name=e.target.value;$('pName').textContent=P.name||'UNTITLED';commitSoon();};
  $('pjId').onchange=e=>{const v=e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,40);if(!v||B.projects.some(q=>q!==P&&q.id===v)){toast('ID empty or already used');e.target.value=P.id;return;}P.id=v;B.cur=v;e.target.value=v;commit();};
  $('pjLoop').oninput=e=>{const v=parseFloat(e.target.value);if(v>0)P.loop=Math.round(v*1000);else delete P.loop;commitSoon();renderTL();};
  $('pjBr').oninput=e=>{P.brightness=+e.target.value;$('pjBrV').textContent=P.brightness;commitSoon();devBright();};
  $('pjShift').onchange=e=>{P.shift=e.target.value;commit();};$('pjLang').onchange=e=>{P.lang=e.target.value;commit();};
  const json=JSON.stringify(cleanProject(P)),fonts=usedFonts(P);
  const info=document.createElement('p');info.className='note';
  info.innerHTML=`${P.layers.length} layers · ${(json.length/1024).toFixed(1)} KB on the display${fonts.length?` · fonts: ${fonts.map(esc).join(', ')}`:''}<br>Weather and system values in the preview are ${WX.sample?'sample data':'from '+esc(WX.city||'the display')}.`;
  el.appendChild(sec('Info',info));
  const v=document.createElement('div');v.className='fields';v.innerHTML=`<label>Tube colour</label><input type="color" id="pjTint" style="width:60px;height:26px;padding:0;background:none;border:0"><label>New layers</label><label class="ck"><input type="checkbox" id="pjAddT">get a time slot at the playhead</label>`;
  el.appendChild(sec('Builder',v));$('pjTint').value=B.view.tint;$('pjTint').oninput=e=>{B.view.tint=e.target.value;paintBg();save();};
  $('pjAddT').checked=!!B.view.addTimed;$('pjAddT').onchange=e=>{B.view.addTimed=e.target.checked;save();};
}
function inspJson(el,P){
  const s=sec('Project JSON',null);el.appendChild(s);
  s.insertAdjacentHTML('beforeend','<p class="note">Edit and apply. Fonts are referenced by id (Export JSON can embed them).</p><textarea id="jTxt" rows="22" spellcheck="false"></textarea><div class="row" style="margin-top:6px"><button class="btn sm pri" id="jApply">Apply</button><button class="btn sm" id="jReset">Revert</button></div><div class="msgs" id="jMsg"></div>');
  const fill=()=>{$('jTxt').value=JSON.stringify(cleanProject(P),null,1);};fill();
  $('jReset').onclick=fill;
  $('jTxt').oninput=()=>{try{const r=validateProject(extractJson($('jTxt').value));showMsgs($('jMsg'),r);}catch(e){showMsgs($('jMsg'),{E:[e.message],Wn:[]});}};
  $('jApply').onclick=()=>{let r;try{r=validateProject(extractJson($('jTxt').value));}catch(e){return showMsgs($('jMsg'),{E:[e.message],Wn:[]});}
    showMsgs($('jMsg'),r);if(r.E.length)return;const np=r.P;migrateFonts(np);
    if(np.id!==P.id&&B.projects.some(q=>q!==P&&q.id===np.id))np.id=P.id;
    for(const k of Object.keys(P))delete P[k];Object.assign(P,np);B.cur=P.id;B.sel=Math.min(B.sel,P.layers.length-1);commit();refreshAll();toast('Applied');if($('jMsg'))showMsgs($('jMsg'),r);};
}
function showMsgs(el,r){el.innerHTML=r.E.map(m=>`<div class="err">${esc(m)}</div>`).join('')+r.Wn.map(m=>`<div>${esc(m)}</div>`).join('')+(!r.E.length?`<div class="ok">Valid · ${r.P?r.P.layers.length:0} layers${r.Wn.length?' · '+r.Wn.length+' note(s), fixed automatically':''}</div>`:'');}

/* ---------- validation (import, JSON tab, AI answers) ---------- */
function extractJson(txt){txt=String(txt||'').trim();const a=txt.indexOf('{'),b=txt.lastIndexOf('}');if(a<0||b<a)throw new Error('No JSON object found in the text.');
  try{return JSON.parse(txt.slice(a,b+1));}catch(e){throw new Error('JSON syntax error: '+e.message);}}
function validFont(F){return F&&typeof F==='object'&&F.h>0&&typeof F.chars==='string'&&Array.isArray(F.w)&&F.w.length===[...F.chars].length&&typeof F.data==='string';}
function validateProject(o){
  const E=[],Wn=[];
  if(!o||typeof o!=='object'||Array.isArray(o)){E.push('The JSON must be one object with a "layers" list.');return{E,Wn};}
  if(!Array.isArray(o.layers)){E.push('"layers" is missing or not a list.');return{E,Wn};}
  const P={id:'',name:'',v:1,brightness:200,lang:'en',shift:'both',layers:[]};
  P.name=String(o.name||'UNTITLED').slice(0,48);
  P.id=String(o.id||'').toLowerCase().replace(/[^a-z0-9_-]/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||('p-'+uid());
  if(o.brightness!=null){const b=+o.brightness;if(isFinite(b))P.brightness=clampN(Math.round(b),0,255);else Wn.push('brightness is not a number → 200');}
  if(o.lang!=null){if(o.lang==='en'||o.lang==='de')P.lang=o.lang;else Wn.push(`lang "${o.lang}" unknown → en`);}
  if(o.shift!==undefined){const s=o.shift===true?'pos':o.shift===false?'off':o.shift;if(['off','pos','neg','both'].includes(s))P.shift=s;else Wn.push(`shift "${o.shift}" unknown → both`);}
  let loop=o.loop==null?0:Math.round(+o.loop);if(!isFinite(loop)||loop<0){Wn.push('loop is not a positive number → static');loop=0;}
  if(o.fonts&&typeof o.fonts==='object'){P.fonts={};for(const[id,F]of Object.entries(o.fonts)){if(validFont(F))P.fonts[id]=F;else Wn.push(`embedded font "${id}" is incomplete and was dropped`);}if(!Object.keys(P.fonts).length)delete P.fonts;}
  const fontIds=new Set(['small','medium',...Object.keys(FONTLIB),...Object.keys(P.fonts||{})]);
  let maxT=0,anyTime=false;
  o.layers.forEach((L0,i)=>{
    const tag=`Layer ${i+1}${L0&&L0.name?' “'+L0.name+'”':''}`;
    if(!L0||typeof L0!=='object'||Array.isArray(L0)){E.push(tag+': not an object');return;}
    const ty=TYPES[L0.type];if(!ty){E.push(`${tag}: unknown type "${L0.type}". Allowed: ${Object.keys(TYPES).join(', ')}`);return;}
    const L={type:L0.type,name:String(L0.name||ty.label).slice(0,40),...clone(ty.def)};
    const known=new Set(['type','name','keys','visible','locked','data','n','w','h']);
    const coerce=(k,kind,extra,v)=>{
      if(kind==='int'||kind==='num'){const x=+v;if(v===''||v===null||!isFinite(x)){Wn.push(`${tag}: ${k} is not a number → default`);return undefined;}return kind==='int'?Math.round(x):x;}
      if(kind==='bool')return v===true||v==='true'||v===1;
      if(kind==='sel'){if(extra.includes(v))return v;Wn.push(`${tag}: ${k} "${v}" not allowed (${extra.join(' | ')}) → ${L[k]??extra[0]}`);return undefined;}
      if(kind==='font'){if(fontIds.has(v))return v;Wn.push(`${tag}: font "${v}" is not in the library → medium`);return 'medium';}
      return String(v);};
    for(const[k,kind,extra]of[...ty.fields,...COMMON.slice(1)]){known.add(k);if(L0[k]===undefined)continue;const v=coerce(k,kind,extra,L0[k]);if(v!==undefined)L[k]=v;}
    if(L.mode==='set')delete L.mode;if(L.move==='none')delete L.move;
    if(L0.visible===false)L.visible=false;if(L0.locked)L.locked=true;
    for(const k of['w','h','n'])if(L0[k]!==undefined&&isFinite(+L0[k]))L[k]=Math.round(+L0[k]);
    if(typeof L0.data==='string')L.data=L0.data;
    for(const[k,kind,extra]of TIMING)known.add(k);
    if(L0.at!==undefined&&L0.at!==null&&L0.at!==''){const a=Math.round(+L0.at);if(isFinite(a)&&a>=0){L.at=a;anyTime=true;}else Wn.push(`${tag}: at is not a number → always visible`);}
    if(L.at!==undefined){
      if(L0.length!=null){const x=Math.round(+L0.length);if(isFinite(x)&&x>=0)L.length=x;else Wn.push(`${tag}: length invalid → until loop end`);}
      for(const k of['in','out'])if(L0[k]!=null){if(TRANS.includes(L0[k]))L[k]=L0[k];else Wn.push(`${tag}: ${k} "${L0[k]}" not allowed (${TRANS.join(' | ')}) → none`);}
      if(L0.tr!=null&&isFinite(+L0.tr))L.tr=Math.max(0,Math.round(+L0.tr));
      if(L0.dip)L.dip=true;
      maxT=Math.max(maxT,L.at+(L.length|0));
    }
    if(L0.keys!==undefined){
      if(ty.fx)Wn.push(`${tag}: FX layers have no keyframes → removed`);
      else if(typeof L0.keys!=='object'||Array.isArray(L0.keys))Wn.push(`${tag}: keys must be an object like {"dx":[[0,-40,"out"],[600,0]]} → removed`);
      else{const K={};for(const[p,a]of Object.entries(L0.keys)){
          if(!KEYPROPS.includes(p)){Wn.push(`${tag}: keyframe property "${p}" unknown (${KEYPROPS.join(' | ')}) → removed`);continue;}
          if(!Array.isArray(a)){Wn.push(`${tag}: keys.${p} is not a list → removed`);continue;}
          const out=[];for(const k of a){if(!Array.isArray(k)||k.length<2||!isFinite(+k[0])||!isFinite(+k[1])){Wn.push(`${tag}: keys.${p} entry ${JSON.stringify(k)} must be [time_ms, value, ease] → removed`);continue;}
            const e=k[2]==null?'linear':EASES.includes(k[2])?k[2]:(Wn.push(`${tag}: ease "${k[2]}" unknown → linear`),'linear');out.push([Math.max(0,Math.round(+k[0])),normVal(p,k[1]),e]);maxT=Math.max(maxT,+k[0]);}
          if(out.length){out.sort((x,y)=>x[0]-y[0]);K[p]=out;anyTime=true;}}
        if(Object.keys(K).length)L.keys=K;}
    }
    for(const k of Object.keys(L0))if(!known.has(k)&&!k.startsWith('_'))Wn.push(`${tag}: field "${k}" is not used by ${L0.type} → ignored`);
    if(L.type==='bitmap'||L.type==='anim'){let len=-1;try{len=b64d(L.data||'').length;}catch(e){}const need=((L.w+7)>>3)*L.h*(L.type==='anim'?Math.max(1,L.n|0):1);
      if(len!==need){E.push(`${tag}: bitmap data has ${len<0?'invalid base64':len+' bytes'}, ${need} expected for ${L.w}×${L.h}${L.type==='anim'?' × '+L.n+' frames':''}. Import images with Image / GIF instead.`);return;}}
    P.layers.push(L);
  });
  if(anyTime&&loop<=0){loop=Math.max(5000,Math.ceil((maxT+1000)/500)*500);Wn.push(`Timing or keyframes without "loop" → loop set to ${loop} ms`);}
  if(loop>0){P.loop=loop;P.layers.forEach((L,i)=>{if(timed(L)&&L.at>=loop)Wn.push(`Layer ${i+1}: starts at ${L.at} ms, after the loop ends (${loop} ms) → never visible`);});}
  if(!P.layers.length&&!E.length)Wn.push('The project has no layers.');
  return{E,Wn,P};
}
function cleanProject(P){const o=clone(P);delete o.fonts;o.layers.forEach(L=>{delete L.locked;});return o;}

/* ---------- modal ---------- */
function modal(title,html,buttons,wide){
  $('mTitle').textContent=title;$('mBody').innerHTML=html;$('mBox').classList.toggle('wide',!!wide);const f=$('mFoot');f.innerHTML='';
  buttons.forEach(([label,cls,fn])=>{const b=document.createElement('button');b.className='btn'+(cls?' '+cls:'');b.textContent=label;b.onclick=()=>{if(fn&&fn()===false)return;closeModal();};f.appendChild(b);});
  $('modal').classList.add('open');
}
function closeModal(){$('modal').classList.remove('open');}
$('modal').addEventListener('pointerdown',e=>{if(e.target.id==='modal')closeModal();});
function copyText(text){return(navigator.clipboard&&window.isSecureContext?navigator.clipboard.writeText(text):Promise.reject()).then(()=>toast('Copied'),()=>{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();let ok=false;try{ok=document.execCommand('copy');}catch(e){}t.remove();toast(ok?'Copied':'Select all + copy manually');});}
function download(text,name,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}

/* ---------- project menu ---------- */
function openMenu(){const m=$('pMenu'),r=$('pName').getBoundingClientRect();m.style.left=r.left+'px';m.style.top=(r.bottom+4)+'px';m.classList.add('open');}
$('pName').onclick=openMenu;$('pMenuBtn').onclick=openMenu;
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#pMenu,#pName,#pMenuBtn'))$('pMenu').classList.remove('open');});
$('pMenu').onclick=e=>{const a=e.target.closest('button')?.dataset.a;if(!a)return;$('pMenu').classList.remove('open');
  ({back:goStudio,new:newModal,open:openModal,rename:renameModal,dup:()=>{const c=clone(proj());c.id='p-'+uid();c.name+=' COPY';B.projects.push(c);switchTo(c.id);},
    import:importModal,export:exportModal,studio:goStudio,
    del:()=>modal('Delete project',`<p>Delete <b>${esc(proj().name)}</b> from the Builder? Projects on the display stay.</p>`,[['Cancel'],['Delete','hot',()=>{B.projects=B.projects.filter(p=>p!==proj());if(!B.projects.length)B.projects.push(tplBlank());switchTo(B.projects[0].id);}]])})[a]();};
function goStudio(){commit();clearTimeout(saveT);store.set('vfdb.projects',B.projects.map(clone));store.set('vfdb.cur',B.cur);location.href=onDevice?'/':'vfd-studio.html';}
function switchTo(id){B.cur=id;B.sel=-1;B.ksel=[];B.ph=0;histReset();refreshAll();save();}
function renameModal(){modal('Rename project','<input type="text" id="rn">',[['Cancel'],['Save','pri',()=>{proj().name=$('rn').value.trim()||proj().name;commit();refreshAll();}]]);$('rn').value=proj().name;$('rn').focus();$('rn').select();
  $('rn').onkeydown=e=>{if(e.key==='Enter'){proj().name=$('rn').value.trim()||proj().name;commit();refreshAll();closeModal();}};}
function thumb(P,cv){cv.width=W;cv.height=H;const f=new FB(),P2=clone(P);P2._t0=0;const T=timeObj(new Date(2026,0,15,10,8,30).getTime());T.t=(P.loop|0)>0?Math.min(1800,(P.loop|0)-1):1800;
  try{renderProject(f,P2,T,-1);}catch(e){}const x=cv.getContext('2d'),id=x.createImageData(W,H);for(let i=0;i<W*H;i++)if(f.p[i]){id.data[i*4]=77;id.data[i*4+1]=255;id.data[i*4+2]=210;id.data[i*4+3]=255;}x.putImageData(id,0,0);}
function newModal(){
  const list=[...TEMPLATES.map(([n,f])=>[n,f()]),...demos().map(d=>[d.name,d])];
  modal('New project',`<p class="note">Start from a template. Demos are full projects you can take apart.</p><div class="tpl" id="tplGrid"></div>`,[['Cancel']],true);
  list.forEach(([n,P],k)=>{const c=document.createElement('div');c.className='card';c.innerHTML=`<canvas></canvas><div>${esc(n)}</div>`;thumb(P,c.firstChild);
    c.onclick=()=>{const p=clone(P);p.id=(k<TEMPLATES.length?'p-':'my-')+uid();if(k>=TEMPLATES.length)p.name=P.name;migrateFonts(p);B.projects.push(p);switchTo(p.id);closeModal();};$('tplGrid').appendChild(c);});
}
async function openModal(){
  const studio=(store.get('vfd.projects',null)||[]).filter(p=>p&&Array.isArray(p.layers));
  const item=(src,p,i)=>`<div class="item" data-src="${src}" data-i="${i}"><span class="nm">${esc(p.name||p.id)}</span><span class="note">${esc(p.id)}${p.layers?' · '+p.layers.length+' layers':''}</span>${src==='b'?`<button class="ib" data-del="${i}" title="Remove from the Builder">✕</button>`:''}</div>`;
  modal('Open project',`<div class="list"><h6>In the Builder</h6>${B.projects.map((p,i)=>item('b',p,i)).join('')}
    ${studio.length?`<h6>VFD Studio (this browser)</h6>${studio.map((p,i)=>item('s',p,i)).join('')}`:''}
    <h6>On the display</h6><div id="oDev">${dev.ok?'<p class="note">Loading…</p>':'<p class="note">Connect to the display (top right) to open its projects.</p>'}</div></div>`,[['Close']]);
  let devList=[];
  $('mBody').onclick=async e=>{const del=e.target.dataset.del;if(del!==undefined){e.stopPropagation();const p=B.projects[+del];if(B.projects.length<2)return toast('Keep at least one project');B.projects.splice(+del,1);if(p===proj())B.cur=B.projects[0].id;save();closeModal();openModal();refreshAll();return;}
    const it=e.target.closest('.item');if(!it)return;const i=+it.dataset.i,src=it.dataset.src;
    if(src==='b'){switchTo(B.projects[i].id);closeModal();return;}
    let o;if(src==='s')o=clone(studio[i]);else{try{o=await(await devFetch('/api/project?id='+encodeURIComponent(devList[i].id))).json();}catch(err){return toast('Could not load: '+err.message);}}
    const r=validateProject(o);if(r.E.length)return toast(r.E[0]);const P=r.P;if(B.projects.some(q=>q.id===P.id)){const ex=B.projects.find(q=>q.id===P.id);Object.keys(ex).forEach(k=>delete ex[k]);Object.assign(ex,P);}else B.projects.push(P);
    migrateFonts(P);if(src==='d')await pullFonts(P);switchTo(P.id);closeModal();toast('Opened '+P.name);};
  if(dev.ok){try{const info=await(await devFetch('/api/info')).json();devList=info.projects||[];$('oDev').innerHTML=devList.map((p,i)=>item('d',p,i)).join('')||'<p class="note">No projects on the display.</p>';}catch(e){$('oDev').innerHTML='<p class="note">Could not load the list.</p>';}}
}
function exportModal(){
  const P=proj();const build=emb=>{const o=cleanProject(P);if(emb){const f={};usedFonts(P).forEach(id=>{if(FONTLIB[id])f[id]=clone(FONTLIB[id]);});if(Object.keys(f).length)o.fonts=f;}return JSON.stringify(o);};
  modal('Export project JSON',`<label class="ck"><input type="checkbox" id="xEmb" checked> Embed fonts (self-contained file)</label><textarea id="xTxt" rows="14" readonly spellcheck="false" style="margin-top:8px"></textarea><p class="note" id="xInfo"></p>`,
    [['Close'],['Download',null,()=>{download($('xTxt').value,P.id+'.json');return false;}],['Copy','pri',()=>{copyText($('xTxt').value);return false;}]]);
  const upd=()=>{$('xTxt').value=build($('xEmb').checked);$('xInfo').textContent=($('xTxt').value.length/1024).toFixed(1)+' KB';};$('xEmb').onchange=upd;upd();
}
function importModal(text){
  modal('Import project JSON',`<p class="note">Paste JSON from an export or from an AI answer (text around the JSON is ignored), or pick a file.</p>
    <textarea id="iTxt" rows="13" spellcheck="false" placeholder="{ &quot;name&quot;: …, &quot;layers&quot;: [ … ] }"></textarea>
    <div class="row" style="margin-top:6px"><input type="file" id="iFile" accept=".json,application/json,text/plain" style="width:auto"></div><div class="msgs" id="iMsg"></div>`,
    [['Cancel'],['Replace current',null,()=>doImport(false)],['Import as new','pri',()=>doImport(true)]]);
  let res=null;const chk=()=>{try{res=validateProject(extractJson($('iTxt').value));showMsgs($('iMsg'),res);}catch(e){res=null;showMsgs($('iMsg'),{E:[e.message],Wn:[]});}};
  $('iTxt').oninput=chk;$('iFile').onchange=e=>{const f=e.target.files[0];if(f)f.text().then(t=>{$('iTxt').value=t;chk();});};
  if(text){$('iTxt').value=text;chk();}
  function doImport(asNew){if(!res||res.E.length){toast(res?'Fix the errors first':'Nothing to import');return false;}
    const np=res.P;migrateFonts(np);
    if(asNew){if(B.projects.some(q=>q.id===np.id))np.id=np.id.slice(0,33)+'-'+uid();B.projects.push(np);switchTo(np.id);}
    else{const P=proj();np.id=P.id;for(const k of Object.keys(P))delete P[k];Object.assign(P,np);B.sel=-1;commit();refreshAll();}
    toast('Imported · '+np.layers.length+' layers');}
}

/* ---------- AI base prompt ---------- */
function aiPrompt(){
  const fdoc=([k,kind,extra])=>`${k}${kind==='sel'?' ('+extra.join('|')+')':kind==='font'?' (font id)':kind==='bool'?' (true|false)':kind==='int'?' (integer)':kind==='num'?' (number)':kind==='time'?' (ms)':' (string)'}${typeof extra==='string'&&k!=='text'?' – '+extra:''}`;
  const types=Object.entries(TYPES).filter(([k])=>k!=='bitmap'&&k!=='anim').map(([k,t])=>`- "${k}" – ${t.label}${t.fx?' (effect: changes what was drawn BEFORE it)':''}\n  fields: ${t.fields.map(fdoc).join('; ')}\n  defaults: ${JSON.stringify(t.def)}`).join('\n');
  const lib=Object.entries(FONTLIB).map(([id,F])=>`- "${id}" – ${F.name}, ${F.h} px tall, characters: ${F.chars.length>60?F.chars.slice(0,60)+'…':F.chars}`).join('\n');
  const ex=JSON.stringify(cleanProject(tplTitles()));
  return `You are an animation designer for a VFD Studio display. Turn my description (at the end) into ONE project JSON.

OUTPUT RULES
- Reply with the JSON object only: no explanation, no markdown fences, no comments.
- Valid JSON: double quotes, no trailing commas. Coordinates, sizes and times are integers.
- Never create "bitmap" or "anim" layers (images are imported separately).

THE DISPLAY
- 256 × 48 pixels, 1 bit: each pixel is on or off (one colour). No grey, no colours.
- x = 0…255 left to right, y = 0…47 top to bottom. Keep important content at least 1 px from the edges (the firmware moves the whole image by ±1 px every 5 minutes to protect the tube).
- Fades and opacity are drawn as ordered dithering, so they look like a pixel dissolve.
- Big, bold and simple reads best. Leave black space. Thin 1 px details flicker less than large filled areas.

PROJECT
{"id":"lowercase-id","name":"SHORT NAME","v":1,"brightness":200,"lang":"en","shift":"both","loop":10000,"layers":[…]}
- id: a–z, 0–9, - and _, max 40 characters. name: max 24 characters, uppercase looks best.
- brightness 0–255 (200 typical). lang "en" or "de" (weekday/month names). shift: "both" (keep it).
- loop: length of the sequence in ms (e.g. 8000). The sequence repeats forever. Use 0 for a static screen with no timing.
- layers are drawn in list order: later layers draw on top of earlier ones.

LAYER TYPES
${types}

FIELDS EVERY LAYER CAN HAVE
- name (string) – label in the editor
- blink (integer ms) – blink period, 0 = off
- mode ("set"|"clear"|"xor") – set draws pixels on, clear erases (cut-outs), xor inverts what is below
- move ("none"|"slide"|"pingpong"|"sine"|"circle") with moveX, moveY (px), movePeriod (ms), movePhase (0–1) – endless looping motion

TIMING (needs "loop" > 0)
- at (ms) – when the layer appears in the loop. Leave "at" out to show the layer all the time.
- length (ms) – how long it stays. 0 or missing = until the loop ends.
- in / out ("none"|"dissolve"|"wipe"|"slide"|"type"|"scramble") – transition at the start / end. "type" and "scramble" work on text layers.
- tr (ms) – transition duration (300–800 looks good).
- dip (true) – dims the whole display briefly around this layer's start and end (a "flash cut").
- Cross-dissolve: let two layers overlap by tr ms, the first with out "dissolve", the second with in "dissolve".

KEYFRAMES (needs "loop" > 0)
"keys": {"dx":[[0,-60,"out"],[600,0,"linear"]], "o":[[2000,100,"linear"],[2500,0,"linear"]]}
- Each entry is [time_ms, value, ease]. Times are positions in the loop (not relative to "at"), sorted ascending.
- Before the first key the first value holds, after the last key the last value holds.
- dx, dy – pixel offset added to the layer position (use for slides, drops, bounces).
- o – opacity 0–100 (dithered).
- w, h – override the layer's width / height (shapes, rectangles, bars, graphs).
- scale – override the text scale (integer ≥ 1).
- ease applies from this key to the next: "linear", "in" (accelerate), "out" (decelerate), "inout", "hold" (jump at the next key).
- The display draws 60 frames per second. A linear move looks smooth only at an even speed: a whole number of pixels per frame or one pixel every few frames. Good speeds: 15, 20, 30, 60, 120, 180 px/s. Pick key times to match, e.g. 300 px in 5000 ms = 60 px/s.

TEXT
- Built-in fonts: "small" = 3×5 px, advance 4 px per character; "medium" = 5×7 px in an 8 px row, advance 6 px. Both are uppercase only (lowercase is drawn uppercase); umlauts map to A/O/U.
- Text width ≈ characters × advance × scale − 1. With align "center", x is the centre point; with "right", x is the right edge.
- scale multiplies the font (scale 2 medium = 16 px tall, 12 px per character; at most about 21 characters at scale 1 medium fit on one line).
- Tokens inside text are replaced live: time {HH} {MM} {SS} {DD} {MO} {MON} {YYYY} {YY} {WD} {KW} {DOY} {DLEFT} {YPCT} {TZ}; weather {TEMP} {TEMP1} {FEELS} {TMAX} {TMIN} {HUM} {RAIN} {RAINNOW} {POP} {WIND} {WX} {SUNRISE} {SUNSET} {CITY}; system {CPU} {RAM} {FS} {TEMPC} {RSSI} {UPTIME} {IP}.
- "A|B|C" with cycle 2000 shows the phrases one after another.
${lib?'- Fonts in my library (use the id in "font"):\n'+lib:'- Only use "small" and "medium".'}

EXAMPLE (a 9 s title sequence)
${ex}

MY ANIMATION:
`;
}
function aiModal(){
  const p=aiPrompt();
  modal('AI base prompt',`<p class="note"><b>1.</b> Copy this prompt into an AI chat (Claude, ChatGPT…). <b>2.</b> Write what you want at the end, e.g. “a 10 second intro: HELLO types in, a ring spins, then the clock dissolves in”. <b>3.</b> Paste the answer into <b>Import JSON</b>; errors are listed and small mistakes are fixed automatically.</p>
    <textarea id="aiTxt" rows="16" readonly spellcheck="false"></textarea><p class="note">${(p.length/1024).toFixed(1)} KB · includes all layer types, rules${Object.keys(FONTLIB).length?' and your '+Object.keys(FONTLIB).length+' library font(s)':''}.</p>`,
    [['Close'],['Download .txt',null,()=>{download(p,'vfd-ai-prompt.txt','text/plain');return false;}],['Paste answer…',null,()=>{setTimeout(()=>importModal(),0);}],['Copy prompt','pri',()=>{copyText(p);return false;}]]);
  $('aiTxt').value=p;
}

/* ---------- fonts ---------- */
function fontsModal(){
  const uses=id=>B.projects.filter(q=>q.layers.some(l=>l.font===id)).length;
  const list=()=>Object.entries(FONTLIB).map(([id,F])=>`<div class="item"><span class="nm">${esc(F.name)} · ${F.h}px · ${[...F.chars].length} chars · ${(b64d(F.data).length/1024).toFixed(1)} KB · used in ${uses(id)}</span><span class="note">${esc(id)}</span><button class="ib" data-del="${esc(id)}" title="Remove">✕</button></div>`).join('')||'<p class="note">No fonts yet. Bake one below.</p>';
  modal('Font library',`<p class="note">Fonts are baked to pixels here, stored once and shared by all projects (also with VFD Studio in this browser). Sending a project uploads the fonts it uses to the display. Or convert a text layer to a bitmap (Layer tab) to send pixels only.</p><div class="list" id="fList">${list()}</div>
    <div class="fields" style="margin-top:12px">
      <label>Source</label><select id="fSrc"><option value="g">Google Font</option><option value="u">Font file (TTF, OTF, WOFF)</option></select>
      <label>Google Font</label><select id="fG">${GFONTS.map(f=>`<option>${f}</option>`).join('')}</select>
      <label>…or any name</label><input type="text" id="fGName" placeholder="Any Google Fonts family">
      <label>File</label><input type="file" id="fFile" accept=".ttf,.otf,.woff,.woff2">
      <label>Size px</label><input type="number" id="fSize" value="16" min="5" max="48">
      <label>Threshold</label><input type="range" id="fThr" min="1" max="254" value="110">
      <label>Spacing</label><input type="number" id="fSp" value="1" min="0" max="8">
      <label>Characters</label><select id="fSet">${Object.keys(CHARSETS).map(k=>`<option>${k}</option>`).join('')}<option value="custom">Custom…</option></select>
      <label></label><input type="text" id="fCustom" placeholder="Only these characters" style="display:none">
      <label>Preview</label><input type="text" id="fPrev" value="NEON 12:34 Grüße">
    </div><canvas id="fCanvas" class="prev" style="margin-top:10px"></canvas><p class="note" id="fInfo"></p>
    <p class="note">Pixel fonts stay crisp: Press Start 2P (8/16/24), VT323, Silkscreen (8/16), Tiny5, Micro 5, Pixelify Sans. Others look best from about 14 px.</p>`,
    [['Close'],['Add to library','pri',()=>{if(!fState.font)return false;let id=fState.font.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');FONTLIB[id]=fState.font;saveLib();$('fList').innerHTML=list();toast('Added · pick it in a text layer');renderInsp();return false;}]],true);
  $('fList').onclick=e=>{const id=e.target.dataset.del;if(!id)return;if(uses(id))return toast('Used by a project');delete FONTLIB[id];saveLib();$('fList').innerHTML=list();};
  const fState={};let t=0;
  const fam=async()=>{if($('fSrc').value==='u'){const f=$('fFile').files[0];if(!f)return null;if(fState.file!==f){const n='UF_'+uid();const ff=new FontFace(n,await f.arrayBuffer());await ff.load();document.fonts.add(ff);fState.file=f;fState.ufam=n;fState.uname=f.name.replace(/\.\w+$/,'');}return{fam:fState.ufam,name:fState.uname};}
    const g=$('fGName').value.trim()||$('fG').value;await ensureGoogleFont(g);return{fam:g,name:g};};
  const run=async()=>{try{const F=await fam();if(!F){$('fInfo').textContent='Pick a font file.';return;}
      const cs=$('fSet').value==='custom'?(' '+$('fCustom').value):CHARSETS[$('fSet').value]();const chars=[...new Set([...cs])].join('');
      const font=await bakeFont({family:F.fam,size:+$('fSize').value,thr:+$('fThr').value,sp:+$('fSp').value,chars});font.name=`${F.name} ${$('fSize').value}`;fState.font=font;
      const f2=new FB(),key='__prev',old=CUR_FONTS;CUR_FONTS={[key]:font};const s=$('fPrev').value,tw=textW(s,key,1);drawText(f2,Math.max(0,Math.floor((W-tw)/2)),Math.max(0,Math.floor((H-font.h)/2)),s,key,1);CUR_FONTS=old;
      const cv=$('fCanvas'),sc=3;cv.width=W*sc;cv.height=H*sc;const x=cv.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,cv.width,cv.height);x.fillStyle=B.view.tint;for(let i=0;i<W*H;i++)if(f2.p[i])x.fillRect((i%W)*sc,Math.floor(i/W)*sc,sc-1,sc-1);
      $('fInfo').textContent=`${font.h}px high · ${[...chars].length} characters · ${(b64d(font.data).length/1024).toFixed(1)} KB`+(document.fonts.check(`12px "${F.fam}"`)?'':' · font did not load (offline?)');
    }catch(e){$('fInfo').textContent='Could not bake: '+e.message;}};
  const deb=()=>{clearTimeout(t);t=setTimeout(run,250);};
  ['fSrc','fG','fGName','fFile','fSize','fThr','fSp','fSet','fCustom','fPrev'].forEach(id=>$(id).addEventListener('input',deb));
  $('fSet').addEventListener('change',()=>{$('fCustom').style.display=$('fSet').value==='custom'?'':'none';});
  $('fFile').addEventListener('change',()=>{$('fSrc').value='u';deb();});run();
}

/* ---------- image / GIF import ---------- */
function mediaModal(file,at){
  const hasDec=typeof ImageDecoder!=='undefined';
  modal('Import image or GIF',`<p class="note">PNG, JPG or animated GIF${hasDec?' / WebP':''}. Frames are dithered to 1 bit and stored in the project.</p>
    <div class="fields">
      <label>File</label><input type="file" id="aFile" accept="image/*">
      <label>Size</label><div class="row"><input type="number" id="aW" value="256" style="width:70px">×<input type="number" id="aH" value="48" style="width:70px"><select id="aFit" style="width:auto"><option>contain</option><option>cover</option><option>stretch</option></select></div>
      <label>Dither</label><select id="aD"><option value="atkinson">Atkinson</option><option value="floyd">Floyd–Steinberg</option><option value="bayer">Ordered (Bayer)</option><option value="none">Threshold</option></select>
      <label>Threshold</label><input type="range" id="aT" min="0" max="255" value="128">
      <label>Contrast</label><input type="range" id="aC" min="-100" max="100" value="0">
      <label>Invert</label><input type="checkbox" id="aI" style="width:auto">
      <label>Max frames</label><input type="number" id="aN" value="48" min="1" max="200">
    </div><canvas id="aPrev" class="prev" style="margin-top:10px"></canvas><p class="note" id="aInfo"></p>`,
    [['Cancel'],['Add layer','pri',()=>{if(!st.frames)return false;const P=proj(),o=st.o,fsz=((o.w+7)>>3)*o.h;let L;
      if(st.frames.length===1)L={type:'bitmap',name:st.name||'Image',x:0,y:0,w:o.w,h:o.h,invert:false,data:b64e(packXBM(st.frames[0],o.w,o.h))};
      else{const all=new Uint8Array(fsz*st.frames.length);st.frames.forEach((b,i)=>all.set(packXBM(b,o.w,o.h),i*fsz));L={type:'anim',name:st.name||'Animation',x:0,y:0,w:o.w,h:o.h,n:st.frames.length,ms:st.ms,invert:false,data:b64e(all)};}
      L.x=at?clampN(at[0]-(o.w>>1),-o.w+1,W-1):Math.max(0,Math.round((W-o.w)/2));L.y=at?clampN(at[1]-(o.h>>1),-o.h+1,H-1):Math.max(0,Math.round((H-o.h)/2));
      const idx=B.sel>=0?B.sel+1:P.layers.length;P.layers.splice(idx,0,L);B.sel=idx;commit();refreshAll();}]]);
  const st={};let t=0,pv=0;
  const run=async()=>{const f=$('aFile').files[0]||file;if(!f)return;st.name=f.name.replace(/\.\w+$/,'');
    const o={w:clampN(+$('aW').value||1,1,256),h:clampN(+$('aH').value||1,1,48),fit:$('aFit').value,mode:$('aD').value,thr:+$('aT').value,con:+$('aC').value/100,inv:$('aI').checked};
    const frames=[];let dur=0;
    try{const isGif=f.type==='image/gif'||/\.gif$/i.test(f.name);
      if(isGif){const g=decodeGif(new Uint8Array(await f.arrayBuffer()),+$('aN').value||48);if(!g.frames.length)throw new Error('no frames');for(const fr of g.frames){frames.push(ditherFrame(fr.canvas,g.w,g.h,o));dur+=fr.delay;}}
      else if(hasDec&&/webp|png|apng/.test(f.type)){const dec=new ImageDecoder({data:await f.arrayBuffer(),type:f.type});await dec.tracks.ready;const n=Math.min(dec.tracks.selectedTrack.frameCount,+$('aN').value||48);
        for(let i=0;i<n;i++){const{image}=await dec.decode({frameIndex:i});frames.push(ditherFrame(image,image.displayWidth,image.displayHeight,o));dur+=(image.duration||100000)/1000;image.close();}}
      else{const im=new Image();im.src=URL.createObjectURL(f);await im.decode();frames.push(ditherFrame(im,im.naturalWidth,im.naturalHeight,o));dur=100;}
    }catch(e){$('aInfo').textContent='Could not read this file: '+e.message;return;}
    st.frames=frames;st.o=o;st.ms=Math.max(20,Math.round(dur/frames.length));
    const kb=((o.w+7)>>3)*o.h*frames.length/1024;$('aInfo').textContent=(frames.length>1?`${frames.length} frames · ${st.ms} ms each · `:'Still image · ')+kb.toFixed(1)+' KB'+(kb>120?' · large: fewer frames or a smaller size keeps the display fast':'');
    clearInterval(pv);let k=0;const cv=$('aPrev'),sc=3;cv.width=o.w*sc;cv.height=o.h*sc;const x=cv.getContext('2d');
    const draw=()=>{if(!document.body.contains(cv)||!$('modal').classList.contains('open'))return clearInterval(pv);const b=frames[k++%frames.length];x.fillStyle='#000';x.fillRect(0,0,cv.width,cv.height);x.fillStyle=B.view.tint;for(let i=0;i<b.length;i++)if(b[i])x.fillRect((i%o.w)*sc,Math.floor(i/o.w)*sc,sc-1,sc-1);};
    draw();if(frames.length>1)pv=setInterval(draw,st.ms);};
  const deb=()=>{clearTimeout(t);t=setTimeout(run,200);};
  ['aFile','aW','aH','aFit','aD','aT','aC','aI','aN'].forEach(id=>$(id).addEventListener('input',deb));
  if(file){$('aInfo').textContent=file.name;run();}
}
function rasterize(i){
  const P=proj(),L=P.layers[i];if(!L)return;
  const tmp=clone(L);['at','length','in','out','tr','dip','keys','move','blink','mode','visible'].forEach(k=>delete tmp[k]);
  const f=new FB(),TP={id:'x',layers:[tmp],shift:'off',lang:P.lang,fonts:{}};const bb=renderProject(f,TP,B.T,0);
  if(!bb){toast('Nothing visible to convert');return;}
  const w=bb[2]-bb[0]+1,h=bb[3]-bb[1]+1,bits=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)bits[y*w+x]=f.p[(bb[1]+y)*W+bb[0]+x];
  const nb={type:'bitmap',name:(L.name||'Text')+' (pixels)',x:bb[0],y:bb[1],w,h,invert:false,data:b64e(packXBM(bits,w,h))};
  for(const k of['at','length','in','out','tr','dip','keys','move','moveX','moveY','movePeriod','movePhase','blink','mode','visible'])if(L[k]!==undefined)nb[k]=clone({v:L[k]}).v;
  if(nb.keys){delete nb.keys.w;delete nb.keys.h;delete nb.keys.scale;cleanKeys(nb);}
  P.layers[i]=nb;commit();refreshAll();toast('Converted to a bitmap');
}

/* ---------- device ---------- */
const dev={base:'',ok:false,live:false,busy:false,lastSend:0};
const onDevice=location.protocol==='http:';   // served by the display (or a local test server)
if(onDevice)$('devHost').value=location.origin;
function devStatus(s,t){$('devDot').className='dot'+(s==='ok'?' on':s==='err'?' err':'');$('devPill').textContent=t;}
// every request carries X-VFD: the display refuses changes without it, so other web pages in this browser cannot send any
async function devFetch(path,opt={},ms=4000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(dev.base+path,{...opt,headers:{...(opt.headers||{}),'X-VFD':'1'},signal:c.signal});if(!r.ok){let m='HTTP '+r.status;try{m+=' '+(await r.text()).slice(0,120);}catch(e){}throw new Error(m);}return r;}finally{clearTimeout(t);}}
const jpost=(path,obj,ms)=>devFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)},ms);
async function connect(silent){
  dev.base=$('devHost').value.trim().replace(/\/$/,'');if(!/^https?:\/\//.test(dev.base))dev.base='http://'+dev.base;$('devHost').value=dev.base;devStatus('','Connecting…');
  try{const info=await(await devFetch('/api/info')).json();dev.ok=true;dev.info=info;devStatus('ok',`${info.name||'vfd'} · fw ${info.fw}`);$('bSend').disabled=$('bLive').disabled=false;
    try{const w=await(await devFetch('/api/weather')).json();if(w.ok)WX=w;}catch(e){}
    try{const s=await(await devFetch('/api/system')).json();SYS={cpu:s.load,ram:(s.heapTotal-s.heapFree)*100/s.heapTotal,fs:s.fsUsed*100/s.fsTotal,temp:s.temp,rssi:s.rssi,up:s.uptime,ip:s.ip};}catch(e){}
    syncDeviceFonts();}
  catch(e){dev.ok=false;$('bSend').disabled=$('bLive').disabled=true;devStatus('err','Not reachable');
    if(!silent)toast(location.protocol==='https:'?'This page runs over HTTPS; browsers block it from reaching the display. Open the Builder from the display: http://vfd.local/builder':'No answer. Check power and Wi-Fi, or use the IP address.');}
}
async function ensureDeviceFonts(P){const need=usedFonts(P);if(!need.length)return;let have={};try{for(const f of await(await devFetch('/api/fonts')).json())have[f.id]=f.v||'';}catch(e){}
  for(const id of need){const F=FONTLIB[id];if(!F){if(id in have)continue;throw new Error('font '+id+' is not in the library');}const v=fontHash(F);if(have[id]===v)continue;await jpost('/api/font?id='+encodeURIComponent(id),{...clone(F),v},10000);}}
async function pullFonts(P){for(const id of usedFonts(P)){if(FONTLIB[id])continue;try{FONTLIB[id]=await(await devFetch('/api/font?id='+encodeURIComponent(id))).json();}catch(e){}}saveLib();}
async function syncDeviceFonts(){try{const list=await(await devFetch('/api/fonts')).json();let n=0;for(const f of list){if(FONTLIB[f.id])continue;try{FONTLIB[f.id]=await(await devFetch('/api/font?id='+encodeURIComponent(f.id))).json();n++;}catch(e){}}if(n){saveLib();renderInsp();}}catch(e){}}
async function sendToDevice(){
  commit();const P=proj(),r=validateProject(cleanProject(P));if(r.E.length){toast(r.E[0]);return;}
  $('bSend').disabled=true;const old=$('bSend').textContent;$('bSend').textContent='Sending…';
  try{await ensureDeviceFonts(P);await jpost('/api/project?id='+encodeURIComponent(P.id),cleanProject(P),15000);await jpost('/api/active',{id:P.id});
    if(dev.live){dev.live=false;$('bLive').classList.remove('on');}toast('Sent · now on the display');}
  catch(e){toast('Send failed: '+e.message);}finally{$('bSend').disabled=false;$('bSend').textContent=old;}
}
let devBT=0;function devBright(){if(!dev.ok||!dev.live)return;clearTimeout(devBT);devBT=setTimeout(()=>jpost('/api/brightness',{value:proj().brightness??200}).catch(()=>{}),150);}
function liveTick(){
  if(!dev.live||!dev.ok||dev.busy)return;const n=performance.now();if(n-dev.lastSend<66)return;dev.lastSend=n;dev.busy=true;
  devFetch('/api/frame',{method:'POST',headers:{'Content-Type':'text/plain'},body:b64e(packXBM(fb.p,W,H))},2000)
    .catch(()=>{dev.live=false;$('bLive').classList.remove('on');toast('Live mirror stopped');}).finally(()=>dev.busy=false);
}

/* ---------- help ---------- */
function helpModal(){
  const k=[['Space','Play / pause'],['Ctrl+Z · Ctrl+Shift+Z','Undo · redo'],['Del / Backspace','Delete selected keyframes, else the layer'],['Ctrl+D','Duplicate layer'],['Arrows (+Shift)','Nudge 1 px (5 px); with keyframes: sets a key'],
    ['K','Position keyframe at the playhead'],['[ · ]','Previous / next keyframe or cut'],[', · .','Step 50 ms back / forward'],['Home','Go to start'],['Shift while dragging','Lock to one axis / keep aspect'],['Alt while dragging','No snapping'],['Ctrl+E · Ctrl+O · Ctrl+Alt+N','Export · open · new'],['Esc','Deselect / close']];
  modal('Shortcuts & how it works',`<table class="keys">${k.map(([a,b])=>`<tr><td><kbd>${a}</kbd></td><td>${b}</td></tr>`).join('')}</table>
  <p class="note" style="margin-top:12px"><b>Layers</b> on top of the list draw on top. <b>Bars</b> in the timeline set when a layer shows; their ends get the in / out transitions. <b>Keyframes ◆</b> animate offset, opacity, size and scale over the sequence. <b>Auto-key</b> turns dragging on the display into keyframes. Everything is plain JSON the display renders itself.</p>`,[['Close']]);
}

/* ---------- wiring ---------- */
function refreshAll(){const P=proj();$('pName').textContent=P.name||'UNTITLED';document.title=(P.name||'UNTITLED')+' · VFD Builder';renderLayers();renderTL();renderInsp();updUR();}
$('bBack').onclick=goStudio;$('bUndo').onclick=undo;$('bRedo').onclick=redo;$('bMedia').onclick=()=>mediaModal();$('bFonts').onclick=fontsModal;$('bAI').onclick=aiModal;$('bImport').onclick=()=>importModal();$('bExport').onclick=exportModal;
$('bConnect').onclick=()=>connect();$('bSend').onclick=sendToDevice;$('bHelp').onclick=helpModal;
$('devHost').onkeydown=e=>{if(e.key==='Enter')connect();e.stopPropagation();};
$('bLive').onclick=()=>{dev.live=!dev.live;$('bLive').classList.toggle('on',dev.live);toast(dev.live?'Live: the display mirrors this preview':'Live off');devBright();};
$('bDupL').onclick=()=>dupLayer(B.sel);$('bDelL').onclick=()=>delLayer(B.sel);
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>setTab(b.dataset.t));
$('zoomSeg').onclick=e=>{const z=e.target.dataset.z;if(!z)return;B.view.zoom=z==='fit'?'fit':+z;layout();save();};
[['vSnap','snap'],['vGrid','grid'],['vGlow','glow'],['vSafe','safe']].forEach(([id,k])=>{$(id).checked=!!B.view[k];$(id).onchange=e=>{B.view[k]=e.target.checked;if(k==='grid')paintBg();save();};});
$('tPlay').onclick=()=>setPlaying(!B.playing);$('tStart').onclick=()=>{setLt(0);refreshVals();};$('tPrevK').onclick=()=>jumpKey(-1);$('tNextK').onclick=()=>jumpKey(1);
$('tRec').onclick=()=>{B.autoKey=!B.autoKey;$('tRec').classList.toggle('on',B.autoKey);toast(B.autoKey?'Auto-key on: moving and resizing sets keyframes':'Auto-key off');};
$('tKey').onclick=()=>addPosKey();
function addPosKey(){const L=proj().layers[B.sel];if(!L||TYPES[L.type]?.fx)return toast('Select a layer');if(!needLoop())return;setKey(L,'dx',lt(),evalProp(L,'dx'));setKey(L,'dy',lt(),evalProp(L,'dy'));commit();renderTL();renderLayers();refreshVals(true);toast('Position keyframe at '+fmtT(lt()));}
$('tLoop').oninput=e=>{const v=parseFloat(e.target.value),P=proj();if(!(v>0))return;P.loop=Math.round(v*1000);commitSoon();renderTL();};
$('tLoop').onchange=e=>{const v=parseFloat(e.target.value),P=proj();if(!(v>0))delete P.loop;commit();renderTL();renderInsp();};
$('speedSeg').onclick=e=>{const s=e.target.dataset.s;if(!s)return;B.speed=+s;document.querySelectorAll('#speedSeg button').forEach(b=>b.classList.toggle('on',b.dataset.s===s));};
document.querySelector('#speedSeg [data-s="1"]').classList.add('on');
// splitter
$('split').onpointerdown=e=>{const y0=e.clientY,h0=B.view.tlh;$('split').setPointerCapture(e.pointerId);
  $('split').onpointermove=ev=>{B.view.tlh=clampN(h0-(ev.clientY-y0),120,window.innerHeight-260);document.documentElement.style.setProperty('--tlh',B.view.tlh+'px');layout();};
  $('split').onpointerup=()=>{$('split').onpointermove=null;save();tlTick();};};
document.documentElement.style.setProperty('--tlh',B.view.tlh+'px');
window.addEventListener('resize',()=>{layout();tlTick();});
$('tlBody').addEventListener('scroll',tlTick);
// keyboard
document.addEventListener('keydown',e=>{
  const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName),mod=e.ctrlKey||e.metaKey;
  if(e.key==='Escape'){if($('modal').classList.contains('open'))closeModal();else{B.ksel=[];select(-1);}return;}
  if($('modal').classList.contains('open'))return;
  if(mod&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&e.key.toLowerCase()==='y'&&!typing){e.preventDefault();redo();return;}
  if(mod&&e.key.toLowerCase()==='e'){e.preventDefault();exportModal();return;}
  if(mod&&e.key.toLowerCase()==='o'){e.preventDefault();openModal();return;}
  if(mod&&e.altKey&&e.key.toLowerCase()==='n'){e.preventDefault();newModal();return;}
  if(typing)return;
  const P=proj(),L=P.layers[B.sel];
  if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();dupLayer(B.sel);return;}
  if(e.key===' '){e.preventDefault();setPlaying(!B.playing);return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();
    if(B.ksel.length){for(const k of B.ksel){const Lk=P.layers[k.i];if(Lk)delKeyAt(Lk,k.p,k.t);}B.ksel=[];commit();refreshAll();return;}
    if(L)delLayer(B.sel);return;}
  if(e.key==='k'||e.key==='K'){addPosKey();return;}
  if(e.key==='['){jumpKey(-1);return;}if(e.key===']'){jumpKey(1);return;}
  if(e.key===','||e.key==='.'){setPlaying(false);setLt(lt()+(e.key===','?-50:50));refreshVals();return;}
  if(e.key==='Home'){setLt(0);refreshVals();return;}
  const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(d&&L&&!TYPES[L.type]?.fx&&!L.locked){e.preventDefault();const s=e.shiftKey?5:1;
    if(loopLen()>0&&(B.autoKey||hasK(L,'dx')||hasK(L,'dy'))){setKey(L,'dx',lt(),evalProp(L,'dx')+d[0]*s);setKey(L,'dy',lt(),evalProp(L,'dy')+d[1]*s);renderTL();}
    else moveLayer(L,clone(L),d[0]*s,d[1]*s);
    commitSoon();refreshVals(true);}
});

/* ---------- boot ---------- */
FONTLIB=store.get('vfd.fontlib',{});B.projects.forEach(migrateFonts);
renderPalette();paintBg();setTab('layer');histReset();refreshAll();layout();setTimeout(layout,300);
requestAnimationFrame(frame);
if(onDevice)connect(true);
