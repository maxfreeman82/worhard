// Contenu de départ d'un nouvel espace. Rédigé pour ce projet.
import { blocksToText } from "./text";
import type { Page, Section } from "./types";

type SeedPage = Page & { position: number; contentVersion: number };

export function seedPages(workspaceId: string, userId: string): SeedPage[] {
  const t = new Date().toISOString();
  const ids = {
    guide: crypto.randomUUID(),
    shortcuts: crypto.randomUUID(),
    projects: crypto.randomUUID(),
    launch: crypto.randomUUID(),
    notes: crypto.randomUUID(),
    week: crypto.randomUUID(),
  };

  const make = (
    id: string,
    parentId: string | null,
    section: Section,
    position: number,
    title: string,
    icon: string | null,
    content: unknown[],
  ): SeedPage => ({
    id,
    workspaceId,
    parentId,
    section,
    title,
    icon,
    coverUrl: null,
    coverPosition: 0.5,
    fullWidth: false,
    smallText: false,
    font: "default",
    isLocked: false,
    content,
    contentText: blocksToText(content),
    inTrash: false,
    trashedAt: null,
    createdAt: t,
    updatedAt: t,
    lastEditedBy: userId,
    position,
    contentVersion: 0,
  });

  return [
    make(ids.guide, null, "workspace", 1, "Guide de démarrage", "👋", [
      { type: "paragraph", content: "Cet espace rassemble vos documents, vos notes et vos projets. Chaque page est faite de blocs que vous pouvez déplacer, transformer et imbriquer." },
      { type: "callout", props: { emoji: "💡", backgroundColor: "blue" }, content: "Tapez / dans une ligne vide pour choisir un type de bloc : titre, liste, tâche, code, image…" },
      { type: "heading", props: { level: 2 }, content: "Pour commencer" },
      { type: "checkListItem", props: { checked: true }, content: "Ouvrir ce guide" },
      { type: "checkListItem", props: { checked: false }, content: "Créer une page avec le bouton « Nouvelle page » de la barre latérale" },
      { type: "checkListItem", props: { checked: false }, content: "Glisser une page sur une autre dans la barre latérale pour la ranger dedans" },
      { type: "checkListItem", props: { checked: false }, content: "Retrouver n'importe quelle page avec Ctrl+K" },
      { type: "heading", props: { level: 2 }, content: "Organiser" },
      { type: "toggleListItem", content: "Pages et sous-pages", children: [
        { type: "paragraph", content: "Une page peut en contenir d'autres, sans limite de profondeur. Le fil d'Ariane en haut indique toujours où vous êtes." },
      ] },
      { type: "toggleListItem", content: "Favoris", children: [
        { type: "paragraph", content: "L'étoile en haut à droite d'une page l'épingle dans la section Favoris de la barre latérale." },
      ] },
      { type: "toggleListItem", content: "Corbeille", children: [
        { type: "paragraph", content: "Une page supprimée reste 30 jours dans la corbeille avant d'être effacée. Vous pouvez la restaurer à tout moment." },
      ] },
      { type: "page", props: { pageId: ids.shortcuts } },
    ]),
    make(ids.shortcuts, ids.guide, "workspace", 1, "Raccourcis clavier", "⌨️", [
      { type: "paragraph", content: "Les raccourcis Markdown fonctionnent au début d'une ligne :" },
      { type: "bulletListItem", content: "# , ## , ### pour les titres" },
      { type: "bulletListItem", content: "- ou * pour une liste à puces, 1. pour une liste numérotée" },
      { type: "bulletListItem", content: "[] pour une case à cocher, > pour un bloc repliable" },
      { type: "bulletListItem", content: "``` pour un bloc de code" },
      { type: "heading", props: { level: 3 }, content: "Navigation" },
      { type: "table", content: { type: "tableContent", rows: [
        { cells: ["Raccourci", "Action"] },
        { cells: ["Ctrl+K", "Rechercher une page"] },
        { cells: ["Ctrl+\\", "Masquer ou afficher la barre latérale"] },
        { cells: ["Ctrl+Z", "Annuler"] },
        { cells: ["Tab / Maj+Tab", "Imbriquer ou désimbriquer un bloc"] },
      ] } },
    ]),
    make(ids.projects, null, "workspace", 2, "Projets", "🗂️", [
      { type: "paragraph", content: "Une page par projet. Les bases de données arriveront dans une prochaine version ; en attendant, les sous-pages font l'affaire." },
      { type: "page", props: { pageId: ids.launch } },
    ]),
    make(ids.launch, ids.projects, "workspace", 1, "Lancement du site", "🚀", [
      { type: "heading", props: { level: 2 }, content: "Objectif" },
      { type: "paragraph", content: "Mettre en ligne la nouvelle version du site avant la fin du trimestre." },
      { type: "heading", props: { level: 2 }, content: "Étapes" },
      { type: "numberedListItem", content: "Valider les maquettes" },
      { type: "numberedListItem", content: "Rédiger les textes des pages principales" },
      { type: "numberedListItem", content: "Tester sur mobile" },
      { type: "quote", content: "Livrer petit, puis améliorer." },
    ]),
    make(ids.notes, null, "private", 1, "Notes personnelles", "📓", [
      { type: "paragraph", content: "Les pages de la section Privé ne sont visibles que par vous." },
    ]),
    make(ids.week, null, "private", 2, "Tâches de la semaine", "✅", [
      { type: "checkListItem", props: { checked: false }, content: "Préparer la réunion de lundi" },
      { type: "checkListItem", props: { checked: false }, content: "Relire le document de cadrage" },
      { type: "checkListItem", props: { checked: true }, content: "Répondre aux e-mails en attente" },
    ]),
  ];
}
