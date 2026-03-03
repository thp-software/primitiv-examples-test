/**
 * GameMap - Handles the game grid and tile management
 */

import type { MapTile, TileType, PowerupType, Bomb, Explosion } from './types';
import { posKey } from './types';

// Standard Bomberman map size
const MAP_WIDTH = 15;
const MAP_HEIGHT = 13;

export class GameMap {
  width: number;
  height: number;
  private tiles: MapTile[][];
  bombs: Map<string, Bomb>;
  explosions: Map<string, Explosion>;

  constructor(width: number = MAP_WIDTH, height: number = MAP_HEIGHT) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.bombs = new Map();
    this.explosions = new Map();
    this.initializeMap();
  }

  private initializeMap(): void {
    // Create empty map
    for (let y = 0; y < this.height; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.tiles[y][x] = { type: 'empty' };
      }
    }

    // Place indestructible walls (grid pattern + borders)
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Border walls
        if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
          this.tiles[y][x] = { type: 'wall' };
        }
        // Grid pattern walls (every other cell)
        else if (x % 2 === 0 && y % 2 === 0) {
          this.tiles[y][x] = { type: 'wall' };
        }
      }
    }

    // Place destructible bricks randomly
    this.placeBricks();
  }

  private placeBricks(): void {
    const brickChance = 0.7; // 70% chance for brick
    const powerupChance = 0.3; // 30% chance brick has powerup

    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        // Skip walls
        if (this.tiles[y][x].type === 'wall') continue;

        // Skip spawn corners (player starting positions)
        if (this.isSpawnArea(x, y)) continue;

        // Random brick placement
        if (Math.random() < brickChance) {
          const powerup = Math.random() < powerupChance ? this.randomPowerup() : undefined;
          this.tiles[y][x] = { type: 'brick', powerup };
        }
      }
    }
  }

  private isSpawnArea(x: number, y: number): boolean {
    // Top-left spawn (player 1)
    if ((x === 1 && y === 1) || (x === 2 && y === 1) || (x === 1 && y === 2)) return true;
    // Top-right spawn (player 2)
    if (
      (x === this.width - 2 && y === 1) ||
      (x === this.width - 3 && y === 1) ||
      (x === this.width - 2 && y === 2)
    )
      return true;
    // Bottom-left spawn (player 3)
    if (
      (x === 1 && y === this.height - 2) ||
      (x === 2 && y === this.height - 2) ||
      (x === 1 && y === this.height - 3)
    )
      return true;
    // Bottom-right spawn (player 4)
    if (
      (x === this.width - 2 && y === this.height - 2) ||
      (x === this.width - 3 && y === this.height - 2) ||
      (x === this.width - 2 && y === this.height - 3)
    )
      return true;
    return false;
  }

  private randomPowerup(): PowerupType {
    // Only bomb_up powerups remain
    return 'bomb_up';
  }

  getTile(x: number, y: number): MapTile | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    return this.tiles[y][x];
  }

  setTile(x: number, y: number, tile: MapTile): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.tiles[y][x] = tile;
    }
  }

  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.type === 'wall' || tile.type === 'brick') return false;
    if (this.bombs.has(posKey(x, y))) return false;
    return true;
  }

  canPlaceBomb(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.type !== 'empty') return false;
    if (this.bombs.has(posKey(x, y))) return false;
    return true;
  }

  placeBomb(bomb: Bomb): void {
    this.bombs.set(posKey(bomb.x, bomb.y), bomb);
  }

  removeBomb(x: number, y: number): Bomb | undefined {
    const key = posKey(x, y);
    const bomb = this.bombs.get(key);
    this.bombs.delete(key);
    return bomb;
  }

  addExplosion(x: number, y: number, timer: number): void {
    const key = posKey(x, y);
    // Only add if not a wall
    const tile = this.getTile(x, y);
    if (tile && tile.type !== 'wall') {
      this.explosions.set(key, { x, y, timer });
    }
  }

  hasExplosion(x: number, y: number): boolean {
    return this.explosions.has(posKey(x, y));
  }

  destroyBrick(x: number, y: number): PowerupType | undefined {
    const tile = this.getTile(x, y);
    if (tile && tile.type === 'brick') {
      const powerup = tile.powerup;
      this.tiles[y][x] = powerup ? { type: 'powerup', powerup } : { type: 'empty' };
      return powerup;
    }
    return undefined;
  }

  collectPowerup(x: number, y: number): PowerupType | undefined {
    const tile = this.getTile(x, y);
    if (tile && tile.type === 'powerup' && tile.powerup) {
      const powerup = tile.powerup;
      this.tiles[y][x] = { type: 'empty' };
      return powerup;
    }
    return undefined;
  }

  reset(): void {
    this.bombs.clear();
    this.explosions.clear();
    this.initializeMap();
  }
}
