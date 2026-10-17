"use client";

import { clsx } from "clsx";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import {
  updateView,
  usePeople,
  useRowsOf,
  type Database,
  type Filter,
  type FilterGroup,
  type FilterOp,
  type Property,
  type PropValue,
  type Sort,
  type View,
  type ViewType,
} from "@/lib/data";
import { filterOps, GROUPABLE } from "@/lib/db/query";
import { PropertyIcon } from "./property-icon";

const fieldClass = "h-7 min-w-0 rounded-sm border border-border-input bg-bg px-1.5 text-sm text-fg outline-none focus:outline-2 focus:outline-focus";
const ghostBtn = "flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm text-muted hover:bg-surface-hover hover:text-fg";
const newId = () => crypto.randomUUID();

/* ---------------------------------------------------------------- filtres */

export function FilterEditor({ database, view }: { database: Database; view: View }) {
  const root = view.config.filter;
  const save = (filter: FilterGroup) => updateView(view.id, { config: { filter } });
  return (
    <div className="w-[min(560px,calc(100vw-32px))] p-2">
      {root.items.length === 0 && <p className="px-1 pb-2 text-sm text-muted">Aucun filtre dans cette vue.</p>}
      <GroupEditor database={database} group={root} depth={0} onChange={save} />
    </div>
  );
}

function GroupEditor({ database, group, depth, onChange }: { database: Database; group: FilterGroup; depth: number; onChange: (g: FilterGroup) => void }) {
  const first = database.properties[0];
  const setItem = (i: number, it: Filter | FilterGroup | null) =>
    onChange({ ...group, items: it === null ? group.items.filter((_, j) => j !== i) : group.items.map((x, j) => (j === i ? it : x)) });
  return (
    <div className={clsx("flex flex-col gap-1.5", depth > 0 && "rounded-md border border-border bg-surface p-2")}>
      {group.items.map((it, i) => (
        <div key={it.id} className="flex items-start gap-1.5">
          <span className="w-14 shrink-0 pt-1 text-xs text-muted">
            {i === 0 ? (
              "Où"
            ) : i === 1 ? (
              <select aria-label="Combinaison" className={clsx(fieldClass, "w-full")} value={group.mode} onChange={(e) => onChange({ ...group, mode: e.target.value as "and" | "or" })}>
                <option value="and">et</option>
                <option value="or">ou</option>
              </select>
            ) : group.mode === "and" ? (
              "et"
            ) : (
              "ou"
            )}
          </span>
          <div className="min-w-0 flex-1">
            {"items" in it ? (
              <GroupEditor database={database} group={it} depth={depth + 1} onChange={(g) => setItem(i, g.items.length ? g : null)} />
            ) : (
              <FilterRow database={database} filter={it} onChange={(f) => setItem(i, f)} />
            )}
          </div>
          <button type="button" aria-label="Retirer" onClick={() => setItem(i, null)} className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={ghostBtn}
          onClick={() => onChange({ ...group, items: [...group.items, { id: newId(), propertyId: first.id, op: filterOps(first.type)[0].op, value: null }] })}
        >
          <Plus aria-hidden className="size-4" />
          Ajouter un filtre
        </button>
        {depth < 2 && (
          <button
            type="button"
            className={ghostBtn}
            onClick={() =>
              onChange({
                ...group,
                items: [
                  ...group.items,
                  { id: newId(), mode: group.mode === "and" ? "or" : "and", items: [{ id: newId(), propertyId: first.id, op: filterOps(first.type)[0].op, value: null }] },
                ],
              })
            }
          >
            <Plus aria-hidden className="size-4" />
            Ajouter un groupe
          </button>
        )}
      </div>
    </div>
  );
}

function FilterRow({ database, filter, onChange }: { database: Database; filter: Filter; onChange: (f: Filter) => void }) {
  const prop = database.properties.find((p) => p.id === filter.propertyId) ?? database.properties[0];
  const ops = filterOps(prop.type);
  const op = ops.find((o) => o.op === filter.op) ?? ops[0];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Propriété"
        className={clsx(fieldClass, "w-36")}
        value={prop.id}
        onChange={(e) => {
          const p = database.properties.find((x) => x.id === e.target.value)!;
          onChange({ ...filter, propertyId: p.id, op: filterOps(p.type)[0].op, value: p.type === "checkbox" ? true : null });
        }}
      >
        {database.properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select aria-label="Condition" className={clsx(fieldClass, "w-36")} value={op.op} onChange={(e) => onChange({ ...filter, op: e.target.value as FilterOp })}>
        {ops.map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>
      {op.needsValue && <ValueInput prop={prop} value={filter.value} onChange={(value) => onChange({ ...filter, value })} />}
    </div>
  );
}

function ValueInput({ prop, value, onChange }: { prop: Property; value: PropValue; onChange: (v: PropValue) => void }) {
  const people = usePeople() ?? [];
  const rows = useRowsOf(prop.type === "relation" ? prop.config.relation?.databaseId : null) ?? [];
  const cls = clsx(fieldClass, "min-w-[140px] flex-1");
  switch (prop.type) {
    case "select":
    case "status":
    case "multi_select":
      return (
        <select aria-label="Valeur" className={cls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Choisir…</option>
          {(prop.config.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
    case "checkbox":
      return (
        <select aria-label="Valeur" className={cls} value={String(value ?? true)} onChange={(e) => onChange(e.target.value === "true")}>
          <option value="true">Coché</option>
          <option value="false">Non coché</option>
        </select>
      );
    case "person":
    case "created_by":
    case "last_edited_by":
      return (
        <select aria-label="Valeur" className={cls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Choisir…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      );
    case "relation":
      return (
        <select aria-label="Valeur" className={cls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Choisir…</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title || "Sans titre"}
            </option>
          ))}
        </select>
      );
    case "date":
    case "created_time":
    case "last_edited_time":
      return <input aria-label="Valeur" type="date" className={cls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "number":
    case "unique_id":
      return (
        <input
          aria-label="Valeur"
          type="number"
          className={cls}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    default:
      return <input aria-label="Valeur" placeholder="Valeur" className={cls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

/* ------------------------------------------------------------------- tris */

export function SortEditor({ database, view }: { database: Database; view: View }) {
  const sorts = view.config.sorts;
  const save = (s: Sort[]) => updateView(view.id, { config: { sorts: s } });
  const move = (i: number, d: -1 | 1) => {
    const next = [...sorts];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    void save(next);
  };
  const unused = database.properties.filter((p) => !sorts.some((s) => s.propertyId === p.id));
  return (
    <div className="flex w-[min(420px,calc(100vw-32px))] flex-col gap-1.5 p-2">
      {sorts.length === 0 && <p className="px-1 text-sm text-muted">Aucun tri : les lignes suivent l&apos;ordre manuel.</p>}
      {sorts.map((s, i) => (
        <div key={s.propertyId} className="flex items-center gap-1.5">
          <select
            aria-label="Propriété"
            className={clsx(fieldClass, "flex-1")}
            value={s.propertyId}
            onChange={(e) => save(sorts.map((x, j) => (j === i ? { ...x, propertyId: e.target.value } : x)))}
          >
            {database.properties
              .filter((p) => p.id === s.propertyId || !sorts.some((x) => x.propertyId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <select aria-label="Sens" className={clsx(fieldClass, "w-32")} value={s.dir} onChange={(e) => save(sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as "asc" | "desc" } : x)))}>
            <option value="asc">Croissant</option>
            <option value="desc">Décroissant</option>
          </select>
          <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)} className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover disabled:opacity-30">
            <ArrowUp aria-hidden className="size-4" />
          </button>
          <button type="button" aria-label="Descendre" disabled={i === sorts.length - 1} onClick={() => move(i, 1)} className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover disabled:opacity-30">
            <ArrowDown aria-hidden className="size-4" />
          </button>
          <button type="button" aria-label="Retirer le tri" onClick={() => save(sorts.filter((_, j) => j !== i))} className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        {unused.length > 0 && (
          <button type="button" className={ghostBtn} onClick={() => save([...sorts, { propertyId: unused[0].id, dir: "asc" }])}>
            <Plus aria-hidden className="size-4" />
            Ajouter un tri
          </button>
        )}
        {sorts.length > 0 && (
          <button type="button" className={ghostBtn} onClick={() => save([])}>
            <Trash2 aria-hidden className="size-4" />
            Tout retirer
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- propriétés visibles */

export function PropertiesEditor({ database, view, onAdd }: { database: Database; view: View; onAdd: ReactNode }) {
  const visible = view.config.visible;
  const others = database.properties.filter((p) => p.type !== "title");
  const ordered = [...visible.map((id) => others.find((p) => p.id === id)).filter((p): p is Property => !!p), ...others.filter((p) => !visible.includes(p.id))];
  const save = (v: string[]) => updateView(view.id, { config: { visible: v } });
  const move = (id: string, d: -1 | 1) => {
    const i = visible.indexOf(id);
    if (i < 0 || i + d < 0 || i + d >= visible.length) return;
    const next = [...visible];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    void save(next);
  };
  const title = database.properties.find((p) => p.type === "title")!;
  return (
    <div className="flex max-h-[420px] w-[280px] flex-col p-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs text-muted">Propriétés affichées</span>
        <button type="button" className="text-xs text-accent hover:underline" onClick={() => save(visible.length === others.length ? [] : others.map((p) => p.id))}>
          {visible.length === others.length ? "Tout masquer" : "Tout afficher"}
        </button>
      </div>
      <ul className="overflow-y-auto">
        <li className="flex h-8 items-center gap-2 px-2 text-sm text-muted">
          <PropertyIcon type="title" />
          <span className="flex-1 truncate">{title.name}</span>
          <span className="text-xs">toujours</span>
        </li>
        {ordered.map((p) => {
          const on = visible.includes(p.id);
          return (
            <li key={p.id} className="group flex h-8 items-center gap-2 rounded-sm px-2 text-sm hover:bg-surface-hover">
              <PropertyIcon type={p.type} className="size-4 text-muted" />
              <span className={clsx("flex-1 truncate", !on && "text-muted")}>{p.name}</span>
              {on && (
                <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                  <button type="button" aria-label={`Monter ${p.name}`} onClick={() => move(p.id, -1)} className="flex size-6 items-center justify-center rounded-xs text-muted hover:bg-surface-active">
                    <ArrowUp aria-hidden className="size-3.5" />
                  </button>
                  <button type="button" aria-label={`Descendre ${p.name}`} onClick={() => move(p.id, 1)} className="flex size-6 items-center justify-center rounded-xs text-muted hover:bg-surface-active">
                    <ArrowDown aria-hidden className="size-3.5" />
                  </button>
                </span>
              )}
              <button
                type="button"
                aria-label={on ? `Masquer ${p.name}` : `Afficher ${p.name}`}
                aria-pressed={on}
                onClick={() => save(on ? visible.filter((x) => x !== p.id) : [...visible, p.id])}
                className="flex size-6 items-center justify-center rounded-xs text-muted hover:bg-surface-active"
              >
                {on ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border pt-1">{onAdd}</div>
    </div>
  );
}

/* -------------------------------------------------------- réglages de la vue */

export const VIEW_TYPES: { type: ViewType; label: string }[] = [
  { type: "table", label: "Tableau" },
  { type: "board", label: "Kanban" },
  { type: "list", label: "Liste" },
  { type: "gallery", label: "Galerie" },
  { type: "calendar", label: "Calendrier" },
];

export function ViewSettings({ database, view }: { database: Database; view: View }) {
  const c = view.config;
  const save = (config: Partial<View["config"]>) => updateView(view.id, { config });
  const groupable = database.properties.filter((p) => GROUPABLE.includes(p.type));
  const dates = database.properties.filter((p) => p.type === "date" || p.type === "created_time" || p.type === "last_edited_time");
  const row = "flex items-center justify-between gap-3 px-2 py-1.5 text-sm";
  return (
    <div className="flex w-[300px] flex-col p-1">
      <label className={row}>
        <span>Nom</span>
        <input
          aria-label="Nom de la vue"
          defaultValue={view.name}
          onBlur={(e) => e.target.value.trim() && updateView(view.id, { name: e.target.value })}
          className={clsx(fieldClass, "w-40")}
        />
      </label>
      <div className="px-2 pb-1 pt-2 text-xs text-muted">Disposition</div>
      <div className="grid grid-cols-5 gap-1 px-1 pb-2" role="radiogroup" aria-label="Disposition">
        {VIEW_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            role="radio"
            aria-checked={view.type === t.type}
            onClick={() => updateView(view.id, { type: t.type })}
            className={clsx(
              "flex h-12 flex-col items-center justify-center gap-0.5 rounded-sm border text-xs",
              view.type === t.type ? "border-accent bg-accent-soft text-fg" : "border-border text-muted hover:bg-surface-hover",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {view.type !== "calendar" && view.type !== "gallery" && (
        <label className={row}>
          <span>Grouper par</span>
          <select className={clsx(fieldClass, "w-40")} value={c.groupBy ?? ""} onChange={(e) => save({ groupBy: e.target.value || null })}>
            {view.type !== "board" && <option value="">Aucun</option>}
            {groupable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {c.groupBy && (
        <label className={row}>
          <span>Masquer les groupes vides</span>
          <input type="checkbox" checked={!!c.hideEmptyGroups} onChange={(e) => save({ hideEmptyGroups: e.target.checked })} className="size-4 accent-[var(--accent)]" />
        </label>
      )}
      {view.type === "calendar" && (
        <label className={row}>
          <span>Date affichée</span>
          <select className={clsx(fieldClass, "w-40")} value={c.dateProperty ?? ""} onChange={(e) => save({ dateProperty: e.target.value || null })}>
            {dates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {(view.type === "gallery" || view.type === "board") && (
        <label className={row}>
          <span>Aperçu de la carte</span>
          <select className={clsx(fieldClass, "w-40")} value={c.cardCover ?? "none"} onChange={(e) => save({ cardCover: e.target.value as View["config"]["cardCover"] })}>
            <option value="none">Aucun</option>
            <option value="cover">Couverture</option>
            <option value="content">Contenu de la page</option>
          </select>
        </label>
      )}
      {view.type === "table" && (
        <label className={row}>
          <span>Retour à la ligne dans les cellules</span>
          <input type="checkbox" checked={!!c.wrapCells} onChange={(e) => save({ wrapCells: e.target.checked })} className="size-4 accent-[var(--accent)]" />
        </label>
      )}
      <label className={row}>
        <span>Ouvrir les pages</span>
        <select className={clsx(fieldClass, "w-40")} value={c.openIn ?? "side"} onChange={(e) => save({ openIn: e.target.value as View["config"]["openIn"] })}>
          <option value="side">En aperçu latéral</option>
          <option value="center">En aperçu centré</option>
          <option value="full">En pleine page</option>
        </select>
      </label>
    </div>
  );
}
