import Phaser from 'phaser';
import { gameEvents } from '../gameEvents.js';
import { SHOPS } from '../shops.js';

const TILE_SIZE = 32;
const GRID_WIDTH = 16;
const GRID_HEIGHT = 10;
const LERP_FACTOR = 0.35; // how quickly sprites glide toward the server's position each frame

// A pure renderer: this scene owns no game rules at all. It draws whatever
// the latest server snapshot says (players, blocks, health) and plays
// one-off effects the server reports, gliding sprites toward their target
// position each frame rather than snapping (snapshots arrive at ~20Hz, so
// snapping would look choppy). The only thing it originates itself is raw
// keyboard input, forwarded up to React -> the server. See game/gameEvents.js.
export class ArenaScene extends Phaser.Scene {
  constructor() {
    super('ArenaScene');
    this.youId = null;
    this.playerViews = new Map(); // id -> { sprite, healthBarBg, healthBarFill, label, targetX, targetY }
    this.renderedBlocks = new Set();
    this.lastInput = { up: false, down: false, left: false, right: false };
    this.playerTextureCache = new Set();
    this.ready = false;
  }

  preload() {
    this.generateStaticTextures();
  }

  create() {
    this.drawGround();
    this.blockLayer = this.add.group();
    this.drawShops();

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

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

    for (const view of this.playerViews.values()) {
      view.sprite.x = Phaser.Math.Linear(view.sprite.x, view.targetX, LERP_FACTOR);
      view.sprite.y = Phaser.Math.Linear(view.sprite.y, view.targetY, LERP_FACTOR);
      view.healthBarBg.setPosition(view.sprite.x, view.sprite.y - TILE_SIZE * 0.9);
      view.healthBarFill.setPosition(
        view.sprite.x - TILE_SIZE / 2 + view.healthBarFill.width / 2,
        view.sprite.y - TILE_SIZE * 0.9
      );
      view.label.setPosition(view.sprite.x, view.sprite.y + TILE_SIZE * 0.75);
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

    g.fillStyle(0x3a9d4f, 1);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x35914a, 1);
    g.fillRect(0, 0, TILE_SIZE, 2);
    g.fillRect(0, 0, 2, TILE_SIZE);
    g.generateTexture('grass', TILE_SIZE, TILE_SIZE);
    g.clear();

    g.fillStyle(0x8d7355, 1);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x74593d, 1);
    g.fillRect(0, TILE_SIZE - 6, TILE_SIZE, 6);
    g.generateTexture('block', TILE_SIZE, TILE_SIZE);
    g.clear();

    SHOPS.forEach((shop) => {
      g.fillStyle(shop.color, 1);
      g.fillTriangle(TILE_SIZE / 2, 0, 0, TILE_SIZE * 0.7, TILE_SIZE, TILE_SIZE * 0.7);
      g.fillStyle(0xffffff, 0.85);
      g.fillRect(TILE_SIZE * 0.35, TILE_SIZE * 0.7, TILE_SIZE * 0.3, TILE_SIZE * 0.3);
      g.generateTexture(`shop-${shop.id}`, TILE_SIZE, TILE_SIZE);
      g.clear();
    });

    g.destroy();
  }

  ensurePlayerTexture(color) {
    const key = `player-${color}`;
    if (this.playerTextureCache.has(key)) return key;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.fillRect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(10, 12, 4, 4);
    g.fillRect(18, 12, 4, 4);
    g.generateTexture(key, TILE_SIZE, TILE_SIZE);
    g.destroy();
    this.playerTextureCache.add(key);
    return key;
  }

  drawGround() {
    for (let row = 0; row < GRID_HEIGHT; row += 1) {
      for (let col = 0; col < GRID_WIDTH; col += 1) {
        this.add.image(
          col * TILE_SIZE + TILE_SIZE / 2,
          row * TILE_SIZE + TILE_SIZE / 2,
          'grass'
        );
      }
    }
  }

  drawShops() {
    SHOPS.forEach((shop) => {
      const x = shop.tile.col * TILE_SIZE + TILE_SIZE / 2;
      const y = shop.tile.row * TILE_SIZE + TILE_SIZE / 2;
      this.add.image(x, y, `shop-${shop.id}`);
      this.add
        .text(x, y - TILE_SIZE * 0.9, shop.name, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#f2f2f7',
          backgroundColor: '#14141c',
          padding: { x: 3, y: 2 },
        })
        .setOrigin(0.5, 1);
    });
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
      const ratio = Phaser.Math.Clamp(p.health / p.maxHealth, 0, 1);
      view.healthBarFill.width = TILE_SIZE * ratio;
    });

    // Remove views for players who left the match.
    for (const [id, view] of this.playerViews.entries()) {
      if (!seenIds.has(id)) {
        view.sprite.destroy();
        view.healthBarBg.destroy();
        view.healthBarFill.destroy();
        view.label.destroy();
        this.playerViews.delete(id);
      }
    }

    snapshot.blocks.forEach((key) => {
      if (this.renderedBlocks.has(key)) return;
      const [col, row] = key.split(',').map(Number);
      const block = this.add.image(
        col * TILE_SIZE + TILE_SIZE / 2,
        row * TILE_SIZE + TILE_SIZE / 2,
        'block'
      );
      this.blockLayer.add(block);
      this.renderedBlocks.add(key);
    });
  }

  createPlayerView(p) {
    const textureKey = this.ensurePlayerTexture(p.color);
    const sprite = this.add.image(p.x, p.y, textureKey);
    const healthBarBg = this.add.rectangle(p.x, p.y - TILE_SIZE * 0.9, TILE_SIZE, 5, 0x220000);
    const healthBarFill = this.add.rectangle(p.x, p.y - TILE_SIZE * 0.9, TILE_SIZE, 5, 0x3ddc6a);
    const label = this.add
      .text(p.x, p.y + TILE_SIZE * 0.75, p.id === this.youId ? `${p.name} (you)` : p.name, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#f2f2f7',
      })
      .setOrigin(0.5, 0);

    return { sprite, healthBarBg, healthBarFill, label, targetX: p.x, targetY: p.y };
  }

  playEffect(effect) {
    if (!this.ready) return;
    const caster = this.playerViews.get(effect.casterId);
    const target = effect.targetId ? this.playerViews.get(effect.targetId) : null;

    if (effect.type === 'attack' && target) {
      this.tweens.add({ targets: target.sprite, alpha: 0.3, duration: 80, yoyo: true });
      this.showFloatingText(target.sprite.x, target.sprite.y - 24, `-${effect.damage}`, '#ff5c5c');
    } else if (effect.type === 'attack-miss' && caster) {
      this.showFloatingText(caster.sprite.x, caster.sprite.y - 24, 'No target in range!', '#ffb84d');
    } else if (effect.type === 'blocked' && caster) {
      this.showFloatingText(caster.sprite.x, caster.sprite.y - 24, effect.message, '#ffb84d');
    } else if (effect.type === 'defend' && caster) {
      const shield = this.add.circle(caster.sprite.x, caster.sprite.y, TILE_SIZE * 0.75, 0x7fd8ff, 0.25);
      shield.setStrokeStyle(2, 0x7fd8ff, 0.8);
      this.tweens.add({
        targets: shield,
        duration: effect.duration,
        alpha: 0,
        onUpdate: () => shield.setPosition(caster.sprite.x, caster.sprite.y),
        onComplete: () => shield.destroy(),
      });
      this.showFloatingText(caster.sprite.x, caster.sprite.y - 24, 'Shielded!', '#7fd8ff');
    } else if (effect.type === 'build-fail' && caster) {
      this.showFloatingText(caster.sprite.x, caster.sprite.y - 24, "Can't build there", '#ff9c9c');
    }
  }

  showFloatingText(x, y, message, color) {
    const text = this.add.text(x, y, message, {
      fontFamily: 'monospace',
      fontSize: '14px',
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
