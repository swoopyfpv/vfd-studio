// Wi-Fi setup page served in access-point mode. Placeholders are filled in at runtime.
#pragma once
static const char SETUP_HTML[] = R"HTML(<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>VFD setup</title>
<style>body{margin:0;background:#06080b;color:#c9d4df;font:15px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:24px}
h1{font-size:20px;letter-spacing:.12em;color:#4dffd2;margin:0 0 4px}p{color:#6b7a8a;margin:0 0 20px}
label{display:block;color:#6b7a8a;font-size:12px;margin:14px 0 4px;letter-spacing:.1em;text-transform:uppercase}
select,input{width:100%;box-sizing:border-box;background:#0c1016;border:1px solid #26323f;color:#fff;padding:11px;border-radius:6px;font:inherit}
button{margin-top:22px;width:100%;padding:13px;background:#4dffd218;border:1px solid #4dffd2;color:#4dffd2;border-radius:6px;font:inherit;letter-spacing:.1em}
.box{max-width:420px;margin:0 auto}</style></head><body><div class="box">
<h1>VFD//SETUP</h1><p>Connect the display to your Wi-Fi.</p>%ERR%
<form method="POST" action="/wifi/save">
<label>Network</label><select name="ssid_sel" onchange="document.getElementById('s').value=this.value">%OPTIONS%</select>
<label>or type the network name</label><input id="s" name="ssid" autocomplete="off">
<label>Password</label><input name="pass" type="password" autocomplete="off">
<label>Device name</label><input name="name" value="%NAME%" pattern="[a-z0-9\-]{1,24}" title="lowercase letters, digits, dashes">
<label for="wifi_tx">Wi-Fi TX limit</label><select id="wifi_tx" name="wifi_tx"><option value="default">ESP32 default</option><option value="8.5" %LOW_TX_SELECTED%>8.5 dBm</option></select>
<button type="submit">CONNECT</button></form>
<p style="margin-top:20px">The display restarts and shows its address. Then open http://NAME.local in your browser.</p>
</div><script>var e=document.querySelector('select');if(e.options.length)document.getElementById('s').value=e.value;</script></body></html>)HTML";

static const char SAVED_HTML[] = R"HTML(<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{background:#06080b;color:#c9d4df;font:15px/1.5 ui-monospace,monospace;padding:24px}h1{color:#4dffd2;font-size:20px}</style></head>
<body><h1>SAVED</h1><p>The display restarts and connects to your Wi-Fi. Reconnect your phone or computer to your normal Wi-Fi, then open <b>http://%NAME%.local</b>.</p></body></html>)HTML";
