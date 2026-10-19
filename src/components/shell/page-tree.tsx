"use client";

import { clsx } from "clsx";
import {
  ArrowUpRight,
  ChevronRight,
  Copy,
  CornerUpRight,
  FileText,
  Link2,
  MoreHorizontal,
  PenLine,
  Plus,
  Star,
  StarOff,
  Table2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type DragEvent } from "react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, PopoverAnchor, PopoverContent } from "@/components/ui/overlay";
import { DataError, movePage, updatePageMeta, useCanEdit, useChildren, useIsFavorite, type PageSummary, type Section } from "@/lib/data";
import { useShell } from "./shell-context";
import { usePageActions } from "./use-page-actions";

const INDENT = 12;

/* Glisser-déposer : l'id de la page déplacée, partagé entre les lignes de l'arbre. */
let dragged: string | null = null;
type DropZone = "before" | "inside" | "after";

export function PageTree({ parentId, section, depth = 0 }: { parentId: string | null; section: Section; depth?: number }) {
  const children = useChildren(parentId, section);
  if (children === undefined) return null;
  if (children.length === 0) {
    return depth === 0 ? null : (
      <p className="h-[30px] text-sm leading-[30px] text-placeholder" style={{ paddingLeft: 8 + depth * INDENT + 26 }}>
        Aucune page à l&apos;intérieur
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-px">
      {children.map((p, i) => (
        <TreeRow key={p.id} page={p} index={i} section={section} depth={depth} />
      ))}
    </ul>
  );
}

function TreeRow({ page, index, section, depth }: { page: PageSummary; index: number; section: Section; depth: number }) {
  const pathname = usePathname();
  const active = pathname === `/p/${page.id}`;
  const [expanded, setExpanded] = useState(false);
  const [drop, setDrop] = useState<DropZone | null>(null);
  const [renaming, setRenaming] = useState(false);
  const shell = useShell();
  const actions = usePageActions();
  const isFav = useIsFavorite(page.id);
  // Page partagée en lecture seule : ni renommage, ni déplacement, ni sous-page (le serveur refuserait).
  const canEdit = useCanEdit(page.id) !== false;
  const title = page.title || "Sans titre";

  const zoneOf = (e: DragEvent<HTMLDivElement>): DropZone => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zone = zoneOf(e);
    setDrop(null);
    const id = dragged;
    dragged = null;
    if (!id || id === page.id) return;
    try {
      if (zone === "inside") {
        await movePage(id, { parentId: page.id, section });
        setExpanded(true);
      } else {
        await movePage(id, { parentId: page.parentId, section, index: zone === "before" ? index : index + 1 });
      }
    } catch (err) {
      actions.fail(err instanceof DataError ? err : new Error("Déplacement impossible."));
    }
  };

  return (
    <li>
      <Popover open={renaming} onOpenChange={setRenaming}>
        <PopoverAnchor asChild>
          <div
            draggable={!shell.isMobile && canEdit}
            onDragStart={(e) => {
              dragged = page.id;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", title);
            }}
            onDragEnd={() => {
              dragged = null;
              setDrop(null);
            }}
            onDragOver={(e) => {
              if (!dragged || dragged === page.id || !canEdit) return;
              e.preventDefault();
              setDrop(zoneOf(e));
            }}
            onDragLeave={() => setDrop(null)}
            onDrop={onDrop}
            className={clsx(
              "group relative flex h-[30px] items-center gap-1 rounded-sm pr-1 text-sm",
              "hover:bg-surface-hover",
              active ? "bg-surface-hover font-medium text-fg" : "text-muted",
              drop === "inside" && "bg-accent-soft",
            )}
            style={{ paddingLeft: 8 + depth * INDENT }}
          >
            {drop === "before" && <span aria-hidden className="pointer-events-none absolute inset-x-1 top-0 h-0.5 rounded-full bg-accent" />}
            {drop === "after" && <span aria-hidden className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />}

            <span className="relative flex size-[22px] shrink-0 items-center justify-center">
              <span aria-hidden className="flex items-center justify-center group-hover:invisible">
                {page.icon ? <span className="text-base leading-none">{page.icon}</span> : page.databaseOwnerOf ? <Table2 className="size-4" /> : <FileText className="size-4" />}
              </span>
              <button
                type="button"
                onClick={() => setExpanded((x) => !x)}
                aria-label={expanded ? `Replier ${title}` : `Déplier ${title}`}
                className="invisible absolute inset-0 flex items-center justify-center rounded-xs hover:bg-surface-active group-hover:visible focus-visible:visible"
              >
                <ChevronRight aria-hidden className={clsx("size-4 transition-transform duration-100", expanded && "rotate-90")} />
              </button>
            </span>

            <Link
              href={`/p/${page.id}`}
              onClick={shell.closeSidebarOnMobile}
              aria-current={active ? "page" : undefined}
              className="min-w-0 flex-1 truncate rounded-xs py-1"
            >
              {title}
            </Link>

            <span className="flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100 max-md:opacity-100">
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Actions pour ${title}`}
                    className="flex size-5 items-center justify-center rounded-xs hover:bg-surface-active data-[state=open]:bg-surface-active"
                  >
                    <MoreHorizontal aria-hidden className="size-4" />
                  </button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={isFav ? <StarOff className="size-4" /> : <Star className="size-4" />} onSelect={() => actions.favorite(page.id)}>
                    {isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Copy className="size-4" />} disabled={!canEdit} onSelect={() => actions.duplicate(page.id)}>
                    Dupliquer
                  </MenuItem>
                  <MenuItem icon={<PenLine className="size-4" />} disabled={!canEdit} onSelect={() => setTimeout(() => setRenaming(true), 0)}>
                    Renommer
                  </MenuItem>
                  <MenuItem icon={<CornerUpRight className="size-4" />} disabled={!canEdit} onSelect={() => shell.openMove(page.id)}>
                    Déplacer vers…
                  </MenuItem>
                  <MenuItem icon={<Link2 className="size-4" />} onSelect={() => actions.copyLink(page.id)}>
                    Copier le lien
                  </MenuItem>
                  <MenuItem icon={<ArrowUpRight className="size-4" />} onSelect={() => window.open(`/p/${page.id}`, "_blank")}>
                    Ouvrir dans un nouvel onglet
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 className="size-4" />} disabled={!canEdit} onSelect={() => actions.trash(page.id, { redirect: active })}>
                    Supprimer
                  </MenuItem>
                </MenuContent>
              </Menu>
              {canEdit && (
              <button
                type="button"
                aria-label={`Ajouter une page dans ${title}`}
                onClick={async () => {
                  setExpanded(true);
                  await actions.create(page.id, section);
                  shell.closeSidebarOnMobile();
                }}
                className="flex size-5 items-center justify-center rounded-xs hover:bg-surface-active"
              >
                <Plus aria-hidden className="size-4" />
              </button>
              )}
            </span>
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-[280px] p-1.5" onOpenAutoFocus={(e) => e.preventDefault()}>
          <RenameForm page={page} onDone={() => setRenaming(false)} />
        </PopoverContent>
      </Popover>

      {expanded && <PageTree parentId={page.id} section={section} depth={depth + 1} />}
    </li>
  );
}

function RenameForm({ page, onDone }: { page: PageSummary; onDone: () => void }) {
  const [value, setValue] = useState(page.title);
  const save = async () => {
    if (value !== page.title) await updatePageMeta(page.id, { title: value.trim() });
    onDone();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="sr-only" htmlFor={`rename-${page.id}`}>
        Nouveau titre
      </label>
      <input
        id={`rename-${page.id}`}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        placeholder="Sans titre"
        className="h-7 w-full rounded-sm border border-border-input bg-bg px-2 text-sm outline-none focus:outline-2 focus:outline-focus"
      />
    </form>
  );
}

/** Zone de dépôt d'un en-tête de section : déposer une page à la racine de la section. */
export function useSectionDrop(section: Section) {
  const [over, setOver] = useState(false);
  const actions = usePageActions();
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!dragged) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: async (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const id = dragged;
        dragged = null;
        if (!id) return;
        try {
          await movePage(id, { parentId: null, section, index: 0 });
        } catch (err) {
          actions.fail(err);
        }
      },
    },
  };
}
