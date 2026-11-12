# Avatar viewer

three.js viewer, shared `buildScene()` and the deterministic headless render worker for converted
avatars (milestones M2–M4).

| File | What |
| --- | --- |
| `buildScene.js` | `buildScene(recipe, {assetBase, rig?, pose?, preset?, background?})` → `{scene, camera, avatarRoot, pose, parts, setPreset, update, …}`; also `createRenderer`, `renderFrame` (canvas or render target, optional glow), `renderPixels` (SSAA offscreen render → RGBA), `PRESETS`, `FRONT_CAMERA`, `recipeAssets`, `DEFAULT_RIG` |
| `glow.js` | `CoeGlow`: the client's COE_Glow half-resolution post pass; `glowKernel()` |
| `../shaders/coeMaterials.js` | COE_* shaders as `ShaderMaterial`s (per-vertex lighting, NSB stage chains, render states) |
| `render.mjs` | CLI: recipe → PNG through `render.html` in chrome-headless-shell (SwiftShader) |
| `renderCore.mjs` | `AvatarRenderer` (persistent server + browser + page, relaunch on crash), dependency lookup, PNG encoder; used by `render.mjs` and `../worker/` |
| `render.html` | Headless page used by `renderCore.mjs` (imports three from `/vendor/three/`, served locally); fresh canvas + WebGL context per image, resources released afterwards |
| `index.html` | Interactive viewer / screenshot page |
| `shadertest.html` | Compiles and draws every material variant on spheres (no assets needed) |

three.js is pinned to `0.170.0`. `index.html` and `shadertest.html` use a jsDelivr import map;
`render.html` gets the same version from a local `three` package via `render.mjs`. `buildScene.js`,
`glow.js` and `coeMaterials.js` import only `three` and `three/addons/…`, so a bundler resolves the
same specifiers from `node_modules`.

## Run

```bash
cd avatar/tools
python3 tables.py                    # once: decoded client tables
python3 convert.py all               # NIF → build/assets (see docs/FORMAT.md)
python3 recipe.py cat catm cat3      # → build/recipes/<name>.json
python3 -m http.server 8765 --directory ..   # serve avatar/
```

Open `http://localhost:8765/viewer/index.html?recipe=../build/recipes/catm.json`.

Query parameters: `recipe` (default `../build/recipes/cat.json`; `resolve.py --json` output also works),
`assets` (default `../build/assets/`), `w`/`h` (fixed canvas size at DPR 1, e.g. `w=768&h=925`),
`preset` (`front` default, `select`, `bust`, `face`), `pose` (`stance` | `idle`), `glow` (`0` | `1`;
default on for select/bust/face), `bg` (hex, default `27202e`), `aa=0`, `raw=1` (unlit base) / `raw=2`
(lighting only), `ui=0` (hide controls).

Controls: drag to orbit, wheel to zoom; preset, pose and glow buttons; "Raw base texture"; "Save PNG".
The page sets `window.renderDone = true` once everything is loaded and drawn (or `window.renderError`).

## Headless render (`render.mjs`)

```bash
node avatar/viewer/render.mjs avatar/build/recipes/catm.json avatar/build/renders/catm.png \
  [--preset front|select|bust|face] [--w 768 --h 925] [--ssaa 3] [--pose stance|idle] \
  [--glow on|off] [--bg '#27202e'] [--assets avatar/build/assets] [--times N]
```

- Starts a local HTTP server (avatar/, the recipe, the assets, three at `/vendor/three/`), launches
  chrome-headless-shell with `--use-angle=swiftshader --enable-unsafe-swiftshader` (WebGL2 on
  SwiftShader, no GPU), and calls `window.renderAvatar()` in `render.html`.
- `renderPixels`: antialias off, one `(w·ssaa)×(h·ssaa)` UnsignedByte render target, every texture
  uploaded (`initTexture`) and `compileAsync` resolved first, one frame (+ glow), `readRenderTargetPixels`,
  ssaa×ssaa box filter in JS (rounded integer mean), RGB PNG (Sub filter, zlib 9) written by node.
- Default size is 768×925 for `front` (the Wine portrait size) and 576×768 (the game's 3:4 crop) for the
  select cameras. Prints one JSON line per image with timings, then the GL renderer string.
- Dependencies are found locally, never downloaded: `PLAYWRIGHT_CORE` (a playwright-core package dir),
  `CHROME` (executable; default newest `~/.cache/ms-playwright/chromium_headless_shell-*`), `THREE_DIR`
  (three@0.170.0 package dir). Without them it searches `website/node_modules`, `~/.npm/_npx/*` and the
  known local checkouts.
- Determinism: the same recipe, assets, Chromium build and three version give byte-identical PNGs
  (checked across separate runs, with and without glow). About 0.3–0.4 s per image at ssaa 3 plus
  ~0.2 s browser launch on this box.

## Recipe flow

`world DB → resolve.py rules → recipe.py → build/recipes/<name>.json → buildScene`

`buildScene` maps the recipe to assets exactly as `docs/FORMAT.md` says: `skeleton.nif` →
`skeletons/<stem>.glb`, the pose KF → `poses/<stem>.json`, every part with `file` and `exists` →
`parts/<Folder>/<stem>.glb`, and `rig.json` (falls back to the built-in charamake_018 rig).

Pose: `pose: 'stance'` uses `skeleton.stance` (the weapon-class select / in-world stay, e.g.
`M_02_231_HandGun_DefaultStay_01`) and is the default when the recipe has it; otherwise, or with
`pose: 'idle'`, `skeleton.idle` (510 SampleStay). A pose object, a pose URL or `false` (bind pose) also work.

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
5. Materials from `extras` (see below). COE_HairColor gets `Color1` from `recipe.colors[colorSlot]`.
6. Per part (each CiAvatarParts is a model in the client): world bound of the deformed vertices, then
   point lights as the client picks them (0xad6d30): range `5/linear` (0xad2b30) + bound radius must
   reach the bound centre, nearest first, at most 3; each shader uses the first N.
7. Draw order: opaque meshes in scene-graph (depth-first) order, like Gamebryo's unsorted list;
   NiAlphaProperty-blended meshes after them, back to front by bound-centre depth along the view
   direction (NiAlphaAccumulator), re-sorted in `update()`.

## Framing

| Preset | Camera |
| --- | --- |
| `front` (default) | Straight-on full body like the Wine studio armory portraits: vFOV 30°, eye (x, 140.7, 472.9) → (x, 106.9, 0), x = posed `Bip01 Spine` x. Fitted to the catm capture (head top row 215, soles row 871 of 925). Glow off |
| `select` | charamake_018 `cam_00_full` (vFOV 38.55°), re-aimed at the body centre (`rig.camera`). Glow on |
| `bust` | `cam_01_bust` position and FOV, aimed at the posed chest (Spine1/Neck x, z; the game's target height). Glow on |
| `face` | `cam_02_up` position and FOV, aimed at the posed face (Head → HeadNub 45%). Glow on |

Background: `#27202e` (the Wine captures) unless `background` / `--bg` says otherwise.

## Materials (`coeMaterials.js`)

From the NSB render and texture-stage states (decoded with Gamebryo's NSB enums: TOP_SELECTARG1 = 1,
MODULATE = 3, ADD = 6, SUBTRACT = 9, BLENDTEXTUREALPHA = 12; TA_CURRENT = 0, DIFFUSE = 1, TEXTURE = 5,
TFACTOR = 6) and the shader disassembly:

| Shader | Lights (dir + point) | Pixel stage |
| --- | --- | --- |
| COE_HairColor | 1 + 3, normal not renormalised | `(Base + Detail·Color1)·oD0` |
| COE_Skinning (VS20) | 1 + 2 | `(Base.a > 0.94 ? Base : 0)·oD0` |
| COE_SkinningDX | 1 + 1, specular | `(A op B)·oD0 + spec`, alpha A.a with B |
| COE_Blender | 1 + 3, not renormalised | fixed function: rgb = A, B/C by op (x = BLENDTEXTUREALPHA, a = ADD, s = SUBTRACT, each stage saturated), × oD0; alpha A.a·oD0.a. `Mul_1Bit` = COE_1BitTexture.pso cutout; `Mul_A_Specular` = A·oD0 + spec (emissive added twice, as Blender1_specular.vso does) |
| COE_BlenderS | 1 + 3 | BlenderS_*.pso: same ops unclamped, alpha A.a, × oD0 × shadow (1: unshadowed) |
| COE_Effecter | none: `(MatDiffuse + MatEmissive)·vcol` | COE_Blender stages; `Mul_NoTexture` = fixed-function diffuse |
| none | D3D fixed-function T&L (`vertexColorMode`: 1 emissive, 2 ambient+diffuse; 1/(c + l·d + q·d²)) | `Base·diffuse`, NiAlphaProperty blend + alpha test |

- Texture transforms (`extras.textureTransforms`) are applied in the vertex shader per slot (base,
  detail, decal) for every shader whose VS uses `InvTexTransform*` (all but COE_Skinning):
  `uv' = R·S·(uv − center) + center + translation`.
- Render states: the NSB's override the NIF properties. Every COE technique blends (Mul =
  SrcAlpha/InvSrcAlpha, Add = SrcAlpha/One, Sub = reverse-subtract) and alpha-tests GREATER 1 (8-bit);
  Blender/BlenderS Add/Sub and all Effecter techniques disable Z writes; otherwise `zTest`/`zWrite`
  come from NiZBufferProperty. `alphaTest`/`alphaTestFunc`/`alphaTestRef` apply to shader-less meshes.
- `vertexColorMode` only matters on the fixed-function path; the COE vertex shaders always multiply
  the vertex colour (white when the mesh has none). `specularEnabled: false` zeroes the specular term.

## Glow (`glow.js`)

COE_Glow as charamake sets it up (0xd45b90 → 0xb35d90(8, 0.9), GlayScale coefficient (1,1,1), under/over 0),
at half the output resolution: source = box-downsampled scene · `min(r+g+b, 1)`; separable 8-tap
point-sampled blur with offsets −4…+3 texels and weights `0.9·(0.06·e^(−0.18x²/3.5²) + 0.11·e^(−4.5x²/3.5²))`,
x = i − 3.5 (kernel type 0, 0xb402b0/0xb40000); result added (ONE/ONE, bilinear upsample) to the frame.
Pixels equal to the flat background colour are excluded from the source by default (the game glows its
charamake set; we keep the portrait background exact).

## Known gaps

- Texture-transform composition order and rotation sign are not in the NSBs (the engine computes the
  matrix); only 40 of 601 slots are not identity.
- Light sort key: the client sorts in-range lights by distance from an object at `manager+8`
  (unresolved; possibly the camera), not necessarily the model centre. Matters only for COE_SkinningDX
  (1 point light) and COE_Skinning when 3+ lights are in range.
- Glow kernel base UV offset and weight threshold are taken as 0; D3D9 half-pixel alignment of the taps
  is not modelled.
- No fog; no shadow map (BlenderS is drawn unshadowed). Vertex colours are not quantised to 8 bits.
- Wine portraits use in-world zone lighting; the renderer only has the charamake rig.
