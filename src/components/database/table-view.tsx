"use client";

import { clsx } from "clsx";
import { ArrowUpRight, Copy, GripVertical, Maximize2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePageActions } from "@/components/shell/use-page-actions";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { createRow, moveRow, updateView, type Page, type Property, type View } from "@/lib/data";
import { CALC_LABELS, calculate, calcsFor, groupRows, type RowGroup } from "@/lib/db/query";
import { Cell } from "./cell";
import { AddPropertyMenu, PropertyMenu } from "./property-menu";
import { PropertyIcon } from "./property-icon";
import { DEFAULT_WIDTH, GroupHeader, RowIcon, TITLE_WIDTH, type ViewProps } from "./shared";

export function TableView(props: ViewProps) {
  const { database, view, rows, resolve } = props;
  const title = database.properties.find((p) => p.type === "title")!;
  const columns = useMemo(
    () => [title, ...view.config.visible.map((id) => database.properties.find((p) => p.id === id)).filter((p): p is Property => !!p && p.type !== "title")],
    [database.properties, view.config.visible, title],
  );
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const groupProp = view.config.groupBy ? database.properties.find((p) => p.id === view.config.groupBy) : null;
  const groups: RowGroup[] | null = groupProp
    ? groupRows(rows, groupProp, resolve).filter((g) => !(view.config.hideEmptyGroups && g.rows.length === 0) && !view.config.hiddenGroups?.includes(g.id))
    : null;

  const widthOf = (p: Property) => view.config.widths?.[p.id] ?? (p.type === "title" ? TITLE_WIDTH : DEFAULT_WIDTH);
  const total = columns.reduce((s, c) => s + widthOf(c), 0) + 40 + 34;

  return (
    <div className="overflow-x-auto pb-2">
      <div style={{ minWidth: total }} className="text-sm">
        <HeaderRow {...props} columns={columns} widthOf={widthOf} />
        {groups ? (
          groups.map((g) => {
            const isCollapsed = collapsed.includes(g.id);
            return (
              <section key={g.id} aria-label={`Groupe ${g.label}`} className="mt-2">
                <GroupHeader group={g} collapsed={isCollapsed} onToggle={() => setCollapsed((c) => (isCollapsed ? c.filter((x) => x !== g.id) : [...c, g.id]))} />
                {!isCollapsed && (
                  <Body {...props} rows={g.rows} columns={columns} widthOf={widthOf} newRowProps={groupProp ? { [groupProp.id]: g.value } : undefined} />
                )}
              </section>
            );
          })
        ) : (
          <Body {...props} columns={columns} widthOf={widthOf} />
        )}
      </div>
    </div>
  );
}

type Cols = { columns: Property[]; widthOf: (p: Property) => number };

function HeaderRow({ database, view, resolve, readOnly, onAddFilter, columns, widthOf }: ViewProps & Cols) {
  const [openProp, setOpenProp] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [liveWidth, setLiveWidth] = useState<Record<string, number>>({});

  const startResize = (e: ReactPointerEvent, p: Property) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(p);
    const clamp = (w: number) => Math.max(80, Math.min(800, w));
    const move = (ev: PointerEvent) => setLiveWidth({ [p.id]: clamp(startW + ev.clientX - startX) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLiveWidth({});
      void updateView(view.id, { config: { widths: { ...view.config.widths, [p.id]: clamp(startW + ev.clientX - startX) } } });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div role="row" className="flex h-9 border-b border-t border-border text-muted">
      <div className="w-10 shrink-0" />
      {columns.map((p) => (
        <div
          key={p.id}
          role="columnheader"
          className="relative flex shrink-0 items-stretch border-r border-border last-of-type:border-r-0"
          style={{ width: liveWidth[p.id] ?? widthOf(p) }}
        >
          <Popover open={openProp === p.id} onOpenChange={(o) => setOpenProp(o ? p.id : null)}>
            <PopoverTrigger asChild>
              <button type="button" disabled={readOnly} className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-left hover:bg-surface-hover disabled:hover:bg-transparent">
                <PropertyIcon type={p.type} className="size-4 shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            </PopoverTrigger>
            {openProp === p.id && (
              <PopoverContent className="p-0">
                <PropertyMenu database={database} prop={p} view={view} resolve={resolve} onClose={() => setOpenProp(null)} onAddFilter={onAddFilter} />
              </PopoverContent>
            )}
          </Popover>
          {!readOnly && (
            <span
              role="separator"
              aria-orientation="vertical"
              aria-label={`Redimensionner ${p.name}`}
              onPointerDown={(e) => startResize(e, p)}
              className="absolute -right-1 top-0 z-[1] h-full w-2 cursor-col-resize hover:bg-accent/40"
            />
          )}
        </div>
      ))}
      {!readOnly && (
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Ajouter une propriété" className="flex w-[34px] shrink-0 items-center justify-center hover:bg-surface-hover">
              <Plus aria-hidden className="size-4" />
            </button>
          </PopoverTrigger>
          {adding && (
            <PopoverContent className="p-0" align="end">
              <AddPropertyMenu database={database} onDone={() => setAdding(false)} />
            </PopoverContent>
          )}
        </Popover>
      )}
    </div>
  );
}

function Body(props: ViewProps & Cols & { newRowProps?: Record<string, import("@/lib/data").PropValue> }) {
  const { database, view, rows, resolve, readOnly, onOpen, columns, widthOf, newRowProps } = props;
  const actions = usePageActions();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const manual = view.config.sorts.length === 0 && !readOnly;

  return (
    <div role="rowgroup">
      {rows.map((row) => (
        <div
          key={row.id}
          role="row"
          className={clsx("group relative flex min-h-9 border-b border-border", dragOver === row.id && "shadow-[inset_0_-2px_0_var(--accent)]")}
          onDragOver={(e) => {
            if (!manual || !e.dataTransfer.types.includes("application/x-row")) return;
            e.preventDefault();
            setDragOver(row.id);
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => {
            setDragOver(null);
            const id = e.dataTransfer.getData("application/x-row");
            if (id && id !== row.id) void moveRow(id, row.id);
          }}
        >
          <div className="flex w-10 shrink-0 items-center justify-end gap-0.5 pr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
            {!readOnly && (
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    draggable={manual}
                    onDragStart={(e) => e.dataTransfer.setData("application/x-row", row.id)}
                    aria-label={`Actions pour ${row.title || "Sans titre"}`}
                    title={manual ? "Glisser pour déplacer, cliquer pour les actions" : "Actions"}
                    className="flex h-6 w-4 items-center justify-center rounded-xs text-muted hover:bg-surface-hover"
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Maximize2 className="size-4" />} onSelect={() => onOpen(row.id)}>
                    Ouvrir
                  </MenuItem>
                  <MenuItem icon={<ArrowUpRight className="size-4" />} onSelect={() => window.open(`/p/${row.id}`, "_blank")}>
                    Ouvrir dans un nouvel onglet
                  </MenuItem>
                  <MenuItem
                    icon={<Copy className="size-4" />}
                    onSelect={async () => {
                      await createRow(database.id, { title: row.title ? `${row.title} (copie)` : "", props: structuredClone(row.props ?? {}), after: row.id });
                    }}
                  >
                    Dupliquer
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => actions.trash(row.id)}>
                    Supprimer
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
          </div>
          {columns.map((p) => (
            <div
              key={p.id}
              role="cell"
              className={clsx("relative flex min-h-9 shrink-0 border-r border-border last-of-type:border-r-0", p.type === "title" && "font-medium")}
              style={{ width: widthOf(p) }}
            >
              {p.type === "title" ? (
                <div className="flex min-w-0 flex-1 items-center">
                  <span className="pl-1.5">
                    <RowIcon row={row} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Cell row={row} prop={p} database={database} resolve={resolve} mode="table" readOnly={readOnly} wrap={view.config.wrapCells} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpen(row.id)}
                    className="absolute right-1.5 top-1.5 flex h-6 items-center gap-1 rounded-sm border border-border bg-bg px-1.5 text-xs font-medium text-muted opacity-0 shadow-card hover:bg-surface-hover group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                  >
                    <Maximize2 aria-hidden className="size-3" />
                    Ouvrir
                  </button>
                </div>
              ) : (
                <Cell row={row} prop={p} database={database} resolve={resolve} mode="table" readOnly={readOnly} wrap={view.config.wrapCells} />
              )}
            </div>
          ))}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() => void props.onCreate({ props: newRowProps })}
          className="flex h-9 w-full items-center gap-1.5 border-b border-border pl-11 text-left text-sm text-muted hover:bg-surface-hover"
        >
          <Plus aria-hidden className="size-4" />
          Nouvelle page
        </button>
      )}
      <CalcRow view={view} rows={rows} columns={columns} widthOf={widthOf} resolve={resolve} readOnly={readOnly} />
    </div>
  );
}

function CalcRow({
  view,
  rows,
  columns,
  widthOf,
  resolve,
  readOnly,
}: { view: View; rows: Page[]; resolve: ViewProps["resolve"]; readOnly: boolean } & Cols) {
  return (
    <div className="group/calc flex h-8 text-xs text-muted">
      <div className="w-10 shrink-0" />
      {columns.map((p) => {
        const fn = view.config.calcs?.[p.id] ?? "none";
        const result = calculate(fn, rows, p, resolve);
        return (
          <div key={p.id} className="flex shrink-0 justify-end" style={{ width: widthOf(p) }}>
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  disabled={readOnly}
                  aria-label={`Calcul pour ${p.name}`}
                  className={clsx(
                    "flex h-full w-full items-center justify-end gap-1 px-2 hover:bg-surface-hover",
                    fn === "none" && "opacity-0 group-hover/calc:opacity-100 focus-visible:opacity-100",
                  )}
                >
                  {fn === "none" ? (
                    "Calculer"
                  ) : (
                    <>
                      <span className="uppercase tracking-wide">{CALC_LABELS[fn]}</span>
                      <span className="font-medium text-fg">{result}</span>
                    </>
                  )}
                </button>
              </MenuTrigger>
              <MenuContent align="end">
                {calcsFor(p.type).map((f) => (
                  <MenuItem key={f} onSelect={() => updateView(view.id, { config: { calcs: { ...view.config.calcs, [p.id]: f } } })}>
                    {CALC_LABELS[f]}
                    {f === fn ? " ✓" : ""}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </div>
        );
      })}
    </div>
  );
}
