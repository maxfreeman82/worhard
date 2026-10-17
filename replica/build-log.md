# Journal de construction

Front d'abord, sans serveur : les données vivent dans le navigateur (`src/lib/data/local.ts`,
localStorage + IndexedDB pour les fichiers) derrière les mêmes opérations que l'API prévue
(`replica/architecture.md`). `/replica-backend` remplacera ce fichier par Neon sans toucher aux écrans.

Vérifié le 2026-10-15 : `tsc`, `eslint`, `next build` sans erreur ; `replica/e2e/flow.mjs` (23 contrôles)
et `replica/e2e/dnd.mjs` (4 contrôles) passent dans Chrome, sans erreur console. Captures dans `replica/clone-screens/`.

| écran | date | état | ce qui manque | plus dur que prévu |
| --- | --- | --- | --- | --- |
| S01 Connexion | 2026-10-15 | partiel | aucun e-mail envoyé (tout code à 6 chiffres accepté) ; pas de Google | — |
| S02 Onboarding | 2026-10-15 | fait | — | — |
| S03 Coquille et sidebar | 2026-10-15 | fait | section « Partagé » (phase 2) ; navigation au clavier dans l'arbre (flèches) | glisser-déposer natif : zones avant / dedans / après, refus des boucles |
| S04 Accueil | 2026-10-15 | fait | tâches assignées (phase 3) | — |
| S05 Éditeur de page | 2026-10-15 | fait | colonnes (paquet BlockNote sous GPL, laissé de côté) ; table des matières | Next 16 garde les 3 dernières pages montées mais cachées (Activity) : l'éditeur enregistre quand il est masqué |
| S06 Menu « / » | 2026-10-15 | fait | — | les blocs maison créaient un 2e groupe « Blocs de base » |
| S07 Barre de mise en forme | 2026-10-15 | fait (BlockNote) | commentaire (phase 2) | — |
| S08 Menu de bloc | 2026-10-15 | partiel | « Dupliquer » | — |
| S09 Recherche | 2026-10-15 | fait | filtres (auteur, date) | — |
| S12 Boîte de réception | 2026-10-15 | coquille | tout (phase 2) | — |
| S13 Historique | — | à faire | phase 2 | — |
| S14 Corbeille | 2026-10-15 | fait | — | restaurer une sous-page dont le parent est encore à la corbeille |
| S15 Modèles | 2026-10-15 | partiel | modèles créés par l'utilisateur | — |
| S30 Réglages | 2026-10-15 | partiel | membres, sécurité, import / export | — |
| S36 Page introuvable | 2026-10-15 | fait | « accès refusé » (phase 2) | — |
| S16 Tableau | 2026-10-17 | fait | colonne figée | cellules : un éditeur par type (14 au total), dans un popover ancré à la cellule |
| S17 Kanban | 2026-10-17 | fait | réordonner dans une colonne | — |
| S18 Liste | 2026-10-17 | fait | — | — |
| S19 Galerie | 2026-10-17 | fait | — | — |
| S20 Calendrier | 2026-10-17 | fait | vue semaine | plages de dates sur plusieurs jours ; déplacer garde la durée |
| S21 Chronologie | — | à faire | phase 4 | — |
| S22 Graphique | — | à faire | phase 4 | — |
| S23 Réglages de vue | 2026-10-17 | fait | sous-groupes ; filtre « pour moi seul » | filtres ET/OU sur 3 niveaux |
| S24 Éditeur de propriété | 2026-10-17 | fait | — | changement de type avec conversion des valeurs |
| S25 Éditeur de formule | — | à faire | tout | il faut écrire un mini-langage : plus gros qu'il n'y paraît |
| S26 Aperçu d'une ligne | 2026-10-17 | fait | — | — |

Bugs trouvés et corrigés pendant la vérification :

- l'anneau de focus global écrasait `outline-none` (règle hors `@layer`) : déplacé dans `@layer base` ;
- titres de l'éditeur plus grands que l'échelle des tokens : alignés (h1 30, h2 24, h3 20) ;
- composant défini dans un autre composant (réglages) : les champs perdaient le focus à chaque frappe.

Vérifié le 2026-10-17 (phase 3) : `npm test` (13 tests du moteur de requêtes), `replica/e2e/db.mjs` (22 contrôles)
et les parcours de la phase 1 (`flow.mjs`, `dnd.mjs`) repassent, sans erreur console.
Bug trouvé : le menu « / » ne trouvait pas « base de données » tapé sans accent ; alias sans accents ajoutés.

Score de parité (`parity.py`) : 57.7 / 100, 31 must-haves sur 45 (avant la phase 3 : 35.9, 21 sur 45). Les 14 manquants relèvent surtout
de la phase 2 (partage, collaboration, temps réel), plus l'envoi réel du code de connexion.
