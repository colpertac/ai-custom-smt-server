#!/usr/bin/env node
// Portrait render worker (M5, avatar/docs/WORKER.md): claims `three` jobs from the website's portrait
// queue, renders them with buildScene() in one persistent chrome-headless-shell page and ingests the PNG.
//
//   node avatar/worker/worker.mjs                 # run until SIGTERM / SIGINT
//   node avatar/worker/worker.mjs --once          # heartbeat, claim at most one job, exit
//   node avatar/worker/worker.mjs --dry-run <recipe.json> <out.png> [--times N]
//        [--preset front] [--width 768 --height 925] [--ssaa 3]   # no network: render a recipe file
//
// Env: PORTRAIT_QUEUE_URL, PORTRAIT_WORKER_TOKEN, AVATAR_ASSETS_DIR (avatar/build/assets),
//      PORTRAIT_WORKER_ID (three-<hostname>), PORTRAIT_POLL_MS (2000), PORTRAIT_SSAA (3),
//      PORTRAIT_RENDER_TIMEOUT_MS (60000), CHROME, PLAYWRIGHT_CORE, THREE_DIR.
// Logs: one JSON object per line on stdout ({ts, level, msg, ...}).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AvatarRenderer } from '../viewer/renderCore.mjs';
import { RENDERER_VERSION, PORTRAIT, renderPortrait, assetsVersion, sha256 } from './portrait.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AVATAR = path.resolve(HERE, '..');
const HEARTBEAT_MS = 15000;
const HTTP_TIMEOUT_MS = 20000;
const MAX_BACKOFF_MS = 30000;

const env = process.env;
const intEnv = (k, d) => { const v = parseInt(env[k] ?? '', 10); return Number.isFinite(v) ? v : d; };
const cfg = {
  queueUrl: (env.PORTRAIT_QUEUE_URL || '').replace(/\/+$/, ''),
  token: env.PORTRAIT_WORKER_TOKEN || '',
  assets: path.resolve(env.AVATAR_ASSETS_DIR || path.join(AVATAR, 'build/assets')),
  workerId: (env.PORTRAIT_WORKER_ID || `three-${os.hostname()}`).slice(0, 64),
  pollMs: Math.max(200, intEnv('PORTRAIT_POLL_MS', 2000)),
  ssaa: intEnv('PORTRAIT_SSAA', PORTRAIT.ssaa),
  renderTimeoutMs: intEnv('PORTRAIT_RENDER_TIMEOUT_MS', 60000),
};

function log(level, msg, extra = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}
const errMsg = e => (e && e.message) || String(e);

function usage(msg) {
  if (msg) console.error(`worker: ${msg}`);
  console.error('usage: node avatar/worker/worker.mjs [--once]\n'
    + '       node avatar/worker/worker.mjs --dry-run <recipe.json> <out.png> [--times N] [--preset P] [--width W --height H] [--ssaa N]');
  process.exit(2);
}

function parseArgs(argv) {
  const o = { once: false, dryRun: false, times: 1, job: {}, pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') o.once = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '-h' || a === '--help') usage();
    else if (['--times', '--width', '--height', '--ssaa', '--preset'].includes(a)) {
      const v = argv[++i];
      if (v === undefined) usage(`${a} needs a value`);
      if (a === '--times') o.times = Math.max(1, parseInt(v, 10));
      else if (a === '--ssaa') cfg.ssaa = parseInt(v, 10);
      else if (a === '--preset') o.job.preset = v;
      else o.job[a.slice(2)] = parseInt(v, 10);
    } else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else o.pos.push(a);
  }
  if (o.dryRun ? o.pos.length !== 2 : o.pos.length) usage();
  return o;
}

// ---------------------------------------------------------------------------------------------
// queue HTTP

async function api(route, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(cfg.queueUrl + route, {
    method: 'POST',
    headers: { 'X-Portrait-Worker-Token': cfg.token, ...(isForm ? {} : { 'content-type': 'application/json' }) },
    body: isForm ? body : JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON (proxy error page) */ }
  if (!res.ok || !json || json.success === false) {
    const e = new Error(`${route}: HTTP ${res.status}${json?.message ? ` ${json.message}` : ''}`);
    e.status = res.status;
    throw e;
  }
  return json.data ?? {};
}

// ---------------------------------------------------------------------------------------------
// worker

class Worker {
  constructor(renderer, { once }) {
    this.renderer = renderer;
    this.once = once;
    this.busy = false;
    this.stopping = false;
    this.wake = null;
    this.state = {};   // last logged mode / heartbeat error / claim note, to log changes only
    this.stats = { done: 0, failed: 0 };
  }

  /** Log `msg` only when `value` differs from the last one logged under `key`. */
  logChange(key, level, msg, value, extra = {}) {
    const v = JSON.stringify(value);
    if (this.state[key] === v) return;
    this.state[key] = v;
    log(level, msg, extra);
  }

  async heartbeat() {
    try {
      const d = await api('/api/portrait/worker/heartbeat', { workerId: cfg.workerId, kind: 'three',
        rendererVersion: RENDERER_VERSION, assetsVersion: assetsVersion(cfg.assets), chrome: this.renderer.chromeName,
        busy: this.busy });
      this.logChange('hbErr', 'info', 'heartbeat ok', null, { mode: d.mode });
      this.logChange('mode', d.mode === 'three' ? 'info' : 'warn', 'site renderer mode', d.mode,
        { mode: d.mode, note: d.mode === 'three' ? undefined : 'site PORTRAIT_RENDERER is not "three": claims stay empty' });
      if (d.versionMismatch != null) this.logChange('hbVersion', d.versionMismatch ? 'warn' : 'info', 'renderer version',
        d.versionMismatch, { worker: RENDERER_VERSION, site: d.rendererVersion, match: !d.versionMismatch });
    } catch (e) {
      this.logChange('hbErr', 'warn', 'heartbeat failed', errMsg(e), { error: errMsg(e) });
    }
  }

  sleep(ms) {
    return new Promise(r => {
      const t = setTimeout(() => { this.wake = null; r(); }, ms);
      this.wake = () => { clearTimeout(t); this.wake = null; r(); };
    });
  }

  stop(signal) {
    if (this.stopping) return;
    this.stopping = true;
    log('info', 'stopping', { signal, busy: this.busy });
    this.wake?.();
  }

  async fail(fingerprint, error) {
    try {
      await api('/api/portrait/queue/fail', { fingerprint, error: String(error).slice(0, 500) });
    } catch (e) {
      log('error', 'fail call failed', { fingerprint, error: errMsg(e) });
    }
  }

  async process(job) {
    const fp = job.fingerprint;
    const t0 = performance.now();
    this.busy = true;
    try {
      if (job.rendererVersion != null && job.rendererVersion !== RENDERER_VERSION)
        throw new Error(`job is for rendererVersion ${job.rendererVersion}, worker renders ${RENDERER_VERSION}`);
      const recipe = job.recipe ?? job.payload?.recipe;
      let r;
      try {
        r = await renderPortrait(this.renderer, recipe, job, cfg.ssaa);
      } catch (e) {
        throw new Error(`render: ${errMsg(e)}`);
      }
      const form = new FormData();
      form.set('fingerprint', fp);
      form.set('file', new Blob([r.png], { type: 'image/png' }), `${fp}.png`);
      const t1 = performance.now();
      try {
        await api('/api/portrait/queue/ingest', form);
      } catch (e) {
        throw new Error(`ingest: ${errMsg(e)}`);
      }
      this.stats.done++;
      log('info', 'job done', { fingerprint: fp, character: job.characterName, preset: r.params.preset,
        size: `${r.params.width}x${r.params.height}`, ssaa: r.params.ssaa, pose: r.result.pose?.source, bytes: r.png.length,
        sha256: r.sha256.slice(0, 16), renderMs: Math.round(r.ms), ingestMs: Math.round(performance.now() - t1),
        totalMs: Math.round(performance.now() - t0), warnings: r.result.warnings.length ? r.result.warnings : undefined });
    } catch (e) {
      this.stats.failed++;
      log('error', 'job failed', { fingerprint: fp, character: job.characterName, error: errMsg(e),
        totalMs: Math.round(performance.now() - t0) });
      await this.fail(fp, errMsg(e));
    } finally {
      this.busy = false;
    }
  }

  async run() {
    await this.heartbeat();
    const timer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    let streak = 0;
    try {
      while (!this.stopping) {
        let d;
        try {
          d = await api('/api/portrait/queue/claim', { kind: 'three', workerId: cfg.workerId, rendererVersion: RENDERER_VERSION });
          if (streak) log('info', 'queue reachable again', { afterErrors: streak });
          streak = 0;
        } catch (e) {
          streak++;
          const wait = Math.min(cfg.pollMs * 2 ** Math.min(streak, 6), MAX_BACKOFF_MS);
          this.logChange('claimErr', 'warn', 'claim failed', errMsg(e), { error: errMsg(e), retryMs: this.once ? undefined : wait });
          if (this.once) { this.claimFailed = true; break; }
          await this.sleep(wait);
          continue;
        }
        this.state.claimErr = undefined;
        if (d.empty || !d.job) {
          this.logChange('claimNote', d.versionMismatch ? 'warn' : 'info', d.versionMismatch ? 'claim refused' : 'queue empty',
            d.versionMismatch ? d.note : 'empty', d.versionMismatch
              ? { note: d.note, site: d.siteRendererVersion, worker: RENDERER_VERSION } : {});
          if (this.once) break;
          await this.sleep(cfg.pollMs);
          continue;
        }
        this.state.claimNote = undefined;
        log('info', 'job claimed', { fingerprint: d.job.fingerprint, character: d.job.characterName });
        await this.process(d.job);
        if (this.once) break;
      }
    } finally {
      clearInterval(timer);
    }
  }
}

// ---------------------------------------------------------------------------------------------

async function dryRun(o, renderer) {
  const [recipePath, outPath] = o.pos.map(p => path.resolve(p));
  const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
  const runs = [];
  let last;
  for (let i = 0; i < o.times; i++) {
    last = await renderPortrait(renderer, recipe, o.job, cfg.ssaa);
    runs.push(last);
    log('info', 'dry-run render', { run: i + 1, ms: Math.round(last.ms), sha256: last.sha256,
      timings: Object.fromEntries(Object.entries(last.result.timings).map(([k, v]) => [k, Math.round(v)])) });
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, last.png);
  const ms = runs.map(r => r.ms).sort((a, b) => a - b);
  log('info', 'dry-run done', { out: outPath, ...last.params, bytes: last.png.length, sha256: last.sha256,
    identical: runs.every(r => r.sha256 === last.sha256), warnings: last.result.warnings.length ? last.result.warnings : undefined,
    jobMs: { first: Math.round(runs[0].ms), median: Math.round(ms[ms.length >> 1]), min: Math.round(ms[0]), max: Math.round(ms.at(-1)) },
    chrome: renderer.chromeName, gl: last.result.gl, launchMs: Math.round(renderer.launchMs) });
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.dryRun) {
    if (!cfg.queueUrl) { log('error', 'PORTRAIT_QUEUE_URL is not set'); process.exit(2); }
    if (!cfg.token) { log('error', 'PORTRAIT_WORKER_TOKEN is not set'); process.exit(2); }
  }
  for (const f of ['manifest.json', 'rig.json']) {
    if (!fs.existsSync(path.join(cfg.assets, f))) {
      log('error', 'converted assets missing', { assets: cfg.assets, file: f, hint: 'run avatar/tools/convert.py all' });
      process.exit(1);
    }
  }
  const renderer = new AvatarRenderer({ assets: cfg.assets, timeoutMs: cfg.renderTimeoutMs,
    onEvent: (ev, data) => log(ev === 'browser-lost' ? 'warn' : 'info', ev === 'launch' ? 'browser started' : 'browser lost', data) });
  try {
    await renderer.start();
  } catch (e) {
    log('error', 'renderer start failed', { error: errMsg(e) });
    await renderer.close();
    process.exit(1);
  }
  log('info', 'worker ready', { mode: o.dryRun ? 'dry-run' : o.once ? 'once' : 'loop', workerId: cfg.workerId,
    queue: o.dryRun ? undefined : cfg.queueUrl, rendererVersion: RENDERER_VERSION, assets: cfg.assets,
    assetsVersion: assetsVersion(cfg.assets), ssaa: cfg.ssaa, pollMs: cfg.pollMs, chrome: renderer.chromeName,
    playwright: renderer.pw.version, node: process.version });

  let code = 0;
  try {
    if (o.dryRun) await dryRun(o, renderer);
    else {
      const w = new Worker(renderer, o);
      let signals = 0;
      for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
        if (++signals > 1) { log('warn', 'forced exit', { signal: sig }); process.exit(130); }
        w.stop(sig);
      });
      await w.run();
      log('info', 'worker stopped', w.stats);
      if (w.claimFailed || (o.once && w.stats.failed)) code = 1;   // --once: non-zero when the cycle did not succeed
    }
  } catch (e) {
    log('error', 'worker crashed', { error: e.stack || errMsg(e) });
    code = 1;
  } finally {
    await renderer.close();
  }
  process.exit(code);
}

main();
