a=open('src/app.js').read(); m=open('src/more.js').read(); sa=open('src/standalone.js').read(); cl=open('src/cloud.js').read(); h=open('src/head.html').read()
i=a.index('/* ================= Boot'); js=a[:i]+sa+'\n'+cl+'\n'+m+'\n'+a[i:]
k=h.index('<div class="top">'); headpart=h[:k].replace('<script src="https://cdn.jsdelivr.net/npm/qrcode-generator','<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.js"></script>\n<script src="config.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/qrcode-generator',1); bodypart=h[k:]
open('index.html','w').write('<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  +headpart.replace('<style>','<style>\nhtml,body{margin:0}[hidden]{display:none!important}img{max-width:100%}\n:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n',1)
  +'</head>\n<body>\n'+bodypart+'<script>\n'+js+'\n</script>\n</body>\n</html>\n')
