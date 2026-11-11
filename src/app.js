/* ============================================================
   APP
   ============================================================ */
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
const S={
  projects:store.get('vfd.projects',null)||demos(),
  cur:store.get('vfd.cur','neon-clock'),
  sel:-1,
  view:store.get('vfd.view',{tint:'#4dffd2',glow:true,dots:true,mesh:true}),
  clock:{mode:'live',anchorSim:Date.now(),anchorReal:Date.now(),speed:1},
};
const proj=()=>S.projects.find(p=>p.id===S.cur)||S.projects[0];
let saveT=0;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{store.set('vfd.projects',S.projects.map(clone));store.set('vfd.cur',S.cur);store.set('vfd.view',S.view);},300);}
function simNow(){const c=S.clock;return c.anchorSim+(Date.now()-c.anchorReal)*c.speed;}
function setClock(sim,speed){S.clock.anchorSim=sim;S.clock.anchorReal=Date.now();S.clock.speed=speed;}

/* ---------- display painter ---------- */
const SC=5, fb=new FB();
const cvBg=$('cvBg'),cvPx=$('cvPx'),cvG1=$('cvGlow1'),cvG2=$('cvGlow2'),cvOv=$('cvOver');
[cvBg,cvPx,cvOv].forEach(c=>{c.width=W*SC;c.height=H*SC;});
[cvG1,cvG2].forEach(c=>{c.width=W*2;c.height=H*2;});
const xPx=cvPx.getContext('2d'),xG1=cvG1.getContext('2d'),xG2=cvG2.getContext('2d'),xOv=cvOv.getContext('2d'),xBg=cvBg.getContext('2d');
function paintBg(){
  xBg.clearRect(0,0,cvBg.width,cvBg.height);
  if(!S.view.dots)return;
  xBg.fillStyle=S.view.tint;xBg.globalAlpha=0.045;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)xBg.fillRect(x*SC,y*SC,SC-1,SC-1);
  xBg.globalAlpha=1;
}
let lastBBox=null,hover=null;
function paint(){
  const P=proj(), br=P.brightness??200;
  xPx.clearRect(0,0,cvPx.width,cvPx.height);
  xPx.fillStyle=S.view.tint; xPx.globalAlpha=0.18+0.82*(br*(fb.dip??1)/255);
  const p=fb.p, s=SC-1;
  for(let y=0;y<H;y++){const o=y*W;for(let x=0;x<W;x++)if(p[o+x])xPx.fillRect(x*SC,y*SC,s,s);}
  xPx.globalAlpha=1;
  const show=S.view.glow;cvG1.style.display=cvG2.style.display=show?'':'none';
  if(show){
    xG1.clearRect(0,0,cvG1.width,cvG1.height);xG1.drawImage(cvPx,0,0,cvG1.width,cvG1.height);
    xG2.clearRect(0,0,cvG2.width,cvG2.height);xG2.drawImage(cvPx,0,0,cvG2.width,cvG2.height);
  }
  // overlay
  xOv.clearRect(0,0,cvOv.width,cvOv.height);
  if(lastBBox){const[a,b,c,d]=lastBBox;xOv.strokeStyle='#ff2e88';xOv.lineWidth=2;xOv.setLineDash([6,4]);xOv.strokeRect(a*SC-3,b*SC-3,(c-a+1)*SC+5,(d-b+1)*SC+5);xOv.setLineDash([]);}
  if(S.view.safe){const m=P.shift===undefined?'both':P.shift===true?'pos':P.shift;xOv.fillStyle='#ff2e8866';
    if(m==='pos'||m==='both'){xOv.fillRect((W-1)*SC,0,SC-1,cvOv.height);xOv.fillRect(0,(H-1)*SC,cvOv.width,SC-1);}
    if(m==='neg'||m==='both'){xOv.fillRect(0,0,SC-1,cvOv.height);xOv.fillRect(0,0,cvOv.width,SC-1);}}
  if(hover){xOv.fillStyle='#ff2e8855';xOv.fillRect(hover[0]*SC,0,SC-1,cvOv.height);xOv.fillRect(0,hover[1]*SC,cvOv.width,SC-1);}
}
let frames=0,fpsT=performance.now(),lastF=0,lastIdle=0;
function loop(now){
  requestAnimationFrame(loop);
  // one frame per 60 fps grid step, like the display; when the clock stands still, repaint ~30 times a second for edits
  const fr=Math.floor(simNow()*3/50);if(fr===lastF&&now-lastIdle<33)return;lastF=fr;lastIdle=now;
  const T=timeObj(Math.ceil(fr*50/3));
  lastBBox=renderProject(fb,proj(),T,S.sel);
  paint();
  liveTick();
  tlTick();
  frames++; if(now-fpsT>1000){$('fps').textContent=`${frames} FPS · ${p2(T.h)}:${p2(T.m)}:${p2(T.s)}${S.clock.speed!==1?' · ×'+S.clock.speed:''}`;frames=0;fpsT=now;}
}

/* ---------- projects UI ---------- */
function renderProjects(){
  const el=$('projList');el.innerHTML='';
  S.projects.forEach(p=>{const d=document.createElement('div');d.className='item'+(p.id===S.cur?' sel':'');
    d.innerHTML=`<span class="nm"></span><span class="ty">${p.layers.length}L</span>`;d.querySelector('.nm').textContent=p.name;
    d.onclick=()=>{S.cur=p.id;S.sel=-1;proj()._t0=simNow();syncAll();save();};el.appendChild(d);});
}
function syncProjectCtrls(){const P=proj();$('bright').value=P.brightness??200;$('optShift').value=P.shift===undefined?'both':P.shift===true?'pos':(P.shift||'off');$('lang').value=P.lang||'en';$('optSafe').checked=!!S.view.safe;}
function syncAll(){renderProjects();renderLayers();renderInspector();syncProjectCtrls();renderTimeline();if(!$('tabJson').hidden)syncJson();}

/* ---------- layers UI ---------- */
function renderLayers(){
  const P=proj(),el=$('layerList');el.innerHTML='';
  P.layers.forEach((L,i)=>{
    const d=document.createElement('div');d.className='item'+(i===S.sel?' sel':'')+(L.visible===false?' hidden':'');
    d.innerHTML=`<span class="nm"></span><span class="ty">${(TYPES[L.type]||{}).fx?'fx':L.type}</span>
      <button class="ib" title="Show/hide" data-a="vis">${L.visible===false?'○':'●'}</button>
      <button class="ib" title="Up" data-a="up">▲</button><button class="ib" title="Down" data-a="dn">▼</button>
      <button class="ib" title="Delete" data-a="del">✕</button>`;
    d.querySelector('.nm').textContent=L.name||TYPES[L.type]?.label||L.type;
    d.onclick=e=>{const a=e.target.dataset.a;
      if(a==='vis'){L.visible=L.visible===false;}
      else if(a==='up'&&i>0){P.layers.splice(i-1,0,P.layers.splice(i,1)[0]);if(S.sel===i)S.sel--;}
      else if(a==='dn'&&i<P.layers.length-1){P.layers.splice(i+1,0,P.layers.splice(i,1)[0]);if(S.sel===i)S.sel++;}
      else if(a==='del'){P.layers.splice(i,1);if(S.sel>=P.layers.length)S.sel=P.layers.length-1;if(S.sel===i)S.sel=-1;}
      else S.sel=S.sel===i?-1:i;
      renderLayers();renderInspector();renderProjects();save();};
    el.appendChild(d);
  });
}
function renderInspector(){
  const P=proj(),L=P.layers[S.sel],el=$('inspector');
  if(!L){el.innerHTML='<p class="note">Select a layer to edit it. Layers draw top to bottom; FX layers act on everything above them.</p>';return;}
  const ty=TYPES[L.type];el.innerHTML='';
  const g=document.createElement('div');g.className='fields';
  const fields=[...COMMON.slice(0,1),...ty.fields,...COMMON.slice(1),['§','head','Timing'],...TIMING];
  fields.forEach(([k,kind,extra])=>{
    if(kind==='head'){const h=document.createElement('div');h.className='full note';h.style.cssText='margin-top:6px;color:var(--tube);letter-spacing:.14em';h.textContent=extra.toUpperCase()+((P.loop|0)>0?'':' · set a loop length in the timeline');g.appendChild(h);return;}
    const lab=document.createElement('label');lab.textContent=k;let inp;
    if(kind==='font'){inp=document.createElement('select');const lib={...FONTLIB,...(P.fonts||{})};const opts=[['small','small (3×5)'],['medium','medium (5×7)'],...Object.entries(lib).map(([id,F])=>[id,F.name+' · '+F.h+'px'])];
      opts.forEach(([v,t])=>{const op=document.createElement('option');op.value=v;op.textContent=t;inp.appendChild(op);});inp.value=L[k]??'small';}
    else if(kind==='sel'){inp=document.createElement('select');extra.forEach(o=>{const op=document.createElement('option');op.value=op.textContent=o;inp.appendChild(op);});inp.value=L[k]??extra[0];}
    else if(kind==='bool'){inp=document.createElement('input');inp.type='checkbox';inp.checked=!!L[k];inp.style.width='auto';}
    else{inp=document.createElement('input');inp.type=kind==='text'?'text':'number';if(kind==='num')inp.step='0.01';inp.value=L[k]??(k==='blink'?0:'');if(kind==='time')inp.placeholder='always';}
    if(typeof extra==='string')inp.title=extra;
    inp.dataset.k=k;
    if(kind==='time'){inp.oninput=()=>{if(inp.value===''){delete L.at;}else L.at=Math.max(0,parseInt(inp.value)||0);save();renderTimeline();};g.appendChild(lab);g.appendChild(inp);return;}
    inp.oninput=()=>{let v=kind==='bool'?inp.checked:kind==='int'?parseInt(inp.value||0):kind==='num'?parseFloat(inp.value||0):inp.value;
      if(k==='mode'&&v==='set')delete L.mode;else if(k==='move'&&v==='none')delete L.move;else L[k]=v;if(k==='name'){renderLayers();}if(['length','in','out','tr','name'].includes(k))renderTimeline();save();};
    g.appendChild(lab);g.appendChild(inp);
    if(typeof extra==='string'&&kind==='text'){const n=document.createElement('div');n.className='note full';n.textContent=extra;g.appendChild(n);}
  });
  el.appendChild(g);
  if(L.type==='bitmap'||L.type==='anim'){const n=document.createElement('p');n.className='note';n.textContent=`${L.type==='anim'?L.n+' frames · ':''}${L.w}×${L.h} px · ${(b64d(L.data).length/1024).toFixed(1)} KB`;el.appendChild(n);}
  if(L.type==='globe'||L.type==='graph'||(L.type==='wxicon'&&L.icon==='auto')){const n=document.createElement('p');n.className='note';n.textContent='Uses the weather data / location (see Weather data below the display).';el.appendChild(n);}
}
function refreshInspectorValues(){document.querySelectorAll('#inspector [data-k]').forEach(i=>{const L=proj().layers[S.sel];if(!L)return;const v=L[i.dataset.k];if(i.type==='checkbox')i.checked=!!v;else if(document.activeElement!==i)i.value=v??'';});}

/* ---------- JSON tab ---------- */
function syncJson(){$('jsonArea').value=JSON.stringify(clone(proj()),null,1);$('jsonErr').textContent='';}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
  const j=b.dataset.t==='json';$('tabJson').style.display=j?'':'none';$('tabJson').hidden=!j;$('tabLayers').style.display=j?'none':'';if(j)syncJson();});
$('tabJson').hidden=true;
$('btnJsonApply').onclick=()=>{try{const o=JSON.parse($('jsonArea').value);if(!Array.isArray(o.layers))throw new Error('layers[] missing');
  const P=proj();Object.keys(P).forEach(k=>delete P[k]);Object.assign(P,o,{id:S.cur});S.sel=-1;syncAll();save();toast('Applied');}catch(e){$('jsonErr').textContent=e.message;}};

/* ---------- controls ---------- */
$('bright').oninput=e=>{proj().brightness=+e.target.value;save();devSettings();};
$('optShift').onchange=e=>{const v=e.target.value;proj().shift=v==='off'?false:v;save();};
$('optSafe').onchange=e=>{S.view.safe=e.target.checked;save();};
$('lang').onchange=e=>{proj().lang=e.target.value;save();};
$('tint').value=S.view.tint;$('optGlow').checked=S.view.glow;$('optDots').checked=S.view.dots;$('optMesh').checked=S.view.mesh;
$('tint').onchange=e=>{S.view.tint=e.target.value;paintBg();save();};
$('optGlow').onchange=e=>{S.view.glow=e.target.checked;save();};
$('optDots').onchange=e=>{S.view.dots=e.target.checked;paintBg();save();};
$('optMesh').onchange=e=>{S.view.mesh=e.target.checked;$('mesh').style.display=S.view.mesh?'':'none';save();};
$('mesh').style.display=S.view.mesh?'':'none';
document.querySelectorAll('#timeSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#timeSeg button').forEach(x=>x.classList.toggle('on',x===b));
  const m=b.dataset.m;if(m==='live')setClock(Date.now(),1);else setClock(simNow(),+m.slice(1));});
function setSpeedUI(m){document.querySelectorAll('#timeSeg button').forEach(x=>x.classList.toggle('on',x.dataset.m===m));}
$('btnTimeSet').onclick=()=>{const v=$('timeSet').value;if(!v)return;setClock(new Date(v).getTime(),1);setSpeedUI('');};
$('btnJump').onclick=()=>{const d=new Date(simNow());d.setSeconds(57,0);if(d.getTime()<simNow()-500)d.setMinutes(d.getMinutes()+1);setClock(d.getTime(),1);setSpeedUI('');};
$('btnGlitch').onclick=()=>{FORCE_GLITCH=simNow()+600*Math.max(1,S.clock.speed);if(!proj().layers.some(l=>l.type==='glitch'))toast('No glitch layer in this project');};
(()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('timeSet').value=d.toISOString().slice(0,19);})();

/* ---------- pointer: coords + drag ---------- */
function pt(e){const r=cvOv.getBoundingClientRect();return[Math.max(0,Math.min(W-1,Math.floor((e.clientX-r.left)/r.width*W))),Math.max(0,Math.min(H-1,Math.floor((e.clientY-r.top)/r.height*H)))];}
let drag=null;
cvOv.addEventListener('pointermove',e=>{hover=pt(e);$('readout').innerHTML=`x <b>${hover[0]}</b> · y <b>${hover[1]}</b>`+(S.sel>=0?` · layer <b>${proj().layers[S.sel]?.name||''}</b>`:'');
  if(drag){const L=proj().layers[S.sel],dx=hover[0]-drag.p[0],dy=hover[1]-drag.p[1];moveLayer(L,drag.o,dx,dy);refreshInspectorValues();}});
cvOv.addEventListener('pointerleave',()=>{hover=null;});
cvOv.addEventListener('pointerdown',e=>{const L=proj().layers[S.sel];if(!L||TYPES[L.type]?.fx)return;drag={p:pt(e),o:clone(L)};cvOv.setPointerCapture(e.pointerId);});
cvOv.addEventListener('pointerup',()=>{if(drag){drag=null;save();}});
function moveLayer(L,o,dx,dy){if('x1'in o){L.x1=o.x1+dx;L.x2=o.x2+dx;L.y1=o.y1+dy;L.y2=o.y2+dy;}else if('x'in o){L.x=o.x+dx;L.y=o.y+dy;}}
document.addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
  const L=proj().layers[S.sel];if(!L)return;const s=e.shiftKey?5:1;
  const d={ArrowLeft:[-s,0],ArrowRight:[s,0],ArrowUp:[0,-s],ArrowDown:[0,s]}[e.key];if(!d)return;
  e.preventDefault();moveLayer(L,clone(L),d[0],d[1]);refreshInspectorValues();save();});

/* ---------- project actions ---------- */
$('btnAdd').onclick=()=>{const t=$('addType').value,P=proj();const L={type:t,name:TYPES[t].label,...clone(TYPES[t].def)};P.layers.push(L);S.sel=P.layers.length-1;syncAll();save();};
$('btnNew').onclick=()=>{const p={id:'p-'+uid(),name:'NEW//PROJECT',v:1,brightness:200,lang:'en',shift:'both',layers:[{type:'corners',name:'Frame',...TYPES.corners.def}]};S.projects.push(p);S.cur=p.id;S.sel=-1;syncAll();save();};
$('btnDup').onclick=()=>{const c=clone(proj());c.id='p-'+uid();c.name+=' copy';S.projects.push(c);S.cur=c.id;syncAll();save();};
$('btnDel').onclick=()=>{if(S.projects.length<2)return toast('Keep at least one project');
  modal('Delete project',`<p>Delete <b></b>?</p>`,[['Cancel'],['Delete','hot',()=>{S.projects=S.projects.filter(p=>p.id!==S.cur);S.cur=S.projects[0].id;S.sel=-1;syncAll();save();}]]);
  $('mBody').querySelector('b').textContent=proj().name;};
$('btnRename').onclick=()=>{modal('Rename project','<input type="text" id="rn">',[['Cancel'],['Save','pri',()=>{proj().name=$('rn').value||proj().name;syncAll();save();}]]);$('rn').value=proj().name;$('rn').focus();};
$('btnReset').onclick=()=>modal('Restore demo projects','<p class="note">Re-adds the demo projects in their original state. Your own projects stay.</p>',[['Cancel'],['Restore','pri',()=>{const d=demos();S.projects=S.projects.filter(p=>!d.some(x=>x.id===p.id)).concat(d);migrateFonts();S.cur=d[0].id;S.sel=-1;syncAll();save();}]]);
$('btnExport').onclick=()=>{
  const build=emb=>{const o=clone(proj());delete o.fonts;if(emb){const f={};usedFonts(proj()).forEach(id=>{const F=FONTLIB[id]||(proj().fonts||{})[id];if(F)f[id]=clone(F);});if(Object.keys(f).length)o.fonts=f;}return JSON.stringify(o);};
  copyModal('Export project JSON',build(true),proj().id+'.json');
  const r=document.createElement('label');r.className='ck';r.innerHTML='<input type="checkbox" id="xEmb" checked> Embed fonts (self-contained file)';$('mBody').prepend(r);
  $('xEmb').onchange=e=>{$('cpy').value=build(e.target.checked);};
  const cp=[...$('mFoot').querySelectorAll('button')].find(b=>b.textContent==='Copy');if(cp)cp.onclick=()=>{navigator.clipboard.writeText($('cpy').value).then(()=>toast('Copied'),()=>{$('cpy').select();toast('Select all + copy manually');});};
};
$('btnJsonImport').onclick=()=>modal('Import project JSON','<textarea id="ji" rows="14" placeholder="Paste project JSON"></textarea><p class="note">Or pick a file: <input type="file" id="jf" accept=".json,application/json"></p>',[['Cancel'],['Import','pri',()=>{
  try{const o=JSON.parse($('ji').value);if(!Array.isArray(o.layers))throw 0;o.id='p-'+uid();S.projects.push(o);migrateFonts();S.cur=o.id;S.sel=-1;syncAll();save();}catch(e){toast('Not a valid project');}}]]);
document.addEventListener('change',e=>{if(e.target.id==='jf'&&e.target.files[0])e.target.files[0].text().then(t=>$('ji').value=t);});
$('btnSnap').onclick=()=>{const b=packXBM(fb.p,W,H);let s='// 256x48 frame, XBM / u8g2 drawXBMP format\nstatic const unsigned char frame_bits[] U8X8_PROGMEM = {';s+=Array.from(b,v=>'0x'+v.toString(16).padStart(2,'0')).join(',')+'};';copyModal('Current frame as XBM',s,'frame.h');};

/* code import */
$('btnCodeImport').onclick=()=>{
  modal('Import U8g2 / Lopaka code','<p class="note">Paste a sketch or Lopaka export. Bitmaps (drawXBMP), pixels, boxes, frames and lines are imported as layers. Text drawn with U8g2 fonts is skipped.</p><textarea id="ci" rows="14" spellcheck="false"></textarea><p class="note">Or pick a file: <input type="file" id="cf" accept=".ino,.h,.c,.cpp,.txt"></p><p class="note" id="cinfo"></p>',
    [['Cancel'],['Add to project',null,()=>imp(false)],['New project','pri',()=>imp(true)]]);
  const upd=()=>{const l=parseU8g2($('ci').value);$('cinfo').textContent=l.length?`Found ${l.length} drawable item(s).`:'';};
  $('ci').oninput=upd;$('cf').onchange=e=>e.target.files[0]&&e.target.files[0].text().then(t=>{$('ci').value=t;upd();});
  function imp(asNew){const l=parseU8g2($('ci').value);if(!l.length)return toast('Nothing drawable found');
    if(asNew){const p={id:'p-'+uid(),name:'IMPORT',v:1,brightness:220,lang:'en',shift:'both',layers:l};S.projects.push(p);S.cur=p.id;}else proj().layers.push(...l);S.sel=-1;syncAll();save();}
};

/* image import with dithering */
$('btnImgImport').onclick=()=>{
  modal('Import image as bitmap',`<div class="fields">
    <label>File</label><input type="file" id="imf" accept="image/*">
    <label>Size</label><div class="row"><input type="number" id="imw" value="256" style="width:70px">×<input type="number" id="imh" value="48" style="width:70px"><select id="imfit" style="width:auto"><option value="contain">contain</option><option value="cover">cover</option><option value="stretch">stretch</option></select></div>
    <label>Dither</label><select id="imd"><option value="atkinson">Atkinson</option><option value="floyd">Floyd–Steinberg</option><option value="bayer">Ordered (Bayer)</option><option value="none">Threshold</option></select>
    <label>Threshold</label><input type="range" id="imt" min="0" max="255" value="128">
    <label>Contrast</label><input type="range" id="imc" min="-100" max="100" value="0">
    <label>Invert</label><input type="checkbox" id="imi" style="width:auto">
  </div><canvas id="imp" class="prev" style="margin-top:10px"></canvas>`,[['Cancel'],['Add layer','pri',()=>{if(!imgState.bits)return;const P=proj();
    P.layers.push({type:'bitmap',name:imgState.name||'Image',x:Math.max(0,Math.round((W-imgState.w)/2)),y:Math.max(0,Math.round((H-imgState.h)/2)),w:imgState.w,h:imgState.h,invert:false,data:b64e(packXBM(imgState.bits,imgState.w,imgState.h))});
    S.sel=P.layers.length-1;syncAll();save();}]]);
  ['imw','imh','imfit','imd','imt','imc','imi'].forEach(id=>$(id).oninput=dither);
  $('imf').onchange=e=>{const f=e.target.files[0];if(!f)return;imgState.name=f.name.replace(/\.\w+$/,'');const im=new Image();im.onload=()=>{imgState.img=im;dither();};im.src=URL.createObjectURL(f);};
};
const imgState={};
function dither(){
  const im=imgState.img;if(!im)return;const w=Math.min(256,Math.max(1,+$('imw').value)),h=Math.min(48,Math.max(1,+$('imh').value));
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,w,h);
  const fit=$('imfit').value;let dw=w,dh=h;if(fit!=='stretch'){const s=(fit==='contain'?Math.min:Math.max)(w/im.width,h/im.height);dw=im.width*s;dh=im.height*s;}
  x.drawImage(im,(w-dw)/2,(h-dh)/2,dw,dh);
  const d=x.getImageData(0,0,w,h).data,g=new Float32Array(w*h),con=+$('imc').value/100,th=+$('imt').value,f=(1+con)/(1-con*0.99);
  for(let i=0;i<w*h;i++){let v=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2];v=(v-128)*f+128;g[i]=v;}
  const out=new Uint8Array(w*h),mode=$('imd').value,B=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){const i=y*w+xx,o=g[i];
    if(mode==='bayer'){out[i]=o>(B[(y&3)*4+(xx&3)]+0.5)*16+(th-128)?1:0;continue;}
    const n=o>th?255:0;out[i]=n?1:0;const e=o-n;if(mode==='none')continue;
    const add=(dx,dy,k)=>{const X=xx+dx,Y=y+dy;if(X>=0&&X<w&&Y<h)g[Y*w+X]+=e*k;};
    if(mode==='floyd'){add(1,0,7/16);add(-1,1,3/16);add(0,1,5/16);add(1,1,1/16);}
    else{const k=1/8;add(1,0,k);add(2,0,k);add(-1,1,k);add(0,1,k);add(1,1,k);add(0,2,k);}}
  if($('imi').checked)for(let i=0;i<out.length;i++)out[i]^=1;
  imgState.bits=out;imgState.w=w;imgState.h=h;
  const pv=$('imp'),s=4;pv.width=w*s;pv.height=h*s;const px=pv.getContext('2d');px.fillStyle='#000';px.fillRect(0,0,pv.width,pv.height);px.fillStyle=S.view.tint;
  for(let i=0;i<out.length;i++)if(out[i])px.fillRect((i%w)*s,Math.floor(i/w)*s,s-1,s-1);
}

/* ---------- modal ---------- */
function modal(title,html,buttons){
  $('mTitle').textContent=title;$('mBody').innerHTML=html;const f=$('mFoot');f.innerHTML='';
  buttons.forEach(([label,cls,fn])=>{const b=document.createElement('button');b.className='btn'+(cls?' '+cls:'');b.textContent=label;b.onclick=()=>{if(fn&&fn()===false)return;$('modal').classList.remove('open');};f.appendChild(b);});
  $('modal').classList.add('open');
}
$('modal').addEventListener('pointerdown',e=>{if(e.target.id==='modal')$('modal').classList.remove('open');});
function copyModal(title,text,filename){
  const btns=[['Close']];
  if(onDevice)btns.push(['Download',null,()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text]));a.download=filename;a.click();return false;}]);
  btns.push(['Copy','pri',()=>{navigator.clipboard.writeText(text).then(()=>toast('Copied'),()=>{$('cpy').select();toast('Select all + copy manually');});return false;}]);
  modal(title,'<textarea id="cpy" rows="14" readonly spellcheck="false"></textarea>',btns);
  $('cpy').value=text;
}
$('btnWiring').onclick=()=>modal('Wiring · ESP32-S3 Super Mini → GP1294AI',`
<table class="wire"><tr><th>Display pin</th><th>S3 Super Mini</th><th>Note</th></tr>
<tr><td>5V</td><td>5V</td><td>Pin next to GND; carries USB 5 V when powered over USB-C</td></tr>
<tr><td>GND</td><td>GND</td><td></td></tr>
<tr><td>CLK</td><td>GPIO 4</td><td>Hardware SPI via GPIO matrix</td></tr>
<tr><td>DATA (DIN)</td><td>GPIO 5</td><td></td></tr>
<tr><td>CS</td><td>GPIO 6</td><td></td></tr>
<tr><td>RESET</td><td>GPIO 7</td><td></td></tr>
<tr><td>FILAMENT_EN</td><td>GPIO 8</td><td>Direct wire, no resistor</td></tr>
<tr><td>LII_SW (pin 11)</td><td>GPIO 1</td><td>Optional light sensor. Connect a 47 kΩ resistor from GPIO 1 to 3.3 V.</td></tr>
</table>
<p class="note" style="margin-top:12px">All five display control pins are in the board's "free to use" group: no boot pins, no USB, no JTAG. The onboard RGB LED (GPIO 48) can show Wi-Fi status.</p>
<p class="note"><b>First flash:</b> hold BOOT while plugging in USB-C, flash, then press RESET. After that, updates go over Wi-Fi.</p>`,[['Close']]);

/* ============================================================
   DEVICE API (firmware)
   GET  /api/info                 GET/POST /api/settings
   GET|POST|DELETE /api/project?id=   POST /api/active {id}
   POST /api/brightness {value}   POST /api/frame  (base64 XBM, live mirror)
   POST /api/msg {text,sec}       POST /api/update (firmware .bin, multipart)
   POST /api/reboot               POST /api/wifi/forget
   ============================================================ */
const dev={base:'',ok:false,live:false,busy:false,lastSend:0};
const onDevice=location.protocol==='http:'&&!/claude|localhost|127\./.test(location.hostname);
if(onDevice){$('devHost').value=location.origin;}
function devStatus(state,text){$('devDot').className='dot'+(state==='ok'?' on':state==='err'?' err':'');$('devPill').textContent=text;}
// every request carries X-VFD: the display refuses changes without it, so other web pages in this browser cannot send any
async function devFetch(path,opt={},ms=4000){const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),ms);try{const r=await fetch(dev.base+path,{...opt,headers:{...(opt.headers||{}),'X-VFD':'1'},signal:ctl.signal});if(!r.ok)throw new Error('HTTP '+r.status);return r;}finally{clearTimeout(t);}}
const jpost=(path,obj,ms)=>devFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)},ms);
$('btnConnect').onclick=connect;
async function connect(){
  dev.base=$('devHost').value.replace(/\/$/,'');devStatus('','Connecting…');
  try{const info=await(await devFetch('/api/info')).json();dev.ok=true;dev.info=info;devStatus('ok',(info.name||'vfd')+'.local');
    $('devInfo').textContent=`fw ${info.fw} · ${info.ip} · ${info.rssi} dBm${info.timeSynced?'':' · time not synced'}`;
    $('btnSend').disabled=$('btnLive').disabled=false;$('devMore').style.display='';
    $('devNote').textContent=`Showing on the display: ${(info.projects.find(p=>p.id===info.active)||{}).name||info.active||'—'}`;
    renderDevProjects(info);wxRefresh();syncDeviceFonts();sysRefresh();}
  catch(e){dev.ok=false;devStatus('err','Not reachable');$('btnSend').disabled=$('btnLive').disabled=true;$('devMore').style.display='none';
    $('devNote').innerHTML=location.protocol==='https:'
      ?'This hosted preview runs over HTTPS, and browsers block it from talking to devices on your local network. Open the studio from the display itself at <b>http://vfd.local</b>. Move projects over with Export / Import JSON.'
      :'No answer from the device. Check that it is powered and on the same Wi-Fi, or use its IP address instead of vfd.local.';}
}
function renderDevProjects(info){
  const el=$('devProjects');el.innerHTML='';
  info.projects.forEach(p=>{const d=document.createElement('div');d.className='item'+(p.id===info.active?' sel':'');
    const inRot=(info.playlist||[]).includes(p.id);
    d.innerHTML=`<label class="ck" title="Include in rotation" style="margin-right:4px"><input type="checkbox" data-a="rot" ${inRot?'checked':''}></label><span class="nm"></span><button class="ib" data-a="act" title="Show on display">▶</button><button class="ib" data-a="pull" title="Open in studio">⇩</button><button class="ib" data-a="del" title="Delete from display">✕</button>`;
    d.querySelector('.nm').textContent=p.name||p.id;
    d.onclick=async e=>{const a=e.target.dataset.a;if(!a)return;
      try{
        if(a==='rot'){const pl=new Set(info.playlist||[]);e.target.checked?pl.add(p.id):pl.delete(p.id);await jpost('/api/settings',{playlist:[...pl]});toast(pl.size>1?`Rotation: ${pl.size} projects`:'Rotation off (needs 2 or more)');}
        if(a==='act'){await jpost('/api/active',{id:p.id});toast('Now showing: '+(p.name||p.id));}
        if(a==='del'){if(p.id===info.active)return toast('Switch to another project first');await devFetch('/api/project?id='+encodeURIComponent(p.id),{method:'DELETE'});toast('Deleted');}
        if(a==='pull'){const o=await(await devFetch('/api/project?id='+encodeURIComponent(p.id))).json();o.id=p.id;S.projects=S.projects.filter(x=>x.id!==p.id);S.projects.push(o);migrateFonts();await pullFonts(o);S.cur=p.id;S.sel=-1;syncAll();save();toast('Opened in studio');}
        connect();
      }catch(err){toast('Failed: '+err.message);}};
    el.appendChild(d);});
}
$('btnSend').onclick=async()=>{const P=clone(proj());try{
  await ensureDeviceFonts(proj());delete P.fonts;
  await jpost('/api/project?id='+encodeURIComponent(P.id),P,10000);await jpost('/api/active',{id:P.id});toast('Sent · now showing on the display');connect();}catch(e){toast('Send failed: '+e.message);}};
let devSetT=0;function devSettings(){if(!dev.ok)return;clearTimeout(devSetT);devSetT=setTimeout(()=>jpost('/api/brightness',{value:proj().brightness}).catch(()=>{}),120);}
$('btnLive').onclick=()=>{dev.live=!dev.live;$('btnLive').classList.toggle('on',dev.live);toast(dev.live?'Live mirror on':'Live mirror off');};
function liveTick(){
  if(!dev.live||!dev.ok||dev.busy)return;const n=performance.now();if(n-dev.lastSend<66)return;dev.lastSend=n;dev.busy=true;
  devFetch('/api/frame',{method:'POST',headers:{'Content-Type':'text/plain'},body:b64e(packXBM(fb.p,W,H))},2000)
    .catch(()=>{dev.live=false;$('btnLive').classList.remove('on');toast('Live mirror stopped');}).finally(()=>dev.busy=false);
}
$('btnMsg').onclick=()=>{const t=$('msgText').value.trim();if(!t)return;jpost('/api/msg',{text:t,sec:+$('msgSec').value||10}).then(()=>toast('Message shown'),e=>toast('Failed: '+e.message));};
$('btnReboot').onclick=()=>modal('Reboot display','<p class="note">The display restarts and is back online in about 10 seconds.</p>',[['Cancel'],['Reboot','hot',()=>{jpost('/api/reboot',{}).catch(()=>{});toast('Rebooting…');setTimeout(connect,12000);}]]);
$('btnSettings').onclick=async()=>{
  let s;try{s=await(await devFetch('/api/settings')).json();}catch(e){return toast('Could not load settings');}
  const supportsAutoBrightness=typeof s.autoBrightness==='boolean';
  const supportsWifiTx=typeof s.wifiLowTx==='boolean';
  const wifiTxSettings=supportsWifiTx?`
    <label for="sWifiTx">Wi-Fi TX limit</label><div class="row"><select id="sWifiTx" aria-describedby="sWifiTxNote" style="width:auto"><option value="8.5">8.5 dBm</option><option value="default">ESP32 default</option></select>
    <span class="note" id="sWifiTxNote">${Number.isFinite(s.wifiTxDbm)?`Current limit ${s.wifiTxDbm} dBm. `:''}Reboot to apply.</span></div>
    <span class="note">Bluetooth</span><span>${s.bluetoothOn?'On':'Off'}</span>`:'';
  const hm=m=>p2(Math.floor(m/60))+':'+p2(m%60), mh=v=>{const[a,b]=(v||'0:0').split(':');return(+a)*60+(+b);};
  modal('Display settings',`<div class="fields">
    <label>Name</label><input type="text" id="sName"><div class="note full">Address becomes http://NAME.local after a reboot.</div>${wifiTxSettings}
    <label>Time zone</label><input type="text" id="sTz"><div class="note full">POSIX TZ string. Germany: CET-1CEST,M3.5.0,M10.5.0/3</div>
    <label>Location</label><div class="row"><input type="text" id="sCity" placeholder="City" style="flex:1"><button class="btn sm" id="sFind">Search</button></div>
    <div class="full" id="sHits"></div>
    <label>Lat / Lon</label><div class="row"><input type="number" step="0.0001" id="sLat" style="width:48%"><input type="number" step="0.0001" id="sLon" style="width:48%"></div>
    <label>Rotation</label><div class="row"><input type="number" id="sPlay" min="5" style="width:80px"> <span class="note">seconds per project (tick projects in the list)</span></div>
    <label>Brightness limit</label><div class="row"><input type="number" id="sMaxBr" min="20" max="1023" style="width:80px"> <span class="note">tube level at 100 % (0–1023). Datasheet: below 300 delays aging.</span></div>
    <span class="note">Auto brightness</span><label class="ck"><input type="checkbox" id="sAutoBrightness" aria-label="Auto brightness" aria-describedby="sAutoBrightnessNote" ${supportsAutoBrightness?'':'disabled'}> <span id="sAutoBrightnessNote">${supportsAutoBrightness?'Dim the display in darker rooms':'Requires a firmware update'}</span></label>
    <label>Display refresh</label><div class="row"><input type="number" id="sReMin" min="0" max="1440" style="width:80px"> <span class="note">re-initialise the display every … minutes (short blink; fixes a frozen image). 0 = off</span></div>
    <label>Night mode</label><label class="ck"><input type="checkbox" id="sNight">enabled</label>
    <label>From</label><input type="time" id="sFrom">
    <label>To</label><input type="time" id="sTo">
    <label>At night</label><select id="sMode"><option value="dim">dim the display</option><option value="off">switch the tube off</option></select>
    <label>Night level</label><input type="range" id="sLvl" min="0" max="255">
  </div><div class="hr"></div><p class="note">Forget Wi-Fi restarts the display in setup mode (network VFD-SETUP-…). Holding the BOOT button for 5 seconds does the same.</p>`,
  [['Forget Wi-Fi','hot',()=>{jpost('/api/wifi/forget',{}).catch(()=>{});toast('Restarting in setup mode');}],['Cancel'],['Save','pri',()=>{
    jpost('/api/settings',{name:$('sName').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'')||'vfd',tz:$('sTz').value.trim(),nightOn:$('sNight').checked,nightFrom:mh($('sFrom').value),nightTo:mh($('sTo').value),nightMode:$('sMode').value,nightLevel:+$('sLvl').value,
      city:$('sCity').value.trim(),...($('sLat').value===''||$('sLon').value===''?{noLoc:true}:{lat:+$('sLat').value,lon:+$('sLon').value}),playSec:Math.max(5,+$('sPlay').value||30),
      ...(s.maxBright!=null?{maxBright:Math.min(1023,Math.max(20,+$('sMaxBr').value||300))}:{}),
      ...(supportsAutoBrightness?{autoBrightness:$('sAutoBrightness').checked}:{}),
      ...(supportsWifiTx?{wifiLowTx:$('sWifiTx').value==='8.5'}:{}),
      ...(s.reinitMin!=null?{reinitMin:Math.min(1440,Math.max(0,parseInt($('sReMin').value)||0))}:{})})
      .then(()=>{toast('Settings saved');setTimeout(wxRefresh,4000);},e=>toast('Save failed: '+e.message));}]]);
  $('sName').value=s.name;$('sTz').value=s.tz;$('sNight').checked=s.nightOn;$('sFrom').value=hm(s.nightFrom);$('sTo').value=hm(s.nightTo);$('sMode').value=s.nightMode;$('sLvl').value=s.nightLevel;
  $('sCity').value=s.city||'';$('sLat').value=s.lat??'';$('sLon').value=s.lon??'';$('sPlay').value=s.playSec||30;$('sMaxBr').value=s.maxBright??300;$('sMaxBr').disabled=s.maxBright==null;$('sReMin').value=s.reinitMin??'';$('sReMin').disabled=s.reinitMin==null;
  $('sAutoBrightness').checked=s.autoBrightness===true;
  if(supportsWifiTx)$('sWifiTx').value=s.wifiLowTx?'8.5':'default';
  $('sFind').onclick=()=>geoSearch($('sCity').value,$('sHits'),h=>{$('sCity').value=h.name;$('sLat').value=h.latitude.toFixed(4);$('sLon').value=h.longitude.toFixed(4);});
};
$('btnFw').onclick=()=>{
  modal('Firmware update',`<p class="note">Pick the compiled firmware (Arduino IDE → Sketch → Export Compiled Binary → the <b>.bin without "merged"</b> in its name, in the sketch's build folder). Keep this page open until it is done. The display shows the progress too and restarts at the end. If anything goes wrong, the old firmware keeps running.</p>
    <input type="file" id="fwFile" accept=".bin"><div class="sys" style="margin-top:10px"><div class="bar" style="height:8px"><i id="fwBar" style="width:0"></i></div></div><p class="note" id="fwState"></p>`,[['Close'],['Upload','pri',()=>{
    const f=$('fwFile').files[0];if(!f)return false;if(!/\.bin$/i.test(f.name)||/merged/i.test(f.name)){$('fwState').textContent='Pick the .bin without "merged" in its name.';return false;}
    const fd=new FormData();fd.append('firmware',f,f.name);const x=new XMLHttpRequest();
    x.open('POST',dev.base+'/api/update?size='+f.size);x.setRequestHeader('X-VFD','1');x.timeout=180000;
    x.upload.onprogress=e=>{if(!e.lengthComputable)return;const p=Math.round(e.loaded*100/e.total);$('fwBar').style.width=p+'%';$('fwState').textContent=`Uploading ${Math.round(e.loaded/1024)} / ${Math.round(e.total/1024)} KB · ${p} %`;};
    x.onload=()=>{if(x.status===200){$('fwBar').style.width='100%';$('fwState').textContent='Done. The display restarts and is back in about 10 seconds…';setTimeout(connect,12000);}else{$('fwBar').className='hot';$('fwState').textContent='Failed: '+(x.responseText||('HTTP '+x.status))+' · the old firmware keeps running.';}};
    x.onerror=x.ontimeout=()=>{$('fwBar').className='hot';$('fwState').textContent='Connection lost. Check the display: if it restarted with the new version, all is fine; otherwise the old firmware keeps running.';};
    x.send(fd);$('fwState').textContent='Starting…';return false;}]]);
};


/* ============================================================
   ADD-LAYER MENU
   ============================================================ */
(()=>{const sel=$('addType');for(const k in TYPES){if(k==='bitmap'||k==='anim')continue;const o=document.createElement('option');o.value=k;o.textContent=TYPES[k].label;sel.appendChild(o);}})();

/* ============================================================
   WEATHER DATA (same mapping as the firmware)
   ============================================================ */
const WX_SAMPLE={ok:true,sample:true,temp:7.4,feels:4.6,hum:86,rain:2.3,rainNow:0.2,pop:70,wind:14,code:61,day:true,tmax:9.1,tmin:3.2,sunrise:'07:21',sunset:'16:47',city:'SAMPLE',lat:50.1,lon:8.7,
  hT:[7.4,7.6,7.9,8.3,8.8,9.1,8.9,8.2,7.4,6.6,6.0,5.5,5.1,4.8,4.4,4.1,3.9,3.6,3.4,3.3,3.2,3.6,4.4,5.3],
  hP:[70,75,80,65,40,30,20,15,10,10,15,25,35,45,50,40,30,20,10,5,5,10,20,30],
  hR:[0.2,0.4,0.9,0.6,0.2,0.1,0,0,0,0,0,0.1,0.3,0.5,0.7,0.4,0.2,0,0,0,0,0,0.1,0.2]};
WX=Object.assign({},WX_SAMPLE);
const omUrl=(lat,lon)=>`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day&hourly=temperature_2m,precipitation_probability,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset&forecast_days=2&timezone=auto`;
function parseOM(j,loc){const c=j.current,d=j.daily,h=j.hourly;let i0=h.time.findIndex(t=>t.slice(0,13)===c.time.slice(0,13));if(i0<0)i0=0;
  const sl=a=>a.slice(i0,i0+24).map(v=>v??0);
  return{ok:true,temp:c.temperature_2m,feels:c.apparent_temperature,hum:c.relative_humidity_2m,rainNow:c.precipitation,code:c.weather_code,wind:c.wind_speed_10m,day:c.is_day===1,
    tmax:d.temperature_2m_max[0],tmin:d.temperature_2m_min[0],rain:d.precipitation_sum[0],pop:d.precipitation_probability_max[0]??0,
    sunrise:String(d.sunrise[0]).slice(11,16),sunset:String(d.sunset[0]).slice(11,16),hT:sl(h.temperature_2m),hP:sl(h.precipitation_probability),hR:sl(h.precipitation),city:loc.city||'',lat:loc.lat,lon:loc.lon};}
let wxLoc=store.get('vfd.loc',null);
function wxStatus(t){$('wxState').textContent=t;}
async function wxRefresh(){
  if(dev.ok){try{const w=await(await devFetch('/api/weather')).json();if(w.ok){WX=w;wxStatus(`From the display · ${w.city||''} · ${fnum(w.temp,1)}°`);return;}
      if(w.lat==null){WX=Object.assign({},WX_SAMPLE);wxStatus('Sample data · set a location in the display settings');return;}}catch(e){}}
  if(wxLoc){try{const j=await(await fetch(omUrl(wxLoc.lat,wxLoc.lon))).json();WX=parseOM(j,wxLoc);wxStatus(`Live · ${wxLoc.city} · ${fnum(WX.temp,1)}°`);return;}catch(e){}}
  WX=Object.assign({},WX_SAMPLE);wxStatus(wxLoc?'Sample data (weather service not reachable from this page)':'Sample data · set a location');
}
async function geoSearch(q,el,pick){
  q=(q||'').trim();if(!q)return;el.innerHTML='<p class="note">Searching…</p>';
  try{const j=await(await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&format=json`)).json();
    el.innerHTML='';(j.results||[]).forEach(h=>{const b=document.createElement('div');b.className='item';b.textContent=`${h.name} · ${h.admin1||''} · ${h.country_code||''}`;b.onclick=()=>{pick(h);el.innerHTML='';};el.appendChild(b);});
    if(!(j.results||[]).length)el.innerHTML='<p class="note">Nothing found.</p>';}
  catch(e){el.innerHTML='<p class="note">Search is not reachable from this page. Enter latitude and longitude by hand, or open the studio from the display.</p>';}
}
$('btnWxRefresh').onclick=()=>{wxRefresh();toast('Refreshing weather');if(dev.ok)jpost('/api/weather/refresh',{}).catch(()=>{});};
$('btnWx').onclick=()=>{
  if(dev.ok){$('btnSettings').click();return;}
  modal('Weather location (preview)',`<p class="note">For the preview in this browser. The display uses the location from its own settings.</p><div class="fields">
    <label>City</label><div class="row"><input type="text" id="lCity" style="flex:1"><button class="btn sm" id="lFind">Search</button></div><div class="full" id="lHits"></div>
    <label>Lat / Lon</label><div class="row"><input type="number" step="0.0001" id="lLat" style="width:48%"><input type="number" step="0.0001" id="lLon" style="width:48%"></div></div>`,
    [['Cancel'],['Save','pri',()=>{if($('lLat').value===''){wxLoc=null;}else wxLoc={city:$('lCity').value.trim(),lat:+$('lLat').value,lon:+$('lLon').value};store.set('vfd.loc',wxLoc);wxRefresh();}]]);
  if(wxLoc){$('lCity').value=wxLoc.city;$('lLat').value=wxLoc.lat;$('lLon').value=wxLoc.lon;}
  $('lFind').onclick=()=>geoSearch($('lCity').value,$('lHits'),h=>{$('lCity').value=h.name;$('lLat').value=h.latitude.toFixed(4);$('lLon').value=h.longitude.toFixed(4);});
};
setInterval(wxRefresh,10*60*1000);

/* ============================================================
   FONT BAKER — Google Fonts or your own file → 1-bit font in the project
   ============================================================ */
$('btnFonts').onclick=()=>{
  const P=proj();
  const uses=id=>S.projects.filter(q=>q.layers.some(l=>l.font===id)).length;
  const list=()=>Object.entries(FONTLIB).map(([id,F])=>`<div class="item"><span class="nm">${F.name.replace(/</g,'&lt;')} · ${F.h}px · ${[...F.chars].length} chars · ${(b64d(F.data).length/1024).toFixed(1)} KB · used in ${uses(id)}</span><button class="ib" data-del="${id}" title="Remove from library">✕</button></div>`).join('')||'<p class="note">The library is empty. Bake a font below.</p>';
  modal('Font library',`<p class="note">Fonts are stored once and shared by all projects. Sending a project uploads the fonts it needs to the display.</p><div id="fList">${list()}</div><div class="hr"></div>
    <div class="fields">
      <label>Source</label><select id="fSrc"><option value="g">Google Font</option><option value="u">Upload a font file</option></select>
      <label>Google Font</label><div class="row"><select id="fG" style="flex:1">${GFONTS.map(f=>`<option>${f}</option>`).join('')}</select></div>
      <label>…or name</label><input type="text" id="fGName" placeholder="Any Google Fonts family name">
      <label>File</label><input type="file" id="fFile" accept=".ttf,.otf,.woff,.woff2">
      <label>Size px</label><input type="number" id="fSize" value="16" min="5" max="48">
      <label>Threshold</label><input type="range" id="fThr" min="1" max="254" value="110">
      <label>Spacing</label><input type="number" id="fSp" value="1" min="0" max="8">
      <label>Characters</label><select id="fSet">${Object.keys(CHARSETS).map(k=>`<option>${k}</option>`).join('')}<option value="custom">Custom…</option></select>
      <label></label><input type="text" id="fCustom" placeholder="Only these characters" style="display:none">
      <label>Preview text</label><input type="text" id="fPrev" value="NEON 12:34 Grüße">
    </div><canvas id="fCanvas" class="prev" style="margin-top:10px"></canvas><p class="note" id="fInfo"></p>
    <p class="note">Pixel fonts (Press Start 2P at 8/16/24, VT323, Silkscreen at 8/16, Tiny5, Micro 5) stay crisp. Others look best from about 14 px.</p>`,
    [['Close'],['Add to library','pri',()=>{if(!fState.font)return false;const id=(fState.font.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')).replace(/^-|-$/g,'');FONTLIB[id]=fState.font;saveLib();renderInspector();$('fList').innerHTML=list();bindDel();toast('Added · pick it in a Text layer');return false;}]]);
  const bindDel=()=>document.querySelectorAll('#fList [data-del]').forEach(b=>b.onclick=()=>{const id=b.dataset.del;if(uses(id))return toast('Font is used by a project');delete FONTLIB[id];saveLib();$('fList').innerHTML=list();bindDel();});
  bindDel();
  const fState={};let t=0;
  const fam=async()=>{if($('fSrc').value==='u'){const f=$('fFile').files[0];if(!f)return null;if(fState.file!==f){const n='UF_'+uid();const ff=new FontFace(n,await f.arrayBuffer());await ff.load();document.fonts.add(ff);fState.file=f;fState.ufam=n;fState.uname=f.name.replace(/\.\w+$/,'');}return{fam:fState.ufam,name:fState.uname};}
    const g=$('fGName').value.trim()||$('fG').value;await ensureGoogleFont(g);return{fam:g,name:g};};
  const run=async()=>{try{const F=await fam();if(!F){$('fInfo').textContent='Pick a font file.';return;}
      const cs=$('fSet').value==='custom'?(' '+$('fCustom').value):CHARSETS[$('fSet').value]();
      const chars=[...new Set([...cs])].join('');
      const font=await bakeFont({family:F.fam,size:+$('fSize').value,thr:+$('fThr').value,sp:+$('fSp').value,chars});font.name=`${F.name} ${$('fSize').value}`;fState.font=font;
      const f2=new FB(),key='__prev',old=CUR_FONTS;CUR_FONTS={[key]:font};const s=$('fPrev').value;const tw=textW(s,key,1);drawText(f2,Math.max(0,Math.floor((W-tw)/2)),Math.max(0,Math.floor((H-font.h)/2)),s,key,1);CUR_FONTS=old;
      const cv=$('fCanvas'),sc=3;cv.width=W*sc;cv.height=H*sc;const x=cv.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,cv.width,cv.height);x.fillStyle=S.view.tint;
      for(let i=0;i<W*H;i++)if(f2.p[i])x.fillRect((i%W)*sc,Math.floor(i/W)*sc,sc-1,sc-1);
      $('fInfo').textContent=`${font.h}px high · ${[...chars].length} characters · ${(b64d(font.data).length/1024).toFixed(1)} KB`+(document.fonts.check(`12px "${F.fam}"`)?'':' · font did not load (offline?)');
    }catch(e){$('fInfo').textContent='Could not bake: '+e.message;}};
  const deb=()=>{clearTimeout(t);t=setTimeout(run,250);};
  ['fSrc','fG','fGName','fFile','fSize','fThr','fSp','fSet','fCustom','fPrev'].forEach(id=>$(id).addEventListener('input',deb));
  $('fSet').addEventListener('change',()=>{$('fCustom').style.display=$('fSet').value==='custom'?'':'none';});
  $('fFile').addEventListener('change',()=>{$('fSrc').value='u';deb();});
  run();
};

/* ============================================================
   GIF / ANIMATION IMPORT → animation layer (frames dithered to 1 bit)
   ============================================================ */
$('btnAnimImport').onclick=()=>{
  const hasDec=typeof ImageDecoder!=='undefined';
  modal('Import GIF / animation',`<p class="note">Animated GIF${hasDec?', WebP or PNG':' (animated WebP/PNG need the HTTPS studio in Chrome or Edge)'}. Each frame is dithered to 1 bit and stored in the project.</p>
    <div class="fields">
      <label>File</label><input type="file" id="aFile" accept="image/gif,image/webp,image/png,image/apng">
      <label>Size</label><div class="row"><input type="number" id="aW" value="64" style="width:70px">×<input type="number" id="aH" value="48" style="width:70px"><select id="aFit" style="width:auto"><option>contain</option><option>cover</option><option>stretch</option></select></div>
      <label>Dither</label><select id="aD"><option value="atkinson">Atkinson</option><option value="floyd">Floyd–Steinberg</option><option value="bayer">Ordered (Bayer)</option><option value="none">Threshold</option></select>
      <label>Threshold</label><input type="range" id="aT" min="0" max="255" value="128">
      <label>Contrast</label><input type="range" id="aC" min="-100" max="100" value="0">
      <label>Invert</label><input type="checkbox" id="aI" style="width:auto">
      <label>Max frames</label><input type="number" id="aN" value="48" min="1" max="200">
    </div><canvas id="aPrev" class="prev" style="margin-top:10px"></canvas><p class="note" id="aInfo"></p>`,
    [['Cancel'],['Add layer','pri',()=>{if(!aState.frames)return false;const P=proj(),o=aState.o,fsz=((o.w+7)>>3)*o.h,all=new Uint8Array(fsz*aState.frames.length);
      aState.frames.forEach((b,i)=>all.set(packXBM(b,o.w,o.h),i*fsz));
      P.layers.push({type:'anim',name:aState.name||'Animation',x:Math.max(0,Math.round((W-o.w)/2)),y:Math.max(0,Math.round((H-o.h)/2)),w:o.w,h:o.h,n:aState.frames.length,ms:aState.ms,invert:false,data:b64e(all)});
      S.sel=P.layers.length-1;syncAll();save();}]]);
  const aState={};let t=0,pv=0;
  const run=async()=>{const f=$('aFile').files[0];if(!f)return;aState.name=f.name.replace(/\.\w+$/,'');
    const o={w:Math.min(256,Math.max(1,+$('aW').value)),h:Math.min(48,Math.max(1,+$('aH').value)),fit:$('aFit').value,mode:$('aD').value,thr:+$('aT').value,con:+$('aC').value/100,inv:$('aI').checked};
    const frames=[];let dur=0;
    try{
      const isGif=f.type==='image/gif'||/\.gif$/i.test(f.name);
      if(isGif){const g=decodeGif(new Uint8Array(await f.arrayBuffer()),+$('aN').value||48);if(!g.frames.length)throw new Error('no frames');
        for(const fr of g.frames){frames.push(ditherFrame(fr.canvas,g.w,g.h,o));dur+=fr.delay;}}
      else if(hasDec){const dec=new ImageDecoder({data:await f.arrayBuffer(),type:f.type||'image/gif'});await dec.tracks.ready;const n=Math.min(dec.tracks.selectedTrack.frameCount,+$('aN').value||48);
        for(let i=0;i<n;i++){const {image}=await dec.decode({frameIndex:i});frames.push(ditherFrame(image,image.displayWidth,image.displayHeight,o));dur+=(image.duration||100000)/1000;image.close();}}
      else{const im=new Image();im.src=URL.createObjectURL(f);await im.decode();frames.push(ditherFrame(im,im.width,im.height,o));dur=100;}
    }catch(e){$('aInfo').textContent='Could not read this file: '+e.message;return;}
    aState.frames=frames;aState.o=o;aState.ms=Math.max(20,Math.round(dur/frames.length));
    const kb=(((o.w+7)>>3)*o.h*frames.length/1024).toFixed(1);$('aInfo').textContent=`${frames.length} frames · ${aState.ms} ms each · ${kb} KB`+(kb>120?' · large, consider fewer frames or a smaller size':'');
    clearInterval(pv);let k=0;const cv=$('aPrev'),sc=4;cv.width=o.w*sc;cv.height=o.h*sc;const x=cv.getContext('2d');
    pv=setInterval(()=>{if(!document.body.contains(cv))return clearInterval(pv);const b=frames[k++%frames.length];x.fillStyle='#000';x.fillRect(0,0,cv.width,cv.height);x.fillStyle=S.view.tint;for(let i=0;i<b.length;i++)if(b[i])x.fillRect((i%o.w)*sc,Math.floor(i/o.w)*sc,sc-1,sc-1);},aState.ms);};
  const deb=()=>{clearTimeout(t);t=setTimeout(run,250);};
  ['aFile','aW','aH','aFit','aD','aT','aC','aI','aN'].forEach(id=>$(id).addEventListener('input',deb));
};

/* ============================================================
   STUDIO UPDATE ON THE DEVICE (no firmware compile needed)
   ============================================================ */
$('btnStudioUp').onclick=()=>{
  modal('Studio update',`<p class="note">Upload a new <b>vfd-studio.html</b>. It is compressed in your browser, stored on the display and served from then on. Firmware and projects stay untouched.</p>
    <input type="file" id="suFile" accept=".html,text/html"><p class="note" id="suState"></p>`,
    [['Restore built-in','hot',()=>{devFetch('/api/studio',{method:'DELETE'}).then(()=>{$('suState').textContent='Built-in studio restored. Reload the page.';},e=>{$('suState').textContent='Failed: '+e.message;});return false;}],['Close'],
     ['Upload','pri',()=>{const f=$('suFile').files[0];if(!f)return false;$('suState').textContent='Compressing…';
      (async()=>{try{if(typeof CompressionStream==='undefined')throw new Error('browser cannot gzip');
        const gz=await new Response(f.stream().pipeThrough(new CompressionStream('gzip'))).blob();const fd=new FormData();fd.append('studio',gz,'studio.html.gz');
        $('suState').textContent=`Uploading ${(gz.size/1024).toFixed(1)} KB…`;await devFetch('/api/studio',{method:'POST',body:fd},60000);
        $('suState').textContent='Done. Reload this page to use the new studio.';}catch(e){$('suState').textContent='Failed: '+e.message;}})();return false;}]]);
};


/* ============================================================
   FONT LIBRARY (shared by all projects; synced to the display on send)
   ============================================================ */
function saveLib(){store.set('vfd.fontlib',Object.fromEntries(Object.entries(FONTLIB).map(([k,v])=>[k,clone(v)])));}
function migrateFonts(){let ch=false;S.projects.forEach(P=>{if(!P.fonts)return;for(const[id,F]of Object.entries(P.fonts)){if(!FONTLIB[id]){FONTLIB[id]=F;ch=true;}}delete P.fonts;ch=true;});if(ch){saveLib();save();}}
async function ensureDeviceFonts(P){
  const need=usedFonts(P);if(!need.length)return;
  let have={};try{for(const f of await(await devFetch('/api/fonts')).json())have[f.id]=f.v||'';}catch(e){}
  for(const id of need){const F=FONTLIB[id];if(!F){if(id in have)continue;throw new Error('font '+id+' missing in library');}
    const v=fontHash(F);if(have[id]===v)continue;           // same version already on the display
    await jpost('/api/font?id='+encodeURIComponent(id),{...clone(F),v},10000);}
}
async function pullFonts(P){for(const id of usedFonts(P)){if(FONTLIB[id])continue;try{FONTLIB[id]=await(await devFetch('/api/font?id='+encodeURIComponent(id))).json();}catch(e){}}saveLib();}
async function syncDeviceFonts(){try{const list=await(await devFetch('/api/fonts')).json();let n=0;
  for(const f of list){if(FONTLIB[f.id])continue;try{FONTLIB[f.id]=await(await devFetch('/api/font?id='+encodeURIComponent(f.id))).json();n++;}catch(e){}}
  if(n){saveLib();renderInspector();}}catch(e){}}

/* ============================================================
   TIMELINE (per-layer timing inside a loop)
   ============================================================ */
const _renderLayers=renderLayers;renderLayers=function(){_renderLayers();renderTimeline();};
const fmtS=ms=>(ms/1000).toFixed(ms%1000?1:0)+' s';
function renderTimeline(){
  const P=proj(),loop=P.loop|0,el=$('tlTracks');if(!el)return;
  $('tlLoop').value=loop?loop/1000:'';
  el.innerHTML='';
  $('tlNote').textContent=loop>0?'Drag bars to move, edges to resize. Click a striped bar to time that layer. Clear "at" in the inspector to make a layer always visible.':'Set a loop length (seconds) to build a sequence. Layers without timing stay visible the whole time.';
  if(loop<=0)return;
  P.layers.forEach((L,i)=>{
    const row=document.createElement('div');row.className='tlrow'+(i===S.sel?' sel':'');
    const nm=document.createElement('div');nm.className='tlname';nm.textContent=L.name||TYPES[L.type]?.label||L.type;nm.onclick=()=>{S.sel=i;renderLayers();renderInspector();};
    const tr=document.createElement('div');tr.className='tltrack';
    const bar=document.createElement('div');
    if(!timed(L)){bar.className='tlbar always';bar.style.left='0';bar.style.width='100%';bar.title='Always visible · click to give it a time slot';
      bar.onclick=()=>{const lt=loopTime(P,timeObj(simNow()));L.at=Math.max(0,Math.min(loop-500,Math.round(lt/100)*100));L.length=Math.min(2000,loop-L.at);if(!L.in)L.in='dissolve';if(!L.out)L.out='dissolve';if(!L.tr)L.tr=300;S.sel=i;save();renderLayers();renderInspector();};}
    else{const at=L.at|0,dur=(L.length|0)>0?L.length|0:loop-at;bar.className='tlbar'+(i===S.sel?' sel':'');
      bar.style.left=(at/loop*100)+'%';bar.style.width=(Math.max(0.5,Math.min(dur,loop-at)/loop*100))+'%';
      bar.title=`${L.name||L.type}: ${fmtS(at)} → ${fmtS(at+dur)}${L.in&&L.in!=='none'?' · in '+L.in:''}${L.out&&L.out!=='none'?' · out '+L.out:''}${L.dip?' · dip':''}`;
      const trp=Math.min(1,(L.tr|0)/Math.max(1,dur))*100;
      if(L.in&&L.in!=='none'&&L.tr>0){const r=document.createElement('div');r.className='ramp';r.style.cssText=`left:0;width:${trp}%;background:linear-gradient(90deg,transparent,#4dffd255)`;bar.appendChild(r);}
      if(L.out&&L.out!=='none'&&L.tr>0){const r=document.createElement('div');r.className='ramp';r.style.cssText=`right:0;width:${trp}%;background:linear-gradient(270deg,transparent,#4dffd255)`;bar.appendChild(r);}
      const hl=document.createElement('div');hl.className='h l';const hr=document.createElement('div');hr.className='h r';bar.appendChild(hl);bar.appendChild(hr);
      bar.onpointerdown=e=>{e.preventDefault();S.sel=i;const mode=e.target===hl?'l':e.target===hr?'r':'m',x0=e.clientX,w=tr.getBoundingClientRect().width,a0=L.at|0,d0=(L.length|0)>0?L.length|0:loop-a0;
        bar.setPointerCapture(e.pointerId);
        bar.onpointermove=ev=>{const dm=Math.round((ev.clientX-x0)/w*loop/50)*50;
          if(mode==='m'){L.at=Math.max(0,Math.min(loop-d0,a0+dm));L.length=d0;}
          else if(mode==='r'){L.length=Math.max(100,Math.min(loop-a0,d0+dm));L.at=a0;}
          else{const na=Math.max(0,Math.min(a0+d0-100,a0+dm));L.at=na;L.length=a0+d0-na;}
          bar.style.left=(L.at/loop*100)+'%';bar.style.width=(L.length/loop*100)+'%';refreshInspectorValues();};
        bar.onpointerup=()=>{bar.onpointermove=null;save();renderLayers();renderInspector();};};}
    tr.appendChild(bar);row.appendChild(nm);row.appendChild(tr);el.appendChild(row);
  });
  const head=document.createElement('div');head.className='tlhead';head.id='tlHead';el.appendChild(head);
}
function tlTick(){
  const P=proj(),loop=P.loop|0;if(loop<=0){$('tlTime').textContent='';return;}
  const lt=loopTime(P,timeObj(simNow()));$('tlTime').textContent=`${fmtS(Math.floor(lt/100)*100)} / ${fmtS(loop)}`;
  if(document.activeElement!==$('tlScrub'))$('tlScrub').value=Math.round(lt/loop*1000);
  const h=$('tlHead');if(h)h.style.left=`calc(138px + (100% - 138px) * ${lt/loop})`;
}
$('tlLoop').oninput=e=>{const v=parseFloat(e.target.value);const P=proj();if(!(v>0)){delete P.loop;}else{P.loop=Math.round(v*1000);P._t0=simNow();}save();renderTimeline();renderInspector();};
$('tlPlay').onclick=()=>{const playing=S.clock.speed!==0;setClock(simNow(),playing?0:1);$('tlPlay').textContent=playing?'▶':'❚❚';if(!playing)setSpeedUI('live');};
$('tlStart').onclick=()=>{proj()._t0=simNow();};
$('tlScrub').oninput=e=>{const P=proj(),loop=P.loop|0;if(loop<=0)return;P._t0=simNow()-(+e.target.value/1000)*loop;};

/* ============================================================
   SYSTEM (stats, display re-init, Builder)
   ============================================================ */
const kb=n=>n>=1048576?(n/1048576).toFixed(2)+' MB':Math.round(n/1024)+' KB';
function sysCard(k,v,pct){const c=pct==null?'':`<div class="bar"><i class="${pct>90?'hot':pct>75?'warn':''}" style="width:${Math.max(0,Math.min(100,pct))}%"></i></div>`;return`<div class="sys"><div class="k">${k}</div><div class="v">${v}</div>${c}</div>`;}
async function sysRefresh(){
  if(!dev.ok)return;
  try{const d=await(await devFetch('/api/system')).json();
    SYS={cpu:d.load,ram:(d.heapTotal-d.heapFree)*100/d.heapTotal,fs:d.fsUsed*100/d.fsTotal,temp:d.temp,rssi:d.rssi,up:d.uptime,ip:d.ip};
    const appT=d.appTotal||1;
    $('sysGrid').innerHTML=
      sysCard('Storage',`${kb(d.fsUsed)} / ${kb(d.fsTotal)}`,d.fsUsed*100/d.fsTotal)+
      sysCard('Firmware slot',`${kb(d.appUsed)} / ${kb(appT)}`,d.appUsed*100/appT)+
      sysCard('RAM',`${kb(d.heapTotal-d.heapFree)} / ${kb(d.heapTotal)} · min free ${kb(d.heapMin)}`,(d.heapTotal-d.heapFree)*100/d.heapTotal)+
      (d.psramTotal?sysCard('PSRAM',`${kb(d.psramTotal-d.psramFree)} / ${kb(d.psramTotal)}`,(d.psramTotal-d.psramFree)*100/d.psramTotal):'')+
      sysCard('CPU (render)',`${fnum(d.load,0)} % · ${d.renderMs.toFixed(1)} ms/frame · ${d.cpuMHz} MHz`,d.load)+
      (Number.isFinite(d.lightPercent)&&Number.isFinite(d.lightMv)?sysCard('Ambient light',`${d.lightPercent} % · ${d.lightMv} mV`):'')+
      sysCard('Chip temperature',`${fnum(d.temp,1)} °C`,null)+
      sysCard('Wi-Fi',`${d.ssid} · ${d.rssi} dBm`,Math.max(0,Math.min(100,(d.rssi+95)*100/60)))+
      sysCard('Uptime',fUp(d.uptime)+` · fw ${d.fw}`+(d.reinits!=null?` · display re-inits ${d.reinits}${d.reinitMin?' (every '+d.reinitMin+' min)':''}`:''),null);
    $('btnBuilderOpen').style.display=d.builder?'':'none';$('btnBuilderUp').textContent=d.builder?'Update Builder':'Install Builder';
  }catch(e){}
}
setInterval(sysRefresh,3000);
$('btnReinit').onclick=()=>jpost('/api/display/reinit',{}).then(()=>toast('Display re-initialised'),e=>toast('Failed: '+e.message));
async function uploadGz(file,api,stateEl){
  if(typeof CompressionStream==='undefined')throw new Error('browser cannot gzip');
  const gz=await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob(),fd=new FormData();fd.append('file',gz,'app.html.gz');
  stateEl.textContent=`Uploading ${(gz.size/1024).toFixed(1)} KB…`;await devFetch(api,{method:'POST',body:fd},60000);
}
$('btnBuilderUp').onclick=()=>{
  modal('VFD Studio Builder',`<p class="note">Upload <b>vfd-builder.html</b>. It is stored on the display and opens at <b>/builder</b>. Firmware, projects and fonts stay untouched.</p>
    <input type="file" id="buFile" accept=".html,text/html"><p class="note" id="buState"></p>`,
    [['Remove','hot',()=>{devFetch('/api/builder',{method:'DELETE'}).then(()=>{$('buState').textContent='Builder removed.';sysRefresh();},e=>{$('buState').textContent='Failed: '+e.message;});return false;}],['Close'],
     ['Upload','pri',()=>{const f=$('buFile').files[0];if(!f)return false;
      uploadGz(f,'/api/builder',$('buState')).then(()=>{$('buState').innerHTML='Installed. <a href="/builder" style="color:var(--tube)">Open the Builder</a>';sysRefresh();},e=>{$('buState').textContent='Failed: '+e.message;});return false;}]]);
};

/* ---------- boot ---------- */
FONTLIB=store.get('vfd.fontlib',{});migrateFonts();
if(!S.projects.some(p=>p.id===S.cur))S.cur=S.projects[0].id;
proj()._t0=simNow();
paintBg();syncAll();requestAnimationFrame(loop);
if(onDevice)connect();else wxRefresh();
