# Tikoun sur Railway

`server.js` sert le site et relaie l'IA avec la clé de l'école, gardée sur le serveur : aucune clé dans les navigateurs, aucun réglage à faire côté professeur.

## Variables (Railway → service → Variables)

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | oui | Clé IA de l'école (fixer une limite de dépense sur console.anthropic.com) |
| `TIKOUN_CODE` | fortement conseillé | Code d'accès demandé une fois par appareil. Sans lui, n'importe qui ayant l'adresse peut utiliser l'IA à vos frais |
| `AI_MAX_PER_DAY` | non (défaut 400) | Plafond d'appels IA par jour |
| `MODEL_QUICK`, `MODEL_DEFAULT`, `MODEL_COMPLEX` | non | Modèles. Défaut économique : Haiku 4.5 partout, Sonnet 5 seulement pour la « relecture précise » |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | non | Stockage en ligne partagé avec comptes professeurs (voir SUPABASE.md, étapes 1 à 3). Remplace le code d'accès |

Après modification des variables, Railway redémarre tout seul.

## Vérifier

- `/health` affiche **ok**.
- En haut à droite du site : « IA ✓ ».
- Railway → **Deployments → View logs** : chaque appel IA affiche le modèle et les jetons consommés.
