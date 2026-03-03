/**
 * Appearance.ts - Centralized appearance configuration for Terminal Bomberman
 *
 * Contains all visual settings:
 * - Custom color palette (RGB values)
 * - Tile characters and colors
 * - Player and entity appearances
 * - UI colors
 */

import type { TileType, PowerupType } from '../game/types';

// ============================================================
// CUSTOM COLOR PALETTE
// ============================================================

export interface PaletteColor {
  colorId: number;
  r: number;
  g: number;
  b: number;
  a: number;
  e?: number; // Optional emission
}

/**
 * The game's color palette
 */
export const PALETTE: PaletteColor[] = [
  // === BASIC COLORS (0-15) ===
  // Base: Menu background rgb(35, 38, 45)
  { colorId: 0, r: 35, g: 38, b: 45, a: 255 }, // Floor background (same as menu)
  { colorId: 1, r: 50, g: 60, b: 85, a: 255 }, // Walls indestructible (more blue)
  { colorId: 2, r: 70, g: 85, b: 115, a: 255 }, // Bricks destructible (more blue, lighter)
  { colorId: 3, r: 35, g: 38, b: 45, a: 255 }, // Floor dark (same as base)
  { colorId: 4, r: 45, g: 50, b: 60, a: 255 }, // Floor detail (slightly lighter)
  { colorId: 5, r: 40, g: 48, b: 65, a: 255 }, // Wall background (more blue)

  // === BOMB & EXPLOSION (10-19) ===
  { colorId: 10, r: 35, g: 38, b: 45, a: 255 }, // Bomb body
  { colorId: 11, r: 255, g: 100, b: 50, a: 255, e: 100 }, // Explosion orange
  { colorId: 12, r: 255, g: 200, b: 50, a: 255, e: 150 }, // Explosion yellow
  { colorId: 13, r: 255, g: 50, b: 50, a: 255, e: 80 }, // Explosion red (vif)
  { colorId: 14, r: 255, g: 255, b: 200, a: 255, e: 200 }, // Explosion white center
  { colorId: 15, r: 120, g: 25, b: 25, a: 255 }, // Explosion red dark (foncé)

  // === POWERUPS (20-29) ===
  { colorId: 20, r: 50, g: 150, b: 255, a: 255, e: 50 }, // Bomb up (blue)
  { colorId: 21, r: 255, g: 150, b: 50, a: 255, e: 50 }, // Fire up (orange)
  { colorId: 22, r: 50, g: 255, b: 150, a: 255, e: 50 }, // Speed up (green)

  // === PLAYERS (30-39) ===
  { colorId: 30, r: 255, g: 255, b: 100, a: 255, e: 30 }, // Player 1 (Yellow)
  { colorId: 31, r: 100, g: 200, b: 255, a: 255, e: 30 }, // Player 2 (Cyan)
  { colorId: 32, r: 255, g: 100, b: 100, a: 255, e: 30 }, // Player 3 (Red)
  { colorId: 33, r: 100, g: 255, b: 100, a: 255, e: 30 }, // Player 4 (Green)

  // === UI COLORS (40-49) ===
  { colorId: 40, r: 255, g: 255, b: 255, a: 255 }, // White text
  { colorId: 41, r: 180, g: 180, b: 200, a: 255 }, // Gray text
  { colorId: 42, r: 40, g: 40, b: 50, a: 255 }, // UI background
  { colorId: 43, r: 100, g: 100, b: 120, a: 255 }, // UI border
  { colorId: 44, r: 255, g: 220, b: 100, a: 255 }, // Highlight (logo)
  { colorId: 45, r: 180, g: 155, b: 85, a: 255 }, // Highlight dark (logo foncé/désaturé)
  { colorId: 46, r: 90, g: 110, b: 150, a: 255 }, // Banner background (lighter than walls)
  { colorId: 47, r: 70, g: 50, b: 45, a: 255 }, // Aura floor glow (dimmer, warmer)
  { colorId: 48, r: 110, g: 80, b: 70, a: 255 }, // Aura wall glow (dimmer, warmer)
  { colorId: 49, r: 220, g: 145, b: 80, a: 255 }, // Aura brick glow (warm orange)
  { colorId: 70, r: 60, g: 46, b: 42, a: 255 }, // Aura floor glow level 2 (darker, warm)
  { colorId: 71, r: 85, g: 65, b: 60, a: 255 }, // Aura wall glow level 2 (darker, warm)
  { colorId: 72, r: 200, g: 120, b: 70, a: 255 }, // Aura brick glow level 2 (warm, between lvl1 and normal)
  { colorId: 73, r: 235, g: 175, b: 90, a: 255 }, // Aura powerup glow (warm highlight)
  { colorId: 74, r: 205, g: 135, b: 75, a: 255 }, // Aura powerup glow level 2 (dimmer)

  // === DEBUG HEATMAP COLORS (50-59) ===
  { colorId: 50, r: 0, g: 100, b: 0, a: 200 }, // Safe (green)
  { colorId: 51, r: 50, g: 100, b: 0, a: 200 }, // Low danger (yellow-green)
  { colorId: 52, r: 100, g: 100, b: 0, a: 200 }, // Medium-low (yellow)
  { colorId: 53, r: 150, g: 80, b: 0, a: 200 }, // Medium (orange)
  { colorId: 54, r: 200, g: 50, b: 0, a: 200 }, // Medium-high (red-orange)
  { colorId: 55, r: 255, g: 0, b: 0, a: 200 }, // High danger (red)
  { colorId: 56, r: 0, g: 100, b: 255, a: 200 }, // Target (blue)

  // === TOUCH CONTROLS COLORS (60-69) ===
  { colorId: 60, r: 50, g: 55, b: 65, a: 255 }, // D-pad background (slightly lighter than black)
  { colorId: 61, r: 80, g: 85, b: 100, a: 255 }, // D-pad button
  { colorId: 62, r: 40, g: 140, b: 60, a: 255 }, // Button A green
  { colorId: 63, r: 160, g: 50, b: 50, a: 255 }, // Button B red
  { colorId: 64, r: 50, g: 150, b: 255, a: 255, e: 50 }, // Button pressed (bright blue)
];

/**
 * Color ID constants
 *
 * NOTE: Color index 255 is TRANSPARENT
 * - If fg = 255, the character will be invisible
 * - If bg = 255, the background will be transparent (shows layer below)
 */
export const C = {
  // Special
  TRANSPARENT: 255, // Use for invisible fg or transparent bg

  BLACK: 0,
  WALL_GRAY: 1,
  BRICK_BROWN: 2,
  FLOOR_DARK: 3,
  FLOOR_LIGHT: 4,
  DARK_GRAY: 5,

  BOMB: 10,
  EXPLOSION_ORANGE: 11,
  EXPLOSION_YELLOW: 12,
  EXPLOSION_RED: 13,
  EXPLOSION_WHITE: 14,
  EXPLOSION_RED_DARK: 15,

  POWERUP_BOMB: 20,
  POWERUP_FIRE: 21,
  POWERUP_SPEED: 22,

  PLAYER_1: 30,
  PLAYER_2: 31,
  PLAYER_3: 32,
  PLAYER_4: 33,

  WHITE: 40,
  GRAY_TEXT: 41,
  UI_BG: 42,
  UI_BORDER: 43,
  HIGHLIGHT: 44,
  HIGHLIGHT_DARK: 45,
  BANNER_BG: 46,
  AURA_FLOOR: 47,
  AURA_WALL: 48,
  AURA_BRICK: 49,
  AURA_POWERUP: 73,
  // Aura level 2
  AURA_FLOOR_L2: 70,
  AURA_WALL_L2: 71,
  AURA_BRICK_L2: 72,
  AURA_POWERUP_L2: 74,

  // Debug heatmap
  DEBUG_SAFE: 50,
  DEBUG_LOW: 51,
  DEBUG_MEDIUM_LOW: 52,
  DEBUG_MEDIUM: 53,
  DEBUG_MEDIUM_HIGH: 54,
  DEBUG_DANGER: 55,
  DEBUG_TARGET: 56,

  // Touch controls
  CONTROLS_BG: 0, // Same as floor background
  CONTROLS_BUTTON: 43, // UI border gray
  CONTROLS_BUTTON_TEXT: 40, // White
  DPAD_BG: 60, // D-pad background
  DPAD_BUTTON: 61, // D-pad directional button
  BUTTON_A: 62, // Button A green
  BUTTON_B: 63, // Button B red
  BUTTON_PRESSED: 64, // Bright blue when pressed
};

// ============================================================
// TILE APPEARANCES
// ============================================================

export interface TileStyle {
  char: string;
  fg: number;
  bg: number;
}

export const TILES: Record<TileType, TileStyle> = {
  empty: { char: ' ', fg: C.FLOOR_LIGHT, bg: C.FLOOR_DARK },
  wall: { char: '█', fg: C.WALL_GRAY, bg: C.DARK_GRAY },
  brick: { char: '▓', fg: C.HIGHLIGHT_DARK, bg: C.FLOOR_DARK },
  bomb: { char: '●', fg: C.WHITE, bg: C.BOMB },
  explosion: { char: '✸', fg: C.EXPLOSION_YELLOW, bg: C.EXPLOSION_ORANGE },
  powerup: { char: '?', fg: C.WHITE, bg: C.BLACK },
};

// ============================================================
// POWERUP APPEARANCES
// ============================================================

export const POWERUPS: Record<PowerupType, TileStyle> = {
  bomb_up: { char: 'B', fg: C.WHITE, bg: C.POWERUP_BOMB },
};

// ============================================================
// PLAYER APPEARANCE
// ============================================================

export const PLAYER_CHARS = ['1', '2', '3', '4'];
export const PLAYER_COLORS = [C.PLAYER_1, C.PLAYER_2, C.PLAYER_3, C.PLAYER_4];

// ============================================================
// EXPLOSION ANIMATION
// ============================================================

export const EXPLOSION_CHARS = ['✸', '※', '✶', '*'];
export const EXPLOSION_COLORS = [
  C.EXPLOSION_WHITE,
  C.EXPLOSION_YELLOW,
  C.EXPLOSION_ORANGE,
  C.EXPLOSION_RED,
];

// ============================================================
// BOMB ANIMATION
// ============================================================

// Bomb is just 'o' - the blinking is done via background color
export const BOMB_CHARS = ['o'];
