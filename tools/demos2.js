// Builds the new demo projects (assets/demos2.json) from baked fonts.
const fs=require('fs');
const F=JSON.parse(fs.readFileSync('assets/fonts_baked.json','utf8'));
const fonts=(...ids)=>Object.fromEntries(ids.map(i=>[i,F[i]]));
const P=(id,name,o,layers)=>{const p={id,name,v:2,brightness:o.b??210,lang:o.lang??'en',shift:o.shift??'both',fonts:o.fonts||{},layers};Object.defineProperty(p,'__loop',{value:n=>{p.loop=n;return p;}});return p;};
const T=(o)=>Object.assign({type:'text',scale:1,align:'left',fx:'none',fxMs:60,amp:2,cycle:0},o);
const demos=[
 P('globe-net','GLOBE//NET',{fonts:fonts('orbitron-20','orbitron-11','silkscreen-8')},[
   {type:'globe',name:'Globe',x:25,y:24,r:22,speed:15,tilt:23,ocean:'dots',night:true,rim:true,marker:true},
   {type:'line',name:'Divider',x1:54,y1:4,x2:54,y2:43,dash:2},
   T({name:'Time',x:61,y:3,text:'{HH}:{MM}',font:'orbitron-20'}),
   {type:'bar',name:'Seconds',x:61,y:28,w:82,h:3,source:'sec',style:'ticks',n:20},
   T({name:'Date',x:61,y:36,text:'{WD} {DD}.{MON}',font:'silkscreen-8'}),
   {type:'line',name:'Divider 2',x1:150,y1:4,x2:150,y2:43,dash:2},
   T({name:'City',x:157,y:3,text:'{CITY}',font:'orbitron-11'}),
   T({name:'Weather',x:157,y:19,text:'{TEMP}° {WX}',font:'silkscreen-8'}),
   T({name:'Details',x:157,y:31,text:'HUM {HUM}%  POP {POP}%',font:'small'}),
   T({name:'Sun',x:157,y:39,text:'SUN {SUNRISE}-{SUNSET}',font:'small'}),
   {type:'scan',name:'Scanline',period:7000,dur:800,rows:1}]),
 P('weather-now','WEATHER//NOW',{fonts:fonts('archivo-30','silkscreen-8')},[
   {type:'wxicon',name:'Icon',x:4,y:2,scale:2,icon:'auto',animate:true},
   T({name:'Condition',x:4,y:38,text:'{WX}',font:'silkscreen-8'}),
   T({name:'Temperature',x:44,y:2,text:'{TEMP}°',font:'archivo-30'}),
   T({name:'Feels',x:46,y:38,text:'FEELS {FEELS}°',font:'small'}),
   {type:'line',name:'Divider',x1:121,y1:2,x2:121,y2:45,dash:1},
   T({name:'City',x:127,y:1,text:'{CITY}',font:'silkscreen-8'}),
   T({name:'High low',x:252,y:2,text:'H{TMAX}° L{TMIN}°',font:'small',align:'right'}),
   T({name:'Rain',x:127,y:12,text:'HUM {HUM}%  RAIN {RAIN}MM  POP {POP}%',font:'small'}),
   {type:'graph',name:'Temp 24h',x:127,y:20,w:125,h:12,source:'temp',style:'line',hours:24},
   {type:'graph',name:'Rain chance 24h',x:127,y:36,w:125,h:10,source:'pop',style:'bars',hours:24}]),
 P('year-dots','YEAR//DOTS',{fonts:fonts('pressstart-8')},[
   T({name:'Year',x:6,y:3,text:'{YYYY}',font:'pressstart-8'}),
   T({name:'Progress',x:250,y:4,text:'DAY {DOY} · {YPCT}% · {DLEFT} LEFT',font:'small',align:'right'}),
   {type:'dots',name:'Days',x:6,y:15,cols:61,cell:4,dot:3,source:'year',future:'dot',birth:'1990-01',years:80},
   T({name:'Week',x:6,y:41,text:'KW {KW}',font:'small'}),
   T({name:'Now',x:250,y:41,text:'{WD} {DD}.{MON} · {HH}:{MM}',font:'small',align:'right'})]),
 P('bauhaus','BAUHAUS',{b:200,fonts:fonts('josefin-34')},[
   {type:'shape',name:'Circle',kind:'circle',x:6,y:6,w:36,h:36,dir:0,fill:'solid',t:2,spin:0},
   {type:'shape',name:'Half',kind:'half',x:26,y:4,w:40,h:40,dir:2,fill:'d50',t:2,spin:0,mode:'xor'},
   {type:'shape',name:'Bar',kind:'rect',x:74,y:0,w:5,h:48,dir:0,fill:'solid',t:2,spin:0},
   {type:'shape',name:'Triangle',kind:'triangle',x:85,y:12,w:30,h:32,dir:0,fill:'hlines',t:2,spin:0},
   T({name:'Time',x:172,y:6,text:'{HH}:{MM}',font:'josefin-34',align:'center'}),
   {type:'shape',name:'Quarter',kind:'quarter',x:228,y:3,w:24,h:24,dir:0,fill:'solid',t:2,spin:4000},
   {type:'shape',name:'Ring',kind:'ring',x:230,y:30,w:16,h:16,dir:0,fill:'solid',t:2,spin:0},
   {type:'shape',name:'Ball',kind:'circle',x:82,y:43,w:5,h:5,dir:0,fill:'solid',t:2,spin:0,mode:'xor',move:'pingpong',moveX:138,moveY:0,movePeriod:12000,movePhase:0}]),
 P('synth-1985','SYNTH//1985',{b:230,fonts:fonts('audiowide-13')},[
   {type:'shape',name:'Sun',kind:'circle',x:104,y:-9,w:48,h:48,dir:0,fill:'sunset',t:2,spin:0},
   {type:'poly',name:'Mountains left',pts:'0,27 14,19 24,23 40,13 58,24 74,20 92,27',fill:'d25'},
   {type:'poly',name:'Ridge left',pts:'0,27 14,19 24,23 40,13 58,24 74,20 92,27',fill:'outline'},
   {type:'poly',name:'Mountains right',pts:'164,27 180,18 194,23 212,11 228,22 242,16 255,22 255,27',fill:'d25'},
   {type:'poly',name:'Ridge right',pts:'164,27 180,18 194,23 212,11 228,22 242,16 255,22 255,27',fill:'outline'},
   {type:'shape',name:'Ground',kind:'rect',x:0,y:28,w:256,h:20,dir:0,fill:'solid',t:2,spin:0,mode:'clear'},
   {type:'synth',name:'Grid',hy:27,vx:128,spacing:26,lines:6,speed:0.7,horizon:true},
   T({name:'Time',x:4,y:2,text:'{HH}:{MM}',font:'audiowide-13',mode:'xor'}),
   T({name:'Date',x:252,y:2,text:'{WD} {DD}',font:'audiowide-13',align:'right',mode:'xor'}),
   {type:'scan',name:'Scanline',period:6000,dur:900,rows:1}]),
 P('text-fx','TEXT//FX',{fonts:fonts('orbitron-20','pressstart-8','silkscreen-8')},[
   T({name:'Boot line',x:4,y:3,text:'> SYSTEM ONLINE',font:'pressstart-8',fx:'type',fxMs:90}),
   T({name:'Hex',x:252,y:3,text:'{HEX8}',font:'small',align:'right',fx:'flicker',amp:2}),
   T({name:'Headline',x:128,y:14,text:'NEON DREAMS|{HH}:{MM}:{SS}|{TEMP}° {WX}|STAY CURIOUS',font:'orbitron-20',align:'center',fx:'scramble',fxMs:45,cycle:4000}),
   T({name:'Wave',x:128,y:38,text:'VFD STUDIO · GP1294AI',font:'silkscreen-8',align:'center',fx:'wave',fxMs:70,amp:2})]),
  P('sequence','SEQUENCE',{b:220,shift:'both',fonts:fonts('orbitron-20')},[
   T({name:'Me, myself',x:128,y:13,text:'ME, MYSELF',font:'orbitron-20',align:'center',at:0,length:2600,in:'dissolve',out:'dissolve',tr:450}),
   T({name:'and',x:128,y:13,text:'AND',font:'orbitron-20',align:'center',at:2700,length:1500,in:'scramble',out:'wipe',tr:500}),
   T({name:'Claude',x:128,y:13,text:'CLAUDE',font:'orbitron-20',align:'center',at:4300,length:2800,in:'type',out:'dissolve',tr:700}),
   {type:'shape',name:'Symbol ring',kind:'ring',x:111,y:7,w:34,h:34,dir:0,fill:'solid',t:2,spin:0,at:7300,length:2700,in:'dissolve',out:'dissolve',tr:500},
   {type:'shape',name:'Symbol core',kind:'quarter',x:121,y:17,w:14,h:14,dir:0,fill:'solid',t:2,spin:350,at:7300,length:2700,in:'dissolve',out:'dissolve',tr:500},
   {type:'shape',name:'Symbol orbit',kind:'circle',x:126,y:22,w:4,h:4,dir:0,fill:'solid',t:2,spin:0,move:'circle',moveX:24,moveY:19,movePeriod:1600,movePhase:0,mode:'xor',at:7300,length:2700,in:'dissolve',out:'dissolve',tr:500},
   {type:'clock',name:'Clock',format:'HH:MM',x:128,y:5,align:'center',w:22,h:36,t:4,gap:1,spacing:4,skew:0.12,style:'solid',colon:'blink',lead0:true,h12:false,at:10000,length:0,in:'slide',out:'dissolve',tr:600,dip:true},
   {type:'bar',name:'Seconds',x:62,y:44,w:132,h:2,source:'sec',style:'ticks',n:30,at:10000,length:0,in:'wipe',out:'dissolve',tr:600},
   {type:'corners',name:'Frame',x:1,y:1,w:254,h:46,len:5}]).__loop(20000),
  P('sys-monitor','SYS//MONITOR',{b:190,fonts:fonts('orbitron-11')},[
   T({name:'Title',x:4,y:2,text:'SYS//MONITOR',font:'orbitron-11'}),
   T({name:'Uptime',x:252,y:3,text:'UP {UPTIME}',font:'small',align:'right'}),
   T({name:'CPU label',x:4,y:17,text:'CPU',font:'small'}),
   {type:'bar',name:'CPU',x:22,y:17,w:120,h:5,source:'cpu',style:'ticks',n:30},
   T({name:'CPU value',x:172,y:17,text:'{CPU}%',font:'small',align:'right'}),
   T({name:'RAM label',x:4,y:26,text:'RAM',font:'small'}),
   {type:'bar',name:'RAM',x:22,y:26,w:120,h:5,source:'ram',style:'ticks',n:30},
   T({name:'RAM value',x:172,y:26,text:'{RAM}%',font:'small',align:'right'}),
   T({name:'FS label',x:4,y:35,text:'FS',font:'small'}),
   {type:'bar',name:'Storage',x:22,y:35,w:120,h:5,source:'fs',style:'ticks',n:30},
   T({name:'FS value',x:172,y:35,text:'{FS}%',font:'small',align:'right'}),
   {type:'line',name:'Divider',x1:180,y1:15,x2:180,y2:42,dash:2},
   T({name:'Temperature',x:218,y:16,text:'{TEMPC}°C',font:'medium',align:'center'}),
   T({name:'Wi-Fi',x:218,y:27,text:'{RSSI} DBM',font:'small',align:'center'}),
   T({name:'IP',x:218,y:36,text:'{IP}',font:'small',align:'center'}),
   {type:'corners',name:'Frame',x:0,y:0,w:256,h:48,len:4}])
];
fs.writeFileSync('assets/demos2.json',JSON.stringify(demos));
console.log(demos.map(d=>d.id+' '+(JSON.stringify(d).length/1024).toFixed(1)+'KB').join('\n'));
