-- Contenu des fichiers importés, stocké dans Postgres (bytea) : pas de service de stockage à créer.
-- La table `files` (0001) garde les métadonnées ; `storage_path` vaut 'db:<id>' pour ce mode.
create table file_blobs (
  file_id uuid primary key references files(id) on delete cascade,
  data bytea not null
);
alter table file_blobs enable row level security;

-- Mêmes règles que les métadonnées : lecture par les membres de l'espace, écriture par celui qui importe.
create policy blobs_read on file_blobs for select using (
  exists (select 1 from files f where f.id = file_id and is_workspace_member(f.workspace_id))
);
create policy blobs_insert on file_blobs for insert with check (
  exists (select 1 from files f where f.id = file_id and f.uploaded_by = app.uid())
);

-- Purge planifiée (rôle propriétaire) : pages à la corbeille depuis plus de `days` jours, puis fichiers orphelins.
create or replace function purge_trash(days integer default 30)
returns table (pages_deleted integer, files_deleted integer)
language plpgsql security definer set search_path = public as $$
declare
  p integer;
  f integer;
begin
  -- Les sous-pages et les lignes partent en cascade avec leur parent.
  delete from pages where in_trash and trashed_at < now() - make_interval(days => days);
  get diagnostics p = row_count;
  -- Fichier dont la page a été supprimée (page_id remis à nul) depuis plus d'un jour.
  delete from files where page_id is null and created_at < now() - interval '1 day';
  get diagnostics f = row_count;
  return query select p, f;
end $$;
revoke all on function purge_trash(integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert on file_blobs to app_user;
  end if;
end $$;
