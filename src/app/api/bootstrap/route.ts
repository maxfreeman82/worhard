import { loadBootstrap } from "@/server/data";
import { currentUserId } from "@/server/session";

// Tout ce que l'utilisateur peut voir dans son espace : le client le garde en cache et se met à jour à partir de là.
export async function GET(req: Request) {
  const userId = await currentUserId(req);
  // Pas de session : réponse normale (pas d'erreur HTTP dans la console du navigateur sur l'écran de connexion).
  if (!userId) return Response.json({ signedIn: false }, { headers: { "Cache-Control": "no-store" } });
  const data = await loadBootstrap(userId);
  if (!data) return Response.json({ error: "Profil introuvable." }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
