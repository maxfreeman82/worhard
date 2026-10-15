# Composants

Construits dans `src/components/ui/`, visibles sur `/design` (captures dans `shots/`).
Base accessible : Radix UI (menus, popovers, modales, info-bulles, toasts, cases, interrupteurs).
Icônes : Lucide (ISC). Aucune icône, illustration ni police de l'original.
Toutes les couleurs passent par les tokens (`bg-surface`, `text-muted`…) : la palette Tailwind par défaut est désactivée.
Focus : anneau unique 2 px `focus`, visible au clavier seulement (`:focus-visible`, global).

```
Button                                              button.tsx
  variants  primary, secondary, ghost, danger
  sizes     sm 28px, md 32px, lg 40px
  states    default, hover, active (ghost), focus-visible, disabled (50 %), loading (spinner + aria-busy)
  tokens    primary: bg accent / text on-accent / hover accent-hover ; radius sm ; text sm/500
  a11y      vrai <button type="button"> ; en chargement, le libellé reste lu
  used on   S01, S02, S10, S27, S30, S31, partout

IconButton                                          button.tsx
  sizes     sm 24px, md 28px
  states    default (text-muted), hover (surface-hover, text fg), active, focus-visible, disabled
  a11y      label obligatoire -> aria-label + title ; à envelopper dans Tooltip quand il y a un raccourci
  used on   S03 topbar et sidebar, S05 poignée ⋮⋮ et « + », S16 barres d'outils

Input / SearchInput                                 field.tsx
  height    32px ; border border-input (3:1) ; radius sm
  states    default, focus (outline focus), error (border danger + message), disabled, avec icône de tête
  a11y      <label for>, aria-invalid, aria-describedby vers l'aide ou l'erreur
  used on   S01, S09, S10, S24, S30, S31

Checkbox                                            field.tsx
  16px ; coché : bg accent + coche on-accent ; disabled
  a11y      Radix Checkbox (role checkbox, Espace) + <label>
  used on   S05 bloc to-do, S16 propriété case, S23

Switch                                              field.tsx
  28×16 ; off border-input, on accent
  a11y      Radix Switch (role switch) + <label>
  used on   S05 options de page, S10 publication, S30 réglages

Menu (MenuContent, MenuItem, MenuCheckItem, MenuSub, MenuLabel, MenuSeparator)   overlay.tsx
  panneau   min 220 / max 320px, radius md, shadow pop, padding 4
  item      28px ; icône 16px muted ; raccourci xs muted à droite ; danger en text-danger
  states    highlighted (surface-hover), disabled, coché, sous-menu ouvert
  a11y      flèches, Entrée, Échap, saisie pour aller à un item ; focus rendu au déclencheur à la fermeture
  used on   S05 menu ⋯ de page, S08 menu de bloc, S03 menu de page de la sidebar, S16 menus de colonne

Popover                                             overlay.tsx
  radius md, shadow pop, align start, offset 4
  a11y      Échap ferme, focus rendu au déclencheur
  used on   S07 lien, S05 icône et couverture, S16 édition de cellule, S23 filtres et tris, S24

Modal                                               overlay.tsx
  sizes     sm 400, md 560, lg 860 ; en haut à 12vh ; voile noir 60 % ; radius xl ; shadow modal
  states    ouverte, défilement interne (max 76vh)
  a11y      Radix Dialog : titre obligatoire (masquable avec hideTitle), focus piégé, Échap, retour du focus
  à faire   mettre autoFocus sur le premier champ (aujourd'hui le focus va sur « Fermer »)
  used on   S09 recherche, S10 partage, S13 historique, S15 modèles, S30 réglages

Tooltip                                             overlay.tsx
  inversé (bg fg, text bg), xs/500, délai 500 ms, raccourci à 70 %
  used on   tous les IconButton

Toast (ToastProvider, useToast)                     display.tsx
  tones     info / succès (inversé), erreur (bg danger) ; action optionnelle (« Annuler »)
  4 s, en bas au centre ; glisser vers le bas pour fermer
  a11y      Radix Toast (région live) ; les erreurs sont annoncées en priorité
  used on   corbeille (annuler), copie de lien, erreurs d'enregistrement

Tag                                                 display.tsx
  variants  10 couleurs de contenu ; pastille (statut) ; bouton retirer
  20px, radius xs, texte fg sur fond block-*-bg (tous ≥ 4.5:1)
  used on   S16-S26 select, multi-select, statut

Callout                                             display.tsx
  icône emoji + texte ; fond block-*-bg ; padding 16 ; radius sm
  used on   S05 bloc callout

Couleurs de contenu (blockText, blockBg)            display.tsx
  9 couleurs + défaut, texte et fond, clair et sombre ; toutes ≥ 4.5:1 sur la page
  used on   S07 couleur du texte, S08 couleur du bloc, tags

SidebarItem / SidebarSection                        display.tsx
  30px ; retrait 12px par niveau ; icône 22px remplacée par le chevron au survol
  states    default (muted), hover, actif (surface-hover + fg/500), déplié, actions ⋯ et + au survol ou au focus
  a11y      lien avec aria-current="page" ; chevron = bouton aria-expanded ; actions atteignables au clavier
  à faire   glisser-déposer (phase 1) ; arbre ARIA (role tree) quand le chargement à la demande sera branché
  used on   S03

ViewTabs                                            display.tsx
  40px ; onglet actif souligné 2px fg ; défilement horizontal si trop d'onglets
  a11y      role tablist / tab, aria-selected
  used on   S16-S22

Breadcrumb                                          display.tsx
  sm ; séparateur « / » ; tronqué ; dernier item aria-current
  used on   S05 topbar

Avatar / AvatarStack                                display.tsx
  initiale sur surface si pas d'image ; pastille en ligne (success) ; pile avec +N
  used on   S05 présence, S10, S11, S16 propriété personne, S31

Kbd, Spinner, Skeleton, EmptyState                  display.tsx
  EmptyState : icône muted, titre sm/500, texte muted, action optionnelle
  used on   S14 corbeille vide, S04 nouvel espace, S12 boîte vide, S16 BDD vide, S09 aucun résultat
```

## Manquants, à construire avec les écrans

| composant | écran | note |
| --- | --- | --- |
| Éditeur de blocs, menu « / », barre de mise en forme, poignée ⋮⋮ | S05-S08 | fournis par BlockNote, restylés avec ces tokens |
| Sélecteur d'icône (emoji) et couverture | S05 | popover + grille |
| Sélecteur de date | S16, S20 | à faire avec la phase 3 |
| Sélecteur de personne | S10, S16 | combobox Radix Popover + liste filtrable |
| Cellule de propriété (23 types) | S16-S26 | phase 3 |
| Carte Kanban / galerie | S17, S19 | phase 3 |
| Aperçu latéral / centré | S26 | phase 3 |
| Fil de commentaires | S11 | phase 2 |

## Vérifications

- Contraste : `python -X utf8 ~/.claude/skills/replica-design/contrast.py replica/design/tokens.json` -> 75 paires, 0 échec AA (`contrast-report.txt`).
- `/design` en clair, en sombre et sur mobile (390px, aucun débordement horizontal) ; menu et sous-menu ouverts au clavier ; modale avec focus piégé : voir `shots/`.
