"use client";

import { clsx } from "clsx";
import { Check, FileText, MoreHorizontal, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Avatar, BLOCK_COLORS, BLOCK_COLOR_LABELS, Tag, blockBg, useToast, type BlockColor } from "@/components/ui/display";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/overlay";
import {
  addOption,
  createRow,
  deleteOption,
  resolveFileUrl,
  updateOption,
  updateRowProp,
  uploadFile,
  usePeople,
  useRowsOf,
  type Database,
  type DateValue,
  type FileValue,
  type Page,
  type Property,
  type PropValue,
  type Resolver,
  type SelectOption,
} from "@/lib/data";
import { cellValue, formatDate, formatNumber, isEmpty, optionOf, toText, type CellValue } from "@/lib/db/query";
import { READ_ONLY_TYPES } from "./property-icon";

export type CellMode = "table" | "card" | "panel";

/* ------------------------------------------------------------ affichage */

export function CellDisplay({
  value,
  prop,
  resolve,
  mode,
  wrap,
}: {
  value: CellValue;
  prop: Property;
  resolve: Resolver;
  mode: CellMode;
  wrap?: boolean;
}) {
  if (isEmpty(value) && prop.type !== "checkbox") return null;
  const lineClass = wrap || mode === "panel" ? "whitespace-pre-wrap break-words" : "truncate";
  switch (prop.type) {
    case "select":
    case "status": {
      const o = optionOf(prop, value);
      return o ? (
        <Tag color={o.color} dot={prop.type === "status"}>
          {o.name}
        </Tag>
      ) : null;
    }
    case "multi_select":
      return (
        <span className={clsx("flex gap-1", wrap || mode !== "table" ? "flex-wrap" : "overflow-hidden")}>
          {(value as string[]).map((id) => {
            const o = optionOf(prop, id);
            return o ? (
              <Tag key={id} color={o.color}>
                {o.name}
              </Tag>
            ) : null;
          })}
        </span>
      );
    case "checkbox":
      return (
        <span
          aria-label={value ? "Coché" : "Non coché"}
          className={clsx(
            "flex size-4 items-center justify-center rounded-xs border",
            value ? "border-accent bg-accent text-on-accent" : "border-border-input",
          )}
        >
          {value ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
        </span>
      );
    case "person":
    case "created_by":
    case "last_edited_by":
      return (
        <span className="flex flex-wrap items-center gap-2">
          {(value as string[]).map((id) => {
            const p = resolve.person(id);
            return (
              <span key={id} className="flex min-w-0 items-center gap-1.5">
                <Avatar name={p?.name ?? "?"} size={18} />
                <span className="truncate">{p?.name ?? "Inconnu"}</span>
              </span>
            );
          })}
        </span>
      );
    case "relation":
      return (
        <span className={clsx("flex gap-x-2 gap-y-0.5", wrap || mode !== "table" ? "flex-wrap" : "overflow-hidden")}>
          {(value as string[]).map((id) => {
            const p = resolve.page(id);
            if (!p || p.inTrash) return null;
            return (
              <Link
                key={id}
                href={`/p/${id}`}
                onClick={(e) => e.stopPropagation()}
                className="flex min-w-0 shrink-0 items-center gap-1 underline decoration-border-strong underline-offset-2 hover:decoration-fg"
              >
                <span aria-hidden>{p.icon ?? <FileText className="inline size-3.5 text-muted" />}</span>
                <span className="truncate">{p.title || "Sans titre"}</span>
              </Link>
            );
          })}
        </span>
      );
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={clsx("underline decoration-border-strong underline-offset-2", lineClass)}>
          {String(value).replace(/^https?:\/\//, "")}
        </a>
      );
    case "email":
      return (
        <a href={`mailto:${value}`} onClick={(e) => e.stopPropagation()} className={clsx("underline decoration-border-strong underline-offset-2", lineClass)}>
          {String(value)}
        </a>
      );
    case "phone":
      return (
        <a href={`tel:${value}`} onClick={(e) => e.stopPropagation()} className={lineClass}>
          {String(value)}
        </a>
      );
    case "files":
      return (
        <span className="flex flex-wrap gap-1">
          {(value as FileValue[]).map((f, i) => (
            <span key={i} className="flex max-w-full items-center gap-1 rounded-xs bg-surface-hover px-1.5 text-sm">
              <Paperclip aria-hidden className="size-3 shrink-0 text-muted" />
              <span className="truncate">{f.name}</span>
            </span>
          ))}
        </span>
      );
    case "number":
      return <span className={clsx("block tabular-nums", mode === "table" && "text-right")}>{formatNumber(value as number, prop.config.numberFormat)}</span>;
    case "date":
      return <span className={lineClass}>{formatDate(value as DateValue)}</span>;
    case "created_time":
    case "last_edited_time":
      return <span className={lineClass}>{formatDate(value as string)}</span>;
    default:
      return <span className={lineClass}>{toText(value, prop, resolve)}</span>;
  }
}

/* -------------------------------------------------------- cellule éditable */

/**
 * Une cellule : affiche la valeur, et l'édite au clic (ou Entrée) dans un popover adapté au type.
 * `children` permet d'habiller l'affichage (ex. titre avec bouton « Ouvrir »).
 */
export function Cell({
  row,
  prop,
  database,
  resolve,
  mode,
  readOnly,
  wrap,
  placeholder,
  className,
}: {
  row: Page;
  prop: Property;
  database: Database;
  resolve: Resolver;
  mode: CellMode;
  readOnly?: boolean;
  wrap?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const value = cellValue(row, prop, resolve);
  const editable = !readOnly && !READ_ONLY_TYPES.includes(prop.type) && !row.isLocked;
  const toast = useToast();

  const save = async (v: PropValue) => {
    try {
      await updateRowProp(row.id, prop.id, v);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Modification impossible", tone: "error" });
    }
  };

  const display = (
    <CellDisplay value={value} prop={prop} resolve={resolve} mode={mode} wrap={wrap} />
  );

  if (prop.type === "checkbox") {
    return (
      <button
        type="button"
        disabled={!editable}
        onClick={(e) => {
          e.stopPropagation();
          void save(!value);
        }}
        aria-label={`${prop.name} : ${value ? "coché" : "non coché"}`}
        aria-pressed={!!value}
        className={clsx("flex min-h-[inherit] w-full items-center", mode === "table" ? "px-2" : "", className)}
      >
        {display}
      </button>
    );
  }

  const empty = isEmpty(value);
  const trigger = (
    <div
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      aria-label={editable ? `Modifier ${prop.name}` : undefined}
      onClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        setOpen(true);
      }}
      onKeyDown={(e) => {
        if (editable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setOpen(true);
        }
      }}
      className={clsx(
        "flex min-h-[inherit] w-full min-w-0 items-center text-sm",
        mode === "table" && "px-2 py-1.5",
        mode === "panel" && "rounded-sm px-2 py-1 hover:bg-surface-hover",
        editable && "cursor-pointer",
        className,
      )}
    >
      {empty ? <span className="text-placeholder">{mode === "table" ? "" : (placeholder ?? "Vide")}</span> : display}
    </div>
  );

  if (!editable) return trigger;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      {open && (
        <PopoverContent
          className={clsx("p-0", isTextual(prop) ? "w-[var(--radix-popover-trigger-width)] min-w-[240px]" : "w-[300px]")}
          side="bottom"
          sideOffset={mode === "table" ? -32 : 4}
          onClick={(e) => e.stopPropagation()}
        >
          <CellEditor row={row} prop={prop} database={database} resolve={resolve} value={value} onSave={save} onDone={() => setOpen(false)} />
        </PopoverContent>
      )}
    </Popover>
  );
}

function isTextual(prop: Property) {
  return ["title", "text", "number", "url", "email", "phone"].includes(prop.type);
}

/* --------------------------------------------------------------- éditeurs */

function CellEditor({
  row,
  prop,
  database,
  resolve,
  value,
  onSave,
  onDone,
}: {
  row: Page;
  prop: Property;
  database: Database;
  resolve: Resolver;
  value: CellValue;
  onSave: (v: PropValue) => Promise<void>;
  onDone: () => void;
}) {
  switch (prop.type) {
    case "select":
    case "status":
    case "multi_select":
      return <OptionPicker prop={prop} database={database} value={value as string | string[] | null} onSave={onSave} onDone={onDone} />;
    case "date":
      return <DateEditor value={value as DateValue | null} onSave={onSave} />;
    case "person":
      return <PersonPicker value={(value as string[] | null) ?? []} onSave={onSave} />;
    case "relation":
      return <RelationPicker row={row} prop={prop} resolve={resolve} value={(value as string[] | null) ?? []} onSave={onSave} />;
    case "files":
      return <FilesEditor rowId={row.id} value={(value as FileValue[] | null) ?? []} onSave={onSave} />;
    default:
      return <TextEditor prop={prop} value={value} onSave={onSave} onDone={onDone} />;
  }
}

function TextEditor({ prop, value, onSave, onDone }: { prop: Property; value: CellValue; onSave: (v: PropValue) => Promise<void>; onDone: () => void }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  const ref = useRef<HTMLTextAreaElement>(null);
  const commit = () => {
    const t = text.trim();
    if (prop.type === "number") {
      const n = Number(t.replace(",", "."));
      void onSave(t === "" ? null : Number.isFinite(n) ? n : (value as number | null));
    } else void onSave(prop.type === "title" ? t : t || null);
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={prop.name}
      value={text}
      inputMode={prop.type === "number" ? "decimal" : undefined}
      placeholder={prop.type === "url" ? "https://" : prop.type === "email" ? "nom@exemple.fr" : undefined}
      onChange={(e) => setText(prop.type === "text" ? e.target.value : e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(prop.type === "text" && e.shiftKey)) {
          e.preventDefault();
          commit();
          onDone();
        } else if (e.key === "Escape") {
          onDone();
        }
      }}
      className="block max-h-[50vh] w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:outline-none"
    />
  );
}

function OptionPicker({
  prop,
  database,
  value,
  onSave,
  onDone,
}: {
  prop: Property;
  database: Database;
  value: string | string[] | null;
  onSave: (v: PropValue) => Promise<void>;
  onDone: () => void;
}) {
  const multi = prop.type === "multi_select";
  const selected = multi ? ((value as string[] | null) ?? []) : value ? [value as string] : [];
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const options = prop.config.options ?? [];
  const filtered = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase());
  const canCreate = q.trim() && !exact;

  const toggle = async (id: string) => {
    if (multi) await onSave(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else {
      await onSave(selected[0] === id ? null : id);
      onDone();
    }
    setQ("");
  };
  const create = async () => {
    const o = await addOption(database.id, prop.id, q.trim());
    await toggle(o.id);
  };

  // Le statut s'affiche par groupes (À faire / En cours / Terminé).
  const sections: { label: string | null; options: SelectOption[] }[] =
    prop.type === "status" && prop.config.groups?.length && !q
      ? prop.config.groups.map((g) => ({ label: g.name, options: g.optionIds.map((id) => options.find((o) => o.id === id)).filter((o): o is SelectOption => !!o) }))
      : [{ label: null, options: filtered }];
  const flat = sections.flatMap((s) => s.options);

  return (
    <div className="flex max-h-[360px] flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
        {selected.map((id) => {
          const o = optionOf(prop, id);
          return o ? (
            <Tag key={id} color={o.color} onRemove={() => void onSave(multi ? selected.filter((x) => x !== id) : null)}>
              {o.name}
            </Tag>
          ) : null;
        })}
        <input
          autoFocus
          aria-label={`Chercher ou créer une option de ${prop.name}`}
          placeholder={prop.type === "status" ? "Chercher une option" : "Chercher ou créer une option"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, flat.length - (canCreate ? 0 : 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (flat[active]) void toggle(flat[active].id);
              else if (canCreate && prop.type !== "status") void create();
            } else if (e.key === "Backspace" && !q && selected.length) {
              void onSave(multi ? selected.slice(0, -1) : null);
            }
          }}
          className="min-w-[80px] flex-1 bg-transparent py-0.5 text-sm outline-none focus-visible:outline-none"
        />
      </div>
      <div className="overflow-y-auto p-1">
        {!q && <p className="px-2 pb-1 pt-1 text-xs text-muted">{prop.type === "status" ? "Choisir un statut" : "Choisir une option ou en créer une"}</p>}
        {sections.map((s, si) => (
          <div key={s.label ?? si}>
            {s.label && <p className="px-2 pb-0.5 pt-1.5 text-xs font-medium text-muted">{s.label}</p>}
            <ul role="listbox" aria-label={s.label ?? prop.name} aria-multiselectable={multi}>
              {s.options.map((o) => {
                const i = flat.indexOf(o);
                return (
                  <li
                    key={o.id}
                    role="option"
                    aria-selected={selected.includes(o.id)}
                    onMouseEnter={() => setActive(i)}
                    className={clsx("group flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2", i === active && "bg-surface-hover")}
                    onClick={() => void toggle(o.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <Tag color={o.color} dot={prop.type === "status"}>
                        {o.name}
                      </Tag>
                    </span>
                    {selected.includes(o.id) && <Check aria-hidden className="size-4 text-muted" />}
                    <button
                      type="button"
                      aria-label={`Modifier l'option ${o.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(editing === o.id ? null : o.id);
                      }}
                      className="flex size-6 items-center justify-center rounded-xs text-muted opacity-0 hover:bg-surface-active focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <MoreHorizontal aria-hidden className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {canCreate && prop.type !== "status" && (
          <button
            type="button"
            onMouseEnter={() => setActive(flat.length)}
            onClick={() => void create()}
            className={clsx("flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm", active === flat.length && "bg-surface-hover")}
          >
            <span className="text-muted">Créer</span>
            <Tag>{q.trim()}</Tag>
          </button>
        )}
        {q && !canCreate && filtered.length === 0 && <p className="px-2 py-2 text-sm text-muted">Aucune option.</p>}
      </div>
      {editing && <OptionEditor database={database} prop={prop} option={options.find((o) => o.id === editing)!} onDone={() => setEditing(null)} />}
    </div>
  );
}

export function OptionEditor({ database, prop, option, onDone }: { database: Database; prop: Property; option: SelectOption; onDone: () => void }) {
  const [name, setName] = useState(option.name);
  if (!option) return null;
  return (
    <div className="border-t border-border p-2">
      <input
        aria-label="Nom de l'option"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== option.name && updateOption(database.id, prop.id, option.id, { name })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void updateOption(database.id, prop.id, option.id, { name });
            onDone();
          }
        }}
        className="mb-2 h-7 w-full rounded-sm border border-border-input bg-bg px-2 text-sm outline-none focus:outline-2 focus:outline-focus"
      />
      <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Couleur">
        {(["default", ...BLOCK_COLORS] as BlockColor[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={option.color === c}
            aria-label={BLOCK_COLOR_LABELS[c]}
            title={BLOCK_COLOR_LABELS[c]}
            onClick={() => updateOption(database.id, prop.id, option.id, { color: c })}
            className={clsx("flex h-6 items-center justify-center rounded-xs border", blockBg(c), option.color === c ? "border-fg" : "border-transparent")}
          >
            {option.color === c && <Check aria-hidden className="size-3" />}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          void deleteOption(database.id, prop.id, option.id);
          onDone();
        }}
        className="mt-2 flex h-7 w-full items-center gap-2 rounded-sm px-2 text-sm text-danger hover:bg-danger-soft"
      >
        <Trash2 aria-hidden className="size-4" />
        Supprimer l&apos;option
      </button>
    </div>
  );
}

const today = () => new Date().toLocaleDateString("sv-SE");

function DateEditor({ value, onSave }: { value: DateValue | null; onSave: (v: PropValue) => Promise<void> }) {
  const v = value ?? null;
  const time = !!v?.time;
  const type = time ? "datetime-local" : "date";
  const toInput = (s?: string | null) => (s ? (time ? s.slice(0, 16) : s.slice(0, 10)) : "");
  const set = (patch: Partial<DateValue>) => void onSave({ start: v?.start ?? today(), ...v, ...patch } as DateValue);
  return (
    <div className="flex flex-col gap-2 p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        {v?.end !== undefined && v?.end !== null ? "Début" : "Date"}
        <input
          autoFocus
          type={type}
          value={toInput(v?.start)}
          onChange={(e) => (e.target.value ? set({ start: e.target.value }) : void onSave(null))}
          className="h-8 rounded-sm border border-border-input bg-bg px-2 text-sm text-fg outline-none focus:outline-2 focus:outline-focus"
        />
      </label>
      {v?.end !== undefined && v?.end !== null && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Fin
          <input
            type={type}
            value={toInput(v.end)}
            min={toInput(v.start)}
            onChange={(e) => set({ end: e.target.value || null })}
            className="h-8 rounded-sm border border-border-input bg-bg px-2 text-sm text-fg outline-none focus:outline-2 focus:outline-focus"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-1 pt-1">
        <ToggleChip on={v?.end !== undefined && v?.end !== null} onClick={() => set({ end: v?.end ? null : (v?.start ?? today()) })}>
          Date de fin
        </ToggleChip>
        <ToggleChip
          on={time}
          onClick={() => {
            if (!v) return set({ time: true, start: `${today()}T09:00` });
            set({ time: !time, start: time ? v.start.slice(0, 10) : `${v.start.slice(0, 10)}T09:00`, end: v.end ? (time ? v.end.slice(0, 10) : `${v.end.slice(0, 10)}T18:00`) : v.end });
          }}
        >
          Inclure l&apos;heure
        </ToggleChip>
        <ToggleChip on={false} onClick={() => set({ start: today() })}>
          Aujourd&apos;hui
        </ToggleChip>
      </div>
      {v && (
        <button type="button" onClick={() => void onSave(null)} className="mt-1 flex h-7 items-center gap-2 rounded-sm px-1 text-sm text-muted hover:bg-surface-hover">
          <X aria-hidden className="size-4" />
          Effacer
        </button>
      )}
    </div>
  );
}

function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx("h-7 rounded-full border px-2.5 text-xs", on ? "border-accent bg-accent-soft text-fg" : "border-border-strong text-muted hover:bg-surface-hover")}
    >
      {children}
    </button>
  );
}

function PersonPicker({ value, onSave }: { value: string[]; onSave: (v: PropValue) => Promise<void> }) {
  const people = usePeople() ?? [];
  return (
    <div className="p-1">
      <p className="px-2 pb-1 pt-1 text-xs text-muted">Membres de l&apos;espace</p>
      <ul role="listbox" aria-multiselectable aria-label="Personnes">
        {people.map((p) => {
          const on = value.includes(p.id);
          return (
            <li key={p.id} role="option" aria-selected={on}>
              <button
                type="button"
                autoFocus={people[0]?.id === p.id}
                onClick={() => void onSave(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-surface-hover"
              >
                <Avatar name={p.name} size={20} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {on && <Check aria-hidden className="size-4 text-muted" />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-2 pb-1 pt-2 text-xs text-muted">Inviter des personnes arrivera avec le travail en équipe.</p>
    </div>
  );
}

function RelationPicker({ row, prop, resolve, value, onSave }: { row: Page; prop: Property; resolve: Resolver; value: string[]; onSave: (v: PropValue) => Promise<void> }) {
  const targetId = prop.config.relation?.databaseId ?? null;
  const rows = useRowsOf(targetId);
  const [q, setQ] = useState("");
  const target = targetId ? resolve.database(targetId) : null;
  const targetTitle = target ? resolve.page(target.pageId)?.title || "Sans titre" : "";
  const candidates = useMemo(
    () => (rows ?? []).filter((r) => r.id !== row.id && (r.title || "Sans titre").toLowerCase().includes(q.trim().toLowerCase())),
    [rows, q, row.id],
  );
  if (!targetId || !target) return <p className="p-3 text-sm text-muted">La base liée n&apos;existe plus.</p>;
  return (
    <div className="flex max-h-[360px] flex-col">
      <input
        autoFocus
        aria-label={`Chercher une page dans ${targetTitle}`}
        placeholder={`Chercher dans ${targetTitle}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-10 border-b border-border bg-surface px-3 text-sm outline-none focus-visible:outline-none"
      />
      <ul className="overflow-y-auto p-1" role="listbox" aria-multiselectable aria-label={targetTitle}>
        {candidates.map((r) => {
          const on = value.includes(r.id);
          return (
            <li key={r.id} role="option" aria-selected={on}>
              <button
                type="button"
                onClick={() => void onSave(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
                className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-surface-hover"
              >
                <span aria-hidden className="flex size-5 items-center justify-center text-muted">
                  {r.icon ?? <FileText className="size-4" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{r.title || "Sans titre"}</span>
                {on && <Check aria-hidden className="size-4 text-muted" />}
              </button>
            </li>
          );
        })}
        {candidates.length === 0 && <li className="px-2 py-2 text-sm text-muted">Aucune page.</li>}
      </ul>
      {q.trim() && (
        <button
          type="button"
          onClick={async () => {
            const created = await createRow(targetId, { title: q.trim() });
            await onSave([...value, created.id]);
            setQ("");
          }}
          className="flex h-9 items-center gap-2 border-t border-border px-3 text-left text-sm hover:bg-surface-hover"
        >
          <Plus aria-hidden className="size-4 text-muted" />
          Nouvelle page « {q.trim()} » dans {targetTitle}
        </button>
      )}
    </div>
  );
}

function FilesEditor({ rowId, value, onSave }: { rowId: string; value: FileValue[]; onSave: (v: PropValue) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="p-2">
      <ul className="flex flex-col gap-1">
        {value.map((f, i) => (
          <li key={i} className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-surface-hover">
            <Paperclip aria-hidden className="size-4 shrink-0 text-muted" />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline"
              onClick={async () => {
                const url = await resolveFileUrl(f.url);
                if (url) window.open(url, "_blank");
              }}
            >
              {f.name}
            </button>
            <button type="button" aria-label={`Retirer ${f.name}`} onClick={() => void onSave(value.filter((_, j) => j !== i))} className="flex size-6 items-center justify-center rounded-xs text-muted hover:bg-surface-active">
              <X aria-hidden className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        autoFocus
        disabled={busy}
        onClick={() => input.current?.click()}
        className="mt-1 flex h-8 w-full items-center gap-2 rounded-sm px-2 text-sm text-muted hover:bg-surface-hover disabled:opacity-50"
      >
        <Upload aria-hidden className="size-4" />
        {busy ? "Import…" : "Importer un fichier"}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          if (!files.length) return;
          setBusy(true);
          try {
            const added: FileValue[] = [];
            for (const f of files) added.push({ name: f.name, url: await uploadFile(f, rowId) });
            await onSave([...value, ...added]);
          } catch (err) {
            toast({ title: err instanceof Error ? err.message : "Import impossible", tone: "error" });
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
