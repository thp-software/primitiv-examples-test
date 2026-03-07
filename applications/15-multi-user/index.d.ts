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
import { Engine, User, Layer, type IApplication, type IRuntime } from "@primitiv/engine";
interface UserData {
    id: string;
    layer: Layer;
}
export declare class MultiUserShowcase implements IApplication<Engine, User<UserData>> {
    private globalState;
    init(runtime: IRuntime, engine: Engine): Promise<void>;
    update(_runtime: IRuntime, _engine: Engine): void;
    initUser(_runtime: IRuntime, _engine: Engine, user: User<UserData>): void;
    updateUser(_runtime: IRuntime, _engine: Engine, user: User<UserData>): void;
    destroyUser(_runtime: IRuntime, _engine: Engine, user: User<UserData>): void;
}
export {};
//# sourceMappingURL=index.d.ts.map