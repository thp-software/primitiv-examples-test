# Primitiv Engine — LLM Reference Entry Point

> Primitiv is a grid-based terminal rendering engine. It renders colored character cells in a 2D grid via a WebGL renderer. Applications are pure TypeScript classes that only depend on `@primitiv/engine` and are completely runtime-agnostic.

---

## Architecture

```
Application (pure logic)  →  Runtime (decides transport)  →  Client (WebGL renderer)
```

- **Application**: A class implementing `IApplication<Engine, User<T>>`. Contains all game/simulation logic. Has zero knowledge of whether it runs locally or over a network.
- **Runtime**: Determines how the app is executed. Options: `standalone` (browser-only), `uws` (WebSocket server), `webrtc-direct` / `webrtc-full` / `webrtc-lite` (WebRTC P2P).
- **Renderer**: A WebGL terminal renderer on the client that displays the character grid.

Packages: `@primitiv/engine` (app code), `@primitiv/client` (browser runtime), `@primitiv/server` (Node.js runtime).

---

## Application Lifecycle

Every application implements these methods:

| Method | Frequency | Purpose |
|---|---|---|
| `init(runtime, engine)` | Once at startup | Load palettes, fonts, sounds. Set tick rate. |
| `initUser(runtime, engine, user)` | Once per connection | Create Display, Layers, input bindings. Initialize `user.data`. |
| `update(runtime, engine)` | Once per tick | Global world logic (NPC AI, physics, time). |
| `updateUser(runtime, engine, user)` | Once per tick × N users | Read input, update user state, build drawing orders, **commit layers**. |
| `destroyUser(runtime, engine, user)` | On disconnect | Clean up user from shared state. |

---

## Critical Rules

1. **Per-user state goes in `user.data`** (typed via `User<T>`). Class-level properties are global/shared across all users.
2. **`layer.commit()` is mandatory.** Without it, nothing is sent to the client. Every frame must end with a commit on each modified layer.
3. **Drawing is declarative.** You build arrays of `OrderBuilder` commands, apply them via `layer.setOrders(orders)`, then commit.
4. **Color is palette-indexed.** Colors are referenced by ID (0–255). Color 255 = transparent. Palettes are loaded into slots via `engine.loadPaletteToSlot()` and assigned to displays via `display.switchPalette()`.
5. **Network cost matters.** Move layers (`layer.setPosition()`) instead of redrawing. Switch palettes instead of recoloring. Use `mustBeReliable: false` for high-frequency layers. Lower tick rate for multiplayer (20 TPS recommended).

---

## Minimal Template

```ts
import {
  Engine, User, Layer, Display, OrderBuilder, Vector2,
  KeyboardInput, InputDeviceType,
  type IApplication, type IRuntime,
} from '@primitiv/engine';

interface MyData { layer: Layer; x: number; y: number; }

export class MyApp implements IApplication<Engine, User<MyData>> {
  init(runtime: IRuntime, engine: Engine): void {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 0, g: 0, b: 0 },
      { colorId: 1, r: 255, g: 255, b: 255 },
    ]);
    runtime.setTickRate(30);
  }

  initUser(_r: IRuntime, _e: Engine, user: User<MyData>): void {
    const layer = new Layer(new Vector2(0, 0), 0, 80, 45, { mustBeReliable: false });
    user.addLayer(layer);
    const display = new Display(0, 80, 45);
    display.switchPalette(0);
    user.addDisplay(display);
    const input = user.getInputBindingRegistry();
    input.defineAxis(0, 'X', [{ sourceId: 0, type: InputDeviceType.Keyboard,
      negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight }]);
    input.defineAxis(1, 'Y', [{ sourceId: 1, type: InputDeviceType.Keyboard,
      negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown }]);
    user.data = { layer, x: 40, y: 22 };
  }

  update(_r: IRuntime, _e: Engine): void {}

  updateUser(_r: IRuntime, _e: Engine, user: User<MyData>): void {
    const d = user.data;
    d.x = Math.max(0, Math.min(79, d.x + Math.round(user.getAxis('X'))));
    d.y = Math.max(0, Math.min(44, d.y + Math.round(user.getAxis('Y'))));
    d.layer.setOrders([
      OrderBuilder.fill(' ', 0, 0),
      OrderBuilder.text(d.x, d.y, '@', 1, 0),
    ]);
    d.layer.commit();
  }
}
```

---

## Runtime Constructors

**Server:**
```ts
// UWS (WebSocket)
new RuntimeServer({ transport: 'uws', uws: { port: 3001 }, application: new MyApp() });

// WebRTC Direct
new RuntimeServer({ transport: 'webrtc-direct', webrtcDirect: { port: 3001, stunServers: [...] }, application: new MyApp() });
```

**Client:**
```ts
// Standalone (no server)
new ClientRuntime({ mode: 'standalone', standalone: { application: new MyApp() }, displays: [...] });

// UWS
new ClientRuntime({ mode: 'uws', uws: { url: 'ws://localhost:3001' }, displays: [...] });

// WebRTC Full
new ClientRuntime({ mode: 'webrtc-full', webrtcFull: { url: 'http://localhost:3001', stunServers: [...] }, displays: [...] });

// WebRTC Lite
new ClientRuntime({ mode: 'webrtc-lite', webrtcLite: { url: 'http://localhost:3001' }, displays: [...] });
```

---

## Application Reference

Each application below is a self-contained tutorial. **Read its source file header** for full documentation of the concepts it demonstrates, the algorithm it uses, and the Primitiv API patterns involved.

| Application | Source | What it teaches |
|---|---|---|
| **Simple Matrix** | [01-simple-matrix/index.ts](applications/01-simple-matrix/index.ts) | Engine init, Display creation, fixed-size grid, manual frame buffer |
| **Mouse & Keyboard Input** | [02-mouse-keyboard-input/index.ts](applications/02-mouse-keyboard-input/index.ts) | Input bindings (axes & buttons), `getAxis()`, `getButton()`, `text` and `rect` orders |
| **World Sectors** | [03-world-sectors/index.ts](applications/03-world-sectors/index.ts) | World space, scene management, layer movement, zero-cost scrolling and teleportation |
| **Responsive Display** | [04-responsive-display/index.ts](applications/04-responsive-display/index.ts) | `ScalingMode.Responsive`, reading display dimensions at runtime |
| **Drawing Orders** | [05-drawing-orders/index.ts](applications/05-drawing-orders/index.ts) | **Complete visual catalog of every OrderBuilder method** — shapes, fills, frames, bitmasks, sprites, clouds |
| **Palettes** | [06-palettes/index.ts](applications/06-palettes/index.ts) | Palette system, `loadPaletteToSlot`, `switchPalette`, palette animation (day/night) |
| **Multipass** | [07-multipass/index.ts](applications/07-multipass/index.ts) | Multi-layer depth ordering, particle rendering with `dotCloudMulti` |
| **Gamepad Input** | [08-gamepad-input/index.ts](applications/08-gamepad-input/index.ts) | Gamepad support, axis values, haptic feedback |
| **Mobile Input** | [09-mobile-input/index.ts](applications/09-mobile-input/index.ts) | Touch zones, virtual buttons/joysticks, `user.vibrate()` |
| **Audio** | [10-audio/index.ts](applications/10-audio/index.ts) | Sound loading, playback, spatial audio, filters, looping |
| **Custom Sprites** | [11-custom-sprites/index.ts](applications/11-custom-sprites/index.ts) | Font blocks, 16-bit charCodes, sprite sheet atlas |
| **Bridge Communication** | [12-bridge-communication/index.ts](applications/12-bridge-communication/index.ts) | `sendBridge`, `broadcastBridge`, `bridgeInbox` — engine↔host messaging |
| **Multi-Display** | [13-multi-display/index.ts](applications/13-multi-display/index.ts) | Multiple Displays, `setOrigin`, `setRenderPasses`, split-screen |
| **Post-Processing** | [14-post-process/index.ts](applications/14-post-process/index.ts) | CRT scanlines, Ambilight glow, pixel grid overlay |
| **Multi-User** | [15-multi-user/index.ts](applications/15-multi-user/index.ts) | Global vs per-user loops, `destroyUser`, shared state, tick rate for network |
