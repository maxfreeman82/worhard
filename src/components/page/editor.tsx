"use client";

import "@blocknote/mantine/style.css";
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { fr } from "@blocknote/core/locales";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote, type DefaultReactSuggestionItem } from "@blocknote/react";
import { FileText, MessageSquareQuote, Sheet, Table2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { blocksToText, createDatabase, createPage, getContentVersion, resolveFileUrl, savePageContent, uploadFile, type Page } from "@/lib/data";
import { CalloutBlock, DatabaseBlock, PageBlock } from "./blocks";

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: CalloutBlock(), page: PageBlock(), database: DatabaseBlock() },
});
type Editor = typeof schema.BlockNoteEditor;

const v = (name: string) => `var(--${name})`;
const hl = (c: string) => ({ text: v(`block-${c}`), background: v(`block-${c}-bg`) });

/** Thème de l'éditeur branché sur les tokens : il suit clair / sombre sans changer d'objet. */
const theme: Theme = {
  colors: {
    editor: { text: v("text"), background: v("bg") },
    menu: { text: v("text"), background: v("bg") },
    tooltip: { text: v("bg"), background: v("text") },
    hovered: { text: v("text"), background: v("surface-hover") },
    selected: { text: v("on-accent"), background: v("accent") },
    disabled: { text: v("text-placeholder"), background: v("surface") },
    shadow: v("border-strong"),
    border: v("border"),
    sideMenu: v("text-placeholder"),
    highlights: {
      gray: hl("gray"),
      brown: hl("brown"),
      red: hl("red"),
      orange: hl("orange"),
      yellow: hl("yellow"),
      green: hl("green"),
      blue: hl("blue"),
      purple: hl("purple"),
      pink: hl("pink"),
    },
  },
  borderRadius: 6,
  fontFamily: "inherit",
};

const dictionary = {
  ...fr,
  placeholders: { ...fr.placeholders, default: "Écrivez, ou tapez / pour insérer un bloc", emptyDocument: "Écrivez, ou tapez / pour insérer un bloc" },
};

export type SaveStatus = "saved" | "saving" | "error" | "conflict";

export function PageEditor({
  page,
  editable,
  onStatus,
  onNavigate,
}: {
  page: Page;
  editable: boolean;
  onStatus: (s: SaveStatus, detail?: string) => void;
  onNavigate: (pageId: string) => void;
}) {
  const version = useRef(getContentVersion(page.id));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

  const editor = useCreateBlockNote(
    {
      schema,
      dictionary,
      initialContent: page.content.length ? (page.content as never) : undefined,
      uploadFile: (file) => uploadFile(file),
      resolveFileUrl,
    },
    [page.id],
  ) as Editor;

  const flush = async () => {
    if (!pending.current) return;
    pending.current = false;
    const doc = editor.document;
    const res = await savePageContent(page.id, doc, blocksToText(doc), version.current);
    if (res.ok) {
      version.current = res.version;
      onStatus("saved");
    } else if (res.reason === "conflict") {
      onStatus("conflict", "Cette page a été modifiée dans un autre onglet.");
    } else if (res.reason === "quota") {
      onStatus("error", "Stockage du navigateur plein : la dernière modification n'est pas enregistrée.");
    } else if (res.reason === "locked") {
      onStatus("error", "La page est verrouillée.");
    } else {
      onStatus("error", "Page introuvable.");
    }
  };

  // Enregistre au départ de la page (changement de route, fermeture d'onglet).
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  const onChange = () => {
    pending.current = true;
    onStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  };

  const slashItems = (q: string) => {
    const custom: DefaultReactSuggestionItem[] = [
      {
        title: "Page",
        subtext: "Une sous-page à l'intérieur de celle-ci",
        aliases: ["page", "sous-page", "subpage"],
        group: "Blocs de base",
        icon: <FileText size={18} />,
        onItemClick: async () => {
          const child = await createPage({ parentId: page.id, section: page.section });
          insertOrUpdateBlockForSlashMenu(editor, { type: "page", props: { pageId: child.id } });
          await flush();
          onNavigate(child.id);
        },
      },
      {
        title: "Base de données en ligne",
        subtext: "Un tableau de pages, avec propriétés et vues, dans cette page",
        aliases: ["base", "bdd", "database", "tableau de donnees", "inline"],
        group: "Bases de données",
        icon: <Table2 size={18} />,
        onItemClick: async () => {
          const { database } = await createDatabase({ parentId: page.id, section: page.section }, { inline: true });
          insertOrUpdateBlockForSlashMenu(editor, { type: "database", props: { databaseId: database.id } });
        },
      },
      {
        title: "Base de données pleine page",
        subtext: "Une sous-page qui est une base de données",
        aliases: ["base", "bdd", "database", "pleine page"],
        group: "Bases de données",
        icon: <Sheet size={18} />,
        onItemClick: async () => {
          const res = await createDatabase({ parentId: page.id, section: page.section });
          insertOrUpdateBlockForSlashMenu(editor, { type: "page", props: { pageId: res.page.id } });
          await flush();
          onNavigate(res.page.id);
        },
      },
      {
        title: "Encadré",
        subtext: "Mettre une information en avant",
        aliases: ["callout", "encadre", "note", "info"],
        group: "Blocs de base",
        icon: <MessageSquareQuote size={18} />,
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout" }),
      },
    ];
    // Les blocs ajoutés rejoignent le groupe « Blocs de base » existant (sinon il apparaît deux fois).
    const items = getDefaultReactSlashMenuItems(editor);
    const basic = custom.filter((c) => c.group === "Blocs de base");
    const lastBasic = items.findLastIndex((i) => i.group === "Blocs de base");
    items.splice(lastBasic + 1, 0, ...basic);
    items.push(...custom.filter((c) => c.group !== "Blocs de base"));
    return filterSuggestionItems(items, q);
  };

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={theme}
      onChange={onChange}
      slashMenu={false}
      className="page-editor"
    >
      <SuggestionMenuController triggerCharacter="/" getItems={async (q) => slashItems(q)} />
    </BlockNoteView>
  );
}
