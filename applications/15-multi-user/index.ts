/**
 * Name: 15-multi-user
 * Category: tutorial
 * Description: Demonstrates the separation between the global update loop and the per-user update loop.
 *
 * What it demonstrates (engine perspective):
 *   This showcase highlights the two fundamentally distinct simulation loops provided by 
 *   the `IApplication` interface:
 *   
 *   1. `update(runtime, engine)`: The Global Loop. Runs exactly once per tick, regardless 
 *      of how many users are currently active. Exclusively used for simulating collective 
 *      world state, AI, physics, or global NPC entities.
 *   
 *   2. `updateUser(runtime, engine, user)`: The Per-User Loop. Runs sequentially for each 
 *      active User. Useful for reading specific inputs (joysticks/keyboards), updating 
 *      the personal avatar's state inside the global world, and generating an individualized 
 *      visual POV of the scene.
 *
 *   3. `destroyUser(runtime, engine, user)`: The Disconnect handler. Triggers whenever a User
 *      leaves the application natively or drops their network connection. Useful for cleaning
 *      up their avatar from the global state so they disappear for others.
 *
 *   4. Setup Tick Rate: 20 Hz. Because multiplayer sync across a network is inherently expensive
 *      to calculate and transmit, running a high 60 TPS loop generates unnecessary bandwidth bloat.
 *      20 ticks-per-second provides an optimal sweet spot for responsiveness without choking the port.
 *
 * Lifecycle and Environments:
 *   - When this application is hosted on a Server (e.g., via WebSocket), every time a new 
 *     network client connects, the engine creates a new `User` instance, passes it to `initUser()`, 
 *     and then starts calling `updateUser()` for them every tick. A server can juggle many users at once.
 *   - When running in the Standalone browser runtime, the exact same process occurs, but the engine 
 *     simply creates a single, local `User` instance for the current tab. The application code 
 *     remains identical in both environments.
 *
 * How it works:
 *   - The global `App` instance holds a `globalState` object (an NPC's position and a Map of all active users).
 *   - `update()` moves the autonomous NPC across the screen every frame.
 *   - `initUser()` registers the new user into the `globalState` with a unique session ID and a random color.
 *   - `updateUser()` reads the arrow keys of that specific user, modifies the avatar's `x` and `y` in the global Map, 
 *     and finally renders the entire shared state (the NPC, the current user '@', and all other users 'O').
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

interface PlayerData {
    x: number;
    y: number;
    colorId: number;
}

interface GlobalState {
    npcX: number;
    npcY: number;
    npcDirX: number;
    npcDirY: number;
    tickCount: number;
    players: Map<string, PlayerData>;
}

interface UserData {
    id: string;
    layer: Layer;
}

export class MultiUserShowcase implements IApplication<Engine, User<UserData>> {
    // 1. GLOBAL STATE
    // This state is shared among ALL active users natively.
    private globalState: GlobalState = {
        npcX: 40,
        npcY: 22,
        npcDirX: 1,
        npcDirY: 1,
        tickCount: 0,
        players: new Map()
    };

    async init(runtime: IRuntime, engine: Engine): Promise<void> {
        // Clear state on init to handle React Strict Mode / Fast Refresh gracefully
        this.globalState.players.clear();

        const palette = [{ colorId: 0, r: 0, g: 0, b: 0 }];
        palette.push({ colorId: 1, r: 255, g: 255, b: 255 }); // Text
        palette.push({ colorId: 2, r: 255, g: 50, b: 50 });   // NPC (Red)

        // Random player colors
        palette.push({ colorId: 3, r: 50, g: 255, b: 50 });   // Green
        palette.push({ colorId: 4, r: 50, g: 150, b: 255 });  // Blue
        palette.push({ colorId: 5, r: 255, g: 255, b: 50 });  // Yellow
        palette.push({ colorId: 6, r: 255, g: 50, b: 255 });  // Magenta
        palette.push({ colorId: 7, r: 50, g: 255, b: 255 });  // Cyan

        engine.loadPaletteToSlot(0, palette);
        runtime.setTickRate(20);
    }

    // ==========================================
    // THE GLOBAL LOOP
    // ==========================================
    // This function is executed exactly once per simulation frame (tick),
    // maintaining the core rules and logic of the application.
    update(_runtime: IRuntime, _engine: Engine): void {
        const state = this.globalState;
        state.tickCount++;

        state.npcX += state.npcDirX;
        state.npcY += state.npcDirY;

        // Bounce on boundaries
        if (state.npcX <= 0 || state.npcX >= 79) state.npcDirX *= -1;
        if (state.npcY <= 5 || state.npcY >= 44) state.npcDirY *= -1; // Top 5 reserved for UI
    }

    // ==========================================
    // THE USER INITIALIZATION
    // ==========================================
    initUser(_runtime: IRuntime, _engine: Engine, user: User<UserData>): void {
        const width = 80;
        const height = 45;

        // Note: `mustBeReliable: false` allows the engine to drop old frames if the user renderer lags
        const layer = new Layer(new Vector2(0, 0), 0, width, height, { mustBeReliable: false });
        user.addLayer(layer);

        const display = new Display(0, width, height);
        display.switchPalette(0);
        user.addDisplay(display);

        // Define generic movement axes abstracted from physical keys or gamepads
        const input = user.getInputBindingRegistry();
        input.defineAxis(0, "X", [
            { sourceId: 0, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight }
        ], -1, 1, 0);
        input.defineAxis(1, "Y", [
            { sourceId: 1, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown }
        ], -1, 1, 0);

        // Generate a random ID for this session and assign a random spawn & color
        const id = Math.random().toString(36).substring(2, 9);
        const colorId = 3 + Math.floor(Math.random() * 5); // Index 3 to 7

        this.globalState.players.set(id, {
            x: 10 + Math.floor(Math.random() * 60),
            y: 10 + Math.floor(Math.random() * 30),
            colorId,
        });

        // Save unique session ID in the individual User instance
        user.data = { layer, id };
    }

    // ==========================================
    // THE PER-USER LOOP
    // ==========================================
    // This function is executed N times per tick (N = active users).
    // Operations here process inputs, mutate personal state, and dispatch individualized render orders.
    updateUser(_runtime: IRuntime, _engine: Engine, user: User<UserData>): void {
        const data = user.data;
        const state = this.globalState;

        // Fetch this specific user's avatar from the global shared hashmap
        const myPlayer = state.players.get(data.id);
        if (!myPlayer) return;

        // 1. Process specific User Inputs
        // Read movement inputs unrestricted each tick since TPS is only 20
        const moveX = Math.round(user.getAxis("X"));
        const moveY = Math.round(user.getAxis("Y"));

        myPlayer.x += moveX;
        myPlayer.y += moveY;

        // Clamp coordinates to stay inside the logical room screen
        myPlayer.x = Math.max(0, Math.min(79, myPlayer.x));
        myPlayer.y = Math.max(5, Math.min(44, myPlayer.y));

        // 2. Render the Global World visually constructed for THIS specific user
        const o: any[] = [];
        o.push(OrderBuilder.fill(" ", 0, 0)); // Clear screen

        // Draw Global State Details UI
        o.push(OrderBuilder.rect(0, 0, 80, 5, " ", 0, 1)); // White UI background
        o.push(OrderBuilder.text(2, 1, "> APPLICATION STATE", 0, 1));
        o.push(OrderBuilder.text(2, 3, `Active Users: ${state.players.size}   |   Global Application Tick: ${state.tickCount}`, 0, 1));

        // Draw the Global Autonomous Bouncing NPC
        o.push(OrderBuilder.circle(state.npcX, state.npcY, 1, { charCode: "█", fgColor: 2, bgColor: 0, filled: true })); // Red NPC
        o.push(OrderBuilder.text(state.npcX - 1, Math.max(5, state.npcY - 2), "AI", 2, 0));

        // Draw all players
        for (const [id, player] of state.players.entries()) {
            if (id === data.id) {
                // Highlight my OWN player character differently exclusively on MY screen
                o.push(OrderBuilder.text(player.x, player.y, "@", player.colorId, 0));
                o.push(OrderBuilder.text(player.x - 1, player.y - 1, "YOU", player.colorId, 0));
            } else {
                // Draw other foreign players normally
                o.push(OrderBuilder.text(player.x, player.y, "O", player.colorId, 0));
            }
        }

        // 3. Send out personalized rendering instructions
        data.layer.setOrders(o);
        data.layer.commit();
    }

    // ==========================================
    // THE USER DESTRUCTION
    // ==========================================
    // This function is executed when a user disconnects or navigates away.
    // Operations here should clean up the user's presence from the shared global state.
    destroyUser(_runtime: IRuntime, _engine: Engine, user: User<UserData>): void {
        const data = user.data;
        if (data && data.id) {
            this.globalState.players.delete(data.id);
        }
    }
}
