"use client";

import { clsx } from "clsx";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Copy, EyeOff, Filter as FilterIcon, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Tag, useToast } from "@/components/ui/display";
import {
  addOption,
  addProperty,
  addRelation,
  changePropertyType,
  deleteProperty,
  duplicateProperty,
  PROPERTY_LABELS,
  updateProperty,
  updateView,
  useDatabases,
  type Database,
  type NumberFormat,
  type Property,
  type PropertyType,
  type Resolver,
  type RollupFn,
  type View,
} from "@/lib/data";
import { ROLLUP_LABELS } from "@/lib/db/query";
import { OptionEditor } from "./cell";
import { CREATABLE_TYPES, PropertyIcon } from "./property-icon";

const NUMBER_FORMATS: [NumberFormat, string][] = [
  ["number", "Nombre"],
  ["comma", "Nombre avec séparateurs"],
  ["percent", "Pourcentage"],
  ["euro", "Euro"],
  ["dollar", "Dollar"],
];

const rowClass = "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-surface-hover disabled:opacity-50";

type Screen = "main" | "type" | "options" | "number" | "rollup";

/** Contenu du popover d'en-tête de colonne. */
export function PropertyMenu({
  database,
  prop,
  view,
  resolve,
  onClose,
  onAddFilter,
}: {
  database: Database;
  prop: Property;
  view: View | null;
  resolve: Resolver;
  onClose: () => void;
  onAddFilter?: (propertyId: string) => void;
}) {
  const [screen, setScreen] = useState<Screen>("main");
  const [name, setName] = useState(prop.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();

  const rename = () => {
    if (name.trim() && name !== prop.name) void updateProperty(database.id, prop.id, { name });
  };

  if (screen === "type") {
    return (
      <SubScreen title="Type de propriété" onBack={() => setScreen("main")}>
        <TypeList
          current={prop.type}
          exclude={["relation", "rollup"]}
          onPick={async (t) => {
            await changePropertyType(database.id, prop.id, t);
            setScreen("main");
          }}
        />
      </SubScreen>
    );
  }
  if (screen === "options") return <OptionsScreen database={database} prop={prop} onBack={() => setScreen("main")} />;
  if (screen === "number") {
    return (
      <SubScreen title="Format du nombre" onBack={() => setScreen("main")}>
        {NUMBER_FORMATS.map(([f, label]) => (
          <button key={f} type="button" aria-pressed={(prop.config.numberFormat ?? "number") === f} onClick={() => updateProperty(database.id, prop.id, { config: { numberFormat: f } })} className={rowClass}>
            <span className="flex-1">{label}</span>
            {(prop.config.numberFormat ?? "number") === f && <span aria-hidden>✓</span>}
          </button>
        ))}
      </SubScreen>
    );
  }
  if (screen === "rollup") return <RollupScreen database={database} prop={prop} resolve={resolve} onBack={() => setScreen("main")} />;

  const hasOptions = prop.type === "select" || prop.type === "multi_select" || prop.type === "status";
  return (
    <div className="flex w-[260px] flex-col p-1">
      <div className="flex items-center gap-2 p-1">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-border text-muted">
          <PropertyIcon type={prop.type} />
        </span>
        <input
          autoFocus
          aria-label="Nom de la propriété"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              rename();
              onClose();
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-sm border border-border-input bg-bg px-2 text-sm outline-none focus:outline-2 focus:outline-focus"
        />
      </div>
      {prop.type !== "title" && prop.type !== "relation" && prop.type !== "rollup" && (
        <button type="button" onClick={() => setScreen("type")} className={rowClass}>
          <span className="flex-1 text-muted">Type</span>
          <span className="flex items-center gap-1">
            <PropertyIcon type={prop.type} className="size-3.5" />
            {PROPERTY_LABELS[prop.type]}
          </span>
          <ChevronRight aria-hidden className="size-4 text-muted" />
        </button>
      )}
      {hasOptions && (
        <button type="button" onClick={() => setScreen("options")} className={rowClass}>
          <span className="flex-1">Modifier les options</span>
          <ChevronRight aria-hidden className="size-4 text-muted" />
        </button>
      )}
      {prop.type === "number" && (
        <button type="button" onClick={() => setScreen("number")} className={rowClass}>
          <span className="flex-1">Format du nombre</span>
          <span className="text-muted">{NUMBER_FORMATS.find(([f]) => f === (prop.config.numberFormat ?? "number"))?.[1]}</span>
          <ChevronRight aria-hidden className="size-4 text-muted" />
        </button>
      )}
      {prop.type === "rollup" && (
        <button type="button" onClick={() => setScreen("rollup")} className={rowClass}>
          <span className="flex-1">Configurer l&apos;agrégation</span>
          <ChevronRight aria-hidden className="size-4 text-muted" />
        </button>
      )}
      {prop.type === "unique_id" && (
        <label className="flex items-center gap-2 px-2 py-1 text-sm">
          <span className="flex-1 text-muted">Préfixe</span>
          <input
            defaultValue={prop.config.prefix ?? ""}
            aria-label="Préfixe de l'ID"
            onBlur={(e) => updateProperty(database.id, prop.id, { config: { prefix: e.target.value.trim().toUpperCase() } })}
            className="h-7 w-24 rounded-sm border border-border-input bg-bg px-2 text-sm uppercase outline-none focus:outline-2 focus:outline-focus"
          />
        </label>
      )}
      {prop.type === "relation" && (
        <p className="px-2 py-1 text-xs text-muted">
          Liée à {resolve.page(resolve.database(prop.config.relation?.databaseId ?? "")?.pageId ?? "")?.title || "une base supprimée"}
          {prop.config.relation?.pairedPropertyId ? " (à double sens)" : ""}
        </p>
      )}

      <div className="my-1 h-px bg-border" />
      {view && (
        <>
          <button
            type="button"
            className={rowClass}
            onClick={() => {
              void updateView(view.id, { config: { sorts: [{ propertyId: prop.id, dir: "asc" }, ...view.config.sorts.filter((s) => s.propertyId !== prop.id)] } });
              onClose();
            }}
          >
            <ArrowUp aria-hidden className="size-4 text-muted" />
            Trier par ordre croissant
          </button>
          <button
            type="button"
            className={rowClass}
            onClick={() => {
              void updateView(view.id, { config: { sorts: [{ propertyId: prop.id, dir: "desc" }, ...view.config.sorts.filter((s) => s.propertyId !== prop.id)] } });
              onClose();
            }}
          >
            <ArrowDown aria-hidden className="size-4 text-muted" />
            Trier par ordre décroissant
          </button>
          {onAddFilter && (
            <button
              type="button"
              className={rowClass}
              onClick={() => {
                onAddFilter(prop.id);
                onClose();
              }}
            >
              <FilterIcon aria-hidden className="size-4 text-muted" />
              Filtrer
            </button>
          )}
          {prop.type !== "title" && (
            <button
              type="button"
              className={rowClass}
              onClick={() => {
                void updateView(view.id, { config: { visible: view.config.visible.filter((x) => x !== prop.id) } });
                onClose();
              }}
            >
              <EyeOff aria-hidden className="size-4 text-muted" />
              Masquer dans cette vue
            </button>
          )}
        </>
      )}
      {prop.type !== "title" && (
        <>
          {prop.type !== "relation" && (
            <button
              type="button"
              className={rowClass}
              onClick={() => {
                void duplicateProperty(database.id, prop.id);
                onClose();
              }}
            >
              <Copy aria-hidden className="size-4 text-muted" />
              Dupliquer la propriété
            </button>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-1 px-1 py-1">
              <span className="flex-1 px-1 text-xs text-danger">Les valeurs seront perdues.</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await deleteProperty(database.id, prop.id);
                    onClose();
                  } catch (e) {
                    toast({ title: e instanceof Error ? e.message : "Suppression impossible", tone: "error" });
                  }
                }}
                className="h-7 rounded-sm bg-danger px-2 text-xs font-medium text-bg"
              >
                Supprimer
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-7 rounded-sm px-2 text-xs hover:bg-surface-hover">
                Annuler
              </button>
            </div>
          ) : (
            <button type="button" className={clsx(rowClass, "text-danger hover:bg-danger-soft")} onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden className="size-4" />
              Supprimer la propriété
            </button>
          )}
        </>
      )}
    </div>
  );
}

function SubScreen({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex max-h-[420px] w-[260px] flex-col p-1">
      <div className="flex items-center gap-1 px-1 pb-1">
        <button type="button" onClick={onBack} aria-label="Retour" className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="overflow-y-auto">{children}</div>
    </div>
  );
}

export function TypeList({ current, exclude = [], onPick }: { current?: PropertyType; exclude?: PropertyType[]; onPick: (t: PropertyType) => void }) {
  return (
    <ul>
      {CREATABLE_TYPES.filter((t) => !exclude.includes(t)).map((t) => (
        <li key={t}>
          <button type="button" aria-pressed={current === t} onClick={() => onPick(t)} className={rowClass}>
            <PropertyIcon type={t} className="size-4 text-muted" />
            <span className="flex-1">{PROPERTY_LABELS[t]}</span>
            {current === t && <span aria-hidden>✓</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function OptionsScreen({ database, prop, onBack }: { database: Database; prop: Property; onBack: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const options = prop.config.options ?? [];
  return (
    <SubScreen title={`Options de ${prop.name}`} onBack={onBack}>
      <ul>
        {options.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => setEditing(editing === o.id ? null : o.id)} className={rowClass} aria-expanded={editing === o.id}>
              <span className="flex-1">
                <Tag color={o.color} dot={prop.type === "status"}>
                  {o.name}
                </Tag>
              </span>
              <ChevronRight aria-hidden className={clsx("size-4 text-muted transition-transform", editing === o.id && "rotate-90")} />
            </button>
            {editing === o.id && <OptionEditor database={database} prop={prop} option={o} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-1 p-1"
        onSubmit={async (e) => {
          e.preventDefault();
          if (newName.trim()) await addOption(database.id, prop.id, newName);
          setNewName("");
        }}
      >
        <input
          aria-label="Nouvelle option"
          placeholder="Nouvelle option"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-7 min-w-0 flex-1 rounded-sm border border-border-input bg-bg px-2 text-sm outline-none focus:outline-2 focus:outline-focus"
        />
        <button type="submit" aria-label="Ajouter l'option" className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
          <Plus aria-hidden className="size-4" />
        </button>
      </form>
    </SubScreen>
  );
}

function RollupScreen({ database, prop, resolve, onBack }: { database: Database; prop: Property; resolve: Resolver; onBack: () => void }) {
  const cfg = prop.config.rollup;
  const relations = database.properties.filter((p) => p.type === "relation");
  const rel = relations.find((r) => r.id === cfg?.relationPropertyId) ?? null;
  const target = rel?.config.relation ? resolve.database(rel.config.relation.databaseId) : null;
  const set = (patch: Partial<NonNullable<typeof cfg>>) =>
    updateProperty(database.id, prop.id, {
      config: { rollup: { relationPropertyId: cfg?.relationPropertyId ?? "", targetPropertyId: cfg?.targetPropertyId ?? "title", fn: cfg?.fn ?? "show_original", ...patch } },
    });
  const selectClass = "h-8 w-full rounded-sm border border-border-input bg-bg px-2 text-sm outline-none focus:outline-2 focus:outline-focus";
  return (
    <SubScreen title="Agrégation" onBack={onBack}>
      {relations.length === 0 ? (
        <p className="px-2 py-2 text-sm text-muted">Ajoutez d&apos;abord une propriété Relation à cette base.</p>
      ) : (
        <div className="flex flex-col gap-2 p-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Relation
            <select className={selectClass} value={cfg?.relationPropertyId ?? ""} onChange={(e) => set({ relationPropertyId: e.target.value, targetPropertyId: "title" })}>
              <option value="" disabled>
                Choisir…
              </option>
              {relations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {target && (
            <label className="flex flex-col gap-1 text-xs text-muted">
              Propriété
              <select className={selectClass} value={cfg?.targetPropertyId ?? "title"} onChange={(e) => set({ targetPropertyId: e.target.value })}>
                {target.properties
                  .filter((p) => p.type !== "rollup")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted">
            Calcul
            <select className={selectClass} value={cfg?.fn ?? "show_original"} onChange={(e) => set({ fn: e.target.value as RollupFn })}>
              {(Object.keys(ROLLUP_LABELS) as RollupFn[]).map((f) => (
                <option key={f} value={f}>
                  {ROLLUP_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </SubScreen>
  );
}

/** Contenu du popover « + » : choisir le type d'une nouvelle propriété (et la base cible d'une relation). */
export function AddPropertyMenu({ database, onDone }: { database: Database; onDone: (propertyId: string) => void }) {
  const [step, setStep] = useState<"type" | "relation">("type");
  const [twoWay, setTwoWay] = useState(true);
  const databases = useDatabases() ?? [];
  if (step === "relation") {
    return (
      <SubScreen title="Relation vers…" onBack={() => setStep("type")}>
        <ul>
          {databases.map(({ database: d, title, icon }) => (
            <li key={d.id}>
              <button
                type="button"
                className={rowClass}
                onClick={async () => {
                  const p = await addRelation(database.id, d.id, twoWay && d.id !== database.id);
                  onDone(p.id);
                }}
              >
                <span aria-hidden>{icon ?? "🗃️"}</span>
                <span className="flex-1 truncate">{title}</span>
                {d.id === database.id && <span className="text-xs text-muted">cette base</span>}
              </button>
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 px-2 py-2 text-sm">
          <input type="checkbox" checked={twoWay} onChange={(e) => setTwoWay(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Afficher aussi dans la base liée
        </label>
      </SubScreen>
    );
  }
  return (
    <div className="flex max-h-[420px] w-[240px] flex-col p-1">
      <p className="px-2 pb-1 pt-1 text-xs text-muted">Type de la nouvelle propriété</p>
      <div className="overflow-y-auto">
        <TypeList
          onPick={async (t) => {
            if (t === "relation") return setStep("relation");
            const p = await addProperty(database.id, t);
            onDone(p.id);
          }}
        />
      </div>
    </div>
  );
}
