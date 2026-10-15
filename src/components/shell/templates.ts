// Modèles de page intégrés. Contenu rédigé pour ce projet.

export type Template = {
  title: string;
  icon: string;
  description: string;
  outline: string[];
  content: () => unknown[];
};

const today = () => new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export const TEMPLATES: Template[] = [
  {
    title: "Compte rendu de réunion",
    icon: "🗒️",
    description: "Participants, décisions et actions à suivre, pour ne rien perdre après une réunion.",
    outline: ["Infos pratiques", "Ordre du jour", "Décisions", "Actions"],
    content: () => [
      { type: "callout", props: { emoji: "📅", backgroundColor: "gray" }, content: `Réunion du ${today()}` },
      { type: "heading", props: { level: 2 }, content: "Participants" },
      { type: "bulletListItem", content: "" },
      { type: "heading", props: { level: 2 }, content: "Ordre du jour" },
      { type: "numberedListItem", content: "" },
      { type: "heading", props: { level: 2 }, content: "Décisions" },
      { type: "bulletListItem", content: "" },
      { type: "heading", props: { level: 2 }, content: "Actions" },
      { type: "checkListItem", props: { checked: false }, content: "" },
    ],
  },
  {
    title: "Journal quotidien",
    icon: "🌤️",
    description: "Trois questions pour démarrer la journée et une pour la clore.",
    outline: ["Priorités du jour", "Notes", "Bilan"],
    content: () => [
      { type: "heading", props: { level: 2 }, content: today() },
      { type: "heading", props: { level: 3 }, content: "Les trois priorités" },
      { type: "checkListItem", props: { checked: false }, content: "" },
      { type: "checkListItem", props: { checked: false }, content: "" },
      { type: "checkListItem", props: { checked: false }, content: "" },
      { type: "heading", props: { level: 3 }, content: "Notes" },
      { type: "paragraph", content: "" },
      { type: "heading", props: { level: 3 }, content: "Ce qui s'est bien passé" },
      { type: "paragraph", content: "" },
    ],
  },
  {
    title: "Fiche projet",
    icon: "🎯",
    description: "Le pourquoi, le quoi et le quand d'un projet sur une seule page.",
    outline: ["Contexte", "Objectifs", "Périmètre", "Calendrier", "Risques"],
    content: () => [
      { type: "heading", props: { level: 2 }, content: "Contexte" },
      { type: "paragraph", content: "Pourquoi ce projet, pourquoi maintenant ?" },
      { type: "heading", props: { level: 2 }, content: "Objectifs" },
      { type: "bulletListItem", content: "" },
      { type: "heading", props: { level: 2 }, content: "Hors périmètre" },
      { type: "bulletListItem", content: "" },
      { type: "heading", props: { level: 2 }, content: "Calendrier" },
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [{ cells: ["Étape", "Date", "Responsable"] }, { cells: ["", "", ""] }, { cells: ["", "", ""] }],
        },
      },
      { type: "heading", props: { level: 2 }, content: "Risques" },
      { type: "toggleListItem", content: "Risque 1", children: [{ type: "paragraph", content: "Impact, probabilité, parade." }] },
    ],
  },
  {
    title: "Documentation technique",
    icon: "🛠️",
    description: "Une structure simple pour documenter un service ou un outil interne.",
    outline: ["Vue d'ensemble", "Installation", "Utilisation", "Dépannage"],
    content: () => [
      { type: "callout", props: { emoji: "ℹ️", backgroundColor: "blue" }, content: "Responsable : · Dernière revue :" },
      { type: "heading", props: { level: 2 }, content: "Vue d'ensemble" },
      { type: "paragraph", content: "" },
      { type: "heading", props: { level: 2 }, content: "Installation" },
      { type: "codeBlock", props: { language: "bash" }, content: "npm install" },
      { type: "heading", props: { level: 2 }, content: "Utilisation" },
      { type: "paragraph", content: "" },
      { type: "heading", props: { level: 2 }, content: "Dépannage" },
      { type: "toggleListItem", content: "Problème fréquent", children: [{ type: "paragraph", content: "Solution." }] },
    ],
  },
];
