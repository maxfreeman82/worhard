import { chromium } from 'playwright-core';
const out = process.argv[2];
const url = 'http://localhost:3123/design';
const browser = await chromium.launch({ channel: 'chrome' });

// Mobile : vraie émulation 390 px, et mesure du débordement horizontal.
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await m.goto(url);
const overflow = await m.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
console.log('mobile scrollWidth', overflow.scroll, 'clientWidth', overflow.client);
const wide = await m.evaluate(() =>
  [...document.querySelectorAll('body *')]
    .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
    .slice(0, 8)
    .map((e) => e.tagName + '.' + String(e.className).slice(0, 60) + ' right=' + Math.round(e.getBoundingClientRect().right)));
console.log(wide.join('\n'));
await m.screenshot({ path: `${out}/design-mobile.png`, fullPage: true });

// États ouverts : menu avec sous-menu, puis modale, clavier uniquement.
const d = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto(url);
await d.getByRole('button', { name: 'Ouvrir le menu' }).focus();
await d.keyboard.press('Enter');
await d.getByRole('menuitem', { name: 'Couleur' }).hover();
await d.waitForTimeout(300);
await d.screenshot({ path: `${out}/design-menu.png` });
await d.keyboard.press('Escape');
await d.keyboard.press('Escape');
await d.getByRole('button', { name: 'Modale' }).click();
await d.waitForTimeout(200);
await d.screenshot({ path: `${out}/design-modal.png` });
const focused = await d.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName);
console.log('focus dans la modale :', focused);
await browser.close();
