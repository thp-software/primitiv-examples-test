/**
 * Name: showcase-04-spaceship
 * Category: showcase
 * Description: A spaceship interior with three navigable scenes (top-down map,
 *   cockpit, bureau). Each scene is a group of Layers placed at different
 *   X offsets in world space. Scene switching is done by moving the Display's
 *   origin to the target offset using `display.setOrigin()`.
 *
 * Architecture:
 *   Everything lives in this single file. The Spaceship class implements
 *   IApplication directly — there is no separate engine class.
 *
 * Scene Layout (world-space X offsets):
 *   - X=0:    Cockpit — 3D starfield (perspective projection), cockpit frame
 *             rendered once via fullFrameMulti, instrument panels, warp controls.
 *   - X=1000: Bureau — Side-view room with a porthole window, two monitor
 *             panels showing fuel/temperature gauges and module status.
 *   - X=2000: Top-down — ASCII map of the ship interior. The player (@) walks
 *             between seats marked C (cockpit) and B (bureau). Pressing F
 *             while adjacent to a seat switches to the corresponding scene.
 *
 * Palette Slots:
 *   - Slot 0: Base palette (9 colors)
 *   - Slots 1-12: Progressively red-shifted variants of the base palette,
 *     cycled with Math.sin() during warp to create a pulsing alarm effect.
 *   - Slot 13: Darkened variant used when power is off.
 *
 * Key Primitiv Concepts demonstrated:
 *   - Scene switching via Display.setOrigin() and Display.setSize()
 *   - dotCloudMulti for batched star rendering (800 stars in one order)
 *   - fullFrameMulti for the cockpit frame (rendered once in initUser)
 *   - Palette slot cycling for global color effects without re-rendering
 *   - mustBeReliable: true for static structure, false for stars/dynamic data
 *   - Dirty flag (topdownRenderNeeded) to avoid redundant reliable commits
 */

import { Display, Engine, type IApplication, InputDeviceType, type IRuntime, KeyboardInput, Layer, OrderBuilder, ScalingMode, User, Vector2 } from "@primitiv/engine";

const TICK_RATE = 30;
const STAR_COUNT = 800;
const MAX_Z = 1000;
const FOV = 250;

const COLOR_SPACE = 0;   // Deep Black
const COLOR_STAR_HI = 1; // Bright White
const COLOR_STAR_MD = 2; // Soft Blue
const COLOR_STAR_LO = 3; // Dim Red
const COLOR_HUD = 4;    // Neon Cyan
const COLOR_HUD_ALT = 5; // Alert Orange
const COLOR_FRAME = 6;   // Metallic Gray (Base)
const COLOR_FRAME_HI = 7; // Highlight
const COLOR_FRAME_LO = 8; // Shadow
const TRANSPARENT = 255;

// --- Ship Interior Map (pointing right →) ---
const SHIP_MAP_RAW = `
#########
E#....B.##
E#.......##
######....##
  #....@..C##
######....##
E#.......##
E#......##
#########
`;
// Clean up the raw string into array of lines, and find the spawn point `@`.
// We simultaneously replace `@` with `.` so it functions as a regular floor tile.
const SHIP_MAP_LINES = SHIP_MAP_RAW.replace(/^\n|\n$/g, "").split("\n");
let SPAWN_MAP_X = -1;
let SPAWN_MAP_Y = -1;

export const SHIP_MAP = SHIP_MAP_LINES.map((row, y) => {
    const spawnIdx = row.indexOf("@");
    if (spawnIdx !== -1) {
        SPAWN_MAP_X = spawnIdx;
        SPAWN_MAP_Y = y;
        return row.replace("@", ".");
    }
    return row;
});

interface Star {
    x: number;
    y: number;
    z: number;
    px: number; // Previous screen X
    py: number; // Previous screen Y
}

interface StarshipData {
    layer: Layer;
    uiLayer: Layer;
    cockpitLayer: Layer;
    instrumentsLayer: Layer;
    dynamicLayer: Layer;
    stars: Star[];
    width: number;
    height: number;
    speed: number;
    targetSpeed: number;
    fuel: number;
    temperature: number;
    pressure: number;
    terminalLogs: string[];
    lastLogTime: number;
    warpSequenceTimer: number; // 0 to 10000ms
    warpSequenceState: "NORMAL" | "STARTING" | "WARPING" | "STOPPING";
    isPowerOn: boolean;
    // Bureau Scene
    bureauStarsLayer: Layer;
    bureauStructureLayer: Layer;
    bureauInstrumentsLayer: Layer;
    bureauDynamicLayer: Layer;
    bureauStars: { x: number; speed: number; y: number; brightness: number }[];
    // Top-down Room Scene
    topdownStarsLayer: Layer;
    topdownLayer: Layer;
    playerX: number;
    playerY: number;
    moveCooldown: number;
    currentScene: "cockpit" | "bureau" | "topdown";
    lastScene: "cockpit" | "bureau" | "topdown" | "none";
    topdownRenderNeeded: boolean;
    display: Display;
}

export class Spaceship implements IApplication<Engine, User<StarshipData>> {
    private isForPreview: boolean;

    constructor(isForPreview = false) {
        this.isForPreview = isForPreview;
    }

    init(_runtime: IRuntime, engine: Engine): void {
        const basePalette = [
            { colorId: COLOR_SPACE, r: 2, g: 2, b: 8, },
            { colorId: COLOR_STAR_HI, r: 255, g: 255, b: 255 },
            { colorId: COLOR_STAR_MD, r: 150, g: 180, b: 255 },
            { colorId: COLOR_STAR_LO, r: 100, g: 50, b: 50 },
            { colorId: COLOR_HUD, r: 0, g: 255, b: 255 },
            { colorId: COLOR_HUD_ALT, r: 255, g: 100, b: 0 },
            { colorId: COLOR_FRAME, r: 40, g: 45, b: 60 },
            { colorId: COLOR_FRAME_HI, r: 80, g: 90, b: 110 },
            { colorId: COLOR_FRAME_LO, r: 15, g: 18, b: 25 },
        ];
        engine.loadPaletteToSlot(0, basePalette);

        // Generate 12 reddish alarm variations (slots 1 to 12) for smooth transition
        for (let i = 1; i <= 12; i++) {
            const mix = (i / 12) * 0.6; // Max 60% red for a less aggressive glow
            const redPalette = basePalette.map(c => {
                if (c.colorId === COLOR_SPACE || c.colorId === COLOR_STAR_HI || c.colorId === COLOR_STAR_MD || c.colorId === COLOR_STAR_LO) return c; // Don't colorize stars & space
                // Calculate relative luminance
                const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
                // Blend original color towards pure red of similar brightness
                const r = c.r * (1 - mix) + Math.min(255, lum * 1.5) * mix;
                const g = c.g * (1 - mix);
                const b = c.b * (1 - mix);
                return { colorId: c.colorId, r: Math.floor(r), g: Math.floor(g), b: Math.floor(b) };
            });
            engine.loadPaletteToSlot(i, redPalette);
        }

        // Generate 1 dark variation (slot 13) for dimming/alternating
        const darkPalette = basePalette.map(c => {
            if (c.colorId === COLOR_SPACE || c.colorId === COLOR_STAR_HI || c.colorId === COLOR_STAR_MD || c.colorId === COLOR_STAR_LO) return c; // Don't darken stars & space
            return {
                colorId: c.colorId,
                r: Math.floor(c.r * 0.3),
                g: Math.floor(c.g * 0.3),
                b: Math.floor(c.b * 0.3)
            };
        });
        engine.loadPaletteToSlot(13, darkPalette);
        _runtime.setTickRate(TICK_RATE);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<StarshipData>): void {
        const width = 120;
        const height = 67;
        const BUREAU_OFFSET = 1000;

        // Cockpit Scene Layers (world X=0)
        // Z0: Stars (unreliable, redrawn every frame)
        const layer = new Layer(new Vector2(0, 0), 0, width, height, { name: "space", mustBeReliable: false });
        // Z1: HUD reticle (reliable, rarely changes)
        const uiLayer = new Layer(new Vector2(0, 0), 1, width, height, { name: "hud", mustBeReliable: true });
        // Z2: Cockpit frame (reliable, rendered once in initUser)
        const cockpitLayer = new Layer(new Vector2(0, 0), 2, width, height, { name: "cockpit", mustBeReliable: true });
        // Z3: Static instrument labels and panel frames (reliable, rendered once)
        const instrumentsLayer = new Layer(new Vector2(0, 0), 3, width, height, { name: "instruments", mustBeReliable: true });
        // Z4: Dynamic instrument values — fuel bars, terminal logs (unreliable)
        const dynamicLayer = new Layer(new Vector2(0, 0), 4, width, height, { name: "dynamic", mustBeReliable: false });
        user.addLayer(layer);
        user.addLayer(uiLayer);
        user.addLayer(cockpitLayer);
        user.addLayer(instrumentsLayer);
        user.addLayer(dynamicLayer);

        // Bureau Scene Layers (world X=1000)
        const bureauStarsLayer = new Layer(new Vector2(BUREAU_OFFSET, 0), 0, width, height, { name: "bureau_stars", mustBeReliable: false });
        const bureauStructureLayer = new Layer(new Vector2(BUREAU_OFFSET, 0), 1, width, height, { name: "bureau_structure", mustBeReliable: true });
        const bureauInstrumentsLayer = new Layer(new Vector2(BUREAU_OFFSET, 0), 2, width, height, { name: "bureau_instruments", mustBeReliable: true });
        const bureauDynamicLayer = new Layer(new Vector2(BUREAU_OFFSET, 0), 3, width, height, { name: "bureau_dynamic", mustBeReliable: false });
        user.addLayer(bureauStarsLayer);
        user.addLayer(bureauStructureLayer);
        user.addLayer(bureauInstrumentsLayer);
        user.addLayer(bureauDynamicLayer);

        // Top-down Scene Layers (world X=2000)
        const TOPDOWN_OFFSET = 2000;
        const topdownStarsLayer = new Layer(new Vector2(TOPDOWN_OFFSET, 0), 0, width, height, { name: "topdown_stars", mustBeReliable: false });
        // topdownLayer is reliable — only committed when the player moves (topdownRenderNeeded flag)
        const topdownLayer = new Layer(new Vector2(TOPDOWN_OFFSET, 0), 1, width, height, { name: "topdown", mustBeReliable: true });
        user.addLayer(topdownStarsLayer);
        user.addLayer(topdownLayer);

        const display = new Display(0, width, height);
        display.setOrigin(new Vector2(TOPDOWN_OFFSET + 40, 22));
        display.setSize(new Vector2(40, 24)); // Zoomed in for topdown view
        user.addDisplay(display);
        display.switchPalette(0);
        display.setCellSize(8, 8);
        display.setScalingMode(ScalingMode.Quarter);

        // Cockpit 3D stars
        const stars: Star[] = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push(this.createStar(width, height));
        }

        // Bureau horizontal stars (simple parallax)
        const bureauStars: { x: number; speed: number; y: number; brightness: number }[] = [];
        for (let i = 0; i < 80; i++) {
            bureauStars.push({
                x: Math.random() * width,
                y: Math.floor(Math.random() * height),
                speed: 0.5 + Math.random() * 2,
                brightness: Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2
            });
        }

        user.data = {
            layer,
            uiLayer,
            cockpitLayer,
            instrumentsLayer,
            dynamicLayer,
            stars,
            width,
            height,
            speed: 5,
            targetSpeed: 5,
            fuel: 4000,
            temperature: 280,
            pressure: 1.0,
            terminalLogs: [
                "PRIMITIV-OS v4.2 BOOT COMPLETE",
                "CORE SYSTEMS... [NOMINAL]",
                "PRESS 'L' TO INITIATE WARP"
            ],
            lastLogTime: Date.now(),
            warpSequenceTimer: 0,
            warpSequenceState: "NORMAL",
            isPowerOn: true,
            // Bureau Scene
            bureauStarsLayer,
            bureauStructureLayer,
            bureauInstrumentsLayer,
            bureauDynamicLayer,
            bureauStars,
            // Topdown Scene
            topdownStarsLayer,
            topdownLayer,
            playerX: SPAWN_MAP_X !== -1 ? Math.floor((width - (SHIP_MAP[0]?.length || 0)) / 2) + SPAWN_MAP_X : Math.floor(width / 2),
            playerY: SPAWN_MAP_Y !== -1 ? Math.floor((height - SHIP_MAP.length) / 2) + SPAWN_MAP_Y : Math.floor(height / 2),
            moveCooldown: 0,
            currentScene: this.isForPreview ? "cockpit" : "topdown",
            lastScene: "none",
            topdownRenderNeeded: true,
            display
        };

        if (this.isForPreview) {
            user.data.warpSequenceState = "WARPING";
            user.data.speed = 20;
            user.data.targetSpeed = 20;
            display.setOrigin(new Vector2(0, 0));
            display.setSize(new Vector2(width, height));
        }

        // Render all static layers once (cockpit frame, instrument labels, bureau structure, ship map)
        this.setupInput(user);
        this.renderCockpit(user.data);
        this.renderInstruments(user.data);
        this.renderBureauStructure(user.data);
        this.renderBureauInstruments(user.data);
        this.renderTopDown(user.data);
    }

    private createStar(width: number, height: number, zFar = false): Star {
        return {
            x: (Math.random() - 0.5) * width * 10,
            y: (Math.random() - 0.5) * height * 10,
            z: zFar ? MAX_Z : Math.random() * MAX_Z,
            px: -1,
            py: -1,
        };
    }

    private setupInput(user: User<StarshipData>): void {
        const r = user.getInputBindingRegistry();

        // Warp Toggle (L)
        // Actions
        r.defineButton(1, "WarpToggle", [{ sourceId: 13, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyL }]);

        r.defineButton(10, "COM", [{ sourceId: 10, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyC }]);
        r.defineButton(11, "NAV", [{ sourceId: 11, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyN }]);
        r.defineButton(12, "O2", [{ sourceId: 12, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyO }]);
        r.defineButton(13, "RAD", [{ sourceId: 13, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyR }]);
        r.defineButton(14, "SHD", [{ sourceId: 14, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyS }]);
        r.defineButton(15, "PowerToggle", [{ sourceId: 15, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyY }]);

        // Top-down Room controls
        r.defineButton(20, "Interact", [{ sourceId: 20, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyF }]);
        r.defineButton(21, "MoveUp", [
            { sourceId: 21, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyW },
            { sourceId: 25, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowUp }
        ]);
        r.defineButton(22, "MoveDown", [
            { sourceId: 22, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyS },
            { sourceId: 26, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowDown }
        ]);
        r.defineButton(23, "MoveLeft", [
            { sourceId: 23, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyA },
            { sourceId: 27, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowLeft }
        ]);
        r.defineButton(24, "MoveRight", [
            { sourceId: 24, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyD },
            { sourceId: 28, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowRight }
        ]);
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<StarshipData>): void {
        const state = user.data;
        if (!state) return;

        const now = Date.now();
        const deltaMs = (1 / _runtime.getTickRate()) * 1000;

        if (state.currentScene === "topdown") {
            // Cooldown for grid movement
            state.moveCooldown -= deltaMs;

            const mapH = SHIP_MAP.length;
            const mapW = SHIP_MAP[0]?.length || 0;
            const offsetX = Math.floor((state.width - mapW) / 2);
            const offsetY = Math.floor((state.height - mapH) / 2);

            // Helper to check if a tile is walkable (takes screen coordinates)
            const isWalkable = (screenX: number, screenY: number) => {
                const x = screenX - offsetX;
                const y = screenY - offsetY;
                if (y < 0 || y >= SHIP_MAP.length) return false;
                if (x < 0 || x >= SHIP_MAP[y].length) return false;
                const char = SHIP_MAP[y][x];
                return char === "." || char === "C" || char === "B";
            };

            if (state.moveCooldown <= 0) {
                let moved = false;
                if (user.getButton("MoveUp") && isWalkable(state.playerX, state.playerY - 1)) { state.playerY--; moved = true; }
                else if (user.getButton("MoveDown") && isWalkable(state.playerX, state.playerY + 1)) { state.playerY++; moved = true; }
                else if (user.getButton("MoveLeft") && isWalkable(state.playerX - 1, state.playerY)) { state.playerX--; moved = true; }
                else if (user.getButton("MoveRight") && isWalkable(state.playerX + 1, state.playerY)) { state.playerX++; moved = true; }

                if (moved) {
                    state.moveCooldown = 80; // Fast walking pace
                    state.topdownRenderNeeded = true;
                }
            }

            // Interaction
            if (user.isJustPressed("Interact")) {
                // Check adjacent tiles for interactables
                const adj = [
                    { x: state.playerX, y: state.playerY - 1 },
                    { x: state.playerX, y: state.playerY + 1 },
                    { x: state.playerX - 1, y: state.playerY },
                    { x: state.playerX + 1, y: state.playerY },
                    { x: state.playerX, y: state.playerY } // Include standing on it
                ];

                let foundCockpit = false;
                let foundBureau = false;

                for (const pos of adj) {
                    const mapX = pos.x - offsetX;
                    const mapY = pos.y - offsetY;
                    if (mapY >= 0 && mapY < SHIP_MAP.length && mapX >= 0 && mapX < SHIP_MAP[mapY].length) {
                        const char = SHIP_MAP[mapY][mapX];
                        if (char === "C") foundCockpit = true;
                        if (char === "B") foundBureau = true;
                    }
                }

                if (foundCockpit) {
                    state.currentScene = "cockpit";
                    state.display.setOrigin(new Vector2(0, 0));
                    state.display.setSize(new Vector2(state.width, state.height));
                    this.addLog(state, "PILOT SEATED: COCKPIT ACTIVE");
                } else if (foundBureau) {
                    state.currentScene = "bureau";
                    state.display.setOrigin(new Vector2(1000, 0));
                    state.display.setSize(new Vector2(state.width, state.height));
                    this.addLog(state, "OFFICER SEATED: BUREAU ACTIVE");
                }
            }
        } else {
            // In a seat — press F to stand up
            if (user.isJustPressed("Interact")) {
                state.currentScene = "topdown";
                state.display.setOrigin(new Vector2(2040, 22));
                state.display.setSize(new Vector2(40, 24));
                state.topdownRenderNeeded = true;
                this.addLog(state, "SEAT VACATED");
            }
        }

        // 0. Power Toggle Logic
        const powerJustPressed = user.isJustPressed("PowerToggle");

        if (powerJustPressed) {
            state.isPowerOn = !state.isPowerOn;
            if (!state.isPowerOn) {
                this.addLog(state, "POWER: SYSTEM SHUTDOWN INITIATED");
                // If warping, emergency drop
                if (state.warpSequenceState !== "NORMAL") {
                    state.warpSequenceState = "STOPPING";
                    state.warpSequenceTimer = 2000; // Faster emergency stop
                }
            } else {
                this.addLog(state, "POWER: COLD BOOT SEQUENCE...");
                // Static layers are already rendered in initUser - no need to re-render
            }
        }

        // 1. Warp Sequence Logic (Keyboard toggle 'W')
        const warpJustPressed = user.isJustPressed("WarpToggle");

        if (state.isPowerOn && state.warpSequenceState === "NORMAL" && warpJustPressed && state.fuel > 0) {
            state.warpSequenceState = "STARTING";
            state.warpSequenceTimer = 5000; // 5 Seconds
            this.addLog(state, "WARP: INITIATING COIL CHARGE...");
        } else if (state.warpSequenceState === "WARPING" && warpJustPressed) {
            state.warpSequenceState = "STOPPING";
            state.warpSequenceTimer = 5000; // 5 Seconds
            this.addLog(state, "WARP: INITIATING DECELERATION...");
        }

        // Process Timer
        if (state.warpSequenceTimer > 0) {
            state.warpSequenceTimer -= deltaMs;
            if (state.warpSequenceTimer <= 0) {
                state.warpSequenceTimer = 0;
                if (state.warpSequenceState === "STARTING") {
                    state.warpSequenceState = "WARPING";
                    this.addLog(state, "WARP: SUPRALUMINAL VELOCITY ACHIEVED");
                } else if (state.warpSequenceState === "STOPPING") {
                    state.warpSequenceState = "NORMAL";
                    this.addLog(state, "WARP: DROPPED TO SUB-LIGHT SPEED");
                }
            }
        }

        // Apply Speeds based on state
        if (!state.isPowerOn) {
            state.targetSpeed = 0;
        } else if (state.warpSequenceState === "WARPING" || state.warpSequenceState === "STOPPING") {
            state.targetSpeed = 100;
        } else if (state.warpSequenceState === "STARTING" || state.warpSequenceState === "NORMAL") {
            state.targetSpeed = 5;
        }

        if (state.fuel <= 0) state.targetSpeed = 0;
        state.speed += (state.targetSpeed - state.speed) * 0.05;

        // Palette Control (Warp / Alarm Effect)
        // Alarm palette only applies in cockpit or bureau. Top-down always uses base palette.
        const inSeat = state.currentScene === "cockpit" || state.currentScene === "bureau";
        if (inSeat && (state.warpSequenceState === "WARPING" || state.warpSequenceState === "STOPPING")) {
            // Smooth sine wave pulsing across the 12 red alarm palettes
            const cycleTime = 1500; // ms per full cycle (slower, smoother)

            // Math.sin gives -1 to 1. Normalize to 0 to 1
            const sineWave = (Math.sin((now / cycleTime) * Math.PI * 2) + 1) / 2;

            // Map 0.0 - 1.0 range smoothly to palette slots 1 through 12
            const paletteIdx = 1 + Math.floor(sineWave * 11);

            state.display.switchPalette(paletteIdx);
        } else if (!state.isPowerOn) {
            state.display.switchPalette(13); // Dark palette (13) when power is off
        } else {
            state.display.switchPalette(0); // Restore normal palette
        }

        // Update Ship Systems
        if (!state.isPowerOn) {
            // Power is OFF: Systems cool down/depressurize slowly
            state.temperature += (280 - state.temperature) * 0.001; // Back to base 280K
            state.pressure += (0.01 - state.pressure) * 0.001; // Near vacuum
            // DO NOT return here - we still need to call render() for the blackout effect!
        } else if (state.warpSequenceState === "STARTING") {
            // Pre-heat and pressurize during charge
            state.fuel = Math.max(0, state.fuel - 0.1);
            state.temperature += (400 - state.temperature) * 0.005;
            state.pressure += (1.05 - state.pressure) * 0.005;

            // Log countdown milestone
            if (state.warpSequenceTimer < 2500 && state.warpSequenceTimer > 2400 && now - state.lastLogTime > 1000) {
                this.addLog(state, "WARP: COILS AT 50% - HARMONIZING...");
            }
        } else if (state.warpSequenceState === "WARPING" || state.warpSequenceState === "STOPPING") {
            state.fuel = Math.max(0, state.fuel - 0.4);
            state.temperature += (520 - state.temperature) * 0.01;
            state.pressure += (1.08 - state.pressure) * 0.01;
        } else {
            // Cruise: slow fuel drain, slow regeneration when below 80%
            const rechargeRate = state.fuel < 3200 ? 0.15 : 0; // Recharge below 80%
            state.fuel = Math.min(4000, Math.max(0, state.fuel - 0.02 + rechargeRate));
            state.temperature += (280 - state.temperature) * 0.01;
            state.pressure += (1.0 - state.pressure) * 0.005;
        }

        // Periodic Status Logs
        if (now - state.lastLogTime > 5000 && state.warpSequenceState === "NORMAL") {
            if (state.temperature > 400) this.addLog(state, "THERMAL: EXHAUSTING HEAT...");
            else if (state.fuel < 200) this.addLog(state, "RESOURCES: LOW FUEL ALERT");
            else this.addLog(state, "SYSTEMS: ALL GREEN");
        }

        // 2. Physics & Projection
        this.updateStars(state);

        // 3. Render
        this.render(state, user);
    }

    private addLog(state: StarshipData, msg: string): void {
        state.terminalLogs.push(msg);
        if (state.terminalLogs.length > 12) { // Increased max logs for larger terminal
            state.terminalLogs.shift();
        }
        state.lastLogTime = Date.now();
    }

    private updateStars(state: StarshipData): void {
        const centerX = state.width / 2;
        const centerY = state.height / 2;

        for (const star of state.stars) {
            // Move star towards camera
            star.z -= state.speed;

            // Wrap around if star passed camera
            if (star.z <= 0) {
                const newStar = this.createStar(state.width, state.height, true);
                star.x = newStar.x;
                star.y = newStar.y;
                star.z = newStar.z;
                star.px = -1;
                star.py = -1;
            }

            // Project 3D to 2D
            const sx = centerX + (star.x / star.z) * FOV;
            const sy = centerY + (star.y / star.z) * FOV;

            // Store previous position for warp trails
            if (star.px === -1) {
                star.px = sx;
                star.py = sy;
            }
        }
    }

    private render(state: StarshipData, user: User<StarshipData>): void {
        const { layer, uiLayer, width, height, stars, warpSequenceState } = state;

        if (state.currentScene === "cockpit") {
            // --- Layer 0: Space & Stars ---
            const orders: any[] = [];
            // Clear background
            orders.push(OrderBuilder.fill(" ", COLOR_SPACE, COLOR_SPACE));

            const isWarping = warpSequenceState === "WARPING" || warpSequenceState === "STOPPING";
            const dots = [];

            for (const star of stars) {
                const centerX = width / 2;
                const centerY = height / 2;

                const sx = Math.floor(centerX + (star.x / star.z) * FOV);
                const sy = Math.floor(centerY + (star.y / star.z) * FOV);

                if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                    // Base colour by depth
                    let color = COLOR_STAR_HI;
                    if (star.z > MAX_Z * 0.7) color = COLOR_STAR_LO;
                    else if (star.z > MAX_Z * 0.4) color = COLOR_STAR_MD;


                    if (isWarping && state.speed > 10) {
                        // Warp Trails using Line
                        const psx = Math.floor(star.px);
                        const psy = Math.floor(star.py);

                        if (psx >= 0 && psx < width && psy >= 0 && psy < height) {
                            orders.push(OrderBuilder.line(psx, psy, sx, sy, { charCode: "\u00b7", fgColor: color, bgColor: COLOR_SPACE }));
                        }
                    }

                    dots.push({ x: sx, y: sy, charCode: star.z < 200 ? "█" : star.z < 500 ? "▓" : "\u00b7", fgColorCode: color, bgColorCode: COLOR_SPACE });
                }

                // Save previous projection
                star.px = centerX + (star.x / star.z) * FOV;
                star.py = centerY + (star.y / star.z) * FOV;
            }

            if (dots.length > 0) {
                orders.push(OrderBuilder.dotCloudMulti(dots));
            }

            layer.setOrders(orders);


            // --- Layer 1: HUD ---
            const hudOrders = [];
            // ... (remaining HUD logic)

            // Target Reticle (Follows mouse/steering)
            const tx = Math.floor(width / 2);
            const ty = Math.floor(height / 2);
            hudOrders.push(OrderBuilder.text(tx - 2, ty, "[   ]", COLOR_HUD, TRANSPARENT));

            uiLayer.setOrders(hudOrders);

        }

        // --- Layer 4: Dynamic Instruments ---
        if (state.isPowerOn) {
            if (state.currentScene === "cockpit") {
                this.renderDynamicInstruments(state, user);
            } else {
                this.renderBureauDynamic(state, user);
            }
        } else {
            // Power is OFF: Clear both dynamic layers
            state.dynamicLayer.setOrders([]);

            state.bureauDynamicLayer.setOrders([]);

        }

        // --- Topdown Interior Rendering ---
        if (state.currentScene === "topdown" && state.topdownRenderNeeded) {
            this.renderTopDown(state);
            state.topdownRenderNeeded = false;
        }

        // --- Starfields Rendering (Always Dynamic) ---
        if (state.currentScene === "cockpit") {
            // Render Space stars (Cockpit)
            // ... (The star logic already has its own loop above)
        } else if (state.currentScene === "bureau") {
            this.renderParallaxStars(state, state.bureauStarsLayer);
        } else if (state.currentScene === "topdown") {
            this.renderParallaxStars(state, state.topdownStarsLayer);
        }
    }

    private renderTopDown(state: StarshipData): void {
        const { topdownLayer, width, height, playerX, playerY } = state;
        const o: any[] = [];

        // Start fully transparent so the star layer underneath shows through
        o.push(OrderBuilder.fill(" ", 255, 255));

        // Calculate center offset for the map
        const mapH = SHIP_MAP.length;
        const mapW = SHIP_MAP[0]?.length || 0;
        const offsetX = Math.floor((width - mapW) / 2);
        const offsetY = Math.floor((height - mapH) / 2);

        // Draw Map row by row, batching contiguous non-space runs into single text orders
        for (let y = 0; y < mapH; y++) {
            const row = SHIP_MAP[y];
            const screenY = offsetY + y;
            if (screenY < 0 || screenY >= height) continue;

            let runStart = -1;
            let runChars = "";

            const flushRun = () => {
                if (runStart >= 0 && runChars.length > 0) {
                    o.push(OrderBuilder.text(offsetX + runStart, screenY, runChars, COLOR_FRAME_HI, COLOR_FRAME_LO));
                }
                runStart = -1;
                runChars = "";
            };

            for (let x = 0; x < row.length; x++) {
                const char = row[x];

                if (char === " ") {
                    // Void — flush any pending run, leave transparent
                    flushRun();
                } else if (char === "#") {
                    // Wall character
                    flushRun();
                    o.push(OrderBuilder.text(offsetX + x, screenY, "█", COLOR_FRAME_HI, COLOR_FRAME_LO));
                } else if (char === "E") {
                    flushRun();
                    o.push(OrderBuilder.text(offsetX + x, screenY, "E", COLOR_HUD_ALT, COLOR_FRAME));
                } else if (char === "C" || char === "B") {
                    flushRun();
                    o.push(OrderBuilder.text(offsetX + x, screenY, "S", COLOR_STAR_HI, COLOR_FRAME_LO));
                } else if (char === ".") {
                    // Floor — batch into run
                    if (runStart < 0) runStart = x;
                    runChars += "·";
                }
            }
            flushRun();
        }

        // Player position
        o.push(OrderBuilder.text(playerX, playerY, "@", COLOR_STAR_HI, TRANSPARENT));

        // Interaction Hint
        const adj = [
            { x: playerX, y: playerY - 1 },
            { x: playerX, y: playerY + 1 },
            { x: playerX - 1, y: playerY },
            { x: playerX + 1, y: playerY },
            { x: playerX, y: playerY }
        ];

        let nearCockpit = false;
        let nearBureau = false;

        for (const pos of adj) {
            if (pos.y >= 0 && pos.y < SHIP_MAP.length && pos.x >= 0 && pos.x < SHIP_MAP[pos.y].length) {
                const char = SHIP_MAP[pos.y][pos.x];
                if (char === "C") nearCockpit = true;
                if (char === "B") nearBureau = true;
            }
        }

        if (nearCockpit) {
            o.push(OrderBuilder.text(width / 2 - 14, height - 6, "[PRESS 'F' TO SIT IN COCKPIT]", COLOR_HUD, COLOR_SPACE));
        } else if (nearBureau) {
            o.push(OrderBuilder.text(width / 2 - 14, height - 6, "[PRESS 'F' TO SIT AT BUREAU]", COLOR_HUD_ALT, COLOR_SPACE));
        }

        // Controls Help
        o.push(OrderBuilder.text(width / 2 - 12, height - 4, " USE WASD TO MOVE AROUND ", COLOR_FRAME_HI, COLOR_FRAME_LO));

        topdownLayer.setOrders(o);

    }

    private renderCockpit(state: StarshipData): void {
        const { cockpitLayer, width, height } = state;
        const frameData = new Array(width * height);

        const dashHeight = 22;
        const dashStart = height - dashHeight;
        const thickness = 6;
        const strutEndMirrorX = 18;
        const flare = 15;

        for (let y = 0; y < height; y++) {
            // Pre-calculate characteristic points for this row (Left side)
            let currentOuterX = -100;
            let currentFoldX = -100;
            let leftStrutX = -100;

            if (y < dashStart && y >= 3) {
                const progress = (y - 3) / (dashStart - 3);
                leftStrutX = Math.floor(progress * strutEndMirrorX);
            } else if (y >= dashStart) {
                const progress = (y - dashStart) / (dashHeight - 1);
                currentOuterX = Math.floor(strutEndMirrorX - progress * flare);
                currentFoldX = Math.floor((strutEndMirrorX + thickness - 1) - progress * flare);
            }

            for (let x = 0; x < width / 2; x++) {
                let charCode = 32; // " "
                let fgColor = TRANSPARENT;
                let bgColor = TRANSPARENT;

                // --- A. Top Bezel ---
                if (y < 3) {
                    bgColor = (y === 0) ? COLOR_FRAME_HI : (y === 2) ? COLOR_FRAME_LO : COLOR_FRAME;
                }
                // --- B. Slanted Struts ---
                else if (y < dashStart) {
                    if (x >= leftStrutX && x < leftStrutX + thickness) {
                        bgColor = (x === leftStrutX) ? COLOR_FRAME_HI : (x === leftStrutX + thickness - 1) ? COLOR_FRAME_LO : COLOR_FRAME;
                    }
                }
                // --- C. Dashboard ---
                else {
                    if (x >= currentOuterX) {
                        const isWing = x < currentFoldX;
                        if (x === currentFoldX) {
                            bgColor = COLOR_FRAME_HI; // Symmetric fold highlight
                        } else {
                            let color = COLOR_FRAME;
                            if (y === dashStart) color = COLOR_FRAME_LO;       // Top shadow
                            else if (y > dashStart + 1 && y < dashStart + 5) color = COLOR_FRAME_HI; // Light catch
                            else if (y > height - 4) color = COLOR_FRAME_LO;   // Bottom recession

                            if (isWing) color = (color === COLOR_FRAME_HI) ? COLOR_FRAME : COLOR_FRAME_LO;
                            bgColor = color;
                        }
                    }
                }

                const dot = { charCode, fgColorCode: fgColor, bgColorCode: bgColor };

                // Set Left Cell
                frameData[y * width + x] = dot;
                // Mirror to Right Cell
                frameData[y * width + (width - 1 - x)] = dot;
            }
        }

        cockpitLayer.setOrders([
            OrderBuilder.fullFrameMulti(frameData as any)
        ]);

    }

    private renderInstruments(state: StarshipData): void {
        const { instrumentsLayer, width, height } = state;
        const o: any[] = [];

        // Clear layer (Transparent)
        o.push(OrderBuilder.fill(" ", 255, 255));

        const dashStart = height - 22;
        const centerX = width / 2;

        // --- 1. CENTER CONSOLE (Scanner / Nav) ---
        const cw = 44;
        const cx = centerX - cw / 2;
        const cy = dashStart - 3; // Remonté de 2 blocs supplémentaires

        // Screen Background (Perfect fits Gris Medium part)
        for (let y = cy; y < height - 1; y++) {
            o.push(OrderBuilder.line(cx + 1, y, cx + cw - 1, y, { charCode: " ", bgColor: COLOR_FRAME_LO }));
        }
        // Frame
        o.push(OrderBuilder.line(cx, cy, cx + cw, cy, { charCode: "▀", fgColor: COLOR_FRAME })); // Top
        o.push(OrderBuilder.line(cx, height - 1, cx + cw, height - 1, { charCode: "▄", fgColor: COLOR_FRAME })); // Bottom
        o.push(OrderBuilder.line(cx, cy, cx, height - 1, { charCode: "▌", fgColor: COLOR_FRAME })); // Left
        o.push(OrderBuilder.line(cx + cw, cy, cx + cw, height - 1, { charCode: "▐", fgColor: COLOR_FRAME })); // Right
        o.push(OrderBuilder.text(cx + 2, cy, " SHIP STATUS TERMINAL ", COLOR_FRAME_HI, COLOR_FRAME_LO));

        // --- 2. LEFT PANEL: MINI-DASHBOARD ---
        const lw = 18;
        const lx = 18; // Décalé de 1 vers la droite
        const ly = dashStart + 6;

        // Frame for Dashboard
        o.push(OrderBuilder.line(lx, ly, lx + lw, ly, { charCode: "═", fgColor: COLOR_FRAME }));
        o.push(OrderBuilder.line(lx, ly + 9, lx + lw, ly + 9, { charCode: "═", fgColor: COLOR_FRAME }));
        o.push(OrderBuilder.text(lx + 2, ly, " SYSTEMS ", COLOR_STAR_MD, COLOR_FRAME_LO));

        // Internal labels
        o.push(OrderBuilder.text(lx + 1, ly + 2, "FUEL [", COLOR_FRAME_HI, COLOR_FRAME_LO));
        o.push(OrderBuilder.text(lx + 12, ly + 2, "]", COLOR_FRAME_HI, COLOR_FRAME_LO));
        o.push(OrderBuilder.text(lx + 1, ly + 4, "TEMP [", COLOR_FRAME_HI, COLOR_FRAME_LO));
        o.push(OrderBuilder.text(lx + 12, ly + 4, "]", COLOR_FRAME_HI, COLOR_FRAME_LO));
        o.push(OrderBuilder.text(lx + 1, ly + 7, "STATUS:", COLOR_FRAME_HI, COLOR_FRAME_LO));

        // --- 3. RIGHT PANEL: MODULE MATRIX ---
        const rw = 18;
        const rx = width - 18 - rw; // Décalé de 1 vers la gauche
        const ry = dashStart + 6;

        // Matrix Frame
        o.push(OrderBuilder.line(rx, ry, rx + rw, ry, { charCode: "═", fgColor: COLOR_FRAME }));
        o.push(OrderBuilder.line(rx, ry + 9, rx + rw, ry + 9, { charCode: "═", fgColor: COLOR_FRAME }));
        // Name removed as requested

        // Grid positions for buttons (3x2)
        const labels = ["WARP", "COM", "NAV", "O2", "RAD", "SHD"];
        for (let i = 0; i < 6; i++) {
            const bx = rx + 1 + (i % 3) * 6;
            const by = ry + 2 + Math.floor(i / 3) * 3;
            // Button shell
            o.push(OrderBuilder.text(bx, by, "[   ]", COLOR_FRAME, COLOR_FRAME_LO));
            o.push(OrderBuilder.text(bx + 1, by + 1, labels[i], COLOR_FRAME_HI, COLOR_FRAME_LO));
        }

        // --- 4. DECORATIVE PANEL LINES (Circuitry/Details) ---
        o.push(OrderBuilder.line(4, dashStart + 15, 10, dashStart + 15, { charCode: "─", fgColor: COLOR_FRAME_HI }));
        o.push(OrderBuilder.line(width - 11, dashStart + 15, width - 5, dashStart + 15, { charCode: "─", fgColor: COLOR_FRAME_HI }));
        instrumentsLayer.setOrders(o);

    }

    private renderDynamicInstruments(state: StarshipData, user: User<StarshipData>): void {
        const { dynamicLayer, width, height, terminalLogs, fuel, temperature, warpSequenceState, warpSequenceTimer, isPowerOn } = state;
        const o: any[] = [];

        // Clear layer (Transparent)
        o.push(OrderBuilder.fill(" ", 255, 255));

        const dashStart = height - 22;
        const centerX = width / 2;
        const cy = dashStart - 3;
        const cx = centerX - 22;

        if (!isPowerOn) {
            // Offline Display
            const isBlink = Date.now() % 1000 < 500;
            o.push(OrderBuilder.text(cx + 15, cy + 8, "POWER OFFLINE", isBlink ? COLOR_HUD_ALT : COLOR_STAR_LO, COLOR_FRAME_LO));

            // Render Module Matrix in "OFF" state
            const rx = width - 18 - 18;
            const ry = dashStart + 6;
            const labels = ["WARP", "COM", "NAV", "O2", "RAD", "SHD"];
            for (let i = 0; i < 6; i++) {
                const bx = rx + 1 + (i % 3) * 6;
                const by = ry + 2 + Math.floor(i / 3) * 3;
                o.push(OrderBuilder.text(bx + 2, by, "·", COLOR_FRAME, COLOR_FRAME_LO));
                o.push(OrderBuilder.text(bx + 1, by + 1, labels[i], COLOR_FRAME, COLOR_FRAME_LO));
            }

            dynamicLayer.setOrders(o);

            return;
        }

        // --- 1. SHIP COMMAND TERMINAL ---
        if (warpSequenceTimer > 0) {
            const timerStr = (warpSequenceTimer / 1000).toFixed(1) + "S";
            const label = warpSequenceState === "STARTING" ? "WARP_INIT: " : "WARP_DROP: ";
            o.push(OrderBuilder.text(cx + 1, cy + 3, label + timerStr, COLOR_HUD_ALT, COLOR_FRAME_LO));
        } else {
            o.push(OrderBuilder.text(cx + 1, cy + 3, "WARP_DRIVE: " + warpSequenceState, COLOR_HUD, COLOR_FRAME_LO));
        }

        const logDisplay = [...terminalLogs];
        const maxLines = 7; // Divisé par 2 cause espacement
        const start = Math.max(0, logDisplay.length - maxLines);
        for (let i = start; i < logDisplay.length; i++) {
            const rowIdx = (i - start) * 2; // Espacement x2
            const rowY = cy + 5 + rowIdx;
            if (rowY < height - 1) {
                o.push(OrderBuilder.text(cx + 1, rowY, ("  " + logDisplay[i]).substring(0, 42), i === logDisplay.length - 1 ? COLOR_STAR_HI : COLOR_STAR_MD, COLOR_FRAME_LO));
            }
        }

        // --- 2. MINI-DASHBOARD (Left) ---
        const lx = 18;
        const ly = dashStart + 6;

        // Fuel Percentage display
        const fP = fuel / 4000;
        const fPercent = Math.floor(fP * 100).toString().padStart(3, " ") + "%";
        o.push(OrderBuilder.text(lx + 7, ly + 2, fPercent, fP < 0.2 ? COLOR_HUD_ALT : COLOR_HUD, COLOR_FRAME_LO));

        // Temp Bar inside [ ] (5 slots)
        const tP = Math.min(1, (temperature - 200) / 320);
        const tFill = Math.floor(tP * 5);
        const tBar = "█".repeat(tFill).padEnd(5, " ");
        o.push(OrderBuilder.text(lx + 7, ly + 4, tBar, temperature > 420 ? COLOR_HUD_ALT : COLOR_STAR_HI, COLOR_FRAME_LO));

        // Status Blinker (only low fuel triggers hazard, not temperature)
        const isAlert = fuel < 600;
        const statusMsg = isAlert ? "!! HAZARD !!" : "NOMINAL";
        const statusColor = isAlert ? (Date.now() % 500 < 250 ? COLOR_HUD_ALT : COLOR_STAR_LO) : COLOR_HUD;
        o.push(OrderBuilder.text(lx + 8, ly + 7, statusMsg, statusColor, COLOR_FRAME_LO));

        // --- 3. MODULE MATRIX (Right) ---
        const rx = width - 18 - 18;
        const ry = dashStart + 6;

        const labels = ["WARP", "COM", "NAV", "O2", "RAD", "SHD"];
        const activeModules = [
            warpSequenceState !== "NORMAL",
            user.getButton("COM"),
            user.getButton("NAV"),
            true,  // O2 (Always on for life support)
            user.getButton("RAD"),
            user.getButton("SHD")
        ];

        for (let i = 0; i < 6; i++) {
            const bx = rx + 1 + (i % 3) * 6;
            const by = ry + 2 + Math.floor(i / 3) * 3;

            // LED Indicator above text (3 cells wide, background colored)
            const ledBgColor = activeModules[i] ? (i === 0 && warpSequenceState === "STARTING" ? COLOR_HUD_ALT : COLOR_HUD) : COLOR_FRAME_LO;
            o.push(OrderBuilder.text(bx + 1, by, "   ", COLOR_FRAME, ledBgColor));

            // Base Label (always visible, no highlight)
            o.push(OrderBuilder.text(bx + 1, by + 1, labels[i], COLOR_FRAME_HI, COLOR_FRAME_LO));
        }

        dynamicLayer.setOrders(o);

    }

    // ==================== PARALLAX STARS (Bureau + Top-down scenes) ====================

    /** Renders horizontal parallax stars on a given layer using dotCloudMulti. */
    private renderParallaxStars(state: StarshipData, targetLayer: Layer): void {
        const { bureauStars, width, height, speed, warpSequenceState } = state;
        const o: any[] = [];

        // Background
        o.push(OrderBuilder.fill(" ", COLOR_SPACE, COLOR_SPACE));

        const isWarping = warpSequenceState === "WARPING" || warpSequenceState === "STOPPING";
        const dots = [];

        // Update and draw horizontal stars
        for (const star of bureauStars) {
            // Slower moving stars for the top-down/bureau view
            const speedFactor = state.isPowerOn ? Math.max(0.1, (speed / 10)) : 0;
            star.x -= star.speed * speedFactor;

            if (star.x < 0) {
                star.x = width;
                star.y = Math.floor(Math.random() * height);
            } else if (star.x > width) { // In case speed is somehow negative
                star.x = 0;
                star.y = Math.floor(Math.random() * height);
            }

            const color = star.brightness === 0 ? COLOR_STAR_LO : star.brightness === 1 ? COLOR_STAR_MD : COLOR_STAR_HI;
            const sx = Math.floor(star.x);

            // Warp trails (horizontal lines)
            if (isWarping && speed > 10) {
                const trailLength = Math.min(Math.floor(star.speed * 3), width - sx); // draw rightwards trails
                const endX = Math.min(width - 1, sx + trailLength);
                if (endX > sx) {
                    o.push(OrderBuilder.line(sx, star.y, endX, star.y, { charCode: "─", fgColor: color, bgColor: COLOR_SPACE }));
                }
            }

            // Accumulate star point
            dots.push({ x: sx, y: star.y, charCode: "·", fgColorCode: color, bgColorCode: COLOR_SPACE });
        }

        if (dots.length > 0) {
            o.push(OrderBuilder.dotCloudMulti(dots));
        }

        targetLayer.setOrders(o);

    }

    // ==================== BUREAU SCENE (Static Structure) ====================

    /** Renders the bureau room walls, porthole frame, and shelf. Called once in initUser. */
    private renderBureauStructure(state: StarshipData): void {
        const { bureauStructureLayer, width, height } = state;
        const o: any[] = [];

        // Clear with transparent
        o.push(OrderBuilder.fill(" ", 255, 255));

        // Frame thickness
        const frameTop = 3;
        const frameSide = 6;
        const frameBottom = Math.floor(height / 3) - 2; // Enlarged by 2 lines down
        const cornerRadius = 4;

        // Porthole area (inside the frame)
        const portholeRight = width - frameSide;
        const portholeBottom = height - frameBottom;

        // Draw Frame segments using optimized Rectangles
        // TOP
        o.push(OrderBuilder.rect(0, 0, width, frameTop, " ", COLOR_FRAME, COLOR_FRAME, true));
        // LEFT
        o.push(OrderBuilder.rect(0, frameTop, frameSide, portholeBottom - frameTop, " ", COLOR_FRAME, COLOR_FRAME, true));
        // RIGHT
        o.push(OrderBuilder.rect(portholeRight, frameTop, width - portholeRight, portholeBottom - frameTop, " ", COLOR_FRAME, COLOR_FRAME, true));

        // BOTTOM wall + Shadow area
        const tableBottom = portholeBottom + 2 + 8;
        o.push(OrderBuilder.rect(0, portholeBottom, width, tableBottom - portholeBottom, " ", COLOR_FRAME, COLOR_FRAME, true));
        o.push(OrderBuilder.rect(0, tableBottom, width, height - tableBottom, " ", COLOR_FRAME_LO, COLOR_FRAME_LO, true));

        // Rounded corners on porthole opening (Still small loops, but limited area)
        for (let i = 0; i < cornerRadius; i++) {
            for (let j = 0; j < cornerRadius - i; j++) {
                o.push(OrderBuilder.text(frameSide + j, frameTop + i, " ", COLOR_FRAME, COLOR_FRAME));
                o.push(OrderBuilder.text(portholeRight - 1 - j, frameTop + i, " ", COLOR_FRAME, COLOR_FRAME));
                o.push(OrderBuilder.text(frameSide + j, portholeBottom - 1 - i, " ", COLOR_FRAME, COLOR_FRAME));
                o.push(OrderBuilder.text(portholeRight - 1 - j, portholeBottom - 1 - i, " ", COLOR_FRAME, COLOR_FRAME));
            }
        }

        // --- Realistic Contours (Bevels) ---
        // Top edge of opening (Shadow)
        o.push(OrderBuilder.line(frameSide + cornerRadius, frameTop, portholeRight - cornerRadius, frameTop, { charCode: "▄", fgColor: COLOR_FRAME_LO }));
        // Bottom edge of opening (Highlight)
        o.push(OrderBuilder.line(frameSide + cornerRadius, portholeBottom - 1, portholeRight - cornerRadius, portholeBottom - 1, { charCode: "▀", fgColor: COLOR_FRAME_HI }));

        // Left edge of opening (Shadow)
        for (let y = frameTop + cornerRadius; y < portholeBottom - cornerRadius; y++) {
            o.push(OrderBuilder.text(frameSide, y, "▐", COLOR_FRAME_LO, COLOR_FRAME));
        }
        // Right edge of opening (Highlight)
        for (let y = frameTop + cornerRadius; y < portholeBottom - cornerRadius; y++) {
            o.push(OrderBuilder.text(portholeRight - 1, y, "▌", COLOR_FRAME_HI, COLOR_FRAME));
        }

        // --- Secondary Panel (Shelf) ---
        const rectY = portholeBottom + 2;
        const rectHeight = 8;
        if (rectY < height) {
            o.push(OrderBuilder.rect(0, rectY, width, Math.min(rectHeight, height - rectY), " ", COLOR_FRAME_HI, COLOR_FRAME_HI, true));
            o.push(OrderBuilder.line(0, rectY, width, rectY, { charCode: "▄", fgColor: COLOR_FRAME_HI })); // Top highlight
            const bottomLineY = Math.min(height - 1, rectY + rectHeight - 1);
            o.push(OrderBuilder.line(0, bottomLineY, width, bottomLineY, { charCode: "▀", fgColor: COLOR_FRAME_LO })); // Bottom shadow
        }

        bureauStructureLayer.setOrders(o);

    }

    /** Renders the two monitor frames and their static labels. Called once in initUser. */
    private renderBureauInstruments(state: StarshipData): void {
        const { bureauInstrumentsLayer, width } = state;
        const o: any[] = [];

        // Clear with transparent
        o.push(OrderBuilder.fill(" ", 255, 255));

        // --- Monitor 1 (Left Portrait) ---
        const mw = 32;
        const mh = 46; // 50 - 4
        const mx1 = 2;
        const my1 = 6;  // 4 + 2

        // Short Arm for Monitor 1
        o.push(OrderBuilder.line(0, my1 + 20, mx1, my1 + 20, { charCode: "═", fgColor: COLOR_FRAME_LO }));
        o.push(OrderBuilder.line(0, my1 + 22, mx1, my1 + 22, { charCode: "═", fgColor: COLOR_FRAME_LO }));

        // Monitor 1 Shadow
        for (let y = my1 + 1; y < my1 + mh + 1; y++) {
            o.push(OrderBuilder.text(mx1 + 1, y, " ".repeat(mw), COLOR_FRAME_LO, COLOR_FRAME_LO));
        }
        // Monitor 1 Background
        for (let y = my1; y < my1 + mh; y++) {
            o.push(OrderBuilder.text(mx1, y, " ".repeat(mw), COLOR_FRAME, COLOR_FRAME_LO));
        }
        // Monitor 1 Shadow & Background
        o.push(OrderBuilder.rect(mx1 + 1, my1 + 1, mw, mh, " ", COLOR_FRAME_LO, COLOR_FRAME_LO, true));
        o.push(OrderBuilder.rect(mx1, my1, mw, mh, " ", COLOR_FRAME, COLOR_FRAME_LO, true));
        // Monitor 1 Full Frame (Style Cockpit)
        o.push(OrderBuilder.line(mx1, my1, mx1 + mw - 1, my1, { charCode: "▀", fgColor: COLOR_FRAME })); // Top
        o.push(OrderBuilder.line(mx1, my1 + mh - 1, mx1 + mw - 1, my1 + mh - 1, { charCode: "▄", fgColor: COLOR_FRAME })); // Bottom
        o.push(OrderBuilder.line(mx1, my1, mx1, my1 + mh - 1, { charCode: "▌", fgColor: COLOR_FRAME })); // Left
        o.push(OrderBuilder.line(mx1 + mw - 1, my1, mx1 + mw - 1, my1 + mh - 1, { charCode: "▐", fgColor: COLOR_FRAME })); // Right

        o.push(OrderBuilder.text(mx1 + 4, my1, " L-TERM ", COLOR_STAR_MD, COLOR_FRAME));

        // --- Monitor 2 (Right Portrait) ---
        const mx2 = width - 2 - mw;
        const my2 = 6;

        // Short Arm for Monitor 2
        o.push(OrderBuilder.line(width, my2 + 20, mx2 + mw, my2 + 20, { charCode: "═", fgColor: COLOR_FRAME_LO }));
        o.push(OrderBuilder.line(width, my2 + 22, mx2 + mw, my2 + 22, { charCode: "═", fgColor: COLOR_FRAME_LO }));

        // Monitor 2 Shadow & Background
        o.push(OrderBuilder.rect(mx2 + 1, my2 + 1, mw, mh, " ", COLOR_FRAME_LO, COLOR_FRAME_LO, true));
        o.push(OrderBuilder.rect(mx2, my2, mw, mh, " ", COLOR_FRAME, COLOR_FRAME_LO, true));

        // Monitor 2 Full Frame (Style Cockpit)
        o.push(OrderBuilder.line(mx2, my2, mx2 + mw - 1, my2, { charCode: "▀", fgColor: COLOR_FRAME })); // Top
        o.push(OrderBuilder.line(mx2, my2 + mh - 1, mx2 + mw - 1, my2 + mh - 1, { charCode: "▄", fgColor: COLOR_FRAME })); // Bottom
        o.push(OrderBuilder.line(mx2, my2, mx2, my2 + mh - 1, { charCode: "▌", fgColor: COLOR_FRAME })); // Left
        o.push(OrderBuilder.line(mx2 + mw - 1, my2, mx2 + mw - 1, my2 + mh - 1, { charCode: "▐", fgColor: COLOR_FRAME })); // Right

        o.push(OrderBuilder.text(mx2 + 4, my2, " R-TERM ", COLOR_STAR_MD, COLOR_FRAME));

        // --- Static Labels for Dashboards ---
        const ix2 = mx2 + 2;
        const iy2 = my2 + 3;
        o.push(OrderBuilder.text(ix2, iy2, "MODULE MATRIX", COLOR_FRAME_HI, 255));
        const labels = ["WARP", "COM", "NAV", "O2", "RAD", "SHD"];
        for (let i = 0; i < 6; i++) {
            const bx = ix2 + (i % 2) * 14;
            const by = iy2 + 3 + Math.floor(i / 2) * 5;
            o.push(OrderBuilder.text(bx, by, "[ " + labels[i].padEnd(4, " ") + " ]", COLOR_FRAME_HI, 255));
        }
        o.push(OrderBuilder.text(ix2, iy2 + 18, "WARP TELEMETRY", COLOR_FRAME_HI, 255));
        // o.push(OrderBuilder.text(ix2, iy2 + 26, "DATA STREAM >", COLOR_FRAME_LO, 255));

        bureauInstrumentsLayer.setOrders(o);

    }

    /** Renders dynamic bureau data: fuel bar, temperature, module LEDs, telemetry. Called every frame. */
    private renderBureauDynamic(state: StarshipData, user: User<StarshipData>): void {
        const { bureauDynamicLayer, width, fuel, temperature, warpSequenceState, warpSequenceTimer, isPowerOn } = state;
        const o: any[] = [];

        // Clear with transparent
        o.push(OrderBuilder.fill(" ", 255, 255));

        if (!isPowerOn) {
            bureauDynamicLayer.setOrders(o);

            return;
        }

        // --- Layout Constants (Matching Static Frames) ---
        const mw = 32;
        const mh = 46;
        const mx1 = 2; // Left Terminal
        const my1 = 6;
        const mx2 = width - 2 - mw; // Right Terminal
        const my2 = 6;

        // Colors
        const flashColor = Date.now() % 500 < 250 ? COLOR_HUD_ALT : COLOR_STAR_HI;

        // --- MONITOR 1 (LEFT): FUEL & THERMAL ---
        const ix1 = mx1 + 2; // Marginal gap from left frame
        const iy1 = my1 + 2; // Marginal gap from top frame

        // Vertical Fuel Bar (Refined Spacing) - Optimized with Rectangles
        const fuelPercent = fuel / 4000;
        const totalHeight = mh - 4; // 1 block gap top and bottom
        const fuelHeight = Math.floor(fuelPercent * totalHeight);
        const barStartX = ix1;
        const barStartY = my1 + 2;

        // Draw background (empty part)
        o.push(OrderBuilder.rect(barStartX, barStartY, 2, totalHeight - fuelHeight, "█", 0, 0, true));
        // Draw filled part
        if (fuelHeight > 0) {
            const levelY = barStartY + (totalHeight - fuelHeight);
            const barColor = fuelPercent < 0.2 ? COLOR_HUD_ALT : COLOR_HUD;
            o.push(OrderBuilder.rect(barStartX, levelY, 2, fuelHeight, "█", barColor, barColor, true));
        }

        // Labels repositioned with more air
        o.push(OrderBuilder.text(ix1 + 3, iy1, "FUEL", COLOR_FRAME_HI, 255));
        o.push(OrderBuilder.text(ix1 + 3, iy1 + 2, Math.floor(fuelPercent * 100) + "%", fuelPercent < 0.2 ? flashColor : COLOR_HUD, 255));

        // Temperature Gauge (Horizontal) - Optimized with Line/Rectangle
        o.push(OrderBuilder.text(ix1 + 4, iy1 + 5, "CORE TEMP", COLOR_FRAME_HI, 255));
        const tempP = Math.min(1, (temperature - 200) / 320);
        const tempFill = Math.floor(tempP * 20);
        const tempColor = temperature > 420 ? COLOR_HUD_ALT : COLOR_STAR_HI;

        // Background track (░)
        o.push(OrderBuilder.text(ix1 + 4, iy1 + 7, "░".repeat(20), COLOR_STAR_HI, 255));
        // Filled segment
        if (tempFill > 0) {
            o.push(OrderBuilder.line(ix1 + 4, iy1 + 7, ix1 + 4 + tempFill - 1, iy1 + 7, { charCode: "█", fgColor: tempColor }));
        }
        o.push(OrderBuilder.text(ix1 + 4, iy1 + 9, Math.floor(temperature) + " K", COLOR_STAR_HI, 255));

        // Status Message
        // if (fuel < 600 || temperature > 450) {
        //     o.push(OrderBuilder.text(ix1 + 6, iy1 + 20, "!! HAZARD !!", flashColor, 255));
        // } else {
        //     o.push(OrderBuilder.text(ix1 + 6, iy1 + 20, "SYSTEM OK", COLOR_HUD, 255));
        // }

        // --- MONITOR 2 (RIGHT): MODULES & TELEMETRY ---
        const ix2 = mx2 + 2;
        const iy2 = my2 + 3;

        // Module dynamic lights (LEDs)
        const activeModules = [
            warpSequenceState !== "NORMAL",
            user.getButton("COM"),
            user.getButton("NAV"),
            true,
            user.getButton("RAD"),
            user.getButton("SHD")
        ];

        for (let i = 0; i < 6; i++) {
            const bx = ix2 + (i % 2) * 14;
            const by = iy2 + 3 + Math.floor(i / 2) * 5;
            const ledColor = activeModules[i] ? (i === 0 && warpSequenceState === "STARTING" ? COLOR_HUD_ALT : COLOR_HUD) : COLOR_FRAME_LO;
            o.push(OrderBuilder.text(bx - 1, by + 1, "  " + (activeModules[i] ? "------" : ""), ledColor, 255));
        }

        // Warp Telemetry (Dynamic)
        o.push(OrderBuilder.text(ix2, iy2 + 20, "STATUS: " + warpSequenceState, COLOR_HUD, 255));
        if (warpSequenceTimer > 0) {
            const timerStr = (warpSequenceTimer / 1000).toFixed(2) + " SEC";
            o.push(OrderBuilder.text(ix2, iy2 + 22, "T-MINUS: " + timerStr, COLOR_HUD_ALT, 255));
        }

        // Fake Data Stream (Dynamic)
        for (let i = 0; i < 5; i++) {
            const seed = (Math.floor(Date.now() / 100) + i) % 100;
            const hex = seed.toString(16).toUpperCase().padStart(2, "0");
            const bits = (seed % 2).toString() + (seed % 4 > 1 ? "1" : "0") + (seed % 8 > 3 ? "1" : "0");
            o.push(OrderBuilder.text(ix2, iy2 + 28 + i, `0x${hex} [${bits}] CH-0${i}`, COLOR_FRAME_LO, 255));
        }

        bureauDynamicLayer.setOrders(o);

    }

    update(_runtime: IRuntime, _engine: Engine): void { }
}
