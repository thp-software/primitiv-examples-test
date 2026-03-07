/**
 * Name: showcase-02-dungeon
 * Category: showcase
 * Description: A minimalist top-down dungeon crawler with procedurally generated
 *   rooms and corridors. Demonstrates how to build a standalone game engine class
 *   (DungeonEngine) that has zero dependency on Primitiv, then wrap it with a
 *   thin IApplication adapter - the same pattern used by VoxelEngine in
 *   showcase-3d-02-primitiv-craft.
 *
 * Architecture:
 *   1. DungeonEngine - Pure TypeScript class. Handles:
 *        - Procedural room placement constrained to 80x35 screen boundaries
 *        - Minimum Spanning Tree (MST) corridor carving between rooms
 *        - Dead-end detection and 'LockedDoor' generation
 *        - Collision-aware player movement with time-based fading trails
 *        - Randomized Gold (Loot) spawning and score tracking
 *      It exposes a flat Tile grid that the renderer can read each frame.
 *
 *   2. DungeonApp - Primitiv IApplication wrapper. Handles:
 *        - Palette, Display, Layer setup
 *        - 20Hz TickRate for a snappy, retro feel (with 100ms movement delays)
 *        - Keyboard input bindings (WASD / Arrows)
 *        - Rendering the DungeonEngine grid via OrderBuilder.bitmask16
 *          (4-bit array rendering, one order for the entire map)
 *        - Rendering the player, loot, and fading trails on a separate Z-layer
 *          using OrderBuilder.dotCloudMulti
 *
 * Key Primitiv Concepts demonstrated:
 *   - Multi-layer rendering with Z-stacking (map z0, entities z1, UI z2)
 *   - OrderBuilder.bitmask16 for highly compressed, dense background rendering
 *   - OrderBuilder.dotCloudMulti for batched, multi-color particle rendering
 *   - mustBeReliable: true for static map + UI, false for fast entity updates
 *   - Input binding registry for keyboard controls
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  InputDeviceType,
  KeyboardInput,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

// ═══════════════════════════════════════════════════════════════════════════════
// DUNGEON ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const Tile = {
  Void: 0,
  Wall: 1,
  Floor: 2,
  Corridor: 3,
  Door: 4,
  LockedDoor: 5,
} as const;
type Tile = (typeof Tile)[keyof typeof Tile];

/** A rectangular room inside the dungeon. */
interface Room {
  x: number; // Top-left column of the FLOOR area
  y: number; // Top-left row of the FLOOR area
  w: number; // Floor width (excluding walls)
  h: number; // Floor height (excluding walls)
  cx: number; // Center X coordinate
  cy: number; // Center Y coordinate
  connections: number; // For identifying dead ends (leaf nodes in MST)
}

/**
 * Dungeon generator using the "carve from solid" approach.
 *
 * 1. Start: entire grid = Wall.
 * 2. Place rooms by carving rectangular Floor regions (with 1-tile wall border).
 * 3. Connect consecutive rooms with L-shaped, 1-wide corridors.
 * 4. Post-pass: place Doors only at strict room entry points.
 */
class DungeonEngine {
  /** Map width in tiles */
  readonly w: number;
  /** Map height in tiles */
  readonly h: number;
  readonly screenW: number;
  readonly screenH: number;

  /** 2D grid storing the layout. Exposed directly for rendering. */
  readonly grid: Tile[][];
  /** List of all generated rooms */
  readonly rooms: Room[] = [];

  /** Player X position */
  px = 0;
  /** Player Y position */
  py = 0;

  /** Current Score */
  score = 0;
  /** Loot items */
  readonly loot: { x: number; y: number }[] = [];
  /** Fading trail of past positions (life based on frames) */
  readonly trail: { x: number; y: number; life: number }[] = [];

  constructor(w: number, h: number, screenW: number = w, screenH: number = h) {
    this.w = w;
    this.h = h;
    this.screenW = screenW;
    this.screenH = screenH;
    this.grid = [];
    for (let y = 0; y < h; y++) {
      this.grid[y] = new Array(w).fill(Tile.Wall);
    } // starts as solid rock; stripped after generation
  }

  generate(count: number, seed?: number): void {
    const r = this.rng(seed);

    // 1 - Place rooms
    let tries = 0;
    while (this.rooms.length < count && tries < count * 40) {
      tries++;
      const rw = 4 + Math.floor(r() * 6); // 4–9
      const rh = 3 + Math.floor(r() * 4); // 3–6
      const rx = 2 + Math.floor(r() * (this.w - rw - 4));
      const ry = 2 + Math.floor(r() * (this.h - rh - 4));
      if (this.fits(rx, ry, rw, rh)) {
        this.dig(rx, ry, rw, rh);
      }
    }

    // 2 - Connect rooms (Minimum Spanning Tree - Prim's Algorithm)
    if (this.rooms.length > 1) {
      const connected: Room[] = [this.rooms[0]];
      const unconnected: Room[] = this.rooms.slice(1);

      while (unconnected.length > 0) {
        let bestDist = Infinity;
        let bestConnIdx = 0;
        let bestUnconnIdx = 0;

        // Find the closest pair of connected and unconnected rooms
        for (let i = 0; i < connected.length; i++) {
          const roomA = connected[i];
          for (let j = 0; j < unconnected.length; j++) {
            const roomB = unconnected[j];
            // Manhattan distance between centers
            const dist =
              Math.abs(roomA.cx - roomB.cx) + Math.abs(roomA.cy - roomB.cy);
            if (dist < bestDist) {
              bestDist = dist;
              bestConnIdx = i;
              bestUnconnIdx = j;
            }
          }
        }

        // Connect the closest pair
        this.connect(connected[bestConnIdx], unconnected[bestUnconnIdx], r);

        // Move the newly connected room to the connected list
        connected.push(unconnected[bestUnconnIdx]);
        unconnected.splice(bestUnconnIdx, 1);
      }
    }

    // 3 - Place doors
    this.doors();

    // 4 - Strip bulk walls (keep only perimeter walls)
    this.stripBulk();

    // 5 - Lock dead ends (rooms with only 1 connection)
    this.lockDeadEnds(r);

    // 6 - Spawn & Loot
    if (this.rooms.length > 0) {
      this.px = this.rooms[0].cx;
      this.py = this.rooms[0].cy;

      // Spawn 1-3 gold items per room
      for (let i = 0; i < this.rooms.length; i++) {
        const room = this.rooms[i];
        const lootCount = 1 + Math.floor(r() * 3);
        for (let j = 0; j < lootCount; j++) {
          const lx = room.x + Math.floor(r() * room.w);
          const ly = room.y + Math.floor(r() * room.h);
          // Don't spawn on top of the player's start position
          if (lx !== this.px || ly !== this.py) {
            this.loot.push({ x: lx, y: ly });
          }
        }
      }
    }
  }

  move(dx: number, dy: number): boolean {
    const nx = this.px + dx,
      ny = this.py + dy;
    if (nx < 0 || nx >= this.w || ny < 0 || ny >= this.h) return false;
    const t = this.grid[ny][nx];
    // LockedDoor acts like a Wall
    if (t !== Tile.Wall && t !== Tile.Void && t !== Tile.LockedDoor) {
      // Push current position to trail (starts with 7 frames of life ~350ms at 20Hz)
      this.trail.unshift({ x: this.px, y: this.py, life: 7 });

      this.px = nx;
      this.py = ny;

      // Check loot collection (backward loop to safely remove multiple stacked items)
      for (let i = this.loot.length - 1; i >= 0; i--) {
        if (this.loot[i].x === nx && this.loot[i].y === ny) {
          this.loot.splice(i, 1);
          this.score += 10;
        }
      }

      return true;
    }
    return false;
  }

  tick(): void {
    // Fade trails over time
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life--;
      if (this.trail[i].life <= 0) {
        this.trail.splice(i, 1);
      }
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────

  /**
   * Creates a seeded pseudo-random number generator (Mulberry32).
   * Ensures dungeon generation is deterministic if a seed is provided.
   */
  private rng(seed?: number): () => number {
    let s = seed ?? Date.now() | 0;
    return () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Does a room + 1 tile border fit without touching another room's floor or crossing a screen boundary? */
  private fits(x: number, y: number, w: number, h: number): boolean {
    // Check map bounding with 1-tile margin
    if (x - 1 < 1 || y - 1 < 1 || x + w >= this.w - 1 || y + h >= this.h - 1)
      return false;

    // Ensure the room (including its 1-tile outer wall) doesn't cross a screen boundary chunk.
    // Screen bounds are defined by multiples of screenW and screenH.
    const startChunkX = Math.floor((x - 1) / this.screenW);
    const endChunkX = Math.floor((x + w) / this.screenW);
    if (startChunkX !== endChunkX) return false;

    const startChunkY = Math.floor((y - 1) / this.screenH);
    const endChunkY = Math.floor((y + h) / this.screenH);
    if (startChunkY !== endChunkY) return false;

    // Check every cell in the expanded rect; no Floor allowed
    for (let cy = y - 2; cy < y + h + 2; cy++) {
      for (let cx = x - 2; cx < x + w + 2; cx++) {
        if (cx >= 0 && cx < this.w && cy >= 0 && cy < this.h) {
          if (this.grid[cy][cx] === Tile.Floor) return false;
        }
      }
    }
    return true;
  }

  /** Carve a rectangular room. */
  private dig(x: number, y: number, w: number, h: number): void {
    this.rooms.push({
      x,
      y,
      w,
      h,
      cx: (x + (x + w - 1)) >> 1,
      cy: (y + (y + h - 1)) >> 1,
      connections: 0,
    });
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        this.grid[ry][rx] = Tile.Floor;
      }
    }
  }

  /** L-shaped corridor between two room centers. */
  private connect(a: Room, b: Room, r: () => number): void {
    a.connections++;
    b.connections++;
    if (r() < 0.5) {
      this.hTunnel(a.cx, b.cx, a.cy);
      this.vTunnel(a.cy, b.cy, b.cx);
    } else {
      this.vTunnel(a.cy, b.cy, a.cx);
      this.hTunnel(a.cx, b.cx, b.cy);
    }
  }

  private hTunnel(x1: number, x2: number, y: number): void {
    const lo = Math.min(x1, x2),
      hi = Math.max(x1, x2);
    for (let x = lo; x <= hi; x++) {
      if (this.grid[y][x] === Tile.Wall) this.grid[y][x] = Tile.Corridor;
    }
  }

  private vTunnel(y1: number, y2: number, x: number): void {
    const lo = Math.min(y1, y2),
      hi = Math.max(y1, y2);
    for (let y = lo; y <= hi; y++) {
      if (this.grid[y][x] === Tile.Wall) this.grid[y][x] = Tile.Corridor;
    }
  }

  /**
   * Strict door placement.
   * A Corridor tile becomes a Door only if it sits in a 1-wide gap in a wall:
   *   vertical gap:   Wall left + Wall right, Floor or Corridor above or below
   *   horizontal gap: Wall above + Wall below, Floor or Corridor left or right
   * AND at least one of the walkable neighbours is Floor (not just corridor).
   */
  private doors(): void {
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (this.grid[y][x] !== Tile.Corridor) continue;

        const u = this.grid[y - 1][x];
        const d = this.grid[y + 1][x];
        const l = this.grid[y][x - 1];
        const r = this.grid[y][x + 1];

        const walk = (t: Tile) => t === Tile.Floor || t === Tile.Corridor;
        const isFloor = (t: Tile) => t === Tile.Floor;

        // Vertical passage: walls left & right, walkable up & down, at least one Floor
        const vert =
          l === Tile.Wall &&
          r === Tile.Wall &&
          walk(u) &&
          walk(d) &&
          (isFloor(u) || isFloor(d));
        // Horizontal passage: walls up & down, walkable left & right, at least one Floor
        const horz =
          u === Tile.Wall &&
          d === Tile.Wall &&
          walk(l) &&
          walk(r) &&
          (isFloor(l) || isFloor(r));

        if (vert || horz) this.grid[y][x] = Tile.Door;
      }
    }
  }

  /** Remove any Wall tile that is NOT adjacent (8-dir) to a walkable tile. */
  private stripBulk(): void {
    const walkable = (t: Tile) =>
      t === Tile.Floor || t === Tile.Corridor || t === Tile.Door;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.grid[y][x] !== Tile.Wall) continue;
        let keep = false;
        for (let dy = -1; dy <= 1 && !keep; dy++) {
          for (let dx = -1; dx <= 1 && !keep; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx,
              ny = y + dy;
            if (
              nx >= 0 &&
              nx < this.w &&
              ny >= 0 &&
              ny < this.h &&
              walkable(this.grid[ny][nx])
            ) {
              keep = true;
            }
          }
        }
        if (!keep) this.grid[y][x] = Tile.Void;
      }
    }
  }

  /** Find dead-end rooms (connections === 1), and occasionally lock them. */
  private lockDeadEnds(r: () => number): void {
    // Skip room 0 since it is the player's spawn and we must not lock the player in.
    for (let i = 1; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      // Only consider pure leaf nodes in the MST with 1 single entry
      if (room.connections === 1) {
        // ~30% chance to lock a dead-end room
        if (r() < 0.3) {
          // Lock all doors found on the immediate border of the room
          for (let y = room.y - 1; y <= room.y + room.h; y++) {
            for (let x = room.x - 1; x <= room.x + room.w; x++) {
              if (y >= 0 && y < this.h && x >= 0 && x < this.w) {
                if (this.grid[y][x] === Tile.Door) {
                  this.grid[y][x] = Tile.LockedDoor;
                }
              }
            }
          }
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRIMITIV APPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

// --- CONSTANTS ---
const SCREEN_W = 80;
const SCREEN_H = 35;
const MAP_W = SCREEN_W * 3; // 240
const MAP_H = SCREEN_H * 3; // 105
const DISPLAY_W = 80;
const DISPLAY_H = 40;
const MAP_OFFSET_Y = 4; // Shift map down to leave room for the top UI bar

/** Visual mapping: Tile → { char, fg color } */
const TILE_VIS: Record<Tile, { ch: string; fg: number }> = {
  [Tile.Void]: { ch: " ", fg: 0 },
  [Tile.Wall]: { ch: "#", fg: 1 },
  [Tile.Floor]: { ch: ".", fg: 3 },
  [Tile.Corridor]: { ch: ".", fg: 5 },
  [Tile.Door]: { ch: "+", fg: 4 },
  [Tile.LockedDoor]: { ch: "X", fg: 12 }, // New custom visual for Locked
};

export class DungeonApp implements IApplication<Engine, User<any>> {
  name = "Dungeon Crawler";
  description = "A minimalist top-down dungeon crawler with procedural rooms.";
  private readonly isPreview: boolean;

  constructor(isPreview: boolean = false) {
    this.isPreview = isPreview;
  }

  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 10, g: 10, b: 15, a: 255 }, // 0  BG
      { colorId: 1, r: 120, g: 110, b: 130, a: 255 }, // 1  Wall
      { colorId: 2, r: 60, g: 220, b: 80, a: 255 }, // 2  Player
      { colorId: 3, r: 70, g: 65, b: 55, a: 255 }, // 3  Floor
      { colorId: 4, r: 200, g: 160, b: 60, a: 255 }, // 4  Door
      { colorId: 5, r: 50, g: 48, b: 42, a: 255 }, // 5  Corridor
      { colorId: 6, r: 200, g: 200, b: 220, a: 255 }, // 6  UI text
      { colorId: 7, r: 20, g: 18, b: 25, a: 255 }, // 7  UI bar BG
      { colorId: 8, r: 255, g: 215, b: 0, a: 255 }, // 8  Gold (Loot)
      { colorId: 9, r: 15, g: 90, b: 40, a: 255 }, // 9  Trail 1
      { colorId: 10, r: 12, g: 60, b: 25, a: 255 }, // 10 Trail 2
      { colorId: 11, r: 5, g: 30, b: 15, a: 255 }, // 11 Trail 3
      { colorId: 12, r: 200, g: 30, b: 30, a: 255 }, // 12 Locked Door Red
    ]);
    runtime.setTickRate(20);
  }

  initUser(_runtime: IRuntime, _engine: Engine, user: User<any>): void {
    // Create Display and configure 4 Z-Layers.
    const display = new Display(0, DISPLAY_W, DISPLAY_H);
    user.addDisplay(display);
    display.switchPalette(0);
    display.setRenderPasses([{ id: 0, zMin: 0, zMax: 3 }]);

    // Z0: Static Map (Reliable)
    const mapLayer = new Layer(new Vector2(0, 0), 0, DISPLAY_W, DISPLAY_H, {
      mustBeReliable: true,
    });
    // Z1: Dynamic Entities (Player, Loot, Trails) (Unreliable for speed)
    const entityLayer = new Layer(new Vector2(0, 0), 1, DISPLAY_W, DISPLAY_H, {
      mustBeReliable: false,
    });
    // Z2: Static UI (Reliable) - drawn once
    const uiLayer = new Layer(new Vector2(0, 0), 2, DISPLAY_W, DISPLAY_H, {
      mustBeReliable: true,
    });
    // Z3: Dynamic UI values (Unreliable) - score/position updates
    const uiDynamicLayer = new Layer(
      new Vector2(0, 0),
      3,
      DISPLAY_W,
      DISPLAY_H,
      { mustBeReliable: false },
    );

    user.addLayer(mapLayer);
    user.addLayer(entityLayer);
    user.addLayer(uiLayer);
    user.addLayer(uiDynamicLayer);

    // Input Bindings: Use WASD or Arrow Keys for 4-way movement
    const reg = user.getInputBindingRegistry();
    reg.defineButton(0, "UP", [
      {
        sourceId: 1,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ArrowUp,
      },
      { sourceId: 2, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyW },
    ]);
    reg.defineButton(1, "DOWN", [
      {
        sourceId: 3,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ArrowDown,
      },
      { sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyS },
    ]);
    reg.defineButton(2, "LEFT", [
      {
        sourceId: 5,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ArrowLeft,
      },
      { sourceId: 6, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyA },
    ]);
    reg.defineButton(3, "RIGHT", [
      {
        sourceId: 7,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ArrowRight,
      },
      { sourceId: 8, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyD },
    ]);

    // Generate massive map
    const dungeon = new DungeonEngine(MAP_W, MAP_H, SCREEN_W, SCREEN_H);
    dungeon.generate(30);

    const chunkX = Math.floor(dungeon.px / SCREEN_W);
    const chunkY = Math.floor(dungeon.py / SCREEN_H);
    this.drawMap(dungeon, mapLayer, chunkX, chunkY);

    // Draw static UI once (never redrawn)
    const uo: any[] = [];
    uo.push(OrderBuilder.rect(0, 0, DISPLAY_W, 3, " ", 6, 7, true));
    uo.push(OrderBuilder.text(2, 1, "DUNGEON CRAWLER", 6, 7));
    uo.push(OrderBuilder.rect(0, DISPLAY_H - 2, DISPLAY_W, 2, " ", 6, 7, true));
    uo.push(OrderBuilder.text(2, DISPLAY_H - 1, "WASD / Arrows to move", 6, 7));
    uiLayer.setOrders(uo);


    user.data = {
      dungeon,
      mapLayer,
      entityLayer,
      uiLayer,
      uiDynamicLayer,
      lastMove: 0,
      chunkX,
      chunkY,
      lastScore: -1,
      lastPx: -1,
      lastPy: -1,
    };
  }

  private drawMap(
    engine: DungeonEngine,
    layer: Layer,
    chunkX: number,
    chunkY: number,
  ): void {
    const mask = new Uint8Array(SCREEN_W * SCREEN_H);
    const startX = chunkX * SCREEN_W;
    const startY = chunkY * SCREEN_H;
    let idx = 0;

    for (let y = startY; y < startY + SCREEN_H; y++) {
      for (let x = startX; x < startX + SCREEN_W; x++) {
        mask[idx++] = engine.grid[y][x];
      }
    }

    layer.setOrders([
      OrderBuilder.fill(" ", 0, 0), // Background backdrop
      OrderBuilder.bitmask16(0, MAP_OFFSET_Y, SCREEN_W, SCREEN_H, mask, [
        { char: TILE_VIS[Tile.Wall].ch, fg: TILE_VIS[Tile.Wall].fg, bg: 0 },
        { char: TILE_VIS[Tile.Floor].ch, fg: TILE_VIS[Tile.Floor].fg, bg: 0 },
        {
          char: TILE_VIS[Tile.Corridor].ch,
          fg: TILE_VIS[Tile.Corridor].fg,
          bg: 0,
        },
        { char: TILE_VIS[Tile.Door].ch, fg: TILE_VIS[Tile.Door].fg, bg: 0 },
        {
          char: TILE_VIS[Tile.LockedDoor].ch,
          fg: TILE_VIS[Tile.LockedDoor].fg,
          bg: 0,
        },
      ]),
    ]);

  }

  /**
   * Auto-playing AI: finds the shortest path to the *nearest* accessible loot
   * using a simple Breadth-First Search (BFS).
   * Returns { dx, dy } for the next 1-tile step.
   */
  private findNextMoveToNearestLoot(dg: DungeonEngine): { dx: number; dy: number } {
    if (dg.loot.length === 0) return { dx: 0, dy: 0 };

    // Represents a node in the BFS queue
    interface Node {
      x: number;
      y: number;
      dx: number; // The very first step taken to reach this branch
      dy: number;
    }

    const queue: Node[] = [];
    const visited = new Set<string>();

    const startKey = `${dg.px},${dg.py}`;
    visited.add(startKey);

    // Initial 4 directions
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];

    for (const d of dirs) {
      const nx = dg.px + d.dx;
      const ny = dg.py + d.dy;
      if (nx >= 0 && nx < dg.w && ny >= 0 && ny < dg.h) {
        const t = dg.grid[ny][nx];
        // Can't walk on walls or locked doors
        if (t !== Tile.Wall && t !== Tile.Void && t !== Tile.LockedDoor) {
          queue.push({ x: nx, y: ny, dx: d.dx, dy: d.dy });
          visited.add(`${nx},${ny}`);
        }
      }
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;

      // Check if we reached ANY loot
      for (const item of dg.loot) {
        if (item.x === curr.x && item.y === curr.y) {
          // Found the closest loot! Return the *first* step we took on this path
          return { dx: curr.dx, dy: curr.dy };
        }
      }

      // Expand neighbors
      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        const key = `${nx},${ny}`;

        if (
          !visited.has(key) &&
          nx >= 0 &&
          nx < dg.w &&
          ny >= 0 &&
          ny < dg.h
        ) {
          const t = dg.grid[ny][nx];
          if (t !== Tile.Wall && t !== Tile.Void && t !== Tile.LockedDoor) {
            visited.add(key);
            queue.push({ x: nx, y: ny, dx: curr.dx, dy: curr.dy }); // carry forward the FIRST step
          }
        }
      }
    }

    // No path found (maybe isolated? or no loot left)
    return { dx: 0, dy: 0 };
  }

  update(_runtime: IRuntime, _engine: Engine): void { }

  updateUser(_runtime: IRuntime, _engine: Engine, user: User<any>): void {
    const d = user.data;
    const dg: DungeonEngine = d.dungeon;

    // Process engine logic (trail fading)
    dg.tick();

    // Input
    const now = Date.now();
    // 100ms motion delay matches exactly 2 frames at 20Hz (50ms per frame)
    if (now - d.lastMove > 100) {
      let dx = 0,
        dy = 0;

      if (this.isPreview) {
        // AI Autoplay
        const aiMove = this.findNextMoveToNearestLoot(dg);
        dx = aiMove.dx;
        dy = aiMove.dy;
      } else {
        // Manual Input
        if (user.getButton("UP")) dy = -1;
        else if (user.getButton("DOWN")) dy = 1;
        else if (user.getButton("LEFT")) dx = -1;
        else if (user.getButton("RIGHT")) dx = 1;
      }

      if ((dx || dy) && dg.move(dx, dy)) d.lastMove = now;
    }

    // Detect screen chunk transitions
    const newChunkX = Math.floor(dg.px / SCREEN_W);
    const newChunkY = Math.floor(dg.py / SCREEN_H);

    if (newChunkX !== d.chunkX || newChunkY !== d.chunkY) {
      d.chunkX = newChunkX;
      d.chunkY = newChunkY;
      this.drawMap(dg, d.mapLayer, d.chunkX, d.chunkY);
    }

    // Entity layer (player, loot, trail) relative to the screen chunk
    const eo: any[] = [];
    eo.push(OrderBuilder.fill(" ", 255, 255));

    // Draw Loot (Only items on the current screen chunk)
    const lootDots = [];
    for (let i = 0; i < dg.loot.length; i++) {
      const item = dg.loot[i];
      const lx = item.x - d.chunkX * SCREEN_W;
      const ly = item.y - d.chunkY * SCREEN_H;
      if (lx >= 0 && lx < SCREEN_W && ly >= 0 && ly < SCREEN_H) {
        lootDots.push({ x: lx, y: MAP_OFFSET_Y + ly, char: "$", fg: 8, bg: 0 });
      }
    }
    if (lootDots.length > 0) eo.push(OrderBuilder.dotCloudMulti(lootDots));

    // Draw Trails (Only items on the current screen chunk)
    const trailDots = [];
    for (let i = 0; i < dg.trail.length; i++) {
      const tr = dg.trail[i];
      const tx = tr.x - d.chunkX * SCREEN_W;
      const ty = tr.y - d.chunkY * SCREEN_H;
      if (tx >= 0 && tx < SCREEN_W && ty >= 0 && ty < SCREEN_H) {
        // Determine trail color based on remaining life
        let c = 9;
        if (tr.life < 5) c = 10;
        if (tr.life < 3) c = 11;
        trailDots.push({
          x: tx,
          y: MAP_OFFSET_Y + ty,
          char: "+",
          fg: c,
          bg: 0,
        });
      }
    }
    if (trailDots.length > 0) eo.push(OrderBuilder.dotCloudMulti(trailDots));

    // Draw Player
    const localPx = dg.px - d.chunkX * SCREEN_W;
    const localPy = dg.py - d.chunkY * SCREEN_H;
    eo.push(OrderBuilder.text(localPx, MAP_OFFSET_Y + localPy, "@", 2, 255));

    d.entityLayer.setOrders(eo);


    // Dynamic UI layer - only update when score or position changes
    if (d.lastScore !== dg.score || d.lastPx !== dg.px || d.lastPy !== dg.py) {
      d.lastScore = dg.score;
      d.lastPx = dg.px;
      d.lastPy = dg.py;
      const info = `Pos ${dg.px},${dg.py}  Score ${dg.score} ${this.isPreview ? '[PREVIEW]' : ''} `;
      d.uiDynamicLayer.setOrders([
        OrderBuilder.rect(
          DISPLAY_W - info.length - 3,
          0,
          info.length + 2,
          3,
          " ",
          6,
          7,
          true,
        ),
        OrderBuilder.text(DISPLAY_W - info.length - 2, 1, info, 8, 7),
      ]);

    }
  }
}
