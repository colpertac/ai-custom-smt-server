// buildScene(recipe) → three.js scene of one SMT IMAGINE avatar, from the converted assets described
// in avatar/docs/FORMAT.md. Framework-free ES module: imports only 'three' and
// 'three/addons/...' (resolved by an import map in the browser, or by the bundler in the site),
// so the same file runs in the viewer, the Next.js site and the headless render worker (render.mjs).
//
//   const built = await buildScene(recipe, { assetBase, preset: 'front', pose: 'stance' });
//   const renderer = createRenderer({ canvas, width, height });
//   renderFrame(renderer, built);                                  // canvas, glow per preset
//   const { data } = await renderPixels(renderer, built, { width: 768, height: 925, ssaa: 3 });
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCoeUniforms, setCoeLights, makeCoeMaterial, describeCoe, prepareTexture, selectPointLights,
  setMaterialLights } from '../shaders/coeMaterials.js';
import { CoeGlow } from './glow.js';

// Portrait rig from charamake_018 (AI/avatar-renderer.md); used when rig.json is unavailable.
export const DEFAULT_RIG = {
  camera: {
    fov_deg: 38.55, aspect: 0.75, near: 10, far: 20000,
    position: [122.5, 65.4, 305.9], target: [0, 88, 0], up: [0, 1, 0],
    bust: { fov_deg: 32.52, position: [82.5, 105.6, 207.4], target: [-27.9, 125.4, 16.1] },
    face: { fov_deg: 30.54, position: [43.3, 144.4, 114.8], target: [-16.8, 151.2, 9.6] },
  },
  lights: [
    { type: 'directional', color: [0.2549, 0.2431, 0.2314], direction_travel: [-0.9107, -0.413, -0.0049] },
    { type: 'point', name: 'Omni01', color: [0.5882, 0.5882, 0.5569], position: [-69.0, 156.0, 104.4], linear: 0.018294 },
    { type: 'point', name: 'Omni02', color: [0.7843, 0.7843, 0.7843], position: [88.0, 266.3, 147.2], linear: 0.0076434 },
  ],
  ambient: [0.4392, 0.4706, 0.4706],
};

/**
 * Framing presets. `select`, `bust`, `face`: the character-select cameras (charamake_018 cam_00_full,
 * cam_01_bust, cam_02_up) from rig.camera; select is re-aimed at the body centre (rig.json), bust and
 * face keep the game's camera position and FOV but aim at the posed chest / face so the subject is
 * centred. `front`: straight-on full body matching the Wine studio armory portraits (768×925, subject
 * centred, feet near the bottom); camera fixed relative to the avatar root, like the in-world camera.
 * `glow`: whether the COE_Glow post pass is on by default.
 */
export const PRESETS = {
  front: { glow: false, aspect: 768 / 925 },
  select: { glow: true, aspect: 0.75 },
  bust: { glow: true, aspect: 0.75 },
  face: { glow: true, aspect: 0.75 },
};
export const DEFAULT_PRESET = 'front';
// Fitted to the Wine capture of catm (768×925): head top at row 215, soles at row 871, 4° pitch.
// x follows the posed spine so every stance is centred.
export const FRONT_CAMERA = { fov_deg: 30, position: [0, 140.7, 472.9], target: [0, 106.9, 0] };
// Wine studio capture background (website/public/armory/portraits/*.png: #27202e)
export const DEFAULT_BACKGROUND = '#27202e';

const PRESET_ALIASES = { portrait: 'select', full: 'select' };
export const presetName = name => PRESET_ALIASES[name] || (PRESETS[name] ? name : DEFAULT_PRESET);

// CiAvatar slot tokens that skin to the skeleton (0xb19c50); others attach under "H" + token.
const SKINNED_TOKENS = new Set(['Face', 'Body', 'GloveL', 'GloveR', 'Legs', 'Feet', 'ExtraA', 'NeckM',
  'Hair', 'HairAcceM', 'ExtraD']);

const stemOf = p => p.split('/').pop().replace(/\.[^.]+$/, '');
const join = (base, rel) => base.replace(/\/?$/, '/') + rel;

/** '#rrggbb' | [r, g, b] (0..1) → [r, g, b] linear (no colour management anywhere). */
export function parseColor(c) {
  if (Array.isArray(c)) return c.slice(0, 3).map(Number);
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c ?? DEFAULT_BACKGROUND).trim());
  if (!m) throw new Error(`bad colour ${c}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/** Which pose a recipe gets: 'stance' (skeleton.stance, the weapon-class select / in-world stay)
 *  when present, else 'idle' (skeleton.idle, 510 SampleStay). */
export function resolvePose(recipe, pose) {
  const sk = recipe.skeleton || {};
  if (pose === 'idle') return { name: 'idle', kf: sk.idle || null };
  if (pose === 'stance' || pose == null) {
    if (sk.stance) return { name: 'stance', kf: sk.stance };
    return { name: 'idle', kf: sk.idle || null, fallback: pose === 'stance' };
  }
  return null;   // explicit object / URL / false handled by the caller
}

/** Map a recipe (resolve.py --json, one character) to asset URLs per FORMAT.md. */
export function recipeAssets(recipe, assetBase, pose) {
  const sk = recipe.skeleton || {};
  const parts = [];
  for (const [folder, p] of Object.entries(recipe.parts || {})) {
    if (!p || !p.file || p.exists === false) continue;
    parts.push({ folder, file: p.file, stem: stemOf(p.file), url: join(assetBase, `parts/${folder}/${stemOf(p.file)}.glb`) });
  }
  const sel = resolvePose(recipe, pose);
  return {
    skeleton: sk.nif ? join(assetBase, `skeletons/${stemOf(sk.nif)}.glb`) : null,
    pose: sel && sel.kf ? join(assetBase, `poses/${stemOf(sel.kf)}.json`) : null,
    poseInfo: sel,
    rig: join(assetBase, 'rig.json'),
    parts,
  };
}

/** Index a loaded glTF's nodes by their original (NIF) names. GLTFLoader sanitizes Object3D.name
 *  (spaces → '_', drops '.:/[]'), so names are recovered from the parser's node associations. */
function indexNodes(gltf) {
  const nodes = gltf.parser.json.nodes || [];
  const byName = new Map();
  gltf.scene.traverse(o => {
    const a = gltf.parser.associations.get(o);
    if (a && a.nodes !== undefined) {
      const n = nodes[a.nodes].name ?? o.name;
      o.userData.nifName = n;
      if (!byName.has(n)) byName.set(n, o);
    }
  });
  return byName;
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/** Camera parameters {fov_deg, position, target, up, near, far} for a preset. */
export function presetCamera(rig, name, anchors = {}) {
  const base = rig.camera || DEFAULT_RIG.camera;
  const p = presetName(name);
  if (p === 'front') {
    const dx = anchors.front ? anchors.front[0] : 0;
    return { near: 10, far: 20000, up: [0, 1, 0], ...FRONT_CAMERA,
      position: [FRONT_CAMERA.position[0] + dx, FRONT_CAMERA.position[1], FRONT_CAMERA.position[2]],
      target: [FRONT_CAMERA.target[0] + dx, FRONT_CAMERA.target[1], FRONT_CAMERA.target[2]] };
  }
  if (p === 'bust' || p === 'face') {
    const v = { ...base, ...(base[p] || DEFAULT_RIG.camera[p]) };
    const a = anchors[p];
    if (a) v.target = a;   // re-aimed: centred on the posed chest / face
    return v;
  }
  return base;
}

/** Apply camera preset 'front' | 'select' | 'bust' | 'face'. Returns the target. */
export function applyCameraPreset(camera, rig, name = DEFAULT_PRESET, anchors = {}) {
  const p = presetCamera(rig, name, anchors);
  camera.fov = p.fov_deg ?? p.fov ?? 38.55;
  camera.near = p.near ?? 10;
  camera.far = p.far ?? 20000;
  camera.up.fromArray(p.up ?? [0, 1, 0]);
  camera.position.fromArray(p.position);
  const target = new THREE.Vector3().fromArray(p.target);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  return target;
}

/** A WebGLRenderer configured like the game: no colour management, no tone mapping. */
export function createRenderer({ canvas, width, height, antialias = true, pixelRatio = 1, preserveDrawingBuffer = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, preserveDrawingBuffer, alpha: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(pixelRatio);
  if (width && height) renderer.setSize(width, height, false);
  return renderer;
}

/**
 * @param {object} recipe  one character from resolve.py --json (build/recipes/<name>.json)
 * @param {object} opts
 * @param {string} opts.assetBase   URL of build/assets/ (trailing slash optional)
 * @param {object|string} [opts.rig]   rig object or URL; default assetBase/rig.json, then DEFAULT_RIG
 * @param {'stance'|'idle'|object|string|false} [opts.pose]  'stance' (default when the recipe has
 *        skeleton.stance), 'idle', a pose JSON object or URL, or false for the bind pose
 * @param {string} [opts.preset]    front (default) | select | bust | face
 * @param {number} [opts.aspect]    camera aspect (default the preset's)
 * @param {string|number[]} [opts.background] clear colour, '#rrggbb' or linear RGB (default #27202e)
 * @param {(msg:string)=>void} [opts.onWarning]
 */
export async function buildScene(recipe, opts = {}) {
  const { assetBase = '../build/assets/' } = opts;
  let preset = presetName(opts.preset);
  const warnings = [];
  const warn = msg => { warnings.push(msg); (opts.onWarning || console.warn)(msg); };
  const assets = recipeAssets(recipe, assetBase, opts.pose === 'idle' || opts.pose === 'stance' ? opts.pose : undefined);
  const loader = opts.loader || new GLTFLoader();

  // rig
  let rig = opts.rig;
  if (typeof rig === 'string') rig = await fetchJSON(rig);
  if (!rig) {
    try { rig = await fetchJSON(assets.rig); } catch (e) { warn(`rig.json unavailable (${e.message}); using built-in rig`); rig = DEFAULT_RIG; }
  }

  // skeleton + pose + parts, fetched in parallel
  if (!assets.skeleton) throw new Error('recipe has no skeleton');
  // pose: 'stance' | 'idle' (from the recipe), a pose object, a pose URL, or false (bind pose)
  let poseInfo, poseSrc = null;
  if (opts.pose === false) poseInfo = { name: 'bind' };
  else if (opts.pose && typeof opts.pose === 'object') { poseInfo = { name: 'custom' }; poseSrc = opts.pose; }
  else if (typeof opts.pose === 'string' && opts.pose !== 'stance' && opts.pose !== 'idle') { poseInfo = { name: 'custom', url: opts.pose }; poseSrc = opts.pose; }
  else {
    poseInfo = assets.poseInfo;
    poseSrc = assets.pose;
    if (poseInfo.fallback) warn('pose: recipe has no skeleton.stance; using the idle pose');
  }
  const posePromise = !poseSrc ? Promise.resolve(null) : typeof poseSrc === 'object' ? Promise.resolve(poseSrc)
    : fetchJSON(poseSrc).catch(e => { warn(`pose: ${e.message}; using bind pose`); return null; });
  const partPromises = assets.parts.map(p => loader.loadAsync(p.url).then(g => ({ ...p, gltf: g }),
    e => { warn(`part ${p.folder}/${p.stem}: ${e.message || e}`); return null; }));
  const [skelGltf, pose, ...parts] = await Promise.all([loader.loadAsync(assets.skeleton), posePromise, ...partPromises]);

  const background = parseColor(opts.background ?? DEFAULT_BACKGROUND);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color().setRGB(background[0], background[1], background[2], THREE.LinearSRGBColorSpace);

  // Gamebryo Z-up → three.js Y-up once, at the avatar root: (x, y, z) → (x, z, −y).
  const avatarRoot = new THREE.Group();
  avatarRoot.name = 'avatar';
  avatarRoot.rotation.x = -Math.PI / 2;
  avatarRoot.scale.setScalar(recipe.skeleton.scale ?? 1);
  scene.add(avatarRoot);

  const bones = indexNodes(skelGltf);
  const skelRoots = [...skelGltf.scene.children];
  for (const c of skelRoots) avatarRoot.add(c);
  const skelRoot = skelRoots[0] || avatarRoot;

  // pose: frame-0 locals over bind-pose locals
  if (pose && pose.bones) {
    let missing = 0;
    for (const [name, b] of Object.entries(pose.bones)) {
      const n = bones.get(name);
      if (!n) { missing++; continue; }
      if (b.t) n.position.fromArray(b.t);
      if (b.r) n.quaternion.fromArray(b.r);
      if (b.s != null) n.scale.setScalar(b.s);
    }
    if (missing) warn(`pose: ${missing} channel(s) name bones not in the skeleton`);
    poseInfo = { ...poseInfo, source: pose.source };
  }

  const uniforms = createCoeUniforms();
  setCoeLights(uniforms, rig);

  const attached = [];
  for (const part of parts) {
    if (!part) continue;
    try {
      attached.push(await attachPart(part, { bones, skelRoot, recipe, uniforms, warn }));
    } catch (e) {
      warn(`part ${part.folder}/${part.stem}: ${e.message || e}`);
    }
  }
  scene.updateMatrixWorld(true);

  // Bounds (deformed, world space), per-model point lights, Gamebryo draw order.
  const meshes = [];
  for (const a of attached) {
    const box = new THREE.Box3();
    for (const m of a.meshes) {
      m.userData.coeBounds = meshWorldBounds(m);
      if (!m.userData.coeBounds.box.isEmpty()) box.union(m.userData.coeBounds.box);
    }
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    let radius = 0;
    for (const m of a.meshes) radius = Math.max(radius, m.userData.coeBounds.maxDist(center));
    const lights = selectPointLights(rig, center, radius);
    a.lights = lights.map(l => l.name);
    for (const m of a.meshes) setMaterialLights(m.material, lights);
  }
  let order = 0;
  scene.traverse(o => { if (o.isMesh) { o.userData.coeOrder = order++; meshes.push(o); } });
  for (const m of meshes) if (!m.material.transparent) m.renderOrder = m.userData.coeOrder;
  const transparent = meshes.filter(m => m.material.transparent);

  // anchors for the re-aimed bust / face cameras (avatar is at the origin facing +Z)
  const wp = name => bones.get(name)?.getWorldPosition(new THREE.Vector3());
  const anchors = {};
  const head = wp('Bip01 Head'), nub = wp('Bip01 HeadNub'), spine1 = wp('Bip01 Spine1'), neck = wp('Bip01 Neck');
  const spine = wp('Bip01 Spine');
  if (spine) anchors.front = [spine.x, 0, 0];
  if (head && nub) anchors.face = head.clone().lerp(nub, 0.45).toArray();
  if (spine1 && neck) {
    const base = rig.camera || DEFAULT_RIG.camera;
    const by = (base.bust || DEFAULT_RIG.camera.bust).target[1];
    anchors.bust = [(spine1.x + neck.x) / 2, by * (recipe.skeleton.scale ?? 1), (spine1.z + neck.z) / 2];
  }

  const camera = new THREE.PerspectiveCamera(38.55, opts.aspect ?? PRESETS[preset].aspect, 10, 20000);
  let target = applyCameraPreset(camera, rig, preset, anchors);
  scene.add(camera);

  const viewDir = new THREE.Vector3();
  const api = {
    scene, camera, avatarRoot, rig, uniforms, warnings, target, background, pose: poseInfo, parts: attached,
    get preset() { return preset; },
    /** Switch camera preset; returns the new orbit target. */
    setPreset: name => { preset = presetName(name); return (api.target = target = applyCameraPreset(camera, rig, preset, anchors)); },
    /** Debug view: false/0 normal, true/1 unlit base texture, 2 per-vertex lighting only. */
    setRawBase: mode => { uniforms.uRawBase.value = +mode || 0; },
    /** Call before each render: eye position (specular) and the back-to-front order of blended
     *  meshes by bound centre depth along the view direction (Gamebryo NiAlphaAccumulator). */
    update: () => {
      camera.updateMatrixWorld();
      uniforms.uEyePos.value.setFromMatrixPosition(camera.matrixWorld);
      camera.getWorldDirection(viewDir);
      const keyed = transparent.map(m => ({ m, d: m.userData.coeBounds.center.dot(viewDir) }));
      keyed.sort((a, b) => b.d - a.d || a.m.userData.coeOrder - b.m.userData.coeOrder);
      keyed.forEach((k, i) => { k.m.renderOrder = order + i; });
    },
  };
  api.update();
  return api;
}

/** World-space AABB of a mesh's deformed vertices (skinned: Σ w·BoneWorld·IBM·v; rigid: matrixWorld). */
function meshWorldBounds(mesh) {
  const pos = mesh.geometry.getAttribute('position');
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const pts = [];
  if (pos) {
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, v);   // identity bindMatrix → world
      else v.applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(v);
      pts.push(v.x, v.y, v.z);
    }
  }
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  return {
    box, center,
    maxDist: c => { let r = 0; for (let i = 0; i < pts.length; i += 3) r = Math.max(r, Math.hypot(pts[i] - c.x, pts[i + 1] - c.y, pts[i + 2] - c.z)); return r; },
  };
}

async function attachPart(part, { bones, skelRoot, recipe, uniforms, warn }) {
  const { gltf } = part;
  const nodes = indexNodes(gltf);
  // the stem: the node carrying {stem, slotToken, attach} extras (normally the scene's only root)
  let stem = null;
  gltf.scene.traverse(o => { if (!stem && o.userData && o.userData.attach !== undefined) stem = o; });
  stem = stem || nodes.get(part.stem) || (gltf.scene.children.length === 1 ? gltf.scene.children[0] : gltf.scene);
  const token = stem.userData.slotToken || part.file.split('_')[2];
  const attach = stem.userData.attach || (SKINNED_TOKENS.has(token) ? 'skinned' : 'H' + token);
  stem.name = stem.name || part.stem;
  stem.userData.part = { folder: part.folder, file: part.file, attach };

  const meshes = [];
  stem.traverse(o => { if (o.isMesh) meshes.push(o); });

  if (attach === 'skinned') {
    // Rebind every skin by bone name to the avatar skeleton (0xae7a40); a missing bone fails the part.
    const placeholders = new Set();
    for (const m of meshes) {
      if (!m.isSkinnedMesh) continue;
      const old = m.skeleton;
      const nb = old.bones.map(b => {
        placeholders.add(b);
        const name = b.userData.nifName ?? b.name;
        const t = bones.get(name);
        if (!t) throw new Error(`skin bone "${name}" not in skeleton`);
        return t;
      });
      m.bind(new THREE.Skeleton(nb, old.boneInverses), new THREE.Matrix4());   // identity bindMatrix
      m.bindMode = THREE.DetachedBindMode;
    }
    for (const b of placeholders) {
      let hasMesh = false;
      b.traverse(o => { if (o.isMesh) hasMesh = true; });
      if (!hasMesh) b.removeFromParent();
    }
    skelRoot.add(stem);   // the game parents the stem under the skeleton root; skinning ignores it
  } else {
    const h = bones.get(attach);
    if (!h) warn(`part ${part.folder}/${part.stem}: attach node ${attach} not in skeleton; using root`);
    if (meshes.some(m => m.isSkinnedMesh)) warn(`part ${part.folder}/${part.stem}: skinned mesh in a rigid part`);
    (h || skelRoot).add(stem);   // keeps the stem's local transform (grip / offset)
  }

  for (const m of meshes) {
    m.material = await buildMaterial(m, gltf, recipe, uniforms, part, warn);
    m.frustumCulled = false;
  }
  return { folder: part.folder, file: part.file, stem: part.stem, meshes };
}

async function buildMaterial(mesh, gltf, recipe, uniforms, part, warn) {
  const src = mesh.material;
  const ex = src.userData || {};
  const d = describeCoe(ex);
  const geo = mesh.geometry;
  const uvAttr = k => geo.getAttribute(k ? `uv${k}` : 'uv');
  const tex = async slot => {
    if (!slot) return null;
    try { return prepareTexture(await gltf.parser.getDependency('texture', slot.texture)); } catch (e) {
      warn(`part ${part.folder}/${part.stem}: texture ${slot.texture}: ${e.message || e}`); return null;
    }
  };
  const [A, B, C] = await Promise.all([d.A ? tex(d.A) : Promise.resolve(src.map ? prepareTexture(src.map) : null), tex(d.B), tex(d.C)]);
  // UV sets → coeUvA/B/C attributes (avoids depending on three's uv1/uv2 shader plumbing)
  const setUv = (name, slot) => {
    const a = uvAttr(slot ? slot.uv : 0) || uvAttr(0);
    if (a) geo.setAttribute(name, a);
    else warn(`part ${part.folder}/${part.stem}: mesh ${mesh.name} has no UVs`);
  };
  setUv('coeUvA', d.A);
  if (B) setUv('coeUvB', d.B);
  if (C) setUv('coeUvC', d.C);
  const col = geo.getAttribute('color');
  if (col) geo.setAttribute('coeColor', col);

  const shader = ex.shader || '';
  if (shader && !['COE_HairColor', 'COE_Skinning', 'COE_SkinningDX', 'COE_Blender', 'COE_BlenderS', 'COE_Effecter'].includes(shader)) {
    warn(`part ${part.folder}/${part.stem}: shader ${shader} not implemented; using fixed-function fallback`);
  }
  const color1 = ex.colorSlot ? recipe.colors?.[ex.colorSlot] : null;
  if (ex.colorSlot && !color1) warn(`part ${part.folder}/${part.stem}: recipe has no colour "${ex.colorSlot}"`);
  const m = makeCoeMaterial({
    extras: { alphaBlend: src.transparent, ...ex }, maps: { A, B, C }, shared: uniforms, color1,
    vertexColor: !!col, doubleSided: src.side === THREE.DoubleSide,
  });
  src.dispose();
  return m;
}

/** Every texture used by the scene's materials, uploaded to the GPU (initTexture). */
export function initTextures(renderer, scene) {
  const seen = new Set();
  scene.traverse(o => {
    if (!o.isMesh) return;
    for (const k of ['tA', 'tB', 'tC']) {
      const t = o.material.uniforms?.[k]?.value;
      if (t && !seen.has(t)) { seen.add(t); renderer.initTexture(t); }
    }
  });
  return seen.size;
}

const glows = new WeakMap();
function glowFor(renderer) {
  let g = glows.get(renderer);
  if (!g) glows.set(renderer, g = new CoeGlow(renderer));
  return g;
}

/**
 * Draw one frame of a built scene into `target` (null = canvas), with the COE_Glow pass when
 * `glow` (default: the preset's). `ssaa` tells the glow how many render pixels make an output pixel.
 */
export function renderFrame(renderer, built, { target = null, glow, ssaa = 1 } = {}) {
  built.update();
  const useGlow = glow ?? PRESETS[built.preset]?.glow ?? false;
  if (!useGlow) {
    renderer.setRenderTarget(target);
    renderer.render(built.scene, built.camera);
    renderer.setRenderTarget(null);
    return;
  }
  const size = target ? [target.width, target.height] : renderer.getDrawingBufferSize(new THREE.Vector2()).toArray();
  let sceneRT = built._sceneRT;
  if (!sceneRT || sceneRT.width !== size[0] || sceneRT.height !== size[1]) {
    sceneRT?.dispose();
    sceneRT = built._sceneRT = new THREE.WebGLRenderTarget(size[0], size[1], {
      type: THREE.UnsignedByteType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      generateMipmaps: false, colorSpace: THREE.NoColorSpace });
  }
  renderer.setRenderTarget(sceneRT);
  renderer.render(built.scene, built.camera);
  const g = glowFor(renderer);
  g.setSize(size[0], size[1], ssaa);
  g.apply(sceneRT, target, built.background);
  renderer.setRenderTarget(null);
}

/**
 * Deterministic offscreen render: (width·ssaa)×(height·ssaa) render target, no MSAA, all textures
 * uploaded and shaders compiled first, one frame, readRenderTargetPixels, box-filter downsample.
 * Returns {width, height, data: Uint8ClampedArray RGBA top row first, timings}.
 */
export async function renderPixels(renderer, built, { width = 768, height = 925, ssaa = 3, glow } = {}) {
  const t0 = performance.now();
  const W = width * ssaa, H = height * ssaa;
  built.camera.aspect = width / height;
  built.camera.updateProjectionMatrix();
  const target = new THREE.WebGLRenderTarget(W, H, {
    type: THREE.UnsignedByteType, depthBuffer: true, samples: 0, minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter, generateMipmaps: false, colorSpace: THREE.NoColorSpace });
  initTextures(renderer, built.scene);
  await renderer.compileAsync(built.scene, built.camera);
  const t1 = performance.now();
  renderFrame(renderer, built, { target, glow, ssaa });
  const raw = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(target, 0, 0, W, H, raw);
  const t2 = performance.now();
  target.dispose();
  // box filter ssaa×ssaa, flip to top row first
  const out = new Uint8ClampedArray(width * height * 4);
  const n = ssaa * ssaa, half = n >> 1;
  for (let y = 0; y < height; y++) {
    const sy = (height - 1 - y) * ssaa;
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < ssaa; j++) {
        let i = ((sy + j) * W + x * ssaa) * 4;
        for (let k = 0; k < ssaa; k++, i += 4) { r += raw[i]; g += raw[i + 1]; b += raw[i + 2]; }
      }
      const o = (y * width + x) * 4;
      out[o] = (r + half) / n | 0; out[o + 1] = (g + half) / n | 0; out[o + 2] = (b + half) / n | 0; out[o + 3] = 255;
    }
  }
  const t3 = performance.now();
  return { width, height, data: out, timings: { compileMs: t1 - t0, renderReadMs: t2 - t1, downsampleMs: t3 - t2 } };
}
