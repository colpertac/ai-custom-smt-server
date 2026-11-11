// three.js ShaderMaterials reproducing SMT IMAGINE's COE_* NSB shaders (Gamebryo 2.x, D3D9).
// Derived from disassembly of the client's .vso/.pso files and NSB render states
// (avatar/tools/nsb.py, d3dasm.py). See AI/avatar-renderer.md "Shaders".
//
// Everything is lit per vertex the way the game's vertex shaders do it:
//   oD0 = saturate((MatAmbient * Ambient + Σ max(N·L,0) * MatDiffuse * LightDiffuse * att + MatEmissive)
//                  * vertexColor * ModelColor),   alpha = MatDiffuse.a
//   att = max(1 - 0.25 * linear * d, 0) for point lights, 1 for the directional light.
// No gamma anywhere: textures must be THREE.NoColorSpace and the renderer output
// THREE.LinearSRGBColorSpace with NoToneMapping, otherwise colours wash out vs the game.
//
// Shader → mode:
//   COE_HairColor   (Blender2.vso + HairColor.pso)  (Base + Detail * Color1) * oD0, 3 point lights
//   COE_Skinning    (Skinning20.vso)               (Base.a > 0.94 ? Base : 0) * oD0, 2 point lights
//   COE_SkinningDX  (SkinningDX1/2)                (A op B) * oD0 + spec, alpha = A.a (op: x lerp by B.a, a add, s sub), 1 point light
//   COE_Blender/S   (fixed function / BlenderS_*)  (A op B op C) * oD0, vertex colour, 3 point lights
//   COE_Effecter    (Blender*_nolight.vso)          (A op B op C) * (MatDiffuse + MatEmissive) * vcol, no lights, no Z write
//   anything else                                  Base * oD0 with NiAlphaProperty blending
// Technique names (NSB implementation index) carry the framebuffer blend in their prefix:
//   Mul = SrcAlpha/InvSrcAlpha, Add = SrcAlpha/One, Sub = reverse-subtract SrcAlpha/One.
import * as THREE from 'three';

const MAX_POINT = 3;

// NSB implementation names by index (identical lists for COE_Blender, COE_BlenderS and COE_Effecter,
// except their last entries).
const T2 = ['Mul_A', 'Add_A', 'Sub_A', 'Mul_A_x_B', 'Mul_A_a_B', 'Mul_A_s_B', 'Add_A_x_B', 'Add_A_a_B',
  'Add_A_s_B', 'Sub_A_x_B', 'Sub_A_a_B', 'Sub_A_s_B'];
const T3 = [...T2, 'Mul_A_x_B_x_C', 'Mul_A_x_B_s_C', 'Mul_A_x_B_a_C', 'Mul_A_a_B_s_C', 'Mul_A_a_B_a_C',
  'Mul_A_a_B_x_C', 'Mul_A_s_B_s_C', 'Mul_A_s_B_a_C', 'Mul_A_s_B_x_C', 'Add_A_x_B_s_C', 'Add_A_x_B_a_C',
  'Add_A_x_B_x_C', 'Add_A_a_B_s_C', 'Add_A_a_B_a_C', 'Add_A_a_B_x_C', 'Add_A_s_B_s_C', 'Add_A_s_B_a_C',
  'Add_A_s_B_x_C', 'Sub_A_x_B_s_C', 'Sub_A_x_B_a_C', 'Sub_A_x_B_x_C', 'Sub_A_a_B_s_C', 'Sub_A_a_B_a_C',
  'Sub_A_a_B_x_C', 'Sub_A_s_B_s_C', 'Sub_A_s_B_a_C', 'Sub_A_s_B_x_C'];
export const TECHNIQUES = {
  COE_SkinningDX: T2,
  COE_Blender: [...T3, 'Mul_1Bit', 'Mul_A_Specular'],
  COE_BlenderS: T3,
  COE_Effecter: [...T3, 'Mul_NoTexture'],
};

const MODE = { generic: 0, hair: 1, skinning: 2, skinningDX: 3, blender: 4 };
const OPS = { x: 1, a: 2, s: 3 };   // texture combine ops (0 = none)

/** Parse a technique name like "Add_A_x_B_s_C" → {blend: 'Add', opB: 'x', opC: 's'}. */
export function parseTechnique(shader, technique) {
  const name = (TECHNIQUES[shader] || [])[technique ?? 0] || 'Mul_A';
  const m = /^(Mul|Add|Sub)_A(?:_([xas])_B)?(?:_([xas])_C)?/.exec(name);
  return { name, blend: m ? m[1] : 'Mul', opB: m && m[2] || null, opC: m && m[3] || null,
    specular: name === 'Mul_A_Specular', noTexture: name === 'Mul_NoTexture' };
}

/**
 * Uniforms shared by every COE material of one scene (lights, debug switch). Pass the same object
 * to every makeCoeMaterial call; updating .value here updates all materials.
 */
export function createCoeUniforms() {
  return {
    uAmbientLight: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uDirLightDir: { value: new THREE.Vector3(0, 0, -1) },        // direction the light travels (world)
    uDirLightColor: { value: new THREE.Vector3(1, 1, 1) },
    uPointPos: { value: Array.from({ length: MAX_POINT }, () => new THREE.Vector3()) },
    uPointColor: { value: Array.from({ length: MAX_POINT }, () => new THREE.Vector3()) },
    uPointLinear: { value: new Array(MAX_POINT).fill(0) },
    uEyePos: { value: new THREE.Vector3() },                     // camera world position (specular)
    uRawBase: { value: 0 },                                      // debug: 1 unlit base texture, 2 lighting only
  };
}

/**
 * Fill shared uniforms from rig.json-style lights (avatar frame == world frame).
 * Point lights are ordered nearest-first to `center`, like Gamebryo's per-model light selection.
 */
export function setCoeLights(u, rig, center = new THREE.Vector3(0, 90, 0)) {
  const lights = rig.lights || [];
  const dir = lights.find(l => l.type === 'directional');
  if (dir) {
    u.uDirLightDir.value.fromArray(dir.direction_travel || dir.direction).normalize();
    u.uDirLightColor.value.fromArray(dir.color);
  } else {
    u.uDirLightColor.value.set(0, 0, 0);
  }
  u.uAmbientLight.value.fromArray(rig.ambient || [0, 0, 0]);
  const pts = lights.filter(l => l.type === 'point')
    .map(l => ({ l, d: new THREE.Vector3().fromArray(l.position).distanceTo(center) }))
    .sort((a, b) => a.d - b.d).map(x => x.l);
  for (let i = 0; i < MAX_POINT; i++) {
    const p = pts[i];
    u.uPointPos.value[i].fromArray(p ? p.position : [0, 0, 0]);
    u.uPointColor.value[i].fromArray(p ? p.color : [0, 0, 0]);
    u.uPointLinear.value[i] = p ? p.linear : 0;
  }
}

const VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform vec3 uAmbientLight;
uniform vec4 uMatAmbient, uMatDiffuse, uModelColor;
uniform vec3 uMatEmissive, uMatSpecular;
uniform float uMatPower;
uniform vec3 uDirLightDir, uDirLightColor, uEyePos;
uniform vec3 uPointPos[${MAX_POINT}];
uniform vec3 uPointColor[${MAX_POINT}];
uniform float uPointLinear[${MAX_POINT}];
attribute vec2 coeUvA;
#ifdef COE_UV_B
attribute vec2 coeUvB;
varying vec2 vUvB;
#endif
#ifdef COE_UV_C
attribute vec2 coeUvC;
varying vec2 vUvC;
#endif
#ifdef COE_VCOLOR
attribute vec4 coeColor;
#endif
varying vec2 vUvA;
varying vec4 vDiffuse;
varying vec3 vSpecular;

void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
#ifdef USE_SKINNING
  // detached bind, identity bindMatrix: skinning already yields world space
  // (world = Σ w · BoneWorld · IBM · v); the mesh's own node transform is not applied.
  vec3 Pw = transformed;
  vec3 Nw = objectNormal;
#else
  vec3 Pw = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vec3 Nw = mat3(modelMatrix) * objectNormal;
#endif
#ifdef COE_NORMALIZE
  Nw = normalize(Nw);
#endif
  vec4 vcol = vec4(1.0);
#ifdef COE_VCOLOR
  vcol = coeColor;
#endif
#ifdef COE_NOLIGHT
  vec4 lit = vec4(uMatDiffuse.rgb + uMatEmissive, uMatDiffuse.a);
#else
  vec3 diff = max(dot(Nw, -uDirLightDir), 0.0) * uDirLightColor;
  for (int i = 0; i < COE_NUM_POINT; i++) {
    vec3 d = uPointPos[i] - Pw;
    float dist = length(d);
    float att = max(1.0 - uPointLinear[i] * dist * 0.25, 0.0);
    diff += max(dot(Nw, d / max(dist, 1e-6)), 0.0) * uPointColor[i] * att;
  }
  vec4 lit = vec4(uMatAmbient.rgb * uAmbientLight + diff * uMatDiffuse.rgb + uMatEmissive, uMatDiffuse.a);
#endif
  vDiffuse = clamp(lit * vcol * uModelColor, 0.0, 1.0);   // oD0 is saturated by D3D9
  vSpecular = vec3(0.0);
#ifdef COE_SPECULAR
  // lit(N·L, N·H, power) with H = normalize(V - Ldir); directional light only, no light colour.
  vec3 V = normalize(uEyePos - Pw);
  vec3 H = normalize(V - uDirLightDir);
  float nl = dot(Nw, -uDirLightDir), nh = dot(Nw, H);
  float s = (nl > 0.0 && nh > 0.0) ? pow(nh, uMatPower) : 0.0;
  vSpecular = clamp(s * uMatSpecular, 0.0, 1.0);
#endif
  vUvA = coeUvA;
#ifdef COE_UV_B
  vUvB = coeUvB;
#endif
#ifdef COE_UV_C
  vUvC = coeUvC;
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(Pw, 1.0);
}`;

const FRAG = /* glsl */`
uniform sampler2D tA;
#ifdef COE_UV_B
uniform sampler2D tB;
varying vec2 vUvB;
#endif
#ifdef COE_UV_C
uniform sampler2D tC;
varying vec2 vUvC;
#endif
uniform vec4 uColor1;
uniform float uRawBase, uAlphaRef;
varying vec2 vUvA;
varying vec4 vDiffuse;
varying vec3 vSpecular;

vec4 coeOp(vec4 cur, vec4 t, int op) {
  if (op == 1) return vec4(mix(cur.rgb, t.rgb, t.a), cur.a);   // x: decal, lerp by tex alpha
  if (op == 2) return vec4(cur.rgb + t.rgb, cur.a);            // a: add
  if (op == 3) return vec4(cur.rgb - t.rgb, cur.a);            // s: subtract
  return cur;
}

void main() {
  vec4 A = texture2D(tA, vUvA);
  if (uRawBase > 1.5) { gl_FragColor = vec4(vDiffuse.rgb, 1.0); return; }   // debug: lighting only
  if (uRawBase > 0.5) { gl_FragColor = vec4(A.rgb, 1.0); return; }          // debug: unlit base texture
  vec4 c;
#if COE_MODE == 1
  // COE_HairColor.pso: mad r0, t1, c0, t0 ; mul r0, v0, r0
  c = clamp((A + texture2D(tB, vUvB) * uColor1) * vDiffuse, 0.0, 1.0);
#elif COE_MODE == 2
  // COE_Skinning.pso: sub r0, t0, 0.44 ; cnd r1, r0.a, t0, 0 ; mul by oD0
  c = ((A.a - 0.44 > 0.5) ? A : vec4(0.0)) * vDiffuse;
#elif COE_MODE == 3
  // COE_SkinningDX1/2.pso: (A op B) * oD0 + oD1; DX2 keeps alpha = A.a
  vec4 comb = A;
  #ifdef COE_UV_B
  comb = coeOp(A, texture2D(tB, vUvB), COE_OP_B);
  #endif
  c = comb * vDiffuse;
  c.rgb += vSpecular;
  #ifdef COE_UV_B
  c.a = A.a;
  #endif
  c = clamp(c, 0.0, 1.0);
#elif COE_MODE == 4
  // COE_Blender texture stages: A, then B and C combined by op, then modulate by diffuse
  vec4 comb = A;
  #ifdef COE_NOTEXTURE
  comb = vec4(1.0);
  #endif
  #ifdef COE_UV_B
  comb = coeOp(comb, texture2D(tB, vUvB), COE_OP_B);
  #endif
  #ifdef COE_UV_C
  comb = coeOp(comb, texture2D(tC, vUvC), COE_OP_C);
  #endif
  c = clamp(clamp(comb, 0.0, 1.0) * vDiffuse + vec4(vSpecular, 0.0), 0.0, 1.0);
#else
  c = clamp(A * vDiffuse, 0.0, 1.0);
#endif
  if (c.a <= uAlphaRef) discard;   // ALPHATESTENABLE, ALPHAFUNC = GREATER
  gl_FragColor = c;
}`;

// NiAlphaProperty blend enum → three.js factor
const NI_BLEND = [THREE.OneFactor, THREE.ZeroFactor, THREE.SrcColorFactor, THREE.OneMinusSrcColorFactor,
  THREE.DstColorFactor, THREE.OneMinusDstColorFactor, THREE.SrcAlphaFactor, THREE.OneMinusSrcAlphaFactor,
  THREE.DstAlphaFactor, THREE.OneMinusDstAlphaFactor, THREE.SrcAlphaSaturateFactor];

function vec4(a, w = 1) {
  return new THREE.Vector4(a?.[0] ?? 1, a?.[1] ?? 1, a?.[2] ?? 1, a?.[3] ?? w);
}

/** Prepare a texture for the COE shaders: raw (non-sRGB) values, game-like mip filtering. */
export function prepareTexture(tex) {
  if (!tex) return tex;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  if (tex.minFilter === THREE.LinearFilter || tex.minFilter === THREE.LinearMipmapLinearFilter) {
    tex.minFilter = THREE.LinearMipmapNearestFilter;   // NSB samplers: MINFILTER LINEAR, MIPFILTER POINT
  }
  tex.needsUpdate = true;
  return tex;
}

let whiteTex = null;
function white() {
  if (!whiteTex) {
    whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    whiteTex.needsUpdate = true;
  }
  return whiteTex;
}

/**
 * Build a COE material for one mesh.
 * @param {object} p
 * @param {object} p.extras       glTF material extras (FORMAT.md "Materials")
 * @param {object} p.maps         {A, B?, C?} textures (A = base; B, C per technique, see describeCoe)
 * @param {object} p.shared       createCoeUniforms() result
 * @param {number[]} [p.color1]   RGBA Color1 for COE_HairColor
 * @param {boolean} [p.vertexColor] mesh has a coeColor attribute
 * @param {boolean} [p.doubleSided]
 */
export function makeCoeMaterial({ extras = {}, maps = {}, shared, color1, vertexColor = false, doubleSided = false }) {
  const shader = extras.shader || '';
  const tech = parseTechnique(shader, extras.technique);
  const defines = {};
  let mode = MODE.generic, numPoint = 3, normalize = true;
  let blend = null, zWrite = true, alphaRef = 1 / 255;
  if (shader === 'COE_HairColor') {
    mode = MODE.hair; normalize = false;   // Blender2.vso uses m3x3 only, no normalise
    blend = 'Mul';
  } else if (shader === 'COE_Skinning') {
    mode = MODE.skinning; numPoint = 2; blend = 'Mul';
  } else if (shader === 'COE_SkinningDX') {
    mode = MODE.skinningDX; numPoint = 1; blend = tech.blend;
    defines.COE_SPECULAR = 1;
  } else if (shader === 'COE_Blender' || shader === 'COE_BlenderS' || shader === 'COE_Effecter') {
    mode = MODE.blender; blend = tech.blend;
    if (tech.blend !== 'Mul') zWrite = false;
    if (shader === 'COE_Effecter') { defines.COE_NOLIGHT = 1; zWrite = false; }
    if (tech.specular) defines.COE_SPECULAR = 1;
    if (tech.noTexture) defines.COE_NOTEXTURE = 1;
  } else {
    // Unknown / no shader: fixed function, NiAlphaProperty decides.
    alphaRef = extras.alphaTest ? (extras.alphaTestRef ?? 0) / 255 : -1;
  }
  const useB = mode === MODE.hair || ((mode === MODE.skinningDX || mode === MODE.blender) && tech.opB && maps.B);
  const useC = mode === MODE.blender && tech.opC && maps.C;
  if (useB) defines.COE_UV_B = 1;
  if (useC) defines.COE_UV_C = 1;
  defines.COE_OP_B = OPS[tech.opB] || 0;
  defines.COE_OP_C = OPS[tech.opC] || 0;
  defines.COE_MODE = mode;
  defines.COE_NUM_POINT = numPoint;
  if (normalize) defines.COE_NORMALIZE = 1;
  if (vertexColor && mode !== MODE.skinning && mode !== MODE.skinningDX) defines.COE_VCOLOR = 1;

  const diffuse = extras.diffuse ?? [1, 1, 1];
  const m = new THREE.ShaderMaterial({
    name: `${shader || 'fixed'}:${tech.name}`,
    uniforms: {
      ...shared,
      tA: { value: maps.A || white() },
      tB: { value: maps.B || white() },
      tC: { value: maps.C || white() },
      // Without a detail texture the dye has nothing to modulate (D3D9 samples an unbound stage as 0).
      uColor1: { value: vec4(mode === MODE.hair && !maps.B ? [0, 0, 0, 0] : (color1 ?? [0, 0, 0, 0]), 0) },
      uModelColor: { value: vec4(extras.modelColor ?? [1, 1, 1, 1]) },
      uMatAmbient: { value: vec4(extras.ambient ?? [1, 1, 1]) },
      uMatDiffuse: { value: new THREE.Vector4(diffuse[0], diffuse[1], diffuse[2], extras.alpha ?? 1) },
      uMatEmissive: { value: new THREE.Vector3().fromArray(extras.emissive ?? [0, 0, 0]) },
      uMatSpecular: { value: new THREE.Vector3().fromArray(extras.specular ?? [0, 0, 0]) },
      uMatPower: { value: extras.glossiness ?? 0 },
      uAlphaRef: { value: alphaRef },
    },
    defines,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: zWrite,
    // Gamebryo draws NiAlphaProperty-blended objects after the opaque list, sorted back to front;
    // the shaders themselves always enable blending.
    transparent: !!extras.alphaBlend,
  });
  m.blending = THREE.CustomBlending;
  if (blend) {
    m.blendSrc = THREE.SrcAlphaFactor;
    m.blendDst = blend === 'Mul' ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor;
    m.blendEquation = blend === 'Sub' ? THREE.ReverseSubtractEquation : THREE.AddEquation;
  } else if (extras.alphaBlend) {
    m.blendSrc = NI_BLEND[extras.srcBlend ?? 6] ?? THREE.SrcAlphaFactor;
    m.blendDst = NI_BLEND[extras.dstBlend ?? 7] ?? THREE.OneMinusSrcAlphaFactor;
    m.blendEquation = THREE.AddEquation;
  } else {
    m.blending = THREE.NoBlending;
  }
  m.userData.coe = { shader, technique: tech.name, mode, extras };
  return m;
}

/**
 * Which glTF texture / UV set feeds texture slots A, B, C for a material's extras.
 * HairColor: A = base, B = detail. SkinningDX/Blender: A = base, B = detail (or decal when
 * there is no detail), C = decal.
 */
export function describeCoe(extras = {}) {
  const tech = parseTechnique(extras.shader, extras.technique);
  const slot = (tex, uv) => (tex == null ? null : { texture: tex, uv: uv ?? 0 });
  const base = slot(extras.baseTexture, extras.baseUV);
  const detail = slot(extras.detailTexture, extras.detailUV);
  const decal = slot(extras.decalTexture, extras.decalUV);
  if (extras.shader === 'COE_HairColor') return { A: base, B: detail, C: null, tech };
  if (tech.opC) return { A: base, B: detail, C: decal, tech };
  return { A: base, B: detail || decal, C: null, tech };
}
