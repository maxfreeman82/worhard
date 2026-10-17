// Applique les migrations de db/migrations dans l'ordre, une seule fois chacune, avec le rôle propriétaire.
//   npm run db:migrate
import { Pool } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("db/migrations");
const pool = new Pool({ connectionString: process.env.DATABASE_URL_OWNER });
const c = await pool.connect();
try {
  await c.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await c.query("select name from schema_migrations")).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    process.stdout.write(`→ ${f} … `);
    await c.query("begin");
    try {
      await c.query(fs.readFileSync(path.join(dir, f), "utf8"));
      await c.query("insert into schema_migrations (name) values ($1)", [f]);
      await c.query("commit");
      applied++;
      console.log("ok");
    } catch (e) {
      await c.query("rollback");
      console.log("ÉCHEC");
      throw e;
    }
  }
  console.log(applied ? `${applied} migration(s) appliquée(s).` : "Base à jour, rien à appliquer.");
} finally {
  c.release();
  await pool.end();
}
