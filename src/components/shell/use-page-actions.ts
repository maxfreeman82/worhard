"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useToast } from "@/components/ui/display";
import { createPage, DataError, duplicatePage, setTrash, toggleFavorite, type Section } from "@/lib/data";

/** Actions de page partagées par la sidebar, le menu ⋯ et les modales, avec leurs toasts. */
export function usePageActions() {
  const router = useRouter();
  const toast = useToast();

  const fail = useCallback(
    (e: unknown) => {
      const msg =
        e instanceof DataError && e.code === "quota"
          ? "Stockage du navigateur plein : supprimez des pages ou des fichiers."
          : e instanceof Error
            ? e.message
            : "Une erreur est survenue.";
      toast({ title: msg, tone: "error" });
    },
    [toast],
  );

  const create = useCallback(
    async (parentId: string | null, section: Section = "workspace", init?: Parameters<typeof createPage>[1]) => {
      try {
        const p = await createPage({ parentId, section }, init);
        router.push(`/p/${p.id}?new=1`);
        return p;
      } catch (e) {
        fail(e);
      }
    },
    [router, fail],
  );

  const trash = useCallback(
    async (id: string, opts: { redirect?: boolean } = {}) => {
      try {
        await setTrash(id, true);
        if (opts.redirect) router.push("/home");
        toast({
          title: "Page déplacée dans la corbeille",
          tone: "info",
          action: { label: "Annuler", onClick: () => void setTrash(id, false) },
        });
      } catch (e) {
        fail(e);
      }
    },
    [router, toast, fail],
  );

  const duplicate = useCallback(
    async (id: string) => {
      try {
        const copy = await duplicatePage(id);
        toast({ title: "Page dupliquée", tone: "success" });
        router.push(`/p/${copy.id}`);
      } catch (e) {
        fail(e);
      }
    },
    [router, toast, fail],
  );

  const favorite = useCallback(
    async (id: string) => {
      try {
        await toggleFavorite(id);
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const copyLink = useCallback(
    async (id: string) => {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/p/${id}`);
        toast({ title: "Lien copié", tone: "success" });
      } catch {
        toast({ title: "Impossible de copier le lien", tone: "error" });
      }
    },
    [toast],
  );

  return { create, trash, duplicate, favorite, copyLink, fail };
}
