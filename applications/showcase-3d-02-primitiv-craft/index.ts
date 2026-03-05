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
 *   `display.switchPalette(slotIndex)` — zero redraws, zero network payload for drawing.
 *
 * Primitiv patterns used:
 *   - `engine.loadPaletteToSlot(s, palette)` called 180 times in `init()` — the full
 *     day cycle is uploaded once and lives on the client; switching is instantaneous.
 *   - `display.switchPalette(paletteId)` called every tick — the cheapest possible
 *     way to change global scene lighting.
 *   - `subFrameMulti(0, 0, 120, 67, dots)` — 8 040 cells assembled as a flat array
 *     and sent as a single binary order each tick.
 *   - `mustBeReliable: false` on the game layer (DDA output) — a dropped frame is
 *     invisible since the next tick immediately replaces it.
 *   - `mustBeReliable: true` on the UI layer (crosshair, block selector) — static
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
