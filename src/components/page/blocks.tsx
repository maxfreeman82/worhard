"use client";

import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { clsx } from "clsx";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { blockBg, type BlockColor } from "@/components/ui/display";
import { DatabaseView } from "@/components/database/database-view";
import { usePage } from "@/lib/data";

const CALLOUT_EMOJIS = ["💡", "📌", "⚠️", "✅", "❗", "ℹ️", "🔥", "📝", "🎯", "🚧"];

/** Encadré : icône + texte riche sur fond coloré. */
export const CalloutBlock = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      backgroundColor: { default: "gray" },
      emoji: { default: "💡" },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => {
      const color = (block.props.backgroundColor === "default" ? "gray" : block.props.backgroundColor) as BlockColor;
      return (
        <div className={clsx("flex w-full gap-2 rounded-sm px-4 py-3", blockBg(color))}>
          <CalloutEmoji
            emoji={block.props.emoji}
            editable={editor.isEditable}
            onPick={(emoji) => editor.updateBlock(block, { props: { emoji } })}
          />
          <div ref={contentRef} className="min-w-0 flex-1" />
        </div>
      );
    },
  },
);

function CalloutEmoji({ emoji, editable, onPick }: { emoji: string; editable: boolean; onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span contentEditable={false} className="relative">
      <button
        type="button"
        disabled={!editable}
        onClick={() => setOpen((o) => !o)}
        aria-label="Changer l'icône de l'encadré"
        className="flex size-6 items-center justify-center rounded-xs text-lg leading-none hover:bg-surface-hover disabled:hover:bg-transparent"
      >
        {emoji}
      </button>
      {open && (
        <span className="absolute left-0 top-7 z-20 grid w-max grid-cols-5 gap-0.5 rounded-md bg-bg p-1 shadow-pop">
          {CALLOUT_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              aria-label={`Icône ${e}`}
              className="flex size-8 items-center justify-center rounded-sm text-lg hover:bg-surface-hover"
            >
              {e}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** Lien vers une sous-page, affiché comme un bloc de la page parente. */
export const PageBlock = createReactBlockSpec(
  {
    type: "page",
    propSchema: { pageId: { default: "" } },
    content: "none",
  },
  {
    render: ({ block }) => <PageLink pageId={block.props.pageId} />,
  },
);

function PageLink({ pageId }: { pageId: string }) {
  const page = usePage(pageId);
  if (page === undefined) return <span className="block h-7" />;
  if (!page) {
    return (
      <span contentEditable={false} className="flex h-7 items-center gap-2 px-0.5 text-muted">
        <FileText aria-hidden className="size-4" />
        <span className="line-through">Page supprimée définitivement</span>
      </span>
    );
  }
  return (
    <Link
      href={`/p/${page.id}`}
      contentEditable={false}
      className="flex h-7 w-full items-center gap-2 rounded-sm px-0.5 hover:bg-surface-hover"
    >
      <span aria-hidden className="flex size-5 items-center justify-center text-muted">
        {page.icon ? <span className="text-base leading-none">{page.icon}</span> : <FileText className="size-4" />}
      </span>
      <span className={clsx("truncate border-b border-border-strong font-medium", page.inTrash && "text-muted line-through")}>
        {page.title || "Sans titre"}
      </span>
      {page.inTrash && <span className="text-xs text-muted">dans la corbeille</span>}
    </Link>
  );
}

/** Base de données en ligne : la vue complète, insérée dans la page. */
export const DatabaseBlock = createReactBlockSpec(
  {
    type: "database",
    propSchema: { databaseId: { default: "" } },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      // Les touches tapées dans la base ne doivent pas être interprétées par l'éditeur de la page.
      <div contentEditable={false} className="w-full" onKeyDown={(e) => e.stopPropagation()} onPaste={(e) => e.stopPropagation()}>
        <DatabaseView databaseId={block.props.databaseId} inline readOnly={!editor.isEditable} />
      </div>
    ),
  },
);
