import Phaser from 'phaser';
import { gameEvents } from '../gameEvents.js';
import { TEAMS } from '../teams.js';
import { BASES, TILE_SIZE, GRID_WIDTH, GRID_HEIGHT } from '../bases.js';

const LERP_FACTOR = 0.35; // how quickly sprites glide toward the server's position each frame
const HITS_TO_DISABLE = 3;

// A pure renderer: this scene owns no game rules at all (Phase 1 — melee
// only, see server/game/match.js). It draws whatever the latest server
// snapshot says (players, team, hits taken, disabled/respawning) and
// plays one-off effects the server reports, gliding sprites toward their
// target position each frame rather than snapping. The only things it
// originates itself are raw movement input and punch presses, forwarded
// up to React -> the server. See game/gameEvents.js for the full contract.
export class ArenaScene extends Phaser.Scene {
  constructor() {
    super('ArenaScene');
    this.youId = null;
    this.playerViews = new Map(); // id -> { sprite, hitPips, respawnText, label, targetX, targetY }
    this.lastInput = { up: false, down: false, left: false, right: false };
    this.playerTextureCache = new Set();
    this.ready = false;
  }

  preload() {
    this.generateStaticTextures();
  }

  create() {
    this.cameras.main.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);

    this.drawGround();
    this.drawBases();

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // applySnapshot()/playEffect() are called directly by GameCanvas, not
    // via a gameEvents subscription owned by this scene — Phaser's scene
    // 'shutdown' event isn't guaranteed to fire synchronously on
    // game.destroy(), so a self-registered listener here can outlive the
    // scene (and crash on stale `this.add` calls) across a remount, e.g.
    // React StrictMode's dev-mode double-mount. GameCanvas's useEffect
    // cleanup is synchronous and reliable, so the subscription lives there.
    this.ready = true;
  }

  update() {
    if (!this.ready) return;
    this.emitInputIfChanged();

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      gameEvents.emit('punch-pressed', {});
    }

    for (const view of this.playerViews.values()) {
      view.sprite.x = Phaser.Math.Linear(view.sprite.x, view.targetX, LERP_FACTOR);
      view.sprite.y = Phaser.Math.Linear(view.sprite.y, view.targetY, LERP_FACTOR);
      view.hitPips.setPosition(view.sprite.x, view.sprite.y - TILE_SIZE * 0.9);
      view.label.setPosition(view.sprite.x, view.sprite.y + TILE_SIZE * 0.75);
      view.respawnText.setPosition(view.sprite.x, view.sprite.y - TILE_SIZE * 1.15);
    }
  }

  // --- input --------------------------------------------------------------

  emitInputIfChanged() {
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;

    const changed =
      up !== this.lastInput.up ||
      down !== this.lastInput.down ||
      left !== this.lastInput.left ||
      right !== this.lastInput.right;

    if (changed) {
      this.lastInput = { up, down, left, right };
      gameEvents.emit('input-changed', this.lastInput);
    }
  }

  // --- rendering ------------------------------------------------------------

  generateStaticTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Neutral battlefield grass.
    g.fillStyle(0x3a9d4f, 1);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x35914a, 1);
    g.fillRect(0, 0, TILE_SIZE, 2);
    g.fillRect(0, 0, 2, TILE_SIZE);
    g.generateTexture('grass', TILE_SIZE, TILE_SIZE);
    g.clear();

    // One character texture per team, tinted by team color.
    TEAMS.forEach((team) => {
      const dark = Phaser.Display.Color.ValueToColor(team.color).darken(25).color;
      g.fillStyle(dark, 1);
      g.fillRect(3, 5, TILE_SIZE - 6, TILE_SIZE - 8);
      g.fillStyle(team.color, 1);
      g.fillRect(4, 6, TILE_SIZE - 8, TILE_SIZE - 10);
      g.fillStyle(0xffffff, 0.18);
      g.fillRect(4, 6, TILE_SIZE - 8, 5);
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(9, 13, 5, 5);
      g.fillRect(18, 13, 5, 5);
      g.fillStyle(0x1a1826, 1);
      g.fillRect(10, 15, 2, 2);
      g.fillRect(19, 15, 2, 2);
      g.generateTexture(`player-${team.id}`, TILE_SIZE, TILE_SIZE);
      g.clear();
    });

    // Barracks flag/banner marker, one per team.
    TEAMS.forEach((team) => {
      g.fillStyle(0x5a4632, 1);
      g.fillRect(TILE_SIZE / 2 - 2, TILE_SIZE * 0.15, 4, TILE_SIZE * 0.75);
      g.fillStyle(team.color, 1);
      g.fillTriangle(
        TILE_SIZE / 2 + 2,
        TILE_SIZE * 0.15,
        TILE_SIZE / 2 + 2,
        TILE_SIZE * 0.4,
        TILE_SIZE - 4,
        TILE_SIZE * 0.28
      );
      g.generateTexture(`barracks-${team.id}`, TILE_SIZE, TILE_SIZE);
      g.clear();
    });

    g.destroy();
  }

  drawGround() {
    for (let row = 0; row < GRID_HEIGHT; row += 1) {
      for (let col = 0; col < GRID_WIDTH; col += 1) {
        const tile = this.add.image(
          col * TILE_SIZE + TILE_SIZE / 2,
          row * TILE_SIZE + TILE_SIZE / 2,
          'grass'
        );
        // Faint team-colored wash over each half of the map so the two
        // territories read clearly at a glance, without needing a hard
        // line down the middle.
        const towardRed = 1 - col / (GRID_WIDTH - 1);
        const towardBlue = col / (GRID_WIDTH - 1);
        if (towardRed > 0.55) {
          tile.setTint(Phaser.Display.Color.GetColor(255, 225, 225));
        } else if (towardBlue > 0.55) {
          tile.setTint(Phaser.Display.Color.GetColor(220, 232, 255));
        }
      }
    }
  }

  drawBases() {
    TEAMS.forEach((team) => {
      const base = BASES[team.id];
      const x = base.barracks.col * TILE_SIZE + TILE_SIZE / 2;
      const y = base.barracks.row * TILE_SIZE + TILE_SIZE / 2;
      this.add.image(x, y, `barracks-${team.id}`);
      this.add
        .text(x, y - TILE_SIZE * 0.9, `${team.name} Barracks`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#f2f2f7',
          backgroundColor: '#14141c',
          padding: { x: 3, y: 2 },
        })
        .setOrigin(0.5, 1);
    });
  }

  ensurePlayerTexture(teamId) {
    const key = `player-${teamId}`;
    this.playerTextureCache.add(key);
    return key;
  }

  applySnapshot(snapshot, youId) {
    if (!this.ready) return; // create() hasn't run yet — drop this tick, the next one will catch up
    this.youId = youId;

    const seenIds = new Set();
    snapshot.players.forEach((p) => {
      seenIds.add(p.id);
      let view = this.playerViews.get(p.id);
      if (!view) {
        view = this.createPlayerView(p);
        this.playerViews.set(p.id, view);
      }
      view.targetX = p.x;
      view.targetY = p.y;
      view.sprite.setAlpha(p.disabled ? 0.35 : 1);
      this.updateHitPips(view.hitPips, p.hitsTaken);
      view.respawnText.setText(p.disabled ? `Respawning ${Math.ceil(p.respawnMsLeft / 1000)}s` : '');
    });

    // Remove views for players who left the match.
    for (const [id, view] of this.playerViews.entries()) {
      if (!seenIds.has(id)) {
        view.sprite.destroy();
        view.hitPips.destroy();
        view.respawnText.destroy();
        view.label.destroy();
        this.playerViews.delete(id);
      }
    }
  }

  createPlayerView(p) {
    const textureKey = this.ensurePlayerTexture(p.team);
    const sprite = this.add.image(p.x, p.y, textureKey);
    const hitPips = this.add.text(p.x, p.y - TILE_SIZE * 0.9, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ff5c5c',
    });
    hitPips.setOrigin(0.5, 1);
    const respawnText = this.add.text(p.x, p.y - TILE_SIZE * 1.15, '', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#ffd35c',
    });
    respawnText.setOrigin(0.5, 1);
    const label = this.add
      .text(p.x, p.y + TILE_SIZE * 0.75, p.id === this.youId ? `${p.name} (you)` : p.name, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#f2f2f7',
      })
      .setOrigin(0.5, 0);

    if (p.id === this.youId) {
      // Bigger world than one screen — follow the local player.
      this.cameras.main.startFollow(sprite, true, 0.15, 0.15);
    }

    return { sprite, hitPips, respawnText, label, targetX: p.x, targetY: p.y };
  }

  updateHitPips(textObj, hitsTaken) {
    textObj.setText('●'.repeat(hitsTaken) + '○'.repeat(HITS_TO_DISABLE - hitsTaken));
  }

  playEffect(effect) {
    if (!this.ready) return;
    const caster = this.playerViews.get(effect.casterId);
    const target = effect.targetId ? this.playerViews.get(effect.targetId) : null;

    if (effect.type === 'punch' && target) {
      this.tweens.add({ targets: target.sprite, alpha: 0.3, duration: 80, yoyo: true });
      const message = effect.disabled ? 'DISABLED!' : `Hit! (${effect.hitsTaken}/${HITS_TO_DISABLE})`;
      this.showFloatingText(target.sprite.x, target.sprite.y - 24, message, effect.disabled ? '#ff5c5c' : '#ffb84d');
    } else if (effect.type === 'punch-miss' && caster) {
      this.showFloatingText(caster.sprite.x, caster.sprite.y - 24, 'No target in range!', '#ffb84d');
    }
  }

  showFloatingText(x, y, message, color) {
    const text = this.add.text(x, y, message, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color,
    });
    text.setOrigin(0.5, 0.5);
    this.tweens.add({
      targets: text,
      y: y - 24,
      alpha: 0,
      duration: 700,
      onComplete: () => text.destroy(),
    });
  }
}

export default ArenaScene;
