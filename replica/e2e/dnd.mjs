// Glisser-déposer dans la sidebar : ranger une page dans une autre, puis interdiction des boucles.
import { chromium } from 'playwright-core';
const base = 'http://localhost:3123';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', msg); };

await page.goto(base + '/login');
await page.getByLabel('Adresse e-mail').fill('dnd@exemple.fr');
await page.getByRole('button', { name: /Continuer avec/ }).click();
await page.getByLabel('Code de connexion').fill('111111');
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.waitForURL('**/onboarding');
await page.getByLabel('Prénom et nom').fill('Test');
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByRole('button', { name: "Créer l'espace" }).click();
await page.waitForURL('**/home');

const sidebar = page.getByRole('complementary', { name: 'Barre latérale' });
const row = (name) => sidebar.getByRole('link', { name, exact: true }).locator('..');

// « Notes personnelles » (Privé) déposée au milieu de « Projets » (Espace de travail) -> devient sa sous-page.
await row('Notes personnelles').dragTo(row('Projets'));
await page.waitForTimeout(300);
check(await sidebar.getByRole('link', { name: 'Notes personnelles', exact: true }).count() === 1, 'la page reste visible (Projets déplié)');
await sidebar.getByRole('link', { name: 'Notes personnelles', exact: true }).click();
await page.waitForURL('**/p/**');
check(await page.getByRole('navigation', { name: "Fil d'Ariane" }).filter({ visible: true }).getByText('Projets').isVisible(), 'rangée dans Projets (fil d\'Ariane)');

// Boucle : « Projets » déposée dans sa propre sous-page -> refusée avec un message.
await row('Projets').dragTo(row('Notes personnelles'));
await page.waitForTimeout(300);
check(await page.getByText(/Impossible de déplacer une page dans une de ses sous-pages/).first().isVisible(), 'boucle refusée avec un message');

// Clavier seul : « Déplacer vers… » depuis le menu ⋯ de la sidebar.
await row('Tâches de la semaine').hover();
await sidebar.getByRole('button', { name: 'Actions pour Tâches de la semaine' }).click();
await page.getByRole('menuitem', { name: 'Déplacer vers…' }).click();
await page.getByRole('dialog').getByRole('button', { name: /Guide de démarrage/ }).click();
await page.waitForTimeout(300);
check(await page.getByText('Page déplacée').first().isVisible(), 'Déplacer vers… : déplacée');

console.log('erreurs :', errors.length ? errors.join(' | ') : 'aucune');
console.log(fail ? `${fail} ECHEC(S)` : 'TOUS LES CONTROLES PASSENT');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
