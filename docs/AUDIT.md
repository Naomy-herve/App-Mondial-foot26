# AUDIT TECHNIQUE FOOT26 v1.1

## Corrections appliquées

1. Express 4 utilisé pour éviter les incompatibilités de syntaxe de route wildcard.
2. Fallback `/` placé après les routes API.
3. Export `module.exports = app` pour Vercel.
4. `app.listen()` désactivé quand `VERCEL=1`.
5. Authentification déplacée derrière `/api/auth/signup` et `/api/auth/login`.
6. Plus besoin de mettre les clés Supabase dans `localStorage`.
7. `SUPABASE_SERVICE_ROLE_KEY` reste côté serveur.
8. Validation des scores et des champs principaux renforcée.
9. Création automatique des statistiques d'un joueur via trigger SQL.
10. Vue `standings` déclarée avec `security_invoker`.
11. Grants PostgREST ajoutés explicitement.
12. `.env` reste ignoré par Git.
13. `/api/health` permet de vérifier le déploiement.
14. Le fallback SPA ne capture pas une route `/api/...` inconnue.
15. Le projet est conçu pour fonctionner à la racine avec `npm install` puis `npm run dev`.

## Test local

```powershell
npm install
Copy-Item .env.example .env
# remplir .env
npm run check
npm run dev
```

Puis :

```text
http://localhost:3000/
http://localhost:3000/api/health
```

## Test Supabase

1. Exécuter `database/schema.sql`.
2. Créer un compte.
3. Vérifier la ligne dans `profiles`.
4. Modifier `role` en `admin`.
5. Se reconnecter.
6. Créer une équipe.
7. Créer un joueur.
8. Programmer un match.
9. Saisir son résultat.
10. Vérifier le classement.

## Test Vercel

Variables obligatoires :

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Après déploiement :

```text
https://DOMAINE/api/health
```

doit retourner un JSON avec `ok: true`.

## Point important

Le rôle admin est contrôlé côté serveur. Masquer les boutons dans le navigateur n'est pas une protection suffisante : les routes d'écriture vérifient réellement le token et le rôle `admin`.
