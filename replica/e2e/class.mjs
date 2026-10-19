// Espace de classe, de bout en bout sur Neon : l'étudiant crée son compte et attend ; l'enseignant valide sa demande
// (lecture seule, puis édition), lui donne un mot de passe provisoire, puis le retire. Refus d'une demande et
// adresse pré-autorisée.
//   SERVER_LOG=<sortie de next start> ADMIN_EMAILS=@e2e.test node --env-file=.env.local replica/e2e/class.mjs
// L'enseignant (adresse @e2e.test) est validé d'office par ADMIN_EMAILS ; les étudiants ont des adresses @eleves.e2e.test.
import { chromium } from "playwright-core";
import { createAccount, logIn, PASSWORD, signUp } from "./login.mjs";

const base = "http://localhost:3123";
const stamp = Date.now();
const T = `prof+${stamp}@e2e.test`;
const S = `eli+${stamp}@eleves.e2e.test`;
const Z = `zoe+${stamp}@eleves.e2e.test`;
const P = `paul+${stamp}@eleves.e2e.test`;
const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
let fail = 0;
const shown = (loc, timeout = 10000) => loc.waitFor({ timeout }).then(() => true, () => false);
const check = (ok, msg) => { if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", msg); };
const watch = (p, who) => {
  p.on("pageerror", (e) => errors.push(`${who} pageerror: ${e.message}`));
  // Refus attendus (connexion refusée, admin refusée, écriture refusée) : pas des erreurs de l'app.
  p.on("console", (m) => m.type() === "error" && !/401|403|Unauthorized|Forbidden/.test(m.text()) && errors.push(`${who}: ${m.text()}`));
};
const title = (p) => p.locator('textarea[aria-label="Titre de la page"]:visible');
const editor = (p) => p.locator(".page-editor .bn-editor:visible");
const bootstrap = async (ctx) => (await ctx.request.get(base + "/api/bootstrap")).json();

// L'enseignant crée son espace et une page de cours partagée
const ctxT = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const t = await ctxT.newPage();
watch(t, "prof");
await signUp(t, base, T, "Prof Test", "Classe test");
await t.getByRole("button", { name: "Ajouter une page dans Espace de travail" }).click();
await t.waitForURL("**/p/**?new=1");
const coursUrl = t.url().split("?")[0];
await editor(t).waitFor();
await title(t).fill("Cours 1");
await t.keyboard.press("Enter");
await t.keyboard.type("Lire le chapitre 3.");
await t.waitForTimeout(1500);

// L'étudiant crée son compte : il attend la validation, sans aucun accès
const ctxS = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const s = await ctxS.newPage();
watch(s, "eleve");
await createAccount(s, base, S, "Eli Lecteur");
check(s.url().endsWith("/attente") && (await shown(s.getByText(/Votre demande est envoyée/))), `inscription : page d'attente (${s.url().replace(base, "")})`);
const pending = await bootstrap(ctxS);
check(pending.workspace === null && pending.pages.length === 0 && pending.account.status === "pending", "en attente : aucun espace, aucune page");
await s.goto(base + "/home");
check(await s.waitForURL("**/attente").then(() => true, () => false), "en attente : l'app renvoie vers la page d'attente");

// L'enseignant voit la demande (pastille) et la valide en lecture seule
check(await shown(t.getByLabel("1 demande en attente"), 15000), "enseignant : pastille « 1 demande en attente »");
await t.getByRole("link", { name: /Membres/ }).click();
await t.waitForURL("**/admin");
await t.getByLabel("Rôle pour Eli Lecteur").selectOption("viewer");
await t.getByRole("button", { name: "Valider" }).click();
await t.getByText("Eli Lecteur a maintenant accès", { exact: true }).waitFor();

// La page d'attente s'ouvre d'elle-même sur l'espace de la classe
await s.waitForURL("**/home", { timeout: 20000 }).catch(() => {});
check(s.url().endsWith("/home"), `validé : la page d'attente mène à l'espace (${s.url().replace(base, "")})`);
check(await shown(s.getByRole("link", { name: "Cours 1" })), "étudiant : voit la page de cours partagée");
check(!(await s.getByRole("link", { name: /Membres/ }).isVisible()), "étudiant : pas de lien vers l'admin");

// Lecture seule : rien de modifiable sur la page de cours, ni à la racine de l'espace partagé
await s.goto(coursUrl);
await editor(s).waitFor();
check(await shown(s.getByText("Lecture seule")), "lecture seule : signalée sur la page");
check((await title(s).getAttribute("readonly")) !== null, "lecture seule : titre non modifiable");
check((await s.locator('.page-editor [contenteditable="true"]:visible').count()) === 0, "lecture seule : contenu non modifiable");
check(!(await s.getByRole("button", { name: "Ajouter une page dans Espace de travail" }).isVisible()), "lecture seule : pas de « + » dans l'espace partagé");
const ws = (await bootstrap(ctxS)).workspace.id;
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
await editor(s).getByText("Lire le chapitre 3.").click();
await s.keyboard.press("End");
await s.keyboard.type(" Fait par Eli.");
await s.waitForTimeout(2000);
await t.goto(coursUrl);
await editor(t).waitFor();
check(await shown(editor(t).getByText("Lire le chapitre 3. Fait par Eli.")), "édition : la modification de l'étudiant arrive chez l'enseignant");

// Mot de passe oublié : l'enseignant donne un mot de passe provisoire
await t.goto(base + "/admin");
await t.getByRole("button", { name: "Nouveau mot de passe pour Eli Lecteur" }).click();
await t.locator("[data-temp-password]").waitFor();
const temp = (await t.locator("[data-temp-password]").textContent())?.trim() ?? "";
check(/^[A-Za-z0-9]{10}$/.test(temp), "mot de passe provisoire affiché à l'enseignant");
check((await bootstrap(ctxS)).signedIn === false, "mot de passe provisoire : les sessions de l'étudiant sont fermées");
await logIn(s, base, S, PASSWORD);
check(await shown(s.getByText("E-mail ou mot de passe incorrect.")), "ancien mot de passe refusé");
await logIn(s, base, S, temp);
check(await s.waitForURL("**/home").then(() => true, () => false), "connexion avec le mot de passe provisoire");
// Il le remplace par le sien dans les réglages
const mine = "mon-nouveau-mdp";
await s.getByRole("button", { name: "Réglages" }).click();
await s.getByLabel("Mot de passe actuel").fill(temp);
await s.getByLabel("Nouveau mot de passe").fill(mine);
await s.getByRole("button", { name: "Changer le mot de passe" }).click();
check(await shown(s.getByText("Mot de passe changé", { exact: true })), "réglages : mot de passe changé");
await s.keyboard.press("Escape");
await ctxS.clearCookies();
await logIn(s, base, S, mine);
check(await s.waitForURL("**/home").then(() => true, () => false), "connexion avec le nouveau mot de passe");

// L'enseignant le retire : session fermée, plus de connexion possible
await t.reload();
await t.getByRole("button", { name: "Retirer" }).click();
await t.getByRole("button", { name: "Retirer Eli Lecteur" }).click();
await t.getByText("Membre retiré", { exact: true }).waitFor();
check((await bootstrap(ctxS)).signedIn === false, "retiré : sa session est fermée");
await logIn(s, base, S, mine);
check(await shown(s.getByText(/accès à l'espace a été retiré/)), "retiré : connexion refusée avec un message clair");

// Une demande refusée : le compte est supprimé
const ctxZ = await browser.newContext();
const z = await ctxZ.newPage();
watch(z, "zoe");
await createAccount(z, base, Z, "Zoé Refusée");
await t.reload();
await t.getByRole("button", { name: "Refuser la demande de Zoé Refusée" }).click();
await t.getByText("Demande refusée", { exact: true }).waitFor();
check((await bootstrap(ctxZ)).signedIn === false, "refusé : compte supprimé, session fermée");
await logIn(z, base, Z);
check(await shown(z.getByText("E-mail ou mot de passe incorrect.")), "refusé : ne peut plus se connecter");

// Adresse pré-autorisée : validée dès l'inscription
await t.getByLabel("Adresse e-mail", { exact: true }).filter({ visible: true }).fill(P);
await t.getByLabel("Prénom et nom (facultatif)").fill("Paul Prévu");
await t.getByLabel("Rôle", { exact: true }).selectOption("editor");
await t.getByRole("button", { name: "Ajouter", exact: true }).click();
await t.getByText(/Adresses pré-autorisées/).waitFor();
const ctxP = await browser.newContext();
const pp = await ctxP.newPage();
watch(pp, "paul");
await createAccount(pp, base, P, "Paul Prévu");
await pp.waitForURL("**/home", { timeout: 15000 }).catch(() => {});
check(pp.url().endsWith("/home"), `pré-autorisé : arrive directement dans l'espace (${pp.url().replace(base, "")})`);
check((await bootstrap(ctxP)).me?.access === "can_edit", "pré-autorisé : avec le rôle choisi (édition)");

console.log(`\nerreurs console : ${errors.length ? "\n" + errors.join("\n") : "aucune"}`);
console.log(fail ? `${fail} ECHEC(S)` : "TOUS LES CONTROLES PASSENT");
await browser.close();
process.exit(fail ? 1 : 0);
