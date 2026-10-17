"use client";

import { clsx } from "clsx";
import { ChevronRight, FileText } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { GRADIENTS } from "@/components/page/page-header";
import { Tag, type BlockColor } from "@/components/ui/display";
import { resolveFileUrl, type Database, type Page, type PropValue, type Resolver, type View } from "@/lib/data";
import type { RowGroup } from "@/lib/db/query";

export type ViewProps = {
  database: Database;
  view: View;
  rows: Page[];
  resolve: Resolver;
  readOnly: boolean;
  onOpen: (rowId: string) => void;
  onCreate: (init?: { props?: Record<string, PropValue>; title?: string }) => Promise<Page | undefined>;
  onAddFilter: (propertyId: string) => void;
};

export function RowIcon({ row }: { row: Page }) {
  return (
    <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-muted">
      {row.icon ? <span className="text-base leading-none">{row.icon}</span> : <FileText className="size-4" />}
    </span>
  );
}

/** Aperçu d'une carte (galerie, Kanban) : couverture de la page ou début de son contenu. */
export function CardPreview({ row, mode }: { row: Page; mode: "cover" | "content"; }) {
  const [src, setSrc] = useState<string | null>(null);
  const url = row.coverUrl;
  const gradient = url ? GRADIENTS[url] : undefined;
  useEffect(() => {
    let alive = true;
    if (mode === "cover" && url && !gradient) void resolveFileUrl(url).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [url, gradient, mode]);
  if (mode === "content") {
    return (
      <div className="h-[120px] overflow-hidden border-b border-border bg-surface px-3 pt-3 text-xs leading-5 text-muted">
        {row.contentText ? row.contentText.slice(0, 280) : <span className="text-placeholder">Page vide</span>}
      </div>
    );
  }
  return (
    <div className="h-[120px] border-b border-border bg-surface" style={gradient ? { background: gradient } : undefined}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" style={{ objectPosition: `center ${row.coverPosition * 100}%` }} />
      )}
    </div>
  );
}

/** En-tête repliable d'un groupe (tableau et liste groupés). */
export function GroupHeader({
  group,
  collapsed,
  onToggle,
  children,
}: {
  group: RowGroup;
  collapsed: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="group flex h-9 items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Déplier" : "Replier"} le groupe ${group.label}`}
        className="flex size-6 items-center justify-center rounded-xs text-muted hover:bg-surface-hover"
      >
        <ChevronRight aria-hidden className={clsx("size-4 transition-transform", !collapsed && "rotate-90")} />
      </button>
      <Tag color={group.color as BlockColor}>{group.label}</Tag>
      <span className="text-sm text-muted">{group.rows.length}</span>
      {children}
    </div>
  );
}

export const DEFAULT_WIDTH = 180;
export const TITLE_WIDTH = 260;
