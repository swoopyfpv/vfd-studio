// Renders projects with the studio's own JS core. args: html, project.json..., prints hex frames per timestamp
const fs=require('fs');
const [html,tsFile,...files]=process.argv.slice(2);
const src=fs.readFileSync(html,'utf8');const script=src.slice(src.indexOf('<script>')+8,src.lastIndexOf('</script>'));
const core=script.slice(0,script.indexOf('/* ============================================================\n   APP'));
const wx=fs.readFileSync(__dirname+'/wx_sample.json','utf8');const ctx={};new Function('ctx','btoa','atob',core+';WX='+wx+';FONTLIB='+fs.readFileSync('assets/fonts_baked.json','utf8')+';Object.assign(ctx,{FB,renderProject,timeObj,demos});')(ctx,s=>Buffer.from(s,'binary').toString('base64'),s=>Buffer.from(s,'base64').toString('binary'));
const projects=[...ctx.demos(),...files.map(f=>JSON.parse(fs.readFileSync(f,'utf8')))];
const ts=fs.readFileSync(tsFile,'utf8').trim().split('\n').map(Number);
const fb=new ctx.FB();
for(const P of projects)for(const t of ts){ctx.renderProject(fb,P,ctx.timeObj(t),-1);
  let h='';for(let i=0;i<fb.p.length;i+=4)h+=(fb.p[i]|fb.p[i+1]<<1|fb.p[i+2]<<2|fb.p[i+3]<<3).toString(16);console.log(P.id,t,(fb.dip??1).toFixed(6),h);}
