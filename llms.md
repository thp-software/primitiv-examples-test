# Primitiv Engine — LLM Reference Entry Point

> Primitiv is a grid-based rendering engine. It renders cells in a 2D grid via a WebGL or Canvas2D renderer. Applications are pure TypeScript classes that only depend on `@primitiv/engine` and are completely runtime-agnostic.

---

## Architecture

```
Application (pure logic)  →  Runtime (decides transport)  →  Client (WebGL or Canvas2D renderer)
```

- **Application**: A class implementing `IApplication<Engine, User<T>>`. Contains all game/simulation logic. Has zero knowledge of whether it runs locally or over a network.
- **Runtime**: Determines how the app is executed. Options: `standalone` (browser-only), `uws` (WebSocket server), `webrtc-direct` / `webrtc-full` / `webrtc-lite` (WebRTC P2P).
- **Renderer**: A WebGL or Canvas2D terminal renderer on the client that displays the character grid.

Packages: `@primitiv/engine` (app code), `@primitiv/client` (browser runtime), `@primitiv/server` (Node.js runtime).

---

## Cell & Rendering Model

Primitiv's screen is a **2D grid of cells**. Each cell holds exactly three values:

| Field | Type | Meaning |
|---|---|---|
| `charCode` | `number` (8-bit or 16-bit) | Which glyph to draw — an index into the font atlas. |
| `fgColorCode` | `number` (0–255) | Foreground color (palette index). The glyph pixels use this color. |
| `bgColorCode` | `number` (0–255) | Background color (palette index). Empty pixels behind the glyph use this color. Color 255 = transparent. |

### CP437 — The Default Character Set

By default, every Primitiv application uses **Code Page 437 (CP437)**, the classic IBM PC character set. It provides 256 glyphs (charCodes 0–255) in an 8×8 pixel grid per glyph, loaded automatically as **block 0** of the font atlas.

CP437 includes:
- Standard ASCII letters, digits, and punctuation (charCodes 32–126).
- Box-drawing characters (`─│┌┐└┘├┤┬┴┼`) for UI borders and panels.
- Block elements (`█▓▒░`) — these are the key to "pixel art" inside cells, as they fill the cell partially or fully, allowing smooth shading gradients.
- Mathematical and special symbols.

**This means every application starts with 256 ready-to-use glyphs at no cost — no asset loading required.**

### Custom Font Blocks (Sprites)

For tile-based games or custom graphics beyond CP437, additional 256-glyph sprite sheets can be loaded as **font blocks** via `engine.loadFontBlock(index, url)`:

- Block 0 = CP437 (built-in, always available).
- Block 1 = charCodes 256–511 from a custom PNG sprite sheet.
- Block N = charCodes N×256 – (N+1)×256−1.
- Each PNG must be exactly 16 × cellWidth pixels wide × 16 × cellHeight pixels tall (256 glyph slots per block).
- Layers must use `charCodeMode: '16bit'` to address charCodes above 255.
- All blocks share the same cell dimensions declared in `engine.loadFont(cellW, cellH, blockCapacity, ...)`.

See application `11-custom-sprites` for a complete working example.

### Two Usage Patterns

1. **Text / UI mode** (default): Use `OrderBuilder.text()`, `rect()`, `fill()`, `frame()` etc. The engine handles cell layout.
2. **Pixel buffer mode** (advanced): Treat every cell as a single colored pixel by setting `charCode` to a space `" "` (or a block element for shading) and controlling only `bgColorCode`. Build the entire frame as a flat array and submit via `OrderBuilder.subFrameMulti(0, 0, W, H, dots)`. This is exactly how the 3D showcases render raycasted or rasterized scenes.

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
2. **`layer.commit()` is mandatory.** Without it, nothing is sent to the client. After every layer update, you must commit the layer.
3. **Drawing is declarative.** You build arrays of `OrderBuilder` commands, apply them via `layer.setOrders(orders)`, then commit.
4. **Color is palette-indexed.** Colors are referenced by ID (0–255). Color 255 = transparent. Palettes are loaded into slots via `engine.loadPaletteToSlot()` and assigned to displays via `display.switchPalette()`.
5. **Network cost matters.** Move layers (`layer.setPosition()`) instead of redrawing. Switch palettes instead of recoloring. Use `mustBeReliable: false` for high-frequency layers. Lower tick rate for multiplayer (20 TPS recommended). See **[Order Network Weight Reference](./orders/orders-network-consumption.md)** for per-order byte costs.
6. **255 orders per layer.** A single Layer can hold a maximum of 255 drawing orders per commit. For dense UIs that exceed this limit, split the content across multiple Layers stacked via different zIndex values. See `showcase-01-pseudo-htop` for a working example.

---

## How to Learn Primitiv

**Do not rely only on this document.** Each application source file contains an extensive documentation header (30–80 lines) that explains in detail:
- The concepts it demonstrates and why they matter.
- The algorithm and data structures used.
- The Primitiv API patterns involved with inline explanations.

**To write a new Primitiv application, read `01-simple-matrix/index.ts` first** — it is the minimal "hello world". Then read whichever examples cover the features you need (input, audio, sprites, etc.). The source headers are the primary API reference.

For advanced developers/LLMs looking to optimize network bandwidth, consult the **[Order Network Weight Reference](./orders/orders-network-consumption.md)**.


## Display Scaling Modes

`display.setScalingMode(ScalingMode.X)` controls how the grid is scaled to fit the browser viewport:

| Mode | Behavior |
|---|---|
| `None` (default) | Fills available space. May produce sub-pixel artifacts. |
| `Eighth` | Snaps scale to 0.125 increments (1.0, 1.125, 1.25…). |
| `Quarter` | Snaps scale to 0.25 increments (1.0, 1.25, 1.5…). |
| `Half` | Snaps scale to 0.5 increments (1.0, 1.5, 2.0…). |
| `Integer` | Integer scaling only (1×, 2×, 3×…). Crispest pixels, may waste space. |
| `Responsive` | The grid dimensions (cols × rows) adapt dynamically to the available space instead of the scale factor. The display resizes itself — layers must handle variable dimensions. See `04-responsive-display`. |

---

## Runtimes

Applications are runtime-agnostic. The runtime is chosen at integration time, not by the application. Full working examples for each runtime are located in the `runtimes/` directory:

| Runtime | Directory | Transport |
|---|---|---|
| **Standalone** | `runtimes/standalone/` | Browser-only, no server. |
| **UWS** | `runtimes/connected-uws/` | WebSocket via µWebSockets. |
| **WebRTC Full** | [connected-webrtc-full/](runtimes/connected-webrtc-full/) | WebRTC with signaling & STUN server. |
| **WebRTC Lite** | [connected-webrtc-lite/](runtimes/connected-webrtc-lite/) | Direct WebRTC (P2P without signaling server). |

Refer to each runtime's source code for constructor options and integration patterns.

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
| **Motion Input** | [16-motion-input/index.ts](applications/16-motion-input/index.ts) | Complete catalog: Tilt, Accelerometer, Gyroscope, Compass via `InputDeviceType.Motion` |

---

## 2D Showcases

These applications demonstrate advanced UI and performance techniques.

| Application | Source | What it teaches |
|---|---|---|
| **Pseudo Htop** | [showcase-01-pseudo-htop/index.ts](applications/showcase-01-pseudo-htop/index.ts) | Dense terminal UIs, bypassing the 255 order limit via Z-Layers, string padding layouts, CPU/Mem visual bars |

---

## 3D Showcases

These applications demonstrate how Primitiv's character-cell matrix can be treated as a pixel buffer to run classic 3D rasterization and vector algorithms entirely on the CPU side, streaming the results to the WebGL client.

| Application | Source | What it teaches |
|---|---|---|
| **Voxel Space** | [showcase-3d-01-voxel-space/index.ts](applications/showcase-3d-01-voxel-space/index.ts) | 1992 Comanche-style heightmap rendering, 1D Y-buffer occlusion, `subFrameMulti` massive updates |
| **Primitiv Craft** | [showcase-3d-02-primitiv-craft/index.ts](applications/showcase-3d-02-primitiv-craft/index.ts) | Full 3D DDA voxel raycasting (Minecraft style), temporal palette animation (day/night), billboard sprite projection |
| **Ray Maze** | [showcase-3d-03-ray-maze/index.ts](applications/showcase-3d-03-ray-maze/index.ts) | Classic 2.5D DDA raycasting (Wolfenstein 3D style), palette-based depth shading, ZBuffer for sprites, discrete tile movement |
| **Wireframe 3D** | [showcase-3d-04-wireframe-3d/index.ts](applications/showcase-3d-04-wireframe-3d/index.ts) | 3D math projection, Bresenham's line algorithm on character grids, depth fog via ASCII degradation (`#`, `+`, `:`, `.`), infinite procedural generation |
