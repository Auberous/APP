import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { ArenaScene } from '../game/scenes/ArenaScene.js';
import { gameEvents } from '../game/gameEvents.js';

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

    // Owned here, not inside the scene: React's cleanup below is a
    // synchronous, reliable lifecycle boundary, whereas Phaser's scene
    // 'shutdown' event is not guaranteed to fire synchronously on
    // game.destroy() — see the comment in ArenaScene.create().
    const getScene = () => gameRef.current?.scene.getScene('ArenaScene');
    const handleSnapshot = ({ snapshot, youId }) => getScene()?.applySnapshot(snapshot, youId);
    const handleEffect = ({ effect }) => getScene()?.playEffect(effect);
    gameEvents.on('net:snapshot', handleSnapshot);
    gameEvents.on('net:effect', handleEffect);

    return () => {
      gameEvents.off('net:snapshot', handleSnapshot);
      gameEvents.off('net:effect', handleEffect);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="game-canvas" ref={containerRef} />;
}
