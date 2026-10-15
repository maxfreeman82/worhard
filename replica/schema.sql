-- Schéma du clone Notion (Postgres / Supabase).
-- Accès : Row Level Security (RLS) sur toutes les tables, via les fonctions
-- is_workspace_member() et page_access_level().
-- Toutes les heures en timestamptz (UTC). Pas d'argent dans ce produit (usage interne).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Utilitaire : updated_at automatique
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Comptes et espaces de travail                                  (phase 1)
-- ---------------------------------------------------------------------------

-- Profil public lié à auth.users (Supabase Auth gère e-mail, code magique, Google).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  avatar_url text,
  locale text not null default 'fr',
  theme text not null default 'system' check (theme in ('system','light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index on profiles (lower(email));

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','guest')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on workspace_members (user_id);

create table workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','guest')),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
create index on workspace_invites (workspace_id);
create index on workspace_invites (lower(email));

-- ---------------------------------------------------------------------------
-- Teamspaces                                                     (phase 2)
-- ---------------------------------------------------------------------------
create table teamspaces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  icon text,
  access text not null default 'open' check (access in ('open','closed','private')),
  is_default boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on teamspaces (workspace_id);
create unique index one_default_teamspace on teamspaces (workspace_id) where is_default;

create table teamspace_members (
  teamspace_id uuid not null references teamspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (teamspace_id, user_id)
);
create index on teamspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Bases de données (le conteneur ; les lignes sont des pages)    (phase 3)
-- Déclarée avant pages pour la clé étrangère pages.database_id.
-- ---------------------------------------------------------------------------
create table databases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  page_id uuid not null,                 -- page qui contient la BDD (FK ajoutée plus bas)
  is_inline boolean not null default false,
  -- Schéma : [{id, name, type, config}] ; exactement une propriété de type 'title'.
  -- Les ID de propriété sont stables ; renommer ne touche pas les valeurs des lignes.
  properties jsonb not null default '[{"id":"title","name":"Nom","type":"title","config":{}}]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_is_array check (jsonb_typeof(properties) = 'array')
);
create index on databases (workspace_id);
create unique index on databases (page_id);

-- ---------------------------------------------------------------------------
-- Pages                                                          (phase 1)
-- Une page est soit dans l'arbre (parent page / teamspace / privé),
-- soit une ligne de base de données (database_id non nul).
-- ---------------------------------------------------------------------------
create table pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  teamspace_id uuid references teamspaces(id) on delete cascade,
  parent_page_id uuid references pages(id) on delete cascade,
  database_id uuid references databases(id) on delete cascade,
  -- Propriétaire d'une page privée de premier niveau (section « Privé »).
  private_owner_id uuid references profiles(id) on delete cascade,
  -- Ancêtres, de la racine au parent direct. Maintenu par trigger. Sert aux droits hérités.
  path uuid[] not null default '{}',
  -- Ordre parmi les pages sœurs (indexation fractionnaire : chaînes triables).
  position text not null default 'a0',

  title text not null default '',
  icon text,
  cover_url text,
  cover_position real not null default 0.5,
  full_width boolean not null default false,
  small_text boolean not null default false,
  font text not null default 'default' check (font in ('default','serif','mono')),
  is_locked boolean not null default false,
  is_template boolean not null default false,

  -- Contenu de l'éditeur : document BlockNote (tableau de blocs json).
  content jsonb not null default '[]',
  -- État Yjs binaire pour l'édition en temps réel (phase 2). Source de vérité quand non nul.
  ydoc bytea,
  -- Texte brut extrait du contenu, pour la recherche. Écrit par le serveur à chaque sauvegarde.
  content_text text not null default '',
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')
  ) stored,

  -- Valeurs des propriétés si la page est une ligne de BDD : {property_id: valeur}.
  props jsonb not null default '{}',
  -- Partage : true si la page a ses propres droits (sinon elle hérite de son parent).
  has_own_permissions boolean not null default false,
  general_access text check (general_access in ('workspace','invite_only')),
  general_access_level text check (general_access_level in ('full_access','can_edit','can_comment','can_view')),

  -- Publication web (phase 4)
  published boolean not null default false,
  public_slug text unique,
  public_allow_duplicate boolean not null default false,
  public_search_indexing boolean not null default false,

  in_trash boolean not null default false,
  trashed_at timestamptz,
  trashed_by uuid references profiles(id) on delete set null,

  created_by uuid references profiles(id) on delete set null,
  last_edited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une page a exactement un type de parent (ou aucun = racine d'un teamspace / privé).
  constraint one_parent check (
    num_nonnulls(parent_page_id, database_id) <= 1
  ),
  constraint private_or_team check (
    parent_page_id is not null or database_id is not null
    or num_nonnulls(teamspace_id, private_owner_id) = 1
  ),
  constraint props_is_object check (jsonb_typeof(props) = 'object')
);
create index on pages (workspace_id);
create index on pages (teamspace_id);
create index on pages (parent_page_id, position);
create index on pages (database_id, position);
create index on pages (private_owner_id);
create index on pages using gin (path);
create index on pages using gin (search);
create index on pages using gin (title gin_trgm_ops);
create index on pages using gin (props jsonb_path_ops);
create index on pages (workspace_id, in_trash, trashed_at);
create index on pages (workspace_id, updated_at desc);

alter table databases
  add constraint databases_page_fk foreign key (page_id) references pages(id) on delete cascade;

-- Maintient pages.path et interdit les cycles (déplacer une page dans son propre descendant).
create or replace function pages_set_path() returns trigger language plpgsql as $$
declare
  parent_path uuid[];
  container uuid;
begin
  if new.parent_page_id is not null then
    select path || id into parent_path from pages where id = new.parent_page_id;
  elsif new.database_id is not null then
    select p.path || p.id into parent_path
      from databases d join pages p on p.id = d.page_id where d.id = new.database_id;
  else
    parent_path := '{}';
  end if;
  if new.id = any(parent_path) then
    raise exception 'Impossible de déplacer une page dans un de ses descendants';
  end if;
  new.path := parent_path;
  return new;
end $$;

create trigger pages_path_ins before insert on pages
  for each row execute function pages_set_path();
create trigger pages_path_upd before update of parent_page_id, database_id on pages
  for each row execute function pages_set_path();

-- Après un déplacement, recalcule le chemin de tous les descendants.
create or replace function pages_cascade_path() returns trigger language plpgsql as $$
begin
  if new.path is distinct from old.path then
    update pages
       set path = new.path || new.id || path[array_position(path, new.id) + 1 :]
     where new.id = any(path);
  end if;
  return null;
end $$;
-- Sans liste de colonnes : un « update of path » ne verrait pas le chemin modifié par le
-- trigger BEFORE (il ne se déclenche que si la colonne figure dans le SET).
create trigger pages_path_cascade after update on pages
  for each row when (old.path is distinct from new.path) execute function pages_cascade_path();

create trigger pages_updated before update on pages
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Droits sur les pages                                           (phase 2)
-- ---------------------------------------------------------------------------
create table page_permissions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  level text not null check (level in ('full_access','can_edit','can_comment','can_view')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_id, user_id)
);
create index on page_permissions (user_id);

-- ---------------------------------------------------------------------------
-- Favoris, fichiers                                              (phase 1)
-- ---------------------------------------------------------------------------
create table favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  page_id uuid not null references pages(id) on delete cascade,
  position text not null default 'a0',
  created_at timestamptz not null default now(),
  primary key (user_id, page_id)
);
create index on favorites (page_id);

create table files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  page_id uuid references pages(id) on delete set null,
  uploaded_by uuid references profiles(id) on delete set null,
  name text not null,
  mime text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 5368709120),
  storage_path text not null unique,       -- chemin dans le bucket Supabase Storage
  created_at timestamptz not null default now()
);
create index on files (workspace_id);
create index on files (page_id);

-- ---------------------------------------------------------------------------
-- Vues de base de données                                        (phase 3)
-- ---------------------------------------------------------------------------
create table db_views (
  id uuid primary key default gen_random_uuid(),
  database_id uuid not null references databases(id) on delete cascade,
  name text not null default 'Tableau',
  type text not null default 'table'
    check (type in ('table','board','list','gallery','calendar','timeline','chart','form')),
  position text not null default 'a0',
  -- {filter, sorts, group_by, sub_group_by, hidden_groups, visible_props, prop_widths,
  --  frozen_until, open_pages_in, card_cover, card_size, date_prop, chart, form, calc}
  config jsonb not null default '{}',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on db_views (database_id, position);

-- Filtres et tris personnels (non enregistrés pour tout le monde).
create table db_view_user_overrides (
  view_id uuid not null references db_views(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  config jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (view_id, user_id)
);

-- Vue liée : un bloc de page qui affiche une BDD existante (phase 3).
-- Stockée dans le contenu BlockNote ({type:'linkedDatabase', props:{databaseId, viewIds}}),
-- pas de table dédiée.

-- Compteur pour la propriété unique_id (ex. TASK-42), par BDD et par propriété.
create table db_unique_counters (
  database_id uuid not null references databases(id) on delete cascade,
  property_id text not null,
  last_value bigint not null default 0,
  primary key (database_id, property_id)
);

-- ---------------------------------------------------------------------------
-- Commentaires                                                   (phase 2)
-- ---------------------------------------------------------------------------
create table discussions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  block_id text,                -- id du bloc BlockNote ; nul = commentaire de page
  anchor_text text,             -- extrait du texte commenté, pour l'affichage si le bloc change
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on discussions (page_id);

create table comments (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references discussions(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body jsonb not null,          -- texte riche (inline BlockNote) avec mentions
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index on comments (discussion_id, created_at);

create table comment_reactions (
  comment_id uuid not null references comments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

-- ---------------------------------------------------------------------------
-- Notifications                                                  (phase 2)
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null check (type in ('mention','comment','reply','invite','share','reminder','assignment','page_update')),
  page_id uuid references pages(id) on delete cascade,
  block_id text,
  actor_id uuid references profiles(id) on delete set null,
  payload jsonb not null default '{}',
  -- Clé d'idempotence : une même action ne crée qu'une notification.
  dedupe_key text,
  read_at timestamptz,
  archived_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, archived_at, created_at desc);
create unique index on notifications (user_id, dedupe_key) where dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- Historique des versions                                        (phase 2)
-- Un instantané au plus toutes les 10 minutes par page et par session d'édition.
-- ---------------------------------------------------------------------------
create table page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  title text not null,
  content jsonb not null,
  props jsonb not null default '{}',
  authors uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on page_versions (page_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Automatisations                                                (phase 4)
-- ---------------------------------------------------------------------------
create table automations (
  id uuid primary key default gen_random_uuid(),
  database_id uuid not null references databases(id) on delete cascade,
  name text not null default '',
  -- {type: 'page_added'|'property_edited', property_id?, condition?}
  trigger jsonb not null,
  -- [{type: 'set_property'|'add_page'|'notify'|'webhook', ...}]
  actions jsonb not null default '[]',
  enabled boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on automations (database_id) where enabled;

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  page_id uuid references pages(id) on delete set null,
  status text not null check (status in ('ok','error','skipped_loop')),
  error text,
  depth int not null default 0,        -- profondeur de chaînage, plafonnée pour éviter les boucles
  created_at timestamptz not null default now()
);
create index on automation_runs (automation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- IA                                                             (phase 5)
-- ---------------------------------------------------------------------------
create table ai_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default '',
  messages jsonb not null default '[]',
  context_page_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ai_threads (user_id, updated_at desc);

-- updated_at sur les autres tables
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();
create trigger workspaces_updated before update on workspaces for each row execute function set_updated_at();
create trigger teamspaces_updated before update on teamspaces for each row execute function set_updated_at();
create trigger databases_updated before update on databases for each row execute function set_updated_at();
create trigger db_views_updated before update on db_views for each row execute function set_updated_at();
create trigger automations_updated before update on automations for each row execute function set_updated_at();
create trigger ai_threads_updated before update on ai_threads for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Contrôle d'accès
-- ---------------------------------------------------------------------------

-- Rang numérique d'un niveau d'accès, pour comparer.
create or replace function access_rank(level text) returns int language sql immutable as $$
  select case level
    when 'full_access' then 4 when 'can_edit' then 3
    when 'can_comment' then 2 when 'can_view' then 1 else 0 end
$$;

create or replace function is_workspace_member(ws uuid, min_role text default 'guest')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members m
     where m.workspace_id = ws and m.user_id = auth.uid()
       and case min_role
             when 'guest'  then true
             when 'member' then m.role in ('owner','admin','member')
             when 'admin'  then m.role in ('owner','admin')
             when 'owner'  then m.role = 'owner'
           end
  )
$$;

-- Niveau d'accès effectif de l'utilisateur courant sur une page, calculé à partir de la ligne
-- elle-même (et non de son id) : ainsi la RLS fonctionne aussi sur une ligne en cours
-- d'insertion, que la fonction ne pourrait pas encore relire dans la table.
-- Règles, dans l'ordre :
--   1. le propriétaire d'une arborescence privée a toujours l'accès complet ;
--   2. sinon, la page la plus proche (elle-même incluse) qui a ses propres droits
--      (has_own_permissions) décide : droits explicites + accès général de l'espace ;
--   3. sans ancre, la racine décide : page privée -> personne d'autre ;
--      teamspace -> ses membres (ou tous les membres si elle est ouverte), en édition ;
--   4. propriétaires et admins de l'espace : accès complet, sauf aux pages privées des autres.
create or replace function page_row_access(p pages) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ws_role text;
  root_private_owner uuid;
  root_teamspace uuid;
  anchor_id uuid;
  anchor_general text;
  anchor_general_level text;
  best int := 0;
begin
  if uid is null then return null; end if;

  select m.role into ws_role from workspace_members m
   where m.workspace_id = p.workspace_id and m.user_id = uid;

  -- Racine de l'arborescence : la page elle-même si elle n'a pas d'ancêtre.
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

  -- Ancre : la page elle-même si elle a ses propres droits, sinon l'ancêtre le plus proche.
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
      best := greatest(best, access_rank(anchor_general_level));
    end if;
  elsif root_teamspace is not null then
    if exists (
      select 1 from teamspaces t
        left join teamspace_members tm on tm.teamspace_id = t.id and tm.user_id = uid
       where t.id = root_teamspace
         and (tm.user_id is not null or (t.access = 'open' and ws_role in ('owner','admin','member')))
    ) then
      best := 3;
    end if;
  end if;

  if ws_role in ('owner','admin') and root_private_owner is null then
    best := 4;
  end if;

  -- Une page verrouillée reste lisible mais n'est éditable qu'avec l'accès complet (côté app).
  return case best when 4 then 'full_access' when 3 then 'can_edit'
                   when 2 then 'can_comment' when 1 then 'can_view' else null end;
end $$;

create or replace function page_access_level(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select page_row_access(p) from pages p where p.id = pid
$$;

create or replace function can_access_page(pid uuid, min_level text default 'can_view')
returns boolean language sql stable as $$
  select access_rank(page_access_level(pid)) >= access_rank(min_level)
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table workspace_invites enable row level security;
alter table teamspaces enable row level security;
alter table teamspace_members enable row level security;
alter table pages enable row level security;
alter table databases enable row level security;
alter table page_permissions enable row level security;
alter table favorites enable row level security;
alter table files enable row level security;
alter table db_views enable row level security;
alter table db_view_user_overrides enable row level security;
alter table db_unique_counters enable row level security;
alter table discussions enable row level security;
alter table comments enable row level security;
alter table comment_reactions enable row level security;
alter table notifications enable row level security;
alter table page_versions enable row level security;
alter table automations enable row level security;
alter table automation_runs enable row level security;
alter table ai_threads enable row level security;

-- Profils : chacun voit les profils des membres de ses espaces ; ne modifie que le sien.
create policy profiles_read on profiles for select using (
  id = auth.uid() or exists (
    select 1 from workspace_members a join workspace_members b using (workspace_id)
     where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_update on profiles for update using (id = auth.uid());

-- Espaces
create policy ws_read on workspaces for select using (is_workspace_member(id));
create policy ws_insert on workspaces for insert with check (created_by = auth.uid());
create policy ws_update on workspaces for update using (is_workspace_member(id, 'admin'));
create policy ws_delete on workspaces for delete using (is_workspace_member(id, 'owner'));

create policy wsm_read on workspace_members for select using (is_workspace_member(workspace_id));
create policy wsm_write on workspace_members for all
  using (is_workspace_member(workspace_id, 'admin'))
  with check (is_workspace_member(workspace_id, 'admin'));
create policy wsm_leave on workspace_members for delete using (user_id = auth.uid());
-- Le créateur d'un espace s'y ajoute comme propriétaire : fait côté serveur (clé service),
-- comme l'acceptation d'une invitation.

create policy wsi_admin on workspace_invites for all
  using (is_workspace_member(workspace_id, 'admin'))
  with check (is_workspace_member(workspace_id, 'admin'));

-- Teamspaces
create policy ts_read on teamspaces for select using (
  is_workspace_member(workspace_id, 'member') and (
    access <> 'private' or exists (
      select 1 from teamspace_members tm where tm.teamspace_id = id and tm.user_id = auth.uid()))
);
create policy ts_write on teamspaces for all
  using (is_workspace_member(workspace_id, 'admin') or exists (
    select 1 from teamspace_members tm where tm.teamspace_id = id
       and tm.user_id = auth.uid() and tm.role = 'owner'))
  with check (is_workspace_member(workspace_id, 'member'));

create policy tsm_read on teamspace_members for select using (
  exists (select 1 from teamspaces t where t.id = teamspace_id and is_workspace_member(t.workspace_id, 'member'))
);
create policy tsm_write on teamspace_members for all
  using (exists (select 1 from teamspace_members me where me.teamspace_id = teamspace_members.teamspace_id
                   and me.user_id = auth.uid() and me.role = 'owner')
         or exists (select 1 from teamspaces t where t.id = teamspace_id and is_workspace_member(t.workspace_id, 'admin'))
         or user_id = auth.uid());

-- Pages
create policy pages_read on pages for select using (access_rank(page_row_access(pages)) >= access_rank('can_view'));
create policy pages_insert on pages for insert with check (
  is_workspace_member(workspace_id, 'guest') and (
    (parent_page_id is not null and can_access_page(parent_page_id, 'can_edit'))
    or (database_id is not null and exists (
         select 1 from databases d where d.id = database_id and can_access_page(d.page_id, 'can_edit')))
    or (private_owner_id = auth.uid())
    or (teamspace_id is not null and is_workspace_member(workspace_id, 'member'))
  )
);
create policy pages_update on pages for update using (access_rank(page_row_access(pages)) >= access_rank('can_edit'));
create policy pages_delete on pages for delete using (access_rank(page_row_access(pages)) >= access_rank('full_access'));

create policy dbs_read on databases for select using (can_access_page(page_id, 'can_view'));
create policy dbs_write on databases for all
  using (can_access_page(page_id, 'can_edit')) with check (can_access_page(page_id, 'can_edit'));

create policy perm_read on page_permissions for select using (can_access_page(page_id, 'can_view'));
create policy perm_write on page_permissions for all
  using (can_access_page(page_id, 'full_access')) with check (can_access_page(page_id, 'full_access'));

create policy fav_own on favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy files_read on files for select using (is_workspace_member(workspace_id));
create policy files_insert on files for insert with check (
  is_workspace_member(workspace_id) and uploaded_by = auth.uid());
create policy files_delete on files for delete using (uploaded_by = auth.uid() or is_workspace_member(workspace_id, 'admin'));

create policy views_read on db_views for select using (
  exists (select 1 from databases d where d.id = database_id and can_access_page(d.page_id, 'can_view')));
create policy views_write on db_views for all
  using (exists (select 1 from databases d where d.id = database_id and can_access_page(d.page_id, 'can_edit')))
  with check (exists (select 1 from databases d where d.id = database_id and can_access_page(d.page_id, 'can_edit')));

create policy view_over_own on db_view_user_overrides for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- db_unique_counters : uniquement via la fonction serveur next_unique_id (clé service).

create policy disc_read on discussions for select using (can_access_page(page_id, 'can_view'));
create policy disc_write on discussions for all
  using (can_access_page(page_id, 'can_comment')) with check (can_access_page(page_id, 'can_comment'));

create policy com_read on comments for select using (
  exists (select 1 from discussions d where d.id = discussion_id and can_access_page(d.page_id, 'can_view')));
create policy com_insert on comments for insert with check (
  author_id = auth.uid() and exists (
    select 1 from discussions d where d.id = discussion_id and can_access_page(d.page_id, 'can_comment')));
create policy com_own on comments for update using (author_id = auth.uid());
create policy com_del on comments for delete using (author_id = auth.uid());

create policy react_read on comment_reactions for select using (
  exists (select 1 from comments c join discussions d on d.id = c.discussion_id
           where c.id = comment_id and can_access_page(d.page_id, 'can_view')));
create policy react_own on comment_reactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Les notifications sont créées par le serveur (clé service) ; l'utilisateur lit et marque les siennes.
create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_mark on notifications for update using (user_id = auth.uid());

create policy versions_read on page_versions for select using (can_access_page(page_id, 'can_view'));

create policy auto_read on automations for select using (
  exists (select 1 from databases d where d.id = database_id and can_access_page(d.page_id, 'can_view')));
create policy auto_write on automations for all
  using (exists (select 1 from databases d where d.id = database_id and can_access_page(d.page_id, 'full_access')))
  with check (exists (select 1 from databases d where d.id = database_id and can_access_page(d.page_id, 'full_access')));
create policy autorun_read on automation_runs for select using (
  exists (select 1 from automations a join databases d on d.id = a.database_id
           where a.id = automation_id and can_access_page(d.page_id, 'can_view')));

create policy ai_own on ai_threads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Fonctions serveur
-- ---------------------------------------------------------------------------

-- Prochain numéro d'ID unique, sans doublon même en cas de créations simultanées.
create or replace function next_unique_id(db uuid, prop text) returns bigint
language sql volatile security definer set search_path = public as $$
  insert into db_unique_counters (database_id, property_id, last_value)
  values (db, prop, 1)
  on conflict (database_id, property_id)
  do update set last_value = db_unique_counters.last_value + 1
  returning last_value
$$;

-- Recherche plein texte + titre approchant, limitée aux pages accessibles.
create or replace function search_pages(ws uuid, q text, lim int default 20)
returns table (id uuid, title text, icon text, path uuid[], updated_at timestamptz, rank real)
language sql stable as $$
  select p.id, p.title, p.icon, p.path, p.updated_at,
         greatest(ts_rank(p.search, websearch_to_tsquery('simple', q)), similarity(p.title, q)) as rank
    from pages p
   where p.workspace_id = ws and not p.in_trash
     and (p.search @@ websearch_to_tsquery('simple', q) or p.title % q or p.title ilike '%' || q || '%')
     and can_access_page(p.id, 'can_view')
   order by rank desc, p.updated_at desc
   limit lim
$$;

-- Corbeille : met une page et tous ses descendants à la corbeille (ou les restaure).
create or replace function set_trash(pid uuid, trash boolean) returns void
language plpgsql security invoker as $$
begin
  -- Comme dans l'original : qui peut modifier peut mettre à la corbeille.
  -- La suppression définitive (delete) exige l'accès complet (policy pages_delete).
  if not can_access_page(pid, 'can_edit') then
    raise exception 'Accès refusé';
  end if;
  update pages
     set in_trash = trash,
         trashed_at = case when trash then now() else null end,
         trashed_by = case when trash then auth.uid() else null end
   where id = pid or pid = any(path);
end $$;
