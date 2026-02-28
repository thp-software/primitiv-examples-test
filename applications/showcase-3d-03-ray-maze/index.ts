/**
 * Name: ray-maze
 * Category: showcase
 * Description: A first-person maze runner using raycasting — inspired by the
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
 *      center horizon — purely palette-based, no per-pixel computation.
 *   6. Sprites (polyhedra scattered in the maze) are sorted by distance and drawn
 *      as billboard columns after the wall pass, using the per-column ZBuffer to
 *      clip sprite pixels behind walls.
 *
 *   Movement is a discrete state machine (IDLE → MOVING / TURNING → IDLE) rather
 *   than free analog motion, giving the classic tile-stepping feel. A FLIPPING state
 *   handles a barrel-roll animation on command.
 *
 * Primitiv patterns used:
 *   - `subFrameMulti(0, 0, 240, 135, dots)` — 32 400 cells assembled per tick as
 *     a flat array and sent in one binary order, same pattern as voxel-space.
 *   - `mustBeReliable: false` on the game layer — full frame replaced every tick,
 *     loss is invisible.
 *   - `mustBeReliable: true` on the UI layer — static overlay (minimap, controls).
 *   - Palette-based depth shading: wall brightness is a color ID offset proportional
 *     to `perpWallDist`. No RGB math at draw time — only an index lookup.
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
  init(runtime: IRuntime, engine: Engine): void {
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
    state.gameLayer.commit();

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
    state.uiLayer.commit();
  }
}
