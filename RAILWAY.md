# Tikoun sur Railway

`server.js` fait tout : il sert le site, **stocke les données de l'école** (classes, contrôles, notes, photos des copies) et relaie l'IA avec la clé gardée sur le serveur. Pas besoin de Supabase.

## 1. Ajouter un Volume (obligatoire pour garder les données)

Railway → ton service → **clic droit / menu « + » → Volume** (ou *Settings → Volumes → Add Volume*) → chemin de montage : **`/data`**.
Sans volume, les données sont effacées à chaque redéploiement (le site affiche alors « serveur ⚠ temporaire »).

## 2. Variables (Railway → service → Variables)

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | oui | Clé IA de l'école (avec limite de dépense sur console.anthropic.com) |
| `TIKOUN_CODE` | oui | Code d'accès de l'école, demandé une fois par appareil. Active le stockage sur le serveur |
| `AI_MAX_PER_DAY` | non (400) | Plafond d'appels IA par jour |
| `MODEL_QUICK`, `MODEL_DEFAULT`, `MODEL_COMPLEX` | non | Modèles (défaut économique : Haiku 4.5, Sonnet 5 pour la relecture précise) |

## 3. Vérifier

- `/health` affiche **ok**.
- Le site demande le code, puis affiche en haut à droite « IA ✓ · Données : serveur ✓ ».
- Logs Railway : « stockage serveur (volume /data) ».

## Sauvegardes

Onglet **Sauvegarde → Télécharger une sauvegarde** (toutes les données, sans les photos). À faire régulièrement, par exemple chaque fin de mois.
