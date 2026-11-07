// Assembles src/page.html + src/core.js + src/app.js into vfd-studio.html, embedding the 2023 book bitmaps and demo projects.
const fs=require('fs');
const [ino,out]=process.argv.slice(2);
const page0=process.argv[4]||'src/page.html',app0=process.argv[5]||'src/app.js';
let core=fs.readFileSync('src/core.js','utf8'),app=fs.readFileSync(app0,'utf8'),page=fs.readFileSync(page0,'utf8');
const media=fs.readFileSync('src/media.js','utf8');{const k=app.indexOf('*/\n')+3;app=app.slice(0,k)+media+app.slice(k);}
const fnSrc=core.match(/function parseU8g2\(code\)\{[\s\S]*?\n\}\n/)[0];
const b64e=u8=>Buffer.from(u8).toString('base64');
const parseU8g2=eval('('+fnSrc.replace(/^function parseU8g2/,'function')+')');
const layers=parseU8g2(fs.readFileSync(ino,'utf8'));
core=core.replace('/*__BOOK__*/[]',JSON.stringify(layers));
const d2=fs.existsSync('assets/demos2.json')?fs.readFileSync('assets/demos2.json','utf8'):'[]';
core=core.replace('/*__DEMOS2__*/[]',d2);
const html=page.replace('/*__CORE__*/',()=>core).replace('/*__APP__*/',()=>app);
fs.writeFileSync(out,html);
console.log('size',(html.length/1024).toFixed(1),'KB');
