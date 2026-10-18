import { z } from "zod";
import { loadFingerprint } from "@/server/data";
import { currentUserId, unauthorized } from "@/server/session";

// Empreinte de l'espace : le client la compare à la sienne pour savoir si quelqu'un d'autre a modifié quelque chose.
export async function GET(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  const ws = z.string().uuid().safeParse(new URL(req.url).searchParams.get("workspace"));
  if (!ws.success) return Response.json({ error: "Requête invalide." }, { status: 400 });
  return Response.json({ fingerprint: await loadFingerprint(userId, ws.data) }, { headers: { "Cache-Control": "no-store" } });
}
