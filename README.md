# Mastery — contrôles, copies et rattrapage

Plateforme pour les professeurs : création de contrôles par l'IA, feuilles avec QR code, scan et correction des copies, rattrapages.
Du cours au rattrapage : l'IA prépare et corrige, le professeur décide.

## Ce que fait l'application

1. **Cours** : import PDF / photos / texte.
2. **Contrôle** : généré par l'IA en 3 niveaux (socle, standard, approfondi), modifiable (questions, barème, QCM, mise en page, bonus propreté / orthographe).
3. **Feuilles** : un PDF par élève, avec 4 QR codes (identification + redressement de la photo).
4. **Scan** : photo ou PDF de copieur. Chaque cadre est découpé et lu par l'IA ; les QCM sont corrigés sans IA.
5. **Correction** : note, commentaire, erreurs soulignées, maths en formules, validation par le professeur, relecture précise si besoin.
6. **Classe** : réussite par question, erreurs fréquentes, synthèse, rattrapages individuels.
7. **Suivi élèves** (maîtrise par notion, appréciation de bulletin), **Banque**, **Direction**, **Fiche d'écriture**, **Copies rendues** en PDF.

## Mettre en ligne sur GitHub Pages (5 minutes)

1. Dans ce dépôt : **Settings → Pages**.
2. *Source* : **Deploy from a branch** · Branche : **main** · Dossier : **/ (root)** → **Save**.
3. Après 1 à 2 minutes, l'adresse s'affiche : `https://pevznerarie-ux.github.io/Mastery/`.

> Le dépôt doit être **public** pour GitHub Pages gratuit. Le code ne contient aucune donnée ni clé.

## Hébergement sur Railway

Voir **[RAILWAY.md](RAILWAY.md)** : `server.js` sert le site, fournit la configuration et relaie l'IA (clé gardée sur le serveur).

## Deux façons de stocker les données

| Mode | Données | IA | Mise en place |
| --- | --- | --- | --- |
| **Local** (par défaut) | Dans le navigateur de chaque appareil | Clé API collée dans Réglages | Aucune |
| **En ligne** (recommandé pour l'école) | Base Supabase à Paris, partagée par tous les profs, avec comptes | Clé gardée sur le serveur | 20 min, une fois : voir **[SUPABASE.md](SUPABASE.md)** |

### Mode local : première utilisation

1. Ouvrir le site → onglet **Réglages** → coller une **clé API Anthropic** (avec une limite de dépense) → **Tester la clé**.
2. Accueil → **Charger une classe de démonstration**.
3. Exporter régulièrement une **sauvegarde** (Réglages) : vider le navigateur efface tout.

### Mode en ligne

Suivre **SUPABASE.md**, puis remplir `config.js`. Le site affiche alors un écran de connexion ; chaque professeur a son compte.

## Développement

Les sources sont à la racine du dépôt ; les pages publiées (`index*.html`, `eleve.en/pt.html`, `landing.en/pt.html`, `scan-engine.js`) sont **générées** : ne les modifie pas à la main.

- Application : `head.html` (styles, balisage), `app.js`, `standalone.js`, `cloud.js`, `nav.js`, `accounts.js`, `more.js`, `quiz.js`, `training.js`, `devices.js`.
- Espace élève : `eleve.html` · page d'accueil : `landing.html` · pages légales : `cgu*.html`, `confidentialite*.html`, `mentions-legales*.html`.
- Traductions : `en.json`, `pt.json` (clé = texte français exact), appliquées par `i18n.js`.
- Serveur : `server.js` (comptes, données, IA, paiement), `engine_head.js` + `engine_main.js` (analyse des dépôts sur le serveur).

Reconstruire après une modification :

```
npm ci                 # dépendances du serveur (PDF.js, canvas, jsQR)
npm install --no-save acorn
python3 build.py       # régénère index.html, les versions EN / PT et scan-engine.js
```

`missing.json` et `missing_pt.json` listent les textes français sans traduction.

Lancer en local : `DATA_DIR=./data MASTERY_CODE=test node server.js`, puis ouvrir http://localhost:3000/app.

Modèles IA par défaut (variables `MODEL_QUICK`, `MODEL_DEFAULT`, `MODEL_COMPLEX`) : `claude-haiku-4-5-20251001` pour les tâches rapides, `claude-sonnet-5` pour la rédaction des contrôles et la lecture des copies (`GEN_TIER`, `GRADE_TIER`).
