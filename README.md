# Mastery — contrôles, copies et rattrapage

Plateforme pour les professeurs : création de contrôles par l'IA, feuilles avec QR code, scan et correction des copies, rattrapages.
Du cours au rattrapage : l'IA prépare et corrige, le professeur décide.

## Ce que fait l'application

1. **Cours** : import PDF / photos / texte.
2. **Contrôle** : généré par l'IA en 3 niveaux (socle, standard, approfondi), modifiable (questions, barème, QCM, mise en page, bonus propreté / orthographe). Le professeur peut d'abord approuver un **plan** (une ligne par question : notion, type, compétence, points). Après la rédaction, le contrôle est vérifié automatiquement (total des points, versions, QCM, sujets couverts) ; ce qui reste à voir s'affiche dans « À vérifier ».
3. **Feuilles** : un PDF par élève, avec 4 QR codes (identification + redressement de la photo).
4. **Scan** : photo ou PDF de copieur. Chaque cadre est découpé et lu par l'IA ; les QCM sont corrigés sans IA.
5. **Correction** : note, commentaire, erreurs soulignées, maths en formules, validation par le professeur, relecture précise si besoin. Chaque réponse reçoit un niveau de doute (lecture devinée, passage illisible, détail des points incohérent…) : les réponses douteuses sont relues automatiquement, puis présentées en premier dans l'onglet « À vérifier ». Un journal de validation garde, par contrôle, la note proposée par l'IA, la note retenue, qui a validé et quand (export CSV depuis la correction).
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
- Partagé par le serveur et l'application : `fiabilite.js` (niveau de doute d'une réponse, journal de validation, vérification d'un contrôle généré, plan). Fonctions pures, incluses dans la page par `build.py`.

Reconstruire après une modification :

```
npm ci                 # dépendances du serveur (PDF.js, canvas, jsQR)
npm install --no-save acorn
python3 build.py       # régénère index.html, les versions EN / PT et scan-engine.js
```

`missing.json` et `missing_pt.json` listent les textes français sans traduction.

Tests : `npm test` (dossier `test/`). `fiabilite.test.js` couvre le calcul des doutes, le journal et le barème ; `serveur.test.js` lance le serveur avec un faux service IA et vérifie la correction d'une page, la relecture des réponses douteuses, le journal et la génération. À lancer avant chaque mise en ligne.

Lancer en local : `DATA_DIR=./data MASTERY_CODE=test node server.js`, puis ouvrir http://localhost:3000/app.

Relecture automatique des réponses douteuses : `AI_REREAD=0` la désactive, `AI_REREAD_MAX` fixe le nombre de relectures par page (3 par défaut). Le journal de validation est écrit dans `DATA_DIR/journal` et fait partie des sauvegardes quotidiennes.

Modèles IA par défaut (variables `MODEL_QUICK`, `MODEL_DEFAULT`, `MODEL_COMPLEX`) : `claude-haiku-4-5-20251001` pour les tâches rapides, `claude-sonnet-5` pour la rédaction des contrôles et la lecture des copies (`GEN_TIER`, `GRADE_TIER`).

Correction économique (facultative) : `MODEL_GRADE` choisit un modèle moins cher pour la première lecture des copies (par défaut, le même que `MODEL_COMPLEX`). Quand il diffère, le modèle précis sert de renfort : il relit seul les réponses « à vérifier d'abord » et celles qui contiennent de l'hébreu manuscrit, et sa lecture devient la proposition (l'autre reste affichée à côté si elles diffèrent). Si l'élève a rempli sa **fiche d'écriture**, ses échantillons de la même matière accompagnent chaque relecture.

Sévérité de la notation : chaque professeur choisit dans Mon compte → IA et correction entre « bienveillante » (par défaut : l'idée compte, pas la formulation) et « exigeante ».
