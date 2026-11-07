// Renders every demo at a fixed time with the sample weather into PGM strips
const fs=require('fs');
const html=fs.readFileSync(process.argv[2],'utf8');const script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
const core=script.slice(0,script.indexOf('/* ============================================================\n   APP'));
const appWx=script.match(/const WX_SAMPLE=\{[\s\S]*?\};/)[0];
const ctx={};new Function('ctx','btoa','atob',core+';'+appWx+';WX=WX_SAMPLE;Object.assign(ctx,{FB,renderProject,timeObj,demos,W,H});')(ctx,s=>Buffer.from(s,'binary').toString('base64'),s=>Buffer.from(s,'base64').toString('binary'));
const ts=(process.argv[4]||'2026-11-07T21:47:12.300').split(',');
const ids=process.argv[3]?process.argv[3].split(','):null;
const ps=ctx.demos().filter(p=>!ids||ids.includes(p.id));
const fb=new ctx.FB(),rows=[];
for(const P of ps)for(const t of ts){ctx.renderProject(fb,P,ctx.timeObj(new Date(t).getTime()),-1);rows.push(Buffer.from(fb.p.map(v=>v?255:0)));rows.push(Buffer.alloc(256*4,60));}
const img=Buffer.concat(rows);fs.writeFileSync(process.argv[3]||'prev.pgm',Buffer.concat([Buffer.from(`P5 256 ${img.length/256} 255\n`),img]));
