// Extrait le texte brut d'un document (blocs BlockNote complets ou partiels), pour la recherche.

type Inline = string | { type?: string; text?: string; content?: Inline[] | string; href?: string };
type AnyBlock = { content?: unknown; children?: AnyBlock[]; props?: Record<string, unknown> };

function inlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    // Tableau BlockNote : { type: "tableContent", rows: [{ cells: [...] }] }
    const rows = (content as { rows?: { cells?: unknown[] }[] } | undefined)?.rows;
    if (rows) return rows.map((r) => (r.cells ?? []).map((c) => inlineText((c as { content?: unknown })?.content ?? c)).join(" ")).join(" ");
    return "";
  }
  return (content as Inline[])
    .map((c) => (typeof c === "string" ? c : (c.text ?? inlineText(c.content))))
    .join("");
}

export function blocksToText(blocks: unknown[]): string {
  const out: string[] = [];
  const walk = (bs: AnyBlock[]) => {
    for (const b of bs) {
      const t = inlineText(b.content).trim();
      if (t) out.push(t);
      const caption = b.props?.caption;
      if (typeof caption === "string" && caption.trim()) out.push(caption.trim());
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks as AnyBlock[]);
  return out.join("\n");
}
