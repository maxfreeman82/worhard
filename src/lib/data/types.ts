// Types partagés par la couche de données (locale aujourd'hui, Neon ensuite).
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

/** Niveau d'accès à une page, du plus faible au plus fort. */
export type AccessLevel = "can_view" | "can_comment" | "can_edit" | "full_access";

/** Rôle dans l'espace. `access` plafonne les pages partagées pour un membre (lecture seule ou édition). */
export type Membership = { role: "owner" | "admin" | "member" | "guest"; access: AccessLevel };

/** Où en est le compte : en attente de validation par l'enseignant, validé ou retiré. */
export type AccountState = { status: "pending" | "approved" | "removed"; canCreateWorkspace: boolean; pendingRequests: number };

/** Compte créé par un étudiant, en attente de validation. */
export type ClassRequest = { id: string; name: string; email: string; createdAt: string };

/** Rôle choisi dans l'admin pour un étudiant (le propriétaire de l'espace a « owner »). */
export type ClassRole = "viewer" | "editor" | "admin";
export type ClassMember = { id: string; name: string; email: string; role: ClassRole | "owner"; you: boolean };
export type ClassInvite = { id: string; name: string; email: string; role: ClassRole; createdAt: string };

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
  createdBy?: string | null;
  /** Page conteneur d'une base de données : id de la base. */
  databaseOwnerOf?: string | null;
  /** Ligne d'une base de données : id de la base (la page n'a alors pas de parent dans l'arbre). */
  rowOf?: string | null;
  /** Valeurs des propriétés d'une ligne : { [propertyId]: valeur }. */
  props?: Record<string, PropValue>;
  /** Accès de l'utilisateur, calculé par le serveur (absent pour une page créée sur cet appareil : la sienne). */
  access?: AccessLevel;
};

/** Ce que la sidebar et les listes affichent : pas le contenu. */
export type PageSummary = Pick<
  Page,
  "id" | "parentId" | "section" | "title" | "icon" | "inTrash" | "trashedAt" | "updatedAt" | "databaseOwnerOf" | "rowOf"
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

/* ------------------------------------------------------------ bases de données */

export type PropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "person"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "files"
  | "relation"
  | "rollup"
  | "created_time"
  | "created_by"
  | "last_edited_time"
  | "last_edited_by"
  | "unique_id";

export type OptionColor = "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";
export type SelectOption = { id: string; name: string; color: OptionColor };
export type StatusGroup = { id: string; name: string; color: OptionColor; optionIds: string[] };

export type NumberFormat = "number" | "comma" | "percent" | "euro" | "dollar";
export type RollupFn =
  | "count"
  | "count_values"
  | "count_empty"
  | "count_not_empty"
  | "percent_empty"
  | "percent_not_empty"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "earliest"
  | "latest"
  | "show_original";

export type PropertyConfig = {
  options?: SelectOption[];
  groups?: StatusGroup[];
  numberFormat?: NumberFormat;
  /** Relation : base cible ; `pairedPropertyId` = propriété miroir dans la cible (relation à double sens). */
  relation?: { databaseId: string; pairedPropertyId?: string | null };
  rollup?: { relationPropertyId: string; targetPropertyId: string; fn: RollupFn };
  prefix?: string;
};

export type Property = { id: string; name: string; type: PropertyType; config: PropertyConfig };

export type DateValue = { start: string; end?: string | null; time?: boolean };
export type FileValue = { name: string; url: string };
export type PropValue = string | number | boolean | string[] | DateValue | FileValue[] | null;

export type Database = {
  id: string;
  /** Page qui contient la base (son titre est celui de la base). */
  pageId: string;
  inline: boolean;
  properties: Property[];
  nextUniqueId: number;
};

export type ViewType = "table" | "board" | "list" | "gallery" | "calendar";

export type FilterOp =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after";

export type Filter = { id: string; propertyId: string; op: FilterOp; value: PropValue };
export type FilterGroup = { id: string; mode: "and" | "or"; items: (Filter | FilterGroup)[] };
export type Sort = { propertyId: string; dir: "asc" | "desc" };
export type CalcFn =
  | "none"
  | "count"
  | "count_values"
  | "count_empty"
  | "count_not_empty"
  | "percent_empty"
  | "percent_not_empty"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "checked"
  | "unchecked";

export type ViewConfig = {
  filter: FilterGroup;
  sorts: Sort[];
  groupBy?: string | null;
  hiddenGroups?: string[];
  hideEmptyGroups?: boolean;
  /** Propriétés affichées, dans l'ordre. La propriété titre est toujours affichée. */
  visible: string[];
  widths?: Record<string, number>;
  dateProperty?: string | null;
  cardCover?: "none" | "cover" | "content";
  openIn?: "side" | "center" | "full";
  calcs?: Record<string, CalcFn>;
  wrapCells?: boolean;
};

export type View = { id: string; databaseId: string; name: string; type: ViewType; position: number; config: ViewConfig };
