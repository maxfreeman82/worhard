// Supprime les comptes de test (adresses @e2e.test) et tout ce qu'ils ont créé.
//   node --env-file=.env.local scripts/cleanup-e2e.mjs
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_OWNER });
const c = await pool.connect();
try {
  await c.query("begin");
  const users = (await c.query(`select id from "user" where email like '%@e2e.test'`)).rows.map((r) => r.id);
  if (users.length) {
    // Les espaces créés par ces comptes (et donc leurs pages, bases, vues) partent avec eux.
    const ws = await c.query("delete from workspaces where created_by = any($1::uuid[]) returning id", [users]);
    await c.query(`delete from verification where identifier like '%@e2e.test%'`);
    await c.query(`delete from "user" where id = any($1::uuid[])`, [users]);
    console.log(`${users.length} compte(s) de test et ${ws.rowCount} espace(s) supprimés.`);
  } else console.log("Aucun compte de test.");
  await c.query("commit");
} catch (e) {
  await c.query("rollback");
  throw e;
} finally {
  c.release();
  await pool.end();
}
