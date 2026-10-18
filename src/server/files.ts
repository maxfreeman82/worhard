import "server-only";
import { asUser } from "./db";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Types refusés : ce qui pourrait s'exécuter s'il était ouvert depuis notre domaine.
const BLOCKED = /^(text\/html|application\/xhtml\+xml|application\/x-msdownload|application\/x-sh|application\/javascript|text\/javascript)$/i;
// Affichés dans la page (images, PDF, audio, vidéo) ; tout le reste est téléchargé.
const INLINE = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|audio\/[\w.+-]+|video\/[\w.+-]+)$/i;

export async function saveFile(userId: string, input: { workspaceId: string; pageId: string | null; file: File }) {
  const { file } = input;
  if (file.size === 0) throw new Error("Fichier vide.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Fichier trop lourd (10 Mo maximum).");
  const mime = file.type || "application/octet-stream";
  if (BLOCKED.test(mime) || /\.(html?|svg|js|exe|bat|cmd|sh)$/i.test(file.name)) throw new Error("Ce type de fichier n'est pas accepté.");
  const data = Buffer.from(await file.arrayBuffer());
  return asUser(userId, async (c) => {
    const id = crypto.randomUUID();
    await c.query(
      `insert into files (id, workspace_id, page_id, uploaded_by, name, mime, size_bytes, storage_path)
       values ($1, $2, $3, app.uid(), $4, $5, $6, $7)`,
      [id, input.workspaceId, input.pageId, file.name.slice(0, 255), mime, file.size, `db:${id}`],
    );
    await c.query("insert into file_blobs (file_id, data) values ($1, $2)", [id, data]);
    return { id, url: `/api/files/${id}` };
  });
}

export async function readFile(userId: string, id: string) {
  return asUser(userId, async (c) => {
    const r = await c.query(
      "select f.name, f.mime, f.size_bytes, b.data from files f join file_blobs b on b.file_id = f.id where f.id = $1",
      [id],
    );
    const row = r.rows[0];
    if (!row) return null;
    return { name: row.name as string, mime: row.mime as string, data: row.data as Buffer, inline: INLINE.test(row.mime) };
  });
}
