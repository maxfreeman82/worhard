// Connexion de test : demande un code, le lit dans la sortie du serveur (sans RESEND_API_KEY, l'e-mail y est écrit),
// puis le saisit. SERVER_LOG = chemin du fichier où `next start` écrit sa sortie.
import fs from "node:fs";

export async function readCode(email, timeoutMs = 15000) {
  const log = process.env.SERVER_LOG;
  if (!log) throw new Error("SERVER_LOG non défini");
  const re = new RegExp(`à ${email.replace(/[.+]/g, "\\$&")} — Votre code de connexion : (\\d{6})`, "g");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const matches = [...fs.readFileSync(log, "utf8").matchAll(re)];
    if (matches.length) return matches.at(-1)[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Aucun code trouvé pour ${email}`);
}

/** Inscription complète : e-mail, code, prénom, espace. Renvoie quand l'accueil est affiché. */
export async function signUp(page, base, email, name, workspace) {
  await page.goto(base + "/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: /Continuer avec/ }).click();
  await page.getByLabel("Code de connexion").waitFor();
  await page.getByLabel("Code de connexion").fill(await readCode(email));
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Prénom et nom").fill(name);
  await page.getByRole("button", { name: "Continuer" }).click();
  if (workspace) await page.getByLabel("Nom de l'espace").fill(workspace);
  await page.getByRole("button", { name: "Créer l'espace" }).click();
  await page.waitForURL("**/home");
}
