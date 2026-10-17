"use client";

import { clsx } from "clsx";
import { ChevronsRight, Maximize2, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog as RDialog } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { usePageActions } from "@/components/shell/use-page-actions";
import { Skeleton, useToast } from "@/components/ui/display";
import { updatePageMeta, usePage, type Page } from "@/lib/data";
import { RowProperties } from "./row-properties";

const PageEditor = dynamic(() => import("@/components/page/editor").then((m) => m.PageEditor), {
  ssr: false,
  loading: () => <Skeleton className="mt-4 h-4 w-2/3" />,
});

/** Aperçu d'une ligne : panneau latéral ou fenêtre centrée, avec propriétés et contenu de la page. */
export function RowPeek({ rowId, mode, onClose, focusTitle }: { rowId: string; mode: "side" | "center"; onClose: () => void; focusTitle?: boolean }) {
  const row = usePage(rowId);
  // La ligne a été supprimée (ou mise à la corbeille) pendant l'aperçu : on le ferme.
  useEffect(() => {
    if (row === null || row?.inTrash) onClose();
  }, [row, onClose]);

  return (
    <RDialog.Root open onOpenChange={(o) => !o && onClose()} modal={mode === "center"}>
      <RDialog.Portal>
        {mode === "center" && <RDialog.Overlay className="fixed inset-0 z-40 bg-[rgb(15_15_15/0.6)]" />}
        <RDialog.Content
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            // Aperçu latéral : cliquer dans la base derrière ne le ferme pas si c'est pour ouvrir une autre ligne.
            if (mode === "side" && (e.target as HTMLElement).closest("[data-db-view]")) e.preventDefault();
          }}
          className={clsx(
            "fixed z-40 flex flex-col bg-bg text-fg shadow-modal outline-none",
            mode === "side" ? "inset-y-0 right-0 w-[min(680px,100vw)] border-l border-border" : "left-1/2 top-[6vh] h-[88vh] w-[min(920px,calc(100vw-32px))] -translate-x-1/2 rounded-xl",
          )}
        >
          {row ? <PeekBody row={row} mode={mode} onClose={onClose} focusTitle={focusTitle} /> : <Skeleton className="m-6 h-8 w-1/2" />}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function PeekBody({ row, mode, onClose, focusTitle }: { row: Page; mode: "side" | "center"; onClose: () => void; focusTitle?: boolean }) {
  const router = useRouter();
  const actions = usePageActions();
  const toast = useToast();
  const editable = !row.isLocked && !row.inTrash;
  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-1 px-3">
        <RDialog.Close aria-label="Fermer l'aperçu" className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
          {mode === "side" ? <ChevronsRight aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
        </RDialog.Close>
        <Link href={`/p/${row.id}`} onClick={onClose} className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm text-muted hover:bg-surface-hover">
          <Maximize2 aria-hidden className="size-3.5" />
          Ouvrir en pleine page
        </Link>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            void actions.trash(row.id);
            onClose();
          }}
          aria-label="Supprimer la page"
          className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover hover:text-danger"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 sm:px-12">
        <RDialog.Title asChild>
          <div>
            <PeekTitle row={row} editable={editable} autoFocus={focusTitle} />
          </div>
        </RDialog.Title>
        <RowProperties row={row} readOnly={!editable} />
        <div className="my-2 h-px bg-border" />
        <div className="-mx-[54px] max-sm:-mx-3">
          <PageEditor
            key={row.id}
            page={row}
            editable={editable}
            onStatus={(s, detail) => {
              if ((s === "error" || s === "conflict") && detail) toast({ title: detail, tone: "error" });
            }}
            onNavigate={(id) => router.push(`/p/${id}?new=1`)}
          />
        </div>
      </div>
    </>
  );
}

function PeekTitle({ row, editable, autoFocus }: { row: Page; editable: boolean; autoFocus?: boolean }) {
  const [value, setValue] = useState(row.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      readOnly={!editable}
      aria-label="Titre de la page"
      placeholder="Sans titre"
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, "");
        setValue(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void updatePageMeta(row.id, { title: v }), 250);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      className="mt-6 block w-full resize-none overflow-hidden bg-transparent text-h1 font-bold outline-none placeholder:text-placeholder focus-visible:outline-none"
    />
  );
}
