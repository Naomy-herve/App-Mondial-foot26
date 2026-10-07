# FOOT26 2.0 — Championnat de football

Version renforcée et préparée pour **Supabase + Vercel + Android (Capacitor)**.

## Ce qui est corrigé

- `Cannot GET /` corrigé avec fallback SPA placé après l'API.
- Node 24 ciblé pour les nouveaux déploiements Vercel.
- Authentification Supabase côté serveur avec renouvellement de session.
- Clé `SUPABASE_SERVICE_ROLE_KEY` jamais envoyée au navigateur.
- Validation serveur des UUID, nombres, dates, scores et rôles.
- Classement calculé automatiquement depuis les résultats terminés.
- Meilleurs buteurs, cartons et apparitions dérivés des événements réels.
- Contrôle SQL : un but/carton ne peut pas être attribué à une équipe/joueur incohérent.
- CRUD équipes, joueurs, entraîneurs, arbitres, stades et matchs.
- Gestion des buts et cartons.
- Notifications administrateur.
- Rafraîchissement automatique du JWT avec refresh token.
- Préparation Android avec Capacitor 8.
- Aucun `.env`, token, mot de passe ou keystore dans Git.

## 1. Supabase

Sur un **projet Supabase neuf**, exécutez entièrement `database/schema.sql` dans SQL Editor.

Ensuite récupérez :

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

La service role key est secrète : elle va uniquement dans les variables serveur/Vercel.

Créez un compte dans FOOT26, puis dans `profiles`, passez son `role` à `admin` pour le compte administrateur.

## 2. Local

Cette version cible Node 24 pour rester alignée avec Vercel.

```powershell
node -v
npm install
Copy-Item .env.example .env
npm run check
npm run dev
```

Ouvrir : `http://localhost:3000/`

Tester : `http://localhost:3000/api/health`

## 3. Vercel

Ajoutez les variables :

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NODE_ENV=production
```

Importez le dépôt GitHub dans Vercel puis déployez.

Après déploiement, testez :

```text
https://VOTRE-DOMAINE.vercel.app/
https://VOTRE-DOMAINE.vercel.app/api/health
```

## 4. Android / APK

Le projet est préparé avec Capacitor 8. Il faut Android Studio + Android SDK sur le PC.

Après le déploiement Vercel, utilisez **l'URL HTTPS réelle** comme backend de l'APK.

PowerShell :

```powershell
$env:MOBILE_API_URL="https://VOTRE-DOMAINE.vercel.app"
npm run build:mobile
npx cap add android
npx cap sync android
npx cap open android
```

Dans Android Studio, vérifiez le package :

```text
mg.foot26.championship
```

Pour générer un APK avec Capacitor :

```powershell
npx cap build android --androidreleasetype APK
```

Pour le Play Store, générez plutôt un AAB signé avec votre keystore.

## 5. Ordre recommandé de test

1. `/api/health`
2. inscription
3. connexion
4. rôle admin
5. équipe
6. entraîneur
7. joueur
8. arbitre
9. stade
10. match futur
11. résultat
12. classement
13. but
14. carton jaune/rouge
15. meilleur buteur
16. notification
17. déconnexion
18. reconnexion après expiration du token
19. test Android

## Important

Aucune application ne peut être déclarée « garantie sans aucun problème » sans test sur **votre** projet Supabase, votre compte Vercel, votre appareil Android et vos données réelles. Cette archive élimine les problèmes détectables statiquement et prépare le parcours de déploiement ; les dernières validations doivent être faites dans votre environnement.
