/**
 * Name: voxel-space
 * Category: showcase
 * Description: A pseudo-3D landscape renderer using the Voxel Space algorithm.
 *   Produces a continuous first-person flyover of
 *   a procedurally generated terrain — entirely inside a character-cell grid.
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
 *   ahead and old rows are silently overwritten — the world is infinite.
 *
 *   Colors are pre-computed per cell into a `colormap` array alongside the
 *   `heightmap`. Height bands (water, grass, rock, snow) are shaded using a
 *   side-slope lighting approximation and mapped to palette color IDs.
 *
 * Primitiv patterns used:
 *   - `subFrameMulti(0, 0, WIDTH, HEIGHT, dots)` — the entire 240×135 frame
 *     (~32 400 cells) is assembled in a flat array each tick and sent as a
 *     single binary order. This is the most bandwidth-intensive order type;
 *     it is acceptable here because the display is fixed-resolution and the
 *     runtime is standalone (no network hop).
 *   - `mustBeReliable: false` on the game layer — the renderer produces a
 *     new complete frame every tick, so a dropped frame is invisible; UDP-
 *     style lossy delivery avoids head-of-line blocking on the game layer.
 *   - `mustBeReliable: true` on the UI layer — the overlay text is static
 *     and must arrive exactly once without loss.
 *   - Palette-based color: 120+ palette entries cover the full terrain range
 *     (water gradient 11–30, grass 31–60, rock 61–90, snow 91–120, sky
 *     121–160). No per-cell RGB is transmitted — only a 1-byte color ID.
 *   - `ScalingMode.None` with a fixed 240×135 display — the renderer owns
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

      // Base Height — raised baseline so most terrain is well above water
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
