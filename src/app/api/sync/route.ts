import { applySync, syncSchema } from "@/server/data";
import { currentUserId, unauthorized } from "@/server/session";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Modification trop volumineuse." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Données invalides.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  try {
    return Response.json(await applySync(userId, parsed.data));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // Violation de règle d'accès ou de contrainte : refus clair, sans détail interne.
    const forbidden = /row-level security|permission denied|violates/i.test(msg);
    const detail = (e as { detail?: string }).detail;
    console.error("sync:", msg, detail ? `(${detail})` : "");
    return Response.json({ error: forbidden ? "Modification refusée (droits insuffisants ou données incohérentes)." : "Enregistrement impossible." }, { status: forbidden ? 403 : 500 });
  }
}
