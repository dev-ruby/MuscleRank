import { readFile } from 'node:fs/promises';
import { validateCatalog } from '../dist/rank-engine.mjs';
const catalog = validateCatalog(JSON.parse(await readFile(new URL('../dist/data/catalog.json', import.meta.url), 'utf8')));
const locales = JSON.parse(await readFile(new URL('../dist/data/locales.json', import.meta.url), 'utf8'));
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
const keys = new Set([...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g), ...app.matchAll(/\bt\('([^']+)'/g)].map(match => match[1]));
for (const key of new Set([...keys,...Object.keys(locales.ko),...Object.keys(locales.en)])) {
  for (const language of ['ko','en']) if (typeof locales[language][key] !== 'string') throw new Error(`Missing ${language}.${key}`);
  const placeholders = lang => [...locales[lang][key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');
  if (placeholders('ko') !== placeholders('en')) throw new Error(`Placeholder mismatch: ${key}`);
}
const model = await readFile(new URL('../dist/body-model.js', import.meta.url), 'utf8');
const body = JSON.parse(model.split('window.BODY_MODEL = ')[1].trim().replace(/;$/, ''));
const parts = new Set([...body.front.parts,...body.back.parts].map(part=>part.slug));
for (const muscle of catalog.muscles) for (const part of muscle.parts) if (!parts.has(part)) throw new Error(`Unknown body path ${part}`);
for (const exercise of catalog.exercises) if (exercise.artwork) await readFile(new URL('../dist/'+exercise.artwork.src, import.meta.url));
console.log(`Valid: ${catalog.exercises.length} exercises, ${catalog.muscles.length} muscles, ${keys.size} UI translation keys.`);
