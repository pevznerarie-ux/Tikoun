a=open('src/app.js').read(); m=open('src/more.js').read()+'\n'+open('src/quiz.js').read()+'\n'+open('src/training.js').read()+'\n'+open('src/devices.js').read(); sa=open('src/standalone.js').read(); cl=open('src/cloud.js').read(); nv=open('src/nav.js').read(); ac=open('src/accounts.js').read(); h=open('src/head.html').read()
i=a.index('/* ================= Boot'); js=a[:i]+sa+'\n'+cl+'\n'+nv+'\n'+ac+'\n'+m+'\n'+a[i:]
open('all.js','w').write(js)
open('tikoun.html','w').write(h+'<script>\n'+js+'\n</script>\n')
k=h.index('<div class="top">'); headpart=h[:k].replace('<script src="https://cdn.jsdelivr.net/npm/qrcode-generator','<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.js"></script>\n<script src="config.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/qrcode-generator',1); bodypart=h[k:]
import os; os.makedirs('dist',exist_ok=True)
open('dist/index.html','w').write('<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  +headpart.replace('<style>','<style>\nhtml,body{margin:0}[hidden]{display:none!important}img{max-width:100%}\n:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n',1)
  +'</head>\n<body>\n'+bodypart+'<script>\n'+js+'\n</script>\n</body>\n</html>\n')
# Version anglaise (US) : nécessite node + acorn
try:
    import subprocess; subprocess.run(["python3", "build_en.py"], check=True); subprocess.run(["python3", "build_pt.py"], check=True)
except Exception as e:
    print("EN non générée :", e)
# Moteur d'analyse côté serveur : mêmes fonctions de lecture que l'application
import re as _re
_L = a.split('\n'); _names = ['scaled','crop','flatten','jsqrOn','centre','detectAll','readQR','blobMarkers','markersOk','levD','closest','solve','homography','applyH','sheetToPhoto','warpBox','maskHeader','maskTop','inkRatio','pix','readMarks','boxScore']
_starts = {}
for _i, _l in enumerate(_L):
    _m = _re.match(r'^(?:async )?function (\w+)\(|^const (\w+) = ', _l)
    if _m:
        _n = _m.group(1) or _m.group(2)
        if _n in _names and _n not in _starts: _starts[_n] = _i
_stop = _re.compile(r'^(function |async function |const |let |/\*|document\.|setInterval|S\.)'); _parts = []
for _n in _names:
    _i = _starts[_n]; _j = _i + 1
    while _j < len(_L) and not _stop.match(_L[_j]): _j += 1
    _parts.append('\n'.join(_L[_i:_j]))
open('dist/scan-engine.js', 'w').write(open('src/engine_head.js').read() + '\n'.join(_parts) + '\n' + open('src/engine_main.js').read())
print("scan-engine.js ok")
