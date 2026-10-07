# Audit final FOOT26 2.0

## Défauts critiques trouvés dans l'ancienne version

- Statistiques joueurs non alimentées par les buts/cartons.
- Joueurs sans CRUD complet.
- Matchs sans modification/suppression complète.
- Arbitres/stades principalement en lecture.
- Entraîneur stocké comme texte dans l'équipe.
- Dashboard pouvant compter des matchs passés comme « à venir ».
- Déconnexion serveur incorrecte (`auth.admin` sur client anon).
- Expiration JWT non renouvelée.
- Validation trop faible de plusieurs entrées.
- Pas de gestion réelle des événements de match.
- Préparation APK absente.

## Corrections FOOT26 2.0

- Vue `player_statistics` dérivée des tables `goals` et `cards`.
- Trigger SQL de cohérence des événements.
- Table `coaches` séparée.
- CRUD équipes/joueurs/coachs/arbitres/stades/matchs.
- CRUD buts/cartons.
- Notifications administrateur.
- Validation UUID/nombres/dates/couples d'équipes.
- Refresh session Supabase.
- API `health` enrichie.
- Node 24 pour Vercel.
- Capacitor 8 + configuration Android.
- Scripts `build:web` et `build:mobile`.
- `.gitignore` renforcé pour secrets et fichiers Android.

## Limites assumées

- Les statistiques `assists` et `minutes_played` restent à zéro tant qu'un module de saisie spécifique n'existe pas.
- Une application Android de production doit être signée avec le keystore du propriétaire.
- Les tests Supabase/Vercel/Android réels nécessitent les identifiants et outils du propriétaire.
