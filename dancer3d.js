/**
 * Velvet Veil Vortex — Neon Valkyrie
 * Show real texture colors (skin, clothes). Soft glow does not wash them out.
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
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
camera.position.set(0, 0.95, 3.2);
camera.lookAt(0, 0.9, 0);

// Balanced lights — enough to read color, not bleach
const key = new THREE.DirectionalLight(0xffffff, 1.15);
key.position.set(1.8, 2.8, 2.4);
scene.add(key);
const fill = new THREE.DirectionalLight(0xeef2f8, 0.5);
fill.position.set(-2.0, 1.3, 1.4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.85);
rim.position.set(-0.2, 1.6, -2.5);
scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
scene.add(new THREE.HemisphereLight(0xf8f9fc, 0x22252e, 0.35));

let modelRoot = null;
let ready = false;
const clock = new THREE.Clock();
const SPIN_RAD_PER_SEC = (Math.PI * 2) / 18;

const OFFSET_X = -0.18;
const OFFSET_Y = -0.12;
const TARGET_H = 1.55;

function resize() {
  const w = Math.max(1, stage.clientWidth || 200);
  const h = Math.max(1, stage.clientHeight || 420);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (ready && modelRoot) frameCamera(modelRoot);
}

/**
 * Keep albedo / normal / MR maps.
 * Soft neon only as a very weak emissive so colors stay visible.
 * Glow mainly comes from CSS drop-shadow on the canvas.
 */
function applyMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map((src) => {
      if (!src) return src;
      const mat = src.clone();

      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.side = THREE.DoubleSide;

      // Meshy often sets metalness=1 → texture looks grey/white without env map
      if ('metalness' in mat) mat.metalness = 0.05;
      if ('roughness' in mat) mat.roughness = 0.6;

      // Base color white multiplier so the TEXTURE colors show as authored
      if (mat.color) mat.color.setRGB(1, 1, 1);

      // Tiny soft neon — does not cover skin/clothes
      if ('emissive' in mat) {
        mat.emissive = new THREE.Color(0xc8d4e8);
        mat.emissiveIntensity = 0.06;
      }
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.2;

      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = 4;
        mat.map.needsUpdate = true;
      }
      if (mat.normalMap) mat.normalMap.needsUpdate = true;
      if (mat.metalnessMap) mat.metalnessMap.needsUpdate = true;
      if (mat.roughnessMap) mat.roughnessMap.needsUpdate = true;
      // Don't use metalnessMap as strong metal if it washes colors
      if (mat.metalnessMap) {
        mat.metalness = 0.05;
      }

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
  root.scale.multiplyScalar(TARGET_H / maxDim);

  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;

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

  const vFov = (camera.fov * Math.PI) / 180;
  const fitH = sz.y * 1.22;
  const distForH = (fitH * 0.5) / Math.tan(vFov * 0.5);
  const fitW = sz.x * 1.28;
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
    applyMaterials(modelRoot);
    ready = true;
    setFallback(false);
    resize();
    console.info('[VVV] Neon Valkyrie: texture colors visible');
  },
  undefined,
  (err) => {
    console.warn('[VVV] GLB failed:', err);
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

  renderer.render(scene, camera);
}

window.addEventListener('resize', resize, { passive: true });
resize();
setFallback(true);
requestAnimationFrame(frame);

}
