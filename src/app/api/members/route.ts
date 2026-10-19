import { z } from "zod";
import {
  AccessError,
  addMember,
  approveRequest,
  listMembers,
  refuseRequest,
  removeMember,
  resetMemberPassword,
  setMemberRole,
} from "@/server/access";
import { currentUserId, unauthorized } from "@/server/session";

// Admin de l'espace : réservé au propriétaire et aux admins (vérifié dans src/server/access.ts).
const role = z.enum(["viewer", "editor", "admin"]);
const id = z.string().uuid();

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

const body = async <T>(req: Request, schema: z.ZodType<T>) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AccessError(400, "Données invalides.");
  return parsed.data;
};

export const GET = (req: Request) => run(req, (u) => listMembers(u));

/** Pré-autoriser une adresse, valider une demande, ou donner un mot de passe provisoire. */
export const POST = (req: Request) =>
  run(req, async (u) => {
    const b = await body(
      req,
      z.union([
        z.object({ email: z.string().trim().email().max(320), name: z.string().max(200).default(""), role }),
        z.object({ approve: id, role }),
        z.object({ resetPassword: id }),
      ]),
    );
    if ("approve" in b) return approveRequest(u, b.approve, b.role);
    if ("resetPassword" in b) return resetMemberPassword(u, b.resetPassword);
    return addMember(u, b);
  });

export const PATCH = (req: Request) =>
  run(req, async (u) => {
    const b = await body(req, z.intersection(z.union([z.object({ memberId: id }), z.object({ inviteId: id })]), z.object({ role })));
    await setMemberRole(u, b, b.role);
  });

/** Retirer un membre, annuler une pré-autorisation, ou refuser une demande. */
export const DELETE = (req: Request) =>
  run(req, async (u) => {
    const b = await body(req, z.union([z.object({ memberId: id }), z.object({ inviteId: id }), z.object({ requestId: id })]));
    if ("requestId" in b) return refuseRequest(u, b.requestId);
    await removeMember(u, b);
  });
