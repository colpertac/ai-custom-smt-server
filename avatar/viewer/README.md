# Avatar viewer

three.js viewer for converted avatars (milestone M2 validation) and the first cut of the shared
`buildScene()` that the site and the headless render worker will reuse (M4).

| File | What |
| --- | --- |
| `buildScene.js` | `buildScene(recipe, {assetBase, rig?, pose?, preset?})` → `{scene, camera, avatarRoot, …}`; also `createRenderer`, `applyCameraPreset`, `recipeAssets`, `DEFAULT_RIG` |
| `../shaders/coeMaterials.js` | COE_* shaders as `ShaderMaterial`s with the game's per-vertex lighting |
| `index.html` | Interactive viewer / screenshot page |
| `shadertest.html` | Compiles and draws every material variant on spheres (no assets needed) |

three.js is pinned to `0.170.0` via an import map (jsDelivr). `buildScene.js` imports only `three`
and `three/addons/…`, so a bundler resolves the same specifiers from `node_modules`.

## Run

```bash
cd avatar/tools
python3 tables.py                    # once: decoded client tables
python3 convert.py …                 # NIF → build/assets (see docs/FORMAT.md)
python3 recipe.py cat catm cat3      # → build/recipes/<name>.json
python3 -m http.server 8765 --directory ..   # serve avatar/
```

Open `http://localhost:8765/viewer/index.html?recipe=../build/recipes/catm.json`.

Query parameters: `recipe` (default `../build/recipes/cat.json`; `resolve.py --json` output also works),
`assets` (default `../build/assets/`), `w`/`h` (fixed canvas size at DPR 1, e.g. `w=576&h=768`),
`preset` (`full`, `bust`, `face`), `aa=0`, `raw=1`, `ui=0` (hide controls).

Controls: drag to orbit, wheel to zoom; preset buttons; "Raw base texture" draws the unlit base map
(UV / texture debugging); "Save PNG" downloads the canvas.

Headless: the page sets `window.renderDone = true` once every GLB and texture is loaded, shaders are
compiled and the first frame is drawn (or `window.renderError`). Read pixels with
`canvas.toDataURL()` (the renderer keeps the drawing buffer). Chrome needs
`--use-angle=swiftshader --enable-unsafe-swiftshader` without a GPU.

## Recipe flow

`world DB → resolve.py rules → recipe.py → build/recipes/<name>.json → buildScene`

`buildScene` maps the recipe to assets exactly as `docs/FORMAT.md` says: `skeleton.nif` →
`skeletons/<stem>.glb`, `skeleton.idle` → `poses/<stem>.json`, every part with `file` and `exists` →
`parts/<Folder>/<stem>.glb`, and `rig.json` (falls back to the built-in charamake_018 rig).

Assembly:

1. Skeleton GLB under `avatarRoot`, which carries the Z-up → Y-up rotation (−90° about X) and
   `skeleton.scale`. Pose bones overwrite bind-pose locals (`t`, `r`, `s` where present).
2. Nodes are matched by their glTF (NIF) names, recovered from the loader's associations, because
   GLTFLoader rewrites `Object3D.name` (spaces → `_`).
3. Skinned parts: each `SkinnedMesh` gets a new `Skeleton` of the avatar's bones (by name) with the
   file's inverse bind matrices, identity `bindMatrix`, `bindMode = "detached"`. The shaders take the
   skinned position as world space (Σ w·BoneWorld·IBM·v) and ignore the mesh's node transform. A
   missing bone fails the part, as in the game.
4. Rigid parts: the stem node is parented under skeleton node `extras.attach`, keeping its local
   transform.
5. Materials from `extras`: COE_HairColor gets `Color1` from `recipe.colors[colorSlot]`.
   Lights come from the rig and are evaluated per vertex in the shader.

## Known gaps

- Texture transforms (NSB `UVSet*` matrices c27/c31) are ignored; FORMAT.md has no field for them.
- COE_Blender's fixed-function stages are approximated (A, then B/C by x = lerp by alpha,
  a = add, s = subtract, then × diffuse); BlenderS shadow-map term and COE_1BitTexture are not
  modelled; `Mul_1Bit` draws as `Mul_A`.
- Gamebryo draws objects without an NiAlphaProperty in scene-graph order; three sorts opaque objects
  front to back. Blended objects are sorted back to front by object centre, like Gamebryo's
  NiAlphaAccumulator, but not per triangle.
- No COE_Glow post pass (the game's half-res bloom in charamake), no fog.
- Point lights: all rig lights for every part (nearest first); the game picks the 3 nearest per
  model within `5/linear` + bound radius, which only matters for far-away lights.
- MSAA from the browser, not a deterministic SSAA; fine for the viewer, revisit for golden images.
