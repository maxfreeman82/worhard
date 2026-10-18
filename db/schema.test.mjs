import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
import path from 'node:path';

const db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
// Rôle de l'app, non propriétaire des tables : comme en production sur Neon, la RLS s'applique à lui.
await db.exec(`create role app_user;`);
// Toutes les migrations, dans l'ordre (argument : le dossier db/migrations).
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
await db.exec(`grant usage on schema public, app to app_user;
  grant select, insert, update, delete on all tables in schema public to app_user;
  grant execute on all functions in schema public, app to app_user;`);
console.log('SCHEMA OK');

const U = {
  owner: '00000000-0000-0000-0000-000000000001', mem: '00000000-0000-0000-0000-000000000002',
  mem2: '00000000-0000-0000-0000-000000000003', guest: '00000000-0000-0000-0000-000000000004',
  out: '00000000-0000-0000-0000-000000000005',
};
for (const [k, id] of Object.entries(U)) {
  await db.exec(`insert into "user"(id,name,email,"emailVerified") values ('${id}','${k}','${k}@x.fr',true); insert into profiles(id,email,name) values ('${id}','${k}@x.fr','${k}');`);
}
const one = async (sql) => (await db.query(sql)).rows[0];
const ws = (await one(`insert into workspaces(name,created_by) values('W','${U.owner}') returning id`)).id;
await db.exec(`insert into workspace_members values ('${ws}','${U.owner}','owner'),('${ws}','${U.mem}','member'),('${ws}','${U.mem2}','member'),('${ws}','${U.guest}','guest');`);
const ts = (await one(`insert into teamspaces(workspace_id,name,access,is_default) values('${ws}','General','open',true) returning id`)).id;
const tsClosed = (await one(`insert into teamspaces(workspace_id,name,access) values('${ws}','RH','closed') returning id`)).id;
await db.exec(`insert into teamspace_members values ('${tsClosed}','${U.mem2}','owner');`);
const ins = (cols, vals) => one(`insert into pages(workspace_id,${cols}) values('${ws}',${vals}) returning id, path`);

const priv = await ins('private_owner_id,title', `'${U.mem}','Mon journal'`);
const privChild = await ins('parent_page_id,title', `'${priv.id}','Lundi'`);
const team = await ins('teamspace_id,title', `'${ts}','Wiki equipe'`);
const teamChild = await ins('parent_page_id,title,content_text', `'${team.id}','Process','facture fournisseur'`);
const secret = await ins('parent_page_id,title,has_own_permissions,general_access', `'${teamChild.id}','Salaires',true,'invite_only'`);
const secretChild = await ins('parent_page_id,title', `'${secret.id}','Grille 2026'`);
const rh = await ins('teamspace_id,title', `'${tsClosed}','Dossiers RH'`);
await db.exec(`insert into page_permissions(page_id,user_id,level) values ('${secret.id}','${U.mem2}','can_view'),('${team.id}','${U.guest}','can_comment');`);
await db.exec(`update pages set has_own_permissions=true, general_access='workspace', general_access_level='can_edit' where id='${team.id}'`);

const asUser = (uid) => db.exec(`select set_config('app.user_id','${uid}',false)`);
const lvl = async (uid, pid) => { await asUser(uid); return (await one(`select page_access_level('${pid}') l`)).l; };

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', msg); };

const expect = [
  ['mem', 'priv', priv, 'full_access'], ['mem', 'privChild', privChild, 'full_access'],
  ['mem2', 'priv', priv, null], ['owner', 'priv(autrui)', priv, null],
  ['mem', 'team', team, 'can_edit'], ['mem', 'teamChild', teamChild, 'can_edit'],
  ['guest', 'team', team, 'can_comment'], ['guest', 'teamChild', teamChild, 'can_comment'],
  ['mem', 'secret', secret, null], ['mem', 'secretChild', secretChild, null],
  ['mem2', 'secret', secret, 'can_view'], ['mem2', 'secretChild', secretChild, 'can_view'],
  ['owner', 'secret', secret, 'full_access'], ['out', 'team', team, null],
  ['mem', 'rh(ferme)', rh, null], ['mem2', 'rh(ferme)', rh, 'can_edit'], ['guest', 'rh', rh, null],
  ['owner', 'rh(ferme)', rh, 'full_access'],
];
for (const [u, name, p, want] of expect) {
  const got = await lvl(U[u], p.id);
  check(got === want, `${u.padEnd(6)} ${name.padEnd(14)} -> ${got} (attendu ${want})`);
}

check(secretChild.path.length === 3, `chemin de secretChild = ${secretChild.path.length} ancetres (attendu 3)`);
await asUser('');
await db.exec(`update pages set parent_page_id='${priv.id}', teamspace_id=null where id='${teamChild.id}'`);
const p2 = (await one(`select path from pages where id='${secretChild.id}'`)).path;
check(JSON.stringify(p2) === JSON.stringify([priv.id, teamChild.id, secret.id]), 'chemins des descendants recalcules apres deplacement');
try {
  await db.exec(`update pages set parent_page_id='${secretChild.id}' where id='${priv.id}'`);
  check(false, 'deplacement en boucle refuse');
} catch (e) { check(true, 'deplacement en boucle refuse : ' + e.message); }
await db.exec(`update pages set parent_page_id='${team.id}' where id='${teamChild.id}'`);

// RLS avec le rôle app_user
await asUser(U.mem);
await db.exec('set role app_user');
const visibleTs = (await db.query(`select name from teamspaces order by name`)).rows.map((r) => r.name);
check(JSON.stringify(visibleTs) === JSON.stringify(["General", "RH"]), "RLS teamspaces : ouverte et fermée visibles par un membre -> " + JSON.stringify(visibleTs));
const tsm = (await db.query(`select count(*)::int n from teamspace_members`)).rows[0].n;
check(tsm === 1, 'RLS teamspace_members lisible sans récursion -> ' + tsm);
const seen = (await db.query(`select title from pages order by title`)).rows.map((r) => r.title);
check(!seen.includes('Salaires') && !seen.includes('Dossiers RH') && seen.includes('Mon journal'), 'RLS : mem voit ' + seen.join(', '));
const sr = (await db.query(`select title from search_pages('${ws}','facture')`)).rows.map((r) => r.title);
check(sr.includes('Process'), 'recherche "facture" -> ' + JSON.stringify(sr));
const sr2 = (await db.query(`select title from search_pages('${ws}','salaires')`)).rows.map((r) => r.title);
check(sr2.length === 0, 'recherche "salaires" invisible pour mem -> ' + JSON.stringify(sr2));
const np = await one(`insert into pages(workspace_id,parent_page_id,title) values('${ws}','${team.id}','Nouvelle') returning id`);
check(!!np.id, 'mem peut creer une sous-page dans la teamspace');
try {
  await db.query(`insert into pages(workspace_id,parent_page_id,title) values('${ws}','${secret.id}','x')`);
  check(false, 'creation sous une page restreinte refusee');
} catch { check(true, 'creation sous une page restreinte refusee'); }
await db.exec(`select set_trash('${np.id}', true)`);
check((await one(`select in_trash from pages where id='${np.id}'`)).in_trash === true, 'set_trash');
await db.exec(`reset role`);
await asUser('');

const dbid = (await one(`insert into databases(workspace_id,page_id) values('${ws}','${team.id}') returning id`)).id;
const ids = [];
for (let i = 0; i < 3; i++) ids.push(Number((await one(`select next_unique_id('${dbid}','p1') v`)).v));
check(JSON.stringify(ids) === '[1,2,3]', 'ID uniques ' + JSON.stringify(ids));
const row = await ins('database_id,title', `'${dbid}','Ligne'`);
check(row.path.length === 1 && row.path[0] === team.id, 'ligne de BDD : chemin = page conteneur');
await asUser(U.mem);
check((await one(`select page_access_level('${row.id}') l`)).l === 'can_edit', 'ligne de BDD herite des droits du conteneur');
await asUser(U.out);
check((await one(`select page_access_level('${row.id}') l`)).l === null, 'externe : aucun acces a la ligne');

console.log(fail ? `\n${fail} ECHEC(S)` : '\nTOUS LES TESTS PASSENT');
process.exit(fail ? 1 : 0);
