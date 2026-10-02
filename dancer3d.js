/**
 * Velvet Veil Vortex — Neon Valkyrie (Meshy GLB)
 * Full-body framing, textures preserved, soft white neon, slow Y spin.
 * Transparent canvas over album cover.
 */
import * as THREE from './assets/js/three.module.js';
import { GLTFLoader } from './assets/js/GLTFLoader.js';

const canvas = document.getElementById('dancer-canvas');
const stage = document.getElementById('dancer-stage');
const fallback = document.getElementById('dancer-img');
if (!canvas || !stage) {
  /* no stage */
} else {

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  premultipliedAlpha: false,
  powerPreference: 'high-performance'
});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();

// Wider FOV so full figure fits without vertical crop
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
camera.position.set(0, 0.95, 3.2);
camera.lookAt(0, 0.9, 0);

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(2.0, 3.2, 2.8);
scene.add(key);
const fill = new THREE.DirectionalLight(0xf2f6ff, 0.9);
fill.position.set(-2.5, 1.6, 1.8);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.1);
rim.position.set(0.2, 2.0, -2.8);
scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3040, 0.55));

const floorMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.06,
  depthWrite: false
});
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.002;
scene.add(floor);

let modelRoot = null;
let ready = false;
const clock = new THREE.Clock();
const SPIN_RAD_PER_SEC = (Math.PI * 2) / 18;

// Nudge model left & slightly down in view
const OFFSET_X = -0.18;
const OFFSET_Y = -0.12;

function resize() {
  const w = Math.max(1, stage.clientWidth || 200);
  const h = Math.max(1, stage.clientHeight || 420);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (ready && modelRoot) frameCamera(modelRoot);
}

function applySoftNeonKeepTextures(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map((src) => {
      if (!src) return src;
      const mat = src.clone();

      // Keep maps (albedo / MR / normal) — do not wipe textures
      // Soft glass: slight transparency + gentle white neon
      mat.transparent = true;
      mat.opacity = 0.88;
      mat.depthWrite = true;
      mat.side = THREE.DoubleSide;

      // Meshy exports metalness=1 → looks untextured/black without env map
      if ('metalness' in mat) mat.metalness = 0.12;
      if ('roughness' in mat) mat.roughness = 0.45;

      // Don't tint base color hard — let albedo texture show
      if (mat.color) mat.color.set(0xffffff);

      if ('emissive' in mat) {
        mat.emissive = new THREE.Color(0xdde6f5);
        mat.emissiveIntensity = 0.22; // soft neon, not blown out
      }
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.35;

      // Ensure texture color spaces
      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.needsUpdate = true;
      }
      if (mat.emissiveMap) {
        mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      }
      if (mat.normalMap) mat.normalMap.needsUpdate = true;
      if (mat.metalnessMap) mat.metalnessMap.needsUpdate = true;
      if (mat.roughnessMap) mat.roughnessMap.needsUpdate = true;

      mat.needsUpdate = true;
      return mat;
    });
    obj.material = next.length === 1 ? next[0] : next;
  });
}

function fitModel(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  root.position.x += -center.x;
  root.position.z += -center.z;
  root.position.y += -box.min.y;

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  // Slightly smaller so full body + margins fit in frame
  const targetH = 1.55;
  root.scale.multiplyScalar(targetH / maxDim);

  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;

  // User request: a bit left and down
  root.position.x += OFFSET_X;
  root.position.y += OFFSET_Y;

  frameCamera(root);
}

function frameCamera(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const sz = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());

  // Fit full height with ~12% margin top & bottom
  const vFov = (camera.fov * Math.PI) / 180;
  const fitH = sz.y * 1.24;
  const distForH = (fitH * 0.5) / Math.tan(vFov * 0.5);
  const fitW = sz.x * 1.3;
  const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * camera.aspect);
  const distForW = (fitW * 0.5) / Math.tan(hFov * 0.5);
  const dist = Math.max(distForH, distForW, 2.0);

  camera.position.set(mid.x, mid.y, dist);
  camera.lookAt(mid.x, mid.y, 0);
  camera.updateProjectionMatrix();
}

function setFallback(show) {
  if (!fallback) return;
  if (show) {
    fallback.classList.add('is-visible');
    canvas.style.opacity = '0';
  } else {
    fallback.classList.remove('is-visible');
    canvas.style.opacity = '1';
  }
}

const loader = new GLTFLoader();
loader.load(
  './assets/models/neon-valkyrie.glb',
  (gltf) => {
    modelRoot = gltf.scene;
    scene.add(modelRoot);
    fitModel(modelRoot);
    applySoftNeonKeepTextures(modelRoot);
    ready = true;
    setFallback(false);
    resize();
    console.info('[VVV] Neon Valkyrie loaded (textured, full-body)');
  },
  undefined,
  (err) => {
    console.warn('[VVV] Neon Valkyrie GLB failed:', err);
    setFallback(true);
  }
);

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  resize();

  if (ready && modelRoot && !reduceMotion) {
    // Spin around vertical axis through model center
    modelRoot.rotation.y += SPIN_RAD_PER_SEC * dt;
  }

  const e = window.__vvvEnergy || { global: 0, playing: false };
  floorMat.opacity = 0.04 + (e.playing ? (e.global || 0) * 0.06 : 0.02);

  renderer.render(scene, camera);
}

window.addEventListener('resize', resize, { passive: true });
resize();
setFallback(true);
requestAnimationFrame(frame);

}
