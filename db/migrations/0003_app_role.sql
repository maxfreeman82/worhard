-- Lien profil ↔ compte Better Auth : supprimer le compte supprime le profil (RGPD).
alter table profiles
  add constraint profiles_user_fk foreign key (id) references "user"(id) on delete cascade;

-- Droits du rôle de l'application. Le rôle est créé par scripts/setup-app-role.mjs (mot de passe hors du dépôt).
-- Il n'a aucun droit sur les tables de Better Auth, et la RLS s'applique à lui sur toutes les autres.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant usage on schema public, app to app_user;
    grant select, insert, update, delete on
      profiles, workspaces, workspace_members, workspace_invites, teamspaces, teamspace_members,
      pages, databases, page_permissions, favorites, files, db_views, db_view_user_overrides,
      discussions, comments, comment_reactions, notifications, page_versions,
      automations, automation_runs, ai_threads
      to app_user;
    grant execute on all functions in schema public, app to app_user;
  end if;
end $$;
