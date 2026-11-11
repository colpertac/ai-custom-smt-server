# Avatar asset format

Contract between the converter (`tools/convert.py`, NIF → glTF) and anything that draws
avatars (`viewer/`, later the website and the render worker). All output goes under
`build/assets/` (gitignored). Units and axes stay Gamebryo: centimetres-ish, Z up, character
faces −Y. The viewer converts to three.js Y-up once, at the avatar root
(Gamebryo (x, y, z) → three (x, z, −y), i.e. rotate −90° about X).

## Files

```
build/assets/
  manifest.json                      version, uvFlip, counts, skeletons, poses, parts (+ warnings), failures
  skeletons/<CModelData name>.glb    e.g. W_01_Bone_Ctype_01_OK.glb
  poses/<kf stem>.json               e.g. W_03_510_Common_SampleStay_01.json
  parts/<Folder>/<file stem>.glb     e.g. parts/Hair/W_01_Hair_Lg_006.glb
  rig.json                           portrait camera and lights (from charamake_018)
```

A recipe (the JSON `resolve.py --json` prints per character) maps to files like this:

- `skeleton.nif` `Bone/X.nif` → `skeletons/X.glb`; `skeleton.scale` → uniform scale on the avatar root.
- `skeleton.idle` `Bone/Y.kf` → `poses/Y.json`.
- `parts[Folder].file` `Z.nif` (when `file` is set and `exists`) → `parts/<Folder>/Z.glb`.
- `colors.hair`, `colors.eyeRight`, `colors.eyeLeft` → RGBA in 0..1 for the `Color1` slot below.

## Skeleton GLB

- One scene. Root node = the skeleton NIF's scene root. Every NiNode below it becomes a glTF node
  with the NIF node's exact name (Shift-JIS names decoded as cp932) and its bind-pose local
  transform (translation, rotation quaternion, uniform scale).
- No meshes. Hidden helper geometry is dropped.
- Names are unique within a skeleton; parts and poses refer to bones by name.
- Root extras: `{"source": "Bone/X.nif", "modelId": 200, "rootScale": 1.0}`.

## Pose JSON

```json
{"source": "W_03_510_Common_SampleStay_01.kf", "time": 0,
 "bones": {"Bip01 Spine": {"t": [x, y, z], "r": [x, y, z, w], "s": 1.0}, ...}}
```

Frame-0 local transforms for every channel the KF animates (B-spline, Euler and quaternion keys
already evaluated). Fields are optional per bone: only animated components are present. Apply
them over the skeleton's bind-pose locals.

`r` from a quaternion channel is the KF value **as stored**: 206 channels are off unit length by
up to 0.04 %, and Gamebryo's quaternion → matrix (like three.js `Matrix4.compose`) uses it
unnormalised. Do not normalise it (on `W_03_510` it moves the feet 0.14 units). The file also
carries `"sequence"` (the NiControllerSequence name).

## Part GLB

Only the part's **stem subtree** is exported: the node whose name equals the file stem
(`ImagineClient.exe` 0xae8230; the first AV object depth-first — 11 files have 2–3 nodes with that
name and a NiMaterialProperty can carry it too). Everything above it (Scene Root, embedded Bip01 copy) is dropped,
and so is any geometry outside the stem (some faces and earrings have it; the game never shows it).
Inside the stem, skip `Flags & 1` (hidden) geometry, nodes named `&*` (effect spawners) and NiHide.

Root node extras:

```json
{"stem": "W_01_Eyes_Skin_002", "slotToken": "Eyes",
 "attach": "skinned" | "HEyes" | "HR" | ...,
 "source": "Eyes/W_01_Eyes_Skin_002.nif", "meshes": 4, "triangles": 96, "warnings": [...]}
```

`warnings` is present only when something was dropped or approximated. A part whose stem is
itself hidden (`{M,W}_01_RingL_RgL_006`: NiHide stem, effect spawner only) is a GLB with the root
node and no meshes — the client draws nothing for it.

`slotToken` is the filename's third `_` token. `attach` is `"skinned"` for tokens Face, Body,
GloveL, GloveR, Legs, Feet, ExtraA, NeckM, Hair, HairAcceM, ExtraD, and otherwise `"H" + slotToken`.

### Skinned parts (`attach: "skinned"`)

- Each skinned mesh has a glTF `skin`. Its `joints` are nodes in this file named exactly like the
  skeleton bones (flat, identity transforms; they are placeholders the viewer rebinds by name).
- `inverseBindMatrices[i]` = that bone's `NiSkinData` *Skin Transform* (skin space → bone space).
  The NiSkinData overall *Skin Transform* is **not** applied (it is already folded in).
- Vertex positions and normals are in skin space as stored in the NIF.
- `JOINTS_0` / `WEIGHTS_0`: the top 4 weights per vertex, renormalized to sum 1. Weights come from
  `NiSkinData` vertex weights, or from `NiSkinPartition` when NiSkinData has none.
- Draw rule: world = Σ wᵢ · BoneWorldᵢ · IBMᵢ · v, with no mesh/node transform applied
  (three.js: `bindMode = "detached"`, identity `bindMatrix`). Every node in a skinned part (root,
  mesh nodes, joints) has an identity transform; mesh nodes are direct children of the root.
- Ties in the top-4 cut drop the lowest bone index first, which is what the NIFs' own
  NiSkinPartitions (4 weights per vertex) do; 162 of 3.3 M partition vertices still differ
  (partition bone limits). A vertex with no weights at all (1, in `W_01_Body_Fb_D002`) is bound to
  joint 0 with weight 1. All skinned meshes have NiSkinData weights, so the NiSkinPartition
  fallback is never needed (and not implemented).

### Rigid parts (`attach: "H…"`)

- The stem subtree keeps its node hierarchy and local transforms; the stem's own local transform is
  the grip/offset. The viewer parents the stem node under the skeleton node named `attach`.
- Rigid geometry inside a skinned-token file never happens; skinned geometry inside a rigid-token
  file (the 8 `*_HairAcce_CaM_00x` files) is exported as rigid, matching the game.

### Geometry

- NiTriShape triangles, or NiTriStrips converted to a triangle list (drop degenerate triangles,
  alternate winding).
- Attributes: `POSITION`, `NORMAL`, `TEXCOORD_0` (and `TEXCOORD_1`, `TEXCOORD_2` when present),
  `COLOR_0` (RGBA float) only when the NIF has vertex colours that are not all white,
  `JOINTS_0`/`WEIGHTS_0` for skinned meshes. UVs are copied unchanged: D3D and glTF both put
  (0, 0) at the top-left texel and the PNGs are stored top row first, so no V flip
  (`manifest.json` `uvFlip`; three.js GLTFLoader's `flipY = false` textures sample correctly).
- Geometry without a shader (57 meshes, mostly 3ds Max "Editable Mesh" leftovers) is exported
  with `shader: null`; render.py skips it.

### Materials

One glTF material per mesh. Standard fields: `pbrMetallicRoughness.baseColorTexture` = base texture,
`alphaMode` and `alphaCutoff` from NiAlphaProperty, `doubleSided` from NiStencilProperty.
Everything the COE shaders need goes in `extras`:

```json
{"shader": "COE_HairColor", "technique": 0,
 "baseTexture": 0, "baseUV": 0, "detailTexture": 1, "detailUV": 1,
 "decalTexture": null, "decalUV": null,
 "colorSlot": "hair" | "eyeRight" | "eyeLeft" | null,
 "ambient": [r, g, b], "diffuse": [r, g, b], "emissive": [r, g, b], "specular": [r, g, b],
 "glossiness": 0, "alpha": 1.0,
 "alphaBlend": true, "srcBlend": 6, "dstBlend": 7, "alphaTest": true, "alphaTestRef": 1,
 "vertexColors": false, "modelColor": [1, 1, 1, 1]}
```

- `shader` is the NIF *Material Data* shader name (`COE_Skinning`, `COE_SkinningDX`,
  `COE_HairColor`, `COE_Blender`, `COE_BlenderS`, `COE_Effecter`, …) or null; `technique` is its
  implementation index (*Shader Extra Data*; −1 = default).
- Texture slots are the NiTexturingProperty slots as stored. No COE_SkinningDX mesh uses the
  Decal 0 slot: its second texture (5 meshes, technique 4) is the **Detail** slot on UV 1. Decal 0
  appears only on 8 COE_Blender/COE_Effecter meshes (techniques 16/28).
- Extra fields the data needed: `alphaTestFunc` (TestFunction, 4 = GREATER), `specularEnabled`
  (NiSpecularProperty), `vertexColors` (COLOR_0 present), `vertexColorMode` (NiVertexColorProperty
  source mode: 0 ignore, 1 emissive, 2 ambient+diffuse), `zTest`/`zWrite` (NiZBufferProperty),
  and, only when the NIF has one, `textureTransforms: {"base"|"detail"|"decal": {"translation",
  "scale", "rotation", "method", "center"}}` (Gamebryo TexDesc transform, 601 slots).
  Defaults when a property is absent: material = nif.xml defaults, alpha flags 0x12EC (no blend,
  no test), z test/write on.
- glTF `alphaMode`: `BLEND` when alpha blending is on, else `MASK` (cutoff = max(ref, 1)/255)
  when alpha test is on, else opaque. `doubleSided` = NiStencilProperty draw mode BOTH.
- `colorSlot`: `hair` for COE_HairColor meshes in Hair files; for Eyes files `eyeRight` when the mesh
  name contains `<stem>_R`, `eyeLeft` for `<stem>_L` (0xae75b0); otherwise null.
- Texture indices refer to the glTF `textures` array; `*UV` is the texture coordinate set.

### Textures

Embedded PNG images (RGBA 8-bit, top mip only), decoded from NiPixelData DXT1/3/5 or RGBA.
External weapon textures are read from `Avatar/L` / `Avatar/R` (case-insensitive name match).
Samplers: wrap/clamp from the NIF texture flags, linear filtering. No colour-space conversion:
the game did none, so the viewer must treat textures and output as non-sRGB.

## rig.json

Portrait camera and lights from `Event/PolygonMovie/Model/charamake_018.nif`, in the avatar's
local three.js frame (avatar at origin facing +Z). Colours already multiplied by dimmer. Point
light falloff is `max(1 − 0.25 · linear · d, 0)`. See `AI/avatar-renderer.md` for derivation.

- `camera`: the portrait camera (cam_00_full position and vertical FOV, aspect 0.75, re-aimed at
  the body centre (0, 88, 0)), with `game_exact_target`, `bust` and `face` as in the notes.
- `cameras.{full,bust,face}`: the three NIF cameras at frame 0 — `fov_deg` (vertical), `aspect`
  (4:3), `near`, `far`, `position`, `direction`, `up`, and `target` = the point on the view ray
  closest to the body centre.
- `lights`: one directional (`direction_travel`) and the point lights that reach the avatar
  (`position`, `linear`, `constant`, `quadratic`); `lights_out_of_range` lists the key omni, whose
  falloff is zero 11,850 units away. `ambient`, `falloff`, and `game_view` (4:3 render crop).
