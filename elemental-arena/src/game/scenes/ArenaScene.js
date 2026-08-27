import Phaser from 'phaser';
import { gameEvents } from '../gameEvents.js';
import { calculateDamage } from '../../utils/calculateDamage.js';
import { ELEMENTS } from '../elements.js';

const TILE_SIZE = 32;
const GRID_WIDTH = 16;
const GRID_HEIGHT = 10;

const PLAYER_SPEED = 140;
const ATTACK_RANGE = TILE_SIZE * 1.75;
const ENEMY_ATTACK_RANGE = TILE_SIZE * 1.5;
const ENEMY_DAMAGE = 8;
const ENEMY_MAX_HEALTH = 100;

const FACING_OFFSET = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export class ArenaScene extends Phaser.Scene {
  constructor() {
    super('ArenaScene');
    this.facing = 'down';
    this.enemyHealth = ENEMY_MAX_HEALTH;
    this.blockTiles = new Set();
  }

  preload() {
    this.generateTextures();
  }

  create() {
    this.physics.world.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);

    this.drawGround();

    this.blocks = this.physics.add.staticGroup();

    this.player = this.physics.add.sprite(
      TILE_SIZE * 3,
      TILE_SIZE * 5,
      'player'
    );
    this.player.setCollideWorldBounds(true);
    this.player.setSize(TILE_SIZE * 0.7, TILE_SIZE * 0.7);

    this.enemy = this.physics.add.staticSprite(
      TILE_SIZE * 12,
      TILE_SIZE * 5,
      'enemy'
    );
    this.enemy.element = ELEMENTS.SHADOW;

    this.physics.add.collider(this.player, this.blocks);

    this.enemyHealthBarBg = this.add.rectangle(0, 0, TILE_SIZE, 5, 0x220000);
    this.enemyHealthBarFill = this.add.rectangle(0, 0, TILE_SIZE, 5, 0xff3b3b);
    this.updateEnemyHealthBar();

    this.floatingText = null;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    this.enemyAttackTimer = this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => this.tryEnemyAttack(),
    });

    this.handleCastAbility = (payload) => this.castAbility(payload.ability);
    gameEvents.on('cast-ability', this.handleCastAbility);

    this.events.once('shutdown', () => {
      gameEvents.off('cast-ability', this.handleCastAbility);
      this.enemyAttackTimer.remove();
    });
  }

  update() {
    this.handleMovement();
    this.enemyHealthBarBg.setPosition(this.enemy.x, this.enemy.y - TILE_SIZE * 0.9);
    this.enemyHealthBarFill.setPosition(
      this.enemy.x - TILE_SIZE / 2 + this.enemyHealthBarFill.width / 2,
      this.enemy.y - TILE_SIZE * 0.9
    );
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

    // Player (blue pixel character)
    g.fillStyle(0x2f6fed, 1);
    g.fillRect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
    g.fillStyle(0xdfe9ff, 1);
    g.fillRect(10, 12, 4, 4);
    g.fillRect(18, 12, 4, 4);
    g.generateTexture('player', TILE_SIZE, TILE_SIZE);
    g.clear();

    // Enemy dummy (dark red pixel golem)
    g.fillStyle(0x8a2f2f, 1);
    g.fillRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4);
    g.fillStyle(0xffcf5c, 1);
    g.fillRect(9, 11, 5, 5);
    g.fillRect(18, 11, 5, 5);
    g.generateTexture('enemy', TILE_SIZE, TILE_SIZE);
    g.clear();

    // Buildable block
    g.fillStyle(0x8d7355, 1);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x74593d, 1);
    g.fillRect(0, TILE_SIZE - 6, TILE_SIZE, 6);
    g.generateTexture('block', TILE_SIZE, TILE_SIZE);
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

  // --- input / movement ------------------------------------------------

  handleMovement() {
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    let vx = 0;
    let vy = 0;
    if (left) vx -= 1;
    if (right) vx += 1;
    if (up) vy -= 1;
    if (down) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const length = Math.hypot(vx, vy);
      this.player.setVelocity((vx / length) * PLAYER_SPEED, (vy / length) * PLAYER_SPEED);
      if (Math.abs(vx) > Math.abs(vy)) {
        this.facing = vx > 0 ? 'right' : 'left';
      } else if (vy !== 0) {
        this.facing = vy > 0 ? 'down' : 'up';
      }
    } else {
      this.player.setVelocity(0, 0);
    }
  }

  // --- ability casting ---------------------------------------------------

  castAbility(ability) {
    if (!ability) return;

    if (ability.type === 'attack') {
      this.castAttack(ability);
    } else if (ability.type === 'defend') {
      this.castDefend(ability);
    } else if (ability.type === 'build') {
      this.castBuild(ability);
    }
  }

  castAttack(ability) {
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.enemy.x,
      this.enemy.y
    );

    if (distance > ATTACK_RANGE) {
      this.showFloatingText(this.player.x, this.player.y - 24, 'Too far away!', '#ffb84d');
      return;
    }

    const damage = calculateDamage(ability, { element: this.enemy.element, health: this.enemyHealth });
    this.enemyHealth = Math.max(0, this.enemyHealth - damage);
    this.updateEnemyHealthBar();
    this.tweens.add({
      targets: this.enemy,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
    });
    this.showFloatingText(this.enemy.x, this.enemy.y - 24, `-${damage}`, '#ff5c5c');

    if (this.enemyHealth <= 0) {
      this.defeatEnemy();
    }
  }

  castDefend(ability) {
    const shield = this.add.circle(
      this.player.x,
      this.player.y,
      TILE_SIZE * 0.75,
      0x7fd8ff,
      0.25
    );
    shield.setStrokeStyle(2, 0x7fd8ff, 0.8);
    this.tweens.add({
      targets: shield,
      duration: ability.duration,
      alpha: 0,
      onUpdate: () => shield.setPosition(this.player.x, this.player.y),
      onComplete: () => shield.destroy(),
    });
    this.showFloatingText(this.player.x, this.player.y - 24, 'Shielded!', '#7fd8ff');
  }

  castBuild(ability) {
    const offset = FACING_OFFSET[this.facing];
    const col = Math.round(this.player.x / TILE_SIZE) + offset.x;
    const row = Math.round(this.player.y / TILE_SIZE) + offset.y;
    const key = `${col},${row}`;

    const inBounds = col >= 0 && col < GRID_WIDTH && row >= 0 && row < GRID_HEIGHT;
    if (!inBounds || this.blockTiles.has(key)) {
      this.showFloatingText(this.player.x, this.player.y - 24, "Can't build there", '#ff9c9c');
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

  // --- enemy AI ---------------------------------------------------------

  tryEnemyAttack() {
    if (this.enemyHealth <= 0) return;
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.enemy.x,
      this.enemy.y
    );
    if (distance > ENEMY_ATTACK_RANGE) return;

    this.tweens.add({
      targets: this.enemy,
      scale: 1.15,
      duration: 100,
      yoyo: true,
    });
    gameEvents.emit('player-damaged', { amount: ENEMY_DAMAGE });
    this.showFloatingText(this.player.x, this.player.y - 24, `-${ENEMY_DAMAGE}`, '#ff5c5c');
  }

  defeatEnemy() {
    gameEvents.emit('enemy-defeated');
    this.enemy.setVisible(false);
    this.enemyHealthBarBg.setVisible(false);
    this.enemyHealthBarFill.setVisible(false);

    this.time.delayedCall(3000, () => {
      this.enemyHealth = ENEMY_MAX_HEALTH;
      this.enemy.setVisible(true);
      this.enemyHealthBarBg.setVisible(true);
      this.enemyHealthBarFill.setVisible(true);
      this.updateEnemyHealthBar();
    });
  }

  // --- helpers ------------------------------------------------------------

  updateEnemyHealthBar() {
    const ratio = Phaser.Math.Clamp(this.enemyHealth / ENEMY_MAX_HEALTH, 0, 1);
    this.enemyHealthBarFill.width = TILE_SIZE * ratio;
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
