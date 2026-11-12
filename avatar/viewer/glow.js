// COE_Glow: the client's half-resolution glow post pass (COE_Glow.NSB + ImagineClient.exe 0xb35000,
// kernel 0xb402b0/0xb40000/0xb405e0), as used by the character select / creation scene
// (0xd45b90: FUN_00b35d90(8 taps, 0.9), GlayScale coefficient (1,1,1,0), under/over (0,0,0,0)).
//
// Passes, all at half the screen resolution:
//   1. GlowGrayScale (COE_Glow.pso): rgb = scene, a = sat(sat(sat(dot(rgb, coef)) + over.a) + under.a)
//   2. GlowSource (fixed function): rgb = BLENDTEXTUREALPHA(TEXTURE, TFACTOR = 0) = rgb · a
//   3. GlowBlurring20 (COE_Glow1_ps20.pso, 8 taps, point sampling, clamp): horizontal, then vertical
//      out = Σ wᵢ · src(p + offsetᵢ); offsetᵢ = i − floor(taps/2) texels,
//      wᵢ = strength · Σₖ cₖ · exp(−aₖ · (i − centre + bₖ)² / centre²), centre = (taps − 1)/2,
//      kernel type 0: (a, b, c) = (0.18, 0, 0.06) + (4.5, 0, 0.11)
//   4. GlowAdd: screen += bilinear(blurred)   (ONE/ONE)
// Unknowns (not in the NSB or the decompiled setup): the kernel's base UV offset and weight threshold
// (taken as 0) and whether the D3D9 half-pixel offset shifts the taps.
import * as THREE from 'three';

export const GLOW_DEFAULTS = {
  taps: 8, strength: 0.9,
  components: [[0.18, 0, 0.06], [4.5, 0, 0.11]],
  coefficient: [1, 1, 1], under: 0, over: 0,
  // Portrait backgrounds are a flat colour, not the charamake set: by default pixels exactly equal to
  // the clear colour do not feed the glow, so the background stays the requested colour.
  excludeBackground: true,
};

/** Glow kernel: per-tap weights and integer texel offsets (0xb40000 / 0xb405e0). */
export function glowKernel({ taps = 8, strength = 0.9, components = GLOW_DEFAULTS.components } = {}) {
  const centre = (taps - 1) * 0.5, start = -Math.floor(taps * 0.5);
  const weights = [], offsets = [];
  for (let i = 0; i < taps; i++) {
    let w = 0;
    for (const [a, b, c] of components) {
      const x = i - centre + b;
      w += c * Math.exp(-a * x * x / (centre * centre));
    }
    weights.push(Math.fround(w * strength));
    offsets.push(i + start);
  }
  return { weights, offsets };
}

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 1+2: (2·ssaa)² box downsample of the scene to half the output resolution, grayscale alpha, rgb·a
const SOURCE_FRAG = /* glsl */`
uniform sampler2D tScene;
uniform vec2 uSceneSize;
uniform vec3 uCoef, uBg;
uniform float uUnder, uOver, uExclude;
void main() {
  vec2 base = floor(gl_FragCoord.xy) * float(GLOW_K);
  vec3 sum = vec3(0.0);
  float bgHits = 0.0;
  for (int j = 0; j < GLOW_K; j++) for (int i = 0; i < GLOW_K; i++) {
    vec2 p = min(base + vec2(float(i), float(j)) + 0.5, uSceneSize - 0.5);
    vec3 c = texture2D(tScene, p / uSceneSize).rgb;
    float isBg = step(max(max(abs(c.r - uBg.r), abs(c.g - uBg.g)), abs(c.b - uBg.b)), 0.5 / 255.0) * uExclude;
    bgHits += isBg;
    sum += c * (1.0 - isBg);
  }
  vec3 rgb = sum / float(GLOW_K * GLOW_K);
  float a = clamp(clamp(clamp(dot(rgb, uCoef), 0.0, 1.0) + uOver, 0.0, 1.0) + uUnder, 0.0, 1.0);
  gl_FragColor = vec4(rgb * a, a);
}`;

const BLUR_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uSize, uAxis;
uniform float uWeights[GLOW_TAPS];
uniform float uOffsets[GLOW_TAPS];
void main() {
  vec2 p = floor(gl_FragCoord.xy) + 0.5;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < GLOW_TAPS; i++) {
    vec2 q = clamp(p + uAxis * uOffsets[i], vec2(0.5), uSize - 0.5);   // ADDRESS CLAMP, POINT
    sum += texture2D(tSrc, q / uSize) * uWeights[i];
  }
  gl_FragColor = sum;
}`;

const ADD_FRAG = /* glsl */`
uniform sampler2D tScene, tGlow;
uniform vec2 uSceneSize, uGlowSize;
uniform float uScale;
void main() {
  vec2 p = floor(gl_FragCoord.xy) + 0.5;
  vec3 c = texture2D(tScene, p / uSceneSize).rgb;
  vec3 g = texture2D(tGlow, (p / uScale) / uGlowSize).rgb;   // bilinear upsample
  gl_FragColor = vec4(clamp(c + g, 0.0, 1.0), 1.0);
}`;

function rt(w, h, filter) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: filter, magFilter: filter, generateMipmaps: false, colorSpace: THREE.NoColorSpace,
  });
  t.texture.wrapS = t.texture.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export class CoeGlow {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} [opts] GLOW_DEFAULTS overrides
   */
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.opts = { ...GLOW_DEFAULTS, ...opts };
    const { weights, offsets } = glowKernel(this.opts);
    this.kernel = { weights, offsets };
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    const taps = weights.length;
    this.blurMat = new THREE.ShaderMaterial({
      defines: { GLOW_TAPS: taps }, vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG,
      uniforms: { tSrc: { value: null }, uSize: { value: new THREE.Vector2() }, uAxis: { value: new THREE.Vector2(1, 0) },
        uWeights: { value: weights }, uOffsets: { value: offsets } },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.addMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: ADD_FRAG,
      uniforms: { tScene: { value: null }, tGlow: { value: null }, uSceneSize: { value: new THREE.Vector2() },
        uGlowSize: { value: new THREE.Vector2() }, uScale: { value: 2 } },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.sourceMat = null;
    this.size = null;
  }

  /** Scene render size (width, height) and the supersampling factor: glow runs at (size/ssaa)/2. */
  setSize(width, height, ssaa = 1) {
    if (this.size && this.size.join() === [width, height, ssaa].join()) return;
    this.size = [width, height, ssaa];
    const hw = Math.ceil(width / ssaa / 2), hh = Math.ceil(height / ssaa / 2);
    this.half = [hw, hh];
    for (const k of ['rtA', 'rtB', 'rtC']) this[k]?.dispose();
    this.rtA = rt(hw, hh, THREE.NearestFilter);
    this.rtB = rt(hw, hh, THREE.NearestFilter);
    this.rtC = rt(hw, hh, THREE.LinearFilter);
    this.sourceMat?.dispose();
    const o = this.opts;
    this.sourceMat = new THREE.ShaderMaterial({
      defines: { GLOW_K: 2 * ssaa }, vertexShader: QUAD_VERT, fragmentShader: SOURCE_FRAG,
      uniforms: { tScene: { value: null }, uSceneSize: { value: new THREE.Vector2(width, height) },
        uCoef: { value: new THREE.Vector3().fromArray(o.coefficient) }, uBg: { value: new THREE.Vector3(-1, -1, -1) },
        uUnder: { value: o.under }, uOver: { value: o.over }, uExclude: { value: o.excludeBackground ? 1 : 0 } },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.addMat.uniforms.uScale.value = 2 * ssaa;
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.camera);
  }

  /**
   * sceneTarget (rendered scene, setSize dimensions) → outTarget (null = canvas) = scene + glow.
   * @param {number[]} [background] linear RGB clear colour (excluded from the glow source)
   */
  apply(sceneTarget, outTarget = null, background = null) {
    const [w, h] = this.size, [hw, hh] = this.half;
    const prev = this.renderer.getRenderTarget(), prevAuto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    const s = this.sourceMat.uniforms;
    s.tScene.value = sceneTarget.texture;
    s.uBg.value.set(...(background && this.opts.excludeBackground ? background : [-1, -1, -1]));
    this._pass(this.sourceMat, this.rtA);
    const b = this.blurMat.uniforms;
    b.uSize.value.set(hw, hh);
    b.tSrc.value = this.rtA.texture; b.uAxis.value.set(1, 0);
    this._pass(this.blurMat, this.rtB);
    b.tSrc.value = this.rtB.texture; b.uAxis.value.set(0, 1);
    this._pass(this.blurMat, this.rtC);
    const a = this.addMat.uniforms;
    a.tScene.value = sceneTarget.texture; a.tGlow.value = this.rtC.texture;
    a.uSceneSize.value.set(w, h); a.uGlowSize.value.set(hw, hh);
    this._pass(this.addMat, outTarget);
    this.renderer.setRenderTarget(prev);
    this.renderer.autoClear = prevAuto;
  }

  dispose() {
    for (const k of ['rtA', 'rtB', 'rtC']) this[k]?.dispose();
    this.sourceMat?.dispose(); this.blurMat.dispose(); this.addMat.dispose();
    this.quad.geometry.dispose();
  }
}
