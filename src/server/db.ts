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

export function owner() {
  ownerPool ??= new Pool({ connectionString: required("DATABASE_URL_OWNER"), max: 5 });
  return ownerPool;
}

function app() {
  appPool ??= new Pool({ connectionString: required("DATABASE_URL"), max: 10 });
  return appPool;
}

/**
 * Exécute `fn` dans une transaction du rôle app_user, au nom de `userId` :
 * `app.user_id` est posé pour la transaction, et toutes les règles RLS le lisent via app.uid().
 */
export async function asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await app().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Transaction du rôle propriétaire (création d'espace, profils). À réserver aux opérations listées « serveur ». */
export async function asOwner<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await owner().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
