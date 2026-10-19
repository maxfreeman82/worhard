"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Skeleton, ToastProvider, useToast } from "@/components/ui/display";
import { TooltipProvider } from "@/components/ui/overlay";
import { destination, onSyncEvent, useSession, useTheme } from "@/lib/data";
import { MoveModal, SearchModal, SettingsModal, TemplatesModal, TrashModal } from "./modals";
import { ShellCtx, type ShellApi, type ShellModal } from "./shell-context";
import { Sidebar } from "./sidebar";

const MOBILE_QUERY = "(max-width: 767px)";
const subscribeMobile = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** Applique le thème du profil sur <html> et le mémorise pour le script anti-flash du layout. */
function useApplyTheme() {
  const theme = useTheme();
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    try {
      if (theme === "system") {
        delete root.dataset.theme;
        localStorage.removeItem("theme");
      } else {
        root.dataset.theme = theme;
        localStorage.setItem("theme", theme);
      }
    } catch {}
  }, [theme]);
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ToastProvider>
        <Guarded>{children}</Guarded>
      </ToastProvider>
    </TooltipProvider>
  );
}

/** Erreurs d'enregistrement et conflits renvoyés par le serveur : affichés en toast. */
function useSyncToasts() {
  const toast = useToast();
  useEffect(() => onSyncEvent((e) => toast({ title: e.message, tone: e.kind === "error" ? "error" : "info" })), [toast]);
}

function Guarded({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  useApplyTheme();
  useSyncToasts();

  const ready = session !== undefined;
  const signedIn = !!session?.profile;
  const hasWorkspace = !!session?.workspace;

  useEffect(() => {
    if (!ready) return;
    // Pas de session, pas encore validé, ou espace à créer : vers la bonne page.
    if (session && (!signedIn || !hasWorkspace)) router.replace(destination(session));
  }, [ready, signedIn, hasWorkspace, router, session]);

  if (!ready || !signedIn || !hasWorkspace) return <ShellSkeleton />;
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<ShellModal>(null);
  const [movePageId, setMovePageId] = useState<string | null>(null);
  const pathname = usePathname();

  const sidebarOpen = isMobile ? mobileOpen : desktopOpen;
  const toggleSidebar = useCallback(() => (isMobile ? setMobileOpen((o) => !o) : setDesktopOpen((o) => !o)), [isMobile]);

  // Le tiroir mobile se ferme quand on change de page.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal((m) => (m === "search" ? null : "search"));
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const api = useMemo<ShellApi>(
    () => ({
      openModal: (m) => {
        setModal(m);
        setMobileOpen(false);
      },
      closeModal: () => setModal(null),
      openMove: (id) => setMovePageId(id),
      sidebarOpen,
      toggleSidebar,
      closeSidebarOnMobile: () => setMobileOpen(false),
      isMobile,
    }),
    [sidebarOpen, toggleSidebar, isMobile],
  );

  const set = (m: Exclude<ShellModal, null>) => (o: boolean) => setModal(o ? m : null);

  return (
    <ShellCtx.Provider value={api}>
      <a href="#main" className="sr-only left-2 top-2 z-[70] rounded-sm bg-bg px-3 py-2 text-sm shadow-pop focus:not-sr-only focus:fixed">
        Aller au contenu
      </a>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <main id="main" className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
      <SearchModal open={modal === "search"} onOpenChange={set("search")} />
      <TrashModal open={modal === "trash"} onOpenChange={set("trash")} />
      <TemplatesModal open={modal === "templates"} onOpenChange={set("templates")} />
      <SettingsModal open={modal === "settings"} onOpenChange={set("settings")} />
      <MoveModal pageId={movePageId} onOpenChange={(o) => !o && setMovePageId(null)} />
    </ShellCtx.Provider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex h-dvh" aria-busy="true" aria-label="Chargement">
      <div className="hidden w-[240px] shrink-0 flex-col gap-3 bg-surface p-3 md:flex">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-4 h-4 w-44" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mx-auto mt-24 flex w-full max-w-[708px] flex-col gap-4 px-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
