import "server-only";
import { auth } from "./auth";

/** Id de l'utilisateur connecté (cookie de session Better Auth), ou null. */
export async function currentUserId(req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}

export const unauthorized = () => Response.json({ error: "Non connecté." }, { status: 401 });
