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
    layer.commit();

  }

  // Global update (called every tick, independent of users).
  // Kept empty in this minimal example.
  update(_runtime: IRuntime, _engine: Engine): void { }
}
