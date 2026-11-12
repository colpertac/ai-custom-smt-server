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
| `../viewer/` | three.js `buildScene(recipe)` + test page (`viewer/README.md`): `python3 -m http.server 8765 --directory avatar`, then `/viewer/?recipe=../build/recipes/cat.json` |
| `../shaders/coeMaterials.js` | three.js ShaderMaterial for the COE shaders (HairColor, Skinning, SkinningDX, Blender, Effecter) with the game's per-vertex lighting |
| `../ghidra/` | `Dump.java` headless decompile/xref/string helper and `run-dump.sh` |

## Ghidra

The analyzed project lives outside the repo at `/home/cat/software/smt/ghidra/imagine.gpr`
(Ghidra 12.2). Dump decompiled C for a function and its callees:

```bash
avatar/ghidra/run-dump.sh /home/cat/software/smt/ghidra decomp /tmp/out 1 0x460590
```
