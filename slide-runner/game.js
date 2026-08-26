// ============================================================================
// SLIDE RUNNER — neon 3D tunnel dodge game (vertical freefall shaft)
//
// Coordinate convention:
//   player.distance — how far the player has fallen (spec's "x"), always
//                      increasing. Maps to world Y = -distance, so falling
//                      further means a more negative world Y (descending).
//   player.y        — the *lateral* (left/right) position the player
//                      controls by holding/releasing. Despite the name (kept
//                      to match the design doc's field, and because it's
//                      still "the bounded/controlled axis" everywhere in the
//                      generation/physics/collision code below), it maps to
//                      world X, not world Y.
//   world Z         — a small fixed cosmetic depth, used only to give the
//                      shaft visual thickness and pose the player figure;
//                      irrelevant to gameplay.
//
// All the tunnel generation, physics, and collision code below only ever
// reasons about "distance" (progress) and "y" (the bounded lateral
// coordinate) in the abstract — it has no idea which world axis either one
// actually renders to. Only the handful of `.position.set(...)` / rotation
// calls near the bottom (wall building, hazard/powerup placement, the
// player, and the camera rig) do that mapping, which is what makes this a
// vertical shaft instead of the horizontal tunnel this started as.
//
// The player and camera move forward (downward) through a world that is
// generated once and never re-positioned — this keeps per-frame work cheap.
// Old geometry well above the player is despawned and disposed.
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Constants / tuning
// ---------------------------------------------------------------------------
const TUNNEL_HALF_WIDTH = 3.2;      // visual depth (Z) of the shaft — cosmetic only
const WALL_THICK = 0.22;
const KEYPOINT_SPACING = 3;         // forward (downward) distance between tunnel keypoints
const LOOKAHEAD = 90;               // keep the world generated this far below the player
const DESPAWN_BEHIND = 14;          // drop geometry this far above the player

const BASE_SPEED = 9;
const DIFFICULTY_FACTOR = 0.10;     // currentSpeed = base + elapsed * factor
const MAX_SPEED = 26;

const PLAYER_RADIUS_BASE = 0.42;
const PLAYER_VELOCITY_Y = 7.2;      // top lateral drift speed while actively steering
const DRIFT_ACCEL = 9;              // how fast lateral velocity eases toward its target (steer, or 0 to fall straight)
const DIVE_SPEED_MULT = 1.7;        // fall-speed multiplier while diving
const DIVE_STEER_FACTOR = 0.55;     // steering authority while diving (tucked = harder to correct)

const MIN_HALF_HEIGHT = 1.05;       // tightest safe channel half-height (must clear player radius)
const MAX_HALF_HEIGHT = 3.4;

const POWERUP_TYPES = ['boost', 'shrink', 'reverse'];
const POWERUP_COLORS = { boost: 0xffd23f, shrink: 0x33f9ff, reverse: 0xff2fd0 };
const POWERUP_DURATIONS = { boost: 1.0, shrink: 3.0, reverse: 0.5 };

const BEST_KEY = 'slideRunnerBest';

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const SKY_COLOR = 0x0a0f22; // dusk haze over the city, doubles as fog color
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.FogExp2(SKY_COLOR, 0.02);

const BASE_FOV = 72;
const BOOST_FOV = 88;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.4, 0.35);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}
window.addEventListener('resize', onResize);
onResize();

// Lights — mostly emissive-material driven, but a little ambient + a moving
// point light keyed to the player keeps things from looking flat.
scene.add(new THREE.AmbientLight(0x5a6fb0, 0.28));
const playerLight = new THREE.PointLight(0x66e0ff, 2.2, 12, 2);
scene.add(playerLight);

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------

// Procedural lit-window facade texture for building faces — a dark panel
// grid with a scatter of randomly-lit windows in warm/cool city-light hues.
function makeFacadeTexture(seed) {
  const w = 128, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0c14';
  ctx.fillRect(0, 0, w, h);
  const cols = 8, rows = 16;
  const cw = w / cols, ch = h / rows;
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff); };
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      if (rnd() < 0.4) {
        const warm = rnd() < 0.6;
        ctx.fillStyle = warm ? `rgba(255,${180 + rnd() * 60 | 0},${90 + rnd() * 60 | 0},${0.7 + rnd() * 0.3})`
                              : `rgba(${140 + rnd() * 60 | 0},${210 + rnd() * 40 | 0},255,${0.7 + rnd() * 0.3})`;
        const pad = 1.5;
        ctx.fillRect(col * cw + pad, r * ch + pad, cw - pad * 2, ch - pad * 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildingMaterial(seed, tintEmissive) {
  const tex = makeFacadeTexture(seed);
  return new THREE.MeshStandardMaterial({
    color: 0x1a1c26, map: tex, emissiveMap: tex, emissive: tintEmissive,
    emissiveIntensity: 0.85, roughness: 0.75, metalness: 0.2, side: THREE.DoubleSide,
  });
}

const wallMat = buildingMaterial(7823, 0xffffff);
const wallMatAlt = buildingMaterial(4111, 0xbfe0ff);
// A fixed tile count (rather than per-segment repeat) keeps window size
// roughly consistent across the varying wall-segment lengths without
// needing a texture clone (and matching dispose) per segment.
wallMat.map.repeat.set(2, 3);
wallMatAlt.map.repeat.set(2, 3);
const skylineMat = new THREE.MeshStandardMaterial({
  color: 0x141a2c, emissive: 0x2a3a66, emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.3,
});
const hazardMat = new THREE.MeshStandardMaterial({
  color: 0x2a0510, emissive: 0xff2f5f, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.7,
});
const bladeMat = new THREE.MeshStandardMaterial({
  color: 0x2a1a00, emissive: 0xffb020, emissiveIntensity: 1.0, roughness: 0.25, metalness: 0.8,
});
const gateMat = new THREE.MeshStandardMaterial({
  color: 0x1a0025, emissive: 0xff2fd0, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.6, side: THREE.DoubleSide,
});
const carBodyMat = new THREE.MeshStandardMaterial({
  color: 0x14161e, emissive: 0xff2f5f, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.7,
});
const carHeadlightMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0xbfe8ff, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.2,
});
const carTaillightMat = new THREE.MeshStandardMaterial({
  color: 0xff3050, emissive: 0xff3050, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.2,
});

function powerupMaterial(type) {
  return new THREE.MeshStandardMaterial({
    color: 0x101018, emissive: POWERUP_COLORS[type], emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.4,
  });
}

// Player — a small low-poly "freefaller" figure, jointed at the shoulders,
// elbows, hips and knees so it animates like a real diver: a skydive arch
// (limbs bent and splayed, per the reference pose) by default, tucking into
// a streamlined dive on command. Belly faces the camera above (+Y); head
// leads into the shaft (-Z); the rig/backpack sits on the back (-Y).
const suitMat = new THREE.MeshStandardMaterial({
  color: 0x11151c, emissive: 0x1c2740, emissiveIntensity: 0.4, roughness: 0.55, metalness: 0.25,
});
const limbMat = new THREE.MeshStandardMaterial({
  color: 0x11151c, emissive: 0x6a3fd0, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0.25,
});
const jointMat = new THREE.MeshStandardMaterial({
  color: 0x0a0c12, emissive: 0xff2fd0, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0.6,
});
const pipingMat = new THREE.MeshStandardMaterial({
  color: 0x0a0c12, emissive: 0x33f9ff, emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.4,
});
const helmetMat = new THREE.MeshStandardMaterial({
  color: 0x14141c, emissive: 0x33f9ff, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.55,
});
const visorMat = new THREE.MeshStandardMaterial({
  color: 0x05070c, emissive: 0x9be8ff, emissiveIntensity: 1.7, roughness: 0.1, metalness: 0.2,
});
const rigMat = new THREE.MeshStandardMaterial({
  color: 0x191a22, emissive: 0xffb020, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.6,
});

function makeCapsule(radius, length, material) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), material);
}

// A 2-segment jointed limb (shoulder->elbow->hand, or hip->knee->foot).
// `root` gets positioned at the attach point on the torso and its rotation
// swings the whole limb; `joint` sits at the end of the upper segment and
// its rotation bends the lower segment (elbow/knee), independent of root.
function buildJointedLimb(upperLen, upperR, lowerLen, lowerR, tipR, material) {
  const root = new THREE.Group();
  const upper = makeCapsule(upperR, upperLen, material);
  upper.position.y = -upperLen / 2;
  root.add(upper);

  const elbow = new THREE.Mesh(new THREE.SphereGeometry(upperR * 1.05, 8, 6), jointMat);
  elbow.position.y = -upperLen;
  root.add(elbow);

  const joint = new THREE.Group();
  joint.position.y = -upperLen;
  root.add(joint);

  const lower = makeCapsule(lowerR, lowerLen, material);
  lower.position.y = -lowerLen / 2;
  joint.add(lower);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(tipR, 8, 6), jointMat);
  tip.position.y = -lowerLen;
  joint.add(tip);

  return { root, joint };
}

const playerMesh = new THREE.Group();

const torso = makeCapsule(0.17, 0.36, suitMat);
torso.rotation.x = Math.PI / 2; // long axis along Z, head-to-hip
playerMesh.add(torso);

// Backpack rig, mounted on the back (away from camera).
const rig = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.13, 0.3), rigMat);
rig.position.set(0, -0.13, 0.02);
playerMesh.add(rig);
[-1, 1].forEach((side) => {
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), pipingMat);
  pod.rotation.x = Math.PI / 2;
  pod.position.set(side * 0.13, -0.14, 0.04);
  playerMesh.add(pod);
});

const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), helmetMat);
head.position.set(0, 0.04, -0.36);
playerMesh.add(head);
const visor = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), visorMat);
visor.position.set(0, -0.01, -0.11);
head.add(visor);
const camMount = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.08), rigMat);
camMount.position.set(0, 0.06, -0.15);
head.add(camMount);

// Limbs — built pointing straight "down" (local -Y) at rest, then swung and
// bent into the arch pose entirely via root/joint rotation, so the same
// rest geometry also serves the tucked dive pose (see updatePlayerPose).
const armL = buildJointedLimb(0.21, 0.075, 0.22, 0.065, 0.06, limbMat);
const armR = buildJointedLimb(0.21, 0.075, 0.22, 0.065, 0.06, limbMat);
const legL = buildJointedLimb(0.26, 0.1, 0.28, 0.085, 0.075, limbMat);
const legR = buildJointedLimb(0.26, 0.1, 0.28, 0.085, 0.075, limbMat);
armL.root.position.set(-0.27, 0.09, -0.14);
armR.root.position.set(0.27, 0.09, -0.14);
legL.root.position.set(-0.14, -0.03, 0.22);
legR.root.position.set(0.14, -0.03, 0.22);
[armL, armR, legL, legR].forEach((limb) => playerMesh.add(limb.root));

scene.add(playerMesh);

// Rest-pose angles, as a function of side (-1 left, +1 right) so L/R share
// one formula. "Arch" is the default stable skydive spread; "tuck" is the
// streamlined dive pose limbs blend toward while diving.
function armPose(side, tuck) {
  return {
    root: { x: 0, y: side * lerp(-0.5, -0.1, tuck), z: side * lerp(1.3, 0.25, tuck) },
    joint: { x: lerp(-1.15, -0.25, tuck), y: 0, z: 0 },
  };
}
function legPose(side, tuck) {
  return {
    root: { x: 0, y: side * lerp(0.35, 0.05, tuck), z: side * lerp(0.55, 0.06, tuck) },
    joint: { x: lerp(1.2, 0.15, tuck), y: 0, z: 0 },
  };
}

function applyPose(limb, pose, flutter) {
  limb.root.rotation.set(pose.root.x + flutter * 0.5, pose.root.y, pose.root.z);
  limb.joint.rotation.set(pose.joint.x + flutter, pose.joint.y, pose.joint.z);
}

// Idle wind-flutter, drift bank, and dive tuck — called every frame from
// updatePlayer(). `diveBlend` eases 0 (arch) -> 1 (tuck) rather than
// snapping, so the transition into/out of a dive reads as a real pose change.
function updatePlayerPose(t, diveBlend) {
  const bank = THREE.MathUtils.clamp(player.velocityY / PLAYER_VELOCITY_Y, -1, 1);
  playerMesh.rotation.z = THREE.MathUtils.lerp(playerMesh.rotation.z, -bank * 0.5, 0.12);
  playerMesh.rotation.y = THREE.MathUtils.lerp(playerMesh.rotation.y, bank * 0.22, 0.12);
  playerMesh.rotation.x = THREE.MathUtils.lerp(-0.08, -0.35, diveBlend) + Math.sin(t * 1.4) * 0.03 * (1 - diveBlend);

  const flapArm = Math.sin(t * 8.5) * 0.14 * (1 - diveBlend * 0.7);
  const flapLeg = Math.sin(t * 8.5 + Math.PI) * 0.1 * (1 - diveBlend * 0.7);
  applyPose(armL, armPose(-1, diveBlend), flapArm);
  applyPose(armR, armPose(1, diveBlend), -flapArm);
  applyPose(legL, legPose(-1, diveBlend), flapLeg);
  applyPose(legR, legPose(1, diveBlend), -flapLeg);
}

// Trail particles — small additive sprites recycled from a pool.
const trailTexture = makeGlowTexture();
function makeGlowTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
const TRAIL_POOL_SIZE = 60;
const trailPool = [];
for (let i = 0; i < TRAIL_POOL_SIZE; i++) {
  const mat = new THREE.SpriteMaterial({ map: trailTexture, color: 0x33f9ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(mat);
  sprite.visible = false;
  scene.add(sprite);
  trailPool.push({ sprite, life: 0, maxLife: 0.5 });
}
let trailCursor = 0;
let trailAccum = 0;

function emitTrail(x, y, z, color) {
  const slot = trailPool[trailCursor];
  trailCursor = (trailCursor + 1) % TRAIL_POOL_SIZE;
  slot.life = slot.maxLife = 0.5;
  slot.sprite.position.set(x, y, z);
  slot.sprite.scale.setScalar(0.5);
  slot.sprite.material.color.setHex(color);
  slot.sprite.material.opacity = 0.85;
  slot.sprite.visible = true;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const gameState = { RUNNING: 'RUNNING', GAME_OVER: 'GAME_OVER', READY: 'READY' };

const player = {
  distance: 0,     // spec "x" — forward progress
  y: 0,
  radius: PLAYER_RADIUS_BASE,
  velocityY: 0,
  isAlive: true,
  activePowerUps: [], // { type, remainingTime }
};

let state = gameState.READY;
let elapsedTime = 0;       // seconds since run start
let currentSpeed = BASE_SPEED;
let clock = new THREE.Clock();
function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* private mode / storage disabled — best just won't persist */ }
}
let best = loadBest();

// Tunnel keypoints: { x, centerY, halfHeight }
let keypoints = [];
let wallMeshes = [];        // { mesh, x1, x2 } for despawn tracking
let generationFrontier = 0;

// Hazards & powerups currently in the world
let hazards = [];   // { x, y, width, height, type, rotationSpeed, moveAmplitude, moveSpeed, mesh, phase }
let powerUps = [];  // { x, y, type, collected, mesh }

let nextPowerUpAt = 6; // seconds — first power-up shows up early to teach the mechanic

// Camera shake (near-miss excitement)
let shakeTime = 0;
let shakeStrength = 0;

// Brief pause before gravity/collisions kick in after a (re)start — without
// it, real-world input latency between the "Start" tap and the player's
// first hold can kill them before they've had a chance to react.
const START_GRACE = 0.4;
let startGrace = 0;

// Input: steer left/right (eases toward straight when released — see
// handleInput) plus an independent dive hold for a faster, harder-to-steer
// tucked descent. `dir` combines keyboard + pointer sources, clamped to
// [-1, 1]; `diving` combines its own sources the same way.
let keyLeftHeld = false, keyRightHeld = false, keyDiveHeld = false;
let pointerDir = 0, steerPointerId = null;
let pointerDive = false, divePointerId = null;
let diving = false;
let diveBlend = 0; // eased 0 (arch pose) -> 1 (tuck), see updatePlayer

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const hud = document.getElementById('hud');
const controls = document.getElementById('controls');
const scoreEl = document.getElementById('score');
const bestInlineEl = document.getElementById('best-inline-value');
const powerupBanner = document.getElementById('powerup-banner');
const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl = document.getElementById('best-score');
const bestStartEl = document.getElementById('best-start-value');
const newBestBadge = document.getElementById('new-best-badge');

bestStartEl.textContent = Math.floor(best);
bestInlineEl.textContent = Math.floor(best);

document.getElementById('btn-start').addEventListener('click', startRun);
document.getElementById('btn-restart').addEventListener('click', startRun);
const diveBtn = document.getElementById('btn-dive');

// Steering: touch/click the left or right half of the screen (tracked by
// pointerId so a second finger on the dive button doesn't cancel it), or
// keyboard arrows/AD.
function steerDirFromEvent(e) { return e.clientX < window.innerWidth / 2 ? -1 : 1; }
canvas.addEventListener('pointerdown', (e) => {
  steerPointerId = e.pointerId;
  pointerDir = steerDirFromEvent(e);
  e.preventDefault();
});
window.addEventListener('pointermove', (e) => { if (e.pointerId === steerPointerId) pointerDir = steerDirFromEvent(e); });
window.addEventListener('pointerup', (e) => { if (e.pointerId === steerPointerId) { pointerDir = 0; steerPointerId = null; } });
window.addEventListener('pointercancel', (e) => { if (e.pointerId === steerPointerId) { pointerDir = 0; steerPointerId = null; } });

// Dive: a dedicated button (own DOM element, so it never fights the canvas
// steering zones underneath it) plus a keyboard hold.
diveBtn.addEventListener('pointerdown', (e) => {
  divePointerId = e.pointerId;
  pointerDive = true;
  e.preventDefault();
  e.stopPropagation();
});
window.addEventListener('pointerup', (e) => { if (e.pointerId === divePointerId) { pointerDive = false; divePointerId = null; } });
window.addEventListener('pointercancel', (e) => { if (e.pointerId === divePointerId) { pointerDive = false; divePointerId = null; } });

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const DIVE_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'ArrowDown', 'KeyS']);
window.addEventListener('keydown', (e) => {
  if (LEFT_KEYS.has(e.code)) { keyLeftHeld = true; e.preventDefault(); }
  if (RIGHT_KEYS.has(e.code)) { keyRightHeld = true; e.preventDefault(); }
  if (DIVE_KEYS.has(e.code)) { keyDiveHeld = true; e.preventDefault(); }
  if (e.code === 'Enter' && state === gameState.READY) startRun();
});
window.addEventListener('keyup', (e) => {
  if (LEFT_KEYS.has(e.code)) keyLeftHeld = false;
  if (RIGHT_KEYS.has(e.code)) keyRightHeld = false;
  if (DIVE_KEYS.has(e.code)) keyDiveHeld = false;
});

// ---------------------------------------------------------------------------
// Tunnel generation
// ---------------------------------------------------------------------------

function disposeMesh(mesh) {
  scene.remove(mesh);
  mesh.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
}

// Connects two (progress, bounded-y) points with a slab that blocks the
// bounded (X) axis. `thickness` is the slab's size along X (the blocking
// dimension); `crossDepth` is its size along Z (purely cosmetic shaft
// depth). The slab's length runs along Y (progress/fall), tilted to bridge
// the two Y positions.
function buildWallSegment(p1, b1, p2, b2, thickness, crossDepth, material) {
  const dyWorld = -(p2 - p1); // world Y delta (falling = -progress)
  const dxWorld = b2 - b1;
  const len = Math.hypot(dyWorld, dxWorld);
  const geo = new THREE.BoxGeometry(thickness, Math.max(len, 0.001), crossDepth);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((b1 + b2) / 2, -(p1 + p2) / 2, 0);
  mesh.rotation.z = Math.atan2(-dxWorld, dyWorld); // tilt to bridge the two positions
  scene.add(mesh);
  return mesh;
}

// Front/back rails are visual only (gameplay bounds are purely lateral) —
// they run at a fixed width band so the shaft still reads as enclosed even
// while the walls wobble through a squeeze or zig-zag.
const SIDE_RAIL_SPAN = 8;

function addKeypoint(x, centerY, halfHeight, theme) {
  const kp = { x, centerY, halfHeight, theme };
  const prev = keypoints[keypoints.length - 1];
  keypoints.push(kp);
  if (prev) {
    const mat = theme === 'alt' ? wallMatAlt : wallMat;
    const rightWall = buildWallSegment(prev.x, prev.centerY + prev.halfHeight, x, centerY + halfHeight, WALL_THICK, TUNNEL_HALF_WIDTH * 2, mat);
    const leftWall = buildWallSegment(prev.x, prev.centerY - prev.halfHeight, x, centerY - halfHeight, WALL_THICK, TUNNEL_HALF_WIDTH * 2, mat);
    const back = buildWallSegment(prev.x, 0, x, 0, SIDE_RAIL_SPAN, WALL_THICK, skylineMat);
    back.position.z = -TUNNEL_HALF_WIDTH;
    const front = buildWallSegment(prev.x, 0, x, 0, SIDE_RAIL_SPAN, WALL_THICK, skylineMat);
    front.position.z = TUNNEL_HALF_WIDTH;
    wallMeshes.push({ mesh: rightWall, x2: x }, { mesh: leftWall, x2: x }, { mesh: back, x2: x }, { mesh: front, x2: x });

    // Occasional rooftop block jutting out from one wall — purely decorative
    // (collision only ever checks the smooth interpolated boundary), but it
    // breaks up the flat facade into a jagged skyline silhouette.
    if (Math.random() < 0.4) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const boundaryY = centerY + side * halfHeight;
      const blockDepth = 1.0 + Math.random() * 2.6;
      const blockLen = KEYPOINT_SPACING * (0.7 + Math.random() * 0.5);
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(blockDepth, blockLen, TUNNEL_HALF_WIDTH * 1.3),
        Math.random() < 0.5 ? wallMat : wallMatAlt,
      );
      block.position.set(boundaryY + side * blockDepth / 2, -x, 0);
      scene.add(block);
      wallMeshes.push({ mesh: block, x2: x });
    }
  }
  return kp;
}

// A static field of distant, muted buildings that tracks the player's fall
// so it always surrounds the shaft — an infinite-looking city vista without
// regenerating geometry. Built once at startup.
function buildSkyline() {
  const group = new THREE.Group();
  const clusterZ = [-1, 1];
  for (const zSide of clusterZ) {
    for (let i = 0; i < 26; i++) {
      const w = 2 + Math.random() * 3.5;
      const h = 6 + Math.random() * 26;
      const x = rand(-30, 30);
      const z = zSide * (TUNNEL_HALF_WIDTH * 1.8 + Math.random() * 40);
      const y = rand(-60, 60);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skylineMat);
      mesh.position.set(x, y, z);
      group.add(mesh);
    }
  }
  scene.add(group);
  return group;
}
const skylineGroup = buildSkyline();

function spawnHazard(h) {
  let mesh;
  if (h.type === 'rotating') {
    // Long axis starts along X (the bounded/blocking axis) so rotating about
    // Y sweeps it between "blocking" (aligned with X) and "safe" (aligned
    // with Z, out of the way) as seen by the top-down camera.
    const geo = new THREE.BoxGeometry(h.height, 0.22, 0.3);
    mesh = new THREE.Mesh(geo, bladeMat);
  } else if (h.type === 'gate') {
    // Visual: two stub plates leaving a gap at holeY — rendered as a single
    // ring-like torus for the "pulsing ring" look, hole facing down the shaft.
    const geo = new THREE.TorusGeometry(h.holeRadius + 0.18, 0.14, 10, 24);
    mesh = new THREE.Mesh(geo, gateMat);
    mesh.rotation.x = Math.PI / 2;
  } else if (h.type === 'car') {
    // A small flying car sweeping laterally across the shaft: a wedge body
    // plus a headlight and a taillight so its direction of travel reads.
    mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(h.height, 0.22, h.width), carBodyMat);
    mesh.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(h.height * 0.5, 0.16, h.width * 0.55), carBodyMat);
    cabin.position.y = 0.16;
    mesh.add(cabin);
    const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), carHeadlightMat);
    headlight.position.set(h.moveSpeed >= 0 ? h.height / 2 - 0.05 : -h.height / 2 + 0.05, 0, 0);
    mesh.add(headlight);
    const taillight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), carTaillightMat);
    taillight.position.set(h.moveSpeed >= 0 ? -h.height / 2 + 0.05 : h.height / 2 - 0.05, 0, 0);
    mesh.add(taillight);
  } else {
    const geo = new THREE.BoxGeometry(h.height, h.width, TUNNEL_HALF_WIDTH * 1.6);
    mesh = new THREE.Mesh(geo, hazardMat);
  }
  scene.add(mesh);
  h.mesh = mesh;
  h.phase = Math.random() * Math.PI * 2;
  hazards.push(h);
}

function spawnPowerUp(x, y, type) {
  const geo = new THREE.IcosahedronGeometry(0.32, 0);
  const mesh = new THREE.Mesh(geo, powerupMaterial(type));
  scene.add(mesh);
  powerUps.push({ x, y, type, collected: false, mesh });
}

// --- Segment generators ------------------------------------------------
// Each takes the previous keypoint (for continuity) and the current
// generation frontier, appends keypoints/hazards/powerups, and returns the
// new frontier.

function genWideOpen(prev, x0) {
  const span = 10 + Math.random() * 6;
  const halfHeight = MAX_HALF_HEIGHT * (0.75 + Math.random() * 0.25);
  const centerY = clampCenter(prev.centerY + rand(-1, 1), halfHeight);
  addKeypoint(x0, centerY, halfHeight);
  addKeypoint(x0 + span, centerY, halfHeight);
  return x0 + span;
}

function genPerfectLane(prev, x0) {
  const span = 8 + Math.random() * 4;
  addKeypoint(x0, prev.centerY, Math.max(prev.halfHeight, 2.2));
  addKeypoint(x0 + span, prev.centerY, Math.max(prev.halfHeight, 2.2));
  return x0 + span;
}

function genTightSqueeze(prev, x0) {
  const steps = 3 + Math.floor(Math.random() * 3);
  let x = x0;
  let centerY = prev.centerY;
  for (let i = 0; i < steps; i++) {
    x += KEYPOINT_SPACING * 1.2;
    centerY = clampCenter(centerY + rand(-1.6, 1.6), MIN_HALF_HEIGHT);
    const hh = lerp(MIN_HALF_HEIGHT, MIN_HALF_HEIGHT + 0.4, Math.random());
    addKeypoint(x, centerY, hh, 'alt');
  }
  return x;
}

function genZigZag(prev, x0) {
  const steps = 5 + Math.floor(Math.random() * 3);
  let x = x0;
  let dir = Math.random() < 0.5 ? -1 : 1;
  let centerY = prev.centerY;
  const hh = 1.6;
  for (let i = 0; i < steps; i++) {
    x += KEYPOINT_SPACING * 0.85;
    centerY = clampCenter(centerY + dir * rand(1.6, 2.4), hh);
    dir *= -1;
    addKeypoint(x, centerY, hh, 'alt');
  }
  return x;
}

function genRotatingBlades(prev, x0) {
  const count = 2 + Math.floor(Math.random() * 3);
  const hh = 2.6;
  let x = x0;
  addKeypoint(x, prev.centerY, hh);
  const centerY = clampCenter(prev.centerY, hh);
  for (let i = 0; i < count; i++) {
    x += 5 + Math.random() * 2.5;
    spawnHazard({
      x, y: centerY, width: 0.3, height: hh * 2 - 0.3, type: 'rotating',
      rotationSpeed: 2.4 + Math.random() * 2.2, moveAmplitude: 0, moveSpeed: 0,
    });
  }
  addKeypoint(x + 4, centerY, hh);
  return x + 4;
}

function genMovingWalls(prev, x0) {
  const steps = 6 + Math.floor(Math.random() * 3);
  let x = x0;
  const hh = 1.5;
  let centerY = prev.centerY;
  const amp = 2.0 + Math.random() * 1.2;
  const freq = 0.5 + Math.random() * 0.4;
  for (let i = 0; i < steps; i++) {
    x += KEYPOINT_SPACING * 0.9;
    centerY = clampCenter(Math.sin((x - x0) * freq) * amp, hh);
    addKeypoint(x, centerY, hh, 'alt');
  }
  return x;
}

function genPulsingRings(prev, x0) {
  const count = 2 + Math.floor(Math.random() * 2);
  const hh = 3.0;
  let x = x0;
  addKeypoint(x, prev.centerY, hh);
  for (let i = 0; i < count; i++) {
    x += 6 + Math.random() * 2;
    const holeY = clampCenter(prev.centerY + rand(-1.6, 1.6), hh);
    spawnHazard({ x, y: 0, width: 0.5, height: 0, type: 'gate', holeY, holeRadius: 1.05 });
  }
  addKeypoint(x + 4, prev.centerY, hh);
  return x + 4;
}

function genFlyingCars(prev, x0) {
  const count = 2 + Math.floor(Math.random() * 3);
  const hh = 2.8;
  let x = x0;
  addKeypoint(x, prev.centerY, hh);
  const centerY = clampCenter(prev.centerY, hh);
  for (let i = 0; i < count; i++) {
    x += 4.5 + Math.random() * 2.5;
    const amplitude = hh * (0.5 + Math.random() * 0.4);
    const speed = (Math.random() < 0.5 ? -1 : 1) * (1.3 + Math.random() * 0.9);
    spawnHazard({
      x, y: centerY, width: 0.4, height: 0.9, type: 'car',
      moveAmplitude: amplitude, moveSpeed: speed,
    });
  }
  addKeypoint(x + 4, centerY, hh);
  return x + 4;
}

function genPowerUpCorridor(prev, x0) {
  const span = 9 + Math.random() * 3;
  const hh = Math.max(prev.halfHeight, 2.4);
  addKeypoint(x0, prev.centerY, hh);
  addKeypoint(x0 + span, prev.centerY, hh);
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  spawnPowerUp(x0 + span / 2, prev.centerY, type);
  return x0 + span;
}

function clampCenter(y, halfHeight) {
  const limit = MAX_HALF_HEIGHT - halfHeight + 0.5;
  return THREE.MathUtils.clamp(y, -limit, limit);
}
function rand(a, b) { return a + Math.random() * (b - a); }
function lerp(a, b, t) { return a + (b - a) * t; }

// Weighted picker per difficulty band (see GDD "Hazard Density").
function pickGenerator(t) {
  const table = [];
  const push = (fn, w) => table.push({ fn, w });

  push(genPerfectLane, 1.2);
  push(genPowerUpCorridor, 0.9);

  if (t < 10) {
    push(genWideOpen, 4);
    push(genFlyingCars, 1);
  } else if (t < 20) {
    push(genWideOpen, 1.5);
    push(genTightSqueeze, 3);
    push(genFlyingCars, 1.5);
  } else if (t < 30) {
    push(genWideOpen, 1);
    push(genTightSqueeze, 1.5);
    push(genMovingWalls, 3);
    push(genZigZag, 1.5);
    push(genFlyingCars, 2);
  } else if (t < 45) {
    push(genTightSqueeze, 1.5);
    push(genMovingWalls, 1.5);
    push(genZigZag, 1.5);
    push(genRotatingBlades, 3);
    push(genFlyingCars, 2);
  } else {
    push(genMovingWalls, 1.2);
    push(genRotatingBlades, 2.5);
    push(genZigZag, 1.5);
    push(genPulsingRings, 2.5);
    push(genFlyingCars, 2.5);
  }

  const total = table.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of table) { r -= e.w; if (r <= 0) return e.fn; }
  return table[0].fn;
}

function spawnSegmentsIfNeeded() {
  while (generationFrontier < player.distance + LOOKAHEAD) {
    const prev = keypoints[keypoints.length - 1] || { x: 0, centerY: 0, halfHeight: MAX_HALF_HEIGHT };
    const gen = pickGenerator(elapsedTime);
    generationFrontier = gen(prev, generationFrontier);
  }
}

function despawnBehind() {
  const cutoff = player.distance - DESPAWN_BEHIND;

  while (keypoints.length > 2 && keypoints[1].x < cutoff) keypoints.shift();

  wallMeshes = wallMeshes.filter((w) => {
    if (w.x2 < cutoff) { disposeMesh(w.mesh); return false; }
    return true;
  });

  hazards = hazards.filter((h) => {
    if (h.x < cutoff) { disposeMesh(h.mesh); return false; }
    return true;
  });

  powerUps = powerUps.filter((p) => {
    if (p.x < cutoff) { disposeMesh(p.mesh); return false; }
    return true;
  });
}

// Interpolated tunnel bounds at a given forward distance.
function boundsAt(x) {
  for (let i = 1; i < keypoints.length; i++) {
    const a = keypoints[i - 1], b = keypoints[i];
    if (x <= b.x || i === keypoints.length - 1) {
      const t = b.x > a.x ? THREE.MathUtils.clamp((x - a.x) / (b.x - a.x), 0, 1) : 0;
      const centerY = lerp(a.centerY, b.centerY, t);
      const halfHeight = lerp(a.halfHeight, b.halfHeight, t);
      return { top: centerY + halfHeight, bottom: centerY - halfHeight };
    }
  }
  return { top: MAX_HALF_HEIGHT, bottom: -MAX_HALF_HEIGHT };
}

// ---------------------------------------------------------------------------
// Reset / start
// ---------------------------------------------------------------------------
function resetWorld() {
  keypoints = [];
  wallMeshes.forEach((w) => disposeMesh(w.mesh));
  wallMeshes = [];
  hazards.forEach((h) => disposeMesh(h.mesh));
  hazards = [];
  powerUps.forEach((p) => disposeMesh(p.mesh));
  powerUps = [];
  generationFrontier = 0;

  // A generously wide tutorial stretch — new players need real runway to
  // learn the hold/release rhythm before the normal channel width (and its
  // MAX_HALF_HEIGHT ceiling) tapers in.
  addKeypoint(-4, 0, MAX_HALF_HEIGHT * 1.9);
  addKeypoint(13, 0, MAX_HALF_HEIGHT * 1.4);
  generationFrontier = 13;

  player.distance = 0;
  player.y = 0;
  player.velocityY = 0;
  player.isAlive = true;
  player.radius = PLAYER_RADIUS_BASE;
  player.activePowerUps = [];

  elapsedTime = 0;
  currentSpeed = BASE_SPEED;
  nextPowerUpAt = 6;
  shakeTime = 0;
  startGrace = START_GRACE;
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
}

function startRun() {
  resetWorld();
  state = gameState.RUNNING;
  hud.classList.remove('hidden');
  controls.classList.remove('hidden');
  startScreen.classList.add('hidden');
  gameoverScreen.classList.add('hidden');
  updateScoreDisplay(true);
  clock.getDelta(); // discard the idle gap
}

function die() {
  if (state !== gameState.RUNNING) return;
  player.isAlive = false;
  state = gameState.GAME_OVER;

  const dist = Math.floor(player.distance);
  const isNewBest = dist > best;
  if (isNewBest) {
    best = dist;
    saveBest(best);
  }

  finalScoreEl.textContent = dist;
  bestScoreEl.textContent = Math.floor(best);
  newBestBadge.classList.toggle('hidden', !isNewBest);
  bestInlineEl.textContent = Math.floor(best);

  hud.classList.add('hidden');
  controls.classList.add('hidden');
  gameoverScreen.classList.remove('hidden');

  triggerShake(0.5, 0.35);
}

// ---------------------------------------------------------------------------
// Update — mirrors the GDD pseudocode structure
// ---------------------------------------------------------------------------
function handleInput(dt) {
  diving = pointerDive || keyDiveHeld;

  const keyDir = (keyRightHeld ? 1 : 0) - (keyLeftHeld ? 1 : 0);
  const dir = THREE.MathUtils.clamp(pointerDir + keyDir, -1, 1);
  const targetVel = dir * PLAYER_VELOCITY_Y * (diving ? DIVE_STEER_FACTOR : 1);
  // Ease toward the target rather than snapping, so letting go settles back
  // to falling straight instead of instantly zeroing out.
  player.velocityY += (targetVel - player.velocityY) * Math.min(1, dt * DRIFT_ACCEL);

  diveBlend += ((diving ? 1 : 0) - diveBlend) * Math.min(1, dt * 6);
}

function isInvincible() {
  return player.activePowerUps.some((p) => p.type === 'boost' || p.type === 'reverse');
}

function updatePlayer(dt, t) {
  player.y += player.velocityY * dt;
  // Soft clamp to a generous absolute range so a boosted phase-through never
  // sends the player wildly off-screen.
  player.y = THREE.MathUtils.clamp(player.y, -MAX_HALF_HEIGHT - 1, MAX_HALF_HEIGHT + 1);

  const reversing = player.activePowerUps.some((p) => p.type === 'reverse');
  const boosting = player.activePowerUps.some((p) => p.type === 'boost');
  let speed = currentSpeed;
  if (boosting) speed *= 1.5;
  if (diving) speed *= DIVE_SPEED_MULT;
  if (reversing) speed = -currentSpeed * 3.2; // brief chaotic backward zoom (upward zoom, here)

  player.distance = Math.max(0, player.distance + speed * dt);

  playerMesh.position.set(player.y, -player.distance, 0);
  playerMesh.scale.setScalar(player.radius / PLAYER_RADIUS_BASE);
  updatePlayerPose(t, diveBlend);
  playerLight.position.set(player.y, -player.distance + 1.5, 0);
  playerLight.color.setHex(boosting ? 0xffd23f : reversing ? 0xff2fd0 : diving ? 0xff5a3c : 0x66e0ff);

  // Trail
  trailAccum += dt;
  const trailColor = boosting ? 0xffd23f : reversing ? 0xff2fd0 : diving ? 0xff5a3c : (player.radius < PLAYER_RADIUS_BASE ? 0x33f9ff : 0x66e0ff);
  if (trailAccum > (diving ? 0.012 : 0.02)) {
    trailAccum = 0;
    emitTrail(player.y, -player.distance + 0.2, 0, trailColor);
  }
}

function updatePowerUps(dt) {
  for (const ap of player.activePowerUps) ap.remainingTime -= dt;
  const expired = player.activePowerUps.filter((p) => p.remainingTime <= 0);
  player.activePowerUps = player.activePowerUps.filter((p) => p.remainingTime > 0);

  player.radius = player.activePowerUps.some((p) => p.type === 'shrink')
    ? PLAYER_RADIUS_BASE * 0.6
    : PLAYER_RADIUS_BASE;

  const activeBannerType = player.activePowerUps[0]?.type;
  if (activeBannerType) {
    powerupBanner.textContent = bannerText(activeBannerType);
    powerupBanner.className = `show ${activeBannerType}`;
  } else if (expired.length) {
    powerupBanner.classList.remove('show');
  }

  camera.fov = THREE.MathUtils.lerp(camera.fov, player.activePowerUps.some((p) => p.type === 'boost') ? BOOST_FOV : BASE_FOV, 1 - Math.pow(0.001, dt));
  camera.updateProjectionMatrix();

  // Auto-spawn timed power-ups aren't part of the corridor generator alone —
  // this timer guarantees the "every 8-12s" cadence from the GDD even
  // through long non-corridor stretches.
  if (elapsedTime > nextPowerUpAt) {
    const b = boundsAt(player.distance + 18);
    const y = clampCenter((b.top + b.bottom) / 2, 0.6);
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    spawnPowerUp(player.distance + 18, y, type);
    const interval = elapsedTime > 30 ? rand(5, 8) : rand(8, 12);
    nextPowerUpAt = elapsedTime + interval;
  }
}

function bannerText(type) {
  if (type === 'boost') return '\u26A1 BOOST';
  if (type === 'shrink') return '\u25CF SHRINK';
  if (type === 'reverse') return '\u25C6 REVERSE CHAOS';
  return '';
}

function collectPowerUp(p) {
  p.collected = true;
  disposeMesh(p.mesh);
  player.activePowerUps.push({ type: p.type, remainingTime: POWERUP_DURATIONS[p.type] });
  triggerShake(0.15, 0.12);
}

// A car sweeps back and forth across its patrol band: `h.y` is the band
// center, `h.moveAmplitude` its half-width, `h.moveSpeed` how fast.
function hazardCurrentY(h, t) {
  return h.type === 'car' ? h.y + Math.sin(t * h.moveSpeed + h.phase) * h.moveAmplitude : h.y;
}

function updateTunnel(dt, t) {
  for (const h of hazards) {
    if (h.type === 'rotating') {
      h.rotation = (h.rotation || h.phase) + h.rotationSpeed * dt;
      h.mesh.position.set(h.y, -h.x, 0);
      h.mesh.rotation.y = h.rotation;
    } else if (h.type === 'gate') {
      h.mesh.position.set(h.holeY, -h.x, 0);
      const pulse = 1 + Math.sin(t * 3 + h.phase) * 0.06;
      h.mesh.scale.setScalar(pulse);
    } else if (h.type === 'car') {
      const y = hazardCurrentY(h, t);
      h.mesh.position.set(y, -h.x, 0);
      h.mesh.rotation.z = Math.cos(t * h.moveSpeed + h.phase) * h.moveSpeed * h.moveAmplitude * 0.05;
    } else {
      h.mesh.position.set(h.y, -h.x, 0);
    }
  }
  for (const p of powerUps) {
    if (p.collected) continue;
    p.mesh.position.set(p.y + Math.sin(t * 2.5 + p.x) * 0.15, -p.x, 0);
    p.mesh.rotation.y += dt * 2.2;
    p.mesh.rotation.x += dt * 1.1;
  }
}

function checkCollisions(t) {
  if (startGrace > 0) return;
  const invincible = isInvincible();

  // Tunnel walls
  const b = boundsAt(player.distance);
  if (!invincible && (player.y + player.radius > b.top || player.y - player.radius < b.bottom)) {
    die();
    return;
  }

  // Hazards
  for (const h of hazards) {
    if (h.type === 'rotating') {
      const dx = Math.abs(h.x - player.distance);
      if (dx > h.width / 2 + player.radius + 1.5) continue;
      const rot = h.rotation || h.phase;
      const verticalExtent = (h.height / 2) * Math.abs(Math.cos(rot));
      const near = dx < h.width / 2 + player.radius + 0.5;
      if (near && Math.abs(player.y - h.y) < verticalExtent + player.radius) {
        if (!invincible) { die(); return; }
      } else if (dx < 2.2 && Math.abs(player.y - h.y) < verticalExtent + player.radius + 0.6) {
        triggerShake(0.12, 0.06); // near miss
      }
    } else if (h.type === 'gate') {
      const dx = Math.abs(h.x - player.distance);
      if (dx > h.width / 2 + player.radius) continue;
      if (Math.abs(player.y - h.holeY) > h.holeRadius - player.radius) {
        if (!invincible) { die(); return; }
      }
    } else {
      const dx = Math.abs(h.x - player.distance);
      const dy = Math.abs(player.y - hazardCurrentY(h, t));
      if (dx < h.width / 2 + player.radius && dy < h.height / 2 + player.radius) {
        if (!invincible) { die(); return; }
      } else if (dx < h.width / 2 + player.radius + 0.7 && dy < h.height / 2 + player.radius + 0.7) {
        triggerShake(0.1, 0.05);
      }
    }
  }

  // Power-ups
  for (const p of powerUps) {
    if (p.collected) continue;
    const dx = Math.abs(p.x - player.distance);
    const dy = Math.abs(p.y - player.y);
    if (dx < 0.7 + player.radius && dy < 0.7 + player.radius) collectPowerUp(p);
  }
}

function triggerShake(strength, duration) {
  shakeStrength = Math.max(shakeStrength, strength);
  shakeTime = Math.max(shakeTime, duration);
}

function updateScore(dt) {
  elapsedTime += dt;
  currentSpeed = Math.min(MAX_SPEED, BASE_SPEED + elapsedTime * DIFFICULTY_FACTOR);
  updateScoreDisplay(false);
}

let lastShownScore = -1;
function updateScoreDisplay(force) {
  const d = Math.floor(player.distance);
  if (force || d !== lastShownScore) {
    lastShownScore = d;
    scoreEl.textContent = d;
    scoreEl.classList.add('bump');
    setTimeout(() => scoreEl.classList.remove('bump'), 90);
  }
}

// Chase cam sits above the falling player (trailing behind on the fall
// axis) and a little back in Z for a 3/4 view down the shaft, rather than a
// flat top-down look.
function updateCamera(dt, t) {
  const boosting = player.activePowerUps.some((p) => p.type === 'boost');
  const above = boosting ? 6.2 : 5.5;
  const back = boosting ? 2.3 : 1.9;
  const targetX = player.y;
  const targetY = -player.distance + above;
  const targetZ = back;

  camera.position.x += (targetX - camera.position.x) * Math.min(1, dt * 8);
  camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 8);
  camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 8);

  if (shakeTime > 0) {
    shakeTime -= dt;
    const s = shakeStrength * Math.max(0, shakeTime);
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }

  camera.lookAt(player.y, -player.distance - 6, 0);

  // Keep the distant skyline centered on the player's fall depth so it
  // reads as an endless city rather than a fixed patch of buildings.
  skylineGroup.position.y = -player.distance;
}

function updateTrailParticles(dt) {
  for (const slot of trailPool) {
    if (!slot.sprite.visible) continue;
    slot.life -= dt;
    if (slot.life <= 0) { slot.sprite.visible = false; continue; }
    const t = slot.life / slot.maxLife;
    slot.sprite.material.opacity = t * 0.85;
    slot.sprite.scale.setScalar(0.5 * (0.4 + (1 - t) * 0.8));
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function update(dt, t) {
  if (state === gameState.RUNNING) {
    if (startGrace > 0) startGrace -= dt;
    handleInput(dt);
    updatePlayer(dt, t);
    updatePowerUps(dt);
    updateTunnel(dt, t);
    checkCollisions(t);
    updateScore(dt);
    spawnSegmentsIfNeeded();
    despawnBehind();
  }
  updateCamera(dt, t);
  updateTrailParticles(dt);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // guard against tab-switch spikes
  const t = clock.elapsedTime;
  update(dt, t);
  composer.render();
}

// Idle "attract mode" tunnel so the start screen isn't a blank void.
resetWorld();
camera.position.set(0, 5.5, 1.9);
camera.lookAt(0, -6, 0);

animate();
