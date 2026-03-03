/**
 * Core game types for Terminal Bomberman
 */

// === DIRECTION ===
export const Direction = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export const DirectionDelta: Record<Direction, { dx: number; dy: number }> = {
  [Direction.North]: { dx: 0, dy: -1 },
  [Direction.East]: { dx: 1, dy: 0 },
  [Direction.South]: { dx: 0, dy: 1 },
  [Direction.West]: { dx: -1, dy: 0 },
};

// === TILE TYPES ===
export type TileType = 'empty' | 'wall' | 'brick' | 'bomb' | 'explosion' | 'powerup';

// === POWERUP TYPES (only bomb pickups remain) ===
export type PowerupType = 'bomb_up';

// === MAP TILE ===
export interface MapTile {
  type: TileType;
  powerup?: PowerupType; // Hidden powerup under brick
}

// === PLAYER ===
export interface Player {
  id: number;
  x: number;
  y: number;
  alive: boolean;
  bombInventory: number; // Consumable bombs picked up
  baselineBombActive: boolean; // True if the free baseline bomb is currently placed
  activeBombs: number; // Currently placed bombs (baseline + inventory)
  fireRange: number; // Explosion range
  speed: number; // Movement speed
  color: number; // Player color ID
}

// === BOMB ===
export interface Bomb {
  x: number;
  y: number;
  ownerId: number;
  timer: number; // Ticks until explosion
  fireRange: number; // Range when exploding
  baseline: boolean; // True if this bomb came from the baseline free slot
}

// === EXPLOSION ===
export interface Explosion {
  x: number;
  y: number;
  timer: number; // Ticks until disappears
}

// === GAME STATE ===
export type GameState = 'waiting' | 'countdown' | 'playing' | 'gameover';

// Helper function for position key
export function posKey(x: number, y: number): string {
  return `${x},${y}`;
}
