// buildScene(recipe) → three.js scene of one SMT IMAGINE avatar, from the converted assets described
// in avatar/docs/FORMAT.md. Framework-free ES module: imports only 'three' and
// 'three/addons/...' (resolved by an import map in the browser, or by the bundler in the site),
// so the same file runs in the viewer, the Next.js site and a headless render worker.
//
//   const { scene, camera, avatarRoot } = await buildScene(recipe, { assetBase, rig });
//   renderer = createRenderer({ canvas, width, height });  renderer.render(scene, camera);
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCoeUniforms, setCoeLights, makeCoeMaterial, describeCoe, prepareTexture } from '../shaders/coeMaterials.js';

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

// CiAvatar slot tokens that skin to the skeleton (0xb19c50); others attach under "H" + token.
const SKINNED_TOKENS = new Set(['Face', 'Body', 'GloveL', 'GloveR', 'Legs', 'Feet', 'ExtraA', 'NeckM',
  'Hair', 'HairAcceM', 'ExtraD']);

const stemOf = p => p.split('/').pop().replace(/\.[^.]+$/, '');
const join = (base, rel) => base.replace(/\/?$/, '/') + rel;

/** Map a recipe (resolve.py --json, one character) to asset URLs per FORMAT.md. */
export function recipeAssets(recipe, assetBase) {
  const sk = recipe.skeleton || {};
  const parts = [];
  for (const [folder, p] of Object.entries(recipe.parts || {})) {
    if (!p || !p.file || p.exists === false) continue;
    parts.push({ folder, file: p.file, stem: stemOf(p.file), url: join(assetBase, `parts/${folder}/${stemOf(p.file)}.glb`) });
  }
  return {
    skeleton: sk.nif ? join(assetBase, `skeletons/${stemOf(sk.nif)}.glb`) : null,
    pose: sk.idle ? join(assetBase, `poses/${stemOf(sk.idle)}.json`) : null,
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

/** Apply camera preset 'portrait' (= 'full'), 'bust' or 'face' from rig.camera. Returns the target. */
export function applyCameraPreset(camera, rig, name = 'portrait') {
  const base = rig.camera || DEFAULT_RIG.camera;
  const p = (name === 'bust' || name === 'face') && base[name] ? { ...base, ...base[name] } : base;
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
 * @param {object|string|false} [opts.pose]  pose JSON or URL; default the recipe's idle; false = bind pose
 * @param {string} [opts.preset]    camera preset: portrait | full | bust | face
 * @param {number} [opts.aspect]    camera aspect (default rig aspect 0.75)
 * @param {number[]} [opts.background] linear RGB clear colour
 * @param {(msg:string)=>void} [opts.onWarning]
 * @returns {Promise<{scene, camera, avatarRoot, rig, uniforms, warnings, setPreset, setRawBase, update}>}
 */
export async function buildScene(recipe, opts = {}) {
  const { assetBase = '../build/assets/', preset = 'portrait', background = [0.165, 0.173, 0.22] } = opts;
  const warnings = [];
  const warn = msg => { warnings.push(msg); (opts.onWarning || console.warn)(msg); };
  const assets = recipeAssets(recipe, assetBase);
  const loader = opts.loader || new GLTFLoader();

  // rig
  let rig = opts.rig;
  if (typeof rig === 'string') rig = await fetchJSON(rig);
  if (!rig) {
    try { rig = await fetchJSON(assets.rig); } catch (e) { warn(`rig.json unavailable (${e.message}); using built-in rig`); rig = DEFAULT_RIG; }
  }

  // skeleton + pose + parts, fetched in parallel
  if (!assets.skeleton) throw new Error('recipe has no skeleton');
  let posePromise = Promise.resolve(null);
  if (opts.pose && typeof opts.pose === 'object') posePromise = Promise.resolve(opts.pose);
  else if (opts.pose !== false) {
    const url = typeof opts.pose === 'string' ? opts.pose : assets.pose;
    if (url) posePromise = fetchJSON(url).catch(e => { warn(`pose: ${e.message}; using bind pose`); return null; });
  }
  const partPromises = assets.parts.map(p => loader.loadAsync(p.url).then(g => ({ ...p, gltf: g }),
    e => { warn(`part ${p.folder}/${p.stem}: ${e.message || e}`); return null; }));
  const [skelGltf, pose, ...parts] = await Promise.all([loader.loadAsync(assets.skeleton), posePromise, ...partPromises]);

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
  }

  const uniforms = createCoeUniforms();
  setCoeLights(uniforms, rig, new THREE.Vector3().fromArray((rig.camera || DEFAULT_RIG.camera).target));

  for (const part of parts) {
    if (!part) continue;
    try {
      await attachPart(part, { bones, skelRoot, recipe, uniforms, warn });
    } catch (e) {
      warn(`part ${part.folder}/${part.stem}: ${e.message || e}`);
    }
  }

  const camera = new THREE.PerspectiveCamera(38.55, opts.aspect ?? (rig.camera?.aspect ?? 0.75), 10, 20000);
  const target = applyCameraPreset(camera, rig, preset);
  scene.add(camera);
  scene.updateMatrixWorld(true);

  const api = {
    scene, camera, avatarRoot, rig, uniforms, warnings, target,
    /** Switch camera preset; returns the new orbit target. */
    setPreset: name => (api.target = applyCameraPreset(camera, rig, name)),
    /** Debug view: false/0 normal, true/1 unlit base texture, 2 per-vertex lighting only. */
    setRawBase: mode => { uniforms.uRawBase.value = +mode || 0; },
    /** Call before each render (updates the eye position used by specular). */
    update: () => { camera.updateMatrixWorld(); uniforms.uEyePos.value.setFromMatrixPosition(camera.matrixWorld); },
  };
  api.update();
  return api;
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
