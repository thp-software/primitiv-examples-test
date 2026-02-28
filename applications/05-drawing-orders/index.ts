/**
 * Name: drawing-orders
 * Description: A visual catalog of every drawing order available in OrderBuilder.
 *
 * Why study this:
 *   In the previous examples, we only used a handful of OrderBuilder methods:
 *   `fill`, `text`, `rect`, `char`, and `subFrameMulti`.
 *   But Primitiv provides a rich vocabulary of drawing operations organized in categories:
 *   shapes, fills, frames, bitmasks, sprites, clouds. This example displays each one
 *   with its name, like a reference poster you can study and come back to.
 *
 * Network Bandwidth & Efficiency:
 *   Because Primitiv is an isomorphic engine (runs on both client and server), understanding
 *   this catalog is CRUCIAL for server deployments. Not all orders are created equal networking-wise:
 *   - `fullFrameMulti` sends *every cell* of the layer. Sending it 60 times a second wastes massive bandwidth.
 *   - Conversely, `circle`, `rect`, or `sprite` send practically zero payload (just the IDs/params),
 *     because the actual rasterization happens client-side.
 *   - `bitmask4` and `bitmask16` allow you to draw complex terrains (like maps) for a fraction
 *     of the cost of per-cell rendering, because they use tight bit-packing (1, 2 or 4 bits per cell)
 *     instead of sending full byte-sized color and char data for every position.
 *   Mastering these primitives allows you to build rich, 60 FPS multiplayer games without choking the connection.
 *
 * Order Categories (24 network types, 29 methods):
 *
 *   SHAPES — Geometric primitives drawn at specific coordinates.
 *     rect, circle, ellipse, line, triangle, polyline, polygon
 *
 *   ATOMIC — The smallest drawing units.
 *     char, text, textMultiline
 *
 *   FILLS — Orders that cover the entire layer surface with a pattern.
 *     fill, fillChar, fillSprite, fillSpriteMulti
 *
 *   FRAMES — Block-copy operations: write a rectangular grid of characters at once.
 *     subFrame, subFrameMulti, fullFrame, fullFrameMulti
 *
 *   BITMASKS — Optimized grid renderers where each cell maps to a variant index.
 *     bitmask (binary: on/off), bitmask4 (4 states), bitmask16 (16 states)
 *
 *   SPRITES — Preloaded cell matrices placed by ID (zero payload, only the ID is sent).
 *     sprite (unicolor, tinted), spriteMulti (multicolor, embedded colors)
 *
 *   CLOUDS — Batch rendering: many instances of the same element at multiple positions.
 *     dotCloud, dotCloudMulti, spriteCloud, spriteCloudMulti,
 *     spriteCloudVaried, spriteCloudVariedMulti
 *
 * What is a Sprite in Primitiv?
 *   A sprite is simply a matrix of cells (width x height) preloaded in the engine.
 *   - Unicolor sprites: each cell is a char code (0 = transparent, any other = that character).
 *     At draw time, all non-zero cells are rendered with uniform fg/bg colors you specify.
 *   - Multicolor sprites: each cell has its own { charCode, fgColorId, bgColorId }.
 *   Sprites are registered once in `init()` via `engine.getSpriteRegistry()`.
 *   At draw time, only the sprite ID is sent — the actual cell data was already loaded.
 *
 * What this example demonstrates:
 *   - A visual catalog / reference poster: every OrderBuilder method is called once
 *     and displayed with its name, grouped by category.
 *   - Sprite registration: unicolor and multicolor sprites built in `init()`, then
 *     referenced by ID in `sprite`, `spriteCloud`, and `fillSprite` orders.
 *   - The static-layer pattern at scale: all orders are sent once in `initUser`,
 *     the `updateUser` loop does zero network work.
 *
 * Key Concepts:
 *   - `engine.getSpriteRegistry()` — returns the sprite registry; call `.register(id, spriteData)` to pre-load sprites by ID.
 *   - `layer.setOrders(orders)` — sets the order list for a layer; call `layer.commit()` to flush to the client.
 *   - Orders execute sequentially on the client: later orders paint OVER earlier ones on the same layer.
 *   - Maximum 255 orders per layer per frame.
 *   - `fill`, `fillChar`, `fillSprite`, `fullFrame`, `fullFrameMulti` cover the ENTIRE layer surface → must be placed on dedicated layers or used as the very first order.
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

interface DrawingOrdersUserData {
  layer: Layer;
}

export class DrawingOrders implements IApplication<
  Engine,
  User<DrawingOrdersUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const palette = [
      { colorId: 0, r: 10, g: 10, b: 18, a: 255 }, // Background
      { colorId: 1, r: 240, g: 240, b: 248, a: 255 }, // White (labels)
      { colorId: 2, r: 100, g: 200, b: 255, a: 255 }, // Blue
      { colorId: 3, r: 180, g: 255, b: 180, a: 255 }, // Green
      { colorId: 4, r: 255, g: 200, b: 100, a: 255 }, // Amber
      { colorId: 5, r: 220, g: 180, b: 255, a: 255 }, // Violet
      { colorId: 6, r: 255, g: 130, b: 130, a: 255 }, // Red
      { colorId: 7, r: 100, g: 255, b: 200, a: 255 }, // Teal
      { colorId: 8, r: 255, g: 180, b: 220, a: 255 }, // Pink
      { colorId: 9, r: 60, g: 60, b: 80, a: 255 }, // Dark gray
      { colorId: 10, r: 25, g: 25, b: 40, a: 255 }, // Darker bg
    ];
    engine.loadPaletteToSlot(0, palette);
    runtime.setTickRate(10);

    // --- Register Sprites ---
    /**
     * Sprites are preloaded cell matrices. We register them here in init()
     * so they are available to all users. Only the sprite ID is sent at draw time.
     */
    const spriteReg = engine.getSpriteRegistry();

    // Unicolor sprite (ID 0): 4x4 house shape.
    // Each cell is a char code: 0 = transparent, any other value = that character.
    // All non-zero cells are drawn with the uniform fg/bg you specify at draw time.
    // This differs from multicolor sprites where each cell has its own fg/bg.
    spriteReg.loadUnicolorSprites([
      {
        spriteId: 0,
        width: 4,
        height: 4,
        data: [" /\\ ", "/##\\", "|..|", "|__|"],
      },
    ]);

    // Multicolor sprite (ID 1): 4x4 gem shape. Each cell has its own char/fg/bg.
    // Colors are embedded — no tinting needed at draw time.
    spriteReg.loadMulticolorSprites([
      {
        spriteId: 1,
        width: 4,
        height: 4,
        data: [
          { charCode: " ", fgColorId: 0, bgColorId: 0 },
          { charCode: "/", fgColorId: 2, bgColorId: 0 },
          { charCode: "\\", fgColorId: 2, bgColorId: 0 },
          { charCode: " ", fgColorId: 0, bgColorId: 0 },
          { charCode: "/", fgColorId: 3, bgColorId: 0 },
          { charCode: "#", fgColorId: 7, bgColorId: 10 },
          { charCode: "#", fgColorId: 7, bgColorId: 10 },
          { charCode: "\\", fgColorId: 3, bgColorId: 0 },
          { charCode: "\\", fgColorId: 4, bgColorId: 0 },
          { charCode: "#", fgColorId: 4, bgColorId: 10 },
          { charCode: "#", fgColorId: 4, bgColorId: 10 },
          { charCode: "/", fgColorId: 4, bgColorId: 0 },
          { charCode: " ", fgColorId: 0, bgColorId: 0 },
          { charCode: "\\", fgColorId: 6, bgColorId: 0 },
          { charCode: "/", fgColorId: 6, bgColorId: 0 },
          { charCode: " ", fgColorId: 0, bgColorId: 0 },
        ],
      },
    ]);

    // Small 2x2 sprites for clouds (IDs 2-3)
    spriteReg.loadUnicolorSprites([
      { spriteId: 2, width: 2, height: 2, data: [1, 1, 1, 1] },
    ]);
    spriteReg.loadMulticolorSprites([
      {
        spriteId: 3,
        width: 2,
        height: 2,
        data: [
          { charCode: "X", fgColorId: 6, bgColorId: 0 },
          { charCode: "O", fgColorId: 7, bgColorId: 0 },
          { charCode: "O", fgColorId: 7, bgColorId: 0 },
          { charCode: "X", fgColorId: 6, bgColorId: 0 },
        ],
      },
    ]);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<DrawingOrdersUserData>,
  ): void {
    const width = 120;
    const height = 80;

    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);

    const layer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    user.data.layer = layer;

    const orders: any[] = [];

    // Background
    orders.push(OrderBuilder.fill(".", 9, 0));

    // Title
    orders.push(OrderBuilder.rect(0, 0, width, 2, " ", 1, 10, true));
    orders.push(
      OrderBuilder.text(
        2,
        0,
        "--- DRAWING ORDERS CATALOG (29 methods) ---",
        1,
        10,
      ),
    );

    // =====================================================================
    // SECTION 1: SHAPES (y = 3)
    // =====================================================================
    orders.push(OrderBuilder.text(2, 3, "[ SHAPES ]", 4, 0));

    // --- rect ---
    /** OrderBuilder.rect(x, y, w, h, char, fg, bg, filled) */
    orders.push(OrderBuilder.text(2, 5, "rect(fill)", 1, 0));
    orders.push(OrderBuilder.rect(2, 7, 8, 5, "#", 4, 0, true));

    orders.push(OrderBuilder.text(13, 5, "rect(line)", 1, 0));
    orders.push(OrderBuilder.rect(13, 7, 8, 5, "#", 4, 0, false));

    // --- circle ---
    /** OrderBuilder.circle(cx, cy, r, { charCode?, fgColor, bgColor?, filled }) */
    orders.push(OrderBuilder.text(24, 5, "circle(f)", 1, 0));
    orders.push(OrderBuilder.circle(28, 10, 3, { fgColor: 2, filled: true }));

    orders.push(OrderBuilder.text(35, 5, "circle(o)", 1, 0));
    orders.push(
      OrderBuilder.circle(39, 10, 3, {
        charCode: "o",
        fgColor: 2,
        filled: false,
      }),
    );

    // --- line ---
    /** OrderBuilder.line(x1, y1, x2, y2, { charCode?, fgColor, bgColor? }) */
    orders.push(OrderBuilder.text(46, 5, "line", 1, 0));
    orders.push(
      OrderBuilder.line(46, 7, 55, 12, { charCode: "*", fgColor: 6 }),
    );

    // --- triangle ---
    /** OrderBuilder.triangle(x1,y1, x2,y2, x3,y3, { charCode?, fgColor, filled }) */
    orders.push(OrderBuilder.text(58, 5, "tri(fill)", 1, 0));
    orders.push(
      OrderBuilder.triangle(63, 7, 58, 12, 68, 12, {
        fgColor: 7,
        filled: true,
      }),
    );

    orders.push(OrderBuilder.text(71, 5, "tri(line)", 1, 0));
    orders.push(
      OrderBuilder.triangle(76, 7, 71, 12, 81, 12, {
        charCode: "T",
        fgColor: 7,
        filled: false,
      }),
    );

    // --- ellipse ---
    /** OrderBuilder.ellipse(cx, cy, rx, ry, { charCode?, fgColor, bgColor?, filled }) */
    orders.push(OrderBuilder.text(84, 5, "ellipse(f)", 1, 0));
    orders.push(
      OrderBuilder.ellipse(89, 10, 5, 3, { fgColor: 5, filled: true }),
    );

    orders.push(OrderBuilder.text(97, 5, "ellipse(o)", 1, 0));
    orders.push(
      OrderBuilder.ellipse(102, 10, 5, 3, {
        charCode: "e",
        fgColor: 5,
        filled: false,
      }),
    );

    // --- polyline ---
    /** OrderBuilder.polyline(points[], charCode, fgColorId) — open path */
    orders.push(OrderBuilder.text(2, 14, "polyline", 1, 0));
    orders.push(
      OrderBuilder.polyline(
        [
          { x: 2, y: 22 },
          { x: 6, y: 16 },
          { x: 10, y: 20 },
          { x: 14, y: 16 },
        ],
        "/",
        8,
      ),
    );

    // --- polygon ---
    /** OrderBuilder.polygon(points[], charCode, fgColorId) — closed path */
    orders.push(OrderBuilder.text(18, 14, "polygon", 1, 0));
    orders.push(
      OrderBuilder.polygon(
        [
          { x: 21, y: 16 },
          { x: 28, y: 18 },
          { x: 26, y: 22 },
          { x: 19, y: 21 },
        ],
        "+",
        6,
      ),
    );

    // =====================================================================
    // SECTION 2: ATOMIC (y = 14, right side)
    // =====================================================================
    orders.push(OrderBuilder.text(35, 14, "[ ATOMIC ]", 4, 0));

    // --- char ---
    /** OrderBuilder.char(x, y, character, fgColorId, bgColorId) */
    orders.push(OrderBuilder.text(35, 16, "char", 1, 0));
    orders.push(OrderBuilder.char(38, 18, "@", 2, 0));

    // --- text ---
    /** OrderBuilder.text(x, y, string, fgColorId, bgColorId) */
    orders.push(OrderBuilder.text(43, 16, "text", 1, 0));
    orders.push(OrderBuilder.text(43, 18, "Hello!", 3, 0));

    // --- textMultiline ---
    /** OrderBuilder.textMultiline(x, y, string, fgColorId, bgColorId) */
    orders.push(OrderBuilder.text(53, 16, "multiline", 1, 0));
    orders.push(
      OrderBuilder.textMultiline(53, 18, "Line1\nLine2\nLine3", 7, 0),
    );

    // =====================================================================
    // SECTION 3: FILLS (y = 25) — each needs its own dedicated layer
    // =====================================================================
    orders.push(OrderBuilder.text(2, 25, "[ FILLS ]", 4, 0));

    // --- fill ---
    /** OrderBuilder.fill(char, fg, bg) — fills ENTIRE layer */
    orders.push(OrderBuilder.text(2, 27, "fill", 1, 0));
    const fillLayer = new Layer(new Vector2(2, 29), 0, 6, 4, {
      mustBeReliable: true,
    });
    fillLayer.setOrders([OrderBuilder.fill("#", 6, 10)]);
    fillLayer.commit();
    user.addLayer(fillLayer);

    // --- fillChar ---
    /** OrderBuilder.fillChar(repeatX, repeatY, charPattern[], fg, bg) — tiling pattern */
    orders.push(OrderBuilder.text(12, 27, "fillChar", 1, 0));
    const fillCharLayer = new Layer(new Vector2(12, 29), 0, 8, 4, {
      mustBeReliable: true,
    });
    fillCharLayer.setOrders([
      OrderBuilder.fillChar(2, 2, ["X", "O", "O", "X"], 3, 10),
    ]);
    fillCharLayer.commit();
    user.addLayer(fillCharLayer);

    // --- fillSprite ---
    /** OrderBuilder.fillSprite(spriteId, fg, bg) — tiles unicolor sprite, tinted */
    orders.push(OrderBuilder.text(24, 27, "fillSprite", 1, 0));
    const fillSpriteLayer = new Layer(new Vector2(24, 29), 0, 8, 4, {
      mustBeReliable: true,
    });
    fillSpriteLayer.setOrders([OrderBuilder.fillSprite(0, 5, 10)]);
    fillSpriteLayer.commit();
    user.addLayer(fillSpriteLayer);

    // --- fillSpriteMulti ---
    /** OrderBuilder.fillSpriteMulti(spriteId) — tiles multicolor sprite */
    orders.push(OrderBuilder.text(36, 27, "fillSprMulti", 1, 0));
    const fillSprMLayer = new Layer(new Vector2(36, 29), 0, 8, 4, {
      mustBeReliable: true,
    });
    fillSprMLayer.setOrders([OrderBuilder.fillSpriteMulti(1)]);
    fillSprMLayer.commit();
    user.addLayer(fillSprMLayer);

    // =====================================================================
    // SECTION 4: FRAMES (y = 25, right side)
    // =====================================================================
    orders.push(OrderBuilder.text(50, 25, "[ FRAMES ]", 4, 0));

    // --- subFrame ---
    /** OrderBuilder.subFrame(x, y, w, h, chars[], fg, bg) */
    orders.push(OrderBuilder.text(50, 27, "subFrame", 1, 0));
    const sfChars = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? "S" : "F",
    );
    orders.push(OrderBuilder.subFrame(50, 29, 6, 5, sfChars, 2, 10));

    // --- subFrameMulti ---
    /** OrderBuilder.subFrameMulti(x, y, w, h, cellData[]) */
    orders.push(OrderBuilder.text(59, 27, "subFrMulti", 1, 0));
    const sfmData = Array.from({ length: 30 }, (_, i) => ({
      charCode: String.fromCharCode(65 + (i % 26)),
      fgColorCode: 1 + (i % 5),
      bgColorCode: 10,
    }));
    orders.push(OrderBuilder.subFrameMulti(59, 29, 6, 5, sfmData));

    // --- fullFrame ---
    /** OrderBuilder.fullFrame(charCodes[], fg, bg) — covers entire layer */
    orders.push(OrderBuilder.text(70, 27, "fullFrame", 1, 0));
    const ffLayer = new Layer(new Vector2(70, 29), 0, 6, 5, {
      mustBeReliable: true,
    });
    const ffChars = Array.from(
      { length: 30 },
      () => 65 + Math.floor(Math.random() * 26),
    );
    ffLayer.setOrders([OrderBuilder.fullFrame(ffChars, 5, 10)]);
    ffLayer.commit();
    user.addLayer(ffLayer);

    // --- fullFrameMulti ---
    /** OrderBuilder.fullFrameMulti(cellData[]) — per-cell char+fg+bg */
    orders.push(OrderBuilder.text(79, 27, "fullFrMulti", 1, 0));
    const ffmLayer = new Layer(new Vector2(79, 29), 0, 6, 5, {
      mustBeReliable: true,
    });
    const ffmData = Array.from({ length: 30 }, (_, i) => ({
      charCode: String.fromCharCode(33 + (i % 90)),
      fgColorCode: 1 + (i % 8),
      bgColorCode: 10,
    }));
    ffmLayer.setOrders([OrderBuilder.fullFrameMulti(ffmData)]);
    ffmLayer.commit();
    user.addLayer(ffmLayer);

    // =====================================================================
    // SECTION 5: BITMASKS (y = 37)
    // =====================================================================
    orders.push(OrderBuilder.text(2, 37, "[ BITMASKS ]", 4, 0));

    // --- bitmask ---
    /** OrderBuilder.bitmask(x, y, w, h, boolGrid[], char, fg, bg) */
    orders.push(OrderBuilder.text(2, 39, "bitmask", 1, 0));
    const bm2Grid = Array.from({ length: 48 }, () => Math.random() > 0.5);
    orders.push(OrderBuilder.bitmask(2, 41, 8, 6, bm2Grid, "#", 2, 0));

    // --- bitmask4 ---
    /**
     * OrderBuilder.bitmask4(x, y, w, h, stateGrid[], variants[3])
     * 4 possible states per cell: 0 = empty (transparent), 1-3 = variant.
     * Exactly 3 variants must be provided.
     */
    orders.push(OrderBuilder.text(14, 39, "bitmask4", 1, 0));
    // Deterministic grid showing all 4 states (0=empty, 1, 2, 3)
    const bm4Grid = Array.from({ length: 48 }, (_, i) => i % 4);
    orders.push(
      OrderBuilder.bitmask4(14, 41, 8, 6, bm4Grid, [
        { char: ":", fgColor: 2, bgColor: 0 }, // state 1 (Blue Colon)
        { char: "#", fgColor: 3, bgColor: 0 }, // state 2
        { char: "@", fgColor: 4, bgColor: 0 }, // state 3
      ]),
    );

    // --- bitmask16 ---
    /**
     * OrderBuilder.bitmask16(x, y, w, h, stateGrid[], variants[15])
     * 16 possible states per cell: 0 = empty (transparent), 1-15 = variant.
     * Up to 15 variants must be provided.
     */
    orders.push(OrderBuilder.text(26, 39, "bitmask16", 1, 0));
    // Deterministic grid cycling through all 16 states (0-15)
    const bm16Grid = Array.from({ length: 48 }, (_, i) => i % 16);
    const bm16Variants = [
      { char: ":", fgColor: 2, bgColor: 0 }, // state 1 (Blue Colon)
      { char: "#", fgColor: 2, bgColor: 0 }, // state 2
      { char: "@", fgColor: 3, bgColor: 0 }, // state 3
      { char: "+", fgColor: 4, bgColor: 0 }, // state 4
      { char: "*", fgColor: 5, bgColor: 0 }, // state 5
      { char: "~", fgColor: 6, bgColor: 0 }, // state 6
      { char: "=", fgColor: 7, bgColor: 0 }, // state 7
      { char: "%", fgColor: 8, bgColor: 0 }, // state 8
      { char: "!", fgColor: 2, bgColor: 10 }, // state 9
      { char: "?", fgColor: 3, bgColor: 10 }, // state 10
      { char: "&", fgColor: 4, bgColor: 10 }, // state 11
      { char: "^", fgColor: 5, bgColor: 10 }, // state 12
      { char: "<", fgColor: 6, bgColor: 10 }, // state 13
      { char: ">", fgColor: 7, bgColor: 10 }, // state 14
      { char: "X", fgColor: 1, bgColor: 10 }, // state 15
    ];
    orders.push(OrderBuilder.bitmask16(26, 41, 8, 6, bm16Grid, bm16Variants));

    // =====================================================================
    // SECTION 6: SPRITES (y = 37, right side)
    // =====================================================================
    orders.push(OrderBuilder.text(40, 37, "[ SPRITES ]", 4, 0));

    // --- sprite ---
    /** OrderBuilder.sprite(x, y, spriteId, fg, bg) — unicolor, tinted */
    orders.push(OrderBuilder.text(40, 39, "sprite", 1, 0));
    orders.push(OrderBuilder.sprite(40, 41, 0, 2, 10));

    // --- spriteMulti ---
    /** OrderBuilder.spriteMulti(x, y, spriteId) — multicolor, embedded colors */
    orders.push(OrderBuilder.text(48, 39, "spriteMulti", 1, 0));
    orders.push(OrderBuilder.spriteMulti(48, 41, 1));

    // =====================================================================
    // SECTION 7: CLOUDS (y = 50)
    // =====================================================================
    orders.push(OrderBuilder.text(2, 50, "[ CLOUDS ]", 4, 0));

    // Cloud positions (reused across demos)
    const cloudPositions = [
      { posX: 1, posY: 1 },
      { posX: 5, posY: 1 },
      { posX: 3, posY: 3 },
      { posX: 7, posY: 3 },
      { posX: 1, posY: 5 },
      { posX: 5, posY: 5 },
      { posX: 3, posY: 7 },
      { posX: 7, posY: 7 },
    ];

    // --- dotCloud ---
    /** OrderBuilder.dotCloud(positions[], char, fg, bg) — same char+color at many positions */
    orders.push(OrderBuilder.text(2, 52, "dotCloud", 1, 0));
    orders.push(
      OrderBuilder.dotCloud(
        cloudPositions.map((p) => ({
          posX: p.posX + 2,
          posY: p.posY + 54,
        })),
        "+",
        2,
        0,
      ),
    );

    // --- dotCloudMulti ---
    /** OrderBuilder.dotCloudMulti(data[]) — each dot has its own char+fg+bg */
    orders.push(OrderBuilder.text(14, 52, "dotCloudMC", 1, 0));
    orders.push(
      OrderBuilder.dotCloudMulti(
        cloudPositions.map((p, i) => ({
          posX: p.posX + 14,
          posY: p.posY + 54,
          charCode: "*",
          fgColorCode: 2 + (i % 7),
          bgColorCode: 0,
        })),
      ),
    );

    // --- spriteCloud ---
    /** OrderBuilder.spriteCloud(spriteId, positions[], fg, bg) — same sprite at many positions */
    orders.push(OrderBuilder.text(28, 52, "spriteCloud", 1, 0));
    orders.push(
      OrderBuilder.spriteCloud(
        2,
        cloudPositions.map((p) => ({
          posX: p.posX + 28,
          posY: p.posY + 54,
        })),
        3,
        0,
      ),
    );

    // --- spriteCloudMulti ---
    /** OrderBuilder.spriteCloudMulti(spriteId, positions[]) — same multicolor sprite */
    orders.push(OrderBuilder.text(42, 52, "sprCloudMC", 1, 0));
    orders.push(
      OrderBuilder.spriteCloudMulti(
        3,
        cloudPositions.map((p) => ({
          posX: p.posX + 42,
          posY: p.posY + 54,
        })),
      ),
    );

    // --- spriteCloudVaried ---
    /** OrderBuilder.spriteCloudVaried(data[]) — different sprite+tint per element */
    orders.push(OrderBuilder.text(56, 52, "sprClVaried", 1, 0));
    orders.push(
      OrderBuilder.spriteCloudVaried([
        { posX: 57, posY: 55, spriteIndex: 2, fgColorCode: 4, bgColorCode: 0 },
        { posX: 61, posY: 55, spriteIndex: 2, fgColorCode: 6, bgColorCode: 0 },
        { posX: 57, posY: 59, spriteIndex: 2, fgColorCode: 7, bgColorCode: 0 },
        { posX: 61, posY: 59, spriteIndex: 2, fgColorCode: 8, bgColorCode: 0 },
      ]),
    );

    // --- spriteCloudVariedMulti ---
    /** OrderBuilder.spriteCloudVariedMulti(data[]) — different multicolor sprite per element */
    orders.push(OrderBuilder.text(70, 52, "sprClVarMC", 1, 0));
    orders.push(
      OrderBuilder.spriteCloudVariedMulti([
        { posX: 71, posY: 55, spriteIndex: 3 },
        { posX: 75, posY: 55, spriteIndex: 3 },
        { posX: 71, posY: 59, spriteIndex: 3 },
        { posX: 75, posY: 59, spriteIndex: 3 },
      ]),
    );

    // Apply main layer orders and commit.
    layer.setOrders(orders);
    layer.commit();
    user.addLayer(layer);
  }

  /**
   * No drawing happens here — the catalog is 100% static.
   * This demonstrates the ideal pattern: draw in initUser, commit once,
   * and let the client display the frozen layer indefinitely.
   */
  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    _user: User<DrawingOrdersUserData>,
  ): void { }

  update(_runtime: IRuntime, _engine: Engine): void { }
}
