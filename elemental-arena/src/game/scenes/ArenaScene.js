import Phaser from 'phaser';
import { gameEvents } from '../gameEvents.js';
import { calculateDamage } from '../../utils/calculateDamage.js';
import { SHOPS } from '../shops.js';
import { LOCAL_PLAYERS } from '../players.js';

const TILE_SIZE = 32;
const GRID_WIDTH = 16;
const GRID_HEIGHT = 10;

const PLAYER_SPEED = 140;
const ATTACK_RANGE = TILE_SIZE * 1.75;
const SHOP_RADIUS = TILE_SIZE * 1.8;

const FACING_OFFSET = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const CONTROL_KEYS = {
  wasd: { left: 'A', right: 'D', up: 'W', down: 'S' },
  arrows: { left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN' },
};

export class ArenaScene extends Phaser.Scene {
  constructor() {
    super('ArenaScene');
    this.phase = 'prep';
    this.blockTiles = new Set();
    this.players = {};
  }

  preload() {
    this.generateTextures();
  }

  create() {
    this.physics.world.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);

    this.drawGround();

    this.blocks = this.physics.add.staticGroup();
    this.playerGroup = this.physics.add.group();

    this.keySets = {
      wasd: this.input.keyboard.addKeys('W,A,S,D'),
      arrows: this.input.keyboard.createCursorKeys(),
    };

    LOCAL_PLAYERS.forEach((config) => this.spawnPlayer(config));

    this.physics.add.collider(this.playerGroup, this.playerGroup);
    this.physics.add.collider(this.playerGroup, this.blocks);

    this.drawShops();

    this.handleCastAbility = ({ playerId, ability }) => this.castAbility(playerId, ability);
    this.handlePhaseChanged = ({ phase }) => {
      this.phase = phase;
    };
    this.handleHealthChanged = ({ playerId, health, maxHealth }) =>
      this.setPlayerHealth(playerId, health, maxHealth);

    gameEvents.on('cast-ability', this.handleCastAbility);
    gameEvents.on('phase-changed', this.handlePhaseChanged);
    gameEvents.on('health-changed', this.handleHealthChanged);

    this.events.once('shutdown', () => {
      gameEvents.off('cast-ability', this.handleCastAbility);
      gameEvents.off('phase-changed', this.handlePhaseChanged);
      gameEvents.off('health-changed', this.handleHealthChanged);
    });
  }

  update() {
    LOCAL_PLAYERS.forEach((config) => this.handleMovement(config));
    this.checkShopZones();
    LOCAL_PLAYERS.forEach((config) => {
      const player = this.players[config.id];
      player.healthBarBg.setPosition(player.sprite.x, player.sprite.y - TILE_SIZE * 0.9);
      player.healthBarFill.setPosition(
        player.sprite.x - TILE_SIZE / 2 + player.healthBarFill.width / 2,
        player.sprite.y - TILE_SIZE * 0.9
      );
    });
  }

  // --- setup helpers -------------------------------------------------

  generateTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Grass tile
    g.fillStyle(0x3a9d4f, 1);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x35914a, 1);
    g.fillRect(0, 0, TILE_SIZE, 2);
    g.fillRect(0, 0, 2, TILE_SIZE);
    g.generateTexture('grass', TILE_SIZE, TILE_SIZE);
    g.clear();

    // Buildable block
    g.fillStyle(0x8d7355, 1);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x74593d, 1);
    g.fillRect(0, TILE_SIZE - 6, TILE_SIZE, 6);
    g.generateTexture('block', TILE_SIZE, TILE_SIZE);
    g.clear();

    // One pixel-art character texture per player, tinted by their color.
    LOCAL_PLAYERS.forEach((config) => {
      g.fillStyle(config.color, 1);
      g.fillRect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(10, 12, 4, 4);
      g.fillRect(18, 12, 4, 4);
      g.generateTexture(`player-${config.id}`, TILE_SIZE, TILE_SIZE);
      g.clear();
    });

    // Shop marker (one texture per shop, tinted by shop.color) — a simple
    // pixel-art tent/stall shape.
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

  spawnPlayer(config) {
    const x = config.spawn.col * TILE_SIZE + TILE_SIZE / 2;
    const y = config.spawn.row * TILE_SIZE + TILE_SIZE / 2;
    const sprite = this.physics.add.sprite(x, y, `player-${config.id}`);
    // Group.add() resets several body flags to the group's defaults, so
    // configure the body *after* adding it to the group, not before.
    this.playerGroup.add(sprite);
    sprite.setCollideWorldBounds(true);
    sprite.setSize(TILE_SIZE * 0.7, TILE_SIZE * 0.7);
    sprite.setBounce(0.1, 0.1);

    const healthBarBg = this.add.rectangle(x, y, TILE_SIZE, 5, 0x220000);
    const healthBarFill = this.add.rectangle(x, y, TILE_SIZE, 5, 0x3ddc6a);

    this.add
      .text(x, y + TILE_SIZE * 0.75, config.label, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#f2f2f7',
      })
      .setOrigin(0.5, 0);

    this.players[config.id] = {
      config,
      sprite,
      facing: 'down',
      currentShopId: null,
      healthBarBg,
      healthBarFill,
    };
  }

  // --- input / movement ------------------------------------------------

  handleMovement(config) {
    const player = this.players[config.id];
    const keys = CONTROL_KEYS[config.controls];
    const keySet = this.keySets[config.controls];

    const isDown = (name) =>
      config.controls === 'arrows' ? keySet[name.toLowerCase()].isDown : keySet[keys[name.toLowerCase()]].isDown;

    let vx = 0;
    let vy = 0;
    if (isDown('left')) vx -= 1;
    if (isDown('right')) vx += 1;
    if (isDown('up')) vy -= 1;
    if (isDown('down')) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const length = Math.hypot(vx, vy);
      player.sprite.setVelocity((vx / length) * PLAYER_SPEED, (vy / length) * PLAYER_SPEED);
      if (Math.abs(vx) > Math.abs(vy)) {
        player.facing = vx > 0 ? 'right' : 'left';
      } else if (vy !== 0) {
        player.facing = vy > 0 ? 'down' : 'up';
      }
    } else {
      player.sprite.setVelocity(0, 0);
    }
  }

  // --- shops -------------------------------------------------------------

  checkShopZones() {
    LOCAL_PLAYERS.forEach((config) => {
      const player = this.players[config.id];
      const nearShop = SHOPS.find((shop) => {
        const x = shop.tile.col * TILE_SIZE + TILE_SIZE / 2;
        const y = shop.tile.row * TILE_SIZE + TILE_SIZE / 2;
        return (
          Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, x, y) <= SHOP_RADIUS
        );
      });
      const nextShopId = nearShop ? nearShop.id : null;

      if (nextShopId !== player.currentShopId) {
        player.currentShopId = nextShopId;
        gameEvents.emit('shop-zone', { playerId: config.id, shopId: nextShopId });
      }
    });
  }

  // --- ability casting ---------------------------------------------------

  castAbility(playerId, ability) {
    if (!ability) return;
    const player = this.players[playerId];
    if (!player) return;

    if (ability.type === 'attack') {
      this.castAttack(player, ability);
    } else if (ability.type === 'defend') {
      this.castDefend(player, ability);
    } else if (ability.type === 'build') {
      this.castBuild(player, ability);
    }
  }

  findNearestOpponent(player) {
    let nearest = null;
    let nearestDistance = Infinity;
    LOCAL_PLAYERS.forEach((config) => {
      if (config.id === player.config.id) return;
      const other = this.players[config.id];
      const distance = Phaser.Math.Distance.Between(
        player.sprite.x,
        player.sprite.y,
        other.sprite.x,
        other.sprite.y
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = other;
      }
    });
    return nearest ? { player: nearest, distance: nearestDistance } : null;
  }

  castAttack(player, ability) {
    if (this.phase !== 'battle') {
      this.showFloatingText(
        player.sprite.x,
        player.sprite.y - 24,
        "Battle hasn't started yet!",
        '#ffb84d'
      );
      return;
    }

    const target = this.findNearestOpponent(player);
    if (!target || target.distance > ATTACK_RANGE) {
      this.showFloatingText(player.sprite.x, player.sprite.y - 24, 'No target in range!', '#ffb84d');
      return;
    }

    const damage = calculateDamage(ability, { element: null });
    gameEvents.emit('player-damaged', { playerId: target.player.config.id, amount: damage });

    this.tweens.add({
      targets: target.player.sprite,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
    });
    this.showFloatingText(target.player.sprite.x, target.player.sprite.y - 24, `-${damage}`, '#ff5c5c');
  }

  castDefend(player, ability) {
    const shield = this.add.circle(
      player.sprite.x,
      player.sprite.y,
      TILE_SIZE * 0.75,
      0x7fd8ff,
      0.25
    );
    shield.setStrokeStyle(2, 0x7fd8ff, 0.8);
    this.tweens.add({
      targets: shield,
      duration: ability.duration,
      alpha: 0,
      onUpdate: () => shield.setPosition(player.sprite.x, player.sprite.y),
      onComplete: () => shield.destroy(),
    });
    this.showFloatingText(player.sprite.x, player.sprite.y - 24, 'Shielded!', '#7fd8ff');
  }

  castBuild(player, ability) {
    const offset = FACING_OFFSET[player.facing];
    const col = Math.round(player.sprite.x / TILE_SIZE) + offset.x;
    const row = Math.round(player.sprite.y / TILE_SIZE) + offset.y;
    const key = `${col},${row}`;

    const inBounds = col >= 0 && col < GRID_WIDTH && row >= 0 && row < GRID_HEIGHT;
    if (!inBounds || this.blockTiles.has(key)) {
      this.showFloatingText(player.sprite.x, player.sprite.y - 24, "Can't build there", '#ff9c9c');
      return;
    }

    const block = this.blocks.create(
      col * TILE_SIZE + TILE_SIZE / 2,
      row * TILE_SIZE + TILE_SIZE / 2,
      'block'
    );
    block.refreshBody();
    this.blockTiles.add(key);
    this.showFloatingText(block.x, block.y - 24, ability.name, '#c9a679');
  }

  // --- helpers ------------------------------------------------------------

  setPlayerHealth(playerId, health, maxHealth) {
    const player = this.players[playerId];
    if (!player) return;
    const ratio = Phaser.Math.Clamp(health / maxHealth, 0, 1);
    player.healthBarFill.width = TILE_SIZE * ratio;
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
