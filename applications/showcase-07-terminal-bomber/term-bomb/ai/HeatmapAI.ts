import type { User } from "@primitiv/engine";
import { Direction } from "../game/types";
import type { TermBombUserData } from "../apps/TermBomb";
import type { GameMap } from "../game/GameMap";
import type { GameLogic } from "../game/GameLogic";

/**
 * BotAI - heatmap-driven bot decisions for Bomberman.
 * Provides run() plus helpers for movement, danger evaluation, and bomb placement.
 */
export class BotAI {
  static run(user: User<TermBombUserData>, playerId: number): void {
    const { gameLogic, gameMap } = user.data;
    const player = gameLogic.players[playerId];
    if (!player || !player.alive) return;

    const px = player.x;
    const py = player.y;

    if (!user.data.aiLastDirection.has(playerId)) {
      user.data.aiLastDirection.set(playerId, null);
      user.data.aiStuckCounter.set(playerId, 0);
    }

    const heatMap = this.calculateHeatMap(gameMap);
    const currentDanger = heatMap.get(`${px},${py}`) || 0;

    user.data.aiDebugHeatMaps.set(playerId, heatMap);

    const FLEE_THRESHOLD = 150;
    const URGENT_THRESHOLD = 200;
    const SAFE_THRESHOLD = 50;

    const getOpposite = (dir: Direction): Direction => {
      switch (dir) {
        case Direction.North:
          return Direction.South;
        case Direction.South:
          return Direction.North;
        case Direction.East:
          return Direction.West;
        case Direction.West:
          return Direction.East;
      }
    };

    const doMove = (dir: Direction) => {
      const lastDir = user.data.aiLastDirection.get(playerId);
      if (
        lastDir !== null &&
        lastDir !== undefined &&
        dir === getOpposite(lastDir)
      ) {
        const stuckCount = (user.data.aiStuckCounter.get(playerId) || 0) + 1;
        user.data.aiStuckCounter.set(playerId, stuckCount);
        if (stuckCount >= 3) {
          const walkable = this.getAdjacentWalkable(gameMap, px, py);
          const alternatives = walkable.filter(
            (w) =>
              w.dir !== dir &&
              w.dir !== lastDir &&
              (heatMap.get(`${w.x},${w.y}`) || 0) < SAFE_THRESHOLD,
          );
          if (alternatives.length > 0) {
            const alt =
              alternatives[Math.floor(Math.random() * alternatives.length)];
            user.data.aiLastDirection.set(playerId, alt.dir);
            user.data.aiStuckCounter.set(playerId, 0);
            gameLogic.movePlayer(playerId, alt.dir);
            return;
          }
        }
      } else {
        user.data.aiStuckCounter.set(playerId, 0);
      }

      user.data.aiLastDirection.set(playerId, dir);
      gameLogic.movePlayer(playerId, dir);
    };

    if (currentDanger >= URGENT_THRESHOLD) {
      let escapeDir = this.findSafestDirection(gameMap, px, py, heatMap);
      if (escapeDir === null) {
        escapeDir = this.findEscapePathThroughDanger(gameMap, px, py, heatMap);
      }
      if (escapeDir !== null) {
        doMove(escapeDir);
      }
      return;
    }

    if (currentDanger >= FLEE_THRESHOLD) {
      let escapeDir = this.findSafestDirection(gameMap, px, py, heatMap);
      if (escapeDir === null) {
        escapeDir = this.findEscapePathThroughDanger(gameMap, px, py, heatMap);
      }
      if (escapeDir !== null) {
        doMove(escapeDir);
        return;
      }
    }

    if (currentDanger > SAFE_THRESHOLD) {
      const escapeDir = this.findSafestDirection(gameMap, px, py, heatMap);
      if (escapeDir !== null) {
        doMove(escapeDir);
        return;
      }
      const escapeThrough = this.findEscapePathThroughDanger(
        gameMap,
        px,
        py,
        heatMap,
      );
      if (escapeThrough !== null) {
        doMove(escapeThrough);
        return;
      }
    }

    if (Math.random() > 0.3) return;

    const SAFE = SAFE_THRESHOLD;

    const accessibleTarget = this.findMostAccessibleTarget(
      gameMap,
      gameLogic,
      px,
      py,
      playerId,
      heatMap,
      SAFE,
    );

    if (accessibleTarget) {
      user.data.aiDebugTargets.set(playerId, {
        x: accessibleTarget.player.x,
        y: accessibleTarget.player.y,
      });
    } else {
      user.data.aiDebugTargets.set(playerId, null);
    }

    const availableBombs =
      (player.baselineBombActive ? 0 : 1) + player.bombInventory;
    const alreadyInDanger = currentDanger >= SAFE;
    const hasAdjacentBomb = this.hasAdjacentBomb(gameMap, px, py);
    const canPlaceBomb =
      availableBombs > 0 && !alreadyInDanger && !hasAdjacentBomb;

    if (accessibleTarget && canPlaceBomb) {
      const target = accessibleTarget.player;
      const wouldHitTarget = this.wouldHitPlayer(
        gameMap,
        px,
        py,
        player.fireRange,
        target.x,
        target.y,
      );

      if (wouldHitTarget) {
        const canEscape = this.canEscapeAfterBombHeatMap(
          gameMap,
          px,
          py,
          player.fireRange,
          heatMap,
        );

        if (canEscape) {
          gameLogic.placeBomb(playerId);
          const escapeDir = this.findEscapeFromOwnBombHeatMap(
            gameMap,
            px,
            py,
            player.fireRange,
            heatMap,
          );
          if (escapeDir !== null) {
            doMove(escapeDir);
          }
          return;
        }
      }
    }

    if (accessibleTarget) {
      const target = accessibleTarget.player;
      if (accessibleTarget.bricks <= 1) {
        const chaseDir = this.chaseTargetSafely(
          gameMap,
          px,
          py,
          target.x,
          target.y,
          heatMap,
          SAFE,
        );
        if (chaseDir !== null) {
          doMove(chaseDir);
          return;
        }
      }
    }

    const nearestPowerup = this.findNearestPowerup(
      gameMap,
      px,
      py,
      heatMap,
      SAFE,
    );

    if (nearestPowerup && nearestPowerup.distance <= 3) {
      const powerupDir = this.chaseTargetSafely(
        gameMap,
        px,
        py,
        nearestPowerup.x,
        nearestPowerup.y,
        heatMap,
        SAFE,
      );
      if (powerupDir !== null) {
        doMove(powerupDir);
        return;
      }
    }

    if (canPlaceBomb) {
      const bricksHere = this.countDestructibleBricks(
        gameMap,
        px,
        py,
        player.fireRange,
      );

      if (bricksHere >= 1) {
        const canEscape = this.canEscapeAfterBombHeatMap(
          gameMap,
          px,
          py,
          player.fireRange,
          heatMap,
        );

        if (canEscape) {
          gameLogic.placeBomb(playerId);
          const escapeDir = this.findEscapeFromOwnBombHeatMap(
            gameMap,
            px,
            py,
            player.fireRange,
            heatMap,
          );
          if (escapeDir !== null) {
            doMove(escapeDir);
          }
          return;
        }
      }
    }

    if (availableBombs > 0 && !alreadyInDanger) {
      const bombSpot = this.findBestBombSpot(
        gameMap,
        px,
        py,
        player.fireRange,
        heatMap,
        SAFE,
      );
      if (bombSpot) {
        const moveDir = this.chaseTargetSafely(
          gameMap,
          px,
          py,
          bombSpot.x,
          bombSpot.y,
          heatMap,
          SAFE,
        );
        if (moveDir !== null) {
          doMove(moveDir);
          return;
        }
      }
    }

    if (nearestPowerup) {
      const powerupDir = this.chaseTargetSafely(
        gameMap,
        px,
        py,
        nearestPowerup.x,
        nearestPowerup.y,
        heatMap,
        SAFE,
      );
      if (powerupDir !== null) {
        doMove(powerupDir);
        return;
      }
    }

    if (accessibleTarget && accessibleTarget.bricks > 1) {
      const chaseDir = this.chaseTargetSafely(
        gameMap,
        px,
        py,
        accessibleTarget.player.x,
        accessibleTarget.player.y,
        heatMap,
        SAFE,
      );
      if (chaseDir !== null) {
        doMove(chaseDir);
        return;
      }
    }

    const nearestBrick = this.findNearestBrick(gameMap, px, py, heatMap, SAFE);
    if (nearestBrick) {
      const brickDir = this.chaseTargetSafely(
        gameMap,
        px,
        py,
        nearestBrick.x,
        nearestBrick.y,
        heatMap,
        SAFE,
      );
      if (brickDir !== null) {
        doMove(brickDir);
        return;
      }
    }

    const walkable = this.getAdjacentWalkable(gameMap, px, py);
    const lastDir = user.data.aiLastDirection.get(playerId);
    const safeWalkable = walkable.filter((w) => {
      const heat = heatMap.get(`${w.x},${w.y}`) || 0;
      if (
        lastDir !== null &&
        lastDir !== undefined &&
        w.dir === getOpposite(lastDir)
      ) {
        return heat < SAFE && walkable.length <= 2;
      }
      return heat < SAFE;
    });

    if (safeWalkable.length > 0) {
      const sameDir = safeWalkable.find((w) => w.dir === lastDir);
      if (sameDir && Math.random() < 0.6) {
        doMove(sameDir.dir);
      } else {
        const chosen =
          safeWalkable[Math.floor(Math.random() * safeWalkable.length)];
        doMove(chosen.dir);
      }
      return;
    }

    // Hard escape only when already in danger and boxed in: risk a hot tile
    // path to reach the nearest safe spot (still avoids active flames at 255).
    if (currentDanger >= SAFE) {
      const forcedEscape = this.findEscapePathThroughDanger(
        gameMap,
        px,
        py,
        heatMap,
      );
      if (forcedEscape !== null) {
        doMove(forcedEscape);
      }
    }
  }

  private static findMostAccessibleTarget(
    gameMap: GameMap,
    gameLogic: GameLogic,
    fromX: number,
    fromY: number,
    myPlayerId: number,
    heatMap: Map<string, number>,
    safeThreshold: number,
  ): {
    player: (typeof gameLogic.players)[0];
    distance: number;
    bricks: number;
  } | null {
    const candidates: Array<{
      player: (typeof gameLogic.players)[0];
      distance: number;
      bricks: number;
    }> = [];

    for (let i = 0; i < gameLogic.players.length; i++) {
      if (i === myPlayerId) continue;
      const target = gameLogic.players[i];
      if (!target || !target.alive) continue;

      const result = this.findPathWithBrickCount(
        gameMap,
        fromX,
        fromY,
        target.x,
        target.y,
        heatMap,
        safeThreshold,
      );

      if (result) {
        candidates.push({
          player: target,
          distance: result.distance,
          bricks: result.bricks,
        });
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (a.bricks !== b.bricks) return a.bricks - b.bricks;
      return a.distance - b.distance;
    });

    return candidates[0];
  }

  private static findPathWithBrickCount(
    gameMap: GameMap,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    heatMap: Map<string, number>,
    safeThreshold: number,
  ): { distance: number; bricks: number } | null {
    const queue: Array<{ x: number; y: number; dist: number; bricks: number }> =
      [{ x: fromX, y: fromY, dist: 0, bricks: 0 }];
    const visited = new Map<string, number>();
    visited.set(`${fromX},${fromY}`, 0);

    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.x === toX && current.y === toY) {
        return { distance: current.dist, bricks: current.bricks };
      }

      for (const d of dirs) {
        const nx = current.x + d.dx;
        const ny = current.y + d.dy;
        const key = `${nx},${ny}`;

        if (nx < 0 || nx >= gameMap.width || ny < 0 || ny >= gameMap.height)
          continue;

        const tile = gameMap.getTile(nx, ny);
        if (!tile || tile.type === "wall") continue;

        let newBricks = current.bricks;
        if (tile.type === "brick") {
          newBricks++;
        }

        const prevBricks = visited.get(key);
        if (prevBricks !== undefined && prevBricks <= newBricks) continue;

        visited.set(key, newBricks);

        const heat = heatMap.get(key) || 0;
        const isWalkable = gameMap.isWalkable(nx, ny);

        if (tile.type === "brick" || (isWalkable && heat < safeThreshold)) {
          queue.push({
            x: nx,
            y: ny,
            dist: current.dist + 1,
            bricks: newBricks,
          });
        }
      }
    }

    return null;
  }

  private static calculateHeatMap(gameMap: GameMap): Map<string, number> {
    const heat = new Map<string, number>();
    const setHeat = (key: string, value: number) => {
      const current = heat.get(key) || 0;
      if (value > current) {
        heat.set(key, value);
      }
    };

    for (const [key] of gameMap.explosions) {
      setHeat(key, 255);
    }

    const MAX_BOMB_TIMER = 60;
    const MIN_BOMB_DANGER = 80;
    const MAX_BOMB_DANGER = 250;

    for (const bomb of gameMap.bombs.values()) {
      setHeat(`${bomb.x},${bomb.y}`, 255);

      const timerRatio = 1 - bomb.timer / MAX_BOMB_TIMER;
      const baseDanger = Math.floor(
        MIN_BOMB_DANGER + timerRatio * (MAX_BOMB_DANGER - MIN_BOMB_DANGER),
      );

      const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
      ];

      for (const dir of directions) {
        for (let i = 1; i <= bomb.fireRange; i++) {
          const nx = bomb.x + dir.dx * i;
          const ny = bomb.y + dir.dy * i;

          if (nx < 0 || nx >= gameMap.width || ny < 0 || ny >= gameMap.height)
            break;

          const tile = gameMap.getTile(nx, ny);
          if (!tile || tile.type === "wall") break;

          setHeat(`${nx},${ny}`, baseDanger);

          if (tile.type === "brick") break;
        }
      }
    }

    return heat;
  }

  private static hasAdjacentBomb(
    gameMap: GameMap,
    x: number,
    y: number,
  ): boolean {
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (gameMap.bombs.has(`${nx},${ny}`)) {
        return true;
      }
    }
    return false;
  }

  private static findSafestDirection(
    gameMap: GameMap,
    x: number,
    y: number,
    heatMap: Map<string, number>,
  ): Direction | null {
    const dirs = [
      { dir: Direction.North, dx: 0, dy: -1 },
      { dir: Direction.South, dx: 0, dy: 1 },
      { dir: Direction.East, dx: 1, dy: 0 },
      { dir: Direction.West, dx: -1, dy: 0 },
    ];

    let bestDir: Direction | null = null;
    let lowestHeat = heatMap.get(`${x},${y}`) || 0;

    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      const key = `${nx},${ny}`;

      if (gameMap.isWalkable(nx, ny)) {
        const cellHeat = heatMap.get(key) || 0;
        if (cellHeat < lowestHeat) {
          lowestHeat = cellHeat;
          bestDir = d.dir;
        }
      }
    }

    return bestDir;
  }

  private static findEscapePathThroughDanger(
    gameMap: GameMap,
    x: number,
    y: number,
    heatMap: Map<string, number>,
  ): Direction | null {
    const SAFE_THRESHOLD = 50;
    const DEADLY_THRESHOLD = 255;

    const dirs = [
      { dir: Direction.North, dx: 0, dy: -1 },
      { dir: Direction.South, dx: 0, dy: 1 },
      { dir: Direction.East, dx: 1, dy: 0 },
      { dir: Direction.West, dx: -1, dy: 0 },
    ];

    const queue: Array<{
      cost: number;
      x: number;
      y: number;
      firstDir: Direction;
    }> = [];
    const visited = new Map<string, number>();

    visited.set(`${x},${y}`, 0);

    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      const key = `${nx},${ny}`;

      if (!gameMap.isWalkable(nx, ny)) continue;

      const cellHeat = heatMap.get(key) || 0;

      if (cellHeat >= DEADLY_THRESHOLD) continue;

      const cost = cellHeat;
      visited.set(key, cost);
      queue.push({ cost, x: nx, y: ny, firstDir: d.dir });

      if (cellHeat < SAFE_THRESHOLD) {
        return d.dir;
      }
    }

    queue.sort((a, b) => a.cost - b.cost);

    let iterations = 0;
    const maxIterations = 200;

    while (queue.length > 0 && iterations < maxIterations) {
      iterations++;
      const current = queue.shift()!;

      for (const d of dirs) {
        const nx = current.x + d.dx;
        const ny = current.y + d.dy;
        const key = `${nx},${ny}`;

        if (!gameMap.isWalkable(nx, ny)) continue;

        const cellHeat = heatMap.get(key) || 0;

        if (cellHeat >= DEADLY_THRESHOLD) continue;

        const newCost = current.cost + cellHeat;

        const existingCost = visited.get(key);
        if (existingCost !== undefined && existingCost <= newCost) continue;

        visited.set(key, newCost);

        if (cellHeat < SAFE_THRESHOLD) {
          return current.firstDir;
        }

        queue.push({ cost: newCost, x: nx, y: ny, firstDir: current.firstDir });
      }

      queue.sort((a, b) => a.cost - b.cost);
    }

    let bestDir: Direction | null = null;
    let lowestHeat = Infinity;

    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      const key = `${nx},${ny}`;

      if (gameMap.isWalkable(nx, ny)) {
        const cellHeat = heatMap.get(key) || 0;
        if (cellHeat < DEADLY_THRESHOLD && cellHeat < lowestHeat) {
          lowestHeat = cellHeat;
          bestDir = d.dir;
        }
      }
    }

    return bestDir;
  }

  private static canEscapeAfterBombHeatMap(
    gameMap: GameMap,
    x: number,
    y: number,
    fireRange: number,
    heatMap: Map<string, number>,
  ): boolean {
    const bombZone = new Set<string>();
    bombZone.add(`${x},${y}`);

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    for (const dir of directions) {
      for (let i = 1; i <= fireRange; i++) {
        const nx = x + dir.dx * i;
        const ny = y + dir.dy * i;
        if (nx < 0 || nx >= gameMap.width || ny < 0 || ny >= gameMap.height)
          break;
        const tile = gameMap.getTile(nx, ny);
        if (!tile || tile.type === "wall") break;
        bombZone.add(`${nx},${ny}`);
        if (tile.type === "brick") break;
      }
    }

    const simulatedHeat = new Map(heatMap);
    const BOMB_FLAME_DANGER = 150;

    for (const key of bombZone) {
      const currentHeat = simulatedHeat.get(key) || 0;
      simulatedHeat.set(key, Math.max(currentHeat, BOMB_FLAME_DANGER));
    }
    const bombKey = `${x},${y}`;
    simulatedHeat.set(bombKey, 255);

    const SAFE_THRESHOLD = 50;

    for (const dir of directions) {
      const startX = x + dir.dx;
      const startY = y + dir.dy;
      const startKey = `${startX},${startY}`;

      if (!gameMap.isWalkable(startX, startY)) continue;

      const startHeat = simulatedHeat.get(startKey) || 0;
      if (startHeat >= 255) continue;

      const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
      const visited = new Set<string>();
      visited.add(bombKey);
      visited.add(startKey);

      if (!bombZone.has(startKey) && startHeat < SAFE_THRESHOLD) {
        return true;
      }

      while (queue.length > 0) {
        const current = queue.shift()!;

        for (const d of directions) {
          const nx = current.x + d.dx;
          const ny = current.y + d.dy;
          const key = `${nx},${ny}`;

          if (visited.has(key)) continue;
          if (!gameMap.isWalkable(nx, ny)) continue;

          const cellHeat = simulatedHeat.get(key) || 0;
          if (cellHeat >= 255) continue;

          visited.add(key);

          if (!bombZone.has(key) && cellHeat < SAFE_THRESHOLD) {
            return true;
          }

          queue.push({ x: nx, y: ny });
        }
      }
    }

    return false;
  }

  private static findEscapeFromOwnBombHeatMap(
    gameMap: GameMap,
    x: number,
    y: number,
    fireRange: number,
    heatMap: Map<string, number>,
  ): Direction | null {
    const bombZone = new Set<string>();
    bombZone.add(`${x},${y}`);

    const directions = [
      { dir: Direction.North, dx: 0, dy: -1 },
      { dir: Direction.South, dx: 0, dy: 1 },
      { dir: Direction.East, dx: 1, dy: 0 },
      { dir: Direction.West, dx: -1, dy: 0 },
    ];

    for (const d of directions) {
      for (let i = 1; i <= fireRange; i++) {
        const nx = x + d.dx * i;
        const ny = y + d.dy * i;
        if (nx < 0 || nx >= gameMap.width || ny < 0 || ny >= gameMap.height)
          break;
        const tile = gameMap.getTile(nx, ny);
        if (!tile || tile.type === "wall") break;
        bombZone.add(`${nx},${ny}`);
        if (tile.type === "brick") break;
      }
    }

    const simulatedHeat = new Map(heatMap);
    const BOMB_FLAME_DANGER = 150;

    for (const key of bombZone) {
      const currentHeat = simulatedHeat.get(key) || 0;
      simulatedHeat.set(key, Math.max(currentHeat, BOMB_FLAME_DANGER));
    }
    const bombKey = `${x},${y}`;
    simulatedHeat.set(bombKey, 255);

    const SAFE_THRESHOLD = 50;

    const escapeDirs: Array<{ dir: Direction; cost: number }> = [];

    for (const startDir of directions) {
      const startX = x + startDir.dx;
      const startY = y + startDir.dy;
      const startKey = `${startX},${startY}`;

      if (!gameMap.isWalkable(startX, startY)) continue;

      const startHeat = simulatedHeat.get(startKey) || 0;
      if (startHeat >= 255) continue;

      const queue: Array<{ x: number; y: number; cost: number }> = [
        { x: startX, y: startY, cost: startHeat },
      ];
      const visited = new Set<string>();
      visited.add(bombKey);
      visited.add(startKey);

      if (!bombZone.has(startKey) && startHeat < SAFE_THRESHOLD) {
        escapeDirs.push({ dir: startDir.dir, cost: startHeat });
        continue;
      }

      let foundSafety = false;
      let safetyCost = Infinity;

      while (queue.length > 0 && !foundSafety) {
        const current = queue.shift()!;

        for (const d of directions) {
          const nx = current.x + d.dx;
          const ny = current.y + d.dy;
          const key = `${nx},${ny}`;

          if (visited.has(key)) continue;
          if (!gameMap.isWalkable(nx, ny)) continue;

          const cellHeat = simulatedHeat.get(key) || 0;
          if (cellHeat >= 255) continue;

          visited.add(key);
          const newCost = current.cost + cellHeat;

          if (!bombZone.has(key) && cellHeat < SAFE_THRESHOLD) {
            foundSafety = true;
            safetyCost = newCost;
            break;
          }

          queue.push({ x: nx, y: ny, cost: newCost });
        }
      }

      if (foundSafety) {
        escapeDirs.push({ dir: startDir.dir, cost: safetyCost });
      }
    }

    if (escapeDirs.length > 0) {
      escapeDirs.sort((a, b) => a.cost - b.cost);
      return escapeDirs[0].dir;
    }

    let bestDir: Direction | null = null;
    let lowestHeat = Infinity;

    for (const d of directions) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      const key = `${nx},${ny}`;

      if (gameMap.isWalkable(nx, ny)) {
        const cellHeat = simulatedHeat.get(key) || 0;
        if (cellHeat < 255 && cellHeat < lowestHeat) {
          lowestHeat = cellHeat;
          bestDir = d.dir;
        }
      }
    }

    return bestDir;
  }

  private static chaseTargetSafely(
    gameMap: GameMap,
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    heatMap: Map<string, number>,
    safeThreshold: number,
  ): Direction | null {
    const queue: Array<{ x: number; y: number; firstDir: Direction | null }> =
      [];
    const visited = new Set<string>();

    const dirs = [
      { dir: Direction.North, dx: 0, dy: -1 },
      { dir: Direction.South, dx: 0, dy: 1 },
      { dir: Direction.East, dx: 1, dy: 0 },
      { dir: Direction.West, dx: -1, dy: 0 },
    ];

    visited.add(`${startX},${startY}`);

    for (const d of dirs) {
      const nx = startX + d.dx;
      const ny = startY + d.dy;
      const key = `${nx},${ny}`;

      const cellHeat = heatMap.get(key) || 0;
      if (
        gameMap.isWalkable(nx, ny) &&
        !visited.has(key) &&
        cellHeat < safeThreshold
      ) {
        visited.add(key);
        if (nx === targetX && ny === targetY) {
          return d.dir;
        }
        queue.push({ x: nx, y: ny, firstDir: d.dir });
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const d of dirs) {
        const nx = current.x + d.dx;
        const ny = current.y + d.dy;
        const key = `${nx},${ny}`;

        const cellHeat = heatMap.get(key) || 0;
        if (
          gameMap.isWalkable(nx, ny) &&
          !visited.has(key) &&
          cellHeat < safeThreshold
        ) {
          visited.add(key);
          if (nx === targetX && ny === targetY) {
            return current.firstDir;
          }
          queue.push({ x: nx, y: ny, firstDir: current.firstDir });
        }
      }
    }

    return null;
  }

  private static countDestructibleBricks(
    gameMap: GameMap,
    x: number,
    y: number,
    fireRange: number,
  ): number {
    let count = 0;

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    for (const dir of directions) {
      for (let i = 1; i <= fireRange; i++) {
        const nx = x + dir.dx * i;
        const ny = y + dir.dy * i;

        if (nx < 0 || nx >= gameMap.width || ny < 0 || ny >= gameMap.height) {
          break;
        }

        const tile = gameMap.getTile(nx, ny);
        if (!tile || tile.type === "wall") {
          break;
        }

        if (tile.type === "brick") {
          count++;
          break;
        }
      }
    }

    return count;
  }

  private static wouldHitPlayer(
    gameMap: GameMap,
    x: number,
    y: number,
    fireRange: number,
    tx: number,
    ty: number,
  ): boolean {
    if (x === tx && y === ty) return true;

    if (y === ty && Math.abs(x - tx) <= fireRange) {
      const dx = tx > x ? 1 : -1;
      for (let i = 1; i <= Math.abs(tx - x); i++) {
        const tile = gameMap.getTile(x + dx * i, y);
        if (!tile || tile.type === "wall") return false;
        if (x + dx * i === tx) return true;
        if (tile.type === "brick") return false;
      }
    }

    if (x === tx && Math.abs(y - ty) <= fireRange) {
      const dy = ty > y ? 1 : -1;
      for (let i = 1; i <= Math.abs(ty - y); i++) {
        const tile = gameMap.getTile(x, y + dy * i);
        if (!tile || tile.type === "wall") return false;
        if (y + dy * i === ty) return true;
        if (tile.type === "brick") return false;
      }
    }

    return false;
  }

  private static getAdjacentWalkable(
    gameMap: GameMap,
    x: number,
    y: number,
  ): Array<{ dir: Direction; x: number; y: number }> {
    const result: Array<{ dir: Direction; x: number; y: number }> = [];
    const dirs = [
      { dir: Direction.North, dx: 0, dy: -1 },
      { dir: Direction.South, dx: 0, dy: 1 },
      { dir: Direction.East, dx: 1, dy: 0 },
      { dir: Direction.West, dx: -1, dy: 0 },
    ];
    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (gameMap.isWalkable(nx, ny)) {
        result.push({ dir: d.dir, x: nx, y: ny });
      }
    }
    return result;
  }

  private static findNearestPowerup(
    gameMap: GameMap,
    startX: number,
    startY: number,
    heatMap: Map<string, number>,
    safeThreshold: number,
  ): { x: number; y: number; distance: number } | null {
    const queue: Array<{ x: number; y: number; dist: number }> = [];
    const visited = new Set<string>();

    visited.add(`${startX},${startY}`);

    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    const startTile = gameMap.getTile(startX, startY);
    if (startTile?.type === "powerup") {
      return { x: startX, y: startY, distance: 0 };
    }

    for (const d of dirs) {
      const nx = startX + d.dx;
      const ny = startY + d.dy;
      const key = `${nx},${ny}`;
      if (!visited.has(key) && gameMap.isWalkable(nx, ny)) {
        const heat = heatMap.get(key) || 0;
        if (heat < safeThreshold) {
          visited.add(key);
          const tile = gameMap.getTile(nx, ny);
          if (tile?.type === "powerup") {
            return { x: nx, y: ny, distance: 1 };
          }
          queue.push({ x: nx, y: ny, dist: 1 });
        }
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.dist > 15) continue;

      for (const d of dirs) {
        const nx = current.x + d.dx;
        const ny = current.y + d.dy;
        const key = `${nx},${ny}`;

        if (!visited.has(key) && gameMap.isWalkable(nx, ny)) {
          const heat = heatMap.get(key) || 0;
          if (heat < safeThreshold) {
            visited.add(key);
            const tile = gameMap.getTile(nx, ny);
            if (tile?.type === "powerup") {
              return { x: nx, y: ny, distance: current.dist + 1 };
            }
            queue.push({ x: nx, y: ny, dist: current.dist + 1 });
          }
        }
      }
    }

    return null;
  }

  private static findNearestBrick(
    gameMap: GameMap,
    startX: number,
    startY: number,
    heatMap: Map<string, number>,
    safeThreshold: number,
  ): { x: number; y: number; distance: number } | null {
    const queue: Array<{ x: number; y: number; dist: number }> = [];
    const visited = new Set<string>();

    visited.add(`${startX},${startY}`);

    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    for (const d of dirs) {
      const nx = startX + d.dx;
      const ny = startY + d.dy;
      const key = `${nx},${ny}`;

      const tile = gameMap.getTile(nx, ny);
      if (tile?.type === "brick") {
        return { x: startX, y: startY, distance: 0 };
      }

      if (!visited.has(key) && gameMap.isWalkable(nx, ny)) {
        const heat = heatMap.get(key) || 0;
        if (heat < safeThreshold) {
          visited.add(key);
          queue.push({ x: nx, y: ny, dist: 1 });
        }
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.dist > 20) continue;

      for (const d of dirs) {
        const nx = current.x + d.dx;
        const ny = current.y + d.dy;
        const key = `${nx},${ny}`;

        const tile = gameMap.getTile(nx, ny);
        if (tile?.type === "brick") {
          return { x: current.x, y: current.y, distance: current.dist };
        }

        if (!visited.has(key) && gameMap.isWalkable(nx, ny)) {
          const heat = heatMap.get(key) || 0;
          if (heat < safeThreshold) {
            visited.add(key);
            queue.push({ x: nx, y: ny, dist: current.dist + 1 });
          }
        }
      }
    }

    return null;
  }

  private static findBestBombSpot(
    gameMap: GameMap,
    startX: number,
    startY: number,
    fireRange: number,
    heatMap: Map<string, number>,
    safeThreshold: number,
  ): { x: number; y: number; bricks: number } | null {
    const queue: Array<{ x: number; y: number; dist: number }> = [];
    const visited = new Set<string>();
    let bestSpot: { x: number; y: number; bricks: number } | null = null;

    visited.add(`${startX},${startY}`);

    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    const bricksHere = this.countDestructibleBricks(
      gameMap,
      startX,
      startY,
      fireRange,
    );
    if (bricksHere >= 1) {
      bestSpot = { x: startX, y: startY, bricks: bricksHere };
    }

    for (const d of dirs) {
      const nx = startX + d.dx;
      const ny = startY + d.dy;
      const key = `${nx},${ny}`;

      if (!visited.has(key) && gameMap.isWalkable(nx, ny)) {
        const heat = heatMap.get(key) || 0;
        if (heat < safeThreshold) {
          visited.add(key);
          const bricks = this.countDestructibleBricks(
            gameMap,
            nx,
            ny,
            fireRange,
          );
          if (bricks >= 1 && (!bestSpot || bricks > bestSpot.bricks)) {
            bestSpot = { x: nx, y: ny, bricks };
          }
          queue.push({ x: nx, y: ny, dist: 1 });
        }
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.dist > 6) continue;

      for (const d of dirs) {
        const nx = current.x + d.dx;
        const ny = current.y + d.dy;
        const key = `${nx},${ny}`;

        if (!visited.has(key) && gameMap.isWalkable(nx, ny)) {
          const heat = heatMap.get(key) || 0;
          if (heat < safeThreshold) {
            visited.add(key);
            const bricks = this.countDestructibleBricks(
              gameMap,
              nx,
              ny,
              fireRange,
            );
            if (bricks >= 1 && (!bestSpot || bricks > bestSpot.bricks)) {
              bestSpot = { x: nx, y: ny, bricks };
            }
            queue.push({ x: nx, y: ny, dist: current.dist + 1 });
          }
        }
      }
    }

    if (bestSpot && (bestSpot.x !== startX || bestSpot.y !== startY)) {
      return bestSpot;
    }
    return null;
  }
}
