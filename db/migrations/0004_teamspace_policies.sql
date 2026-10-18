-- Corrige une récursion infinie entre les règles de teamspaces et de teamspace_members
-- (chacune interrogeait l'autre table, donc relançait l'autre règle).
-- Les vérifications passent par des fonctions security definer, qui lisent sans repasser par la RLS.

create or replace function is_teamspace_member(ts uuid, min_role text default 'member')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teamspace_members tm
     where tm.teamspace_id = ts and tm.user_id = app.uid()
       and (min_role = 'member' or tm.role = 'owner')
  )
$$;

create or replace function teamspace_workspace(ts uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from teamspaces where id = ts
$$;

drop policy if exists ts_read on teamspaces;
drop policy if exists ts_write on teamspaces;
drop policy if exists tsm_read on teamspace_members;
drop policy if exists tsm_write on teamspace_members;

create policy ts_read on teamspaces for select using (
  is_workspace_member(workspace_id, 'member') and (access <> 'private' or is_teamspace_member(id))
);
create policy ts_insert on teamspaces for insert with check (is_workspace_member(workspace_id, 'member'));
create policy ts_update on teamspaces for update using (is_workspace_member(workspace_id, 'admin') or is_teamspace_member(id, 'owner'));
create policy ts_delete on teamspaces for delete using (is_workspace_member(workspace_id, 'admin') or is_teamspace_member(id, 'owner'));

create policy tsm_read on teamspace_members for select using (is_workspace_member(teamspace_workspace(teamspace_id), 'member'));
create policy tsm_insert on teamspace_members for insert with check (
  is_workspace_member(teamspace_workspace(teamspace_id), 'admin') or is_teamspace_member(teamspace_id, 'owner')
  -- Rejoindre soi-même une teamspace ouverte.
  or (user_id = app.uid() and exists (select 1 from teamspaces t where t.id = teamspace_id and t.access = 'open'))
);
create policy tsm_delete on teamspace_members for delete using (
  user_id = app.uid() or is_workspace_member(teamspace_workspace(teamspace_id), 'admin') or is_teamspace_member(teamspace_id, 'owner')
);
create policy tsm_update on teamspace_members for update using (
  is_workspace_member(teamspace_workspace(teamspace_id), 'admin') or is_teamspace_member(teamspace_id, 'owner')
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant execute on function is_teamspace_member(uuid, text), teamspace_workspace(uuid) to app_user;
  end if;
end $$;
