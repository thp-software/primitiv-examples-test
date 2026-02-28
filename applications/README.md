# Primitiv Applications

Reference applications for the [Primitiv Engine](https://github.com/primitiv-engine). Each folder contains a single `index.ts` exporting an application class that implements `IApplication<Engine, User<T>>`.

## Catalog

| Application | Description |
|---|---|
| **hero-matrix** | Digital rain / matrix background effect. Simplest app — great starting point. |
| **parallax-city** | Side-scrolling rainy city scene with parallax layers, particles, spatial audio. |
| **space-demo** | Conway's Game of Life with mouse interaction, bitmask rendering, and a UI bar. |
| **reference-app** | Exhaustive showcase of every drawing order, input device, and audio feature. |
| **test-app** | 16-bit tilemap prototype using font atlases, auto-tiling walls, and campfire lighting. |
| **12-bridge-communication** | Bidirectional JSON messaging between engine and host web app. |

## How to Run

Applications are pure engine logic — they don't know about the runtime. To actually see them, load one in a **harness**:

- **Standalone**: `cd ../runtimes/standalone && pnpm install && pnpm run dev`
- **Connected UWS**: `cd ../runtimes/connected-uws && pnpm install && pnpm run dev`
- **Connected WebRTC Lite**: `cd ../runtimes/connected-webrtc-lite && pnpm install && pnpm run dev`
- **Connected WebRTC Full**: `cd ../runtimes/connected-webrtc-full && pnpm install && pnpm run dev`

## Creating a New Application

1. Create a new folder: `applications/my-app/`
2. Add an `index.ts` that exports a class implementing `IApplication<Engine, User<T>>`:

```ts
import {
  Engine, User, Layer, Display, OrderBuilder,
  Vector2, ScalingMode,
  type IApplication, type IRuntime,
} from '@primitiv/engine';

interface MyAppUserData {
  layer: Layer;
}

export class MyApp implements IApplication<Engine, User<MyAppUserData>> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    // Load palettes, fonts, set tick rate
  }

  initUser(_runtime: IRuntime, _engine: Engine, user: User<MyAppUserData>): void {
    // Create displays, layers
  }

  updateUser(_runtime: IRuntime, _engine: Engine, user: User<MyAppUserData>): void {
    // Per-frame rendering logic
  }

  update(_runtime: IRuntime, _engine: Engine): void {
    // Global update (optional)
  }
}
```

3. Import it in a harness (`App.tsx` or `server/src/index.ts`) and pass it to the runtime.
