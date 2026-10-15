"use client";

import { clsx } from "clsx";
import { ChevronRight, Loader2, MoreHorizontal, Plus, X } from "lucide-react";
import { Toast as RToast } from "radix-ui";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/* ---------------------------------------------------------- Block colors */

export const BLOCK_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type BlockColor = (typeof BLOCK_COLORS)[number] | "default";

export const BLOCK_COLOR_LABELS: Record<BlockColor, string> = {
  default: "Par défaut",
  gray: "Gris",
  brown: "Marron",
  orange: "Orange",
  yellow: "Jaune",
  green: "Vert",
  blue: "Bleu",
  purple: "Violet",
  pink: "Rose",
  red: "Rouge",
};

// Classes écrites en entier pour que Tailwind les détecte.
const TEXT: Record<BlockColor, string> = {
  default: "text-fg",
  gray: "text-block-gray",
  brown: "text-block-brown",
  orange: "text-block-orange",
  yellow: "text-block-yellow",
  green: "text-block-green",
  blue: "text-block-blue",
  purple: "text-block-purple",
  pink: "text-block-pink",
  red: "text-block-red",
};
const BG: Record<BlockColor, string> = {
  default: "bg-surface-hover",
  gray: "bg-block-gray-bg",
  brown: "bg-block-brown-bg",
  orange: "bg-block-orange-bg",
  yellow: "bg-block-yellow-bg",
  green: "bg-block-green-bg",
  blue: "bg-block-blue-bg",
  purple: "bg-block-purple-bg",
  pink: "bg-block-pink-bg",
  red: "bg-block-red-bg",
};
export const blockText = (c: BlockColor) => TEXT[c];
export const blockBg = (c: BlockColor) => BG[c];

/* ------------------------------------------------------------------- Tag */

/** Option de sélection / multi-sélection / statut. */
export function Tag({
  color = "default",
  children,
  onRemove,
  dot = false,
}: {
  color?: BlockColor;
  children: ReactNode;
  onRemove?: () => void;
  dot?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex h-5 max-w-full items-center gap-1 rounded-xs px-1.5 text-sm leading-5 text-fg",
        BG[color],
        dot && "rounded-full pl-2",
      )}
    >
      {dot && <span aria-hidden className={clsx("size-2 shrink-0 rounded-full bg-current", TEXT[color])} />}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer ${typeof children === "string" ? children : ""}`}
          className="-mr-0.5 flex size-4 items-center justify-center rounded-xs text-muted hover:text-fg"
        >
          <X aria-hidden className="size-3" />
        </button>
      )}
    </span>
  );
}

/* --------------------------------------------------------------- Callout */

export function Callout({ icon = "💡", color = "gray", children }: { icon?: string; color?: BlockColor; children: ReactNode }) {
  return (
    <div className={clsx("flex gap-2 rounded-sm px-4 py-4 text-base", BG[color])}>
      <span aria-hidden className="text-xl leading-6">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------- Sidebar item */

export function SidebarItem({
  icon,
  label,
  depth = 0,
  active = false,
  expandable = false,
  expanded = false,
  onToggle,
  onAdd,
  onMore,
  href,
}: {
  icon: ReactNode;
  label: string;
  depth?: number;
  active?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onAdd?: () => void;
  onMore?: () => void;
  href?: string;
}) {
  return (
    <div
      className={clsx(
        "group relative flex h-[30px] items-center gap-1 rounded-sm pr-1 text-sm text-muted",
        "hover:bg-surface-hover",
        active && "bg-surface-hover font-medium text-fg",
      )}
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <span className="relative flex size-[22px] shrink-0 items-center justify-center">
        <span className={clsx("flex items-center justify-center", expandable && "group-hover:invisible")}>{icon}</span>
        {expandable && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Replier" : "Déplier"}
            aria-expanded={expanded}
            className="invisible absolute inset-0 flex items-center justify-center rounded-xs hover:bg-surface-active group-hover:visible focus-visible:visible"
          >
            <ChevronRight aria-hidden className={clsx("size-4 transition-transform duration-100", expanded && "rotate-90")} />
          </button>
        )}
      </span>
      <a href={href ?? "#"} className="min-w-0 flex-1 truncate rounded-xs py-1 outline-offset-0" aria-current={active ? "page" : undefined}>
        {label}
      </a>
      <span className="flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        {onMore && (
          <button type="button" onClick={onMore} aria-label="Plus d'actions" className="flex size-5 items-center justify-center rounded-xs hover:bg-surface-active">
            <MoreHorizontal aria-hidden className="size-4" />
          </button>
        )}
        {onAdd && (
          <button type="button" onClick={onAdd} aria-label="Ajouter une page à l'intérieur" className="flex size-5 items-center justify-center rounded-xs hover:bg-surface-active">
            <Plus aria-hidden className="size-4" />
          </button>
        )}
      </span>
    </div>
  );
}

export function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <div className="px-2 pb-1 text-2xs font-medium text-muted">{label}</div>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------- View tabs */

export function ViewTabs({
  views,
  active,
  onChange,
  onAdd,
}: {
  views: { id: string; name: string; icon: ReactNode }[];
  active: string;
  onChange: (id: string) => void;
  onAdd?: () => void;
}) {
  return (
    <div role="tablist" aria-label="Vues" className="flex h-10 min-w-0 items-center gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
      {views.map((v) => (
        <button
          key={v.id}
          role="tab"
          type="button"
          aria-selected={v.id === active}
          onClick={() => onChange(v.id)}
          className={clsx(
            "relative flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-sm hover:bg-surface-hover",
            v.id === active
              ? "font-medium text-fg after:absolute after:inset-x-1 after:-bottom-[6px] after:h-0.5 after:bg-fg"
              : "text-muted",
          )}
        >
          <span aria-hidden className="flex size-4 items-center justify-center">
            {v.icon}
          </span>
          {v.name}
        </button>
      ))}
      {onAdd && (
        <button type="button" onClick={onAdd} aria-label="Ajouter une vue" className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
          <Plus aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Avatar */

export function Avatar({ name, src, size = 20, online }: { name: string; src?: string; size?: number; online?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full rounded-full object-cover" />
      ) : (
        <span
          role="img"
          aria-label={name}
          className="flex size-full items-center justify-center rounded-full border border-border-strong bg-surface text-muted"
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          {initial}
        </span>
      )}
      {online && <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-bg bg-success" />}
    </span>
  );
}

export function AvatarStack({ people, max = 3 }: { people: { name: string; src?: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex items-center" aria-label={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => (
        <span key={p.name + i} className={clsx("rounded-full ring-2 ring-bg", i > 0 && "-ml-1.5")}>
          <Avatar name={p.name} src={p.src} size={22} />
        </span>
      ))}
      {rest > 0 && <span className="ml-1 text-xs text-muted">+{rest}</span>}
    </span>
  );
}

/* ----------------------------------------------------------- Misc pieces */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-xs border border-border-strong bg-surface px-1 font-sans text-xs text-muted">{children}</kbd>;
}

export function Spinner({ label = "Chargement" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 aria-hidden className="size-4 animate-spin" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={clsx("block animate-pulse rounded-sm bg-surface-hover", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span aria-hidden className="text-muted">
        {icon}
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      {body && <p className="max-w-[320px] text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; icon?: string; href?: string }[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center text-sm text-fg">
      {items.map((it, i) => (
        <span key={i} className="flex min-w-0 items-center">
          {i > 0 && <span aria-hidden className="px-1 text-muted">/</span>}
          <a
            href={it.href ?? "#"}
            aria-current={i === items.length - 1 ? "page" : undefined}
            className="flex min-w-0 items-center gap-1.5 truncate rounded-xs px-1 py-0.5 hover:bg-surface-hover"
          >
            {it.icon && <span aria-hidden>{it.icon}</span>}
            <span className="truncate">{it.label}</span>
          </a>
        </span>
      ))}
    </nav>
  );
}

/* ----------------------------------------------------------------- Toast */

type ToastItem = { id: number; title: string; tone: "info" | "success" | "error"; action?: { label: string; onClick: () => void } };
const ToastCtx = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => setItems((xs) => [...xs, { ...t, id: Date.now() + Math.random() }]), []);
  return (
    <ToastCtx.Provider value={push}>
      <RToast.Provider swipeDirection="down" duration={4000}>
        {children}
        {items.map((t) => (
          <RToast.Root
            key={t.id}
            type={t.tone === "error" ? "foreground" : "background"}
            onOpenChange={(open) => !open && setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className={clsx(
              "flex items-center gap-3 rounded-md bg-fg px-3 py-2 text-sm text-bg shadow-pop",
              t.tone === "error" && "bg-danger text-bg",
            )}
          >
            <RToast.Title className="flex-1">{t.title}</RToast.Title>
            {t.action && (
              <RToast.Action altText={t.action.label} onClick={t.action.onClick} className="rounded-xs px-1.5 py-0.5 font-medium underline-offset-2 hover:underline">
                {t.action.label}
              </RToast.Action>
            )}
          </RToast.Root>
        ))}
        <RToast.Viewport className="fixed bottom-4 left-1/2 z-[60] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2 outline-none" />
      </RToast.Provider>
    </ToastCtx.Provider>
  );
}
