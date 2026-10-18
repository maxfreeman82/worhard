import "server-only";
import { Pool, type PoolClient } from "@neondatabase/serverless";

// Deux connexions Neon :
// - owner : rôle propriétaire, pour Better Auth (ses tables n'ont pas de RLS) et les tâches serveur ;
// - app   : rôle app_user, non propriétaire, pour tout ce qui vient d'un utilisateur. La RLS s'applique.
function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  return v;
}

let ownerPool: Pool | null = null;
let appPool: Pool | null = null;

// Neon ferme les connexions inactives : on les libère nous-mêmes avant (10 s), et une erreur sur une connexion
// au repos ne doit pas faire tomber le serveur.
function makePool(url: string, max: number) {
  const pool = new Pool({ connectionString: url, max, idleTimeoutMillis: 10_000 });
  pool.on("error", (e: Error) => console.warn("neon: connexion au repos perdue :", e.message));
  return pool;
}

export function owner() {
  ownerPool ??= makePool(required("DATABASE_URL_OWNER"), 5);
  return ownerPool;
}

function app() {
  appPool ??= makePool(required("DATABASE_URL"), 10);
  return appPool;
}

/** Erreur de connexion (et non de requête) : la transaction n'a rien écrit, on peut la rejouer sur une autre connexion. */
function isConnectionError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /connection error|not queryable|Connection terminated|ECONNRESET|socket hang up|WebSocket/i.test(msg);
}

async function transaction<T>(pool: Pool, setup: (c: PoolClient) => Promise<void>, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let client: PoolClient | null = null;
    let broken = false;
    try {
      client = await pool.connect();
      await client.query("begin");
      await setup(client);
      const out = await fn(client);
      await client.query("commit");
      return out;
    } catch (e) {
      broken = isConnectionError(e);
      if (client && !broken) await client.query("rollback").catch(() => {});
      if (broken && attempt === 0) continue;
      throw e;
    } finally {
      // Une connexion cassée est détruite au lieu de retourner dans le pool.
      client?.release(broken ? true : undefined);
    }
  }
}

/**
 * Exécute `fn` dans une transaction du rôle app_user, au nom de `userId` :
 * `app.user_id` est posé pour la transaction, et toutes les règles RLS le lisent via app.uid().
 */
export function asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return transaction(app(), (c) => c.query("select set_config('app.user_id', $1, true)", [userId]).then(() => {}), fn);
}

/** Transaction du rôle propriétaire (création d'espace, profils). À réserver aux opérations listées « serveur ». */
export function asOwner<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return transaction(owner(), async () => {}, fn);
}
