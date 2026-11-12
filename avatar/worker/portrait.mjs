// Portrait job settings and the render step shared by worker.mjs and golden.mjs (avatar/docs/WORKER.md).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Must equal RENDERER_VERSION in website/lib/portrait-render-mode.ts. Bump both whenever the PNG for
 * the same recipe changes (golden.mjs --update tells you): it is part of the v3 fingerprint.
 */
export const RENDERER_VERSION = 1;

/** Contract portrait settings: front camera, Wine portrait size, select stance, no glow. */
export const PORTRAIT = Object.freeze({ preset: 'front', width: 768, height: 925, pose: 'stance', glow: false, ssaa: 3 });
const PRESETS = ['front', 'select', 'bust', 'face'];

export const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** Accept a recipe or `resolve.py --json` output ({name: recipe}); throw when it cannot be drawn. */
export function normalizeRecipe(recipe) {
  if (typeof recipe === 'string') recipe = JSON.parse(recipe);
  if (!recipe || typeof recipe !== 'object') throw new Error('job has no recipe');
  if (!('skeleton' in recipe)) {
    const [k, v] = Object.entries(recipe)[0] || [];
    if (v && typeof v === 'object' && 'skeleton' in v) recipe = { name: k, ...v };
  }
  if (!recipe.skeleton?.nif) throw new Error('recipe has no skeleton');
  if (!recipe.parts || typeof recipe.parts !== 'object') throw new Error('recipe has no parts');
  return recipe;
}

/** The recipe reduced to what changes pixels (same fields as the website's v3 canonical recipe). */
export function canonicalRecipe(recipe) {
  const r = normalizeRecipe(recipe);
  const parts = {};
  for (const folder of Object.keys(r.parts).sort()) {
    const p = r.parts[folder];
    if (p?.file && p.exists) parts[folder] = { file: p.file, exists: true };
  }
  const { nif, scale, stance, idle } = r.skeleton;
  return { gender: r.gender, skeleton: { nif, scale, stance: stance ?? null, idle }, parts,
    colors: { hair: r.colors?.hair, eyeRight: r.colors?.eyeRight, eyeLeft: r.colors?.eyeLeft } };
}

/** Job fields → render parameters (contract defaults for anything the job leaves out). */
export function jobParams(job = {}, ssaa = PORTRAIT.ssaa) {
  const preset = job.preset ?? PORTRAIT.preset;
  if (!PRESETS.includes(preset)) throw new Error(`unknown preset ${preset}`);
  const width = job.width ?? PORTRAIT.width, height = job.height ?? PORTRAIT.height;
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 2048 && height <= 2048))
    throw new Error(`bad size ${width}x${height}`);
  if (!(Number.isInteger(ssaa) && ssaa >= 1 && ssaa <= 4)) throw new Error(`bad ssaa ${ssaa}`);
  return { preset, width, height, pose: PORTRAIT.pose, glow: PORTRAIT.glow, ssaa };
}

/**
 * Render one portrait. Any asset the page asked for and did not get (stale or partial conversion)
 * fails the job instead of caching a portrait with a missing part.
 * @returns {Promise<{png: Buffer, sha256: string, ms: number, result: object, params: object}>}
 */
export async function renderPortrait(renderer, recipe, job = {}, ssaa = PORTRAIT.ssaa) {
  const params = jobParams(job, ssaa);
  const { png, result, ms, misses } = await renderer.render({ recipe: normalizeRecipe(recipe), ...params });
  if (misses.length) {
    const list = [...new Set(misses)];
    throw new Error(`missing assets (${list.length}): ${list.slice(0, 4).join(', ')}${list.length > 4 ? ', …' : ''}`);
  }
  return { png, sha256: sha256(png), ms, result, params };
}

/** Short description of the converted assets for heartbeats: `fmt1/catalog1/parts6114`. Cached by mtime. */
let assetsCache = null;
export function assetsVersion(assetsDir) {
  const mf = path.join(assetsDir, 'manifest.json'), cf = path.join(assetsDir, 'catalog.json');
  const stamp = [mf, cf].map(f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }).join(':');
  if (assetsCache?.stamp === stamp && assetsCache.dir === assetsDir) return assetsCache.value;
  let value = null;
  try {
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    let c = null;
    try { c = JSON.parse(fs.readFileSync(cf, 'utf8')).version; } catch { /* catalog optional */ }
    value = `fmt${m.version}/catalog${c ?? '-'}/parts${m.counts?.parts ?? '?'}`;
  } catch { /* no manifest */ }
  assetsCache = { dir: assetsDir, stamp, value };
  return value;
}
