// Espace de classe sur invitation, de bout en bout sur Neon :
// un étudiant non ajouté est refusé ; l'enseignant l'ajoute en lecture seule, puis en édition, puis le retire.
//   SERVER_LOG=<sortie de next start> ADMIN_EMAILS=@e2e.test node --env-file=.env.local replica/e2e/class.mjs
// L'enseignant (adresse @e2e.test) est admin par ADMIN_EMAILS ; l'étudiant a une adresse @eleves.e2e.test, qui n'en fait pas partie.
import { chromium } from "playwright-core";
import { readCode, signUp } from "./login.mjs";

const base = "http://localhost:3123";
const stamp = Date.now();
const T = `prof+${stamp}@e2e.test`;
const S = `eli+${stamp}@eleves.e2e.test`;
const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
let fail = 0;
const shown = (loc) => loc.waitFor({ timeout: 10000 }).then(() => true, () => false);
const check = (ok, msg) => { if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", msg); };
const watch = (p, who) => {
  p.on("pageerror", (e) => errors.push(`${who} pageerror: ${e.message}`));
  // Refus attendus (403 de la connexion, de l'admin, de l'écriture refusée) : pas des erreurs de l'app.
  p.on("console", (m) => m.type() === "error" && !/401|403|Unauthorized|Forbidden/.test(m.text()) && errors.push(`${who}: ${m.text()}`));
};
const title = (p) => p.locator('textarea[aria-label="Titre de la page"]:visible');
const editor = (p) => p.locator(".page-editor .bn-editor:visible");

// L'envoi de codes est limité : 3 demandes par minute, compteur remis à zéro seulement après 60 s sans demande.
// On enchaîne au plus 2 demandes, puis on laisse passer 61 s.
let chain = 0;
let last = 0;
async function throttle() {
  if (Date.now() - last > 61_000) chain = 0;
  if (chain >= 2) {
    await new Promise((r) => setTimeout(r, Math.max(0, last + 61_000 - Date.now())));
    chain = 0;
  }
  chain++;
  last = Date.now();
}
async function askCode(p, email) {
  await throttle();
  await p.goto(base + "/login");
  await p.getByLabel("Adresse e-mail").fill(email);
  await p.getByRole("button", { name: /Continuer avec/ }).click();
}
async function logIn(p, email) {
  await askCode(p, email);
  await p.getByLabel("Code de connexion").waitFor();
  await p.waitForTimeout(500);
  await p.getByLabel("Code de connexion").fill(await readCode(email));
  await p.getByRole("button", { name: "Se connecter" }).click();
}

// L'enseignant crée son espace et une page de cours partagée
const ctxT = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const t = await ctxT.newPage();
watch(t, "prof");
await throttle();
await signUp(t, base, T, "Prof Test", "Classe test");
await t.getByRole("button", { name: "Ajouter une page dans Espace de travail" }).click();
await t.waitForURL("**/p/**?new=1");
const coursUrl = t.url().split("?")[0];
await editor(t).waitFor();
await title(t).fill("Cours 1");
await t.keyboard.press("Enter");
await t.keyboard.type("Lire le chapitre 3.");
await t.waitForTimeout(1500);

// L'étudiant n'est pas encore ajouté : refusé avant l'envoi du code
const ctxS = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const s = await ctxS.newPage();
watch(s, "eleve");
await askCode(s, S);
check(await shown(s.getByText(/n'a pas accès/)), "non ajouté : connexion refusée avec un message clair");
check(!(await s.getByLabel("Code de connexion").isVisible()), "non ajouté : aucun code envoyé");

// L'enseignant l'ajoute en lecture seule depuis l'admin
await t.getByRole("link", { name: "Membres" }).click();
await t.waitForURL("**/admin");
await t.getByLabel("Adresse e-mail").fill(S);
await t.getByLabel("Prénom et nom (facultatif)").fill("Eli Lecteur");
await t.getByLabel("Rôle", { exact: true }).selectOption("viewer");
await t.getByRole("button", { name: "Ajouter", exact: true }).click();
await t.getByText(/En attente de première connexion/).waitFor();
check(await t.getByText(S).isVisible(), "admin : l'étudiant apparaît en attente");

// L'étudiant se connecte : il arrive directement dans l'espace de la classe
await logIn(s, S);
await s.waitForURL("**/home", { timeout: 20000 }).catch(() => {});
check(s.url().endsWith("/home"), `étudiant : arrive dans l'espace sans créer le sien (${s.url().replace(base, "")})`);
check(await shown(s.getByRole("link", { name: "Cours 1" })), "étudiant : voit la page de cours partagée");
check(!(await s.getByRole("link", { name: "Membres" }).isVisible()), "étudiant : pas de lien vers l'admin");

// Lecture seule : rien de modifiable sur la page de cours, ni à la racine de l'espace partagé
await s.goto(coursUrl);
await editor(s).waitFor();
check(await s.getByText("Lecture seule").isVisible(), "lecture seule : signalée sur la page");
check((await title(s).getAttribute("readonly")) !== null, "lecture seule : titre non modifiable");
check((await s.locator('.page-editor [contenteditable="true"]:visible').count()) === 0, "lecture seule : contenu non modifiable");
check(!(await s.getByRole("button", { name: "Ajouter une page dans Espace de travail" }).isVisible()), "lecture seule : pas de « + » dans l'espace partagé");
const ws = (await (await s.request.get(base + "/api/bootstrap")).json()).workspace.id;
const now = new Date().toISOString();
const forged = await s.request.post(base + "/api/sync", {
  data: {
    workspaceId: ws,
    pages: [{ id: crypto.randomUUID(), parentId: null, section: "workspace", title: "Pirate", icon: null, coverUrl: null, coverPosition: 50, fullWidth: false, smallText: false, font: "default", isLocked: false, content: [], contentText: "", contentVersion: 0, inTrash: false, trashedAt: null, createdAt: now, updatedAt: now, position: 99 }],
  },
});
check(forged.status() === 403, `lecture seule : page partagée créée par l'API -> refusée (${forged.status()})`);
check((await s.request.get(base + "/api/members")).status() === 403, "étudiant : API d'admin refusée (403)");

// Il garde ses pages privées
await s.getByRole("button", { name: "Ajouter une page dans Privé" }).click();
await s.waitForURL("**/p/**?new=1");
const mineUrl = s.url().split("?")[0];
await editor(s).waitFor();
await title(s).fill("Mes notes");
await s.waitForTimeout(1500);
await s.goto(mineUrl);
await editor(s).waitFor();
check((await title(s).inputValue()) === "Mes notes", "lecture seule : ses pages privées sont enregistrées");

// L'enseignant le passe en édition
await t.reload();
await t.getByLabel("Rôle de Eli Lecteur").selectOption("editor");
await t.getByText("Rôle modifié", { exact: true }).waitFor();
await s.goto(coursUrl);
await editor(s).waitFor();
check(!(await s.getByText("Lecture seule").isVisible()), "édition : plus de lecture seule");
await s.locator(".page-editor .bn-editor:visible").getByText("Lire le chapitre 3.").click();
await s.keyboard.press("End");
await s.keyboard.type(" Fait par Eli.");
await s.waitForTimeout(2000);
await t.goto(coursUrl);
await editor(t).waitFor();
check(await editor(t).getByText("Lire le chapitre 3. Fait par Eli.").isVisible(), "édition : la modification de l'étudiant arrive chez l'enseignant");

// L'enseignant le retire : session fermée, plus de connexion possible
await t.goto(base + "/admin");
await t.getByRole("button", { name: "Retirer" }).click();
await t.getByRole("button", { name: "Retirer Eli Lecteur" }).click();
await t.getByText("Membre retiré", { exact: true }).waitFor();
const after = await (await s.request.get(base + "/api/bootstrap")).json();
check(after.signedIn === false, "retiré : sa session est fermée");
await askCode(s, S);
check(await shown(s.getByText(/n'a pas accès/)), "retiré : ne peut plus se connecter");

console.log(`\nerreurs console : ${errors.length ? "\n" + errors.join("\n") : "aucune"}`);
console.log(fail ? `${fail} ECHEC(S)` : "TOUS LES CONTROLES PASSENT");
await browser.close();
process.exit(fail ? 1 : 0);
