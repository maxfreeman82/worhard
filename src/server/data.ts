import "server-only";
import type { PoolClient } from "@neondatabase/serverless";
import { z } from "zod";
import type { Database, Page, Profile, View, Workspace } from "@/lib/data/types";
import { asOwner, asUser } from "./db";

/* --------------------------------------------------------------- lecture */

export type Bootstrap = {
  profile: Profile;
  workspace: Workspace | null;
  members: { id: string; name: string; email: string }[];
  pages: (Page & { position: number; contentVersion: number })[];
  databases: Database[];
  views: View[];
  favorites: string[];
  recent: string[];
};

type PageRow = {
  id: string;
  workspace_id: string;
  parent_page_id: string | null;
  database_id: string | null;
  owner_db: string | null;
  is_private: boolean;
  position: number;
  title: string;
  icon: string | null;
  cover_url: string | null;
  cover_position: number;
  full_width: boolean;
  small_text: boolean;
  font: Page["font"];
  is_locked: boolean;
  content: unknown[];
  content_text: string;
  content_version: number;
  props: Page["props"];
  in_trash: boolean;
  trashed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  last_edited_by: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toPage(r: PageRow) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    parentId: r.parent_page_id,
    section: r.is_private ? "private" : "workspace",
    title: r.title,
    icon: r.icon,
    coverUrl: r.cover_url,
    coverPosition: r.cover_position,
    fullWidth: r.full_width,
    smallText: r.small_text,
    font: r.font,
    isLocked: r.is_locked,
    content: r.content,
    contentText: r.content_text,
    contentVersion: r.content_version,
    inTrash: r.in_trash,
    trashedAt: iso(r.trashed_at),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    createdBy: r.created_by,
    lastEditedBy: r.last_edited_by,
    databaseOwnerOf: r.owner_db,
    rowOf: r.database_id,
    props: r.props ?? {},
    position: r.position,
  } satisfies Bootstrap["pages"][number];
}

export async function loadBootstrap(userId: string): Promise<Bootstrap | null> {
  return asUser(userId, async (c) => {
    const p = (await c.query("select id, email, name, theme, recent_pages from profiles where id = app.uid()")).rows[0];
    if (!p) return null;
    const profile: Profile = { id: p.id, email: p.email, name: p.name, theme: p.theme };
    const w = (
      await c.query(
        "select w.id, w.name, w.icon from workspaces w join workspace_members m on m.workspace_id = w.id where m.user_id = app.uid() order by m.created_at limit 1",
      )
    ).rows[0];
    if (!w) return { profile, workspace: null, members: [], pages: [], databases: [], views: [], favorites: [], recent: [] };
    const members = (
      await c.query("select p.id, coalesce(nullif(p.name, ''), p.email) as name, p.email from workspace_members m join profiles p on p.id = m.user_id where m.workspace_id = $1", [w.id])
    ).rows;
    // La RLS ne renvoie que les pages accessibles à l'utilisateur.
    const pages = (
      await c.query<PageRow>(
        `select p.*,
                (select d.id from databases d where d.page_id = p.id) as owner_db,
                exists (select 1 from pages r where r.id = coalesce(p.path[1], p.id) and r.private_owner_id is not null) as is_private
           from pages p
          where p.workspace_id = $1`,
        [w.id],
      )
    ).rows.map(toPage);
    const databases: Database[] = (
      await c.query("select id, page_id, is_inline, properties, next_unique_id from databases where workspace_id = $1", [w.id])
    ).rows.map((d) => ({ id: d.id, pageId: d.page_id, inline: d.is_inline, properties: d.properties, nextUniqueId: d.next_unique_id }));
    const dbIds = databases.map((d) => d.id);
    const views: View[] = dbIds.length
      ? (await c.query("select id, database_id, name, type, position, config from db_views where database_id = any($1::uuid[])", [dbIds])).rows.map((v) => ({
          id: v.id,
          databaseId: v.database_id,
          name: v.name,
          type: v.type,
          position: v.position,
          config: v.config,
        }))
      : [];
    const favorites = (await c.query("select page_id from favorites where user_id = app.uid() order by position")).rows.map((r) => r.page_id);
    return { profile, workspace: { id: w.id, name: w.name, icon: w.icon }, members, pages, databases, views, favorites, recent: p.recent_pages ?? [] };
  });
}

/* ------------------------------------------------------------- écriture */

const uuid = z.string().uuid();
const json = z.unknown();

const pageSchema = z.object({
  id: uuid,
  parentId: uuid.nullable(),
  section: z.enum(["workspace", "private"]),
  title: z.string().max(2000),
  icon: z.string().max(64).nullable(),
  coverUrl: z.string().max(2000).nullable(),
  coverPosition: z.number(),
  fullWidth: z.boolean(),
  smallText: z.boolean(),
  font: z.enum(["default", "serif", "mono"]),
  isLocked: z.boolean(),
  content: z.array(json),
  contentText: z.string(),
  contentVersion: z.number().int().nonnegative(),
  inTrash: z.boolean(),
  trashedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  rowOf: uuid.nullable().optional(),
  props: z.record(z.string(), json).optional(),
  position: z.number(),
});

const databaseSchema = z.object({
  id: uuid,
  pageId: uuid,
  inline: z.boolean(),
  properties: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), config: json })),
  nextUniqueId: z.number().int().positive(),
});

const viewSchema = z.object({
  id: uuid,
  databaseId: uuid,
  name: z.string().max(200),
  type: z.enum(["table", "board", "list", "gallery", "calendar"]),
  position: z.number(),
  config: z.record(z.string(), json),
});

export const syncSchema = z.object({
  workspaceId: uuid,
  profile: z.object({ name: z.string().max(200), theme: z.enum(["system", "light", "dark"]), recent: z.array(uuid).max(50) }).optional(),
  workspace: z.object({ name: z.string().min(1).max(200), icon: z.string().max(64).nullable() }).optional(),
  pages: z.array(pageSchema).max(2000).default([]),
  deletePages: z.array(uuid).default([]),
  databases: z.array(databaseSchema).default([]),
  deleteDatabases: z.array(uuid).default([]),
  views: z.array(viewSchema).default([]),
  deleteViews: z.array(uuid).default([]),
  favorites: z.array(uuid).max(500).optional(),
});
export type SyncBatch = z.infer<typeof syncSchema>;

async function defaultTeamspace(c: PoolClient, workspaceId: string) {
  const r = await c.query("select id from teamspaces where workspace_id = $1 and is_default limit 1", [workspaceId]);
  return r.rows[0]?.id as string | undefined;
}

/** Ordonne les pages pour que chaque parent soit écrit avant ses enfants. */
function parentsFirst<T extends { id: string; parentId: string | null }>(pages: T[]) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const depth = (p: T, seen = 0): number => (p.parentId && byId.has(p.parentId) && seen < 100 ? 1 + depth(byId.get(p.parentId)!, seen + 1) : 0);
  return [...pages].sort((a, b) => depth(a) - depth(b));
}

/**
 * Applique un lot de modifications au nom de l'utilisateur. Chaque écriture passe par la RLS :
 * une page que l'utilisateur ne peut pas modifier fait échouer tout le lot.
 * Renvoie les pages dont le contenu a été modifié ailleurs entre-temps (non écrasé).
 */
export async function applySync(userId: string, b: SyncBatch): Promise<{ conflicts: string[] }> {
  return asUser(userId, async (c) => {
    const conflicts: string[] = [];
    if (b.profile) {
      await c.query("update profiles set name = $1, theme = $2, recent_pages = $3::uuid[] where id = app.uid()", [b.profile.name, b.profile.theme, b.profile.recent]);
    }
    if (b.workspace) {
      await c.query("update workspaces set name = $1, icon = $2 where id = $3", [b.workspace.name, b.workspace.icon, b.workspaceId]);
    }

    // Suppressions : lignes, puis bases, puis pages (les cascades font le reste).
    if (b.deleteViews.length) await c.query("delete from db_views where id = any($1::uuid[])", [b.deleteViews]);
    if (b.deletePages.length) await c.query("delete from pages where id = any($1::uuid[]) and database_id is not null", [b.deletePages]);
    if (b.deleteDatabases.length) await c.query("delete from databases where id = any($1::uuid[])", [b.deleteDatabases]);
    if (b.deletePages.length) await c.query("delete from pages where id = any($1::uuid[])", [b.deletePages]);

    const teamspace = await defaultTeamspace(c, b.workspaceId);
    const ids = b.pages.map((p) => p.id);
    const existing = new Map<string, { v: number; content: string }>(
      ids.length
        ? (await c.query("select id, content_version, content::text as content from pages where id = any($1::uuid[])", [ids])).rows.map((r) => [r.id, { v: r.content_version, content: r.content }])
        : [],
    );

    const writePage = async (p: z.infer<typeof pageSchema>) => {
      const root = !p.parentId && !p.rowOf;
      const values = [
        p.id,
        b.workspaceId,
        root && p.section === "workspace" ? (teamspace ?? null) : null,
        root && p.section === "private" ? userId : null,
        p.parentId,
        p.rowOf ?? null,
        p.position,
        p.title,
        p.icon,
        p.coverUrl,
        p.coverPosition,
        p.fullWidth,
        p.smallText,
        p.font,
        p.isLocked,
        JSON.stringify(p.content),
        p.contentText,
        p.contentVersion,
        JSON.stringify(p.props ?? {}),
        p.inTrash,
        p.trashedAt,
        p.createdAt,
        p.updatedAt,
      ];
      const prev = existing.get(p.id);
      if (!prev) {
        const inserted = await c.query(
          `insert into pages (id, workspace_id, teamspace_id, private_owner_id, parent_page_id, database_id, position, title, icon, cover_url,
             cover_position, full_width, small_text, font, is_locked, content, content_text, content_version, props, in_trash, trashed_at,
             created_at, updated_at, created_by, last_edited_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19::jsonb,$20,$21,$22,$23, app.uid(), app.uid())
           -- Idempotent : un lot renvoyé, ou arrivé pendant qu'un autre écrit la même page, met à jour au lieu d'échouer.
           -- La règle d'update s'applique à la ligne existante : une page d'un autre espace reste refusée.
           on conflict (id) do update set
             parent_page_id = excluded.parent_page_id, database_id = excluded.database_id, position = excluded.position,
             title = excluded.title, icon = excluded.icon, cover_url = excluded.cover_url, cover_position = excluded.cover_position,
             full_width = excluded.full_width, small_text = excluded.small_text, font = excluded.font, is_locked = excluded.is_locked,
             content = case when excluded.content_version >= pages.content_version then excluded.content else pages.content end,
             content_text = case when excluded.content_version >= pages.content_version then excluded.content_text else pages.content_text end,
             content_version = greatest(pages.content_version, excluded.content_version),
             props = excluded.props, in_trash = excluded.in_trash, trashed_at = excluded.trashed_at, last_edited_by = app.uid()
           where pages.workspace_id = excluded.workspace_id
           returning id`,
          values,
        );
        // Aucune ligne écrite : l'id existe déjà dans un autre espace. Refus explicite, tout le lot est annulé.
        if (inserted.rowCount === 0) throw new Error("permission denied: page d'un autre espace");
        return;
      }
      // Contenu : on n'écrase pas une version plus récente écrite par quelqu'un d'autre.
      const contentChanged = prev.content !== JSON.stringify(p.content);
      const keepServerContent = contentChanged && p.contentVersion <= prev.v;
      if (keepServerContent) conflicts.push(p.id);
      await c.query(
        `update pages set teamspace_id = $3, private_owner_id = $4, parent_page_id = $5, database_id = $6, position = $7, title = $8, icon = $9,
           cover_url = $10, cover_position = $11, full_width = $12, small_text = $13, font = $14, is_locked = $15,
           content = case when $22 then content else $16::jsonb end,
           content_text = case when $22 then content_text else $17 end,
           content_version = case when $22 then content_version else greatest(content_version, $18) end,
           props = $19::jsonb, in_trash = $20, trashed_at = $21, last_edited_by = app.uid()
         where id = $1 and workspace_id = $2`,
        // Les dates de création et de modification ne sont pas reprises du client : updated_at est posé par trigger.
        [...values.slice(0, 21), keepServerContent],
      );
    };

    const plain = parentsFirst(b.pages.filter((p) => !p.rowOf));
    const rows = b.pages.filter((p) => p.rowOf);
    for (const p of plain) await writePage(p);
    for (const d of b.databases) {
      await c.query(
        `insert into databases (id, workspace_id, page_id, is_inline, properties, next_unique_id) values ($1,$2,$3,$4,$5::jsonb,$6)
         on conflict (id) do update set is_inline = excluded.is_inline, properties = excluded.properties,
           next_unique_id = greatest(databases.next_unique_id, excluded.next_unique_id)`,
        [d.id, b.workspaceId, d.pageId, d.inline, JSON.stringify(d.properties), d.nextUniqueId],
      );
    }
    for (const p of rows) await writePage(p);
    for (const v of b.views) {
      await c.query(
        `insert into db_views (id, database_id, name, type, position, config, created_by) values ($1,$2,$3,$4,$5,$6::jsonb, app.uid())
         on conflict (id) do update set name = excluded.name, type = excluded.type, position = excluded.position, config = excluded.config`,
        [v.id, v.databaseId, v.name, v.type, v.position, JSON.stringify(v.config)],
      );
    }
    if (b.favorites) {
      await c.query("delete from favorites where user_id = app.uid()");
      for (const [i, pageId] of b.favorites.entries()) {
        await c.query("insert into favorites (user_id, page_id, position) values (app.uid(), $1, $2) on conflict do nothing", [pageId, i]);
      }
    }
    return { conflicts };
  });
}

/* ------------------------------------------------- création d'un espace */

/** Crée l'espace, l'adhésion « propriétaire » et la teamspace par défaut (rôle propriétaire : l'adhésion n'existe pas encore). */
export async function createWorkspaceFor(userId: string, input: { userName: string; workspaceName: string }): Promise<Workspace> {
  const name = input.workspaceName.trim().slice(0, 200) || "Mon espace";
  return asOwner(async (c) => {
    const existing = (await c.query("select w.id, w.name, w.icon from workspaces w join workspace_members m on m.workspace_id = w.id where m.user_id = $1 limit 1", [userId])).rows[0];
    if (existing) return existing as Workspace;
    await c.query("update profiles set name = $2 where id = $1", [userId, input.userName.trim().slice(0, 200)]);
    const w = (await c.query("insert into workspaces (name, created_by) values ($1, $2) returning id, name, icon", [name, userId])).rows[0];
    await c.query("insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')", [w.id, userId]);
    await c.query("insert into teamspaces (workspace_id, name, is_default, created_by) values ($1, 'Général', true, $2)", [w.id, userId]);
    return w as Workspace;
  });
}
