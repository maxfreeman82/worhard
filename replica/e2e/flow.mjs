// Parcours de bout en bout sur la version locale. Capture les écrans pour replica-diff.
import { chromium } from 'playwright-core';
import { readCode } from './login.mjs';
const EMAIL = `awa+${Date.now()}@e2e.test`;
const out = process.argv[2];
const base = 'http://localhost:3123';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', msg); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

// F01 : connexion + onboarding
await page.goto(base);
await page.waitForURL('**/login');
await shot('S01');
await page.getByLabel('Adresse e-mail').fill(EMAIL);
await page.getByRole('button', { name: /Continuer avec/ }).click();
await page.getByLabel('Code de connexion').waitFor();
await page.getByLabel('Code de connexion').fill(await readCode(EMAIL));
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.waitForURL('**/onboarding');
await page.getByLabel('Prénom et nom').fill('Awa Diop');
await shot('S02');
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByLabel("Nom de l'espace").fill('Atelier Diop');
await page.getByRole('button', { name: "Créer l'espace" }).click();
await page.waitForURL('**/home');
check(await page.getByRole('heading', { name: /Awa/ }).filter({ visible: true }).isVisible(), 'F01 accueil avec le prénom');
await shot('S04-empty');

// S03 + S05 : ouvrir le guide depuis la sidebar
await page.getByRole('link', { name: 'Guide de démarrage' }).click();
await page.waitForURL('**/p/**');
await page.locator('.page-editor .bn-editor:visible').waitFor();
check(await page.getByText('Pour commencer').filter({ visible: true }).first().isVisible(), 'S05 contenu de départ affiché');
await page.waitForTimeout(400);
await shot('S05');

// F02 : nouvelle page, titre, texte, rechargement
await page.getByRole('button', { name: 'Ajouter une page dans Privé' }).click();
await page.waitForURL('**/p/**?new=1');
await page.locator('textarea[aria-label="Titre de la page"]:visible').fill('Plan de la semaine');
await page.keyboard.press('Enter');
await page.keyboard.type('Appeler le fournisseur de papier');
await page.keyboard.press('Enter');
// F03 : raccourci Markdown et menu « / »
await page.keyboard.type('[] Envoyer le devis');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.keyboard.type('/encad');
await page.waitForTimeout(300);
await shot('S06');
check(await page.getByText('Encadré', { exact: true }).first().isVisible(), 'S06 menu / filtré sur « encad »');
await page.keyboard.press('Enter');
await page.keyboard.type('Livraison prévue jeudi');
await page.waitForTimeout(900);
check(await page.getByText('Enregistré').filter({ visible: true }).first().isVisible(), 'enregistrement automatique');
const newUrl = page.url().split('?')[0];
await page.goto(newUrl);
await page.locator('.page-editor .bn-editor:visible').waitFor();
check(await page.getByText('Appeler le fournisseur de papier').filter({ visible: true }).first().isVisible(), 'F02 texte retrouvé après rechargement');
check(await page.locator('[data-content-type="checkListItem"]:visible').filter({ hasText: 'Envoyer le devis' }).count() === 1, 'F03 [] -> case à cocher');
check(await page.getByText('Livraison prévue jeudi').filter({ visible: true }).first().isVisible(), 'F03 encadré conservé');
check((await page.locator('textarea[aria-label="Titre de la page"]:visible').inputValue()) === 'Plan de la semaine', 'titre conservé');
check(await page.getByRole('link', { name: 'Plan de la semaine' }).first().isVisible(), 'S03 page visible dans la sidebar');

// Sous-page via « / page »
await page.locator('.page-editor .bn-editor:visible').click();
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
await page.keyboard.type('/page');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForURL('**/p/**?new=1');
await page.locator('textarea[aria-label="Titre de la page"]:visible').fill('Fournisseurs');
await page.waitForTimeout(500);
check(await page.getByRole('navigation', { name: "Fil d'Ariane" }).filter({ visible: true }).getByText('Plan de la semaine').isVisible(), 'sous-page : fil d\'Ariane');

// F06 : recherche Ctrl+K
await page.keyboard.press('Control+k');
await page.getByLabel('Rechercher une page').fill('fournisseur papier');
await page.waitForTimeout(200);
await shot('S09');
check(await page.getByRole('option').filter({ hasText: 'Plan de la semaine' }).count() === 1, 'F06 recherche dans le contenu (sans accents, plusieurs mots)');
await page.keyboard.press('Enter');
await page.waitForURL(newUrl);
check(true, 'F06 Entrée ouvre le résultat');

// Favoris
await page.getByRole('button', { name: 'Ajouter aux favoris' }).filter({ visible: true }).click();
check(await page.getByRole('heading', { name: 'Favoris' }).isVisible(), 'favoris : section affichée');

// F13 : corbeille et restauration
await page.getByRole('button', { name: 'Options de la page' }).filter({ visible: true }).click();
await page.getByRole('menuitem', { name: 'Supprimer' }).click();
check(await page.getByText('Cette page est dans la corbeille.').filter({ visible: true }).isVisible(), 'page à la corbeille : bandeau');
check(await page.getByRole('link', { name: 'Plan de la semaine' }).count() === 0, 'corbeille : retirée de la sidebar et des favoris');
await page.getByRole('button', { name: 'Corbeille' }).click();
await page.waitForTimeout(200);
await shot('S14');
check(await page.getByRole('dialog').getByText('Plan de la semaine').isVisible(), 'S14 listée dans la corbeille');
await page.getByRole('dialog').getByRole('button', { name: 'Restaurer' }).click();
await page.keyboard.press('Escape');
check(await page.getByRole('link', { name: 'Plan de la semaine' }).first().isVisible(), 'F13 restaurée dans la sidebar');

// Accueil rempli, modèles, réglages
await page.getByRole('link', { name: 'Accueil' }).click();
await page.waitForURL('**/home');
await shot('S04');
await page.getByRole('button', { name: 'Modèles' }).click();
await page.waitForTimeout(200);
await shot('S15');
await page.getByRole('button', { name: 'Utiliser ce modèle' }).click();
await page.waitForURL('**/p/**');
check((await page.locator('textarea[aria-label="Titre de la page"]:visible').inputValue()) === 'Compte rendu de réunion', 'S15 page créée depuis un modèle');
await page.getByRole('button', { name: 'Réglages' }).click();
// Le thème est enregistré sur le serveur : on attend la réponse avant de recharger.
await Promise.all([page.waitForResponse((r) => r.url().includes('/api/sync') && r.ok() && (r.request().postData() ?? '').includes('"theme":"dark"')), page.getByText('Sombre', { exact: true }).click()]);
check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'S30 thème sombre appliqué');
await shot('S30');
await page.keyboard.press('Escape');
await page.goto(newUrl);
await page.locator('.page-editor .bn-editor:visible').waitFor();
await page.waitForTimeout(300);
await shot('S05-dark');
check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'thème conservé après rechargement');

// Page introuvable
await page.goto(base + '/p/00000000-0000-0000-0000-000000000000');
await page.getByText('Page introuvable').filter({ visible: true }).waitFor({ timeout: 10000 }).catch(() => {});
check(await page.getByText('Page introuvable').filter({ visible: true }).isVisible(), 'page introuvable : état dédié');

// Mobile 390 px : pas de débordement, tiroir
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 844 });
m.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await m.goto(newUrl);
await m.locator('.page-editor .bn-editor:visible').waitFor();
await m.waitForTimeout(300);
const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(ov <= 0, `mobile : pas de débordement horizontal (${ov}px)`);
await m.screenshot({ path: `${out}/S05-mobile.png` });
await m.getByRole('button', { name: 'Ouvrir le menu' }).filter({ visible: true }).click();
await m.waitForTimeout(300);
check(await m.getByRole('link', { name: 'Guide de démarrage' }).isVisible(), 'mobile : tiroir ouvert');
await m.screenshot({ path: `${out}/S03-mobile.png` });

console.log('\nerreurs console :', errors.length ? '\n  ' + errors.join('\n  ') : 'aucune');
console.log(fail ? `${fail} ECHEC(S)` : 'TOUS LES CONTROLES PASSENT');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
