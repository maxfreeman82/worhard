"use client";

import { ChevronsRight, Menu as MenuIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { useShell } from "./shell-context";

/** Barre du haut minimale : bouton pour rouvrir la sidebar (repliée ou mobile). */
export function SidebarToggle() {
  const shell = useShell();
  if (shell.sidebarOpen && !shell.isMobile) return null;
  return (
    <IconButton label={shell.isMobile ? "Ouvrir le menu" : "Afficher la barre latérale"} onClick={shell.toggleSidebar}>
      {shell.isMobile ? <MenuIcon aria-hidden className="size-4" /> : <ChevronsRight aria-hidden className="size-4" />}
    </IconButton>
  );
}

export function BareTopBar({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 px-3">
      <SidebarToggle />
      {children}
    </div>
  );
}
