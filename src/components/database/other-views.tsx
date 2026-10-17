"use client";

import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Tag, type BlockColor } from "@/components/ui/display";
import { updateRowProp, type DateValue, type Page, type Property, type PropValue } from "@/lib/data";
import { cellValue, groupRows, isEmpty, parseDay, type RowGroup } from "@/lib/db/query";
import { CellDisplay } from "./cell";
import { CardPreview, GroupHeader, RowIcon, type ViewProps } from "./shared";

function visibleProps(props: ViewProps): Property[] {
  return props.view.config.visible
    .map((id) => props.database.properties.find((p) => p.id === id))
    .filter((p): p is Property => !!p && p.type !== "title");
}

/* ------------------------------------------------------------------ carte */

function Card({ row, props, dragGroup }: { row: Page; props: ViewProps; dragGroup?: string }) {
  const shown = visibleProps(props);
  const cover = props.view.config.cardCover ?? "none";
  return (
    <div
      draggable={!!dragGroup && !props.readOnly}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-card", JSON.stringify({ id: row.id, from: dragGroup }));
        e.dataTransfer.effectAllowed = "move";
      }}
      className="overflow-hidden rounded-md bg-bg shadow-card hover:bg-surface"
    >
      <button type="button" onClick={() => props.onOpen(row.id)} className="block w-full text-left">
        {cover !== "none" && <CardPreview row={row} mode={cover} />}
        <span className="flex items-start gap-1.5 px-2.5 pb-1 pt-2 text-sm font-medium">
          {row.icon && <span aria-hidden>{row.icon}</span>}
          <span className="min-w-0 break-words">{row.title || "Sans titre"}</span>
        </span>
        <span className="flex flex-col gap-1 px-2.5 pb-2.5 text-sm">
          {shown.map((p) => {
            const v = cellValue(row, p, props.resolve);
            if (isEmpty(v) && p.type !== "checkbox") return null;
            return (
              <span key={p.id} className="flex min-w-0 items-center" title={p.name}>
                <CellDisplay value={v} prop={p} resolve={props.resolve} mode="card" />
              </span>
            );
          })}
        </span>
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- Kanban */

export function BoardView(props: ViewProps) {
  const { database, view, rows, resolve, readOnly } = props;
  const groupProp = database.properties.find((p) => p.id === view.config.groupBy);
  const [over, setOver] = useState<string | null>(null);
  if (!groupProp) {
    return <p className="py-8 text-center text-sm text-muted">Choisissez une propriété de regroupement dans les réglages de la vue.</p>;
  }
  const groups = groupRows(rows, groupProp, resolve).filter((g) => !(view.config.hideEmptyGroups && g.rows.length === 0) && !view.config.hiddenGroups?.includes(g.id));

  // Déposer une carte dans une colonne change la valeur de la propriété de regroupement.
  const drop = async (g: RowGroup, raw: string) => {
    const { id, from } = JSON.parse(raw) as { id: string; from: string };
    if (from === g.id) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    let next: PropValue = g.value;
    if (groupProp.type === "multi_select") {
      const cur = ((row.props?.[groupProp.id] as string[]) ?? []).filter((x) => x !== from);
      next = g.id === "__none" ? [] : [...new Set([...cur, ...(g.value as string[])])];
    }
    await updateRowProp(id, groupProp.id, next);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {groups.map((g) => (
        <section
          key={g.id}
          aria-label={`Colonne ${g.label}`}
          className={clsx("flex w-[260px] shrink-0 flex-col gap-2 rounded-lg p-1.5", over === g.id ? "bg-accent-soft" : "bg-surface")}
          onDragOver={(e) => {
            if (readOnly || !e.dataTransfer.types.includes("application/x-card")) return;
            e.preventDefault();
            setOver(g.id);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const raw = e.dataTransfer.getData("application/x-card");
            if (raw) void drop(g, raw);
          }}
        >
          <header className="flex h-7 items-center gap-2 px-1">
            <Tag color={g.color as BlockColor} dot={groupProp.type === "status"}>
              {g.label}
            </Tag>
            <span className="text-sm text-muted">{g.rows.length}</span>
            {!readOnly && (
              <button
                type="button"
                aria-label={`Nouvelle page dans ${g.label}`}
                onClick={() => void props.onCreate({ props: { [groupProp.id]: g.value } })}
                className="ml-auto flex size-6 items-center justify-center rounded-xs text-muted hover:bg-surface-hover"
              >
                <Plus aria-hidden className="size-4" />
              </button>
            )}
          </header>
          {g.rows.map((r) => (
            <Card key={r.id} row={r} props={props} dragGroup={g.id} />
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => void props.onCreate({ props: { [groupProp.id]: g.value } })}
              className="flex h-8 items-center gap-1.5 rounded-sm px-2 text-left text-sm text-muted hover:bg-surface-hover"
            >
              <Plus aria-hidden className="size-4" />
              Nouvelle page
            </button>
          )}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ liste */

export function ListView(props: ViewProps) {
  const { database, view, rows, resolve, readOnly } = props;
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const groupProp = view.config.groupBy ? database.properties.find((p) => p.id === view.config.groupBy) : null;
  const shown = visibleProps(props);

  const list = (items: Page[], newProps?: Record<string, PropValue>) => (
    <ul>
      {items.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => props.onOpen(r.id)} className="flex min-h-9 w-full items-center gap-2 rounded-sm px-1 text-left text-sm hover:bg-surface-hover">
            <RowIcon row={r} />
            <span className="min-w-0 flex-1 truncate font-medium">{r.title || "Sans titre"}</span>
            <span className="flex max-w-[60%] shrink-0 items-center gap-3 overflow-hidden text-muted max-sm:hidden">
              {shown.map((p) => {
                const v = cellValue(r, p, resolve);
                if (isEmpty(v) && p.type !== "checkbox") return null;
                return (
                  <span key={p.id} className="flex min-w-0 max-w-[200px] items-center" title={p.name}>
                    <CellDisplay value={v} prop={p} resolve={resolve} mode="table" />
                  </span>
                );
              })}
            </span>
          </button>
        </li>
      ))}
      {!readOnly && (
        <li>
          <button type="button" onClick={() => void props.onCreate({ props: newProps })} className="flex h-9 w-full items-center gap-1.5 rounded-sm px-1 text-left text-sm text-muted hover:bg-surface-hover">
            <Plus aria-hidden className="size-4" />
            Nouvelle page
          </button>
        </li>
      )}
    </ul>
  );

  if (!groupProp) return <div className="border-t border-border pt-1">{list(rows)}</div>;
  return (
    <div className="border-t border-border pt-1">
      {groupRows(rows, groupProp, resolve)
        .filter((g) => !(view.config.hideEmptyGroups && g.rows.length === 0))
        .map((g) => {
          const isCollapsed = collapsed.includes(g.id);
          return (
            <section key={g.id} aria-label={`Groupe ${g.label}`}>
              <GroupHeader group={g} collapsed={isCollapsed} onToggle={() => setCollapsed((c) => (isCollapsed ? c.filter((x) => x !== g.id) : [...c, g.id]))} />
              {!isCollapsed && <div className="pl-6">{list(g.rows, { [groupProp.id]: g.value })}</div>}
            </section>
          );
        })}
    </div>
  );
}

/* ---------------------------------------------------------------- galerie */

export function GalleryView(props: ViewProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 border-t border-border pt-3">
      {props.rows.map((r) => (
        <Card key={r.id} row={r} props={props} />
      ))}
      {!props.readOnly && (
        <button
          type="button"
          onClick={() => void props.onCreate()}
          className="flex min-h-[120px] items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong text-sm text-muted hover:bg-surface-hover"
        >
          <Plus aria-hidden className="size-4" />
          Nouvelle page
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- calendrier */

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const dayKey = (d: Date) => d.toLocaleDateString("sv-SE");

export function CalendarView(props: ViewProps) {
  const { database, view, rows, resolve, readOnly } = props;
  const dateProp = database.properties.find((p) => p.id === view.config.dateProperty);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const { byDay, undated } = useMemo(() => {
    const map = new Map<string, Page[]>();
    let none = 0;
    if (!dateProp) return { byDay: map, undated: rows.length };
    for (const r of rows) {
      const v = cellValue(r, dateProp, resolve);
      const start = typeof v === "string" ? v.slice(0, 10) : (v as DateValue | null)?.start?.slice(0, 10);
      if (!start) {
        none++;
        continue;
      }
      const end = (v as DateValue | null)?.end?.slice(0, 10) ?? start;
      // Une plage s'affiche chaque jour (bornée à 62 jours pour rester lisible).
      const d = parseDay(start);
      for (let i = 0; i < 62 && dayKey(d) <= end; i++) {
        const k = dayKey(d);
        map.set(k, [...(map.get(k) ?? []), r]);
        d.setDate(d.getDate() + 1);
      }
    }
    return { byDay: map, undated: none };
  }, [rows, dateProp, resolve]);

  if (!dateProp) return <p className="py-8 text-center text-sm text-muted">Choisissez une propriété de date dans les réglages de la vue.</p>;

  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7; // semaine commençant le lundi
  const start = new Date(first);
  start.setDate(1 - offset);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const todayKey = dayKey(new Date());
  const label = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const editable = !readOnly && dateProp.type === "date";

  return (
    <div className="border-t border-border pt-2">
      <div className="mb-2 flex items-center gap-1">
        <h3 className="flex-1 text-base font-semibold first-letter:uppercase">{label}</h3>
        {undated > 0 && <span className="mr-2 text-xs text-muted">{undated} sans date</span>}
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mois précédent" className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            const d = new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
          }}
          className="h-7 rounded-sm px-2 text-sm text-muted hover:bg-surface-hover"
        >
          Aujourd&apos;hui
        </button>
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mois suivant" className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 border-l border-t border-border">
          {WEEKDAYS.map((w) => (
            <div key={w} className="border-b border-r border-border px-2 py-1 text-xs text-muted">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const k = dayKey(d);
            const items = byDay.get(k) ?? [];
            const inMonth = d.getMonth() === month.getMonth();
            return (
              <div
                key={k}
                className={clsx("group min-h-[110px] border-b border-r border-border p-1", !inMonth && "bg-surface")}
                onDragOver={(e) => {
                  if (editable && e.dataTransfer.types.includes("application/x-card")) e.preventDefault();
                }}
                onDrop={(e) => {
                  const raw = e.dataTransfer.getData("application/x-card");
                  if (!raw || !editable) return;
                  const { id } = JSON.parse(raw) as { id: string };
                  const r = rows.find((x) => x.id === id);
                  const cur = r?.props?.[dateProp.id] as DateValue | null;
                  // Déplacer une plage garde sa durée.
                  let end: string | null | undefined = cur?.end;
                  if (cur?.end) {
                    const len = (parseDay(cur.end).getTime() - parseDay(cur.start).getTime()) / 86400000;
                    const e2 = parseDay(k);
                    e2.setDate(e2.getDate() + Math.round(len));
                    end = dayKey(e2);
                  }
                  void updateRowProp(id, dateProp.id, { ...cur, start: cur?.time ? `${k}${cur.start.slice(10)}` : k, end });
                }}
              >
                <div className="mb-1 flex items-center justify-between">
                  {editable ? (
                    <button
                      type="button"
                      aria-label={`Nouvelle page le ${d.toLocaleDateString("fr-FR")}`}
                      onClick={() => void props.onCreate({ props: { [dateProp.id]: { start: k } } })}
                      className="flex size-5 items-center justify-center rounded-xs text-muted opacity-0 hover:bg-surface-hover focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Plus aria-hidden className="size-3.5" />
                    </button>
                  ) : (
                    <span />
                  )}
                  <span
                    className={clsx(
                      "flex size-6 items-center justify-center rounded-full text-xs",
                      k === todayKey ? "bg-danger font-semibold text-bg" : inMonth ? "text-fg" : "text-muted",
                    )}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <ul className="flex flex-col gap-1">
                  {items.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        draggable={editable}
                        onDragStart={(e) => e.dataTransfer.setData("application/x-card", JSON.stringify({ id: r.id }))}
                        onClick={() => props.onOpen(r.id)}
                        className="block w-full truncate rounded-sm bg-bg px-1.5 py-0.5 text-left text-xs font-medium shadow-card hover:bg-surface-hover"
                      >
                        {r.icon ? `${r.icon} ` : ""}
                        {r.title || "Sans titre"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export type { RowGroup };
