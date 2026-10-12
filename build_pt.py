# Génère les versions portugaises (Brésil) : dist/index.pt.html, dist/landing.pt.html, dist/eleve.pt.html
import subprocess, json, re, os
ACORN = os.environ.get("ACORN", "/tmp/claude-0/libs/node_modules/acorn")
NIV_BR = '["6º ano","7º ano","8º ano","9º ano","1º ano EM","2º ano EM","3º ano EM"]'
MAT_SUGG_BR = '["Guemará","Mishná","Chumash","Neviim","Halachá","Chassidut","Pensamento judaico"]'
MAT_BR = '["Matemática","Língua Portuguesa","Ciências","Biologia","Química","Física","História","Geografia","Inglês","Espanhol","Hebraico","Filosofia","Sociologia","Artes","Educação Física"]'
missing = set()
for name in ["index", "landing", "eleve"]:
    src, out = f"dist/{name}.html", f"dist/{name}.pt.html"
    subprocess.run(["node", "i18n/i18n.js", "apply", src, "i18n/pt.json", out], check=True, env={**os.environ, "ACORN": ACORN}, stdout=subprocess.DEVNULL)
    if os.path.exists(out + ".missing.json"):
        missing |= set(json.load(open(out + ".missing.json"))); os.remove(out + ".missing.json")
    s = open(out).read()
    s = s.replace('<html lang="fr">', '<html lang="pt-BR">').replace('"fr-FR"', '"pt-BR"')
    s = re.sub(r'const NIVEAUX = \[[^\]]*\];', 'const NIVEAUX = ' + NIV_BR + ';', s)
    s = re.sub(r'const MATIERES = \[[^\]]*\];', 'const MATIERES = ' + MAT_BR + ';', s)
    s = re.sub(r'const MAT_SUGG = \[[^\]]*\];', 'const MAT_SUGG = ' + MAT_SUGG_BR + ';', s)
    s = s.replace('|| "3e"', '|| "9º ano"')
    s = s.replace('<div class="grade">14<small>/20</small><svg', '<div class="grade">7<small>/10</small><svg')
    open(out, "w").write(s)
json.dump(sorted(missing), open("i18n/missing_pt.json", "w"), ensure_ascii=False, indent=1)
print("PT ok ·", len(missing), "texte(s) sans traduction (i18n/missing_pt.json)")
