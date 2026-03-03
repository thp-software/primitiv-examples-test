/**
 * PlayerRenderer - Renders players on the map
 */

import { OrderBuilder } from "@primitiv/engine";
import type { Player } from "../game/types";
import { PLAYER_CHARS, PLAYER_COLORS, C } from "./Appearance";

export class PlayerRenderer {
  /**
   * Render all players
   */
  static render(
    players: Player[],
    offsetX: number = 0,
    offsetY: number = 0,
    animationTick: number = 0,
  ): any[] {
    const orders: any[] = [];

    for (const player of players) {
      if (!player.alive) continue;

      const screenX = offsetX + player.x;
      const screenY = offsetY + player.y;

      const order = this.renderPlayer(player, screenX, screenY, animationTick);
      orders.push(order);
    }

    return orders;
  }

  private static renderPlayer(
    player: Player,
    screenX: number,
    screenY: number,
    _animationTick: number,
  ): any {
    const char = PLAYER_CHARS[player.id % PLAYER_CHARS.length];
    const fg = PLAYER_COLORS[player.id % PLAYER_COLORS.length];

    // Use transparent background (255) so we can see what's under the player
    return OrderBuilder.char(screenX, screenY, char, fg, C.TRANSPARENT);
  }

  /**
   * Render dead player marker
   */
  static renderDead(
    player: Player,
    offsetX: number = 0,
    offsetY: number = 0,
  ): any {
    const screenX = offsetX + player.x;
    const screenY = offsetY + player.y;

    return OrderBuilder.char(screenX, screenY, "☠", C.GRAY_TEXT, C.FLOOR_DARK);
  }
}
