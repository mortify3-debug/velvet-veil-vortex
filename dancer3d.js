/**
 * Velvet Veil Vortex — Neon Valkyrie (Meshy GLB)
 * Textures intact, soft aura only (not body-as-lamp), full body, 2x size.
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
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
camera.position.set(0, 0.9, 3.5);
camera.lookAt(0, 0.85, 0);

// Natural lighting — not blowing the model to white
const key = new THREE.DirectionalLight(0xffffff, 1.25);
key.position.set(2.2, 3.0, 2.6);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8eef8, 0.55);
fill.position.set(-2.2, 1.4, 1.6);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.7);
rim.position.set(0.1, 1.8, -2.6);
scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
scene.add(new THREE.HemisphereLight(0xf5f7fa, 0x1a1c24, 0.4));

let modelRoot = null;
let aura = null;
let ready = false;
const clock = new THREE.Clock();
const SPIN_RAD_PER_SEC = (Math.PI * 2) / 18;

// Much more left & down (user request)
const OFFSET_X = -0.55;
const OFFSET_Y = -0.45;
// ~2× previous visual size
const TARGET_H = 3.1;

function resize() {
  const w = Math.max(1, stage.clientWidth || 200);
  const h = Math.max(1, stage.clientHeight || 420);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (ready && modelRoot) frameCamera(modelRoot);
}

/** Keep textures; no white emissive body */
function applyTexturedLook(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map((src) => {
      if (!src) return src;
      const mat = src.clone();

      // Opaque textured surface — not a glowing lamp
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.side = THREE.DoubleSide;

      // Meshy metalness=1 kills albedo without env map
      if ('metalness' in mat) mat.metalness = 0.08;
      if ('roughness' in mat) mat.roughness = 0.55;

      if (mat.color) mat.color.set(0xffffff);

      // No emissive on the body
      if ('emissive' in mat) {
        mat.emissive = new THREE.Color(0x000000);
        mat.emissiveIntensity = 0;
      }
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.25;

      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.needsUpdate = true;
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

/** Soft white aura behind the figure only */
function makeAura(height) {
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 256;
  canvas2d.height = 512;
  const ctx = canvas2d.getContext('2d');
  const g = ctx.createRadialGradient(128, 260, 20, 128, 280, 140);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.45, 'rgba(230,240,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);

  const tex = new THREE.CanvasTexture(canvas2d);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(height * 0.75, height * 1.15),
    mat
  );
  mesh.position.z = -0.12;
  mesh.renderOrder = 0;
  return mesh;
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

  if (aura) {
    root.remove(aura);
    aura = null;
  }
  aura = makeAura(TARGET_H);
  root.add(aura);

  frameCamera(root);
}

function frameCamera(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const sz = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());

  const vFov = (camera.fov * Math.PI) / 180;
  const fitH = sz.y * 1.18;
  const distForH = (fitH * 0.5) / Math.tan(vFov * 0.5);
  const fitW = sz.x * 1.25;
  const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * camera.aspect);
  const distForW = (fitW * 0.5) / Math.tan(hFov * 0.5);
  const dist = Math.max(distForH, distForW, 2.2);

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
    applyTexturedLook(modelRoot);
    ready = true;
    setFallback(false);
    resize();
    console.info('[VVV] Neon Valkyrie: textured + soft aura only');
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

  renderer.render(scene, camera);
}

window.addEventListener('resize', resize, { passive: true });
resize();
setFallback(true);
requestAnimationFrame(frame);

}
