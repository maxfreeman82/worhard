"use client";

import { clsx } from "clsx";
import { ImageIcon, Smile, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/display";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { resolveFileUrl, updatePageMeta, uploadFile, type Page } from "@/lib/data";

const EMOJIS = [
  "📄", "📝", "📓", "📚", "📌", "📎", "🗂️", "🗒️", "📅", "📊",
  "✅", "🎯", "🚀", "💡", "🔥", "⭐", "❤️", "🌱", "🌍", "🏠",
  "💼", "🛠️", "⚙️", "🔒", "🧪", "🎨", "🎵", "📷", "✈️", "🍀",
  "👋", "🙌", "🤝", "🧠", "💬", "📣", "🏁", "🧭", "🗺️", "☕",
];

/** Couvertures intégrées : dégradés construits sur les couleurs de contenu (tokens). */
export const GRADIENTS: Record<string, string> = {
  "gradient:blue": "linear-gradient(135deg, var(--block-blue-bg), var(--block-purple-bg))",
  "gradient:green": "linear-gradient(135deg, var(--block-green-bg), var(--block-blue-bg))",
  "gradient:sunset": "linear-gradient(135deg, var(--block-yellow-bg), var(--block-red-bg))",
  "gradient:pink": "linear-gradient(135deg, var(--block-pink-bg), var(--block-orange-bg))",
  "gradient:stone": "linear-gradient(135deg, var(--block-gray-bg), var(--block-brown-bg))",
  "gradient:sea": "linear-gradient(180deg, var(--block-blue-bg), var(--block-green-bg))",
};

export function Cover({ page, editable }: { page: Page; editable: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const url = page.coverUrl;
  const gradient = url ? GRADIENTS[url] : undefined;

  useEffect(() => {
    let alive = true;
    if (url && !gradient) void resolveFileUrl(url).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [url, gradient]);

  if (!url) return null;
  return (
    <div className="group/cover relative h-[30vh] max-h-[280px] min-h-[160px] w-full shrink-0 bg-surface" style={gradient ? { background: gradient } : undefined}>
      {!gradient && src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" style={{ objectPosition: `center ${page.coverPosition * 100}%` }} />
      )}
      {editable && (
        <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 transition-opacity group-hover/cover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          <CoverPicker page={page} trigger={<Button size="sm">Changer la couverture</Button>} />
          {!gradient && (
            <Button size="sm" onClick={() => updatePageMeta(page.id, { coverPosition: (page.coverPosition + 0.25) % 1.25 })}>
              Repositionner
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function CoverPicker({ page, trigger }: { page: Page; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" align="end">
        <p className="mb-2 text-xs font-medium text-muted">Dégradés</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(GRADIENTS).map(([key, bg]) => (
            <button
              key={key}
              type="button"
              aria-label={`Couverture ${key.split(":")[1]}`}
              onClick={() => {
                void updatePageMeta(page.id, { coverUrl: key });
                setOpen(false);
              }}
              className={clsx("h-12 rounded-sm border", page.coverUrl === key ? "border-accent" : "border-border")}
              style={{ background: bg }}
            />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
            Importer une image
          </Button>
          {page.coverUrl && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                void updatePageMeta(page.id, { coverUrl: null });
                setOpen(false);
              }}
            >
              Retirer
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const url = await uploadFile(f);
              await updatePageMeta(page.id, { coverUrl: url, coverPosition: 0.5 });
              setOpen(false);
            } catch (err) {
              toast({ title: err instanceof Error ? err.message : "Import impossible", tone: "error" });
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function IconPicker({ page, trigger }: { page: Page; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pick = (icon: string | null) => {
    void updatePageMeta(page.id, { icon });
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[332px] p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-muted">Icône</p>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => pick(EMOJIS[Math.floor(Math.random() * EMOJIS.length)])}>
              Au hasard
            </Button>
            {page.icon && (
              <Button size="sm" variant="ghost" onClick={() => pick(null)}>
                Retirer
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-10 gap-0.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Icône ${e}`}
              onClick={() => pick(e)}
              className={clsx("flex size-8 items-center justify-center rounded-sm text-xl hover:bg-surface-hover", page.icon === e && "bg-surface-hover")}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Boutons « Ajouter une icône / une couverture », visibles au survol de l'en-tête. */
export function HeaderControls({ page }: { page: Page }) {
  return (
    <div className="flex h-7 items-center gap-1 opacity-0 transition-opacity group-hover/header:opacity-100 focus-within:opacity-100 max-md:opacity-100">
      {!page.icon && (
        <IconPicker
          page={page}
          trigger={
            <Button size="sm" variant="ghost" icon={<Smile className="size-4" />} className="text-muted">
              Ajouter une icône
            </Button>
          }
        />
      )}
      {!page.coverUrl && (
        <CoverPicker
          page={page}
          trigger={
            <Button size="sm" variant="ghost" icon={<ImageIcon className="size-4" />} className="text-muted">
              Ajouter une couverture
            </Button>
          }
        />
      )}
    </div>
  );
}
