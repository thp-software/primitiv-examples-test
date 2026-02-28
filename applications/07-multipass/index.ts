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
 *   If you draw rain (`|`) over a brick wall (`#`), the brick CHARACTER disappears — replaced by
 *   the rain pipe — even though the brick's background color may still bleed through
 *   (when the rain uses a transparent background color 255).
 *   You lose the visual richness of overlapping characters.
 *
 *   THE SOLUTION: MULTIPASS RENDERING
 *   `display.setRenderPasses(...)` tells the engine to split the flattening process into
 *   multiple separate grids (passes), grouping Layers by zIndex ranges. The client then
 *   renders these grids on top of each other. This allows a rain character `|` in Pass 1
 *   to be drawn ON TOP of a brick character `#` in Pass 0 — BOTH characters are visible.
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
        wallLayer.commit();
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
        data.rainLayer.commit();
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
        data.uiLayer.commit();
    }

    update(_runtime: IRuntime, _engine: Engine): void { }
}
