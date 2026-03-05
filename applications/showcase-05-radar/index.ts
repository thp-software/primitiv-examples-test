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
