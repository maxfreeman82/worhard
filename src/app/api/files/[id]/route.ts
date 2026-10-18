import { readFile } from "@/server/files";
import { currentUserId } from "@/server/session";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await currentUserId(req);
  // Même réponse sans session ou sans droit : on ne révèle pas qu'un fichier existe.
  if (!userId || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Introuvable", { status: 404 });
  const f = await readFile(userId, id);
  if (!f) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Length": String(f.data.length),
      "Content-Disposition": `${f.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
