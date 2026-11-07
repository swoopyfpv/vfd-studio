import json,threading,sys,os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlparse,parse_qs
BUILDER=open(os.path.join(ROOT,'dist','vfd-builder.html'),'rb').read()
st={'fonts':{},'projects':{'neon-clock':{'id':'neon-clock','name':'NEON//CLOCK','v':1,'layers':[{'type':'text','x':4,'y':4,'text':'HI','font':'medium'}]}},'active':'neon-clock','frames':0}
class H(BaseHTTPRequestHandler):
  def log_message(self,*a):pass
  def reply(self,code,obj=None,ctype='application/json',raw=None):
    self.send_response(code);self.send_header('Content-Type',ctype);self.end_headers()
    if raw is not None:self.wfile.write(raw)
    elif obj is not None:self.wfile.write(json.dumps(obj).encode())
  def body(self):return self.rfile.read(int(self.headers.get('Content-Length',0)))
  def do_GET(self):
    u=urlparse(self.path);q=parse_qs(u.query)
    if u.path=='/builder':return self.reply(200,raw=BUILDER,ctype='text/html')
    if u.path=='/api/info':return self.reply(200,{'name':'vfd','fw':'2.2.2','ip':'10.0.0.5','rssi':-50,'timeSynced':True,'active':st['active'],'playlist':[],'projects':[{'id':k,'name':v.get('name','')} for k,v in st['projects'].items()]})
    if u.path=='/api/weather':return self.reply(200,{'ok':False})
    if u.path=='/api/system':return self.reply(200,{'load':17,'heapTotal':327680,'heapFree':201000,'fsTotal':917504,'fsUsed':131072,'temp':47.3,'rssi':-61,'uptime':2000,'ip':'10.0.0.5'})
    if u.path=='/api/fonts':return self.reply(200,[{'id':k,'name':v['name'],'h':v['h'],'v':v.get('v','')} for k,v in st['fonts'].items()])
    if u.path=='/api/font':return self.reply(200,st['fonts'][q['id'][0]])
    if u.path=='/api/project':return self.reply(200,st['projects'][q['id'][0]])
    self.reply(404,{})
  def do_POST(self):
    u=urlparse(self.path);q=parse_qs(u.query);b=self.body()
    if not self.headers.get('X-VFD'):st['denied']=st.get('denied',0)+1;return self.reply(403,{'ok':False,'error':'missing header X-VFD'})
    if u.path=='/api/project':st['projects'][q['id'][0]]=json.loads(b)
    elif u.path=='/api/active':st['active']=json.loads(b)['id']
    elif u.path=='/api/font':st['fonts'][q['id'][0]]=json.loads(b)
    elif u.path=='/api/frame':st['frames']+=1
    self.reply(200,{'ok':True})
srv=ThreadingHTTPServer(('127.0.0.1',8097),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
from playwright.sync_api import sync_playwright
ok=True
def check(name,cond,extra=''):
  global ok
  print(('PASS ' if cond else 'FAIL ')+name+(' · '+str(extra) if extra!='' else ''));ok=ok and bool(cond)
with sync_playwright() as p:
  b=p.chromium.launch(args=['--host-resolver-rules=MAP vfd.test 127.0.0.1']);pg=b.new_page(viewport={'width':1600,'height':1000});errs=[]
  pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto('http://vfd.test:8097/builder');pg.wait_for_timeout(1200)
  check('auto-connect',pg.inner_text('#devPill').startswith('vfd'),pg.inner_text('#devPill'))
  check('starter project has layers',pg.locator('#layers .lyr').count()>=3,pg.locator('#layers .lyr').count())
  pg.screenshot(path='/tmp/b1.png')
  # new blank project
  pg.click('#pName');pg.click('#pMenu [data-a=new]');pg.locator('.tpl .card').first.click();pg.wait_for_timeout(200)
  check('blank project',pg.evaluate('proj().layers.length')==0 and pg.evaluate('proj().loop')==10000)
  # palette click adds a text layer
  pg.locator('.pal',has_text='Text').first.click();pg.wait_for_timeout(150)
  pg.fill('#insp [data-k=text]','HELLO VFD');pg.wait_for_timeout(500)
  check('text layer added + edited',pg.evaluate('proj().layers[0].text')=='HELLO VFD')
  # drag a shape from the palette onto the display
  cv=pg.locator('#cvOv').bounding_box()
  pg.drag_and_drop('.pal:has-text("Shape")','#cvOv',target_position={'x':cv['width']*200/256,'y':cv['height']*10/48})
  pg.wait_for_timeout(200)
  sh=pg.evaluate('proj().layers.find(l=>l.type==="shape")')
  check('shape dropped centred on the point',sh and abs(sh['x']+sh['w']/2-200)<=1 and abs(sh['y']+sh['h']/2-10)<=1,sh and (sh['x'],sh['y']))
  # select text layer, drag on display with snapping to centre
  pg.evaluate('select(0)');pg.wait_for_timeout(100)
  bb=pg.evaluate('B.bbox');sx=cv['width']/256;sy=cv['height']/48
  px=cv['x']+(bb[0]+2)*sx;py=cv['y']+(bb[1]+2)*sy
  tw=bb[2]-bb[0]+1;target=128-tw/2  # left edge for a centred layer
  pg.mouse.move(px,py);pg.mouse.down();pg.mouse.move(px+(target-bb[0]+1)*sx,py+5*sy,steps=8);pg.mouse.up();pg.wait_for_timeout(100)
  bb2=pg.evaluate('B.bbox')
  check('drag moved + snapped to centre',abs((bb2[0]+bb2[2])/2-127.5)<=0.5,(bb[0],'→',bb2[0],bb2[2]))
  # undo / redo
  x_after=pg.evaluate('proj().layers[0].x');pg.keyboard.press('Control+z');pg.wait_for_timeout(100);x_undo=pg.evaluate('proj().layers[0].x')
  pg.keyboard.press('Control+Shift+z');pg.wait_for_timeout(100);x_redo=pg.evaluate('proj().layers[0].x')
  check('undo/redo',x_undo!=x_after and x_redo==x_after,(x_after,x_undo,x_redo))
  # auto-key: two drags at two times make a dx animation
  pg.click('#tRec');pg.evaluate('setPlaying(false);setLt(0)');pg.wait_for_timeout(80)
  bb=pg.evaluate('B.bbox');px=cv['x']+(bb[0]+2)*sx;py=cv['y']+(bb[1]+2)*sy
  pg.keyboard.down('Alt');pg.mouse.move(px,py);pg.mouse.down();pg.mouse.move(px-40*sx,py,steps=6);pg.mouse.up()
  pg.evaluate('setLt(1000)');pg.wait_for_timeout(80);bb=pg.evaluate('B.bbox');px=cv['x']+(bb[0]+2)*sx;py=cv['y']+(bb[1]+2)*sy
  pg.mouse.move(px,py);pg.mouse.down();pg.mouse.move(px+40*sx,py,steps=6);pg.mouse.up();pg.keyboard.up('Alt');pg.wait_for_timeout(100)
  keys=pg.evaluate('proj().layers[0].keys')
  check('auto-key created dx keys',keys and len(keys.get('dx',[]))==2 and keys['dx'][0][1]==-40 and keys['dx'][1][1]==0,keys)
  pg.evaluate('setLt(500)');pg.wait_for_timeout(80)
  check('interpolated half-way',pg.evaluate('Math.round(evalProp(proj().layers[0],"dx"))')==-20)
  pg.click('#tRec')
  # motion tab: opacity key
  pg.click('#tabs [data-t=motion]');pg.evaluate('setLt(2000)');pg.wait_for_timeout(150)
  pg.fill('#insp .kp[data-p=o] input','0');pg.wait_for_timeout(500)
  check('opacity key via motion tab',pg.evaluate('JSON.stringify(proj().layers[0].keys.o)')=='[[2000,0,"linear"]]',pg.evaluate('JSON.stringify(proj().layers[0].keys.o)'))
  pg.locator('#insp [data-p=fadein]').click();pg.wait_for_timeout(100)
  check('fade-in preset',pg.evaluate('JSON.stringify(proj().layers[0].keys.o)')=='[[2000,0,"linear"],[2500,100,"linear"]]',pg.evaluate('JSON.stringify(proj().layers[0].keys.o)'))
  # drag a keyframe diamond in the timeline
  kf=pg.locator('#tlBody .kf').first;kb=kf.bounding_box();tr=pg.locator('#tlBody .tlrow .trk').first.bounding_box()
  t0=pg.evaluate('keyTimes(proj().layers[0])[0]')
  pg.mouse.move(kb['x']+kb['width']/2,kb['y']+kb['height']/2);pg.mouse.down();pg.mouse.move(kb['x']+kb['width']/2+tr['width']*0.1,kb['y']+kb['height']/2,steps=6);pg.mouse.up();pg.wait_for_timeout(150)
  t1=pg.evaluate('keyTimes(proj().layers[0])[0]')
  check('timeline key drag ~ +1 s',abs(t1-t0-1000)<=60,(t0,t1))
  # timeline bar: give the shape a time slot, then cross-dissolve
  pg.click('#tabs [data-t=layer]')
  si=pg.evaluate('proj().layers.findIndex(l=>l.type==="shape")');pg.evaluate(f'select({si});setLt(4000)')
  pg.locator('#insp [data-a=here]').click();pg.wait_for_timeout(100)
  pg.evaluate('select(0)');pg.evaluate('setLt(0)');pg.locator('#insp [data-a=here]').click();pg.wait_for_timeout(80)
  pg.evaluate(f'select({si})');pg.locator('#insp [data-a=xd]').click();pg.wait_for_timeout(100)
  L0=pg.evaluate('proj().layers[0]');Ls=pg.evaluate(f'proj().layers[{si}]')
  check('cross-dissolve overlap',L0['out']=='dissolve' and Ls['in']=='dissolve' and Ls['at']==L0['at']+L0['length']-Ls['tr'],(L0['at'],L0['length'],Ls['at'],Ls['tr']))
  # JSON export validates cleanly
  exp=pg.evaluate('JSON.stringify(validateProject(JSON.parse(JSON.stringify(cleanProject(proj())))))')
  r=json.loads(exp);check('own project validates',not r['E'] and not r['Wn'],r['E']+r['Wn'])
  # AI-style answer with fences, a bad field and a missing loop
  ans='Here you go:\n```json\n{"name":"TEST","layers":[{"type":"text","text":"HI","x":10,"y":10,"font":"comic","at":500,"in":"fade"},{"type":"blob"},{"type":"shape","kind":"ring","keys":{"dx":[[0,-30,"out"],[600,0]],"spin":[[0,1]]}}]}\n```\nEnjoy!'
  pg.click('#bImport');pg.fill('#iTxt',ans);pg.wait_for_timeout(150)
  msgs=pg.inner_text('#iMsg');check('import shows error for unknown type',"unknown type \"blob\"" in msgs);check('import warns font/in/loop/keys','comic' in msgs and 'fade' in msgs and 'loop set' in msgs and 'spin' in msgs,msgs.replace('\n',' | ')[:300])
  ans2=ans.replace(',{"type":"blob"}','');pg.fill('#iTxt',ans2);pg.wait_for_timeout(100);pg.locator('#mFoot button',has_text='Import as new').click();pg.wait_for_timeout(200)
  imp=pg.evaluate('proj()');check('imported as new',imp['name']=='TEST' and imp['loop']>=5000 and imp['layers'][0]['font']=='medium',(imp['loop'],imp['layers'][0].get('font')))
  # AI prompt
  pg.click('#bAI');pg.wait_for_timeout(100);ptxt=pg.input_value('#aiTxt');check('AI prompt',len(ptxt)>6000 and '"keys"' in ptxt and 'MY ANIMATION' in ptxt,len(ptxt));pg.keyboard.press('Escape')
  # GIF import over plain HTTP
  pg.click('#bMedia');pg.set_input_files('#aFile',os.path.join(ROOT,'test','fixtures','sample.gif'));pg.fill('#aW','48');pg.fill('#aH','40');pg.wait_for_timeout(1200)
  check('GIF import',' frames' in pg.inner_text('#aInfo'),pg.inner_text('#aInfo'));pg.locator('#mFoot button',has_text='Add layer').click();pg.wait_for_timeout(150)
  check('anim layer',pg.evaluate('proj().layers.some(l=>l.type==="anim"&&l.n>1)'))
  # convert text to bitmap
  ti=pg.evaluate('proj().layers.findIndex(l=>l.type==="text")');pg.evaluate(f'select({ti})');pg.evaluate('setLt(800)');pg.wait_for_timeout(80)
  pg.locator('#insp button',has_text='Convert to bitmap').click();pg.wait_for_timeout(100)
  check('text → bitmap keeps timing',pg.evaluate(f'(l=>l.type==="bitmap"&&l.at===500&&l.w>0)(proj().layers[{ti}])'))
  # send to the device
  pg.click('#bSend');pg.wait_for_timeout(800);pid=pg.evaluate('proj().id')
  sent=st['projects'].get(pid);check('sent to device',sent is not None and st['active']==pid and all('locked' not in l and not any(k.startswith('_') for k in l) for l in sent['layers']))
  # open a device project
  pg.keyboard.press('Control+o');pg.wait_for_timeout(400);pg.locator('#oDev .item',has_text='NEON//CLOCK').click();pg.wait_for_timeout(300)
  check('opened from device',pg.evaluate('proj().id')=='neon-clock')
  # live mirror
  pg.click('#bLive');pg.wait_for_timeout(700);check('live frames',st['frames']>3,st['frames']);pg.click('#bLive')
  # back to the title template for a screenshot
  pg.click('#pName');pg.click('#pMenu [data-a=new]');pg.locator('.tpl .card').nth(1).click();pg.wait_for_timeout(200)
  pg.evaluate('select(2);setPlaying(false);setLt(3100)');pg.click('#tabs [data-t=motion]');pg.wait_for_timeout(300)
  pg.evaluate('proj().layers[2]._exp=true;renderTL()');pg.wait_for_timeout(200)
  pg.screenshot(path='/tmp/b2.png')
  pg.set_viewport_size({'width':1280,'height':800});pg.wait_for_timeout(300);pg.screenshot(path='/tmp/b3.png')
  check('no page errors',not errs,errs)
  b.close()
print('ALL OK' if ok else 'SOME FAILED')
