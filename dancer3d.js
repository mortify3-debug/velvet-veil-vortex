/**
 * Velvet Veil Vortex — Neon Valkyrie (Meshy GLB)
 * Visible over cover: transparent canvas, no scene background,
 * soft white neon, slow Y spin, semi-transparent materials.
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
renderer.setClearColor(0x000000, 0); // fully transparent — only model over cover
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
// no scene.background — transparent over album cover

const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
camera.position.set(0, 1.0, 2.35);
camera.lookAt(0, 0.9, 0);

// Bright soft white lighting so the model is readable on dark covers
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(2.0, 3.0, 2.5);
scene.add(key);
const fill = new THREE.DirectionalLight(0xf0f6ff, 1.1);
fill.position.set(-2.5, 1.5, 1.5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.4);
rim.position.set(0.2, 1.8, -2.5);
scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.75));
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.7));

// Tiny soft ground glow only (not a solid background plate)
const floorMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.07,
  depthWrite: false
});
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.005;
scene.add(floor);

let modelRoot = null;
let ready = false;
const clock = new THREE.Clock();
const SPIN_RAD_PER_SEC = (Math.PI * 2) / 18; // ~18s per turn

function resize() {
  const w = Math.max(1, stage.clientWidth || 180);
  const h = Math.max(1, stage.clientHeight || 360);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function applySoftNeonGlass(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;
    obj.renderOrder = 2;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map((src) => {
      if (!src) return src;
      // Prefer MeshStandardMaterial so emissive works
      const mat = src.clone();

      mat.transparent = true;
      mat.opacity = 0.72;
      mat.depthWrite = true;
      mat.side = THREE.DoubleSide;
      if ('alphaTest' in mat) mat.alphaTest = 0;

      // Kill pure-metal look (Meshy often exports metallicFactor=1 → black without env map)
      if ('metalness' in mat) mat.metalness = 0.15;
      if ('roughness' in mat) mat.roughness = 0.4;
      if (mat.color) {
        mat.color.multiplyScalar(1.15);
        mat.color.lerp(new THREE.Color(0xf5f8ff), 0.12);
      }
      if ('emissive' in mat) {
        mat.emissive = new THREE.Color(0xe8f0ff);
        mat.emissiveIntensity = 0.35;
      }
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.4;

      mat.needsUpdate = true;
      return mat;
    });
    obj.material = next.length === 1 ? next[0] : next;
  });
}

function fitModel(root) {
  // Reset any baked transforms
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  root.position.x += -center.x;
  root.position.z += -center.z;
  root.position.y += -box.min.y;

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const targetH = 1.75;
  root.scale.multiplyScalar(targetH / maxDim);

  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;

  // Frame camera on fitted model
  const box3 = new THREE.Box3().setFromObject(root);
  const sz = box3.getSize(new THREE.Vector3());
  const mid = box3.getCenter(new THREE.Vector3());
  const dist = Math.max(sz.y * 1.35, sz.x * 1.6, 1.8);
  camera.position.set(0, mid.y + sz.y * 0.05, dist);
  camera.lookAt(0, mid.y, 0);
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
    applySoftNeonGlass(modelRoot);
    ready = true;
    setFallback(false);
    resize();
    console.info('[VVV] Neon Valkyrie loaded');
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
    modelRoot.rotation.y += SPIN_RAD_PER_SEC * dt;
  }

  const e = window.__vvvEnergy || { global: 0, playing: false };
  floorMat.opacity = 0.05 + (e.playing ? (e.global || 0) * 0.08 : 0.02);

  renderer.render(scene, camera);
}

window.addEventListener('resize', resize, { passive: true });
resize();
setFallback(true);
requestAnimationFrame(frame);

}
