import { z } from "zod";
import { AccessError, addMember, listMembers, removeMember, setMemberRole } from "@/server/access";
import { currentUserId, unauthorized } from "@/server/session";

// Admin de l'espace : réservé au propriétaire et aux admins (vérifié dans src/server/access.ts).
const role = z.enum(["viewer", "editor", "admin"]);
const target = z.union([z.object({ memberId: z.string().uuid() }), z.object({ inviteId: z.string().uuid() })]);

async function run(req: Request, fn: (userId: string) => Promise<unknown>) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  try {
    return Response.json((await fn(userId)) ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AccessError) return Response.json({ error: e.message }, { status: e.status });
    console.error("members:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Opération impossible." }, { status: 500 });
  }
}

const body = async <T,>(req: Request, schema: z.ZodType<T>) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AccessError(400, "Données invalides.");
  return parsed.data;
};

export const GET = (req: Request) => run(req, (u) => listMembers(u));

export const POST = (req: Request) =>
  run(req, async (u) => {
    const b = await body(req, z.object({ email: z.string().trim().email().max(320), name: z.string().max(200).default(""), role }));
    await addMember(u, b);
  });

export const PATCH = (req: Request) =>
  run(req, async (u) => {
    const b = await body(req, z.intersection(target, z.object({ role })));
    await setMemberRole(u, b, b.role);
  });

export const DELETE = (req: Request) =>
  run(req, async (u) => {
    await removeMember(u, await body(req, target));
  });
