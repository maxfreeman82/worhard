import { z } from "zod";
import { asOwner } from "@/server/db";
import { currentUserId, unauthorized } from "@/server/session";

const schema = z.object({ confirm: z.literal("SUPPRIMER") });

/**
 * Supprime le compte pour de bon : les espaces dont l'utilisateur est le seul membre (avec leurs pages, bases et fichiers),
 * puis le compte Better Auth, ce qui supprime en cascade le profil, les sessions et les adhésions.
 * Refus s'il est le seul propriétaire d'un espace partagé avec d'autres : il faut d'abord transmettre la propriété.
 */
export async function DELETE(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!schema.safeParse(await req.json().catch(() => null)).success) {
    return Response.json({ error: "Confirmation manquante." }, { status: 400 });
  }
  const result = await asOwner(async (c) => {
    const spaces = (
      await c.query(
        `select m.workspace_id,
                (select count(*) from workspace_members x where x.workspace_id = m.workspace_id)::int as members,
                (select count(*) from workspace_members x where x.workspace_id = m.workspace_id and x.role = 'owner')::int as owners,
                m.role
           from workspace_members m where m.user_id = $1`,
        [userId],
      )
    ).rows as { workspace_id: string; members: number; owners: number; role: string }[];
    const blocked = spaces.filter((s) => s.members > 1 && s.role === "owner" && s.owners === 1);
    if (blocked.length) return { blocked: blocked.length };
    const alone = spaces.filter((s) => s.members === 1).map((s) => s.workspace_id);
    if (alone.length) await c.query("delete from workspaces where id = any($1::uuid[])", [alone]);
    await c.query(`delete from "user" where id = $1`, [userId]);
    return { deletedWorkspaces: alone.length };
  });
  if ("blocked" in result) {
    return Response.json({ error: "Vous êtes le seul propriétaire d'un espace partagé : transmettez d'abord la propriété." }, { status: 409 });
  }
  // Les sessions sont supprimées en cascade avec le compte : le cookie restant ne correspond plus à rien.
  return Response.json(result);
}
