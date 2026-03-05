/**
 * Name: custom-sprites
 * Description: Renders the complete GPU atlas side by side — block 0 (CP437, charCodes 0–255)
 *   and block 1 (custom PNG, charCodes 256–511) — as two 16×16 glyph grids exactly as they
 *   are laid out inside the engine's font atlas.
 *
 * Why study this:
 *   Every previous example drew characters using the built-in CP437 font — a fixed
 *   256-character set baked into the engine (block 0). This is sufficient for text,
 *   boxes, and simple shapes, but entirely unsuitable for tile-based games, custom
 *   sprites, or any art that requires its own graphical assets.
 *
 *   Primitiv solves this via "font blocks": additional 256-glyph sheets loaded from
 *   PNG files. Once loaded, characters 256-511 come from block 1, 512-767 from block 2,
 *   and so on. Because Primitiv's default layer format uses 8-bit charCodes (0-255), a
 *   layer must be switched to `charCodeMode: '16bit'` before it can address these ranges.
 *
 * The Font Block System:
 *   - The global font is a virtual atlas divided into "blocks" of exactly 256 glyphs each.
 *     Every block is laid out as 16 columns × 16 rows of glyphs — always 256 slots, no exceptions.
 *   - Block 0 is always the built-in CP437 font, loaded automatically. Its glyphs are
 *     natively 8×8 pixels. This means the built-in block 0 is ONLY usable when the
 *     declared cell size is 8×8. If you need a different cell size (e.g. 16×16), you must
 *     replace block 0 by calling `engine.loadFontBlock(0, url)` with a PNG that matches
 *     the declared dimensions — there is no way to keep the built-in CP437 and switch to
 *     a different cell size at the same time.
 *   - `engine.loadFont(cellW, cellH, blockCapacity, ...)` declares a SINGLE cell size that
 *     applies to EVERY block in the atlas — including block 0. You cannot mix cell sizes:
 *     if you call `loadFont(8, 8, ...)`, all blocks must supply 8×8 pixel glyphs.
 *     Declaring `loadFont(16, 16, ...)` means every glyph across all blocks is 16×16 pixels.
 *     This constraint is intentional: the renderer uses one global cell grid, so all glyphs
 *     must be the same physical size to align correctly on screen.
 *   - `engine.loadFontBlock(index, url)` loads a PNG sprite sheet into block slot `index`.
 *     The PNG must be exactly 16 × cellW pixels wide and 16 × cellH pixels tall.
 *     (16 columns × cellW pixels, 16 rows × cellH pixels = 256 glyph slots per block.)
 *   - After loading block 1, charCode 256 = glyph (0,0), 257 = glyph (1,0), ..., 511 = glyph (15,15).
 *   - You can load up to `blockCapacity` blocks in total (including block 0).
 *
 * 16-bit Layer Mode:
 *   By default, a Layer stores charCodes as 8-bit unsigned integers for wire efficiency.
 *   8-bit = max charCode 255 = block 0 only.
 *   `charCodeMode: '16bit'` doubles the per-cell storage to allow charCodes up to 65535.
 *   COST: Every order sent on a 16-bit layer uses 2 bytes per cell instead of 1 for the
 *   charCode. For a full-screen `subFrameMulti` at 80×40 this doubles the order payload.
 *   Best practice: only put layers that actually need charCodes >255 into 16-bit mode.
 *   Keep text/UI layers 8-bit.
 *
 * Network Consideration:
 *   Standard `subFrameMulti` on a 16-bit layer is still expensive in connected mode —
 *   it sends every cell every tick. Prefer `sprite`, `spriteCloud`, or `bitmask16` when
 *   the goal is reusing graphical tiles: those orders only send the tile ID, not pixel data.
 *   The 16-bit mode simply unlocks the charCode range; choose your order types wisely.
 *
 * Asset Format for `loadFontBlock`:
 *   - PNG file, RGBA, no compression artifacts (use lossless export).
 *   - Width  = 16 × cellWidth  pixels  (always exactly 16 glyph columns).
 *   - Height = 16 × cellHeight pixels  (always exactly 16 glyph rows).
 *   - cellWidth and cellHeight MUST match the values passed to `engine.loadFont()`.
 *     A 16×16 atlas PNG loaded into an engine declared with `loadFont(8, 8, ...)` will
 *     be misaligned. All blocks share the same cell dimensions — there is no per-block override.
 *   - Glyph at column c, row r of the sheet maps to charCode = blockIndex*256 + r*16 + c.
 *   - Transparent pixels render using the cell's background color (colorId);
 *     opaque pixels use the foreground color (fgColorId). Anti-aliased edges are not recommended.
 *
 * Block 1 Asset:
 *   The sprite sheet loaded into block 1 (`atlas_block1.png`) is derived from the
 *   "Micro Roguelike" asset pack by Kenney (https://kenney.nl/assets/micro-roguelike),
 *   released under CC0 (public domain).
 *
 * What this example demonstrates:
 *   - The complete GPU atlas rendered on screen: block 0 (CP437, charCodes 0–255) and
 *     block 1 (custom PNG, charCodes 256–511) displayed simultaneously as two 16×16 grids,
 *     exactly mirroring the column/row layout stored in the engine's font atlas.
 *   - Column (0–F) and row (0–F) axis labels so each glyph's charCode can be derived
 *     directly from its position: charCode = blockIndex × 256 + row × 16 + col.
 *   - Mouse hover: moving over any glyph highlights it and shows its charCode, block,
 *     column and row in a dedicated info panel. The cursor runs on a separate volatile
 *     layer (`mustBeReliable: false`) so it never blocks reliable delivery of the atlas.
 *
 * Key Concepts:
 *   - `engine.loadFont(cellW, cellH, blockCapacity, ...)` — declares the GLOBAL cell size
 *     (shared by all blocks) and the maximum number of blocks the atlas can hold.
 *   - `engine.loadFontBlock(index, url)` — load a glyph sheet into a block slot.
 *   - `new Layer(..., { charCodeMode: '16bit' })` — enable charCodes >255 on a layer.
 *   - `OrderBuilder.char(x, y, charCode, fgColorId, bgColorId)` — single glyph by code.
 *   - `OrderBuilder.subFrameMulti(x, y, w, h, cells)` — bulk cell data supporting 16-bit codes.
 *   - `user.getMouseDisplayInfo()` — returns `{ localX, localY }` (cell coordinates) or null.
 *   - Two layers with different zIndex keep static content and dynamic cursor completely separate.
 *   - Hover state tracking: store `lastHoveredCell` and skip `commit()` when unchanged —
 *     mouse movement within the same cell costs zero bandwidth.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  InputDeviceType,
  MouseInput,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

interface SpritesUserData {
  layer: Layer;
  cursorLayer: Layer;
  lastHoveredCell: number; // -1 = none, else charCode
}

export class CustomSpritesShowcase implements IApplication<
  Engine,
  User<SpritesUserData>
> {
  async init(_runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 15, g: 15, b: 25, a: 255 }, // Dark background
      { colorId: 1, r: 220, g: 220, b: 220, a: 255 }, // Light gray  — CP437 glyphs
      { colorId: 2, r: 100, g: 200, b: 255, a: 255 }, // Sky blue    — block 1 glyphs
      { colorId: 3, r: 255, g: 200, b: 50, a: 255 }, // Gold        — titles
      { colorId: 4, r: 160, g: 160, b: 180, a: 255 }, // Dim gray    — axis labels
      { colorId: 5, r: 50, g: 50, b: 70, a: 255 }, // Panel bg
      { colorId: 6, r: 255, g: 255, b: 255, a: 255 }, // White
      { colorId: 7, r: 80, g: 180, b: 120, a: 255 }, // Mint green  — formula text
    ]);

    /**
     * FONT BLOCKS
     * - loadFont declares cell size 8×8 and reserves 2 block slots (block 0 + block 1).
     * - Block 0 (CP437) is loaded automatically by the engine.
     * - loadFontBlock(1, …) loads the custom sprite sheet into slot 1.
     *   The PNG must be exactly 128×128 px: 16 cols × 8 px wide, 16 rows × 8 px tall.
     */
    engine.loadFont(8, 8, 2, 8, 8);
    await engine.loadFontBlock(
      1,
      new URL("./atlas_block1.png", import.meta.url).href,
    );

    _runtime.setTickRate(60);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<SpritesUserData>,
  ): void {
    // ── Display & layer ──────────────────────────────────────────────────────
    const W = 80;
    const H = 40;

    const display = new Display(0, W, H);
    user.addDisplay(display);
    display.switchPalette(0);

    // Static atlas layer — 16-bit to address charCodes 256–511 (block 1)
    const layer = new Layer(new Vector2(0, 0), 0, W, H, {
      charCodeMode: "16bit",
    });
    user.data.layer = layer;
    user.addLayer(layer);

    // Cursor layer — volatile (mustBeReliable: false), higher zIndex, 16-bit for glyph preview
    const cursorLayer = new Layer(new Vector2(0, 0), 1, W, H, {
      mustBeReliable: false,
      charCodeMode: "16bit",
    });
    user.data.cursorLayer = cursorLayer;
    user.addLayer(cursorLayer);

    // Initialize hover tracking
    user.data.lastHoveredCell = -1;

    // Bind mouse click (unused here but registers the mouse device so hover works)
    const registry = user.getInputBindingRegistry();
    registry.defineButton(0, "CLICK", [
      {
        sourceId: 0,
        type: InputDeviceType.Mouse,
        mouseButton: MouseInput.LeftButton,
      },
    ]);

    // ── Layout constants ─────────────────────────────────────────────────────
    //  Each block occupies: 1 col (row label) + 16 cols (glyphs) = 17 cols wide
    //  Two blocks + a 6-col gap = 40 cols. Centered in 80: left margin = 20.
    //
    //  Block 0  row-label col : x = 20    glyph grid x : 21–36
    //  Block 1  row-label col : x = 43    glyph grid x : 44–59
    //  Col headers row        : y =  3
    //  Glyph rows             : y =  4 – 19   (16 rows)

    const B0_LX = 20; // Block 0 row-label column
    const B0_GX = 21; // Block 0 glyph grid x start
    const B1_LX = 43; // Block 1 row-label column
    const B1_GX = 44; // Block 1 glyph grid x start
    const GY = 5; // Glyph grid y start
    const HEX = "0123456789ABCDEF";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o: any[] = [];

    // ── Background fill ──────────────────────────────────────────────────────
    o.push(OrderBuilder.fill(" ", 0, 0));

    // Column header background strips
    o.push(OrderBuilder.rect(B0_LX, 4, 17, 1, " ", 5, 5));
    o.push(OrderBuilder.rect(B1_LX, 4, 17, 1, " ", 5, 5));

    // ── Titles ───────────────────────────────────────────────────────────────
    o.push(OrderBuilder.text(2, 0, "PRIMITIV FONT ATLAS", 3, 0));
    o.push(
      OrderBuilder.text(
        2,
        1,
        "The two blocks that compose the GPU atlas, rendered in full.",
        4,
        0,
      ),
    );

    // Block labels (above col headers)
    o.push(OrderBuilder.text(B0_GX - 1, 3, "BLOCK 0 - CP437", 3, 0));
    o.push(OrderBuilder.text(B1_GX - 1, 3, "BLOCK 1 - Custom", 3, 0));

    // ── Column headers (hex 0–F) ─────────────────────────────────────────────
    o.push(OrderBuilder.text(B0_GX, 4, HEX, 4, 5));
    o.push(OrderBuilder.text(B1_GX, 4, HEX, 4, 5));

    // ── Row labels + glyph grids ─────────────────────────────────────────────
    const block0Cells: {
      charCode: number;
      fgColorCode: number;
      bgColorCode: number;
    }[] = [];
    const block1Cells: {
      charCode: number;
      fgColorCode: number;
      bgColorCode: number;
    }[] = [];

    for (let gy = 0; gy < 16; gy++) {
      // Row label (hex digit)
      o.push(OrderBuilder.text(B0_LX, GY + gy, HEX[gy], 4, 5));
      o.push(OrderBuilder.text(B1_LX, GY + gy, HEX[gy], 4, 5));

      for (let gx = 0; gx < 16; gx++) {
        block0Cells.push({
          charCode: gy * 16 + gx, // 0–255
          fgColorCode: 1, // light gray
          bgColorCode: 0, // dark bg
        });
        block1Cells.push({
          charCode: 256 + gy * 16 + gx, // 256–511
          fgColorCode: 6, // white
          bgColorCode: 0,
        });
      }
    }

    // subFrameMulti renders a rectangular block of cells in one order call.
    // On a 16-bit layer it correctly encodes charCodes above 255.
    o.push(OrderBuilder.subFrameMulti(B0_GX, GY, 16, 16, block0Cells));
    o.push(OrderBuilder.subFrameMulti(B1_GX, GY, 16, 16, block1Cells));

    // ── Footer ───────────────────────────────────────────────────────────────
    o.push(OrderBuilder.rect(0, 22, W, 1, "-", 5, 0));

    // ── Info panel placeholder (rows 25-38, filled by updateUser on hover) ───
    o.push(OrderBuilder.text(2, 25, "Hover a glyph to inspect it", 5, 0));

    // ── Commit static atlas (never re-sent unless layer changes) ─────────────
    layer.setOrders(o);

  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<SpritesUserData>,
  ): void {
    const cursorLayer = user.data.cursorLayer;
    const data = user.data;

    // Grid geometry (must match initUser constants)
    const B0_GX = 21;
    const B1_GX = 44;
    const GY = 5;
    const GRID_W = 16;
    const GRID_H = 16;
    const HEX = "0123456789ABCDEF";

    // Determine current hover state
    let currentHoveredCell = -1;
    let blockIndex = -1;
    let col = 0;
    let row = 0;
    let cellX = 0;
    let cellY = 0;

    const mouse = user.getMouseDisplayInfo();
    if (mouse) {
      const mx = Math.floor(mouse.localX);
      const my = Math.floor(mouse.localY);

      if (mx >= B0_GX && mx < B0_GX + GRID_W && my >= GY && my < GY + GRID_H) {
        blockIndex = 0;
        col = mx - B0_GX;
        row = my - GY;
        currentHoveredCell = row * GRID_H + col;
        cellX = mx;
        cellY = my;
      } else if (
        mx >= B1_GX &&
        mx < B1_GX + GRID_W &&
        my >= GY &&
        my < GY + GRID_H
      ) {
        blockIndex = 1;
        col = mx - B1_GX;
        row = my - GY;
        currentHoveredCell = 256 + row * GRID_H + col;
        cellX = mx;
        cellY = my;
      }
    }

    // Only update if hover state changed
    if (currentHoveredCell === data.lastHoveredCell) {
      return;
    }
    data.lastHoveredCell = currentHoveredCell;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const co: any[] = [];

    if (currentHoveredCell >= 0) {
      const charCode = currentHoveredCell;

      // Highlight the hovered cell (inverted colors)
      co.push(
        OrderBuilder.char(cellX, cellY, charCode, 0, blockIndex === 0 ? 1 : 6),
      );

      // ── Info panel (rows 25-38) ─────────────────────────────────────────
      const hexCode = charCode.toString(16).toUpperCase().padStart(4, "0");
      const fgInfo = blockIndex === 0 ? 1 : 6;

      co.push(OrderBuilder.rect(0, 25, 80, 14, " ", 0, 0)); // clear area
      co.push(OrderBuilder.text(2, 25, "GLYPH INSPECTOR", 3, 0));
      co.push(OrderBuilder.rect(0, 26, 80, 1, "-", 5, 0));

      // ── Metadata (left column) ──────────────────────────────────────────
      co.push(OrderBuilder.text(2, 28, "Block   :", 4, 0));
      co.push(OrderBuilder.text(12, 28, String(blockIndex), fgInfo, 0));

      co.push(OrderBuilder.text(2, 29, "Col     :", 4, 0));
      co.push(OrderBuilder.text(12, 29, `${col}  (${HEX[col]})`, fgInfo, 0));

      co.push(OrderBuilder.text(2, 30, "Row     :", 4, 0));
      co.push(OrderBuilder.text(12, 30, `${row}  (${HEX[row]})`, fgInfo, 0));

      co.push(OrderBuilder.text(2, 32, "charCode:", 4, 0));
      co.push(
        OrderBuilder.text(12, 32, `${charCode}  (0x${hexCode})`, fgInfo, 0),
      );

      // ── 1×1 preview (hovered glyph alone) ──────────────────────────────
      co.push(OrderBuilder.text(30, 27, "1x1", 4, 0));
      co.push(OrderBuilder.char(30, 28, charCode, fgInfo, 5));

      // ── 3×3 preview (same glyph repeated — shows tiling behaviour) ──────
      co.push(OrderBuilder.text(36, 27, "3x3", 4, 0));
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          co.push(OrderBuilder.char(36 + dc, 28 + dr, charCode, fgInfo, 5));
        }
      }
    }

    cursorLayer.setOrders(co);

  }

  update(_runtime: IRuntime, _engine: Engine): void {}
}
