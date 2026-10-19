import "server-only";
import type { PoolClient } from "@neondatabase/serverless";
import { asOwner } from "./db";

/**
 * Qui peut se connecter : les membres d'un espace, les personnes invitées (invitation en attente),
 * et les adresses de ADMIN_EMAILS (ex. « prof@ecole.fr », ou « @ecole.fr » pour tout un domaine),
 * qui peuvent créer leur espace. Tout le monde d'autre est refusé avant l'envoi du code.
 */
export const NOT_ALLOWED = "Cette adresse n'a pas accès à l'espace. Demandez à votre enseignant de vous ajouter.";

function adminRules() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string) {
  const e = email.trim().toLowerCase();
  return adminRules().some((r) => (r.startsWith("@") ? e.endsWith(r) : e === r));
}

export async function canSignIn(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (isAdminEmail(e)) return true;
  return asOwner(async (c) => {
    const r = await c.query(
      `select exists (select 1 from profiles p join workspace_members m on m.user_id = p.id where lower(p.email) = $1)
           or exists (select 1 from workspace_invites i where lower(i.email) = $1 and i.accepted_at is null and i.expires_at > now()) as ok`,
      [e],
    );
    return r.rows[0].ok as boolean;
  });
}

/** Transforme les invitations en attente de cette adresse en adhésions (à la connexion, ou tout de suite si le compte existe). */
async function acceptInvites(c: PoolClient, userId: string, email: string) {
  const invites = (
    await c.query(
      `update workspace_invites set accepted_at = now()
        where lower(email) = $1 and accepted_at is null and expires_at > now()
        returning workspace_id, role, access, name`,
      [email.toLowerCase()],
    )
  ).rows;
  for (const i of invites) {
    await c.query(
      `insert into workspace_members (workspace_id, user_id, role, access) values ($1, $2, $3, $4)
       on conflict (workspace_id, user_id) do update set role = excluded.role, access = excluded.access`,
      [i.workspace_id, userId, i.role, i.access],
    );
    // Le nom saisi par l'enseignant sert de nom affiché tant que l'étudiant n'en a pas choisi un.
    if (i.name) await c.query("update profiles set name = $2 where id = $1 and name = ''", [userId, i.name]);
  }
}

export async function acceptInvitesFor(userId: string) {
  await asOwner(async (c) => {
    const p = (await c.query("select email from profiles where id = $1", [userId])).rows[0];
    if (p) await acceptInvites(c, userId, p.email);
  });
}

/* ------------------------------------------------------- gestion des membres */

/** Rôle choisi dans l'admin. */
export type ClassRole = "viewer" | "editor" | "admin";

const toDb = (r: ClassRole) =>
  r === "admin" ? { role: "admin", access: "can_edit" } : { role: "member", access: r === "viewer" ? "can_view" : "can_edit" };

const fromDb = (role: string, access: string): ClassRole | "owner" =>
  role === "owner" ? "owner" : role === "admin" ? "admin" : access === "can_edit" ? "editor" : "viewer";

export type MemberRow = { id: string; name: string; email: string; role: ClassRole | "owner"; you: boolean };
export type InviteRow = { id: string; name: string; email: string; role: ClassRole; createdAt: string };

export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Espace de l'appelant, s'il en est propriétaire ou admin ; sinon refus. */
async function managedWorkspace(c: PoolClient, userId: string) {
  const m = (
    await c.query("select workspace_id, role from workspace_members where user_id = $1 order by created_at limit 1", [userId])
  ).rows[0];
  if (!m || (m.role !== "owner" && m.role !== "admin")) throw new AccessError(403, "Réservé aux administrateurs de l'espace.");
  return { workspaceId: m.workspace_id as string, callerRole: m.role as "owner" | "admin" };
}

export async function listMembers(userId: string): Promise<{ members: MemberRow[]; invites: InviteRow[] }> {
  return asOwner(async (c) => {
    const { workspaceId } = await managedWorkspace(c, userId);
    const members = (
      await c.query(
        `select p.id, p.name, p.email, m.role, m.access from workspace_members m join profiles p on p.id = m.user_id
          where m.workspace_id = $1 order by (m.role = 'owner') desc, lower(coalesce(nullif(p.name, ''), p.email))`,
        [workspaceId],
      )
    ).rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: fromDb(r.role, r.access), you: r.id === userId }));
    const invites = (
      await c.query(
        `select id, name, email, role, access, created_at from workspace_invites
          where workspace_id = $1 and accepted_at is null and expires_at > now() order by created_at desc`,
        [workspaceId],
      )
    ).rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: fromDb(r.role, r.access) as ClassRole, createdAt: r.created_at.toISOString() }));
    return { members, invites };
  });
}

/**
 * Ajoute une personne : invitation en attente (elle pourra se connecter avec cette adresse),
 * acceptée tout de suite si elle a déjà un compte.
 */
export async function addMember(userId: string, input: { email: string; name: string; role: ClassRole }) {
  const email = input.email.trim().toLowerCase();
  return asOwner(async (c) => {
    const { workspaceId, callerRole } = await managedWorkspace(c, userId);
    if (input.role === "admin" && callerRole !== "owner") throw new AccessError(403, "Seul le propriétaire peut nommer un admin.");
    const already = await c.query(
      "select 1 from workspace_members m join profiles p on p.id = m.user_id where m.workspace_id = $1 and lower(p.email) = $2",
      [workspaceId, email],
    );
    if (already.rowCount) throw new AccessError(409, "Cette personne fait déjà partie de l'espace.");
    const { role, access } = toDb(input.role);
    // Une invitation en attente pour la même adresse est remplacée (nom ou rôle corrigés).
    await c.query("delete from workspace_invites where workspace_id = $1 and lower(email) = $2 and accepted_at is null", [workspaceId, email]);
    await c.query(
      `insert into workspace_invites (workspace_id, email, name, role, access, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, $6, now() + interval '1 year')`,
      [workspaceId, email, input.name.trim().slice(0, 200), role, access, userId],
    );
    const existing = (await c.query("select id from profiles where lower(email) = $1", [email])).rows[0];
    if (existing) await acceptInvites(c, existing.id, email);
  });
}

export async function setMemberRole(userId: string, target: { memberId?: string; inviteId?: string }, newRole: ClassRole) {
  return asOwner(async (c) => {
    const { workspaceId, callerRole } = await managedWorkspace(c, userId);
    const { role, access } = toDb(newRole);
    if (target.inviteId) {
      if (newRole === "admin" && callerRole !== "owner") throw new AccessError(403, "Seul le propriétaire peut nommer un admin.");
      const r = await c.query("update workspace_invites set role = $3, access = $4 where id = $1 and workspace_id = $2 and accepted_at is null", [
        target.inviteId,
        workspaceId,
        role,
        access,
      ]);
      if (!r.rowCount) throw new AccessError(404, "Invitation introuvable.");
      return;
    }
    const m = (await c.query("select role from workspace_members where workspace_id = $1 and user_id = $2", [workspaceId, target.memberId])).rows[0];
    if (!m) throw new AccessError(404, "Membre introuvable.");
    if (m.role === "owner") throw new AccessError(403, "Le rôle du propriétaire ne se change pas.");
    if (target.memberId === userId) throw new AccessError(403, "Vous ne pouvez pas changer votre propre rôle.");
    if ((m.role === "admin" || newRole === "admin") && callerRole !== "owner") throw new AccessError(403, "Seul le propriétaire peut nommer ou retirer un admin.");
    await c.query("update workspace_members set role = $3, access = $4 where workspace_id = $1 and user_id = $2", [workspaceId, target.memberId, role, access]);
  });
}

/**
 * Retire une personne : elle perd l'accès tout de suite (sessions fermées) et ne peut plus se connecter.
 * Ses pages privées restent en base, invisibles : elle les retrouve si on la rajoute.
 */
export async function removeMember(userId: string, target: { memberId?: string; inviteId?: string }) {
  return asOwner(async (c) => {
    const { workspaceId, callerRole } = await managedWorkspace(c, userId);
    if (target.inviteId) {
      const r = await c.query("delete from workspace_invites where id = $1 and workspace_id = $2 and accepted_at is null", [target.inviteId, workspaceId]);
      if (!r.rowCount) throw new AccessError(404, "Invitation introuvable.");
      return;
    }
    const m = (await c.query("select role from workspace_members where workspace_id = $1 and user_id = $2", [workspaceId, target.memberId])).rows[0];
    if (!m) throw new AccessError(404, "Membre introuvable.");
    if (m.role === "owner") throw new AccessError(403, "Le propriétaire ne peut pas être retiré.");
    if (target.memberId === userId) throw new AccessError(403, "Vous ne pouvez pas vous retirer vous-même.");
    if (m.role === "admin" && callerRole !== "owner") throw new AccessError(403, "Seul le propriétaire peut retirer un admin.");
    await c.query("delete from workspace_members where workspace_id = $1 and user_id = $2", [workspaceId, target.memberId]);
    // Plus aucun espace : la session est fermée (il ne pourra plus se reconnecter, voir canSignIn).
    const left = await c.query("select 1 from workspace_members where user_id = $1", [target.memberId]);
    if (!left.rowCount) await c.query(`delete from "session" where "userId" = $1`, [target.memberId]);
  });
}
