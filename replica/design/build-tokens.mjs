// Génère les variables CSS à partir de tokens.json.
//   node replica/design/build-tokens.mjs
// Écrit replica/design/tokens.css et src/styles/tokens.css (identiques).
// Thème : clair par défaut, sombre si le système l'est, forcé par <html data-theme="light|dark">.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const t = JSON.parse(fs.readFileSync(path.join(here, 'tokens.json'), 'utf8'));

const colorVars = (scheme) =>
  Object.entries(t.color[scheme]).map(([k, v]) => `  --${k}: ${v};`).join('\n');

const px = (n) => `${n}px`;
const lines = [];
lines.push('/* Généré par replica/design/build-tokens.mjs à partir de tokens.json. Ne pas modifier à la main. */');
lines.push('');
lines.push(':root {');
lines.push(colorVars('light'));
lines.push(`  --sh-pop: ${t.shadow.pop};`);
lines.push(`  --sh-modal: ${t.shadow.modal};`);
lines.push(`  --sh-card: ${t.shadow.card};`);
lines.push(`  --ff-sans: ${t.font.sans};`);
lines.push(`  --ff-serif: ${t.font.serif};`);
lines.push(`  --ff-mono: ${t.font.mono};`);
for (const [k, v] of Object.entries(t.type)) {
  if (k.startsWith('_')) continue;
  lines.push(`  --fs-${k}: ${px(v.size)};`);
  lines.push(`  --lh-${k}: ${px(v.line)};`);
  lines.push(`  --fw-${k}: ${v.weight};`);
}
for (const [k, v] of Object.entries(t.radius)) lines.push(`  --r-${k}: ${px(v)};`);
for (const [k, v] of Object.entries(t.motion)) lines.push(`  --motion-${k}: ${v};`);
for (const [k, v] of Object.entries(t.layout)) {
  if (typeof v === 'object') continue;
  lines.push(`  --${k}: ${typeof v === 'number' ? px(v) : v};`);
}
lines.push('  color-scheme: light;');
lines.push('}');
lines.push('');
const dark = [colorVars('dark'), `  --sh-pop: ${t.shadow['dark-pop']};`, `  --sh-modal: ${t.shadow['dark-pop']};`, '  color-scheme: dark;'].join('\n');
lines.push('@media (prefers-color-scheme: dark) {');
lines.push('  :root:not([data-theme="light"]) {');
lines.push(dark.replace(/^/gm, '  '));
lines.push('  }');
lines.push('}');
lines.push('');
lines.push(':root[data-theme="dark"] {');
lines.push(dark);
lines.push('}');
lines.push('');

const css = lines.join('\n');
fs.writeFileSync(path.join(here, 'tokens.css'), css);
fs.mkdirSync(path.join(root, 'src/styles'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/styles/tokens.css'), css);
console.log('tokens.css écrit (%d variables)', (css.match(/--[\w-]+:/g) || []).length);
