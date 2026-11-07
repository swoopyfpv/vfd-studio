import json,threading,os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlparse,parse_qs
HTML=open(os.path.join(ROOT,'dist','vfd-studio.html'),'rb').read()
st={'fonts':{},'projects':{'neon-clock':{'id':'neon-clock','name':'NEON//CLOCK','layers':[]}},'active':'neon-clock','uploads':[]}
class H(BaseHTTPRequestHandler):
  def log_message(self,*a):pass
  def reply(self,code,obj=None,ctype='application/json',raw=None):
    self.send_response(code);self.send_header('Content-Type',ctype);self.end_headers()
    if raw is not None:self.wfile.write(raw)
    elif obj is not None:self.wfile.write(json.dumps(obj).encode())
  def body(self):return self.rfile.read(int(self.headers.get('Content-Length',0)))
  def do_GET(self):
    u=urlparse(self.path);q=parse_qs(u.query)
    if u.path=='/':return self.reply(200,raw=HTML,ctype='text/html')
    if u.path=='/api/info':return self.reply(200,{'name':'vfd','fw':'2.1.2','ip':'10.0.0.5','rssi':-50,'timeSynced':True,'active':st['active'],'playlist':[],'playSec':30,'projects':[{'id':k,'name':v.get('name','')} for k,v in st['projects'].items()]})
    if u.path=='/api/weather':return self.reply(200,{'ok':False})
    if u.path=='/api/system':return self.reply(200,{'fw':'2.2.0','chip':'ESP32-S3','cpuMHz':240,'load':18.4,'renderMs':6.1,'temp':47.3,'heapTotal':327680,'heapFree':201000,'heapMin':180000,'psramTotal':2097152,'psramFree':2000000,'fsTotal':917504,'fsUsed':131072,'appUsed':1290000,'appTotal':1572864,'rssi':-61,'ssid':'HomeNet','ip':'10.0.0.5','uptime':200000,'builder':st.get('builder') is not None})
    if u.path=='/api/fonts':return self.reply(200,[{'id':k,'name':v['name'],'h':v['h'],'v':v.get('v','')} for k,v in st['fonts'].items()])
    if u.path=='/api/font':return self.reply(200,st['fonts'][q['id'][0]])
    if u.path=='/api/project':return self.reply(200,st['projects'][q['id'][0]])
    self.reply(404,{})
  def do_POST(self):
    u=urlparse(self.path);q=parse_qs(u.query);b=self.body()
    if not self.headers.get('X-VFD'):st['denied']=st.get('denied',0)+1;return self.reply(403,{'ok':False,'error':'missing header X-VFD'})
    if u.path=='/api/project':st['projects'][q['id'][0]]=json.loads(b)
    elif u.path=='/api/active':st['active']=json.loads(b)['id']
    elif u.path=='/api/font':st['fonts'][q['id'][0]]=json.loads(b);st['uploads'].append(q['id'][0])
    elif u.path=='/api/builder':st['builder']=len(b)
    elif u.path=='/api/display/reinit':st['reinit']=st.get('reinit',0)+1
    self.reply(200,{'ok':True})
srv=ThreadingHTTPServer(('127.0.0.1',8098),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
  b=p.chromium.launch(args=['--host-resolver-rules=MAP vfd.test 127.0.0.1']);pg=b.new_page(viewport={'width':1500,'height':1100});errs=[]
  pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto('http://vfd.test:8098/');pg.wait_for_timeout(1500)
  print('secure context:',pg.evaluate('isSecureContext'),'| ImageDecoder:',pg.evaluate("typeof ImageDecoder"),'| auto-connected:',pg.inner_text('#devPill'))
  pg.click('#btnNew');pg.wait_for_timeout(200)
  pg.click('#btnAnimImport');pg.set_input_files('#aFile',os.path.join(ROOT,'test','fixtures','sample.gif'));pg.fill('#aW','60');pg.fill('#aH','40');pg.wait_for_timeout(1500);print('GIF over http:',pg.inner_text('#aInfo'))
  pg.locator('#mFoot button',has_text='Add layer').click();pg.wait_for_timeout(200)
  # text layer with a library font
  pg.select_option('#addType','text');pg.click('#btnAdd');pg.wait_for_timeout(200)
  pg.evaluate("FONTLIB['testfont']=JSON.parse(JSON.stringify(Object.values(FONTLIB)[0]||null))")
  hasfont=pg.evaluate("!!FONTLIB['testfont']")
  if not hasfont:
    print('no library font available in this origin, baking one');
  pg.evaluate("const L=proj().layers[proj().layers.length-1];L.font='testfont';save();")
  pg.click('#btnSend');pg.wait_for_timeout(1000);print('send 1 uploads:',st['uploads'])
  pg.click('#btnSend');pg.wait_for_timeout(1000);print('send 2 (unchanged) uploads:',st['uploads'])
  pg.evaluate("FONTLIB['testfont'].data=FONTLIB['testfont'].data.split('').reverse().join('');delete FONTLIB['testfont']._c;saveLib();")
  pg.click('#btnSend');pg.wait_for_timeout(1000);print('send 3 (font changed) uploads:',st['uploads'],'| device has new version:',st['fonts']['testfont']['data'][:12]==pg.evaluate("FONTLIB['testfont'].data.slice(0,12)"))
  sent=st['projects'][st['active']];print('sent project layers:',[l['type'] for l in sent['layers']],'anim frames:',[l.get('n') for l in sent['layers'] if l['type']=='anim'])
  pg.wait_for_timeout(3500);print('system cards:',pg.locator('.sys').count(),'|',pg.inner_text('#sysGrid').replace(chr(10),' ')[:160])
  print('preview SYS from device:',pg.evaluate('JSON.stringify(SYS)'))
  pg.click('#btnReinit');pg.wait_for_timeout(300);print('reinit calls',st.get('reinit'))
  open('/tmp/fake-builder.html','w').write('<!DOCTYPE html><title>b</title>'+'x'*5000)
  pg.click('#btnBuilderUp');pg.set_input_files('#buFile','/tmp/fake-builder.html');pg.locator('#mFoot button',has_text='Upload').click();pg.wait_for_timeout(1500)
  print('builder upload:',pg.inner_text('#buState'),'| bytes received',st.get('builder'));pg.wait_for_timeout(3500);print('open builder visible:',pg.is_visible('#btnBuilderOpen'))
  print('errors:',errs)
  b.close()
