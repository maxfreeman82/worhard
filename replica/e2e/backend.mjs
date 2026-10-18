// Backend de bout en bout sur Neon : persistance serveur, deuxième appareil, isolation entre comptes, API protégée.
//   SERVER_LOG=<sortie de next start> node replica/e2e/backend.mjs
// Crée des comptes @e2e.test : lancer scripts/cleanup-e2e.mjs ensuite.
import { chromium } from "playwright-core";
import { signUp, readCode } from "./login.mjs";

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
await a2.goto(base + "/login");
await a2.getByLabel("Adresse e-mail").fill(A);
await a2.getByRole("button", { name: /Continuer avec/ }).click();
await a2.getByLabel("Code de connexion").waitFor();
await a2.waitForTimeout(500);
await a2.getByLabel("Code de connexion").fill(await readCode(A));
await a2.getByRole("button", { name: "Se connecter" }).click();
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

// Déconnexion
await b.getByRole("button", { name: /Atelier B/ }).click();
await b.getByRole("menuitem", { name: "Se déconnecter" }).click();
await b.waitForURL("**/login");
await b.goto(base + "/home");
await b.waitForURL("**/login");
check(true, "B : déconnecté, /home renvoie vers la connexion");
const after = await (await ctxB.request.get(base + "/api/bootstrap")).json();
check(after.signedIn === false, "B : session fermée côté serveur");

console.log("\nerreurs console :", errors.length ? "\n  " + errors.join("\n  ") : "aucune");
console.log(fail ? `${fail} ECHEC(S)` : "TOUS LES CONTROLES PASSENT");
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
