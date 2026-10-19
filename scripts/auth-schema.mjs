// Génère le SQL des tables Better Auth (user, session, account, verification) pour notre configuration.
//   node --env-file=.env.local scripts/auth-schema.mjs db/migrations/0002_better_auth.sql
// Garder les options alignées avec src/server/auth.ts (ids UUID, e-mail + mot de passe).
import { Pool } from "@neondatabase/serverless";
import { getMigrations } from "better-auth/db/migration";
import fs from "node:fs";

const out = process.argv[2];
const pool = new Pool({ connectionString: process.env.DATABASE_URL_OWNER });
const { compileMigrations, toBeCreated } = await getMigrations({
  database: pool,
  advanced: { database: { generateId: "uuid" } },
  emailAndPassword: { enabled: true },
});
const sql = await compileMigrations();
fs.writeFileSync(out, `-- Tables de Better Auth, générées par scripts/auth-schema.mjs (ne pas modifier à la main).\n${sql}\n`);
console.log("tables :", toBeCreated.map((t) => t.table).join(", ") || "aucune (déjà créées)");
await pool.end();
