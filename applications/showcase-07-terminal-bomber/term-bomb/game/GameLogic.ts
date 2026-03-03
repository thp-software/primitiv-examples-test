/**
 * GameLogic - Handles game rules, bomb explosions, collisions
 */

import { GameMap } from './GameMap';
import type { Player, Bomb, Direction, PowerupType } from './types';
import { DirectionDelta, posKey } from './types';

const BOMB_TIMER = 60; // 3 seconds at 20 ticks/sec
const EXPLOSION_TIMER = 10; // 0.5 seconds at 20 ticks/sec

export class GameLogic {
  gameMap: GameMap;
  players: Player[];

  constructor(gameMap: GameMap) {
    this.gameMap = gameMap;
    this.players = [];
  }

  initPlayers(count: number): void {
    this.players = [];
    const spawnPoints = [
      { x: 1, y: 1 }, // Player 1: top-left
      { x: this.gameMap.width - 2, y: 1 }, // Player 2: top-right
      { x: 1, y: this.gameMap.height - 2 }, // Player 3: bottom-left
      { x: this.gameMap.width - 2, y: this.gameMap.height - 2 }, // Player 4: bottom-right
    ];

    const colors = [30, 11, 9, 14]; // Yellow, Cyan, Red, Yellow-green

    for (let i = 0; i < Math.min(count, 4); i++) {
      this.players.push({
        id: i,
        x: spawnPoints[i].x,
        y: spawnPoints[i].y,
        alive: true,
        bombInventory: 0,
        baselineBombActive: false,
        activeBombs: 0,
        fireRange: 4, // Fixed at 4 (no powerups modify this)
        speed: 1,
        color: colors[i],
      });
    }
  }

  movePlayer(playerId: number, direction: Direction): boolean {
    const player = this.players[playerId];
    if (!player || !player.alive) return false;

    const delta = DirectionDelta[direction];
    const newX = player.x + delta.dx;
    const newY = player.y + delta.dy;

    // Check if can walk (empty or powerup)
    if (this.gameMap.isWalkable(newX, newY)) {
      player.x = newX;
      player.y = newY;

      // Check for powerup collection
      const powerup = this.gameMap.collectPowerup(newX, newY);
      if (powerup) {
        this.applyPowerup(player, powerup);
      }

      // Check for explosion death
      if (this.gameMap.hasExplosion(newX, newY)) {
        this.killPlayer(player);
      }

      return true;
    }

    return false;
  }

  placeBomb(playerId: number): boolean {
    const player = this.players[playerId];
    if (!player || !player.alive) return false;

    // Check if a bomb is already at this position
    if (this.gameMap.bombs.has(posKey(player.x, player.y))) return false;

    // Decide which bomb source to use: baseline (regenerates) or inventory (consumable)
    const canUseBaseline = !player.baselineBombActive;
    const canUseInventory = player.bombInventory > 0;

    let useBaseline = false;
    if (canUseBaseline) {
      useBaseline = true;
      player.baselineBombActive = true;
    } else if (canUseInventory) {
      player.bombInventory--;
    } else {
      return false; // No bombs available
    }

    // Check if can place bomb at player position
    // Note: player is standing there, so check for other bombs only

    const bomb: Bomb = {
      x: player.x,
      y: player.y,
      ownerId: playerId,
      timer: BOMB_TIMER,
      fireRange: player.fireRange,
      baseline: useBaseline,
    };

    this.gameMap.placeBomb(bomb);
    player.activeBombs++;
    return true;
  }

  tick(): number {
    // Update bombs - returns number of bombs that exploded
    const bombsExploded = this.updateBombs();

    // Update explosions
    this.updateExplosions();

    // Check player collisions with explosions
    this.checkExplosionCollisions();

    return bombsExploded;
  }

  private updateBombs(): number {
    const toExplode: Bomb[] = [];

    for (const bomb of this.gameMap.bombs.values()) {
      bomb.timer--;
      if (bomb.timer <= 0) {
        toExplode.push(bomb);
      }
    }

    // Chain explosions
    for (const bomb of toExplode) {
      this.explodeBomb(bomb);
    }

    return toExplode.length;
  }

  private explodeBomb(bomb: Bomb): void {
    // Remove bomb
    this.gameMap.removeBomb(bomb.x, bomb.y);

    // Decrement player active bombs
    const owner = this.players[bomb.ownerId];
    if (owner) {
      owner.activeBombs = Math.max(0, owner.activeBombs - 1);
      if (bomb.baseline) {
        owner.baselineBombActive = false;
      }
    }

    // Create explosion at bomb center
    this.gameMap.addExplosion(bomb.x, bomb.y, EXPLOSION_TIMER);

    // Spread explosion in 4 directions
    const directions: Direction[] = [0, 1, 2, 3];
    for (const dir of directions) {
      const delta = DirectionDelta[dir];
      for (let i = 1; i <= bomb.fireRange; i++) {
        const ex = bomb.x + delta.dx * i;
        const ey = bomb.y + delta.dy * i;

        const tile = this.gameMap.getTile(ex, ey);
        if (!tile || tile.type === 'wall') break;

        // Add explosion
        this.gameMap.addExplosion(ex, ey, EXPLOSION_TIMER);

        // Chain reaction: explode other bombs
        const otherBomb = this.gameMap.bombs.get(posKey(ex, ey));
        if (otherBomb) {
          otherBomb.timer = 0; // Will explode next tick
        }

        // Destroy brick and stop
        if (tile.type === 'brick') {
          this.gameMap.destroyBrick(ex, ey);
          break;
        }
      }
    }
  }

  private updateExplosions(): void {
    const toRemove: string[] = [];

    for (const [key, explosion] of this.gameMap.explosions) {
      explosion.timer--;
      if (explosion.timer <= 0) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      this.gameMap.explosions.delete(key);
    }
  }

  private checkExplosionCollisions(): void {
    for (const player of this.players) {
      if (!player.alive) continue;
      if (this.gameMap.hasExplosion(player.x, player.y)) {
        this.killPlayer(player);
      }
    }
  }

  private killPlayer(player: Player): void {
    player.alive = false;
  }

  private applyPowerup(player: Player, powerup: PowerupType): void {
    switch (powerup) {
      case 'bomb_up':
        player.bombInventory++;
        break;
    }
  }

  getAlivePlayers(): Player[] {
    return this.players.filter((p) => p.alive);
  }

  isGameOver(): boolean {
    return this.getAlivePlayers().length <= 1;
  }

  getWinner(): Player | null {
    const alive = this.getAlivePlayers();
    return alive.length === 1 ? alive[0] : null;
  }

  reset(): void {
    this.gameMap.reset();
    this.initPlayers(this.players.length);
  }
}
