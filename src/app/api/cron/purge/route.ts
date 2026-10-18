import { asOwner } from "@/server/db";

// Purge quotidienne (Vercel Cron, voir vercel.json) : pages à la corbeille depuis plus de 30 jours et fichiers orphelins.
// Vercel envoie « Authorization: Bearer <CRON_SECRET> » ; sans secret configuré, la route reste fermée.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Non autorisé." }, { status: 401 });
  }
  const r = await asOwner((c) => c.query("select pages_deleted, files_deleted from purge_trash(30)"));
  const { pages_deleted, files_deleted } = r.rows[0];
  console.info(`purge : ${pages_deleted} page(s), ${files_deleted} fichier(s)`);
  return Response.json({ pagesDeleted: pages_deleted, filesDeleted: files_deleted });
}
