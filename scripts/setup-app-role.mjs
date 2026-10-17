// Crée le rôle app_user (non propriétaire des tables, donc soumis à la RLS) et écrit DATABASE_URL dans .env.local.
//   npm run db:setup-role        (à lancer une fois, avant npm run db:migrate)
// Le mot de passe est généré ici, n'est jamais affiché et ne quitte pas .env.local.
import { Pool } from "@neondatabase/serverless";
import crypto from "node:crypto";
import fs from "node:fs";

const ownerUrl = process.env.DATABASE_URL_OWNER;
if (!ownerUrl) throw new Error("DATABASE_URL_OWNER manquant dans .env.local");
const envPath = ".env.local";
const env = fs.readFileSync(envPath, "utf8");
if (/^DATABASE_URL=postgres/m.test(env)) {
  console.log("DATABASE_URL est déjà renseigné : rien à faire.");
  process.exit(0);
}

const password = crypto.randomBytes(24).toString("base64url");
const pool = new Pool({ connectionString: ownerUrl });
const exists = (await pool.query("select 1 from pg_roles where rolname = 'app_user'")).rowCount > 0;
// Le mot de passe ne peut pas être passé en paramètre à CREATE ROLE : il est généré ici (base64url, sans guillemet).
await pool.query(exists ? `alter role app_user with login password '${password}'` : `create role app_user with login password '${password}'`);
await pool.end();

const url = new URL(ownerUrl);
url.username = "app_user";
url.password = password;
fs.writeFileSync(envPath, env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${url.toString()}`));
console.log(`Rôle app_user ${exists ? "mis à jour" : "créé"} ; DATABASE_URL écrit dans .env.local.`);
