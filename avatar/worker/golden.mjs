#!/usr/bin/env node
// Golden test for the render worker: renders the fixed recipes in golden.json at the contract's
// portrait settings (front, 768×925, stance, glow off, ssaa 3) in one persistent page and compares
// the PNG SHA-256s. Hashes are per Chrome build (golden.json records it); no images are committed.
//
//   node avatar/worker/golden.mjs                     # compare; exit 1 on any mismatch
//   node avatar/worker/golden.mjs --update            # re-import recipes from avatar/build/recipes, rewrite hashes
//   node avatar/worker/golden.mjs --out DIR           # also write the PNGs (for eyeballing; do not commit)
//   [--assets DIR] [--recipes DIR] [--names cat,catm,cat3]
//
// The recipes are stored in golden.json in canonical form (skeleton, existing parts, colours: what
// changes pixels), so the test also runs where there is no world DB (the container). `--update` takes
// them from avatar/build/recipes/<name>.json; regenerate those with `python3 avatar/tools/recipe.py cat catm cat3`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AvatarRenderer } from '../viewer/renderCore.mjs';
import { RENDERER_VERSION, PORTRAIT, canonicalRecipe, renderPortrait } from './portrait.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AVATAR = path.resolve(HERE, '..');
const GOLDEN = path.join(HERE, 'golden.json');

const o = { update: false, out: null, assets: process.env.AVATAR_ASSETS_DIR || path.join(AVATAR, 'build/assets'),
  recipes: path.join(AVATAR, 'build/recipes'), names: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--update') o.update = true;
  else if (['--out', '--assets', '--recipes', '--names'].includes(a) && argv[i + 1] !== undefined) o[a.slice(2)] = argv[++i];
  else { console.error(`golden: unknown option ${a}\nusage: node avatar/worker/golden.mjs [--update] [--out DIR] [--assets DIR] [--recipes DIR] [--names a,b]`); process.exit(2); }
}

const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : { cases: {} };
const names = o.names ? o.names.split(',') : Object.keys(golden.cases).length ? Object.keys(golden.cases) : ['cat', 'catm', 'cat3'];
const settings = { ...PORTRAIT };

const cases = {};
for (const n of names) {
  if (o.update) {
    const f = path.join(o.recipes, `${n}.json`);
    if (!fs.existsSync(f)) { console.error(`golden: no ${f}; run python3 avatar/tools/recipe.py ${names.join(' ')}`); process.exit(2); }
    cases[n] = { recipe: canonicalRecipe(JSON.parse(fs.readFileSync(f, 'utf8'))), sha256: null };
  } else {
    if (!golden.cases[n]) { console.error(`golden: ${n} is not in golden.json (use --update)`); process.exit(2); }
    cases[n] = { ...golden.cases[n] };
  }
}

const renderer = new AvatarRenderer({ assets: o.assets, timeoutMs: 120000 });
let failed = 0;
try {
  await renderer.start();
  const chrome = renderer.chromeName;
  if (!o.update && golden.chrome && golden.chrome !== chrome)
    console.warn(`golden: hashes were recorded with ${golden.chrome}; this is ${chrome} (mismatches expected)`);
  if (o.out) fs.mkdirSync(o.out, { recursive: true });
  // every case, then the first one again: the persistent page must not change later images
  const order = [...names, names[0]];
  const got = {};
  let gl = null;
  for (const [i, n] of order.entries()) {
    const r = await renderPortrait(renderer, cases[n].recipe, settings, settings.ssaa);
    if (i === order.length - 1) {
      const same = r.sha256 === got[n];
      if (!same) failed++;
      console.log(`${same ? 'ok  ' : 'FAIL'} ${n} (re-render in the same page) ${r.sha256.slice(0, 16)} ${Math.round(r.ms)} ms`);
      continue;
    }
    got[n] = r.sha256;
    if (o.out) fs.writeFileSync(path.join(o.out, `${n}.png`), r.png);
    const want = golden.cases[n]?.sha256;
    const status = o.update ? (want === r.sha256 ? 'same' : want ? 'NEW ' : 'new ') : want === r.sha256 ? 'ok  ' : 'FAIL';
    if (!o.update && want !== r.sha256) failed++;
    console.log(`${status} ${n} ${r.sha256}${!o.update && want !== r.sha256 ? ` (want ${want})` : ''} ${Math.round(r.ms)} ms`
      + (r.result.warnings.length ? ` [${r.result.warnings.length} warning(s)]` : ''));
    cases[n].sha256 = r.sha256;
    gl = r.result.gl;
  }
  if (o.update) {
    const changed = names.filter(n => golden.cases[n]?.sha256 && golden.cases[n].sha256 !== cases[n].sha256);
    const sameChrome = golden.chrome === chrome;
    const out = { note: 'Render worker golden hashes (avatar/worker/golden.mjs). Per Chrome build; recipes in canonical form, no images.',
      rendererVersion: RENDERER_VERSION, chrome, playwright: renderer.pw.version, three: '0.170.0', gl, settings,
      updated: new Date().toISOString().slice(0, 10), cases };
    fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 1) + '\n');
    console.log(`golden: wrote ${path.relative(process.cwd(), GOLDEN)} (${chrome})`);
    if (changed.length && sameChrome && golden.rendererVersion === RENDERER_VERSION)
      console.warn(`golden: ${changed.join(', ')} changed on the same Chrome build: if the renderer changed, bump RENDERER_VERSION `
        + 'in avatar/worker/portrait.mjs and website/lib/portrait-render-mode.ts');
  }
} finally {
  await renderer.close();
}
if (failed) { console.error(`golden: ${failed} mismatch(es)`); process.exit(1); }
