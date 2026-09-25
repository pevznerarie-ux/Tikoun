# Mastery sur Railway

`server.js` fait tout : il sert le site, **stocke les données de l'école** (classes, contrôles, notes, photos des copies) et relaie l'IA avec la clé gardée sur le serveur. Pas besoin de Supabase.

## 1. Ajouter un Volume (obligatoire pour garder les données)

Railway → ton service → **clic droit / menu « + » → Volume** (ou *Settings → Volumes → Add Volume*) → chemin de montage : **`/data`**.
Sans volume, les données sont effacées à chaque redéploiement (le site affiche alors « serveur ⚠ temporaire »).

## 2. Variables (Railway → service → Variables)

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | oui | Clé IA de l'école (avec limite de dépense sur console.anthropic.com) |
| `MASTERY_CODE` | oui | Code de l'établissement, demandé **une seule fois** pour créer le premier compte administrateur |
| `AI_MAX_PER_DAY` | non (400) | Plafond d'appels IA par jour |
| `MODEL_QUICK`, `MODEL_DEFAULT`, `MODEL_COMPLEX` | non | Modèles (défaut économique : Haiku 4.5, Sonnet 5 pour la relecture précise) |

## 3. Vérifier

- `/health` affiche **ok**.
- Au premier lancement, le site propose de créer le **compte administrateur** (avec MASTERY_CODE). Ensuite : onglet **Comptes** pour ajouter chaque professeur (e-mail + mot de passe provisoire).
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

## Inscription des professeurs et établissements

- Sur la page de connexion, **« Créer mon compte professeur »** : nom, e-mail, mot de passe, puis l'établissement.
- L'établissement se cherche dans l'**annuaire officiel de l'Éducation nationale** (data.education.gouv.fr, données
  ouvertes, sans clé) par nom et code postal. Le serveur revérifie l'identifiant officiel (UAI) : l'école est marquée **✓ vérifiée**.
- École absente de l'annuaire : saisie manuelle (nom, adresse, code postal, ville), marquée **non vérifiée** ; le compte fonctionne quand même.
- Chaque prof inscrit seul a un **espace privé** (ses classes, élèves, contrôles). Les comptes créés par l'administrateur
  dans *Comptes* partagent les classes de l'administrateur.
- **En-tête des feuilles** : chaque prof choisit dans *Mon compte* « École et mon nom », « École seulement » ou
  « Mon nom seulement » (modifiable aussi contrôle par contrôle dans *Mise en page*).
- Nouvelles variables : `SIGNUP=off` ferme l'inscription libre ; `AI_MAX_PER_USER_DAY` (défaut 80) limite les appels IA par prof et par jour.

## Page d'accueil, forfaits et validation des inscriptions

- `https://ton-site/` : **page de présentation** pour les visiteurs (les profs connectés arrivent directement dans l'application).
- `https://ton-site/app` : l'application (connexion / inscription).
- À l'inscription, le prof choisit **Essentiel** ou **Pro** : pendant la **bêta, c'est gratuit**, aucun paiement.
- Chaque inscription est **en attente** jusqu'à validation par un administrateur Mastery : onglet **Comptes → Inscriptions à valider**
  (Valider / Refuser). En validant, le forfait demandé est appliqué (Pro = option Exercices activée).

## Exercices en ligne (forfait Pro)

- Onglet **Exercices** : le prof crée un **quiz** à partir d'un cours (banque de 20 à 50 questions générée une seule fois par l'IA).
- Types : QCM, vrai/faux, réponse numérique, texte à trous (corrigés automatiquement, sans IA) et réponses rédigées
  (proposées **uniquement sur ordinateur**, corrigées ensuite par le prof ou par l'IA à sa demande).
- Chaque tentative tire des questions au hasard ; après une erreur, l'élève reçoit une autre question sur la même notion.
  Une notion est **acquise** après 3 bonnes réponses d'affilée. Le prof choisit la date limite, ou clôt le quiz quand il veut.
- **Accès élève** : `https://ton-site/eleve` avec un **code personnel** (sans e-mail). Codes et cartes à imprimer (avec QR) :
  onglet **Classes → Codes élèves**.
- Résultats : par élève (tentatives, questions vues, réussite, notions acquises, temps) et par question ; aussi dans **Suivi élèves**.

## ⚠️ Garder les données entre deux mises à jour (Volume)

Sans Volume, **chaque mise à jour efface tout** (comptes, classes, contrôles) : c'est pour ça que l'administrateur
était à recréer. Le haut du site affiche alors « mémoire temporaire ».

1. Railway → ton projet → clic droit sur le service (ou **+ New → Volume**) → **Attach volume**.
2. **Mount path** : `/data` → Create. Railway redéploie tout seul.
3. Vérifie : `https://ton-site/config.js` doit contenir `"persistent":true`.

Sécurité en plus (facultatif) : variables `ADMIN_EMAIL` et `ADMIN_PASSWORD` → si aucun compte n'existe au démarrage,
l'administrateur est recréé automatiquement.

## Anglais (US)

- Le site existe en français et en anglais américain : `?lang=en` / `?lang=fr` (lien « EN / FR » sur la page d'accueil,
  l'espace élève, la page de connexion et *Mon compte*). Sans choix, la langue du navigateur est utilisée.
- En anglais : l'IA rédige contrôles, quiz et corrections en anglais ; niveaux 6th–12th grade ; l'école est saisie
  manuellement (pas d'annuaire officiel) et marquée « non vérifiée ».
- Fichiers : `index.en.html`, `landing.en.html`, `eleve.en.html` (générés à partir des versions françaises).
