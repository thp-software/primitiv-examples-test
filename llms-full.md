# Primitiv Engine - LLM Reference Entry Point

> Primitiv is a grid-based rendering engine. It renders cells in a 2D grid via a WebGL or Canvas2D renderer. Applications are pure TypeScript classes that only depend on `@primitiv/engine` and are completely runtime-agnostic.

---

## Architecture

```
Application (pure logic)  →  Runtime (decides transport)  →  Client (WebGL or Canvas2D renderer)
```

- **Application**: A class implementing `IApplication<Engine, User<T>>`. Contains all game/simulation logic. Has zero knowledge of whether it runs locally or over a network.
- **Runtime**: Determines how the app is executed. Options: `standalone` (browser-only), `uws` (WebSocket server), `webrtc-direct` / `webrtc-full` / `webrtc-lite` (WebRTC P2P).
- **Renderer**: A WebGL or Canvas2D terminal renderer on the client that displays the character grid.

Packages: `@primitiv/engine` (app code), `@primitiv/client` (browser runtime), `@primitiv/server` (Node.js runtime).

---

## Cell & Rendering Model

Primitiv's screen is a **2D grid of cells**. Each cell holds exactly three values:

| Field         | Type                       | Meaning                                                                                                  |
| ------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `charCode`    | `number` (8-bit or 16-bit) | Which glyph to draw - an index into the font atlas.                                                      |
| `fgColorCode` | `number` (0–255)           | Foreground color (palette index). The glyph pixels use this color.                                       |
| `bgColorCode` | `number` (0–255)           | Background color (palette index). Empty pixels behind the glyph use this color. Color 255 = transparent. |

### CP437 - The Default Character Set

By default, every Primitiv application uses **Code Page 437 (CP437)**, the classic IBM PC character set. It provides 256 glyphs (charCodes 0–255) in an 8×8 pixel grid per glyph, loaded automatically as **block 0** of the font atlas.

CP437 includes:

- Standard ASCII letters, digits, and punctuation (charCodes 32–126).
- Box-drawing characters (`─│┌┐└┘├┤┬┴┼`) for UI borders and panels.
- Block elements (`█▓▒░`) - these are the key to "pixel art" inside cells, as they fill the cell partially or fully, allowing smooth shading gradients.
- Mathematical and special symbols.

**This means every application starts with 256 ready-to-use glyphs at no cost - no asset loading required.**

### Custom Font Blocks (Sprites)

For tile-based games or custom graphics beyond CP437, additional 256-glyph sprite sheets can be loaded as **font blocks** via `engine.loadFontBlock(index, url)`:

- Block 0 = CP437 (built-in, always available).
- Block 1 = charCodes 256–511 from a custom PNG sprite sheet.
- Block N = charCodes N×256 – (N+1)×256−1.
- Each PNG must be exactly 16 × cellWidth pixels wide × 16 × cellHeight pixels tall (256 glyph slots per block).
- Layers must use `charCodeMode: '16bit'` to address charCodes above 255.
- All blocks share the same cell dimensions declared in `engine.loadFont(cellW, cellH, blockCapacity, ...)`.

See application `11-custom-sprites` for a complete working example.

### Two Usage Patterns

1. **Text / UI mode** (default): Use `OrderBuilder.text()`, `rect()`, `fill()`, `frame()` etc. The engine handles cell layout.
2. **Pixel buffer mode** (advanced): Treat every cell as a single colored pixel by setting `charCode` to a space `" "` (or a block element for shading) and controlling only `bgColorCode`. Build the entire frame as a flat array and submit via `OrderBuilder.subFrameMulti(0, 0, W, H, dots)`. This is exactly how the 3D showcases render raycasted or rasterized scenes.

## Application Lifecycle

Every application implements these methods:

| Method                               | Frequency               | Purpose                                                                 |
| ------------------------------------ | ----------------------- | ----------------------------------------------------------------------- |
| `init(runtime, engine)`              | Once at startup         | Load palettes, fonts, sounds. Set tick rate.                            |
| `initUser(runtime, engine, user)`    | Once per connection     | Create Display, Layers, input bindings. Initialize `user.data`.         |
| `update(runtime, engine)`            | Once per tick           | Global world logic (NPC AI, physics, time).                             |
| `updateUser(runtime, engine, user)`  | Once per tick × N users | Read input, update user state, build drawing orders, **commit layers**. |
| `destroyUser(runtime, engine, user)` | On disconnect           | Clean up user from shared state.                                        |

---

## Critical Rules

1. **Per-user state goes in `user.data`** (typed via `User<T>`). Class-level properties are global/shared across all users.
2. **`layer.commit()` is mandatory.** Without it, nothing is sent to the client. After every layer update, you must commit the layer.
3. **Drawing is declarative.** You build arrays of `OrderBuilder` commands, apply them via `layer.setOrders(orders)`, then commit.
4. **Color is palette-indexed.** Colors are referenced by ID (0–255). Color 255 = transparent. Palettes are loaded into slots via `engine.loadPaletteToSlot()` and assigned to displays via `display.switchPalette()`.
5. **Network cost matters.** Move layers (`layer.setPosition()`) instead of redrawing. Switch palettes instead of recoloring. Use `mustBeReliable: false` for high-frequency layers. Lower tick rate for multiplayer (20 TPS recommended). See **[Order Network Weight Reference](./orders/orders-network-consumption.md)** for per-order byte costs.
6. **255 orders per layer.** A single Layer can hold a maximum of 255 drawing orders per commit. For dense UIs that exceed this limit, split the content across multiple Layers stacked via different zIndex values. See `showcase-01-pseudo-htop` for a working example.

---

## How to Learn Primitiv

**Do not rely only on this document.** Each application source file contains an extensive documentation header (30–80 lines) that explains in detail:

- The concepts it demonstrates and why they matter.
- The algorithm and data structures used.
- The Primitiv API patterns involved with inline explanations.

**To write a new Primitiv application, read `01-simple-matrix/index.ts` first** - it is the minimal "hello world". Then read whichever examples cover the features you need (input, audio, sprites, etc.). The source headers are the primary API reference.

For advanced developers/LLMs looking to optimize network bandwidth, consult the **[Order Network Weight Reference](./orders/orders-network-consumption.md)**.

## Display Scaling Modes

`display.setScalingMode(ScalingMode.X)` controls how the grid is scaled to fit the browser viewport:

| Mode             | Behavior                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `None` (default) | Fills available space. May produce sub-pixel artifacts.                                                                                                                                                   |
| `Eighth`         | Snaps scale to 0.125 increments (1.0, 1.125, 1.25…).                                                                                                                                                      |
| `Quarter`        | Snaps scale to 0.25 increments (1.0, 1.25, 1.5…).                                                                                                                                                         |
| `Half`           | Snaps scale to 0.5 increments (1.0, 1.5, 2.0…).                                                                                                                                                           |
| `Integer`        | Integer scaling only (1×, 2×, 3×…). Crispest pixels, may waste space.                                                                                                                                     |
| `Responsive`     | The grid dimensions (cols × rows) adapt dynamically to the available space instead of the scale factor. The display resizes itself - layers must handle variable dimensions. See `04-responsive-display`. |

---

## Runtimes

Applications are runtime-agnostic. The runtime is chosen at integration time, not by the application. Full working examples for each runtime are located in the `runtimes/` directory:

| Runtime         | Directory                                                 | Transport                                     |
| --------------- | --------------------------------------------------------- | --------------------------------------------- |
| **Standalone**  | [runtimes/standalone/](runtimes/standalone/)              | Browser-only, no server.                      |
| **UWS**         | [runtimes/connected-uws/](runtimes/connected-uws/)        | WebSocket via µWebSockets.                    |
| **WebRTC Full** | [connected-webrtc-full/](runtimes/connected-webrtc-full/) | WebRTC with signaling & STUN server.          |
| **WebRTC Lite** | [connected-webrtc-lite/](runtimes/connected-webrtc-lite/) | Direct WebRTC (P2P without signaling server). |

Refer to each runtime's source code for constructor options and integration patterns.

---

## Application Reference

Each application below is a self-contained tutorial. **Read its source file header** for full documentation of the concepts it demonstrates, the algorithm it uses, and the Primitiv API patterns involved.

| Application                | Source                                                                            | What it teaches                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Simple Matrix**          | [01-simple-matrix/index.ts](applications/01-simple-matrix/index.ts)               | Engine init, Display creation, fixed-size grid, manual frame buffer                                         |
| **Mouse & Keyboard Input** | [02-mouse-keyboard-input/index.ts](applications/02-mouse-keyboard-input/index.ts) | Input bindings (axes & buttons), `getAxis()`, `getButton()`, `text` and `rect` orders                       |
| **World Sectors**          | [03-world-sectors/index.ts](applications/03-world-sectors/index.ts)               | World space, scene management, layer movement, zero-cost scrolling and teleportation                        |
| **Responsive Display**     | [04-responsive-display/index.ts](applications/04-responsive-display/index.ts)     | `ScalingMode.Responsive`, reading display dimensions at runtime                                             |
| **Drawing Orders**         | [05-drawing-orders/index.ts](applications/05-drawing-orders/index.ts)             | **Complete visual catalog of every OrderBuilder method** - shapes, fills, frames, bitmasks, sprites, clouds |
| **Palettes**               | [06-palettes/index.ts](applications/06-palettes/index.ts)                         | Palette system, `loadPaletteToSlot`, `switchPalette`, palette animation (day/night)                         |
| **Multipass**              | [07-multipass/index.ts](applications/07-multipass/index.ts)                       | Multi-layer depth ordering, particle rendering with `dotCloudMulti`                                         |
| **Gamepad Input**          | [08-gamepad-input/index.ts](applications/08-gamepad-input/index.ts)               | Gamepad support, axis values, haptic feedback                                                               |
| **Mobile Input**           | [09-mobile-input/index.ts](applications/09-mobile-input/index.ts)                 | Touch zones, virtual buttons/joysticks, `user.vibrate()`                                                    |
| **Audio**                  | [10-audio/index.ts](applications/10-audio/index.ts)                               | Sound loading, playback, spatial audio, filters, looping                                                    |
| **Custom Sprites**         | [11-custom-sprites/index.ts](applications/11-custom-sprites/index.ts)             | Font blocks, 16-bit charCodes, sprite sheet atlas                                                           |
| **Bridge Communication**   | [12-bridge-communication/index.ts](applications/12-bridge-communication/index.ts) | `sendBridge`, `broadcastBridge`, `bridgeInbox` - engine↔host messaging                                      |
| **Multi-Display**          | [13-multi-display/index.ts](applications/13-multi-display/index.ts)               | Multiple Displays, `setOrigin`, `setRenderPasses`, split-screen                                             |
| **Post-Processing**        | [14-post-process/index.ts](applications/14-post-process/index.ts)                 | CRT scanlines, Ambilight glow, pixel grid overlay                                                           |
| **Multi-User**             | [15-multi-user/index.ts](applications/15-multi-user/index.ts)                     | Global vs per-user loops, `destroyUser`, shared state, tick rate for network                                |
| **CP437**                  | [16-cp437/index.ts](applications/16-cp437/index.ts)                               | Unicode string vs numeric CP437 charCodes, full 256-glyph table                                             |

---

## 2D Showcases

These applications demonstrate advanced UI and performance techniques.

| Application             | Source                                                                              | What it teaches                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pseudo Htop**         | [showcase-01-pseudo-htop/index.ts](applications/showcase-01-pseudo-htop/index.ts)   | Dense terminal UIs, bypassing the 255 order limit via Z-Layers, string padding layouts, CPU/Mem visual bars                                                                                                     |
| **Dungeon Crawler**     | [showcase-02-dungeon/index.ts](applications/showcase-02-dungeon/index.ts)           | Pure engine separation pattern, procedural generation, collision handling, simple viewport mapping                                                                                                              |
| **Game of Life**        | [showcase-03-game-of-life/index.ts](applications/showcase-03-game-of-life/index.ts) | Continuous interactive state, sub-frame simulation decoupled from render loop, advanced mouse interactions                                                                                                      |
| **Starship**            | [showcase-04-spaceship/index.ts](applications/showcase-04-spaceship/index.ts)       | Scene switching via `display.setOrigin()`, `dotCloudMulti` batch rendering, dynamic palette slots (alarm & power off)                                                                                           |
| **Tactical Radar**      | [showcase-05-radar/index.ts](applications/showcase-05-radar/index.ts)               | Sample & hold tracking, phosphor decay with `dotCloudMultiColor`, static/dynamic layer separation pattern                                                                                                       |
| **Navier-Stokes Fluid** | [showcase-06-fluid/index.ts](applications/showcase-06-fluid/index.ts)               | Jos Stam stable fluids (velocity diffuse / project / advect), 216-color 6×6×6 RGB cube palette, block-char luminance dithering (░▒▓█), per-user independent simulation, `getMouseDisplayInfo()` force injection |
| **Terminal Bomber**     | [showcase-07-terminal-bomber/index.ts](applications/showcase-07-terminal-bomber/index.ts) | Multiplayer Bomberman-style game demonstrating fast network synchronization and heatmap-driven bots                                                               |
| **Minimal Snake**       | [showcase-08-snake/index.ts](applications/showcase-08-snake/index.ts)               | Complete Minimal Snake game - the smallest full game possible with Primitiv                                                                                                                                     |
| **Pong**                | [showcase-09-pong/index.ts](applications/showcase-09-pong/index.ts)                 | Action game demonstrating 5-layer Z-buffer depth, 3D beveled frames, interpolated motion trails, and additive collision glows                                                                   |
| **Breakout**            | [showcase-10-breakout/index.ts](applications/showcase-10-breakout/index.ts)         | Physics-based game demonstrating Z-buffer depth, falling entities, and high-intensity collision effects                                                                                         |
| **Minimal Example**     | [showcase-11-minimal-example/index.ts](applications/showcase-11-minimal-example/index.ts) | A minimal interactive skeleton project used as a baseline for articles and tutorials                                                                                                            |

---

## 3D Showcases

These applications demonstrate how Primitiv's character-cell matrix can be treated as a pixel buffer to run classic 3D rasterization and vector algorithms entirely on the CPU side, streaming the results to the WebGL client.

| Application        | Source                                                                                        | What it teaches                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Voxel Space**    | [showcase-3d-01-voxel-space/index.ts](applications/showcase-3d-01-voxel-space/index.ts)       | 1992 Comanche-style heightmap rendering, 1D Y-buffer occlusion, `subFrameMulti` massive updates                                                                                          |
| **Primitiv Craft** | [showcase-3d-02-primitiv-craft/index.ts](applications/showcase-3d-02-primitiv-craft/index.ts) | Full 3D DDA voxel raycasting (Minecraft style), temporal palette animation (day/night), billboard sprite projection                                                                      |
| **Ray Maze**       | [showcase-3d-03-ray-maze/index.ts](applications/showcase-3d-03-ray-maze/index.ts)             | Classic 2.5D DDA raycasting (Wolfenstein 3D style), palette-based depth shading, ZBuffer for sprites, discrete tile movement                                                             |
| **Wireframe 3D**   | [showcase-3d-04-wireframe-3d/index.ts](applications/showcase-3d-04-wireframe-3d/index.ts)     | 3D math projection, Bresenham's line algorithm on character grids, depth fog via ASCII degradation (`#`, `+`, `:`, `.`), infinite procedural generation, CRT & Ambilight post-processing |


---

# Source Code Appendix

This appendix contains the full source code for all applications referenced in the guide above.


## File: applications/01-simple-matrix/index.ts

```typescript
/**
 * Name: simple-matrix
 * Description: The absolute simplest Primitiv application (the true "Hello World").
 * 
 * Why study this: 
 *   It demonstrates the bare minimum setup required to initialize the engine, 
 *   create a fixed-size Display, create a Layer, and push a full frame buffer.
 *   There is no responsive scaling, no input handling, and no bridge communication.
 * 
 * Performance Note:
 *   This app uses `OrderBuilder.subFrameMulti`. This treats the Primitiv Display like 
 *   a classic 2D character array and sends every cell, every tick.
 *   - Standalone Mode (Browser-only): Perfectly fine, zero network cost.
 *   - Connected Mode (Server/Client): Anti-pattern. Wastes massive bandwidth on unchanged cells.
 *   
 *   Because Primitiv is isomorphic, it's a best practice to design your rendering logic with
 *   network consumption in mind. Using compact orders (like `.fill()` or `.circle()`) instead  
 *   of raw frame buffers is a core Primitiv pattern. This ensures your app is instantly ready 
 *   to be streamed from a server (whether for multiplayer or just remote solo play). 
 *   However, always remain pragmatic depending on the specific type of application you are building.
 * 
 * The Cell Concept (Primitiv's Atomic Unit):
 *   Every rendering order ultimately manipulates "Cells" on the Display.
 *   A Cell is composed of 3 core bytes:
 *   1. `charCode` (0-255 by default): The CP437 index of the character. You can provide a raw string 
 *      (like `'A'` or `'█'`) and the Engine will internally convert it into its 0-255 number index.
 *      WARNING: Never use JS `.charCodeAt()` to convert a string yourself. Primitiv uses 
 *      a custom CP437 mapping, not standard ASCII/Unicode.
 *   2. `fgColorCode` (0-255): The Foreground color index from the loaded Palette.
 *   3. `bgColorCode` (0-255): The Background color index from the loaded Palette.
 * 
 * Key Concepts:
 *   - Loading global palettes and setting tick rates.
 *   - Setting up a basic fixed-size `Display`.
 *   - Using `OrderBuilder.subFrameMulti` to send the entire grid in one block.
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
} from '@primitiv/engine';

/**
 * Custom data structure stored for each connected user.
 * In Standalone mode, there is only one user ("Player").
 */
interface SimpleMatrixUserData {
  // We keep a reference to the Layer here so we can easily assign it drawing orders in the updateUser loop.
  layer: Layer;

  // This array holds our custom application state (our random character matrix).
  // While Primitiv retains the visual state of a Layer if no new orders are sent (it freezes),
  // keeping the full logic grid here allows us to perform cheap "delta" calculations 
  // (e.g. updating only 1% of the cells) without needing to recreate the whole scene from scratch.
  grid: { char: string; color: number; bg: number }[];
}

export class SimpleMatrix implements IApplication<Engine, User<SimpleMatrixUserData>> {

  /**
   * Global initialization (called once when the application starts).
   * Use this to load resources shared by all users (palettes, fonts, sounds).
   */
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    // Defines a custom blue-glow color palette.
    const palette = [
      { colorId: 0, r: 2, g: 4, b: 10, a: 255 }, // Deepest Void (Background)
      { colorId: 1, r: 0, g: 60, b: 160, a: 255 }, // Dark Electric
      { colorId: 2, r: 0, g: 110, b: 220, a: 255 }, // Vibrant Blue
      { colorId: 3, r: 0, g: 190, b: 255, a: 255 }, // Electric Cyan
      { colorId: 4, r: 180, g: 240, b: 255, a: 255 }, // White Glow
    ];

    // Palettes must be loaded into "slots" (0-255).
    engine.loadPaletteToSlot(0, palette);

    // Tick rate defines how many times 'update' and 'updateUser' are called per second.
    // 60 FPS provides a smooth, fast refresh rate for the characters.
    runtime.setTickRate(60);
  }

  /**
   * User initialization (called whenever a new client connects).
   * Used to set up the user's private rendering environment (Display and Layers).
   */
  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<SimpleMatrixUserData>,
    _metadata?: any
  ): void {
    // Fixed dimensions for the simplest app possible.
    const width = 80;
    const height = 40;

    user.data.grid = [];

    // The Display is the virtual viewport for this user.
    const display = new Display(0, width, height);
    user.addDisplay(display);

    // Assign a palette bank to this display. Without this, the screen remains black.
    display.switchPalette(0);

    /**
     * WORLD COORDINATES (16-bit Unsigned)
     * The Primitiv Engine world uses 16-bit unsigned coordinates (0 to 65535) for X and Y.
     * The Display acts as a "camera" looking into this world.
     * `setOrigin` defines the top-left coordinate of what the user currently sees.
     */
    display.setOrigin(new Vector2(0, 0));


    /**
     * Layers are the canvas surfaces where drawing orders are placed.
     * We allocate a large surface (256x256) to allow for dynamic resizing.
     * 
     * Constructor Arguments:
     * 1. Position (`new Vector2(x, y)`): 16-bit unsigned world coordinates, independent of the display.
     * 2. Z-Index (`0`): 8-bit depth order (0-255). Higher numbers render on top of lower ones.
     * 3. Width (`256`): 8-bit internal width in cells (1-256).
     * 4. Height (`256`): 8-bit internal height in cells (1-256).
     * 5. Options (`{ mustBeReliable: false }`):
     *    - `mustBeReliable: true`: Forces sending data over a reliable protocol (e.g. TCP/WebSocket). 
     *      Guarantees delivery, but high frequency updates can cause lag/stuttering.
     *    - `mustBeReliable: false`: Sends data over an unreliable channel (e.g. WebRTC UDP data channel).
     *      Frames may be lost during network hiccups, but it ensures the lowest possible latency.
     *      This is the standard for high-framerate dynamic elements (like a constantly updating matrix).
     *    *(Note: This networking distinction only matters in Connected mode).*
     */
    const layer = new Layer(new Vector2(0, 0), 0, 256, 256, { mustBeReliable: false });
    user.data.layer = layer;
    user.addLayer(layer);
  }

  /**
   * Per-user logic loop (called every tick).
   * This is where the actual rendering and animation happens.
   */
  updateUser(_runtime: IRuntime, _engine: Engine, user: User<SimpleMatrixUserData>): void {
    const data = user.data;
    const width = 80;
    const height = 40;
    const layer = data.layer;

    // Characters used for the "digital code" effect.
    const charPool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789░▒▓█';

    // Random generator for individual grid cells.
    const generateCell = () => {
      const r = Math.random();
      if (r < 0.5) return { char: ' ', color: 0, bg: 0 }; // Empty space
      if (r < 0.8) {
        // Random digital character with vibrant colors.
        return {
          char: charPool[Math.floor(Math.random() * charPool.length)],
          color: 1 + Math.floor(Math.random() * 4),
          bg: 0,
        };
      }
      // Structural blocks (background-only).
      return {
        char: ' ',
        color: 0,
        bg: 1 + Math.floor(Math.random() * 2),
      };
    };

    const totalCells = width * height;

    // Initialize the grid on the first tick, otherwise just update a few cells.
    if (data.grid.length === 0) {
      data.grid = Array.from({ length: totalCells }, generateCell);
    } else {
      // Update only a small percentage of cells per frame to create a persistent "scrolling" feel.
      const updateCount = Math.floor(totalCells * 0.01);
      for (let i = 0; i < updateCount; i++) {
        const idx = Math.floor(Math.random() * totalCells);
        data.grid[idx] = generateCell();
      }
    }

    /**
     * BATCH RENDERING
     * We map the grid data to a structure compatible with 'subFrameMulti'.
     */
    const frameData = data.grid.map((cell: any) => {
      return {
        charCode: cell.char,
        fgColorCode: cell.color,
        bgColorCode: cell.bg,
      };
    });

    /**
     * We use 'subFrameMulti' to send the entire grid in one contiguous block.
     * While this is the "easiest" way to write an app (acting like a classic 2D array),
     * it means we are sending *every cell every frame* over the network.
     * In Standalone (local browser) mode, this is fine. 
     * In Connected (Server) mode, this wastes massive bandwidth for cells that did not change.
     */
    if (frameData.length > 0) {
      const order = OrderBuilder.subFrameMulti(0, 0, width, height, frameData);
      layer.setOrders([order]);
    }

    // REQUIRED!
    // Layer commits are mandatory to signal that data is ready to be rendered.


  }

  // Global update (called every tick, independent of users).
  // Kept empty in this minimal example.
  update(_runtime: IRuntime, _engine: Engine): void { }
}
```

---

## File: applications/02-mouse-keyboard-input/index.ts

```typescript
/**
 * Name: mouse-keyboard-input
 * Description: Demonstration of input handling (Keyboard and Mouse).
 *
 * Why study this:
 *   After initializing the engine and pushing a frame (seen in 01-simple-matrix),
 *   the next logical step is interaction. This application shows how to map raw hardware
 *   inputs into logical game actions and how to query their state per-frame.
 *
 * Input Binding (The Registry):
 *   Primitiv enforces an abstraction strictly separating physical hardware from game logic.
 *   - You do NOT hardcode `if (Keyboard.KeyW)`.
 *   - Instead, you define a logical binding via `registry.defineButton(id, 'JUMP', [...])`.
 *   - Then, in your loop: `user.getButton('JUMP')`.
 *   This makes adding new input sources or allowing custom keymaps trivial.
 *
 * Input State Types:
 *   - `getButton(name)`: true if the button is currently held down this tick.
 *   - `isJustPressed(name)`: true ONLY on the exact tick the button went from up to down.
 *   - `isJustReleased(name)`: true ONLY on the exact tick the button went from down to up.
 *   - `getAxis(name)`: Returns a float from -1.0 to 1.0 (snapped for keyboard keys).
 *
 * Mouse Display Info:
 *   The mouse also provides local 2D coordinates relative to a Display's viewport.
 *   `user.getMouseDisplayInfo()` handles the complex projection from the browser's
 *   CSS pixels into the engine's display-local cell coordinates automatically.
 *
 * Rendering Orders (Introduced here):
 *   In 01-simple-matrix we only used `.subFrameMulti()`. Here we introduce basic UI orders:
 *   - OrderBuilder.text(x, y, string, fgColorId, bgColorId)
 *   - OrderBuilder.char(x, y, character, fgColorId, bgColorId)
 *   - OrderBuilder.rect(x, y, width, height, char, fgColorId, bgColorId, isFilled)
 *   Color IDs (0-255) match the palette slots defined in the `init()` method.
 *
 * Order Execution & Limits:
 *   Note: Orders are drawn exactly in the sequence they appear in the array.
 *   If orders overlap within the same layer, the LAST one in the array is drawn on top.
 *   CRITICAL: A single layer cannot accept more than 255 orders per frame.
 *   Any additional orders beyond this limit will be truncated and ignored.
 *   Depending on the active log level, a warning may appear in the console.
 *
 * Multi-Layer & Reliability:
 *   This example uses two layers: one for the static background/UI (`mustBeReliable: true`)
 *   and one for the fast-moving mouse cursor (`mustBeReliable: false`).
 *   The cursor layer has a higher `zIndex` to appear on top.
 *   `mustBeReliable: false` prevents head-of-line blocking for data changing every frame.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  KeyboardInput,
  MouseInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

interface InputShowcaseUserData {
  staticLayer: Layer;
  dynamicLayer: Layer;
  cursorLayer: Layer;

  // Storing simple UI state changes triggered by "JustPressed" events
  clickCount: number;
  lastAction: string;
}

export class InputShowcase implements IApplication<
  Engine,
  User<InputShowcaseUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const palette = [
      { colorId: 0, r: 15, g: 15, b: 20, a: 255 }, // Dark BG
      { colorId: 1, r: 80, g: 200, b: 120, a: 255 }, // Success Green
      { colorId: 2, r: 250, g: 80, b: 80, a: 255 }, // Action Red
      { colorId: 3, r: 200, g: 200, b: 250, a: 255 }, // Text White
      { colorId: 4, r: 100, g: 100, b: 150, a: 255 }, // Text Gray
    ];
    engine.loadPaletteToSlot(0, palette);
    runtime.setTickRate(60);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<InputShowcaseUserData>,
  ): void {
    const width = 80;
    const height = 40;

    user.data.clickCount = 0;
    user.data.lastAction = "None";

    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);
    display.setOrigin(new Vector2(0, 0));

    // Z0: Static layer for labels (drawn once, never updated)
    const staticLayer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    user.data.staticLayer = staticLayer;
    user.addLayer(staticLayer);

    // Z1: Dynamic layer for changing values
    const dynamicLayer = new Layer(new Vector2(0, 0), 1, width, height, {
      mustBeReliable: false,
    });
    user.data.dynamicLayer = dynamicLayer;
    user.addLayer(dynamicLayer);

    // Z2: Volatile layer for the fast-moving mouse cursor
    const cursorLayer = new Layer(new Vector2(0, 0), 2, width, height, {
      mustBeReliable: false,
    });
    user.data.cursorLayer = cursorLayer;
    user.addLayer(cursorLayer);

    // Draw static UI once (labels that never change)
    const staticOrders: any[] = [];
    staticOrders.push(
      OrderBuilder.fill(" ", 0, 0),
      OrderBuilder.text(2, 2, "--- PRIMITIV INPUT SHOWCASE ---", 3, 0),
      OrderBuilder.text(2, 4, "Keyboard and Mouse input demo.", 4, 0),
      OrderBuilder.text(2, 7, "ACTION STATE:", 3, 0),
      OrderBuilder.text(18, 7, "isPressed:", 4, 0),
      OrderBuilder.text(18, 8, "Events:", 4, 0),
      OrderBuilder.text(2, 11, "MOUSE TRACKING:", 3, 0),
      OrderBuilder.text(18, 13, "Right Button Held:", 4, 0),
      OrderBuilder.text(2, 16, "AXIS MAPPING:", 3, 0),
      OrderBuilder.text(18, 16, "(Arrow Keys)", 4, 0),
      OrderBuilder.text(18, 17, "Move X:", 4, 0),
      OrderBuilder.text(35, 17, "Move Y:", 4, 0),
      OrderBuilder.text(18, 19, "(Left Shift)", 4, 0),
      OrderBuilder.text(18, 20, "Accelerate:", 4, 0),
      OrderBuilder.rect(10, 22, 21, 1, "-", 4, 0, true),
    );
    staticLayer.setOrders(staticOrders);


    /**
     * LOGICAL INPUT BINDINGS
     * We map hardware constants to semantic names.
     * Keyboard and Mouse only - see 08-gamepad-input for gamepad bindings.
     */
    const registry = user.getInputBindingRegistry();

    // 1. Basic Action (Keyboard Space bar)
    registry.defineButton(0, "ACTION_A", [
      { sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
    ]);

    // 2. Mouse Buttons
    registry.defineButton(1, "CLICK_LEFT", [
      {
        sourceId: 2,
        type: InputDeviceType.Mouse,
        mouseButton: MouseInput.LeftButton,
      },
    ]);
    registry.defineButton(2, "CLICK_RIGHT", [
      {
        sourceId: 3,
        type: InputDeviceType.Mouse,
        mouseButton: MouseInput.RightButton,
      },
    ]);

    // 3. Keyboard Axes
    // Pressing Left produces -1.0, Right produces 1.0.
    registry.defineAxis(0, "MOVE_X", [
      {
        sourceId: 4,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowLeft,
        positiveKey: KeyboardInput.ArrowRight,
      },
    ]);

    registry.defineAxis(1, "MOVE_Y", [
      {
        sourceId: 5,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowUp,
        positiveKey: KeyboardInput.ArrowDown,
      },
    ]);

    // 4. Keyboard modifier as an axis (0.0 or 1.0)
    registry.defineAxis(2, "ACCELERATE", [
      {
        sourceId: 6,
        type: InputDeviceType.Keyboard,
        positiveKey: KeyboardInput.ShiftLeft,
      },
    ]);

    // 5. Mouse Scroll Wheel
    registry.defineAxis(3, "SCROLL_Y", [
      {
        sourceId: 7,
        type: InputDeviceType.Mouse,
        mouseAxis: MouseInput.WheelDeltaY,
      },
    ]);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<InputShowcaseUserData>,
  ): void {
    const data = user.data;
    const dynamicLayer = data.dynamicLayer;
    const cursorLayer = data.cursorLayer;

    const orders: any[] = [];
    const cursorOrders: any[] = [];

    /**
     * STATE TRACKING: isJustPressed vs isPressed
     */
    const isActionHeld = user.getButton("ACTION_A");
    const isActionJustPressed = user.isJustPressed("ACTION_A");
    const isActionJustReleased = user.isJustReleased("ACTION_A");

    if (isActionJustPressed) data.lastAction = "Pressed Space";
    if (isActionJustReleased) data.lastAction = "Released Space";

    orders.push(
      OrderBuilder.text(
        29,
        7,
        isActionHeld ? "YES" : "NO ",
        isActionHeld ? 1 : 4,
        0,
      ),
      OrderBuilder.text(29, 8, data.lastAction.padEnd(15, " "), 2, 0),
    );

    /**
     * MOUSE INTERACTION
     * getMouseDisplayInfo() returns null if the mouse is outside the active display.
     */
    const mouse = user.getMouseDisplayInfo();
    let mouseText = "Mouse outside viewport";

    if (mouse) {
      // mouse.localX and localY are correctly snapped to the grid (0 to display.width)
      const mx = Math.floor(mouse.localX);
      const my = Math.floor(mouse.localY);
      mouseText = `X: ${mx}, Y: ${my}`.padEnd(22, " ");

      // Draw a crosshair at the mouse position on the volatile layer
      cursorOrders.push(OrderBuilder.char(mx, my, "+", 2, 0));

      // Mouse clicking logic
      if (user.isJustPressed("CLICK_LEFT")) {
        data.clickCount++;
      }
    }

    orders.push(
      OrderBuilder.text(18, 11, mouseText, 4, 0),
      OrderBuilder.text(
        18,
        12,
        `Left Clicks: ${data.clickCount}`.padEnd(20, " "),
        4,
        0,
      ),
    );

    const isRightHeld = user.getButton("CLICK_RIGHT");
    const scrollY = user.getAxis("SCROLL_Y");

    orders.push(
      OrderBuilder.text(
        37,
        13,
        isRightHeld ? "YES" : "NO ",
        isRightHeld ? 1 : 4,
        0,
      ),
      OrderBuilder.text(
        18,
        14,
        `Scroll Wheel Y: ${scrollY.toFixed(2)}`.padEnd(25, " "),
        scrollY !== 0 ? 1 : 4,
        0,
      ),
    );

    /**
     * KEYBOARD AXES
     */
    const moveX = user.getAxis("MOVE_X");
    const moveY = user.getAxis("MOVE_Y");
    const accel = user.getAxis("ACCELERATE");

    orders.push(
      OrderBuilder.text(
        26,
        17,
        moveX.toFixed(2).padStart(5, " "),
        moveX !== 0 ? 1 : 4,
        0,
      ),
      OrderBuilder.text(
        43,
        17,
        moveY.toFixed(2).padStart(5, " "),
        moveY !== 0 ? 1 : 4,
        0,
      ),
      OrderBuilder.text(
        30,
        20,
        accel.toFixed(2).padStart(5, " "),
        accel > 0 ? 1 : 4,
        0,
      ),
    );

    // Visual Axis Indicator
    // Draw a small block that moves horizontally based on the X axis.
    const centerX = 20;
    const indicatorX = centerX + Math.floor(moveX * 10);
    orders.push(
      OrderBuilder.rect(10, 22, 21, 1, "-", 4, 0, true),
      OrderBuilder.char(indicatorX, 22, "█", 2, 0),
    );

    // Apply all orders and send to the engine
    dynamicLayer.setOrders(orders);


    cursorLayer.setOrders(cursorOrders);

  }

  update(_runtime: IRuntime, _engine: Engine): void {}
}
```

---

## File: applications/03-world-sectors/index.ts

```typescript
/**
 * Name: world-sectors
 * Description: Demonstrates world space, scene management, and layer manipulation without redrawing.
 *
 * Why study this:
 *   In previous examples, we sent new drawing orders every single frame. This is extremely costly.
 *   Primitiv's client is stateful: Once a layer is drawn, the client remembers it.
 *   To optimize your game, you should draw a layer ONCE (or rarely), and then simply move it, hide it,
 *   or move the camera (Display) to see different parts of the 65535x65535 world.
 *
 * The World Grid & Camera (Display):
 *    The engine world is a massive 65535x65535 grid. The `Display` is just a rectangular camera.
 *    Changing `display.setOrigin(new Vector2(x, y))` instantly teleports the user's view
 *    with zero network overhead for drawing. This allows you to pre-build "levels" or "scenes"
 *    in different sectors of the world and just jump between them.
 *
 * Moving Layers (Zero-Cost Translation):
 *    If an object moves but doesn't change its internal graphics, DO NOT redraw it!
 *    Calling `layer.setOrigin(new Vector2(x, y))` sends only the new coordinates (4 bytes),
 *    saving immense bandwidth compared to resending text or pixel orders.
 *
 * Hiding/Showing Layers (Zero-Cost Toggling):
 *    You can pre-load a layer (like a heavy UI menu) and use `layer.setEnabled(true/false)`.
 *    This toggles visibility instantly on the client without destroying or resending
 *    the drawing orders previously stored in memory.
 *
 * Zero-Cost Teleportation:
 *    Because everything is pre-drawn in different world coordinates, "teleporting" and
 *    "switching scenes" is reduced to a single camera position change.
 *
 * What this example demonstrates:
 *   - A 65535×65535 world pre-populated with three "sectors" (rooms), each drawn once
 *     during `initUser`. The camera teleports between them via `display.setOrigin()`.
 *   - A vehicle layer that translates across world space every tick with only 4 bytes
 *     of network overhead - no drawing orders resent.
 *   - A HUD layer that is toggled on/off with `layer.setEnabled()`, demonstrating
 *     zero-cost visibility switching without destroying or re-uploading the layer data.
 *
 * Key Concepts:
 *   - `display.setOrigin(new Vector2(x, y))` - move the camera to any world position; zero network cost for drawing.
 *   - `layer.setOrigin(new Vector2(x, y))` - translate a layer without resending its orders; only the coordinates are transmitted.
 *   - `layer.setEnabled(bool)` - toggle layer visibility on the client without any redraw.
 *   - `` - MUST be called after `setOrders()` AND after any metadata change (`setOrigin`, `setEnabled`) to flush the update to the client.
 *   - Multiple z-indexes: layers with higher zIndex paint over lower ones, enabling HUD overlays.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  KeyboardInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

interface WorldSectorsUserData {
  /** The user's main camera view into the 16-bit world space. */
  display: Display;

  /** Reference to the vehicle layer so we can move its origin per-frame. */
  vehicleLayer: Layer;
  /** Logical position of the vehicle (accumulates smooth movement). */
  vehiclePos: { x: number; y: number };

  /** Reference to the UI HUD layer for zero-cost visibility toggling. */
  hudLayer: Layer;
}

export class WorldSectors implements IApplication<
  Engine,
  User<WorldSectorsUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const palette = [
      { colorId: 0, r: 10, g: 10, b: 15, a: 255 }, // Global Dark Void
      { colorId: 1, r: 40, g: 80, b: 40, a: 255 }, // S1: Moss Green (Accent)
      { colorId: 2, r: 100, g: 50, b: 40, a: 255 }, // S2: Earth Red (Accent)
      { colorId: 3, r: 40, g: 50, b: 100, a: 255 }, // S3: Steel Blue (Accent)
      { colorId: 4, r: 255, g: 255, b: 100, a: 255 }, // Vehicle Yellow
      { colorId: 5, r: 150, g: 160, b: 180, a: 255 }, // HUD Blue-Gray
      { colorId: 6, r: 240, g: 240, b: 248, a: 255 }, // Text Off-White
      { colorId: 7, r: 5, g: 20, b: 5, a: 255 }, // S1: Deep Forest (Background)
      { colorId: 8, r: 25, g: 10, b: 5, a: 255 }, // S2: Deep Sun-baked (Background)
      { colorId: 9, r: 5, g: 10, b: 25, a: 255 }, // S3: Deep Midnight (Background)
    ];
    engine.loadPaletteToSlot(0, palette);
    runtime.setTickRate(20);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<WorldSectorsUserData>,
  ): void {
    const width = 80;
    const height = 40;

    // Create the user camera
    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);
    display.setOrigin(new Vector2(0, 0)); // Start in Sector 1
    user.data.display = display;

    // --------------------------------------------------------------------------------
    // PRELOADING SECTORS (Executed ONCE)
    // --------------------------------------------------------------------------------

    // SECTOR 1: The Grasslands
    const s1 = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    s1.setOrders([
      /**
       * OrderBuilder.fill(char, fgColorId, bgColorId)
       * Fills the entire layer surface with a single character and color pair.
       * This is the CHEAPEST way to draw a background.
       */
      OrderBuilder.fill(".", 1, 7),

      /**
       * OrderBuilder.rect(x, y, w, h, char, fgColorId, bgColorId, isFilled)
       * Draws a rectangle. If isFilled=true, it clears the interior.
       * If isFilled=false, it only draws the border.
       */
      OrderBuilder.rect(2, 2, 40, 5, " ", 6, 0, true),
      OrderBuilder.text(4, 3, "SECTOR 1: THE GRASSLANDS", 1, 0),
      OrderBuilder.text(4, 4, "Press [1], [2], [3] to change sectors", 6, 0),
      OrderBuilder.text(4, 5, "Press [SPACE] to toggle HUD", 6, 0),
    ]);
    // VERY IMPORTANT: Even in initUser, you MUST call commit() after setOrders()
    // or any state change (origin, zIndex, enabled) to signal the engine to sync it.

    user.addLayer(s1);

    // SECTOR 2: The Red Desert
    const s2 = new Layer(new Vector2(1000, 1000), 0, width, height, {
      mustBeReliable: true,
    });
    s2.setOrders([
      OrderBuilder.fill(".", 2, 8),
      OrderBuilder.rect(2, 2, 40, 5, " ", 6, 0, true),
      OrderBuilder.text(4, 3, "SECTOR 2: THE RED DESERT", 2, 0),
      OrderBuilder.text(4, 4, "Notice how fast teleporting is.", 6, 0),
      OrderBuilder.text(4, 5, "You are at coordinates (1000, 1000).", 6, 0),
    ]);

    user.addLayer(s2);

    // SECTOR 3: The Deep Ocean
    const s3 = new Layer(new Vector2(2000, 0), 0, width, height, {
      mustBeReliable: true,
    });
    s3.setOrders([
      OrderBuilder.fill(".", 3, 9),
      OrderBuilder.rect(2, 2, 40, 5, " ", 6, 0, true),
      OrderBuilder.text(4, 3, "SECTOR 3: THE DEEP OCEAN", 3, 0),
      OrderBuilder.text(4, 4, "Drive your vehicle around with Arrows.", 6, 0),
      OrderBuilder.text(
        4,
        5,
        "The layer moves, but we send NO new orders!",
        6,
        0,
      ),
    ]);

    user.addLayer(s3);

    // --------------------------------------------------------------------------------
    // PRELOADING MOVING ELEMENTS
    // --------------------------------------------------------------------------------

    // VEHICLE: A tiny 3x3 layer that we will move around.
    user.data.vehiclePos = { x: 38, y: 18 };
    const vehicleLayer = new Layer(
      new Vector2(user.data.vehiclePos.x, user.data.vehiclePos.y),
      1,
      4,
      3,
      { mustBeReliable: false },
    );
    vehicleLayer.setOrders([
      OrderBuilder.text(0, 0, "/--\\", 4, 0),
      OrderBuilder.text(0, 1, "|  |", 4, 0),
      OrderBuilder.text(0, 2, "\\--/", 4, 0),
    ]);

    user.addLayer(vehicleLayer);
    user.data.vehicleLayer = vehicleLayer;

    // HOLOGRAPHIC HUD: A complex diagnostic menu pre-drawn in initUser.
    // We use a higher Z-index (2) so it appears above sectors and vehicle.
    const hudLayer = new Layer(new Vector2(0, 0), 2, width, height, {
      mustBeReliable: true,
    });
    hudLayer.setOrders([
      // Decorative frame
      OrderBuilder.rect(53, 2, 25, 12, " ", 0, 0, true), // Clear background area
      OrderBuilder.rect(53, 2, 25, 12, "#", 6, 0, false), // Border using only hashes

      // Content
      OrderBuilder.text(55, 3, "--- HUD STATUS ---", 4, 0),
      OrderBuilder.text(55, 5, "VEHICLE: ONLINE", 1, 0),
      OrderBuilder.text(55, 6, "SECTOR: VALID", 1, 0),
      OrderBuilder.text(55, 7, "RADAR: SCANNING", 1, 0),
      OrderBuilder.text(55, 9, "PRESS [SPACE] TO", 6, 0),
      OrderBuilder.text(55, 10, "CLOSE INTERFACE", 6, 0),

      // Visual pulse decoration
      OrderBuilder.text(55, 12, ">>>>>", 4, 0),
    ]);

    /**
     * layer.setEnabled(boolean)
     * Toggles the visibility of the layer.
     * Hiding a layer does NOT destroy its content; it just tells the client
     * to stop rendering it. This is perfect for toggleable UI menus.
     */
    hudLayer.setEnabled(false);

    user.addLayer(hudLayer);
    user.data.hudLayer = hudLayer;

    // --------------------------------------------------------------------------------
    // INPUT BINDINGS
    // --------------------------------------------------------------------------------
    const registry = user.getInputBindingRegistry();
    registry.defineButton(0, "JUMP_1", [
      {
        sourceId: 1,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit1,
      },
    ]);
    registry.defineButton(1, "JUMP_2", [
      {
        sourceId: 2,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit2,
      },
    ]);
    registry.defineButton(2, "JUMP_3", [
      {
        sourceId: 3,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit3,
      },
    ]);
    registry.defineButton(3, "TOGGLE_HUD", [
      { sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
    ]);

    registry.defineAxis(0, "VEHICLE_X", [
      {
        sourceId: 5,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowLeft,
        positiveKey: KeyboardInput.ArrowRight,
      },
    ]);
    registry.defineAxis(1, "VEHICLE_Y", [
      {
        sourceId: 6,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowUp,
        positiveKey: KeyboardInput.ArrowDown,
      },
    ]);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<WorldSectorsUserData>,
  ): void {
    const data = user.data;
    let teleported = false;

    // 1. Teleport Camera (Display) and Vehicle to different Sectors
    if (user.isJustPressed("JUMP_1")) {
      data.display.setOrigin(new Vector2(0, 0));
      data.vehiclePos = { x: 38, y: 18 };
      teleported = true;
    } else if (user.isJustPressed("JUMP_2")) {
      data.display.setOrigin(new Vector2(1000, 1000));
      data.vehiclePos = { x: 1038, y: 1018 };
      teleported = true;
    } else if (user.isJustPressed("JUMP_3")) {
      data.display.setOrigin(new Vector2(2000, 0));
      data.vehiclePos = { x: 2038, y: 18 };
      teleported = true;
    }

    // If we teleported, we must also snap the HUD to follow the camera Viewport!
    if (teleported) {
      /**
       * layer.setOrigin(Vector2)
       * Updates the layer's world coordinates.
       * Like display.setOrigin, this is a "metadata-only" update.
       * No drawing orders are re-sent. The client just moves the existing surface.
       */
      data.hudLayer.setOrigin(data.display.getOrigin());

      // We MUST commit after changing the origin to sync the new position.

    }

    // 2. Toggle Layer Visibility
    if (user.isJustPressed("TOGGLE_HUD")) {
      data.hudLayer.setEnabled(!data.hudLayer.isEnabled());
      // setEnabled automatically marks the layer as needing commit.
      // But we can call commit explicitly to be safe.

    }

    // 3. Move the Vehicle Layer WITHOUT sending new drawing orders.
    const vx = user.getAxis("VEHICLE_X");
    const vy = user.getAxis("VEHICLE_Y");

    if (vx !== 0 || vy !== 0 || teleported) {
      // Speed factor: less than 1 cell per tick makes it smooth and mathematically accumulate
      const SPEED = 1;
      data.vehiclePos.x += vx * SPEED;
      data.vehiclePos.y += vy * SPEED;

      /**
       * MOVING WITHOUT DRAWING
       * We only update the 2D coordinates. The client already has the
       * vehicle graphic pre-loaded. This loop only sends 4 bytes (X, Y)
       * instead of hundreds of bytes of drawing orders.
       */
      data.vehicleLayer.setOrigin(
        new Vector2(
          Math.floor(data.vehiclePos.x),
          Math.floor(data.vehiclePos.y),
        ),
      );

      // CRITICAL: .commit() is required after EVERY coordinate change
      // to mark the layer for network synchronization this tick.

    }
  }

  update(_runtime: IRuntime, _engine: Engine): void { }
}
```

---

## File: applications/04-responsive-display/index.ts

```typescript
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
 *   - `display.setScalingMode(ScalingMode.Responsive)` - makes the display fill its container and derive grid dimensions from physical pixels ÷ cell size.
 *   - `display.setCellSize(widthPx, heightPx)` - sets the pixel size of each cell (controls the zoom level).
 *   - `display.width` / `display.height` - read these inside `updateUser` every tick; they are updated by the runtime before your logic runs.
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

  /** The fixed-size 256x256 layer. Never resized - the Display clips it. */
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
     * We allocate a 256x256 Layer - much larger than any typical window size.
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
     * visible portion - we never need to resize the grid array.
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
```

---

## File: applications/05-drawing-orders/index.ts

```typescript
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
 *   SHAPES - Geometric primitives drawn at specific coordinates.
 *     rect, circle, ellipse, line, triangle, polyline, polygon
 *
 *   ATOMIC - The smallest drawing units.
 *     char, text, textMultiline
 *
 *   FILLS - Orders that cover the entire layer surface with a pattern.
 *     fill, fillChar, fillSprite, fillSpriteMulti
 *
 *   FRAMES - Block-copy operations: write a rectangular grid of characters at once.
 *     subFrame, subFrameMulti, fullFrame, fullFrameMulti
 *
 *   BITMASKS - Optimized grid renderers where each cell maps to a variant index.
 *     bitmask (binary: on/off), bitmask4 (4 states), bitmask16 (16 states)
 *
 *   SPRITES - Preloaded cell matrices placed by ID (zero payload, only the ID is sent).
 *     sprite (unicolor, tinted), spriteMulti (multicolor, embedded colors)
 *
 *   CLOUDS - Batch rendering: many instances of the same element at multiple positions.
 *     dotCloud, dotCloudMulti, spriteCloud, spriteCloudMulti,
 *     spriteCloudVaried, spriteCloudVariedMulti
 *
 * What is a Sprite in Primitiv?
 *   A sprite is simply a matrix of cells (width x height) preloaded in the engine.
 *   - Unicolor sprites: each cell is a char code (0 = transparent, any other = that character).
 *     At draw time, all non-zero cells are rendered with uniform fg/bg colors you specify.
 *   - Multicolor sprites: each cell has its own { charCode, fgColorId, bgColorId }.
 *   Sprites are registered once in `init()` via `engine.getSpriteRegistry()`.
 *   At draw time, only the sprite ID is sent - the actual cell data was already loaded.
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
 *   - `engine.getSpriteRegistry()` - returns the sprite registry; call `.register(id, spriteData)` to pre-load sprites by ID.
 *   - `layer.setOrders(orders)` - sets the order list for a layer; call `` to flush to the client.
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
    // Colors are embedded - no tinting needed at draw time.
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
    /** OrderBuilder.polyline(points[], charCode, fgColorId) - open path */
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
    /** OrderBuilder.polygon(points[], charCode, fgColorId) - closed path */
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
    // SECTION 3: FILLS (y = 25) - each needs its own dedicated layer
    // =====================================================================
    orders.push(OrderBuilder.text(2, 25, "[ FILLS ]", 4, 0));

    // --- fill ---
    /** OrderBuilder.fill(char, fg, bg) - fills ENTIRE layer */
    orders.push(OrderBuilder.text(2, 27, "fill", 1, 0));
    const fillLayer = new Layer(new Vector2(2, 29), 0, 6, 4, {
      mustBeReliable: true,
    });
    fillLayer.setOrders([OrderBuilder.fill("#", 6, 10)]);

    user.addLayer(fillLayer);

    // --- fillChar ---
    /** OrderBuilder.fillChar(repeatX, repeatY, charPattern[], fg, bg) - tiling pattern */
    orders.push(OrderBuilder.text(12, 27, "fillChar", 1, 0));
    const fillCharLayer = new Layer(new Vector2(12, 29), 0, 8, 4, {
      mustBeReliable: true,
    });
    fillCharLayer.setOrders([
      OrderBuilder.fillChar(2, 2, ["X", "O", "O", "X"], 3, 10),
    ]);

    user.addLayer(fillCharLayer);

    // --- fillSprite ---
    /** OrderBuilder.fillSprite(spriteId, fg, bg) - tiles unicolor sprite, tinted */
    orders.push(OrderBuilder.text(24, 27, "fillSprite", 1, 0));
    const fillSpriteLayer = new Layer(new Vector2(24, 29), 0, 8, 4, {
      mustBeReliable: true,
    });
    fillSpriteLayer.setOrders([OrderBuilder.fillSprite(0, 5, 10)]);

    user.addLayer(fillSpriteLayer);

    // --- fillSpriteMulti ---
    /** OrderBuilder.fillSpriteMulti(spriteId) - tiles multicolor sprite */
    orders.push(OrderBuilder.text(36, 27, "fillSprMulti", 1, 0));
    const fillSprMLayer = new Layer(new Vector2(36, 29), 0, 8, 4, {
      mustBeReliable: true,
    });
    fillSprMLayer.setOrders([OrderBuilder.fillSpriteMulti(1)]);

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
    /** OrderBuilder.fullFrame(charCodes[], fg, bg) - covers entire layer */
    orders.push(OrderBuilder.text(70, 27, "fullFrame", 1, 0));
    const ffLayer = new Layer(new Vector2(70, 29), 0, 6, 5, {
      mustBeReliable: true,
    });
    const ffChars = Array.from(
      { length: 30 },
      () => 65 + Math.floor(Math.random() * 26),
    );
    ffLayer.setOrders([OrderBuilder.fullFrame(ffChars, 5, 10)]);

    user.addLayer(ffLayer);

    // --- fullFrameMulti ---
    /** OrderBuilder.fullFrameMulti(cellData[]) - per-cell char+fg+bg */
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
    /** OrderBuilder.sprite(x, y, spriteId, fg, bg) - unicolor, tinted */
    orders.push(OrderBuilder.text(40, 39, "sprite", 1, 0));
    orders.push(OrderBuilder.sprite(40, 41, 0, 2, 10));

    // --- spriteMulti ---
    /** OrderBuilder.spriteMulti(x, y, spriteId) - multicolor, embedded colors */
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
    /** OrderBuilder.dotCloud(positions[], char, fg, bg) - same char+color at many positions */
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
    /** OrderBuilder.dotCloudMulti(data[]) - each dot has its own char+fg+bg */
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
    /** OrderBuilder.spriteCloud(spriteId, positions[], fg, bg) - same sprite at many positions */
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
    /** OrderBuilder.spriteCloudMulti(spriteId, positions[]) - same multicolor sprite */
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
    /** OrderBuilder.spriteCloudVaried(data[]) - different sprite+tint per element */
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
    /** OrderBuilder.spriteCloudVariedMulti(data[]) - different multicolor sprite per element */
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

    user.addLayer(layer);
  }

  /**
   * No drawing happens here - the catalog is 100% static.
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
```

---

## File: applications/06-palettes/index.ts

```typescript
/**
 * Name: palettes
 * Description: Comprehensive demonstration of the Primitiv palette system.
 *
 * Why study this:
 *   Every previous example loaded a single palette into slot 0 and never touched it again.
 *   But the palette system is one of Primitiv's most useful features for both aesthetics
 *   and network efficiency. Because all drawing orders use COLOR INDICES (0-255) rather than
 *   direct RGB values, changing the palette instantly recolors everything without resending
 *   and smooth color transitions - all at a negligible bandwidth cost (just a few bytes).
 *
 * The Palette System:
 *   - A palette is an array of { colorId, r, g, b, a } entries mapping indices to RGB colors.
 *   - Palettes are loaded into SLOTS (0-255) via `engine.loadPaletteToSlot(slotIndex, entries)`.
 *   - A Display references one palette slot via `display.switchPalette(slotIndex)`.
 *   - Switching palette is INSTANT and FREE: no orders are resent, no layers are redrawn.
 *     The client simply remaps the same color indices to different RGB values.
 *
 * Palette Animation Pattern:
 *   1. In `init()`, pre-compute N palette variations (e.g. 64 palettes for a day/night cycle).
 *   2. Load them into slots 0..N-1 via `loadPaletteToSlot(i, palette)`.
 *   3. Each tick, call `display.switchPalette(currentSlot)` - the entire scene changes color
 *      instantly without any CPU hit and with virtually zero bandwidth cost.
 *   This pattern can achieve smooth day/night cycles, alarm flashes, weather effects,
 *   or any visual mood change - all without redrawing a single order.
 *
 * What this example demonstrates:
 *   - Loading multiple palettes into different slots.
 *   - Switching between palettes with keyboard input (interactive theme switching).
 *   - Smooth animated palette cycling (automatic color rotation over time).
 *   - A static scene that completely changes mood just by switching palettes.
 *
 * Key Concepts:
 *   - Palette slots, loading, and switching.
 *   - Color indices are an indirection layer - the same index can mean different colors.
 *   - Palette animation: pre-compute variations, cycle through them per tick.
 *   - Negligible bandwidth cost for visual transformations via palette swap.
 */

import {
    Engine,
    User,
    Layer,
    Display,
    OrderBuilder,
    Vector2,
    KeyboardInput,
    InputDeviceType,
    type IApplication,
    type IRuntime,
} from '@primitiv/engine';

// =====================================================================
// Palette definitions
// =====================================================================

interface PaletteEntry { colorId: number; r: number; g: number; b: number; a: number; }

/** DAY: bright sky, vivid greens, warm sunlight. */
function makePaletteDay(): PaletteEntry[] {
    return [
        { colorId: 0, r: 135, g: 195, b: 235, a: 255 },   // sky
        { colorId: 1, r: 255, g: 255, b: 255, a: 255 },   // white
        { colorId: 2, r: 60, g: 140, b: 60, a: 255 },     // dark green
        { colorId: 3, r: 90, g: 190, b: 90, a: 255 },     // light green
        { colorId: 4, r: 255, g: 220, b: 80, a: 255 },    // sun yellow
        { colorId: 5, r: 180, g: 120, b: 60, a: 255 },    // brown (wood)
        { colorId: 6, r: 200, g: 80, b: 80, a: 255 },     // roof red
        { colorId: 7, r: 100, g: 100, b: 110, a: 255 },   // stone gray
        { colorId: 8, r: 70, g: 160, b: 220, a: 255 },    // water blue
        { colorId: 9, r: 40, g: 40, b: 50, a: 255 },      // dark accent
        { colorId: 10, r: 20, g: 20, b: 30, a: 255 },     // panel bg
    ];
}

/** SUNSET: warm oranges, purples, golden horizon. */
function makePaletteSunset(): PaletteEntry[] {
    return [
        { colorId: 0, r: 200, g: 100, b: 50, a: 255 },
        { colorId: 1, r: 255, g: 230, b: 200, a: 255 },
        { colorId: 2, r: 50, g: 90, b: 40, a: 255 },
        { colorId: 3, r: 80, g: 120, b: 50, a: 255 },
        { colorId: 4, r: 255, g: 160, b: 30, a: 255 },
        { colorId: 5, r: 120, g: 70, b: 40, a: 255 },
        { colorId: 6, r: 180, g: 50, b: 60, a: 255 },
        { colorId: 7, r: 80, g: 70, b: 80, a: 255 },
        { colorId: 8, r: 180, g: 80, b: 60, a: 255 },
        { colorId: 9, r: 40, g: 20, b: 20, a: 255 },
        { colorId: 10, r: 25, g: 12, b: 12, a: 255 },
    ];
}

/** NIGHT: deep blues, silver moonlight, muted tones. */
function makePaletteNight(): PaletteEntry[] {
    return [
        { colorId: 0, r: 10, g: 12, b: 30, a: 255 },
        { colorId: 1, r: 160, g: 170, b: 200, a: 255 },
        { colorId: 2, r: 20, g: 50, b: 30, a: 255 },
        { colorId: 3, r: 30, g: 70, b: 40, a: 255 },
        { colorId: 4, r: 200, g: 200, b: 180, a: 255 },
        { colorId: 5, r: 50, g: 40, b: 35, a: 255 },
        { colorId: 6, r: 60, g: 30, b: 35, a: 255 },
        { colorId: 7, r: 40, g: 45, b: 55, a: 255 },
        { colorId: 8, r: 20, g: 40, b: 80, a: 255 },
        { colorId: 9, r: 15, g: 15, b: 25, a: 255 },
        { colorId: 10, r: 8, g: 8, b: 18, a: 255 },
    ];
}

/** SUNRISE: soft pinks, lavenders, fresh morning light. */
function makePaletteSunrise(): PaletteEntry[] {
    return [
        { colorId: 0, r: 160, g: 120, b: 180, a: 255 },
        { colorId: 1, r: 255, g: 240, b: 245, a: 255 },
        { colorId: 2, r: 40, g: 80, b: 50, a: 255 },
        { colorId: 3, r: 70, g: 140, b: 80, a: 255 },
        { colorId: 4, r: 255, g: 180, b: 140, a: 255 },
        { colorId: 5, r: 100, g: 70, b: 50, a: 255 },
        { colorId: 6, r: 200, g: 100, b: 120, a: 255 },
        { colorId: 7, r: 80, g: 80, b: 90, a: 255 },
        { colorId: 8, r: 120, g: 120, b: 180, a: 255 },
        { colorId: 9, r: 40, g: 30, b: 45, a: 255 },
        { colorId: 10, r: 25, g: 18, b: 30, a: 255 },
    ];
}

/** Linearly interpolate between two palettes. */
function lerpPalette(a: PaletteEntry[], b: PaletteEntry[], t: number): PaletteEntry[] {
    return a.map((ca, i) => {
        const cb = b[i];
        return {
            colorId: ca.colorId,
            r: Math.round(ca.r + (cb.r - ca.r) * t),
            g: Math.round(ca.g + (cb.g - ca.g) * t),
            b: Math.round(ca.b + (cb.b - ca.b) * t),
            a: 255,
        };
    });
}

// =====================================================================

const THEME_NAMES = ['DAY', 'SUNSET', 'NIGHT', 'SUNRISE'];
const MANUAL_SLOTS = [0, 1, 2, 3];         // Direct theme slots
const CYCLE_START_SLOT = 4;                  // First cycling slot
const CYCLE_PALETTE_COUNT = 64;             // 64 steps for smooth transitions
const CYCLE_SPEED = 0.3;                     // Palettes per tick (slower = smoother)

interface PalettesUserData {
    display: Display;
    statusLayer: Layer;
    currentTheme: number;
    autoCycling: boolean;
    cyclePosition: number;
    lastThemeLabel: string;
}

export class Palettes implements IApplication<Engine, User<PalettesUserData>> {

    async init(runtime: IRuntime, engine: Engine): Promise<void> {
        // --- Load 4 manual theme palettes (slots 0-3) ---
        engine.loadPaletteToSlot(0, makePaletteDay());
        engine.loadPaletteToSlot(1, makePaletteSunset());
        engine.loadPaletteToSlot(2, makePaletteNight());
        engine.loadPaletteToSlot(3, makePaletteSunrise());

        /**
         * Load 64 cycling palettes (slots 4..67).
         * Smooth loop: DAY → SUNSET → NIGHT → SUNRISE → DAY
         * 16 interpolation steps per segment = very fluid transitions.
         */
        const themes = [makePaletteDay(), makePaletteSunset(), makePaletteNight(), makePaletteSunrise()];
        const stepsPerSeg = CYCLE_PALETTE_COUNT / themes.length; // 16
        for (let seg = 0; seg < themes.length; seg++) {
            const from = themes[seg];
            const to = themes[(seg + 1) % themes.length];
            for (let step = 0; step < stepsPerSeg; step++) {
                const t = step / stepsPerSeg;
                engine.loadPaletteToSlot(CYCLE_START_SLOT + seg * stepsPerSeg + step, lerpPalette(from, to, t));
            }
        }

        runtime.setTickRate(30);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<PalettesUserData>): void {
        const width = 60;
        const height = 30;

        const display = new Display(0, width, height);
        user.addDisplay(display);
        // Start with the first cycling palette so there's no pop when it auto-cycles
        display.switchPalette(CYCLE_START_SLOT);

        // Input bindings
        const registry = user.getInputBindingRegistry();
        registry.defineButton(0, 'THEME_1', [
            { sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit1 },
        ]);
        registry.defineButton(1, 'THEME_2', [
            { sourceId: 2, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit2 },
        ]);
        registry.defineButton(2, 'THEME_3', [
            { sourceId: 3, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit3 },
        ]);
        registry.defineButton(3, 'THEME_4', [
            { sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit4 },
        ]);
        registry.defineButton(4, 'CYCLE', [
            { sourceId: 5, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
        ]);

        // =====================================================================
        // THE STATIC LAYER
        // =====================================================================
        // CRITICAL PEDAGOGICAL POINT:
        // We are going to build a complex scene with dozens of rectangles and shapes.
        // We assign this to `sceneLayer` and commit it exactly ONCE during `initUser`.
        // Even when the sun sets and night falls, these drawing orders are NEVER resent.
        // The display will transform purely because the Client's RGB interpretation
        // of indices 1 through 10 changes instantly via `switchPalette`.
        // This is how you achieve 60 FPS full-screen animations over a 2G connection.
        const sceneLayer = new Layer(new Vector2(0, 0), 0, width, height, { mustBeReliable: true });
        const o: any[] = [];

        // Sky background (color 0)
        o.push(OrderBuilder.fill(' ', 0, 0));

        // --- Color strip at top: shows all 11 indices ---
        o.push(OrderBuilder.rect(0, 0, width, 1, ' ', 1, 10, true));
        o.push(OrderBuilder.text(1, 0, '[1-4] theme  [Space] cycle', 1, 10));
        for (let i = 0; i <= 10; i++) {
            o.push(OrderBuilder.rect(i * 5 + 2, 2, 4, 1, '#', i, i, true));
        }

        // --- Celestial body: sun/moon (color 4) ---
        // A blocky circle for a nice pixel art vibe
        o.push(OrderBuilder.rect(42, 5, 6, 4, ' ', 4, 4, true));
        o.push(OrderBuilder.rect(43, 4, 4, 6, ' ', 4, 4, true));

        // --- Distant Mountains (color 9) ---
        // Left mountain
        o.push(OrderBuilder.rect(2, 12, 18, 5, ' ', 9, 9, true));
        o.push(OrderBuilder.rect(5, 9, 12, 3, ' ', 9, 9, true));
        o.push(OrderBuilder.rect(8, 7, 6, 2, ' ', 9, 9, true));
        o.push(OrderBuilder.rect(10, 5, 2, 2, ' ', 9, 9, true));

        // Right mountain
        o.push(OrderBuilder.rect(35, 13, 22, 4, ' ', 9, 9, true));
        o.push(OrderBuilder.rect(40, 10, 12, 3, ' ', 9, 9, true));
        o.push(OrderBuilder.rect(44, 8, 4, 2, ' ', 9, 9, true));

        // --- Midground Hills (color 7) ---
        o.push(OrderBuilder.rect(12, 15, 26, 3, ' ', 7, 7, true));
        o.push(OrderBuilder.rect(16, 13, 18, 2, ' ', 7, 7, true));
        o.push(OrderBuilder.rect(20, 11, 10, 2, ' ', 7, 7, true));
        o.push(OrderBuilder.rect(23, 10, 4, 1, ' ', 7, 7, true));

        // --- Ground and Grass (color 2 base, color 3 highlights) ---
        // Base ground
        o.push(OrderBuilder.rect(0, 17, width, 5, ' ', 2, 2, true));
        o.push(OrderBuilder.rect(0, 16, 12, 1, ' ', 2, 2, true));
        o.push(OrderBuilder.rect(48, 16, 12, 1, ' ', 2, 2, true));

        // Grass highlights
        o.push(OrderBuilder.rect(2, 17, 4, 1, ' ', 3, 3, true));
        o.push(OrderBuilder.rect(15, 18, 6, 1, ' ', 3, 3, true));
        o.push(OrderBuilder.rect(38, 17, 5, 1, ' ', 3, 3, true));
        o.push(OrderBuilder.rect(52, 18, 4, 1, ' ', 3, 3, true));

        // --- Pine Trees (color 5 trunk, color 3 foliage) ---
        // Left tree
        o.push(OrderBuilder.rect(4, 15, 2, 3, ' ', 5, 5, true)); // trunk
        o.push(OrderBuilder.rect(1, 14, 8, 2, ' ', 3, 3, true)); // foliage bottom
        o.push(OrderBuilder.rect(2, 12, 6, 2, ' ', 3, 3, true)); // foliage mid
        o.push(OrderBuilder.rect(4, 10, 2, 2, ' ', 3, 3, true)); // foliage top

        // Right tree
        o.push(OrderBuilder.rect(54, 14, 2, 4, ' ', 5, 5, true));
        o.push(OrderBuilder.rect(51, 13, 8, 2, ' ', 3, 3, true));
        o.push(OrderBuilder.rect(52, 11, 6, 2, ' ', 3, 3, true));
        o.push(OrderBuilder.rect(54, 9, 2, 2, ' ', 3, 3, true));

        // --- Cozy Pixel House (colors 1 wall, 6 roof, 10 door, 4 window) ---
        // Walls
        o.push(OrderBuilder.rect(26, 14, 8, 4, ' ', 1, 1, true));
        // Roof
        o.push(OrderBuilder.rect(24, 13, 12, 1, ' ', 6, 6, true));
        o.push(OrderBuilder.rect(26, 12, 8, 1, ' ', 6, 6, true));
        o.push(OrderBuilder.rect(28, 11, 4, 1, ' ', 6, 6, true));
        // Door
        o.push(OrderBuilder.rect(29, 16, 2, 2, ' ', 10, 10, true));
        // Windows
        o.push(OrderBuilder.rect(27, 15, 1, 1, ' ', 4, 4, true));
        o.push(OrderBuilder.rect(32, 15, 1, 1, ' ', 4, 4, true));
        // Chimney & Smoke
        o.push(OrderBuilder.rect(32, 10, 1, 2, ' ', 6, 6, true));
        o.push(OrderBuilder.rect(33, 8, 2, 1, ' ', 1, 1, true));
        o.push(OrderBuilder.rect(34, 6, 3, 1, ' ', 1, 1, true));

        // --- Water (color 8) ---
        o.push(OrderBuilder.rect(0, 21, width, 3, ' ', 8, 8, true));

        // Water ripples (color 2)
        o.push(OrderBuilder.rect(5, 22, 3, 1, ' ', 2, 2, true));
        o.push(OrderBuilder.rect(18, 23, 4, 1, ' ', 2, 2, true));
        o.push(OrderBuilder.rect(35, 22, 5, 1, ' ', 2, 2, true));
        o.push(OrderBuilder.rect(50, 23, 4, 1, ' ', 2, 2, true));

        // Sun reflection in water (color 4)
        o.push(OrderBuilder.rect(44, 21, 2, 1, ' ', 4, 4, true));
        o.push(OrderBuilder.rect(43, 22, 4, 1, ' ', 4, 4, true));
        o.push(OrderBuilder.rect(44, 23, 2, 1, ' ', 4, 4, true));

        // --- Status bar at bottom ---
        o.push(OrderBuilder.rect(0, 24, width, 6, ' ', 1, 10, true));
        o.push(OrderBuilder.text(2, 25, 'Theme:', 1, 10));
        o.push(OrderBuilder.text(2, 27, 'Same orders. Only the palette changes.', 9, 10));
        o.push(OrderBuilder.text(2, 28, 'Negligible bandwidth cost per switch.', 9, 10));

        sceneLayer.setOrders(o);

        user.addLayer(sceneLayer);

        const initialLabel = `${THEME_NAMES[0]} (cycling)`;

        // Status text layer (volatile, z=1)
        const statusLayer = new Layer(new Vector2(0, 0), 1, width, height, { mustBeReliable: false });
        statusLayer.setOrders([
            OrderBuilder.rect(9, 25, 20, 1, ' ', 1, 10, true),
            OrderBuilder.text(9, 25, initialLabel, 1, 10),
        ]);

        user.addLayer(statusLayer);

        user.data = {
            display,
            statusLayer,
            currentTheme: 0,
            autoCycling: true, // Start with the smooth animation running
            cyclePosition: 0,
            lastThemeLabel: initialLabel,
        };
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<PalettesUserData>): void {
        const data = user.data;

        // Manual theme switching (keys 1-4)
        if (user.isJustPressed('THEME_1')) { data.currentTheme = 0; data.autoCycling = false; }
        if (user.isJustPressed('THEME_2')) { data.currentTheme = 1; data.autoCycling = false; }
        if (user.isJustPressed('THEME_3')) { data.currentTheme = 2; data.autoCycling = false; }
        if (user.isJustPressed('THEME_4')) { data.currentTheme = 3; data.autoCycling = false; }

        // Toggle auto-cycling (Space)
        if (user.isJustPressed('CYCLE')) {
            data.autoCycling = !data.autoCycling;
            if (data.autoCycling) {
                data.cyclePosition = data.currentTheme * (CYCLE_PALETTE_COUNT / 4);
            }
        }

        // =====================================================================
        // APPLY PALETTE
        // =====================================================================
        // This is the core magic. `switchPalette` does not send drawing orders.
        // It sends a single tiny message (a few bytes): "Use palette slot X".
        // The Primitiv Client receives this and instantly recolors the entire canvas.
        if (data.autoCycling) {
            data.cyclePosition = (data.cyclePosition + CYCLE_SPEED) % CYCLE_PALETTE_COUNT;
            data.display.switchPalette(CYCLE_START_SLOT + Math.floor(data.cyclePosition));
            data.currentTheme = Math.floor(data.cyclePosition / (CYCLE_PALETTE_COUNT / 4));
        } else {
            data.display.switchPalette(MANUAL_SLOTS[data.currentTheme]);
        }

        // Update status label only when changed
        const label = data.autoCycling
            ? `${THEME_NAMES[data.currentTheme]} (cycling)`
            : THEME_NAMES[data.currentTheme];

        if (label !== data.lastThemeLabel) {
            data.lastThemeLabel = label;
            data.statusLayer.setOrders([
                OrderBuilder.rect(9, 25, 20, 1, ' ', 1, 10, true),
                OrderBuilder.text(9, 25, label, 1, 10),
            ]);

        }
    }

    update(_runtime: IRuntime, _engine: Engine): void { }
}
```

---

## File: applications/07-multipass/index.ts

```typescript
/**
 * Name: multipass
 * Description: Demonstrates how to use Render Passes to create true multi-layered character overlapping.
 *
 * Why study this:
 *   In Primitiv, a Display is a grid of Cells. By default, the engine flattens all Layers
 *   (from zIndex 0 to 255) into a single 2D grid before sending it to the client.
 *   
 *   THE PROBLEM:
 *   Because a single Cell only holds ONE character, ONE foreground color, and ONE background color,
 *   drawing a character on Z=10 replaces the foreground character that was on Z=0 at that position.
 *   If you draw rain (`|`) over a brick wall (`#`), the brick CHARACTER disappears - replaced by
 *   the rain pipe - even though the brick's background color may still bleed through
 *   (when the rain uses a transparent background color 255).
 *   You lose the visual richness of overlapping characters.
 *
 *   THE SOLUTION: MULTIPASS RENDERING
 *   `display.setRenderPasses(...)` tells the engine to split the flattening process into
 *   multiple separate grids (passes), grouping Layers by zIndex ranges. The client then
 *   renders these grids on top of each other. This allows a rain character `|` in Pass 1
 *   to be drawn ON TOP of a brick character `#` in Pass 0 - BOTH characters are visible.
 *
 *   TRADE-OFF:
 *   Each render pass produces its own full-size grid that the client must composite.
 *   More passes = more memory, more draw calls, and more GPU work on the client side.
 *   A single pass (the default) is the cheapest. Use multipass only when you genuinely
 *   need overlapping characters (rain over terrain, UI over game world, etc.).
 *
 *   NETWORK EFFICIENCY:
 *   Instead of pushing hundreds of individual `char()` orders for the rain (which would
 *   hit the 255 drawing orders-per-layer limit of the engine), we group all raindrops into 
 *   a SINGLE `dotCloudMulti` order. This is the baseline pattern to cleanly bulk-send atomic drawings.
 *
 * What this example demonstrates:
 *   - A dense brick wall background (Layer Z=0).
 *   - A dense rain simulation (Layer Z=1).
 *   - A status UI panel (Layer Z=2).
 *   - Toggle Multipass ON/OFF by pressing [Space] to see the difference.
 *
 * Key Concepts:
 *   - `display.setRenderPasses([{ id: 0, zMin: 0, zMax: 0 }, { id: 1, zMin: 1, zMax: 1 }])`
 *   - True character overlapping vs single-grid flattening.
 *   - `dotCloudMulti` as the standard pattern for particle-like rendering.
 */

import {
    Engine,
    User,
    Layer,
    Display,
    OrderBuilder,
    Vector2,
    KeyboardInput,
    InputDeviceType,
    type IApplication,
    type IRuntime,
} from '@primitiv/engine';

interface MultipassUserData {
    display: Display;
    uiLayer: Layer;
    rainLayer: Layer;
    multipassEnabled: boolean;
    rainDrops: { x: number; y: number; speed: number }[];
}

export class Multipass implements IApplication<Engine, User<MultipassUserData>> {

    async init(runtime: IRuntime, engine: Engine): Promise<void> {
        // Simple palette:
        // 0 = Black Bg
        // 1 = White Text
        // 2 = Dark Red Bricks
        // 3 = Light Red Brick Highlights
        // 4 = Blue Rain
        // 5 = Cyan UI borders
        // 255 = Transparent (Engine reserved)
        engine.loadPaletteToSlot(0, [
            { colorId: 0, r: 10, g: 10, b: 15, a: 255 },
            { colorId: 1, r: 250, g: 250, b: 250, a: 255 },
            { colorId: 2, r: 100, g: 30, b: 30, a: 255 },
            { colorId: 3, r: 160, g: 50, b: 50, a: 255 },
            { colorId: 4, r: 100, g: 150, b: 255, a: 255 },
            { colorId: 5, r: 0, g: 200, b: 255, a: 255 },
        ]);

        runtime.setTickRate(30);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<MultipassUserData>): void {
        const width = 60;
        const height = 40;

        const display = new Display(0, width, height);
        user.addDisplay(display);
        display.switchPalette(0);

        // SETUP MULTIPASS RENDERING (in initUser, where the Display is configured)
        // We split rendering into 3 distinct grids.
        // Client renders Pass 0, then renders Pass 1 on top, then Pass 2.
        // Characters like '#' in Pass 0 and '|' in Pass 1 will BOTH be visible.
        display.setRenderPasses([
            { id: 0, zMin: 0, zMax: 0 }, // The Wall
            { id: 1, zMin: 1, zMax: 1 }, // The Rain
            { id: 2, zMin: 2, zMax: 2 }, // The UI
        ]);

        // Input binding for toggling multipass on/off
        const registry = user.getInputBindingRegistry();
        registry.defineButton(0, 'TOGGLE', [
            { sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
        ]);

        // =====================================================================
        // LAYER 0: The Wall (Z=0)
        // =====================================================================
        const wallLayer = new Layer(new Vector2(0, 0), 0, width, height, { mustBeReliable: true });
        const wallOrders: any[] = [];

        // Brick wall using a single `fillChar` order.
        // fillChar(repeatX, repeatY, charPattern[], fg, bg) tiles a character pattern
        // across the entire layer. We define a 4×2 pattern that creates offset bricks:
        //   Row 0: # # # ·   (3 bricks + 1 mortar gap)
        //   Row 1: # · # #   (shifted by 2 → classic brick offset)
        // This is far more efficient than hundreds of individual rect() orders.
        wallOrders.push(OrderBuilder.fillChar(4, 2, [
            '#', '#', '#', ' ',   // row 0: brick brick brick mortar
            '#', ' ', '#', '#',   // row 1: brick mortar brick brick (offset)
        ], 3, 2));
        wallLayer.setOrders(wallOrders);

        user.addLayer(wallLayer);

        // =====================================================================
        // LAYER 1: The Rain (Z=1, volatile)
        // =====================================================================
        const rainLayer = new Layer(new Vector2(0, 0), 1, width, height, { mustBeReliable: false });
        user.addLayer(rainLayer);

        // Generate initial rain drops
        // Because we use a single `dotCloudMulti` order, we can have hundreds of drops
        // without hitting the engine's 255 maximum orders-per-layer limit.
        const rainDrops: { x: number; y: number; speed: number }[] = [];
        for (let i = 0; i < 500; i++) {
            rainDrops.push({
                x: Math.floor(Math.random() * width),
                y: Math.floor(Math.random() * height),
                speed: 1 + Math.random() * 2
            });
        }

        // =====================================================================
        // LAYER 2: The UI panel (Z=2)
        // =====================================================================
        const uiLayer = new Layer(new Vector2(0, 0), 2, width, height, { mustBeReliable: true });
        user.addLayer(uiLayer);

        user.data = {
            display,
            rainLayer,
            uiLayer,
            multipassEnabled: true,
            rainDrops,
        };

        // Draw initial UI
        this.updateUI(user);
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<MultipassUserData>): void {
        const data = user.data;
        const width = 60;
        const height = 40;

        // --- Toggle Multipass ---
        if (user.isJustPressed('TOGGLE')) {
            data.multipassEnabled = !data.multipassEnabled;

            if (data.multipassEnabled) {
                // MULTIPASS: 3 separate grids, true overlap
                data.display.setRenderPasses([
                    { id: 0, zMin: 0, zMax: 0 },
                    { id: 1, zMin: 1, zMax: 1 },
                    { id: 2, zMin: 2, zMax: 2 },
                ]);
            } else {
                // FLATTENED: single grid, rain character replaces brick character
                data.display.setRenderPasses([
                    { id: 0, zMin: 0, zMax: 255 },
                ]);
            }

            this.updateUI(user);
        }

        // --- Update Rain ---
        // All 500 raindrops packed into a SINGLE dotCloudMulti order.
        // Only the '|' character is used for a clean, uniform rain effect.
        const rainData = data.rainDrops.map(drop => {
            drop.y += drop.speed;
            if (drop.y >= height) {
                drop.y = -1;
                drop.x = Math.floor(Math.random() * width);
            }
            return {
                posX: drop.x,
                posY: Math.floor(drop.y),
                charCode: '|',
                fgColorCode: 4,
                bgColorCode: 255, // 255 = transparent/skip color in Primitiv
            };
        });

        data.rainLayer.setOrders([OrderBuilder.dotCloudMulti(rainData)]);

    }

    private updateUI(user: User<MultipassUserData>) {
        const data = user.data;
        const uiOrders: any[] = [];

        if (data.multipassEnabled) {
            uiOrders.push(OrderBuilder.rect(5, 14, 50, 8, ' ', 1, 0, true));
            uiOrders.push(OrderBuilder.rect(4, 13, 52, 10, ' ', 5, 255, false));
            uiOrders.push(OrderBuilder.text(6, 15, "MULTIPASS: ENABLED", 5, 0));
            uiOrders.push(OrderBuilder.text(6, 17, "Rain (|) is drawn ON TOP of bricks (#).", 1, 0));
            uiOrders.push(OrderBuilder.text(6, 18, "Both characters are visible simultaneously.", 1, 0));
            uiOrders.push(OrderBuilder.text(6, 20, "[SPACE] Disable Multipass", 3, 0));
        } else {
            uiOrders.push(OrderBuilder.rect(5, 14, 50, 8, ' ', 1, 0, true));
            uiOrders.push(OrderBuilder.rect(4, 13, 52, 10, ' ', 3, 255, false));
            uiOrders.push(OrderBuilder.text(6, 15, "MULTIPASS: DISABLED", 3, 0));
            uiOrders.push(OrderBuilder.text(6, 17, "Rain replaces the brick CHARACTER but", 1, 0));
            uiOrders.push(OrderBuilder.text(6, 18, "the brick BACKGROUND color bleeds through.", 1, 0));
            uiOrders.push(OrderBuilder.text(6, 20, "[SPACE] Enable Multipass", 5, 0));
        }

        data.uiLayer.setOrders(uiOrders);

    }

    update(_runtime: IRuntime, _engine: Engine): void { }
}
```

---

## File: applications/08-gamepad-input/index.ts

```typescript
/**
 * Name: gamepad-input
 * Description: Exhaustive demonstration of gamepad input handling.
 *
 * Why study this:
 *   This example covers everything related to gamepad (controller) input in Primitiv.
 *   While 02-mouse-keyboard-input demonstrates Keyboard and Mouse bindings,
 *   this example focuses exclusively on gamepads.
 *
 * Gamepad Input Types:
 *   BUTTONS (digital, on/off):
 *     Face buttons: ButtonA, ButtonB, ButtonX, ButtonY
 *     D-Pad: DPadUp, DPadDown, DPadLeft, DPadRight
 *     Shoulders: LeftShoulder (L1), RightShoulder (R1)
 *     Stick Clicks: LeftStick (L3), RightStick (R3)
 *
 *   AXES (analog, -1.0 to 1.0 or 0.0 to 1.0):
 *     Left Stick: LeftStickX, LeftStickY
 *     Right Stick: RightStickX, RightStickY
 *     Triggers: LeftTriggerAxis (L2), RightTriggerAxis (R2) - range 0.0 to 1.0
 *
 *   VIBRATION (Haptic Feedback):
 *     Dual-rumble support via `user.vibrateGamepad()`.
 *     Supports duration, strong magnitude (low-freq), and weak magnitude (high-freq).
 *     - Face Buttons: Trigger fixed bursts of varying intensities.
 *     - Triggers: Trigger continuous rumble scaling with pressure (L2=Strong, R2=Weak).
 *
 * gamepadIndex:
 *   Primitiv supports multiple gamepads. The `gamepadIndex` field (0, 1, 2, ...)
 *   identifies which physical controller the binding targets.
 *   This example binds everything to gamepadIndex 0 (first connected controller).
 *
 * How to test:
 *   1. Connect a gamepad (Xbox, PlayStation, or any XInput/DInput controller).
 *   2. Press any button to wake it up (browsers require a user gesture).
 *   3. All buttons, sticks, and triggers will show live values on screen.
 *   4. Press A, B, X, or Y to trigger different vibration patterns.
 *
 * What this example demonstrates:
 *   - Live display of all standard gamepad inputs: face buttons (A/B/X/Y), D-Pad,
 *     shoulder buttons (L1/R1), stick clicks (L3/R3), dual analog sticks, and
 *     pressure-sensitive triggers (L2/R2).
 *   - Dual-rumble haptic feedback: fixed vibration bursts triggered by face button
 *     presses, and continuous rumble scaling with trigger pressure
 *     (L2 = strong magnitude, R2 = weak magnitude).
 *   - Multi-gamepad architecture: every binding targets a specific `gamepadIndex` so
 *     multiple controllers can coexist without conflict.
 *
 * Key Concepts:
 *   - `registry.defineButton(actionId, name, [{ sourceId, type: InputDeviceType.Gamepad, gamepadIndex, button: GamepadInput.ButtonA }])` - map a gamepad button to a logical action.
 *   - `registry.defineAxis(actionId, name, [{ sourceId, type: InputDeviceType.Gamepad, gamepadIndex, axis: GamepadInput.LeftStickX }])` - map an analog axis.
 *   - `user.getButton(actionId)` - returns `{ pressed, justPressed, justReleased }`.
 *   - `user.getAxis(actionId)` - returns the current axis value (−1.0 to 1.0; triggers: 0.0 to 1.0).
 *   - `user.vibrateGamepad({ duration, strongMagnitude, weakMagnitude })` - dual-rumble haptic output.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  GamepadInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

interface GamepadUserData {
  staticLayer: Layer;
  dynamicLayer: Layer;
  lastAction: string;
}

export class GamepadShowcase implements IApplication<
  Engine,
  User<GamepadUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 15, g: 15, b: 25, a: 255 }, // Dark BG
      { colorId: 1, r: 80, g: 200, b: 120, a: 255 }, // Active Green
      { colorId: 2, r: 250, g: 80, b: 80, a: 255 }, // Highlight Red
      { colorId: 3, r: 200, g: 200, b: 250, a: 255 }, // White Text
      { colorId: 4, r: 100, g: 100, b: 150, a: 255 }, // Gray Text
      { colorId: 5, r: 255, g: 200, b: 80, a: 255 }, // Yellow
      { colorId: 6, r: 80, g: 150, b: 255, a: 255 }, // Blue
    ]);
    runtime.setTickRate(60);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<GamepadUserData>,
  ): void {
    const width = 70;
    const height = 40;

    user.data.lastAction = "None";

    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);

    // Static layer for labels and fixed UI elements
    const staticLayer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    user.data.staticLayer = staticLayer;
    user.addLayer(staticLayer);

    // Dynamic layer for changing values
    const dynamicLayer = new Layer(new Vector2(0, 0), 1, width, height, {
      mustBeReliable: false,
    });
    user.data.dynamicLayer = dynamicLayer;
    user.addLayer(dynamicLayer);

    // Draw all static content once
    const staticOrders: any[] = [];
    staticOrders.push(
      OrderBuilder.fill(" ", 0, 0),
      OrderBuilder.text(2, 1, "--- PRIMITIV GAMEPAD INPUT ---", 3, 0),
      OrderBuilder.text(
        2,
        2,
        "Connect a controller and press any button.",
        4,
        0,
      ),
      // Face buttons section
      OrderBuilder.text(2, 4, "FACE BUTTONS:", 3, 0),
      OrderBuilder.text(2, 5, "[A]", 4, 0),
      OrderBuilder.text(12, 5, "[B]", 4, 0),
      OrderBuilder.text(22, 5, "[X]", 4, 0),
      OrderBuilder.text(32, 5, "[Y]", 4, 0),
      // D-Pad section
      OrderBuilder.text(2, 8, "D-PAD:", 3, 0),
      OrderBuilder.text(2, 9, "Up", 4, 0),
      OrderBuilder.text(12, 9, "Down", 4, 0),
      OrderBuilder.text(22, 9, "Left", 4, 0),
      OrderBuilder.text(32, 9, "Right", 4, 0),
      // Shoulders section
      OrderBuilder.text(2, 12, "SHOULDERS:", 3, 0),
      OrderBuilder.text(2, 13, "L1:", 4, 0),
      OrderBuilder.text(16, 13, "R1:", 4, 0),
      OrderBuilder.text(34, 13, "L3:", 4, 0),
      OrderBuilder.text(48, 13, "R3:", 4, 0),
      // Triggers section
      OrderBuilder.text(2, 15, "TRIGGERS:", 3, 0),
      OrderBuilder.text(2, 16, "L2:", 4, 0),
      OrderBuilder.text(30, 16, "R2:", 4, 0),
      // Left stick section
      OrderBuilder.text(2, 19, "LEFT STICK:", 3, 0),
      // Left stick visual box (static background)
      OrderBuilder.rect(2, 23, 11, 11, ".", 4, 0, true),
      OrderBuilder.char(2 + 5, 23 + 5, "+", 4, 0),
      // Right stick section
      OrderBuilder.text(30, 19, "RIGHT STICK:", 3, 0),
      // Right stick visual box (static background)
      OrderBuilder.rect(30, 23, 11, 11, ".", 4, 0, true),
      OrderBuilder.char(30 + 5, 23 + 5, "+", 4, 0),
      // Vibration info
      OrderBuilder.text(2, 35, "VIBRATION:", 3, 0),
      OrderBuilder.text(18, 35, "A/B/X/Y: Bursts | L2/R2: Scaled Rumble", 4, 0),
      // Last action label
      OrderBuilder.text(2, 37, "LAST ACTION:", 3, 0),
    );
    staticLayer.setOrders(staticOrders);


    /**
     * GAMEPAD BINDINGS
     * All bindings target gamepadIndex: 0 (first connected controller).
     */
    const registry = user.getInputBindingRegistry();

    // Face Buttons
    registry.defineButton(0, "GP_A", [
      {
        sourceId: 1,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonA,
      },
    ]);
    registry.defineButton(1, "GP_B", [
      {
        sourceId: 2,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonB,
      },
    ]);
    registry.defineButton(2, "GP_X", [
      {
        sourceId: 3,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonX,
      },
    ]);
    registry.defineButton(3, "GP_Y", [
      {
        sourceId: 4,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonY,
      },
    ]);

    // D-Pad
    registry.defineButton(4, "GP_UP", [
      {
        sourceId: 5,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadUp,
      },
    ]);
    registry.defineButton(5, "GP_DOWN", [
      {
        sourceId: 6,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadDown,
      },
    ]);
    registry.defineButton(6, "GP_LEFT", [
      {
        sourceId: 7,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadLeft,
      },
    ]);
    registry.defineButton(7, "GP_RIGHT", [
      {
        sourceId: 8,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadRight,
      },
    ]);

    // Shoulders
    registry.defineButton(8, "GP_L1", [
      {
        sourceId: 9,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.LeftShoulder,
      },
    ]);
    registry.defineButton(9, "GP_R1", [
      {
        sourceId: 10,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.RightShoulder,
      },
    ]);

    // Stick Clicks (L3 / R3)
    // These are the buttons triggered by pressing the joystick down without tilting it.
    // W3C Gamepad standard: buttons[10] = LeftStick, buttons[11] = RightStick.
    registry.defineButton(10, "GP_L3", [
      {
        sourceId: 17,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.LeftStick,
      },
    ]);
    registry.defineButton(11, "GP_R3", [
      {
        sourceId: 18,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.RightStick,
      },
    ]);

    // Sticks (Axes: -1.0 to 1.0)
    registry.defineAxis(0, "LEFT_X", [
      {
        sourceId: 11,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.LeftStickX,
      },
    ]);
    registry.defineAxis(1, "LEFT_Y", [
      {
        sourceId: 12,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.LeftStickY,
      },
    ]);
    registry.defineAxis(2, "RIGHT_X", [
      {
        sourceId: 13,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.RightStickX,
      },
    ]);
    registry.defineAxis(3, "RIGHT_Y", [
      {
        sourceId: 14,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.RightStickY,
      },
    ]);

    // Triggers (Axes: 0.0 to 1.0)
    registry.defineAxis(4, "L2", [
      {
        sourceId: 15,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.LeftTriggerAxis,
      },
    ]);
    registry.defineAxis(5, "R2", [
      {
        sourceId: 16,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.RightTriggerAxis,
      },
    ]);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<GamepadUserData>,
  ): void {
    const data = user.data;
    const o: any[] = [];

    // =====================================================================
    // FACE BUTTONS (A, B, X, Y) - Dynamic states only
    // =====================================================================
    const faceButtons = [
      { name: "GP_A", label: "A", x: 2 },
      { name: "GP_B", label: "B", x: 12 },
      { name: "GP_X", label: "X", x: 22 },
      { name: "GP_Y", label: "Y", x: 32 },
    ];

    for (const btn of faceButtons) {
      const held = user.getButton(btn.name);
      const just = user.isJustPressed(btn.name);
      if (just) {
        data.lastAction = `Pressed ${btn.label}`;

        // TRIGGER VIBRATION on face button press
        // Patterns vary per button to demonstrate strong vs weak motors
        if (btn.label === "A")
          user.vibrateGamepad({
            duration: 150,
            strongMagnitude: 0.5,
            weakMagnitude: 0.5,
          });
        if (btn.label === "B")
          user.vibrateGamepad({
            duration: 300,
            strongMagnitude: 1.0,
            weakMagnitude: 0.0,
          });
        if (btn.label === "X")
          user.vibrateGamepad({
            duration: 300,
            strongMagnitude: 0.0,
            weakMagnitude: 1.0,
          });
        if (btn.label === "Y")
          user.vibrateGamepad({
            duration: 100,
            strongMagnitude: 1.0,
            weakMagnitude: 1.0,
          });
      }

      // Update label color based on held state
      o.push(OrderBuilder.text(btn.x, 5, `[${btn.label}]`, held ? 1 : 4, 0));
      o.push(
        OrderBuilder.text(btn.x, 6, held ? "HELD" : "----", held ? 1 : 4, 0),
      );
    }

    // =====================================================================
    // D-PAD - Dynamic states only
    // =====================================================================
    const dpadButtons = [
      { name: "GP_UP", label: "Up", x: 2 },
      { name: "GP_DOWN", label: "Down", x: 12 },
      { name: "GP_LEFT", label: "Left", x: 22 },
      { name: "GP_RIGHT", label: "Right", x: 32 },
    ];

    for (const btn of dpadButtons) {
      const held = user.getButton(btn.name);
      if (user.isJustPressed(btn.name)) data.lastAction = `DPad ${btn.label}`;

      o.push(
        OrderBuilder.text(btn.x, 9, btn.label.padEnd(5, " "), held ? 1 : 4, 0),
      );
      o.push(
        OrderBuilder.text(btn.x, 10, held ? "HELD" : "----", held ? 1 : 4, 0),
      );
    }

    // =====================================================================
    // SHOULDERS (L1 / R1) - Dynamic states only
    // =====================================================================
    const l1 = user.getButton("GP_L1");
    const r1 = user.getButton("GP_R1");
    if (user.isJustPressed("GP_L1")) data.lastAction = "Pressed L1";
    if (user.isJustPressed("GP_R1")) data.lastAction = "Pressed R1";

    o.push(OrderBuilder.text(6, 13, l1 ? "HELD" : "----", l1 ? 1 : 4, 0));
    o.push(OrderBuilder.text(20, 13, r1 ? "HELD" : "----", r1 ? 1 : 4, 0));

    // Stick Clicks (L3 / R3)
    const l3 = user.getButton("GP_L3");
    const r3 = user.getButton("GP_R3");
    if (user.isJustPressed("GP_L3")) data.lastAction = "Pressed L3";
    if (user.isJustPressed("GP_R3")) data.lastAction = "Pressed R3";

    o.push(OrderBuilder.text(38, 13, l3 ? "HELD" : "----", l3 ? 1 : 4, 0));
    o.push(OrderBuilder.text(52, 13, r3 ? "HELD" : "----", r3 ? 1 : 4, 0));

    // =====================================================================
    // TRIGGERS (L2 / R2) - analog axes 0.0 to 1.0
    // =====================================================================
    const l2 = user.getAxis("L2");
    const r2 = user.getAxis("R2");

    // CONTINUOUS TRIGGER VIBRATION
    // We use a short duration (100ms) refreshed every frame to follow pressure.
    // L2 = Strong motor (Heavy), R2 = Weak motor (Buzz)
    if (l2 > 0.05 || r2 > 0.05) {
      user.vibrateGamepad({
        duration: 100,
        strongMagnitude: l2,
        weakMagnitude: r2,
      });
    }

    o.push(
      OrderBuilder.text(
        6,
        16,
        l2.toFixed(2).padStart(5, " "),
        l2 > 0.1 ? 5 : 4,
        0,
      ),
    );

    // L2 bar
    const l2Len = Math.floor(l2 * 20);
    o.push(OrderBuilder.rect(2, 17, 20, 1, "-", 4, 0, true));
    if (l2Len > 0) o.push(OrderBuilder.rect(2, 17, l2Len, 1, "=", 5, 0, true));

    o.push(
      OrderBuilder.text(
        34,
        16,
        r2.toFixed(2).padStart(5, " "),
        r2 > 0.1 ? 5 : 4,
        0,
      ),
    );

    // R2 bar
    const r2Len = Math.floor(r2 * 20);
    o.push(OrderBuilder.rect(30, 17, 20, 1, "-", 4, 0, true));
    if (r2Len > 0) o.push(OrderBuilder.rect(30, 17, r2Len, 1, "=", 5, 0, true));

    // =====================================================================
    // LEFT STICK
    // =====================================================================
    const lx = user.getAxis("LEFT_X");
    const ly = user.getAxis("LEFT_Y");

    o.push(
      OrderBuilder.text(
        2,
        20,
        `X: ${lx.toFixed(2).padStart(6, " ")}`,
        lx !== 0 ? 6 : 4,
        0,
      ),
    );
    o.push(
      OrderBuilder.text(
        2,
        21,
        `Y: ${ly.toFixed(2).padStart(6, " ")}`,
        ly !== 0 ? 6 : 4,
        0,
      ),
    );

    // Left stick cursor position only (box is static)
    const ldx = 2 + 5 + Math.round(lx * 5);
    const ldy = 23 + 5 + Math.round(ly * 5);
    o.push(OrderBuilder.char(ldx, ldy, "O", 6, 0));

    // =====================================================================
    // RIGHT STICK
    // =====================================================================
    const rx = user.getAxis("RIGHT_X");
    const ry = user.getAxis("RIGHT_Y");

    o.push(
      OrderBuilder.text(
        30,
        20,
        `X: ${rx.toFixed(2).padStart(6, " ")}`,
        rx !== 0 ? 6 : 4,
        0,
      ),
    );
    o.push(
      OrderBuilder.text(
        30,
        21,
        `Y: ${ry.toFixed(2).padStart(6, " ")}`,
        ry !== 0 ? 6 : 4,
        0,
      ),
    );

    // Right stick cursor position only (box is static)
    const rdx = 30 + 5 + Math.round(rx * 5);
    const rdy = 23 + 5 + Math.round(ry * 5);
    o.push(OrderBuilder.char(rdx, rdy, "O", 6, 0));

    // =====================================================================
    // LAST ACTION - Dynamic value only
    // =====================================================================
    o.push(OrderBuilder.text(16, 37, data.lastAction.padEnd(20, " "), 2, 0));

    // Commit
    data.dynamicLayer.setOrders(o);

  }

  update(_runtime: IRuntime, _engine: Engine): void {}
}
```

---

## File: applications/09-mobile-input/index.ts

```typescript
/**
 * Name: mobile-input
 * Description: Demonstration of touch input and phone vibration (haptics).
 *
 * Why study this:
 *   Modern web apps run on mobile. Primitiv provides two layers of touch support:
 *   1. Touch Zones: Named screen regions (defined in grid cells) that act as
 *      virtual buttons or directional axes. The client handles hit-testing.
 *   2. Phone Vibration: `user.vibrate(pattern)` triggers the device's vibration
 *      motor via the browser's Navigator.vibrate API.
 *
 * Touch Zone Workflow:
 *   a) Define zones via `registry.defineTouchZone(id, name, x, y, w, h)`.
 *   b) Map zones to logical buttons/axes via `registry.defineButton()` / `registry.defineAxis()`.
 *      Use `InputDeviceType.TouchZone` and reference the zone by its `touchZoneId`.
 *   c) Query state with `user.getButton()` / `user.getAxis()` as usual.
 *
 * Vibration:
 *   `user.vibrate(50)` - Single buzz, 50ms.
 *   `user.vibrate([100, 50, 100])` - Vibrate 100ms, pause 50ms, vibrate 100ms.
 *   Note: Most browsers require a prior user interaction (first tap) before
 *   allowing vibrations. This is a browser security policy, not an engine limit.
 *
 * Combining Inputs:
 *   The same logical action can have multiple sources. The example below maps
 *   each virtual button to BOTH a touch zone AND a keyboard key, so you can
 *   test this app on desktop too.
 *
 * What this example demonstrates:
 *   - A virtual D-pad and two action buttons built from touch zones, with live
 *     visual feedback showing each zone's activation state in real-time.
 *   - Phone haptic feedback: button taps trigger vibration patterns via the
 *     browser's Navigator.vibrate API - single buzzes and patterned sequences.
 *   - Dual input binding: every action is mapped to both a touch zone and a
 *     keyboard key so the example is fully testable on desktop.
 *
 * Key Concepts:
 *   - `reg.defineTouchZone(id, name, x, y, w, h)` - declare a screen region (in grid cells) as a named input source.
 *   - `registry.defineAxis(actionId, name, [{ sourceId, type: InputDeviceType.TouchZone, touchZoneId, touchZoneAxis: 'x'|'y' }])` - bind a touch zone to a logical axis.
 *   - `registry.defineButton(actionId, name, [{ sourceId, type: InputDeviceType.TouchZone, touchZoneId }])` - bind a touch zone to a logical button.
 *   - `user.getButton(actionId)` / `user.getAxis(actionId)` - query state as usual, regardless of input source.
 *   - `user.vibrate(pattern)` - trigger device vibration: number for a single buzz, array `[on, off, on, ...]` for a patterned sequence.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  KeyboardInput,
  TouchZoneInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

interface MobileUserData {
  staticLayer: Layer;
  dynamicLayer: Layer;
  lastAction: string;
  tapCount: number;
}

export class MobileShowcase implements IApplication<
  Engine,
  User<MobileUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 10, g: 10, b: 20, a: 255 }, // Dark BG
      { colorId: 1, r: 80, g: 200, b: 120, a: 255 }, // Active Green
      { colorId: 2, r: 250, g: 80, b: 80, a: 255 }, // Red
      { colorId: 3, r: 200, g: 200, b: 250, a: 255 }, // White Text
      { colorId: 4, r: 100, g: 100, b: 150, a: 255 }, // Gray Text
      { colorId: 5, r: 255, g: 200, b: 80, a: 255 }, // Yellow
      { colorId: 6, r: 80, g: 150, b: 255, a: 255 }, // Blue
    ]);
    runtime.setTickRate(60);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<MobileUserData>,
  ): void {
    const width = 40;
    const height = 30;

    user.data.lastAction = "None";
    user.data.tapCount = 0;

    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);

    // Static layer for labels and fixed UI
    const staticLayer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    user.data.staticLayer = staticLayer;
    user.addLayer(staticLayer);

    // Dynamic layer for changing values
    const dynamicLayer = new Layer(new Vector2(0, 0), 1, width, height, {
      mustBeReliable: false,
    });
    user.data.dynamicLayer = dynamicLayer;
    user.addLayer(dynamicLayer);

    // Draw all static content once
    const staticOrders: any[] = [];
    staticOrders.push(
      OrderBuilder.fill(" ", 0, 0),
      OrderBuilder.text(2, 1, "--- MOBILE INPUT ---", 3, 0),
      OrderBuilder.text(2, 2, "Touch zones + vibration", 4, 0),
      // Axes section
      OrderBuilder.text(2, 5, "AXES:", 3, 0),
      OrderBuilder.text(2, 6, "Move X:", 4, 0),
      OrderBuilder.text(2, 7, "Move Y:", 4, 0),
      // Buttons section
      OrderBuilder.text(2, 9, "BUTTONS:", 3, 0),
      OrderBuilder.text(2, 10, "Action A:", 4, 0),
      OrderBuilder.text(2, 11, "Action B:", 4, 0),
      // Status section
      OrderBuilder.text(2, 15, "LAST HAPTIC:", 3, 0),
      // D-Pad label
      OrderBuilder.text(4, 17, "D-PAD", 3, 0),
      // Button labels
      OrderBuilder.text(29, 26, "Space", 4, 0),
      OrderBuilder.text(29, 18, "Ctrl", 4, 0),
      // Legend
      OrderBuilder.text(18, 5, "Desktop:", 4, 0),
      OrderBuilder.text(18, 6, "Arrows = D-Pad", 4, 0),
      OrderBuilder.text(18, 7, "Space  = A", 4, 0),
      OrderBuilder.text(18, 8, "Ctrl   = B", 4, 0),
    );
    staticLayer.setOrders(staticOrders);


    const reg = user.getInputBindingRegistry();

    /**
     * TOUCH ZONE DEFINITIONS
     * Zones are screen regions in grid cells. The client hit-tests all active
     * touches against these rectangles every frame.
     */
    reg.defineTouchZone(0, "dpad", 2, 18, 12, 10); // Left side: virtual D-Pad
    reg.defineTouchZone(1, "btnA", 28, 22, 10, 6); // Right side: Action A
    reg.defineTouchZone(2, "btnB", 28, 14, 10, 6); // Right side: Action B

    /**
     * AXIS: MOVE_X mapped to D-Pad zone + Keyboard arrows
     * Touch inside the dpad zone: finger position relative to center → -1..+1.
     */
    reg.defineAxis(0, "MOVE_X", [
      {
        sourceId: 0,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowLeft,
        positiveKey: KeyboardInput.ArrowRight,
      },
      {
        sourceId: 1,
        type: InputDeviceType.TouchZone,
        touchZoneId: 0,
        touchZoneAxis: "x",
      },
    ]);

    /**
     * AXIS: MOVE_Y mapped to D-Pad zone + Keyboard arrows
     */
    reg.defineAxis(1, "MOVE_Y", [
      {
        sourceId: 2,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowUp,
        positiveKey: KeyboardInput.ArrowDown,
      },
      {
        sourceId: 3,
        type: InputDeviceType.TouchZone,
        touchZoneId: 0,
        touchZoneAxis: "y",
      },
    ]);

    /**
     * BUTTON: ACTION_A mapped to zone 1 + Space key
     */
    reg.defineButton(0, "ACTION_A", [
      { sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
      {
        sourceId: 5,
        type: InputDeviceType.TouchZone,
        touchZoneId: TouchZoneInput.Zone1,
      },
    ]);

    /**
     * BUTTON: ACTION_B mapped to zone 2 + Ctrl key
     */
    reg.defineButton(1, "ACTION_B", [
      {
        sourceId: 6,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ControlLeft,
      },
      {
        sourceId: 7,
        type: InputDeviceType.TouchZone,
        touchZoneId: TouchZoneInput.Zone2,
      },
    ]);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<MobileUserData>,
  ): void {
    const data = user.data;
    const o: any[] = [];

    // =====================================================================
    // D-PAD (Touch Zone 0) - Dynamic content
    // =====================================================================
    const moveX = user.getAxis("MOVE_X");
    const moveY = user.getAxis("MOVE_Y");

    // Draw D-Pad zone outline
    o.push(OrderBuilder.rect(2, 18, 12, 10, ".", 4, 0, false));

    // D-Pad center cross
    const dpCx = 2 + 6; // center X of the zone
    const dpCy = 18 + 5; // center Y of the zone
    o.push(OrderBuilder.char(dpCx, dpCy, "+", 4, 0));

    // D-Pad cursor (shows axis position)
    const dpDx = dpCx + Math.round(moveX * 5);
    const dpDy = dpCy + Math.round(moveY * 4);
    o.push(OrderBuilder.char(dpDx, dpDy, "O", 6, 0));

    // Axis values - dynamic values only
    o.push(
      OrderBuilder.text(
        10,
        6,
        `${moveX.toFixed(2).padStart(6, " ")}`,
        moveX !== 0 ? 6 : 4,
        0,
      ),
    );
    o.push(
      OrderBuilder.text(
        10,
        7,
        `${moveY.toFixed(2).padStart(6, " ")}`,
        moveY !== 0 ? 6 : 4,
        0,
      ),
    );

    // =====================================================================
    // ACTION BUTTONS (Touch Zones 1 & 2) - Dynamic content
    // =====================================================================

    // Action A
    const holdA = user.getButton("ACTION_A");
    const justA = user.isJustPressed("ACTION_A");

    o.push(
      OrderBuilder.rect(
        28,
        22,
        10,
        6,
        holdA ? "#" : ".",
        holdA ? 1 : 4,
        0,
        false,
      ),
    );
    o.push(OrderBuilder.text(31, 24, "A", holdA ? 1 : 4, 0));

    if (justA) {
      data.lastAction = "Action A";
      data.tapCount++;
      // Short pulse
      user.vibrate(30);
    }

    o.push(
      OrderBuilder.text(12, 10, holdA ? "HELD" : "----", holdA ? 1 : 4, 0),
    );

    // Action B
    const holdB = user.getButton("ACTION_B");
    const justB = user.isJustPressed("ACTION_B");

    o.push(
      OrderBuilder.rect(
        28,
        14,
        10,
        6,
        holdB ? "#" : ".",
        holdB ? 2 : 4,
        0,
        false,
      ),
    );
    o.push(OrderBuilder.text(31, 16, "B", holdB ? 2 : 4, 0));

    if (justB) {
      data.lastAction = "Action B";
      data.tapCount++;
      // Rhythmic pattern: vib 100ms, pause 50ms, vib 100ms
      user.vibrate([100, 50, 100]);
    }

    o.push(
      OrderBuilder.text(12, 11, holdB ? "HELD" : "----", holdB ? 2 : 4, 0),
    );

    // =====================================================================
    // STATUS - Dynamic values
    // =====================================================================
    o.push(
      OrderBuilder.text(2, 13, `Taps: ${data.tapCount}`.padEnd(15, " "), 4, 0),
    );
    o.push(OrderBuilder.text(15, 15, data.lastAction.padEnd(12, " "), 5, 0));

    // Commit
    data.dynamicLayer.setOrders(o);

  }

  update(_runtime: IRuntime, _engine: Engine): void {}
}
```

---

## File: applications/10-audio/index.ts

```typescript
/**
 * Name: audio
 * Description: Complete audio system demonstration: playback, effects, and spatial sound.
 *
 * Why study this:
 *   Primitiv provides a full audio pipeline running on the client's Web Audio API,
 *   but controlled entirely from the server (or standalone) side. This means your
 *   game logic decides WHAT to play, and the engine handles HOW to deliver it.
 *
 * Audio Lifecycle:
 *   1. `engine.loadSound(name, url)` - Register a sound during `init()`.
 *      Returns a numeric soundId. The URL is relative to the public folder.
 *   2. `user.sendSounds()` - Call once in `initUser()` to push the sound registry
 *      to the client. Without this, the client has no sounds to play.
 *   3. `user.playSound(soundId, options)` - Trigger playback. Returns an instanceId
 *      for later manipulation. Options: volume, pitch, loop, fadeIn, x, y,
 *      lowpass, highpass, reverb.
 *   4. `user.setSoundEffects(instanceId, ...)` - Modify running sound in real-time.
 *   5. `user.stopSound(instanceId)` / `user.fadeOutSound(instanceId, duration)`.
 *   6. `user.pauseSound()` / `user.resumeSound()`.
 *
 * Spatial Audio:
 *   Sounds can be positioned in 2D space using `x` and `y` in `playSound()`.
 *   The listener position is set via `user.setListenerPosition(x, y)`.
 *   Configure the spatial model with `user.configureSpatialAudio({ maxDistance, ... })`.
 *   Moving the listener or the source changes volume and panning automatically.
 *
 * Audio Effects (Real-time):
 *   - Lowpass: Cuts high frequencies. Range ~20-20000 Hz. Use for muffled/underwater.
 *   - Highpass: Cuts low frequencies. Range ~20-10000 Hz. Use for tinny/radio.
 *   - Reverb: Wet/dry mix 0.0-1.0. Simulates room reflections.
 *   - Pitch: Playback rate multiplier. 1.0 = normal, 0.5 = octave down, 2.0 = octave up.
 *   - Volume: Gain multiplier. 0.0 = silent, 1.0 = normal, 2.0 = boosted.
 *
 * What this example demonstrates:
 *   - A looping ambient sound (rain) with interactive play/stop/fade-out controls.
 *   - Real-time manipulation of five audio effects on a running sound instance:
 *     lowpass filter, highpass filter, reverb wet/dry, pitch multiplier, and volume.
 *   - 2D spatial audio: a movable listener whose position automatically adjusts
 *     volume and panning of spatially positioned sounds.
 *   - One-shot sounds (click, thunder) played on demand with independent instances.
 *
 * Key Concepts:
 *   - `engine.loadSound(name, url)` - register a sound asset during `init()`; returns a numeric soundId.
 *   - `user.sendSounds()` - push the sound registry to the client once in `initUser()`.
 *   - `user.playSound(soundId, { volume, pitch, loop, fadeIn, x, y, lowpass, highpass, reverb })` - trigger playback; returns an instanceId.
 *   - `user.setSoundEffects(instanceId, { volume, pitch, lowpass, highpass, reverb })` - modify a running sound in real-time.
 *   - `user.stopSound(instanceId)` / `user.fadeOutSound(instanceId, duration)` - stop playback immediately or with a fade.
 *   - `user.pauseSound(instanceId)` / `user.resumeSound(instanceId)` - pause and resume.
 *   - `user.setListenerPosition(x, y)` - move the spatial audio listener.
 *   - `user.configureSpatialAudio({ maxDistance, ... })` - tune the spatial attenuation model.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  KeyboardInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

// Sound IDs (set during init)
let rainSoundId: number | undefined;
let clickSoundId: number | undefined;
let thunderSoundId: number | undefined;

interface AudioUserData {
  staticLayer: Layer;
  dynamicLayer: Layer;

  // Playback state
  rainInstanceId: number | undefined;
  isRainPlaying: boolean;

  // Listener position (for spatial audio)
  listenerX: number;
  listenerY: number;

  // Real-time effect parameters
  lowpass: number;
  highpass: number;
  reverb: number;
  pitch: number;
  volume: number;
}

export class AudioShowcase implements IApplication<
  Engine,
  User<AudioUserData>
> {
  async init(_runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 10, g: 10, b: 20, a: 255 }, // Dark BG
      { colorId: 1, r: 80, g: 200, b: 120, a: 255 }, // Green
      { colorId: 2, r: 250, g: 80, b: 80, a: 255 }, // Red
      { colorId: 3, r: 200, g: 200, b: 250, a: 255 }, // White
      { colorId: 4, r: 100, g: 100, b: 150, a: 255 }, // Gray
      { colorId: 5, r: 255, g: 200, b: 80, a: 255 }, // Yellow
      { colorId: 6, r: 80, g: 150, b: 255, a: 255 }, // Blue
      { colorId: 7, r: 200, g: 100, b: 255, a: 255 }, // Purple
    ]);

    // Resource loading
    const ra = new URL("./rain.mp3", import.meta.url).href;
    const ta = new URL("./thunder.mp3", import.meta.url).href;
    const ca = new URL("./click.mp3", import.meta.url).href;

    rainSoundId = await engine.loadSound("rain", ra);
    thunderSoundId = await engine.loadSound("thunder", ta);
    clickSoundId = await engine.loadSound("click", ca);

    _runtime.setTickRate(60);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<AudioUserData>,
  ): void {
    const width = 80;
    const height = 40;

    user.data.rainInstanceId = undefined;
    user.data.isRainPlaying = false;
    user.data.listenerX = 40;
    user.data.listenerY = 30;
    user.data.lowpass = 20000;
    user.data.highpass = 0;
    user.data.reverb = 0;
    user.data.pitch = 1.0;
    user.data.volume = 0.5;

    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);

    // Static layer for labels and fixed UI
    const staticLayer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    user.data.staticLayer = staticLayer;
    user.addLayer(staticLayer);

    // Dynamic layer for changing values
    const dynamicLayer = new Layer(new Vector2(0, 0), 1, width, height, {
      mustBeReliable: false,
    });
    user.data.dynamicLayer = dynamicLayer;
    user.addLayer(dynamicLayer);

    // Draw all static content once
    const staticOrders: any[] = [];
    staticOrders.push(
      OrderBuilder.fill(" ", 0, 0),
      OrderBuilder.text(2, 1, "--- PRIMITIV AUDIO SHOWCASE ---", 3, 0),
      // Playback section
      OrderBuilder.text(2, 3, "PLAYBACK:", 3, 0),
      OrderBuilder.text(2, 4, "[Space]", 4, 0),
      OrderBuilder.text(10, 4, "Rain Loop:", 4, 0),
      OrderBuilder.text(2, 5, "[C]", 4, 0),
      OrderBuilder.text(10, 5, "Click (one-shot, random pitch)", 4, 0),
      OrderBuilder.text(2, 6, "[V]", 4, 0),
      OrderBuilder.text(10, 6, "Thunder (spatial, left side)", 4, 0),
      // Effects section
      OrderBuilder.text(2, 9, "EFFECTS (on rain loop):", 3, 0),
      OrderBuilder.text(
        2,
        10,
        "Hold number to increase, letter to decrease",
        4,
        0,
      ),
      OrderBuilder.text(2, 12, "[1/Q] Lowpass:", 4, 0),
      OrderBuilder.text(2, 13, "[2/W] Highpass:", 4, 0),
      OrderBuilder.text(2, 14, "[3/E] Reverb:", 4, 0),
      OrderBuilder.text(2, 15, "[4/R] Pitch:", 4, 0),
      OrderBuilder.text(2, 16, "[5/T] Volume:", 4, 0),
      // Spatial section
      OrderBuilder.text(2, 19, "2D SPATIAL AUDIO:", 3, 0),
      OrderBuilder.text(2, 20, "Move listener with Arrow Keys", 4, 0),
      // Controls summary
      OrderBuilder.text(
        40,
        38,
        "Space=Rain  C=Click  V=Thunder  Arrows=Move",
        4,
        0,
      ),
    );
    staticLayer.setOrders(staticOrders);


    const registry = user.getInputBindingRegistry();

    // Toggle rain loop
    registry.defineButton(0, "TOGGLE_RAIN", [
      { sourceId: 0, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
    ]);

    // One-shot: click sound
    registry.defineButton(1, "PLAY_CLICK", [
      { sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyC },
    ]);

    // One-shot: thunder sound
    registry.defineButton(2, "PLAY_THUNDER", [
      { sourceId: 2, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyV },
    ]);

    // Effect controls
    registry.defineButton(3, "LP_UP", [
      {
        sourceId: 3,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit1,
      },
    ]);
    registry.defineButton(4, "LP_DOWN", [
      { sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyQ },
    ]);
    registry.defineButton(5, "HP_UP", [
      {
        sourceId: 5,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit2,
      },
    ]);
    registry.defineButton(6, "HP_DOWN", [
      { sourceId: 6, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyW },
    ]);
    registry.defineButton(7, "REV_UP", [
      {
        sourceId: 7,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit3,
      },
    ]);
    registry.defineButton(8, "REV_DOWN", [
      { sourceId: 8, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyE },
    ]);
    registry.defineButton(9, "PITCH_UP", [
      {
        sourceId: 9,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit4,
      },
    ]);
    registry.defineButton(10, "PITCH_DOWN", [
      { sourceId: 10, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyR },
    ]);
    registry.defineButton(11, "VOL_UP", [
      {
        sourceId: 11,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit5,
      },
    ]);
    registry.defineButton(12, "VOL_DOWN", [
      { sourceId: 12, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyT },
    ]);

    // Listener movement (Arrow keys)
    registry.defineAxis(0, "LISTEN_X", [
      {
        sourceId: 13,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowLeft,
        positiveKey: KeyboardInput.ArrowRight,
      },
    ]);
    registry.defineAxis(1, "LISTEN_Y", [
      {
        sourceId: 14,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowUp,
        positiveKey: KeyboardInput.ArrowDown,
      },
    ]);

    /**
     * SEND SOUNDS TO CLIENT
     * This MUST be called in initUser(). It tells the client runtime to
     * download all registered sounds from the URLs provided in init().
     */
    user.sendSounds();

    /**
     * CONFIGURE SPATIAL AUDIO
     * Set up the distance model for 2D sound positioning.
     */
    user.configureSpatialAudio({
      maxDistance: 80,
      referenceDistance: 10,
      rolloffFactor: 1,
    });

    user.setListenerPosition(user.data.listenerX, user.data.listenerY);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<AudioUserData>,
  ): void {
    const data = user.data;
    const o: any[] = [];

    // =====================================================================
    // PLAYBACK CONTROLS - Dynamic state
    // =====================================================================

    // Toggle rain (loop)
    if (user.isJustPressed("TOGGLE_RAIN")) {
      if (data.isRainPlaying && data.rainInstanceId !== undefined) {
        user.fadeOutSound(data.rainInstanceId, 1.0);
        data.isRainPlaying = false;
        data.rainInstanceId = undefined;
      } else {
        data.rainInstanceId = user.playSound(rainSoundId!, {
          volume: data.volume,
          loop: true,
          fadeIn: 1.0,
          x: 60, // Rain source is at right side
          y: 25,
          lowpass: data.lowpass,
          highpass: data.highpass,
          reverb: data.reverb,
          pitch: data.pitch,
        });
        data.isRainPlaying = true;
      }
    }

    o.push(
      OrderBuilder.text(
        21,
        4,
        data.isRainPlaying ? "PLAYING" : "STOPPED",
        data.isRainPlaying ? 1 : 2,
        0,
      ),
    );

    // One-shot: Click
    if (user.isJustPressed("PLAY_CLICK")) {
      user.playSound(clickSoundId!, {
        volume: 1.0,
        pitch: 0.8 + Math.random() * 0.4, // Slight random pitch variation
      });
    }

    // One-shot: Thunder (spatial, positioned far left)
    if (user.isJustPressed("PLAY_THUNDER")) {
      user.playSound(thunderSoundId!, {
        volume: 0.7,
        x: 5, // Thunder far left
        y: 30,
        reverb: 0.8,
      });
    }

    // =====================================================================
    // REAL-TIME EFFECTS (applied to running rain loop)
    // =====================================================================
    let effectsChanged = false;

    // Lowpass
    if (user.getButton("LP_UP")) {
      data.lowpass = Math.min(20000, data.lowpass * 1.05);
      effectsChanged = true;
    }
    if (user.getButton("LP_DOWN")) {
      data.lowpass = Math.max(20, data.lowpass * 0.95);
      effectsChanged = true;
    }

    // Highpass
    if (user.getButton("HP_UP")) {
      data.highpass = Math.min(10000, data.highpass + 100);
      effectsChanged = true;
    }
    if (user.getButton("HP_DOWN")) {
      data.highpass = Math.max(0, data.highpass - 100);
      effectsChanged = true;
    }

    // Reverb
    if (user.getButton("REV_UP")) {
      data.reverb = Math.min(1.0, data.reverb + 0.02);
      effectsChanged = true;
    }
    if (user.getButton("REV_DOWN")) {
      data.reverb = Math.max(0, data.reverb - 0.02);
      effectsChanged = true;
    }

    // Pitch
    if (user.getButton("PITCH_UP")) {
      data.pitch = Math.min(4.0, data.pitch + 0.01);
      effectsChanged = true;
    }
    if (user.getButton("PITCH_DOWN")) {
      data.pitch = Math.max(0.1, data.pitch - 0.01);
      effectsChanged = true;
    }

    // Volume
    if (user.getButton("VOL_UP")) {
      data.volume = Math.min(2.0, data.volume + 0.01);
      effectsChanged = true;
    }
    if (user.getButton("VOL_DOWN")) {
      data.volume = Math.max(0, data.volume - 0.01);
      effectsChanged = true;
    }

    // Apply effects to running rain loop
    if (effectsChanged && data.rainInstanceId !== undefined) {
      user.setSoundEffects(data.rainInstanceId, {
        lowpass: data.lowpass,
        highpass: data.highpass,
        reverb: data.reverb,
        pitch: data.pitch,
        volume: data.volume,
      });
    }

    // Effect values - dynamic content only
    const effY = 12;
    const col2 = 24;

    o.push(
      OrderBuilder.text(
        col2,
        effY,
        `${Math.round(data.lowpass)} Hz`.padEnd(12, " "),
        data.lowpass < 20000 ? 5 : 4,
        0,
      ),
    );

    o.push(
      OrderBuilder.text(
        col2,
        effY + 1,
        `${Math.round(data.highpass)} Hz`.padEnd(12, " "),
        data.highpass > 0 ? 5 : 4,
        0,
      ),
    );

    o.push(
      OrderBuilder.text(
        col2,
        effY + 2,
        `${(data.reverb * 100).toFixed(0)}%`.padEnd(8, " "),
        data.reverb > 0 ? 7 : 4,
        0,
      ),
    );

    o.push(
      OrderBuilder.text(
        col2,
        effY + 3,
        `${data.pitch.toFixed(2)}x`.padEnd(8, " "),
        data.pitch !== 1.0 ? 6 : 4,
        0,
      ),
    );

    o.push(
      OrderBuilder.text(
        col2,
        effY + 4,
        `${(data.volume * 100).toFixed(0)}%`.padEnd(8, " "),
        4,
        0,
      ),
    );

    // Visual lowpass bar
    const lpNorm = Math.log(data.lowpass / 20) / Math.log(20000 / 20); // log scale 0..1
    const lpLen = Math.floor(lpNorm * 30);
    o.push(OrderBuilder.rect(col2 + 12, effY, 30, 1, "-", 4, 0, true));
    if (lpLen > 0)
      o.push(OrderBuilder.rect(col2 + 12, effY, lpLen, 1, "=", 5, 0, true));

    // =====================================================================
    // SPATIAL AUDIO VISUALIZER
    // =====================================================================

    // Move listener
    const moveX = user.getAxis("LISTEN_X");
    const moveY = user.getAxis("LISTEN_Y");
    if (moveX !== 0 || moveY !== 0) {
      data.listenerX = Math.max(2, Math.min(77, data.listenerX + moveX * 0.5));
      data.listenerY = Math.max(23, Math.min(37, data.listenerY + moveY * 0.5));
      user.setListenerPosition(data.listenerX, data.listenerY);
    }

    // Draw spatial field
    o.push(OrderBuilder.rect(2, 22, 76, 16, ".", 4, 0, false));

    // Draw sound sources
    // Rain source (right side)
    o.push(OrderBuilder.char(60, 25, "R", data.isRainPlaying ? 6 : 4, 0));
    o.push(OrderBuilder.text(62, 25, "Rain", data.isRainPlaying ? 6 : 4, 0));

    // Thunder source (left side)
    o.push(OrderBuilder.char(5, 30, "T", 7, 0));
    o.push(OrderBuilder.text(7, 30, "Thunder", 7, 0));

    // Draw listener
    const lx = Math.floor(data.listenerX);
    const ly = Math.floor(data.listenerY);
    o.push(OrderBuilder.char(lx, ly, "@", 1, 0));
    o.push(OrderBuilder.text(lx + 2, ly, "Listener", 1, 0));

    // Listener coordinates
    o.push(
      OrderBuilder.text(
        2,
        38,
        `Listener: (${lx}, ${ly})`.padEnd(20, " "),
        4,
        0,
      ),
    );

    // Commit
    data.dynamicLayer.setOrders(o);

  }

  update(_runtime: IRuntime, _engine: Engine): void {}
}
```

---

## File: applications/11-custom-sprites/index.ts

```typescript
﻿/**
 * Name: custom-sprites
 * Description: Renders the complete GPU atlas side by side - block 0 (CP437, charCodes 0–255)
 *   and block 1 (custom PNG, charCodes 256–511) - as two 16×16 glyph grids exactly as they
 *   are laid out inside the engine's font atlas.
 *
 * Why study this:
 *   Every previous example drew characters using the built-in CP437 font - a fixed
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
 *     Every block is laid out as 16 columns × 16 rows of glyphs - always 256 slots, no exceptions.
 *   - Block 0 is always the built-in CP437 font, loaded automatically. Its glyphs are
 *     natively 8×8 pixels. This means the built-in block 0 is ONLY usable when the
 *     declared cell size is 8×8. If you need a different cell size (e.g. 16×16), you must
 *     replace block 0 by calling `engine.loadFontBlock(0, url)` with a PNG that matches
 *     the declared dimensions - there is no way to keep the built-in CP437 and switch to
 *     a different cell size at the same time.
 *   - `engine.loadFont(cellW, cellH, blockCapacity, ...)` declares a SINGLE cell size that
 *     applies to EVERY block in the atlas - including block 0. You cannot mix cell sizes:
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
 *   Standard `subFrameMulti` on a 16-bit layer is still expensive in connected mode -
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
 *     be misaligned. All blocks share the same cell dimensions - there is no per-block override.
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
 *   - `engine.loadFont(cellW, cellH, blockCapacity, ...)` - declares the GLOBAL cell size
 *     (shared by all blocks) and the maximum number of blocks the atlas can hold.
 *   - `engine.loadFontBlock(index, url)` - load a glyph sheet into a block slot.
 *   - `new Layer(..., { charCodeMode: '16bit' })` - enable charCodes >255 on a layer.
 *   - `OrderBuilder.char(x, y, charCode, fgColorId, bgColorId)` - single glyph by code.
 *   - `OrderBuilder.subFrameMulti(x, y, w, h, cells)` - bulk cell data supporting 16-bit codes.
 *   - `user.getMouseDisplayInfo()` - returns `{ localX, localY }` (cell coordinates) or null.
 *   - Two layers with different zIndex keep static content and dynamic cursor completely separate.
 *   - Hover state tracking: store `lastHoveredCell` and skip `commit()` when unchanged -
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
      { colorId: 1, r: 220, g: 220, b: 220, a: 255 }, // Light gray  - CP437 glyphs
      { colorId: 2, r: 100, g: 200, b: 255, a: 255 }, // Sky blue    - block 1 glyphs
      { colorId: 3, r: 255, g: 200, b: 50, a: 255 }, // Gold        - titles
      { colorId: 4, r: 160, g: 160, b: 180, a: 255 }, // Dim gray    - axis labels
      { colorId: 5, r: 50, g: 50, b: 70, a: 255 }, // Panel bg
      { colorId: 6, r: 255, g: 255, b: 255, a: 255 }, // White
      { colorId: 7, r: 80, g: 180, b: 120, a: 255 }, // Mint green  - formula text
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

    // Static atlas layer - 16-bit to address charCodes 256–511 (block 1)
    const layer = new Layer(new Vector2(0, 0), 0, W, H, {
      charCodeMode: "16bit",
    });
    user.data.layer = layer;
    user.addLayer(layer);

    // Cursor layer - volatile (mustBeReliable: false), higher zIndex, 16-bit for glyph preview
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

      // ── 3×3 preview (same glyph repeated - shows tiling behaviour) ──────
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
```

---

## File: applications/12-bridge-communication/index.ts

```typescript
/**
 * Name: bridge-communication
 * Description: Demonstrates bidirectional message passing between the Primitiv engine and
 *   the host application (React, Vue, or any JS wrapper embedding the Primitiv client).
 *
 * Why study this:
 *   Primitiv applications run inside a sandboxed engine loop. They have no direct access
 *   to the DOM, to React state, or to any external API. The Bridge is the official
 *   communication channel that connects the engine world to the outside host application.
 *
 *   Typical use cases:
 *   - A React admin panel sends configuration changes to the running game.
 *   - The engine notifies React of a game event (score update, player death) so React
 *     can update its own UI (leaderboard, modal, etc.).
 *   - A chat system where messages flow from a React input field into the engine world.
 *
 * Bridge Architecture:
 *   HOST (React/Vue/etc.)                     ENGINE (Primitiv Application)
 *   ─────────────────────                     ──────────────────────────────
 *   runtime.sendBridge(channel, data)  ──→    user.bridgeInbox (array of messages)
 *   onBridgeMessage(channel, data)     ←──    runtime.sendBridge(userId, channel, data)
 *                                     ←──    runtime.broadcastBridge(channel, data)
 *
 * Receiving Messages (Engine side):
 *   `user.bridgeInbox` is a plain array that ACCUMULATES messages pushed by the host.
 *   The engine does NOT auto-clear this array between ticks.
 *   CRITICAL: You MUST manually clear `user.bridgeInbox` after processing it
 *   (e.g. `user.bridgeInbox.length = 0`). If you forget, the same messages will be
 *   re-processed every tick indefinitely, causing bugs like stuck visual effects.
 *
 * Sending Messages (Engine → Host):
 *   `runtime.sendBridge(userId, channel, data)` sends a message to a SPECIFIC user's host.
 *   `runtime.broadcastBridge(channel, data)` sends to ALL connected users' hosts at once.
 *   The host application listens via its runtime's `onBridgeMessage` callback.
 *
 * What this example demonstrates:
 *   A "Remote Control Dashboard" where the React host panel acts as an admin console:
 *   - React changes the engine's color theme by switching palette slots (zero-cost recolor).
 *   - React injects visual alerts (border flash).
 *   - The engine broadcasts live stats (uptime, tick, clients) to all hosts via broadcastBridge.
 *   - A "PRESS SPACE" indicator lights up when the user sends a ping to React via sendBridge.
 *   - An event log records every bridge interaction (incoming + outgoing).
 *
 * Key Concepts:
 *   - `user.bridgeInbox`: Reading and clearing incoming messages from the host.
 *   - `runtime.sendBridge()`: Sending outgoing messages to a specific user's host.
 *   - `runtime.broadcastBridge()`: Sending outgoing messages to ALL users' hosts.
 *   - `update()` vs `updateUser()`: Global logic (broadcast) vs per-user logic (render).
 *   - Channel-based routing: Messages are tagged with a string channel name.
 *   - Real use case: Remote palette switching via bridge command.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  KeyboardInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

// =====================================================================
// Constants
// =====================================================================

/** Maximum number of log entries displayed in the event log. */
const MAX_LOG_ENTRIES = 12;

/** Available theme names (each maps to a palette slot). */
const THEME_NAMES = ["CYBER", "FOREST", "SUNSET", "OCEAN"];

// =====================================================================
// User Data
// =====================================================================

/**
 * Custom data structure stored for each connected user.
 * In Standalone mode, there is only one user ("Player").
 */
interface BridgeUserData {
  /** The user's Display, stored so we can switch its palette at runtime. */
  display: Display;

  /** The single rendering layer for the UI. */
  layer: Layer;

  /**
   * Rolling event log displayed at the bottom of the screen.
   * Newest entries are at the front (index 0). Capped at MAX_LOG_ENTRIES.
   */
  eventLog: { text: string; color: number }[];

  /**
   * Remaining ticks for the "alert flash" effect (border turns red).
   * Triggered when the React host injects an alert via bridge.
   */
  alertFlash: number;

  /** Index of the currently active theme/palette (0-3). */
  currentTheme: number;

  /** Counter tracking how many messages this user has sent to the host. */
  sentToReactCount: number;

  /** Counter tracking how many broadcastBridge heartbeats have been emitted. */
  heartbeatCount: number;

  /**
   * Remaining ticks for the "PRESS SPACE" indicator highlight.
   * When > 0, the indicator renders with a bright background to show the key was pressed.
   */
  spaceFlash: number;
}

export class BridgeShowcase implements IApplication<
  Engine,
  User<BridgeUserData>
> {
  // =====================================================================
  // Global State (shared across all users)
  // =====================================================================

  /** Global tick counter, incremented in update(). Used for broadcast timing. */
  private tickCount = 0;

  /** Monotonic broadcast sequence number. Sent in every heartbeat payload. */
  private broadcastSeq = 0;

  /** Timestamp (ms) when the engine started. Used to compute uptime. */
  private startTime = Date.now();

  /**
   * Global initialization (called once when the application starts).
   * Use this to load resources shared by all users (palettes, fonts, sounds).
   *
   * We pre-load 4 palette themes into slots 0-3. Switching between them is
   * instantaneous and free (no orders resent, no layers redrawn).
   * The React panel will command which slot to activate via bridge.
   */
  async init(_runtime: IRuntime, engine: Engine): Promise<void> {
    // THEME 0: CYBER (default) - dark blue, neon accents
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 8, g: 12, b: 20, a: 255 }, // bg
      { colorId: 1, r: 0, g: 200, b: 120, a: 255 }, // green accent
      { colorId: 2, r: 255, g: 70, b: 70, a: 255 }, // red alert
      { colorId: 3, r: 200, g: 200, b: 220, a: 255 }, // light text
      { colorId: 4, r: 80, g: 90, b: 110, a: 255 }, // dim text
      { colorId: 5, r: 100, g: 180, b: 255, a: 255 }, // cyan title
      { colorId: 6, r: 255, g: 200, b: 60, a: 255 }, // amber
      { colorId: 7, r: 20, g: 28, b: 40, a: 255 }, // panel bg
      { colorId: 8, r: 180, g: 120, b: 255, a: 255 }, // purple
      { colorId: 9, r: 40, g: 55, b: 75, a: 255 }, // border
    ]);

    // THEME 1: FOREST - deep greens, earthy tones
    engine.loadPaletteToSlot(1, [
      { colorId: 0, r: 10, g: 18, b: 10, a: 255 },
      { colorId: 1, r: 80, g: 200, b: 80, a: 255 },
      { colorId: 2, r: 220, g: 100, b: 60, a: 255 },
      { colorId: 3, r: 200, g: 210, b: 180, a: 255 },
      { colorId: 4, r: 80, g: 100, b: 70, a: 255 },
      { colorId: 5, r: 120, g: 200, b: 100, a: 255 },
      { colorId: 6, r: 220, g: 180, b: 80, a: 255 },
      { colorId: 7, r: 18, g: 30, b: 18, a: 255 },
      { colorId: 8, r: 160, g: 200, b: 100, a: 255 },
      { colorId: 9, r: 40, g: 60, b: 40, a: 255 },
    ]);

    // THEME 2: SUNSET - warm oranges, purples
    engine.loadPaletteToSlot(2, [
      { colorId: 0, r: 20, g: 10, b: 15, a: 255 },
      { colorId: 1, r: 255, g: 150, b: 50, a: 255 },
      { colorId: 2, r: 255, g: 60, b: 80, a: 255 },
      { colorId: 3, r: 240, g: 220, b: 200, a: 255 },
      { colorId: 4, r: 120, g: 90, b: 80, a: 255 },
      { colorId: 5, r: 255, g: 120, b: 80, a: 255 },
      { colorId: 6, r: 255, g: 200, b: 100, a: 255 },
      { colorId: 7, r: 35, g: 18, b: 25, a: 255 },
      { colorId: 8, r: 200, g: 100, b: 180, a: 255 },
      { colorId: 9, r: 80, g: 40, b: 50, a: 255 },
    ]);

    // THEME 3: OCEAN - deep blues, aqua highlights
    engine.loadPaletteToSlot(3, [
      { colorId: 0, r: 5, g: 10, b: 25, a: 255 },
      { colorId: 1, r: 0, g: 180, b: 220, a: 255 },
      { colorId: 2, r: 255, g: 100, b: 100, a: 255 },
      { colorId: 3, r: 200, g: 220, b: 240, a: 255 },
      { colorId: 4, r: 60, g: 80, b: 120, a: 255 },
      { colorId: 5, r: 60, g: 160, b: 255, a: 255 },
      { colorId: 6, r: 100, g: 220, b: 200, a: 255 },
      { colorId: 7, r: 12, g: 20, b: 40, a: 255 },
      { colorId: 8, r: 100, g: 140, b: 255, a: 255 },
      { colorId: 9, r: 30, g: 45, b: 80, a: 255 },
    ]);

    this.startTime = Date.now();

    // 30 FPS - enough for a dashboard with floating text.
    _runtime.setTickRate(30);
  }

  /**
   * User initialization (called whenever a new client connects).
   * Sets up the Display, Layer, and input bindings for this user.
   */
  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<BridgeUserData>,
  ): void {
    const width = 80;
    const height = 40;

    // --- User Data ---
    user.data.eventLog = [];
    user.data.alertFlash = 0;
    user.data.currentTheme = 0;
    user.data.sentToReactCount = 0;
    user.data.heartbeatCount = 0;
    user.data.spaceFlash = 0;

    // --- Display Setup ---
    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0); // Start with CYBER theme
    display.setOrigin(new Vector2(0, 0));
    user.data.display = display;

    // --- Layer Setup ---
    // A single reliable layer for the UI.
    // `mustBeReliable: true` because this is a low-frequency dashboard.
    const layer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    user.data.layer = layer;
    user.addLayer(layer);

    // --- Input Bindings ---
    const registry = user.getInputBindingRegistry();

    // [SPACE]: Send a manual "ping" event to the React host via sendBridge.
    registry.defineButton(0, "SEND_PING", [
      {
        sourceId: 0,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Space,
      },
    ]);
  }

  /**
   * Per-user logic loop (called every tick, i.e. 30 times per second).
   * Handles bridge message processing, input, notification animation, and rendering.
   */
  updateUser(
    runtime: IRuntime,
    engine: Engine,
    user: User<BridgeUserData>,
  ): void {
    const data = user.data;

    // =====================================================================
    // 1. RECEIVE MESSAGES FROM HOST (React → Engine)
    // =====================================================================

    /**
     * Decrement the alert flash counter each tick.
     * This produces a brief red flash (~0.5s at 30fps = 15 ticks).
     */
    if (data.alertFlash > 0) data.alertFlash--;

    /**
     * Process all pending messages from the host application.
     * `user.bridgeInbox` is a plain array. Messages accumulate via .push() from the host.
     * We iterate over every message, checking the `channel` string to route logic.
     *
     * Supported incoming channels:
     * - 'message-to-engine': Text from React → spawns a floating notification bubble.
     * - 'inject-alert': Triggers a red border flash.
     * - 'set-theme': Changes the active palette slot (instant full-screen recolor).
     */
    for (const msg of user.bridgeInbox) {
      if (msg.channel === "message-to-engine") {
        const payload = msg.data as any;
        const text = payload.text || "Empty";

        this.pushLog(data, `[IN] ${text}`, 5);
        data.alertFlash = 10;
      }

      if (msg.channel === "set-theme") {
        const payload = msg.data as any;
        const themeIndex = payload.themeIndex ?? 0;
        if (themeIndex >= 0 && themeIndex < THEME_NAMES.length) {
          data.currentTheme = themeIndex;

          /**
           * PALETTE SWITCH VIA BRIDGE COMMAND
           * This is a practical real-world pattern: the React admin panel sends a
           * "set-theme" command, and the engine instantly recolors the entire display
           * by switching palette slots. No orders are resent. No layers redrawn.
           * Just one call → the whole look changes.
           * (See also: 06-palettes example for deep-dive on this mechanic.)
           */
          data.display.switchPalette(themeIndex);

          this.pushLog(
            data,
            `[THEME] Switched to ${THEME_NAMES[themeIndex]}`,
            1,
          );
        }
      }
    }

    /**
     * CRITICAL: Clear the inbox after processing.
     * The engine does NOT automatically clear `user.bridgeInbox` between ticks.
     * If you skip this line, the same messages will be re-read every single tick,
     * causing effects like the flash counter being permanently reset (never fading).
     */
    user.bridgeInbox.length = 0;

    // =====================================================================
    // 2. KEYBOARD INPUT → SEND TO HOST (Engine → React)
    // =====================================================================

    /**
     * On [SPACE]: send a manual ping event to this user's host.
     * `runtime.sendBridge(userId, channel, data)` targets a SPECIFIC user.
     * This differs from `broadcastBridge` (see update()) which targets ALL users.
     */
    if (user.isJustPressed("SEND_PING")) {
      data.sentToReactCount++;
      data.spaceFlash = 12; // ~0.4s highlight at 30fps

      runtime.sendBridge(user.id, "message-from-engine", {
        count: data.sentToReactCount,
        text: `Engine Ping #${data.sentToReactCount}`,
      });

      this.pushLog(data, `[OUT] Ping #${data.sentToReactCount} to React`, 6);
    }

    // Decrement space flash indicator
    if (data.spaceFlash > 0) data.spaceFlash--;

    // =====================================================================
    // 3. RENDERING
    // =====================================================================

    const o: any[] = [];
    const width = 80;

    // --- Background ---
    o.push(OrderBuilder.fill(" ", 0, 0));

    // --- Border (flashes red during alerts) ---
    const borderColor = data.alertFlash > 0 ? 2 : 9;
    o.push(OrderBuilder.rect(0, 0, width, 40, " ", borderColor, 0, false));

    // --- Title Bar ---
    o.push(OrderBuilder.rect(1, 1, 78, 2, " ", 0, 7, true));
    o.push(OrderBuilder.text(3, 1, "BRIDGE COMMUNICATION", 5, 7));
    o.push(
      OrderBuilder.text(3, 2, `Theme: ${THEME_NAMES[data.currentTheme]}`, 4, 7),
    );

    // --- Server Stats (top right, from broadcastBridge data) ---
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const uptimeStr = this.formatUptime(uptime);
    const sessions = engine.sessions ? engine.sessions.size : 1;

    o.push(OrderBuilder.text(45, 1, `UPTIME: ${uptimeStr}`, 1, 7));
    o.push(
      OrderBuilder.text(
        45,
        2,
        `CLIENTS: ${sessions}  HB: #${data.heartbeatCount}`,
        4,
        7,
      ),
    );

    // =====================================================================
    // PRESS SPACE INDICATOR
    // Lights up with a colored background when the user presses [SPACE].
    // A simple, immediate visual feedback for the sendBridge action.
    // =====================================================================

    const spaceY = 5;
    const spaceActive = data.spaceFlash > 0;
    const spaceFg = spaceActive ? 0 : 6;
    const spaceBg = spaceActive ? 1 : 7;

    o.push(OrderBuilder.rect(1, 4, 78, 5, " ", 9, 0, false));
    o.push(OrderBuilder.rect(20, spaceY, 40, 3, " ", spaceFg, spaceBg, true));
    o.push(
      OrderBuilder.text(
        27,
        spaceY + 1,
        spaceActive
          ? `  PING #${data.sentToReactCount} SENT!  `
          : "  PRESS  [SPACE]  TO  PING  ",
        spaceFg,
        spaceBg,
      ),
    );

    // Hint line below the indicator
    o.push(
      OrderBuilder.text(
        22,
        spaceY + 4,
        "sendBridge() -> React host panel",
        4,
        0,
      ),
    );
    o.push(
      OrderBuilder.text(
        55,
        spaceY + 4,
        `Pings: ${data.sentToReactCount}`,
        3,
        0,
      ),
    );

    // =====================================================================
    // CONTROLS
    // =====================================================================

    const ctrlY = 11;
    o.push(OrderBuilder.text(2, ctrlY, "CONTROLS:", 3, 0));
    o.push(OrderBuilder.text(2, ctrlY + 1, "[SPACE]", 6, 0));
    o.push(
      OrderBuilder.text(12, ctrlY + 1, "Send ping to React (sendBridge)", 4, 0),
    );

    // =====================================================================
    // EVENT LOG
    // =====================================================================

    const logY = 14;
    o.push(OrderBuilder.text(2, logY, "EVENT LOG:", 3, 0));
    o.push(
      OrderBuilder.rect(1, logY + 1, 78, MAX_LOG_ENTRIES + 1, " ", 4, 7, true),
    );

    for (let i = 0; i < MAX_LOG_ENTRIES; i++) {
      const entry = data.eventLog[i];
      if (entry) {
        o.push(
          OrderBuilder.text(
            2,
            logY + 1 + i,
            entry.text.substring(0, 76),
            entry.color,
            7,
          ),
        );
      }
    }

    // Commit orders to the layer. Required every tick after setOrders().
    data.layer.setOrders(o);

  }

  // =====================================================================
  // GLOBAL UPDATE - broadcastBridge
  // =====================================================================

  /**
   * Global update (called every tick, independent of users).
   *
   * This is the ideal place for logic that is NOT per-user: timers, world simulation,
   * and BROADCAST messages that should reach every connected host at once.
   *
   * `runtime.broadcastBridge(channel, data)` sends a message to ALL connected users'
   * host applications simultaneously. Unlike `sendBridge(userId, ...)` which targets
   * one specific user, broadcast is fire-and-forget to everyone.
   *
   * Here we broadcast engine telemetry every second. The React host displays this data
   * in real-time (uptime, tick count, connected clients, current theme).
   */
  update(runtime: IRuntime, engine: Engine): void {
    this.tickCount++;

    // Broadcast engine stats to ALL connected hosts every ~1 second (30 ticks @ 30fps).
    if (this.tickCount % 30 === 0) {
      this.broadcastSeq++;
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const sessions = engine.sessions ? engine.sessions.size : 1;

      /**
       * `runtime.broadcastBridge(channel, data)`
       * Sends the payload to EVERY connected user's host in a single call.
       * In Connected mode (server/client), this reaches all remote clients.
       * In Standalone mode, there is only one user, so it behaves like sendBridge.
       */
      runtime.broadcastBridge("engine-heartbeat", {
        seq: this.broadcastSeq,
        uptimeSeconds: uptime,
        tickCount: this.tickCount,
        connectedClients: sessions,
        timestamp: Date.now(),
      });

      // Update each user's heartbeat counter for display purposes.
      if (engine.sessions) {
        for (const user of engine.sessions.values()) {
          (user as User<BridgeUserData>).data.heartbeatCount =
            this.broadcastSeq;
        }
      }
    }
  }

  // =====================================================================
  // HELPERS
  // =====================================================================

  /** Push a new entry to the top of the event log (capped at MAX_LOG_ENTRIES). */
  private pushLog(data: BridgeUserData, text: string, color: number): void {
    data.eventLog.unshift({ text, color });
    if (data.eventLog.length > MAX_LOG_ENTRIES) {
      data.eventLog.length = MAX_LOG_ENTRIES;
    }
  }

  /** Format seconds into a human-readable "Xh Xm Xs" string. */
  private formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
}
```

---

## File: applications/13-multi-display/index.ts

```typescript
/**
 * Name: multi-display
 * Description: One application driving two independent Display surfaces simultaneously.
 *
 * Why study this:
 *   Primitiv supports multiple Displays per user. Each Display is fully independent:
 *   it has its own size, its own canvas, and a configurable world-space origin. A
 *   single engine tick synchronizes them all - the host mounts each canvas side-by-side.
 *
 *   This example demonstrates the most compelling multi-display use case: a seamless
 *   world split across two physical screens. Both displays share the same coordinate
 *   space. Entities that reach the right edge of Display 0 continue naturally into
 *   Display 1, and vice versa.
 *
 * What this example demonstrates:
 *   "Dual Screen" - fifteen entities bounce around a world twice as wide as a single
 *   display. The world is split down the middle:
 *   - Display 0 (left, 64×36): shows world columns 0..63.
 *   - Display 1 (right, 64×36): shows world columns 64..127.
 *   Both displays use the same palette and the same rendering logic. Entities move
 *   and draw their trails continuously across the boundary.
 *
 * Key Concepts:
 *   - `display.setOrigin(new Vector2(x, y))` - sets the world-space top-left corner
 *     of the display viewport. Display 1 has origin (64, 0) so it renders world
 *     columns 64..127 using local layer coordinates 0..63.
 *   - `new Layer(new Vector2(x, y), zIndex, w, h)` - layers also have a world-space
 *     origin. Layer 1 starts at (64, 0) so drawing at local position (p, q) maps to
 *     world position (64+p, q).
 *   - `display.setRenderPasses([{ id, zMin, zMax }])` - restricts which layers are
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
    // Used by both Display 0 and Display 1 - same visual identity across screens.
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
    display1.switchPalette(0); // Same palette - continuous visual identity.
    display1.setOrigin(new Vector2(D_W, 0));
    // Only composite layers with zIndex in [1, 1] → layer1 exclusively.
    display1.setRenderPasses([{ id: 0, zMin: 1, zMax: 1 }]);
    user.data.display1 = display1;

    /**
     * Layer 1: world origin (64, 0) - shifts local coordinates by D_W.
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
  // GLOBAL UPDATE - advance the simulation
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
    this.renderLayer(user.data, 0); // Display 0 - local offset 0
    this.renderLayer(user.data, 1); // Display 1 - local offset D_W
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
   * [0, D_W) after offsetting are drawn - entities off-screen are simply
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

  }
}
```

---

## File: applications/14-post-process/index.ts

```typescript
/**
 * Name: 14-post-process
 * Category: tutorial
 * Description: Demonstrates post-processing effects including CRT scanlines, pixel grids, and Ambilight edge glow.
 *
 * What it demonstrates (engine perspective):
 *   This example shows how to configure and toggle post-processing effects 
 *   on a Display. Because Primitiv Applications are isomorphic, these instructions 
 *   simply define the desired visual output. The actual execution of these effects 
 *   is completely decoupled and offloaded to the connected renderer without impacting 
 *   the core application logic.
 *
 * How it works:
 *   - The application loop maintains the state of the toggle flags (`crtEnabled`, `ambiEnabled`, etc).
 *   - When a user triggers an input (keys 1, 2, or 3), the logic calls `display.setPostProcess()`, 
 *     `display.setAmbientEffect()`, or `display.setGrid()`.
 *   - The engine automatically syncs these configuration changes with the active renderer.
 *   - The renderer interprets these settings to draw the final composite image, applying 
 *     the requested effects (like glow or CRT scanlines) on top of the character grid.
 *
 * Primitiv API used:
 *   - `display.setPostProcess({ scanlines: { ... } })`
 *   - `display.setAmbientEffect({ enabled, blur, scale, opacity })`
 *   - `display.setGrid({ enabled, color, lineWidth })`
 *   - `OrderBuilder.circle()` (used here to generate vibrant moving light sources for the Ambilight showcase)
 */

import {
    Engine,
    User,
    Layer,
    Display,
    OrderBuilder,
    Vector2,
    KeyboardInput,
    InputDeviceType,
    type IApplication,
    type IRuntime,
} from "@primitiv/engine";

interface PostProcessData {
    layer: Layer;
    time: number;
    crtEnabled: boolean;
    ambiEnabled: boolean;
    gridEnabled: boolean;
    prevStates: {
        crt: boolean;
        ambi: boolean;
        grid: boolean;
    };
}

export class PostProcessShowcase implements IApplication<Engine, User<PostProcessData>> {
    async init(runtime: IRuntime, engine: Engine): Promise<void> {
        const palette = [{ colorId: 0, r: 0, g: 0, b: 0 }];

        // 1-10: shades of white/gray
        for (let i = 1; i <= 10; i++) {
            const val = i * 25;
            palette.push({ colorId: i, r: val, g: val, b: val });
        }

        // Vibrant neon colors to show off the Ambilight effect
        palette.push({ colorId: 11, r: 255, g: 50, b: 50 }); // Red
        palette.push({ colorId: 12, r: 50, g: 255, b: 50 }); // Green
        palette.push({ colorId: 13, r: 50, g: 150, b: 255 }); // Blue
        palette.push({ colorId: 14, r: 255, g: 50, b: 255 }); // Magenta
        palette.push({ colorId: 15, r: 255, g: 255, b: 50 }); // Yellow

        engine.loadPaletteToSlot(0, palette);
        runtime.setTickRate(60);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<PostProcessData>): void {
        const width = 80;
        const height = 45;

        const layer = new Layer(new Vector2(0, 0), 0, width, height, { mustBeReliable: false });
        user.addLayer(layer);

        const display = new Display(0, width, height);
        display.switchPalette(0);

        // ==========================================
        // POST-PROCESSING CONFIGURATION
        // ==========================================

        // 1. CRT Scanlines
        display.setPostProcess({
            scanlines: {
                enabled: true,
                opacity: 0.25,
                pattern: 'horizontal',
                spacing: 3,
                thickness: 1,
                color: { r: 10, g: 15, b: 20 }
            }
        });

        // 2. Ambilight Edge Glow
        display.setAmbientEffect({
            enabled: true,
            blur: 40,
            scale: 2.5,
            opacity: 1,
        });

        // 3. Pixel Grid overlay
        display.setGrid({
            enabled: true,
            color: 'rgba(255, 0, 0, 0.5)',
            lineWidth: 0.5
        });

        user.addDisplay(display);

        // ==========================================
        // INPUT BINDINGS
        // ==========================================
        const inputRegistry = user.getInputBindingRegistry();

        inputRegistry.defineButton(0, "ToggleCRT", [
            { sourceId: 0, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit1 }
        ]);

        inputRegistry.defineButton(1, "ToggleAmbi", [
            { sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit2 }
        ]);

        inputRegistry.defineButton(2, "ToggleGrid", [
            { sourceId: 2, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit3 }
        ]);

        user.data = {
            layer,
            time: 0,
            crtEnabled: true,
            ambiEnabled: true,
            gridEnabled: true,
            prevStates: { crt: false, ambi: false, grid: false }
        };
    }

    updateUser(runtime: IRuntime, _engine: Engine, user: User<PostProcessData>): void {
        const data = user.data;
        data.time += 1 / runtime.getTickRate();

        const o: any[] = [];
        o.push(OrderBuilder.fill(" ", 0, 0));

        const w = 80;
        const h = 45;

        // Input Handling for Toggles (Edge detection)
        const isCrtPressed = user.getButton("ToggleCRT");
        if (isCrtPressed && !data.prevStates.crt) {
            data.crtEnabled = !data.crtEnabled;
            // setPostProcess overrides the entire post-processing configuration for this display.
            // When updated dynamically here, the Primitiv Engine efficiently syncs this state
            // change with the active renderer (whether local or over a network).
            user.getDisplays()[0].setPostProcess(data.crtEnabled ? {
                scanlines: {
                    enabled: true, opacity: 0.25, pattern: 'horizontal', spacing: 3, thickness: 1, color: { r: 10, g: 15, b: 20 }
                }
            } : { scanlines: { enabled: false } });
        }
        data.prevStates.crt = isCrtPressed;

        const isAmbiPressed = user.getButton("ToggleAmbi");
        if (isAmbiPressed && !data.prevStates.ambi) {
            data.ambiEnabled = !data.ambiEnabled;
            // setAmbientEffect requests an external glow effect from the renderer.
            // The renderer typically uses the colors from the edge cells of the grid to compute
            // a dynamic, immersive ambient light bleed around the display boundaries.
            user.getDisplays()[0].setAmbientEffect({
                enabled: data.ambiEnabled, blur: 40, scale: 2.5, opacity: 1,
            });
        }
        data.prevStates.ambi = isAmbiPressed;

        const isGridPressed = user.getButton("ToggleGrid");
        if (isGridPressed && !data.prevStates.grid) {
            data.gridEnabled = !data.gridEnabled;
            // setGrid renders an overlay grid over the characters, ideal for LCD/Matrix effects.
            user.getDisplays()[0].setGrid({
                enabled: data.gridEnabled, color: 'rgba(255, 0, 0, 0.5)', lineWidth: 0.5
            });
        }
        data.prevStates.grid = isGridPressed;

        // Bouncing Neon Balls to see the Ambilight reaction on screen borders
        const cx1 = w / 2 + Math.sin(data.time * 2.1) * (w / 2 - 5);
        const cy1 = h / 2 + Math.cos(data.time * 1.5) * (h / 2 - 5);
        o.push(OrderBuilder.circle(cx1, cy1, 4, { charCode: '█', fgColor: 11, bgColor: 0, filled: true }));

        const cx2 = w / 2 + Math.sin(data.time * 1.3) * (w / 2 - 5);
        const cy2 = h / 2 + Math.cos(data.time * 2.5) * (h / 2 - 5);
        o.push(OrderBuilder.circle(cx2, cy2, 5, { charCode: '█', fgColor: 12, bgColor: 0, filled: true }));

        const cx3 = w / 2 + Math.cos(data.time * 1.7) * (w / 2 - 5);
        const cy3 = h / 2 + Math.sin(data.time * 1.9) * (h / 2 - 5);
        o.push(OrderBuilder.circle(cx3, cy3, 6, { charCode: '▓', fgColor: 13, bgColor: 0, filled: true }));

        const cx4 = w / 2 + Math.cos(data.time * 0.9) * (w / 2 - 5);
        const cy4 = h / 2 + Math.cos(data.time * 1.1) * (h / 2 - 5);
        o.push(OrderBuilder.circle(cx4, cy4, 3, { charCode: '▒', fgColor: 14, bgColor: 0, filled: true }));

        // UI Panel
        o.push(OrderBuilder.rect(2, 2, 40, 9, ' ', 0, 1));
        o.push(OrderBuilder.text(4, 3, " VIRTUAL CRT DISPLAY ", 15, 1));

        o.push(OrderBuilder.text(4, 5, `[1] CRT Scanlines ${data.crtEnabled ? '(ON)' : '(OFF)'}`, data.crtEnabled ? 10 : 5, 1));
        o.push(OrderBuilder.text(4, 6, `[2] Ambilight Edge Glow ${data.ambiEnabled ? '(ON)' : '(OFF)'}`, data.ambiEnabled ? 10 : 5, 1));
        o.push(OrderBuilder.text(4, 7, `[3] Pixel Grid ${data.gridEnabled ? '(ON)' : '(OFF)'}`, data.gridEnabled ? 10 : 5, 1));

        data.layer.setOrders(o);

    }

    update(_runtime: IRuntime, _engine: Engine): void { }
}
```

---

## File: applications/15-multi-user/index.ts

```typescript
/**
 * Name: 15-multi-user
 * Category: tutorial
 * Description: Demonstrates the separation between the global update loop and the per-user update loop.
 *
 * What it demonstrates (engine perspective):
 *   This showcase highlights the two fundamentally distinct simulation loops provided by 
 *   the `IApplication` interface:
 *   
 *   1. `update(runtime, engine)`: The Global Loop. Runs exactly once per tick, regardless 
 *      of how many users are currently active. Exclusively used for simulating collective 
 *      world state, AI, physics, or global NPC entities.
 *   
 *   2. `updateUser(runtime, engine, user)`: The Per-User Loop. Runs sequentially for each 
 *      active User. Useful for reading specific inputs (joysticks/keyboards), updating 
 *      the personal avatar's state inside the global world, and generating an individualized 
 *      visual POV of the scene.
 *
 *   3. `destroyUser(runtime, engine, user)`: The Disconnect handler. Triggers whenever a User
 *      leaves the application natively or drops their network connection. Useful for cleaning
 *      up their avatar from the global state so they disappear for others.
 *
 *   4. Setup Tick Rate: 20 Hz. Because multiplayer sync across a network is inherently expensive
 *      to calculate and transmit, running a high 60 TPS loop generates unnecessary bandwidth bloat.
 *      20 ticks-per-second provides an optimal sweet spot for responsiveness without choking the port.
 *
 * Lifecycle and Environments:
 *   - When this application is hosted on a Server (e.g., via WebSocket), every time a new 
 *     network client connects, the engine creates a new `User` instance, passes it to `initUser()`, 
 *     and then starts calling `updateUser()` for them every tick. A server can juggle many users at once.
 *   - When running in the Standalone browser runtime, the exact same process occurs, but the engine 
 *     simply creates a single, local `User` instance for the current tab. The application code 
 *     remains identical in both environments.
 *
 * How it works:
 *   - The global `App` instance holds a `globalState` object (an NPC's position and a Map of all active users).
 *   - `update()` moves the autonomous NPC across the screen every frame.
 *   - `initUser()` registers the new user into the `globalState` with a unique session ID and a random color.
 *   - `updateUser()` reads the arrow keys of that specific user, modifies the avatar's `x` and `y` in the global Map, 
 *     and finally renders the entire shared state (the NPC, the current user '@', and all other users 'O').
 */

import {
    Engine,
    User,
    Layer,
    Display,
    OrderBuilder,
    Vector2,
    KeyboardInput,
    InputDeviceType,
    type IApplication,
    type IRuntime,
} from "@primitiv/engine";

interface PlayerData {
    x: number;
    y: number;
    colorId: number;
}

interface GlobalState {
    npcX: number;
    npcY: number;
    npcDirX: number;
    npcDirY: number;
    tickCount: number;
    players: Map<string, PlayerData>;
}

interface UserData {
    id: string;
    layer: Layer;
}

export class MultiUserShowcase implements IApplication<Engine, User<UserData>> {
    // 1. GLOBAL STATE
    // This state is shared among ALL active users natively.
    private globalState: GlobalState = {
        npcX: 40,
        npcY: 22,
        npcDirX: 1,
        npcDirY: 1,
        tickCount: 0,
        players: new Map()
    };

    async init(runtime: IRuntime, engine: Engine): Promise<void> {
        // Clear state on init to handle React Strict Mode / Fast Refresh gracefully
        this.globalState.players.clear();

        const palette = [{ colorId: 0, r: 0, g: 0, b: 0 }];
        palette.push({ colorId: 1, r: 255, g: 255, b: 255 }); // Text
        palette.push({ colorId: 2, r: 255, g: 50, b: 50 });   // NPC (Red)

        // Random player colors
        palette.push({ colorId: 3, r: 50, g: 255, b: 50 });   // Green
        palette.push({ colorId: 4, r: 50, g: 150, b: 255 });  // Blue
        palette.push({ colorId: 5, r: 255, g: 255, b: 50 });  // Yellow
        palette.push({ colorId: 6, r: 255, g: 50, b: 255 });  // Magenta
        palette.push({ colorId: 7, r: 50, g: 255, b: 255 });  // Cyan

        engine.loadPaletteToSlot(0, palette);
        runtime.setTickRate(20);
    }

    // ==========================================
    // THE GLOBAL LOOP
    // ==========================================
    // This function is executed exactly once per simulation frame (tick),
    // maintaining the core rules and logic of the application.
    update(_runtime: IRuntime, _engine: Engine): void {
        const state = this.globalState;
        state.tickCount++;

        state.npcX += state.npcDirX;
        state.npcY += state.npcDirY;

        // Bounce on boundaries
        if (state.npcX <= 0 || state.npcX >= 79) state.npcDirX *= -1;
        if (state.npcY <= 5 || state.npcY >= 44) state.npcDirY *= -1; // Top 5 reserved for UI
    }

    // ==========================================
    // THE USER INITIALIZATION
    // ==========================================
    initUser(_runtime: IRuntime, _engine: Engine, user: User<UserData>): void {
        const width = 80;
        const height = 45;

        // Note: `mustBeReliable: false` allows the engine to drop old frames if the user renderer lags
        const layer = new Layer(new Vector2(0, 0), 0, width, height, { mustBeReliable: false });
        user.addLayer(layer);

        const display = new Display(0, width, height);
        display.switchPalette(0);
        user.addDisplay(display);

        // Define generic movement axes abstracted from physical keys or gamepads
        const input = user.getInputBindingRegistry();
        input.defineAxis(0, "X", [
            { sourceId: 0, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight }
        ], -1, 1, 0);
        input.defineAxis(1, "Y", [
            { sourceId: 1, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown }
        ], -1, 1, 0);

        // Generate a random ID for this session and assign a random spawn & color
        const id = Math.random().toString(36).substring(2, 9);
        const colorId = 3 + Math.floor(Math.random() * 5); // Index 3 to 7

        this.globalState.players.set(id, {
            x: 10 + Math.floor(Math.random() * 60),
            y: 10 + Math.floor(Math.random() * 30),
            colorId,
        });

        // Save unique session ID in the individual User instance
        user.data = { layer, id };
    }

    // ==========================================
    // THE PER-USER LOOP
    // ==========================================
    // This function is executed N times per tick (N = active users).
    // Operations here process inputs, mutate personal state, and dispatch individualized render orders.
    updateUser(_runtime: IRuntime, _engine: Engine, user: User<UserData>): void {
        const data = user.data;
        const state = this.globalState;

        // Fetch this specific user's avatar from the global shared hashmap
        const myPlayer = state.players.get(data.id);
        if (!myPlayer) return;

        // 1. Process specific User Inputs
        // Read movement inputs unrestricted each tick since TPS is only 20
        const moveX = Math.round(user.getAxis("X"));
        const moveY = Math.round(user.getAxis("Y"));

        myPlayer.x += moveX;
        myPlayer.y += moveY;

        // Clamp coordinates to stay inside the logical room screen
        myPlayer.x = Math.max(0, Math.min(79, myPlayer.x));
        myPlayer.y = Math.max(5, Math.min(44, myPlayer.y));

        // 2. Render the Global World visually constructed for THIS specific user
        const o: any[] = [];
        o.push(OrderBuilder.fill(" ", 0, 0)); // Clear screen

        // Draw Global State Details UI
        o.push(OrderBuilder.rect(0, 0, 80, 5, " ", 0, 1)); // White UI background
        o.push(OrderBuilder.text(2, 1, "> APPLICATION STATE", 0, 1));
        o.push(OrderBuilder.text(2, 3, `Active Users: ${state.players.size}   |   Global Application Tick: ${state.tickCount}`, 0, 1));

        // Draw the Global Autonomous Bouncing NPC
        o.push(OrderBuilder.circle(state.npcX, state.npcY, 1, { charCode: "█", fgColor: 2, bgColor: 0, filled: true })); // Red NPC
        o.push(OrderBuilder.text(state.npcX - 1, Math.max(5, state.npcY - 2), "AI", 2, 0));

        // Draw all players
        for (const [id, player] of state.players.entries()) {
            if (id === data.id) {
                // Highlight my OWN player character differently exclusively on MY screen
                o.push(OrderBuilder.text(player.x, player.y, "@", player.colorId, 0));
                o.push(OrderBuilder.text(player.x - 1, player.y - 1, "YOU", player.colorId, 0));
            } else {
                // Draw other foreign players normally
                o.push(OrderBuilder.text(player.x, player.y, "O", player.colorId, 0));
            }
        }

        // 3. Send out personalized rendering instructions
        data.layer.setOrders(o);

    }

    // ==========================================
    // THE USER DESTRUCTION
    // ==========================================
    // This function is executed when a user disconnects or navigates away.
    // Operations here should clean up the user's presence from the shared global state.
    destroyUser(_runtime: IRuntime, _engine: Engine, user: User<UserData>): void {
        const data = user.data;
        if (data && data.id) {
            this.globalState.players.delete(data.id);
        }
    }
}
```

---

## File: applications/16-cp437/index.ts

```typescript
/**
 * Name: cp437
 * Description: Demonstrates that Unicode strings and raw CP437 numeric codes
 * produce identical glyphs in Primitiv.
 *
 * Layout - for each block of 16 consecutive CP437 slots:
 *   s> [16 glyphs rendered via Unicode string literals]
 *   n> [16 glyphs rendered via raw numeric CP437 codes]
 *   (blank separator)
 *
 * Both rows must look exactly the same.
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

const BG = 0;
const TITLE = 1;
const HDR = 2;
const C0 = 3;
const C1 = 4;
const C2 = 5;
const C3 = 6;
const C4 = 7;
const C5 = 8;

function cc(code: number): number {
  if (code < 0x20) return C0;
  if (code < 0x80) return C1;
  if (code < 0xa0) return C2;
  if (code < 0xc0) return C3;
  if (code < 0xe0) return C4;
  return C5;
}

const X = 2; // left column glyphs x
const XR_LBL = 20; // right column label x
const XR = 22; // right column glyphs x
const W = 16;
const DISPLAY_W = 40;
const DISPLAY_H = 2 + 8 * 3 - 1; // 25

interface Cp437UserData {
  layer: Layer;
}

export class Cp437Table implements IApplication<Engine, User<Cp437UserData>> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: BG, r: 10, g: 10, b: 18, a: 255 },
      { colorId: TITLE, r: 240, g: 240, b: 248, a: 255 },
      { colorId: HDR, r: 90, g: 90, b: 120, a: 255 },
      { colorId: C0, r: 80, g: 220, b: 255, a: 255 },
      { colorId: C1, r: 220, g: 220, b: 220, a: 255 },
      { colorId: C2, r: 100, g: 230, b: 130, a: 255 },
      { colorId: C3, r: 255, g: 200, b: 80, a: 255 },
      { colorId: C4, r: 100, g: 160, b: 255, a: 255 },
      { colorId: C5, r: 220, g: 110, b: 255, a: 255 },
    ]);
    runtime.setTickRate(1);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<Cp437UserData>,
  ): void {
    const display = new Display(0, DISPLAY_W, DISPLAY_H);
    user.addDisplay(display);
    display.switchPalette(0);

    display.setGrid({ enabled: true, lineWidth: 0.1, color: "#ffffff20" });

    const layer = new Layer(new Vector2(0, 0), 0, DISPLAY_W, DISPLAY_H, {
      mustBeReliable: true,
    });
    user.data.layer = layer;
    user.addLayer(layer);

    const orders: any[] = [];
    orders.push(OrderBuilder.fill(" ", BG, BG));
    orders.push(
      OrderBuilder.text(0, 0, "CP 437 - String vs Number charCode", TITLE, BG),
    );
    orders.push(OrderBuilder.text(0, 1, "─".repeat(DISPLAY_W), HDR, BG));

    // ── Group 0x00-0x0F ──
    orders.push(OrderBuilder.text(0, 2, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 2, W, 1, [
        { charCode: " ", fgColorCode: cc(0x00), bgColorCode: BG },
        { charCode: "☺", fgColorCode: cc(0x01), bgColorCode: BG },
        { charCode: "☻", fgColorCode: cc(0x02), bgColorCode: BG },
        { charCode: "♥", fgColorCode: cc(0x03), bgColorCode: BG },
        { charCode: "♦", fgColorCode: cc(0x04), bgColorCode: BG },
        { charCode: "♣", fgColorCode: cc(0x05), bgColorCode: BG },
        { charCode: "♠", fgColorCode: cc(0x06), bgColorCode: BG },
        { charCode: "•", fgColorCode: cc(0x07), bgColorCode: BG },
        { charCode: "◘", fgColorCode: cc(0x08), bgColorCode: BG },
        { charCode: "○", fgColorCode: cc(0x09), bgColorCode: BG },
        { charCode: "◙", fgColorCode: cc(0x0a), bgColorCode: BG },
        { charCode: "♂", fgColorCode: cc(0x0b), bgColorCode: BG },
        { charCode: "♀", fgColorCode: cc(0x0c), bgColorCode: BG },
        { charCode: "♪", fgColorCode: cc(0x0d), bgColorCode: BG },
        { charCode: "♫", fgColorCode: cc(0x0e), bgColorCode: BG },
        { charCode: "☼", fgColorCode: cc(0x0f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 3, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 3, W, 1, [
        { charCode: 0x00, fgColorCode: cc(0x00), bgColorCode: BG },
        { charCode: 0x01, fgColorCode: cc(0x01), bgColorCode: BG },
        { charCode: 0x02, fgColorCode: cc(0x02), bgColorCode: BG },
        { charCode: 0x03, fgColorCode: cc(0x03), bgColorCode: BG },
        { charCode: 0x04, fgColorCode: cc(0x04), bgColorCode: BG },
        { charCode: 0x05, fgColorCode: cc(0x05), bgColorCode: BG },
        { charCode: 0x06, fgColorCode: cc(0x06), bgColorCode: BG },
        { charCode: 0x07, fgColorCode: cc(0x07), bgColorCode: BG },
        { charCode: 0x08, fgColorCode: cc(0x08), bgColorCode: BG },
        { charCode: 0x09, fgColorCode: cc(0x09), bgColorCode: BG },
        { charCode: 0x0a, fgColorCode: cc(0x0a), bgColorCode: BG },
        { charCode: 0x0b, fgColorCode: cc(0x0b), bgColorCode: BG },
        { charCode: 0x0c, fgColorCode: cc(0x0c), bgColorCode: BG },
        { charCode: 0x0d, fgColorCode: cc(0x0d), bgColorCode: BG },
        { charCode: 0x0e, fgColorCode: cc(0x0e), bgColorCode: BG },
        { charCode: 0x0f, fgColorCode: cc(0x0f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x10-0x1F ──
    orders.push(OrderBuilder.text(0, 5, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 5, W, 1, [
        { charCode: "►", fgColorCode: cc(0x10), bgColorCode: BG },
        { charCode: "◄", fgColorCode: cc(0x11), bgColorCode: BG },
        { charCode: "↕", fgColorCode: cc(0x12), bgColorCode: BG },
        { charCode: "‼", fgColorCode: cc(0x13), bgColorCode: BG },
        { charCode: "¶", fgColorCode: cc(0x14), bgColorCode: BG },
        { charCode: "§", fgColorCode: cc(0x15), bgColorCode: BG },
        { charCode: "▬", fgColorCode: cc(0x16), bgColorCode: BG },
        { charCode: "↨", fgColorCode: cc(0x17), bgColorCode: BG },
        { charCode: "↑", fgColorCode: cc(0x18), bgColorCode: BG },
        { charCode: "↓", fgColorCode: cc(0x19), bgColorCode: BG },
        { charCode: "→", fgColorCode: cc(0x1a), bgColorCode: BG },
        { charCode: "←", fgColorCode: cc(0x1b), bgColorCode: BG },
        { charCode: "∟", fgColorCode: cc(0x1c), bgColorCode: BG },
        { charCode: "↔", fgColorCode: cc(0x1d), bgColorCode: BG },
        { charCode: "▲", fgColorCode: cc(0x1e), bgColorCode: BG },
        { charCode: "▼", fgColorCode: cc(0x1f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 6, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 6, W, 1, [
        { charCode: 0x10, fgColorCode: cc(0x10), bgColorCode: BG },
        { charCode: 0x11, fgColorCode: cc(0x11), bgColorCode: BG },
        { charCode: 0x12, fgColorCode: cc(0x12), bgColorCode: BG },
        { charCode: 0x13, fgColorCode: cc(0x13), bgColorCode: BG },
        { charCode: 0x14, fgColorCode: cc(0x14), bgColorCode: BG },
        { charCode: 0x15, fgColorCode: cc(0x15), bgColorCode: BG },
        { charCode: 0x16, fgColorCode: cc(0x16), bgColorCode: BG },
        { charCode: 0x17, fgColorCode: cc(0x17), bgColorCode: BG },
        { charCode: 0x18, fgColorCode: cc(0x18), bgColorCode: BG },
        { charCode: 0x19, fgColorCode: cc(0x19), bgColorCode: BG },
        { charCode: 0x1a, fgColorCode: cc(0x1a), bgColorCode: BG },
        { charCode: 0x1b, fgColorCode: cc(0x1b), bgColorCode: BG },
        { charCode: 0x1c, fgColorCode: cc(0x1c), bgColorCode: BG },
        { charCode: 0x1d, fgColorCode: cc(0x1d), bgColorCode: BG },
        { charCode: 0x1e, fgColorCode: cc(0x1e), bgColorCode: BG },
        { charCode: 0x1f, fgColorCode: cc(0x1f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x20-0x2F ──
    orders.push(OrderBuilder.text(0, 8, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 8, W, 1, [
        { charCode: " ", fgColorCode: cc(0x20), bgColorCode: BG },
        { charCode: "!", fgColorCode: cc(0x21), bgColorCode: BG },
        { charCode: '"', fgColorCode: cc(0x22), bgColorCode: BG },
        { charCode: "#", fgColorCode: cc(0x23), bgColorCode: BG },
        { charCode: "$", fgColorCode: cc(0x24), bgColorCode: BG },
        { charCode: "%", fgColorCode: cc(0x25), bgColorCode: BG },
        { charCode: "&", fgColorCode: cc(0x26), bgColorCode: BG },
        { charCode: "'", fgColorCode: cc(0x27), bgColorCode: BG },
        { charCode: "(", fgColorCode: cc(0x28), bgColorCode: BG },
        { charCode: ")", fgColorCode: cc(0x29), bgColorCode: BG },
        { charCode: "*", fgColorCode: cc(0x2a), bgColorCode: BG },
        { charCode: "+", fgColorCode: cc(0x2b), bgColorCode: BG },
        { charCode: ",", fgColorCode: cc(0x2c), bgColorCode: BG },
        { charCode: "-", fgColorCode: cc(0x2d), bgColorCode: BG },
        { charCode: ".", fgColorCode: cc(0x2e), bgColorCode: BG },
        { charCode: "/", fgColorCode: cc(0x2f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 9, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 9, W, 1, [
        { charCode: 0x20, fgColorCode: cc(0x20), bgColorCode: BG },
        { charCode: 0x21, fgColorCode: cc(0x21), bgColorCode: BG },
        { charCode: 0x22, fgColorCode: cc(0x22), bgColorCode: BG },
        { charCode: 0x23, fgColorCode: cc(0x23), bgColorCode: BG },
        { charCode: 0x24, fgColorCode: cc(0x24), bgColorCode: BG },
        { charCode: 0x25, fgColorCode: cc(0x25), bgColorCode: BG },
        { charCode: 0x26, fgColorCode: cc(0x26), bgColorCode: BG },
        { charCode: 0x27, fgColorCode: cc(0x27), bgColorCode: BG },
        { charCode: 0x28, fgColorCode: cc(0x28), bgColorCode: BG },
        { charCode: 0x29, fgColorCode: cc(0x29), bgColorCode: BG },
        { charCode: 0x2a, fgColorCode: cc(0x2a), bgColorCode: BG },
        { charCode: 0x2b, fgColorCode: cc(0x2b), bgColorCode: BG },
        { charCode: 0x2c, fgColorCode: cc(0x2c), bgColorCode: BG },
        { charCode: 0x2d, fgColorCode: cc(0x2d), bgColorCode: BG },
        { charCode: 0x2e, fgColorCode: cc(0x2e), bgColorCode: BG },
        { charCode: 0x2f, fgColorCode: cc(0x2f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x30-0x3F ──
    orders.push(OrderBuilder.text(0, 11, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 11, W, 1, [
        { charCode: "0", fgColorCode: cc(0x30), bgColorCode: BG },
        { charCode: "1", fgColorCode: cc(0x31), bgColorCode: BG },
        { charCode: "2", fgColorCode: cc(0x32), bgColorCode: BG },
        { charCode: "3", fgColorCode: cc(0x33), bgColorCode: BG },
        { charCode: "4", fgColorCode: cc(0x34), bgColorCode: BG },
        { charCode: "5", fgColorCode: cc(0x35), bgColorCode: BG },
        { charCode: "6", fgColorCode: cc(0x36), bgColorCode: BG },
        { charCode: "7", fgColorCode: cc(0x37), bgColorCode: BG },
        { charCode: "8", fgColorCode: cc(0x38), bgColorCode: BG },
        { charCode: "9", fgColorCode: cc(0x39), bgColorCode: BG },
        { charCode: ":", fgColorCode: cc(0x3a), bgColorCode: BG },
        { charCode: ";", fgColorCode: cc(0x3b), bgColorCode: BG },
        { charCode: "<", fgColorCode: cc(0x3c), bgColorCode: BG },
        { charCode: "=", fgColorCode: cc(0x3d), bgColorCode: BG },
        { charCode: ">", fgColorCode: cc(0x3e), bgColorCode: BG },
        { charCode: "?", fgColorCode: cc(0x3f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 12, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 12, W, 1, [
        { charCode: 0x30, fgColorCode: cc(0x30), bgColorCode: BG },
        { charCode: 0x31, fgColorCode: cc(0x31), bgColorCode: BG },
        { charCode: 0x32, fgColorCode: cc(0x32), bgColorCode: BG },
        { charCode: 0x33, fgColorCode: cc(0x33), bgColorCode: BG },
        { charCode: 0x34, fgColorCode: cc(0x34), bgColorCode: BG },
        { charCode: 0x35, fgColorCode: cc(0x35), bgColorCode: BG },
        { charCode: 0x36, fgColorCode: cc(0x36), bgColorCode: BG },
        { charCode: 0x37, fgColorCode: cc(0x37), bgColorCode: BG },
        { charCode: 0x38, fgColorCode: cc(0x38), bgColorCode: BG },
        { charCode: 0x39, fgColorCode: cc(0x39), bgColorCode: BG },
        { charCode: 0x3a, fgColorCode: cc(0x3a), bgColorCode: BG },
        { charCode: 0x3b, fgColorCode: cc(0x3b), bgColorCode: BG },
        { charCode: 0x3c, fgColorCode: cc(0x3c), bgColorCode: BG },
        { charCode: 0x3d, fgColorCode: cc(0x3d), bgColorCode: BG },
        { charCode: 0x3e, fgColorCode: cc(0x3e), bgColorCode: BG },
        { charCode: 0x3f, fgColorCode: cc(0x3f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x40-0x4F ──
    orders.push(OrderBuilder.text(0, 14, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 14, W, 1, [
        { charCode: "@", fgColorCode: cc(0x40), bgColorCode: BG },
        { charCode: "A", fgColorCode: cc(0x41), bgColorCode: BG },
        { charCode: "B", fgColorCode: cc(0x42), bgColorCode: BG },
        { charCode: "C", fgColorCode: cc(0x43), bgColorCode: BG },
        { charCode: "D", fgColorCode: cc(0x44), bgColorCode: BG },
        { charCode: "E", fgColorCode: cc(0x45), bgColorCode: BG },
        { charCode: "F", fgColorCode: cc(0x46), bgColorCode: BG },
        { charCode: "G", fgColorCode: cc(0x47), bgColorCode: BG },
        { charCode: "H", fgColorCode: cc(0x48), bgColorCode: BG },
        { charCode: "I", fgColorCode: cc(0x49), bgColorCode: BG },
        { charCode: "J", fgColorCode: cc(0x4a), bgColorCode: BG },
        { charCode: "K", fgColorCode: cc(0x4b), bgColorCode: BG },
        { charCode: "L", fgColorCode: cc(0x4c), bgColorCode: BG },
        { charCode: "M", fgColorCode: cc(0x4d), bgColorCode: BG },
        { charCode: "N", fgColorCode: cc(0x4e), bgColorCode: BG },
        { charCode: "O", fgColorCode: cc(0x4f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 15, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 15, W, 1, [
        { charCode: 0x40, fgColorCode: cc(0x40), bgColorCode: BG },
        { charCode: 0x41, fgColorCode: cc(0x41), bgColorCode: BG },
        { charCode: 0x42, fgColorCode: cc(0x42), bgColorCode: BG },
        { charCode: 0x43, fgColorCode: cc(0x43), bgColorCode: BG },
        { charCode: 0x44, fgColorCode: cc(0x44), bgColorCode: BG },
        { charCode: 0x45, fgColorCode: cc(0x45), bgColorCode: BG },
        { charCode: 0x46, fgColorCode: cc(0x46), bgColorCode: BG },
        { charCode: 0x47, fgColorCode: cc(0x47), bgColorCode: BG },
        { charCode: 0x48, fgColorCode: cc(0x48), bgColorCode: BG },
        { charCode: 0x49, fgColorCode: cc(0x49), bgColorCode: BG },
        { charCode: 0x4a, fgColorCode: cc(0x4a), bgColorCode: BG },
        { charCode: 0x4b, fgColorCode: cc(0x4b), bgColorCode: BG },
        { charCode: 0x4c, fgColorCode: cc(0x4c), bgColorCode: BG },
        { charCode: 0x4d, fgColorCode: cc(0x4d), bgColorCode: BG },
        { charCode: 0x4e, fgColorCode: cc(0x4e), bgColorCode: BG },
        { charCode: 0x4f, fgColorCode: cc(0x4f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x50-0x5F ──
    orders.push(OrderBuilder.text(0, 17, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 17, W, 1, [
        { charCode: "P", fgColorCode: cc(0x50), bgColorCode: BG },
        { charCode: "Q", fgColorCode: cc(0x51), bgColorCode: BG },
        { charCode: "R", fgColorCode: cc(0x52), bgColorCode: BG },
        { charCode: "S", fgColorCode: cc(0x53), bgColorCode: BG },
        { charCode: "T", fgColorCode: cc(0x54), bgColorCode: BG },
        { charCode: "U", fgColorCode: cc(0x55), bgColorCode: BG },
        { charCode: "V", fgColorCode: cc(0x56), bgColorCode: BG },
        { charCode: "W", fgColorCode: cc(0x57), bgColorCode: BG },
        { charCode: "X", fgColorCode: cc(0x58), bgColorCode: BG },
        { charCode: "Y", fgColorCode: cc(0x59), bgColorCode: BG },
        { charCode: "Z", fgColorCode: cc(0x5a), bgColorCode: BG },
        { charCode: "[", fgColorCode: cc(0x5b), bgColorCode: BG },
        { charCode: "\\", fgColorCode: cc(0x5c), bgColorCode: BG },
        { charCode: "]", fgColorCode: cc(0x5d), bgColorCode: BG },
        { charCode: "^", fgColorCode: cc(0x5e), bgColorCode: BG },
        { charCode: "_", fgColorCode: cc(0x5f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 18, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 18, W, 1, [
        { charCode: 0x50, fgColorCode: cc(0x50), bgColorCode: BG },
        { charCode: 0x51, fgColorCode: cc(0x51), bgColorCode: BG },
        { charCode: 0x52, fgColorCode: cc(0x52), bgColorCode: BG },
        { charCode: 0x53, fgColorCode: cc(0x53), bgColorCode: BG },
        { charCode: 0x54, fgColorCode: cc(0x54), bgColorCode: BG },
        { charCode: 0x55, fgColorCode: cc(0x55), bgColorCode: BG },
        { charCode: 0x56, fgColorCode: cc(0x56), bgColorCode: BG },
        { charCode: 0x57, fgColorCode: cc(0x57), bgColorCode: BG },
        { charCode: 0x58, fgColorCode: cc(0x58), bgColorCode: BG },
        { charCode: 0x59, fgColorCode: cc(0x59), bgColorCode: BG },
        { charCode: 0x5a, fgColorCode: cc(0x5a), bgColorCode: BG },
        { charCode: 0x5b, fgColorCode: cc(0x5b), bgColorCode: BG },
        { charCode: 0x5c, fgColorCode: cc(0x5c), bgColorCode: BG },
        { charCode: 0x5d, fgColorCode: cc(0x5d), bgColorCode: BG },
        { charCode: 0x5e, fgColorCode: cc(0x5e), bgColorCode: BG },
        { charCode: 0x5f, fgColorCode: cc(0x5f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x60-0x6F ──
    orders.push(OrderBuilder.text(0, 20, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 20, W, 1, [
        { charCode: "`", fgColorCode: cc(0x60), bgColorCode: BG },
        { charCode: "a", fgColorCode: cc(0x61), bgColorCode: BG },
        { charCode: "b", fgColorCode: cc(0x62), bgColorCode: BG },
        { charCode: "c", fgColorCode: cc(0x63), bgColorCode: BG },
        { charCode: "d", fgColorCode: cc(0x64), bgColorCode: BG },
        { charCode: "e", fgColorCode: cc(0x65), bgColorCode: BG },
        { charCode: "f", fgColorCode: cc(0x66), bgColorCode: BG },
        { charCode: "g", fgColorCode: cc(0x67), bgColorCode: BG },
        { charCode: "h", fgColorCode: cc(0x68), bgColorCode: BG },
        { charCode: "i", fgColorCode: cc(0x69), bgColorCode: BG },
        { charCode: "j", fgColorCode: cc(0x6a), bgColorCode: BG },
        { charCode: "k", fgColorCode: cc(0x6b), bgColorCode: BG },
        { charCode: "l", fgColorCode: cc(0x6c), bgColorCode: BG },
        { charCode: "m", fgColorCode: cc(0x6d), bgColorCode: BG },
        { charCode: "n", fgColorCode: cc(0x6e), bgColorCode: BG },
        { charCode: "o", fgColorCode: cc(0x6f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 21, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 21, W, 1, [
        { charCode: 0x60, fgColorCode: cc(0x60), bgColorCode: BG },
        { charCode: 0x61, fgColorCode: cc(0x61), bgColorCode: BG },
        { charCode: 0x62, fgColorCode: cc(0x62), bgColorCode: BG },
        { charCode: 0x63, fgColorCode: cc(0x63), bgColorCode: BG },
        { charCode: 0x64, fgColorCode: cc(0x64), bgColorCode: BG },
        { charCode: 0x65, fgColorCode: cc(0x65), bgColorCode: BG },
        { charCode: 0x66, fgColorCode: cc(0x66), bgColorCode: BG },
        { charCode: 0x67, fgColorCode: cc(0x67), bgColorCode: BG },
        { charCode: 0x68, fgColorCode: cc(0x68), bgColorCode: BG },
        { charCode: 0x69, fgColorCode: cc(0x69), bgColorCode: BG },
        { charCode: 0x6a, fgColorCode: cc(0x6a), bgColorCode: BG },
        { charCode: 0x6b, fgColorCode: cc(0x6b), bgColorCode: BG },
        { charCode: 0x6c, fgColorCode: cc(0x6c), bgColorCode: BG },
        { charCode: 0x6d, fgColorCode: cc(0x6d), bgColorCode: BG },
        { charCode: 0x6e, fgColorCode: cc(0x6e), bgColorCode: BG },
        { charCode: 0x6f, fgColorCode: cc(0x6f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x70-0x7F ──
    orders.push(OrderBuilder.text(0, 23, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 23, W, 1, [
        { charCode: "p", fgColorCode: cc(0x70), bgColorCode: BG },
        { charCode: "q", fgColorCode: cc(0x71), bgColorCode: BG },
        { charCode: "r", fgColorCode: cc(0x72), bgColorCode: BG },
        { charCode: "s", fgColorCode: cc(0x73), bgColorCode: BG },
        { charCode: "t", fgColorCode: cc(0x74), bgColorCode: BG },
        { charCode: "u", fgColorCode: cc(0x75), bgColorCode: BG },
        { charCode: "v", fgColorCode: cc(0x76), bgColorCode: BG },
        { charCode: "w", fgColorCode: cc(0x77), bgColorCode: BG },
        { charCode: "x", fgColorCode: cc(0x78), bgColorCode: BG },
        { charCode: "y", fgColorCode: cc(0x79), bgColorCode: BG },
        { charCode: "z", fgColorCode: cc(0x7a), bgColorCode: BG },
        { charCode: "{", fgColorCode: cc(0x7b), bgColorCode: BG },
        { charCode: "|", fgColorCode: cc(0x7c), bgColorCode: BG },
        { charCode: "}", fgColorCode: cc(0x7d), bgColorCode: BG },
        { charCode: "~", fgColorCode: cc(0x7e), bgColorCode: BG },
        { charCode: "⌂", fgColorCode: cc(0x7f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 24, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 24, W, 1, [
        { charCode: 0x70, fgColorCode: cc(0x70), bgColorCode: BG },
        { charCode: 0x71, fgColorCode: cc(0x71), bgColorCode: BG },
        { charCode: 0x72, fgColorCode: cc(0x72), bgColorCode: BG },
        { charCode: 0x73, fgColorCode: cc(0x73), bgColorCode: BG },
        { charCode: 0x74, fgColorCode: cc(0x74), bgColorCode: BG },
        { charCode: 0x75, fgColorCode: cc(0x75), bgColorCode: BG },
        { charCode: 0x76, fgColorCode: cc(0x76), bgColorCode: BG },
        { charCode: 0x77, fgColorCode: cc(0x77), bgColorCode: BG },
        { charCode: 0x78, fgColorCode: cc(0x78), bgColorCode: BG },
        { charCode: 0x79, fgColorCode: cc(0x79), bgColorCode: BG },
        { charCode: 0x7a, fgColorCode: cc(0x7a), bgColorCode: BG },
        { charCode: 0x7b, fgColorCode: cc(0x7b), bgColorCode: BG },
        { charCode: 0x7c, fgColorCode: cc(0x7c), bgColorCode: BG },
        { charCode: 0x7d, fgColorCode: cc(0x7d), bgColorCode: BG },
        { charCode: 0x7e, fgColorCode: cc(0x7e), bgColorCode: BG },
        { charCode: 0x7f, fgColorCode: cc(0x7f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x80-0x8F (right col, y=2) ──
    orders.push(OrderBuilder.text(XR_LBL, 2, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 2, W, 1, [
        { charCode: "Ç", fgColorCode: cc(0x80), bgColorCode: BG },
        { charCode: "ü", fgColorCode: cc(0x81), bgColorCode: BG },
        { charCode: "é", fgColorCode: cc(0x82), bgColorCode: BG },
        { charCode: "â", fgColorCode: cc(0x83), bgColorCode: BG },
        { charCode: "ä", fgColorCode: cc(0x84), bgColorCode: BG },
        { charCode: "à", fgColorCode: cc(0x85), bgColorCode: BG },
        { charCode: "å", fgColorCode: cc(0x86), bgColorCode: BG },
        { charCode: "ç", fgColorCode: cc(0x87), bgColorCode: BG },
        { charCode: "ê", fgColorCode: cc(0x88), bgColorCode: BG },
        { charCode: "ë", fgColorCode: cc(0x89), bgColorCode: BG },
        { charCode: "è", fgColorCode: cc(0x8a), bgColorCode: BG },
        { charCode: "ï", fgColorCode: cc(0x8b), bgColorCode: BG },
        { charCode: "î", fgColorCode: cc(0x8c), bgColorCode: BG },
        { charCode: "ì", fgColorCode: cc(0x8d), bgColorCode: BG },
        { charCode: "Ä", fgColorCode: cc(0x8e), bgColorCode: BG },
        { charCode: "Å", fgColorCode: cc(0x8f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 3, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 3, W, 1, [
        { charCode: 0x80, fgColorCode: cc(0x80), bgColorCode: BG },
        { charCode: 0x81, fgColorCode: cc(0x81), bgColorCode: BG },
        { charCode: 0x82, fgColorCode: cc(0x82), bgColorCode: BG },
        { charCode: 0x83, fgColorCode: cc(0x83), bgColorCode: BG },
        { charCode: 0x84, fgColorCode: cc(0x84), bgColorCode: BG },
        { charCode: 0x85, fgColorCode: cc(0x85), bgColorCode: BG },
        { charCode: 0x86, fgColorCode: cc(0x86), bgColorCode: BG },
        { charCode: 0x87, fgColorCode: cc(0x87), bgColorCode: BG },
        { charCode: 0x88, fgColorCode: cc(0x88), bgColorCode: BG },
        { charCode: 0x89, fgColorCode: cc(0x89), bgColorCode: BG },
        { charCode: 0x8a, fgColorCode: cc(0x8a), bgColorCode: BG },
        { charCode: 0x8b, fgColorCode: cc(0x8b), bgColorCode: BG },
        { charCode: 0x8c, fgColorCode: cc(0x8c), bgColorCode: BG },
        { charCode: 0x8d, fgColorCode: cc(0x8d), bgColorCode: BG },
        { charCode: 0x8e, fgColorCode: cc(0x8e), bgColorCode: BG },
        { charCode: 0x8f, fgColorCode: cc(0x8f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x90-0x9F (right col, y=5) ──
    orders.push(OrderBuilder.text(XR_LBL, 5, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 5, W, 1, [
        { charCode: "É", fgColorCode: cc(0x90), bgColorCode: BG },
        { charCode: "æ", fgColorCode: cc(0x91), bgColorCode: BG },
        { charCode: "Æ", fgColorCode: cc(0x92), bgColorCode: BG },
        { charCode: "ô", fgColorCode: cc(0x93), bgColorCode: BG },
        { charCode: "ö", fgColorCode: cc(0x94), bgColorCode: BG },
        { charCode: "ò", fgColorCode: cc(0x95), bgColorCode: BG },
        { charCode: "û", fgColorCode: cc(0x96), bgColorCode: BG },
        { charCode: "ù", fgColorCode: cc(0x97), bgColorCode: BG },
        { charCode: "ÿ", fgColorCode: cc(0x98), bgColorCode: BG },
        { charCode: "Ö", fgColorCode: cc(0x99), bgColorCode: BG },
        { charCode: "Ü", fgColorCode: cc(0x9a), bgColorCode: BG },
        { charCode: "¢", fgColorCode: cc(0x9b), bgColorCode: BG },
        { charCode: "£", fgColorCode: cc(0x9c), bgColorCode: BG },
        { charCode: "¥", fgColorCode: cc(0x9d), bgColorCode: BG },
        { charCode: "₧", fgColorCode: cc(0x9e), bgColorCode: BG },
        { charCode: "ƒ", fgColorCode: cc(0x9f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 6, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 6, W, 1, [
        { charCode: 0x90, fgColorCode: cc(0x90), bgColorCode: BG },
        { charCode: 0x91, fgColorCode: cc(0x91), bgColorCode: BG },
        { charCode: 0x92, fgColorCode: cc(0x92), bgColorCode: BG },
        { charCode: 0x93, fgColorCode: cc(0x93), bgColorCode: BG },
        { charCode: 0x94, fgColorCode: cc(0x94), bgColorCode: BG },
        { charCode: 0x95, fgColorCode: cc(0x95), bgColorCode: BG },
        { charCode: 0x96, fgColorCode: cc(0x96), bgColorCode: BG },
        { charCode: 0x97, fgColorCode: cc(0x97), bgColorCode: BG },
        { charCode: 0x98, fgColorCode: cc(0x98), bgColorCode: BG },
        { charCode: 0x99, fgColorCode: cc(0x99), bgColorCode: BG },
        { charCode: 0x9a, fgColorCode: cc(0x9a), bgColorCode: BG },
        { charCode: 0x9b, fgColorCode: cc(0x9b), bgColorCode: BG },
        { charCode: 0x9c, fgColorCode: cc(0x9c), bgColorCode: BG },
        { charCode: 0x9d, fgColorCode: cc(0x9d), bgColorCode: BG },
        { charCode: 0x9e, fgColorCode: cc(0x9e), bgColorCode: BG },
        { charCode: 0x9f, fgColorCode: cc(0x9f), bgColorCode: BG },
      ]),
    );

    // ── Group 0xA0-0xAF (right col, y=8) ──
    orders.push(OrderBuilder.text(XR_LBL, 8, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 8, W, 1, [
        { charCode: "á", fgColorCode: cc(0xa0), bgColorCode: BG },
        { charCode: "í", fgColorCode: cc(0xa1), bgColorCode: BG },
        { charCode: "ó", fgColorCode: cc(0xa2), bgColorCode: BG },
        { charCode: "ú", fgColorCode: cc(0xa3), bgColorCode: BG },
        { charCode: "ñ", fgColorCode: cc(0xa4), bgColorCode: BG },
        { charCode: "Ñ", fgColorCode: cc(0xa5), bgColorCode: BG },
        { charCode: "ª", fgColorCode: cc(0xa6), bgColorCode: BG },
        { charCode: "º", fgColorCode: cc(0xa7), bgColorCode: BG },
        { charCode: "¿", fgColorCode: cc(0xa8), bgColorCode: BG },
        { charCode: "⌐", fgColorCode: cc(0xa9), bgColorCode: BG },
        { charCode: "¬", fgColorCode: cc(0xaa), bgColorCode: BG },
        { charCode: "½", fgColorCode: cc(0xab), bgColorCode: BG },
        { charCode: "¼", fgColorCode: cc(0xac), bgColorCode: BG },
        { charCode: "¡", fgColorCode: cc(0xad), bgColorCode: BG },
        { charCode: "«", fgColorCode: cc(0xae), bgColorCode: BG },
        { charCode: "»", fgColorCode: cc(0xaf), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 9, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 9, W, 1, [
        { charCode: 0xa0, fgColorCode: cc(0xa0), bgColorCode: BG },
        { charCode: 0xa1, fgColorCode: cc(0xa1), bgColorCode: BG },
        { charCode: 0xa2, fgColorCode: cc(0xa2), bgColorCode: BG },
        { charCode: 0xa3, fgColorCode: cc(0xa3), bgColorCode: BG },
        { charCode: 0xa4, fgColorCode: cc(0xa4), bgColorCode: BG },
        { charCode: 0xa5, fgColorCode: cc(0xa5), bgColorCode: BG },
        { charCode: 0xa6, fgColorCode: cc(0xa6), bgColorCode: BG },
        { charCode: 0xa7, fgColorCode: cc(0xa7), bgColorCode: BG },
        { charCode: 0xa8, fgColorCode: cc(0xa8), bgColorCode: BG },
        { charCode: 0xa9, fgColorCode: cc(0xa9), bgColorCode: BG },
        { charCode: 0xaa, fgColorCode: cc(0xaa), bgColorCode: BG },
        { charCode: 0xab, fgColorCode: cc(0xab), bgColorCode: BG },
        { charCode: 0xac, fgColorCode: cc(0xac), bgColorCode: BG },
        { charCode: 0xad, fgColorCode: cc(0xad), bgColorCode: BG },
        { charCode: 0xae, fgColorCode: cc(0xae), bgColorCode: BG },
        { charCode: 0xaf, fgColorCode: cc(0xaf), bgColorCode: BG },
      ]),
    );

    // ── Group 0xB0-0xBF (right col, y=11) ──
    orders.push(OrderBuilder.text(XR_LBL, 11, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 11, W, 1, [
        { charCode: "░", fgColorCode: cc(0xb0), bgColorCode: BG },
        { charCode: "▒", fgColorCode: cc(0xb1), bgColorCode: BG },
        { charCode: "▓", fgColorCode: cc(0xb2), bgColorCode: BG },
        { charCode: "│", fgColorCode: cc(0xb3), bgColorCode: BG },
        { charCode: "┤", fgColorCode: cc(0xb4), bgColorCode: BG },
        { charCode: "╡", fgColorCode: cc(0xb5), bgColorCode: BG },
        { charCode: "╢", fgColorCode: cc(0xb6), bgColorCode: BG },
        { charCode: "╖", fgColorCode: cc(0xb7), bgColorCode: BG },
        { charCode: "╕", fgColorCode: cc(0xb8), bgColorCode: BG },
        { charCode: "╣", fgColorCode: cc(0xb9), bgColorCode: BG },
        { charCode: "║", fgColorCode: cc(0xba), bgColorCode: BG },
        { charCode: "╗", fgColorCode: cc(0xbb), bgColorCode: BG },
        { charCode: "╝", fgColorCode: cc(0xbc), bgColorCode: BG },
        { charCode: "╜", fgColorCode: cc(0xbd), bgColorCode: BG },
        { charCode: "╛", fgColorCode: cc(0xbe), bgColorCode: BG },
        { charCode: "┐", fgColorCode: cc(0xbf), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 12, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 12, W, 1, [
        { charCode: 0xb0, fgColorCode: cc(0xb0), bgColorCode: BG },
        { charCode: 0xb1, fgColorCode: cc(0xb1), bgColorCode: BG },
        { charCode: 0xb2, fgColorCode: cc(0xb2), bgColorCode: BG },
        { charCode: 0xb3, fgColorCode: cc(0xb3), bgColorCode: BG },
        { charCode: 0xb4, fgColorCode: cc(0xb4), bgColorCode: BG },
        { charCode: 0xb5, fgColorCode: cc(0xb5), bgColorCode: BG },
        { charCode: 0xb6, fgColorCode: cc(0xb6), bgColorCode: BG },
        { charCode: 0xb7, fgColorCode: cc(0xb7), bgColorCode: BG },
        { charCode: 0xb8, fgColorCode: cc(0xb8), bgColorCode: BG },
        { charCode: 0xb9, fgColorCode: cc(0xb9), bgColorCode: BG },
        { charCode: 0xba, fgColorCode: cc(0xba), bgColorCode: BG },
        { charCode: 0xbb, fgColorCode: cc(0xbb), bgColorCode: BG },
        { charCode: 0xbc, fgColorCode: cc(0xbc), bgColorCode: BG },
        { charCode: 0xbd, fgColorCode: cc(0xbd), bgColorCode: BG },
        { charCode: 0xbe, fgColorCode: cc(0xbe), bgColorCode: BG },
        { charCode: 0xbf, fgColorCode: cc(0xbf), bgColorCode: BG },
      ]),
    );

    // ── Group 0xC0-0xCF (right col, y=14) ──
    orders.push(OrderBuilder.text(XR_LBL, 14, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 14, W, 1, [
        { charCode: "└", fgColorCode: cc(0xc0), bgColorCode: BG },
        { charCode: "┴", fgColorCode: cc(0xc1), bgColorCode: BG },
        { charCode: "┬", fgColorCode: cc(0xc2), bgColorCode: BG },
        { charCode: "├", fgColorCode: cc(0xc3), bgColorCode: BG },
        { charCode: "─", fgColorCode: cc(0xc4), bgColorCode: BG },
        { charCode: "┼", fgColorCode: cc(0xc5), bgColorCode: BG },
        { charCode: "╞", fgColorCode: cc(0xc6), bgColorCode: BG },
        { charCode: "╟", fgColorCode: cc(0xc7), bgColorCode: BG },
        { charCode: "╚", fgColorCode: cc(0xc8), bgColorCode: BG },
        { charCode: "╔", fgColorCode: cc(0xc9), bgColorCode: BG },
        { charCode: "╩", fgColorCode: cc(0xca), bgColorCode: BG },
        { charCode: "╦", fgColorCode: cc(0xcb), bgColorCode: BG },
        { charCode: "╠", fgColorCode: cc(0xcc), bgColorCode: BG },
        { charCode: "═", fgColorCode: cc(0xcd), bgColorCode: BG },
        { charCode: "╬", fgColorCode: cc(0xce), bgColorCode: BG },
        { charCode: "╧", fgColorCode: cc(0xcf), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 15, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 15, W, 1, [
        { charCode: 0xc0, fgColorCode: cc(0xc0), bgColorCode: BG },
        { charCode: 0xc1, fgColorCode: cc(0xc1), bgColorCode: BG },
        { charCode: 0xc2, fgColorCode: cc(0xc2), bgColorCode: BG },
        { charCode: 0xc3, fgColorCode: cc(0xc3), bgColorCode: BG },
        { charCode: 0xc4, fgColorCode: cc(0xc4), bgColorCode: BG },
        { charCode: 0xc5, fgColorCode: cc(0xc5), bgColorCode: BG },
        { charCode: 0xc6, fgColorCode: cc(0xc6), bgColorCode: BG },
        { charCode: 0xc7, fgColorCode: cc(0xc7), bgColorCode: BG },
        { charCode: 0xc8, fgColorCode: cc(0xc8), bgColorCode: BG },
        { charCode: 0xc9, fgColorCode: cc(0xc9), bgColorCode: BG },
        { charCode: 0xca, fgColorCode: cc(0xca), bgColorCode: BG },
        { charCode: 0xcb, fgColorCode: cc(0xcb), bgColorCode: BG },
        { charCode: 0xcc, fgColorCode: cc(0xcc), bgColorCode: BG },
        { charCode: 0xcd, fgColorCode: cc(0xcd), bgColorCode: BG },
        { charCode: 0xce, fgColorCode: cc(0xce), bgColorCode: BG },
        { charCode: 0xcf, fgColorCode: cc(0xcf), bgColorCode: BG },
      ]),
    );

    // ── Group 0xD0-0xDF (right col, y=17) ──
    orders.push(OrderBuilder.text(XR_LBL, 17, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 17, W, 1, [
        { charCode: "╨", fgColorCode: cc(0xd0), bgColorCode: BG },
        { charCode: "╤", fgColorCode: cc(0xd1), bgColorCode: BG },
        { charCode: "╥", fgColorCode: cc(0xd2), bgColorCode: BG },
        { charCode: "╙", fgColorCode: cc(0xd3), bgColorCode: BG },
        { charCode: "╘", fgColorCode: cc(0xd4), bgColorCode: BG },
        { charCode: "╒", fgColorCode: cc(0xd5), bgColorCode: BG },
        { charCode: "╓", fgColorCode: cc(0xd6), bgColorCode: BG },
        { charCode: "╫", fgColorCode: cc(0xd7), bgColorCode: BG },
        { charCode: "╪", fgColorCode: cc(0xd8), bgColorCode: BG },
        { charCode: "┘", fgColorCode: cc(0xd9), bgColorCode: BG },
        { charCode: "┌", fgColorCode: cc(0xda), bgColorCode: BG },
        { charCode: "█", fgColorCode: cc(0xdb), bgColorCode: BG },
        { charCode: "▄", fgColorCode: cc(0xdc), bgColorCode: BG },
        { charCode: "▌", fgColorCode: cc(0xdd), bgColorCode: BG },
        { charCode: "▐", fgColorCode: cc(0xde), bgColorCode: BG },
        { charCode: "▀", fgColorCode: cc(0xdf), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 18, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 18, W, 1, [
        { charCode: 0xd0, fgColorCode: cc(0xd0), bgColorCode: BG },
        { charCode: 0xd1, fgColorCode: cc(0xd1), bgColorCode: BG },
        { charCode: 0xd2, fgColorCode: cc(0xd2), bgColorCode: BG },
        { charCode: 0xd3, fgColorCode: cc(0xd3), bgColorCode: BG },
        { charCode: 0xd4, fgColorCode: cc(0xd4), bgColorCode: BG },
        { charCode: 0xd5, fgColorCode: cc(0xd5), bgColorCode: BG },
        { charCode: 0xd6, fgColorCode: cc(0xd6), bgColorCode: BG },
        { charCode: 0xd7, fgColorCode: cc(0xd7), bgColorCode: BG },
        { charCode: 0xd8, fgColorCode: cc(0xd8), bgColorCode: BG },
        { charCode: 0xd9, fgColorCode: cc(0xd9), bgColorCode: BG },
        { charCode: 0xda, fgColorCode: cc(0xda), bgColorCode: BG },
        { charCode: 0xdb, fgColorCode: cc(0xdb), bgColorCode: BG },
        { charCode: 0xdc, fgColorCode: cc(0xdc), bgColorCode: BG },
        { charCode: 0xdd, fgColorCode: cc(0xdd), bgColorCode: BG },
        { charCode: 0xde, fgColorCode: cc(0xde), bgColorCode: BG },
        { charCode: 0xdf, fgColorCode: cc(0xdf), bgColorCode: BG },
      ]),
    );

    // ── Group 0xE0-0xEF (right col, y=20) ──
    orders.push(OrderBuilder.text(XR_LBL, 20, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 20, W, 1, [
        { charCode: "α", fgColorCode: cc(0xe0), bgColorCode: BG },
        { charCode: "ß", fgColorCode: cc(0xe1), bgColorCode: BG },
        { charCode: "Γ", fgColorCode: cc(0xe2), bgColorCode: BG },
        { charCode: "π", fgColorCode: cc(0xe3), bgColorCode: BG },
        { charCode: "Σ", fgColorCode: cc(0xe4), bgColorCode: BG },
        { charCode: "σ", fgColorCode: cc(0xe5), bgColorCode: BG },
        { charCode: "µ", fgColorCode: cc(0xe6), bgColorCode: BG },
        { charCode: "τ", fgColorCode: cc(0xe7), bgColorCode: BG },
        { charCode: "Φ", fgColorCode: cc(0xe8), bgColorCode: BG },
        { charCode: "Θ", fgColorCode: cc(0xe9), bgColorCode: BG },
        { charCode: "Ω", fgColorCode: cc(0xea), bgColorCode: BG },
        { charCode: "δ", fgColorCode: cc(0xeb), bgColorCode: BG },
        { charCode: "∞", fgColorCode: cc(0xec), bgColorCode: BG },
        { charCode: "φ", fgColorCode: cc(0xed), bgColorCode: BG },
        { charCode: "ε", fgColorCode: cc(0xee), bgColorCode: BG },
        { charCode: "∩", fgColorCode: cc(0xef), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 21, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 21, W, 1, [
        { charCode: 0xe0, fgColorCode: cc(0xe0), bgColorCode: BG },
        { charCode: 0xe1, fgColorCode: cc(0xe1), bgColorCode: BG },
        { charCode: 0xe2, fgColorCode: cc(0xe2), bgColorCode: BG },
        { charCode: 0xe3, fgColorCode: cc(0xe3), bgColorCode: BG },
        { charCode: 0xe4, fgColorCode: cc(0xe4), bgColorCode: BG },
        { charCode: 0xe5, fgColorCode: cc(0xe5), bgColorCode: BG },
        { charCode: 0xe6, fgColorCode: cc(0xe6), bgColorCode: BG },
        { charCode: 0xe7, fgColorCode: cc(0xe7), bgColorCode: BG },
        { charCode: 0xe8, fgColorCode: cc(0xe8), bgColorCode: BG },
        { charCode: 0xe9, fgColorCode: cc(0xe9), bgColorCode: BG },
        { charCode: 0xea, fgColorCode: cc(0xea), bgColorCode: BG },
        { charCode: 0xeb, fgColorCode: cc(0xeb), bgColorCode: BG },
        { charCode: 0xec, fgColorCode: cc(0xec), bgColorCode: BG },
        { charCode: 0xed, fgColorCode: cc(0xed), bgColorCode: BG },
        { charCode: 0xee, fgColorCode: cc(0xee), bgColorCode: BG },
        { charCode: 0xef, fgColorCode: cc(0xef), bgColorCode: BG },
      ]),
    );

    // ── Group 0xF0-0xFF (right col, y=23) ──
    orders.push(OrderBuilder.text(XR_LBL, 23, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 23, W, 1, [
        { charCode: "≡", fgColorCode: cc(0xf0), bgColorCode: BG },
        { charCode: "±", fgColorCode: cc(0xf1), bgColorCode: BG },
        { charCode: "≥", fgColorCode: cc(0xf2), bgColorCode: BG },
        { charCode: "≤", fgColorCode: cc(0xf3), bgColorCode: BG },
        { charCode: "⌠", fgColorCode: cc(0xf4), bgColorCode: BG },
        { charCode: "⌡", fgColorCode: cc(0xf5), bgColorCode: BG },
        { charCode: "÷", fgColorCode: cc(0xf6), bgColorCode: BG },
        { charCode: "≈", fgColorCode: cc(0xf7), bgColorCode: BG },
        { charCode: "°", fgColorCode: cc(0xf8), bgColorCode: BG },
        { charCode: "∙", fgColorCode: cc(0xf9), bgColorCode: BG },
        { charCode: "·", fgColorCode: cc(0xfa), bgColorCode: BG },
        { charCode: "√", fgColorCode: cc(0xfb), bgColorCode: BG },
        { charCode: "ⁿ", fgColorCode: cc(0xfc), bgColorCode: BG },
        { charCode: "²", fgColorCode: cc(0xfd), bgColorCode: BG },
        { charCode: "■", fgColorCode: cc(0xfe), bgColorCode: BG },
        { charCode: " ", fgColorCode: cc(0xff), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 24, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 24, W, 1, [
        { charCode: 0xf0, fgColorCode: cc(0xf0), bgColorCode: BG },
        { charCode: 0xf1, fgColorCode: cc(0xf1), bgColorCode: BG },
        { charCode: 0xf2, fgColorCode: cc(0xf2), bgColorCode: BG },
        { charCode: 0xf3, fgColorCode: cc(0xf3), bgColorCode: BG },
        { charCode: 0xf4, fgColorCode: cc(0xf4), bgColorCode: BG },
        { charCode: 0xf5, fgColorCode: cc(0xf5), bgColorCode: BG },
        { charCode: 0xf6, fgColorCode: cc(0xf6), bgColorCode: BG },
        { charCode: 0xf7, fgColorCode: cc(0xf7), bgColorCode: BG },
        { charCode: 0xf8, fgColorCode: cc(0xf8), bgColorCode: BG },
        { charCode: 0xf9, fgColorCode: cc(0xf9), bgColorCode: BG },
        { charCode: 0xfa, fgColorCode: cc(0xfa), bgColorCode: BG },
        { charCode: 0xfb, fgColorCode: cc(0xfb), bgColorCode: BG },
        { charCode: 0xfc, fgColorCode: cc(0xfc), bgColorCode: BG },
        { charCode: 0xfd, fgColorCode: cc(0xfd), bgColorCode: BG },
        { charCode: 0xfe, fgColorCode: cc(0xfe), bgColorCode: BG },
        { charCode: 0xff, fgColorCode: cc(0xff), bgColorCode: BG },
      ]),
    );

    layer.setOrders(orders);

  }

  updateUser(): void {
    /* static */
  }
}
```

---

## File: applications/showcase-01-pseudo-htop/index.ts

```typescript
/**
 * Name: showcase-01
 * Description: A fake Htop-style clone plotting simulated server metrics, processes, and network resources.
 * 
 * Why study this:
 *   This showcase demonstrates how to create a complex, dense text-based user interface 
 *   (like a terminal dashboard) using Primitiv's rendering APIs in an optimized way. 
 *   It heavily utilizes string padding, color grouping, and text drawing orders. 
 * 
 * Optimization Concepts:
 *   - The 255 Orders Limit: A single Layer in Primitiv can only hold up to 255 drawing orders
 *     per tick. Because a dashboard with hundreds of processes could easily exceed this, 
 *     this app demonstrates two critical strategies:
 *       1. Grouping: Using the `multiText` order format to send multiple strings of the same color 
 *          in a single render request.
 *       2. Z-Layers: Splitting the UI across multiple Layers (`htopLayer`, `listLayer1`, `listLayer2`)
 *          to bypass the 255 limit while keeping everything correctly stacked.
 * 
 * Key Features:
 *   - Dynamic simulated data generation (CPU, Mem, Swap, Uptime).
 *   - Complex text layout using specific string alignment coordinates.
 *   - Utilizing specific CP437 block characters (e.g. `|` and `[ ]`) to draw cheap retro UI bars.
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
} from '@primitiv/engine';

const W = 120;
const H = 45;

function rnd(n: number) { return Math.floor(Math.random() * n); }
function padL(s: string | number, w: number, char = ' ') { return String(s).padStart(w, char); }
function padR(s: string | number, w: number, char = ' ') { return String(s).padEnd(w, char); }

interface Process {
    pid: number;
    user: string;
    pri: string;
    ni: string;
    virt: string;
    res: string;
    shr: string;
    s: string;
    cpu: number;
    mem: number;
    time: number;
    cmd: string;
}

interface HtopSim {
    cpu: number[];
    memUsed: number; memTotal: number;
    swpUsed: number; swpTotal: number;
    tasks: number; thr: number; run: number;
    load: number[];
    uptime: number;
    procs: Process[];
}

const USERS = ['root', 'john', 'mysql', 'nginx', 'daemon', 'nobody'];
const CMDS = [
    '/sbin/init', 'kthreadd', 'ksoftirqd/0', 'rcu_sched', 'systemd-journald',
    'sshd: thomas [priv]', '/usr/bin/zsh', 'htop', 'node index.js', 'pnpm dev',
    'docker daemon', 'nginx: master process', 'redis-server', 'postgres',
    'python3 server.py', 'code --type=renderer'
];

function makeSim(): HtopSim {
    const procs: Process[] = [];
    for (let i = 0; i < 60; i++) {
        procs.push({
            pid: 1 + rnd(30000),
            user: USERS[rnd(USERS.length)],
            pri: '20',
            ni: '0',
            virt: (rnd(900) + 100) + 'M',
            res: (rnd(400) + 10) + 'M',
            shr: (rnd(50) + 5) + 'M',
            s: rnd(10) < 2 ? 'R' : 'S',
            cpu: rnd(10) + rnd(10),
            mem: rnd(15) + Math.random(),
            time: rnd(3600),
            cmd: CMDS[rnd(CMDS.length)] + (rnd(5) === 0 ? ' --debug' : '')
        });
    }
    return {
        cpu: [0, 0, 0, 0, 0, 0, 0, 0], // 8 cores
        memUsed: 4.2, memTotal: 16.0,
        swpUsed: 0.1, swpTotal: 2.0,
        tasks: 142, thr: 310, run: 2,
        load: [1.2, 0.9, 0.6],
        uptime: 3600 * 24 * 3 + rnd(10000),
        procs
    };
}

export class RetroDashboard implements IApplication<Engine, User<any>> {
    name = "Htop Clone Dashboard";
    description = "A Linux htop style dashboard with fake data.";

    private sim: HtopSim = makeSim();

    /**
     * Global initialization (called once when the application starts).
     * We load the custom color palette that mimics a standard Linux terminal.
     */
    async init(runtime: IRuntime, engine: Engine): Promise<void> {
        // Setup initial application palette (HTOP standard colors)
        engine.loadPaletteToSlot(0, [
            { colorId: 0, r: 10, g: 10, b: 10, a: 255 },  // 0 Bg
            { colorId: 1, r: 220, g: 220, b: 220, a: 255 },// 1 Text
            { colorId: 2, r: 60, g: 220, b: 60, a: 255 },  // 2 Green (CPU normal)
            { colorId: 3, r: 240, g: 80, b: 80, a: 255 },  // 3 Red (CPU high)
            { colorId: 4, r: 80, g: 180, b: 240, a: 255 }, // 4 Cyan (Mem)
            { colorId: 5, r: 220, g: 200, b: 80, a: 255 }, // 5 Yellow / Orange
            { colorId: 6, r: 180, g: 80, b: 240, a: 255 }, // 6 Magenta
            { colorId: 7, r: 60, g: 60, b: 60, a: 255 },   // 7 Dark Grey (Bar bg)
            { colorId: 8, r: 80, g: 80, b: 200, a: 255 },  // 8 Blue (Low CPU)
            { colorId: 9, r: 180, g: 240, b: 180, a: 255 },// 9 Header Text
            { colorId: 10, r: 40, g: 100, b: 40, a: 255 }  // 10 Header Bg
        ]);
        runtime.setTickRate(10);
    }

    /**
     * User initialization (called whenever a new client connects).
     * We set up the user's Display and construct multiple Layers to handle
     * the dense rendering requirements without overflowing the 255 orders/layer limit.
     */
    initUser(_runtime: IRuntime, _engine: Engine, user: User<any>): void {
        const display = new Display(0, W, H);
        user.addDisplay(display);
        display.switchPalette(0);

        // Setup 3 Z-layers to stay under 255-order limit per layer
        display.setRenderPasses([{ id: 0, zMin: 0, zMax: 2 }]);

        const htopLayer = new Layer(new Vector2(0, 0), 0, W, H, { mustBeReliable: false });

        user.addLayer(htopLayer);

        const listLayer1 = new Layer(new Vector2(0, 0), 1, W, H, { mustBeReliable: false });

        user.addLayer(listLayer1);

        const listLayer2 = new Layer(new Vector2(0, 0), 2, W, H, { mustBeReliable: false });

        user.addLayer(listLayer2);

        user.data = { display, htopLayer, listLayer1, listLayer2 };
    }

    /**
     * Global simulation loop (called 10 times per second, based on setTickRate).
     * This updates the fake system metrics independently of the rendering.
     * All users see the same 'server state' generated here.
     */
    update(_runtime: IRuntime, _engine: Engine): void {
        const s = this.sim;
        s.uptime++;
        for (let i = 0; i < s.cpu.length; i++) {
            let next = s.cpu[i] + (Math.random() - 0.5) * 20;
            if (next < 0) next = 0;
            if (next > 100) next = 100;
            s.cpu[i] = next;
        }

        s.memUsed = Math.max(1, Math.min(s.memTotal, s.memUsed + (Math.random() - 0.5) * 0.5));

        let runCount = 0;
        for (const p of s.procs) {
            p.cpu = Math.max(0, p.cpu + (Math.random() - 0.5) * 5);
            if (p.cpu > 0) p.time += 1;
            p.s = (p.cpu > 15) ? 'R' : 'S';
            if (p.s === 'R') runCount++;
        }
        s.run = runCount;

        if (rnd(10) === 0) {
            const p = s.procs[rnd(s.procs.length)];
            p.cpu = rnd(80) + 10;
        }

        s.procs.sort((a, b) => b.cpu - a.cpu);
    }

    /**
     * Per-user render loop.
     * We take the data from the global simulation and convert it into
     * Primitiv Drawing Orders (text, rectangles, lines).
     */
    updateUser(_runtime: IRuntime, _engine: Engine, user: User<any>): void {
        const d = user.data;
        const s = this.sim;
        const o: any[] = [];

        o.push(OrderBuilder.fill(' ', 0, 0));

        const CPU_BAR_LEN = 24;
        for (let i = 0; i < s.cpu.length; i++) {
            const y = i % 4;
            const xOff = i < 4 ? 0 : 38;

            o.push(OrderBuilder.text(1 + xOff, y, padL(i + 1, 2), 4, 0));
            o.push(OrderBuilder.text(4 + xOff, y, '[', 1, 0));

            const v = s.cpu[i];
            const activeLen = Math.round((v / 100) * CPU_BAR_LEN);
            let barStr = '';
            for (let j = 0; j < CPU_BAR_LEN; j++) barStr += j < activeLen ? '|' : ' ';

            o.push(OrderBuilder.text(5 + xOff, y, barStr, 2, 0));
            o.push(OrderBuilder.text(5 + CPU_BAR_LEN + 1 + xOff, y, padL(v.toFixed(1), 5) + '%]', 1, 0));
        }

        const MEM_BAR_LEN = 36;
        const yMem = 4;
        o.push(OrderBuilder.text(1, yMem, 'Mem[', 4, 0));
        const memLen = Math.round((s.memUsed / s.memTotal) * MEM_BAR_LEN);
        o.push(OrderBuilder.text(5, yMem, '|'.repeat(memLen).padEnd(MEM_BAR_LEN, ' '), 4, 0));
        o.push(OrderBuilder.text(5 + MEM_BAR_LEN + 1, yMem, padL(`${s.memUsed.toFixed(2)}G/${s.memTotal.toFixed(2)}G`, 13) + ']', 1, 0));

        const ySwp = 5;
        o.push(OrderBuilder.text(1, ySwp, 'Swp[', 3, 0));
        const swpLen = Math.round((s.swpUsed / s.swpTotal) * MEM_BAR_LEN);
        o.push(OrderBuilder.text(5, ySwp, '|'.repeat(swpLen).padEnd(MEM_BAR_LEN, ' '), 3, 0));
        o.push(OrderBuilder.text(5 + MEM_BAR_LEN + 1, ySwp, padL(`${s.swpUsed.toFixed(1)}M/${s.swpTotal.toFixed(1)}M`, 13) + ']', 1, 0));

        const rX = 76;
        o.push(OrderBuilder.text(rX, 0, `Tasks: ${s.tasks}, ${s.thr} thr; ${s.run} running`, 1, 0));
        o.push(OrderBuilder.text(rX, 1, `Load average: ${s.load[0].toFixed(2)} ${s.load[1].toFixed(2)} ${s.load[2].toFixed(2)}`, 1, 0));

        const days = Math.floor(s.uptime / 86400);
        const hrs = Math.floor((s.uptime % 86400) / 3600);
        const mins = Math.floor((s.uptime % 3600) / 60);
        const secs = s.uptime % 60;
        o.push(OrderBuilder.text(rX, 2, `Uptime: ${days} days, ${padL(hrs, 2, '0')}:${padL(mins, 2, '0')}:${padL(secs, 2, '0')}`, 1, 0));

        const headerY = 7;
        o.push(OrderBuilder.rect(0, headerY, W, 1, ' ', 1, 10, true));
        const headerStr = `${padL('PID', 5)} ${padR('USER', 8)} ${padL('PRI', 3)} ${padL('NI', 3)} ${padL('VIRT', 5)} ${padL('RES', 5)} ${padL('SHR', 5)} S ${padL('CPU%', 5)} ${padL('MEM%', 5)} ${padL('TIME+', 9)} Command`.padEnd(W, ' ');
        o.push(OrderBuilder.text(0, headerY, headerStr, 9, 10));

        // Instead of color buffers, we split orders into multiple arrays to stay under the 255 orders/layer limit
        const l1: any[] = [];
        const l2: any[] = [];

        for (let i = 0; i < 35 && i < s.procs.length; i++) {
            const dest = i < 17 ? l1 : l2;
            const p = s.procs[i];
            const y = headerY + 1 + i;

            const timeMins = Math.floor(p.time / 60);
            const timeSecs = padL((p.time % 60).toFixed(2), 5, '0');
            const timeStr = `${timeMins}:${timeSecs}`;

            dest.push(OrderBuilder.text(0, y, padL(p.pid, 5), 3, 0));
            dest.push(OrderBuilder.text(6, y, padR(p.user, 8), 4, 0));

            const priNiVirt = `${padL(p.pri, 3)} ${padL(p.ni, 3)}   ${padL(p.virt, 5)}`;
            dest.push(OrderBuilder.text(15, y, priNiVirt, 1, 0));

            const resShr = `${padL(p.res, 5)} ${padL(p.shr, 5)}`;
            dest.push(OrderBuilder.text(29, y, resShr, 5, 0));

            const sColor = p.s === 'R' ? 2 : 1;
            dest.push(OrderBuilder.text(41, y, p.s, sColor, 0));

            dest.push(OrderBuilder.text(43, y, padL(p.cpu.toFixed(1), 5), 2, 0));
            dest.push(OrderBuilder.text(49, y, padL(p.mem.toFixed(1), 5), 4, 0));
            dest.push(OrderBuilder.text(55, y, padL(timeStr, 9), 3, 0));
            dest.push(OrderBuilder.text(65, y, p.cmd, 1, 0));
        }

        const bY = H - 1;
        o.push(OrderBuilder.rect(0, bY, W, 1, ' ', 1, 0, true));
        const menuOpts = ['Help', 'Setup', 'Search', 'Filter', 'Tree', 'SortBy', 'Nice-', 'Nice+', 'Kill', 'Quit'];
        let mX = 0;
        for (let i = 0; i < 10; i++) {
            o.push(OrderBuilder.text(mX, bY, `F${i + 1}`, 1, 0));
            mX += (i < 9 ? 3 : 4);
            const opt = ` ${menuOpts[i]} `;
            o.push(OrderBuilder.text(mX, bY, opt, 1, 10));
            mX += opt.length + 1;
        }

        d.htopLayer.setOrders(o);


        d.listLayer1.setOrders(l1);


        d.listLayer2.setOrders(l2);

    }
}
```

---

## File: applications/showcase-02-dungeon/index.ts

```typescript
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
```

---

## File: applications/showcase-03-game-of-life/index.ts

```typescript
/**
 * Name: showcase-03-game-of-life
 * Category: showcase
 * Description: An interactive implementation of Conway's Game of Life.
 *   This showcase demonstrates how to handle continuous interactive states,
 *   sub-frame simulation ticking decoupled from the render loop, and advanced
 *   mouse interactions (drawing, UI sliders, crosshairs).
 *
 * Architecture:
 *   Unlike showcase-02 where the engine was cleanly separated, this app embeds
 *   the simulation array directly in `User.data` and processes it within the 
 *   `updateUser` loop. This is a common pattern for "toy" applications where 
 *   the logic is simple enough not to warrant a standalone class.
 *
 * Layer Composition (Z-Stacking):
 *   - Z0 (bg): Static dark background.
 *   - Z1 (cursor): Rendered at Z=1 but conceptually floating. Updates at 60Hz 
 *                  specifically to keep the mouse crosshair perfectly responsive 
 *                  regardless of the simulation speed.
 *   - Z2 (main): The simulation grid. Rendered using `OrderBuilder.bitmask4`
 *                which handles 0-3 state arrays in a single order.
 *   - Z3 (ui): Static UI elements (borders, labels) rendered once.
 *   - Z4 (stats): Dynamic UI components (population bars, speed slider, coordinates)
 *                 updated every frame based on simulation data.
 *
 * Key Primitiv Concepts demonstrated:
 *   - `bitmask4`: Rendering arrays representing 0-3 states.
 *   - Decoupled Tick Rates: App runs at 60Hz for smooth cursor, while the 
 *     internal simulation array ticks at a dynamic rate controlled by `simHz`.
 *   - Mouse Input: Drag-to-paint on the grid, click-to-slide on the UI.
 *   - Post-Processing: Applying CRT effects (blur, scanlines) to the Display.
 */

import {
    Engine,
    User,
    Layer,
    Display,
    OrderBuilder,
    Vector2,
    ScalingMode,
    InputDeviceType,
    MouseInput,
    type IApplication,
    type IRuntime,
} from '@primitiv/engine';

/**
 * GameOfLifeUserData stores the persistent state for each user connected to the application.
 */
interface GameOfLifeUserData {
    // The background layer (160x75) for a solid base color.
    bgLayer: Layer;
    // The cursor layer (160x75) for the mouse crosshair.
    cursorLayer: Layer;
    // The main simulation layer (160x75) for the cellular automata.
    layer: Layer;
    // The UI layer (160x5) for static elements (labels, background).
    uiLayer: Layer;
    // The dynamic stats layer (160x5) for changing values and bars.
    statsLayer: Layer;
    // Dimensions of the virtual terminal display.
    display_width: number;
    display_height: number;
    // Total frames elapsed.
    frameCount: number;
    // Flat array for the simulation grid (States: 0=Dead, 1=Stable, 2=Born, 3=Dying).
    grid: number[];
    // Target simulation frequency (Hertz).
    simHz: number;
    // Fractional accumulator for sub-frame simulation steps.
    simTickCounter: number;
}

// Global dimensions setup.
const SIM_WIDTH = 160;
const SIM_HEIGHT = 75; // The simulation grid height.
const UI_HEIGHT = 5;    // The control bar height.
const TOTAL_HEIGHT = SIM_HEIGHT + UI_HEIGHT; // 80 total rows.

// Simulation pattern (Puffer).
const puffer: string = `
........O.......O..................O.......O.........
.......OOO.....OOO................OOO.....OOO........
......OO..O...O..OO..............O..OO...OO..O.......
......O..O.....O..O..................................
.....OO...OO.OO...OO.................................
......O.O.OO.OO.O.O.............O...OO...OO...O......
.......O.........O.............O..OO..O.O..OO..O.....
........O..O.O..O...............O.O...O.O...O.O......
...................................OOO...OOO.........
.....OO..OO...OO..OO................O.....O..........
.....OO...........OO.................................
.....................................................
.........O.....O.................O...........O.......
.........OO...OO.................O...........O.......
.....................................................
....................O..........O....OO...OO..........
....O..............OOO........OOO...OO...OO....O.....
...OOO............O..OO......O..OO............OOO....
..O..OO..OO...OO..OOO..O.....OO...O..........O..OO...
..OO.....OO...OO.....O.O......OO..O..........OO......
.O...................O..O.........O........O..O......
.OOO..................OO......O....O.O...OO..........
......................OO.....O.......O...OOOOOOO.....
.............................O......O...........OO.OO
..............................OO.OOO............O.OOO
..................O..........O...................OOO.
.................O..O................................
..O...............O.O................................
.O.O.................................................
O...O...........................................OOO..
O...O...........................................O.O..
.O.O.................................................
..O..................................................
.....................................................
.....................................................
....................................................O.O..
....................................................OOO..`;

export class GameOfLife implements IApplication<Engine, User<GameOfLifeUserData>> {
    /**
     * Engine initialization: Load palette and set base tick rate.
     */
    async init(runtime: IRuntime, engine: Engine): Promise<void> {
        const palette = [
            { colorId: 0, r: 10, g: 10, b: 20, a: 255 }, // Background
            { colorId: 1, r: 255, g: 215, b: 0, a: 255 }, // Alive
            { colorId: 2, r: 255, g: 250, b: 170, a: 255 }, // Born
            { colorId: 3, r: 125, g: 100, b: 0, a: 255 }, // Dying
            { colorId: 4, r: 20, g: 20, b: 40, a: 255 }, // UI Bar
            { colorId: 5, r: 120, g: 100, b: 0, a: 255 }, // Pure Red (Crosshair)
        ];
        engine.loadPaletteToSlot(0, palette);
        runtime.setTickRate(60);
    }

    /**
     * User initialization: Set up discrete layers with specific offsets.
     */
    initUser(
        _runtime: IRuntime,
        _engine: Engine,
        user: User<GameOfLifeUserData>,
        _metadata?: any
    ): void {
        user.data.display_width = SIM_WIDTH;
        user.data.display_height = TOTAL_HEIGHT; // 80 rows
        user.data.frameCount = 0;
        user.data.grid = [];

        // Main Display setup.
        const display = new Display(0, user.data.display_width, user.data.display_height);
        user.addDisplay(display);
        display.setScalingMode(ScalingMode.None);
        display.switchPalette(0);
        display.setOrigin(new Vector2(0, 0));

        // CRT-style visual effects.
        display.setAmbientEffect({ blur: 30, scale: 1.8 });
        display.setPostProcess({ scanlines: { enabled: true, opacity: 0.4, pattern: 'horizontal' } });

        /**
         * Layer Optimization:
         * Each layer is sized exactly to its content and ordered by Z-index.
         */

        // Static Background Layer (Index 0): Provides a solid color behind everything.
        const bgLayer = new Layer(new Vector2(0, 0), 0, SIM_WIDTH, SIM_HEIGHT, false);
        user.addLayer(bgLayer, 'bg');
        user.data.bgLayer = bgLayer;

        // Initialize background once (static).
        bgLayer.setOrders([
            OrderBuilder.rect(0, 0, SIM_WIDTH, SIM_HEIGHT, ' ', 0, 0, true),
        ]);


        // Cursor Layer (Z1): Crosshair following the mouse, updated every frame.
        const cursorLayer = new Layer(new Vector2(0, 0), 1, SIM_WIDTH, SIM_HEIGHT, true);
        user.addLayer(cursorLayer, 'cursor');
        user.data.cursorLayer = cursorLayer;

        // Simulation Layer (Index 2): Covers the top 75 rows.
        const layer = new Layer(new Vector2(0, 0), 2, SIM_WIDTH, SIM_HEIGHT, false);
        user.addLayer(layer, 'main');
        user.data.layer = layer;

        // UI Layer (Index 3): Positioned at (0, 75) and only 5 rows high. Holds static labels.
        const uiLayer = new Layer(new Vector2(0, SIM_HEIGHT), 3, SIM_WIDTH, UI_HEIGHT, true);
        user.addLayer(uiLayer, 'ui');
        user.data.uiLayer = uiLayer;

        // Stats Layer (Index 4): Also at (0, 75). Holds dynamic values and bars.
        const statsLayer = new Layer(new Vector2(0, SIM_HEIGHT), 4, SIM_WIDTH, UI_HEIGHT, true);
        user.addLayer(statsLayer, 'stats');
        user.data.statsLayer = statsLayer;

        user.data.simHz = 12;
        user.data.simTickCounter = 0;

        // Initialize static UI once.
        this.renderStaticUI(user);

        this.setupInputs(user);
    }

    private renderStaticUI(user: User<GameOfLifeUserData>): void {
        const uiLayer = user.data.uiLayer;

        // Background
        const uiData = [];
        for (let i = 0; i < SIM_WIDTH * UI_HEIGHT; i++) {
            uiData.push({ charCode: ' ', fgColorCode: 1, bgColorCode: 4 });
        }
        const uiBgOrder = OrderBuilder.subFrameMulti(0, 0, SIM_WIDTH, UI_HEIGHT, uiData);

        // Static Text
        const textOrder = OrderBuilder.text(
            1,
            1,
            `[ GAME OF LIFE ] - GRID: ${SIM_WIDTH}x${SIM_HEIGHT}`,
            2,
            4
        );

        const statsX = 75;
        const stableLabel = OrderBuilder.text(statsX, 1, 'STABLE: ', 1, 4);
        const bornLabel = OrderBuilder.text(statsX, 2, 'BORN:   ', 2, 4);
        const diedLabel = OrderBuilder.text(statsX, 3, 'DIED:   ', 3, 4);

        const mouseInfoLabelX = 118;
        const xLabel = OrderBuilder.text(mouseInfoLabelX, 1, 'X:', 1, 4);
        const yLabel = OrderBuilder.text(mouseInfoLabelX, 2, 'Y:', 1, 4);

        const sliderLabel = OrderBuilder.text(1, 3, 'SPEED:', 1, 4);
        const SLIDER_WIDTH = 50;
        const sliderTrack = OrderBuilder.text(8, 3, '-'.repeat(SLIDER_WIDTH + 1), 3, 4);
        const speedSuffix = OrderBuilder.text(62, 3, ' Hz', 1, 4);

        uiLayer.setOrders([
            uiBgOrder,
            textOrder,
            stableLabel,
            bornLabel,
            diedLabel,
            xLabel,
            yLabel,
            sliderLabel,
            sliderTrack,
            speedSuffix,
        ]);

    }

    private setupInputs(user: User<GameOfLifeUserData>): void {
        const inputRegistry = user.getInputBindingRegistry();
        inputRegistry.defineButton(0, 'Place', [
            { sourceId: 10, type: InputDeviceType.Mouse, mouseButton: MouseInput.LeftButton },
        ]);
    }

    /**
     * Main loop handles simulation and localized rendering.
     */
    updateUser(
        _runtime: IRuntime,
        _engine: Engine,
        user: User<GameOfLifeUserData>,
    ): void {
        const display = user.getDisplay(user.activeDisplay);
        if (!display) return;

        const data = user.data;
        data.frameCount++;

        const totalCells = SIM_WIDTH * SIM_HEIGHT;

        // --- 1. Simulation Logic (Decoupled ticks) ---
        // If the grid is uninitialized, populate it with the predefined 'Puffer' pattern.
        if (data.grid.length !== totalCells) {
            data.grid = new Array(totalCells).fill(0);
            const pufferLines = puffer.trim().split('\n');
            const pHeight = pufferLines.length;
            const pWidth = pufferLines[0]?.length || 0;
            const startX = Math.floor((SIM_WIDTH - pHeight) / 2);
            const startY = Math.floor((SIM_HEIGHT - pWidth) / 2);

            for (let y = 0; y < pHeight; y++) {
                for (let x = 0; x < pWidth; x++) {
                    if (pufferLines[y][x] === 'O') {
                        const targetX = startX + (pHeight - 1 - y);
                        const targetY = startY + x;
                        if (targetX >= 0 && targetX < SIM_WIDTH && targetY >= 0 && targetY < SIM_HEIGHT) {
                            data.grid[targetY * SIM_WIDTH + targetX] = 1;
                        }
                    }
                }
            }
        }
        else {
            // Decoupled Time Accumulator:
            // Since `updateUser` operates at 60Hz constantly (to keep the mouse cursor smooth),
            // the simulation runs at `data.simHz`. We add a fraction of a frame to the counter.
            data.simTickCounter += data.simHz / 60;

            // If the accumulator exceeds 1.0, we execute one or more simulation steps.
            while (data.simTickCounter >= 1) {
                data.simTickCounter -= 1;
                const nextGrid = new Array(totalCells).fill(0);

                // Classic Conway's Game of Life rules evaluation.
                for (let y = 0; y < SIM_HEIGHT; y++) {
                    for (let x = 0; x < SIM_WIDTH; x++) {
                        const idx = y * SIM_WIDTH + x;
                        let neighbors = 0;

                        // Count 8-way neighbors with wrapping (toroidal array)
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                const nx = (x + dx + SIM_WIDTH) % SIM_WIDTH;
                                const ny = (y + dy + SIM_HEIGHT) % SIM_HEIGHT;
                                if (data.grid[ny * SIM_WIDTH + nx] === 1 || data.grid[ny * SIM_WIDTH + nx] === 2) neighbors++;
                            }
                        }
                        const currentState = data.grid[idx];
                        const isAlive = (currentState === 1 || currentState === 2);

                        // Apply rules: survive, birth, or die
                        if (isAlive && (neighbors === 2 || neighbors === 3)) nextGrid[idx] = 1;
                        else if (!isAlive && neighbors === 3) nextGrid[idx] = 2; // State 2: Just Born
                        else if (isAlive) nextGrid[idx] = 3;                     // State 3: Just Died
                    }
                }
                data.grid = nextGrid;
            }
        }

        // --- 2. Input & Interaction ---
        const isMouseDown = user.getButton("Place");
        const mouseInfo = user.getMouseDisplayInfo();

        // Mouse Crosshair (Dynamic Layer, Index 10)
        // This is updated at full 60Hz independently of simulation steps.
        const cursorOrders = [];
        if (mouseInfo) {
            const smx = Math.floor(mouseInfo.localX);
            const smy = Math.floor(mouseInfo.localY);

            // Crosshair is only visible when hovering the simulation area (y < 75).
            if (smx >= 0 && smx < SIM_WIDTH && smy >= 0 && smy < SIM_HEIGHT) {
                // Opaque black background (0) and Gold color (1) for high visibility test.
                cursorOrders.push(OrderBuilder.line(smx, 0, smx, SIM_HEIGHT - 1, { charCode: "|", fgColor: 5, bgColor: 0 }));
                cursorOrders.push(OrderBuilder.line(0, smy, SIM_WIDTH - 1, smy, { charCode: "-", fgColor: 5, bgColor: 0 }));
                cursorOrders.push(OrderBuilder.char(smx, smy, "+", 5, 0));
            }

            // Standard Input Logic
            if (smy >= SIM_HEIGHT) {
                // UI Interaction (y starts at SIM_HEIGHT). 
                // Slider is at row 3 within the 5-row UI bar.
                const uiLocalY = smy - SIM_HEIGHT;
                if (isMouseDown && uiLocalY === 3 && smx >= 8 && smx <= 58) {
                    const pct = (smx - 8) / (58 - 8);
                    data.simHz = Math.round(1 + pct * 59);
                }
            } else if (isMouseDown && smx >= 0 && smx < SIM_WIDTH && smy >= 0 && smy < SIM_HEIGHT) {
                // Drawing in simulation space.
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const cx = (smx + dx + SIM_WIDTH) % SIM_WIDTH;
                        const cy = (smy + dy + SIM_HEIGHT) % SIM_HEIGHT;
                        if (cy < SIM_HEIGHT) data.grid[cy * SIM_WIDTH + cx] = 1;
                    }
                }
            }
        }
        data.cursorLayer.setOrders(cursorOrders);


        // --- 3. Rendering the Simulation ---

        // Render Simulation Layer using bitmask4.
        // `bitmask4` is optimized for flat arrays where each element is between 0 and 3.
        // It packs the data into a single order instead of generating 12,000 individual text orders.
        const simulationVariants = [
            { char: "█", fgColor: 1, bgColor: 0 }, // Map State 1: Stable Alive
            { char: "█", fgColor: 2, bgColor: 0 }, // Map State 2: Just Born
            { char: "█", fgColor: 3, bgColor: 0 }, // Map State 3: Just Died
        ];

        // bitmask4(x, y, w, h, maskData, variants, override)
        // override=false allows it to overlay cleanly on the background layer behind it.
        const layerOrder = OrderBuilder.bitmask4(
            0, 0, SIM_WIDTH, SIM_HEIGHT,
            data.grid,
            simulationVariants,
            false
        );
        data.layer.setOrders([layerOrder]);


        // --- 4. Dynamic Stats Rendering ---

        // Calculate statistics for the current simulation state.
        // Categories are mutually exclusive: 1 (Stable), 2 (Born), 3 (Dying).
        let stableCount = 0;
        let bornCount = 0;
        let diedCount = 0;
        for (let i = 0; i < totalCells; i++) {
            const state = data.grid[i];
            if (state === 1) stableCount++;
            else if (state === 2) bornCount++;
            else if (state === 3) diedCount++;
        }

        // Positioning for dynamic content (relative to labels in uiLayer).
        const statsValueX = 83; // X=75 + "STABLE: ".length
        const barX = 92;

        /**
         * Helper to generate a 20-character progress bar based on total active/dying population.
         */
        const totalPopulation = stableCount + bornCount + diedCount;
        const makeBar = (count: number) => {
            if (totalPopulation === 0) return "-".repeat(20);
            const filled = Math.min(20, Math.round((count / totalPopulation) * 20));
            return "█".repeat(filled).padEnd(20, "-");
        };

        const stableValue = OrderBuilder.text(statsValueX, 1, stableCount.toString().padEnd(5), 1, 4);
        const stableBar = OrderBuilder.text(barX, 1, `[${makeBar(stableCount)}]`, 1, 4);

        const bornValue = OrderBuilder.text(statsValueX, 2, bornCount.toString().padEnd(5), 2, 4);
        const bornBar = OrderBuilder.text(barX, 2, `[${makeBar(bornCount)}]`, 2, 4);

        const diedValue = OrderBuilder.text(statsValueX, 3, diedCount.toString().padEnd(5), 3, 4);
        const diedBar = OrderBuilder.text(barX, 3, `[${makeBar(diedCount)}]`, 3, 4);

        // Dynamic Slider elements.
        const SLIDER_WIDTH = 50;
        const handleX = Math.floor(8 + ((data.simHz - 1) / 59) * SLIDER_WIDTH);
        const sliderHandle = OrderBuilder.text(handleX, 3, "O", 2, 4);
        const speedValueNum = OrderBuilder.text(60, 3, data.simHz.toString().padStart(2), 1, 4);

        // Dynamic Mouse coordinates
        let mouseXVal = "---";
        let mouseYVal = "---";
        if (mouseInfo) {
            const smx = Math.floor(mouseInfo.localX);
            const smy = Math.floor(mouseInfo.localY);
            if (smx >= 0 && smx < SIM_WIDTH && smy >= 0 && smy < SIM_HEIGHT) {
                mouseXVal = smx.toString().padStart(3);
                mouseYVal = smy.toString().padStart(3);
            }
        }
        const xValue = OrderBuilder.text(121, 1, mouseXVal, 1, 4);
        const yValue = OrderBuilder.text(121, 2, mouseYVal, 1, 4);

        // Render to statsLayer (Index 4).
        data.statsLayer.setOrders([
            stableValue, stableBar,
            bornValue, bornBar,
            diedValue, diedBar,
            sliderHandle, speedValueNum,
            xValue, yValue
        ]);

    }

    update(_runtime: IRuntime, _engine: Engine): void { }
}
```

---

## File: applications/showcase-04-spaceship/index.ts

```typescript
/**
 * Name: showcase-04-spaceship
 * Category: showcase
 * Description: A spaceship interior with three navigable scenes (top-down map,
 *   cockpit, bureau). Each scene is a group of Layers placed at different
 *   X offsets in world space. Scene switching is done by moving the Display's
 *   origin to the target offset using `display.setOrigin()`.
 *
 * Architecture:
 *   Everything lives in this single file. The Spaceship class implements
 *   IApplication directly - there is no separate engine class.
 *
 * Scene Layout (world-space X offsets):
 *   - X=0:    Cockpit - 3D starfield (perspective projection), cockpit frame
 *             rendered once via fullFrameMulti, instrument panels, warp controls.
 *   - X=1000: Bureau - Side-view room with a porthole window, two monitor
 *             panels showing fuel/temperature gauges and module status.
 *   - X=2000: Top-down - ASCII map of the ship interior. The player (@) walks
 *             between seats marked C (cockpit) and B (bureau). Pressing F
 *             while adjacent to a seat switches to the corresponding scene.
 *
 * Palette Slots:
 *   - Slot 0: Base palette (9 colors)
 *   - Slots 1-12: Progressively red-shifted variants of the base palette,
 *     cycled with Math.sin() during warp to create a pulsing alarm effect.
 *   - Slot 13: Darkened variant used when power is off.
 *
 * Key Primitiv Concepts demonstrated:
 *   - Scene switching via Display.setOrigin() and Display.setSize()
 *   - dotCloudMulti for batched star rendering (800 stars in one order)
 *   - fullFrameMulti for the cockpit frame (rendered once in initUser)
 *   - Palette slot cycling for global color effects without re-rendering
 *   - mustBeReliable: true for static structure, false for stars/dynamic data
 *   - Dirty flag (topdownRenderNeeded) to avoid redundant reliable commits
 */

import { Display, Engine, type IApplication, InputDeviceType, type IRuntime, KeyboardInput, Layer, OrderBuilder, ScalingMode, User, Vector2 } from "@primitiv/engine";

const TICK_RATE = 30;
const STAR_COUNT = 800;
const MAX_Z = 1000;
const FOV = 250;

const COLOR_SPACE = 0;   // Deep Black
const COLOR_STAR_HI = 1; // Bright White
const COLOR_STAR_MD = 2; // Soft Blue
const COLOR_STAR_LO = 3; // Dim Red
const COLOR_HUD = 4;    // Neon Cyan
const COLOR_HUD_ALT = 5; // Alert Orange
const COLOR_FRAME = 6;   // Metallic Gray (Base)
const COLOR_FRAME_HI = 7; // Highlight
const COLOR_FRAME_LO = 8; // Shadow
const TRANSPARENT = 255;

// --- Ship Interior Map (pointing right →) ---
const SHIP_MAP_RAW = `
#########
E#....B.##
E#.......##
######....##
  #....@..C##
######....##
E#.......##
E#......##
#########
`;
// Clean up the raw string into array of lines, and find the spawn point `@`.
// We simultaneously replace `@` with `.` so it functions as a regular floor tile.
const SHIP_MAP_LINES = SHIP_MAP_RAW.replace(/^\n|\n$/g, "").split("\n");
let SPAWN_MAP_X = -1;
let SPAWN_MAP_Y = -1;

export const SHIP_MAP = SHIP_MAP_LINES.map((row, y) => {
    const spawnIdx = row.indexOf("@");
    if (spawnIdx !== -1) {
        SPAWN_MAP_X = spawnIdx;
        SPAWN_MAP_Y = y;
        return row.replace("@", ".");
    }
    return row;
});

interface Star {
    x: number;
    y: number;
    z: number;
    px: number; // Previous screen X
    py: number; // Previous screen Y
}

interface StarshipData {
    layer: Layer;
    uiLayer: Layer;
    cockpitLayer: Layer;
    instrumentsLayer: Layer;
    dynamicLayer: Layer;
    stars: Star[];
    width: number;
    height: number;
    speed: number;
    targetSpeed: number;
    fuel: number;
    temperature: number;
    pressure: number;
    terminalLogs: string[];
    lastLogTime: number;
    warpSequenceTimer: number; // 0 to 10000ms
    warpSequenceState: "NORMAL" | "STARTING" | "WARPING" | "STOPPING";
    isPowerOn: boolean;
    // Bureau Scene
    bureauStarsLayer: Layer;
    bureauStructureLayer: Layer;
    bureauInstrumentsLayer: Layer;
    bureauDynamicLayer: Layer;
    bureauStars: { x: number; speed: number; y: number; brightness: number }[];
    // Top-down Room Scene
    topdownStarsLayer: Layer;
    topdownLayer: Layer;
    playerX: number;
    playerY: number;
    moveCooldown: number;
    currentScene: "cockpit" | "bureau" | "topdown";
    lastScene: "cockpit" | "bureau" | "topdown" | "none";
    topdownRenderNeeded: boolean;
    display: Display;
}

export class Spaceship implements IApplication<Engine, User<StarshipData>> {
    private isForPreview: boolean;

    constructor(isForPreview = false) {
        this.isForPreview = isForPreview;
    }

    init(_runtime: IRuntime, engine: Engine): void {
        const basePalette = [
            { colorId: COLOR_SPACE, r: 2, g: 2, b: 8, },
            { colorId: COLOR_STAR_HI, r: 255, g: 255, b: 255 },
            { colorId: COLOR_STAR_MD, r: 150, g: 180, b: 255 },
            { colorId: COLOR_STAR_LO, r: 100, g: 50, b: 50 },
            { colorId: COLOR_HUD, r: 0, g: 255, b: 255 },
            { colorId: COLOR_HUD_ALT, r: 255, g: 100, b: 0 },
            { colorId: COLOR_FRAME, r: 40, g: 45, b: 60 },
            { colorId: COLOR_FRAME_HI, r: 80, g: 90, b: 110 },
            { colorId: COLOR_FRAME_LO, r: 15, g: 18, b: 25 },
        ];
        engine.loadPaletteToSlot(0, basePalette);

        // Generate 12 reddish alarm variations (slots 1 to 12) for smooth transition
        for (let i = 1; i <= 12; i++) {
            const mix = (i / 12) * 0.6; // Max 60% red for a less aggressive glow
            const redPalette = basePalette.map(c => {
                if (c.colorId === COLOR_SPACE || c.colorId === COLOR_STAR_HI || c.colorId === COLOR_STAR_MD || c.colorId === COLOR_STAR_LO) return c; // Don't colorize stars & space
                // Calculate relative luminance
                const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
                // Blend original color towards pure red of similar brightness
                const r = c.r * (1 - mix) + Math.min(255, lum * 1.5) * mix;
                const g = c.g * (1 - mix);
                const b = c.b * (1 - mix);
                return { colorId: c.colorId, r: Math.floor(r), g: Math.floor(g), b: Math.floor(b) };
            });
            engine.loadPaletteToSlot(i, redPalette);
        }

        // Generate 1 dark variation (slot 13) for dimming/alternating
        const darkPalette = basePalette.map(c => {
            if (c.colorId === COLOR_SPACE || c.colorId === COLOR_STAR_HI || c.colorId === COLOR_STAR_MD || c.colorId === COLOR_STAR_LO) return c; // Don't darken stars & space
            return {
                colorId: c.colorId,
                r: Math.floor(c.r * 0.3),
                g: Math.floor(c.g * 0.3),
                b: Math.floor(c.b * 0.3)
            };
        });
        engine.loadPaletteToSlot(13, darkPalette);
        _runtime.setTickRate(TICK_RATE);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<StarshipData>): void {
        const width = 120;
        const height = 67;
        const BUREAU_OFFSET = 1000;

        // Cockpit Scene Layers (world X=0)
        // Z0: Stars (unreliable, redrawn every frame)
        const layer = new Layer(new Vector2(0, 0), 0, width, height, { name: "space", mustBeReliable: false });
        // Z1: HUD reticle (reliable, rarely changes)
        const uiLayer = new Layer(new Vector2(0, 0), 1, width, height, { name: "hud", mustBeReliable: true });
        // Z2: Cockpit frame (reliable, rendered once in initUser)
        const cockpitLayer = new Layer(new Vector2(0, 0), 2, width, height, { name: "cockpit", mustBeReliable: true });
        // Z3: Static instrument labels and panel frames (reliable, rendered once)
        const instrumentsLayer = new Layer(new Vector2(0, 0), 3, width, height, { name: "instruments", mustBeReliable: true });
        // Z4: Dynamic instrument values - fuel bars, terminal logs (unreliable)
        const dynamicLayer = new Layer(new Vector2(0, 0), 4, width, height, { name: "dynamic", mustBeReliable: false });
        user.addLayer(layer);
        user.addLayer(uiLayer);
        user.addLayer(cockpitLayer);
        user.addLayer(instrumentsLayer);
        user.addLayer(dynamicLayer);

        // Bureau Scene Layers (world X=1000)
        const bureauStarsLayer = new Layer(new Vector2(BUREAU_OFFSET, 0), 0, width, height, { name: "bureau_stars", mustBeReliable: false });
        const bureauStructureLayer = new Layer(new Vector2(BUREAU_OFFSET, 0), 1, width, height, { name: "bureau_structure", mustBeReliable: true });
        const bureauInstrumentsLayer = new Layer(new Vector2(BUREAU_OFFSET, 0), 2, width, height, { name: "bureau_instruments", mustBeReliable: true });
        const bureauDynamicLayer = new Layer(new Vector2(BUREAU_OFFSET, 0), 3, width, height, { name: "bureau_dynamic", mustBeReliable: false });
        user.addLayer(bureauStarsLayer);
        user.addLayer(bureauStructureLayer);
        user.addLayer(bureauInstrumentsLayer);
        user.addLayer(bureauDynamicLayer);

        // Top-down Scene Layers (world X=2000)
        const TOPDOWN_OFFSET = 2000;
        const topdownStarsLayer = new Layer(new Vector2(TOPDOWN_OFFSET, 0), 0, width, height, { name: "topdown_stars", mustBeReliable: false });
        // topdownLayer is reliable - only committed when the player moves (topdownRenderNeeded flag)
        const topdownLayer = new Layer(new Vector2(TOPDOWN_OFFSET, 0), 1, width, height, { name: "topdown", mustBeReliable: true });
        user.addLayer(topdownStarsLayer);
        user.addLayer(topdownLayer);

        const display = new Display(0, width, height);
        display.setOrigin(new Vector2(TOPDOWN_OFFSET + 40, 22));
        display.setSize(new Vector2(40, 24)); // Zoomed in for topdown view
        user.addDisplay(display);
        display.switchPalette(0);
        display.setCellSize(8, 8);
        display.setScalingMode(ScalingMode.Quarter);

        // Cockpit 3D stars
        const stars: Star[] = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push(this.createStar(width, height));
        }

        // Bureau horizontal stars (simple parallax)
        const bureauStars: { x: number; speed: number; y: number; brightness: number }[] = [];
        for (let i = 0; i < 80; i++) {
            bureauStars.push({
                x: Math.random() * width,
                y: Math.floor(Math.random() * height),
                speed: 0.5 + Math.random() * 2,
                brightness: Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2
            });
        }

        user.data = {
            layer,
            uiLayer,
            cockpitLayer,
            instrumentsLayer,
            dynamicLayer,
            stars,
            width,
            height,
            speed: 5,
            targetSpeed: 5,
            fuel: 4000,
            temperature: 280,
            pressure: 1.0,
            terminalLogs: [
                "PRIMITIV-OS v4.2 BOOT COMPLETE",
                "CORE SYSTEMS... [NOMINAL]",
                "PRESS 'L' TO INITIATE WARP"
            ],
            lastLogTime: Date.now(),
            warpSequenceTimer: 0,
            warpSequenceState: "NORMAL",
            isPowerOn: true,
            // Bureau Scene
            bureauStarsLayer,
            bureauStructureLayer,
            bureauInstrumentsLayer,
            bureauDynamicLayer,
            bureauStars,
            // Topdown Scene
            topdownStarsLayer,
            topdownLayer,
            playerX: SPAWN_MAP_X !== -1 ? Math.floor((width - (SHIP_MAP[0]?.length || 0)) / 2) + SPAWN_MAP_X : Math.floor(width / 2),
            playerY: SPAWN_MAP_Y !== -1 ? Math.floor((height - SHIP_MAP.length) / 2) + SPAWN_MAP_Y : Math.floor(height / 2),
            moveCooldown: 0,
            currentScene: this.isForPreview ? "cockpit" : "topdown",
            lastScene: "none",
            topdownRenderNeeded: true,
            display
        };

        if (this.isForPreview) {
            user.data.warpSequenceState = "WARPING";
            user.data.speed = 20;
            user.data.targetSpeed = 20;
            display.setOrigin(new Vector2(0, 0));
            display.setSize(new Vector2(width, height));
        }

        // Render all static layers once (cockpit frame, instrument labels, bureau structure, ship map)
        this.setupInput(user);
        this.renderCockpit(user.data);
        this.renderInstruments(user.data);
        this.renderBureauStructure(user.data);
        this.renderBureauInstruments(user.data);
        this.renderTopDown(user.data);
    }

    private createStar(width: number, height: number, zFar = false): Star {
        return {
            x: (Math.random() - 0.5) * width * 10,
            y: (Math.random() - 0.5) * height * 10,
            z: zFar ? MAX_Z : Math.random() * MAX_Z,
            px: -1,
            py: -1,
        };
    }

    private setupInput(user: User<StarshipData>): void {
        const r = user.getInputBindingRegistry();

        // Warp Toggle (L)
        // Actions
        r.defineButton(1, "WarpToggle", [{ sourceId: 13, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyL }]);

        r.defineButton(10, "COM", [{ sourceId: 10, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyC }]);
        r.defineButton(11, "NAV", [{ sourceId: 11, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyN }]);
        r.defineButton(12, "O2", [{ sourceId: 12, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyO }]);
        r.defineButton(13, "RAD", [{ sourceId: 13, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyR }]);
        r.defineButton(14, "SHD", [{ sourceId: 14, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyS }]);
        r.defineButton(15, "PowerToggle", [{ sourceId: 15, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyY }]);

        // Top-down Room controls
        r.defineButton(20, "Interact", [{ sourceId: 20, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyF }]);
        r.defineButton(21, "MoveUp", [
            { sourceId: 21, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyW },
            { sourceId: 25, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowUp }
        ]);
        r.defineButton(22, "MoveDown", [
            { sourceId: 22, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyS },
            { sourceId: 26, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowDown }
        ]);
        r.defineButton(23, "MoveLeft", [
            { sourceId: 23, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyA },
            { sourceId: 27, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowLeft }
        ]);
        r.defineButton(24, "MoveRight", [
            { sourceId: 24, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyD },
            { sourceId: 28, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowRight }
        ]);
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<StarshipData>): void {
        const state = user.data;
        if (!state) return;

        const now = Date.now();
        const deltaMs = (1 / _runtime.getTickRate()) * 1000;

        if (state.currentScene === "topdown") {
            // Cooldown for grid movement
            state.moveCooldown -= deltaMs;

            const mapH = SHIP_MAP.length;
            const mapW = SHIP_MAP[0]?.length || 0;
            const offsetX = Math.floor((state.width - mapW) / 2);
            const offsetY = Math.floor((state.height - mapH) / 2);

            // Helper to check if a tile is walkable (takes screen coordinates)
            const isWalkable = (screenX: number, screenY: number) => {
                const x = screenX - offsetX;
                const y = screenY - offsetY;
                if (y < 0 || y >= SHIP_MAP.length) return false;
                if (x < 0 || x >= SHIP_MAP[y].length) return false;
                const char = SHIP_MAP[y][x];
                return char === "." || char === "C" || char === "B";
            };

            if (state.moveCooldown <= 0) {
                let moved = false;
                if (user.getButton("MoveUp") && isWalkable(state.playerX, state.playerY - 1)) { state.playerY--; moved = true; }
                else if (user.getButton("MoveDown") && isWalkable(state.playerX, state.playerY + 1)) { state.playerY++; moved = true; }
                else if (user.getButton("MoveLeft") && isWalkable(state.playerX - 1, state.playerY)) { state.playerX--; moved = true; }
                else if (user.getButton("MoveRight") && isWalkable(state.playerX + 1, state.playerY)) { state.playerX++; moved = true; }

                if (moved) {
                    state.moveCooldown = 80; // Fast walking pace
                    state.topdownRenderNeeded = true;
                }
            }

            // Interaction
            if (user.isJustPressed("Interact")) {
                // Check adjacent tiles for interactables
                const adj = [
                    { x: state.playerX, y: state.playerY - 1 },
                    { x: state.playerX, y: state.playerY + 1 },
                    { x: state.playerX - 1, y: state.playerY },
                    { x: state.playerX + 1, y: state.playerY },
                    { x: state.playerX, y: state.playerY } // Include standing on it
                ];

                let foundCockpit = false;
                let foundBureau = false;

                for (const pos of adj) {
                    const mapX = pos.x - offsetX;
                    const mapY = pos.y - offsetY;
                    if (mapY >= 0 && mapY < SHIP_MAP.length && mapX >= 0 && mapX < SHIP_MAP[mapY].length) {
                        const char = SHIP_MAP[mapY][mapX];
                        if (char === "C") foundCockpit = true;
                        if (char === "B") foundBureau = true;
                    }
                }

                if (foundCockpit) {
                    state.currentScene = "cockpit";
                    state.display.setOrigin(new Vector2(0, 0));
                    state.display.setSize(new Vector2(state.width, state.height));
                    this.addLog(state, "PILOT SEATED: COCKPIT ACTIVE");
                } else if (foundBureau) {
                    state.currentScene = "bureau";
                    state.display.setOrigin(new Vector2(1000, 0));
                    state.display.setSize(new Vector2(state.width, state.height));
                    this.addLog(state, "OFFICER SEATED: BUREAU ACTIVE");
                }
            }
        } else {
            // In a seat - press F to stand up
            if (user.isJustPressed("Interact")) {
                state.currentScene = "topdown";
                state.display.setOrigin(new Vector2(2040, 22));
                state.display.setSize(new Vector2(40, 24));
                state.topdownRenderNeeded = true;
                this.addLog(state, "SEAT VACATED");
            }
        }

        // 0. Power Toggle Logic
        const powerJustPressed = user.isJustPressed("PowerToggle");

        if (powerJustPressed) {
            state.isPowerOn = !state.isPowerOn;
            if (!state.isPowerOn) {
                this.addLog(state, "POWER: SYSTEM SHUTDOWN INITIATED");
                // If warping, emergency drop
                if (state.warpSequenceState !== "NORMAL") {
                    state.warpSequenceState = "STOPPING";
                    state.warpSequenceTimer = 2000; // Faster emergency stop
                }
            } else {
                this.addLog(state, "POWER: COLD BOOT SEQUENCE...");
                // Static layers are already rendered in initUser - no need to re-render
            }
        }

        // 1. Warp Sequence Logic (Keyboard toggle 'W')
        const warpJustPressed = user.isJustPressed("WarpToggle");

        if (state.isPowerOn && state.warpSequenceState === "NORMAL" && warpJustPressed && state.fuel > 0) {
            state.warpSequenceState = "STARTING";
            state.warpSequenceTimer = 5000; // 5 Seconds
            this.addLog(state, "WARP: INITIATING COIL CHARGE...");
        } else if (state.warpSequenceState === "WARPING" && warpJustPressed) {
            state.warpSequenceState = "STOPPING";
            state.warpSequenceTimer = 5000; // 5 Seconds
            this.addLog(state, "WARP: INITIATING DECELERATION...");
        }

        // Process Timer
        if (state.warpSequenceTimer > 0) {
            state.warpSequenceTimer -= deltaMs;
            if (state.warpSequenceTimer <= 0) {
                state.warpSequenceTimer = 0;
                if (state.warpSequenceState === "STARTING") {
                    state.warpSequenceState = "WARPING";
                    this.addLog(state, "WARP: SUPRALUMINAL VELOCITY ACHIEVED");
                } else if (state.warpSequenceState === "STOPPING") {
                    state.warpSequenceState = "NORMAL";
                    this.addLog(state, "WARP: DROPPED TO SUB-LIGHT SPEED");
                }
            }
        }

        // Apply Speeds based on state
        if (!state.isPowerOn) {
            state.targetSpeed = 0;
        } else if (state.warpSequenceState === "WARPING" || state.warpSequenceState === "STOPPING") {
            state.targetSpeed = 100;
        } else if (state.warpSequenceState === "STARTING" || state.warpSequenceState === "NORMAL") {
            state.targetSpeed = 5;
        }

        if (state.fuel <= 0) state.targetSpeed = 0;
        state.speed += (state.targetSpeed - state.speed) * 0.05;

        // Palette Control (Warp / Alarm Effect)
        // Alarm palette only applies in cockpit or bureau. Top-down always uses base palette.
        const inSeat = state.currentScene === "cockpit" || state.currentScene === "bureau";
        if (inSeat && (state.warpSequenceState === "WARPING" || state.warpSequenceState === "STOPPING")) {
            // Smooth sine wave pulsing across the 12 red alarm palettes
            const cycleTime = 1500; // ms per full cycle (slower, smoother)

            // Math.sin gives -1 to 1. Normalize to 0 to 1
            const sineWave = (Math.sin((now / cycleTime) * Math.PI * 2) + 1) / 2;

            // Map 0.0 - 1.0 range smoothly to palette slots 1 through 12
            const paletteIdx = 1 + Math.floor(sineWave * 11);

            state.display.switchPalette(paletteIdx);
        } else if (!state.isPowerOn) {
            state.display.switchPalette(13); // Dark palette (13) when power is off
        } else {
            state.display.switchPalette(0); // Restore normal palette
        }

        // Update Ship Systems
        if (!state.isPowerOn) {
            // Power is OFF: Systems cool down/depressurize slowly
            state.temperature += (280 - state.temperature) * 0.001; // Back to base 280K
            state.pressure += (0.01 - state.pressure) * 0.001; // Near vacuum
            // DO NOT return here - we still need to call render() for the blackout effect!
        } else if (state.warpSequenceState === "STARTING") {
            // Pre-heat and pressurize during charge
            state.fuel = Math.max(0, state.fuel - 0.1);
            state.temperature += (400 - state.temperature) * 0.005;
            state.pressure += (1.05 - state.pressure) * 0.005;

            // Log countdown milestone
            if (state.warpSequenceTimer < 2500 && state.warpSequenceTimer > 2400 && now - state.lastLogTime > 1000) {
                this.addLog(state, "WARP: COILS AT 50% - HARMONIZING...");
            }
        } else if (state.warpSequenceState === "WARPING" || state.warpSequenceState === "STOPPING") {
            state.fuel = Math.max(0, state.fuel - 0.4);
            state.temperature += (520 - state.temperature) * 0.01;
            state.pressure += (1.08 - state.pressure) * 0.01;
        } else {
            // Cruise: slow fuel drain, slow regeneration when below 80%
            const rechargeRate = state.fuel < 3200 ? 0.15 : 0; // Recharge below 80%
            state.fuel = Math.min(4000, Math.max(0, state.fuel - 0.02 + rechargeRate));
            state.temperature += (280 - state.temperature) * 0.01;
            state.pressure += (1.0 - state.pressure) * 0.005;
        }

        // Periodic Status Logs
        if (now - state.lastLogTime > 5000 && state.warpSequenceState === "NORMAL") {
            if (state.temperature > 400) this.addLog(state, "THERMAL: EXHAUSTING HEAT...");
            else if (state.fuel < 200) this.addLog(state, "RESOURCES: LOW FUEL ALERT");
            else this.addLog(state, "SYSTEMS: ALL GREEN");
        }

        // 2. Physics & Projection
        this.updateStars(state);

        // 3. Render
        this.render(state, user);
    }

    private addLog(state: StarshipData, msg: string): void {
        state.terminalLogs.push(msg);
        if (state.terminalLogs.length > 12) { // Increased max logs for larger terminal
            state.terminalLogs.shift();
        }
        state.lastLogTime = Date.now();
    }

    private updateStars(state: StarshipData): void {
        const centerX = state.width / 2;
        const centerY = state.height / 2;

        for (const star of state.stars) {
            // Move star towards camera
            star.z -= state.speed;

            // Wrap around if star passed camera
            if (star.z <= 0) {
                const newStar = this.createStar(state.width, state.height, true);
                star.x = newStar.x;
                star.y = newStar.y;
                star.z = newStar.z;
                star.px = -1;
                star.py = -1;
            }

            // Project 3D to 2D
            const sx = centerX + (star.x / star.z) * FOV;
            const sy = centerY + (star.y / star.z) * FOV;

            // Store previous position for warp trails
            if (star.px === -1) {
                star.px = sx;
                star.py = sy;
            }
        }
    }

    private render(state: StarshipData, user: User<StarshipData>): void {
        const { layer, uiLayer, width, height, stars, warpSequenceState } = state;

        if (state.currentScene === "cockpit") {
            // --- Layer 0: Space & Stars ---
            const orders: any[] = [];
            // Clear background
            orders.push(OrderBuilder.fill(" ", COLOR_SPACE, COLOR_SPACE));

            const isWarping = warpSequenceState === "WARPING" || warpSequenceState === "STOPPING";
            const dots = [];

            for (const star of stars) {
                const centerX = width / 2;
                const centerY = height / 2;

                const sx = Math.floor(centerX + (star.x / star.z) * FOV);
                const sy = Math.floor(centerY + (star.y / star.z) * FOV);

                if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                    // Base colour by depth
                    let color = COLOR_STAR_HI;
                    if (star.z > MAX_Z * 0.7) color = COLOR_STAR_LO;
                    else if (star.z > MAX_Z * 0.4) color = COLOR_STAR_MD;


                    if (isWarping && state.speed > 10) {
                        // Warp Trails using Line
                        const psx = Math.floor(star.px);
                        const psy = Math.floor(star.py);

                        if (psx >= 0 && psx < width && psy >= 0 && psy < height) {
                            orders.push(OrderBuilder.line(psx, psy, sx, sy, { charCode: "\u00b7", fgColor: color, bgColor: COLOR_SPACE }));
                        }
                    }

                    dots.push({ x: sx, y: sy, charCode: star.z < 200 ? "█" : star.z < 500 ? "▓" : "\u00b7", fgColorCode: color, bgColorCode: COLOR_SPACE });
                }

                // Save previous projection
                star.px = centerX + (star.x / star.z) * FOV;
                star.py = centerY + (star.y / star.z) * FOV;
            }

            if (dots.length > 0) {
                orders.push(OrderBuilder.dotCloudMulti(dots));
            }

            layer.setOrders(orders);


            // --- Layer 1: HUD ---
            const hudOrders = [];
            // ... (remaining HUD logic)

            // Target Reticle (Follows mouse/steering)
            const tx = Math.floor(width / 2);
            const ty = Math.floor(height / 2);
            hudOrders.push(OrderBuilder.text(tx - 2, ty, "[   ]", COLOR_HUD, TRANSPARENT));

            uiLayer.setOrders(hudOrders);

        }

        // --- Layer 4: Dynamic Instruments ---
        if (state.isPowerOn) {
            if (state.currentScene === "cockpit") {
                this.renderDynamicInstruments(state, user);
            } else {
                this.renderBureauDynamic(state, user);
            }
        } else {
            // Power is OFF: Clear both dynamic layers
            state.dynamicLayer.setOrders([]);

            state.bureauDynamicLayer.setOrders([]);

        }

        // --- Topdown Interior Rendering ---
        if (state.currentScene === "topdown" && state.topdownRenderNeeded) {
            this.renderTopDown(state);
            state.topdownRenderNeeded = false;
        }

        // --- Starfields Rendering (Always Dynamic) ---
        if (state.currentScene === "cockpit") {
            // Render Space stars (Cockpit)
            // ... (The star logic already has its own loop above)
        } else if (state.currentScene === "bureau") {
            this.renderParallaxStars(state, state.bureauStarsLayer);
        } else if (state.currentScene === "topdown") {
            this.renderParallaxStars(state, state.topdownStarsLayer);
        }
    }

    private renderTopDown(state: StarshipData): void {
        const { topdownLayer, width, height, playerX, playerY } = state;
        const o: any[] = [];

        // Start fully transparent so the star layer underneath shows through
        o.push(OrderBuilder.fill(" ", 255, 255));

        // Calculate center offset for the map
        const mapH = SHIP_MAP.length;
        const mapW = SHIP_MAP[0]?.length || 0;
        const offsetX = Math.floor((width - mapW) / 2);
        const offsetY = Math.floor((height - mapH) / 2);

        // Draw Map row by row, batching contiguous non-space runs into single text orders
        for (let y = 0; y < mapH; y++) {
            const row = SHIP_MAP[y];
            const screenY = offsetY + y;
            if (screenY < 0 || screenY >= height) continue;

            let runStart = -1;
            let runChars = "";

            const flushRun = () => {
                if (runStart >= 0 && runChars.length > 0) {
                    o.push(OrderBuilder.text(offsetX + runStart, screenY, runChars, COLOR_FRAME_HI, COLOR_FRAME_LO));
                }
                runStart = -1;
                runChars = "";
            };

            for (let x = 0; x < row.length; x++) {
                const char = row[x];

                if (char === " ") {
                    // Void - flush any pending run, leave transparent
                    flushRun();
                } else if (char === "#") {
                    // Wall character
                    flushRun();
                    o.push(OrderBuilder.text(offsetX + x, screenY, "█", COLOR_FRAME_HI, COLOR_FRAME_LO));
                } else if (char === "E") {
                    flushRun();
                    o.push(OrderBuilder.text(offsetX + x, screenY, "E", COLOR_HUD_ALT, COLOR_FRAME));
                } else if (char === "C" || char === "B") {
                    flushRun();
                    o.push(OrderBuilder.text(offsetX + x, screenY, "S", COLOR_STAR_HI, COLOR_FRAME_LO));
                } else if (char === ".") {
                    // Floor - batch into run
                    if (runStart < 0) runStart = x;
                    runChars += "·";
                }
            }
            flushRun();
        }

        // Player position
        o.push(OrderBuilder.text(playerX, playerY, "@", COLOR_STAR_HI, TRANSPARENT));

        // Interaction Hint
        const adj = [
            { x: playerX, y: playerY - 1 },
            { x: playerX, y: playerY + 1 },
            { x: playerX - 1, y: playerY },
            { x: playerX + 1, y: playerY },
            { x: playerX, y: playerY }
        ];

        let nearCockpit = false;
        let nearBureau = false;

        for (const pos of adj) {
            if (pos.y >= 0 && pos.y < SHIP_MAP.length && pos.x >= 0 && pos.x < SHIP_MAP[pos.y].length) {
                const char = SHIP_MAP[pos.y][pos.x];
                if (char === "C") nearCockpit = true;
                if (char === "B") nearBureau = true;
            }
        }

        if (nearCockpit) {
            o.push(OrderBuilder.text(width / 2 - 14, height - 6, "[PRESS 'F' TO SIT IN COCKPIT]", COLOR_HUD, COLOR_SPACE));
        } else if (nearBureau) {
            o.push(OrderBuilder.text(width / 2 - 14, height - 6, "[PRESS 'F' TO SIT AT BUREAU]", COLOR_HUD_ALT, COLOR_SPACE));
        }

        // Controls Help
        o.push(OrderBuilder.text(width / 2 - 12, height - 4, " USE WASD TO MOVE AROUND ", COLOR_FRAME_HI, COLOR_FRAME_LO));

        topdownLayer.setOrders(o);

    }

    private renderCockpit(state: StarshipData): void {
        const { cockpitLayer, width, height } = state;
        const frameData = new Array(width * height);

        const dashHeight = 22;
        const dashStart = height - dashHeight;
        const thickness = 6;
        const strutEndMirrorX = 18;
        const flare = 15;

        for (let y = 0; y < height; y++) {
            // Pre-calculate characteristic points for this row (Left side)
            let currentOuterX = -100;
            let currentFoldX = -100;
            let leftStrutX = -100;

            if (y < dashStart && y >= 3) {
                const progress = (y - 3) / (dashStart - 3);
                leftStrutX = Math.floor(progress * strutEndMirrorX);
            } else if (y >= dashStart) {
                const progress = (y - dashStart) / (dashHeight - 1);
                currentOuterX = Math.floor(strutEndMirrorX - progress * flare);
                currentFoldX = Math.floor((strutEndMirrorX + thickness - 1) - progress * flare);
            }

            for (let x = 0; x < width / 2; x++) {
                let charCode = 32; // " "
                let fgColor = TRANSPARENT;
                let bgColor = TRANSPARENT;

                // --- A. Top Bezel ---
                if (y < 3) {
                    bgColor = (y === 0) ? COLOR_FRAME_HI : (y === 2) ? COLOR_FRAME_LO : COLOR_FRAME;
                }
                // --- B. Slanted Struts ---
                else if (y < dashStart) {
                    if (x >= leftStrutX && x < leftStrutX + thickness) {
                        bgColor = (x === leftStrutX) ? COLOR_FRAME_HI : (x === leftStrutX + thickness - 1) ? COLOR_FRAME_LO : COLOR_FRAME;
                    }
                }
                // --- C. Dashboard ---
                else {
                    if (x >= currentOuterX) {
                        const isWing = x < currentFoldX;
                        if (x === currentFoldX) {
                            bgColor = COLOR_FRAME_HI; // Symmetric fold highlight
                        } else {
                            let color = COLOR_FRAME;
                            if (y === dashStart) color = COLOR_FRAME_LO;       // Top shadow
                            else if (y > dashStart + 1 && y < dashStart + 5) color = COLOR_FRAME_HI; // Light catch
                            else if (y > height - 4) color = COLOR_FRAME_LO;   // Bottom recession

                            if (isWing) color = (color === COLOR_FRAME_HI) ? COLOR_FRAME : COLOR_FRAME_LO;
                            bgColor = color;
                        }
                    }
                }

                const dot = { charCode, fgColorCode: fgColor, bgColorCode: bgColor };

                // Set Left Cell
                frameData[y * width + x] = dot;
                // Mirror to Right Cell
                frameData[y * width + (width - 1 - x)] = dot;
            }
        }

        cockpitLayer.setOrders([
            OrderBuilder.fullFrameMulti(frameData as any)
        ]);

    }

    private renderInstruments(state: StarshipData): void {
        const { instrumentsLayer, width, height } = state;
        const o: any[] = [];

        // Clear layer (Transparent)
        o.push(OrderBuilder.fill(" ", 255, 255));

        const dashStart = height - 22;
        const centerX = width / 2;

        // --- 1. CENTER CONSOLE (Scanner / Nav) ---
        const cw = 44;
        const cx = centerX - cw / 2;
        const cy = dashStart - 3; // Remonté de 2 blocs supplémentaires

        // Screen Background (Perfect fits Gris Medium part)
        for (let y = cy; y < height - 1; y++) {
            o.push(OrderBuilder.line(cx + 1, y, cx + cw - 1, y, { charCode: " ", bgColor: COLOR_FRAME_LO }));
        }
        // Frame
        o.push(OrderBuilder.line(cx, cy, cx + cw, cy, { charCode: "▀", fgColor: COLOR_FRAME })); // Top
        o.push(OrderBuilder.line(cx, height - 1, cx + cw, height - 1, { charCode: "▄", fgColor: COLOR_FRAME })); // Bottom
        o.push(OrderBuilder.line(cx, cy, cx, height - 1, { charCode: "▌", fgColor: COLOR_FRAME })); // Left
        o.push(OrderBuilder.line(cx + cw, cy, cx + cw, height - 1, { charCode: "▐", fgColor: COLOR_FRAME })); // Right
        o.push(OrderBuilder.text(cx + 2, cy, " SHIP STATUS TERMINAL ", COLOR_FRAME_HI, COLOR_FRAME_LO));

        // --- 2. LEFT PANEL: MINI-DASHBOARD ---
        const lw = 18;
        const lx = 18; // Décalé de 1 vers la droite
        const ly = dashStart + 6;

        // Frame for Dashboard
        o.push(OrderBuilder.line(lx, ly, lx + lw, ly, { charCode: "═", fgColor: COLOR_FRAME }));
        o.push(OrderBuilder.line(lx, ly + 9, lx + lw, ly + 9, { charCode: "═", fgColor: COLOR_FRAME }));
        o.push(OrderBuilder.text(lx + 2, ly, " SYSTEMS ", COLOR_STAR_MD, COLOR_FRAME_LO));

        // Internal labels
        o.push(OrderBuilder.text(lx + 1, ly + 2, "FUEL [", COLOR_FRAME_HI, COLOR_FRAME_LO));
        o.push(OrderBuilder.text(lx + 12, ly + 2, "]", COLOR_FRAME_HI, COLOR_FRAME_LO));
        o.push(OrderBuilder.text(lx + 1, ly + 4, "TEMP [", COLOR_FRAME_HI, COLOR_FRAME_LO));
        o.push(OrderBuilder.text(lx + 12, ly + 4, "]", COLOR_FRAME_HI, COLOR_FRAME_LO));
        o.push(OrderBuilder.text(lx + 1, ly + 7, "STATUS:", COLOR_FRAME_HI, COLOR_FRAME_LO));

        // --- 3. RIGHT PANEL: MODULE MATRIX ---
        const rw = 18;
        const rx = width - 18 - rw; // Décalé de 1 vers la gauche
        const ry = dashStart + 6;

        // Matrix Frame
        o.push(OrderBuilder.line(rx, ry, rx + rw, ry, { charCode: "═", fgColor: COLOR_FRAME }));
        o.push(OrderBuilder.line(rx, ry + 9, rx + rw, ry + 9, { charCode: "═", fgColor: COLOR_FRAME }));
        // Name removed as requested

        // Grid positions for buttons (3x2)
        const labels = ["WARP", "COM", "NAV", "O2", "RAD", "SHD"];
        for (let i = 0; i < 6; i++) {
            const bx = rx + 1 + (i % 3) * 6;
            const by = ry + 2 + Math.floor(i / 3) * 3;
            // Button shell
            o.push(OrderBuilder.text(bx, by, "[   ]", COLOR_FRAME, COLOR_FRAME_LO));
            o.push(OrderBuilder.text(bx + 1, by + 1, labels[i], COLOR_FRAME_HI, COLOR_FRAME_LO));
        }

        // --- 4. DECORATIVE PANEL LINES (Circuitry/Details) ---
        o.push(OrderBuilder.line(4, dashStart + 15, 10, dashStart + 15, { charCode: "─", fgColor: COLOR_FRAME_HI }));
        o.push(OrderBuilder.line(width - 11, dashStart + 15, width - 5, dashStart + 15, { charCode: "─", fgColor: COLOR_FRAME_HI }));
        instrumentsLayer.setOrders(o);

    }

    private renderDynamicInstruments(state: StarshipData, user: User<StarshipData>): void {
        const { dynamicLayer, width, height, terminalLogs, fuel, temperature, warpSequenceState, warpSequenceTimer, isPowerOn } = state;
        const o: any[] = [];

        // Clear layer (Transparent)
        o.push(OrderBuilder.fill(" ", 255, 255));

        const dashStart = height - 22;
        const centerX = width / 2;
        const cy = dashStart - 3;
        const cx = centerX - 22;

        if (!isPowerOn) {
            // Offline Display
            const isBlink = Date.now() % 1000 < 500;
            o.push(OrderBuilder.text(cx + 15, cy + 8, "POWER OFFLINE", isBlink ? COLOR_HUD_ALT : COLOR_STAR_LO, COLOR_FRAME_LO));

            // Render Module Matrix in "OFF" state
            const rx = width - 18 - 18;
            const ry = dashStart + 6;
            const labels = ["WARP", "COM", "NAV", "O2", "RAD", "SHD"];
            for (let i = 0; i < 6; i++) {
                const bx = rx + 1 + (i % 3) * 6;
                const by = ry + 2 + Math.floor(i / 3) * 3;
                o.push(OrderBuilder.text(bx + 2, by, "·", COLOR_FRAME, COLOR_FRAME_LO));
                o.push(OrderBuilder.text(bx + 1, by + 1, labels[i], COLOR_FRAME, COLOR_FRAME_LO));
            }

            dynamicLayer.setOrders(o);

            return;
        }

        // --- 1. SHIP COMMAND TERMINAL ---
        if (warpSequenceTimer > 0) {
            const timerStr = (warpSequenceTimer / 1000).toFixed(1) + "S";
            const label = warpSequenceState === "STARTING" ? "WARP_INIT: " : "WARP_DROP: ";
            o.push(OrderBuilder.text(cx + 1, cy + 3, label + timerStr, COLOR_HUD_ALT, COLOR_FRAME_LO));
        } else {
            o.push(OrderBuilder.text(cx + 1, cy + 3, "WARP_DRIVE: " + warpSequenceState, COLOR_HUD, COLOR_FRAME_LO));
        }

        const logDisplay = [...terminalLogs];
        const maxLines = 7; // Divisé par 2 cause espacement
        const start = Math.max(0, logDisplay.length - maxLines);
        for (let i = start; i < logDisplay.length; i++) {
            const rowIdx = (i - start) * 2; // Espacement x2
            const rowY = cy + 5 + rowIdx;
            if (rowY < height - 1) {
                o.push(OrderBuilder.text(cx + 1, rowY, ("  " + logDisplay[i]).substring(0, 42), i === logDisplay.length - 1 ? COLOR_STAR_HI : COLOR_STAR_MD, COLOR_FRAME_LO));
            }
        }

        // --- 2. MINI-DASHBOARD (Left) ---
        const lx = 18;
        const ly = dashStart + 6;

        // Fuel Percentage display
        const fP = fuel / 4000;
        const fPercent = Math.floor(fP * 100).toString().padStart(3, " ") + "%";
        o.push(OrderBuilder.text(lx + 7, ly + 2, fPercent, fP < 0.2 ? COLOR_HUD_ALT : COLOR_HUD, COLOR_FRAME_LO));

        // Temp Bar inside [ ] (5 slots)
        const tP = Math.min(1, (temperature - 200) / 320);
        const tFill = Math.floor(tP * 5);
        const tBar = "█".repeat(tFill).padEnd(5, " ");
        o.push(OrderBuilder.text(lx + 7, ly + 4, tBar, temperature > 420 ? COLOR_HUD_ALT : COLOR_STAR_HI, COLOR_FRAME_LO));

        // Status Blinker (only low fuel triggers hazard, not temperature)
        const isAlert = fuel < 600;
        const statusMsg = isAlert ? "!! HAZARD !!" : "NOMINAL";
        const statusColor = isAlert ? (Date.now() % 500 < 250 ? COLOR_HUD_ALT : COLOR_STAR_LO) : COLOR_HUD;
        o.push(OrderBuilder.text(lx + 8, ly + 7, statusMsg, statusColor, COLOR_FRAME_LO));

        // --- 3. MODULE MATRIX (Right) ---
        const rx = width - 18 - 18;
        const ry = dashStart + 6;

        const labels = ["WARP", "COM", "NAV", "O2", "RAD", "SHD"];
        const activeModules = [
            warpSequenceState !== "NORMAL",
            user.getButton("COM"),
            user.getButton("NAV"),
            true,  // O2 (Always on for life support)
            user.getButton("RAD"),
            user.getButton("SHD")
        ];

        for (let i = 0; i < 6; i++) {
            const bx = rx + 1 + (i % 3) * 6;
            const by = ry + 2 + Math.floor(i / 3) * 3;

            // LED Indicator above text (3 cells wide, background colored)
            const ledBgColor = activeModules[i] ? (i === 0 && warpSequenceState === "STARTING" ? COLOR_HUD_ALT : COLOR_HUD) : COLOR_FRAME_LO;
            o.push(OrderBuilder.text(bx + 1, by, "   ", COLOR_FRAME, ledBgColor));

            // Base Label (always visible, no highlight)
            o.push(OrderBuilder.text(bx + 1, by + 1, labels[i], COLOR_FRAME_HI, COLOR_FRAME_LO));
        }

        dynamicLayer.setOrders(o);

    }

    // ==================== PARALLAX STARS (Bureau + Top-down scenes) ====================

    /** Renders horizontal parallax stars on a given layer using dotCloudMulti. */
    private renderParallaxStars(state: StarshipData, targetLayer: Layer): void {
        const { bureauStars, width, height, speed, warpSequenceState } = state;
        const o: any[] = [];

        // Background
        o.push(OrderBuilder.fill(" ", COLOR_SPACE, COLOR_SPACE));

        const isWarping = warpSequenceState === "WARPING" || warpSequenceState === "STOPPING";
        const dots = [];

        // Update and draw horizontal stars
        for (const star of bureauStars) {
            // Slower moving stars for the top-down/bureau view
            const speedFactor = state.isPowerOn ? Math.max(0.1, (speed / 10)) : 0;
            star.x -= star.speed * speedFactor;

            if (star.x < 0) {
                star.x = width;
                star.y = Math.floor(Math.random() * height);
            } else if (star.x > width) { // In case speed is somehow negative
                star.x = 0;
                star.y = Math.floor(Math.random() * height);
            }

            const color = star.brightness === 0 ? COLOR_STAR_LO : star.brightness === 1 ? COLOR_STAR_MD : COLOR_STAR_HI;
            const sx = Math.floor(star.x);

            // Warp trails (horizontal lines)
            if (isWarping && speed > 10) {
                const trailLength = Math.min(Math.floor(star.speed * 3), width - sx); // draw rightwards trails
                const endX = Math.min(width - 1, sx + trailLength);
                if (endX > sx) {
                    o.push(OrderBuilder.line(sx, star.y, endX, star.y, { charCode: "─", fgColor: color, bgColor: COLOR_SPACE }));
                }
            }

            // Accumulate star point
            dots.push({ x: sx, y: star.y, charCode: "·", fgColorCode: color, bgColorCode: COLOR_SPACE });
        }

        if (dots.length > 0) {
            o.push(OrderBuilder.dotCloudMulti(dots));
        }

        targetLayer.setOrders(o);

    }

    // ==================== BUREAU SCENE (Static Structure) ====================

    /** Renders the bureau room walls, porthole frame, and shelf. Called once in initUser. */
    private renderBureauStructure(state: StarshipData): void {
        const { bureauStructureLayer, width, height } = state;
        const o: any[] = [];

        // Clear with transparent
        o.push(OrderBuilder.fill(" ", 255, 255));

        // Frame thickness
        const frameTop = 3;
        const frameSide = 6;
        const frameBottom = Math.floor(height / 3) - 2; // Enlarged by 2 lines down
        const cornerRadius = 4;

        // Porthole area (inside the frame)
        const portholeRight = width - frameSide;
        const portholeBottom = height - frameBottom;

        // Draw Frame segments using optimized Rectangles
        // TOP
        o.push(OrderBuilder.rect(0, 0, width, frameTop, " ", COLOR_FRAME, COLOR_FRAME, true));
        // LEFT
        o.push(OrderBuilder.rect(0, frameTop, frameSide, portholeBottom - frameTop, " ", COLOR_FRAME, COLOR_FRAME, true));
        // RIGHT
        o.push(OrderBuilder.rect(portholeRight, frameTop, width - portholeRight, portholeBottom - frameTop, " ", COLOR_FRAME, COLOR_FRAME, true));

        // BOTTOM wall + Shadow area
        const tableBottom = portholeBottom + 2 + 8;
        o.push(OrderBuilder.rect(0, portholeBottom, width, tableBottom - portholeBottom, " ", COLOR_FRAME, COLOR_FRAME, true));
        o.push(OrderBuilder.rect(0, tableBottom, width, height - tableBottom, " ", COLOR_FRAME_LO, COLOR_FRAME_LO, true));

        // Rounded corners on porthole opening (Still small loops, but limited area)
        for (let i = 0; i < cornerRadius; i++) {
            for (let j = 0; j < cornerRadius - i; j++) {
                o.push(OrderBuilder.text(frameSide + j, frameTop + i, " ", COLOR_FRAME, COLOR_FRAME));
                o.push(OrderBuilder.text(portholeRight - 1 - j, frameTop + i, " ", COLOR_FRAME, COLOR_FRAME));
                o.push(OrderBuilder.text(frameSide + j, portholeBottom - 1 - i, " ", COLOR_FRAME, COLOR_FRAME));
                o.push(OrderBuilder.text(portholeRight - 1 - j, portholeBottom - 1 - i, " ", COLOR_FRAME, COLOR_FRAME));
            }
        }

        // --- Realistic Contours (Bevels) ---
        // Top edge of opening (Shadow)
        o.push(OrderBuilder.line(frameSide + cornerRadius, frameTop, portholeRight - cornerRadius, frameTop, { charCode: "▄", fgColor: COLOR_FRAME_LO }));
        // Bottom edge of opening (Highlight)
        o.push(OrderBuilder.line(frameSide + cornerRadius, portholeBottom - 1, portholeRight - cornerRadius, portholeBottom - 1, { charCode: "▀", fgColor: COLOR_FRAME_HI }));

        // Left edge of opening (Shadow)
        for (let y = frameTop + cornerRadius; y < portholeBottom - cornerRadius; y++) {
            o.push(OrderBuilder.text(frameSide, y, "▐", COLOR_FRAME_LO, COLOR_FRAME));
        }
        // Right edge of opening (Highlight)
        for (let y = frameTop + cornerRadius; y < portholeBottom - cornerRadius; y++) {
            o.push(OrderBuilder.text(portholeRight - 1, y, "▌", COLOR_FRAME_HI, COLOR_FRAME));
        }

        // --- Secondary Panel (Shelf) ---
        const rectY = portholeBottom + 2;
        const rectHeight = 8;
        if (rectY < height) {
            o.push(OrderBuilder.rect(0, rectY, width, Math.min(rectHeight, height - rectY), " ", COLOR_FRAME_HI, COLOR_FRAME_HI, true));
            o.push(OrderBuilder.line(0, rectY, width, rectY, { charCode: "▄", fgColor: COLOR_FRAME_HI })); // Top highlight
            const bottomLineY = Math.min(height - 1, rectY + rectHeight - 1);
            o.push(OrderBuilder.line(0, bottomLineY, width, bottomLineY, { charCode: "▀", fgColor: COLOR_FRAME_LO })); // Bottom shadow
        }

        bureauStructureLayer.setOrders(o);

    }

    /** Renders the two monitor frames and their static labels. Called once in initUser. */
    private renderBureauInstruments(state: StarshipData): void {
        const { bureauInstrumentsLayer, width } = state;
        const o: any[] = [];

        // Clear with transparent
        o.push(OrderBuilder.fill(" ", 255, 255));

        // --- Monitor 1 (Left Portrait) ---
        const mw = 32;
        const mh = 46; // 50 - 4
        const mx1 = 2;
        const my1 = 6;  // 4 + 2

        // Short Arm for Monitor 1
        o.push(OrderBuilder.line(0, my1 + 20, mx1, my1 + 20, { charCode: "═", fgColor: COLOR_FRAME_LO }));
        o.push(OrderBuilder.line(0, my1 + 22, mx1, my1 + 22, { charCode: "═", fgColor: COLOR_FRAME_LO }));

        // Monitor 1 Shadow
        for (let y = my1 + 1; y < my1 + mh + 1; y++) {
            o.push(OrderBuilder.text(mx1 + 1, y, " ".repeat(mw), COLOR_FRAME_LO, COLOR_FRAME_LO));
        }
        // Monitor 1 Background
        for (let y = my1; y < my1 + mh; y++) {
            o.push(OrderBuilder.text(mx1, y, " ".repeat(mw), COLOR_FRAME, COLOR_FRAME_LO));
        }
        // Monitor 1 Shadow & Background
        o.push(OrderBuilder.rect(mx1 + 1, my1 + 1, mw, mh, " ", COLOR_FRAME_LO, COLOR_FRAME_LO, true));
        o.push(OrderBuilder.rect(mx1, my1, mw, mh, " ", COLOR_FRAME, COLOR_FRAME_LO, true));
        // Monitor 1 Full Frame (Style Cockpit)
        o.push(OrderBuilder.line(mx1, my1, mx1 + mw - 1, my1, { charCode: "▀", fgColor: COLOR_FRAME })); // Top
        o.push(OrderBuilder.line(mx1, my1 + mh - 1, mx1 + mw - 1, my1 + mh - 1, { charCode: "▄", fgColor: COLOR_FRAME })); // Bottom
        o.push(OrderBuilder.line(mx1, my1, mx1, my1 + mh - 1, { charCode: "▌", fgColor: COLOR_FRAME })); // Left
        o.push(OrderBuilder.line(mx1 + mw - 1, my1, mx1 + mw - 1, my1 + mh - 1, { charCode: "▐", fgColor: COLOR_FRAME })); // Right

        o.push(OrderBuilder.text(mx1 + 4, my1, " L-TERM ", COLOR_STAR_MD, COLOR_FRAME));

        // --- Monitor 2 (Right Portrait) ---
        const mx2 = width - 2 - mw;
        const my2 = 6;

        // Short Arm for Monitor 2
        o.push(OrderBuilder.line(width, my2 + 20, mx2 + mw, my2 + 20, { charCode: "═", fgColor: COLOR_FRAME_LO }));
        o.push(OrderBuilder.line(width, my2 + 22, mx2 + mw, my2 + 22, { charCode: "═", fgColor: COLOR_FRAME_LO }));

        // Monitor 2 Shadow & Background
        o.push(OrderBuilder.rect(mx2 + 1, my2 + 1, mw, mh, " ", COLOR_FRAME_LO, COLOR_FRAME_LO, true));
        o.push(OrderBuilder.rect(mx2, my2, mw, mh, " ", COLOR_FRAME, COLOR_FRAME_LO, true));

        // Monitor 2 Full Frame (Style Cockpit)
        o.push(OrderBuilder.line(mx2, my2, mx2 + mw - 1, my2, { charCode: "▀", fgColor: COLOR_FRAME })); // Top
        o.push(OrderBuilder.line(mx2, my2 + mh - 1, mx2 + mw - 1, my2 + mh - 1, { charCode: "▄", fgColor: COLOR_FRAME })); // Bottom
        o.push(OrderBuilder.line(mx2, my2, mx2, my2 + mh - 1, { charCode: "▌", fgColor: COLOR_FRAME })); // Left
        o.push(OrderBuilder.line(mx2 + mw - 1, my2, mx2 + mw - 1, my2 + mh - 1, { charCode: "▐", fgColor: COLOR_FRAME })); // Right

        o.push(OrderBuilder.text(mx2 + 4, my2, " R-TERM ", COLOR_STAR_MD, COLOR_FRAME));

        // --- Static Labels for Dashboards ---
        const ix2 = mx2 + 2;
        const iy2 = my2 + 3;
        o.push(OrderBuilder.text(ix2, iy2, "MODULE MATRIX", COLOR_FRAME_HI, 255));
        const labels = ["WARP", "COM", "NAV", "O2", "RAD", "SHD"];
        for (let i = 0; i < 6; i++) {
            const bx = ix2 + (i % 2) * 14;
            const by = iy2 + 3 + Math.floor(i / 2) * 5;
            o.push(OrderBuilder.text(bx, by, "[ " + labels[i].padEnd(4, " ") + " ]", COLOR_FRAME_HI, 255));
        }
        o.push(OrderBuilder.text(ix2, iy2 + 18, "WARP TELEMETRY", COLOR_FRAME_HI, 255));
        // o.push(OrderBuilder.text(ix2, iy2 + 26, "DATA STREAM >", COLOR_FRAME_LO, 255));

        bureauInstrumentsLayer.setOrders(o);

    }

    /** Renders dynamic bureau data: fuel bar, temperature, module LEDs, telemetry. Called every frame. */
    private renderBureauDynamic(state: StarshipData, user: User<StarshipData>): void {
        const { bureauDynamicLayer, width, fuel, temperature, warpSequenceState, warpSequenceTimer, isPowerOn } = state;
        const o: any[] = [];

        // Clear with transparent
        o.push(OrderBuilder.fill(" ", 255, 255));

        if (!isPowerOn) {
            bureauDynamicLayer.setOrders(o);

            return;
        }

        // --- Layout Constants (Matching Static Frames) ---
        const mw = 32;
        const mh = 46;
        const mx1 = 2; // Left Terminal
        const my1 = 6;
        const mx2 = width - 2 - mw; // Right Terminal
        const my2 = 6;

        // Colors
        const flashColor = Date.now() % 500 < 250 ? COLOR_HUD_ALT : COLOR_STAR_HI;

        // --- MONITOR 1 (LEFT): FUEL & THERMAL ---
        const ix1 = mx1 + 2; // Marginal gap from left frame
        const iy1 = my1 + 2; // Marginal gap from top frame

        // Vertical Fuel Bar (Refined Spacing) - Optimized with Rectangles
        const fuelPercent = fuel / 4000;
        const totalHeight = mh - 4; // 1 block gap top and bottom
        const fuelHeight = Math.floor(fuelPercent * totalHeight);
        const barStartX = ix1;
        const barStartY = my1 + 2;

        // Draw background (empty part)
        o.push(OrderBuilder.rect(barStartX, barStartY, 2, totalHeight - fuelHeight, "█", 0, 0, true));
        // Draw filled part
        if (fuelHeight > 0) {
            const levelY = barStartY + (totalHeight - fuelHeight);
            const barColor = fuelPercent < 0.2 ? COLOR_HUD_ALT : COLOR_HUD;
            o.push(OrderBuilder.rect(barStartX, levelY, 2, fuelHeight, "█", barColor, barColor, true));
        }

        // Labels repositioned with more air
        o.push(OrderBuilder.text(ix1 + 3, iy1, "FUEL", COLOR_FRAME_HI, 255));
        o.push(OrderBuilder.text(ix1 + 3, iy1 + 2, Math.floor(fuelPercent * 100) + "%", fuelPercent < 0.2 ? flashColor : COLOR_HUD, 255));

        // Temperature Gauge (Horizontal) - Optimized with Line/Rectangle
        o.push(OrderBuilder.text(ix1 + 4, iy1 + 5, "CORE TEMP", COLOR_FRAME_HI, 255));
        const tempP = Math.min(1, (temperature - 200) / 320);
        const tempFill = Math.floor(tempP * 20);
        const tempColor = temperature > 420 ? COLOR_HUD_ALT : COLOR_STAR_HI;

        // Background track (░)
        o.push(OrderBuilder.text(ix1 + 4, iy1 + 7, "░".repeat(20), COLOR_STAR_HI, 255));
        // Filled segment
        if (tempFill > 0) {
            o.push(OrderBuilder.line(ix1 + 4, iy1 + 7, ix1 + 4 + tempFill - 1, iy1 + 7, { charCode: "█", fgColor: tempColor }));
        }
        o.push(OrderBuilder.text(ix1 + 4, iy1 + 9, Math.floor(temperature) + " K", COLOR_STAR_HI, 255));

        // Status Message
        // if (fuel < 600 || temperature > 450) {
        //     o.push(OrderBuilder.text(ix1 + 6, iy1 + 20, "!! HAZARD !!", flashColor, 255));
        // } else {
        //     o.push(OrderBuilder.text(ix1 + 6, iy1 + 20, "SYSTEM OK", COLOR_HUD, 255));
        // }

        // --- MONITOR 2 (RIGHT): MODULES & TELEMETRY ---
        const ix2 = mx2 + 2;
        const iy2 = my2 + 3;

        // Module dynamic lights (LEDs)
        const activeModules = [
            warpSequenceState !== "NORMAL",
            user.getButton("COM"),
            user.getButton("NAV"),
            true,
            user.getButton("RAD"),
            user.getButton("SHD")
        ];

        for (let i = 0; i < 6; i++) {
            const bx = ix2 + (i % 2) * 14;
            const by = iy2 + 3 + Math.floor(i / 2) * 5;
            const ledColor = activeModules[i] ? (i === 0 && warpSequenceState === "STARTING" ? COLOR_HUD_ALT : COLOR_HUD) : COLOR_FRAME_LO;
            o.push(OrderBuilder.text(bx - 1, by + 1, "  " + (activeModules[i] ? "------" : ""), ledColor, 255));
        }

        // Warp Telemetry (Dynamic)
        o.push(OrderBuilder.text(ix2, iy2 + 20, "STATUS: " + warpSequenceState, COLOR_HUD, 255));
        if (warpSequenceTimer > 0) {
            const timerStr = (warpSequenceTimer / 1000).toFixed(2) + " SEC";
            o.push(OrderBuilder.text(ix2, iy2 + 22, "T-MINUS: " + timerStr, COLOR_HUD_ALT, 255));
        }

        // Fake Data Stream (Dynamic)
        for (let i = 0; i < 5; i++) {
            const seed = (Math.floor(Date.now() / 100) + i) % 100;
            const hex = seed.toString(16).toUpperCase().padStart(2, "0");
            const bits = (seed % 2).toString() + (seed % 4 > 1 ? "1" : "0") + (seed % 8 > 3 ? "1" : "0");
            o.push(OrderBuilder.text(ix2, iy2 + 28 + i, `0x${hex} [${bits}] CH-0${i}`, COLOR_FRAME_LO, 255));
        }

        bureauDynamicLayer.setOrders(o);

    }

    update(_runtime: IRuntime, _engine: Engine): void { }
}
```

---

## File: applications/showcase-05-radar/index.ts

```typescript
import { Engine, User, Layer, Display, Vector2, OrderBuilder, ScalingMode, type IApplication, type IRuntime } from "@primitiv/engine";

/**
 * Name: showcase-05-radar
 * Category: showcase
 * Description: An atmospheric tactical radar simulation demonstrating advanced layer
 *   compositing, geometry-based drawing orders, and sweeping update logic.
 *
 * Architecture:
 *   - Layer 0 (Static): Rendered ONCE when the user joins. Heavy geometry (grids,
 *     rings, UI borders) is drawn using `.circle()`, `.line()`, and `.fill()`.
 *   - Layer 1 (Dynamic): Rendered continually using unreliable packets. Contains
 *     the sweeping analog beam trail and the tactical target echoes.
 *
 * Key Primitiv Concepts demonstrated:
 *   - Static vs Dynamic layer separation for extreme bandwidth efficiency.
 *   - Software Alpha Blending: Querying the static background color (`getStaticBgCode`)
 *     to adjust the beam's color intensity as it sweeps over different grids.
 *   - "Sample & Hold" Logic: Targets technically move at 60Hz in the background, but
 *     their visual UI echoes only update when the radar beam sweeps over them.
 *   - Phosphor decay: Using `dotCloudMultiColor` to simulate fading analog signals.
 */

/**
 * Interface representing a tactical radar target.
 */
interface Target {
    realX: number;     // Precise simulation position (background)
    realY: number;
    vx: number;        // Precise simulation velocity
    vy: number;
    detX: number;      // Snapshot "Detected" position (visual only)
    detY: number;
    detVx: number;     // Snapshot "Detected" velocity (visual only)
    detVy: number;
    id: string;        // Tactical identifier (e.g. "AF-123")
    type: "air" | "unknown";
    brightness: number; // 0.0 to 1.0 (Phosphor persistence value)
}

/**
 * Application state shared across users or handled per-user.
 */
interface RadarData {
    bgLayer: Layer;    // Static background (Grid, Rings)
    fgLayer: Layer;    // Dynamic foreground (Sweep, Targets)
    sweepAngle: number;
    targets: Target[];
}

const RADAR_SIZE = 96; // Internal pixel dimensions
const UI_WIDTH = 44;
const WIDTH = RADAR_SIZE + UI_WIDTH;
const HEIGHT = 90;
const TICK_RATE = 20; // 20 updates per second for a cinematic feel
const RADAR_OFFSET_X = UI_WIDTH;

/**
 * Tactical symbols using raw strings for high readability.
 * These map to the corresponding CP437 glyphs in the Primitiv engine.
 */
const SYMBOLS = {
    POINTER: "►",  // CP437: 16
    AIR: "▲",      // CP437: 30
    UNKNOWN: "+",  // CP437: 43
    DEGREE: "°",   // CP437: 248
    BLIP: "·",     // CP437: 250
};

export class PrimitivRadar implements IApplication<Engine, User<RadarData>> {

    /**
     * Called once when the application starts.
     * Use this to initialize the shared palette and global settings.
     */
    init(runtime: IRuntime, engine: Engine): void {
        const palette = [];

        // 0: Master background color (Deep black-green)
        palette.push({ colorId: 0, r: 2, g: 12, b: 12 });

        // 1-8: Cyan gradient ramp for trailing effects (Phosphor decay)
        for (let i = 0; i < 8; i++) {
            const f = (i + 1) / 8;
            palette.push({
                colorId: 1 + i,
                r: Math.floor(0 * f),
                g: Math.floor(100 * f + 20),
                b: Math.floor(100 * f + 25)
            });
        }

        // 10: Bright cyan (Active beam front)
        palette.push({ colorId: 10, r: 100, g: 255, b: 255 });
        // 11: Mid-tone cyan (Static UI elements)
        palette.push({ colorId: 11, r: 0, g: 120, b: 130 });
        // 12: Very dim cyan (Background radar grid - Darkened for better contrast)
        palette.push({ colorId: 12, r: 0, g: 20, b: 25 });
        // 13: Moderate cyan (Outer calibration ring - Toned down from bright color 10)
        palette.push({ colorId: 13, r: 0, g: 180, b: 200 });

        // 20-21: Target highlight colors (Active vs Dim)
        palette.push({ colorId: 20, r: 180, g: 255, b: 255 });
        palette.push({ colorId: 21, r: 0, g: 180, b: 190 });

        // 31-38: Standard Blend range (Used for dark grid lines)
        for (let i = 0; i < 8; i++) {
            const f = (i + 1) / 8;
            palette.push({
                colorId: 31 + i,
                r: 0, // Removed red to avoid grayish tint
                g: Math.floor(200 * f + 30),
                b: Math.floor(200 * f + 30)
            });
        }

        // 51-58: High-Intensity Blend range (Used for bright outer ring and axes)
        // This ensures bright elements "pop" more vividly when the beam passes.
        for (let i = 0; i < 8; i++) {
            const f = (i + 1) / 8;
            palette.push({
                colorId: 51 + i,
                r: 0, // Removed red to avoid grayish/brownish tint
                g: Math.floor(240 * f + 15),
                b: Math.floor(255 * f)
            });
        }

        // 40-42: Dedicated UI palette for the sidebar
        palette.push({ colorId: 40, r: 0, g: 60, b: 70 });  // UI Background
        palette.push({ colorId: 41, r: 0, g: 140, b: 150 }); // UI Normal Text
        palette.push({ colorId: 42, r: 180, g: 255, b: 255 }); // UI Highlight

        engine.loadPaletteToSlot(0, palette);
        runtime.setTickRate(TICK_RATE);
    }

    /**
     * Called when a new user joins the application.
     * Defines the rendering layers and the virtual display.
     */
    initUser(_runtime: IRuntime, _engine: Engine, user: User<RadarData>): void {
        // Primitiv uses multiple stacked layers.
        // Static layer: name "radarStatic", index 0 (Background)
        const bgLayer = new Layer(new Vector2(0, 0), 0, WIDTH, HEIGHT, { mustBeReliable: true, name: "radarStatic" });
        // Dynamic layer: index 1 (Top). Using unreliable packets for smoother updates.
        const fgLayer = new Layer(new Vector2(0, 0), 1, WIDTH, HEIGHT, { mustBeReliable: false, name: "radarDynamic" });

        user.addLayer(bgLayer);
        user.addLayer(fgLayer);

        // A Display maps a resolution to the terminal.
        // ScalingMode.Half doubling the character size for high legibility.
        const display = new Display(0, WIDTH, HEIGHT);
        user.addDisplay(display);
        display.switchPalette(0);
        display.setScalingMode(ScalingMode.None);

        // Apply CRT shader effects (Scanlines, Phosphor glow)
        display.setAmbientEffect({ blur: 20, scale: 1.2 });
        display.setPostProcess({
            scanlines: { enabled: true, opacity: 0.3, pattern: "horizontal" }
        });

        // Initialize procedural targets for the simulation
        // The simulation runs at full "real" resolution, while rendering uses snapshots.
        const targets: Target[] = [];
        const types: ("air" | "unknown")[] = ["air", "unknown"];
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * (RADAR_SIZE / 2 - 10);
            const tx = RADAR_SIZE / 2 + Math.cos(angle) * dist;
            const ty = HEIGHT / 2 + Math.sin(angle) * dist;

            targets.push({
                realX: tx, realY: ty,
                vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.1,
                detX: tx, detY: ty,
                detVx: 0, detVy: 0,
                id: `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(100 + Math.random() * 900)}`,
                type: types[Math.floor(Math.random() * types.length)],
                brightness: 0
            });
        }

        user.data = {
            bgLayer,
            fgLayer,
            sweepAngle: 0,
            targets
        };

        // Pre-render the static background once
        this.renderStaticBackground(user.data);
    }

    /**
     * Determines the static background color for a given pixel.
     * This logic defines the radar grid, rings, and UI panel structure.
     */
    private getStaticBgCode(x: number, y: number): number {
        // 1. Sidebar Panel (Left)
        if (x < RADAR_OFFSET_X) {
            if (y === 5 || y === 135) return 40; // Decorations
            if (x === RADAR_OFFSET_X - 1) return 11; // Separator Line
            return 0; // Black background for UI
        }

        // 2. Radar Grid (Right)
        const rx = x - RADAR_OFFSET_X;
        const centerX = RADAR_SIZE / 2;
        const centerY = HEIGHT / 2;
        const dx = rx - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxRadius = RADAR_SIZE / 2 - 5;

        // Outer Ring - Calibration ticks every 10 degrees
        if (Math.abs(dist - maxRadius) < 1.0) {
            const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
            const degree = (angle / (Math.PI * 2)) * 360;
            return degree % 10 < 1.5 ? 10 : 13;
        }

        if (dist >= maxRadius) return 0; // Outside radar circle

        // Internal Grid Lines (Crosshairs & Concentric Circles)
        if (Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5) return 11;
        const ringStep = maxRadius / 4;
        for (let i = 1; i <= 4; i++) {
            if (Math.abs(dist - ringStep * i) < 0.6) return 11;
        }

        // Faint underlying reticle grid
        if (rx % 10 === 0 || y % 6 === 0) return 12;

        return 0; // Base background
    }

    /**
     * Renders the static background layer.
     * 
     * RATIONALE: Static elements like the grid and panels are drawn once using
     * high-level geometric orders (Rect, Circle, Line). This delegates the
     * "drawing" logic to the Primitiv engine, minimizing the initial payload
     * sent to joining clients compared to sending a full pixel buffer.
     */
    private renderStaticBackground(state: RadarData): void {
        const bgOrders: any[] = [];
        const centerX = RADAR_OFFSET_X + RADAR_SIZE / 2;
        const centerY = HEIGHT / 2;
        const maxRadius = RADAR_SIZE / 2 - 5;

        // Primitiv Order Choice: .fill()
        // Best for establishing an opaque base color for a layer efficiently.
        bgOrders.push(OrderBuilder.fill(" ", 0, 0));

        // Primitiv Order Choice: .line()
        // Vector-based line drawing: the network cost is the same regardless 
        // of line length, unlike sending individual pixel clusters.
        for (let x = RADAR_OFFSET_X; x < WIDTH; x += 10) {
            bgOrders.push(OrderBuilder.line(x, 0, x, HEIGHT - 1, { charCode: " ", bgColor: 12 }));
        }
        for (let y = 0; y < HEIGHT; y += 6) {
            bgOrders.push(OrderBuilder.line(RADAR_OFFSET_X, y, WIDTH - 1, y, { charCode: " ", bgColor: 12 }));
        }

        bgOrders.push(OrderBuilder.line(RADAR_OFFSET_X, centerY, WIDTH - 1, centerY, { charCode: " ", bgColor: 11 }));
        bgOrders.push(OrderBuilder.line(centerX, 0, centerX, HEIGHT - 1, { charCode: " ", bgColor: 11 }));

        // Primitiv Order Choice: .circle()
        // Vector-based circle: extremely lightweight network payload that
        // scales by the number of circles, not the pixels they occupy.
        const ringStep = maxRadius / 4;
        for (let i = 1; i < 4; i++) {
            bgOrders.push(OrderBuilder.circle(centerX, centerY, Math.floor(ringStep * i), {
                charCode: " ",
                bgColor: 11,
                filled: false
            }));
        }

        // Toned-down Outer Ring
        bgOrders.push(OrderBuilder.circle(centerX, centerY, Math.floor(maxRadius), {
            charCode: " ",
            bgColor: 13,
            filled: false
        }));

        bgOrders.push(OrderBuilder.line(RADAR_OFFSET_X - 1, 0, RADAR_OFFSET_X - 1, HEIGHT - 1, { charCode: " ", bgColor: 11 }));

        // Primitiv Order Choice: .text()
        // Sending localized strings is vastly superior to per-pixel dot clouds for UI labels.
        bgOrders.push(OrderBuilder.text(5, 4, "TRACKING", 42, 0));

        state.bgLayer.setOrders(bgOrders);

    }

    update(_runtime: IRuntime, _engine: Engine): void { }

    /**
     * Main simulation loop. Handles sweep rotation, target physics, 
     * and the "Sample & Hold" radar detection logic.
     */
    updateUser(_runtime: IRuntime, _engine: Engine, user: User<RadarData>): void {
        const state = user.data;
        if (!state) return;

        const prevAngle = state.sweepAngle;
        state.sweepAngle = (state.sweepAngle + (1 / _runtime.getTickRate()) * 0.5) % (Math.PI * 2);

        const centerX = RADAR_SIZE / 2;
        const centerY = HEIGHT / 2;
        const maxRadius = RADAR_SIZE / 2 - 5;

        for (const target of state.targets) {
            // physics simulation (Independent of sweep frequency)
            target.realX += target.vx;
            target.realY += target.vy;

            // Bounce targets at radar boundaries
            const ddx = target.realX - centerX;
            const ddy = target.realY - centerY;
            const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
            if (ddist > maxRadius) {
                target.vx *= -1;
                target.vy *= -1;
            }

            // --- RADAR DETECTION (SAMPLE AND HOLD) ---
            // Visual updates only happen when the beam sweeps over the target.
            const tdx = target.realX - centerX;
            const tdy = (target.realY - centerY); // Aspect is 1.0 now
            const dist = Math.sqrt(tdx * tdx + tdy * tdy);

            if (dist < maxRadius) {
                const targetAngle = (Math.atan2(tdy, tdx) + Math.PI * 2) % (Math.PI * 2);
                if (this.isAngleBetween(targetAngle, prevAngle, state.sweepAngle)) {
                    // Detect: snapshot the real telemetry into the visual "det" variables.
                    target.detX = target.realX;
                    target.detY = target.realY;
                    target.detVx = target.vx;
                    target.detVy = target.vy;
                    target.brightness = 1.0; // Recharge phosphor intensity
                }
            }
            // Phosphor decay over time (analog fading)
            target.brightness = Math.max(0, target.brightness - (1 / _runtime.getTickRate()) * 0.06);
        }

        this.render(state);
    }

    /**
     * Utility to check if an angle lies within a start/end range, mapping correctly across 0/2PI.
     */
    private isAngleBetween(angle: number, start: number, end: number): boolean {
        if (start < end) return angle >= start && angle <= end;
        return angle >= start || angle <= end;
    }

    /**
     * Renders the dynamic foreground layer.
     * Uses dotCloudMultiColor to only send active pixels, optimizing bandwidth.
     */
    /**
     * Renders the dynamic foreground layer.
     * Delegates to modular sub-methods for sidebar, sweep, and targets.
     */
    private render(state: RadarData): void {
        const fgOrders: any[] = [];
        const fgDots: any[] = [];
        const time = Date.now() / 1000;
        const jitter = Math.sin(time * 50) * 0.005; // Simulate analog beam jitter
        const sweepAngle = (state.sweepAngle + jitter + Math.PI * 2) % (Math.PI * 2);

        // 1. Sidebar (Text-based UI)
        this.renderTacticalSidebar(state, fgOrders);

        // 2. Radar Sweep (Pixel-based trail and dithering)
        this.renderRadarSweep(state, sweepAngle, fgDots);

        // 3. Target Echoes (Symbols, Vectors, Labels)
        this.renderTargetEchoes(state, fgDots);

        // Combine and commit
        fgOrders.push(OrderBuilder.dotCloudMulti(fgDots));
        state.fgLayer.setOrders(fgOrders);

    }

    /**
     * Renders the left tactical list using native text orders.
     */
    private renderTacticalSidebar(state: RadarData, orders: any[]): void {
        const centerX = RADAR_SIZE / 2;
        const centerY = HEIGHT / 2;

        const sortedTargets = [...state.targets].sort((a, b) => {
            const da = Math.sqrt(Math.pow(a.detX - centerX, 2) + Math.pow(a.detY - centerY, 2));
            const db = Math.sqrt(Math.pow(b.detX - centerX, 2) + Math.pow(b.detY - centerY, 2));
            return da - db;
        });

        for (let i = 0; i < sortedTargets.length; i++) {
            const t = sortedTargets[i];
            const ty = 8 + i * 4;
            if (ty >= HEIGHT - 4) break;

            const isFlashing = t.brightness > 0.3;
            const uiFg = isFlashing ? 42 : 41;
            const uiBg = isFlashing ? 40 : 0;

            const dx = t.detX - centerX;
            const dy = t.detY - centerY;
            const range = Math.floor(Math.sqrt(dx * dx + dy * dy));
            const bearing = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) * 57.29);

            const idLine = `${t.id} [${t.type[0].toUpperCase()}] R:${range.toString().padStart(3)}`;
            orders.push(OrderBuilder.text(4, ty, idLine, uiFg, uiBg));

            const rdx = Math.floor(dx);
            const rdy = Math.floor(dy);
            const dataLine = `B:${bearing.toString().padStart(3)}${SYMBOLS.DEGREE} X:${rdx.toString().padStart(3)} Y:${rdy.toString().padStart(3)}`;
            orders.push(OrderBuilder.text(6, ty + 1, dataLine, 11, uiBg));

            if (isFlashing) {
                orders.push(OrderBuilder.text(2, ty, SYMBOLS.POINTER, 42, 0));
            }
        }
    }

    /**
     * Renders the dithered radar sweep trail.
     * Uses O(Pixels) iteration over the radar field.
     */
    private renderRadarSweep(_state: RadarData, sweepAngle: number, dots: any[]): void {
        const centerX = RADAR_SIZE / 2;
        const centerY = HEIGHT / 2;
        const maxRadius = RADAR_SIZE / 2 - 5;

        for (let y = 0; y < HEIGHT; y++) {
            for (let x = RADAR_OFFSET_X; x < WIDTH; x++) {
                const rx = x - RADAR_OFFSET_X;
                const dx = rx - centerX;
                const dy = y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < maxRadius) {
                    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
                    const angleDiff = (sweepAngle - angle + Math.PI * 2) % (Math.PI * 2);

                    const trailLen = 0.5 + Math.random() * 0.3;
                    if (angleDiff < trailLen) {
                        const noise = (Math.random() - 0.5) * 0.15;
                        const intensity = Math.max(0, Math.min(1, (1.0 - (angleDiff / trailLen)) + noise));

                        let color = 0;
                        if (angleDiff < 0.05) {
                            color = 10;
                        } else {
                            const threshold = Math.pow(Math.random(), 0.5);
                            if (intensity < threshold * 0.3 && angleDiff > 0.4) continue;

                            const underlyingBg = this.getStaticBgCode(x, y);
                            if (underlyingBg === 11 || underlyingBg === 13) {
                                color = Math.floor(intensity * 7) + 51;
                            } else if (underlyingBg === 12) {
                                color = Math.floor(intensity * 7) + 31;
                            } else {
                                color = Math.floor(intensity * 7) + 1;
                            }
                        }
                        dots.push({ posX: x, posY: y, charCode: " ", fgColorCode: 255, bgColorCode: color });
                    }
                }
            }
        }
    }

    /**
     * Renders target icons, velocity vectors, and persistent ID labels.
     * Optimized O(Targets) iteration, replacing the nested pixel loop.
     */
    private renderTargetEchoes(state: RadarData, dots: any[]): void {
        for (const target of state.targets) {
            if (target.brightness <= 0) continue;

            const tx = Math.floor(target.detX) + RADAR_OFFSET_X;
            const ty = Math.floor(target.detY);
            // Use stable brightness for logic state to prevent flickering
            const b = target.brightness;

            // 1. Target Icon (Centered)
            let char: string | number = SYMBOLS.BLIP;
            let fg = 11;
            let bg = 1;

            if (b > 0.7) {
                // Apply subtle dithering only to the highlight color (20 vs 21)
                bg = (b > 0.9 && Math.random() > 0.3) ? 20 : 21;
                fg = 0;
                char = target.type === "air" ? SYMBOLS.AIR : SYMBOLS.UNKNOWN;
            } else if (b > 0.3) {
                char = target.type === "air" ? SYMBOLS.AIR : SYMBOLS.UNKNOWN;
            }

            // Draw icon cluster (approx 1.2 radius)
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (Math.sqrt(dx * dx + dy * dy) < 1.2) {
                        dots.push({ posX: tx + dx, posY: ty + dy, charCode: char, fgColorCode: fg, bgColorCode: bg });
                    }
                }
            }

            // 2. Velocity Vector
            if (b > 0.3) {
                const vectorLen = 6;
                const vx = target.detVx * 30;
                const vy = target.detVy * 30;
                for (let i = 1; i <= vectorLen; i++) {
                    const vpx = Math.round(target.detX + RADAR_OFFSET_X + vx * (i / vectorLen));
                    const vpy = Math.round(target.detY + vy * (i / vectorLen));
                    dots.push({
                        posX: vpx,
                        posY: vpy,
                        charCode: SYMBOLS.BLIP,
                        fgColorCode: b > 0.7 ? 0 : 11,
                        bgColorCode: b > 0.7 ? 21 : 1
                    });
                }
            }

            // 3. ID Data Block
            if (b > 0.3) {
                for (let i = 0; i < target.id.length; i++) {
                    const isGhost = b <= 0.7;
                    dots.push({
                        posX: tx + 2 + i,
                        posY: ty + 1,
                        charCode: target.id[i],
                        fgColorCode: isGhost ? 11 : 0,
                        bgColorCode: isGhost ? 1 : 21
                    });
                }
            }
        }
    }
}
```

---

## File: applications/showcase-06-fluid/index.ts

```typescript
/**
 * Name: showcase-06-fluid
 * Category: showcase
 * Description: Fully autonomous 2D fluid simulation using Jos Stam's Stable Fluids
 *   algorithm (GDC 2003). Five orbital dye sources continuously stir a
 *   divergence-free velocity field with hue-cycling RGB color, producing
 *   aurora-like nebula patterns that shift aperiodically forever.
 *   Three Lissajous chaos probes drift through the field on incommensurate
 *   paths and fire pulsed force bursts, breaking symmetry without any
 *   user input.
 *
 * Architecture:
 *   - Layer 0 (fluid): 120×67 subFrameMulti pixel buffer, mustBeReliable:false.
 *     The entire dye field is rasterized into a pre-allocated frame buffer and
 *     pushed as a single binary order every tick.
 *   - Layer 1 (ui): Minimal title text, mustBeReliable:true. Drawn once on
 *     connect, never modified again.
 *   Each connected user gets an independent FluidSim instance in user.data,
 *   so multi-user deployments run separate simulations per player.
 *
 * Fluid Algorithm (Jos Stam, stable fluids):
 *   The solver operates on a padded (W+2)×(H+2) array. Each step:
 *     1. Integrate external forces into velocity (uPrev/vPrev → u/v).
 *     2. Diffuse velocity via Gauss-Seidel (ITER passes).
 *     3. Project to divergence-free field (pressure solve + gradient subtraction).
 *     4. Semi-Lagrangian self-advection of velocity (unconditionally stable).
 *     5. Project again.
 *     6. Repeat steps 1-4 for each dye channel (R, G, B) using the final velocity.
 *     7. Apply per-tick dissipation to velocity and dye to keep the sim bounded.
 *
 * Visual Design:
 *   - Palette slot 0: 216-entry 6×6×6 RGB cube.
 *       colorId = ri*36 + gi*6 + bi,  component value = index * 51.
 *   - Each cell uses one of four CP437 block characters (░ ▒ ▓ █) as a
 *     luminance level, with fgColor = quantized dye color, bgColor = black.
 *     This simulates sub-palette glow :  a 216-color × 4-level ≈ 864-state
 *     effective color depth gives smooth luminance falloff at dye boundaries.
 *   - Five orbital sources with incommensurate angular speeds (0.035, 0.028,
 *     0.045, 0.038, 0.060 rad/tick) ensure the pattern never repeats.
 *   - CRT scanlines + ambient blur give a retro phosphor monitor aesthetic.
 *
 * Key Primitiv Concepts demonstrated:
 *   - subFrameMulti for high-frequency full-screen pixel buffer updates.
 *   - 216-color palette cube: maximum RGB fidelity within the 255-slot palette.
 *   - Per-user fluid state: each user owns an independent FluidSim.
 *   - Lissajous chaos probes as autonomous perturbators (no user input).
 *   - CRT post-processing: setAmbientEffect() + setPostProcess().
 *   - Frame-buffer pre-allocation: reusing Array<{charCode,fg,bg}> with in-place
 *     mutation each tick avoids GC pressure from 9 000 object allocations/s.
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

// ─── Display / grid dimensions ────────────────────────────────────────────────
const W = 120;
const H = 67;
const CX = W / 2;
const CY = H / 2;

// ─── Simulation parameters ───────────────────────────────────────────────────
const TICK_RATE = 30;
const DT = 0.2; // Fluid time-step per engine tick
const VISC = 0.000003; // Kinematic viscosity (low → turbulent swirls)
const DIFF = 0.0000008; // Dye diffusion (very low → vivid, sharp colours)
const ITER = 6; // Gauss-Seidel iterations per diffuse/project step

/** Per-tick multiplier applied to velocity after each step. */
const VEL_DISS = 0.994;
/** Per-tick multiplier applied to dye after each step. */
const DYE_DISS = 0.994; // ~17%/sec at 30 TPS - slower fade keeps field filled

// ─── Rendering parameters ────────────────────────────────────────────────────
/**
 * Linear brightness scale applied to raw dye values before colour mapping.
 * Raise to amplify dim areas; lower to avoid over-saturation near sources.
 */
const BRIGHTNESS = 5.5;

/**
 * Gamma exponent applied to luminance after the linear scale.
 * Lower values (< 1.0) lift the mid-tones so dim trailing dye registers
 * as ░/▒ rather than disappearing into black.  Keeps cores from blowing
 * out because the raw dye there is already close to 1 after BRIGHTNESS.
 */
const GAMMA = 1.2;

// ─── Palette helpers ─────────────────────────────────────────────────────────

/** Clamp and floor a [0,1] value to a 6-level step (0–5). */
function q6(v: number): number {
  return Math.min(5, Math.max(0, Math.floor(v * 6)));
}

/** Map (r,g,b) ∈ [0,1] to the 6×6×6 RGB cube colorId. */
function rgb2id(r: number, g: number, b: number): number {
  return q6(r) * 36 + q6(g) * 6 + q6(b);
}

/**
 * HSL → RGB.  h in radians [0, 2π], s/l in [0,1].
 * Returns [r, g, b] each in [0,1].
 */
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  const hd = ((((h * 180) / Math.PI) % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + hd / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)];
}

// ─── Fluid Simulation ────────────────────────────────────────────────────────

/**
 * Jos Stam Stable Fluids solver for a W×H rectangular grid with a 1-cell
 * padding border (grid arrays are (W+2)×(H+2)).
 */
class FluidSim {
  readonly W: number;
  readonly H: number;
  readonly N: number; // total padded array length

  // Velocity fields (swapped in-place during diffuse / advect steps)
  u: Float32Array;
  uPrev: Float32Array;
  v: Float32Array;
  vPrev: Float32Array;

  // Dye channels (R / G / B), each advected independently
  dR: Float32Array;
  dRPrev: Float32Array;
  dG: Float32Array;
  dGPrev: Float32Array;
  dB: Float32Array;
  dBPrev: Float32Array;

  // Scratch buffers for the pressure projection step
  readonly p: Float32Array;
  readonly div: Float32Array;

  constructor(w: number, h: number) {
    this.W = w;
    this.H = h;
    this.N = (w + 2) * (h + 2);
    const mk = (): Float32Array => new Float32Array(this.N);
    this.u = mk();
    this.uPrev = mk();
    this.v = mk();
    this.vPrev = mk();
    this.dR = mk();
    this.dRPrev = mk();
    this.dG = mk();
    this.dGPrev = mk();
    this.dB = mk();
    this.dBPrev = mk();
    this.p = mk();
    this.div = mk();
  }

  /** Flat index for the padded grid at column x, row y (1-based interior). */
  ix(x: number, y: number): number {
    return y * (this.W + 2) + x;
  }

  // ── Boundary conditions ─────────────────────────────────────────────────
  // b=0: scalar (dye),  b=1: u-component,  b=2: v-component
  private setBnd(b: number, x: Float32Array): void {
    const { W, H } = this;
    for (let i = 1; i <= W; i++) {
      x[this.ix(i, 0)] = b === 2 ? -x[this.ix(i, 1)] : x[this.ix(i, 1)];
      x[this.ix(i, H + 1)] = b === 2 ? -x[this.ix(i, H)] : x[this.ix(i, H)];
    }
    for (let j = 1; j <= H; j++) {
      x[this.ix(0, j)] = b === 1 ? -x[this.ix(1, j)] : x[this.ix(1, j)];
      x[this.ix(W + 1, j)] = b === 1 ? -x[this.ix(W, j)] : x[this.ix(W, j)];
    }
    x[this.ix(0, 0)] = 0.5 * (x[this.ix(1, 0)] + x[this.ix(0, 1)]);
    x[this.ix(0, H + 1)] = 0.5 * (x[this.ix(1, H + 1)] + x[this.ix(0, H)]);
    x[this.ix(W + 1, 0)] = 0.5 * (x[this.ix(W, 0)] + x[this.ix(W + 1, 1)]);
    x[this.ix(W + 1, H + 1)] =
      0.5 * (x[this.ix(W, H + 1)] + x[this.ix(W + 1, H)]);
  }

  // ── Gauss-Seidel linear solver ──────────────────────────────────────────
  private linsolve(
    b: number,
    x: Float32Array,
    x0: Float32Array,
    a: number,
    c: number,
  ): void {
    const inv = 1.0 / c;
    for (let k = 0; k < ITER; k++) {
      for (let j = 1; j <= this.H; j++) {
        for (let i = 1; i <= this.W; i++) {
          x[this.ix(i, j)] =
            (x0[this.ix(i, j)] +
              a *
                (x[this.ix(i - 1, j)] +
                  x[this.ix(i + 1, j)] +
                  x[this.ix(i, j - 1)] +
                  x[this.ix(i, j + 1)])) *
            inv;
        }
      }
      this.setBnd(b, x);
    }
  }

  // ── Diffusion step ──────────────────────────────────────────────────────
  private diffuse(
    b: number,
    x: Float32Array,
    x0: Float32Array,
    diff: number,
    dt: number,
  ): void {
    const a = dt * diff * this.W * this.H;
    this.linsolve(b, x, x0, a, 1 + 4 * a);
  }

  // ── Helmholtz projection (make velocity divergence-free) ────────────────
  private project(u: Float32Array, v: Float32Array): void {
    const { W, H } = this;
    const h = 1.0 / Math.sqrt(W * H);
    for (let j = 1; j <= H; j++) {
      for (let i = 1; i <= W; i++) {
        this.div[this.ix(i, j)] =
          -0.5 *
          h *
          (u[this.ix(i + 1, j)] -
            u[this.ix(i - 1, j)] +
            v[this.ix(i, j + 1)] -
            v[this.ix(i, j - 1)]);
        this.p[this.ix(i, j)] = 0;
      }
    }
    this.setBnd(0, this.div);
    this.setBnd(0, this.p);
    this.linsolve(0, this.p, this.div, 1, 4);
    for (let j = 1; j <= H; j++) {
      for (let i = 1; i <= W; i++) {
        u[this.ix(i, j)] -=
          (0.5 * (this.p[this.ix(i + 1, j)] - this.p[this.ix(i - 1, j)])) / h;
        v[this.ix(i, j)] -=
          (0.5 * (this.p[this.ix(i, j + 1)] - this.p[this.ix(i, j - 1)])) / h;
      }
    }
    this.setBnd(1, u);
    this.setBnd(2, v);
  }

  // ── Semi-Lagrangian advection ────────────────────────────────────────────
  private advect(
    b: number,
    d: Float32Array,
    d0: Float32Array,
    u: Float32Array,
    v: Float32Array,
    dt: number,
  ): void {
    const { W, H } = this;
    const dt0 = dt * Math.sqrt(W * H);
    for (let j = 1; j <= H; j++) {
      for (let i = 1; i <= W; i++) {
        let x = i - dt0 * u[this.ix(i, j)];
        let y = j - dt0 * v[this.ix(i, j)];
        x = Math.max(0.5, Math.min(W + 0.5, x));
        y = Math.max(0.5, Math.min(H + 0.5, y));
        const i0 = Math.floor(x),
          i1 = i0 + 1;
        const j0 = Math.floor(y),
          j1 = j0 + 1;
        const s1 = x - i0,
          s0 = 1 - s1;
        const t1 = y - j0,
          t0 = 1 - t1;
        d[this.ix(i, j)] =
          s0 * (t0 * d0[this.ix(i0, j0)] + t1 * d0[this.ix(i0, j1)]) +
          s1 * (t0 * d0[this.ix(i1, j0)] + t1 * d0[this.ix(i1, j1)]);
      }
    }
    this.setBnd(b, d);
  }

  // ── Full simulation step ─────────────────────────────────────────────────
  step(dt: number): void {
    let t: Float32Array;

    // ── Velocity ─────────────────────────────────────────────────────────
    for (let i = 0; i < this.N; i++) {
      this.u[i] += dt * this.uPrev[i];
      this.v[i] += dt * this.vPrev[i];
    }
    // Diffuse
    t = this.u;
    this.u = this.uPrev;
    this.uPrev = t;
    t = this.v;
    this.v = this.vPrev;
    this.vPrev = t;
    this.diffuse(1, this.u, this.uPrev, VISC, dt);
    this.diffuse(2, this.v, this.vPrev, VISC, dt);
    this.project(this.u, this.v);
    // Advect
    t = this.u;
    this.u = this.uPrev;
    this.uPrev = t;
    t = this.v;
    this.v = this.vPrev;
    this.vPrev = t;
    this.advect(1, this.u, this.uPrev, this.uPrev, this.vPrev, dt);
    this.advect(2, this.v, this.vPrev, this.uPrev, this.vPrev, dt);
    this.project(this.u, this.v);

    // ── Dye (R, G, B) ────────────────────────────────────────────────────
    for (let i = 0; i < this.N; i++) {
      this.dR[i] += dt * this.dRPrev[i];
      this.dG[i] += dt * this.dGPrev[i];
      this.dB[i] += dt * this.dBPrev[i];
    }
    // Diffuse
    t = this.dR;
    this.dR = this.dRPrev;
    this.dRPrev = t;
    t = this.dG;
    this.dG = this.dGPrev;
    this.dGPrev = t;
    t = this.dB;
    this.dB = this.dBPrev;
    this.dBPrev = t;
    this.diffuse(0, this.dR, this.dRPrev, DIFF, dt);
    this.diffuse(0, this.dG, this.dGPrev, DIFF, dt);
    this.diffuse(0, this.dB, this.dBPrev, DIFF, dt);
    // Advect
    t = this.dR;
    this.dR = this.dRPrev;
    this.dRPrev = t;
    t = this.dG;
    this.dG = this.dGPrev;
    this.dGPrev = t;
    t = this.dB;
    this.dB = this.dBPrev;
    this.dBPrev = t;
    this.advect(0, this.dR, this.dRPrev, this.u, this.v, dt);
    this.advect(0, this.dG, this.dGPrev, this.u, this.v, dt);
    this.advect(0, this.dB, this.dBPrev, this.u, this.v, dt);

    // ── Dissipation (keeps the sim bounded) ──────────────────────────────
    for (let i = 0; i < this.N; i++) {
      this.u[i] *= VEL_DISS;
      this.v[i] *= VEL_DISS;
      this.dR[i] *= DYE_DISS;
      this.dG[i] *= DYE_DISS;
      this.dB[i] *= DYE_DISS;
    }

    // ── Clear source buffers ──────────────────────────────────────────────
    this.uPrev.fill(0);
    this.vPrev.fill(0);
    this.dRPrev.fill(0);
    this.dGPrev.fill(0);
    this.dBPrev.fill(0);
  }

  // ── External force injection (writes into *Prev for the next step) ────────

  /**
   * Inject a velocity impulse at (cx, cy) with a radial falloff brush.
   */
  addForce(
    cx: number,
    cy: number,
    fx: number,
    fy: number,
    radius: number,
  ): void {
    const icx = Math.round(cx),
      icy = Math.round(cy),
      r = Math.ceil(radius);
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const ni = icx + di,
          nj = icy + dj;
        if (ni < 1 || ni > this.W || nj < 1 || nj > this.H) continue;
        const dist = Math.sqrt(di * di + dj * dj);
        if (dist > radius) continue;
        const w = 1 - dist / radius;
        const idx = this.ix(ni, nj);
        this.uPrev[idx] += fx * w;
        this.vPrev[idx] += fy * w;
      }
    }
  }

  /**
   * Inject dye at (cx, cy) with a radial falloff brush.
   * r/g/b are normalised [0,1] colour components; amount is the peak density.
   */
  addDye(
    cx: number,
    cy: number,
    r: number,
    g: number,
    b: number,
    radius: number,
    amount: number,
  ): void {
    const icx = Math.round(cx),
      icy = Math.round(cy),
      rad = Math.ceil(radius);
    for (let dj = -rad; dj <= rad; dj++) {
      for (let di = -rad; di <= rad; di++) {
        const ni = icx + di,
          nj = icy + dj;
        if (ni < 1 || ni > this.W || nj < 1 || nj > this.H) continue;
        const dist = Math.sqrt(di * di + dj * dj);
        if (dist > radius) continue;
        const w = (1 - dist / radius) * amount;
        const idx = this.ix(ni, nj);
        this.dRPrev[idx] += r * w;
        this.dGPrev[idx] += g * w;
        this.dBPrev[idx] += b * w;
      }
    }
  }
}

// ─── Orbital dye sources ──────────────────────────────────────────────────────

interface OrbSource {
  angle: number; // Current orbital angle (radians)
  speed: number; // dAngle per tick (radians). Negative = clockwise orbit.
  radius: number; // Orbital radius in grid cells from the centre
  hueOff: number; // Per-source phase offset for the global hue sweep
  force: number; // Tangential velocity magnitude injected each tick.
  // Positive = CCW tangent, negative = CW tangent.
  dyeAmt: number; // Dye density injected each tick
  brush: number; // Injection brush radius (cells)
}

/**
 * Five sources with incommensurate angular speeds.
 * The LCM of 35, 28, 45, 38, 60 is enormous, so the pattern never repeats.
 */
const SOURCES_TEMPLATE: ReadonlyArray<OrbSource> = [
  {
    angle: 0,
    speed: 0.035,
    radius: 22,
    hueOff: 0,
    force: 0.7,
    dyeAmt: 0.3,
    brush: 4,
  },
  {
    angle: (Math.PI * 2) / 5,
    speed: -0.028,
    radius: 15,
    hueOff: (Math.PI * 2) / 5,
    force: -0.7,
    dyeAmt: 0.3,
    brush: 3.5,
  },
  {
    angle: (Math.PI * 4) / 5,
    speed: 0.045,
    radius: 28,
    hueOff: (Math.PI * 4) / 5,
    force: 1.2,
    dyeAmt: 0.3,
    brush: 5,
  },
  {
    angle: (Math.PI * 6) / 5,
    speed: -0.038,
    radius: 11,
    hueOff: (Math.PI * 6) / 5,
    force: -0.9,
    dyeAmt: 0.3,
    brush: 3,
  },
  {
    angle: (Math.PI * 8) / 5,
    speed: 0.06,
    radius: 32,
    hueOff: (Math.PI * 8) / 5,
    force: 1.4,
    dyeAmt: 0.3,
    brush: 6,
  },
];

// ─── Autonomous chaos probes (Lissajous perturbators) ────────────────────────

/**
 * A probe that traces a Lissajous curve and periodically fires force bursts.
 *
 * Position at time t:
 *   px = CX + ampX * cos(freqX * t + phaseX)
 *   py = CY + ampY * sin(freqY * t)
 *
 * The instantaneous velocity is the derivative:
 *   dvx = -ampX * freqX * sin(freqX * t + phaseX)
 *   dvy =  ampY * freqY * cos(freqY * t)
 *
 * Force injection is gated by a pulse envelope |sin(pulseFreq * t)|^2 so
 * the probe fires discrete bursts rather than a continuous stream.
 */
interface ChaosProbe {
  ampX: number; // Lissajous half-amplitude on X (cells)
  ampY: number; // Lissajous half-amplitude on Y (cells)
  freqX: number; // Angular frequency on X (rad / DT-unit)
  freqY: number; // Angular frequency on Y (rad / DT-unit)
  phaseX: number; // Phase offset on X
  forceScale: number; // Peak force magnitude (multiplies normalised velocity)
  pulseFreq: number; // Burst frequency (rad / DT-unit)
  hueOff: number; // Dye hue phase offset
  brush: number; // Force / dye injection brush radius
  dyeAmt: number; // Peak dye amount per burst
}

/**
 * Three probes with fully incommensurate Lissajous frequencies.
 * None of these share a rational ratio with each other or with the orbital
 * source speeds, so the combined pattern never closes or repeats.
 */
const CHAOS_PROBES_TEMPLATE: ReadonlyArray<ChaosProbe> = [
  // Large figure-8, slow pulse - main large-scale mixer
  {
    ampX: 40,
    ampY: 28,
    freqX: 0.031,
    freqY: 0.043,
    phaseX: 0,
    forceScale: 1.6,
    pulseFreq: 0.071,
    hueOff: Math.PI * 0.7,
    brush: 7,
    dyeAmt: 0.12,
  },
  // Tight ellipse near centre, fast pulse - breaks core symmetry
  {
    ampX: 14,
    ampY: 18,
    freqX: 0.053,
    freqY: 0.037,
    phaseX: Math.PI / 3,
    forceScale: 1.1,
    pulseFreq: 0.113,
    hueOff: Math.PI * 1.3,
    brush: 5,
    dyeAmt: 0.1,
  },
  // Wide diagonal sweep, asymmetric pulse - long-range cross-mixing
  {
    ampX: 52,
    ampY: 22,
    freqX: 0.019,
    freqY: 0.067,
    phaseX: Math.PI * 0.8,
    forceScale: 2.0,
    pulseFreq: 0.09,
    hueOff: Math.PI * 1.9,
    brush: 9,
    dyeAmt: 0.15,
  },
];

// ─── Per-user application state ─────────────────────────────────────────────

interface FluidData {
  sim: FluidSim;
  fluidLayer: Layer;
  time: number;
  sources: OrbSource[];
  chaosProbes: ChaosProbe[];
  /** Pre-allocated pixel buffer (reused every tick, no per-frame GC). */
  frame: Array<{ charCode: string; fgColorCode: number; bgColorCode: number }>;
}

// ─── Application ─────────────────────────────────────────────────────────────

export class FluidShowcase implements IApplication<Engine, User<FluidData>> {
  async init(_runtime: IRuntime, engine: Engine): Promise<void> {
    // Build the 216-entry 6×6×6 RGB cube and load it into palette slot 0.
    //   colorId = ri*36 + gi*6 + bi   (ri, gi, bi ∈ 0..5)
    //   R,G,B   = component * 51       (steps: 0, 51, 102, 153, 204, 255)
    //   colorId 0   = (0,  0,  0) - black (background)
    //   colorId 215 = (255,255,255) - white
    const pal: Array<{ colorId: number; r: number; g: number; b: number }> = [];
    for (let ri = 0; ri < 6; ri++) {
      for (let gi = 0; gi < 6; gi++) {
        for (let bi = 0; bi < 6; bi++) {
          pal.push({
            colorId: ri * 36 + gi * 6 + bi,
            r: ri * 51,
            g: gi * 51,
            b: bi * 51,
          });
        }
      }
    }
    engine.loadPaletteToSlot(0, pal);
    _runtime.setTickRate(TICK_RATE);
  }

  initUser(_runtime: IRuntime, _engine: Engine, user: User<FluidData>): void {
    // ── Display ──────────────────────────────────────────────────────────
    const display = new Display(0, W, H);
    user.addDisplay(display);
    display.setScalingMode(ScalingMode.Quarter);
    display.switchPalette(0);
    display.setOrigin(new Vector2(0, 0));
    // Soft phosphor bloom + subtle CRT scanlines
    display.setAmbientEffect({ blur: 22, scale: 1.6 });
    display.setPostProcess({
      scanlines: { enabled: true, opacity: 0.1, pattern: "horizontal" },
    });

    // ── Layers ────────────────────────────────────────────────────────────
    const fluidLayer = new Layer(new Vector2(0, 0), 0, W, H, {
      mustBeReliable: false,
      name: "fluid",
    });
    user.addLayer(fluidLayer, "fluid");

    // ── Pre-allocate the frame buffer ─────────────────────────────────────
    // Reused every tick with in-place mutation → zero per-tick allocations.
    const frame: FluidData["frame"] = new Array(W * H)
      .fill(null)
      .map(() => ({ charCode: " ", fgColorCode: 0, bgColorCode: 0 }));

    // ── Initialise user data ──────────────────────────────────────────────
    user.data.sim = new FluidSim(W, H);
    user.data.fluidLayer = fluidLayer;
    user.data.time = 0;
    user.data.sources = SOURCES_TEMPLATE.map((s) => ({ ...s }));
    user.data.chaosProbes = CHAOS_PROBES_TEMPLATE.map((p) => ({ ...p }));
    user.data.frame = frame;
  }

  updateUser(_runtime: IRuntime, _engine: Engine, user: User<FluidData>): void {
    const { sim, sources, frame } = user.data;
    user.data.time += DT;
    const t = user.data.time;
    // ── 1. Orbital source injection ───────────────────────────────────────
    for (const src of sources) {
      const px = CX + Math.cos(src.angle) * src.radius;
      const py = CY + Math.sin(src.angle) * src.radius;

      // Tangential velocity: perpendicular to the radial vector.
      //   sign(force) determines orbit handedness (CW / CCW).
      const tvx = -Math.sin(src.angle) * src.force;
      const tvy = Math.cos(src.angle) * src.force;
      sim.addForce(px, py, tvx, tvy, src.brush);

      // Hue cycles continuously; each source has a fixed phase offset so
      // they paint different colours at the same time.
      const hue = t * 0.22 + src.hueOff;
      const [r, g, b] = hsl2rgb(hue, 1.0, 0.5);
      sim.addDye(px, py, r, g, b, src.brush, src.dyeAmt);

      // Advance orbital position
      src.angle += src.speed * DT;
    }

    // ── 2. Autonomous Lissajous chaos probes ─────────────────────────────
    // Each probe traces its Lissajous curve; its instantaneous velocity
    // (analytical derivative of the parametric equations) defines the
    // force direction.  A pulse envelope |sin(pulseFreq*t)|^2 gates the
    // injection so the probe fires discrete bursts rather than a
    // continuous stream - creating pockets of turbulence at irregular
    // intervals that naturally break the orbital symmetry.
    for (const probe of user.data.chaosProbes) {
      const px = CX + probe.ampX * Math.cos(probe.freqX * t + probe.phaseX);
      const py = CY + probe.ampY * Math.sin(probe.freqY * t);

      // Analytical velocity (derivative of position w.r.t. t)
      const vx =
        -probe.ampX * probe.freqX * Math.sin(probe.freqX * t + probe.phaseX);
      const vy = probe.ampY * probe.freqY * Math.cos(probe.freqY * t);
      const speed = Math.sqrt(vx * vx + vy * vy) || 1;

      // Pulse envelope: smooth bursts with a floor so probes never go fully dark
      const pulse =
        0.2 + 0.8 * Math.pow(Math.abs(Math.sin(probe.pulseFreq * t)), 2);

      sim.addForce(
        px,
        py,
        (vx / speed) * probe.forceScale * pulse,
        (vy / speed) * probe.forceScale * pulse,
        probe.brush,
      );
      if (pulse > 0.05) {
        const [pr, pg, pb] = hsl2rgb(t * 0.18 + probe.hueOff, 1.0, 0.48);
        sim.addDye(px, py, pr, pg, pb, probe.brush, probe.dyeAmt * pulse);
      }
    }

    // ── 3. Advance the simulation ─────────────────────────────────────────
    sim.step(DT);

    // ── 4. Rasterise dye field → frame buffer ─────────────────────────────
    //
    // For every interior cell (1..W, 1..H):
    //   • Scale raw dye by BRIGHTNESS, clamp to [0,1].
    //   • Use the max channel as "luminance" (preserves colour saturation at
    //     bright edges rather than blending towards white).
    //   • Map luminance to one of seven CP437 glyphs ordered by visual weight:
    //       "."  (CP437  46) - single 1-px dot,   extreme wisps / star-dust
    //       "·"  (CP437 250) - middle dot,         faint cloud edges
    //       "░"  (CP437 176) - light shade  25%,   dim glow halo
    //       "▒"  (CP437 177) - medium shade 50%,   mid-density body
    //       "▓"  (CP437 178) - dark shade   75%,   bright inner region
    //       "█"  (CP437 219) - full block  100%,   injection cores only
    //     Using more CP437 levels (vs 4 previously) makes the luminance
    //     gradient quasi-continuous: trailing dye fades through dot → dust →
    //     haze → glow instead of jumping abruptly from black to ░.
    //
    for (let j = 1; j <= H; j++) {
      for (let i = 1; i <= W; i++) {
        const fi = (j - 1) * W + (i - 1); // frame buffer index
        const si = sim.ix(i, j); // padded sim array index
        const r = Math.min(1, Math.max(0, sim.dR[si] * BRIGHTNESS));
        const g = Math.min(1, Math.max(0, sim.dG[si] * BRIGHTNESS));
        const b = Math.min(1, Math.max(0, sim.dB[si] * BRIGHTNESS));
        const lum = Math.pow(Math.max(r, g, b), GAMMA); // gamma-corrected lum

        const cell = frame[fi];
        if (lum < 0.005) {
          // Black / empty
          cell.charCode = " ";
          cell.fgColorCode = 0;
          cell.bgColorCode = 0;
        } else {
          cell.fgColorCode = rgb2id(r, g, b);
          cell.bgColorCode = 0;
          // prettier-ignore
          if      (lum > 0.78) cell.charCode = "█"; // full block   - cores only
          else if (lum > 0.52) cell.charCode = "▓"; // dark shade   75%
          else if (lum > 0.28) cell.charCode = "▒"; // medium shade 50%
          else if (lum > 0.10) cell.charCode = "░"; // light shade  25%
          else if (lum > 0.03) cell.charCode = "+"; // cross        - diffuse halo
          else                 cell.charCode = "."; // period       - extreme wisps
        }
      }
    }

    // ── 5. Commit to the display ──────────────────────────────────────────
    user.data.fluidLayer.setOrders([
      OrderBuilder.subFrameMulti(0, 0, W, H, frame as any),
    ]);

  }
}
```

---

## File: applications/showcase-07-terminal-bomber/index.ts

```typescript
/**
 * Terminal Bomber - Entry point
 * Re-exports the main application class for the app registry.
 */
export { TermBomb as TermBomber } from "./term-bomb/apps/TermBomb";
```

---

## File: applications/showcase-08-snake/index.ts

```typescript
/**
 * Name: showcase-08-snake
 * Category: showcase
 * Description: The smallest complete game possible with Primitiv - a fully
 *   playable Minimal Snake clone. One palette, two layers, two
 *   input axes, and five drawing orders per frame.
 *
 * Architecture:
 *   - Layer 0 (walls): Static border + title, mustBeReliable: true.
 *     Drawn once on connect, zero per-tick network cost.
 *   - Layer 1 (game): Dynamic snake, food, score, game-over text.
 *     Rebuilt every tick with text, char, and polyline orders.
 *
 * Key Primitiv Concepts demonstrated:
 *   - Minimal application structure: init → initUser → updateUser.
 *   - Static vs dynamic layers: walls committed once, game layer every tick.
 *   - Input bindings: two axes (MX, MY) mapped to arrow keys.
 *   - OrderBuilder variety: fill, text, bitmask, char, polyline in one app.
 */
import {
    Engine, User, Layer, Display, OrderBuilder, Vector2,
    KeyboardInput, InputDeviceType,
    type IApplication, type IRuntime,
} from '@primitiv/engine';

// ─── Grid dimensions ─────────────────────────────────────────────────────────
const WIDTH = 22, HEIGHT = 14;

// ─── Palette color IDs ───────────────────────────────────────────────────────
const BG_COLOR = 0;
const SNAKE_COLOR = 2;
const DANGER_COLOR = 3;
const FOOD_COLOR = 4;
const TEXT_COLOR = 5;

// ─── Per-user application state ──────────────────────────────────────────────

interface SnakeUserData {
    gameLayer: Layer;
    snake: { x: number; y: number }[];
    direction: { x: number; y: number };
    nextDirection: { x: number; y: number };
    food: { x: number; y: number };
    alive: boolean;
    score: number;
    moveTimer: number;
}

/** Spawn food at a random position, rejection-sampled to avoid the snake. */
function spawnFood(snake: { x: number; y: number }[]): { x: number; y: number } {
    let x: number, y: number;
    do {
        x = 1 + Math.floor(Math.random() * (WIDTH - 2));
        y = 1 + Math.floor(Math.random() * (HEIGHT - 2));
    } while (snake.some(segment => segment.x === x && segment.y === y));
    return { x, y };
}

// ─── Application ─────────────────────────────────────────────────────────────

export class Minimal implements IApplication<Engine, User<SnakeUserData>> {

    async init(runtime: IRuntime, engine: Engine) {
        engine.loadPaletteToSlot(0, [
            { colorId: BG_COLOR, r: 12, g: 14, b: 20, a: 255 },      // Deep Midnight
            { colorId: SNAKE_COLOR, r: 50, g: 180, b: 130, a: 255 },   // Rich Emerald
            { colorId: DANGER_COLOR, r: 210, g: 60, b: 60, a: 255 },   // Muted Crimson
            { colorId: FOOD_COLOR, r: 230, g: 170, b: 40, a: 255 },    // Golden Amber
            { colorId: TEXT_COLOR, r: 190, g: 200, b: 210, a: 255 },   // Silver Mist
        ]);
        runtime.setTickRate(20);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<SnakeUserData>) {
        // ── Display ──────────────────────────────────────────────────────────
        const display = new Display(0, WIDTH, HEIGHT);
        user.addDisplay(display);
        display.switchPalette(0);

        // ── Layer 0: static walls ────────────────────────────────────────────
        const wallLayer = new Layer(new Vector2(0, 0), 0, WIDTH, HEIGHT, { mustBeReliable: true });
        user.addLayer(wallLayer);

        wallLayer.setOrders([
            OrderBuilder.fill(' ', BG_COLOR, BG_COLOR),
            OrderBuilder.line(0, 0, WIDTH - 1, 0, { charCode: ' ', bgColor: TEXT_COLOR }),
            OrderBuilder.line(0, HEIGHT - 1, WIDTH - 1, HEIGHT - 1, { charCode: ' ', bgColor: TEXT_COLOR }),
            OrderBuilder.line(0, 0, 0, HEIGHT - 1, { charCode: ' ', bgColor: TEXT_COLOR }),
            OrderBuilder.line(WIDTH - 1, 0, WIDTH - 1, HEIGHT - 1, { charCode: ' ', bgColor: TEXT_COLOR }),
            OrderBuilder.text(1, 0, ' SNAKE ', BG_COLOR, TEXT_COLOR),
        ]);

        // ── Layer 1: dynamic game state (rebuilt every tick) ─────────────────
        const gameLayer = new Layer(new Vector2(0, 0), 1, WIDTH, HEIGHT);
        user.addLayer(gameLayer);

        const snake = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
        user.data = {
            gameLayer,
            snake,
            direction: { x: 1, y: 0 },
            nextDirection: { x: 1, y: 0 },
            food: spawnFood(snake),
            alive: true,
            score: 0,
            moveTimer: 0,
        };

        // ── Input ────────────────────────────────────────────────────────────
        const registry = user.getInputBindingRegistry();
        registry.defineAxis(0, 'MX', [{ sourceId: 0, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight }]);
        registry.defineAxis(1, 'MY', [{ sourceId: 1, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown }]);
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<SnakeUserData>) {
        const data = user.data;

        // ── 1. Read input - prevent 180° reversal ────────────────────────────
        const inputX = Math.round(user.getAxis('MX'));
        const inputY = Math.round(user.getAxis('MY'));
        if (inputX && inputX !== -data.direction.x) data.nextDirection = { x: inputX, y: 0 };
        else if (inputY && inputY !== -data.direction.y) data.nextDirection = { x: 0, y: inputY };

        // ── 2. Advance game state ────────────────────────────────────────────
        data.moveTimer += 8;
        if (data.alive && data.moveTimer >= 20) {
            data.moveTimer -= 20;

            data.direction = data.nextDirection;
            const head = { x: data.snake[0].x + data.direction.x, y: data.snake[0].y + data.direction.y };

            const hitsWall = head.x < 1 || head.x >= WIDTH - 1 || head.y < 1 || head.y >= HEIGHT - 1;
            const hitsSelf = data.snake.some(segment => segment.x === head.x && segment.y === head.y);

            if (hitsWall || hitsSelf) {
                data.alive = false;
            } else {
                data.snake.unshift(head);
                if (head.x === data.food.x && head.y === data.food.y) {
                    data.score++;
                    data.food = spawnFood(data.snake);
                } else {
                    data.snake.pop();
                }
            }
        }

        // ── 3. Draw game state ───────────────────────────────────────────────
        const layer = data.gameLayer;

        const orders = [
            OrderBuilder.text(10, 0, ` Score: ${data.score} `, BG_COLOR, TEXT_COLOR),
            OrderBuilder.char(data.food.x, data.food.y, '♦', FOOD_COLOR, 255),
            OrderBuilder.polyline(data.snake, '█', SNAKE_COLOR),
            OrderBuilder.char(data.snake[0].x, data.snake[0].y, '@', SNAKE_COLOR, 255)
        ];

        if (!data.alive) {
            orders.push(OrderBuilder.text(6, 6, ' GAME OVER! ', DANGER_COLOR, TEXT_COLOR));
        }

        layer.setOrders(orders);

    }

    update() { }
}

```

---

## File: applications/showcase-09-pong/index.ts

```typescript
/**
 * Name: showcase-09-pong
 * Category: showcase
 * Description: Pong clone with 5-layer Z-buffer depth, 3D beveled frame,
 *   interpolated motion trails, additive collision glows, and parallax screen shake.
 *
 * Architecture (5-Layer Z-Buffer):
 *   - Z=0 (bgLayer): Perspective tunnel background.
 *   - Z=1 (courtLayer): 3D beveled frame and dashed net.
 *   - Z=2 (uiLayer): Large ASCII scores and game-over banner.
 *   - Z=3 (paddleLayer): Paddles with solid high-intensity hit glow.
 *   - Z=4 (ballLayer): Ball, particles, and interpolated gap-free trail.
 *
 * Key Primitiv Concepts demonstrated:
 *   - Multilayer Composition: Solving transparency artifacts with Z-ordering.
 *   - Advanced Trail: Linear interpolation between positions for fluid motion.
 *   - 3D Aesthetics: Three-step gradient bevels and vanishing point tunnel.
 *   - CRT Post-Process: Scanlines and ambient glow for retro immersion.
 */
import {
    Engine, User, Layer, Display, OrderBuilder, Vector2,
    KeyboardInput, InputDeviceType, ScalingMode,
    type IApplication, type IRuntime,
} from '@primitiv/engine';

// ─── Court dimensions ────────────────────────────────────────────────────────
const W = 120, H = 67;
const MARGIN = 4;
const DISPLAY_W = W + MARGIN * 2;
const DISPLAY_H = H + MARGIN * 2;
const OX = MARGIN;
const OY = MARGIN;

const PADDLE_H = 10;
const PADDLE_X_L = 4;
const PADDLE_X_R = W - 5;
const BASE_BALL_VX = 2;
const ACCEL_PER_HIT = 0.15;
const MAX_BALL_VX = 8;
const AI_REACTION = 0.25;
const WIN_SCORE = 5;

// ─── Screen shake ───────────────────────────────────────────────────────────
const SHAKE_INTENSITY = 3;
const SHAKE_DECAY = 0.7;

// ─── Particle parameters ────────────────────────────────────────────────────
const PARTICLE_COUNT = 6;
const PARTICLE_LIFE = 18;
const PARTICLE_CHARS = ['·', '∙', '•', 'o'];

// ─── Ball trail ─────────────────────────────────────────────────────────────
const TRAIL_LENGTH = 5;
const BALL_FLASH_DURATION = 4;   // Ticks the ball bg flashes paddle color

// ─── Slow-motion ────────────────────────────────────────────────────────────
const SLOW_FACTOR = 0.25;       // Speed multiplier during slow-mo
const SLOW_MAX_CHARGE = 60;     // Max charge in ticks (~2 seconds at 30 TPS)
const SLOW_RECHARGE_RATE = 0.5; // Charge gained per tick when not active
const SLOW_BAR_W = 20;          // Width of the charge bar in cells
const SLOW_BAR_Y = 0;           // Y position (top row)
const SLOW_BAR_X = W - SLOW_BAR_W - 2; // Right-aligned

// ─── Palette color IDs ──────────────────────────────────────────────────────
const BG = 0;
const COURT = 1;
const BLUE = 2;
const RED = 3;
const BALL_COLOR = 4;
const TEXT_COLOR = 5;
const NET = 6;
const BLUE_MID = 7;
const BLUE_DIM = 8;
const RED_MID = 9;
const RED_DIM = 10;
const BALL_MID = 11;
const BALL_DIM = 12;
const SLOW_BAR_COLOR = 13;
const SLOW_BAR_BG = 14;
const GRID_COLOR = 15;
const BLUE_HIGH = 16;          // Bright cyan for impact
const RED_HIGH = 17;             // Bright red for impact
const FRAME_HI = 18;             // Light color for 3D beveled frame
const FRAME_MID = 20;            // Middle transition for 3D beveled frame
const FRAME_LO = 19;             // Dark color for 3D beveled frame
const BLUE_GLOW = 21;
const RED_GLOW = 22;
const BLUE_HIT_GLOW = 23;      // Special bright hit color
const RED_HIT_GLOW = 24;       // Special bright hit color


const FADE_MAP: Record<number, number[]> = {
    [BLUE]: [BLUE, BLUE_MID, BLUE_DIM],
    [RED]: [RED, RED_MID, RED_DIM],
};

// ─── Big ASCII digits (5×3 bitmap font) ─────────────────────────────────────
const DIGITS: number[][] = [
    [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1], // 0
    [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], // 1
    [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1], // 2
    [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1], // 3
    [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1], // 4
    [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1], // 5
    [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1], // 6
    [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], // 7
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1], // 8
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1], // 9
];

// ─── Per-user application state ──────────────────────────────────────────────

interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    life: number;
    maxLife: number;
    color: number;
    char: string;
}

interface PongUserData {
    display: Display;
    bgLayer: Layer;
    courtLayer: Layer;
    uiLayer: Layer;
    paddleLayer: Layer;
    ballLayer: Layer;
    blueY: number;
    redY: number;
    ballX: number;
    ballY: number;
    ballVX: number;
    ballVY: number;
    blueScore: number;
    redScore: number;
    serving: boolean;
    serveTimer: number;
    gameOver: boolean;
    shakeX: number;
    shakeY: number;
    particles: Particle[];
    trail: { x: number; y: number }[];
    rallyHits: number;
    currentSpeed: number;
    slowCharge: number;
    slowActive: boolean;
    ballFlashLife: number;       // Remaining flash ticks
    ballFlashColor: number;      // Paddle color for ball bg
    blueTargetOffset: number;  // Intentional AI inaccuracy
    redTargetOffset: number;     // Intentional AI inaccuracy
    blueHitFlash: number;      // Frames remaining for paddle highlight
    redHitFlash: number;         // Frames remaining for paddle highlight
}

// Predict exact Y position of the ball when it reaches targetX, including bounces
function predictBallY(bx: number, by: number, bvx: number, bvy: number, targetX: number): number {
    if (bvx === 0) return by;
    const timeToTarget = (targetX - bx) / bvx;
    if (timeToTarget <= 0) return by;

    const predictedY = by + bvy * timeToTarget;
    const minY = 3;
    const maxY = H - 3;
    const range = maxY - minY;

    let normalizedY = predictedY - minY;
    if (normalizedY < 0) {
        normalizedY = -normalizedY;
    }

    const crossings = Math.floor(normalizedY / range);
    const remainder = normalizedY % range;

    if (crossings % 2 === 1) {
        return maxY - remainder;
    } else {
        return minY + remainder;
    }
}

function serveBall(data: PongUserData, towardsBlue: boolean): void {
    data.ballX = Math.floor(W / 2);
    data.ballY = Math.floor(H / 2);
    data.ballVX = towardsBlue ? -BASE_BALL_VX : BASE_BALL_VX;
    data.ballVY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random());
    data.serving = true;
    data.serveTimer = 30; // 1 second pause
    data.currentSpeed = BASE_BALL_VX;
    data.rallyHits = 0;
    data.blueTargetOffset = (Math.random() - 0.5) * (PADDLE_H - 2);
    data.redTargetOffset = (Math.random() - 0.5) * (PADDLE_H - 2);
    data.trail = [];
}

// ─── Application ─────────────────────────────────────────────────────────────

export class Pong implements IApplication<Engine, User<PongUserData>> {

    async init(runtime: IRuntime, engine: Engine) {
        engine.loadPaletteToSlot(0, [
            { colorId: BG, r: 8, g: 8, b: 16, a: 255 },
            { colorId: COURT, r: 50, g: 50, b: 80, a: 255 },
            { colorId: BLUE, r: 80, g: 220, b: 255, a: 255 },
            { colorId: RED, r: 255, g: 100, b: 100, a: 255 },
            { colorId: BALL_COLOR, r: 255, g: 255, b: 200, a: 255 },
            { colorId: TEXT_COLOR, r: 200, g: 200, b: 220, a: 255 },
            { colorId: NET, r: 100, g: 100, b: 140, a: 255 }, // Brighter net
            { colorId: BLUE_MID, r: 40, g: 120, b: 150, a: 255 },
            { colorId: BLUE_DIM, r: 20, g: 50, b: 70, a: 255 },
            { colorId: RED_MID, r: 150, g: 50, b: 50, a: 255 },
            { colorId: RED_DIM, r: 70, g: 25, b: 25, a: 255 },
            { colorId: BALL_MID, r: 160, g: 160, b: 120, a: 255 },
            { colorId: BALL_DIM, r: 60, g: 60, b: 50, a: 255 },
            { colorId: SLOW_BAR_COLOR, r: 100, g: 200, b: 255, a: 255 },
            { colorId: SLOW_BAR_BG, r: 25, g: 25, b: 40, a: 255 },
            { colorId: GRID_COLOR, r: 80, g: 80, b: 120, a: 255 },
            { colorId: BLUE_HIGH, r: 180, g: 255, b: 255, a: 255 },
            { colorId: RED_HIGH, r: 255, g: 180, b: 180, a: 255 },
            { colorId: FRAME_HI, r: 35, g: 35, b: 55, a: 255 }, // Subtle Frame Face
            { colorId: FRAME_MID, r: 25, g: 25, b: 40, a: 255 }, // Middle Transition
            { colorId: FRAME_LO, r: 15, g: 15, b: 25, a: 255 }, // Dark Inner Bevel
            { colorId: BLUE_GLOW, r: 15, g: 30, b: 45, a: 255 }, // Very subtle blue tint
            { colorId: RED_GLOW, r: 35, g: 15, b: 15, a: 255 },  // Very subtle red tint
            { colorId: BLUE_HIT_GLOW, r: 50, g: 140, b: 160, a: 255 }, // Very bright but softer than BLUE
            { colorId: RED_HIT_GLOW, r: 160, g: 60, b: 60, a: 255 },   // Very bright but softer than RED
        ]);
        runtime.setTickRate(30);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<PongUserData>) {
        // ── Display with CRT effects ─────────────────────────────────────────
        const display = new Display(0, DISPLAY_W, DISPLAY_H);
        user.addDisplay(display);
        display.switchPalette(0);
        display.setScalingMode(ScalingMode.Quarter);
        display.setAmbientEffect({ blur: 15, scale: 1.4 });
        display.setPostProcess({ scanlines: { enabled: true, opacity: 0.25, pattern: 'horizontal' } });

        // ── Layer 0: Background Tunnel (z=0) ────────────────────────────────
        const bgLayer = new Layer(new Vector2(OX, OY), 0, W, H, { mustBeReliable: true });
        user.addLayer(bgLayer);

        const bgOrders: any[] = [];
        bgOrders.push(OrderBuilder.fill(' ', BG, BG));

        // ── Vanishing Lines (radiating towards a central box) ─────────
        const cxGrid = Math.floor(W / 2);
        const cyGrid = Math.floor(H / 2);

        // The inner "distance" rectangle where lines stop
        const innerW = Math.floor(W * 0.2);
        const innerH = Math.floor(H * 0.2);

        // Define corners for vanishing lines: [Outer Corner, Inner Corner, CharCode]
        const segments = [
            [{ x: 1, y: 1 }, { x: cxGrid - innerW, y: cyGrid - innerH }, '.'],         // Top Left
            [{ x: W - 2, y: 1 }, { x: cxGrid + innerW, y: cyGrid - innerH }, '.'],     // Top Right
            [{ x: 1, y: H - 2 }, { x: cxGrid - innerW, y: cyGrid + innerH }, '.'],     // Bottom Left
            [{ x: W - 2, y: H - 2 }, { x: cxGrid + innerW, y: cyGrid + innerH }, '.']  // Bottom Right
        ];

        // Draw the 4 vanishing lines
        for (const seg of segments) {
            const p1 = seg[0] as { x: number, y: number };
            const p2 = seg[1] as { x: number, y: number };
            const char = seg[2] as string;
            bgOrders.push(OrderBuilder.line(p1.x, p1.y, p2.x, p2.y, {
                charCode: char,
                fgColor: GRID_COLOR,
                bgColor: BG
            }));
        }

        // Draw the inner "vanishing" rectangle with proper box characters
        const ix1 = cxGrid - innerW, iy1 = cyGrid - innerH;
        const ix2 = cxGrid + innerW, iy2 = cyGrid + innerH;
        bgOrders.push(OrderBuilder.char(ix1, iy1, '┌', GRID_COLOR, BG));
        bgOrders.push(OrderBuilder.line(ix1 + 1, iy1, ix2 - 1, iy1, { charCode: '─', fgColor: GRID_COLOR, bgColor: BG }));
        bgOrders.push(OrderBuilder.char(ix2, iy1, '┐', GRID_COLOR, BG));

        bgOrders.push(OrderBuilder.char(ix1, iy2, '└', GRID_COLOR, BG));
        bgOrders.push(OrderBuilder.line(ix1 + 1, iy2, ix2 - 1, iy2, { charCode: '─', fgColor: GRID_COLOR, bgColor: BG }));
        bgOrders.push(OrderBuilder.char(ix2, iy2, '┘', GRID_COLOR, BG));

        bgOrders.push(OrderBuilder.line(ix1, iy1 + 1, ix1, iy2 - 1, { charCode: '│', fgColor: GRID_COLOR, bgColor: BG }));
        bgOrders.push(OrderBuilder.line(ix2, iy1 + 1, ix2, iy2 - 1, { charCode: '│', fgColor: GRID_COLOR, bgColor: BG }));

        bgLayer.setOrders(bgOrders);


        // ── Layer 1: Static Court (z=1) ──────────────────────────────────────
        const courtLayer = new Layer(new Vector2(OX, OY), 1, W, H, { mustBeReliable: true });
        user.addLayer(courtLayer);

        const courtOrders: any[] = [];
        // Thick 3D Beveled Frame with 3-Step Gradient
        // 1. Homogeneous face (Outer surface - 1 cell thick)
        courtOrders.push(OrderBuilder.line(0, 1, W - 1, 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(0, H - 1, W - 1, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(0, 1, 0, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(W - 1, 1, W - 1, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));

        // 2. Middle transition bevel (Intermediate depth - 1 cell thick)
        courtOrders.push(OrderBuilder.line(1, 2, W - 2, 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(1, H - 2, W - 2, H - 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(1, 2, 1, H - 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(W - 2, 2, W - 2, H - 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));

        // 3. Inner depth bevel (Deepest part - 1 cell thick)
        courtOrders.push(OrderBuilder.line(2, 3, W - 3, 3, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(2, H - 3, W - 3, H - 3, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(2, 3, 2, H - 3, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(W - 3, 3, W - 3, H - 3, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));

        // Center net (dashed)
        const cxNet = Math.floor(W / 2);
        for (let y = 3; y < H - 2; y += 2) {
            courtOrders.push(OrderBuilder.char(cxNet, y, '│', NET, BG));
        }
        courtLayer.setOrders(courtOrders);


        // ── Layer 2: UI (Z=2) - Score and Banner ─────────────────────────────
        const uiLayer = new Layer(new Vector2(OX, OY), 2, W, H);
        user.addLayer(uiLayer);

        // ── Layer 3: Paddles (Z=3) ───────────────────────────────────────────
        const paddleLayer = new Layer(new Vector2(OX, OY), 3, W, H);
        user.addLayer(paddleLayer);

        // ── Layer 4: Ball & FX (Z=4) ─────────────────────────────────────────
        const ballLayer = new Layer(new Vector2(OX, OY), 4, W, H);
        user.addLayer(ballLayer);

        const data: PongUserData = {
            display,
            bgLayer,
            courtLayer,
            uiLayer,
            paddleLayer,
            ballLayer,
            blueY: H / 2,
            redY: H / 2,
            ballX: Math.floor(W / 2),
            ballY: Math.floor(H / 2),
            ballVX: 0,
            ballVY: 0,
            blueScore: 0,
            redScore: 0,
            serving: true,
            serveTimer: 30,
            gameOver: false,
            shakeX: 0,
            shakeY: 0,
            particles: [],
            trail: [],
            rallyHits: 0,
            currentSpeed: BASE_BALL_VX,
            slowCharge: SLOW_MAX_CHARGE,
            slowActive: false,
            ballFlashLife: 0,
            ballFlashColor: BG,
            blueTargetOffset: 0, // Initialized by serveBall
            redTargetOffset: 0,    // Initialized by serveBall
            blueHitFlash: 0,
            redHitFlash: 0,
        };
        user.data = data;
        serveBall(data, false);
        data.serveTimer = 30;

        // ── Input ────────────────────────────────────────────────────────────
        const registry = user.getInputBindingRegistry();
        registry.defineButton(1, 'SLOW', [{ sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.Space }]);
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<PongUserData>) {
        const d = user.data;

        // ── Slow-motion toggle ───────────────────────────────────────────────
        const wantSlow = !!user.getButton('SLOW');
        if (wantSlow && d.slowCharge > 0 && !d.gameOver && !d.serving) {
            d.slowActive = true;
            d.slowCharge = Math.max(0, d.slowCharge - 1); // Drains at normal rate
            if (d.slowCharge <= 0) d.slowActive = false;
        } else {
            d.slowActive = false;
            // Recharge when not slowing
            if (d.slowCharge < SLOW_MAX_CHARGE) {
                d.slowCharge = Math.min(SLOW_MAX_CHARGE, d.slowCharge + SLOW_RECHARGE_RATE);
            }
        }
        const sm = d.slowActive ? SLOW_FACTOR : 1; // Speed multiplier this tick

        // ── Screen shake decay ───────────────────────────────────────────────
        d.shakeX *= SHAKE_DECAY;
        d.shakeY *= SHAKE_DECAY;
        if (Math.abs(d.shakeX) < 0.1) d.shakeX = 0;
        if (Math.abs(d.shakeY) < 0.1) d.shakeY = 0;
        const ox = Math.round(d.shakeX);
        const oy = Math.round(d.shakeY);

        // All interactive elements shake fully (Full 100% parallax foreground)
        d.ballLayer.setOrigin(new Vector2(OX + ox, OY + oy));
        d.paddleLayer.setOrigin(new Vector2(OX + ox, OY + oy));
        d.uiLayer.setOrigin(new Vector2(OX + ox, OY + oy));
        d.courtLayer.setOrigin(new Vector2(OX + ox, OY + oy));

        // Background (perspective tunnel) shakes at 20% strength to create parallax depth
        const bgOx = Math.round(d.shakeX * 0.2);
        const bgOy = Math.round(d.shakeY * 0.2);
        d.bgLayer.setOrigin(new Vector2(OX + bgOx, OY + bgOy));

        // Ball flash decay
        if (d.ballFlashLife > 0) d.ballFlashLife--;
        if (d.blueHitFlash > 0) d.blueHitFlash--;
        if (d.redHitFlash > 0) d.redHitFlash--;

        if (d.gameOver) { this.draw(d); return; }

        // ── 1. BLUE AI ─────────────────────────────────────────────────────
        const blueDest = predictBallY(d.ballX, d.ballY, d.ballVX, d.ballVY, PADDLE_X_L);
        const blueTarget = d.ballVX < 0 ? (blueDest + d.blueTargetOffset) : H / 2;
        d.blueY += (blueTarget - d.blueY) * AI_REACTION * sm;
        d.blueY = Math.max(3 + PADDLE_H / 2, Math.min(H - 3 - PADDLE_H / 2, d.blueY));

        // ── 2. CPU AI ────────────────────────────────────────────────────────
        const cpuDest = predictBallY(d.ballX, d.ballY, d.ballVX, d.ballVY, PADDLE_X_R);
        const cpuTarget = d.ballVX > 0 ? (cpuDest + d.redTargetOffset) : H / 2;
        d.redY += (cpuTarget - d.redY) * AI_REACTION * sm;
        d.redY = Math.max(3 + PADDLE_H / 2, Math.min(H - 3 - PADDLE_H / 2, d.redY));

        // ── 3. Serve pause ───────────────────────────────────────────────────
        if (d.serving) {
            d.serveTimer--;
            if (d.serveTimer <= 0) d.serving = false;
            this.draw(d);
            return;
        }

        // ── 4. Ball physics (swept collision to prevent tunneling) ─────────
        d.trail.unshift({ x: d.ballX, y: d.ballY });
        if (d.trail.length > TRAIL_LENGTH) d.trail.length = TRAIL_LENGTH;

        const prevX = d.ballX;
        const prevY = d.ballY;
        d.ballX += d.ballVX * sm;
        d.ballY += d.ballVY * sm;

        // Top/bottom bounce
        if (d.ballY <= 3) { d.ballY = 3; d.ballVY = Math.abs(d.ballVY); }
        if (d.ballY >= H - 3) { d.ballY = H - 3; d.ballVY = -Math.abs(d.ballVY); }

        // BLUE paddle - swept collision
        const pLine = PADDLE_X_L + 1;
        const pTop = Math.round(d.blueY - PADDLE_H / 2);
        const pBot = Math.round(d.blueY + PADDLE_H / 2);
        if (d.ballVX < 0 && prevX >= pLine && d.ballX <= pLine) {
            const t = (d.ballVX === 0) ? 0 : (pLine - prevX) / (d.ballVX * sm);
            const hitY = Math.round(prevY + d.ballVY * sm * t);
            if (hitY >= pTop && hitY <= pBot) {
                d.rallyHits++;
                d.currentSpeed = Math.min(MAX_BALL_VX, BASE_BALL_VX + d.rallyHits * ACCEL_PER_HIT);
                d.ballVX = Math.round(d.currentSpeed);
                if (d.ballVX < 1) d.ballVX = 1;
                d.ballY = hitY;
                d.ballVY += (hitY - d.blueY) * 0.6; // Increased spin/deflection effect from edges
                d.ballX = pLine;
                this.triggerShake(d, 1);
                this.spawnParticles(d, d.ballX, d.ballY, 1, BLUE_HIGH); // Brighter particles
                d.ballFlashLife = BALL_FLASH_DURATION; d.ballFlashColor = BLUE_DIM;
                d.blueTargetOffset = (Math.random() - 0.5) * (PADDLE_H - 2); // Reroll offset
                d.blueHitFlash = BALL_FLASH_DURATION; // Highlight paddle
            }
        }

        // CPU paddle - swept collision
        const cLine = PADDLE_X_R - 1;
        const cTop = Math.round(d.redY - PADDLE_H / 2);
        const cBot = Math.round(d.redY + PADDLE_H / 2);
        if (d.ballVX > 0 && prevX <= cLine && d.ballX >= cLine) {
            const t = (d.ballVX === 0) ? 0 : (cLine - prevX) / (d.ballVX * sm);
            const hitY = Math.round(prevY + d.ballVY * sm * t);
            if (hitY >= cTop && hitY <= cBot) {
                d.rallyHits++;
                d.currentSpeed = Math.min(MAX_BALL_VX, BASE_BALL_VX + d.rallyHits * ACCEL_PER_HIT);
                d.ballVX = -Math.round(d.currentSpeed);
                if (d.ballVX > -1) d.ballVX = -1;
                d.ballY = hitY;
                d.ballVY += (hitY - d.redY) * 0.6; // Increased spin/deflection effect from edges
                d.ballX = cLine;
                this.triggerShake(d, -1);
                this.spawnParticles(d, d.ballX, d.ballY, -1, RED_HIGH); // Brighter particles
                d.ballFlashLife = BALL_FLASH_DURATION; d.ballFlashColor = RED_DIM;
                d.redTargetOffset = (Math.random() - 0.5) * (PADDLE_H - 2); // Reroll offset
                d.redHitFlash = BALL_FLASH_DURATION; // Highlight paddle
            }
        }

        // ── 5. Scoring ───────────────────────────────────────────────────────
        if (d.ballX <= 0) {
            d.redScore++;
            if (d.redScore >= WIN_SCORE) { d.gameOver = true; }
            else { serveBall(d, true); }
        } else if (d.ballX >= W - 1) {
            d.blueScore++;
            if (d.blueScore >= WIN_SCORE) { d.gameOver = true; }
            else { serveBall(d, false); }
        }

        // ── 6. Update particles ──────────────────────────────────────────────
        for (let i = d.particles.length - 1; i >= 0; i--) {
            const p = d.particles[i];
            p.x += p.vx * sm;
            p.y += p.vy * sm;
            p.life--;
            if (p.life <= 0) d.particles.splice(i, 1);
        }

        this.draw(d);
    }

    private spawnParticles(d: PongUserData, x: number, y: number, dirX: number, color: number): void {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const life = Math.floor(PARTICLE_LIFE * (0.5 + Math.random() * 0.5));
            d.particles.push({
                x, y,
                vx: dirX * (1 + Math.random() * 3),
                vy: (Math.random() - 0.5) * 4,
                life, maxLife: life, color,
                char: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
            });
        }
    }

    private triggerShake(d: PongUserData, dirX: number): void {
        d.shakeX = dirX * SHAKE_INTENSITY * (0.5 + Math.random() * 0.5);
        d.shakeY = (Math.random() - 0.5) * SHAKE_INTENSITY;
    }

    private drawBigDigit(orders: any[], digit: number, x: number, y: number, color: number): void {
        const grid = DIGITS[digit];
        if (!grid) return;
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === 1) {
                const dx = i % 3;
                const dy = Math.floor(i / 3);
                // Use space character with background color and transparent foreground (255)
                orders.push(OrderBuilder.char(x + dx, y + dy, ' ', 255, color));
            }
        }
    }

    private draw(d: PongUserData): void {
        const ballOrders: any[] = [];
        const paddleOrders: any[] = [];
        const uiOrders: any[] = [];

        // ── Big ASCII score (Z=2 uiLayer) ────────────────────────────────────
        const center = Math.floor(W / 2);
        this.drawBigDigit(uiOrders, d.blueScore, center - 8, 3, BLUE);
        this.drawBigDigit(uiOrders, d.redScore, center + 5, 3, RED);

        // ── Slow-mo charge (Z=2 uiLayer) ─────────────────────────────────────
        const filled = Math.round((d.slowCharge / SLOW_MAX_CHARGE) * SLOW_BAR_W);
        const barFilled: { posX: number; posY: number }[] = [];
        const barEmpty: { posX: number; posY: number }[] = [];
        for (let i = 0; i < SLOW_BAR_W; i++) {
            (i < filled ? barFilled : barEmpty).push({ posX: SLOW_BAR_X + i, posY: SLOW_BAR_Y });
        }
        if (barFilled.length) uiOrders.push(OrderBuilder.dotCloud(barFilled, '▬', SLOW_BAR_COLOR, 255));
        if (barEmpty.length) uiOrders.push(OrderBuilder.dotCloud(barEmpty, '▬', SLOW_BAR_BG, 255));
        if (d.slowActive) {
            uiOrders.push(OrderBuilder.text(SLOW_BAR_X - 5, SLOW_BAR_Y, 'SLOW', SLOW_BAR_COLOR, 255));
        }

        // ── Ball trail (Z=4 ballLayer) ───────────────────────────────────────
        const trailColors = [BALL_COLOR, BALL_MID, BALL_MID, BALL_DIM, BALL_DIM];
        const trailDots: { posX: number; posY: number; charCode: string; fgColorCode: number; bgColorCode: number }[] = [];

        // Include current ball position as the head of the trail for interpolation
        const fullPath = [{ x: d.ballX, y: d.ballY }, ...d.trail];

        for (let i = 0; i < fullPath.length - 1; i++) {
            const p1 = fullPath[i];
            const p2 = fullPath[i + 1];

            // Draw the actual point (from trail)
            const tx = Math.round(p2.x), ty = Math.round(p2.y);
            const color = trailColors[i] || BALL_DIM;
            if (tx >= 1 && tx < W - 1 && ty >= 1 && ty < H - 1) {
                trailDots.push({ posX: tx, posY: ty, charCode: '·', fgColorCode: color, bgColorCode: 255 });
            }

            // Interpolate between p1 and p2 to fill gaps with '.'
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 1.5) {
                const steps = Math.floor(dist);
                for (let s = 1; s < steps; s++) {
                    const ix = Math.round(p1.x + (dx * s) / steps);
                    const iy = Math.round(p1.y + (dy * s) / steps);
                    if (ix >= 1 && ix < W - 1 && iy >= 1 && iy < H - 1) {
                        // Use a subtle '.' between the '·' points
                        trailDots.push({ posX: ix, posY: iy, charCode: '.', fgColorCode: color, bgColorCode: 255 });
                    }
                }
            }
        }
        if (trailDots.length) ballOrders.push(OrderBuilder.dotCloudMulti(trailDots));

        // ── BLUE paddle (Z=3 paddleLayer) ────────────────────────────────────
        const pTop = Math.round(d.blueY - PADDLE_H / 2);
        const pGlow: { posX: number; posY: number }[] = [];
        for (let i = -1; i <= PADDLE_H; i++) {
            const gy = pTop + i;
            if (gy >= 2 && gy < H - 1) {
                pGlow.push({ posX: PADDLE_X_L - 1, posY: gy });
                pGlow.push({ posX: PADDLE_X_L + 1, posY: gy });
            }
        }
        if (pTop - 1 >= 2) pGlow.push({ posX: PADDLE_X_L, posY: pTop - 1 });
        if (pTop + PADDLE_H < H - 1) pGlow.push({ posX: PADDLE_X_L, posY: pTop + PADDLE_H });
        const pGlowColor = d.blueHitFlash > 0 ? BLUE_HIT_GLOW : BLUE_GLOW;
        const pColor = d.blueHitFlash > 0 ? BLUE_HIGH : BLUE;
        if (pGlow.length) paddleOrders.push(OrderBuilder.dotCloud(pGlow, ' ', 255, pGlowColor));
        paddleOrders.push(OrderBuilder.line(PADDLE_X_L, pTop, PADDLE_X_L, pTop + PADDLE_H - 1, { charCode: '█', fgColor: pColor, bgColor: 255 }));

        // ── RED paddle (Z=3 paddleLayer) ─────────────────────────────────────
        const cTop = Math.round(d.redY - PADDLE_H / 2);
        const cGlow: { posX: number; posY: number }[] = [];
        for (let i = -1; i <= PADDLE_H; i++) {
            const gy = cTop + i;
            if (gy >= 2 && gy < H - 1) {
                cGlow.push({ posX: PADDLE_X_R - 1, posY: gy });
                cGlow.push({ posX: PADDLE_X_R + 1, posY: gy });
            }
        }
        if (cTop - 1 >= 2) cGlow.push({ posX: PADDLE_X_R, posY: cTop - 1 });
        if (cTop + PADDLE_H < H - 1) cGlow.push({ posX: PADDLE_X_R, posY: cTop + PADDLE_H });
        const cGlowColor = d.redHitFlash > 0 ? RED_HIT_GLOW : RED_GLOW;
        const cColor = d.redHitFlash > 0 ? RED_HIGH : RED;
        if (cGlow.length) paddleOrders.push(OrderBuilder.dotCloud(cGlow, ' ', 255, cGlowColor));
        paddleOrders.push(OrderBuilder.line(PADDLE_X_R, cTop, PADDLE_X_R, cTop + PADDLE_H - 1, { charCode: '█', fgColor: cColor, bgColor: 255 }));

        // ── Particles (Z=4 ballLayer) ────────────────────────────────────────
        const particleDots: { posX: number; posY: number; charCode: string; fgColorCode: number; bgColorCode: number }[] = [];
        for (const p of d.particles) {
            const px = Math.round(p.x), py = Math.round(p.y);
            if (px >= 0 && px < W && py >= 2 && py < H - 1) {
                const ratio = p.life / p.maxLife;
                const stages = FADE_MAP[p.color] || [p.color, p.color, p.color];
                const col = ratio > 0.6 ? stages[0] : ratio > 0.25 ? stages[1] : stages[2];
                particleDots.push({ posX: px, posY: py, charCode: p.char, fgColorCode: col, bgColorCode: 255 });
            }
        }
        if (particleDots.length) ballOrders.push(OrderBuilder.dotCloudMulti(particleDots));

        // ── Ball (Z=4 ballLayer) ─────────────────────────────────────────────
        if (!d.serving || Math.floor(d.serveTimer / 4) % 2 === 0) {
            const ballColor = d.ballFlashLife > 0 ? d.ballFlashColor : BALL_COLOR;
            ballOrders.push(OrderBuilder.char(Math.round(d.ballX), Math.round(d.ballY), '•', ballColor, 255));
        }

        // ── Game over (Z=2 uiLayer) ──────────────────────────────────────────
        if (d.gameOver) {
            const isBlue = d.blueScore >= WIN_SCORE;
            const text = isBlue ? ' ☼  BLUE WINS!  ☼ ' : ' ☼  RED WINS!  ☼ ';
            const color = isBlue ? BLUE_HIGH : RED_HIGH;
            const tx = Math.floor(W / 2 - text.length / 2);
            const ty = Math.floor(H / 2);

            uiOrders.push(OrderBuilder.text(tx, ty - 1, '═'.repeat(text.length), color, 255));
            uiOrders.push(OrderBuilder.text(tx, ty, text, color, 255));
            uiOrders.push(OrderBuilder.text(tx, ty + 1, '═'.repeat(text.length), color, 255));
        }

        d.uiLayer.setOrders(uiOrders);

        d.paddleLayer.setOrders(paddleOrders);

        d.ballLayer.setOrders(ballOrders);

    }
}
```

---

## File: applications/showcase-10-breakout/index.ts

```typescript
/**
 * Name: showcase-10-breakout
 * Category: showcase
 * Description: Breakout clone with 5-layer Z-buffer depth system, 3D beveled frame,
 *   falling power-ups, interpolated motion trails, and additive collision glows,
 *   and parallax screen shake.
 * 
 * Architecture (5-Layer Z-Buffer):
 *   - Z=0 (bgLayer): Perspective tunnel background.
 *   - Z=1 (courtLayer): 3D beveled frame and destructible bricks.
 *   - Z=2 (uiLayer): Large ASCII score and life counter.
 *   - Z=3 (paddleLayer & itemLayer): Paddle and falling power-ups.
 *   - Z=4 (ballLayer): Ball, particles, and interpolated gap-free trail.
 */
import {
    Engine, User, Layer, Display, OrderBuilder, Vector2,
    KeyboardInput, InputDeviceType, ScalingMode,
    type IApplication, type IRuntime,
} from '@primitiv/engine';

// ─── Game configuration ──────────────────────────────────────────────────────
const W = 40; // Inner court width (Portrait)
const H = 64; // Inner court height (Portrait)
const MARGIN = 3;
const DISPLAY_W = W + MARGIN * 2;
const DISPLAY_H = H + MARGIN * 2;
const OX = MARGIN;
const OY = MARGIN;

const PADDLE_W = 8;
const PADDLE_Y = H - 4;
const BALL_SPEED_START = 1.0;
const BALL_SPEED_MAX = 2.5;

// Bricks
const BRICK_ROWS = 8;
const BRICK_COLS = 6;
const BRICK_W = 5;
const BRICK_H = 2;
const BRICK_TOP = 8;

// ─── Screen shake ───────────────────────────────────────────────────────────
const SHAKE_INTENSITY = 3;
const SHAKE_DECAY = 0.7;

// ─── Particle parameters ────────────────────────────────────────────────────
const PARTICLE_COUNT = 6;
const PARTICLE_LIFE = 15;
const PARTICLE_CHARS = ['·', '∙', '•', 'o'];

// ─── Ball trail ─────────────────────────────────────────────────────────────
const TRAIL_LENGTH = 6;
const BALL_FLASH_DURATION = 4;

const POWERUP_CHANCE = 0.2;
const POWERUP_DURATION = 300; // ~10 seconds at 30fps

// ─── Palette color IDs ──────────────────────────────────────────────────────
const BG = 0;
const FRAME_HI = 1;
const FRAME_MID = 2;
const FRAME_LO = 3;
const PADDLE = 4;
const PADDLE_GLOW = 5;
const PADDLE_HIT_GLOW = 6;
const BALL_COLOR = 7;
const BALL_MID = 8;
const BALL_DIM = 9;
const SCORE_COLOR = 10;
const GRID_COLOR = 11;

// Brick colors (6 tiers)
const B_RED = 12;
const B_ORANGE = 13;
const B_YELLOW = 14;
const B_GREEN = 15;
const B_BLUE = 16;
const B_PURPLE = 17;

const B_RED_TXT = 18;
const B_ORANGE_TXT = 19;
const B_YELLOW_TXT = 20;
const B_GREEN_TXT = 21;

const BRICK_COLORS = [B_RED, B_RED, B_ORANGE, B_ORANGE, B_YELLOW, B_GREEN, B_BLUE, B_PURPLE];

// Power-up Types
type PowerUpType = 'LIFE' | 'WIDE' | 'SUPER';
const POWERUP_ICONS: Record<PowerUpType, string> = { 'LIFE': '♥', 'WIDE': '♦', 'SUPER': '☼' };
const POWERUP_COLORS: Record<PowerUpType, number> = { 'LIFE': B_RED, 'WIDE': B_BLUE, 'SUPER': B_ORANGE };

interface PowerUpItem {
    x: number;
    y: number;
    type: PowerUpType;
    alive: boolean;
}

// ─── Bitmap Font (3x5) ──────────────────────────────────────────────────────
const DIGITS: Record<number, number[]> = {
    0: [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
    1: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    2: [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
    3: [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1],
    4: [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
    5: [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
    6: [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    7: [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    8: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    9: [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
};


interface Brick {
    x: number;
    y: number;
    color: number;
    hp: number;
    textCol?: number;
    flashTimer?: number;
    alive: boolean;
}

interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    life: number; maxLife: number;
    color: number; char: string;
}

interface BreakoutUserData {
    bgLayer: Layer;
    courtLayer: Layer;
    uiLayer: Layer;
    paddleLayer: Layer;
    itemLayer: Layer;
    ballLayer: Layer;

    paddleX: number;
    paddleWidth: number;
    ballX: number;
    ballY: number;
    ballVX: number;
    ballVY: number;

    bricks: Brick[];
    items: PowerUpItem[];
    score: number;
    lives: number;

    serving: boolean;
    gameOver: boolean;

    shakeX: number;
    shakeY: number;
    particles: Particle[];
    trail: { x: number; y: number }[];

    paddleHitFlash: number;
    ballFlashLife: number;

    wideTimer: number;
    superTimer: number;
}

export class Breakout implements IApplication<Engine, User<BreakoutUserData>> {

    async init(runtime: IRuntime, engine: Engine) {
        engine.loadPaletteToSlot(0, [
            { colorId: BG, r: 12, g: 12, b: 24, a: 255 },
            { colorId: FRAME_HI, r: 60, g: 60, b: 90, a: 255 },
            { colorId: FRAME_MID, r: 40, g: 40, b: 65, a: 255 },
            { colorId: FRAME_LO, r: 25, g: 25, b: 40, a: 255 },
            { colorId: PADDLE, r: 200, g: 200, b: 255, a: 255 },
            { colorId: PADDLE_GLOW, r: 30, g: 30, b: 60, a: 255 },
            { colorId: PADDLE_HIT_GLOW, r: 80, g: 80, b: 150, a: 255 },
            { colorId: BALL_COLOR, r: 255, g: 255, b: 255, a: 255 },
            { colorId: BALL_MID, r: 180, g: 180, b: 180, a: 255 },
            { colorId: BALL_DIM, r: 100, g: 100, b: 100, a: 255 },
            { colorId: SCORE_COLOR, r: 255, g: 255, b: 150, a: 255 },
            { colorId: GRID_COLOR, r: 40, g: 40, b: 60, a: 255 },
            // Bricks
            { colorId: B_RED, r: 255, g: 80, b: 80, a: 255 },
            { colorId: B_ORANGE, r: 255, g: 150, b: 50, a: 255 },
            { colorId: B_YELLOW, r: 255, g: 220, b: 50, a: 255 },
            { colorId: B_GREEN, r: 80, g: 255, b: 80, a: 255 },
            { colorId: B_BLUE, r: 80, g: 150, b: 255, a: 255 },
            { colorId: B_PURPLE, r: 180, g: 80, b: 255, a: 255 },
            // Darker variants for text
            { colorId: B_RED_TXT, r: 150, g: 20, b: 20, a: 255 },     // Base: 255, 80, 80
            { colorId: B_ORANGE_TXT, r: 160, g: 70, b: 10, a: 255 },  // Base: 255, 150, 50
            { colorId: B_YELLOW_TXT, r: 150, g: 120, b: 10, a: 255 }, // Base: 255, 220, 50
            { colorId: B_GREEN_TXT, r: 20, g: 140, b: 20, a: 255 },   // Base: 80, 255, 80
        ]);
        runtime.setTickRate(30);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<BreakoutUserData>) {
        const display = new Display(0, DISPLAY_W, DISPLAY_H);
        user.addDisplay(display);
        display.switchPalette(0);
        display.setScalingMode(ScalingMode.None);
        display.setAmbientEffect({ blur: 12, scale: 1.3 });
        display.setPostProcess({ scanlines: { enabled: true, opacity: 0.2, pattern: 'horizontal' } });

        // Layers Setup
        const bgLayer = new Layer(new Vector2(OX, OY), 0, W, H, { mustBeReliable: true });
        user.addLayer(bgLayer);
        const bgOrders: any[] = [OrderBuilder.fill(' ', BG, BG)];
        // Plain colored background without perspective lines
        bgLayer.setOrders(bgOrders);

        const courtLayer = new Layer(new Vector2(OX, OY), 1, W, H);
        user.addLayer(courtLayer);

        const uiLayer = new Layer(new Vector2(OX, OY), 2, W, H);
        user.addLayer(uiLayer);

        const itemLayer = new Layer(new Vector2(OX, OY), 3, W, H);
        user.addLayer(itemLayer);

        const paddleLayer = new Layer(new Vector2(OX, OY), 4, W, H);
        user.addLayer(paddleLayer);

        const ballLayer = new Layer(new Vector2(OX, OY), 5, W, H);
        user.addLayer(ballLayer);

        // Bricks Init
        const bricks: Brick[] = [];
        const innerW = W - 6; // Space between bevels (3 cells on each side)
        const totalBricksW = BRICK_COLS * BRICK_W;
        const startX = 3 + Math.floor((innerW - totalBricksW) / 2);

        for (let r = 0; r < BRICK_ROWS; r++) {
            const brickColor = BRICK_COLORS[r];
            let hp = 1;
            let textCol: number | undefined = undefined;

            // Mapping color to hit points and assigning the brighter text color
            if (brickColor === B_RED) { hp = 3; textCol = B_RED_TXT; }
            else if (brickColor === B_ORANGE) { hp = 3; textCol = B_ORANGE_TXT; }
            else if (brickColor === B_YELLOW) { hp = 2; textCol = B_YELLOW_TXT; }
            else if (brickColor === B_GREEN) { hp = 2; textCol = B_GREEN_TXT; }
            // Blue and Purple will default to 1 hit and NO textCol

            for (let c = 0; c < BRICK_COLS; c++) {
                bricks.push({
                    x: startX + c * BRICK_W,
                    y: BRICK_TOP + r * BRICK_H,
                    color: brickColor,
                    hp,
                    textCol,
                    alive: true,
                });
            }
        }

        user.data = {
            bgLayer, courtLayer, uiLayer, paddleLayer, ballLayer, itemLayer,
            paddleX: W / 2,
            paddleWidth: PADDLE_W,
            ballX: W / 2, ballY: H / 2, ballVX: 0, ballVY: 0,
            bricks, items: [], score: 0, lives: 3,
            serving: true, gameOver: false,
            shakeX: 0, shakeY: 0, particles: [], trail: [],
            paddleHitFlash: 0, ballFlashLife: 0,
            wideTimer: 0, superTimer: 0,
        };

        const registry = user.getInputBindingRegistry();
        registry.defineAxis(0, 'MX', [{ sourceId: 0, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight }]);
        registry.defineButton(1, 'ACTION', [{ sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.Space }]);

        this.resetBall(user.data);
    }

    private resetBall(d: BreakoutUserData) {
        d.serving = true;
        d.ballX = Math.floor(d.paddleX);
        d.ballY = PADDLE_Y - 1;
        d.ballVX = 0;
        d.ballVY = 0;
        d.trail = [];
        d.wideTimer = 0;
        d.superTimer = 0;
        d.paddleWidth = PADDLE_W;
        // Keep items on screen or clear? Let's keep them.
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<BreakoutUserData>) {
        const d = user.data;

        // ── 0. ABSOLUTE PHYSICS (Always runs, regardless of state) ──────────
        for (let i = d.items.length - 1; i >= 0; i--) {
            const it = d.items[i];

            // Gravity is constant and independent of game state
            const fallSpeed = it.y > PADDLE_Y ? 0.8 : 0.4;
            it.y += fallSpeed;

            // Collection Check (stopped once item passes the paddle depth)
            const canCollect = !d.gameOver && !d.serving && it.y <= PADDLE_Y + 0.5;
            if (canCollect && it.y >= PADDLE_Y - 1.5) {
                if (Math.abs(it.x - d.paddleX) < d.paddleWidth / 2 + 1.2) {
                    if (it.type === 'LIFE') d.lives = Math.min(5, d.lives + 1);
                    else if (it.type === 'WIDE') d.wideTimer = POWERUP_DURATION;
                    else if (it.type === 'SUPER') d.superTimer = POWERUP_DURATION;

                    d.items.splice(i, 1);
                    d.paddleHitFlash = BALL_FLASH_DURATION;
                    this.triggerShake(d, 0.2, 0);
                    continue;
                }
            }

            // Cleanup
            if (it.y > H + 10) d.items.splice(i, 1);
        }

        const move = user.getAxis('MX');

        // Visual Particles only
        for (let i = d.particles.length - 1; i >= 0; i--) {
            const p = d.particles[i];
            p.x += p.vx; p.y += p.vy; p.life -= 1;
            if (p.life <= 0) d.particles.splice(i, 1);
        }

        // ── 1. Game Timers ────────────────────────────────────────────────

        d.paddleX += move * 1.5;

        if (d.wideTimer > 0) {
            d.wideTimer -= 1;
            d.paddleWidth = PADDLE_W + 6;
            if (d.wideTimer <= 0) d.paddleWidth = PADDLE_W;
        }
        if (d.superTimer > 0) d.superTimer -= 1;

        if (!d.gameOver) {
            const halfP = d.paddleWidth / 2;
            d.paddleX = Math.max(3 + halfP, Math.min(W - 4 - halfP, d.paddleX));
        }

        if (!d.gameOver) {
            if (d.serving) {
                d.ballX = d.paddleX;
                if (!!user.getButton('ACTION')) {
                    d.serving = false;
                    d.ballVX = (Math.random() - 0.5) * 2;
                    d.ballVY = -BALL_SPEED_START;
                }
            } else {
                // 2. Ball Physics
                d.trail.unshift({ x: d.ballX, y: d.ballY });
                if (d.trail.length > TRAIL_LENGTH) d.trail.pop();

                d.ballX += d.ballVX;
                d.ballY += d.ballVY;

                // Walls
                if (d.ballX <= 3) { d.ballX = 3; d.ballVX *= -1; this.triggerShake(d, 0.5, 0); }
                if (d.ballX >= W - 4) { d.ballX = W - 4; d.ballVX *= -1; this.triggerShake(d, -0.5, 0); }
                if (d.ballY <= 3) { d.ballY = 3; d.ballVY *= -1; this.triggerShake(d, 0, 0.5); }

                // Paddle Collision
                if (d.ballVY > 0 && d.ballY >= PADDLE_Y - 1 && d.ballY <= PADDLE_Y) {
                    const px = Math.round(d.paddleX);
                    if (Math.abs(d.ballX - px) < d.paddleWidth / 2 + 1) {
                        d.ballY = PADDLE_Y - 1;
                        d.ballVY = -Math.abs(d.ballVY);
                        d.ballVX += (d.ballX - d.paddleX) * 0.4;
                        // Cap speed
                        const speed = Math.sqrt(d.ballVX * d.ballVX + d.ballVY * d.ballVY);
                        const angle = Math.atan2(d.ballVY, d.ballVX);
                        const newSpeed = Math.min(BALL_SPEED_MAX, speed + 0.05);
                        d.ballVX = Math.cos(angle) * newSpeed;
                        d.ballVY = Math.sin(angle) * newSpeed;

                        d.paddleHitFlash = BALL_FLASH_DURATION;
                        this.triggerShake(d, 0, -1);
                    }
                }

                // Brick Collision
                for (const b of d.bricks) {
                    if (!b.alive) continue;
                    if (d.ballX >= b.x && d.ballX < b.x + BRICK_W && d.ballY >= b.y && d.ballY < b.y + BRICK_H) {
                        if (d.superTimer > 0) {
                            b.hp = 0;
                        } else {
                            b.hp--;
                            d.ballVY *= -1;
                        }

                        if (b.hp <= 0) {
                            b.alive = false;
                            d.score += 10;
                            this.spawnParticles(d, d.ballX, d.ballY, b.color);
                            this.triggerShake(d, 0, 0.3);

                            // Power-up spawn
                            if (Math.random() < POWERUP_CHANCE) {
                                const types: PowerUpType[] = ['LIFE', 'WIDE', 'SUPER'];
                                const type = types[Math.floor(Math.random() * types.length)];
                                d.items.push({ x: b.x + BRICK_W / 2, y: b.y, type, alive: true });
                            }
                        } else {
                            d.score += 2; // small score for hitting a brick without breaking it
                            this.triggerShake(d, 0, 0.1);
                            b.flashTimer = 4; // Add a brief 4-frame flash
                        }

                        d.ballFlashLife = BALL_FLASH_DURATION;
                        if (d.superTimer <= 0) break;
                    }
                }
                // Win condition check: are there any bricks left?
                if (!d.bricks.some(b => b.alive)) {
                    d.gameOver = true;
                    d.items = []; // Clear items on win
                }

                // Death
                if (d.ballY > H) {
                    d.lives--;
                    if (d.lives <= 0) d.gameOver = true;
                    else this.resetBall(d);
                }
            }
        }

        // 4. Shake Management
        d.shakeX *= SHAKE_DECAY; d.shakeY *= SHAKE_DECAY;
        const ox = Math.round(d.shakeX), oy = Math.round(d.shakeY);
        [d.courtLayer, d.uiLayer, d.paddleLayer, d.ballLayer, d.itemLayer].forEach(l => l.setOrigin(new Vector2(OX + ox, OY + oy)));

        if (d.paddleHitFlash > 0) d.paddleHitFlash--;
        if (d.ballFlashLife > 0) d.ballFlashLife--;

        this.draw(d);
    }

    private triggerShake(d: BreakoutUserData, sx: number, sy: number) {
        d.shakeX = sx * SHAKE_INTENSITY;
        d.shakeY = sy * SHAKE_INTENSITY;
    }

    private spawnParticles(d: BreakoutUserData, x: number, y: number, color: number) {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const life = Math.floor(PARTICLE_LIFE * (0.5 + Math.random() * 0.5));
            d.particles.push({
                x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                life, maxLife: life, color, char: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
            });
        }
    }

    private drawBigDigit(orders: any[], digit: number, x: number, y: number, color: number) {
        const grid = DIGITS[digit];
        if (!grid) return;
        for (let i = 0; i < grid.length; i++) {
            if (grid[i]) orders.push(OrderBuilder.char(x + (i % 3), y + Math.floor(i / 3), ' ', 255, color));
        }
    }

    private draw(d: BreakoutUserData) {
        const courtOrders: any[] = [];
        const uiOrders: any[] = [];
        const paddleOrders: any[] = [];
        const ballOrders: any[] = [];

        // ── 3. Frame (Z=1 courtLayer) ────────────────────────────────────────
        // Outer face
        courtOrders.push(OrderBuilder.line(0, 0, W - 1, 0, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(0, 0, 0, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(W - 1, 0, W - 1, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        // Bevels
        courtOrders.push(OrderBuilder.line(1, 1, W - 2, 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(1, 1, 1, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(W - 2, 1, W - 2, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(2, 2, W - 3, 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(2, 2, 2, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(W - 3, 2, W - 3, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));

        // Bricks
        for (const b of d.bricks) {
            if (!b.alive) continue;

            if (b.flashTimer !== undefined && b.flashTimer > 0) b.flashTimer--;

            const isFlashing = b.flashTimer !== undefined && b.flashTimer > 0;
            const drawCol = isFlashing ? BALL_COLOR : b.color;

            courtOrders.push(OrderBuilder.rect(b.x, b.y, BRICK_W - 1, BRICK_H - 1, ' ', BG, drawCol, true));

            // Recompute textCol fallback for hot-reloads where it might be undefined
            let currentTextCol = b.textCol;
            if (currentTextCol === undefined && b.hp > 1) {
                if (b.color === B_RED) currentTextCol = B_RED_TXT;
                else if (b.color === B_ORANGE) currentTextCol = B_ORANGE_TXT;
                else if (b.color === B_YELLOW) currentTextCol = B_YELLOW_TXT;
                else if (b.color === B_GREEN) currentTextCol = B_GREEN_TXT;
            }

            if (currentTextCol !== undefined && b.hp > 0) {
                const currentHp = b.hp !== undefined && !isNaN(b.hp) ? b.hp : 1;
                courtOrders.push(OrderBuilder.text(b.x + 2, b.y, currentHp.toString(), currentTextCol, b.color));
            }
        }
        d.courtLayer.setOrders(courtOrders);

        // ── UI (Z=2) ────────────────────────────────────────────────────────
        let heartsStr = '';
        for (let i = 0; i < d.lives; i++) heartsStr += '♥';
        uiOrders.push(OrderBuilder.text(4, 1, heartsStr, B_RED, 255));
        let scoreStr = d.score.toString();
        while (scoreStr.length < 4) scoreStr = '0' + scoreStr;
        const scoreX = Math.floor(W / 2 - (scoreStr.length * 4) / 2);
        for (let i = 0; i < scoreStr.length; i++) {
            this.drawBigDigit(uiOrders, parseInt(scoreStr[i]), scoreX + i * 4, 1, SCORE_COLOR);
        }
        if (d.serving && !d.gameOver) uiOrders.push(OrderBuilder.text(Math.floor(W / 2 - 10), Math.floor(H / 2 + 6), 'PRESS SPACE TO START', B_BLUE, 255));
        if (d.gameOver) {
            const win = d.bricks.every(b => !b.alive);
            const msg = win ? 'YOU WIN!' : 'GAME OVER';
            uiOrders.push(OrderBuilder.text(Math.floor(W / 2 - msg.length / 2), Math.floor(H / 2), msg, win ? B_GREEN : B_RED, 255));
        }

        d.uiLayer.setOrders(uiOrders);

        // ── Paddle (Z=3) ─────────────────────────────────────────────────────
        const px = Math.round(d.paddleX), py = PADDLE_Y;
        const pw = d.paddleWidth;
        const gColor = d.paddleHitFlash > 0 ? PADDLE_HIT_GLOW : PADDLE_GLOW;
        paddleOrders.push(OrderBuilder.rect(px - pw / 2 - 1, py - 1, pw + 2, 3, ' ', BG, gColor, true));
        paddleOrders.push(OrderBuilder.rect(px - pw / 2, py, pw, 1, '█', PADDLE, 255, true));
        d.paddleLayer.setOrders(paddleOrders);

        // ── Items (Z=3) ────────────────────────────────────────────────────
        const itemOrders: any[] = [];
        for (const it of d.items) {
            let char = POWERUP_ICONS[it.type];
            let color = POWERUP_COLORS[it.type];
            // Sink effect: if passed the paddle, get smaller and darker
            if (it.y > PADDLE_Y + 0.5) {
                char = '·';
                color = FRAME_LO;
            }
            itemOrders.push(OrderBuilder.char(Math.round(it.x), Math.round(it.y), char, color, 255));
        }
        d.itemLayer.setOrders(itemOrders);

        // ── Ball & FX (Z=4) ──────────────────────────────────────────────────
        // Trail interpolation
        const trailDots: any[] = [];
        const trailColor = d.superTimer > 0 ? B_ORANGE : BALL_COLOR;
        const fullPath = [{ x: d.ballX, y: d.ballY }, ...d.trail];
        for (let i = 0; i < fullPath.length - 1; i++) {
            const p1 = fullPath[i], p2 = fullPath[i + 1];
            const color = [trailColor, BALL_MID, BALL_DIM][Math.min(i, 2)] || BALL_DIM;
            trailDots.push({ posX: Math.round(p2.x), posY: Math.round(p2.y), charCode: '·', fgColorCode: color, bgColorCode: 255 });
            const dx = p2.x - p1.x, dy = p2.y - p1.y, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1.2) {
                const steps = Math.floor(dist);
                for (let s = 1; s < steps; s++) {
                    trailDots.push({ posX: Math.round(p1.x + (dx * s) / steps), posY: Math.round(p1.y + (dy * s) / steps), charCode: '.', fgColorCode: color, bgColorCode: 255 });
                }
            }
        }
        if (trailDots.length) ballOrders.push(OrderBuilder.dotCloudMulti(trailDots));

        // Particles
        const pDots: any[] = [];
        for (const p of d.particles) {
            pDots.push({ posX: Math.round(p.x), posY: Math.round(p.y), charCode: p.char, fgColorCode: p.color, bgColorCode: 255 });
        }
        if (pDots.length) ballOrders.push(OrderBuilder.dotCloudMulti(pDots));

        if (!d.serving || Math.floor(Date.now() / 200) % 2) {
            const bColor = d.superTimer > 0 ? B_ORANGE : (d.ballFlashLife > 0 ? B_YELLOW : BALL_COLOR);
            ballOrders.push(OrderBuilder.char(Math.round(d.ballX), Math.round(d.ballY), '•', bColor, 255));
        }
        d.ballLayer.setOrders(ballOrders);
    }

    update() { }
}
```

---

## File: applications/showcase-11-minimal-example/index.ts

```typescript
/**
 * Name: showcase-11-minimal-example
 * Category: showcase
 * Description: A minimal interactive code example used for articles and tutorials.
 */
import {
    Engine,
    Layer,
    OrderBuilder,
    User,
    Display,
    Vector2,
    InputDeviceType,
    KeyboardInput,
    type IApplication,
    type IRuntime,
} from '@primitiv/engine';

interface PlayerData {
    layer: Layer;
    x: number;
    y: number;
}

export class MyGame implements IApplication<Engine, User<PlayerData>> {

    async init(runtime: IRuntime, engine: Engine) {
        engine.loadPaletteToSlot(0, [
            { colorId: 0, r: 0, g: 0, b: 0, a: 255 },
            { colorId: 1, r: 255, g: 255, b: 255, a: 255 },
            { colorId: 2, r: 0, g: 255, b: 0, a: 255 }
        ]);

        runtime.setTickRate(20);
    }

    async initUser(_runtime: IRuntime, _engine: Engine, user: User<PlayerData>) {
        const display = new Display(0, 40, 25);
        user.addDisplay(display);
        display.switchPalette(0);

        const layer = new Layer(new Vector2(0, 0), 0, 40, 25);
        user.addLayer(layer);

        user.data = { layer, x: 20, y: 12 };

        const registry = user.getInputBindingRegistry();
        registry.defineAxis(0, 'mx', [{
            sourceId: 0, type: InputDeviceType.Keyboard,
            negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight
        }]);
        registry.defineAxis(1, 'my', [{
            sourceId: 1, type: InputDeviceType.Keyboard,
            negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown
        }]);
    }

    update() {
        // Update common to all users.
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<PlayerData>) {
        const d = user.data;
        d.x = Math.max(0, Math.min(39, d.x + user.getAxis('mx')));
        d.y = Math.max(0, Math.min(24, d.y + user.getAxis('my')));

        // Set render for this user.
        d.layer.setOrders([
            OrderBuilder.text(0, 0, 'Arrow keys to move', 1, 255),
            OrderBuilder.char(d.x, d.y, '@', 2, 255),
        ]);
    }

    async destroyUser() {
        // Clean user data, save in db...
    }
}
```

---

## File: applications/showcase-3d-01-voxel-space/index.ts

```typescript
/**
 * Name: voxel-space
 * Category: showcase
 * Description: A pseudo-3D landscape renderer using the Voxel Space algorithm.
 *   Produces a continuous first-person flyover of
 *   a procedurally generated terrain - entirely inside a character-cell grid.
 *
 * What it demonstrates (engine perspective):
 *   Primitiv is not limited to 2D top-down or text UIs. By treating each cell
 *   as a colored pixel and sending a full 240×135 grid every tick, you can run
 *   arbitrary raster algorithms and display their output in real time.
 *   This showcase proves that a classical 3D technique from 1992 fits
 *   comfortably inside the engine's rendering pipeline at 60 FPS.
 *
 * How it works (algorithm):
 *   The Voxel Space algorithm renders depth slices front-to-back:
 *   1. For each depth value z from zNear to zFar (step dz), compute the
 *      left and right endpoints of the view frustum at that depth.
 *   2. Walk across those endpoints (one sample per screen column).
 *   3. Look up the terrain height h at the sampled (mapX, mapZ) position.
 *   4. Project h to a screen Y coordinate:
 *        heightOnScreen = (camY - h) / z * scaleHeight + pitch
 *   5. Draw a vertical line from heightOnScreen down to the column's current
 *      Y-buffer value (filling only newly visible pixels).
 *   6. Update the 1D Y-buffer so closer terrain occludes farther terrain.
 *   Sky is filled first as a simple top-to-bottom gradient, so any column
 *   not covered by terrain shows sky automatically.
 *
 *   Terrain generation is procedural: each map row is produced on demand
 *   using 4-octave fBm (fractional Brownian motion) noise and stored in a
 *   512×512 circular buffer. As the camera advances, new rows are generated
 *   ahead and old rows are silently overwritten - the world is infinite.
 *
 *   Colors are pre-computed per cell into a `colormap` array alongside the
 *   `heightmap`. Height bands (water, grass, rock, snow) are shaded using a
 *   side-slope lighting approximation and mapped to palette color IDs.
 *
 * Primitiv patterns used:
 *   - `subFrameMulti(0, 0, WIDTH, HEIGHT, dots)` - the entire 240×135 frame
 *     (~32 400 cells) is assembled in a flat array each tick and sent as a
 *     single binary order. This is the most bandwidth-intensive order type;
 *     it is acceptable here because the display is fixed-resolution and the
 *     runtime is standalone (no network hop).
 *   - `mustBeReliable: false` on the game layer - the renderer produces a
 *     new complete frame every tick, so a dropped frame is invisible; UDP-
 *     style lossy delivery avoids head-of-line blocking on the game layer.
 *   - `mustBeReliable: true` on the UI layer - the overlay text is static
 *     and must arrive exactly once without loss.
 *   - Palette-based color: 120+ palette entries cover the full terrain range
 *     (water gradient 11–30, grass 31–60, rock 61–90, snow 91–120, sky
 *     121–160). No per-cell RGB is transmitted - only a 1-byte color ID.
 *   - `ScalingMode.None` with a fixed 240×135 display - the renderer owns
 *     its resolution and does not adapt to window size.
 */
import {
  Engine,
  User,
  Layer,
  Display,
  Vector2,
  OrderBuilder,
  type IApplication,
  type IRuntime,
  ScalingMode,
} from "@primitiv/engine";

const WIDTH = 240;
const HEIGHT = 135;
const TICK_RATE = 60;
const TRANSPARENT = 255;

class VoxelEngine {
  public readonly mapSize = 512;
  public heightmap: Float32Array;
  public colormap: Uint8Array;
  public currentMaxZ = 0;

  constructor() {
    this.heightmap = new Float32Array(this.mapSize * this.mapSize);
    this.colormap = new Uint8Array(this.mapSize * this.mapSize);
    this.ensureZ(240); // Preload initial view distance
  }

  hash(n: number): number {
    return (Math.sin(n) * 43758.5453123) % 1.0;
  }

  noise(x: number, z: number): number {
    let pX = Math.floor(x);
    let pZ = Math.floor(z);
    let fX = x - pX;
    let fZ = z - pZ;

    fX = fX * fX * fX * (fX * (fX * 6.0 - 15.0) + 10.0);
    fZ = fZ * fZ * fZ * (fZ * (fZ * 6.0 - 15.0) + 10.0);

    let n = pX + pZ * 57.0;
    let res =
      (1.0 - fX) * (1.0 - fZ) * this.hash(n) +
      fX * (1.0 - fZ) * this.hash(n + 1.0) +
      (1.0 - fX) * fZ * this.hash(n + 57.0) +
      fX * fZ * this.hash(n + 58.0);
    return res;
  }

  fbm(x: number, z: number): number {
    let h = 0.0;
    let a = 0.5;
    // 4 octaves for precomputation
    for (let i = 0; i < 4; i++) {
      h += a * this.noise(x, z);
      x *= 2.0;
      z *= 2.0;
      a *= 0.5;
    }
    return h;
  }

  generateRow(z: number) {
    const mz = z & (this.mapSize - 1);
    for (let x = 0; x < this.mapSize; x++) {
      // Scale coordinates
      const nx = x * 0.03;
      const nz = z * 0.03;

      // Base Height - raised baseline so most terrain is well above water
      let h = this.fbm(nx, nz) * 50.0 + 20.0;

      // Adding a valley/river using absolute fbm
      let ridge = Math.abs(
        this.fbm(nx * 0.5 + 10.1, nz * 0.5 + 20.3) * 2 - 1.0,
      );
      h -= ridge * 8.0; // Moderate valleys
      if (h < 5.0) h = 5.0; // Ocean/river floor

      // Smooth out the terrain below water level
      if (h <= 5.3) {
        // gentle ripples on water
        h += this.noise(nx * 10, nz * 10) * 0.3;
      }

      const idx = x + mz * this.mapSize;
      this.heightmap[idx] = h;

      // Color based on height and slope
      const hRight =
        this.fbm((x + 1) * 0.03, nz) * 50.0 +
        20.0 -
        Math.abs(
          this.fbm((x + 1) * 0.03 * 0.5 + 10.1, nz * 0.5 + 20.3) * 2 - 1.0,
        ) *
        8.0;
      let slope = hRight - h; // Lighting from side
      let light = Math.max(0, Math.min(1.0, 0.4 + slope * 0.15));

      let colorCode = 0;
      if (h <= 5.5) {
        // Water
        colorCode = 11 + Math.min(19, Math.max(0, Math.floor(light * 19)));
      } else if (h < 25.0) {
        // Grass (wider band now)
        colorCode = 31 + Math.min(29, Math.max(0, Math.floor(light * 29)));
      } else if (h < 40.0) {
        // Rock/Dirt
        colorCode = 61 + Math.min(29, Math.max(0, Math.floor(light * 29)));
      } else {
        // Snow
        colorCode = 91 + Math.min(29, Math.max(0, Math.floor(light * 29)));
      }

      this.colormap[idx] = colorCode;
    }
  }

  ensureZ(zTarget: number) {
    // Generate missing rows up to the target Z
    while (this.currentMaxZ <= zTarget) {
      this.generateRow(this.currentMaxZ);
      this.currentMaxZ++;
    }
  }
}

interface VoxelData {
  gameLayer: Layer;
  uiLayer: Layer;
  time: number;
  camX: number;
  camY: number;
  camZ: number;
  camAngle: number;
  engine: VoxelEngine;
}

/**
 * VoxelSpace Application
 * Implementing IApplication<Engine, User<CustomDataType>> is the standard way
 * to create a Primitiv application. The Engine is passed for resource loading,
 * and the custom generic User type defines what state is kept per connected client.
 */
export class VoxelSpaceApp implements IApplication<Engine, User<VoxelData>> {
  /**
   * Global initialization (called once when the application starts).
   * Here we load global resources shared by all users, such as color palettes.
   */
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const palette = [];
    palette.push({ colorId: 0, r: 0, g: 0, b: 0 });

    // 1-10: UI
    for (let i = 1; i <= 10; i++)
      palette.push({ colorId: i, r: 255, g: 255, b: 255 });

    // 11-30: Water (Deep blue to light cyan)
    for (let i = 0; i < 20; i++) {
      const f = i / 19.0;
      palette.push({
        colorId: 11 + i,
        r: f * 40,
        g: 50 + f * 100,
        b: 150 + f * 105,
      });
    }

    // 31-60: Grass/Forest
    for (let i = 0; i < 30; i++) {
      const f = i / 29.0;
      palette.push({
        colorId: 31 + i,
        r: 10 + f * 40,
        g: 40 + f * 120,
        b: f * 40,
      });
    }

    // 61-90: Rock/Dirt
    for (let i = 0; i < 30; i++) {
      const f = i / 29.0;
      palette.push({
        colorId: 61 + i,
        r: 60 + f * 60,
        g: 30 + f * 60,
        b: 20 + f * 50,
      });
    }

    // 91-120: Snow/Ice
    for (let i = 0; i < 30; i++) {
      const f = i / 29.0;
      palette.push({
        colorId: 91 + i,
        r: 150 + f * 105,
        g: 150 + f * 105,
        b: 180 + f * 75,
      });
    }

    // 121-160: Sky gradient (Sunset/Dusk or clear sky)
    for (let i = 0; i < 40; i++) {
      const f = i / 39.0;
      palette.push({
        colorId: 121 + i,
        r: 20 + f * 100,
        g: 40 + f * 120,
        b: 100 + f * 155,
      });
    }

    engine.loadPaletteToSlot(0, palette);
    runtime.setTickRate(TICK_RATE);
  }

  /**
   * User initialization (called whenever a new client connects).
   * This is where we set up the user's private rendering environment:
   * their Displays (virtual viewports) and Layers (drawing surfaces).
   */
  initUser(_runtime: IRuntime, _engine: Engine, user: User<VoxelData>): void {
    // --- Layers Definition ---
    // Layers are stacked based on their ID.
    // 'mustBeReliable: false' is used for high-frequency data (like voxel rendering) where dropping a frame is okay.
    // 'mustBeReliable: true' ensures guaranteed delivery via WebSockets, ideal for static UI.
    const gameLayer = new Layer(new Vector2(0, 0), 0, WIDTH, HEIGHT, {
      mustBeReliable: false,
      name: "main",
    });
    const uiLayer = new Layer(new Vector2(0, 0), 1, WIDTH, HEIGHT, {
      mustBeReliable: true,
      name: "ui",
    });

    user.addLayer(gameLayer);
    user.addLayer(uiLayer);

    // --- Display Setup ---
    // A Display acts as a camera/viewport into the coordinate space defined by the Layers.
    const display = new Display(0, WIDTH, HEIGHT);
    user.addDisplay(display);

    // Assign a palette slot to this display. Without this, the screen remains black.
    display.switchPalette(0);

    // ScalingMode.None forces the engine to use the default scaling logic without any special upscaling rules.
    display.setScalingMode(ScalingMode.None);

    user.data = {
      gameLayer,
      uiLayer,
      time: 0,
      camX: 0,
      camY: 30, // Default altitude
      camZ: 0,
      camAngle: 0,
      engine: new VoxelEngine(),
    };
  }

  /**
   * Per-user logic loop (called every tick).
   * This is where gameplay logic, physics, and rendering orders are generated
   * based on the user's specific state and inputs.
   */
  updateUser(runtime: IRuntime, _engine: Engine, user: User<VoxelData>): void {
    const state = user.data;
    if (!state) return;

    state.time += 1 / runtime.getTickRate();

    // Endless runner flight: perfectly straight, solid mechanics
    state.camX = state.engine.mapSize / 2.0; // Centered
    state.camZ = state.time * 20.0; // Constant swift forward velocity
    state.camY = 60.0; // Fixed high altitude
    state.camAngle = 0.0; // Steady orientation straight forward (+Z)

    // As camera moves forward, endlessly generate terrain into circular buffer
    // Look ahead further to account for increased draw distance
    state.engine.ensureZ(Math.ceil(state.camZ + 240.0));

    const dots = new Array(WIDTH * HEIGHT);

    // 1. Draw Sky (Gradient from top to horizon)
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const skyIntensity = 1.0 - y / HEIGHT; // 1.0 at top, 0.0 at bottom
        const skyCol = 121 + Math.floor(skyIntensity * 39);
        dots[y * WIDTH + x] = {
          charCode: " ",
          fgColorCode: 0,
          bgColorCode: Math.min(160, Math.max(121, skyCol)),
        };
      }
    }

    const mapSize = state.engine.mapSize;
    const heightmap = state.engine.heightmap;
    const colormap = state.engine.colormap;

    // Render parameters
    const zNear = 1.0;
    const zFar = 200.0;
    const dz = 0.8; // Slightly larger depth steps to maintain performance over long distances
    const FOV = Math.PI / 3; // 60 degrees field of view

    // Pitch: defines horizon line base on screen.
    // Zero is the top of the screen. Negative values tilt the camera steeply downwards.
    const pitch = -5; // Steeper angle downward

    // Vector math for camera frustum
    const fwdX = Math.sin(state.camAngle);
    const fwdZ = Math.cos(state.camAngle);
    const rightX = Math.cos(state.camAngle);
    const rightZ = -Math.sin(state.camAngle);

    // 1D Z-Buffer to keep track of highest drawn pixel per column (Occlusion)
    const yBuffer = new Int32Array(WIDTH);
    for (let i = 0; i < WIDTH; i++) yBuffer[i] = HEIGHT; // Start empty at bottom

    // Voxel Space algorithm: Render from front (near) to back (far) vertical slices
    for (let z = zNear; z < zFar; z += dz) {
      // Half-width of the view line at depth z
      const lineHalfWidth = z * Math.tan(FOV / 2);

      // Left and Right endpoints in 2D space
      const pLeftX = state.camX + fwdX * z - rightX * lineHalfWidth;
      const pLeftZ = state.camZ + fwdZ * z - rightZ * lineHalfWidth;
      const pRightX = state.camX + fwdX * z + rightX * lineHalfWidth;
      const pRightZ = state.camZ + fwdZ * z + rightZ * lineHalfWidth;

      // Step size along the line between left and right endpoints
      const dx = (pRightX - pLeftX) / WIDTH;
      const dZLength = (pRightZ - pLeftZ) / WIDTH;

      for (let x = 0; x < WIDTH; x++) {
        // Ignore if column is completely filled to top of screen
        if (yBuffer[x] <= 0) continue;

        // Ray point on map
        const mapX = pLeftX + dx * x;
        const mapZ = pLeftZ + dZLength * x;

        const mx = Math.floor(mapX) & (mapSize - 1);
        const mz = Math.floor(mapZ) & (mapSize - 1);
        const mapIdx = mx + mz * mapSize;

        const h = heightmap[mapIdx];
        const colorCode = colormap[mapIdx];

        // Perspective projection: target screen y
        const scaleHeight = 50.0;
        let heightOnScreen = Math.floor(
          ((state.camY - h) / z) * scaleHeight + pitch,
        );

        // Fast clamp
        if (heightOnScreen < 0) heightOnScreen = 0;
        if (heightOnScreen >= HEIGHT) heightOnScreen = HEIGHT;

        // If this is physically higher on screen than what we previously drew
        if (heightOnScreen < yBuffer[x]) {
          // Draw vertical line down to previous highest pixel
          for (let y = heightOnScreen; y < yBuffer[x]; y++) {
            // Apply distance fog by blending towards sky color
            const fogFactor = z / zFar;

            let charCode = "▒";
            if (fogFactor > 0.6) charCode = "░";
            if (h <= 5.5) charCode = "≈"; // Water surface

            const fg = Math.min(120, colorCode + 2);
            dots[y * WIDTH + x] = {
              charCode,
              fgColorCode: fg,
              bgColorCode: colorCode,
            };
          }
          yBuffer[x] = heightOnScreen; // Set new occlusion limit for this column
        }
      }
    }

    // Use subFrameMulti to send the entire massive grid in one efficient binary payload.
    state.gameLayer.setOrders([
      OrderBuilder.subFrameMulti(0, 0, WIDTH, HEIGHT, dots as any),
    ]);
    // Layer commits are mandatory to signal the engine that data is ready to be sent to the client renderer.


    state.uiLayer.setOrders([
      OrderBuilder.text(1, 0, "Primitiv Voxel Space", 1, TRANSPARENT),
    ]);

  }
}
```

---

## File: applications/showcase-3d-02-primitiv-craft/index.ts

```typescript
/**
 * Name: primitiv-craft
 * Category: showcase
 * Description: A first-person 3D block world rendered entirely inside a character-cell
 *   grid using DDA voxel raycasting and a temporal palette animation system.
 *
 * What it demonstrates (engine perspective):
 *   This is the most technically ambitious Primitiv showcase. It combines three
 *   advanced engine features simultaneously:
 *   1. Temporal palette animation for a zero-cost day/night cycle.
 *   2. A full 3D raycaster producing a 120×67 pixel buffer per tick.
 *   3. A dual-layer architecture separating the costly game layer from the cheap UI layer.
 *
 * How it works (algorithm):
 *   The world is a 256×128×256 voxel grid stored in a flat Uint8Array.
 *   Each frame, a ray is cast for every screen pixel using the Digital Differential
 *   Analyzer (DDA) algorithm:
 *   1. The ray is initialized from the camera position in the view frustum direction.
 *   2. DDA steps through the voxel grid one cell at a time, advancing along whichever
 *      axis has the shortest remaining distance to its next grid boundary.
 *   3. On first non-air cell hit, the surface normal (from `side` tracking) determines
 *      face shading: top faces are brightest, side faces darker.
 *   4. A second shadow ray is cast toward the sun to determine occlusion.
 *   5. Water (block 6) is semi-transparent: the ray continues through it, recording
 *      the water surface entry, then renders the underwater block with a depth-blue tint.
 *   A separate flat cloudGrid (Uint8Array) stores cloud data at y=80–95, checked
 *   inline during the DDA walk without extra passes.
 *
 * Day/night cycle (palette animation):
 *   180 palettes are pre-computed during `init()` by interpolating 5 keyframes
 *   (sunrise → noon → sunset → night → sunrise). Every voxel material has 10 shading
 *   variants covering its light range. Changing the time of day costs exactly one call:
 *   `display.switchPalette(slotIndex)` - zero redraws, zero network payload for drawing.
 *
 * Primitiv patterns used:
 *   - `engine.loadPaletteToSlot(s, palette)` called 180 times in `init()` - the full
 *     day cycle is uploaded once and lives on the client; switching is instantaneous.
 *   - `display.switchPalette(paletteId)` called every tick - the cheapest possible
 *     way to change global scene lighting.
 *   - `subFrameMulti(0, 0, 120, 67, dots)` - 8 040 cells assembled as a flat array
 *     and sent as a single binary order each tick.
 *   - `mustBeReliable: false` on the game layer (DDA output) - a dropped frame is
 *     invisible since the next tick immediately replaces it.
 *   - `mustBeReliable: true` on the UI layer (crosshair, block selector) - static
 *     overlay that must arrive exactly once.
 *   - WASD + look movement via keyboard bindings with per-tick physics integration
 *     (gravity, jump impulse, AABB collision against the voxel grid).
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

// --- ENGINE TYPES & INTERFACES ---

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface RenderPixel {
  voxelId: number;
  depth: number;
  normal: Vector3;
  hitPos: Vector3;
  rayDir: Vector3;
  underwaterId?: number;
  underwaterDepth?: number;
}

export class Camera {
  pos: Vector3 = { x: 5, y: 5, z: 5 };
  yaw: number = 0;
  pitch: number = 0;
  fov: number = Math.PI / 3;
}

// --- VOXEL ENGINE (DDA RAYCASTING) ---
// Implementation of the Digital Differential Analyzer algorithm.
export class VoxelEngine {
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  render(
    grid: Uint8Array,
    dim: { x: number; y: number; z: number },
    camera: Camera,
    cloudGrid?: Uint8Array,
  ): RenderPixel[] {
    const frame: RenderPixel[] = [];
    const cosYaw = Math.cos(camera.yaw),
      sinYaw = Math.sin(camera.yaw);
    const cosPitch = Math.cos(camera.pitch),
      sinPitch = Math.sin(camera.pitch);
    const forward = { x: sinYaw * cosPitch, y: sinPitch, z: cosYaw * cosPitch };
    const right = { x: cosYaw, y: 0, z: -sinYaw };
    const up = {
      x: forward.y * right.z - forward.z * right.y,
      y: forward.z * right.x - forward.x * right.z,
      z: forward.x * right.y - forward.y * right.x,
    };
    const aspect = this.width / this.height,
      tanFOV = Math.tan(camera.fov / 2);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const sX = ((2 * (x + 0.5)) / this.width - 1) * aspect * tanFOV;
        const sY = (1 - (2 * (y + 0.5)) / this.height) * tanFOV;
        const rD = {
          x: forward.x + right.x * sX + up.x * sY,
          y: forward.y + right.y * sX + up.y * sY,
          z: forward.z + right.z * sX + up.z * sY,
        };
        const m = Math.sqrt(rD.x ** 2 + rD.y ** 2 + rD.z ** 2);
        const rayDir = { x: rD.x / m, y: rD.y / m, z: rD.z / m };
        frame.push(this.castRay(grid, dim, camera.pos, rayDir, cloudGrid));
      }
    }
    return frame;
  }

  private intersectBox(
    start: Vector3,
    dir: Vector3,
    dim: { x: number; y: number; z: number },
  ): { tMin: number; tMax: number } {
    let tmin = -Infinity,
      tmax = Infinity;
    const axes: ("x" | "y" | "z")[] = ["x", "y", "z"];
    for (const axis of axes) {
      if (dir[axis] !== 0) {
        let t1 = -start[axis] / dir[axis];
        let t2 = (dim[axis] - start[axis]) / dir[axis];
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (start[axis] < 0 || start[axis] >= dim[axis])
        return { tMin: 1, tMax: 0 };
    }
    return { tMin: tmin, tMax: tmax };
  }

  public castShadowRay(
    grid: Uint8Array,
    dim: { x: number; y: number; z: number },
    start: Vector3,
    dir: Vector3,
    maxDist: number,
  ): boolean {
    // Fast raycast towards the sun to check for occlusions.
    // If this returns true, the pixel is in shadow.
    const intersection = this.intersectBox(start, dir, dim);
    if (intersection.tMax < 0 || intersection.tMin > intersection.tMax)
      return false;
    let t = Math.max(0, intersection.tMin);
    let mapX = Math.floor(start.x + dir.x * t);
    let mapY = Math.floor(start.y + dir.y * t);
    let mapZ = Math.floor(start.z + dir.z * t);
    const dX = Math.abs(1 / dir.x),
      dY = Math.abs(1 / dir.y),
      dZ = Math.abs(1 / dir.z);
    let sX, sdX, sY, sdY, sZ, sdZ;
    if (dir.x < 0) {
      sX = -1;
      sdX = (start.x + dir.x * t - mapX) * dX;
    } else {
      sX = 1;
      sdX = (mapX + 1.0 - (start.x + dir.x * t)) * dX;
    }
    if (dir.y < 0) {
      sY = -1;
      sdY = (start.y + dir.y * t - mapY) * dY;
    } else {
      sY = 1;
      sdY = (mapY + 1.0 - (start.y + dir.y * t)) * dY;
    }
    if (dir.z < 0) {
      sZ = -1;
      sdZ = (start.z + dir.z * t - mapZ) * dZ;
    } else {
      sZ = 1;
      sdZ = (mapZ + 1.0 - (start.z + dir.z * t)) * dZ;
    }
    let dist = t;
    const totalMax = Math.min(maxDist, intersection.tMax);
    while (dist < totalMax) {
      if (sdX < sdY) {
        if (sdX < sdZ) {
          dist = t + sdX;
          sdX += dX;
          mapX += sX;
        } else {
          dist = t + sdZ;
          sdZ += dZ;
          mapZ += sZ;
        }
      } else {
        if (sdY < sdZ) {
          dist = t + sdY;
          sdY += dY;
          mapY += sY;
        } else {
          dist = t + sdZ;
          sdZ += dZ;
          mapZ += sZ;
        }
      }
      if (
        mapX < 0 ||
        mapX >= dim.x ||
        mapY < 0 ||
        mapY >= dim.y ||
        mapZ < 0 ||
        mapZ >= dim.z
      )
        break;
      const b = grid[mapY * (dim.x * dim.z) + mapZ * dim.x + mapX];
      if (b > 0 && b !== 6 && b < 10) return true;
    }
    return false;
  }

  private castRay(
    grid: Uint8Array,
    dim: { x: number; y: number; z: number },
    oS: Vector3,
    dir: Vector3,
    cloudGrid?: Uint8Array,
  ): RenderPixel {
    // Digital Differential Analyzer (DDA) initialization
    // We walk through the grid one voxel unit at a time.
    const intersect = this.intersectBox(oS, dir, dim);
    if (intersect.tMax < 0 || intersect.tMin > intersect.tMax)
      return {
        voxelId: 0,
        depth: Infinity,
        normal: { x: 0, y: 0, z: 0 },
        hitPos: { x: 0, y: 0, z: 0 },
        rayDir: { ...dir },
      };
    const tStart = Math.max(0, intersect.tMin);
    const start = {
      x: oS.x + dir.x * tStart,
      y: oS.y + dir.y * tStart,
      z: oS.z + dir.z * tStart,
    };
    let mX = Math.floor(start.x),
      mY = Math.floor(start.y),
      mZ = Math.floor(start.z);
    mX = Math.max(0, Math.min(dim.x - 1, mX));
    mY = Math.max(0, Math.min(dim.y - 1, mY));
    mZ = Math.max(0, Math.min(dim.z - 1, mZ));
    const dX = Math.abs(1 / dir.x),
      dY = Math.abs(1 / dir.y),
      dZ = Math.abs(1 / dir.z);
    let sX, sdX, sY, sdY, sZ, sdZ;
    if (dir.x < 0) {
      sX = -1;
      sdX = (start.x - mX) * dX;
    } else {
      sX = 1;
      sdX = (mX + 1.0 - start.x) * dX;
    }
    if (dir.y < 0) {
      sY = -1;
      sdY = (start.y - mY) * dY;
    } else {
      sY = 1;
      sdY = (mY + 1.0 - start.y) * dY;
    }
    if (dir.z < 0) {
      sZ = -1;
      sdZ = (start.z - mZ) * dZ;
    } else {
      sZ = 1;
      sdZ = (mZ + 1.0 - start.z) * dZ;
    }
    let side = 0,
      hit = false,
      maxSteps = 512;
    let waterSurface: {
      depth: number;
      normal: Vector3;
      hitPos: Vector3;
    } | null = null;
    let firstCloud: {
      voxelId: number;
      depth: number;
      normal: Vector3;
      hitPos: Vector3;
    } | null = null;

    while (!hit && maxSteps-- > 0) {
      // Cloud Check
      if (cloudGrid && mY >= 80 && mY <= 95 && !firstCloud) {
        const cVal = cloudGrid[mZ * dim.x + mX];
        if (cVal > 0) {
          const dOff = side === 0 ? sdX - dX : side === 1 ? sdY - dY : sdZ - dZ;
          firstCloud = {
            voxelId: 10,
            depth: tStart + dOff,
            normal: { x: 0, y: 1, z: 0 },
            hitPos: {
              x: oS.x + dir.x * (tStart + dOff),
              y: oS.y + dir.y * (tStart + dOff),
              z: oS.z + dir.z * (tStart + dOff),
            },
          };
          // We store the shade index in voxelId for the color logic (offset 91 + cVal)
          (firstCloud as any).shade = 9 - cVal;
        }
      }
      const idx = mY * (dim.x * dim.z) + mZ * dim.x + mX;
      const bid = grid[idx];
      if (bid > 0) {
        const dOff = side === 0 ? sdX - dX : side === 1 ? sdY - dY : sdZ - dZ;
        const totalDist = tStart + dOff;
        const normal = { x: 0, y: 0, z: 0 };
        if (side === 0) normal.x = -sX;
        if (side === 1) normal.y = -sY;
        if (side === 2) normal.z = -sZ;
        const hitPos = {
          x: oS.x + dir.x * totalDist,
          y: oS.y + dir.y * totalDist,
          z: oS.z + dir.z * totalDist,
        };
        if (bid === 6 && !waterSurface) {
          waterSurface = { depth: totalDist, normal, hitPos };
        } else if (bid !== 6) {
          hit = true;
          if (waterSurface)
            return {
              voxelId: 6,
              depth: waterSurface.depth,
              normal: waterSurface.normal,
              hitPos: waterSurface.hitPos,
              rayDir: { ...dir },
              underwaterId: bid,
              underwaterDepth: totalDist,
            };
          if (firstCloud && firstCloud.depth < totalDist)
            return {
              ...firstCloud,
              rayDir: { ...dir },
              underwaterId: bid,
              underwaterDepth: totalDist,
            } as any;
          return {
            voxelId: bid,
            depth: totalDist,
            normal,
            hitPos,
            rayDir: { ...dir },
          };
        }
      }
      if (sdX < sdY) {
        if (sdX < sdZ) {
          sdX += dX;
          mX += sX;
          side = 0;
        } else {
          sdZ += dZ;
          mZ += sZ;
          side = 2;
        }
      } else {
        if (sdY < sdZ) {
          sdY += dY;
          mY += sY;
          side = 1;
        } else {
          sdZ += dZ;
          mZ += sZ;
          side = 2;
        }
      }
      if (
        mX < 0 ||
        mX >= dim.x ||
        mY < 0 ||
        mY >= dim.y ||
        mZ < 0 ||
        mZ >= dim.z
      )
        break;
    }
    if (waterSurface)
      return {
        voxelId: 6,
        depth: waterSurface.depth,
        normal: waterSurface.normal,
        hitPos: waterSurface.hitPos,
        rayDir: { ...dir },
      };
    if (firstCloud) return { ...firstCloud, rayDir: { ...dir } } as any;
    return {
      voxelId: 0,
      depth: Infinity,
      normal: { x: 0, y: 0, z: 0 },
      hitPos: { x: 0, y: 0, z: 0 },
      rayDir: { ...dir },
    };
  }
}

// --- CONSTANTS ---
const WIDTH = 120,
  HEIGHT = 67,
  TICK_RATE = 30,
  TRANSPARENT = 255;
const DIM_X = 256,
  DIM_Y = 128,
  DIM_Z = 256;
const GRAVITY = -0.05,
  JUMP_IMPULSE = 0.35,
  PLAYER_HEIGHT = 1.8,
  EYE_HEIGHT = 1.6,
  PLAYER_RADIUS = 0.3,
  EPSILON = 0.005;

const OFF_GRASS = 1,
  OFF_DIRT = 11,
  OFF_STONE = 21,
  OFF_WOOD = 31,
  OFF_LEAVES = 41,
  OFF_WATER = 51,
  OFF_POPPY = 61,
  OFF_DANDELION = 71,
  OFF_TALL_GRASS = 81,
  OFF_CLOUD = 91;
const COL_WHITE = 101,
  COL_HALO = 102,
  COL_SKY = 0;
const CHAR_RAMP = ["█", "▓", "▒", "░", "·", "∙", ":", ".", ",", " "];

const MATERIAL_DEFS = {
  1: { name: "Grass", offset: OFF_GRASS, color: [110, 180, 80] },
  2: { name: "Dirt", offset: OFF_DIRT, color: [140, 110, 80] },
  3: { name: "Stone", offset: OFF_STONE, color: [150, 150, 150] },
  4: { name: "Wood", offset: OFF_WOOD, color: [110, 90, 70] },
  5: { name: "Leaves", offset: OFF_LEAVES, color: [80, 160, 80] },
  6: {
    name: "Water",
    offset: OFF_WATER,
    color: [70, 120, 200],
    chars: ["≈", "≈", "≋", "≋", " ", " ", " ", " ", " ", " "],
  },
  7: {
    name: "Poppy",
    offset: OFF_POPPY,
    color: [200, 70, 70],
    chars: ["*", "!", "i", ".", " ", " ", " ", " ", " ", " "],
  },
  8: {
    name: "Dandelion",
    offset: OFF_DANDELION,
    color: [210, 200, 70],
    chars: ["*", "!", "i", ".", " ", " ", " ", " ", " ", " "],
  },
  9: {
    name: "TallGrass",
    offset: OFF_TALL_GRASS,
    color: [100, 160, 80],
    chars: ["v", "v", "i", ".", " ", " ", " ", " ", " ", " "],
  },
  10: { name: "Cloud", offset: OFF_CLOUD, color: [240, 240, 240] },
};

interface Cloud {
  x: number;
  z: number;
  width: number;
  height: number;
  speed: number;
  opacity: number;
  phase: "fadein" | "solid" | "fadeout";
}

interface MinecraftUserData {
  gameLayer: Layer;
  uiLayer: Layer;
  engine: VoxelEngine;
  camera: Camera;
  grid: Uint8Array;
  playerPos: Vector3;
  velocity: Vector3;
  isGrounded: boolean;
  wasJumpPressed: boolean;
  worldTime: number;
  sunDir: Vector3;
  clouds: Cloud[];
  cloudGrid: Uint8Array;
}

/**
 * PrimitivCraft Application
 * Implementing IApplication<Engine, User<CustomDataType>> is the standard way
 * to create a Primitiv application. The Engine is passed for resource loading,
 * and the custom generic User type defines what state is kept per connected client.
 */
export class PrimitivCraft implements IApplication<
  Engine,
  User<MinecraftUserData>
> {
  /**
   * Global initialization (called once when the application starts).
   * Here we load global resources shared by all users, such as color palettes.
   */
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const lerpC = (a: number[], b: number[], f: number) =>
      a.map((v, i) => Math.floor(v + (b[i] - v) * f));

    // --- 1. SKY GRADIENT KEYFRAMES ---
    // Defines the color of Sky, Grass, and Sun at specific times of day (0.0 to 1.0).
    const keyframes = [
      {
        t: 0.0,
        sky: [255, 230, 150],
        grass: [120, 180, 80],
        sun: [255, 240, 200],
      }, // Sunrise Start
      {
        t: 0.1,
        sky: [135, 195, 255],
        grass: [120, 190, 90],
        sun: [255, 255, 255],
      }, // High Day Start (Softer Noon)
      {
        t: 0.4,
        sky: [135, 195, 255],
        grass: [120, 190, 90],
        sun: [255, 255, 255],
      }, // High Day End
      {
        t: 0.5,
        sky: [255, 210, 100],
        grass: [125, 140, 80],
        sun: [255, 230, 150],
      }, // Sunset Peak
      { t: 0.6, sky: [0, 0, 10], grass: [10, 20, 15], sun: [180, 200, 255] }, // Full Night Start (Gradual transition)
      { t: 0.9, sky: [0, 0, 10], grass: [10, 20, 15], sun: [180, 200, 255] }, // Full Night End
      {
        t: 1.0,
        sky: [255, 230, 150],
        grass: [120, 180, 80],
        sun: [255, 240, 200],
      }, // Loop back to Sunrise
    ];

    // --- 2. PRE-CALCULATE 180 PALETTES ---
    // We generate a unique palette for every 2 degrees of the sun's cycle.
    // This allows us to "animate" time by simply switching the active palette index.
    for (let s = 0; s < 180; s++) {
      const time = s / 180.0;
      let k1 = keyframes[0],
        k2 = keyframes[1];
      for (let i = 0; i < keyframes.length - 1; i++) {
        if (time >= keyframes[i].t && time <= keyframes[i + 1].t) {
          k1 = keyframes[i];
          k2 = keyframes[i + 1];
          break;
        }
      }
      const f = (time - k1.t) / (k2.t - k1.t);
      const curSky = lerpC(k1.sky, k2.sky, f);
      const curGrass = lerpC(k1.grass, k2.grass, f);
      const curSun = lerpC(k1.sun, k2.sun, f);

      const clamp = (c: number[]) =>
        c.map((v) => Math.max(0, Math.min(255, v)));
      const sSky = clamp(curSky),
        sSun = clamp(curSun),
        sGrass = clamp(curGrass);

      const palette: { colorId: number; r: number; g: number; b: number }[] = [
        { colorId: 0, r: sSky[0], g: sSky[1], b: sSky[2] },
      ];
      const addR = (
        offset: number,
        base: number[],
        isCloud: boolean = false,
      ) => {
        const skyLTC = (sSky[0] + sSky[1] + sSky[2]) / 765;
        const cloudDimmer = 0.2 + 0.8 * skyLTC;
        const materialColor = isCloud
          ? lerpC(base, sSun, 0.75).map((v) => Math.floor(v * cloudDimmer))
          : lerpC(base, sGrass, 0.3);
        for (let i = 0; i < 10; i++) {
          const f = i / 9.0;
          const finalColor = isCloud
            ? lerpC(materialColor, sSky, f)
            : materialColor.map((v) => Math.floor(v * (1.0 - i * 0.085)));
          palette.push({
            colorId: offset + i,
            r: Math.max(0, Math.min(255, finalColor[0])),
            g: Math.max(0, Math.min(255, finalColor[1])),
            b: Math.max(0, Math.min(255, finalColor[2])),
          });
        }
      };
      Object.keys(MATERIAL_DEFS).forEach((k) => {
        const m = (MATERIAL_DEFS as any)[k];
        addR(m.offset, m.color, parseInt(k) === 10);
      });
      palette.push({ colorId: 101, r: sSun[0], g: sSun[1], b: sSun[2] }); // Sun Disc

      // Refined Halo: Mix sky and white for a natural glow without overflow
      const haloColor = lerpC(sSky, [255, 255, 255], 0.4);
      palette.push({
        colorId: 102,
        r: Math.min(255, Math.floor(haloColor[0] * 1.2)),
        g: Math.min(255, Math.floor(haloColor[1] * 1.2)),
        b: Math.min(255, Math.floor(haloColor[2] * 1.2)),
      });
      engine.loadPaletteToSlot(s, palette);
    }
    runtime.setTickRate(TICK_RATE);
  }

  /**
   * Called when a user joins. Initializes the world, player state, and input bindings.
   *
   * @param runtime The execution runtime
   * @param engine The Primitiv engine instance
   * @param user The user object to attach data to
   */
  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<MinecraftUserData>,
  ): void {
    // --- Layers Definition ---
    // 'mustBeReliable: false' is used for high-frequency data (like 3D raycasting) where dropping a frame is okay.
    // 'mustBeReliable: true' ensures guaranteed delivery via WebSockets, ideal for static UI.
    const gameLayer = new Layer(new Vector2(0, 0), 0, WIDTH, HEIGHT, {
      mustBeReliable: false,
      name: "gameLayer",
    });
    const uiLayer = new Layer(new Vector2(0, 0), 1, WIDTH, HEIGHT, {
      mustBeReliable: true,
      name: "uiLayer",
    });
    user.addLayer(gameLayer);
    user.addLayer(uiLayer);

    // --- Display Setup ---
    // A Display acts as a camera/viewport. Assign a palette slot to it so it renders.
    const display = new Display(0, WIDTH, HEIGHT);
    user.addDisplay(display);
    display.switchPalette(0);

    const grid = this.generateGrid();

    // Populate volumetric clouds
    const clouds: Cloud[] = [];
    for (let i = 0; i < 8; i++)
      clouds.push({
        x: Math.random() * DIM_X,
        z: Math.random() * DIM_Z,
        width: 20 + Math.random() * 30,
        height: 20 + Math.random() * 40,
        speed: 0.05 + Math.random() * 0.1,
        opacity: 1,
        phase: "solid",
      });
    const cloudGrid = new Uint8Array(DIM_X * DIM_Z);

    user.data = {
      gameLayer,
      uiLayer,
      engine: new VoxelEngine(WIDTH, HEIGHT),
      camera: new Camera(),
      grid,
      playerPos: { x: 128, y: 80, z: 128 },
      velocity: { x: 0, y: 0, z: 0 },
      isGrounded: false,
      wasJumpPressed: false,
      worldTime: 0.25,
      sunDir: { x: 0.43, y: 0.86, z: 0.26 },
      clouds,
      cloudGrid,
    };

    // Find safe spawn y-position (Raycast down from sky)
    let sy = 80;
    for (let y = DIM_Y - 5; y >= 0; y--) {
      if (grid[y * (DIM_X * DIM_Z) + 128 * DIM_X + 128] > 0) {
        sy = y + 1 + EPSILON;
        break;
      }
    }
    user.data.playerPos.y = sy;
    this.setupInputBindings(user);
  }

  /**
   * Procedurally generates the voxel terrain using wave functions.
   * @returns A 1D array representing the 3D grid (Z * Y * X)
   */
  private generateGrid(): Uint8Array {
    const grid = new Uint8Array(DIM_X * DIM_Y * DIM_Z);
    const seaLevel = 25;
    for (let x = 0; x < DIM_X; x++) {
      for (let z = 0; z < DIM_Z; z++) {
        const hill =
          Math.sin(x * 0.04) * Math.cos(z * 0.04) * 15 + Math.sin(x * 0.1) * 4;
        const h = Math.floor(35 + hill);
        for (let y = 0; y <= h && y < DIM_Y; y++) {
          const idx = y * (DIM_X * DIM_Z) + z * DIM_X + x;
          if (y === h) {
            grid[idx] = 1;
            if (h >= seaLevel && Math.random() < 0.08) {
              const dIdx = (h + 1) * (DIM_X * DIM_Z) + z * DIM_X + x;
              if (h + 1 < DIM_Y) {
                const r = Math.random();
                if (r < 0.05) grid[dIdx] = 7;
                else if (r < 0.1) grid[dIdx] = 8;
                else grid[dIdx] = 9;
              }
            }
          } else if (y > h - 4) grid[idx] = 2;
          else grid[idx] = 3;
        }
        if (h < seaLevel) {
          for (let y = h + 1; y <= seaLevel; y++)
            grid[y * (DIM_X * DIM_Z) + z * DIM_X + x] = 6;
        }
      }
    }
    for (let t = 0; t < 120; t++)
      this.addTree(
        grid,
        20 + Math.floor(Math.random() * (DIM_X - 40)),
        20 + Math.floor(Math.random() * (DIM_Z - 40)),
      );
    return grid;
  }

  private addTree(grid: Uint8Array, x: number, z: number) {
    let h = 0;
    for (let y = DIM_Y - 1; y >= 0; y--) {
      if (
        grid[y * (DIM_X * DIM_Z) + z * DIM_X + x] > 0 &&
        grid[y * (DIM_X * DIM_Z) + z * DIM_X + x] < 6
      ) {
        h = y + 1;
        break;
      }
    }
    if (h <= 0 || h > DIM_Y - 12) return;
    const th = 5 + Math.floor(Math.random() * 3);
    for (let y = 0; y < th; y++)
      grid[(h + y) * (DIM_X * DIM_Z) + z * DIM_X + x] = 4;
    const lb = h + th - 2;
    for (let dy = 0; dy < 4; dy++) {
      const r = dy < 2 ? 2 : 1;
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const lx = x + dx,
            lz = z + dz,
            ly = lb + dy;
          if (lx >= 0 && lx < DIM_X && lz >= 0 && lz < DIM_Z && ly < DIM_Y) {
            const idx = ly * (DIM_X * DIM_Z) + lz * DIM_X + lx;
            if (grid[idx] === 0) grid[idx] = 5;
          }
        }
    }
  }

  private isColliding(grid: Uint8Array, pos: Vector3): boolean {
    const r = PLAYER_RADIUS,
      h = PLAYER_HEIGHT,
      dim = { x: DIM_X, y: DIM_Y, z: DIM_Z };
    for (const dy of [0, h / 2, h - 0.01])
      for (const dx of [-r, r])
        for (const dz of [-r, r]) {
          const cx = Math.floor(pos.x + dx),
            cy = Math.floor(pos.y + dy),
            cz = Math.floor(pos.z + dz);
          if (
            cx >= 0 &&
            cx < dim.x &&
            cy >= 0 &&
            cy < dim.y &&
            cz >= 0 &&
            cz < dim.z &&
            grid[cy * (dim.x * dim.z) + cz * dim.x + cx] > 0 &&
            grid[cy * (dim.x * dim.z) + cz * dim.x + cx] < 6
          )
            return true;
        }
    return false;
  }

  /**
   * Per-user logic loop (called every tick).
   * This is where gameplay logic, physics, and rendering orders are generated
   * based on the user's specific state and inputs.
   */
  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<MinecraftUserData>,
  ): void {
    const state = user.data;
    if (!state) return;

    // --- 1. TIME & LIGHTING UPDATE ---
    // Increment world time and swap palette to simulate day/night cycle
    state.worldTime = (state.worldTime + 0.0000463) % 1.0;
    const paletteId = Math.floor(state.worldTime * 179.9);
    user.getDisplays()[0].switchPalette(paletteId);

    // Update Clouds
    state.cloudGrid.fill(0);
    for (const cloud of state.clouds) {
      cloud.z = (cloud.z + cloud.speed) % DIM_Z;
      if (cloud.phase === "fadein") {
        cloud.opacity += 0.015;
        if (cloud.opacity >= 1) {
          cloud.opacity = 1;
          cloud.phase = "solid";
        }
      }
      if (cloud.phase === "fadeout") {
        cloud.opacity -= 0.01;
        if (cloud.opacity <= 0) {
          cloud.z = 0;
          cloud.phase = "fadein";
        }
      }
      if (cloud.phase === "solid" && cloud.z > DIM_Z * 0.95)
        cloud.phase = "fadeout";

      const shade = Math.floor(cloud.opacity * 9);
      for (let dx = 0; dx < cloud.width; dx++) {
        for (let dz = 0; dz < cloud.height; dz++) {
          const cx = Math.floor(cloud.x + dx) % DIM_X,
            cz = Math.floor(cloud.z + dz) % DIM_X;
          state.cloudGrid[cz * DIM_X + cx] = Math.max(
            state.cloudGrid[cz * DIM_X + cx],
            shade,
          );
        }
      }
    }

    const sunAngle = state.worldTime * Math.PI * 2;
    state.sunDir = { x: Math.cos(sunAngle), y: Math.sin(sunAngle), z: 0.2 };
    const mag = Math.sqrt(
      state.sunDir.x ** 2 + state.sunDir.y ** 2 + state.sunDir.z ** 2,
    );
    state.sunDir.x /= mag;
    state.sunDir.y /= mag;
    state.sunDir.z /= mag;

    // --- 3. PHYSICS & INPUT ---
    // Standard First-Person Controller logic
    const isRun = user.getButton("Run"),
      mS = isRun ? 0.45 : 0.22,
      rS = 0.1;
    state.camera.yaw += user.getAxis("LookX") * rS;
    state.camera.pitch = Math.max(
      -1.5,
      Math.min(1.5, state.camera.pitch + user.getAxis("LookY") * rS),
    );
    if (state.isGrounded) state.velocity.y = Math.max(0, state.velocity.y);
    state.velocity.y += GRAVITY;
    const jP = user.getButton("Jump");
    if (jP && !state.wasJumpPressed && state.isGrounded) {
      state.velocity.y = JUMP_IMPULSE;
      state.isGrounded = false;
    }
    state.wasJumpPressed = jP;
    const f = { x: Math.sin(state.camera.yaw), z: Math.cos(state.camera.yaw) },
      r = { x: Math.cos(state.camera.yaw), z: -Math.sin(state.camera.yaw) };
    const mi = { x: user.getAxis("MoveX"), z: user.getAxis("MoveZ") };
    const nv = {
      x: (f.x * mi.z + r.x * mi.x) * mS,
      z: (f.z * mi.z + r.z * mi.x) * mS,
    };
    let p = state.playerPos,
      v = state.velocity;
    p.y += v.y;
    if (this.isColliding(state.grid, p)) {
      if (v.y < 0) {
        state.isGrounded = true;
        p.y = Math.floor(p.y + Math.abs(v.y) + 0.1) + EPSILON;
      } else {
        p.y = Math.floor(p.y) - PLAYER_HEIGHT - EPSILON;
      }
      v.y = 0;
    } else {
      state.isGrounded = this.isColliding(state.grid, {
        x: p.x,
        y: p.y - 0.05,
        z: p.z,
      });
    }
    let ox = p.x;
    p.x += nv.x;
    if (this.isColliding(state.grid, p)) p.x = ox;
    let oz = p.z;
    p.z += nv.z;
    if (this.isColliding(state.grid, p)) p.z = oz;
    p.x = Math.max(0.6, Math.min(DIM_X - 0.6, p.x));
    p.z = Math.max(0.6, Math.min(DIM_Z - 0.6, p.z));
    if (p.y < -30) {
      p.y = 100;
      p.x = DIM_X / 2;
      p.z = DIM_Z / 2;
      v.y = 0;
    }
    state.camera.pos = { x: p.x, y: p.y + EYE_HEIGHT, z: p.z };

    // --- 4. VOXEL RENDERING ---
    // Heavy lifting happens here: Raycast the scene to get VoxelID + Depth + Normal
    const dim = { x: DIM_X, y: DIM_Y, z: DIM_Z };
    const pix = state.engine.render(
      state.grid,
      dim,
      state.camera,
      state.cloudGrid,
    );

    // --- 5. POST-PROCESSING & SHADING ---
    // Convert raw voxel hits into colored ASCII characters
    const dots = pix.map((pixP: any, i: any) => {
      const posX = i % WIDTH,
        posY = Math.floor(i / WIDTH);
      if (pixP.voxelId === 0) {
        const dotS =
          pixP.rayDir.x * state.sunDir.x +
          pixP.rayDir.y * state.sunDir.y +
          pixP.rayDir.z * state.sunDir.z;
        if (state.sunDir.y > -0.1) {
          if (dotS > 0.996)
            return {
              posX,
              posY,
              charCode: " ",
              fgColorCode: COL_WHITE,
              bgColorCode: COL_WHITE,
            };
          if (dotS > 0.985)
            return {
              posX,
              posY,
              charCode: " ",
              fgColorCode: COL_HALO,
              bgColorCode: COL_HALO,
            };
        }
        const dotM = -dotS;
        if (state.sunDir.y < 0.1) {
          if (dotM > 0.997)
            return {
              posX,
              posY,
              charCode: " ",
              fgColorCode: COL_WHITE,
              bgColorCode: COL_WHITE,
            };
          if (dotM > 0.993)
            return {
              posX,
              posY,
              charCode: " ",
              fgColorCode: COL_HALO,
              bgColorCode: COL_HALO,
            };
        }
        return {
          posX,
          posY,
          charCode: " ",
          fgColorCode: COL_SKY,
          bgColorCode: COL_SKY,
        };
      }
      let def = (MATERIAL_DEFS as any)[pixP.voxelId] || MATERIAL_DEFS[3];
      if (
        pixP.voxelId === 1 &&
        Math.abs(pixP.normal.y) < 0.1 &&
        pixP.hitPos.y % 1.0 <= 0.82
      )
        def = MATERIAL_DEFS[2];
      const sunDir = { ...state.sunDir };
      let nightFactor = 1.0;
      if (sunDir.y < 0) {
        sunDir.x = -sunDir.x;
        sunDir.y = -sunDir.y;
        sunDir.z = -sunDir.z;
        nightFactor = 0.35;
      }
      const sD =
        (pixP.normal.x * sunDir.x +
          pixP.normal.y * sunDir.y +
          pixP.normal.z * sunDir.z) *
        nightFactor;
      let dif = Math.max(0.05, sD * 0.75 + 0.25 * nightFactor);
      if (pixP.voxelId < 6 && dif > 0.1) {
        const sO = {
          x: pixP.hitPos.x + pixP.normal.x * 0.01,
          y: pixP.hitPos.y + pixP.normal.y * 0.01,
          z: pixP.hitPos.z + pixP.normal.z * 0.01,
        };
        if (state.engine.castShadowRay(state.grid, dim, sO, sunDir, 256))
          dif *= 0.4;
      }
      const sIdx =
        pixP.voxelId === 10
          ? (pixP as any).shade
          : Math.max(0, Math.min(9, 9 - Math.floor(dif * 9.9)));
      let fg = def.offset + sIdx,
        bg = def.offset + Math.min(9, sIdx + 2),
        char = (def.chars || CHAR_RAMP)[sIdx] || " ";
      if (pixP.voxelId === 6 && pixP.underwaterId) {
        const waterDepth = pixP.underwaterDepth! - pixP.depth,
          vis = Math.max(0, 1.0 - waterDepth * 0.35),
          uDef = (MATERIAL_DEFS as any)[pixP.underwaterId];
        if (vis > 0.05) {
          fg = uDef.offset + Math.min(9, sIdx + 2);
          bg = OFF_WATER + Math.min(9, Math.floor((1 - vis) * 6) + sIdx);
          char = "≈";
        } else {
          fg = OFF_WATER + Math.min(9, sIdx + 4);
          bg = OFF_WATER + Math.min(9, sIdx + 6);
        }
      }
      return { charCode: char, fgColorCode: fg, bgColorCode: bg };
    });
    // Use subFrameMulti to send the entire massive grid in one efficient binary payload.
    state.gameLayer.setOrders([
      OrderBuilder.subFrameMulti(0, 0, WIDTH, HEIGHT, dots as any),
    ]);
    // Layer commits are mandatory to signal the engine that data is ready to be sent to the client renderer.

    state.uiLayer.setOrders([
      OrderBuilder.text(
        1,
        0,
        "PRIMITIV CRAFT (DAY/NIGHT)",
        COL_WHITE,
        TRANSPARENT,
      ),
      OrderBuilder.text(
        1,
        1,
        `TIME: ${(state.worldTime * 24).toFixed(1)}h | XYZ: ${p.x.toFixed(1)} / ${p.y.toFixed(1)}`,
        COL_WHITE,
        TRANSPARENT,
      ),
      OrderBuilder.text(
        Math.floor(WIDTH / 2),
        Math.floor(HEIGHT / 2),
        "+",
        COL_WHITE,
        TRANSPARENT,
      ),
    ]);

  }

  /**
   * Binds physical inputs (like Keyboard) to semantic actions (like "MoveX").
   * This decoupled approach makes it easy to support gamepads or custom controls later.
   */
  private setupInputBindings(user: User<MinecraftUserData>): void {
    const r = user.getInputBindingRegistry();
    r.defineAxis(0, "MoveX", [
      {
        sourceId: 1,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.KeyA,
        positiveKey: KeyboardInput.KeyD,
      },
    ]);
    r.defineAxis(1, "MoveZ", [
      {
        sourceId: 2,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.KeyS,
        positiveKey: KeyboardInput.KeyW,
      },
    ]);
    r.defineAxis(2, "LookX", [
      {
        sourceId: 4,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowLeft,
        positiveKey: KeyboardInput.ArrowRight,
      },
    ]);
    r.defineAxis(3, "LookY", [
      {
        sourceId: 5,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowDown,
        positiveKey: KeyboardInput.ArrowUp,
      },
    ]);
    r.defineButton(0, "Jump", [
      { sourceId: 6, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
    ]);
    r.defineButton(1, "Run", [
      {
        sourceId: 7,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ShiftLeft,
      },
    ]);
  }
  update(_runtime: IRuntime, _engine: Engine): void { }
}
```

---

## File: applications/showcase-3d-03-ray-maze/index.ts

```typescript
/**
 * Name: ray-maze
 * Category: showcase
 * Description: A first-person maze runner using raycasting - inspired by the
 *   3D Maze screensaver from Windows 98. Navigate a 24×24 grid maze rendered at 240×135
 *   cells with depth-shaded walls, a floor/ceiling gradient, and billboard sprites.
 *
 * What it demonstrates (engine perspective):
 *   The maze proves that a classic 1990s 3D engine technique runs cleanly inside
 *   Primitiv's character-cell pipeline. Compared to showcase-02 (full 3D DDA), this
 *   algorithm is strictly 2D: each screen column fires a single horizontal ray and
 *   projects one vertical wall strip. The result is a locked-Y-axis first-person view
 *   that is visually compelling at a fraction of the computational cost.
 *
 * How it works (algorithm):
 *   1. For each screen column x, a ray is cast from the player position in the
 *      direction derived from the camera plane (field of view vector).
 *   2. DDA (Digital Differential Analyzer) steps the ray through the 2D grid one
 *      cell at a time until it hits a wall (MAP value > 0).
 *   3. The perpendicular wall distance is computed to avoid the fisheye effect:
 *        perpWallDist = (mapX - posX + (1 - stepX) / 2) / rayDirX  (X-side hit)
 *   4. The wall strip height on screen is: lineHeight = HEIGHT / perpWallDist.
 *      It is drawn centered on the horizon line.
 *   5. Ceiling and floor are filled with gradient color IDs that darken toward the
 *      center horizon - purely palette-based, no per-pixel computation.
 *   6. Sprites (polyhedra scattered in the maze) are sorted by distance and drawn
 *      as billboard columns after the wall pass, using the per-column ZBuffer to
 *      clip sprite pixels behind walls.
 *
 *   Movement is a discrete state machine (IDLE → MOVING / TURNING → IDLE) rather
 *   than free analog motion, giving the classic tile-stepping feel. A FLIPPING state
 *   handles a barrel-roll animation on command.
 *
 * Primitiv patterns used:
 *   - `subFrameMulti(0, 0, 240, 135, dots)` - 32 400 cells assembled per tick as
 *     a flat array and sent in one binary order, same pattern as voxel-space.
 *   - `mustBeReliable: false` on the game layer - full frame replaced every tick,
 *     loss is invisible.
 *   - `mustBeReliable: true` on the UI layer - static overlay (minimap, controls).
 *   - Palette-based depth shading: wall brightness is a color ID offset proportional
 *     to `perpWallDist`. No RGB math at draw time - only an index lookup.
 *   - ZBuffer (one float per column) stored in `user.data` as a plain array,
 *     reused each tick to clip sprite rendering behind walls.
 */
import {
  Engine,
  User,
  Layer,
  Display,
  Vector2,
  OrderBuilder,
  type IApplication,
  type IRuntime,
  ScalingMode,
} from "@primitiv/engine";

const WIDTH = 240;
const HEIGHT = 135;
const TICK_RATE = 60;
const TRANSPARENT = 255;

// Classic 24x24 Maze
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1],
  [1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1],
  [1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1],
  [1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1],
  [1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

interface RayMazeData {
  gameLayer: Layer;
  uiLayer: Layer;
  posX: number;
  posY: number;
  dirX: number;
  dirY: number;
  planeX: number;
  planeY: number;
  time: number;

  // Discrete state machine
  cellX: number;
  cellY: number;
  angle: number; // Current viewing angle
  targetAngle: number; // For rotations
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;

  animState: "MOVING" | "TURNING" | "IDLE" | "FLIPPING";
  animTimer: number;
  animDuration: number;

  // ZBuffer for sprite rendering
  ZBuffer: number[];
  isFlipped: boolean;
  rollAngle: number;
  startRollAngle: number;
  targetRollAngle: number;
}

interface Sprite {
  x: number;
  y: number;
  textureCode: number; // Index or ID for what to draw
}

const sprites: Sprite[] = [
  // Polyhedrons
  { x: 10.5, y: 10.5, textureCode: 3 },
  { x: 14.5, y: 14.5, textureCode: 3 },
  { x: 5.5, y: 9.5, textureCode: 3 },
  { x: 19.5, y: 12.5, textureCode: 3 },
  { x: 12.5, y: 3.5, textureCode: 3 },
  { x: 8.5, y: 20.5, textureCode: 3 },
  { x: 16.5, y: 6.5, textureCode: 3 },
  { x: 5.5, y: 18.5, textureCode: 3 },
];

/**
 * RayMaze Application
 * Implementing IApplication<Engine, User<CustomDataType>> is the standard way
 * to create a Primitiv application. The Engine is passed for resource loading,
 * and the custom generic User type defines what state is kept per connected client.
 */
export class RayMazeApp implements IApplication<Engine, User<RayMazeData>> {
  /**
   * Global initialization (called once when the application starts).
   * Here we load global resources shared by all users, such as color palettes.
   */
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const palette = [];
    palette.push({ colorId: 0, r: 0, g: 0, b: 0 }); // Black

    // 1-10: UI
    for (let i = 1; i <= 10; i++)
      palette.push({ colorId: i, r: 255, g: 255, b: 255 });

    // 11-40: Ceiling Gradient (Darker blue to black)
    for (let i = 0; i < 30; i++) {
      const f = i / 29.0;
      palette.push({ colorId: 11 + i, r: f * 20, g: f * 20, b: f * 60 });
    }

    // 41-70: Floor Gradient (Dark brown/red to black)
    for (let i = 0; i < 30; i++) {
      const f = i / 29.0;
      palette.push({ colorId: 41 + i, r: f * 160, g: f * 100, b: f * 50 });
    }

    // 71-100: Wall color group 1 (Gold/Yellow shaded)
    for (let i = 0; i < 30; i++) {
      const f = i / 29.0;
      palette.push({
        colorId: 71 + i,
        r: 50 + f * 205,
        g: 40 + f * 180,
        b: f * 100,
      });
    }

    // 101-130: Wall color group 2 (Silver/Cyan shaded)
    for (let i = 0; i < 30; i++) {
      const f = i / 29.0;
      palette.push({
        colorId: 101 + i,
        r: f * 150,
        g: 50 + f * 150,
        b: 100 + f * 155,
      });
    }

    // 131-160: Special wall (Red patterns)
    for (let i = 0; i < 30; i++) {
      const f = i / 29.0;
      palette.push({
        colorId: 131 + i,
        r: 100 + f * 155,
        g: f * 50,
        b: f * 50,
      });
    }

    engine.loadPaletteToSlot(0, palette);
    runtime.setTickRate(TICK_RATE);
  }

  /**
   * User initialization (called whenever a new client connects).
   * This is where we set up the user's private rendering environment:
   * their Displays (virtual viewports) and Layers (drawing surfaces).
   */
  initUser(_runtime: IRuntime, _engine: Engine, user: User<RayMazeData>): void {
    // --- Layers Definition ---
    // Layers are stacked based on their ID.
    // 'mustBeReliable: false' is used for high-frequency data (like 3D raycasting) where dropping a frame is okay.
    // 'mustBeReliable: true' ensures guaranteed delivery via WebSockets, ideal for static UI.
    const gameLayer = new Layer(new Vector2(0, 0), 0, WIDTH, HEIGHT, {
      mustBeReliable: false,
      name: "main",
    });
    const uiLayer = new Layer(new Vector2(0, 0), 1, WIDTH, HEIGHT, {
      mustBeReliable: true,
      name: "ui",
    });

    user.addLayer(gameLayer);
    user.addLayer(uiLayer);

    // --- Display Setup ---
    // A Display acts as a camera/viewport into the coordinate space defined by the Layers.
    const display = new Display(0, WIDTH, HEIGHT);
    user.addDisplay(display);

    // Assign a palette slot to this display. Without this, the screen remains black.
    display.switchPalette(0);

    // ScalingMode.None forces the engine to use the default scaling logic without any special upscaling rules.
    display.setScalingMode(ScalingMode.None);

    user.data = {
      gameLayer,
      uiLayer,
      time: 0,
      cellX: 1,
      cellY: 1,
      posX: 1.5,
      posY: 1.5,
      startX: 1.5,
      startY: 1.5,
      targetX: 1.5,
      targetY: 1.5,
      angle: 0.0,
      targetAngle: 0.0,
      dirX: 1,
      dirY: 0,
      planeX: 0,
      planeY: 0.66,
      animState: "IDLE",
      animTimer: 0,
      animDuration: 0,
      ZBuffer: new Array(WIDTH),
      isFlipped: false,
      rollAngle: 0.0,
      startRollAngle: 0.0,
      targetRollAngle: 0.0,
    };
  }

  /**
   * Per-user logic loop (called every tick).
   * This is where gameplay logic, physics, and rendering orders are generated
   * based on the user's specific state and inputs.
   */
  updateUser(
    runtime: IRuntime,
    _engine: Engine,
    user: User<RayMazeData>,
  ): void {
    const state = user.data;
    if (!state) return;

    state.time += 1 / runtime.getTickRate();

    // --- SEAMLESS SCREENSAVER STATE MACHINE ---
    let frameTime = 1 / runtime.getTickRate();

    // Loop to handle immediate transitions within the same frame
    while (frameTime > 0) {
      if (state.animState === "IDLE") {
        const dx = Math.round(Math.cos(state.angle));
        const dy = Math.round(Math.sin(state.angle));
        const nx = state.cellX + dx;
        const ny = state.cellY + dy;

        if (nx >= 0 && nx < 24 && ny >= 0 && ny < 24 && MAP[nx][ny] === 0) {
          state.animState = "MOVING";
          state.animTimer = 0;
          state.animDuration = 0.35; // increased speed
          state.startX = state.cellX + 0.5;
          state.startY = state.cellY + 0.5;
          state.targetX = nx + 0.5;
          state.targetY = ny + 0.5;
        } else {
          const leftAngle = state.angle - Math.PI / 2;
          const rightAngle = state.angle + Math.PI / 2;
          const check = (a: number) => {
            const ddx = Math.round(Math.cos(a));
            const ddy = Math.round(Math.sin(a));
            const tx = state.cellX + ddx;
            const ty = state.cellY + ddy;
            return (
              tx >= 0 && tx < 24 && ty >= 0 && ty < 24 && MAP[tx][ty] === 0
            );
          };
          const canL = check(leftAngle);
          const canR = check(rightAngle);
          state.animState = "TURNING";
          state.animTimer = 0;
          state.animDuration = 0.45; // slowed down turn speed for comfort
          state.targetAngle =
            canL && (!canR || Math.random() > 0.5) ? leftAngle : rightAngle;
        }
      }

      const dt = Math.min(frameTime, state.animDuration - state.animTimer);
      state.animTimer += dt;
      frameTime -= dt;

      // Interpolation
      const t = Math.min(1.0, state.animTimer / state.animDuration);

      if (state.animState === "MOVING") {
        // Linear interpolation for constant speed across cells
        state.posX = state.startX + (state.targetX - state.startX) * t;
        state.posY = state.startY + (state.targetY - state.startY) * t;
      } else if (state.animState === "TURNING") {
        // Smooth easing for turns
        const st = t * t * (3 - 2 * t);
        const curAngle = state.angle + (state.targetAngle - state.angle) * st;
        state.dirX = Math.cos(curAngle);
        state.dirY = Math.sin(curAngle);
        state.planeX = -state.dirY * 0.66;
        state.planeY = state.dirX * 0.66;
      } else if (state.animState === "FLIPPING") {
        // Smooth easing for camera roll flip
        const st = t * t * (3 - 2 * t);
        state.rollAngle =
          state.startRollAngle +
          (state.targetRollAngle - state.startRollAngle) * st;
      }

      if (state.animTimer >= state.animDuration) {
        let nextState = "IDLE";

        if (state.animState === "MOVING") {
          state.cellX = Math.round(state.targetX - 0.5);
          state.cellY = Math.round(state.targetY - 0.5);
          state.posX = state.targetX;
          state.posY = state.targetY;

          // Check for Polyhedron collision
          for (let i = 0; i < sprites.length; i++) {
            if (
              sprites[i].textureCode === 3 &&
              Math.round(sprites[i].x - 0.5) === state.cellX &&
              Math.round(sprites[i].y - 0.5) === state.cellY
            ) {
              nextState = "FLIPPING";
              state.startRollAngle = state.rollAngle;
              state.targetRollAngle = state.rollAngle + Math.PI;
              sprites[i].textureCode = 0; // Consume the polyhedron
            }
          }
        } else if (state.animState === "TURNING") {
          state.angle = state.targetAngle;
          state.dirX = Math.cos(state.angle);
          state.dirY = Math.sin(state.angle);
          state.planeX = -state.dirY * 0.66;
          state.planeY = state.dirX * 0.66;
        } else if (state.animState === "FLIPPING") {
          state.rollAngle = state.targetRollAngle;
          // Normalize roll angle to prevent very large floats over time
          if (state.rollAngle >= Math.PI * 2) {
            state.rollAngle -= Math.PI * 2;
          }
        }

        state.animState = nextState as any;
        state.animTimer = 0;
        if (nextState === "FLIPPING") {
          state.animDuration = 0.8; // Duration of the flip animation
        }
      }

      // Safety break if duration is 0 or something weird
      if (state.animDuration <= 0) break;
    }

    const dots = new Array(WIDTH * HEIGHT);

    // --- RAYCASTING (DDA) ---
    for (let x = 0; x < WIDTH; x++) {
      const cameraX = (2 * x) / WIDTH - 1;
      const rayDirX = state.dirX + state.planeX * cameraX;
      const rayDirY = state.dirY + state.planeY * cameraX;

      let mapX = Math.floor(state.posX);
      let mapY = Math.floor(state.posY);

      const deltaDistX = Math.abs(1 / rayDirX);
      const deltaDistY = Math.abs(1 / rayDirY);

      let stepX, stepY, sideDistX, sideDistY;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (state.posX - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - state.posX) * deltaDistX;
      }

      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (state.posY - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - state.posY) * deltaDistY;
      }

      let hit = 0,
        side = 0;
      while (hit === 0) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        if (MAP[mapX][mapY] > 0) hit = 1;
      }

      let perpWallDist =
        side === 0
          ? (mapX - state.posX + (1 - stepX) / 2) / rayDirX
          : (mapY - state.posY + (1 - stepY) / 2) / rayDirY;
      perpWallDist = Math.max(0.1, perpWallDist);

      const lineHeight = Math.floor(HEIGHT / perpWallDist);
      let drawStart = Math.max(0, Math.floor(-lineHeight / 2 + HEIGHT / 2));
      let drawEnd = Math.min(
        HEIGHT - 1,
        Math.floor(lineHeight / 2 + HEIGHT / 2),
      );

      let wallBaseColor = 71;
      if (mapX % 2 === 0 && mapY % 2 === 0) wallBaseColor = 101;
      if (mapX === 1 || mapY === 1 || mapX === 22 || mapY === 22)
        wallBaseColor = 131;

      // Stabilized Intensity (No flickering during movement)
      // Instead of calculating intensity per pixel distance, we use a fixed shading based on depth
      const depthFader = Math.max(0, Math.min(1.0, 1.0 - perpWallDist / 20.0));
      let colorIdx = Math.floor(depthFader * 29);

      // Hard directional shading
      if (side === 1) colorIdx = Math.floor(colorIdx * 0.6);

      // Calculate exact hit position on the wall for texturing
      const hitX = state.posX + perpWallDist * rayDirX;
      const hitY = state.posY + perpWallDist * rayDirY;

      let wallX = side === 0 ? hitY : hitX;
      wallX -= Math.floor(wallX);

      for (let y = 0; y < HEIGHT; y++) {
        const idx = y * WIDTH + x;
        if (y < drawStart) {
          // Procedural Ceiling (Stone Tiles)
          const currentY = HEIGHT / 2 - y;
          const rowDistance = (0.5 * HEIGHT) / currentY;
          const weight = rowDistance / perpWallDist;

          const ceilX = weight * hitX + (1.0 - weight) * state.posX;
          const ceilY = weight * hitY + (1.0 - weight) * state.posY;

          const tileSize = 2.0;
          const cx = ceilX / tileSize;
          const cy = ceilY / tileSize;

          const pcx = cx - Math.floor(cx);
          const pcy = cy - Math.floor(cy);

          const isTileGap = pcx < 0.05 || pcy < 0.05;
          const tileHash = Math.abs(Math.floor(cx) * 51 + Math.floor(cy) * 87);

          const ceilDepthFader = Math.max(
            0,
            Math.min(1.0, 1.0 - rowDistance / 20.0),
          );
          let ceilColorIdx = Math.floor(ceilDepthFader * 29);

          if (isTileGap) {
            ceilColorIdx = Math.max(0, ceilColorIdx - 15);
          } else {
            const variation = (tileHash % 4) - 2;
            ceilColorIdx = Math.max(0, Math.min(29, ceilColorIdx + variation));
          }

          const finalCeilCol = 11 + ceilColorIdx;

          let char = " ";
          const stoneNoise = Math.sin(ceilX * 10 + Math.cos(ceilY * 10));
          if (!isTileGap && stoneNoise > 0.5) char = "░";
          else if (!isTileGap && stoneNoise < -0.5) char = "▒";

          dots[idx] = {
            charCode: char,
            fgColorCode: Math.max(11, finalCeilCol - 5),
            bgColorCode: finalCeilCol,
          };
        } else if (y >= drawStart && y <= drawEnd) {
          // Procedural Brick Texture
          const wallYOffset = y - (-lineHeight / 2 + HEIGHT / 2);
          const wallY = wallYOffset / lineHeight;

          const numBricksX = 3;
          const numBricksY = 6;

          let brickX = wallX * numBricksX;
          let brickY = wallY * numBricksY;

          // Offset every other row
          if (Math.floor(brickY) % 2 === 1) brickX += 0.5;

          const bx = brickX - Math.floor(brickX);
          const by = brickY - Math.floor(brickY);

          // Mortar thresholds
          const isMortar = bx < 0.08 || by < 0.12;
          let finalColorIdx = colorIdx;

          if (isMortar) {
            // Darker line for mortar
            finalColorIdx = Math.max(0, finalColorIdx - 15);
          } else {
            // Brick color variation based on coordinate
            const brickHash = Math.abs(
              Math.floor(brickX) * 73 + Math.floor(brickY) * 31,
            );
            const variation = (brickHash % 5) - 2;
            finalColorIdx = Math.max(
              0,
              Math.min(29, finalColorIdx + variation),
            );
          }

          const finalColor = wallBaseColor + finalColorIdx;

          const SHADES = "█▓▒░@%#*+=-:. ";
          let shadeIdx = Math.floor((1.0 - depthFader) * SHADES.length);
          shadeIdx = Math.max(0, Math.min(SHADES.length - 1, shadeIdx));
          let char = SHADES[shadeIdx];

          if (isMortar) char = "█"; // Mortar is solid but darker

          const bgFinalIdx = Math.max(0, finalColorIdx - 5);
          dots[idx] = {
            charCode: char,
            fgColorCode: finalColor,
            bgColorCode: wallBaseColor + bgFinalIdx,
          };
        } else {
          const currentY = y - HEIGHT / 2;
          const rowDistance = (0.5 * HEIGHT) / currentY;
          const weight = rowDistance / perpWallDist;

          const floorX = weight * hitX + (1.0 - weight) * state.posX;
          const floorY = weight * hitY + (1.0 - weight) * state.posY;

          // Wood planks (smaller for higher density)
          const plankWidth = 0.15;
          const plankLength = 0.6;

          let fx = floorX / plankWidth;
          let fy = floorY / plankLength;

          // Offset every other plank
          if (Math.floor(fx) % 2 === 1) fy += 0.5;

          const px = fx - Math.floor(fx);
          const py = fy - Math.floor(fy);

          const isGap = px < 0.05 || py < 0.02 || px > 0.95 || py > 0.98;
          const plankHash = Math.abs(Math.floor(fx) * 11 + Math.floor(fy) * 31);

          const floorDepthFader = Math.max(
            0,
            Math.min(1.0, 1.0 - rowDistance / 20.0),
          );
          let floorColorIdx = Math.floor(floorDepthFader * 29);

          if (isGap) {
            floorColorIdx = Math.max(0, floorColorIdx - 15);
          } else {
            // Wood grain noise
            const grain =
              Math.sin(floorX * 30 + Math.sin(floorY * 10)) * 0.5 + 0.5;
            const plankVar = plankHash % 4;
            floorColorIdx = Math.max(
              0,
              Math.min(29, floorColorIdx + plankVar - Math.floor(grain * 4)),
            );
          }

          const finalFloorCol = 41 + floorColorIdx;
          dots[idx] = {
            charCode: " ",
            fgColorCode: 0,
            bgColorCode: finalFloorCol,
          };
        }
      }

      // Record ZBuffer for sprite casting
      state.ZBuffer[x] = perpWallDist;
    }

    // --- SPRITE CASTING ---
    // 1. Sort sprites from far to close
    const spriteOrder: { idx: number; dist: number }[] = [];
    for (let i = 0; i < sprites.length; i++) {
      const spriteDistance =
        (state.posX - sprites[i].x) * (state.posX - sprites[i].x) +
        (state.posY - sprites[i].y) * (state.posY - sprites[i].y);
      spriteOrder.push({ idx: i, dist: spriteDistance });
    }
    spriteOrder.sort((a, b) => b.dist - a.dist); // Descending

    // 2. Project sprites
    for (let i = 0; i < sprites.length; i++) {
      const spr = sprites[spriteOrder[i].idx];

      // translate sprite position to relative to camera
      const spriteX = spr.x - state.posX;
      const spriteY = spr.y - state.posY;

      // transform sprite with the inverse camera matrix
      // [ planeX   dirX ] -1                                       [ dirY      -dirX ]
      // [               ]       =  1/(planeX*dirY-dirX*planeY) *   [                 ]
      // [ planeY   dirY ]                                          [ -planeY  planeX ]

      const invDet =
        1.0 / (state.planeX * state.dirY - state.dirX * state.planeY); // required for correct matrix multiplication

      const transformX = invDet * (state.dirY * spriteX - state.dirX * spriteY);
      const transformY =
        invDet * (-state.planeY * spriteX + state.planeX * spriteY); // this is actually the depth inside the screen

      const spriteScreenX = Math.floor(
        (WIDTH / 2) * (1 + transformX / transformY),
      );

      // calculate height of the sprite on screen
      const spriteHeight = Math.abs(Math.floor(HEIGHT / transformY)); // using 'transformY' instead of the real distance prevents fisheye

      // calculate lowest and highest pixel to fill in current stripe
      let drawStartY = Math.floor(-spriteHeight / 2 + HEIGHT / 2);
      if (drawStartY < 0) drawStartY = 0;
      let drawEndY = Math.floor(spriteHeight / 2 + HEIGHT / 2);
      if (drawEndY >= HEIGHT) drawEndY = HEIGHT - 1;

      // calculate width of the sprite
      const spriteWidth = Math.abs(Math.floor(HEIGHT / transformY));
      let drawStartX = Math.floor(-spriteWidth / 2 + spriteScreenX);
      if (drawStartX < 0) drawStartX = 0;
      let drawEndX = Math.floor(spriteWidth / 2 + spriteScreenX);
      if (drawEndX >= WIDTH) drawEndX = WIDTH - 1;

      // Loop through every vertical stripe of the sprite on screen
      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        const texX =
          Math.floor(
            (256 * (stripe - (-spriteWidth / 2 + spriteScreenX)) * 16) /
            spriteWidth,
          ) / 256;
        // the conditions in the if are:
        // 1) it's in front of camera plane so you don't see things behind you
        // 2) it's on the screen (left)
        // 3) it's on the screen (right)
        // 4) ZBuffer, with perpendicular distance
        if (
          transformY > 0.1 &&
          stripe > 0 &&
          stripe < WIDTH &&
          transformY < state.ZBuffer[stripe]
        ) {
          for (let y = drawStartY; y < drawEndY; y++) {
            const d = y * 256 - HEIGHT * 128 + spriteHeight * 128; // 256 and 128 factors to avoid floats
            const texY = Math.floor((d * 16) / spriteHeight / 256);

            const idx = y * WIDTH + stripe;

            // Simple procedural textures
            const tx = texX;
            const ty = texY;

            const depthFader = Math.max(
              0,
              Math.min(1.0, 1.0 - transformY / 20.0),
            );

            // 3: Spiky Polyhedron
            if (spr.textureCode === 3) {
              const cx = tx - 8;
              const cy = ty - 8;
              const r2 = cx * cx + cy * cy;

              // Spin over time
              const angle = Math.atan2(cy, cx) + state.time * 2.0;

              // Calculate dynamic radius (spikes)
              const spikes = 6;
              const radius = 25 + Math.sin(angle * spikes) * 15;

              if (r2 < radius) {
                let char = "*";
                let col = 101; // silver
                if (r2 < radius * 0.3) {
                  char = "█";
                  col += 10;
                } // bright center
                else if (r2 < radius * 0.6) {
                  char = "▓";
                  col += 5;
                } else if (r2 < radius * 0.8) {
                  char = "▒";
                  col += 2;
                } else {
                  char = "░";
                  col -= 5;
                }

                // apply depth shading
                const shade = Math.floor((1.0 - depthFader) * 29);
                col = Math.min(130, Math.max(101, col + shade));

                dots[idx] = {
                  charCode: char,
                  fgColorCode: col,
                  bgColorCode: 0,
                };
              }
            }
          }
        }
      }
    }

    let finalDots = dots;

    // 2D Rotation of the final composite buffer (Camera Roll)
    const roll = state.rollAngle;
    if (Math.abs(roll % (Math.PI * 2)) > 0.01) {
      finalDots = new Array(WIDTH * HEIGHT);
      finalDots.fill({ charCode: " ", fgColorCode: 0, bgColorCode: 0 }); // Initialize with empty space

      const cosA = Math.cos(roll);
      const sinA = Math.sin(roll);
      const halfW = WIDTH / 2;
      const halfH = HEIGHT / 2;

      for (let x = 0; x < WIDTH; x++) {
        for (let y = 0; y < HEIGHT; y++) {
          const rx = x - halfW;
          const ry = y - halfH;

          const sx = Math.round(halfW + (rx * cosA + ry * sinA));
          const sy = Math.round(halfH + (-rx * sinA + ry * cosA));

          if (sx >= 0 && sx < WIDTH && sy >= 0 && sy < HEIGHT) {
            finalDots[y * WIDTH + x] = dots[sy * WIDTH + sx];
          }
        }
      }
    }

    // Use subFrameMulti to send the entire massive grid in one efficient binary payload.
    state.gameLayer.setOrders([
      OrderBuilder.subFrameMulti(0, 0, WIDTH, HEIGHT, finalDots as any),
    ]);
    // Layer commits are mandatory to signal the engine that data is ready to be sent to the client renderer.


    state.uiLayer.setOrders([
      OrderBuilder.text(2, 2, "Primitiv Maze Engine", 1, TRANSPARENT),
      OrderBuilder.text(
        2,
        4,
        `POS: [${state.posX.toFixed(1)}, ${state.posY.toFixed(1)}] | 60 FPS`,
        3,
        TRANSPARENT,
      ),
    ]);

  }
}
```

---

## File: applications/showcase-3d-04-wireframe-3d/index.ts

```typescript
/**
 * Name: Synthwave AI
 * Category: showcase
 * Description: Infinite retro-city dodging game with AI autopilot.
 *
 * What it demonstrates (engine perspective):
 *   This showcase demonstrates how the Primitiv engine can compute and rasterize 
 *   pure 3D vector graphics (lines) completely inside a 2D character-cell pipeline.
 *   It showcases custom implementation of Bresenham's line algorithm with math-based 3D 
 *   projection, custom depth-fog clipping, and pseudo-random procedural terrain generation.
 *
 * How it works (algorithm):
 *   1. A lightweight 3D Vector engine (projecting {x, y, z} coordinates onto a 2D plane)
 *      calculates the screen positions using simple frustum division.
 *   2. The map operates on an infinite scrolling treadmill constraint using a modulo step 
 *      on the camera Z. Objects (buildings, obstacles) that pass behind the camera are strictly 
 *      recycled and re-injected dynamically far off into the horizon grid.
 *   3. Mountains are fully procedural volumetric meshes generated using layered 
 *      sine/cosine noise functions connecting points on the X and Z axes.
 *   4. A custom Bresenham's line algorithm translates coordinate lines into 
 *      Primitiv pixel dots, complete with loop failsafes and depth clipping.
 *   5. An AI Autopilot Algorithm manages 100% of the movement natively: accelerating to a cruising 
 *      speed and computing real-time safety dodge trajectories on the X-axis.
 *
 * Primitiv patterns used:
 *   - Massive `dotCloudMulti` order payloads for high-density particle arrays (stars, sun slices, frame dots).
 *   - Painters Algorithm implementation for drawing Background objects (Sun, Stars) before Foregrounds (3D Lines).
 *   - Depth based visual geometry texturing: far away lines change their character symbols 
 *     ('#', '+', ':', '.') to simulate ASCII depth fog.
 */

import {
    Engine,
    User,
    Layer,
    Display,
    OrderBuilder,
    Vector2,
    KeyboardInput,
    InputDeviceType,
    ScalingMode,
    type IApplication,
    type IRuntime,
} from "@primitiv/engine";

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Building {
    x: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    color: number;
}

interface Obstacle {
    x: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    color: number;
    active: boolean;
}

interface WireframeUserData {
    layer: Layer;
    buildings: Building[];
    obstacles: Obstacle[];
    cameraZ: number;
    speed: number;
    cameraX: number;
    cameraY: number;
    score: number;
    gameOver: boolean;
    acceleration: number;
}

export class Wireframe3DShowcase implements IApplication<Engine, User<WireframeUserData>> {
    async init(_runtime: IRuntime, engine: Engine): Promise<void> {
        // Synthwave color palette
        engine.loadPaletteToSlot(0, [
            { colorId: 0, r: 5, g: 5, b: 20, a: 255 },       // Deep Dark Blue (Bg)
            { colorId: 1, r: 0, g: 255, b: 255, a: 255 },    // Neon Cyan (Buildings)
            { colorId: 2, r: 255, g: 0, b: 255, a: 255 },    // Neon Magenta (Road Grid)
            { colorId: 3, r: 255, g: 255, b: 0, a: 255 },    // Neon Yellow (Highlights/Score)
            { colorId: 4, r: 0, g: 0, b: 0, a: 255 },        // True Black (Text Bg)
            { colorId: 5, r: 255, g: 50, b: 50, a: 255 },    // Danger Red (Obstacles)
        ]);
        _runtime.setTickRate(60);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<WireframeUserData>): void {
        const width = 240;
        const height = 134; // Wide screen

        const display = new Display(0, width, height);
        display.setScalingMode(ScalingMode.None);

        // CRT scanlines for retro synthwave look
        display.setPostProcess({
            scanlines: {
                enabled: true,
                opacity: 0.2,
                pattern: 'horizontal',
                spacing: 3,
                thickness: 1,
                color: { r: 0, g: 0, b: 0 }
            }
        });

        // Ambilight edge glow (neon bleed around the display)
        display.setAmbientEffect({
            enabled: true,
            blur: 40,
            scale: 2.5,
            opacity: 1,
        });

        user.addDisplay(display);
        display.switchPalette(0);

        const layer = new Layer(new Vector2(0, 0), 0, width, height, {
            mustBeReliable: false,
        });
        user.data.layer = layer;
        user.addLayer(layer);

        this.resetGame(user.data);

        // Controls
        const registry = user.getInputBindingRegistry();
        registry.defineButton(0, "ACCELERATE", [{ sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowUp }]);
        registry.defineButton(1, "BRAKE", [{ sourceId: 2, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowDown }]);
        registry.defineButton(2, "LEFT", [{ sourceId: 3, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowLeft }]);
        registry.defineButton(3, "RIGHT", [{ sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowRight }]);
        registry.defineButton(4, "RESTART", [{ sourceId: 5, type: InputDeviceType.Keyboard, key: KeyboardInput.Space }]);
    }

    private resetGame(data: WireframeUserData) {
        data.cameraZ = 0;
        data.speed = 1.0;
        data.cameraX = 0;
        data.cameraY = 8; // Camera height
        data.score = 0;
        data.gameOver = false;
        data.acceleration = 0;

        // Generate buildings aligned on a neat grid
        data.buildings = [];
        for (let i = 0; i < 12; i++) {
            const z = i * 100; // Spaced evenly by 100 units
            this.spawnBuilding(data, z, 0); // Left Side
            this.spawnBuilding(data, z, 1); // Right Side
        }

        // Generate initial obstacles
        data.obstacles = [];
        for (let i = 1; i < 6; i++) {
            this.spawnObstacle(data, i * 150); // Spawn fewer, further out
        }
    }

    private spawnBuilding(data: WireframeUserData, z: number, side: number) {
        // Enormous city blocks for architectural scale
        let x = side === 0 ? -50 : 50;

        data.buildings.push({
            x: x,
            z: z,
            width: 40,   // Massive width
            height: 60 + Math.random() * 120, // Towering height
            depth: 40,   // Massive depth
            color: Math.random() > 0.8 ? 3 : 1 // Mostly Cyan, sometimes Yellow
        });
    }

    private spawnObstacle(data: WireframeUserData, z: number) {
        // Spawn randomly within the road bounds (X: -12 to 12)
        const x = (Math.random() * 24) - 12;
        data.obstacles.push({
            x: x,
            z: z,
            width: 6,
            height: 8,
            depth: 6,
            color: 5, // Danger Red
            active: true
        });
    }

    update(_runtime: IRuntime, _engine: Engine): void { }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<WireframeUserData>): void {
        const data = user.data;
        const display = user.getDisplay(0)!;
        const width = display.width;
        const height = display.height;

        // --- AI Autopilot & Game Logic ---
        if (data.gameOver) {
            this.resetGame(data); // Instant retry
        } else {
            // Speed control
            if (data.speed < 4.0) {
                data.acceleration = 0.05;
            } else {
                data.acceleration = 0;
            }
            data.speed = Math.min(4.0, Math.max(1.0, data.speed + data.acceleration));

            // Steering (faster when moving faster)
            const steerSpeed = 0.5 + (data.speed * 0.15);
            const roadMaxX = 14;

            // AI: Find closest obstacle
            let closestObs: Obstacle | null = null;
            let minDist = Infinity;
            for (const obs of data.obstacles) {
                if (obs.active && obs.z > data.cameraZ) {
                    const dist = obs.z - data.cameraZ;
                    if (dist < minDist && dist < 300) { // Look ahead distance
                        minDist = dist;
                        closestObs = obs;
                    }
                }
            }

            // AI: Steer to safety
            if (closestObs) {
                const safeDistX = (closestObs.width / 2) + 2.5;

                // Are we in the collision lane of the obstacle?
                if (Math.abs(data.cameraX - closestObs.x) < safeDistX) {
                    const dodgeLeft = closestObs.x - safeDistX;
                    const dodgeRight = closestObs.x + safeDistX;

                    const canGoLeft = dodgeLeft >= -roadMaxX;
                    const canGoRight = dodgeRight <= roadMaxX;

                    if (canGoLeft && (!canGoRight || Math.abs(data.cameraX - dodgeLeft) < Math.abs(data.cameraX - dodgeRight))) {
                        data.cameraX -= steerSpeed; // Dodge Left
                    } else if (canGoRight) {
                        data.cameraX += steerSpeed; // Dodge Right
                    }
                }
            } else {
                // Gently center if no obstacles to dodge
                if (data.cameraX > 0.5) data.cameraX -= steerSpeed * 0.5;
                else if (data.cameraX < -0.5) data.cameraX += steerSpeed * 0.5;
            }

            // Clamp camera X to stay somewhat near the road
            data.cameraX = Math.max(-roadMaxX, Math.min(roadMaxX, data.cameraX));

            // Move forward and increment score
            data.cameraZ += data.speed;
            data.score += data.speed * 0.1;

            // Collision Detection with Obstacles
            // Player is approximated as a box around cameraX, cameraZ
            const playerRadius = 2.0;

            for (const obs of data.obstacles) {
                if (!obs.active) continue;

                // Z-check first (is it nearby?)
                if (Math.abs(data.cameraZ - obs.z) < (obs.depth / 2 + playerRadius)) {
                    // X-check
                    if (Math.abs(data.cameraX - obs.x) < (obs.width / 2 + playerRadius)) {
                        data.gameOver = true;
                        data.speed = 0; // stop instantly
                        break;
                    }
                }
            }

            // Recycle buildings that passed behind camera
            for (const b of data.buildings) {
                if (b.z < data.cameraZ - 40) {
                    b.z += 12 * 100; // Move far ahead (12 blocks * 100 spacing)
                    b.height = 60 + Math.random() * 120; // Randomize new height when recycled
                }
            }

            // Recycle obstacles that passed behind camera
            for (const obs of data.obstacles) {
                if (obs.z < data.cameraZ - 20) {
                    // Spread them out more, less density
                    const difficultyFactor = Math.max(150, 400 - (data.score * 0.05));
                    obs.z = data.cameraZ + 800 + (Math.random() * difficultyFactor);
                    obs.x = (Math.random() * 24) - 12;
                    obs.active = true;
                }
            }
        }

        // --- Draw logic ---
        const o: any[] = [];

        // Allocate a flat FrameBuffer matching the showcase-03 pattern
        const dots = new Array(width * height);
        dots.fill({ charCode: " ", fgColorCode: 0, bgColorCode: 0 }); // Dark background

        // Draw Starry Sky
        // Use a consistent pseudo-random distribution for the stars
        for (let i = 0; i < 150; i++) {
            // Fill the whole top half of the screen
            const sx = Math.abs(Math.floor(Math.sin(i * 12.9898 + 78.233) * 43758.5453)) % width;
            const sy = Math.abs(Math.floor(Math.cos(i * 4.1414 + 1.234) * 54321.1234)) % Math.floor(height / 2 - 5);
            // Twinkle effect based on camera movement
            if ((Math.floor(data.cameraZ * 0.1) + i) % 10 > 3) {
                dots[sy * width + sx] = { charCode: '.', fgColorCode: 1, bgColorCode: 0 }; // Cyan stars
            }
        }

        // Draw Horizon Sun
        // We draw it before the wireframes relying on painters algorithm (back to front)
        const horizonY = Math.floor(height / 2) - 1;
        const sunCenterY = horizonY; // Keep it exactly on the horizon
        const sunRadius = 26;

        for (let sy = 0; sy < sunRadius; sy++) {
            // Cut slices of the sun for that retro grid effect
            if (sy % 4 !== 0) {
                const sliceWidth = Math.sqrt(sunRadius * sunRadius - sy * sy) * 2.2; // compensate character ratio
                const startX = Math.round(width / 2 - sliceWidth);
                const endX = Math.round(width / 2 + sliceWidth);
                const yPos = Math.round(sunCenterY - sy);

                // Clip mathematically below the horizon point
                if (yPos <= horizonY) {
                    for (let px = startX; px <= endX; px++) {
                        if (px >= 0 && px < width && yPos >= 0) {
                            dots[yPos * width + px] = { charCode: '=', fgColorCode: 3, bgColorCode: 0 }; // Yellow Sun slices
                        }
                    }
                }
            }
        }

        function drawLine(x0: number, y0: number, x1: number, y1: number, char: string, fg: number) {
            // Bresenham's line algorithm with clipping
            if (isNaN(x0) || isNaN(y0) || isNaN(x1) || isNaN(y1)) return; // Failsafe
            x0 = Math.round(x0); y0 = Math.round(y0);
            x1 = Math.round(x1); y1 = Math.round(y1);

            const dx = Math.abs(x1 - x0);
            const dy = Math.abs(y1 - y0);
            const sx = (x0 < x1) ? 1 : -1;
            const sy = (y0 < y1) ? 1 : -1;
            let err = dx - dy;

            let loopCount = 0;
            while (loopCount++ < 3000) {
                // Bounds check
                if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
                    dots[y0 * width + x0] = { charCode: char, fgColorCode: fg, bgColorCode: 0 };
                }
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x0 += sx; }
                if (e2 < dx) { err += dx; y0 += sy; }
            }
        }

        const fovScale = Math.min(width, height * 2) * 0.7; // Wider view

        function project(x: number, y: number, z: number): Vector2 | null {
            const relZ = z - data.cameraZ;
            if (relZ < 1) return null; // Behind camera

            const relX = x - data.cameraX;
            const relY = y - data.cameraY;

            const px = (relX / relZ) * fovScale + width / 2;
            const py = -(relY / relZ) * (fovScale * 0.5) + height / 2;
            return new Vector2(px, py);
        }

        function drawLine3D(p1: Vector3, p2: Vector3, fg: number) {
            // Simple Z-Clipping: if both points are behind the camera, early return
            if (p1.z - data.cameraZ < 1 && p2.z - data.cameraZ < 1) return;

            let v1 = { ...p1 };
            let v2 = { ...p2 };

            // If one is behind, interpolate its coordinates to Z=1 (near plane)
            if (v1.z - data.cameraZ < 1) {
                const t = (1 - (v1.z - data.cameraZ)) / (v2.z - v1.z);
                v1.x = v1.x + t * (v2.x - v1.x);
                v1.y = v1.y + t * (v2.y - v1.y);
                v1.z = data.cameraZ + 1;
            } else if (v2.z - data.cameraZ < 1) {
                const t = (1 - (v2.z - data.cameraZ)) / (v1.z - v2.z);
                v2.x = v2.x + t * (v1.x - v2.x);
                v2.y = v2.y + t * (v1.y - v2.y);
                v2.z = data.cameraZ + 1;
            }

            // Depth Fog / Dimming based on Z distance
            const avgZ = (v1.z + v2.z) / 2;
            const dist = avgZ - data.cameraZ;
            let char = '#'; // Near
            if (dist > 800) char = '.'; // Very Far
            else if (dist > 500) char = ':'; // Far
            else if (dist > 250) char = '+'; // Mid

            const proj1 = project(v1.x, v1.y, v1.z);
            const proj2 = project(v2.x, v2.y, v2.z);
            if (proj1 && proj2) {
                drawLine(proj1.x, proj1.y, proj2.x, proj2.y, char, fg);
            }
        }

        function drawBox(x: number, z: number, w: number, h: number, d: number, color: number) {
            const hw = w / 2;
            const hd = d / 2;

            const v0 = { x: x - hw, y: 0, z: z - hd };
            const v1 = { x: x + hw, y: 0, z: z - hd };
            const v2 = { x: x + hw, y: 0, z: z + hd };
            const v3 = { x: x - hw, y: 0, z: z + hd };

            const v4 = { x: x - hw, y: h, z: z - hd };
            const v5 = { x: x + hw, y: h, z: z - hd };
            const v6 = { x: x + hw, y: h, z: z + hd };
            const v7 = { x: x - hw, y: h, z: z + hd };

            // Bottom base
            drawLine3D(v0, v1, color); drawLine3D(v1, v2, color);
            drawLine3D(v2, v3, color); drawLine3D(v3, v0, color);
            // Top base
            drawLine3D(v4, v5, color); drawLine3D(v5, v6, color);
            drawLine3D(v6, v7, color); drawLine3D(v7, v4, color);
            // Pillars
            drawLine3D(v0, v4, color); drawLine3D(v1, v5, color);
            drawLine3D(v2, v6, color); drawLine3D(v3, v7, color);
        }

        // Draw Road (Magenta)
        const roadWidth = 14;
        drawLine3D({ x: -roadWidth, y: 0, z: data.cameraZ }, { x: -roadWidth, y: 0, z: data.cameraZ + 1000 }, 2);
        drawLine3D({ x: roadWidth, y: 0, z: data.cameraZ }, { x: roadWidth, y: 0, z: data.cameraZ + 1000 }, 2);

        // Infinite scroll effect using a modulo step on the camera Z
        const roadZStart = Math.floor(data.cameraZ / 20) * 20;
        for (let z = 0; z < 1000; z += 20) {
            const absZ = roadZStart + z;
            drawLine3D({ x: -roadWidth, y: 0, z: absZ }, { x: roadWidth, y: 0, z: absZ }, 2);

            // Draw center dashed lines for speed effect
            if (z % 80 < 40) {
                drawLine3D({ x: 0, y: 0, z: absZ }, { x: 0, y: 0, z: absZ + 20 }, 3); // Yellow Dashes
            }
        }

        // Draw Volumetric Mountains on the sides (Full 3D Terrain Grid)
        for (const side of [-1, 1]) {
            // X distances from center: going outwards from 120 to 320
            const xSteps = [120, 160, 200, 240, 280, 320];

            function getMountHeight(nx: number, nz: number) {
                const depth = nx - 100;
                const amp = depth * 0.8;

                // Gentle rolling hills using sine/cosine combinations
                let h = (Math.sin(nz * 0.006 + nx * 0.015) * 0.5 + 0.5) * amp * 1.5 +
                    (Math.cos(nz * 0.011 - nx * 0.02) * 0.5 + 0.5) * amp;
                return h;
            }

            for (let z = 0; z <= 1000; z += 40) {
                const absZ = roadZStart + z;

                for (let xi = 0; xi < xSteps.length; xi++) {
                    const nx = xSteps[xi];
                    const x = nx * side;
                    const h = getMountHeight(nx, absZ);
                    const p = { x: x, y: h, z: absZ };

                    // Connect along Z axis (depth)
                    if (z > 0) {
                        const prevAbsZ = absZ - 40;
                        const hPrevZ = getMountHeight(nx, prevAbsZ);
                        drawLine3D({ x: x, y: hPrevZ, z: prevAbsZ }, p, 2);
                    }

                    // Connect along X axis (horizontal width)
                    if (xi > 0) {
                        const prevNx = xSteps[xi - 1];
                        const prevX = prevNx * side;
                        const hPrevX = getMountHeight(prevNx, absZ);
                        drawLine3D({ x: prevX, y: hPrevX, z: absZ }, p, 2);
                    } else {
                        // Connect the first ridge to the flat ground smoothly
                        drawLine3D({ x: 90 * side, y: 0, z: absZ }, p, 2);
                    }
                }
            }
        }

        // Draw Buildings
        // Sort by distance back-to-front for slightly better overdraw rendering
        const visibleBuildings = data.buildings.filter(b => b.z > data.cameraZ - 20 && b.z < data.cameraZ + 1000);
        visibleBuildings.sort((a, b) => b.z - a.z);
        for (const b of visibleBuildings) {
            drawBox(b.x, b.z, b.width, b.height, b.depth, b.color);
        }

        // Draw Obstacles
        const visibleObstacles = data.obstacles.filter(o => o.z > data.cameraZ - 20 && o.z < data.cameraZ + 1000 && o.active);
        visibleObstacles.sort((a, b) => b.z - a.z);
        for (const obs of visibleObstacles) {
            drawBox(obs.x, obs.z, obs.width, obs.height, obs.depth, obs.color);
        }

        // Submit the entire processed 2D frame buffer as a single binary order
        o.push(OrderBuilder.subFrameMulti(0, 0, width, height, dots as any));

        // UI Overlay
        if (data.gameOver) {
            o.push(OrderBuilder.text(width / 2 - 9, height / 2 - 2, "   CRASHED!   ", 5, 0));
            o.push(OrderBuilder.text(width / 2 - 12, height / 2, ` FINAL SCORE: ${Math.floor(data.score)} `, 3, 0));
            o.push(OrderBuilder.text(width / 2 - 14, height / 2 + 2, " PRESS [SPACE] TO RESTART ", 1, 0));
        } else {
            o.push(OrderBuilder.text(1, 1, `  SYNTHWAVE AI AUTOPILOT  `, 4, 3));
            o.push(OrderBuilder.text(1, 3, `Speed: ${data.speed.toFixed(1)} `, 3, 4));
            o.push(OrderBuilder.text(1, 4, `Status: Active Dodging `, 1, 4));
            o.push(OrderBuilder.text(width - 20, 1, ` SCORE: ${Math.floor(data.score)} `, 3, 4));
        }

        data.layer.setOrders(o);

    }
}
```

---
