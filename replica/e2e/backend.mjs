// Backend de bout en bout sur Neon : persistance serveur, deuxième appareil, isolation entre comptes, API protégée.
//   SERVER_LOG=<sortie de next start> node --env-file=.env.local replica/e2e/backend.mjs
// Crée des comptes @e2e.test : lancer scripts/cleanup-e2e.mjs ensuite.
import { Pool } from "@neondatabase/serverless";
import { chromium } from "playwright-core";
import { logIn, signUp } from "./login.mjs";

const base = "http://localhost:3123";
const stamp = Date.now();
const A = `awa+${stamp}@e2e.test`;
const B = `bob+${stamp}@e2e.test`;
const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", msg); };
const watch = (p, who) => {
  p.on("pageerror", (e) => errors.push(`${who} pageerror: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && !/401|Unauthorized/.test(m.text()) && errors.push(`${who}: ${m.text()}`));
};
const title = (p) => p.locator('textarea[aria-label="Titre de la page"]:visible');
const editor = (p) => p.locator(".page-editor .bn-editor:visible");

// Sans session : l'API refuse
const anon = await browser.newContext();
const r0 = await (await anon.request.get(base + "/api/bootstrap")).json();
check(r0.signedIn === false && !r0.pages, "API sans session : aucune donnée");
const s401 = await anon.request.post(base + "/api/sync", { data: {} });
check(s401.status() === 401, `écriture sans session : 401 (${s401.status()})`);

// A s'inscrit : l'espace et ses pages de départ sont créés sur le serveur
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const a = await ctxA.newPage();
watch(a, "A");
await signUp(a, base, A, "Awa Test", "Atelier A");
check(await a.getByRole("link", { name: "Guide de démarrage" }).isVisible(), "A : pages de départ visibles");

// A écrit une page privée
await a.getByRole("button", { name: "Ajouter une page dans Privé" }).click();
await a.waitForURL("**/p/**?new=1");
const pageUrl = a.url().split("?")[0];
const pageId = pageUrl.split("/p/")[1];
await editor(a).waitFor();
await title(a).fill("Secret de A");
await a.keyboard.press("Enter");
await a.keyboard.type("Code du coffre : 4521");
await a.waitForTimeout(1500);

// Rechargement : tout vient du serveur
await a.goto(pageUrl);
await editor(a).waitFor();
check((await title(a).inputValue()) === "Secret de A", "A : titre relu depuis le serveur");
check(await editor(a).getByText("Code du coffre : 4521").isVisible(), "A : contenu relu depuis le serveur");

// Renvoyer une page au contenu inchangé (ici, seul le titre change) ne doit pas être pris pour un conflit.
{
  const boot = await (await a.request.get(base + "/api/bootstrap")).json();
  const pg = boot.pages.find((p) => p.id === pageId);
  const res = await (await a.request.post(base + "/api/sync", { data: { workspaceId: boot.workspace.id, pages: [{ ...pg, title: "Secret de A (bis)" }] } })).json();
  check(Array.isArray(res.conflicts) && res.conflicts.length === 0, `contenu inchangé renvoyé : aucun conflit (${JSON.stringify(res.conflicts)})`);
  const again = await (await a.request.get(base + "/api/bootstrap")).json();
  check(again.pages.find((p) => p.id === pageId)?.title === "Secret de A (bis)", "contenu inchangé renvoyé : le nouveau titre est enregistré");
  await a.request.post(base + "/api/sync", { data: { workspaceId: boot.workspace.id, pages: [{ ...pg, title: "Secret de A" }] } });
}

// Base de données : un changement de statut est enregistré
await a.keyboard.press("Control+k");
await a.getByLabel("Rechercher une page").fill("suivi des taches");
await a.keyboard.press("Enter");
await a.locator("[data-db-view]:visible").waitFor();
const row = a.locator('[data-db-view]:visible [role="rowgroup"] [role="row"]').filter({ hasText: "Tester le site sur mobile" });
await row.getByRole("button", { name: "Modifier Statut" }).click();
await a.getByRole("option", { name: /Terminé/ }).click();
await a.keyboard.press("Escape");
await a.waitForTimeout(1500);
await a.reload();
await a.locator("[data-db-view]:visible").waitFor();
check(await a.locator('[data-db-view]:visible [role="row"]').filter({ hasText: "Tester le site sur mobile" }).getByText("Terminé").isVisible(), "A : statut de la base relu depuis le serveur");

// Deuxième appareil de A : nouvelles cookies, mêmes données
const ctxA2 = await browser.newContext();
const a2 = await ctxA2.newPage();
watch(a2, "A2");
await logIn(a2, base, A);
await a2.waitForURL("**/home");
await a2.goto(pageUrl);
await editor(a2).waitFor();
check(await editor(a2).getByText("Code du coffre : 4521").isVisible(), "A sur un 2e appareil : retrouve sa page");

// B s'inscrit : il ne voit rien de A
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const b = await ctxB.newPage();
watch(b, "B");
await signUp(b, base, B, "Bob Test", "Atelier B");
await b.keyboard.press("Control+k");
await b.getByLabel("Rechercher une page").fill("secret");
await b.waitForTimeout(300);
check((await b.getByRole("option").count()) === 0, "B : la recherche ne trouve pas la page de A");
await b.keyboard.press("Escape");
await b.goto(pageUrl);
const notFound = await b.getByText("Page introuvable").filter({ visible: true }).waitFor({ timeout: 10000 }).then(() => true, () => false);
check(notFound, "B : lien direct vers la page de A -> introuvable");
const boot = await (await ctxB.request.get(base + "/api/bootstrap")).json();
check(!boot.pages.some((p) => p.id === pageId) && boot.workspace.name === "Atelier B", "B : l'API ne renvoie que son espace");

// B tente d'écrire dans la page de A par l'API : refusé par la RLS
const forged = await ctxB.request.post(base + "/api/sync", {
  data: {
    workspaceId: boot.workspace.id,
    pages: [{ id: pageId, parentId: null, section: "private", title: "Piraté", icon: null, coverUrl: null, coverPosition: 0.5, fullWidth: false, smallText: false, font: "default", isLocked: false, content: [], contentText: "", contentVersion: 99, inTrash: false, trashedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), position: 1 }],
  },
});
check(forged.status() === 403, `B : écrire dans la page de A par l'API -> refusé (${forged.status()})`);
await a.goto(pageUrl);
await editor(a).waitFor();
check((await title(a).inputValue()) === "Secret de A", "A : sa page est intacte après la tentative de B");

// Données invalides : refusées avant la base
const bad = await ctxB.request.post(base + "/api/sync", { data: { workspaceId: "pas-un-uuid" } });
check(bad.status() === 400, `données invalides -> 400 (${bad.status()})`);

// Changements faits ailleurs : A crée une page sur son 1er appareil, elle apparaît sur le 2e sans recharger
await a2.goto(base + "/home");
await a2.getByRole("heading", { name: /Awa/ }).filter({ visible: true }).waitFor();
await a.getByRole("button", { name: "Ajouter une page dans Privé" }).click();
await a.waitForURL("**/p/**?new=1");
await editor(a).waitFor();
await title(a).fill("Visible ailleurs");
const seenAt = Date.now();
const appeared = await a2
  .getByRole("link", { name: "Visible ailleurs" })
  .first()
  .waitFor({ timeout: 20000 })
  .then(() => true, () => false);
check(appeared, `A : une page créée sur un appareil apparaît sur l'autre sans recharger (${((Date.now() - seenAt) / 1000).toFixed(1)} s)`);

// Fichiers : stockés sur le serveur, servis après contrôle d'accès
const otherPageId = a.url().split("/p/")[1].split("?")[0];
const bootA = await (await ctxA.request.get(base + "/api/bootstrap")).json();
const up = await ctxA.request.post(base + "/api/files", {
  multipart: { workspaceId: bootA.workspace.id, pageId: otherPageId, file: { name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("Contenu du fichier de test") } },
});
const upBody = await up.json();
check(up.status() === 200 && /^\/api\/files\/[0-9a-f-]{36}$/.test(upBody.url ?? ""), `fichier : import accepté (${up.status()})`);
const dl = await ctxA2.request.get(base + upBody.url);
check(dl.status() === 200 && (await dl.text()) === "Contenu du fichier de test", "fichier : relu depuis le serveur sur l'autre appareil");
check(/attachment/.test(dl.headers()["content-disposition"] ?? "") && dl.headers()["x-content-type-options"] === "nosniff", "fichier texte : téléchargé (pas affiché), nosniff");
const html = await ctxA.request.post(base + "/api/files", {
  multipart: { workspaceId: bootA.workspace.id, file: { name: "piege.html", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") } },
});
check(html.status() === 400, `fichier HTML : refusé (${html.status()})`);
const big = await ctxA.request.post(base + "/api/files", {
  multipart: { workspaceId: bootA.workspace.id, file: { name: "gros.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(11 * 1024 * 1024) } },
});
check(big.status() === 413 || big.status() === 400, `fichier de 11 Mo : refusé (${big.status()})`);
const fileB = await ctxB.request.get(base + upBody.url);
check(fileB.status() === 404, `B : le fichier de A est introuvable pour lui (${fileB.status()})`);
const fileAnon = await anon.request.get(base + upBody.url);
check(fileAnon.status() === 404, `sans session : fichier introuvable (${fileAnon.status()})`);

// Purge planifiée : protégée par secret, et efface bien les pages à la corbeille depuis plus de 30 jours
const cronNo = await anon.request.get(base + "/api/cron/purge");
check(cronNo.status() === 401, `purge sans secret : 401 (${cronNo.status()})`);
const owner = new Pool({ connectionString: process.env.DATABASE_URL_OWNER });
await owner.query("update pages set in_trash = true, trashed_at = now() - interval '31 days' where id = $1", [otherPageId]);
const cron = await anon.request.get(base + "/api/cron/purge", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
const cronBody = await cron.json();
const gone = (await owner.query("select 1 from pages where id = $1", [otherPageId])).rowCount === 0;
const fileGoneSoon = (await owner.query("select page_id from files where storage_path = $1", [`db:${upBody.url.split("/").pop()}`])).rows[0];
check(cron.status() === 200 && cronBody.pagesDeleted >= 1 && gone, `purge avec secret : page de plus de 30 jours effacée (${cronBody.pagesDeleted} page(s))`);
check(fileGoneSoon && fileGoneSoon.page_id === null, "purge : le fichier de la page effacée devient orphelin (effacé à la purge suivante)");

// Déconnexion d'un appareil : l'autre reste connecté
await a2.getByRole("button", { name: /Atelier A/ }).click();
await a2.getByRole("menuitem", { name: "Se déconnecter" }).click();
await a2.waitForURL("**/login");
const a2After = await (await ctxA2.request.get(base + "/api/bootstrap")).json();
const aStill = await (await ctxA.request.get(base + "/api/bootstrap")).json();
check(a2After.signedIn === false && aStill.workspace?.name === "Atelier A", "déconnexion d'un appareil : l'autre session reste ouverte");

// Suppression de compte (B) depuis les réglages
await b.getByRole("button", { name: "Réglages" }).click();
await b.getByRole("button", { name: "Supprimer mon compte…" }).click();
await b.getByLabel("Tapez SUPPRIMER pour confirmer").fill("SUPPRIMER");
await b.getByRole("button", { name: "Supprimer définitivement" }).click();
await b.waitForURL("**/login");
const bAfter = await (await ctxB.request.get(base + "/api/bootstrap")).json();
const bRow = (await owner.query(`select 1 from "user" where email = $1`, [B])).rowCount;
const bSpace = (await owner.query("select 1 from workspaces where id = $1", [boot.workspace.id])).rowCount;
const bProfile = (await owner.query("select 1 from profiles where email = $1", [B])).rowCount;
check(bAfter.signedIn === false && bRow === 0 && bProfile === 0 && bSpace === 0, "B : compte, profil et espace supprimés pour de bon");
await owner.end();

console.log("\nerreurs console :", errors.length ? "\n  " + errors.join("\n  ") : "aucune");
console.log(fail ? `${fail} ECHEC(S)` : "TOUS LES CONTROLES PASSENT");
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
