# Architecture : workhard (une reconstruction des fonctions de Notion)

Nom du projet : **workhard** (dépôt GitHub et projet Neon).

Usage : interne (toi et ton entreprise). Plateforme : web. Pas de paiement.
Lit : `replica/recon.md` (S01-S36, F01-F17) et `replica/features.csv` (116 lignes).

## Pile technique

| couche | choix | pourquoi |
| --- | --- | --- |
| web | Next.js 15 (App Router) + TypeScript | un seul projet pour les pages, l'API (server actions + route handlers) et le rendu des pages publiées |
| éditeur | BlockNote (sur ProseMirror / TipTap) | déjà « à la Notion » : blocs, menu « / », poignée ⋮⋮, imbrication, raccourcis Markdown, support Yjs. Évite d'écrire un éditeur de zéro (40 % du projet) |
| styles | Tailwind CSS + tokens de `/replica-design` ; composants Radix UI | Radix fournit menus, popovers, modales accessibles au clavier |
| état client | TanStack Query + Zustand | cache des pages et de l'arbre ; petit état d'interface (sidebar, aperçus) |
| base de données | Postgres sur Neon (projet `workhard`) | une seule base ; jsonb pour le contenu et les propriétés ; recherche plein texte intégrée ; branches Neon pour tester les migrations |
| accès à la base | driver `@neondatabase/serverless` + SQL dans des migrations | chaque requête tourne dans une transaction qui écrit `app.user_id` ; la RLS de Postgres filtre ensuite tout seule |
| accès | Row Level Security (voir `schema.sql`) | une règle par table, testable en SQL ; impossible d'oublier une vérification dans une route |
| auth | Better Auth (MIT), tables dans Neon : plugin code par e-mail + Google | code de connexion comme l'original, sans mots de passe ; identifiants UUID (`advanced.database.generateId: "uuid"`) = `profiles.id` |
| fichiers | Vercel Blob (accès privé) | images, PDF, pièces jointes ; envoi direct depuis le navigateur avec un jeton court émis par le serveur |
| temps réel | Yjs + serveur Hocuspocus (Node, phase 2), qui porte aussi la présence ; boîte de réception rafraîchie toutes les 30 s | Yjs fusionne les éditions simultanées sans conflit ; Hocuspocus persiste le document dans `pages.ydoc` |
| e-mail | Resend | invitations, mentions, résumés de notifications |
| tâches de fond | Vercel Cron → route handlers protégés par un secret | purge de la corbeille, e-mails de notifications, rappels, automatisations différées |
| IA (phase 5) | API Claude avec ta propre clé | résumer, écrire, traduire, chat sur l'espace |
| hébergement | Vercel (app Next.js) + Fly.io ou Render (Hocuspocus) + Neon | tout est géré ; gratuit ou presque à quelques utilisateurs |

Pas de microservices : une app Next.js, une base, et un seul service à part (Hocuspocus) à partir de la phase 2, parce que Vercel ne garde pas de connexions WebSocket ouvertes.

**Licence de BlockNote.** Le cœur est sous MPL-2.0 (utilisation libre). Quelques paquets « XL » (blocs en colonnes, export PDF/Word) sont sous GPL-3.0 ou licence commerciale. Pour un outil interne non distribué, la GPL ne pose pas de problème ; si un jour tu revends l'outil, il faudra la licence commerciale ou refaire ces blocs.

## Schéma

Tables : 22 (+ 4 tables de Better Auth : user, session, account, verification). Accès : RLS Postgres. Fichier complet : [`schema.sql`](schema.sql).

Comment la RLS fonctionne sans Supabase :

1. le serveur lit la session Better Auth (cookie) et obtient l'id de l'utilisateur ;
2. il ouvre une transaction Neon avec le rôle `app_user`, qui n'est pas propriétaire des tables (sinon la RLS serait ignorée) ;
3. première instruction : `select set_config('app.user_id', <id>, true)` ; `app.uid()` le relit dans toutes les règles ;
4. les requêtes de l'écran suivent ; la valeur disparaît à la fin de la transaction.

Les migrations et les tâches serveur (création d'espace, notifications, purge) utilisent le rôle propriétaire.
`replica/schema.test.mjs` vérifie ce montage (rôle non propriétaire + `app.user_id`) : 30 contrôles.

| table | rôle | phase |
| --- | --- | --- |
| profiles | utilisateur (lié à auth.users) | 1 |
| workspaces, workspace_members, workspace_invites | espaces, rôles, invitations | 1 |
| pages | arbre de pages, contenu, lignes de BDD, partage, publication, corbeille | 1 |
| favorites, files | favoris, fichiers importés | 1 |
| teamspaces, teamspace_members | espaces d'équipe | 2 |
| page_permissions | droits explicites par page | 2 |
| discussions, comments, comment_reactions | commentaires | 2 |
| notifications | boîte de réception | 2 |
| page_versions | historique | 2 |
| databases, db_views, db_view_user_overrides, db_unique_counters | bases de données et vues | 3 |
| automations, automation_runs | automatisations | 4 |
| ai_threads | conversations IA | 5 |

Choix structurants :

- **Le contenu d'une page est un document, pas une ligne par bloc.** `pages.content` contient le document BlockNote (json) et `pages.ydoc` l'état Yjs dès la phase 2. Une table par bloc (comme l'API de Notion) multiplie les écritures et complique le temps réel. Les ID de bloc restent stables dans le json, ce qui suffit pour les commentaires et les liens vers un bloc. `content_text` est extrait à chaque sauvegarde pour la recherche.
- **Une ligne de BDD est une page.** `pages.database_id` + `pages.props` ({property_id: valeur}). Ouvrir une ligne ouvre l'éditeur normal. Les relations sont des tableaux d'ID de pages dans `props` ; une relation à double sens écrit les deux côtés dans la même transaction.
- **Le schéma d'une BDD est un tableau json** (`databases.properties`) avec des ID de propriété stables. Renommer une propriété ne touche aucune ligne.
- **Droits hérités par le chemin.** `pages.path` (tableau d'ancêtres, tenu par trigger) permet de trouver en une requête la page la plus proche qui a ses propres droits (`has_own_permissions`). Sinon, la racine décide : page privée → son propriétaire ; teamspace → ses membres.
- **L'ordre utilise l'indexation fractionnaire** (`position` texte, ex. « a0 », « a0V »). Déplacer une page ou une vue ne réécrit qu'une ligne.

Contraintes dures :

- une page ne peut pas être déplacée dans un de ses descendants (trigger `pages_set_path`) ;
- une seule teamspace par défaut par espace (index unique partiel) ;
- une BDD par page conteneur (index unique sur `databases.page_id`) ;
- ID uniques des lignes (`TASK-42`) sans doublon sous concurrence (`next_unique_id`, upsert atomique) ;
- une notification par action (index unique `user_id, dedupe_key`).

## API

Server actions Next.js pour les mutations, route handlers pour ce qui vient de l'extérieur. Chaque appel passe par une transaction `app_user` avec `app.user_id`, donc par la RLS ; le rôle propriétaire n'est utilisé que dans les fonctions listées « serveur ».

### F01 Compte et espace

| méthode / chemin | fait | qui | entrée | sortie | parcours |
| --- | --- | --- | --- | --- | --- |
| action `sendLoginCode` | envoie un code par e-mail | public | email | ok | F01 |
| action `verifyLoginCode` | vérifie le code, ouvre la session | public | email, code | session | F01 |
| GET `/auth/callback` | retour OAuth Google | public | code | redirection | F01 |
| action `createWorkspace` | crée l'espace, ajoute le créateur comme propriétaire, crée la teamspace par défaut (serveur) | connecté | name, icon | workspace | F01 |
| action `updateProfile` | nom, avatar, thème | soi-même | champs | profile | S30 |
| GET `/invite/[token]` | accepte une invitation (serveur) | connecté avec l'e-mail invité | token | redirection vers l'espace | F07 |

### F02-F06 Pages, éditeur, arbre, recherche

| méthode / chemin | fait | qui | entrée | sortie | parcours |
| --- | --- | --- | --- | --- | --- |
| action `createPage` | nouvelle page (privée, teamspace ou sous-page) | can_edit sur le parent | parent, title?, template_id? | page | F02 |
| action `savePageContent` | enregistre le document, extrait `content_text`, crée une version si > 10 min (phase 1 ; remplacé par Hocuspocus en phase 2) | can_edit | page_id, content, base_updated_at | updated_at | F02, F03, F04 |
| action `updatePageMeta` | titre, icône, couverture, options, verrou | can_edit (verrou : full_access) | page_id, champs | page | F02 |
| action `movePage` | change de parent et de position | can_edit sur la page et la destination | page_id, parent, position | page | F05 |
| action `duplicatePage` | copie la page et ses sous-pages | can_view source, can_edit destination | page_id | page | F05 |
| action `setTrash` | met à la corbeille / restaure (avec descendants) | can_edit | page_id, trash | ok | F13 |
| action `deleteForever` | supprime définitivement | full_access | page_id | ok | F13 |
| action `toggleFavorite` | ajoute / retire des favoris | can_view | page_id | ok | F05 |
| GET `/api/tree?parent=` | enfants d'un nœud de la sidebar (chargement à la demande) | membre | parent | pages[] | F05 |
| GET `/api/search?q=` | recherche plein texte (`search_pages`) | membre | q, filtres | résultats | F06 |
| GET `/api/recent` | pages récemment ouvertes / modifiées | membre | — | pages[] | S04 |
| POST `/api/files` | URL d'import signée + ligne `files` | can_edit | page_id, name, mime, size | upload_url, file | F02 |

### F07-F09 Partage et collaboration

| méthode / chemin | fait | qui | entrée | sortie | parcours |
| --- | --- | --- | --- | --- | --- |
| action `sharePage` | invite par e-mail avec un niveau ; crée l'invitation d'invité si besoin ; notification + e-mail | full_access | page_id, email, level | permission | F07 |
| action `setGeneralAccess` | accès général (espace / sur invitation) | full_access | page_id, mode, level | page | F07 |
| action `removeAccess` | retire un droit | full_access | page_id, user_id | ok | F07 |
| action `inviteMember` | invite dans l'espace | admin | email, role | invite | S31 |
| action `setMemberRole` / `removeMember` | gère les membres | admin | user_id, role | ok | S31 |
| actions teamspace | créer, rejoindre, quitter, gérer les membres | membre / propriétaire de teamspace | — | — | S32 |
| action `createComment` | crée discussion + commentaire, notifie les mentionnés et participants | can_comment | page_id, block_id?, anchor_text?, body | comment | F09 |
| action `resolveDiscussion` | résoudre / rouvrir | can_comment | discussion_id | ok | F09 |
| action `react` | réaction emoji | can_view | comment_id, emoji | ok | F09 |
| GET `/api/inbox` | notifications | soi-même | filtre | notifications[] | S12 |
| action `markRead` / `archive` | état des notifications | soi-même | ids | ok | S12 |
| GET `/api/pages/[id]/versions` + action `restoreVersion` | historique | can_view / can_edit | version_id | page | F13 |
| WS `wss://collab…/[pageId]` | édition simultanée (Hocuspocus) ; vérifie le cookie de session Better Auth et `can_access_page` à la connexion | can_view (lecture) / can_edit (écriture) | jeton | mises à jour Yjs | F02 |

### F10-F12 Bases de données

| méthode / chemin | fait | qui | entrée | sortie | parcours |
| --- | --- | --- | --- | --- | --- |
| action `createDatabase` | page conteneur + BDD + vue tableau par défaut | can_edit sur le parent | parent, inline | database | F10 |
| action `updateSchema` | ajoute, renomme, supprime, change le type d'une propriété (avec conversion des valeurs dans une transaction) | can_edit | database_id, op | database | F10 |
| action `createRow` / `updateRowProps` | nouvelle ligne / valeurs ; met à jour l'autre côté des relations à double sens ; lance les automatisations | can_edit | database_id, props | page | F10, F12 |
| POST `/api/databases/[id]/query` | lignes filtrées, triées, groupées, paginées pour une vue ; rollups et formules calculés | can_view | view_id, overrides, cursor | lignes, groupes, calculs | F11 |
| actions vues | créer, renommer, dupliquer, réordonner, supprimer, enregistrer la config (pour tous ou pour soi) | can_edit (pour soi : can_view) | view, config | view | F11 |

Requête de BDD : le filtre json d'une vue est traduit côté serveur en SQL sur `props` (opérateurs par type, groupes ET/OU sur 3 niveaux). Formules et rollups sont calculés en TypeScript après la requête ; le tri par formule se fait en mémoire et est donc limité à quelques milliers de lignes (assez pour un usage interne).

### F08, F14-F17 Extras (phase 4) et IA (phase 5)

| méthode / chemin | fait | qui | entrée | sortie | parcours |
| --- | --- | --- | --- | --- | --- |
| action `publishPage` | publie / dépublie, slug, duplication, indexation | full_access | page_id, options | page | F08 |
| GET `/p/[slug]` | page publiée en lecture seule (rendu serveur) | public | slug | HTML | F08 |
| GET `/f/[viewId]` + POST `/api/forms/[viewId]` | formulaire public ; crée une ligne (serveur, limite de débit) | public ou membre selon le réglage | réponses | ok | F14 |
| actions automatisations | créer, activer, supprimer | full_access sur la BDD | trigger, actions | automation | F15 |
| POST `/api/import` | import Markdown / CSV / HTML (zip) | membre | fichier | pages créées | F16 |
| GET `/api/export/[pageId]` | export Markdown + CSV / HTML / PDF | can_view | format | fichier | F16 |
| POST `/api/ai` | requête IA en streaming (Claude) avec le contexte des pages autorisées | membre | prompt, page_ids | flux de texte | F17 |

Webhooks entrants : aucun (pas de paiement). Sortants : action « webhook » des automatisations (phase 4), signée HMAC.

Tâches de fond :

| tâche | fréquence | fait |
| --- | --- | --- |
| purge de la corbeille | chaque nuit | supprime les pages à la corbeille depuis plus de 30 jours, puis leurs fichiers du stockage |
| e-mails de notifications | toutes les 5 min | envoie les notifications non lues depuis 10 min et pas encore envoyées (`emailed_at`) |
| rappels | chaque minute | notifie les dates à rappel arrivées à échéance |
| élagage de l'historique | chaque nuit | garde 1 version par heure après 7 jours, supprime après 90 jours |
| fichiers orphelins | chaque semaine | supprime les fichiers qui ne sont plus référencés |

Uniquement des API officielles avec tes propres clés (Neon, Vercel Blob, Resend, Google, Claude). Jamais les API privées de Notion.

## Les points délicats

- **Édition simultanée** : en phase 1, sauvegarde avec contrôle de version (`base_updated_at`) : si quelqu'un d'autre a modifié la page entre-temps, on prévient au lieu d'écraser. En phase 2, Yjs règle le problème : `pages.ydoc` devient la source de vérité, et Hocuspocus réécrit `content` et `content_text` toutes les quelques secondes.
- **Concurrence** : ID uniques par upsert atomique ; déplacements de pages protégés contre les cycles par trigger ; relations à double sens écrites dans une transaction.
- **Droits** : tout passe par `page_access_level()`. C'est la fonction la plus risquée : elle doit être couverte par des tests SQL (privé, teamspace ouverte / fermée / privée, sous-page restreinte, invité, admin) avant la phase 2. Elle s'exécute pour chaque ligne lue : surveiller les performances sur la recherche et les grosses BDD.
- **Performance de l'arbre** : charger les enfants à la demande, jamais l'arbre entier.
- **Grosses BDD** : pagination par curseur ; index GIN sur `props` ; filtres poussés en SQL ; formules en mémoire limitées.
- **Fichiers** : 5 Go maximum par fichier (contrainte SQL) ; limite réelle fixée par le jeton d'envoi Vercel Blob ; fichiers privés servis par une route qui vérifie l'accès à la page.
- **Collage** : nettoyer le HTML collé (pas de script, pas de style) avant de le convertir en blocs.
- **Recherche** : configuration `simple` (pas de racinisation) pour bien gérer français et anglais ; trigrammes pour les titres approximatifs. Pas de recherche dans les fichiers.
- **Fuseaux horaires** : dates en UTC ; les propriétés date sans heure sont stockées comme dates « locales » (`2026-10-14`) pour ne pas changer de jour selon le fuseau.
- **Boucles d'automatisation** : profondeur de chaînage plafonnée à 3 (`automation_runs.depth`).
- **Idempotence** : notifications dédupliquées par `dedupe_key` ; e-mails marqués `emailed_at` avant l'envoi suivant.
- **RGPD** : suppression de compte = suppression du profil en cascade ; les pages créées restent dans l'espace (`created_by` mis à nul).
- **Multi-tenant** : toutes les tables ont un `workspace_id` direct ou via la page ; la RLS empêche toute fuite entre espaces.

## Ordre de construction

1. **Tranche verticale** (sans soin visuel) : S01 connexion → S02 créer un espace → S03 sidebar → S05 créer une page, écrire, recharger, retrouver le texte.
   Tables : profiles, workspaces, workspace_members, pages. Routes : `sendLoginCode`, `verifyLoginCode`, `createWorkspace`, `createPage`, `savePageContent`, `/api/tree`.
   Prouve : Better Auth, la RLS via `app.user_id` sur Neon, BlockNote, la sauvegarde.

2. **Phase 1, cœur** : S03-S09, S14, S15 (modèles de base), S30 (profil, thème). Tout l'éditeur (blocs texte et médias, menu « / », glisser-déposer, colonnes, tableau simple), arbre avec glisser-déposer, favoris, recherche Ctrl+K, corbeille, fichiers, thème sombre.
   Tables : + favorites, files. Parcours : F01-F06, F13 (corbeille).

3. **Phase 2, équipe** : S10-S13, S31, S32. Partage et droits hérités, invités, teamspaces, commentaires, mentions, boîte de réception, e-mails, temps réel (Hocuspocus), présence, historique.
   Tables : + teamspaces, teamspace_members, page_permissions, discussions, comments, comment_reactions, notifications, page_versions, workspace_invites. Parcours : F07, F09, F13.

4. **Phase 3, bases de données** : S16-S20, S23-S26. Propriétés (toutes sauf bouton et vérification), tableau, Kanban, liste, galerie, calendrier, filtres, tris, groupes, relations, rollups, formules, vues liées, calculs.
   Tables : + databases, db_views, db_view_user_overrides, db_unique_counters. Parcours : F10-F12.

5. **Phase 4, extras** : S21, S22, S27-S29, S33, S34. Chronologie, graphiques, formulaires, automatisations, modèles de lignes, import / export, publication web, rappels.
   Tables : + automations, automation_runs. Parcours : F08, F14-F16.

6. **Phase 5, IA** : S35. Écrire, résumer, traduire dans l'éditeur ; chat sur l'espace. Table : + ai_threads. Parcours : F17.

7. **Corrections issues de `/replica-entrepreneur`**, une fois qu'il aura tourné (par exemple : performances sur les grosses pages, recherche, mode hors ligne).
