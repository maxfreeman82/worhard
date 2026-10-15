"use client";

import { clsx } from "clsx";
import {
  ChevronsLeft,
  ChevronsUpDown,
  FileText,
  Home,
  Inbox,
  LayoutTemplate,
  LogOut,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Kbd } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui/overlay";
import { signOut, useFavorites, useSession, type Section } from "@/lib/data";
import { PageTree, useSectionDrop } from "./page-tree";
import { useShell } from "./shell-context";
import { usePageActions } from "./use-page-actions";

const WIDTH_KEY = "sidebar-width";
const MIN = 200;
const MAX = 480;

export function Sidebar() {
  const shell = useShell();
  const session = useSession();
  const router = useRouter();
  const actions = usePageActions();
  const [width, setWidth] = useState(240);
  const resizing = useRef(false);

  useEffect(() => {
    try {
      const w = Number(localStorage.getItem(WIDTH_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture d'une préférence locale au montage
      if (w >= MIN && w <= MAX) setWidth(w);
    } catch {}
  }, []);

  const startResize = (e: React.PointerEvent) => {
    resizing.current = true;
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => setWidth(Math.min(MAX, Math.max(MIN, startW + ev.clientX - startX)));
    const up = (ev: PointerEvent) => {
      resizing.current = false;
      const w = Math.min(MAX, Math.max(MIN, startW + ev.clientX - startX));
      try {
        localStorage.setItem(WIDTH_KEY, String(w));
      } catch {}
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const ws = session?.workspace;
  const profile = session?.profile;

  return (
    <>
      {shell.isMobile && shell.sidebarOpen && (
        <button aria-label="Fermer la barre latérale" className="fixed inset-0 z-30 bg-[rgb(15_15_15/0.4)]" onClick={shell.toggleSidebar} />
      )}
      <aside
        aria-label="Barre latérale"
        className={clsx(
          "group/sidebar flex h-full shrink-0 flex-col bg-surface text-sm",
          shell.isMobile ? "fixed inset-y-0 left-0 z-40 w-[min(300px,85vw)] shadow-modal transition-transform duration-200" : "relative",
          shell.isMobile && !shell.sidebarOpen && "-translate-x-full",
          !shell.isMobile && !shell.sidebarOpen && "hidden",
        )}
        style={shell.isMobile ? undefined : { width }}
      >
        {/* Espace de travail */}
        <div className="flex items-center gap-1 p-1.5">
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left hover:bg-surface-hover data-[state=open]:bg-surface-hover"
              >
                <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-xs bg-surface-active text-xs font-semibold text-fg">
                  {ws?.icon ?? ws?.name.charAt(0).toUpperCase() ?? "·"}
                </span>
                <span className="truncate font-medium text-fg">{ws?.name ?? "…"}</span>
                <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted" />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>{profile?.email}</MenuLabel>
              <MenuItem icon={<Settings className="size-4" />} onSelect={() => shell.openModal("settings")}>
                Réglages
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<LogOut className="size-4" />}
                onSelect={async () => {
                  await signOut();
                  router.replace("/login");
                }}
              >
                Se déconnecter
              </MenuItem>
            </MenuContent>
          </Menu>
          <Tooltip label="Masquer la barre latérale" shortcut="Ctrl+\">
            <button
              type="button"
              onClick={shell.toggleSidebar}
              aria-label="Masquer la barre latérale"
              className="flex size-7 items-center justify-center rounded-sm text-muted opacity-0 hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 group-hover/sidebar:opacity-100 max-md:opacity-100"
            >
              <ChevronsLeft aria-hidden className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="Nouvelle page">
            <button
              type="button"
              onClick={() => {
                void actions.create(null, "private");
                shell.closeSidebarOnMobile();
              }}
              aria-label="Nouvelle page"
              className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover hover:text-fg"
            >
              <SquarePen aria-hidden className="size-4" />
            </button>
          </Tooltip>
        </div>

        <nav aria-label="Navigation principale" className="flex flex-col gap-px px-1.5">
          <NavButton icon={<Search className="size-4" />} label="Rechercher" hint={<Kbd>Ctrl K</Kbd>} onClick={() => shell.openModal("search")} />
          <NavLink href="/home" icon={<Home className="size-4" />} label="Accueil" />
          <NavLink href="/inbox" icon={<Inbox className="size-4" />} label="Boîte de réception" />
        </nav>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          <Favorites />
          <TreeSection label="Espace de travail" section="workspace" />
          <TreeSection label="Privé" section="private" />
        </div>

        <div className="flex flex-col gap-px border-t border-border px-1.5 py-1.5">
          <NavButton icon={<LayoutTemplate className="size-4" />} label="Modèles" onClick={() => shell.openModal("templates")} />
          <NavButton icon={<Trash2 className="size-4" />} label="Corbeille" onClick={() => shell.openModal("trash")} />
          <NavButton icon={<Settings className="size-4" />} label="Réglages" onClick={() => shell.openModal("settings")} />
        </div>

        {!shell.isMobile && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionner la barre latérale"
            onPointerDown={startResize}
            onDoubleClick={() => {
              setWidth(240);
              try {
                localStorage.removeItem(WIDTH_KEY);
              } catch {}
            }}
            className="absolute inset-y-0 -right-1 w-2 cursor-col-resize after:absolute after:inset-y-0 after:left-1 after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-border-strong"
          />
        )}
      </aside>
    </>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  const pathname = usePathname();
  const shell = useShell();
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={shell.closeSidebarOnMobile}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex h-[30px] items-center gap-2 rounded-sm px-2 hover:bg-surface-hover",
        active ? "bg-surface-hover font-medium text-fg" : "text-muted",
      )}
    >
      <span aria-hidden className="flex size-[22px] items-center justify-center">
        {icon}
      </span>
      {label}
    </Link>
  );
}

function NavButton({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex h-[30px] items-center gap-2 rounded-sm px-2 text-left text-muted hover:bg-surface-hover">
      <span aria-hidden className="flex size-[22px] items-center justify-center">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {hint && <span className="opacity-0 group-hover:opacity-100">{hint}</span>}
    </button>
  );
}

function SectionHeader({ label, onAdd, dropProps, over }: { label: string; onAdd?: () => void; dropProps?: object; over?: boolean }) {
  return (
    <div {...dropProps} className={clsx("group flex h-[26px] items-center rounded-sm pl-2 pr-1", over && "bg-accent-soft")}>
      <h2 className="flex-1 text-2xs font-medium text-muted">{label}</h2>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Ajouter une page dans ${label}`}
          className="flex size-5 items-center justify-center rounded-xs text-muted opacity-0 hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
        >
          <Plus aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}

function TreeSection({ label, section }: { label: string; section: Section }) {
  const actions = usePageActions();
  const shell = useShell();
  const drop = useSectionDrop(section);
  return (
    <section className="mt-3">
      <SectionHeader
        label={label}
        over={drop.over}
        dropProps={drop.props}
        onAdd={() => {
          void actions.create(null, section);
          shell.closeSidebarOnMobile();
        }}
      />
      <PageTree parentId={null} section={section} />
    </section>
  );
}

function Favorites() {
  const favorites = useFavorites();
  const pathname = usePathname();
  const shell = useShell();
  if (!favorites?.length) return null;
  return (
    <section className="mt-1">
      <SectionHeader label="Favoris" />
      <ul className="flex flex-col gap-px">
        {favorites.map((p) => {
          const active = pathname === `/p/${p.id}`;
          return (
            <li key={p.id}>
              <Link
                href={`/p/${p.id}`}
                onClick={shell.closeSidebarOnMobile}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex h-[30px] items-center gap-1 rounded-sm pl-2 pr-1 hover:bg-surface-hover",
                  active ? "bg-surface-hover font-medium text-fg" : "text-muted",
                )}
              >
                <span aria-hidden className="flex size-[22px] shrink-0 items-center justify-center">
                  {p.icon ? <span className="text-base leading-none">{p.icon}</span> : <FileText className="size-4" />}
                </span>
                <span className="truncate">{p.title || "Sans titre"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
