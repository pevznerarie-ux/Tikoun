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

## Hébreu

- Cours : texte collé, PDF ou photos. Un PDF en hébreu est remis à l'endroit automatiquement (lignes « à l'envers »
  corrigées) ; bouton **« Relire le PDF avec l'IA »** si le texte reste mélangé. Photos : lues par l'IA en caractères hébreux, avec nikoud.
- **Langue du contrôle / du quiz** : Français, Hébreu, Hébreu et français, Anglais (proposée automatiquement selon le cours).
- Affichage de droite à gauche automatique (écran, feuilles imprimées, espace élève) ; polices Noto Sans Hebrew et Frank Ruhl Libre.
- Copies manuscrites en hébreu (écriture cursive) : l'IA est prévenue et transcrit en caractères hébreux.

## Pages légales, confidentialité et sauvegardes

Variables à ajouter (Railway → service → Variables) :

| Variable | Exemple | Rôle |
|---|---|---|
| `LEGAL_NAME` | `Mastery SAS` (ou ton nom en entreprise individuelle) | Éditeur affiché dans les CGU et la politique de confidentialité |
| `LEGAL_ADDRESS` | `12 rue …, 92300 Levallois-Perret` | Adresse de l'éditeur (obligatoire en France) |
| `LEGAL_EMAIL` | `contact@…` | E-mail de contact RGPD |
| `LEGAL_HOST` | *(facultatif)* | Hébergeur, par défaut Railway Corporation |
| `BACKUP_KEEP` | `14` *(facultatif)* | Nombre de sauvegardes quotidiennes gardées |

- Pages : `/cgu` et `/confidentialite` (en anglais automatiquement si la langue est EN ; alias `/terms` et `/privacy`).
- Sauvegardes : une copie complète par jour dans `/data/backups`, visible et téléchargeable par l'admin dans l'onglet Sauvegarde.
  Elles sont sur le même Volume : télécharge-en une de temps en temps sur ton ordinateur.
- Région : pour le RGPD, choisis la région **EU West (Amsterdam)** dans Railway → service → Settings → Region.
- IA : le nom des élèves est retiré des textes et l'en-tête des copies est masqué avant tout envoi à l'IA.

## Paiement (Stripe) : essai gratuit, abonnements, parrainage, forfait établissement

Tant que `STRIPE_SECRET_KEY` n'est pas défini, Mastery reste en **bêta gratuite** (rien ne change).
Pour ouvrir le paiement :

1. Crée un compte sur stripe.com (commence en **mode test**).
2. Produits → crée les prix **récurrents** :
   - Essentiel : 12 €/mois et 99 €/an
   - Pro : 19 €/mois et 159 €/an
   - Établissement : prix **par élève** (quantité = nombre d'élèves), par mois ou par an
   - (facultatif) Prof payé par l'établissement : prix par professeur ; sinon le Pro mensuel est utilisé
3. Développeurs → Webhooks → ajoute l'URL `https://TON-DOMAINE/api/stripe/webhook` avec les événements
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`.
4. Paramètres → Portail client : active-le (changer de carte, factures, résiliation).
5. Variables Railway :

| Variable | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` puis `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (page du webhook) |
| `STRIPE_PRICE_ESSENTIEL_MOIS`, `STRIPE_PRICE_ESSENTIEL_AN` | `price_…` |
| `STRIPE_PRICE_PRO_MOIS`, `STRIPE_PRICE_PRO_AN` | `price_…` |
| `STRIPE_PRICE_ECOLE` | `price_…` (par élève) |
| `STRIPE_PRICE_PROF_ECOLE` | facultatif |
| `TRIAL_DAYS` | facultatif, 30 par défaut |
| `PRICE_LABEL_ESSENTIEL`, `PRICE_LABEL_PRO`, `PRICE_LABEL_ESSENTIEL_AN`, `PRICE_LABEL_PRO_AN`, `PRICE_LABEL_ECOLE` (+ `_EN`) | textes affichés, ex. `12 €/mois` |

Règles appliquées :
- Chaque prof inscrit seul a **30 jours d'essai** avec tout le Pro, sans carte. Venu par un lien de parrainage : **60 jours**.
- Essai fini sans abonnement : ses données restent consultables, mais il ne peut plus créer, scanner ni utiliser l'IA.
- S'il s'abonne pendant l'essai, le premier paiement a lieu à la fin de l'essai.
- Parrainage : quand le filleul paie sa première facture, le parrain gagne 1 mois (crédit sur sa prochaine facture, ou essai prolongé), 12 mois max par an.
- Établissement : la direction crée le forfait dans Mon compte, donne le code aux profs, paie par élève. Option « payer le Pro de tous les profs » : leurs abonnements perso s'arrêtent à la fin de la période.
- Les comptes créés par l'administrateur (ton école) restent inclus, sans paiement.
- Dans Comptes, le bouton « +1 mois » prolonge l'essai d'un prof.

## Langues et barèmes

- Le site existe en **français**, **anglais (US)** et **portugais (Brésil)**. La langue suit le navigateur ; liens FR · EN · PT en haut de page (`?lang=pt`).
- Chaque prof choisit dans Mon compte comment ses notes s'affichent : sur 20 (France), sur 10 (Brésil), en pourcentage ou en lettres A–F (États-Unis). Par défaut : sur 20 en français, sur 10 en portugais, A–F en anglais.
- Prix affichés en portugais : variables `PRICE_LABEL_*_PT` (par défaut en dollars US). Pour faire payer en réais, ajoute une devise BRL aux prix Stripe (« currency options »).
