// sketch.js — "набросок" render: white faces + ink contour lines, via a
// depth+normal edge-detection post pass. Scales with poly count (no per-edge geometry).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const FRAG = `
precision highp float;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 res;
uniform float near;
uniform float far;
uniform vec3 fill;
uniform vec3 ink;
uniform vec3 bg;
uniform float depthScale;
uniform float normScale;
varying vec2 vUv;

float linDepth(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  float z = d * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}
void main(){
  vec2 t = 1.0 / res;
  float dc = texture2D(tDepth, vUv).x;
  if (dc >= 0.99995){ gl_FragColor = vec4(bg, 1.0); return; }

  float c  = linDepth(vUv);
  float l  = linDepth(vUv + vec2(-t.x, 0.0));
  float r  = linDepth(vUv + vec2( t.x, 0.0));
  float u  = linDepth(vUv + vec2(0.0,  t.y));
  float dn = linDepth(vUv + vec2(0.0, -t.y));
  float dEdge = (abs(l - c) + abs(r - c) + abs(u - c) + abs(dn - c)) / max(c, 0.6);

  vec3 nc = texture2D(tNormal, vUv).xyz;
  vec3 nl = texture2D(tNormal, vUv + vec2(-t.x, 0.0)).xyz;
  vec3 nr = texture2D(tNormal, vUv + vec2( t.x, 0.0)).xyz;
  vec3 nu = texture2D(tNormal, vUv + vec2(0.0,  t.y)).xyz;
  vec3 nd = texture2D(tNormal, vUv + vec2(0.0, -t.y)).xyz;
  float nEdge = distance(nc,nl)+distance(nc,nr)+distance(nc,nu)+distance(nc,nd);

  float e = clamp(max(dEdge * depthScale, nEdge * normScale), 0.0, 1.0);
  e = smoothstep(0.35, 0.75, e);
  // subtle floor/wall shade from normal.y so faces aren't perfectly flat
  float shade = 0.94 + 0.06 * clamp(nc.y, 0.0, 1.0);
  vec3 face = fill * shade;
  gl_FragColor = vec4(mix(face, ink, e), 1.0);
}`;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class SketchPass {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    const dt = new THREE.DepthTexture();
    dt.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthTexture: dt, depthBuffer: true,
    });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        tNormal: { value: this.rt.texture },
        tDepth: { value: dt },
        res: { value: new THREE.Vector2(2, 2) },
        near: { value: 0.1 }, far: { value: 400 },
        fill: { value: new THREE.Color(opts.fill || '#f6f4ef') },
        ink: { value: new THREE.Color(opts.ink || '#1b1a16') },
        bg: { value: new THREE.Color(opts.bg || '#e8e5de') },
        depthScale: { value: opts.depthScale ?? 14.0 },
        normScale: { value: opts.normScale ?? 0.9 },
      },
    }));
  }
  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    const W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.rt.setSize(W, H);
    this.quad.material.uniforms.res.value.set(W, H);
  }
  setBackground(hex) { this.quad.material.uniforms.bg.value.set(hex); }
  // render scene to screen (or to a given target) as a line drawing
  render(scene, camera, target = null) {
    const u = this.quad.material.uniforms;
    u.near.value = camera.near; u.far.value = camera.far;
    const prevBg = scene.background;
    scene.background = null;
    scene.overrideMaterial = this.normalMat;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = prevBg;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }
  // one-off render at an exact pixel size into outRT (used for the minimap)
  renderToTarget(scene, camera, outRT, W, H, opts = {}) {
    const u = this.quad.material.uniforms;
    const prevRtW = this.rt.width, prevRtH = this.rt.height;
    const prevRes = u.res.value.clone();
    const prevDepth = u.depthScale.value, prevNorm = u.normScale.value, prevBgU = u.bg.value.clone();
    this.rt.setSize(W, H);
    u.res.value.set(W, H);
    if (opts.depthScale != null) u.depthScale.value = opts.depthScale;
    if (opts.normScale != null) u.normScale.value = opts.normScale;
    if (opts.bg != null) u.bg.value.set(opts.bg);
    this.render(scene, camera, outRT);
    // restore
    this.rt.setSize(prevRtW, prevRtH);
    u.res.value.copy(prevRes);
    u.depthScale.value = prevDepth; u.normScale.value = prevNorm; u.bg.value.copy(prevBgU);
  }
}
