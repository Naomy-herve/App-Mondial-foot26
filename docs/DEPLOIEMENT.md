# Déploiement FOOT26 2.0

## A. Local

Prérequis : Node 24.x.

```powershell
npm install
Copy-Item .env.example .env
npm run check
npm run dev
```

Puis `http://localhost:3000/` et `/api/health`.

## B. Supabase

1. Créez un projet Supabase neuf.
2. SQL Editor → exécutez entièrement `database/schema.sql`.
3. Récupérez Project URL, Anon/Publishable key et Service Role key.
4. Placez les trois valeurs dans `.env` local ou dans Vercel.
5. Créez le premier compte dans FOOT26.
6. Dans `profiles`, passez ce compte à `admin`.

## C. GitHub/Vercel

```powershell
git init
git add .
git commit -m "FOOT26 2.0"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/FOOT26.git
git push -u origin main
```

Dans Vercel :

- importer le dépôt ;
- Node.js : `24.x` ;
- variables : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NODE_ENV=production` ;
- Deploy.

Vercel indique que Node 24.x est actuellement disponible et que Node 20 est désactivé pour les nouveaux déploiements à partir du 1er octobre 2026.

## D. APK Android

Capacitor 8 est inclus dans le projet.

Après le déploiement Vercel :

```powershell
$env:MOBILE_API_URL="https://VOTRE-DOMAINE.vercel.app"
npm run build:mobile
npx cap add android
npx cap sync android
npx cap open android
```

Puis dans Android Studio : Build → Generate App Bundles or APKs.

Pour une génération CLI :

```powershell
npx cap build android --androidreleasetype APK
```

Pour une publication Play Store, utilisez un AAB signé avec votre propre keystore.
