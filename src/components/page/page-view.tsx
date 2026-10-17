"use client";

import { clsx } from "clsx";
import {
  Check,
  ChevronsRight,
  Copy,
  CornerUpRight,
  FileQuestion,
  Link2,
  Lock,
  LockOpen,
  MoreHorizontal,
  RotateCcw,
  Star,
  Trash2,
  Type,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, Skeleton, Spinner, useToast } from "@/components/ui/display";
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui/overlay";
import { BareTopBar, SidebarToggle } from "@/components/shell/bare-top-bar";
import { useShell } from "@/components/shell/shell-context";
import { usePageActions } from "@/components/shell/use-page-actions";
import { deleteForever, markVisited, setTrash, updatePageMeta, useIsFavorite, usePage, usePath, type Page, type PageFont } from "@/lib/data";
import type { SaveStatus } from "./editor";
import { DatabaseView } from "@/components/database/database-view";
import { RowProperties } from "@/components/database/row-properties";
import { Cover, HeaderControls, IconPicker } from "./page-header";

const PageEditor = dynamic(() => import("./editor").then((m) => m.PageEditor), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3 pt-2" aria-label="Chargement de l'éditeur">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  ),
});

const FONT_CLASS: Record<PageFont, string> = { default: "font-sans", serif: "font-serif", mono: "font-mono" };

export function PageView({ id }: { id: string }) {
  const page = usePage(id);

  useEffect(() => {
    if (page) void markVisited(page.id);
  }, [page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = page ? `${page.icon ? page.icon + " " : ""}${page.title || "Sans titre"}` : "Espace de travail";
  }, [page?.title, page?.icon]); // eslint-disable-line react-hooks/exhaustive-deps

  if (page === undefined) return <PageSkeleton />;
  if (page === null) return <NotFound />;
  return <Loaded page={page} />;
}

function Loaded({ page }: { page: Page }) {
  const [status, setStatus] = useState<{ s: SaveStatus; detail?: string }>({ s: "saved" });
  const toast = useToast();
  const router = useRouter();
  const editable = !page.isLocked && !page.inTrash;

  const onStatus = (s: SaveStatus, detail?: string) => {
    setStatus({ s, detail });
    if ((s === "error" || s === "conflict") && detail) toast({ title: detail, tone: "error" });
  };

  return (
    <>
      <TopBar page={page} status={status.s} />
      <div className="min-h-0 flex-1 overflow-y-auto" id="page-scroll">
        {page.inTrash && <TrashBanner page={page} />}
        {status.s === "conflict" && (
          <div role="alert" className="flex flex-wrap items-center justify-center gap-3 bg-block-yellow-bg px-4 py-2 text-sm">
            Cette page a changé dans un autre onglet. Vos dernières modifications ne sont pas enregistrées.
            <Button size="sm" onClick={() => window.location.reload()}>
              Recharger la page
            </Button>
          </div>
        )}
        <Cover page={page} editable={editable} />
        <article
          className={clsx(
            "mx-auto w-full px-6 pb-[30vh] sm:px-12 md:px-24",
            page.fullWidth ? "max-w-none" : "max-w-[calc(708px+192px)]",
            page.smallText && "page-small",
            FONT_CLASS[page.font],
          )}
        >
          <header className={clsx("group/header", page.coverUrl ? (page.icon ? "-mt-10" : "pt-6") : "pt-20 max-md:pt-10")}>
            {page.icon && (
              <IconPicker
                page={page}
                trigger={
                  <button
                    type="button"
                    disabled={!editable}
                    aria-label="Changer l'icône"
                    className="relative z-[1] mb-1 flex size-[78px] items-center justify-center rounded-md text-[64px] leading-none hover:bg-surface-hover disabled:hover:bg-transparent"
                  >
                    {page.icon}
                  </button>
                }
              />
            )}
            {editable && <HeaderControls page={page} />}
            <TitleInput page={page} editable={editable} onEnter={() => focusEditor()} />
          </header>
          {page.databaseOwnerOf ? (
            <div className="mt-4">
              <DatabaseView databaseId={page.databaseOwnerOf} readOnly={!editable} />
            </div>
          ) : (
            <>
              {page.rowOf && (
                <>
                  <RowProperties row={page} readOnly={!editable} />
                  <div className="my-2 h-px bg-border" />
                </>
              )}
              <div className="-mx-[54px] mt-2 max-md:-mx-3">
                <PageEditor key={page.id} page={page} editable={editable} onStatus={onStatus} onNavigate={(cid) => router.push(`/p/${cid}?new=1`)} />
              </div>
            </>
          )}
        </article>
      </div>
    </>
  );
}

function focusEditor() {
  const el = document.querySelector<HTMLElement>(".page-editor [contenteditable=true]");
  el?.focus();
}

function TitleInput({ page, editable, onEnter }: { page: Page; editable: boolean; onEnter: () => void }) {
  const [value, setValue] = useState(page.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  const params = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Titre modifié ailleurs (sidebar, autre onglet) : on suit, sauf pendant la frappe.
  const [synced, setSynced] = useState(page.title);
  const [focused, setFocused] = useState(false);
  if (page.title !== synced) {
    setSynced(page.title);
    if (!focused) setValue(page.title);
  }

  useEffect(() => {
    if (params.get("new") === "1") ref.current?.focus();
  }, [params, page.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const save = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void updatePageMeta(page.id, { title: v }), 300);
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      readOnly={!editable}
      aria-label="Titre de la page"
      placeholder="Sans titre"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, "");
        setValue(v);
        save(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
      className={clsx(
        "mt-1 block w-full resize-none overflow-hidden bg-transparent text-title font-bold text-fg outline-none placeholder:text-placeholder focus-visible:outline-none",
        "max-md:text-h1",
      )}
    />
  );
}

function TopBar({ page, status }: { page: Page; status: SaveStatus }) {
  const shell = useShell();
  const path = usePath(page.id) ?? [];
  const isFav = useIsFavorite(page.id);
  const actions = usePageActions();
  const crumbs = path.length > 2 ? [path[0], null, path[path.length - 1]] : path;

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 px-3">
      <SidebarToggle />
      <nav aria-label="Fil d'Ariane" className="flex min-w-0 flex-1 items-center text-sm">
        {crumbs.map((c, i) =>
          c === null ? (
            <span key={`gap-${i}`} className="flex items-center text-muted">
              <span className="px-1">…</span>
              <span aria-hidden className="text-placeholder">/</span>
            </span>
          ) : (
            <span key={c.id} className="flex min-w-0 items-center max-md:hidden">
              <Link href={`/p/${c.id}`} className="flex min-w-0 items-center gap-1 truncate rounded-xs px-1 py-0.5 text-muted hover:bg-surface-hover hover:text-fg">
                {c.icon && <span aria-hidden>{c.icon}</span>}
                <span className="max-w-[160px] truncate">{c.title || "Sans titre"}</span>
              </Link>
              <span aria-hidden className="text-placeholder">/</span>
            </span>
          ),
        )}
        <span aria-current="page" className="flex min-w-0 items-center gap-1 truncate px-1 py-0.5">
          {page.icon && <span aria-hidden>{page.icon}</span>}
          <span className="truncate">{page.title || "Sans titre"}</span>
          {page.isLocked && <Lock aria-label="Verrouillée" className="ml-1 size-3.5 shrink-0 text-muted" />}
        </span>
      </nav>

      <SaveIndicator status={status} />

      <Tooltip label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}>
        <IconButton label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={() => actions.favorite(page.id)} disabled={page.inTrash}>
          <Star aria-hidden className={clsx("size-4", isFav && "fill-current text-block-yellow")} />
        </IconButton>
      </Tooltip>

      <Menu>
        <MenuTrigger asChild>
          <IconButton label="Options de la page">
            <MoreHorizontal aria-hidden className="size-4" />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuLabel>Style</MenuLabel>
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {(
              [
                ["default", "Ag", "Défaut", "font-sans"],
                ["serif", "Ag", "Serif", "font-serif"],
                ["mono", "Ag", "Mono", "font-mono"],
              ] as const
            ).map(([f, sample, label, cls]) => (
              <button
                key={f}
                type="button"
                disabled={page.inTrash}
                aria-pressed={page.font === f}
                onClick={() => updatePageMeta(page.id, { font: f })}
                className={clsx(
                  "flex flex-col items-center rounded-sm py-1.5 hover:bg-surface-hover",
                  page.font === f ? "text-accent" : "text-fg",
                )}
              >
                <span className={clsx("text-h3", cls)}>{sample}</span>
                <span className="text-xs text-muted">{label}</span>
              </button>
            ))}
          </div>
          <MenuSeparator />
          <MenuCheckItem checked={page.smallText} onCheckedChange={(v) => updatePageMeta(page.id, { smallText: v })}>
            <span className="flex items-center gap-2">
              <Type aria-hidden className="size-4 text-muted" />
              Petit texte
            </span>
          </MenuCheckItem>
          <MenuCheckItem checked={page.fullWidth} onCheckedChange={(v) => updatePageMeta(page.id, { fullWidth: v })}>
            <span className="flex items-center gap-2">
              <ChevronsRight aria-hidden className="size-4 text-muted" />
              Pleine largeur
            </span>
          </MenuCheckItem>
          <MenuItem
            icon={page.isLocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            onSelect={() => updatePageMeta(page.id, { isLocked: !page.isLocked })}
            disabled={page.inTrash}
          >
            {page.isLocked ? "Déverrouiller la page" : "Verrouiller la page"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Link2 className="size-4" />} onSelect={() => actions.copyLink(page.id)}>
            Copier le lien
          </MenuItem>
          <MenuItem icon={<Copy className="size-4" />} onSelect={() => actions.duplicate(page.id)} disabled={page.inTrash}>
            Dupliquer
          </MenuItem>
          <MenuItem icon={<CornerUpRight className="size-4" />} onSelect={() => shell.openMove(page.id)} disabled={page.inTrash}>
            Déplacer vers…
          </MenuItem>
          <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => actions.trash(page.id)} disabled={page.inTrash}>
            Supprimer
          </MenuItem>
          <MenuSeparator />
          <p className="px-2 py-1 text-xs text-muted">
            Modifiée le {new Date(page.updatedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </MenuContent>
      </Menu>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <span role="status" aria-live="polite" className="mr-1 flex items-center gap-1 text-xs text-muted max-sm:hidden">
      {status === "saving" && <Spinner label="Enregistrement" />}
      {status === "saving" && "Enregistrement…"}
      {status === "saved" && (
        <>
          <Check aria-hidden className="size-3.5" />
          Enregistré
        </>
      )}
      {(status === "error" || status === "conflict") && <span className="text-danger">Non enregistré</span>}
    </span>
  );
}

function TrashBanner({ page }: { page: Page }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <div role="alert" className="flex flex-wrap items-center justify-center gap-3 bg-danger-soft px-4 py-2 text-sm text-fg">
      <span>Cette page est dans la corbeille.</span>
      <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setTrash(page.id, false)}>
        Restaurer
      </Button>
      {confirm ? (
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            await deleteForever(page.id);
            router.replace("/home");
          }}
        >
          Confirmer la suppression
        </Button>
      ) : (
        <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
          Supprimer définitivement
        </Button>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <>
      <BareTopBar />
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<FileQuestion className="size-10" />}
          title="Page introuvable"
          body="Elle a peut-être été supprimée définitivement, ou le lien est incorrect."
          action={
            <Link href="/home" className="text-sm text-accent underline underline-offset-2">
              Retour à l&apos;accueil
            </Link>
          }
        />
      </div>
    </>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto mt-24 flex w-full max-w-[708px] flex-col gap-4 px-6" aria-busy="true" aria-label="Chargement de la page">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}
