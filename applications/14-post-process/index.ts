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
        data.layer.commit();
    }

    update(_runtime: IRuntime, _engine: Engine): void { }
}
