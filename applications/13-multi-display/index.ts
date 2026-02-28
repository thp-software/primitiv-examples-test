/**
 * Name: multi-display
 * Description: One application driving two independent Display surfaces simultaneously.
 *
 * Why study this:
 *   Primitiv supports multiple Displays per user. Each Display is fully independent:
 *   it has its own size, its own canvas, and a configurable world-space origin. A
 *   single engine tick synchronizes them all — the host mounts each canvas side-by-side.
 *
 *   This example demonstrates the most compelling multi-display use case: a seamless
 *   world split across two physical screens. Both displays share the same coordinate
 *   space. Entities that reach the right edge of Display 0 continue naturally into
 *   Display 1, and vice versa.
 *
 * What this example demonstrates:
 *   "Dual Screen" — fifteen entities bounce around a world twice as wide as a single
 *   display. The world is split down the middle:
 *   - Display 0 (left, 64×36): shows world columns 0..63.
 *   - Display 1 (right, 64×36): shows world columns 64..127.
 *   Both displays use the same palette and the same rendering logic. Entities move
 *   and draw their trails continuously across the boundary.
 *
 * Key Concepts:
 *   - `display.setOrigin(new Vector2(x, y))` — sets the world-space top-left corner
 *     of the display viewport. Display 1 has origin (64, 0) so it renders world
 *     columns 64..127 using local layer coordinates 0..63.
 *   - `new Layer(new Vector2(x, y), zIndex, w, h)` — layers also have a world-space
 *     origin. Layer 1 starts at (64, 0) so drawing at local position (p, q) maps to
 *     world position (64+p, q).
 *   - `display.setRenderPasses([{ id, zMin, zMax }])` — restricts which layers are
 *     composited for that display. Display 0 only composites z=0, Display 1 only z=1.
 *   - The host `ClientRuntime` receives `displays: [...]` and `PrimitivClientMultiDisplay`
 *     renders both canvases side-by-side, separated by a small pixel gap.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

// =====================================================================
// Constants
// =====================================================================

/** Width of each display in cells. Both displays are the same size. */
const D_W = 64;

/** Height of each display in cells. */
const D_H = 36;

/**
 * Total world width: the two displays placed side-by-side share this space.
 * Entities bounce between x=0 and x=WORLD_W-1 crossing from Display 0 to Display 1.
 */
const WORLD_W = D_W * 2; // 128

/**
 * World height: one row is reserved for the header strip on each display.
 * Entities bounce between y=0 and y=WORLD_H-1.
 */
const WORLD_H = D_H - 1; // 35

/** Number of bouncing entities. More entities fill the wider world nicely. */
const ENTITY_COUNT = 15;

/** Trail length expressed in remembered positions. */
const TRAIL_LEN = 10;

// =====================================================================
// Entity
// =====================================================================

/** A single bouncing entity in the shared world simulation. */
interface Entity {
  /** Numeric id 0–(ENTITY_COUNT-1). */
  id: number;

  /** Sub-cell X position (fractional, 0 to WORLD_W-1). */
  fx: number;

  /** Sub-cell Y position (fractional, 0 to WORLD_H-1). */
  fy: number;

  /** Horizontal velocity in cells/tick. */
  vx: number;

  /** Vertical velocity in cells/tick. */
  vy: number;

  /** Glyph drawn at the entity's current position. */
  char: string;

  /** Foreground colorId from the shared palette. */
  color: number;

  /** Ring buffer of previous integer positions for the motion trail. */
  trail: { x: number; y: number }[];
}

// =====================================================================
// User Data
// =====================================================================

/** Per-user rendering resources: two displays and their associated layers. */
interface DualScreenUserData {
  display0: Display;
  display1: Display;
  layer0: Layer;
  layer1: Layer;
}

// =====================================================================
// Application
// =====================================================================

export class MultiDisplay implements IApplication<
  Engine,
  User<DualScreenUserData>
> {
  // =====================================================================
  // Global State
  // =====================================================================

  /** Entities shared across all connected users. Updated once per tick in update(). */
  private entities: Entity[] = [];

  /** Monotonic tick counter. */
  private tickCount = 0;

  /** Engine start timestamp for uptime display. */
  private startTime = Date.now();

  // =====================================================================
  // GLOBAL INIT
  // =====================================================================

  /**
   * Called once at startup. Loads the shared palette and spawns entities
   * spread across the full WORLD_W × WORLD_H space.
   */
  async init(_runtime: IRuntime, engine: Engine): Promise<void> {
    // ----- Shared "SPACE" palette (slot 0) -----
    // Used by both Display 0 and Display 1 — same visual identity across screens.
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 6, g: 8, b: 16, a: 255 }, // deep black bg
      { colorId: 1, r: 255, g: 80, b: 80, a: 255 }, // red
      { colorId: 2, r: 80, g: 200, b: 255, a: 255 }, // cyan
      { colorId: 3, r: 100, g: 255, b: 120, a: 255 }, // green
      { colorId: 4, r: 255, g: 190, b: 60, a: 255 }, // orange
      { colorId: 5, r: 180, g: 100, b: 255, a: 255 }, // purple
      { colorId: 6, r: 255, g: 255, b: 100, a: 255 }, // yellow
      { colorId: 7, r: 100, g: 180, b: 255, a: 255 }, // blue
      { colorId: 8, r: 255, g: 130, b: 200, a: 255 }, // pink
      { colorId: 9, r: 60, g: 220, b: 200, a: 255 }, // teal
      { colorId: 10, r: 255, g: 150, b: 80, a: 255 }, // amber
      { colorId: 11, r: 50, g: 60, b: 90, a: 255 }, // dim trail
      { colorId: 12, r: 15, g: 20, b: 32, a: 255 }, // header bg
      { colorId: 13, r: 40, g: 50, b: 75, a: 255 }, // header bg right
    ]);

    // ----- Spawn entities across the full world -----
    const chars = [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
    ];
    const colors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5];

    for (let i = 0; i < ENTITY_COUNT; i++) {
      const speed = 0.2 + Math.random() * 0.4;
      const angle = Math.random() * Math.PI * 2;
      this.entities.push({
        id: i,
        fx: Math.random() * (WORLD_W - 2) + 1,
        fy: Math.random() * (WORLD_H - 2) + 1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        char: chars[i],
        color: colors[i],
        trail: [],
      });
    }

    _runtime.setTickRate(30);
    this.startTime = Date.now();
  }

  // =====================================================================
  // USER INIT
  // =====================================================================

  /**
   * Called when a client connects. Creates two Displays and two Layers.
   *
   * The key setup that makes each display show its own half of the world:
   *   - display0.setOrigin(0, 0)   → renders world columns 0..63
   *   - display1.setOrigin(64, 0)  → renders world columns 64..127
   *   - layer0: world position (0, 0), z=0  → composited by Display 0 only
   *   - layer1: world position (64, 0), z=1 → composited by Display 1 only
   *
   * setRenderPasses enforces z-range filtering so each display only composites
   * its own layer, even though both layers are in the same global pool.
   */
  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<DualScreenUserData>,
  ): void {
    // ----- Display 0: left half of the world (columns 0..63) -----
    const display0 = new Display(0, D_W, D_H);
    user.addDisplay(display0);
    display0.switchPalette(0);
    display0.setOrigin(new Vector2(0, 0));
    // Only composite layers with zIndex in [0, 0] → layer0 exclusively.
    display0.setRenderPasses([{ id: 0, zMin: 0, zMax: 0 }]);
    user.data.display0 = display0;

    // Layer 0: same world origin as Display 0 → local coords = world coords.
    const layer0 = new Layer(new Vector2(0, 0), 0, D_W, D_H, {
      mustBeReliable: true,
    });
    user.addLayer(layer0);
    user.data.layer0 = layer0;

    // ----- Display 1: right half of the world (columns 64..127) -----
    const display1 = new Display(1, D_W, D_H);
    user.addDisplay(display1);
    display1.switchPalette(0); // Same palette — continuous visual identity.
    display1.setOrigin(new Vector2(D_W, 0));
    // Only composite layers with zIndex in [1, 1] → layer1 exclusively.
    display1.setRenderPasses([{ id: 0, zMin: 1, zMax: 1 }]);
    user.data.display1 = display1;

    /**
     * Layer 1: world origin (64, 0) — shifts local coordinates by D_W.
     * Drawing at local position (lx, ly) maps to world position (64+lx, ly).
     * An entity at world x=80 draws at layer1 local x = 80-64 = 16.
     * Layer z=1 keeps it out of Display 0's render pass (capped at zMax: 0).
     */
    const layer1 = new Layer(new Vector2(D_W, 0), 1, D_W, D_H, {
      mustBeReliable: true,
    });
    user.addLayer(layer1);
    user.data.layer1 = layer1;
  }

  // =====================================================================
  // GLOBAL UPDATE — advance the simulation
  // =====================================================================

  /**
   * Moves every entity one step. Runs once per tick regardless of user count.
   * Entities bounce off the full world boundary (0..WORLD_W-1, 0..WORLD_H-1).
   */
  update(_runtime: IRuntime, _engine: Engine): void {
    this.tickCount++;

    for (const e of this.entities) {
      // Record current integer position in the trail before moving
      e.trail.push({ x: Math.round(e.fx), y: Math.round(e.fy) });
      if (e.trail.length > TRAIL_LEN) e.trail.shift();

      e.fx += e.vx;
      e.fy += e.vy;

      // Bounce off world walls
      if (e.fx < 0) {
        e.fx = 0;
        e.vx = Math.abs(e.vx);
      }
      if (e.fx > WORLD_W - 1) {
        e.fx = WORLD_W - 1;
        e.vx = -Math.abs(e.vx);
      }
      if (e.fy < 0) {
        e.fy = 0;
        e.vy = Math.abs(e.vy);
      }
      if (e.fy > WORLD_H - 1) {
        e.fy = WORLD_H - 1;
        e.vy = -Math.abs(e.vy);
      }
    }
  }

  // =====================================================================
  // PER-USER RENDER
  // =====================================================================

  /**
   * Called every tick for each connected user.
   * Renders both display layers from the shared entity state.
   */
  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<DualScreenUserData>,
  ): void {
    this.renderLayer(user.data, 0); // Display 0 — local offset 0
    this.renderLayer(user.data, 1); // Display 1 — local offset D_W
  }

  // =====================================================================
  // RENDER HELPER
  // =====================================================================

  /**
   * Renders the shared world state onto one layer.
   *
   * @param side  0 = left Display (layer0, offset 0)
   *              1 = right Display (layer1, offset D_W)
   *
   * The `offset` is subtracted from each entity's world x-coordinate to
   * obtain the layer-local x-coordinate. Only entities that fall within
   * [0, D_W) after offsetting are drawn — entities off-screen are simply
   * clipped, which is the natural boundary between the two displays.
   */
  private renderLayer(data: DualScreenUserData, side: 0 | 1): void {
    const layer = side === 0 ? data.layer0 : data.layer1;
    const offset = side * D_W; // 0 for left, 64 for right
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const o: any[] = [];

    // --- Background ---
    o.push(OrderBuilder.fill(" ", 0, 0));

    // --- Header strip (row 0) ---
    // Slightly different accent color on each display identifies them visually.
    const headerBg = side === 0 ? 12 : 13; // dark navy vs dark slate
    const headerAccent = side === 0 ? 2 : 4; // cyan vs orange label
    o.push(OrderBuilder.rect(0, 0, D_W, 1, " ", 0, headerBg, true));
    o.push(OrderBuilder.text(2, 0, `DISPLAY ${side}`, headerAccent, headerBg));
    const info = side === 0 ? `t:${this.tickCount}` : `up:${uptime}s`;
    o.push(OrderBuilder.text(D_W - 2 - info.length, 0, info, 11, headerBg));

    // --- Motion trails ---
    for (const e of this.entities) {
      for (let t = 0; t < e.trail.length; t++) {
        const pos = e.trail[t];
        const lx = pos.x - offset;
        const ly = 1 + pos.y; // +1 for header row
        if (lx < 0 || lx >= D_W || ly < 1 || ly >= D_H) continue;
        // Older trail segments are drawn dimmer
        const trailColor = t < e.trail.length - 4 ? 11 : e.color;
        o.push(OrderBuilder.text(lx, ly, "·", trailColor, 0));
      }
    }

    // --- Entity glyphs (drawn on top of trails) ---
    for (const e of this.entities) {
      const lx = Math.round(e.fx) - offset;
      const ly = 1 + Math.round(e.fy);
      if (lx < 0 || lx >= D_W || ly < 1 || ly >= D_H) continue;
      o.push(OrderBuilder.text(lx, ly, e.char, e.color, 0));
    }

    layer.setOrders(o);
    layer.commit();
  }
}
