# Tikoun sur Railway

`server.js` fait tout : il sert le site, **stocke les données de l'école** (classes, contrôles, notes, photos des copies) et relaie l'IA avec la clé gardée sur le serveur. Pas besoin de Supabase.

## 1. Ajouter un Volume (obligatoire pour garder les données)

Railway → ton service → **clic droit / menu « + » → Volume** (ou *Settings → Volumes → Add Volume*) → chemin de montage : **`/data`**.
Sans volume, les données sont effacées à chaque redéploiement (le site affiche alors « serveur ⚠ temporaire »).

## 2. Variables (Railway → service → Variables)

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | oui | Clé IA de l'école (avec limite de dépense sur console.anthropic.com) |
| `TIKOUN_CODE` | oui | Code de l'établissement, demandé **une seule fois** pour créer le premier compte administrateur |
| `AI_MAX_PER_DAY` | non (400) | Plafond d'appels IA par jour |
| `MODEL_QUICK`, `MODEL_DEFAULT`, `MODEL_COMPLEX` | non | Modèles (défaut économique : Haiku 4.5, Sonnet 5 pour la relecture précise) |

## 3. Vérifier

- `/health` affiche **ok**.
- Au premier lancement, le site propose de créer le **compte administrateur** (avec TIKOUN_CODE). Ensuite : onglet **Comptes** pour ajouter chaque professeur (e-mail + mot de passe provisoire).
- Logs Railway : « stockage serveur (volume /data) ».

## Sauvegardes

Onglet **Sauvegarde → Télécharger une sauvegarde** (toutes les données, sans les photos). À faire régulièrement, par exemple chaque fin de mois.

## Comptes

- **Administrateur** (direction) : voit tous les contrôles (« Toute l'école »), la vue Direction, crée et désactive les comptes, réinitialise les mots de passe.
- **Professeur** : retrouve ses contrôles, cours, copies et résultats ; les classes et élèves sont communs à l'établissement ; la Banque montre les contrôles de tous pour les réutiliser.
- Un professeur ne peut pas modifier les contrôles d'un autre.

## Abonnements et option Exercices

| Abonnement | Contenu |
|---|---|
| **Essentiel** | Contrôles (création IA, QR, scan, correction, vue classe, suivi) **+ rattrapages** |
| **Pro** | Tout Essentiel + possibilité d'activer l'**option Exercices** |

**Rattrapages (inclus pour tous)** : uniquement élève par élève, pour un élève **sous 10/20** dont la copie est corrigée.
Un seul rattrapage par élève et par contrôle ; pas de génération pour toute la classe d'un coup.

**Option Exercices** (Pro + case cochée dans *Comptes*) : feuilles d'exercices d'entraînement générées depuis un cours
pour la classe, avec bouton **↻ Régénérer les exercices**. Elles s'impriment avec QR code et se scannent/corrigent
comme un contrôle, mais ne comptent pas dans les moyennes. Sans l'option : cadenas 🔒 et refus côté serveur.
