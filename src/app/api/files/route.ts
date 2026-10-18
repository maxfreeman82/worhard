import { z } from "zod";
import { MAX_FILE_BYTES, saveFile } from "@/server/files";
import { currentUserId, unauthorized } from "@/server/session";

const fields = z.object({ workspaceId: z.string().uuid(), pageId: z.string().uuid().nullable() });

export async function POST(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES + 64 * 1024) return Response.json({ error: "Fichier trop lourd (10 Mo maximum)." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const parsed = fields.safeParse({ workspaceId: form?.get("workspaceId"), pageId: form?.get("pageId") || null });
  if (!(file instanceof File) || !parsed.success) return Response.json({ error: "Requête invalide." }, { status: 400 });
  try {
    return Response.json(await saveFile(userId, { ...parsed.data, file }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/row-level security|permission denied|violates/i.test(msg)) return Response.json({ error: "Import refusé." }, { status: 403 });
    return Response.json({ error: msg || "Import impossible." }, { status: 400 });
  }
}
