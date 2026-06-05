// nav.js — RoomNav: continuous orbit (3/4 turntable) ↔ first-person presence rig.
// One scalar `immersion` (0..1) drives the whole camera. Pulling it up dollies the
// camera down into the room, levels the horizon, and hands control to walk-mode.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SketchPass } from './sketch.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Accelerate raycasts (collision) on the heavy meshes.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const expSmooth = (cur, tgt, dt, rate) => cur + (tgt - cur) * (1 - Math.exp(-dt * rate));

export class RoomNav {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.listeners = [];
    this.readyCbs = [];

    // ---- renderer ----
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = opts.exposure ?? 1.12;
    this.renderer.domElement.id = 'gl';
    container.appendChild(this.renderer.domElement);

    // ---- scene ----
    this.scene = new THREE.Scene();
    this.paper = new THREE.Color(opts.paper || '#e8e5de');
    this.scene.background = this.paper;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xe6e4df, 0.5);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xffffff, 0.42);
    this.dir.position.set(18, 44, 26);
    this.scene.add(this.dir);
    this.dir2 = new THREE.DirectionalLight(0xeef2ff, 0.2);
    this.dir2.position.set(-20, 22, -20);
    this.scene.add(this.dir2);
    // colour-mode "sun" — brighter key light, aimable to lift the dark church facade
    this.colorSun = opts.colorSun ?? false;
    this.sunAz = opts.sunAzDeg ?? 35;     // degrees
    this.sunElev = opts.sunElevDeg ?? 42; // degrees
    this.sunIntensity = opts.sunIntensity ?? 2.0;
    this.sun = new THREE.DirectionalLight(0xfff4e6, 0);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this._updateSun();
    // unified matte plaster look (gypsum maquette)
    this.plaster = new THREE.MeshStandardMaterial({ color: 0xedeff2, roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide });
    this.plaster.envMapIntensity = 1.05;

    // ---- camera ----
    this.camera = new THREE.PerspectiveCamera(48, 1, opts.near ?? 0.08, 400);

    // ---- nav state ----
    this.az = (opts.azDeg ?? -38) * DEG;  // azimuth (heading of the orbit)
    this.pitchOffset = 0;          // user-added pitch on top of the rest pose
    this.imm = 0;                  // actual immersion (animated)
    this.targetImm = 0;            // where the widget wants it
    this.mode = 'orbit';
    this.autoRotate = opts.autoRotate ?? true;
    this.autoSpeed = 0.085;     // rad/s
    this.walkSpeed = opts.walkSpeed ?? 6.2;       // m/s
    this.turnSpeed = 1.5;       // rad/s — arrow-key view rotation
    this.lookSens = 1.0;        // look sensitivity multiplier
    this.eyeHeight = opts.eyeHeight ?? 1.62;      // camera height above floor/ground
    this.groundFollow = opts.groundFollow ?? false; // track terrain height while walking
    this.orbitTargetFrac = opts.orbitTargetFrac ?? 0.60; // look-at height as fraction of bbox from min
    this.lastInteract = -1e9;
    this.colliders = [];
    this.glide = null;             // {fromX,fromZ,toX,toZ,t,dur}
    this.keys = {};
    this.ready = false;
    this.renderStyle = 'solid';    // 'solid' | 'sketch'
    this.sketch = new SketchPass(this.renderer);
    // AO transition (tweakable): level = where on the dive it fades, band = how
    // gradual. Defaults reproduce the original smooth fade across the slider.
    this.aoLevel = 0.40;
    this.aoBand = 0.15;
    this.aoStrength = 1.0;
    // solid "Гипс" pipeline: render + soft ambient occlusion for clay-model depth
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ssao = new SSAOPass(this.scene, this.camera, 16, 16);
    this.ssao.kernelRadius = 9;
    this.ssao.minDistance = 0.0008;
    this.ssao.maxDistance = 0.04;
    this.composer.addPass(this.ssao);
    this.composer.addPass(new OutputPass());

    // tunables (filled after model loads)
    this.center = new THREE.Vector3(11, -0.5, -11);
    this.R0 = 52;
    this.walkBounds = { minX: -1, maxX: 23, minZ: -22, maxZ: 0 };
    this.eyeY = -1.9;
    this.orbitTargetY = -0.4;
    this.walkX = 11; this.walkZ = -11;

    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._dirX = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._down = new THREE.Vector3(0, -1, 0);
    this._lastTap = null;
    this._ray = new THREE.Raycaster();

    this._bindInput();
    this._resize();
    addEventListener('resize', () => this._resize());

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
  }

  // Build a GLTFLoader wired with the decoders a given asset family needs.
  //   draco — gstatic DRACO decoder (legacy single-file exports)
  //   ktx2  — KTX2/Basis transcoder (LOD streaming assets; needs the renderer)
  // Meshopt is always enabled (cheap, used by every export here).
  _makeLoader({ draco = false, ktx2 = false } = {}) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    if (draco) {
      const d = new DRACOLoader();
      d.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      loader.setDRACOLoader(d);
    }
    if (ktx2) {
      const k = new KTX2Loader()
        .setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/')
        .detectSupport(this.renderer);   // renderer already exists
      loader.setKTX2Loader(k);
    }
    return loader;
  }

  // Process a freshly-loaded root: bake transforms, build BVH, register colliders,
  // and apply the CURRENT render style (so chunks streamed in after the user has
  // switched to "colour" keep their authored materials instead of going plaster).
  _ingestRoot(root) {
    this.scene.add(root);
    root.updateMatrixWorld(true);       // bake node translations before reading AABBs
    const useOrig = this.renderStyle === 'material';
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;          // critical: bad bounding spheres else cull these
      o.geometry.computeBoundingBox();
      o.geometry.computeBoundsTree();   // BVH for fast collision raycasts
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      this.colliders.push(o);
      const m = o.material;
      o.userData.origMat = m;           // remember authored material for the "colour" mode
      if (m) m.envMapIntensity = 1.35;  // lift dark authored materials via IBL
      // large flat low slabs = ground/plaza → push back in depth so coplanar
      // markings/paths stop z-fighting (visible in colour mode)
      const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
      if (m && sy < 1.5 && Math.max(sx, sz) > 25) {
        m.polygonOffset = true; m.polygonOffsetFactor = 1.5; m.polygonOffsetUnits = 2;
      }
      // keep alpha-cutout foliage & glass as authored; plaster the solid rest
      const keep = m && (m.transmission > 0 || m.alphaTest > 0 || m.transparent);
      if (keep) m.side = THREE.DoubleSide;
      else if (!useOrig) o.material = this.plaster;   // uniform gypsum surface
    });
  }

  // Recompute framing from every collider currently in the scene: AABB, orbit
  // radius, walk bounds, and the floor height under the centre. Called once after
  // the core model(s) load — NOT per streamed sculpture (which sit inside the site
  // footprint and must not shift the camera/floor that the site already defined).
  _recomputeBounds() {
    const box = new THREE.Box3(), b = new THREE.Box3();
    for (const o of this.colliders) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(b);
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.center.copy(center);
    this.bbox = box;
    this._updateSun();   // re-aim sun at the true model centre
    const radius = size.length() / 2;
    this.R0 = Math.max(size.x, size.z) * (this.opts.r0Scale ?? 1.18);   // frame the footprint
    this.modelRadius = radius;
    this.camera.far = Math.max(400, this.R0 * 4); // avoid clipping large sites
    this.camera.updateProjectionMatrix();
    this.orbitTargetY = box.min.y + size.y * this.orbitTargetFrac;
    const pad = 2.2;
    this.walkBounds = {
      minX: box.min.x + pad, maxX: box.max.x - pad,
      minZ: box.min.z + pad, maxZ: box.max.z - pad,
    };
    this.walkX = center.x; this.walkZ = center.z;
    // find floor by ray-casting straight down at the centre
    this._ray.set(new THREE.Vector3(center.x, box.max.y + 5, center.z), new THREE.Vector3(0, -1, 0));
    const hits = this._ray.intersectObjects(this.colliders, true);
    let floorY;
    if (hits.length) {
      floorY = this.groundFollow ? hits[hits.length - 1].point.y
                                  : hits[hits.length > 1 ? Math.floor(hits.length / 2) : 0].point.y;
    } else floorY = box.min.y + 0.5;
    this.eyeY = floorY + this.eyeHeight;
    this.baseEyeY = this.eyeY;
    this.groundY = floorY;
    return { box, center, size };
  }

  // Single-file load (room / legacy grounds exports — meshopt + optional DRACO).
  load(url, onProgress) {
    return new Promise((resolve, reject) => {
      const loader = this._makeLoader({ draco: true });
      loader.load(url, (gltf) => {
        this._ingestRoot(gltf.scene);
        const r = this._recomputeBounds();
        this.ready = true;
        this._apply(0);
        this.readyCbs.forEach((cb) => cb());
        resolve(r);
      }, onProgress, reject);
    });
  }

  // LOD core: load the always-on chunks (site + vegetation, meshopt + KTX2) in
  // parallel, ingest each at identity transform, then frame once. onProgress gets
  // the summed { loaded, total } across all core files.
  loadCore(urls, onProgress) {
    const loader = this._makeLoader({ ktx2: true });
    const prog = urls.map(() => ({ loaded: 0, total: 0 }));
    const emit = () => {
      if (!onProgress) return;
      let loaded = 0, total = 0;
      for (const p of prog) { loaded += p.loaded; total += p.total; }
      onProgress({ loaded, total });
    };
    return Promise.all(urls.map((url, i) => new Promise((res, rej) => {
      loader.load(url, (gltf) => { this._ingestRoot(gltf.scene); res(); },
        (e) => { prog[i] = { loaded: e.loaded || 0, total: e.total || 0 }; emit(); }, rej);
    }))).then(() => {
      const r = this._recomputeBounds();
      this.ready = true;
      this._apply(0);
      this.readyCbs.forEach((cb) => cb());
      return r;
    });
  }

  // LOD streaming: queue heavy detail chunks (sculptures) to load by proximity to
  // the camera focus — nearest first, one at a time, each appearing as it arrives.
  //   items: [{ url, name, center:[x,y,z] }]
  //   opts.radius — only stream items within this distance of the focus (default ∞,
  //                 i.e. stream them all, nearest-first); opts.onChange(state) fires
  //                 on every status change with { done, total, loading, items }.
  streamItems(items, opts = {}) {
    this._stream = items.map((it) => ({
      url: it.url, name: it.name || it.url,
      center: new THREE.Vector3(it.center[0], it.center[1], it.center[2]),
      status: 'idle',
    }));
    this._streamLoader = this._makeLoader({ ktx2: true });
    this._streamRadius = opts.radius ?? Infinity;
    this._streamCb = opts.onChange || null;
    this._streamBusy = false;
    this._streamT = 0;
    this._emitStream();
  }
  _emitStream() {
    if (!this._streamCb) return;
    const done = this._stream.filter((s) => s.status === 'done').length;
    const loading = this._stream.find((s) => s.status === 'loading');
    this._streamCb({ done, total: this._stream.length, loading: loading ? loading.name : null, items: this._stream });
  }
  _streamTick() {
    if (!this._stream || this._streamBusy) return;
    // pick the nearest still-idle item within the streaming radius of the focus
    const fx = this.walkX, fz = this.walkZ;
    let best = null, bd = Infinity;
    for (const s of this._stream) {
      if (s.status !== 'idle') continue;
      const d = Math.hypot(s.center.x - fx, s.center.z - fz);
      if (d <= this._streamRadius && d < bd) { bd = d; best = s; }
    }
    if (!best) return;
    best.status = 'loading';
    this._streamBusy = true;
    this._emitStream();
    this._streamLoader.load(best.url, (gltf) => {
      this._ingestRoot(gltf.scene);     // applies current render style; sits at identity
      best.status = 'done';
      this._streamBusy = false;
      this._emitStream();
    }, undefined, (err) => {
      console.error('LOD stream failed:', best.url, err);
      best.status = 'idle';             // let it retry on a later tick
      this._streamBusy = false;
      this._emitStream();
    });
  }

  start() { this.clock.start(); requestAnimationFrame(this._loop); }

  // ---------- public control ----------
  onChange(cb) { this.listeners.push(cb); }
  onReady(cb) { if (this.ready) cb(); else this.readyCbs.push(cb); }

  // Render the model straight down as a line plan into a 2D canvas (once).
  // Returns the world→map transform so the UI can place labels + the marker.
  buildMinimap(canvas2d, maxDim = 240) {
    const b = this.bbox;
    const pad = 1.0;
    const minX = b.min.x - pad, maxX = b.max.x + pad;
    const minZ = b.min.z - pad, maxZ = b.max.z + pad;
    const wWorld = maxX - minX, hWorld = maxZ - minZ;
    const aspect = wWorld / hWorld;
    let W, H;
    if (aspect >= 1) { W = maxDim; H = Math.round(maxDim / aspect); }
    else { H = maxDim; W = Math.round(maxDim * aspect); }
    const SS = 2; // supersample for crisp lines
    const pw = W * SS, ph = H * SS;

    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const cam = new THREE.OrthographicCamera(-wWorld / 2, wWorld / 2, hWorld / 2, -hWorld / 2, 0.1, 1000);
    cam.up.set(0, 0, -1);
    cam.position.set(cx, b.max.y + 200, cz);
    cam.lookAt(cx, b.min.y, cz);
    cam.updateProjectionMatrix();

    const outRT = new THREE.WebGLRenderTarget(pw, ph, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.sketch.renderToTarget(this.scene, cam, outRT, pw, ph, { depthScale: 4.0, normScale: 1.25, bg: '#efece4' });
    const buf = new Uint8Array(pw * ph * 4);
    this.renderer.readRenderTargetPixels(outRT, 0, 0, pw, ph, buf);
    this.renderer.setRenderTarget(null);
    this.sketch.setSize(this.container.clientWidth || innerWidth, this.container.clientHeight || innerHeight);

    canvas2d.width = pw; canvas2d.height = ph;
    canvas2d.style.width = W + 'px'; canvas2d.style.height = H + 'px';
    const ctx = canvas2d.getContext('2d');
    const img = ctx.createImageData(pw, ph);
    // WebGL origin is bottom-left → flip vertically into the 2D canvas
    for (let y = 0; y < ph; y++) {
      const srcRow = (ph - 1 - y) * pw * 4;
      const dstRow = y * pw * 4;
      img.data.set(buf.subarray(srcRow, srcRow + pw * 4), dstRow);
    }
    ctx.putImageData(img, 0, 0);
    outRT.dispose();
    this.mapT = { minX, maxX, minZ, maxZ, W, H };
    return this.mapT;
  }
  // world (x,z) → minimap css pixels {x,y}
  worldToMap(x, z) {
    const t = this.mapT;
    return { x: (x - t.minX) / (t.maxX - t.minX) * t.W, y: (z - t.minZ) / (t.maxZ - t.minZ) * t.H };
  }
  _emit() {
    const st = { imm: this.imm, targetImm: this.targetImm, mode: this.mode, heading: this.getHeadingDeg(), autoRotate: this.autoRotate, renderStyle: this.renderStyle, walkX: this.walkX, walkZ: this.walkZ, focusX: this.focusX, focusZ: this.focusZ };
    for (const cb of this.listeners) cb(st);
  }
  setTargetImmersion(v, user = true) {
    v = clamp(v, 0, 1);
    // Entering walk/presence mode: level the horizon so the walk never starts
    // looking at the floor or the sky (drop any pitch carried over from orbit).
    if (v >= 0.86 && this.targetImm < 0.86) this.pitchOffset = 0;
    this.targetImm = v;
    if (user) this._interact();
  }
  nudgeImmersion(d) { this.setTargetImmersion(this.targetImm + d); }
  getImmersion() { return this.imm; }
  toggleAuto() { this.autoRotate = !this.autoRotate; this._emit(); }
  setRenderStyle(s) {
    this.renderStyle = s;
    // 'material' restores authored materials; 'solid'/'sketch' use the gypsum surface
    const useOrig = (s === 'material');
    for (const o of this.colliders) {
      const orig = o.userData.origMat;
      if (!orig) continue;
      if (useOrig) o.material = orig;
      else {
        const keep = orig.transmission > 0 || orig.alphaTest > 0 || orig.transparent;
        o.material = keep ? orig : this.plaster;
      }
    }
    // sun lifts the church only in colour mode (keeps the soft gypsum look intact)
    if (useOrig && this.colorSun) {
      this.sun.intensity = this.sunIntensity;
      this.hemi.intensity = 1.35;   // strong sky fill so no facade reads dark
      this.dir.intensity = 0.8;
      this.dir2.intensity = 0.5;
    } else {
      this.sun.intensity = 0;
      this.hemi.intensity = 0.5;     // soft even light for the gypsum maquette
      this.dir.intensity = 0.42;
      this.dir2.intensity = 0.2;
    }
    this._emit();
  }
  _updateSun() {
    if (!this.sun) return;
    const az = this.sunAz * Math.PI / 180, el = this.sunElev * Math.PI / 180;
    const r = 80, c = this.center || { x: 0, y: 0, z: 0 };
    this.sun.position.set(c.x + r * Math.cos(el) * Math.sin(az), (c.y || 0) + r * Math.sin(el), c.z + r * Math.cos(el) * Math.cos(az));
    this.sun.target.position.set(c.x, c.y || 0, c.z);
    this.sun.target.updateMatrixWorld();
  }
  setSunAz(d) { this.sunAz = d; this._updateSun(); }
  setSunElev(d) { this.sunElev = d; this._updateSun(); }
  setSunIntensity(v) { this.sunIntensity = v; if (this.renderStyle === 'material' && this.colorSun) this.sun.intensity = v; }
  // ---- tweakable setters ----
  setAutoRotate(b) { this.autoRotate = !!b; }
  setAutoSpeed(v) { this.autoSpeed = v; }
  setWalkSpeed(v) { this.walkSpeed = v; }
  setLookSens(v) { this.lookSens = v; }
  setFov(v) { this.camera.fov = v; this.camera.updateProjectionMatrix(); }
  setEyeOffset(v) { this.eyeOffset = v; if (!this.groundFollow && this.baseEyeY != null) this.eyeY = this.baseEyeY + v; }
  setSketchWeight(v) {
    const u = this.sketch.quad.material.uniforms;
    u.depthScale.value = 14.0 * v;
    u.normScale.value = 0.9 * v;
  }
  setPaper(hex) { this.paper.set(hex); this.scene.background = this.paper; this.sketch.setBackground(hex); }
  setAoStrength(v) { this.aoStrength = v; }
  setAoLevel(v) { this.aoLevel = v; }
  setAoBand(v) { this.aoBand = v; }
  setExposure(v) { this.renderer.toneMappingExposure = v; }
  getHeadingDeg() {
    this.camera.getWorldDirection(this._fwd);
    let a = Math.atan2(this._fwd.x, -this._fwd.z) / DEG;
    return (a + 360) % 360;
  }
  _interact() { this.lastInteract = performance.now(); }

  _rotate(dx, dy) {
    const s = smooth(this.imm);
    const sens = lerp(0.0052, 0.0085, s) * this.lookSens;
    this.az -= dx * sens;
    this.pitchOffset = clamp(this.pitchOffset + dy * sens * 0.9, -75 * DEG, 75 * DEG);
  }

  // Pan the floor focus (3/4 mode) — drag the model in the ground plane.
  _pan(dx, dy) {
    const cam = this.camera;
    const focus = this._tmp.set(this.walkX, this.orbitTargetY, this.walkZ);
    const dist = cam.position.distanceTo(focus);
    const vh = this.container.clientHeight || innerHeight;
    const factor = 2 * dist * Math.tan((cam.fov / 2) * DEG) / vh;
    const right = this._dirX.setFromMatrixColumn(cam.matrixWorld, 0);
    const fwdG = this._fwd.crossVectors(this._up, right);   // ground-forward
    this.walkX += (-dx * factor) * right.x + (dy * factor) * fwdG.x;
    this.walkZ += (-dx * factor) * right.z + (dy * factor) * fwdG.z;
    this._clampWalk();
  }

  _handleTap(cx, cy) {
    const now = performance.now();
    const dbl = this._lastTap && (now - this._lastTap.t < 330) &&
                Math.hypot(cx - this._lastTap.x, cy - this._lastTap.y) < 26;
    this._lastTap = dbl ? null : { t: now, x: cx, y: cy };
    if (this.imm < 0.55) {
      if (dbl) this._diveAt(cx, cy);          // 3/4: double-click dives in
    } else {
      if (dbl) { this.glide = null; this.setTargetImmersion(0); } // presence: double-click returns to overview
      else this._tapMove(cx, cy);             // presence: single tap walks to point
    }
  }

  // Double-click the floor in 3/4 → glide-dive into the room at that spot.
  _diveAt(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this.camera);
    this._ray.firstHitOnly = true;
    const hits = this._ray.intersectObjects(this.colliders, true);
    if (!hits.length) return;
    const p = hits[0].point;
    const tx = clamp(p.x, this.walkBounds.minX, this.walkBounds.maxX);
    const tz = clamp(p.z, this.walkBounds.minZ, this.walkBounds.maxZ);
    this.glide = { fromX: this.walkX, fromZ: this.walkZ, toX: tx, toZ: tz, t: 0, dur: 0.7 };
    this.setTargetImmersion(1);
  }

  // ---------- input ----------
  _bindInput() {
    const el = this.renderer.domElement;
    const pointers = new Map();
    let mouseMode = 'rotate';   // decided on mouse pointerdown (button / shift)
    let lastCx = 0, lastCy = 0, moved = 0, downX = 0, downY = 0, downT = 0, ptrType = 'mouse';
    const centroid = () => {
      let x = 0, y = 0, n = 0;
      for (const p of pointers.values()) { x += p.x; y += p.y; n++; }
      return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
    };
    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.keys = {};   // grabbing cancels any stuck held key (stops runaway spin)
      this._interact();
      try { el.setPointerCapture && e.pointerId != null && el.setPointerCapture(e.pointerId); } catch (err) {}
      ptrType = e.pointerType || 'mouse';
      if (ptrType !== 'touch') mouseMode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'rotate';
      const c = centroid(); lastCx = c.x; lastCy = c.y;
      if (pointers.size === 1) { moved = 0; downX = e.clientX; downY = e.clientY; downT = performance.now(); }
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const c = centroid();
      const dx = c.x - lastCx, dy = c.y - lastCy;
      lastCx = c.x; lastCy = c.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const pan = (ptrType === 'touch') ? pointers.size >= 2 : mouseMode === 'pan';
      if (pan && this.imm < 0.8) this._pan(dx, dy);   // pan the floor (while orbit hint is shown)
      else this._rotate(dx, dy);
      this._interact();
    };
    const onUp = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const wasTap = pointers.size === 1 && performance.now() - downT < 350 && moved < 6;
      pointers.delete(e.pointerId);
      const c = centroid(); lastCx = c.x; lastCy = c.y;
      if (wasTap) this._handleTap(downX, downY);
    };
    el.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setTargetImmersion(this.targetImm - e.deltaY * 0.0009);
    }, { passive: false });

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const move = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown'].includes(k);
      const turn = k === 'arrowleft' || k === 'arrowright';
      if (move || turn) e.preventDefault();
      this.keys[k] = true;
      if (move) {
        this._interact();
        if (this.targetImm < 0.86) this.setTargetImmersion(1); // tapping movement dives you in
      }
      if (turn) this._interact();
      if (k === 'escape') this.setTargetImmersion(0);
    });
    addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    // safety: never let a key stay "held" if the page loses focus (fixes runaway rotation)
    const clearKeys = () => { this.keys = {}; };
    addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
  }

  // ←/→ arrows rotate the view (turntable in 3/4, look in presence) — not strafe.
  _applyTurnKeys(dt) {
    let t = 0;
    if (this.keys['arrowleft']) t += 1;
    if (this.keys['arrowright']) t -= 1;
    if (t) this.az += t * this.turnSpeed * dt;
  }

  _tapMove(cx, cy) {
    if (this.imm < 0.55) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this.camera);
    const hits = this._ray.intersectObjects(this.colliders, true);
    if (!hits.length) return;
    const p = hits[0].point;
    let tx = clamp(p.x, this.walkBounds.minX, this.walkBounds.maxX);
    let tz = clamp(p.z, this.walkBounds.minZ, this.walkBounds.maxZ);
    // don't glide through a wall — stop short if one is in the straight-line path
    const dx = tx - this.walkX, dz = tz - this.walkZ;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.001) {
      this._ray.firstHitOnly = true;
      this._ray.set(this._tmp.set(this.walkX, this.eyeY - 0.4, this.walkZ), this._dirX.set(dx / dist, 0, dz / dist));
      this._ray.far = dist;
      const wall = this._ray.intersectObjects(this.colliders, true);
      this._ray.far = Infinity;
      if (wall.length && wall[0].distance < dist) {
        const d = Math.max(0, wall[0].distance - 0.5);
        tx = this.walkX + (dx / dist) * d;
        tz = this.walkZ + (dz / dist) * d;
      }
    }
    this.glide = { fromX: this.walkX, fromZ: this.walkZ, toX: tx, toZ: tz, t: 0, dur: 0.85 };
    if (this.targetImm < 0.9) this.setTargetImmersion(1);
  }

  _walkMove(dt) {
    const k = this.keys;
    let f = 0, s = 0;
    if (k['w'] || k['arrowup']) f += 1;
    if (k['s'] || k['arrowdown']) f -= 1;
    if (k['d']) s += 1;
    if (k['a']) s -= 1;
    if (!f && !s) return;
    if (this.glide) this.glide = null;
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0; this._fwd.normalize();
    const right = this._tmp.set(-this._fwd.z, 0, this._fwd.x);
    const speed = this.walkSpeed * dt;
    let dx = (this._fwd.x * f + right.x * s) * speed;
    let dz = (this._fwd.z * f + right.z * s) * speed;
    [dx, dz] = this._collide(dx, dz);
    this.walkX += dx;
    this.walkZ += dz;
    this._clampWalk();
  }

  // Per-axis wall collision: slide along walls instead of passing through.
  _collide(dx, dz) {
    const R = 0.5;            // player radius
    const oy = this.eyeY - 0.4;
    const ray = this._ray;
    ray.firstHitOnly = true;
    if (dx !== 0) {
      const sx = Math.sign(dx);
      ray.set(this._tmp.set(this.walkX, oy, this.walkZ), this._dirX.set(sx, 0, 0));
      ray.far = Math.abs(dx) + R;
      const h = ray.intersectObjects(this.colliders, true);
      if (h.length && h[0].distance < Math.abs(dx) + R) dx = Math.max(0, h[0].distance - R) * sx;
    }
    if (dz !== 0) {
      const sz = Math.sign(dz);
      ray.set(this._tmp.set(this.walkX, oy, this.walkZ), this._dirX.set(0, 0, sz));
      ray.far = Math.abs(dz) + R;
      const h = ray.intersectObjects(this.colliders, true);
      if (h.length && h[0].distance < Math.abs(dz) + R) dz = Math.max(0, h[0].distance - R) * sz;
    }
    ray.far = Infinity;
    return [dx, dz];
  }

  _clampWalk() {
    const b = this.walkBounds;
    this.walkX = clamp(this.walkX, b.minX, b.maxX);
    this.walkZ = clamp(this.walkZ, b.minZ, b.maxZ);
  }

  // Outdoor terrain: keep eye height above the GROUND under the camera. Cast from
  // high above and take the lowest hit so you never end up standing on a roof.
  _followGround(dt) {
    this._ray.firstHitOnly = false;
    this._ray.set(this._tmp.set(this.walkX, this.bbox.max.y + 6, this.walkZ), this._down);
    this._ray.far = Infinity;
    const h = this._ray.intersectObjects(this.colliders, true);
    if (h.length) {
      const g = h[h.length - 1].point.y;   // lowest surface = ground
      this.groundY = expSmooth(this.groundY, g, dt, 10);
      this.eyeY = this.groundY + this.eyeHeight + (this.eyeOffset || 0);
    }
  }

  // ---------- per-frame ----------
  _apply(s) {
    const R = lerp(this.R0, 0.04, s);
    const restPolar = lerp(50 * DEG, 90 * DEG, s);
    const pmin = lerp(40 * DEG, 30 * DEG, s);
    const pmax = lerp(78 * DEG, 150 * DEG, s);
    const polar = clamp(restPolar + this.pitchOffset, pmin, pmax);
    const fx = this.walkX;   // orbit & walk share one floor focus (enables pan + dive)
    const fz = this.walkZ;
    const fy = lerp(this.orbitTargetY, this.eyeY, s);
    this.focusX = fx; this.focusZ = fz;
    const sinP = Math.sin(polar), cosP = Math.cos(polar);
    const dx = sinP * Math.sin(this.az), dy = cosP, dz = sinP * Math.cos(this.az);
    this.camera.position.set(fx + dx * R, fy + dy * R, fz + dz * R);

    // During the dive keep the camera from dipping below the floor (no seeing the
    // slab underside). No wall collision — it caused jarring camera jumps.
    if (s > 0.06 && s < 0.985) {
      const minY = (this.eyeY - 1.62) + 0.45;
      if (this.camera.position.y < minY) this.camera.position.y = minY;
    }
    this.camera.lookAt(fx, fy, fz);
  }

  _loop() {
    requestAnimationFrame(this._loop);
    if (!this.ready) { this.renderer.render(this.scene, this.camera); return; }
    const dt = Math.min(this.clock.getDelta(), 0.05);

    this.imm = expSmooth(this.imm, this.targetImm, dt, 5.5);
    if (this.imm < 0.0015) this.imm = 0;
    const s = smooth(this.imm);

    // LOD streaming: poll proximity a few times a second (cheap; loads one at a time)
    if (this._stream) { this._streamT += dt; if (this._streamT > 0.35) { this._streamT = 0; this._streamTick(); } }

    const prevMode = this.mode;
    this.mode = this.imm > 0.8 ? 'walk' : 'orbit';

    const idle = performance.now() - this.lastInteract > 3200;
    if (this.mode === 'orbit' && this.autoRotate && idle && this.targetImm < 0.05) {
      this.az += this.autoSpeed * dt;
    }
    this._applyTurnKeys(dt);

    if (this.glide) {
      const g = this.glide;
      g.t += dt / g.dur;
      const e = smooth(clamp(g.t, 0, 1));
      this.walkX = lerp(g.fromX, g.toX, e);
      this.walkZ = lerp(g.fromZ, g.toZ, e);
      if (g.t >= 1) this.glide = null;
    }
    if (this.mode === 'walk') this._walkMove(dt);
    if (this.groundFollow && this.imm > 0.12) this._followGround(dt);

    this._apply(s);
    if (this.renderStyle === 'sketch') {
      this.sketch.render(this.scene, this.camera);
    } else {
      // AO reads great on the 3/4 maquette but goes grainy against walls inside.
      // Fade it out across the dive; level/band/strength are tweakable.
      const aoK = clamp((this.aoLevel + this.aoBand - this.imm) / (2 * this.aoBand), 0, 1);
      this.ssao.enabled = this.aoStrength > 0.01 && aoK > 0.04;
      this.ssao.maxDistance = (0.012 + 0.04 * aoK) * this.aoStrength;
      this.composer.render();
    }

    this._frame = (this._frame || 0) + 1;
    if (this._frame % 2 === 0 || prevMode !== this.mode) this._emit();
  }

  _resize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, true);
    if (this.sketch) this.sketch.setSize(w, h);
    if (this.composer) { this.composer.setSize(w, h); this.ssao.setSize(w, h); }
  }
}
