/**
 * BoardRenderer - Renders the game board and overlays for Bomberman.
 * Responsible for layering (static map, destructibles, items, bombs, explosions, players, UI).
 */
import { Layer, OrderBuilder, User } from "@primitiv/engine";
import {
  C,
  EXPLOSION_CHARS,
  EXPLOSION_COLORS,
  PLAYER_CHARS,
  PLAYER_COLORS,
  POWERUPS,
  TILES,
} from "./Appearance";
import { UIRenderer } from "./UIRenderer";
import { GameMap } from "../game/GameMap";
import { GameLogic } from "../game/GameLogic";
import type { Bomb, GameState } from "../game/types";
import type { TermBombUserData } from "../apps/TermBomb";

interface BoardRendererDeps {
  gameWidth: number;
  gameHeight: number;
  displayHeight: number;
  mapOffsetX: number;
  mapOffsetY: number;
  recordCommit: (user: User<TermBombUserData>, label: string) => void;
}

export class BoardRenderer {
  deps: BoardRendererDeps;
  constructor(deps: BoardRendererDeps) {
    this.deps = deps;
  }

  renderGame(user: User<TermBombUserData>): void {
    const layers = this.getLayers(user);
    if (!layers) return;

    const { gameMap, gameLogic, gameState } = user.data;
    const animationTick =
      gameState === "gameover"
        ? user.data.gameOverAnimationTick
        : user.data.animationTick;
    const renderState = user.data.renderState;

    const staticKey = `${gameMap.width}x${gameMap.height}`;
    if (renderState.staticKey !== staticKey) {
      const staticOrders = this.renderStaticLayer(gameMap);
      layers.staticLayer.setOrders(staticOrders);

      this.deps.recordCommit(user, "game-static");
      renderState.staticKey = staticKey;
    }

    const destructibleKey = this.hashDestructibles(gameMap);
    if (renderState.destructibleKey !== destructibleKey) {
      const destructibleOrders = this.renderDestructibleLayer(gameMap);
      layers.destructibleLayer.setOrders(destructibleOrders);

      this.deps.recordCommit(user, "game-destructible");
      renderState.destructibleKey = destructibleKey;
    }

    const itemsKey = this.hashItems(gameMap);
    if (renderState.itemsKey !== itemsKey) {
      const itemOrders = this.renderItems(gameMap);
      layers.itemsLayer.setOrders(itemOrders);

      this.deps.recordCommit(user, "game-items");
      renderState.itemsKey = itemsKey;
    }

    const bombsKey = this.hashBombs(gameMap, animationTick);
    if (renderState.bombsKey !== bombsKey) {
      const bombOrders = this.renderBombs(gameMap, animationTick);
      layers.bombsLayer.setOrders(bombOrders);

      this.deps.recordCommit(user, "game-bombs");
      renderState.bombsKey = bombsKey;
    }

    const explosionsKey = this.hashExplosions(gameMap, animationTick);
    if (renderState.explosionsKey !== explosionsKey) {
      const explosionOrders = this.renderExplosions(gameMap, animationTick);
      layers.explosionsLayer.setOrders(explosionOrders);

      this.deps.recordCommit(user, "game-explosions");
      renderState.explosionsKey = explosionsKey;
    }

    const playersKey = this.hashPlayers(gameLogic, gameMap, animationTick);
    if (renderState.playersKey !== playersKey) {
      const playerOrders = this.renderPlayers(
        gameLogic,
        gameMap,
        animationTick,
      );
      layers.playersLayer.setOrders(playerOrders);

      this.deps.recordCommit(user, "game-players");
      renderState.playersKey = playersKey;
    }

    const uiKey = this.hashUi(user, gameLogic, gameState);
    if (renderState.uiKey !== uiKey) {
      const uiOrders = this.renderUi(user, gameLogic, gameState);
      layers.uiLayer.setOrders(uiOrders);

      this.deps.recordCommit(user, "game-ui");
      renderState.uiKey = uiKey;
    }

    // Controls layer: its updates are driven by `updateControlsLayer()` which
    // already hashes pressed states + layout. Keeping this here caused frequent
    // commits (e.g. if gameOffsetX changes), even when nothing changed visually.
  }

  getLayers(user: User<TermBombUserData>): {
    staticLayer: Layer;
    destructibleLayer: Layer;
    itemsLayer: Layer;
    bombsLayer: Layer;
    explosionsLayer: Layer;
    playersLayer: Layer;
    uiLayer: Layer;
    controlsLayer: Layer | null;
  } | null {
    const staticLayer = user.data.layers.get("gameStatic") || null;
    const destructibleLayer = user.data.layers.get("gameDestructible") || null;
    const itemsLayer = user.data.layers.get("gameItems") || null;
    const bombsLayer = user.data.layers.get("gameBombs") || null;
    const explosionsLayer = user.data.layers.get("gameExplosions") || null;
    const playersLayer = user.data.layers.get("gamePlayers") || null;
    const uiLayer = user.data.layers.get("ui") || null;
    const controlsLayer = user.data.layers.get("controls") || null;

    if (
      !staticLayer ||
      !destructibleLayer ||
      !itemsLayer ||
      !bombsLayer ||
      !explosionsLayer ||
      !playersLayer ||
      !uiLayer
    ) {
      console.error("Missing game layers", {
        staticLayer: !!staticLayer,
        destructibleLayer: !!destructibleLayer,
        itemsLayer: !!itemsLayer,
        bombsLayer: !!bombsLayer,
        explosionsLayer: !!explosionsLayer,
        playersLayer: !!playersLayer,
        uiLayer: !!uiLayer,
      });
      return null;
    }

    return {
      staticLayer,
      destructibleLayer,
      itemsLayer,
      bombsLayer,
      explosionsLayer,
      playersLayer,
      uiLayer,
      controlsLayer,
    };
  }

  renderLoading(user: User<TermBombUserData>, progress: number): void {
    const menuLayer = user.data.layers.get("menu");
    if (!menuLayer) return;

    const percent = Math.floor(progress * 100);
    const key = `loading:${percent}`;
    if (user.data.renderState.menuKey === key) return;

    const orders: any[] = [];

    orders.push(
      OrderBuilder.rect(
        0,
        0,
        this.deps.gameWidth,
        this.deps.gameHeight,
        " ",
        C.BLACK,
        C.BLACK,
        true,
      ),
    );

    const cx = Math.floor(this.deps.gameWidth / 2);
    const cy = Math.floor(this.deps.gameHeight / 2);

    const loadingText = "LOADING...";
    const progressText = `${percent}%`;

    orders.push(
      OrderBuilder.text(
        cx - Math.floor(loadingText.length / 2),
        cy - 1,
        loadingText,
        C.WHITE,
        C.BLACK,
      ),
      OrderBuilder.text(
        cx - Math.floor(progressText.length / 2),
        cy + 1,
        progressText,
        C.GRAY_TEXT,
        C.BLACK,
      ),
    );

    menuLayer.setOrders(orders);

    this.deps.recordCommit(user, "loading");
    user.data.renderState.menuKey = key;
  }

  updateControlsLayer(
    user: User<TermBombUserData>,
    label: string = "controls-update",
  ): void {
    const controlsLayer = user.data.layers.get("controls");
    if (!controlsLayer) return;

    // Avoid sending orders every tick if nothing visually changed.
    // This layer is mostly static; only re-render when pressed states or layout changes.
    const controlsKey = `${user.data.controlsEnabled}:${user.data.displayWidth
      }:${user.data.gameOffsetX}:${user.data.touchUp ? 1 : 0}${user.data.touchDown ? 1 : 0
      }${user.data.touchLeft ? 1 : 0}${user.data.touchRight ? 1 : 0}${user.data.touchBomb ? 1 : 0
      }${user.data.touchAction ? 1 : 0}`;
    if (user.data.renderState.controlsKey === controlsKey) {
      return;
    }

    this.applyControlsOrders(user, controlsLayer, {
      up: user.data.touchUp,
      down: user.data.touchDown,
      left: user.data.touchLeft,
      right: user.data.touchRight,
      a: user.data.touchBomb,
      b: user.data.touchAction,
    });

    this.deps.recordCommit(user, label);
    user.data.renderState.controlsKey = controlsKey;
  }

  private applyControlsOrders(
    user: User<TermBombUserData>,
    layer: Layer,
    pressed?: {
      up: boolean;
      down: boolean;
      left: boolean;
      right: boolean;
      a: boolean;
      b: boolean;
    },
  ): void {
    const controlsOrders: any[] = [];

    if (user.data.controlsEnabled) {
      controlsOrders.push(
        OrderBuilder.rect(
          0,
          0,
          user.data.displayWidth,
          this.deps.displayHeight,
          " ",
          C.BLACK,
          C.BLACK,
          true,
        ),
      );

      const touchControlOrders = UIRenderer.renderTouchControls(
        user.data.controlsLeftWidth,
        user.data.controlsRightWidth,
        this.deps.gameWidth,
        this.deps.displayHeight,
        user.data.gameOffsetX,
        pressed,
      );
      controlsOrders.push(...touchControlOrders);
    }

    layer.setOrders(controlsOrders);

  }

  private renderStaticLayer(gameMap: GameMap): any[] {
    const orders: any[] = [];

    orders.push(
      OrderBuilder.rect(
        0,
        0,
        this.deps.gameWidth,
        this.deps.gameHeight,
        " ",
        C.BLACK,
        C.BLACK,
        true,
      ),
    );

    const dots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    for (let y = 0; y < gameMap.height; y++) {
      for (let x = 0; x < gameMap.width; x++) {
        const tile = gameMap.getTile(x, y);
        const isWall = tile?.type === "wall";
        const style = isWall ? TILES.wall : TILES.empty;

        dots.push({
          posX: this.deps.mapOffsetX + x,
          posY: this.deps.mapOffsetY + y,
          charCode: style.char,
          bgColorCode: style.bg,
          fgColorCode: style.fg,
        });
      }
    }

    if (dots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(dots));
    }

    return orders;
  }

  private hashDestructibles(gameMap: GameMap): string {
    const parts: string[] = [];
    for (let y = 0; y < gameMap.height; y++) {
      for (let x = 0; x < gameMap.width; x++) {
        const tile = gameMap.getTile(x, y);
        if (tile?.type === "brick") {
          parts.push(`${x},${y}:${tile.powerup ? 1 : 0}`);
        }
      }
    }
    return parts.join("|");
  }

  private renderDestructibleLayer(gameMap: GameMap): any[] {
    const mask: boolean[] = new Array(gameMap.width * gameMap.height).fill(
      false,
    );

    for (let y = 0; y < gameMap.height; y++) {
      for (let x = 0; x < gameMap.width; x++) {
        const tile = gameMap.getTile(x, y);
        if (tile?.type === "brick") {
          mask[y * gameMap.width + x] = true;
        }
      }
    }

    const anyBricks = mask.some(Boolean);
    if (!anyBricks) return [];

    return [
      OrderBuilder.bitmask(
        this.deps.mapOffsetX,
        this.deps.mapOffsetY,
        gameMap.width,
        gameMap.height,
        mask,
        TILES.brick.char,
        TILES.brick.fg,
        TILES.brick.bg,
      ),
    ];
  }

  private getBombBlink(
    bomb: Bomb,
    animationTick: number,
  ): { stage: number; phase: number; bg: number } {
    const stage =
      bomb.timer < 15 ? 0 : bomb.timer < 30 ? 1 : bomb.timer < 45 ? 2 : 3;
    const blinkSpeed =
      stage === 0 ? 4 : stage === 1 ? 8 : stage === 2 ? 12 : 20;
    const phase = Math.floor(animationTick / blinkSpeed) % 2;
    const bg = phase === 0 ? C.EXPLOSION_RED : C.EXPLOSION_RED_DARK;
    return { stage, phase, bg };
  }

  private hashItems(gameMap: GameMap): string {
    const itemParts: string[] = [];
    for (let y = 0; y < gameMap.height; y++) {
      for (let x = 0; x < gameMap.width; x++) {
        const tile = gameMap.getTile(x, y);
        if (tile?.type === "powerup" && tile.powerup) {
          itemParts.push(`${x},${y}:${tile.powerup}`);
        }
      }
    }
    return itemParts.join(";");
  }

  private renderItems(gameMap: GameMap): any[] {
    const dots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    for (let y = 0; y < gameMap.height; y++) {
      for (let x = 0; x < gameMap.width; x++) {
        const tile = gameMap.getTile(x, y);
        if (tile?.type === "powerup" && tile.powerup) {
          const style = POWERUPS[tile.powerup];
          dots.push({
            posX: this.deps.mapOffsetX + x,
            posY: this.deps.mapOffsetY + y,
            charCode: style.char,
            bgColorCode: style.bg,
            fgColorCode: style.fg,
          });
        }
      }
    }

    return dots.length > 0 ? [OrderBuilder.dotCloudMulti(dots)] : [];
  }

  private hashBombs(gameMap: GameMap, animationTick: number): string {
    const bombParts: string[] = [];
    for (const bomb of gameMap.bombs.values()) {
      const blink = this.getBombBlink(bomb, animationTick);
      bombParts.push(`${bomb.x},${bomb.y},${blink.stage},${blink.phase}`);
    }
    bombParts.sort();
    // Include count to ensure hash changes when all bombs explode
    return `c:${gameMap.bombs.size}|${bombParts.join(";")}`;
  }

  private renderBombs(gameMap: GameMap, animationTick: number): any[] {
    const dots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    for (const bomb of gameMap.bombs.values()) {
      const blink = this.getBombBlink(bomb, animationTick);

      dots.push({
        posX: this.deps.mapOffsetX + bomb.x,
        posY: this.deps.mapOffsetY + bomb.y,
        charCode: "o",
        bgColorCode: blink.bg,
        fgColorCode: C.BLACK,
      });
    }

    // Send an empty array to clear the layer when there are no bombs
    return dots.length > 0
      ? [OrderBuilder.dotCloudMulti(dots)]
      : [];
  }

  private hashExplosions(gameMap: GameMap, animationTick: number): string {
    const parts: string[] = [];
    for (const explosion of gameMap.explosions.values()) {
      parts.push(`${explosion.x},${explosion.y}`);
    }
    parts.sort();

    const count = gameMap.explosions.size;
    const frame =
      count > 0 ? Math.floor(animationTick / 4) % EXPLOSION_CHARS.length : 0;
    // Include count explicitly to ensure hash changes when all explosions end
    return `c:${count}|f:${frame}|e:${parts.join(";")}`;
  }

  private renderExplosions(gameMap: GameMap, animationTick: number): any[] {
    // Send an empty array to clear the layer when there are no explosions
    if (gameMap.explosions.size === 0)
      return [];

    const frame = Math.floor(animationTick / 4) % EXPLOSION_CHARS.length;
    const char = EXPLOSION_CHARS[frame];
    const fg = EXPLOSION_COLORS[frame];
    const bg = C.EXPLOSION_ORANGE;

    const rows = new Map<number, number[]>();
    const cols = new Map<number, number[]>();

    const auraL1 = new Set<string>();
    const auraL2 = new Set<string>();

    for (const exp of gameMap.explosions.values()) {
      if (!rows.has(exp.y)) rows.set(exp.y, []);
      rows.get(exp.y)!.push(exp.x);
      if (!cols.has(exp.x)) cols.set(exp.x, []);
      cols.get(exp.x)!.push(exp.y);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = exp.x + dx;
          const ny = exp.y + dy;
          if (nx < 0 || nx >= gameMap.width || ny < 0 || ny >= gameMap.height)
            continue;
          auraL1.add(`${nx},${ny}`);
        }
      }

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
          const nx = exp.x + dx;
          const ny = exp.y + dy;
          if (nx < 0 || nx >= gameMap.width || ny < 0 || ny >= gameMap.height)
            continue;
          auraL2.add(`${nx},${ny}`);
        }
      }
    }

    const orders: any[] = [];

    if (auraL1.size > 0) {
      const auraDots: Array<{
        posX: number;
        posY: number;
        charCode: string | number;
        bgColorCode: number;
        fgColorCode: number;
      }> = [];

      for (const key of auraL1) {
        const [sx, sy] = key.split(",").map((n) => parseInt(n, 10));
        const tile = gameMap.getTile(sx, sy);

        let auraBg = C.AURA_FLOOR;
        let auraFg = C.BLACK;
        let auraChar: string | number = " ";

        if (tile?.type === "wall") {
          auraBg = C.AURA_WALL;
        } else if (tile?.type === "brick") {
          auraBg = C.AURA_FLOOR;
          auraFg = C.AURA_BRICK;
          auraChar = TILES.brick.char;
        } else if (tile?.type === "powerup") {
          auraBg = C.AURA_POWERUP;
          auraFg = C.WHITE;
          auraChar = POWERUPS.bomb_up.char;
        }

        auraDots.push({
          posX: this.deps.mapOffsetX + sx,
          posY: this.deps.mapOffsetY + sy,
          charCode: auraChar,
          bgColorCode: auraBg,
          fgColorCode: auraFg,
        });
      }

      if (auraDots.length > 0) {
        orders.push(OrderBuilder.dotCloudMulti(auraDots));
      }
    }

    if (auraL2.size > 0) {
      const auraDots2: Array<{
        posX: number;
        posY: number;
        charCode: string | number;
        bgColorCode: number;
        fgColorCode: number;
      }> = [];

      for (const key of auraL2) {
        if (auraL1.has(key)) continue;
        const [sx, sy] = key.split(",").map((n) => parseInt(n, 10));
        const tile = gameMap.getTile(sx, sy);

        let auraBg = C.AURA_FLOOR_L2;
        let auraFg = C.BLACK;
        let auraChar: string | number = " ";

        if (tile?.type === "wall") {
          auraBg = C.AURA_WALL_L2;
        } else if (tile?.type === "brick") {
          auraBg = C.AURA_FLOOR_L2;
          auraFg = C.AURA_BRICK_L2;
          auraChar = TILES.brick.char;
        } else if (tile?.type === "powerup") {
          auraBg = C.AURA_POWERUP_L2;
          auraFg = C.WHITE;
          auraChar = POWERUPS.bomb_up.char;
        }

        auraDots2.push({
          posX: this.deps.mapOffsetX + sx,
          posY: this.deps.mapOffsetY + sy,
          charCode: auraChar,
          bgColorCode: auraBg,
          fgColorCode: auraFg,
        });
      }

      if (auraDots2.length > 0) {
        orders.push(OrderBuilder.dotCloudMulti(auraDots2));
      }
    }

    for (const [y, xs] of rows) {
      xs.sort((a, b) => a - b);
      let start = xs[0];
      let prev = xs[0];
      for (let i = 1; i < xs.length; i++) {
        const x = xs[i];
        if (x === prev + 1) {
          prev = x;
          continue;
        }
        orders.push(
          OrderBuilder.line(
            this.deps.mapOffsetX + start,
            this.deps.mapOffsetY + y,
            this.deps.mapOffsetX + prev,
            this.deps.mapOffsetY + y,
            { charCode: char, fgColor: fg, bgColor: bg },
          ),
        );
        start = x;
        prev = x;
      }
      orders.push(
        OrderBuilder.line(
          this.deps.mapOffsetX + start,
          this.deps.mapOffsetY + y,
          this.deps.mapOffsetX + prev,
          this.deps.mapOffsetY + y,
          { charCode: char, fgColor: fg, bgColor: bg },
        ),
      );
    }

    for (const [x, ys] of cols) {
      ys.sort((a, b) => a - b);
      let start = ys[0];
      let prev = ys[0];
      for (let i = 1; i < ys.length; i++) {
        const y = ys[i];
        if (y === prev + 1) {
          prev = y;
          continue;
        }
        orders.push(
          OrderBuilder.line(
            this.deps.mapOffsetX + x,
            this.deps.mapOffsetY + start,
            this.deps.mapOffsetX + x,
            this.deps.mapOffsetY + prev,
            { charCode: char, fgColor: fg, bgColor: bg },
          ),
        );
        start = y;
        prev = y;
      }
      orders.push(
        OrderBuilder.line(
          this.deps.mapOffsetX + x,
          this.deps.mapOffsetY + start,
          this.deps.mapOffsetX + x,
          this.deps.mapOffsetY + prev,
          { charCode: char, fgColor: fg, bgColor: bg },
        ),
      );
    }

    return orders;
  }

  private hashPlayers(
    gameLogic: GameLogic,
    gameMap: GameMap,
    animationTick: number,
  ): string {
    const parts: string[] = [];
    for (const player of gameLogic.players) {
      const bomb = gameMap.bombs.get(`${player.x},${player.y}`);
      const bombPhase = bomb ? this.getBombBlink(bomb, animationTick) : null;
      const bombKey = bombPhase ? `${bombPhase.stage}:${bombPhase.phase}` : "0";
      parts.push(
        `${player.id}:${player.x},${player.y}:${player.alive ? 1 : 0}:b${bombKey}`,
      );
    }
    return parts.join(";");
  }

  private renderPlayers(
    gameLogic: GameLogic,
    gameMap: GameMap,
    animationTick: number,
  ): any[] {
    const dots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    for (const player of gameLogic.players) {
      if (!player.alive) continue;

      const screenX = this.deps.mapOffsetX + player.x;
      const screenY = this.deps.mapOffsetY + player.y;
      const key = `${player.x},${player.y}`;

      let playerBg = TILES.empty.bg;
      const bomb = gameMap.bombs.get(key);
      if (bomb) {
        const blink = this.getBombBlink(bomb, animationTick);
        playerBg = blink.bg;
      }

      const char = PLAYER_CHARS[player.id % PLAYER_CHARS.length];
      const fg = PLAYER_COLORS[player.id % PLAYER_COLORS.length];

      dots.push({
        posX: screenX,
        posY: screenY,
        charCode: char,
        bgColorCode: playerBg,
        fgColorCode: fg,
      });
    }

    return dots.length > 0 ? [OrderBuilder.dotCloudMulti(dots)] : [];
  }

  private hashUi(
    user: User<TermBombUserData>,
    gameLogic: GameLogic,
    gameState: GameState,
  ): string {
    const currentPlayerId = user.data.sharedGame ? user.data.playerId : 0;
    const currentPlayer = gameLogic.players[currentPlayerId];

    const playerKey = currentPlayer
      ? `${currentPlayer.alive ? 1 : 0}:${currentPlayer.baselineBombActive ? 1 : 0
      }:${currentPlayer.bombInventory}`
      : "none";

    const countdownSeconds = Math.ceil(user.data.countdownTicks / 20);

    return `${gameState}|c:${countdownSeconds}|id:${currentPlayerId}|p:${playerKey}`;
  }

  private renderUi(
    user: User<TermBombUserData>,
    gameLogic: GameLogic,
    gameState: GameState,
  ): any[] {
    const orders: any[] = [];

    const currentPlayerId = user.data.sharedGame ? user.data.playerId : 0;
    const currentPlayer = gameLogic.players[currentPlayerId];

    if (currentPlayer) {
      orders.push(
        ...UIRenderer.renderPlayerHUD(
          currentPlayer,
          gameLogic.players,
          0,
          0,
          this.deps.gameWidth,
        ),
      );
    }

    const gameCenterX = Math.floor(this.deps.gameWidth / 2);
    const gameCenterY = Math.floor(this.deps.gameHeight / 2);

    if (gameState === "gameover") {
      const winner = gameLogic.getWinner();
      orders.push(
        ...UIRenderer.renderGameOver(
          winner,
          gameCenterX,
          gameCenterY,
          user.data.gameOverTitle || undefined,
        ),
      );
    }

    if (gameState === "countdown") {
      const secondsLeft = Math.ceil(user.data.countdownTicks / 20);
      orders.push(
        ...UIRenderer.renderCountdown(secondsLeft, gameCenterX, gameCenterY),
      );
    }

    return orders;
  }
}
