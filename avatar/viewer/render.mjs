#!/usr/bin/env node
// Deterministic headless avatar render: recipe JSON → PNG, through the same buildScene() as the viewer,
// in chrome-headless-shell (SwiftShader WebGL2, no GPU), driven by playwright-core.
//
//   node avatar/viewer/render.mjs <recipe.json> <out.png> [--preset front|select|bust|face]
//        [--w 768 --h 925 (front; 576×768 otherwise)] [--ssaa 3] [--pose stance|idle] [--glow on|off] [--bg '#27202e']
//        [--assets avatar/build/assets] [--times N]
//
// Antialias off; the scene is drawn once at (w·ssaa)×(h·ssaa) into a render target after every
// texture is uploaded and compileAsync() resolved, read back with readPixels and box-filtered in JS.
// Same inputs + same Chromium/SwiftShader + same three.js → byte-identical PNG.
//
// Browser, server and PNG encoder live in renderCore.mjs (shared with avatar/worker/).
// Dependencies are found locally (nothing is downloaded); override with environment variables:
//   PLAYWRIGHT_CORE  directory of a playwright-core package
//   CHROME           chrome-headless-shell (or chromium) executable
//   THREE_DIR        directory of the three@0.170.0 package (served at /vendor/three/)
import fs from 'node:fs';
import path from 'node:path';
import { AvatarRenderer, AVATAR, chromeBuild } from './renderCore.mjs';

function usage(msg) {
  if (msg) console.error(`render: ${msg}`);
  console.error('usage: node avatar/viewer/render.mjs <recipe.json> <out.png> [--preset front|select|bust|face] '
    + '[--w 768 --h 925] [--ssaa 3] [--pose stance|idle] [--glow on|off] [--bg #rrggbb] [--assets DIR] [--times N]');
  process.exit(2);
}

function parseArgs(argv) {
  const o = { preset: 'front', w: null, h: null, ssaa: 3, pose: null, glow: null, bg: null,
    assets: path.join(AVATAR, 'build/assets'), times: 1, pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o.pos.push(a); continue; }
    const k = a.slice(2), v = argv[++i];
    if (v === undefined) usage(`${a} needs a value`);
    if (['w', 'h', 'ssaa', 'times'].includes(k)) o[k] = parseInt(v, 10);
    else if (k === 'glow') o.glow = /^(1|on|true|yes)$/i.test(v);
    else if (['preset', 'pose', 'bg', 'assets'].includes(k)) o[k] = v;
    else usage(`unknown option ${a}`);
  }
  if (o.pos.length !== 2) usage();
  if (!['front', 'select', 'bust', 'face'].includes(o.preset)) usage(`bad preset ${o.preset}`);
  if (o.pose && !['stance', 'idle'].includes(o.pose)) usage(`bad pose ${o.pose}`);
  // default size: the Wine portrait size for front, the game's 576×768 crop (3:4) for the select cameras
  const [dw, dh] = o.preset === 'front' ? [768, 925] : [576, 768];
  o.w ??= o.h ? Math.round(o.h * dw / dh) : dw;
  o.h ??= Math.round(o.w * dh / dw);
  if (!(o.w > 0 && o.h > 0 && o.ssaa >= 1 && o.ssaa <= 8)) usage('bad size / ssaa');
  return o;
}

const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const [recipePath, outPath] = o.pos.map(p => path.resolve(p));
  if (!exists(recipePath)) usage(`no recipe ${recipePath}`);
  const T = { start: performance.now() };
  const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
  const renderer = new AvatarRenderer({ assets: o.assets });
  try {
    await renderer.start();
    T.launched = performance.now();
    let last = null;
    const logs = [];
    for (let i = 0; i < o.times; i++) {
      const { png, result: r, ms, logs: l } = await renderer.render({ recipe, preset: o.preset, pose: o.pose,
        width: o.w, height: o.h, ssaa: o.ssaa, glow: o.glow, background: o.bg });
      logs.push(...l);
      const file = o.times > 1 ? outPath.replace(/(\.png)?$/i, `.${i}.png`) : outPath;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, png);
      last = r;
      console.log(JSON.stringify({ out: path.relative(process.cwd(), file), preset: r.preset, pose: r.pose?.name,
        poseSource: r.pose?.source, glow: r.glow, size: `${r.width}x${r.height}`, ssaa: o.ssaa, bytes: png.length,
        timings: Object.fromEntries(Object.entries({ ...r.timings, roundTripMs: ms }).map(([k, v]) => [k, Math.round(v)])) }));
    }
    if (last.warnings.length) for (const w of last.warnings) console.warn(`  warning: ${w}`);
    for (const l of [...new Set(logs)]) console.warn(`  ${l}`);
    T.done = performance.now();
    console.log(JSON.stringify({ chrome: chromeBuild(renderer.chrome), gl: last.gl, playwright: renderer.pw.version,
      launchMs: Math.round(T.launched - T.start), totalMs: Math.round(T.done - T.start) }));
  } finally {
    await renderer.close();
  }
}

main().catch(e => { console.error(`render: ${e.stack || e}`); process.exit(1); });
