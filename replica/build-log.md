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

Bugs trouvés et corrigés pendant la vérification :

- l'anneau de focus global écrasait `outline-none` (règle hors `@layer`) : déplacé dans `@layer base` ;
- titres de l'éditeur plus grands que l'échelle des tokens : alignés (h1 30, h2 24, h3 20) ;
- composant défini dans un autre composant (réglages) : les champs perdaient le focus à chaque frappe.

Score de parité (`parity.py`) : 35.9 / 100, 21 must-haves sur 45. Les 24 manquants sont les phases 2 (partage,
collaboration) et 3 (bases de données), plus l'envoi réel du code de connexion.
