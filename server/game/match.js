import { TEAMS } from './teams.js';
import { BASES, TILE_SIZE, GRID_WIDTH, GRID_HEIGHT, getBase } from './bases.js';

// Two-Base Team Arena — Phase 1. The server is authoritative for
// everything: position, team assignment, melee hits, disable/respawn.
// Clients only send input and intent, and render whatever snapshot()
// returns.
//
// Deliberately NOT in Phase 1 (see server/README.md for the phase plan):
// cannons/artillery, fire, repair, robot dogs, sabotage, the teacher
// Q&A resource economy. This is melee-only, two teams, disable-and-
// respawn — the smallest real slice of the full spec.

const PLAYER_SPEED = 140; // px/sec
const PUNCH_RANGE = TILE_SIZE * 1.5;
const PUNCH_COOLDOWN_MS = 600;
const HITS_TO_DISABLE = 3;
const RESPAWN_MS = 3000;

export class Match {
  constructor() {
    this.players = new Map();
    this.phase = 'live'; // no prep/battle split in this design — 'over' is reserved for a future win condition
    this.nextTeamIndex = 0;
  }

  addPlayer(id, name) {
    // Idempotent on purpose: a client can legitimately call arena:enter
    // more than once for the same socket (React StrictMode's dev-mode
    // double-invoke, a reconnect, a retried request) — without this
    // guard, each call would consume another team-rotation slot and
    // silently reassign/overwrite the player's team.
    if (this.players.has(id)) return;

    const team = TEAMS[this.nextTeamIndex % TEAMS.length];
    this.nextTeamIndex += 1;

    const base = getBase(team.id);
    const teamCount = this.countTeamMembers(team.id);
    const spawn = base.spawnPoints[teamCount % base.spawnPoints.length];

    this.players.set(id, {
      id,
      name,
      team: team.id,
      color: team.color,
      x: spawn.col * TILE_SIZE + TILE_SIZE / 2,
      y: spawn.row * TILE_SIZE + TILE_SIZE / 2,
      facing: 'down',
      input: { up: false, down: false, left: false, right: false },
      hitsTaken: 0,
      disabled: false,
      disabledUntil: 0,
      punchCooldownUntil: 0,
    });
  }

  countTeamMembers(teamId) {
    let count = 0;
    for (const p of this.players.values()) if (p.team === teamId) count += 1;
    return count;
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
    const now = Date.now();
    for (const p of this.players.values()) {
      if (p.disabled) {
        if (now >= p.disabledUntil) p.disabled = false;
        continue; // no movement while respawning
      }
      this.movePlayer(p, dtSeconds);
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

    const half = TILE_SIZE * 0.35;
    p.x = Math.max(half, Math.min(GRID_WIDTH * TILE_SIZE - half, p.x));
    p.y = Math.max(half, Math.min(GRID_HEIGHT * TILE_SIZE - half, p.y));
  }

  findNearestEnemy(p) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const other of this.players.values()) {
      if (other.team === p.team || other.disabled) continue;
      const distance = Math.hypot(p.x - other.x, p.y - other.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = other;
      }
    }
    return nearest ? { player: nearest, distance: nearestDistance } : null;
  }

  punch(id) {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (p.disabled) return { ok: false, error: 'Respawning' };

    const now = Date.now();
    if (now < p.punchCooldownUntil) return { ok: false, error: 'Punch on cooldown' };
    p.punchCooldownUntil = now + PUNCH_COOLDOWN_MS;

    const target = this.findNearestEnemy(p);
    if (!target || target.distance > PUNCH_RANGE) {
      return { ok: true, effect: { type: 'punch-miss', casterId: id } };
    }

    target.player.hitsTaken += 1;
    let disabled = false;

    if (target.player.hitsTaken >= HITS_TO_DISABLE) {
      disabled = true;
      target.player.hitsTaken = 0;
      target.player.disabled = true;
      target.player.disabledUntil = now + RESPAWN_MS;
      const barracks = getBase(target.player.team).barracks;
      target.player.x = barracks.col * TILE_SIZE + TILE_SIZE / 2;
      target.player.y = barracks.row * TILE_SIZE + TILE_SIZE / 2;
    }

    return {
      ok: true,
      effect: {
        type: 'punch',
        casterId: id,
        targetId: target.player.id,
        hitsTaken: target.player.hitsTaken,
        disabled,
      },
    };
  }

  snapshot() {
    const now = Date.now();
    return {
      phase: this.phase,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        color: p.color,
        x: p.x,
        y: p.y,
        facing: p.facing,
        hitsTaken: p.hitsTaken,
        disabled: p.disabled,
        respawnMsLeft: p.disabled ? Math.max(0, p.disabledUntil - now) : 0,
      })),
    };
  }
}

export default Match;
