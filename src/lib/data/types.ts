// Types partagés par la couche de données (locale aujourd'hui, Supabase ensuite).
// Les écrans n'importent que ces types et les fonctions de `@/lib/data`.

export type Theme = "system" | "light" | "dark";

export type Profile = {
  id: string;
  email: string;
  name: string;
  theme: Theme;
};

export type Workspace = {
  id: string;
  name: string;
  icon: string | null;
};

/** Racine d'une page de premier niveau : section « Espace de travail » (partagée) ou « Privé ». */
export type Section = "workspace" | "private";

export type PageFont = "default" | "serif" | "mono";

/** Document de l'éditeur (blocs BlockNote). Opaque pour la couche de données. */
export type PageContent = unknown[];

export type Page = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  section: Section;
  title: string;
  icon: string | null;
  coverUrl: string | null;
  coverPosition: number;
  fullWidth: boolean;
  smallText: boolean;
  font: PageFont;
  isLocked: boolean;
  content: PageContent;
  contentText: string;
  inTrash: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastEditedBy: string | null;
};

/** Ce que la sidebar et les listes affichent : pas le contenu. */
export type PageSummary = Pick<
  Page,
  "id" | "parentId" | "section" | "title" | "icon" | "inTrash" | "trashedAt" | "updatedAt"
> & { hasChildren: boolean };

export type PageMeta = Partial<
  Pick<Page, "title" | "icon" | "coverUrl" | "coverPosition" | "fullWidth" | "smallText" | "font" | "isLocked">
>;

/** Où placer une page : sous un parent (ou à la racine d'une section), à un index parmi ses sœurs. */
export type Placement = { parentId: string | null; section: Section; index?: number };

export type SearchHit = { page: PageSummary; path: PageSummary[]; snippet: string | null };

export type SaveResult = { ok: true; version: number } | { ok: false; reason: "conflict" | "locked" | "not_found" | "quota" };

export class DataError extends Error {
  constructor(
    public code: "not_found" | "invalid_move" | "quota" | "unauthenticated",
    message: string,
  ) {
    super(message);
  }
}
