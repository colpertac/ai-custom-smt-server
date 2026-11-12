# Render worker contract (M5)

The three.js render worker replaces the Wine mannequin studio. It claims portrait jobs from the
website's existing queue, renders them headless, and ingests the PNG. This file is the contract
between the website (`website/`) and the worker (`avatar/worker/`).

## Mode switch (website)

`PORTRAIT_RENDERER` (env, website): `wine` (default today) or `three`.

In `three` mode:

- **Fingerprint v3** = first 16 hex of SHA-256 over
  `v3|r=<RENDERER_VERSION>|c=<catalog version>|p=front|<canonical recipe>`, where the canonical
  recipe is the recipe JSON (`lib/avatar-recipe.ts`) reduced to what changes pixels:
  `gender, skeleton{nif, scale, stance, idle}, parts{Folder: file}` for parts with `file` set and
  `exists` true (sorted by folder), `colors{hair, eyeRight, eyeLeft}`. `why` and `notes` are excluded.
  `RENDERER_VERSION` is a constant in the website (start at `1`); bump it whenever the worker's
  output for the same recipe changes. Character name is **not** part of v3 (same look → same PNG).
- **Enqueue**: on an armory miss, the job payload carries `{fingerprint, characterName, recipe,
  rendererVersion, preset: "front", width: 768, height: 925}`; jobs keep using `portraits.db`.
- **Availability**: `isPortraitCaptureAvailable` is true when a render worker has sent a heartbeat
  in the last 60 s (no studio / mannequin checks).
- **Wine mode** stays exactly as it is (v2 fingerprints, studio probes) so the switch is reversible.

## HTTP (all with `X-Portrait-Worker-Token: <PORTRAIT_WORKER_TOKEN>`)

| Method | Path | Body | Response `data` |
| --- | --- | --- | --- |
| POST | `/api/portrait/worker/heartbeat` | `{workerId, kind: "three", rendererVersion, assetsVersion, chrome, busy}` | `{ok: true, mode, rendererVersion, versionMismatch}` |
| POST | `/api/portrait/queue/claim` | `{kind: "three", rendererVersion?, workerId?}` | as today, plus `job.recipe`, `job.preset`, `job.width`, `job.height`, `job.rendererVersion`; with `kind: "three"` only jobs that carry a recipe are claimed. The worker's version comes from the body, else its last heartbeat, else the newest three heartbeat; unknown or different → `empty` with `versionMismatch`. Claims without `kind: "three"` never take recipe jobs. |
| POST | `/api/portrait/queue/ingest` | multipart `fingerprint`, `file` (PNG) | as today |
| POST | `/api/portrait/queue/fail` | `{fingerprint, error}` | as today |

Responses use the site's usual `apiOk` / `apiFail` wrapper (`{success, message, data}`).
A worker whose `rendererVersion` differs from the website's must not claim (the website answers
claim with `empty: true` and a `versionMismatch` note).

## Worker

- Node service in `avatar/worker/`, reusing `avatar/viewer/buildScene.js` through the same
  headless page as `avatar/viewer/render.mjs` (one persistent browser + page, reused per job).
- Env: `PORTRAIT_QUEUE_URL`, `PORTRAIT_WORKER_TOKEN`, `AVATAR_ASSETS_DIR` (converted assets,
  default `avatar/build/assets`), `PORTRAIT_WORKER_ID`, `PORTRAIT_POLL_MS` (default 2000),
  `PORTRAIT_SSAA` (default 3), `CHROME`, `PLAYWRIGHT_CORE`, `THREE_DIR`.
- Loop: heartbeat every 15 s; claim; render recipe with `preset`, `width`, `height`, pose
  `stance`, glow off; ingest; on error call fail with the message. One job at a time.
- Golden test: `avatar/worker/golden.mjs` renders fixed recipes and compares SHA-256 with
  `avatar/worker/golden.json` (hashes only — no images committed, since they are derived from game
  assets). Hashes are per Chrome build; the file records the build they were made with.
