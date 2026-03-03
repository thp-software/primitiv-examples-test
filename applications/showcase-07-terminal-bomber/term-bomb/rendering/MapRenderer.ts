/**
 * MapRenderer - Renders the game map (tiles, bombs, explosions)
 */

import { OrderBuilder } from "@primitiv/engine";
import { GameMap } from "../game/GameMap";
import type { TileType } from "../game/types";
import { posKey } from "../game/types";
import {
  TILES,
  POWERUPS,
  EXPLOSION_CHARS,
  EXPLOSION_COLORS,
  C,
} from "./Appearance";

export class MapRenderer {
  /**
   * Render the full map
   */
  static render(
    gameMap: GameMap,
    offsetX: number = 0,
    offsetY: number = 0,
    animationTick: number = 0,
  ): any[] {
    const orders: any[] = [];

    for (let y = 0; y < gameMap.height; y++) {
      for (let x = 0; x < gameMap.width; x++) {
        const screenX = offsetX + x;
        const screenY = offsetY + y;

        const tile = gameMap.getTile(x, y);
        if (!tile) continue;

        // ALWAYS render the base tile first (floor)
        // This ensures transparent backgrounds work correctly
        const baseOrder = this.renderTile(
          tile.type,
          tile.powerup,
          screenX,
          screenY,
        );
        orders.push(baseOrder);

        // Then render explosion on top (if any)
        if (gameMap.hasExplosion(x, y)) {
          const order = this.renderExplosion(screenX, screenY, animationTick);
          orders.push(order);
          continue;
        }

        // Then render bomb on top (if any) - bomb has transparent bg when blinking off
        const bomb = gameMap.bombs.get(posKey(x, y));
        if (bomb) {
          const order = this.renderBomb(
            screenX,
            screenY,
            bomb.timer,
            animationTick,
          );
          orders.push(order);
        }
      }
    }

    return orders;
  }

  private static renderTile(
    type: TileType,
    powerup: string | undefined,
    screenX: number,
    screenY: number,
  ): any {
    // Special case for powerup tiles
    if (type === "powerup" && powerup) {
      const style = POWERUPS[powerup as keyof typeof POWERUPS];
      if (style) {
        return OrderBuilder.char(
          screenX,
          screenY,
          style.char,
          style.fg,
          style.bg,
        );
      }
    }

    const style = TILES[type];
    return OrderBuilder.char(screenX, screenY, style.char, style.fg, style.bg);
  }

  private static renderBomb(
    screenX: number,
    screenY: number,
    timer: number,
    animationTick: number,
  ): any {
    // Blink speed based on timer: slow when fresh, fast when about to explode
    // timer=60 (fresh) -> blink every 20 ticks (slow)
    // timer=30 -> blink every 10 ticks (medium)
    // timer<15 -> blink every 4 ticks (very fast)
    const blinkSpeed = timer < 15 ? 4 : timer < 30 ? 8 : timer < 45 ? 12 : 20;
    const isBlinkOn = Math.floor(animationTick / blinkSpeed) % 2 === 0;

    // Black 'o' character
    const char = "o";
    const fg = C.BLACK;

    // Red background that blinks (alternates between red and TRANSPARENT)
    const bg = isBlinkOn ? C.EXPLOSION_RED : C.TRANSPARENT;

    return OrderBuilder.char(screenX, screenY, char, fg, bg);
  }

  private static renderExplosion(
    screenX: number,
    screenY: number,
    animationTick: number,
  ): any {
    const frame = Math.floor(animationTick / 3) % EXPLOSION_CHARS.length;
    const char = EXPLOSION_CHARS[frame];
    const fg = EXPLOSION_COLORS[frame];

    return OrderBuilder.char(screenX, screenY, char, fg, C.EXPLOSION_ORANGE);
  }
}
