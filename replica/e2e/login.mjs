// Connexion de test par e-mail et mot de passe (aucun e-mail n'est envoyé).
// Les adresses @e2e.test sont « enseignant » (ADMIN_EMAILS du serveur de test) : validées d'office, elles créent leur espace.

export const PASSWORD = "motdepasse-de-test";

/** Bouton d'envoi du formulaire (« Se connecter » existe aussi comme bascule au-dessus du formulaire). */
const submit = (page, name) => page.locator("form").getByRole("button", { name });

/** Crée un compte depuis la page de connexion. Renvoie quand la page suivante (attente, onboarding…) est affichée. */
export async function createAccount(page, base, email, name, password = PASSWORD) {
  await page.goto(base + "/login");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Prénom et nom", { exact: true }).filter({ visible: true }).fill(name);
  await page.getByLabel("Adresse e-mail", { exact: true }).filter({ visible: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).filter({ visible: true }).fill(password);
  await submit(page, "Créer mon compte").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Se connecte. Ne vérifie pas la page d'arrivée (un refus laisse sur /login avec un message). */
export async function logIn(page, base, email, password = PASSWORD) {
  await page.goto(base + "/login");
  await page.getByLabel("Adresse e-mail", { exact: true }).filter({ visible: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).filter({ visible: true }).fill(password);
  await submit(page, "Se connecter").click();
}

/** Inscription complète d'un enseignant : compte, prénom, espace. Renvoie quand l'accueil est affiché. */
export async function signUp(page, base, email, name, workspace) {
  await createAccount(page, base, email, name);
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Prénom et nom", { exact: true }).filter({ visible: true }).fill(name);
  await page.getByRole("button", { name: "Continuer" }).click();
  if (workspace) await page.getByLabel("Nom de l'espace").fill(workspace);
  await page.getByRole("button", { name: "Créer l'espace" }).click();
  await page.waitForURL("**/home");
}
