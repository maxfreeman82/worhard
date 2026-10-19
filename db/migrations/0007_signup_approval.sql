-- Inscription libre, accès sur validation : l'étudiant crée son compte (e-mail + mot de passe),
-- puis l'enseignant valide sa demande dans la page Membres (ou la refuse).
--   pending  : compte créé, en attente de validation (aucun espace) ;
--   approved : validé (membre d'un espace), ou enseignant (ADMIN_EMAILS) ;
--   removed  : retiré par l'enseignant, ne peut plus se connecter.
alter table profiles
  add column access_status text not null default 'pending' check (access_status in ('pending','approved','removed'));

-- Comptes existants : ceux qui ont déjà un espace sont validés.
update profiles p set access_status = 'approved'
 where exists (select 1 from workspace_members m where m.user_id = p.id);

create index profiles_pending on profiles (created_at) where access_status = 'pending';

-- Nombre de demandes en attente, pour l'empreinte de l'espace (le badge de l'enseignant se met à jour seul).
-- Les profils en attente ne sont pas visibles par la RLS : la fonction compte pour les propriétaires et admins seulement.
create or replace function pending_requests_count()
returns integer language sql stable security definer set search_path = public as $$
  select case when exists (
           select 1 from workspace_members m where m.user_id = app.uid() and m.role in ('owner','admin'))
         then (select count(*)::int from profiles p
                where p.access_status = 'pending'
                  and not exists (select 1 from workspace_members m where m.user_id = p.id))
         else 0 end
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant execute on function pending_requests_count() to app_user;
  end if;
end $$;
