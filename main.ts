// Hands the entry in: copies app/ and screenshots/ to the output directory and writes dossier.json with the
// vendored make.fun library. Node 22, standard library only, no network; two runs write the same bytes.
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(out, { recursive: true });
for (const dir of ['app', 'screenshots']) cpSync(join(repo, dir), join(out, dir), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`dossier.json ${dossier.length} bytes; screenshots: ${readdirSync(join(out, 'screenshots')).join(', ')}`);
