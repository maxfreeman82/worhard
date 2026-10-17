// Moteur de requêtes des bases de données : valeurs calculées, filtres, tris, groupes, calculs.
// Fonctions pures : elles ne lisent les autres bases qu'à travers le Resolver (relations, agrégations).

import type {
  CalcFn,
  Database,
  DateValue,
  FileValue,
  Filter,
  FilterGroup,
  FilterOp,
  NumberFormat,
  OptionColor,
  Page,
  Property,
  PropertyType,
  PropValue,
  RollupFn,
  View,
} from "@/lib/data/types";
import type { Resolver } from "@/lib/data";

/** Valeur d'une cellule, calculée pour les propriétés automatiques et les agrégations. */
export type CellValue = PropValue | (string | number | null)[];

const EMPTY_FILTER: FilterGroup = { id: "root", mode: "and", items: [] };

export function cellValue(row: Page, prop: Property, resolve: Resolver, depth = 0): CellValue {
  switch (prop.type) {
    case "title":
      return row.title;
    case "created_time":
      return row.createdAt;
    case "last_edited_time":
      return row.updatedAt;
    case "created_by":
      return row.createdBy ? [row.createdBy] : [];
    case "last_edited_by":
      return row.lastEditedBy ? [row.lastEditedBy] : [];
    case "rollup":
      return depth > 2 ? null : rollupValue(row, prop, resolve, depth);
    default:
      return row.props?.[prop.id] ?? null;
  }
}

/* -------------------------------------------------------------- texte */

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Une date « jour » (AAAA-MM-JJ) est lue en heure locale pour ne pas changer de jour selon le fuseau. */
export function parseDay(s: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
}

export function formatDate(v: DateValue | string | null | undefined): string {
  if (!v) return "";
  if (typeof v === "string") return dateTimeFmt.format(new Date(v));
  const one = (s: string) => (v.time ? dateTimeFmt : dateFmt).format(parseDay(s));
  return v.end ? `${one(v.start)} → ${one(v.end)}` : one(v.start);
}

export function formatNumber(n: number | null | undefined, format: NumberFormat = "number"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  switch (format) {
    case "comma":
      return new Intl.NumberFormat("fr-FR").format(n);
    case "percent":
      return new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 2 }).format(n / 100);
    case "euro":
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
    case "dollar":
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(n);
    default:
      return String(n);
  }
}

export function optionOf(prop: Property, id: unknown) {
  return prop.config.options?.find((o) => o.id === id) ?? null;
}

export function toText(v: CellValue, prop: Property, resolve: Resolver): string {
  if (v === null || v === undefined) return "";
  switch (prop.type) {
    case "select":
    case "status":
      return optionOf(prop, v)?.name ?? "";
    case "multi_select":
      return (v as string[]).map((id) => optionOf(prop, id)?.name ?? "").filter(Boolean).join(", ");
    case "date":
      return formatDate(v as DateValue);
    case "created_time":
    case "last_edited_time":
      return formatDate(v as string);
    case "checkbox":
      return v ? "Oui" : "Non";
    case "number":
      return formatNumber(v as number, prop.config.numberFormat);
    case "person":
    case "created_by":
    case "last_edited_by":
      return (v as string[]).map((id) => resolve.person(id)?.name ?? "").filter(Boolean).join(", ");
    case "relation":
      return (v as string[]).map((id) => resolve.page(id)?.title || "Sans titre").join(", ");
    case "files":
      return (v as FileValue[]).map((f) => f.name).join(", ");
    case "unique_id":
      return `${prop.config.prefix ? prop.config.prefix + "-" : ""}${v}`;
    case "rollup":
      return Array.isArray(v) ? v.filter((x) => x !== null && x !== "").join(", ") : String(v);
    default:
      return String(v);
  }
}

export function isEmpty(v: CellValue): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/* --------------------------------------------------------- agrégations */

export const ROLLUP_LABELS: Record<RollupFn, string> = {
  show_original: "Afficher les valeurs",
  count: "Compter tout",
  count_values: "Compter les valeurs",
  count_empty: "Compter les vides",
  count_not_empty: "Compter les non vides",
  percent_empty: "Pourcentage de vides",
  percent_not_empty: "Pourcentage de non vides",
  sum: "Somme",
  average: "Moyenne",
  min: "Minimum",
  max: "Maximum",
  earliest: "Date la plus ancienne",
  latest: "Date la plus récente",
};

function rollupValue(row: Page, prop: Property, resolve: Resolver, depth: number): CellValue {
  const cfg = prop.config.rollup;
  if (!cfg) return null;
  const ids = (row.props?.[cfg.relationPropertyId] as string[] | undefined) ?? [];
  const sourceDb = resolve.database(row.rowOf ?? "");
  const relProp = sourceDb?.properties.find((p) => p.id === cfg.relationPropertyId);
  const targetDb = relProp?.config.relation ? resolve.database(relProp.config.relation.databaseId) : null;
  const target = targetDb?.properties.find((p) => p.id === cfg.targetPropertyId);
  if (!target) return null;
  const pages = ids.map((id) => resolve.page(id)).filter((p): p is Page => !!p && !p.inTrash);
  const values = pages.map((p) => cellValue(p, target, resolve, depth + 1));
  const nums = values.map(numberOf).filter((n): n is number => n !== null);
  const dates = values.map(dateOf).filter((d): d is number => d !== null);
  const empty = values.filter(isEmpty).length;
  const pct = (n: number) => (values.length ? Math.round((n / values.length) * 100) : 0);
  switch (cfg.fn) {
    case "count":
      return values.length;
    case "count_values":
      return values.flatMap((v) => (Array.isArray(v) ? (v as unknown[]) : [v])).filter((v) => !isEmpty(v as CellValue)).length;
    case "count_empty":
      return empty;
    case "count_not_empty":
      return values.length - empty;
    case "percent_empty":
      return `${pct(empty)} %`;
    case "percent_not_empty":
      return `${pct(values.length - empty)} %`;
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "average":
      return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
    case "min":
      return nums.length ? Math.min(...nums) : null;
    case "max":
      return nums.length ? Math.max(...nums) : null;
    case "earliest":
      return dates.length ? dateFmt.format(new Date(Math.min(...dates))) : null;
    case "latest":
      return dates.length ? dateFmt.format(new Date(Math.max(...dates))) : null;
    default:
      return values.map((v) => toText(v, target, resolve));
  }
}

function numberOf(v: CellValue): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}

function dateOf(v: CellValue): number | null {
  if (v && typeof v === "object" && !Array.isArray(v) && "start" in v) return parseDay((v as DateValue).start).getTime();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return parseDay(v).getTime();
  return null;
}

/* ------------------------------------------------------------- filtres */

type OpDef = { op: FilterOp; label: string; needsValue: boolean };

const TEXT_OPS: OpDef[] = [
  { op: "contains", label: "contient", needsValue: true },
  { op: "not_contains", label: "ne contient pas", needsValue: true },
  { op: "is", label: "est", needsValue: true },
  { op: "is_not", label: "n'est pas", needsValue: true },
  { op: "starts_with", label: "commence par", needsValue: true },
  { op: "ends_with", label: "finit par", needsValue: true },
  { op: "is_empty", label: "est vide", needsValue: false },
  { op: "is_not_empty", label: "n'est pas vide", needsValue: false },
];
const EMPTY_OPS: OpDef[] = [
  { op: "is_empty", label: "est vide", needsValue: false },
  { op: "is_not_empty", label: "n'est pas vide", needsValue: false },
];

export function filterOps(type: PropertyType): OpDef[] {
  switch (type) {
    case "number":
    case "unique_id":
      return [
        { op: "eq", label: "=", needsValue: true },
        { op: "neq", label: "≠", needsValue: true },
        { op: "gt", label: ">", needsValue: true },
        { op: "lt", label: "<", needsValue: true },
        { op: "gte", label: "≥", needsValue: true },
        { op: "lte", label: "≤", needsValue: true },
        ...EMPTY_OPS,
      ];
    case "select":
    case "status":
      return [{ op: "is", label: "est", needsValue: true }, { op: "is_not", label: "n'est pas", needsValue: true }, ...EMPTY_OPS];
    case "multi_select":
    case "person":
    case "relation":
    case "created_by":
    case "last_edited_by":
      return [{ op: "contains", label: "contient", needsValue: true }, { op: "not_contains", label: "ne contient pas", needsValue: true }, ...EMPTY_OPS];
    case "checkbox":
      return [{ op: "is", label: "est", needsValue: true }];
    case "date":
    case "created_time":
    case "last_edited_time":
      return [
        { op: "is", label: "est le", needsValue: true },
        { op: "before", label: "est avant le", needsValue: true },
        { op: "after", label: "est après le", needsValue: true },
        { op: "on_or_before", label: "est le ou avant le", needsValue: true },
        { op: "on_or_after", label: "est le ou après le", needsValue: true },
        ...EMPTY_OPS,
      ];
    case "files":
      return EMPTY_OPS;
    default:
      return TEXT_OPS;
  }
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function dayKey(v: CellValue): string | null {
  if (!v) return null;
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date(v).toLocaleDateString("sv-SE");
  if (typeof v === "object" && !Array.isArray(v) && "start" in v) return (v as DateValue).start.slice(0, 10);
  return null;
}

export function matchFilter(row: Page, f: Filter, db: Database, resolve: Resolver): boolean {
  const prop = db.properties.find((p) => p.id === f.propertyId);
  if (!prop) return true;
  const v = cellValue(row, prop, resolve);
  const op = f.op;
  if (op === "is_empty") return isEmpty(v);
  if (op === "is_not_empty") return !isEmpty(v);
  // Un filtre sans valeur ne filtre rien (il vient d'être ajouté).
  if (f.value === null || f.value === undefined || f.value === "") return prop.type === "checkbox" ? !v : true;

  switch (prop.type) {
    case "number":
    case "unique_id": {
      const a = typeof v === "number" ? v : null;
      const b = Number(f.value);
      if (a === null) return op === "neq";
      return op === "eq" ? a === b : op === "neq" ? a !== b : op === "gt" ? a > b : op === "lt" ? a < b : op === "gte" ? a >= b : a <= b;
    }
    case "select":
    case "status":
      return op === "is" ? v === f.value : v !== f.value;
    case "multi_select":
    case "person":
    case "relation":
    case "created_by":
    case "last_edited_by": {
      const has = Array.isArray(v) && (v as unknown[]).includes(f.value);
      return op === "contains" ? has : !has;
    }
    case "checkbox":
      return !!v === (f.value === true || f.value === "true");
    case "date":
    case "created_time":
    case "last_edited_time": {
      const a = dayKey(v);
      const b = String(f.value);
      if (!a) return false;
      return op === "is" ? a === b : op === "before" ? a < b : op === "after" ? a > b : op === "on_or_before" ? a <= b : a >= b;
    }
    default: {
      const a = norm(toText(v, prop, resolve));
      const b = norm(String(f.value));
      switch (op) {
        case "contains":
          return a.includes(b);
        case "not_contains":
          return !a.includes(b);
        case "is":
          return a === b;
        case "is_not":
          return a !== b;
        case "starts_with":
          return a.startsWith(b);
        case "ends_with":
          return a.endsWith(b);
        default:
          return true;
      }
    }
  }
}

export function matchGroup(row: Page, g: FilterGroup, db: Database, resolve: Resolver): boolean {
  if (!g.items.length) return true;
  const test = (it: Filter | FilterGroup) => ("items" in it ? matchGroup(row, it, db, resolve) : matchFilter(row, it, db, resolve));
  return g.mode === "and" ? g.items.every(test) : g.items.some(test);
}

export function countFilters(g: FilterGroup = EMPTY_FILTER): number {
  return g.items.reduce((n, it) => n + ("items" in it ? countFilters(it) : 1), 0);
}

/* ---------------------------------------------------------------- tris */

function sortKey(v: CellValue, prop: Property, resolve: Resolver): string | number | null {
  if (isEmpty(v)) return null;
  switch (prop.type) {
    case "number":
    case "unique_id":
      return typeof v === "number" ? v : null;
    case "checkbox":
      return v ? 1 : 0;
    case "select":
    case "status": {
      // Ordre des options (celui qu'on règle en les glissant), pas l'ordre alphabétique.
      const i = prop.config.options?.findIndex((o) => o.id === v) ?? -1;
      return i < 0 ? null : i;
    }
    case "date":
    case "created_time":
    case "last_edited_time":
      return dateOf(v) ?? (typeof v === "string" ? Date.parse(v) : null);
    default:
      return norm(toText(v, prop, resolve));
  }
}

export function applyView(rows: Page[], db: Database, view: View, resolve: Resolver, search = ""): Page[] {
  let out = rows.filter((r) => matchGroup(r, view.config.filter ?? EMPTY_FILTER, db, resolve));
  const q = norm(search.trim());
  if (q) {
    out = out.filter((r) => db.properties.some((p) => norm(toText(cellValue(r, p, resolve), p, resolve)).includes(q)));
  }
  const sorts = view.config.sorts.map((s) => ({ s, prop: db.properties.find((p) => p.id === s.propertyId) })).filter((x) => x.prop);
  if (sorts.length) {
    const keyed = out.map((r) => ({ r, keys: sorts.map(({ prop }) => sortKey(cellValue(r, prop!, resolve), prop!, resolve)) }));
    keyed.sort((a, b) => {
      for (let i = 0; i < sorts.length; i++) {
        const x = a.keys[i];
        const y = b.keys[i];
        if (x === y) continue;
        // Les vides vont toujours à la fin, quel que soit le sens.
        if (x === null) return 1;
        if (y === null) return -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr");
        if (c !== 0) return sorts[i].s.dir === "asc" ? c : -c;
      }
      return 0;
    });
    out = keyed.map((k) => k.r);
  }
  return out;
}

/* --------------------------------------------------------------- groupes */

export type RowGroup = { id: string; label: string; color: OptionColor; rows: Page[]; value: PropValue };

export const GROUPABLE: PropertyType[] = ["select", "status", "multi_select", "checkbox", "person"];

export function groupRows(rows: Page[], prop: Property, resolve: Resolver): RowGroup[] {
  if (prop.type === "checkbox") {
    return [
      { id: "true", label: "Coché", color: "green", value: true, rows: rows.filter((r) => !!r.props?.[prop.id]) },
      { id: "false", label: "Non coché", color: "gray", value: false, rows: rows.filter((r) => !r.props?.[prop.id]) },
    ];
  }
  if (prop.type === "person") {
    const ids = new Set<string>();
    for (const r of rows) for (const id of (r.props?.[prop.id] as string[] | undefined) ?? []) ids.add(id);
    return [
      { id: "__none", label: `Sans ${prop.name.toLowerCase()}`, color: "default", value: [], rows: rows.filter((r) => isEmpty(r.props?.[prop.id] ?? null)) },
      ...[...ids].map((id) => ({
        id,
        label: resolve.person(id)?.name ?? "Inconnu",
        color: "default" as OptionColor,
        value: [id],
        rows: rows.filter((r) => ((r.props?.[prop.id] as string[] | undefined) ?? []).includes(id)),
      })),
    ];
  }
  const options = prop.config.options ?? [];
  const valueOf = (r: Page) => r.props?.[prop.id] ?? null;
  const has = (r: Page, id: string) => (prop.type === "multi_select" ? ((valueOf(r) as string[] | null) ?? []).includes(id) : valueOf(r) === id);
  const none: RowGroup = {
    id: "__none",
    label: `Sans ${prop.name.toLowerCase()}`,
    color: "default",
    value: prop.type === "multi_select" ? [] : null,
    rows: rows.filter((r) => isEmpty(valueOf(r)) || (prop.type !== "multi_select" && !options.some((o) => o.id === valueOf(r)))),
  };
  const groups = options.map((o) => ({ id: o.id, label: o.name, color: o.color, value: (prop.type === "multi_select" ? [o.id] : o.id) as PropValue, rows: rows.filter((r) => has(r, o.id)) }));
  // Le statut n'a pas de groupe « vide » si toutes les lignes ont une valeur.
  return prop.type === "status" && none.rows.length === 0 ? groups : [none, ...groups];
}

/* --------------------------------------------------------------- calculs */

export const CALC_LABELS: Record<CalcFn, string> = {
  none: "Aucun",
  count: "Compter tout",
  count_values: "Compter les valeurs",
  count_empty: "Compter les vides",
  count_not_empty: "Compter les non vides",
  percent_empty: "% de vides",
  percent_not_empty: "% de non vides",
  sum: "Somme",
  average: "Moyenne",
  min: "Min",
  max: "Max",
  checked: "Cochées",
  unchecked: "Non cochées",
};

export function calcsFor(type: PropertyType): CalcFn[] {
  const base: CalcFn[] = ["none", "count", "count_values", "count_empty", "count_not_empty", "percent_empty", "percent_not_empty"];
  if (type === "number" || type === "rollup") return [...base, "sum", "average", "min", "max"];
  if (type === "checkbox") return ["none", "count", "checked", "unchecked"];
  return base;
}

export function calculate(fn: CalcFn, rows: Page[], prop: Property, resolve: Resolver): string {
  if (fn === "none") return "";
  const values = rows.map((r) => cellValue(r, prop, resolve));
  const empty = values.filter(isEmpty).length;
  const pct = (n: number) => `${rows.length ? Math.round((n / rows.length) * 100) : 0} %`;
  const nums = values.map(numberOf).filter((n): n is number => n !== null);
  const fmt = (n: number) => formatNumber(Math.round(n * 100) / 100, prop.config.numberFormat);
  switch (fn) {
    case "count":
      return String(rows.length);
    case "count_values":
      return String(values.flatMap((v) => (Array.isArray(v) ? (v as unknown[]) : [v])).filter((v) => !isEmpty(v as CellValue)).length);
    case "count_empty":
      return String(empty);
    case "count_not_empty":
      return String(rows.length - empty);
    case "percent_empty":
      return pct(empty);
    case "percent_not_empty":
      return pct(rows.length - empty);
    case "sum":
      return fmt(nums.reduce((a, b) => a + b, 0));
    case "average":
      return nums.length ? fmt(nums.reduce((a, b) => a + b, 0) / nums.length) : "";
    case "min":
      return nums.length ? fmt(Math.min(...nums)) : "";
    case "max":
      return nums.length ? fmt(Math.max(...nums)) : "";
    case "checked":
      return String(values.filter(Boolean).length);
    case "unchecked":
      return String(values.filter((v) => !v).length);
    default:
      return "";
  }
}
