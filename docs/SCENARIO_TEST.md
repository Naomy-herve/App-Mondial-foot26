# Scénario de recette FOOT26 2.0

## Serveur

- `npm run check` passe.
- `/` affiche l'application.
- `/api/health` renvoie `ok: true`.
- une route API inconnue renvoie JSON 404 et non `Cannot GET /`.

## Authentification

- inscription valide ;
- confirmation email si activée ;
- connexion ;
- création du profil ;
- rôle `user` interdit aux écritures ;
- rôle `admin` autorise les écritures ;
- déconnexion ;
- renouvellement du token après expiration.

## Championnat

- créer 4 équipes ;
- créer des entraîneurs ;
- affecter un entraîneur à une équipe ;
- créer joueurs ;
- créer arbitres ;
- créer stades ;
- programmer un match futur ;
- refuser deux équipes identiques ;
- saisir le résultat ;
- vérifier le classement 3/1/0 ;
- modifier/supprimer les données ;
- empêcher la suppression d'une ressource référencée.

## Événements

- ajouter un but à une équipe participante ;
- refuser un but avec joueur d'une autre équipe ;
- ajouter jaune/rouge ;
- vérifier le meilleur buteur ;
- vérifier les cartons ;
- vérifier que le nombre de buts détaillés ne dépasse pas le score déjà finalisé.

## Notifications

- admin publie une notification ;
- utilisateur la voit ;
- utilisateur peut la marquer lue.

## Android

- `MOBILE_API_URL` pointe vers HTTPS ;
- `npm run build:mobile` crée `www/` ;
- `npx cap sync android` termine sans erreur ;
- Android Studio synchronise Gradle ;
- installation sur téléphone ;
- connexion au backend Vercel ;
- navigation, formulaires et API fonctionnent ;
- APK signé avant distribution.
