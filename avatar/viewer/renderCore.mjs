// Headless avatar renderer shared by the CLI (render.mjs) and the render worker (avatar/worker/).
//
// One local HTTP server (avatar/, the converted assets, three at /vendor/three/) and one
// chrome-headless-shell page (render.html, SwiftShader WebGL2) are kept alive and reused per image.
// Each image gets a fresh WebGL context (new canvas, context released afterwards), so the n-th image
// of a session is byte-identical to the first image of a fresh process.
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
export const AVATAR = path.resolve(HERE, '..');
const REPO = path.resolve(AVATAR, '..');
const HOME = os.homedir();
export const THREE_VERSION = '0.170.0';
export const CHROME_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--disable-gpu-driver-bug-workarounds'];

const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const pkgVersion = d => { try { return JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version; } catch { return null; } };
const listDirs = (d, re) => { try { return fs.readdirSync(d).filter(n => re.test(n)).map(n => path.join(d, n)); } catch { return []; } };

export function findPlaywright() {
  const cands = [process.env.PLAYWRIGHT_CORE,
    path.join(REPO, 'website/node_modules/playwright-core'), path.join(REPO, 'node_modules/playwright-core'),
    ...listDirs(path.join(HOME, '.npm/_npx'), /./).map(d => path.join(d, 'node_modules/playwright-core')),
    path.join(HOME, 'repos/CATEGORY/motion-graphics/hybrid/node_modules/playwright-core')].filter(Boolean);
  const ok = cands.filter(d => pkgVersion(d) && /^1\.\d+\.\d+$/.test(pkgVersion(d)));   // prefer releases
  const d = ok[0] || cands.find(d => pkgVersion(d));
  if (!d) throw new Error('playwright-core not found; set PLAYWRIGHT_CORE');
  return { dir: d, version: pkgVersion(d), lib: createRequire(path.join(d, 'package.json'))(d) };
}

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const shells = listDirs(path.join(HOME, '.cache/ms-playwright'), /^chromium_headless_shell-\d+$/)
    .sort((a, b) => +b.split('-').pop() - +a.split('-').pop())
    .map(d => path.join(d, 'chrome-headless-shell-linux64/chrome-headless-shell')).filter(exists);
  if (!shells.length) throw new Error('chrome-headless-shell not found under ~/.cache/ms-playwright; set CHROME');
  return shells[0];
}

/** Playwright-style build name of a Chrome executable (`chromium_headless_shell-1223`), else its directory name. */
export const chromeBuild = chrome => path.basename(path.dirname(path.dirname(chrome)));

export function findThree() {
  const cands = [process.env.THREE_DIR, path.join(REPO, 'website/node_modules/three'), path.join(REPO, 'node_modules/three'),
    path.join(HOME, 'repos/CATEGORY/motion-graphics/hybrid/node_modules/three')].filter(Boolean);
  const d = cands.find(d => pkgVersion(d) === THREE_VERSION) || (process.env.THREE_DIR && pkgVersion(process.env.THREE_DIR) && process.env.THREE_DIR);
  if (!d) throw new Error(`three@${THREE_VERSION} not found; set THREE_DIR`);
  if (pkgVersion(d) !== THREE_VERSION) console.warn(`render: three ${pkgVersion(d)} at ${d}, viewer pins ${THREE_VERSION}`);
  return d;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png' };

/** Static server for [prefix, dir|file] routes on 127.0.0.1:<random>. `onMiss(url)` is called for every 404. */
export function serve(routes, onMiss) {
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
    if (!file || !exists(file) || fs.statSync(file).isDirectory()) { onMiss?.(url); res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/** RGBA (top row first) → RGB PNG, filter Sub on every row, zlib level 9 (deterministic). */
export function encodePng(w, h, rgba) {
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

const withTimeout = (p, ms, what) => {
  if (!ms) return p;
  let timer;
  return Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms); })])
    .finally(() => clearTimeout(timer));
};

/**
 * Persistent headless renderer. `start()` launches everything; `render()` relaunches the browser when it
 * crashed, disconnected or timed out on the previous image; `close()` stops browser and server.
 */
export class AvatarRenderer {
  /**
   * @param {object} [o]
   * @param {string} [o.assets]     converted assets dir (default avatar/build/assets)
   * @param {number} [o.timeoutMs]  per-image limit (page.evaluate); 0 = none
   * @param {(event: string, data: object) => void} [o.onEvent]  'launch' | 'browser-lost' | 'console'
   */
  constructor({ assets = path.join(AVATAR, 'build/assets'), timeoutMs = 0, onEvent } = {}) {
    this.assets = path.resolve(assets);
    this.timeoutMs = timeoutMs;
    this.onEvent = onEvent || (() => {});
    this.browser = null; this.page = null; this.server = null; this.broken = false;
    this.misses = [];      // 404s under /__assets/ during the current image
    this.logs = [];        // console errors/warnings during the current image
    this.launches = 0;
  }

  async start() {
    if (!this.server) {
      this.pw = findPlaywright(); this.chrome = findChrome(); this.three = findThree();
      this.server = await serve([['/vendor/three/', this.three], ['/__assets/', this.assets], ['/', AVATAR]],
        url => { if (url.startsWith('/__assets/')) this.misses.push(url.slice('/__assets/'.length)); });
      this.base = `http://127.0.0.1:${this.server.address().port}`;
    }
    if (this.browser && !this.broken) return this;
    await this.#closeBrowser();
    const t = performance.now();
    const browser = await this.pw.lib.chromium.launch({ executablePath: this.chrome, args: CHROME_ARGS });
    this.broken = false;
    browser.on('disconnected', () => { if (this.browser === browser) { this.broken = true; this.onEvent('browser-lost', { reason: 'disconnected' }); } });
    const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
    page.on('crash', () => { this.broken = true; this.onEvent('browser-lost', { reason: 'page crashed' }); });
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') this.logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => this.logs.push(`pageerror: ${e.message}`));
    await page.goto(`${this.base}/viewer/render.html`);
    await page.waitForFunction(() => window.workerReady, null, { timeout: 30000 });
    this.browser = browser; this.page = page; this.launches++;
    this.browserVersion = browser.version();
    this.launchMs = performance.now() - t;
    this.onEvent('launch', { chrome: chromeBuild(this.chrome), version: this.browserVersion, launchMs: Math.round(this.launchMs), launches: this.launches });
    return this;
  }

  /** `chromium_headless_shell-1223/148.0.7778.96` once started. */
  get chromeName() { return this.chrome ? `${chromeBuild(this.chrome)}${this.browserVersion ? `/${this.browserVersion}` : ''}` : null; }

  /**
   * Render one image.
   * @param {object} p  {recipe (object) | recipeUrl, preset, pose, width, height, ssaa, glow, background}
   * @returns {Promise<{png: Buffer, result: object, ms: number, misses: string[], logs: string[]}>}
   *   `result` is render.html's answer minus `rgba` (width, height, gl, preset, pose, glow, warnings, timings).
   */
  async render({ recipe, recipeUrl, preset = 'front', pose, width, height, ssaa = 3, glow, background }) {
    await this.start();
    this.misses = []; this.logs = [];
    const t = performance.now();
    let r;
    try {
      r = await withTimeout(this.page.evaluate(p => window.renderAvatar(p), {
        recipe, recipeUrl, assetBase: '/__assets/', preset, pose: pose ?? undefined,
        width, height, ssaa, glow: glow ?? undefined, background: background ?? undefined }), this.timeoutMs, 'render');
    } catch (e) {
      // timeouts and crashes leave the page in an unknown state: relaunch before the next image
      if (/timed out|Target .*closed|crash|disconnected/i.test(e.message)) this.broken = true;
      throw e;
    }
    const png = encodePng(r.width, r.height, Buffer.from(r.rgba, 'base64'));
    delete r.rgba;
    return { png, result: r, ms: performance.now() - t, misses: [...this.misses], logs: [...this.logs] };
  }

  async #closeBrowser() {
    const b = this.browser;
    this.browser = null; this.page = null;
    if (b) await withTimeout(b.close(), 5000, 'browser close').catch(() => {});
  }

  async close() {
    await this.#closeBrowser();
    if (this.server) { this.server.close(); this.server = null; }
  }
}
