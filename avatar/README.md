# Avatar renderer

Builds armory portraits from the Imagine client's own model files instead of
screenshotting a Wine client. Plan and milestones:
[IMAGINE Avatar Renderer](https://claude.ai/artifact/9AUCb4daVj56GXFYu9Xwow).
Research notes (local only): `AI/avatar-renderer.md`.

Nothing derived from the client is committed, except the resolver catalog the website bakes in
(`website/content/avatar/catalog.json`, like the wiki catalogs). Every tool reads the client
install and writes to `avatar/build/` (gitignored).

## Setup

Paths live in `tools/config.py` and can be overridden with environment variables:

| Variable | Default | What |
| --- | --- | --- |
| `IMAGINE_CLIENT_DIR` | `/home/cat/software/smt/game/reimagine` | Client install (read only) |
| `NIF_XML` | `/home/cat/software/nifskope-linux/nif.xml` | NifTools schema (ships with NifSkope) |
| `COMP_TOOLS_DIR` | `ops/comp-tools` | `comp_decrypt`, `comp_bdpatch` |
| `WORLD_DB` | `../comp_hack/runtime/database/world.sqlite3` | Characters (opened read only) |
| `AVATAR_BUILD_DIR` | `avatar/build` | Output |

Python 3 standard library only.

## Tools

```bash
cd avatar/tools
python3 tables.py                  # decode CEquip*/CEquipModel/Item/CItem tables + exe palette → build/tables
python3 resolve.py cat catm        # world DB character → skeleton, idle pose, Avatar parts, hair/eye colours
python3 render_char.py catm        # resolve + PoC software render → build/renders/catm.png
python3 catalog.py                 # resolver catalog → build/assets/catalog.json (~950 KB)
python3 catalog.py --out ../../website/content/avatar/catalog.json   # refresh the website's baked copy
python3 crosscheck_recipes.py --fuzz 20000   # resolve.py vs website/lib/avatar-recipe.ts on every DB character (+ synthetic)
python3 crosscheck_recipes.py --golden ../../website/lib/avatar-recipe.golden.json   # refresh the vitest golden fixture
python3 render.py out.png SKEL.nif POSE.kf PART.nif [PART.nif@AttachNode ...]   # render explicit parts
python3 convert.py all             # NIF → GLB: 6 skeletons, 48 poses, rig.json, 6,114 parts → build/assets (~10 s, ~420 MB)
python3 convert.py parts Hair/W_01_Hair_Lg_006.nif   # rebuild named parts (also skeletons | poses | rig | manifest)
python3 check_glb.py cat catm cat3 # rebuild avatars from build/assets and diff every vertex against render.py
```

`convert.py all` uses every core and is incremental: outputs newer than their inputs (and than
the converter's own source) are skipped, so a re-run takes well under a second; `--force`
rebuilds everything, `-j N` limits workers. Per-file failures and warnings land in
`build/assets/manifest.json`. The output contract is [docs/FORMAT.md](docs/FORMAT.md).

| File | Purpose |
| --- | --- |
| `nifparse.py` | nif.xml-driven reader for NIF 20.1.0.3 (all 6,212 avatar NIFs and 2,268 KFs parse cleanly) |
| `skel.py`, `pose.py` | Skeleton transforms; frame-0 sampling of KF poses (incl. B-spline channels) |
| `kfmparse.py` | KFM animation maps |
| `render.py` | Stdlib software rasterizer used to prove assembly; not the production renderer |
| `convert.py` | NIF → GLB converter: skeletons, frame-0 poses, parts, `rig.json` (charamake_018 camera/lights), manifest |
| `check_glb.py` | Verifies converted GLBs: rebinds skins by bone name on the posed skeleton GLB and compares every vertex and base texture with `render.py` |
| `glb.py`, `png.py`, `dxt.py` | GLB writer/reader and transform helpers; PNG encoder/decoder; DXT1/3/5, NiPixelData and `.dds` decoding |
| `tables.py` | Client tables and the 139-colour hair/eye palette (switch at `0x461b40` in the exe) |
| `resolve.py` | Character → parts rule as the client applies it (merge order, skips, VA rules, variants); reference for the website resolver |
| `catalog.py` | Everything the resolver looks up (appearance tables, skeletons, palette, equippable items, their CEquipModelData rows, client file lists for `exists`) as one versioned JSON. The website loads `{runtime}/avatar/catalog.json` when present, else the baked copy (`website/lib/avatar-catalog.ts`) |
| `crosscheck_recipes.py` | Runs `resolve.py` and the TypeScript port (`website/lib/avatar-recipe.ts`, via `website/scripts/avatar-recipe-crosscheck.ts` and tsx) on every world-DB character plus `--fuzz N` seeded synthetic ones; diffs skeleton, part files, `exists`, colours (and reports `why`/notes differences). Exit 1 on a mismatch. `--golden` writes the website test fixture |
| `render_char.py` | End-to-end PoC: resolve a character and render it with the client's attach rules |
| `survey.py`, `tree.py` | Format survey and node-tree dump |
| `nsb.py`, `d3dasm.py`, `nifcolor.py` | Gamebryo NSB shader library parser, D3D9 bytecode disassembler, NIF colour extra-data dump |
| `recipe.py` | Write `build/recipes/<name>.json` (resolve output) for the viewer |
| `../worker/` | Portrait render worker (see below) |
| `../viewer/` | three.js `buildScene(recipe)` + test page (`viewer/README.md`): `python3 -m http.server 8765 --directory avatar`, then `/viewer/?recipe=../build/recipes/cat.json` |
| `../shaders/coeMaterials.js` | three.js ShaderMaterial for the COE shaders (HairColor, Skinning, SkinningDX, Blender, Effecter) with the game's per-vertex lighting |
| `../ghidra/` | `Dump.java` headless decompile/xref/string helper and `run-dump.sh` |

## Render worker (`worker/`)

Headless portrait renderer for the website's queue (milestone M5; contract
[docs/WORKER.md](docs/WORKER.md)). It replaces the Wine mannequin studio: one persistent
chrome-headless-shell page (`viewer/renderCore.mjs`, shared with `viewer/render.mjs`) renders
each claimed recipe with `buildScene()` at front 768×925, select stance, glow off, ssaa 3, and
uploads the PNG. Each image gets a fresh WebGL context, so it is byte-identical to the CLI
(catm → `d098b2d0abea865e…`).

```bash
# no network: render a recipe the way a job would (repeat N times for timings)
node avatar/worker/worker.mjs --dry-run avatar/build/recipes/catm.json /tmp/catm.png --times 10
# one cycle against a site: heartbeat, claim at most one job, render, ingest (exit 1 on failure)
PORTRAIT_QUEUE_URL=http://127.0.0.1:3500 PORTRAIT_WORKER_TOKEN=… node avatar/worker/worker.mjs --once
# service: heartbeat every 15 s, claim {kind: "three"}, render, ingest / fail; SIGTERM finishes the job
PORTRAIT_QUEUE_URL=… PORTRAIT_WORKER_TOKEN=… node avatar/worker/worker.mjs
node avatar/worker/golden.mjs            # golden hashes (exit 1 on mismatch); --update to rewrite
```

| Env | Default | What |
| --- | --- | --- |
| `PORTRAIT_QUEUE_URL` | — | Website base URL |
| `PORTRAIT_WORKER_TOKEN` | — | `X-Portrait-Worker-Token` |
| `AVATAR_ASSETS_DIR` | `avatar/build/assets` | Converted assets |
| `PORTRAIT_WORKER_ID` | `three-<hostname>` | Heartbeat / claim id |
| `PORTRAIT_POLL_MS` | `2000` | Claim interval while the queue is empty (errors back off to 30 s) |
| `PORTRAIT_SSAA` | `3` | Supersampling factor |
| `PORTRAIT_RENDER_TIMEOUT_MS` | `60000` | Per-image limit; the browser is relaunched after a timeout or crash |
| `CHROME`, `PLAYWRIGHT_CORE`, `THREE_DIR` | found locally | As for `viewer/render.mjs` |

| File | What |
| --- | --- |
| `worker.mjs` | The service; logs one JSON object per line (`browser started`, `job done` with sha256/timings, `job failed`, mode / version changes) |
| `portrait.mjs` | `RENDERER_VERSION` (must equal `website/lib/portrait-render-mode.ts`), contract settings, recipe validation, `renderPortrait()` (a 404 for any asset fails the job), `assetsVersion()` |
| `golden.mjs`, `golden.json` | cat, catm, cat3 in canonical form (skeleton, existing parts, colours) + their PNG SHA-256 and the Chrome build they were made with; renders each, then the first again in the same page. `--update` re-imports the recipes from `build/recipes` (`python3 tools/recipe.py cat catm cat3`) and rewrites the hashes |
| `Dockerfile`, `Dockerfile.dockerignore`, `entrypoint.sh` | Image (build from the repo root): node 24, python3, playwright-core 1.58.2, three 0.170.0, Chrome for Testing headless shell 148.0.7778.96 (`chromium_headless_shell-1223`, sha256-checked). The entrypoint updates the assets volume from the mounted client, then starts the worker. Compose service `avatar-worker`, profile `renderer` (`deploy/README.md`) |

Rendering errors, missing assets, a recipe without skeleton and a job for another
`rendererVersion` are reported with `/queue/fail`. Golden hashes are per Chrome build: when Chrome
or the renderer changes, run `golden.mjs --update`; if the hashes moved on the same Chrome build,
bump `RENDERER_VERSION` in `portrait.mjs` and on the website (it is part of the v3 fingerprint).

## Ghidra

The analyzed project lives outside the repo at `/home/cat/software/smt/ghidra/imagine.gpr`
(Ghidra 12.2). Dump decompiled C for a function and its callees:

```bash
avatar/ghidra/run-dump.sh /home/cat/software/smt/ghidra decomp /tmp/out 1 0x460590
```
