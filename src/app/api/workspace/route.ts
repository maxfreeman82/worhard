import { z } from "zod";
import { createWorkspaceFor } from "@/server/data";
import { currentUserId, unauthorized } from "@/server/session";

const schema = z.object({ userName: z.string().trim().min(1).max(200), workspaceName: z.string().max(200) });

export async function POST(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Nom manquant." }, { status: 400 });
  return Response.json(await createWorkspaceFor(userId, parsed.data));
}
