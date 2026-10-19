import { z } from "zod";
import { createWorkspaceFor } from "@/server/data";
import { isAdminEmail } from "@/server/access";
import { asOwner } from "@/server/db";
import { currentUserId, unauthorized } from "@/server/session";

const schema = z.object({ userName: z.string().trim().min(1).max(200), workspaceName: z.string().max(200) });

export async function POST(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Nom manquant." }, { status: 400 });
  // Créer un espace est réservé aux adresses de ADMIN_EMAILS ; les étudiants rejoignent celui de leur enseignant.
  const member = await asOwner(async (c) => {
    const r = await c.query("select p.email, exists (select 1 from workspace_members m where m.user_id = p.id) as member from profiles p where p.id = $1", [userId]);
    return r.rows[0] as { email: string; member: boolean } | undefined;
  });
  if (!member || (!member.member && !isAdminEmail(member.email))) {
    return Response.json({ error: "Vous n'avez pas d'espace : demandez à votre enseignant de vous ajouter." }, { status: 403 });
  }
  return Response.json(await createWorkspaceFor(userId, parsed.data));
}
