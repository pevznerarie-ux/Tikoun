# Stockage en ligne de Tikoun (Supabase) — guide pas à pas

Sans cette étape, chaque navigateur garde ses propres données. Avec, **tous les professeurs partagent les mêmes classes, contrôles, notes et photos**, depuis n'importe quel appareil, et la clé IA reste sur le serveur.

Supabase fournit la base de données (PostgreSQL), le stockage des photos, les comptes des professeurs et une petite fonction serveur pour l'IA. On choisit la région **Paris** : les données restent en France.

Durée : environ 20 minutes, une seule fois, depuis un ordinateur.

---

## 1. Créer le projet (5 min)

1. Aller sur **supabase.com** → *Start your project* → créer un compte (idéalement avec l'adresse de l'établissement).
2. **New project** :
   - Name : `tikoun`
   - Database password : un mot de passe fort (à garder)
   - Region : **West EU (Paris)**
   - Plan : **Free** pour le pilote
3. Attendre 1 à 2 minutes que le projet soit prêt.

## 2. Créer les tables (2 min)

1. Menu de gauche → **SQL Editor** → *New query*.
2. Copier tout le contenu du fichier `supabase/schema.sql` du dépôt, le coller, cliquer **Run**.
3. Le message « Success » doit s'afficher. (On peut relancer ce script sans risque.)

## 3. Comptes des professeurs (5 min)

1. **Authentication → Sign In / Providers** : laisser *Email* activé, **désactiver « Allow new users to sign up »** (personne ne peut créer de compte seul).
2. **Authentication → URL Configuration** → *Site URL* : `https://pevznerarie-ux.github.io/Tikoun/`
3. **Authentication → Users → Add user** : créer un compte par professeur (e-mail + mot de passe, cocher *Auto confirm*), ou *Invite user* pour qu'il choisisse son mot de passe.

## 4. L'IA côté serveur (5 min) — la clé ne sera plus dans les navigateurs

1. Sur **console.anthropic.com** (compte de l'établissement) : créer une clé API et **fixer une limite de dépense mensuelle**.
2. Dans Supabase : **Edge Functions → Secrets** → ajouter `ANTHROPIC_API_KEY` = la clé.
3. **Edge Functions → Deploy a new function → Via editor** :
   - Nom : `ai` (exactement)
   - Coller le contenu de `supabase/functions/ai/index.ts` → **Deploy**.

## 5. Brancher le site (2 min)

1. Supabase : **Project Settings → API Keys** : copier l'**URL du projet** et la **clé publique** (*publishable* ou *anon*). Ne jamais utiliser la clé *secret / service_role*.
2. Sur GitHub, ouvrir `config.js` → crayon ✏️ → remplir :
   ```js
   window.TIKOUN_CONFIG = {
     supabaseUrl: "https://xxxx.supabase.co",
     supabaseAnonKey: "sb_publishable_…",
     aiProxy: true
   };
   ```
   → **Commit changes**. Le site se met à jour en 1 à 2 minutes.
3. Ouvrir le site : l'écran **Connexion** apparaît. Se connecter avec un compte professeur.
4. En haut à droite : « IA ✓ · Données : en ligne ✓ ».

Si des données avaient déjà été saisies en mode local sur un appareil : **Réglages → Transférer les données de cet appareil en ligne**.

---

## Bon à savoir

- **Coût** : plan gratuit suffisant pour le pilote (500 Mo de base, 1 Go de photos). Un projet gratuit se met **en pause après une semaine sans activité** (on le relance d'un clic dans Supabase). Pour l'usage quotidien de l'école : plan Pro, 25 $/mois (8 Go de base, 100 Go de photos). Tarifs à jour : supabase.com/pricing.
- **IA** : facturée à l'usage sur le compte Anthropic de l'école ; la limite de dépense protège le budget.
- **Sécurité** : seuls les professeurs connectés lisent ou écrivent les données et les photos (règles dans `schema.sql`). La clé publique dans `config.js` ne donne accès à rien sans compte.
- **Sauvegardes** : Supabase fait des sauvegardes quotidiennes sur le plan Pro. En plan gratuit, exporter régulièrement depuis Supabase (*Database → Backups* ou export SQL).
- **RGPD** : données en France (Paris). Faire valider par le DPO du réseau, informer les familles, signer les conditions de traitement de Supabase et d'Anthropic.
