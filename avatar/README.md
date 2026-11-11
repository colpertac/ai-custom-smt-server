# Avatar renderer

Builds armory portraits from the Imagine client's own model files instead of
screenshotting a Wine client. Plan and milestones:
[IMAGINE Avatar Renderer](https://claude.ai/artifact/9AUCb4daVj56GXFYu9Xwow).
Research notes (local only): `AI/avatar-renderer.md`.

Nothing derived from the client is committed. Every tool reads the client
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
python3 resolve.py cat catm        # world DB character → Avatar parts + hair/eye colours
python3 render.py out.png SKEL.nif POSE.kf PART.nif [PART.nif@AttachNode ...]   # software PoC render
```

| File | Purpose |
| --- | --- |
| `nifparse.py` | nif.xml-driven reader for NIF 20.1.0.3 (all 6,212 avatar NIFs and 2,268 KFs parse cleanly) |
| `skel.py`, `pose.py` | Skeleton transforms; frame-0 sampling of KF poses (incl. B-spline channels) |
| `kfmparse.py` | KFM animation maps |
| `render.py` | Stdlib software rasterizer used to prove assembly; not the production renderer |
| `tables.py` | Client tables and the 139-colour hair/eye palette (switch at `0x461b40` in the exe) |
| `resolve.py` | Prototype of the character → parts rule the website will implement |
| `survey.py`, `tree.py` | Format survey and node-tree dump |
| `nsb.py`, `d3dasm.py`, `nifcolor.py` | Gamebryo NSB shader library parser, D3D9 bytecode disassembler, NIF colour extra-data dump |
| `../shaders/coeMaterials.js` | Draft three.js materials for COE_HairColor and COE_Skinning |
| `../ghidra/` | `Dump.java` headless decompile/xref/string helper and `run-dump.sh` |

## Ghidra

The analyzed project lives outside the repo at `/home/cat/software/smt/ghidra/imagine.gpr`
(Ghidra 12.2). Dump decompiled C for a function and its callees:

```bash
avatar/ghidra/run-dump.sh /home/cat/software/smt/ghidra decomp /tmp/out 1 0x460590
```
