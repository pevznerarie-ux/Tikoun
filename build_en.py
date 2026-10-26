# Génère les versions anglaises (US) : dist/index.en.html, dist/landing.en.html, dist/eleve.en.html
import subprocess, json, re, os
ACORN = os.environ.get("ACORN", os.path.join(os.path.dirname(os.path.abspath(__file__)), "node_modules", "acorn"))
NIV_US = '["6th grade","7th grade","8th grade","9th grade","10th grade","11th grade","12th grade"]'
MAT_SUGG_US = '["Talmud","Mishnah","Chumash","Navi","Halacha","Chassidus","Jewish Thought"]'
MAT_US = '["Math","English Language Arts","Science","Biology","Chemistry","Physics","History","Social Studies","Spanish","French","Hebrew","Computer Science","Economics","Art","Music"]'
missing = set()
for name in ["index", "landing", "eleve"]:
    src, out = f"dist/{name}.html", f"dist/{name}.en.html"
    subprocess.run(["node", "i18n/i18n.js", "apply", src, "i18n/en.json", out], check=True, env={**os.environ, "ACORN": ACORN})
    if os.path.exists(out + ".missing.json"):
        missing |= set(json.load(open(out + ".missing.json"))); os.remove(out + ".missing.json")
    s = open(out).read()
    s = s.replace('<html lang="fr">', '<html lang="en">').replace('"fr-FR"', '"en-US"')
    s = re.sub(r'const NIVEAUX = \[[^\]]*\];', 'const NIVEAUX = ' + NIV_US + ';', s)
    s = re.sub(r'const MATIERES = \[[^\]]*\];', 'const MATIERES = ' + MAT_US + ';', s)
    s = re.sub(r'const MAT_SUGG = \[[^\]]*\];', 'const MAT_SUGG = ' + MAT_SUGG_US + ';', s)
    s = s.replace('|| "3e"', '|| "8th grade"')
    s = s.replace('>Postal code<', '>ZIP code<').replace('>Code postal<', '>ZIP code<').replace('>Zip code<', '>ZIP code<')
    s = s.replace('<div class="grade">14<small>/20</small>', '<div class="grade">70<small>%</small>')
    open(out, "w").write(s)
json.dump(sorted(missing), open("i18n/missing.json", "w"), ensure_ascii=False, indent=1)
print("EN ok ·", len(missing), "texte(s) sans traduction (i18n/missing.json)")
