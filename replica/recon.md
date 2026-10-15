# Recon map : Notion (web)

Périmètre : tout Notion (taille XL), découpé en 5 phases livrables. La phase 1 est le cœur.
Pour : usage perso / interne à mon entreprise (pas de revente)
Date : 2026-10-14

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | page des prix | https://www.notion.com/pricing | ce qui est payant = ce qui compte : historique, invités, teamspaces, automatisations, formulaires, graphiques, sites |
| 2 | centre d'aide (index) | https://www.notion.com/help/guides | catégories : pages & blocs, bases de données, vues, partage, sites, import/export, automatisations, IA, admin |
| 3 | aide : barre latérale | https://www.notion.com/help/navigate-with-the-sidebar | recherche, accueil, boîte de réception, favoris, teamspaces, partagé, privé, modèles, corbeille (30 j) |
| 4 | aide : vues, filtres, tris | https://www.notion.com/help/views-filters-and-sorts | 7 vues + formulaires, filtres avancés à 3 niveaux, groupes et sous-groupes, aperçu latéral/centré/pleine page |
| 5 | API publique : blocs | https://developers.notion.com/reference/block | ~35 types de blocs, objet rich text, annotations, 10 couleurs + fonds |
| 6 | API publique : propriétés | https://developers.notion.com/reference/property-object | 23 types de propriétés, relations, rollups, formules, statut à groupes |
| 7 | notes de version | https://www.notion.com/releases | 2026 : agents IA, MCP, historique des versions avec attribution, permissions par colonne |
| 8 | ton propre compte Notion | (à parcourir avec toi) | pour vérifier les états vides, les erreurs et le mobile |

Conditions d'utilisation : je n'ai pas vérifié les CGU générales de Notion. Toute la reconnaissance s'appuie sur des sources publiques, et l'usage visé est interne. Si tu parcours ton compte pour compléter, lis d'abord les CGU qui s'appliquent à ton offre.

## Boucle principale

Créer une page, écrire dedans avec des blocs (texte, listes, tâches, médias, sous-pages, bases de données) et l'organiser dans une arborescence partagée avec son équipe.

## Écrans

| ID | écran | route / accès | rôle | composants clés | états |
| --- | --- | --- | --- | --- | --- |
| S01 | Inscription / connexion | /login | créer un compte, se connecter | champ e-mail, code magique, bouton Google | vide, code envoyé, erreur code, chargement |
| S02 | Onboarding | après la 1re connexion | nom, usage, création de l'espace de travail | étapes, choix d'usage, invitation | étape 1..n, passer |
| S03 | Coquille de l'app | /{workspace} | barre latérale + zone de page | sidebar, sélecteur d'espace, arbre de pages, topbar | sidebar ouverte/repliée, mobile |
| S04 | Accueil | /home | récents, tâches, raccourcis | cartes récentes, liste de tâches | vide (nouvel espace), rempli |
| S05 | Éditeur de page | /{page-id} | écrire et structurer | titre, icône, couverture, blocs, poignée ⋮⋮, menu « / » | page vide (placeholder), remplie, lecture seule, verrouillée, chargement, introuvable, accès refusé |
| S06 | Menu « / » (commande slash) | taper / dans un bloc | insérer un bloc | liste filtrable, groupes, raccourcis | filtré, aucun résultat |
| S07 | Barre d'outils de sélection | sélectionner du texte | mettre en forme | gras, italique, souligné, barré, code, lien, couleur, « Transformer en », commentaire | — |
| S08 | Menu de bloc | clic sur ⋮⋮ | actions sur un bloc | supprimer, dupliquer, transformer, couleur, copier le lien, déplacer vers | — |
| S09 | Recherche rapide | Ctrl+K | trouver / ouvrir une page | champ, récents, résultats, filtres (auteur, date, teamspace) | vide, résultats, aucun résultat |
| S10 | Menu de partage | bouton « Partager » | inviter, gérer l'accès | invitation par e-mail, niveaux d'accès, accès général, copier le lien, onglet « Publier » | non partagé, partagé, publié |
| S11 | Commentaires et discussions | icône commentaire / marge | discuter sur un bloc | fil, mentions, résoudre, réactions | aucun, ouvert, résolu |
| S12 | Boîte de réception | cloche en haut à droite | notifications | liste, filtres, archiver, marquer lu | vide, non lus |
| S13 | Historique de la page | ⋯ > Historique | voir et restaurer une version | liste de versions, aperçu, restaurer | — |
| S14 | Corbeille | barre latérale > Corbeille | restaurer / supprimer définitivement | recherche, liste, restaurer, supprimer | vide, rempli |
| S15 | Modèles | barre latérale > Modèles | partir d'un modèle | galerie, catégories, aperçu | — |
| S16 | Base de données : tableau | bloc ou page BDD | lignes = pages, colonnes = propriétés | en-têtes, cellules éditables, + nouvelle ligne, calculs de pied | vide, rempli, filtré à vide |
| S17 | Base de données : tableau Kanban | onglet de vue | cartes groupées par propriété | colonnes, cartes, glisser-déposer | vide, rempli |
| S18 | Base de données : liste | onglet de vue | affichage minimal | lignes, propriétés visibles | — |
| S19 | Base de données : galerie | onglet de vue | cartes avec image | grille, aperçu de carte (couverture / contenu / fichiers) | — |
| S20 | Base de données : calendrier | onglet de vue | éléments par date | mois/semaine, éléments sans date | — |
| S21 | Base de données : chronologie | onglet de vue | éléments sur une frise | tableau + frise, barres redimensionnables, dépendances | — |
| S22 | Base de données : graphique | onglet de vue | barres, lignes, anneau | sélection axe/valeur, légende | — |
| S23 | Réglages de vue | ⋯ sur la vue | mise en page, propriétés, filtres, tris, groupes | panneaux latéraux | — |
| S24 | Éditeur de propriété | clic sur un en-tête | type, nom, options | liste des types, options de sélection, format, formule | — |
| S25 | Éditeur de formule | propriété formule | écrire une formule | éditeur de code, aide aux fonctions, aperçu | valide, erreur |
| S26 | Aperçu d'une ligne | clic sur une ligne | ouvrir la page d'une ligne | aperçu latéral / centré / pleine page, propriétés en haut | — |
| S27 | Formulaire (création) | vue Formulaire | construire un formulaire lié à une BDD | questions, types, logique conditionnelle | — |
| S28 | Formulaire (public) | lien partagé | remplir un formulaire | champs, envoyer | vide, envoyé, erreur |
| S29 | Page publiée | {sous-domaine}.site / lien public | lecture publique | page en lecture seule, dupliquer | publiée, dépubliée (404) |
| S30 | Réglages | barre latérale > Réglages | compte, préférences, espace, membres, sécurité, import/export | onglets | — |
| S31 | Membres et invités | Réglages > Membres | gérer les rôles | tableau des membres, inviter, rôles | — |
| S32 | Teamspaces | sidebar > + teamspace | espaces d'équipe | création, membres, rôles, accès (ouvert/fermé/privé) | — |
| S33 | Import / export | Réglages / ⋯ > Exporter | Markdown, HTML, CSV, PDF | choix du format, options | en cours, terminé |
| S34 | Automatisations | ⚡ sur la BDD | déclencheur → actions | déclencheurs, actions, liste des automatisations | — |
| S35 | Notion AI (chat et éditeur) | barre latérale / espace / ⌘J | générer, résumer, traduire, poser des questions | fil de chat, sélecteur de contexte, suggestions | — |
| S36 | 404 / page introuvable / accès refusé | URL invalide | — | message, demande d'accès | — |

Mobile (web responsive) : sidebar en tiroir, barre d'outils de blocs au-dessus du clavier. À vérifier sur ton compte.

## Parcours

```
F01 Créer un compte et un espace de travail
    S01 -> S02 -> S03/S04
    clics du parcours principal : ~6
    cas limites : code magique expiré, e-mail déjà utilisé, Google refusé

F02 Créer une page et écrire
    S03 (+ Nouvelle page) -> S05 (titre, texte, Entrée = nouveau bloc)
    clics : 1 + frappe
    cas limites : page vide (placeholder « Appuyez sur / pour les commandes »), collage de Markdown/HTML, collage d'image, très longue page

F03 Insérer un bloc avec « / »
    S05 -> S06 (taper « /to-do ») -> Entrée
    clics : 0 (clavier)
    cas limites : raccourcis Markdown (#, -, [], >, ```), aucun résultat, Échap

F04 Réorganiser des blocs
    S05 -> poignée ⋮⋮ -> glisser (même page, en colonnes, dans une autre page de la sidebar)
    cas limites : glisser un bloc parent avec ses enfants, annuler (Ctrl+Z), sélection multiple

F05 Organiser l'arborescence
    S03 : glisser une page sous une autre, favoris, déplacer vers, dupliquer, renommer, icône
    cas limites : déplacer une page dans un de ses propres descendants (interdit), pages très profondes

F06 Rechercher et ouvrir
    Ctrl+K -> S09 -> Entrée -> S05
    clics : 0 (clavier)
    cas limites : aucun résultat, page sans droits d'accès, contenu dans la corbeille

F07 Partager une page
    S05 -> Partager -> S10 -> e-mail + niveau d'accès -> Inviter
    clics : ~4
    cas limites : invité externe, héritage des droits par les sous-pages, retrait d'accès, conflit de droits plus restrictifs sur une sous-page

F08 Publier sur le web
    S10 -> onglet Publier -> Publier -> copier le lien -> S29
    cas limites : dépublier, permettre la duplication, indexation par les moteurs de recherche

F09 Collaborer : commenter et mentionner
    S05 -> sélectionner -> Commenter -> @personne -> S12 chez l'autre
    cas limites : résoudre puis rouvrir, commentaire sur un bloc supprimé, mention d'un invité sans accès

F10 Créer une base de données et l'utiliser
    « /tableau » -> S16 -> ajouter des propriétés (S24) -> ajouter des lignes -> ouvrir une ligne (S26)
    clics : ~8
    cas limites : changement de type de propriété (conversion des valeurs), 10 000+ lignes, propriété titre obligatoire

F11 Créer une vue filtrée et groupée
    S16 -> + vue -> Tableau Kanban (S17) -> grouper par Statut -> filtre « Assigné = moi »
    cas limites : filtre personnel ou partagé, groupes vides masqués, glisser une carte vers un autre groupe (met à jour la valeur)

F12 Relations et rollups
    S24 : relation vers BDD B -> rollup « somme de Montant »
    cas limites : relation à double sens, suppression de la BDD liée, relation vers soi-même (sous-tâches)

F13 Restaurer
    S13 : choisir une version -> Restaurer ; S14 : restaurer une page supprimée
    cas limites : restauration après le délai de rétention, parent supprimé

F14 Collecter des réponses avec un formulaire
    S16 -> + Formulaire -> S27 -> partager -> S28 -> nouvelle ligne dans la BDD
    cas limites : réponses anonymes, champ obligatoire, logique conditionnelle

F15 Automatiser
    S16 -> ⚡ -> « Quand Statut = Terminé » -> « Mettre Date fin = maintenant » + « Notifier »
    cas limites : boucles d'automatisation, droits de l'auteur de l'automatisation

F16 Importer / exporter
    S30 -> Importer (Markdown, CSV, HTML) ; ⋯ -> Exporter (Markdown + CSV, HTML, PDF)
    cas limites : gros zip, images liées, encodage

F17 Utiliser l'IA sur une page
    S05 -> espace sur une ligne vide / sélection -> S35 -> « Résumer » -> Insérer
    cas limites : réponse longue, annuler, contexte trop grand
```

## Composants

| composant | variantes | états | utilisé sur |
| --- | --- | --- | --- |
| Bouton | principal (bleu), secondaire, discret, danger, icône | défaut, survol, focus, désactivé, chargement | partout |
| Élément de barre latérale | page, teamspace, section, lien de vue | défaut, survol, actif, déplié/replié, glissé | S03 |
| Arbre de pages | — | chargement des enfants, vide (« Aucune page à l'intérieur ») | S03 |
| Bloc | ~35 types (voir modèle de données) | défaut, survol (poignée visible), sélectionné, en édition, en glissement | S05 |
| Poignée ⋮⋮ + bouton « + » | — | caché, survol | S05 |
| Menu flottant / popover | liste, liste filtrable, sous-menu | ouvert, filtré, aucun résultat | S06, S07, S08, S23, S24 |
| Barre d'outils de mise en forme | — | boutons actifs selon la sélection | S07 |
| Sélecteur d'icône | emoji, icônes, import, aléatoire | — | S05, S32 |
| Couverture | image, couleur, import | repositionner | S05 |
| Modale | petite, grande, plein écran mobile | ouverte, fermeture (Échap / clic hors) | S09, S10, S13, S15, S30 |
| Aperçu latéral / centré | latéral, centré, pleine page | ouvert, agrandi | S26 |
| Cellule de propriété | 23 types | lecture, édition, vide | S16-S26 |
| Option de sélection (tag) | 10 couleurs | — | S16-S24 |
| Barre d'onglets de vues | icône, texte, les deux | active, débordement « plus » | S16-S22 |
| Puce de filtre / tri | simple, avancée | active, vide | S23 |
| Carte (Kanban / galerie) | avec couverture, sans | survol, glissée | S17, S19 |
| Sélecteur de date | jour, plage, avec heure, rappel | — | S16, S20, S21 |
| Sélecteur de personne | membres, invités, groupes | — | S10, S16 |
| Avatar / pile d'avatars | présence | en ligne | S05, S10 |
| Fil de commentaires | en ligne, marge, bas de page | ouvert, résolu | S11 |
| Toast | info, succès, erreur, annuler | — | partout |
| Info-bulle | — | — | partout |
| Champ de saisie | texte, e-mail, recherche | focus, erreur, désactivé | S01, S09, S30 |
| Interrupteur, case à cocher, liste déroulante | — | — | S23, S30 |
| Breadcrumb (fil d'Ariane) | — | tronqué | S05 |
| Menu contextuel ⋯ de page | — | — | S05 |

## Modèle de données déduit

```
User          id, email, name, avatar_url, locale, created_at
              preuve : S01, S30 ; API « user »  — confiance : haute

Workspace     id, name, icon, domain, plan, created_at
              preuve : S02, S30, page des prix  — confiance : haute

Membership    workspace_id, user_id, role (owner | admin | member | guest)
              preuve : S31, aide sur le partage  — confiance : haute

Teamspace     id, workspace_id, name, icon, access (open | closed | private), is_default
TeamspaceMember teamspace_id, user_id, role (owner | member)
              preuve : S32, page des prix  — confiance : haute

Page          id, workspace_id, parent_type (workspace | teamspace | page | database | block),
              parent_id, title (rich text), icon, cover, is_locked, full_width, small_text, font,
              in_trash, trashed_at, created_by, created_at, last_edited_by, last_edited_at,
              properties (json, si la page est une ligne de BDD), position (ordre parmi ses sœurs)
              preuve : S05, API « page »  — confiance : haute
              Dans Notion, une page est elle-même un bloc ; on peut garder 2 tables ou une seule table « block ».

Block         id, page_id, parent_id (bloc parent ou page), type, content (json : rich_text, checked,
              language, url, color, is_toggleable…), position, in_trash,
              created_by, created_at, last_edited_by, last_edited_at
              preuve : S05, API « block » (~35 types)  — confiance : haute

RichText      tableau json : [{type: text|mention|equation, text:{content, link},
              annotations:{bold, italic, strikethrough, underline, code, color}}]
              preuve : API « rich text »  — confiance : haute

Database      id, page_id (la page qui la contient), title, is_inline, data_sources[]
DataSource    id, database_id, title, properties (schéma json : {id, name, type, config})
              preuve : S16, S24, API « data source »  — confiance : haute

View          id, database_id, name, type (table | board | list | gallery | calendar | timeline | chart | form),
              config (json : filtres, tris, groupe, sous-groupe, propriétés visibles et largeurs,
              ouverture des pages, couverture de carte…), position
              preuve : S16-S23, aide sur les vues  — confiance : haute (structure de config : estimation)

Permission    id, page_id, principal_type (user | group | teamspace | workspace | public),
              principal_id, level (full_access | can_edit | can_edit_content | can_comment | can_view)
              preuve : S10  — confiance : moyenne (niveaux : estimation, à confirmer sur ton compte)

PublicShare   page_id, slug, allow_duplicate, search_indexing, published_at
              preuve : S10, S29, page des prix  — confiance : moyenne

Discussion    id, page_id, block_id (nul = commentaire de page), anchor (plage de texte), resolved
Comment       id, discussion_id, author_id, body (rich text), created_at, edited_at
Reaction      comment_id, user_id, emoji
              preuve : S11, API « comment »  — confiance : haute

Notification  id, user_id, type (mention | comment | invite | reminder | page_update | assignment),
              source_page_id, source_block_id, actor_id, read_at, archived_at
              preuve : S12, aide sur la barre latérale  — confiance : moyenne

PageVersion   id, page_id, snapshot (json), created_at, authors[]
              preuve : S13, prix (7/30/90 j)  — confiance : moyenne (stockage instantané vs journal : estimation)

Favorite      user_id, page_id, position
File          id, workspace_id, uploader_id, name, mime, size, storage_key
              preuve : prix (limite 5 Mo sur l'offre gratuite), API « file upload »  — confiance : haute

Template      id, scope (built-in | workspace | database), source_page_id
FormResponse  (= une nouvelle page dans la BDD ; pas d'entité dédiée)  — confiance : estimation
Automation    id, database_id, trigger (json), actions (json), enabled, created_by
              preuve : S34, prix  — confiance : moyenne
AIThread      id, user_id, workspace_id, messages (json), context_page_ids
              confiance : estimation
```

Relations : Workspace 1-n Membership n-1 User ; Workspace 1-n Teamspace 1-n Page ;
Page 1-n Page (sous-pages) ; Page 1-n Block 1-n Block (enfants) ; Database 1-n DataSource 1-n Page (lignes) ;
Database 1-n View ; Page 1-n Permission ; Page 1-n Discussion 1-n Comment ; Page 1-n PageVersion ;
propriété relation : Page n-n Page (entre deux data sources).

### Types de blocs (API)

Texte : paragraph, heading_1..4 (repliables), bulleted_list_item, numbered_list_item, to_do, toggle, quote, callout, code (langage), equation, divider.
Médias : image, video, audio, file, pdf, bookmark, embed, link_preview.
Structure : child_page, child_database, column_list / column, table / table_row, table_of_contents, breadcrumb, tab, synced_block, template (obsolète), meeting_notes.
Couleurs : default, gray, brown, orange, yellow, green, blue, purple, pink, red (+ variantes _background).

### Types de propriétés (API, 23)

title, rich_text, number (format), select, multi_select, status (options + groupes), date (plage, heure), people, files, checkbox, url, email, phone_number, place, relation (simple / double sens), rollup (fonction), formula, created_time, created_by, last_edited_time, last_edited_by, unique_id (préfixe), button, verification.

## Liste des fonctionnalités

Voir `features.csv`. Must : 45, should : 37, could : 25, skip : 9 (116 lignes).

## Hors périmètre (ne peut pas ou ne doit pas être cloné)

- **La galerie de modèles communautaire (Marketplace)** : c'est le contenu et le réseau de créateurs de Notion. On clone le mécanisme des modèles, pas le catalogue.
- **Les modèles IA et le « Notion AI » lui-même** : on branche ta propre clé (Claude, par exemple) ; les crédits Notion, les agents et le MCP Notion sont leurs services.
- **Les connecteurs de synchronisation (Jira, GitHub, Salesforce, Slack…)** : ce sont des accords et des intégrations partenaires. On pourra en refaire un ou deux via les API officielles, avec tes propres clés.
- **Notion Calendar, Notion Mail, l'app iOS des agents** : ce sont des produits distincts.
- **Les applications natives desktop et mobile** : la plateforme retenue est le web.
- **SAML SSO, SCIM, journal d'audit, DLP/SIEM, conformité entreprise** : inutiles pour un usage interne.
- **La marque, le logo, les illustrations, les textes et la police de Notion** : on refait tout avec des ressources libres ; `/replica-brand` le vérifiera.

## Taille

Écrans : 36. Parcours : 17. Entités : ~20.

Parties difficiles :
1. **L'éditeur par blocs.** Sélection entre blocs, glisser-déposer, imbrication, raccourcis Markdown, collage, annuler/rétablir. C'est 40 % du travail ; il faut s'appuyer sur une base existante (TipTap/ProseMirror ou BlockNote) au lieu de l'écrire de zéro.
2. **La collaboration en temps réel.** Plusieurs curseurs, édition simultanée sans conflit (CRDT type Yjs), présence.
3. **Le moteur de bases de données.** 23 types de propriétés, formules (un mini-langage), relations et rollups, filtres imbriqués, 8 vues, performance avec beaucoup de lignes.
4. **Les permissions héritées.** Les droits descendent l'arbre de pages, avec des exceptions par sous-page, des teamspaces et des invités.

Taille : **XL**. Il faut découper ; je propose ces phases, chacune utilisable seule :

| phase | contenu | taille |
| --- | --- | --- |
| 1. Cœur | compte, espace, sidebar, arbre de pages, éditeur par blocs (blocs texte + médias), « / », recherche, corbeille, favoris | M |
| 2. Équipe | partage et droits, invités, teamspaces, commentaires, mentions, boîte de réception, temps réel, historique | M-L |
| 3. Bases de données | propriétés, tableau, Kanban, liste, galerie, calendrier, filtres, tris, groupes, relations, rollups, formules | L |
| 4. Extras | chronologie, graphiques, formulaires, automatisations, modèles, import/export, publication web | M |
| 5. IA | assistant dans l'éditeur et chat avec ta propre clé API | S-M |
