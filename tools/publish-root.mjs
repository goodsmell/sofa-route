import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
const root = new URL('../', import.meta.url);
const previous = await readdir(new URL('assets/', root)).catch(() => []);
for (const name of previous) await rm(new URL(`assets/${name}`, root));
await cp(new URL('assets/', output), new URL('assets/', root), { recursive: true });
for (const name of ['index.html', 'sw.js', 'manifest.webmanifest']) {
  const bytes = await readFile(new URL(name, output));
  await writeFile(new URL(name, root), bytes);
}
console.log('GitHub Pages root updated from React build');
