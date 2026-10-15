"use client";

import { createContext, useContext } from "react";

export type ShellModal = "search" | "trash" | "templates" | "settings" | null;

export type ShellApi = {
  openModal: (m: Exclude<ShellModal, null>) => void;
  closeModal: () => void;
  /** Ouvre « Déplacer vers… » pour une page. */
  openMove: (pageId: string) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  /** Sur mobile : ferme le tiroir après une navigation. */
  closeSidebarOnMobile: () => void;
  isMobile: boolean;
};

export const ShellCtx = createContext<ShellApi | null>(null);

export function useShell() {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShell hors de AppShell");
  return ctx;
}
