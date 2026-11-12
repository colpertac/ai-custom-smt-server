// three.js ShaderMaterials reproducing SMT IMAGINE's COE_* NSB shaders (Gamebryo 2.x, D3D9).
// Derived from the client's NSB files (avatar/tools/nsb.py: render states, texture stage states with
// Gamebryo's NSB enums, constant maps) and the .vso/.pso disassembly (avatar/tools/d3dasm.py).
// See AI/avatar-renderer.md "Shaders" and avatar/viewer/README.md.
//
// Vertex lighting (COE_Blender1/2/3[S].vso, COE_Blender1_specular.vso, COE_Skinning20.vso, COE_SkinningDX*.vso):
//   oD0 = saturate((MatAmbient * Ambient + MatEmissive + Σ max(N·L,0) * MatDiffuse * LightDiffuse * att)
//                  * vertexColour * ModelColor),   alpha = MatDiffuse.a
//   att = max(1 - 0.25 * linear * d, 0) for point lights, 1 for the directional light.
//   Blender family: N = mat3(World) * n, not renormalised; Skinning/SkinningDX: normalised.
//   The Blender family always multiplies v4 (vertex colour, white when the mesh has none);
//   NiVertexColorProperty only matters on the fixed-function T&L path (no vertex shader).
// No gamma anywhere: textures must be THREE.NoColorSpace and the renderer output
// THREE.LinearSRGBColorSpace with NoToneMapping.
//
// Pixel stage per shader / technique (all verified against the NSB stage states / pso):
//   COE_HairColor   (Blender2.vso + HairColor.pso)   (Base + Detail * Color1) * oD0
//   COE_Skinning    (Skinning20.vso + Skinning.pso)  (Base.a > 0.94 ? Base : 0) * oD0
//   COE_SkinningDX  (SkinningDX1/2)                  (A op B) * oD0 + oD1(spec), alpha = A.a with B
//   COE_Blender     fixed-function stages:           stage0 rgb = A, a = A.a * oD0.a; stage1/2 = B, C by op
//                   (x: BLENDTEXTUREALPHA, a: ADD, s: SUBTRACT CURRENT-TEXTURE), each stage saturated;
//                   last stage rgb *= oD0. Single texture: MODULATE(A, oD0) for rgb and alpha.
//                   Mul_1Bit = COE_1BitTexture.pso (cutout like Skinning), Mul_A_Specular = A*oD0 + oD1
//                   (Blender1_specular.vso; adds MatEmissive twice, as the shader does)
//   COE_BlenderS    BlenderS_*.pso (ps_2_0): same ops unclamped, alpha = A.a, * oD0, * shadow
//                   (shadow term = 1: no shadow map, i.e. unshadowed)
//   COE_Effecter    Blender*_nolight.vso + the COE_Blender stages: oD0 = (MatDiffuse + MatEmissive) * vcol;
//                   Mul_NoTexture = fixed-function T&L diffuse only
//   no shader       fixed-function T&L, NiAlphaProperty decides blending and alpha test
// Render states: every COE technique enables blending (Mul = SrcAlpha/InvSrcAlpha, Add = SrcAlpha/One,
// Sub = reverse-subtract SrcAlpha/One) and alpha test GREATER 1 (except Skinning's VS11 fallback, unused);
// Add/Sub (Blender, BlenderS) and every Effecter technique disable Z writes. NSB states override the
// NiAlphaProperty / NiZBufferProperty ones; whether a mesh is drawn in the sorted (transparent) list is
// still NiAlphaProperty's blend flag (Gamebryo's NiAlphaAccumulator looks at the property, not the shader).
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

/** Per-shader facts from the NSBs: point lights the vertex shader evaluates (Light2..4 constants),
 *  normal renormalisation, whether the VS applies the texture transforms (InvTexTransform*), and
 *  whether every technique disables Z writes. */
export const SHADER_INFO = {
  COE_HairColor: { points: 3, normalize: false, texXform: true, vcolor: true },
  COE_Skinning: { points: 2, normalize: true, texXform: false, vcolor: false },   // VS20 impl
  COE_SkinningDX: { points: 1, normalize: true, texXform: true, vcolor: false },
  COE_Blender: { points: 3, normalize: false, texXform: true, vcolor: true },
  COE_BlenderS: { points: 3, normalize: false, texXform: true, vcolor: true },
  COE_Effecter: { points: 0, normalize: false, texXform: true, vcolor: true, noLight: true, zWriteOff: true },
};

const COMBINE = { generic: 0, hair: 1, cutout: 2, stages: 3, stagesS: 4, skinningDX: 5, noTexture: 6, specular: 7 };
const LIGHT = { shader: 0, none: 1, fixed: 2 };
const OPS = { x: 1, a: 2, s: 3 };   // texture combine ops (0 = none)
// Gamebryo NiAlphaProperty test functions → GLSL compare index used by the fragment shader
// (0 ALWAYS, 1 LESS, 2 EQUAL, 3 LESSEQUAL, 4 GREATER, 5 NOTEQUAL, 6 GREATEREQUAL, 7 NEVER).
const ALPHA_GREATER = 4;

/** Parse a technique name like "Add_A_x_B_s_C" → {blend: 'Add', opB: 'x', opC: 's'}. */
export function parseTechnique(shader, technique) {
  const name = (TECHNIQUES[shader] || [])[technique ?? 0] || 'Mul_A';
  const m = /^(Mul|Add|Sub)_A(?:_([xas])_B)?(?:_([xas])_C)?/.exec(name);
  return { name, blend: m ? m[1] : 'Mul', opB: m && m[2] || null, opC: m && m[3] || null,
    specular: name === 'Mul_A_Specular', noTexture: name === 'Mul_NoTexture', oneBit: name === 'Mul_1Bit' };
}

/**
 * Uniforms shared by every COE material of one scene (ambient, directional light, eye, debug switch).
 * Pass the same object to every makeCoeMaterial call. Point lights are per material (setMaterialLights).
 */
export function createCoeUniforms() {
  return {
    uAmbientLight: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uDirLightDir: { value: new THREE.Vector3(0, 0, -1) },        // direction the light travels (world)
    uDirLightColor: { value: new THREE.Vector3(1, 1, 1) },
    uEyePos: { value: new THREE.Vector3() },                     // camera world position (specular)
    uRawBase: { value: 0 },                                      // debug: 1 unlit base texture, 2 lighting only
  };
}

/** Fill shared uniforms (ambient, directional) from rig.json-style lights (avatar frame == world frame). */
export function setCoeLights(u, rig) {
  const lights = rig.lights || [];
  const dir = lights.find(l => l.type === 'directional');
  if (dir) {
    u.uDirLightDir.value.fromArray(dir.direction_travel || dir.direction).normalize();
    u.uDirLightColor.value.fromArray(dir.color);
  } else {
    u.uDirLightColor.value.set(0, 0, 0);
  }
  u.uAmbientLight.value.fromArray(rig.ambient || [0, 0, 0]);
}

/**
 * The client's per-model point-light pick (0xad6d30): lights whose range 1/(0.2·linear) = 5/linear
 * (0xad2b30; no range when linear is 0) plus the model's bound radius reaches the bound centre,
 * nearest first, at most 3. Returns rig light objects.
 */
export function selectPointLights(rig, center, radius = 0, max = MAX_POINT) {
  const c = center.isVector3 ? center : new THREE.Vector3().fromArray(center);
  return (rig.lights || []).filter(l => l.type === 'point')
    .map(l => ({ l, d: c.distanceTo(new THREE.Vector3().fromArray(l.position)) }))
    .filter(({ l, d }) => !(l.linear > 0) || d <= 5 / l.linear + radius)
    .sort((a, b) => a.d - b.d || (a.l.name || '').localeCompare(b.l.name || ''))
    .slice(0, max).map(x => x.l);
}

/** Write a material's point-light uniforms (the shader uses the first COE_NUM_POINT of them). */
export function setMaterialLights(material, lights) {
  const u = material.uniforms;
  if (!u || !u.uPointPos) return;
  for (let i = 0; i < MAX_POINT; i++) {
    const p = lights[i];
    u.uPointPos.value[i].fromArray(p ? p.position : [0, 0, 0]);
    u.uPointColor.value[i].fromArray(p ? p.color : [0, 0, 0]);
    u.uPointAtt.value[i].set(p ? p.constant ?? 0 : 0, p ? p.linear ?? 0 : 0, p ? p.quadratic ?? 0 : 0);
  }
  material.userData.coe && (material.userData.coe.lights = lights.map(l => l.name));
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
uniform vec3 uPointAtt[${MAX_POINT}];   // constant, linear, quadratic
uniform mat3 uTexXformA, uTexXformB, uTexXformC;
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

vec2 coeUv(mat3 m, vec2 uv) {
#ifdef COE_TEXXFORM
  return (m * vec3(uv, 1.0)).xy;
#else
  return uv;
#endif
}

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
#if COE_LIGHT == 1
  // Blender*_nolight.vso: (MatDiffuse + MatEmissive, MatDiffuse.a) * v4 * ModelColor
  vec4 lit = vec4(uMatDiffuse.rgb + uMatEmissive, uMatDiffuse.a) * vcol;
#elif COE_LIGHT == 2
  // D3D9 fixed-function T&L; NiVertexColorProperty source: 0 ignore, 1 emissive, 2 ambient+diffuse
  vec4 mAmb = uMatAmbient, mDif = uMatDiffuse; vec3 mEmi = uMatEmissive;
  #if COE_VCMODE == 1
  mEmi = vcol.rgb;
  #elif COE_VCMODE == 2
  mAmb = vcol; mDif = vcol;
  #endif
  Nw = normalize(Nw);
  vec3 diff = max(dot(Nw, -uDirLightDir), 0.0) * uDirLightColor;
  for (int i = 0; i < COE_NUM_POINT; i++) {
    vec3 d = uPointPos[i] - Pw;
    float dist = length(d);
    float den = uPointAtt[i].x + uPointAtt[i].y * dist + uPointAtt[i].z * dist * dist;
    float att = den > 0.0 ? 1.0 / den : 1.0;
    diff += max(dot(Nw, d / max(dist, 1e-6)), 0.0) * uPointColor[i] * att;
  }
  vec4 lit = vec4(mAmb.rgb * uAmbientLight + diff * mDif.rgb + mEmi, mDif.a);
#else
  vec3 diff = max(dot(Nw, -uDirLightDir), 0.0) * uDirLightColor;
  for (int i = 0; i < COE_NUM_POINT; i++) {
    vec3 d = uPointPos[i] - Pw;
    float dist = length(d);
    float att = max(1.0 - uPointAtt[i].y * dist * 0.25, 0.0);
    diff += max(dot(Nw, d / max(dist, 1e-6)), 0.0) * uPointColor[i] * att;
  }
  vec3 emissive = uMatEmissive;
  #ifdef COE_EMISSIVE2
  emissive *= 2.0;   // COE_Blender1_specular.vso adds c5 before and after the point lights
  #endif
  vec4 lit = vec4(uMatAmbient.rgb * uAmbientLight + diff * uMatDiffuse.rgb + emissive, uMatDiffuse.a) * vcol;
#endif
  vDiffuse = clamp(lit * uModelColor, 0.0, 1.0);   // oD0 is saturated by D3D9
  vSpecular = vec3(0.0);
#ifdef COE_SPECULAR
  // lit(N·L, N·H, power) with H = normalize(V - Ldir); directional light only, no light colour.
  vec3 V = normalize(uEyePos - Pw);
  vec3 H = normalize(V - uDirLightDir);
  float nl = dot(Nw, -uDirLightDir), nh = dot(Nw, H);
  float s = (nl > 0.0 && nh > 0.0) ? pow(nh, uMatPower) : 0.0;
  vSpecular = clamp(s * uMatSpecular, 0.0, 1.0);
#endif
  vUvA = coeUv(uTexXformA, coeUvA);
#ifdef COE_UV_B
  vUvB = coeUv(uTexXformB, coeUvB);
#endif
#ifdef COE_UV_C
  vUvC = coeUv(uTexXformC, coeUvC);
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

// fixed-function stage op on rgb; each D3D9 fixed-function stage result is saturated
vec3 ffOp(vec3 cur, vec4 t, int op) {
  if (op == 1) return mix(cur, t.rgb, t.a);              // BLENDTEXTUREALPHA(TEXTURE, CURRENT)
  if (op == 2) return clamp(cur + t.rgb, 0.0, 1.0);      // ADD(TEXTURE, CURRENT)
  if (op == 3) return clamp(cur - t.rgb, 0.0, 1.0);      // SUBTRACT(CURRENT, TEXTURE)
  return cur;
}
// ps_2_0 op (BlenderS_*.pso): lrp / add / add -t, no intermediate clamp
vec3 psOp(vec3 cur, vec4 t, int op) {
  if (op == 1) return mix(cur, t.rgb, t.a);
  if (op == 2) return cur + t.rgb;
  if (op == 3) return cur - t.rgb;
  return cur;
}

bool alphaPass(float a) {
  float a8 = floor(clamp(a, 0.0, 1.0) * 255.0 + 0.5);   // 8-bit framebuffer alpha vs ALPHAREF
  float r = uAlphaRef;
#if COE_ALPHA_FUNC == 0
  return true;
#elif COE_ALPHA_FUNC == 1
  return a8 < r;
#elif COE_ALPHA_FUNC == 2
  return a8 == r;
#elif COE_ALPHA_FUNC == 3
  return a8 <= r;
#elif COE_ALPHA_FUNC == 4
  return a8 > r;
#elif COE_ALPHA_FUNC == 5
  return a8 != r;
#elif COE_ALPHA_FUNC == 6
  return a8 >= r;
#else
  return false;
#endif
}

void main() {
  vec4 A = texture2D(tA, vUvA);
  if (uRawBase > 1.5) { gl_FragColor = vec4(vDiffuse.rgb, 1.0); return; }   // debug: lighting only
  if (uRawBase > 0.5) { gl_FragColor = vec4(A.rgb, 1.0); return; }          // debug: unlit base texture
  vec4 c;
#if COE_COMBINE == 1
  // COE_HairColor.pso: mov r0, t0 ; mad r0, t1, c0, r0 ; mul r0, v0, r0
  c = (A + texture2D(tB, vUvB) * uColor1) * vDiffuse;
#elif COE_COMBINE == 2
  // COE_Skinning.pso / COE_1BitTexture.pso: sub r0, t0, 0.44 ; cnd r1, r0.a, t0, 0 ; mul r0, r1, v0
  c = ((A.a - 0.44 > 0.5) ? A : vec4(0.0)) * vDiffuse;
#elif COE_COMBINE == 3
  // COE_Blender / COE_Effecter fixed-function stages
  #if defined(COE_UV_B) || defined(COE_UV_C)
  vec3 rgb = A.rgb;
  float a = A.a * vDiffuse.a;
    #ifdef COE_UV_B
  rgb = ffOp(rgb, texture2D(tB, vUvB), COE_OP_B);
    #endif
    #ifdef COE_UV_C
  rgb = ffOp(rgb, texture2D(tC, vUvC), COE_OP_C);
    #endif
  c = vec4(rgb * vDiffuse.rgb, a);
  #else
  c = A * vDiffuse;
  #endif
#elif COE_COMBINE == 4
  // COE_BlenderS_*.pso: ops on rgb, alpha = A.a, * v0, * shadow (1: unshadowed)
  vec3 rgb = A.rgb;
  #ifdef COE_UV_B
  rgb = psOp(rgb, texture2D(tB, vUvB), COE_OP_B);
  #endif
  #ifdef COE_UV_C
  rgb = psOp(rgb, texture2D(tC, vUvC), COE_OP_C);
  #endif
  c = vec4(rgb, A.a) * vDiffuse;
#elif COE_COMBINE == 5
  // COE_SkinningDX1.pso: t0 * v0 + v1 ; SkinningDX2_{Mul,Add,Sub}.pso: (t0 op t1) * v0 + v1, alpha t0.a
  #ifdef COE_UV_B
  vec4 B = texture2D(tB, vUvB);
  vec3 rgb = COE_OP_B == 1 ? mix(A.rgb, B.rgb, B.a) : COE_OP_B == 2 ? A.rgb + B.rgb : A.rgb - B.rgb;
  c = vec4(rgb * vDiffuse.rgb + vSpecular, A.a);
  #else
  c = A * vDiffuse;
  c.rgb += vSpecular;
  #endif
#elif COE_COMBINE == 6
  // Mul_NoTexture: SELECTARG1(DIFFUSE)
  c = vDiffuse;
#elif COE_COMBINE == 7
  // Mul_A_Specular: COE_SkinningDX1.pso after COE_Blender1_specular.vso
  c = A * vDiffuse;
  c.rgb += vSpecular;
#else
  c = A * vDiffuse;
#endif
  c = clamp(c, 0.0, 1.0);
  if (!alphaPass(c.a)) discard;
  gl_FragColor = c;
}`;

// NiAlphaProperty blend enum → three.js factor
const NI_BLEND = [THREE.OneFactor, THREE.ZeroFactor, THREE.SrcColorFactor, THREE.OneMinusSrcColorFactor,
  THREE.DstColorFactor, THREE.OneMinusDstColorFactor, THREE.SrcAlphaFactor, THREE.OneMinusSrcAlphaFactor,
  THREE.DstAlphaFactor, THREE.OneMinusDstAlphaFactor, THREE.SrcAlphaSaturateFactor];

function vec4(a, w = 1) {
  return new THREE.Vector4(a?.[0] ?? 1, a?.[1] ?? 1, a?.[2] ?? 1, a?.[3] ?? w);
}

/**
 * Gamebryo TexDesc transform (NiTextureTransform, method 1 = MAX_TRANSFORM, the only one in the avatar
 * data) as a 3×3 UV matrix: uv' = R(rotation)·S(scale)·(uv − center) + center + translation.
 * The NSB vertex shaders just apply the engine's matrix (InvTexTransform*Transpose c24/c28/c32), so the
 * composition order is not in the NSBs; only 40 of 601 slots are not identity (translation 0/−1,
 * one 90° rotation family, two degenerate scales).
 */
export function textureTransformMatrix(t) {
  const m = new THREE.Matrix3();
  if (!t) return m;
  const [tx, ty] = t.translation ?? [0, 0], [sx, sy] = t.scale ?? [1, 1];
  const [cx, cy] = t.center ?? [0.5, 0.5], r = t.rotation ?? 0;
  const c = Math.cos(r), s = Math.sin(r);
  // R·S applied to (uv − c), then + c + t
  m.set(c * sx, -s * sy, -(c * sx * cx - s * sy * cy) + cx + tx,
    s * sx, c * sy, -(s * sx * cx + c * sy * cy) + cy + ty,
    0, 0, 1);
  return m;
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
 * @param {object[]} [p.lights]   point lights for this model (selectPointLights); default none
 */
export function makeCoeMaterial({ extras = {}, maps = {}, shared, color1, vertexColor = false, doubleSided = false, lights = [] }) {
  const shader = extras.shader || '';
  const info = SHADER_INFO[shader];
  const tech = parseTechnique(shader, extras.technique);
  const defines = {};
  let combine = COMBINE.generic, light = LIGHT.shader, numPoint = info ? info.points : MAX_POINT;
  let blend = null, zWrite = extras.zWrite !== false, zTest = extras.zTest !== false;
  let alphaFunc = ALPHA_GREATER, alphaRef = 1;   // NSB: ALPHATESTENABLE, ALPHAFUNC GREATER, ALPHAREF 1
  let specular = false, texXform = info ? info.texXform : false;
  if (shader === 'COE_HairColor') {
    combine = COMBINE.hair; blend = 'Mul';
  } else if (shader === 'COE_Skinning') {
    combine = COMBINE.cutout; blend = 'Mul';
  } else if (shader === 'COE_SkinningDX') {
    combine = COMBINE.skinningDX; blend = tech.blend; specular = true;
  } else if (shader === 'COE_Blender' || shader === 'COE_BlenderS' || shader === 'COE_Effecter') {
    blend = tech.blend;
    combine = shader === 'COE_BlenderS' ? COMBINE.stagesS : COMBINE.stages;
    if (tech.blend !== 'Mul' || info.zWriteOff) zWrite = false;   // Mul: Z write from NiZBufferProperty
    if (shader === 'COE_Effecter') light = LIGHT.none;
    if (tech.oneBit) combine = COMBINE.cutout;
    if (tech.specular) { combine = COMBINE.specular; specular = true; defines.COE_EMISSIVE2 = 1; }
    if (tech.noTexture) { combine = COMBINE.noTexture; light = LIGHT.fixed; texXform = false; }
  } else {
    // No / unknown shader: fixed-function T&L; NiAlphaProperty decides blending and alpha test.
    light = LIGHT.fixed; texXform = true;
    alphaFunc = extras.alphaTest ? (extras.alphaTestFunc ?? ALPHA_GREATER) : 0;
    alphaRef = extras.alphaTestRef ?? 0;
  }
  if (specular && extras.specularEnabled === false) specular = false;   // NiSpecularProperty off
  if (specular) defines.COE_SPECULAR = 1;
  if (light === LIGHT.none) numPoint = 0;
  const useB = combine === COMBINE.hair || ((combine === COMBINE.skinningDX || combine === COMBINE.stages
    || combine === COMBINE.stagesS) && tech.opB && maps.B);
  const useC = (combine === COMBINE.stages || combine === COMBINE.stagesS) && tech.opC && maps.C;
  if (useB) defines.COE_UV_B = 1;
  if (useC) defines.COE_UV_C = 1;
  defines.COE_OP_B = OPS[tech.opB] || 0;
  defines.COE_OP_C = OPS[tech.opC] || 0;
  defines.COE_COMBINE = combine;
  defines.COE_LIGHT = light;
  defines.COE_NUM_POINT = numPoint;
  defines.COE_ALPHA_FUNC = alphaFunc;
  defines.COE_VCMODE = extras.vertexColorMode ?? 0;
  if (info ? info.normalize : true) defines.COE_NORMALIZE = 1;
  if (texXform && extras.textureTransforms) defines.COE_TEXXFORM = 1;
  if (vertexColor && (info ? info.vcolor : true)) defines.COE_VCOLOR = 1;
  const tt = extras.textureTransforms || {};
  const d = describeCoe(extras);
  const xf = slot => textureTransformMatrix(slot && tt[slot.name]);

  const diffuse = extras.diffuse ?? [1, 1, 1];
  const m = new THREE.ShaderMaterial({
    name: `${shader || 'fixed'}:${tech.name}`,
    uniforms: {
      ...shared,
      uPointPos: { value: Array.from({ length: MAX_POINT }, () => new THREE.Vector3()) },
      uPointColor: { value: Array.from({ length: MAX_POINT }, () => new THREE.Vector3()) },
      uPointAtt: { value: Array.from({ length: MAX_POINT }, () => new THREE.Vector3()) },
      tA: { value: maps.A || white() },
      tB: { value: maps.B || white() },
      tC: { value: maps.C || white() },
      uTexXformA: { value: xf(d.A) },
      uTexXformB: { value: xf(d.B) },
      uTexXformC: { value: xf(d.C) },
      // Without a detail texture the dye has nothing to modulate (D3D9 samples an unbound stage as 0).
      uColor1: { value: vec4(combine === COMBINE.hair && !maps.B ? [0, 0, 0, 0] : (color1 ?? [0, 0, 0, 0]), 0) },
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
    depthTest: zTest,
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
  // Alpha written to the framebuffer is irrelevant (opaque canvas / RGB output); keep src alpha.
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.ZeroFactor; m.blendEquationAlpha = THREE.AddEquation;
  m.userData.coe = { shader, technique: tech.name, combine, light, numPoint, extras };
  setMaterialLights(m, lights);
  return m;
}

/**
 * Which glTF texture / UV set feeds texture slots A, B, C for a material's extras.
 * HairColor: A = base, B = detail. SkinningDX/Blender: A = base, B = detail (or decal when
 * there is no detail), C = decal. `name` is the NIF slot ("base" | "detail" | "decal").
 */
export function describeCoe(extras = {}) {
  const tech = parseTechnique(extras.shader, extras.technique);
  const slot = (tex, uv, name) => (tex == null ? null : { texture: tex, uv: uv ?? 0, name });
  const base = slot(extras.baseTexture, extras.baseUV, 'base');
  const detail = slot(extras.detailTexture, extras.detailUV, 'detail');
  const decal = slot(extras.decalTexture, extras.decalUV, 'decal');
  if (extras.shader === 'COE_HairColor') return { A: base, B: detail, C: null, tech };
  if (tech.opC) return { A: base, B: detail, C: decal, tech };
  return { A: base, B: detail || decal, C: null, tech };
}
