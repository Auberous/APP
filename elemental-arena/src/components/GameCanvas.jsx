import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { ArenaScene } from '../game/scenes/ArenaScene.js';

const WIDTH = 16 * 32;
const HEIGHT = 10 * 32;

export default function GameCanvas() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    if (gameRef.current) return undefined;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: WIDTH,
      height: HEIGHT,
      pixelArt: true,
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false },
      },
      scene: [ArenaScene],
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="game-canvas" ref={containerRef} />;
}
