"use client";

import { clsx } from "clsx";
import {
  ArrowUpDown,
  Calendar,
  ChevronDown,
  Copy,
  Filter as FilterIcon,
  Kanban,
  LayoutGrid,
  List,
  Maximize2,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Table2,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { usePageActions } from "@/components/shell/use-page-actions";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton, useToast } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import {
  createRow,
  createView,
  deleteView,
  duplicateView,
  updatePageMeta,
  updateView,
  useDatabaseData,
  type PropValue,
  type ViewType,
} from "@/lib/data";
import { applyView, countFilters, filterOps } from "@/lib/db/query";
import { BoardView, CalendarView, GalleryView, ListView } from "./other-views";
import { AddPropertyMenu } from "./property-menu";
import { RowPeek } from "./row-peek";
import type { ViewProps } from "./shared";
import { TableView } from "./table-view";
import { FilterEditor, PropertiesEditor, SortEditor, VIEW_TYPES, ViewSettings } from "./toolbar";

export const VIEW_ICONS: Record<ViewType, LucideIcon> = { table: Table2, board: Kanban, list: List, gallery: LayoutGrid, calendar: Calendar };

const toolBtn = "flex h-7 items-center gap-1 rounded-sm px-1.5 text-sm text-muted hover:bg-surface-hover hover:text-fg data-[state=open]:bg-surface-hover";

export function DatabaseView({ databaseId, inline = false, readOnly = false }: { databaseId: string; inline?: boolean; readOnly?: boolean }) {
  const data = useDatabaseData(databaseId);
  const router = useRouter();
  const toast = useToast();
  const actions = usePageActions();
  const storeKey = `view:${databaseId}`;
  const [viewId, setViewIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storeKey);
    } catch {
      return null;
    }
  });
  const setViewId = (id: string) => {
    setViewIdState(id);
    try {
      localStorage.setItem(storeKey, id);
    } catch {}
  };
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [panel, setPanel] = useState<"filter" | "sort" | "props" | "settings" | "add" | null>(null);
  const [peek, setPeek] = useState<{ id: string; mode: "side" | "center"; focus?: boolean } | null>(null);

  const view = data ? (data.views.find((v) => v.id === viewId) ?? data.views[0] ?? null) : null;
  const rows = useMemo(() => (data && view ? applyView(data.rows, data.database, view, data.resolve, search) : []), [data, view, search]);

  const openRow = useCallback(
    (id: string, focus?: boolean) => {
      const mode = view?.config.openIn ?? "side";
      if (mode === "full") router.push(`/p/${id}${focus ? "?new=1" : ""}`);
      else setPeek({ id, mode, focus });
    },
    [view, router],
  );

  if (data === undefined) {
    return (
      <div className="flex flex-col gap-2 py-4" aria-busy="true">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (data === null || !view) {
    return <p className="rounded-sm bg-surface px-3 py-2 text-sm text-muted">Cette base de données a été supprimée.</p>;
  }

  const { database, container, resolve } = data;
  const filters = countFilters(view.config.filter);
  const sorts = view.config.sorts.length;

  const onCreate: ViewProps["onCreate"] = async (init) => {
    try {
      // Les filtres simples « est » / « contient » préremplissent la nouvelle ligne, pour qu'elle reste visible.
      const preset: Record<string, PropValue> = {};
      if (view.config.filter.mode === "and") {
        for (const it of view.config.filter.items) {
          if ("items" in it || it.value === null) continue;
          const p = database.properties.find((x) => x.id === it.propertyId);
          if (!p) continue;
          if (it.op === "is" && (p.type === "select" || p.type === "status" || p.type === "checkbox")) preset[p.id] = it.value;
          if (it.op === "contains" && (p.type === "multi_select" || p.type === "person" || p.type === "relation")) preset[p.id] = [it.value as string];
        }
      }
      const row = await createRow(database.id, { ...init, props: { ...preset, ...init?.props } });
      if (view.type !== "table") openRow(row.id, true);
      return row;
    } catch (e) {
      actions.fail(e);
    }
  };

  const onAddFilter = (propertyId: string) => {
    const p = database.properties.find((x) => x.id === propertyId)!;
    void updateView(view.id, {
      config: {
        filter: { ...view.config.filter, items: [...view.config.filter.items, { id: crypto.randomUUID(), propertyId, op: filterOps(p.type)[0].op, value: null }] },
      },
    });
    setPanel("filter");
  };

  const props: ViewProps = { database, view, rows, resolve, readOnly, onOpen: (id) => openRow(id), onCreate, onAddFilter };
  const Body = { table: TableView, board: BoardView, list: ListView, gallery: GalleryView, calendar: CalendarView }[view.type];

  return (
    <div data-db-view className={clsx("min-w-0", inline && "my-2")}>
      {inline && container && (
        <div className="mb-1 flex items-center gap-2">
          <input
            aria-label="Titre de la base de données"
            value={container.title}
            readOnly={readOnly}
            placeholder="Sans titre"
            onChange={(e) => updatePageMeta(container.id, { title: e.target.value })}
            className="min-w-0 flex-1 bg-transparent text-h3 font-semibold outline-none placeholder:text-placeholder focus-visible:outline-none"
          />
          <Link href={`/p/${container.id}`} aria-label="Ouvrir en pleine page" className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
            <Maximize2 aria-hidden className="size-4" />
          </Link>
        </div>
      )}

      {/* Onglets des vues et outils */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-1">
        <div role="tablist" aria-label="Vues" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {data.views.map((v) => {
            const Icon = VIEW_ICONS[v.type];
            const active = v.id === view.id;
            const tab = (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => !active && setViewId(v.id)}
                className={clsx(
                  "relative flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2 text-sm hover:bg-surface-hover",
                  active ? "font-medium text-fg after:absolute after:inset-x-1 after:-bottom-[5px] after:h-0.5 after:bg-fg" : "text-muted",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {v.name}
                {active && !readOnly && <ChevronDown aria-hidden className="size-3 text-muted" />}
              </button>
            );
            if (!active || readOnly) return <span key={v.id}>{tab}</span>;
            return (
              <Menu key={v.id}>
                <MenuTrigger asChild>{tab}</MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Settings2 className="size-4" />} onSelect={() => setTimeout(() => setPanel("settings"), 0)}>
                    Modifier la vue
                  </MenuItem>
                  <MenuItem
                    icon={<Copy className="size-4" />}
                    onSelect={async () => {
                      const copy = await duplicateView(v.id);
                      setViewId(copy.id);
                    }}
                  >
                    Dupliquer la vue
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    danger
                    disabled={data.views.length <= 1}
                    icon={<Trash2 className="size-4" />}
                    onSelect={async () => {
                      try {
                        await deleteView(v.id);
                      } catch (e) {
                        toast({ title: e instanceof Error ? e.message : "Suppression impossible", tone: "error" });
                      }
                    }}
                  >
                    Supprimer la vue
                  </MenuItem>
                </MenuContent>
              </Menu>
            );
          })}
          {!readOnly && (
            <Menu>
              <MenuTrigger asChild>
                <button type="button" aria-label="Ajouter une vue" className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
                  <Plus aria-hidden className="size-4" />
                </button>
              </MenuTrigger>
              <MenuContent>
                {VIEW_TYPES.map((t) => {
                  const Icon = VIEW_ICONS[t.type];
                  return (
                    <MenuItem
                      key={t.type}
                      icon={<Icon className="size-4" />}
                      onSelect={async () => {
                        const created = await createView(database.id, t.type);
                        setViewId(created.id);
                      }}
                    >
                      {t.label}
                    </MenuItem>
                  );
                })}
              </MenuContent>
            </Menu>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <Popover open={panel === "filter"} onOpenChange={(o) => setPanel(o ? "filter" : null)}>
            <PopoverTrigger asChild>
              <button type="button" className={clsx(toolBtn, filters > 0 && "text-accent")} aria-label={filters ? `Filtres (${filters})` : "Filtrer"}>
                <FilterIcon aria-hidden className="size-4" />
                <span className="max-sm:hidden">{filters ? `Filtres · ${filters}` : "Filtrer"}</span>
              </button>
            </PopoverTrigger>
            {panel === "filter" && (
              <PopoverContent className="p-0" align="end">
                <FilterEditor database={database} view={view} />
              </PopoverContent>
            )}
          </Popover>
          <Popover open={panel === "sort"} onOpenChange={(o) => setPanel(o ? "sort" : null)}>
            <PopoverTrigger asChild>
              <button type="button" className={clsx(toolBtn, sorts > 0 && "text-accent")} aria-label={sorts ? `Tris (${sorts})` : "Trier"}>
                <ArrowUpDown aria-hidden className="size-4" />
                <span className="max-sm:hidden">{sorts ? `Tris · ${sorts}` : "Trier"}</span>
              </button>
            </PopoverTrigger>
            {panel === "sort" && (
              <PopoverContent className="p-0" align="end">
                <SortEditor database={database} view={view} />
              </PopoverContent>
            )}
          </Popover>
          {searchOpen ? (
            <span className="flex h-7 items-center gap-1 rounded-sm border border-border-input px-1.5">
              <Search aria-hidden className="size-3.5 text-muted" />
              <input
                autoFocus
                aria-label="Rechercher dans la base"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearch("");
                    setSearchOpen(false);
                  }
                }}
                className="w-32 bg-transparent text-sm outline-none focus-visible:outline-none"
              />
              <button
                type="button"
                aria-label="Fermer la recherche"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                className="text-muted hover:text-fg"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          ) : (
            <button type="button" className={toolBtn} aria-label="Rechercher dans la base" onClick={() => setSearchOpen(true)}>
              <Search aria-hidden className="size-4" />
            </button>
          )}
          {!readOnly && (
            <>
              <Popover open={panel === "props" || panel === "add"} onOpenChange={(o) => setPanel(o ? "props" : null)}>
                <PopoverTrigger asChild>
                  <button type="button" className={toolBtn} aria-label="Propriétés affichées">
                    <SlidersHorizontal aria-hidden className="size-4" />
                  </button>
                </PopoverTrigger>
                {(panel === "props" || panel === "add") && (
                  <PopoverContent className="p-0" align="end">
                    {panel === "add" ? (
                      <AddPropertyMenu database={database} onDone={() => setPanel("props")} />
                    ) : (
                      <PropertiesEditor
                        database={database}
                        view={view}
                        onAdd={
                          <button type="button" onClick={() => setPanel("add")} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-sm text-muted hover:bg-surface-hover">
                            <Plus aria-hidden className="size-4" />
                            Nouvelle propriété
                          </button>
                        }
                      />
                    )}
                  </PopoverContent>
                )}
              </Popover>
              <Popover open={panel === "settings"} onOpenChange={(o) => setPanel(o ? "settings" : null)}>
                <PopoverTrigger asChild>
                  <button type="button" className={toolBtn} aria-label="Réglages de la vue">
                    <Settings2 aria-hidden className="size-4" />
                  </button>
                </PopoverTrigger>
                {panel === "settings" && (
                  <PopoverContent className="p-0" align="end">
                    <ViewSettings database={database} view={view} />
                  </PopoverContent>
                )}
              </Popover>
              <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => void onCreate()}>
                Nouveau
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="pt-2">
        {data.rows.length === 0 && view.type !== "board" && view.type !== "calendar" ? (
          <EmptyState
            icon={<Table2 className="size-8" />}
            title="Aucune page dans cette base"
            body="Chaque ligne est une page, avec ses propriétés et son contenu."
            action={
              !readOnly && (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => void onCreate()}>
                  Nouvelle page
                </Button>
              )
            }
          />
        ) : rows.length === 0 && (filters > 0 || search) && view.type !== "board" && view.type !== "calendar" ? (
          <EmptyState
            icon={<FilterIcon className="size-8" />}
            title="Aucun résultat"
            body={search ? `Rien ne correspond à « ${search} ».` : "Aucune page ne correspond aux filtres de cette vue."}
            action={
              <Button
                onClick={() => {
                  setSearch("");
                  if (filters) void updateView(view.id, { config: { filter: { ...view.config.filter, items: [] } } });
                }}
              >
                {search ? "Effacer la recherche" : "Retirer les filtres"}
              </Button>
            }
          />
        ) : (
          <Body {...props} />
        )}
      </div>

      {peek && <RowPeek key={peek.id} rowId={peek.id} mode={peek.mode} focusTitle={peek.focus} onClose={() => setPeek(null)} />}
    </div>
  );
}
