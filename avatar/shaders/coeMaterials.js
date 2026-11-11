// Draft three.js (r150+) ShaderMaterials reproducing SMT IMAGINE's COE_HairColor and COE_Skinning
// (SM2.0 implementation "VS20") NSB shaders. Derived from disassembly of COE_Blender2.vso +
// COE_HairColor.pso and COE_Skinning20.vso + COE_Skinning.pso. Untested draft.
//
// Colour-space note: D3D9 did no gamma handling. Load DDS textures with colorSpace = NoColorSpace
// and render with renderer.outputColorSpace = THREE.LinearSRGBColorSpace (i.e. no conversion), or the
// result will be washed out compared to the game.
import * as THREE from 'three';

// Shared per-vertex Gamebryo-style lighting (1 directional + up to 3 point lights, linear falloff).
const LIGHTING_GLSL = /* glsl */`
uniform vec3 uAmbientLight;      // AmbientLight (c8)
uniform vec4 uMatAmbient;        // MaterialAmbient (c9)  from NiMaterialProperty
uniform vec4 uMatDiffuse;        // MaterialDiffuse (c4)  .a = material alpha
uniform vec3 uMatEmissive;       // MaterialEmissive (c5 / c11)
uniform vec3 uDirLightDir;       // WorldDirection@@Light1 (direction the light travels, world space)
uniform vec3 uDirLightColor;     // Diffuse@@Light1
uniform vec3 uPointPos[3];       // WorldPosition@@Light2..4
uniform vec3 uPointColor[3];     // Diffuse@@Light2..4 (set to 0 to disable)
uniform float uPointLinear[3];   // Attenuation@@LightN .y
vec4 coeLighting(vec3 Pw, vec3 Nw) {
  vec3 diff = max(dot(Nw, -uDirLightDir), 0.0) * uMatDiffuse.rgb * uDirLightColor;
  for (int i = 0; i < 3; i++) {
    vec3 d = uPointPos[i] - Pw; float dist = length(d);
    float att = max(1.0 - uPointLinear[i] * dist * 0.25, 0.0);   // Zoze.z = 0.25
    diff += max(dot(Nw, d / dist), 0.0) * uMatDiffuse.rgb * uPointColor[i] * att;
  }
  vec3 rgb = uMatAmbient.rgb * uAmbientLight + diff + uMatEmissive;
  return vec4(rgb, uMatDiffuse.a);
}`;

// ---------------------------------------------------------------- COE_HairColor (hair and eyes)
// final = (texBase + texDetail * Color1) * clamp(lighting * vertexColor * ModelColor, 0, 1)
export function makeHairColorMaterial({ baseMap, detailMap, color1, modelColor = new THREE.Vector4(1,1,1,1), skinning = true }) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([{
      tBase: { value: baseMap }, tDetail: { value: detailMap },
      uColor1: { value: color1 },            // per-character hair / eye colour (RGBA, alpha matters!)
      uModelColor: { value: modelColor },    // ModelColor attribute (c90)
      uAmbientLight: { value: new THREE.Vector3(0.5,0.5,0.5) },
      uMatAmbient: { value: new THREE.Vector4(1,1,1,1) }, uMatDiffuse: { value: new THREE.Vector4(1,1,1,1) },
      uMatEmissive: { value: new THREE.Vector3(0,0,0) },
      uDirLightDir: { value: new THREE.Vector3(0,0,-1) }, uDirLightColor: { value: new THREE.Vector3(1,1,1) },
      uPointPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uPointColor: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uPointLinear: { value: [0,0,0] },
      uUvXformBase: { value: new THREE.Matrix3() }, uUvXformDetail: { value: new THREE.Matrix3() },
    }]),
    vertexColors: true,
    defines: { USE_SKINNING: skinning ? 1 : undefined },
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      ${LIGHTING_GLSL}
      uniform vec4 uModelColor;
      uniform mat3 uUvXformBase, uUvXformDetail;
      attribute vec2 uv1;              // second UV set if present; else copy uv into it
      varying vec4 vDiffuse; varying vec2 vUv0; varying vec2 vUv1;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 Pw = modelMatrix * vec4(transformed, 1.0);
        vec3 Nw = mat3(modelMatrix) * objectNormal;    // game does NOT normalise here (m3x3 only)
        vec4 lit = coeLighting(Pw.xyz, Nw);
        // vertex colour (white if mesh has none) and ModelColor; oD0 is saturated by D3D9
        vDiffuse = clamp(lit * vec4(color.rgb, 1.0) * uModelColor, 0.0, 1.0);
        vUv0 = (uUvXformBase * vec3(uv, 1.0)).xy;
        vUv1 = (uUvXformDetail * vec3(uv1, 1.0)).xy;
        gl_Position = projectionMatrix * viewMatrix * Pw;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tBase, tDetail; uniform vec4 uColor1;
      varying vec4 vDiffuse; varying vec2 vUv0; varying vec2 vUv1;
      void main() {
        vec4 c = texture2D(tBase, vUv0) + texture2D(tDetail, vUv1) * uColor1;   // mad r0, t1, c0, t0
        c *= vDiffuse;                                                          // mul r0, v0, r0
        c = clamp(c, 0.0, 1.0);
        if (c.a <= 1.0 / 255.0) discard;       // ALPHATESTENABLE, ALPHAFUNC=GREATER, ALPHAREF=1
        gl_FragColor = c;                      // blended SRCALPHA / INVSRCALPHA
      }`,
    transparent: true, blending: THREE.NormalBlending, depthWrite: true,
  });
}
// NB vertexColors: three only provides 'color' as vec3; the game's vertex alpha also multiplies
// alpha (mul r10, r10, v4). If meshes carry vertex alpha, pass it as a vec4 attribute instead.

// ---------------------------------------------------------------- COE_Skinning (body, face, legs...)
// final = (texBase.a > 0.94 ? texBase : 0) * clamp(lighting * ModelColor, 0, 1)   (no specular on VS20)
export function makeSkinningMaterial({ baseMap, modelColor = new THREE.Vector4(1,1,1,1) }) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([{
      tBase: { value: baseMap }, uModelColor: { value: modelColor },
      uAmbientLight: { value: new THREE.Vector3(0.5,0.5,0.5) },
      uMatAmbient: { value: new THREE.Vector4(1,1,1,1) }, uMatDiffuse: { value: new THREE.Vector4(1,1,1,1) },
      uMatEmissive: { value: new THREE.Vector3(0,0,0) },
      uDirLightDir: { value: new THREE.Vector3(0,0,-1) }, uDirLightColor: { value: new THREE.Vector3(1,1,1) },
      uPointPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uPointColor: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uPointLinear: { value: [0,0,0] },
    }]),
    defines: { USE_SKINNING: 1 },
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      ${LIGHTING_GLSL}
      uniform vec4 uModelColor;
      varying vec4 vDiffuse; varying vec2 vUv0;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 Pw = modelMatrix * vec4(transformed, 1.0);
        vec3 Nw = normalize(mat3(modelMatrix) * objectNormal);   // Skinning20.vso normalises
        // COE_Skinning20.vso only evaluates point lights 2 and 3 (not 4)
        vDiffuse = clamp(coeLighting(Pw.xyz, Nw) * uModelColor, 0.0, 1.0);
        vUv0 = uv;   // no texture transform in this shader
        gl_Position = projectionMatrix * viewMatrix * Pw;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tBase; varying vec4 vDiffuse; varying vec2 vUv0;
      void main() {
        vec4 t = texture2D(tBase, vUv0);
        vec4 c = (t.a - 0.44 > 0.5) ? t : vec4(0.0);   // sub r0,t0,c0 ; cnd r1, r0.a, t0, c1
        c *= vDiffuse;
        if (c.a <= 1.0 / 255.0) discard;              // ALPHAREF=1, GREATER  => effectively t.a > 0.94 cutout
        gl_FragColor = c;
      }`,
    transparent: true, blending: THREE.NormalBlending, depthWrite: true,
  });
}
