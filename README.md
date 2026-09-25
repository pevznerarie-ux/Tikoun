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

- `index.html` : l'application complète (un seul fichier, aucune installation).
- `server.js`, `package.json`, `railway.json` : serveur pour Railway (variables SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY).
- `config.js` : branchement du stockage en ligne si le site est servi sans serveur (GitHub Pages).
- `supabase/` : schéma SQL et fonction serveur « ai ».
- `src/` : sources (`head.html`, `app.js`, `standalone.js`, `cloud.js`, `more.js`) ; `python3 build.py` régénère `index.html`.
- La même application fonctionne aussi comme artifact dans claude.ai (base de données, IA et stockage fournis par Claude).

Modèles IA par défaut (modifiables dans Réglages) : `claude-haiku-4-5-20251001` (rapide), `claude-sonnet-5` (standard), `claude-opus-5-5` (précis).
