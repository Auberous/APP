// ============================================================================
// SLIDE RUNNER — neon 3D tunnel dodge game
//
// Coordinate convention:
//   distanceX  — forward progress (spec's "x"), always increasing.
//   world Z    — equals -distanceX. Three.js "forward" is -Z, so bigger
//                distanceX == further into the tunnel == more negative Z.
//   y          — vertical position, used directly as world Y.
//   x (lateral)— fixed at 0 for player/tunnel; only used for wall visual width.
//
// The player and camera move forward through a world that is generated once
// and never re-positioned — this keeps per-frame work cheap. Old geometry
// well behind the player is despawned and disposed.
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Constants / tuning
// ---------------------------------------------------------------------------
const TUNNEL_HALF_WIDTH = 3.2;      // visual lateral width of the tube
const WALL_THICK = 0.22;
const KEYPOINT_SPACING = 3;         // forward distance between tunnel keypoints
const LOOKAHEAD = 90;               // keep the world generated this far ahead of the player
const DESPAWN_BEHIND = 14;          // drop geometry this far behind the player

const BASE_SPEED = 9;
const DIFFICULTY_FACTOR = 0.10;     // currentSpeed = base + elapsed * factor
const MAX_SPEED = 26;

const PLAYER_RADIUS_BASE = 0.42;
const PLAYER_VELOCITY_Y = 7.2;      // how fast the player rises/falls while input is held/released

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
scene.background = new THREE.Color(0x05010f);
scene.fog = new THREE.FogExp2(0x05010f, 0.028);

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
scene.add(new THREE.AmbientLight(0x8060ff, 0.22));
const playerLight = new THREE.PointLight(0x66e0ff, 2.2, 12, 2);
scene.add(playerLight);

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
const wallMat = new THREE.MeshStandardMaterial({
  color: 0x1a1030, emissive: 0x7a2fff, emissiveIntensity: 0.55,
  roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide,
});
const wallMatAlt = new THREE.MeshStandardMaterial({
  color: 0x0a1830, emissive: 0x33d0ff, emissiveIntensity: 0.55,
  roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide,
});
const sideMat = new THREE.MeshStandardMaterial({
  color: 0x0c0c16, emissive: 0x4a2fbf, emissiveIntensity: 0.22,
  roughness: 0.25, metalness: 0.85, side: THREE.DoubleSide,
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

function powerupMaterial(type) {
  return new THREE.MeshStandardMaterial({
    color: 0x101018, emissive: POWERUP_COLORS[type], emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.4,
  });
}

// Player sphere
const playerGeo = new THREE.SphereGeometry(PLAYER_RADIUS_BASE, 24, 18);
const playerMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0x33f9ff, emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.3,
});
const playerMesh = new THREE.Mesh(playerGeo, playerMat);
scene.add(playerMesh);

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

// Input
let inputHeld = false;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const hud = document.getElementById('hud');
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

// Hold-to-rise input: pointer + keyboard, matches the GDD's one-finger control.
function setHeld(v) { inputHeld = v; }
canvas.addEventListener('pointerdown', (e) => { setHeld(true); e.preventDefault(); });
window.addEventListener('pointerup', () => setHeld(false));
window.addEventListener('pointercancel', () => setHeld(false));
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) { setHeld(true); e.preventDefault(); }
  if (e.code === 'Enter' && state === gameState.READY) startRun();
});
window.addEventListener('keyup', (e) => {
  if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) setHeld(false);
});
// Down key explicitly forces descent (per spec Down/S = down) rather than
// just "not held" — makes keyboard play feel intentional.
let forceDown = false;
window.addEventListener('keydown', (e) => { if (['ArrowDown', 'KeyS'].includes(e.code)) forceDown = true; });
window.addEventListener('keyup', (e) => { if (['ArrowDown', 'KeyS'].includes(e.code)) forceDown = false; });

// ---------------------------------------------------------------------------
// Tunnel generation
// ---------------------------------------------------------------------------

function disposeMesh(mesh) {
  scene.remove(mesh);
  if (mesh.geometry) mesh.geometry.dispose();
}

// Connects two keypoints with a thin slab mesh (top or bottom wall).
// Connects two (forward-distance, y) points with a slab. `width`/`height`
// are the slab's cross-section (lateral x vertical); the slab's length runs
// along the connecting line, tilted to bridge the two heights.
function buildWallSegment(x1, y1, x2, y2, width, height, material) {
  const dz = -(x2 - x1); // world Z delta (forward = -x)
  const dy = y2 - y1;
  const len = Math.hypot(dz, dy);
  const geo = new THREE.BoxGeometry(width, height, Math.max(len, 0.001));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, (y1 + y2) / 2, -(x1 + x2) / 2);
  mesh.rotation.x = Math.atan2(dy, -dz); // tilt to connect the two heights
  scene.add(mesh);
  return mesh;
}

// Side rails are visual only (gameplay bounds are purely vertical) — they
// run at a fixed height band so the tube still reads as enclosed even while
// the floor/ceiling wobble through a squeeze or zig-zag.
const SIDE_RAIL_SPAN = 8;

function addKeypoint(x, centerY, halfHeight, theme) {
  const kp = { x, centerY, halfHeight, theme };
  const prev = keypoints[keypoints.length - 1];
  keypoints.push(kp);
  if (prev) {
    const mat = theme === 'alt' ? wallMatAlt : wallMat;
    const top = buildWallSegment(prev.x, prev.centerY + prev.halfHeight, x, centerY + halfHeight, TUNNEL_HALF_WIDTH * 2, WALL_THICK, mat);
    const bottom = buildWallSegment(prev.x, prev.centerY - prev.halfHeight, x, centerY - halfHeight, TUNNEL_HALF_WIDTH * 2, WALL_THICK, mat);
    const left = buildWallSegment(prev.x, 0, x, 0, WALL_THICK, SIDE_RAIL_SPAN, sideMat);
    left.position.x = -TUNNEL_HALF_WIDTH;
    const right = buildWallSegment(prev.x, 0, x, 0, WALL_THICK, SIDE_RAIL_SPAN, sideMat);
    right.position.x = TUNNEL_HALF_WIDTH;
    wallMeshes.push({ mesh: top, x2: x }, { mesh: bottom, x2: x }, { mesh: left, x2: x }, { mesh: right, x2: x });
  }
  return kp;
}

function spawnHazard(h) {
  let mesh;
  if (h.type === 'rotating') {
    const geo = new THREE.BoxGeometry(0.22, h.height, 0.3);
    mesh = new THREE.Mesh(geo, bladeMat);
  } else if (h.type === 'gate') {
    // Visual: two stub plates leaving a gap at holeY — rendered as a single
    // ring-like torus for the "pulsing ring" look.
    const geo = new THREE.TorusGeometry(h.holeRadius + 0.18, 0.14, 10, 24);
    mesh = new THREE.Mesh(geo, gateMat);
    mesh.rotation.y = Math.PI / 2;
  } else {
    const geo = new THREE.BoxGeometry(TUNNEL_HALF_WIDTH * 1.6, h.height, h.width);
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
  } else if (t < 20) {
    push(genWideOpen, 1.5);
    push(genTightSqueeze, 3);
  } else if (t < 30) {
    push(genWideOpen, 1);
    push(genTightSqueeze, 1.5);
    push(genMovingWalls, 3);
    push(genZigZag, 1.5);
  } else if (t < 45) {
    push(genTightSqueeze, 1.5);
    push(genMovingWalls, 1.5);
    push(genZigZag, 1.5);
    push(genRotatingBlades, 3);
  } else {
    push(genMovingWalls, 1.2);
    push(genRotatingBlades, 2.5);
    push(genZigZag, 1.5);
    push(genPulsingRings, 2.5);
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
  gameoverScreen.classList.remove('hidden');

  triggerShake(0.5, 0.35);
}

// ---------------------------------------------------------------------------
// Update — mirrors the GDD pseudocode structure
// ---------------------------------------------------------------------------
function handleInput(dt) {
  const rising = inputHeld && !forceDown;
  player.velocityY = rising ? PLAYER_VELOCITY_Y : -PLAYER_VELOCITY_Y;
}

function isInvincible() {
  return player.activePowerUps.some((p) => p.type === 'boost' || p.type === 'reverse');
}

function updatePlayer(dt) {
  player.y += player.velocityY * dt;
  // Soft clamp to a generous absolute range so a boosted phase-through never
  // sends the player wildly off-screen.
  player.y = THREE.MathUtils.clamp(player.y, -MAX_HALF_HEIGHT - 1, MAX_HALF_HEIGHT + 1);

  const reversing = player.activePowerUps.some((p) => p.type === 'reverse');
  const boosting = player.activePowerUps.some((p) => p.type === 'boost');
  let speed = currentSpeed;
  if (boosting) speed *= 1.5;
  if (reversing) speed = -currentSpeed * 3.2; // brief chaotic backward zoom

  player.distance = Math.max(0, player.distance + speed * dt);

  playerMesh.position.set(0, player.y, -player.distance);
  playerMesh.scale.setScalar(player.radius / PLAYER_RADIUS_BASE);
  playerLight.position.set(0, player.y, -player.distance + 1.5);
  playerLight.color.setHex(boosting ? 0xffd23f : reversing ? 0xff2fd0 : 0x66e0ff);

  // Trail
  trailAccum += dt;
  const trailColor = boosting ? 0xffd23f : reversing ? 0xff2fd0 : (player.radius < PLAYER_RADIUS_BASE ? 0x33f9ff : 0x66e0ff);
  if (trailAccum > 0.02) {
    trailAccum = 0;
    emitTrail(0, player.y, -player.distance + 0.2, trailColor);
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

function updateTunnel(dt, t) {
  for (const h of hazards) {
    if (h.type === 'rotating') {
      h.rotation = (h.rotation || h.phase) + h.rotationSpeed * dt;
      h.mesh.position.set(0, h.y, -h.x);
      h.mesh.rotation.z = h.rotation;
    } else if (h.type === 'gate') {
      h.mesh.position.set(0, h.holeY, -h.x);
      const pulse = 1 + Math.sin(t * 3 + h.phase) * 0.06;
      h.mesh.scale.setScalar(pulse);
    } else {
      h.mesh.position.set(0, h.y, -h.x);
    }
  }
  for (const p of powerUps) {
    if (p.collected) continue;
    p.mesh.position.set(0, p.y + Math.sin(t * 2.5 + p.x) * 0.15, -p.x);
    p.mesh.rotation.y += dt * 2.2;
    p.mesh.rotation.x += dt * 1.1;
  }
}

function checkCollisions() {
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
      const dy = Math.abs(player.y - h.y);
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

function updateCamera(dt, t) {
  const boosting = player.activePowerUps.some((p) => p.type === 'boost');
  const back = boosting ? 5.6 : 5.0;
  const height = boosting ? 2.0 : 1.7;
  const targetX = 0;
  const targetY = player.y + height;
  const targetZ = -player.distance + back;

  camera.position.x += (targetX - camera.position.x) * Math.min(1, dt * 8);
  camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 8);
  camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 8);

  if (shakeTime > 0) {
    shakeTime -= dt;
    const s = shakeStrength * Math.max(0, shakeTime);
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }

  camera.lookAt(0, player.y + 0.4, -player.distance - 6);
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
    updatePlayer(dt);
    updatePowerUps(dt);
    updateTunnel(dt, t);
    checkCollisions();
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
camera.position.set(0, 1.7, 5);
camera.lookAt(0, 0.4, -6);

animate();
