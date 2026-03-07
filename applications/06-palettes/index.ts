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
