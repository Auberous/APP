import { abilities } from './abilities.js';
import { SHOPS, getShopItems } from './shops.js';
import { loadQuestion } from './questionLoader.js';

// The server is authoritative for everything in here: position, health,
// energy, unlocked abilities, shop progress. Clients only send input and
// intent (move this way, cast this ability, buy this item, answer with
// this index) and render whatever snapshot() returns — see the note in
// game/gameEvents.js on the client for the render-only contract that
// keeps the Phaser scene from re-deriving any of this itself.
//
// NOTE: this file is presently duplicated from elemental-arena/src/game/
// (abilities.js, shops.js, questionLoader.js, elements.js) rather than
// shared via a workspace package — fine for now, but the two copies can
// drift. Worth consolidating into a shared package once this stabilizes.

const TILE_SIZE = 32;
// A much bigger arena: a central grass "warzone" band where everyone
// spawns (so players find each other quickly if they want to fight),
// with three biome regions further out — fire, ice, and shadow — each
// hosting one shop. Reaching a shop/biome is a deliberate choice, not
// something you stumble into. See game/biomes.js on the client for the
// matching visual zone layout (kept in sync with SHOPS below).
const GRID_WIDTH = 40;
const GRID_HEIGHT = 24;
const PLAYER_SPEED = 140; // px/sec
const ATTACK_RANGE = TILE_SIZE * 1.75;
const SHOP_RADIUS = TILE_SIZE * 1.8;
const ENERGY_REGEN_PER_SEC = 4;

export const PREP_DURATION_MS = 60000;

// All spawns sit in the central grass band so players start near each
// other; the biomes (and the choice to head into one, or not) are all
// optional extra distance away.
const SPAWN_POINTS = [
  { col: 14, row: 12 },
  { col: 26, row: 12 },
  { col: 14, row: 14 },
  { col: 26, row: 14 },
  { col: 20, row: 11 },
  { col: 20, row: 15 },
  { col: 17, row: 13 },
  { col: 23, row: 13 },
];

const PALETTE = [
  0x2f6fed, 0x9b4bd9, 0x3ddc6a, 0xd98a4b, 0x4bd9c9, 0xd94ba0, 0xd9c94b, 0xd94b4b,
];

const FACING_OFFSET = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export class Match {
  constructor() {
    this.players = new Map();
    this.blocks = new Set();
    this.phase = 'prep';
    this.prepEndsAt = Date.now() + PREP_DURATION_MS;
    this.winnerId = null;
  }

  addPlayer(id, name) {
    const index = this.players.size % SPAWN_POINTS.length;
    const spawn = SPAWN_POINTS[index];
    this.players.set(id, {
      id,
      name,
      color: PALETTE[index % PALETTE.length],
      x: spawn.col * TILE_SIZE + TILE_SIZE / 2,
      y: spawn.row * TILE_SIZE + TILE_SIZE / 2,
      facing: 'down',
      health: 100,
      maxHealth: 100,
      energy: 100,
      maxEnergy: 100,
      unlockedAbilities: [],
      input: { up: false, down: false, left: false, right: false },
      shopId: null,
      pendingPurchase: null, // { abilityName, progress, correctIndex }
      shield: { percent: 0, expiresAt: 0 },
    });
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p) return;
    p.input = {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
    };
  }

  tick(dtSeconds) {
    if (this.phase === 'prep' && Date.now() >= this.prepEndsAt) {
      this.phase = 'battle';
    }

    for (const p of this.players.values()) {
      this.movePlayer(p, dtSeconds);
      this.updateShopZone(p);
      p.energy = Math.min(p.maxEnergy, p.energy + ENERGY_REGEN_PER_SEC * dtSeconds);
    }

    if (this.phase === 'battle' && !this.winnerId) {
      this.checkWinCondition();
    }
  }

  movePlayer(p, dt) {
    let vx = 0;
    let vy = 0;
    if (p.input.left) vx -= 1;
    if (p.input.right) vx += 1;
    if (p.input.up) vy -= 1;
    if (p.input.down) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      p.x += (vx / len) * PLAYER_SPEED * dt;
      p.y += (vy / len) * PLAYER_SPEED * dt;
      if (Math.abs(vx) > Math.abs(vy)) {
        p.facing = vx > 0 ? 'right' : 'left';
      } else if (vy !== 0) {
        p.facing = vy > 0 ? 'down' : 'up';
      }
    }

    // World-bounds clamp only — no block collision for movement yet.
    // Placed blocks are strategic cover for build/attack, not yet solid
    // walls; that's a reasonable next increment, not a blocker for
    // getting real network play working.
    const half = TILE_SIZE * 0.35;
    p.x = Math.max(half, Math.min(GRID_WIDTH * TILE_SIZE - half, p.x));
    p.y = Math.max(half, Math.min(GRID_HEIGHT * TILE_SIZE - half, p.y));
  }

  updateShopZone(p) {
    const near = SHOPS.find((shop) => {
      const x = shop.tile.col * TILE_SIZE + TILE_SIZE / 2;
      const y = shop.tile.row * TILE_SIZE + TILE_SIZE / 2;
      return Math.hypot(p.x - x, p.y - y) <= SHOP_RADIUS;
    });
    p.shopId = near ? near.id : null;
  }

  findNearestOpponent(p) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const other of this.players.values()) {
      if (other.id === p.id) continue;
      const distance = Math.hypot(p.x - other.x, p.y - other.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = other;
      }
    }
    return nearest ? { player: nearest, distance: nearestDistance } : null;
  }

  castAbility(id, abilityName) {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (!p.unlockedAbilities.includes(abilityName)) {
      return { ok: false, error: 'Not unlocked' };
    }
    const ability = abilities.find((a) => a.name === abilityName);
    if (!ability) return { ok: false, error: 'Unknown ability' };
    if (p.energy < ability.cost) return { ok: false, error: 'Not enough energy' };

    p.energy -= ability.cost;

    if (ability.type === 'attack') {
      if (this.phase !== 'battle') {
        return { ok: true, effect: { type: 'blocked', casterId: id, message: "Battle hasn't started yet!" } };
      }
      const target = this.findNearestOpponent(p);
      if (!target || target.distance > ATTACK_RANGE) {
        return { ok: true, effect: { type: 'attack-miss', casterId: id } };
      }
      let damage = ability.damage;
      const shieldActive = target.player.shield.expiresAt > Date.now();
      if (shieldActive) {
        damage = Math.round(damage * (1 - target.player.shield.percent / 100));
      }
      target.player.health = Math.max(0, target.player.health - damage);
      return {
        ok: true,
        effect: { type: 'attack', casterId: id, targetId: target.player.id, damage },
      };
    }

    if (ability.type === 'defend') {
      p.shield = { percent: ability.shieldPercent, expiresAt: Date.now() + ability.duration };
      return { ok: true, effect: { type: 'defend', casterId: id, duration: ability.duration } };
    }

    if (ability.type === 'build') {
      const offset = FACING_OFFSET[p.facing];
      const col = Math.round(p.x / TILE_SIZE) + offset.x;
      const row = Math.round(p.y / TILE_SIZE) + offset.y;
      const key = `${col},${row}`;
      const inBounds = col >= 0 && col < GRID_WIDTH && row >= 0 && row < GRID_HEIGHT;
      if (!inBounds || this.blocks.has(key)) {
        return { ok: true, effect: { type: 'build-fail', casterId: id } };
      }
      this.blocks.add(key);
      return { ok: true, effect: { type: 'build', casterId: id, col, row } };
    }

    return { ok: false, error: 'Unknown ability type' };
  }

  startShopPurchase(id, abilityName) {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: 'Unknown player' };
    const shop = SHOPS.find((s) => s.id === p.shopId);
    if (!shop) return { ok: false, error: "You're not at a shop" };
    const item = getShopItems(shop).find((a) => a.name === abilityName);
    if (!item) return { ok: false, error: 'Item not sold here' };
    if (p.unlockedAbilities.includes(abilityName)) {
      return { ok: false, error: 'Already unlocked' };
    }

    const q = loadQuestion();
    p.pendingPurchase = { abilityName, progress: 0, correctIndex: q.correctAnswer };
    return { ok: true, question: { question: q.question, answers: q.answers } };
  }

  answerQuestion(id, answerIndex) {
    const p = this.players.get(id);
    if (!p || !p.pendingPurchase) return { ok: false, error: 'No purchase in progress' };
    const pending = p.pendingPurchase;
    const correct = answerIndex === pending.correctIndex;

    if (!correct) {
      const q = loadQuestion();
      pending.correctIndex = q.correctAnswer;
      return {
        ok: true,
        correct: false,
        unlocked: false,
        progress: pending.progress,
        nextQuestion: { question: q.question, answers: q.answers },
      };
    }

    const ability = abilities.find((a) => a.name === pending.abilityName);
    pending.progress += 1;

    if (pending.progress >= ability.unlockCost) {
      p.unlockedAbilities.push(pending.abilityName);
      p.pendingPurchase = null;
      return { ok: true, correct: true, unlocked: true, abilityName: ability.name };
    }

    const q = loadQuestion();
    pending.correctIndex = q.correctAnswer;
    return {
      ok: true,
      correct: true,
      unlocked: false,
      progress: pending.progress,
      unlockCost: ability.unlockCost,
      nextQuestion: { question: q.question, answers: q.answers },
    };
  }

  startBattleNow() {
    if (this.phase === 'prep') this.phase = 'battle';
  }

  checkWinCondition() {
    const alive = Array.from(this.players.values()).filter((p) => p.health > 0);
    if (this.players.size >= 2 && alive.length <= 1) {
      this.phase = 'over';
      this.winnerId = alive[0]?.id ?? null;
    }
  }

  snapshot() {
    return {
      phase: this.phase,
      prepEndsAt: this.prepEndsAt,
      winnerId: this.winnerId,
      blocks: Array.from(this.blocks),
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        facing: p.facing,
        health: p.health,
        maxHealth: p.maxHealth,
        energy: p.energy,
        maxEnergy: p.maxEnergy,
        unlockedAbilities: p.unlockedAbilities,
        shopId: p.shopId,
      })),
    };
  }
}

export default Match;
