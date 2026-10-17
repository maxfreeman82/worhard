// Bases de données de bout en bout : tableau, cellules, filtre, tri, Kanban, calendrier, aperçu, base en ligne.
// node replica/e2e/db.mjs <dossier des captures>   (serveur sur http://localhost:3123)
import { chromium } from 'playwright-core';
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
const V = (l) => l.filter({ visible: true });
const db = () => page.locator('[data-db-view]:visible').first();
const bodyRows = () => db().locator('[role="rowgroup"] [role="row"]');

await page.goto(base + '/login');
await page.getByLabel('Adresse e-mail').fill('bdd@exemple.fr');
await page.getByRole('button', { name: /Continuer avec/ }).click();
await page.getByLabel('Code de connexion').fill('222222');
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.waitForURL('**/onboarding');
await page.getByLabel('Prénom et nom').fill('Awa Diop');
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByRole('button', { name: "Créer l'espace" }).click();
await page.waitForURL('**/home');

// Ouvrir la base d'exemple par la recherche
await page.keyboard.press('Control+k');
await page.getByLabel('Rechercher une page').fill('suivi des taches');
await page.keyboard.press('Enter');
await page.waitForURL('**/p/**');
await db().waitFor();
check((await bodyRows().count()) === 5, `S16 tableau : 5 lignes d'exemple (${await bodyRows().count()})`);
check(await V(page.getByText('TÂCHE-1')).first().isVisible(), 'ID unique avec préfixe');
await page.waitForTimeout(300);
await shot('S16');

// Nouvelle ligne + titre + statut
await V(page.getByRole('button', { name: 'Nouveau', exact: true })).click();
await page.waitForTimeout(200);
check((await bodyRows().count()) === 6, 'Nouveau : ligne ajoutée');
const last = bodyRows().last();
await last.getByRole('button', { name: 'Modifier Tâche' }).click();
await page.keyboard.type('Commander les cartes de visite');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check(await last.getByText('Commander les cartes de visite').isVisible(), 'cellule titre éditée');
await last.getByRole('button', { name: 'Modifier Statut' }).click();
await page.getByRole('option', { name: /En cours/ }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check(await last.getByText('En cours').isVisible(), 'cellule statut choisie');
await last.getByRole('button', { name: 'Modifier Étiquettes' }).click();
await page.keyboard.type('Impression');
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check(await last.getByText('Impression').isVisible(), 'sélection multiple : option créée à la volée');

// Filtre Statut = En cours
await V(page.getByRole('button', { name: 'Filtrer' })).click();
await page.getByRole('button', { name: 'Ajouter un filtre' }).click();
const dialog = page.locator('[data-radix-popper-content-wrapper]').last();
await dialog.getByLabel('Propriété').selectOption({ label: 'Statut' });
await dialog.getByLabel('Valeur').selectOption({ label: 'En cours' });
await page.waitForTimeout(200);
await shot('S23-filtre');
await page.keyboard.press('Escape');
check((await bodyRows().count()) === 3, `filtre Statut = En cours : 3 lignes (${await bodyRows().count()})`);
check(await V(page.getByRole('button', { name: 'Filtres (1)' })).isVisible(), 'compteur de filtres');

// Nouvelle ligne avec le filtre actif : préremplie pour rester visible
await V(page.getByRole('button', { name: 'Nouveau', exact: true })).click();
await page.waitForTimeout(200);
check((await bodyRows().count()) === 4, 'ligne créée sous filtre : reste visible (statut prérempli)');

// Retirer le filtre, trier par échéance décroissante
await V(page.getByRole('button', { name: 'Filtres (1)' })).click();
await page.getByRole('button', { name: 'Retirer' }).first().click();
await page.keyboard.press('Escape');
await V(page.getByRole('button', { name: 'Trier' })).click();
await page.getByRole('button', { name: 'Ajouter un tri' }).click();
const sp = page.locator('[data-radix-popper-content-wrapper]').last();
await sp.getByLabel('Propriété').selectOption({ label: 'Échéance' });
await sp.getByLabel('Sens').selectOption({ label: 'Décroissant' });
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const firstTitle = await bodyRows().first().locator('[role="cell"]').first().innerText();
check(firstTitle.includes("Mettre à jour le guide"), `tri Échéance décroissant : la plus lointaine en premier (${firstTitle.trim().split('\n')[0]})`);

// Nouvelle propriété Nombre + calcul de somme
await V(page.getByRole('button', { name: 'Ajouter une propriété' })).click();
await page.getByRole('button', { name: 'Nombre', exact: true }).click();
await page.waitForTimeout(200);
const r0 = bodyRows().nth(0);
const r1 = bodyRows().nth(1);
await r0.getByRole('button', { name: 'Modifier Nombre' }).click();
await page.keyboard.type('12');
await page.keyboard.press('Enter');
await r1.getByRole('button', { name: 'Modifier Nombre' }).click();
await page.keyboard.type('30');
await page.keyboard.press('Enter');
await V(page.getByRole('button', { name: 'Calcul pour Nombre' })).click();
await page.getByRole('menuitem', { name: 'Somme' }).click();
await page.waitForTimeout(150);
check(await V(page.getByRole('button', { name: 'Calcul pour Nombre' })).innerText().then((t) => t.includes('42')), 'calcul : somme = 42');

// Aperçu latéral d'une ligne
await bodyRows().first().hover();
await bodyRows().first().getByRole('button', { name: 'Ouvrir', exact: true }).click();
const peek = page.getByRole('dialog');
await peek.waitFor();
check(await peek.getByRole('group', { name: 'Propriétés' }).isVisible(), 'S26 aperçu : propriétés affichées');
await page.waitForTimeout(400);
await shot('S26');
await page.keyboard.press('Escape');

// Kanban : déplacer une carte d'« À faire » vers « Terminé »
await V(page.getByRole('tab', { name: /Par statut/ })).click();
await page.waitForTimeout(200);
const todo = page.getByRole('region', { name: 'Colonne À faire' });
const done = page.getByRole('region', { name: 'Colonne Terminé' });
const before = await done.getByRole('button').filter({ hasText: 'Tester le site sur mobile' }).count();
await shot('S17');
await todo.getByText('Tester le site sur mobile').dragTo(done);
await page.waitForTimeout(250);
const after = await done.getByText('Tester le site sur mobile').count();
check(before === 0 && after === 1, 'S17 Kanban : carte déplacée change le statut');

// Calendrier
await V(page.getByRole('tab', { name: /Calendrier/ })).click();
await page.waitForTimeout(200);
const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
check(await V(page.getByRole('heading', { name: new RegExp(month, 'i') })).isVisible(), `S20 calendrier : ${month}`);
check(await V(page.getByRole('button', { name: /Rédiger la page/ })).count() >= 1, 'S20 tâches placées à leur date');
await shot('S20');

// Nouvelles vues : galerie et liste
await V(page.getByRole('button', { name: 'Ajouter une vue' })).click();
await page.getByRole('menuitem', { name: 'Galerie' }).click();
await page.waitForTimeout(250);
check(await V(page.getByRole('tab', { name: /Galerie/ })).getAttribute('aria-selected') === 'true', 'S19 vue galerie créée');
await shot('S19');
await V(page.getByRole('button', { name: 'Ajouter une vue' })).click();
await page.getByRole('menuitem', { name: 'Liste' }).click();
await page.waitForTimeout(250);
check(await V(page.getByRole('tab', { name: /Liste/ })).getAttribute('aria-selected') === 'true', 'S18 vue liste créée');

// Base de données en ligne depuis « / »
await page.getByRole('button', { name: 'Ajouter une page dans Privé' }).click();
await page.waitForURL('**/p/**?new=1');
await page.locator('textarea[aria-label="Titre de la page"]:visible').fill('Réunion client');
await page.keyboard.press('Enter');
await page.keyboard.type('/base de donnees en');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check(await db().isVisible(), 'base en ligne insérée dans la page');
check((await bodyRows().count()) === 3, 'base en ligne : 3 lignes vides de départ');
await db().getByLabel('Titre de la base de données').fill('Actions');
await page.waitForTimeout(800);
await shot('S05-base-en-ligne');
await page.reload();
await db().waitFor();
check((await db().getByLabel('Titre de la base de données').inputValue()) === 'Actions', 'base en ligne conservée après rechargement');

// Mobile : le tableau défile dans son cadre, pas la page
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 844 });
m.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await m.goto(page.url());
await m.locator('[data-db-view]:visible').first().waitFor();
await m.waitForTimeout(300);
const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(ov <= 0, `mobile : pas de débordement de page (${ov}px)`);
await m.screenshot({ path: `${out}/S16-mobile.png` });

console.log('\nerreurs console :', errors.length ? '\n  ' + errors.join('\n  ') : 'aucune');
console.log(fail ? `${fail} ECHEC(S)` : 'TOUS LES CONTROLES PASSENT');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
