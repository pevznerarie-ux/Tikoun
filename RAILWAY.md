# Tikoun sur Railway

Le site tourne avec un petit serveur Node (`server.js`, sans dépendance). Railway le lance automatiquement grâce à `package.json` et `railway.json`.

## Mettre à jour le dépôt

Remplacer **tous** les fichiers du dépôt GitHub par ceux du zip (surtout `server.js`, `package.json`, `railway.json`, `index.html`). Railway redéploie tout seul après chaque commit.

## Vérifier

- `https://<ton-domaine>.up.railway.app/health` doit afficher **ok**.
- La page d'accueil affiche l'application.
- Si « 404 » : Railway → service → **Settings → Networking** : le domaine doit pointer vers le port indiqué dans les logs (« Tikoun en ligne sur le port … »), en général 8080. Sinon **Deployments → View logs** et m'envoyer une capture.

## Variables (Railway → service → Variables)

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL` | URL du projet Supabase (voir SUPABASE.md, étapes 1 à 3) |
| `SUPABASE_ANON_KEY` | Clé publique *publishable / anon* |
| `ANTHROPIC_API_KEY` | Clé IA de l'école (avec limite de dépense) : gardée sur le serveur |

- Sans variables : mode local (données dans chaque navigateur, clé IA dans Réglages).
- Avec les 3 : stockage en ligne partagé, connexion des professeurs, IA via le serveur. **Pas besoin** de remplir `config.js` ni de déployer la fonction Supabase « ai » (étape 4 de SUPABASE.md) : Railway fait le relais.
