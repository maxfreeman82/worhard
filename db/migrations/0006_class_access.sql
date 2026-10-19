-- Espace de classe : l'enseignant ajoute ses étudiants (invitation par e-mail) et choisit un rôle pour chacun.
-- Seules les personnes ajoutées peuvent se connecter (vérifié par le serveur, voir src/server/access.ts).
--
-- Rôles affichés dans l'admin, et leur traduction en base :
--   Lecture seule -> role 'member', access 'can_view'
--   Édition       -> role 'member', access 'can_edit'
--   Admin         -> role 'admin'  (accès complet aux pages partagées, gère les membres)
-- Le niveau `access` ne concerne que les pages partagées de l'espace : chacun garde ses pages privées.

alter table workspace_members
  add column access text not null default 'can_edit' check (access in ('can_view','can_comment','can_edit'));

alter table workspace_invites
  add column name text not null default '',
  add column access text not null default 'can_edit' check (access in ('can_view','can_comment','can_edit'));
-- Une seule invitation en attente par adresse et par espace.
create unique index workspace_invites_pending on workspace_invites (workspace_id, lower(email)) where accepted_at is null;

-- Peut créer des pages à la racine de l'espace partagé (et le modifier) : propriétaire, admin, ou membre en édition.
create or replace function can_edit_workspace(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members m
     where m.workspace_id = ws and m.user_id = app.uid()
       and (m.role in ('owner','admin') or (m.role = 'member' and m.access = 'can_edit'))
  )
$$;

-- Même règle qu'en 0001, avec le niveau du membre comme plafond sur les pages partagées
-- (teamspace et accès général « tout l'espace »). Les droits donnés page par page restent prioritaires.
create or replace function page_row_access(p pages) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := app.uid();
  ws_role text;
  ws_access text;
  root_private_owner uuid;
  root_teamspace uuid;
  anchor_id uuid;
  anchor_general text;
  anchor_general_level text;
  best int := 0;
begin
  if uid is null then return null; end if;

  select m.role, m.access into ws_role, ws_access from workspace_members m
   where m.workspace_id = p.workspace_id and m.user_id = uid;

  if cardinality(p.path) = 0 then
    root_private_owner := p.private_owner_id;
    root_teamspace := p.teamspace_id;
  else
    select r.private_owner_id, r.teamspace_id into root_private_owner, root_teamspace
      from pages r where r.id = p.path[1];
  end if;

  if root_private_owner = uid then
    return 'full_access';
  end if;

  if p.has_own_permissions then
    anchor_id := p.id;
    anchor_general := p.general_access;
    anchor_general_level := p.general_access_level;
  else
    select a.id, a.general_access, a.general_access_level
      into anchor_id, anchor_general, anchor_general_level
      from pages a
     where a.id = any(p.path) and a.has_own_permissions
     order by array_position(p.path, a.id) desc
     limit 1;
  end if;

  if anchor_id is not null then
    select access_rank(pp.level) into best from page_permissions pp
     where pp.page_id = anchor_id and pp.user_id = uid;
    best := coalesce(best, 0);
    if anchor_general = 'workspace' and ws_role in ('owner','admin','member') then
      best := greatest(best, least(access_rank(anchor_general_level),
                                   case when ws_role = 'member' then access_rank(ws_access) else 4 end));
    end if;
  elsif root_teamspace is not null then
    if exists (
      select 1 from teamspaces t
        left join teamspace_members tm on tm.teamspace_id = t.id and tm.user_id = uid
       where t.id = root_teamspace
         and (tm.user_id is not null or (t.access = 'open' and ws_role in ('owner','admin','member')))
    ) then
      best := case when ws_role = 'member' then least(3, access_rank(ws_access)) else 3 end;
    end if;
  end if;

  if ws_role in ('owner','admin') and root_private_owner is null then
    best := 4;
  end if;

  return case best when 4 then 'full_access' when 3 then 'can_edit'
                   when 2 then 'can_comment' when 1 then 'can_view' else null end;
end $$;

-- Créer une page à la racine de l'espace partagé demande le droit d'édition sur l'espace.
drop policy if exists pages_insert on pages;
create policy pages_insert on pages for insert with check (
  is_workspace_member(workspace_id, 'guest') and (
    (parent_page_id is not null and can_access_page(parent_page_id, 'can_edit'))
    or (database_id is not null and exists (
         select 1 from databases d where d.id = database_id and can_access_page(d.page_id, 'can_edit')))
    or (private_owner_id = app.uid())
    or (teamspace_id is not null and can_edit_workspace(workspace_id))
  )
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant execute on function can_edit_workspace(uuid) to app_user;
  end if;
end $$;
