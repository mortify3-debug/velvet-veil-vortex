/**
 * Velvet Veil Vortex — Neon Valkyrie (Meshy GLB)
 * Slow Y-axis spin, semi-transparent, soft white neon glow.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
camera.position.set(0, 1.15, 2.6);
camera.lookAt(0, 0.95, 0);

// Soft white neon lighting (not harsh)
const key = new THREE.DirectionalLight(0xffffff, 1.15);
key.position.set(1.5, 2.4, 2.2);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8f2ff, 0.45);
fill.position.set(-2, 1.2, 1);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.7);
rim.position.set(-0.3, 1.4, -2.4);
scene.add(rim);
scene.add(new THREE.AmbientLight(0xc8d4e8, 0.35));
scene.add(new THREE.HemisphereLight(0xf0f6ff, 0x101018, 0.4));

const floorMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.1,
  depthWrite: false
});
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.65, 48), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.01;
scene.add(floor);

let modelRoot = null;
let ready = false;
const clock = new THREE.Clock();
// Full turn ~18s
const SPIN_RAD_PER_SEC = (Math.PI * 2) / 18;

function resize() {
  const w = stage.clientWidth || 180;
  const h = stage.clientHeight || 360;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function applySoftNeonGlass(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map((m) => {
      if (!m) return m;
      const mat = m.clone();
      mat.transparent = true;
      mat.opacity = 0.55;
      mat.depthWrite = false;
      mat.side = THREE.DoubleSide;

      if (mat.color) {
        mat.color.lerp(new THREE.Color(0xf2f6ff), 0.2);
      }
      if ('emissive' in mat) {
        mat.emissive = new THREE.Color(0xdde8ff);
        mat.emissiveIntensity = 0.28;
      }
      if ('roughness' in mat) mat.roughness = Math.min(mat.roughness ?? 0.5, 0.45);
      if ('metalness' in mat) mat.metalness = Math.min(Math.max(mat.metalness ?? 0.15, 0.12), 0.35);
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.6;

      mat.needsUpdate = true;
      return mat;
    });
    obj.material = next.length === 1 ? next[0] : next;
  });
}

function fitModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const target = 1.85;
  root.scale.setScalar(target / maxDim);

  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;
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
  },
  undefined,
  (err) => {
    console.warn('Neon Valkyrie GLB failed:', err);
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
  const playing = !!e.playing;
  const energy = e.global || 0;
  floorMat.opacity = 0.08 + (playing ? energy * 0.1 : 0.03);

  renderer.render(scene, camera);
}

window.addEventListener('resize', resize, { passive: true });
resize();
setFallback(true);
requestAnimationFrame(frame);

}
