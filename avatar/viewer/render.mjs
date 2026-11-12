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
// Dependencies are found locally (nothing is downloaded); override with environment variables:
//   PLAYWRIGHT_CORE  directory of a playwright-core package
//   CHROME           chrome-headless-shell (or chromium) executable
//   THREE_DIR        directory of the three@0.170.0 package (served at /vendor/three/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AVATAR = path.resolve(HERE, '..');
const REPO = path.resolve(AVATAR, '..');
const HOME = os.homedir();
const THREE_VERSION = '0.170.0';

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
const pkgVersion = d => { try { return JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version; } catch { return null; } };
const listDirs = (d, re) => { try { return fs.readdirSync(d).filter(n => re.test(n)).map(n => path.join(d, n)); } catch { return []; } };

function findPlaywright() {
  const cands = [process.env.PLAYWRIGHT_CORE,
    path.join(REPO, 'website/node_modules/playwright-core'), path.join(REPO, 'node_modules/playwright-core'),
    ...listDirs(path.join(HOME, '.npm/_npx'), /./).map(d => path.join(d, 'node_modules/playwright-core')),
    path.join(HOME, 'repos/CATEGORY/motion-graphics/hybrid/node_modules/playwright-core')].filter(Boolean);
  const ok = cands.filter(d => pkgVersion(d) && /^1\.\d+\.\d+$/.test(pkgVersion(d)));   // prefer releases
  const d = ok[0] || cands.find(d => pkgVersion(d));
  if (!d) throw new Error('playwright-core not found; set PLAYWRIGHT_CORE');
  return { dir: d, version: pkgVersion(d), lib: createRequire(path.join(d, 'package.json'))(d) };
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const shells = listDirs(path.join(HOME, '.cache/ms-playwright'), /^chromium_headless_shell-\d+$/)
    .sort((a, b) => +b.split('-').pop() - +a.split('-').pop())
    .map(d => path.join(d, 'chrome-headless-shell-linux64/chrome-headless-shell')).filter(exists);
  if (!shells.length) throw new Error('chrome-headless-shell not found under ~/.cache/ms-playwright; set CHROME');
  return shells[0];
}

function findThree() {
  const cands = [process.env.THREE_DIR, path.join(REPO, 'website/node_modules/three'), path.join(REPO, 'node_modules/three'),
    path.join(HOME, 'repos/CATEGORY/motion-graphics/hybrid/node_modules/three')].filter(Boolean);
  const d = cands.find(d => pkgVersion(d) === THREE_VERSION) || (process.env.THREE_DIR && pkgVersion(process.env.THREE_DIR) && process.env.THREE_DIR);
  if (!d) throw new Error(`three@${THREE_VERSION} not found; set THREE_DIR`);
  if (pkgVersion(d) !== THREE_VERSION) console.warn(`render: three ${pkgVersion(d)} at ${d}, viewer pins ${THREE_VERSION}`);
  return d;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png' };

function serve(routes) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = null;
    for (const [prefix, dir] of routes) {
      if (prefix.endsWith('/') ? url.startsWith(prefix) : url === prefix) {
        file = prefix.endsWith('/') ? path.join(dir, url.slice(prefix.length)) : dir;
        if (prefix.endsWith('/') && !file.startsWith(path.resolve(dir) + path.sep)) file = null;
        break;
      }
    }
    if (!file || !exists(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/** RGBA (top row first) → RGB PNG, filter Sub on every row, zlib level 9 (deterministic). */
function encodePng(w, h, rgba) {
  const stride = w * 3, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 1;
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
      const v = rgba[(y * w + x) * 4 + c], left = x ? rgba[(y * w + x - 1) * 4 + c] : 0;
      raw[o + 1 + x * 3 + c] = (v - left) & 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (tag, data) => {
    const t = Buffer.concat([Buffer.from(tag, 'latin1'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const [recipePath, outPath] = o.pos.map(p => path.resolve(p));
  if (!exists(recipePath)) usage(`no recipe ${recipePath}`);
  const T = { start: performance.now() };
  const pw = findPlaywright(), chrome = findChrome(), three = findThree();
  const server = await serve([['/vendor/three/', three], ['/__recipe.json', recipePath],
    ['/__assets/', path.resolve(o.assets)], ['/', AVATAR]]);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await pw.lib.chromium.launch({ executablePath: chrome,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-driver-bug-workarounds'] });
    T.launched = performance.now();
    const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
    const logs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => logs.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/viewer/render.html`);
    await page.waitForFunction(() => window.workerReady, null, { timeout: 30000 });
    let last = null;
    for (let i = 0; i < o.times; i++) {
      const t = performance.now();
      const r = await page.evaluate(p => window.renderAvatar(p), {
        recipeUrl: '/__recipe.json', assetBase: '/__assets/', preset: o.preset, pose: o.pose ?? undefined,
        width: o.w, height: o.h, ssaa: o.ssaa, glow: o.glow ?? undefined, background: o.bg ?? undefined });
      const png = encodePng(r.width, r.height, Buffer.from(r.rgba, 'base64'));
      const file = o.times > 1 ? outPath.replace(/(\.png)?$/i, `.${i}.png`) : outPath;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, png);
      last = r;
      const ms = performance.now() - t;
      console.log(JSON.stringify({ out: path.relative(process.cwd(), file), preset: r.preset, pose: r.pose?.name,
        poseSource: r.pose?.source, glow: r.glow, size: `${r.width}x${r.height}`, ssaa: o.ssaa, bytes: png.length,
        timings: Object.fromEntries(Object.entries({ ...r.timings, roundTripMs: ms }).map(([k, v]) => [k, Math.round(v)])) }));
    }
    if (last.warnings.length) for (const w of last.warnings) console.warn(`  warning: ${w}`);
    for (const l of logs) console.warn(`  ${l}`);
    T.done = performance.now();
    console.log(JSON.stringify({ chrome: path.basename(path.dirname(path.dirname(chrome))), gl: last.gl, playwright: pw.version,
      launchMs: Math.round(T.launched - T.start), totalMs: Math.round(T.done - T.start) }));
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch(e => { console.error(`render: ${e.stack || e}`); process.exit(1); });
