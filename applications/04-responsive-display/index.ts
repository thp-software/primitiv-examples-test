/**
 * Name: responsive-display
 * Description: Shows how a Display adapts to any browser window size automatically.
 *
 * Why study this:
 *   In 01-simple-matrix, the Display had a fixed width and height (80x40 cells).
 *   The rendering logic assumed those exact dimensions and would break if changed.
 *   In a real application, you cannot know the user's screen size in advance.
 *   `ScalingMode.Responsive` solves this: the engine dynamically calculates how many
 *   cells fit into the available window area and updates `display.width` / `display.height`
 *   every tick. Your rendering logic must read those values at runtime, not assume them.
 *
 * Responsive Display:
 *   Setting `display.setScalingMode(ScalingMode.Responsive)` makes the Display fill
 *   its container div completely. The engine derives the grid dimensions from:
 *     - The physical pixel size of the container.
 *     - The cell size set via `display.setCellSize(w, h)`.
 *   Try resizing the browser window to see this in action.
 *
 * Cell Size:
 *   `display.setCellSize(widthPx, heightPx)` controls the "zoom level" of the terminal grid.
 *   Smaller cells = more columns and rows on the same screen = higher density.
 *   Larger cells = fewer columns and rows = easier to read, retro feel.
 *   The default is typically 8x8. We use 16x16 for a comfortable reading size.
 *
 * Layer Oversizing:
 *   Because the Display dimensions change at runtime, we cannot match the Layer size
 *   to the Display size in `initUser`. Instead, we allocate a large fixed-size Layer
 *   (e.g. 256x256) that will always be large enough to cover any realistic window size.
 *   This is safe: cells that fall outside the Display's viewport are simply not shown.
 *
 * Reading Display Dimensions at Runtime:
 *   You MUST read `display.width` and `display.height` inside `updateUser`, not store
 *   them as constants. These values are updated by the runtime before `updateUser` runs.
 *
 * What this example demonstrates:
 *   - A live info panel that reads `display.width` and `display.height` on every tick
 *     and adapts its layout to the current grid size.
 *   - Resizing the browser window immediately reconfigures the grid: the number of
 *     columns and rows updates automatically, and the panel reflows on the next tick.
 *   - The oversized-layer pattern: a 256×256 layer allocated once covers any window
 *     size without reallocation.
 *
 * Key Concepts:
 *   - `display.setScalingMode(ScalingMode.Responsive)` — makes the display fill its container and derive grid dimensions from physical pixels ÷ cell size.
 *   - `display.setCellSize(widthPx, heightPx)` — sets the pixel size of each cell (controls the zoom level).
 *   - `display.width` / `display.height` — read these inside `updateUser` every tick; they are updated by the runtime before your logic runs.
 *   - Fixed oversized layer: allocate once at 256×256, safe for any realistic window size.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  ScalingMode,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

/** Fixed layer surface size. Large enough to cover any realistic window. */
const LAYER_SIZE = 256;

interface ResponsiveDisplayUserData {
  /** The user's camera display, stored for direct access in updateUser. */
  display: Display;

  /** The fixed-size 256x256 layer. Never resized — the Display clips it. */
  layer: Layer;

  /**
   * The character grid state for the full 256x256 layer surface.
   * Allocated ONCE in initUser and never rebuilt.
   * The Display viewport clips to show only the visible subset.
   */
  grid: Array<{ char: string; fg: number; bg: number }>;
}

export class ResponsiveDisplay implements IApplication<
  Engine,
  User<ResponsiveDisplayUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const palette = [
      { colorId: 0, r: 5, g: 5, b: 10, a: 255 }, // Background black
      { colorId: 1, r: 180, g: 255, b: 180, a: 255 }, // Soft green
      { colorId: 2, r: 100, g: 200, b: 255, a: 255 }, // Soft blue
      { colorId: 3, r: 255, g: 200, b: 100, a: 255 }, // Soft amber
      { colorId: 4, r: 220, g: 180, b: 255, a: 255 }, // Soft violet
      { colorId: 5, r: 255, g: 130, b: 130, a: 255 }, // Soft red
    ];
    engine.loadPaletteToSlot(0, palette);
    runtime.setTickRate(15);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<ResponsiveDisplayUserData>,
  ): void {
    // --- Display Setup ---
    /**
     * We initialize the Display with a placeholder size (80x40).
     * The ACTUAL dimensions will be computed by the engine from the window size
     * and the cell size we define below. These placeholder values are overwritten
     * before the first `updateUser` call.
     */
    const display = new Display(0, 80, 40);
    user.addDisplay(display);
    display.switchPalette(0);

    /**
     * ScalingMode.Responsive is the key setting.
     * It instructs the engine to:
     *   1. Expand the display canvas to fill its parent container.
     *   2. Recalculate `display.width` and `display.height` using the formula:
     *        cols = Math.floor(containerPixelWidth  / cellWidth)
     *        rows = Math.floor(containerPixelHeight / cellHeight)
     * Without this, the display would render at the fixed 80x40 and be letterboxed.
     */
    display.setScalingMode(ScalingMode.Responsive);

    /**
     * setCellSize(widthPx, heightPx) controls the "zoom level" of the terminal grid.
     * Smaller cells = more columns and rows on the same screen = higher density.
     * Larger cells = fewer columns and rows = easier to read, retro feel.
     * Try changing this value (e.g. 8, 16, 32) and observe how the grid density changes.
     */
    display.setCellSize(16, 16);

    // --- Layer Setup ---
    /**
     * We allocate a 256x256 Layer — much larger than any typical window size.
     * This ensures our Layer can always cover the Display area regardless of resize.
     * The engine clips what is rendered to the Display's current width/height,
     * so no visual artifacts occur from the oversized allocation.
     */
    const layer = new Layer(new Vector2(0, 0), 0, LAYER_SIZE, LAYER_SIZE, {
      mustBeReliable: false,
    });
    user.addLayer(layer);

    // Initialize user data. The grid is allocated once and never rebuilt.
    user.data.display = display;
    user.data.layer = layer;
    user.data.grid = Array.from({ length: LAYER_SIZE * LAYER_SIZE }, () =>
      this.randomCell(),
    );
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<ResponsiveDisplayUserData>,
  ): void {
    const data = user.data;

    // --- Animate ---
    /**
     * The layer is a fixed 256x256 surface. We update ~2% of its total
     * cells each tick. The Display viewport clips it to only show the
     * visible portion — we never need to resize the grid array.
     */
    const totalCells = LAYER_SIZE * LAYER_SIZE;
    const updateCount = Math.max(1, Math.floor(totalCells * 0.02));
    for (let i = 0; i < updateCount; i++) {
      const idx = Math.floor(Math.random() * totalCells);
      data.grid[idx] = this.randomCell();
    }

    // --- Render ---
    /**
     * We always render the full 256x256 grid via `subFrameMulti`.
     * The Display only shows the cells that fall within its current
     * viewport (determined by the responsive cell size and window size).
     */
    const frameData = data.grid.map((cell) => ({
      charCode: cell.char,
      fgColorCode: cell.fg,
      bgColorCode: cell.bg,
    }));

    data.layer.setOrders([
      OrderBuilder.subFrameMulti(0, 0, LAYER_SIZE, LAYER_SIZE, frameData),
    ]);

    // Commit is required every tick after any setOrders or state change.

  }

  update(_runtime: IRuntime, _engine: Engine): void {}

  /** Generates a single random cell for the character rain. */
  private randomCell(): { char: string; fg: number; bg: number } {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789+=-|\\/><";
    const r = Math.random();

    // 45% chance: empty (blank space, invisible)
    if (r < 0.45) return { char: " ", fg: 0, bg: 0 };

    // 45% chance: a random colored character
    if (r < 0.9)
      return {
        char: chars[Math.floor(Math.random() * chars.length)],
        fg: 1 + Math.floor(Math.random() * 5),
        bg: 0,
      };

    // 10% chance: a bright highlighted block
    return {
      char: "█",
      fg: 1 + Math.floor(Math.random() * 5),
      bg: 0,
    };
  }
}
