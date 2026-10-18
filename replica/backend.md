# Backend : workhard

Base : Neon (projet `workhard`, base `neondb`, PostgreSQL 18). Comptes : Better Auth 1.7. Dépôt : github.com/maxfreeman82/worhard.
Pas de paiement (usage interne).

## Mise en route d'un poste

```bash
cp .env.example .env.local      # puis coller DATABASE_URL_OWNER (console Neon > Connect, rôle neondb_owner, pooled)
npm run db:setup-role           # crée le rôle app_user et écrit DATABASE_URL (mot de passe généré, jamais affiché)
npm run db:migrate              # applique db/migrations/*.sql une seule fois chacune
npm run dev
```

Sans `RESEND_API_KEY`, le code de connexion s'affiche dans la console du serveur (`npm run dev`).

## Ce qui est en place

| sujet | état | détail |
| --- | --- | --- |
| Base et migrations | fait | `db/migrations` 0001 (schéma) → 0004 ; `scripts/migrate.mjs` les suit dans `schema_migrations` |
| Règles d'accès | fait | RLS sur toutes les tables ; l'app se connecte en `app_user` (non propriétaire, `rolbypassrls = false`) et pose `app.user_id` par transaction (`src/server/db.ts`) |
| Test des règles | fait | `npm run db:test` : toutes les migrations dans PGlite, 33 contrôles (privé, teamspaces ouverte/fermée, sous-page restreinte, invité, admin, recherche, boucles) |
| Tests de bout en bout | fait | `npm run test:e2e` : 74 contrôles dans Chrome contre Neon (pages, glisser-déposer, bases, backend à deux comptes) ; comptes `@e2e.test` supprimés à la fin |
| Connexion | fait | code à 6 chiffres par e-mail (Better Auth emailOTP), compte créé au premier code, cookie de session http-only, 30 jours |
| Google | prêt, à activer | renseigner `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (client OAuth dans **ta** console Google Cloud, portée e-mail + profil seulement) |
| E-mails | prêt, à activer | Resend par son API officielle ; il faut `RESEND_API_KEY` et `EMAIL_FROM` sur un domaine vérifié chez Resend |
| API | fait | `GET /api/bootstrap`, `POST /api/sync` (lots validés par zod, 8 Mo max), `POST /api/workspace` |
| Conflits d'édition | fait | `content_version` : un contenu écrit sur une version dépassée n'écrase pas le serveur, le client recharge et prévient |
| Fichiers | fait | stockés dans Neon (`file_blobs`, migration 0005), 10 Mo max, HTML/SVG/scripts refusés ; servis par `/api/files/<id>` après contrôle d'accès (404 sinon), `nosniff`, téléchargement forcé hors images/PDF/médias. Les fichiers importés avant le serveur (`local-file:`) restent lisibles sur leur appareil |
| Tâches planifiées | fait, actif au déploiement | `/api/cron/purge` (secret `CRON_SECRET`) : pages à la corbeille depuis 30 jours puis fichiers orphelins ; planifiée chaque nuit à 3 h UTC par `vercel.json` |
| Suppression de compte | fait | Réglages > Supprimer mon compte (confirmation « SUPPRIMER ») ; supprime le compte, le profil, les sessions et les espaces dont on est le seul membre ; refusée si l'on est seul propriétaire d'un espace partagé |
| Changements des autres | fait | empreinte de l'espace vérifiée toutes les 5 s (`/api/changes`), rechargement seulement si elle change ; rechargement complet de secours toutes les 60 s. L'édition simultanée d'une même page (curseurs, fusion) reste pour la phase 2 (Yjs) |
| Sauvegardes | à vérifier | Neon garde un historique de restauration (« restore window ») selon l'offre : vérifier sa durée dans la console |

## Comment le client parle au serveur

Les écrans n'ont pas changé : `src/lib/data` garde un cache de l'espace, lu de façon synchrone. Il est chargé par
`/api/bootstrap` ; chaque modification est appliquée tout de suite à l'écran puis envoyée par lot (`/api/sync`, 400 ms).
Le serveur réécrit chaque ligne en tant qu'utilisateur : la RLS refuse ce qui n'est pas permis et tout le lot est annulé.
En cas de refus ou de conflit, le client affiche un message et recharge la version du serveur. Les changements des autres
apparaissent au retour sur l'onglet et toutes les 30 secondes (le temps réel arrivera avec la phase 2).

Limites connues, à reprendre avant d'avoir beaucoup de données ou d'utilisateurs :

- un fichier stocké dans Postgres compte dans le quota de la base Neon (0,5 Go sur l'offre gratuite) : passer à un stockage objet si les fichiers deviennent nombreux ;
- le chargement initial contient tout le contenu des pages accessibles (simple, mais lourd au-delà de quelques milliers de pages) ;
- deux personnes qui créent une ligne au même instant peuvent obtenir le même « ID unique » (compteur côté client) ;
- l'envoi de codes est limité à 3 par minute **par IP** : une équipe derrière la même box partage cette limite.
- les nouvelles pages sont écrites par niveau de l'arbre en une requête chacun (au lieu d'une par page) ; la base reste en us-east-2 : une région Neon en Europe réduirait encore l'attente (se choisit à la création du projet).

## Bugs trouvés pendant la mise en route (corrigés)

1. Récursion infinie entre les règles de `teamspaces` et `teamspace_members` (chacune lisait l'autre table) : migration 0004, fonctions `security definer`.
2. Mise à jour d'une page refusée par Postgres (paramètres inutilisés sans type) : liste de paramètres séparée pour l'update.
3. Un rechargement parti avant une modification pouvait l'effacer à son retour : il est ignoré si l'utilisateur a modifié quelque chose entre-temps.
4. Neon ferme les connexions inactives et le pool en redonnait des mortes : connexions libérées après 10 s, connexion cassée détruite, transaction rejouée une fois.
5. Appuyer sur Entrée dans le titre avant le chargement de l'éditeur envoyait le texte dans le titre : le curseur attend l'éditeur.
6. Retour intempestif à l'accueil quelques secondes après l'inscription : la fin de l'onboarding (après l'envoi des pages de départ) redirigeait alors que l'utilisateur était déjà ailleurs. Les redirections vérifient maintenant la page affichée (Next 16 garde les pages visitées montées en arrière-plan).
7. Recharger juste après un changement de réglage (thème) le perdait : les réglages sont envoyés immédiatement.
8. Fermer ou recharger l'onglet moins d'une seconde après la dernière frappe perdait le texte : l'éditeur envoie son contenu au serveur dès que l'onglet est caché ou fermé, sans attendre le lot en cours (écritures idempotentes côté serveur).
9. Pendant ce changement, une écriture forgée vers la page d'un autre espace était ignorée en silence (réponse 200) au lieu d'être refusée : elle renvoie de nouveau 403. Le test `backend.mjs` l'a détecté.

## Sécurité

- [x] secrets uniquement dans `.env.local` (ignoré par git, vérifié avant chaque commit) ; `.env.example` sans valeurs
- [x] aucun secret côté navigateur : le client ne connaît que des routes de l'app
- [x] entrées validées côté serveur (zod) sur `/api/sync` et `/api/workspace`
- [x] autorisation vérifiée à chaque lecture et écriture (RLS) et testée avec un deuxième utilisateur : `replica/e2e/backend.mjs`
- [x] limites de débit sur la connexion (envoi de code 3/min, connexion 10/min, global 60/min)
- [ ] webhooks : aucun pour l'instant
- [x] fichiers : taille (10 Mo) et type vérifiés côté serveur, servis avec `nosniff`, CSP `sandbox` et téléchargement forcé
- [x] pas de données personnelles dans les URL ; les erreurs renvoyées au client ne contiennent pas de détail SQL
- [x] `npm audit --omit=dev` : 0 vulnérabilité (une alerte « high » reste dans les outils de build : `braces`)
- [ ] politique de confidentialité : à rédiger avant d'ouvrir à d'autres personnes (sous-traitants : Neon, Vercel, Resend, Google si activé)
- [ ] mot de passe `neondb_owner` à réinitialiser : il a été partagé dans une conversation

## Ce que tu dois créer toi-même

| service | quoi | où le mettre |
| --- | --- | --- |
| Resend | compte, domaine d'envoi vérifié, clé API | `RESEND_API_KEY`, `EMAIL_FROM` |
| Google Cloud (facultatif) | client OAuth « application Web », redirection `<url>/api/auth/callback/google` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Vercel | projet relié au dépôt | variables d'environnement du projet (dont `CRON_SECRET`) |
| Neon | nouveau mot de passe pour `neondb_owner` | `DATABASE_URL_OWNER` |
