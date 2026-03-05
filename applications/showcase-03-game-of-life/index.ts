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
