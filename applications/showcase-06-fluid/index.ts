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
const DYE_DISS = 0.994; // ~17%/sec at 30 TPS — slower fade keeps field filled

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
  // Large figure-8, slow pulse — main large-scale mixer
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
  // Tight ellipse near centre, fast pulse — breaks core symmetry
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
  // Wide diagonal sweep, asymmetric pulse — long-range cross-mixing
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
    //   colorId 0   = (0,  0,  0) — black (background)
    //   colorId 215 = (255,255,255) — white
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
    // continuous stream — creating pockets of turbulence at irregular
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
    //       "."  (CP437  46) — single 1-px dot,   extreme wisps / star-dust
    //       "·"  (CP437 250) — middle dot,         faint cloud edges
    //       "░"  (CP437 176) — light shade  25%,   dim glow halo
    //       "▒"  (CP437 177) — medium shade 50%,   mid-density body
    //       "▓"  (CP437 178) — dark shade   75%,   bright inner region
    //       "█"  (CP437 219) — full block  100%,   injection cores only
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
          if      (lum > 0.78) cell.charCode = "█"; // full block   — cores only
          else if (lum > 0.52) cell.charCode = "▓"; // dark shade   75%
          else if (lum > 0.28) cell.charCode = "▒"; // medium shade 50%
          else if (lum > 0.10) cell.charCode = "░"; // light shade  25%
          else if (lum > 0.03) cell.charCode = "+"; // cross        — diffuse halo
          else                 cell.charCode = "."; // period       — extreme wisps
        }
      }
    }

    // ── 5. Commit to the display ──────────────────────────────────────────
    user.data.fluidLayer.setOrders([
      OrderBuilder.subFrameMulti(0, 0, W, H, frame as any),
    ]);
    user.data.fluidLayer.commit();
  }
}
