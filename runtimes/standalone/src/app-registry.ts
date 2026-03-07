import type { IApplication } from "@primitiv/client";

// =============================================================================
// Application Registry
// =============================================================================
// Each entry maps a URL slug to a lazy factory that creates the application.
// We use dynamic imports so only the selected app is bundled/loaded.

export interface AppEntry {
  slug: string;
  name: string;
  description: string;
  controls?: string;
  features?: string[];
  category?: "showcase" | "showcase-3d";
  factory: () => IApplication;
}

// Import all numbered examples
import { SimpleMatrix } from "../../../applications/01-simple-matrix";
import { InputShowcase } from "../../../applications/02-mouse-keyboard-input";
import { WorldSectors } from "../../../applications/03-world-sectors";
import { ResponsiveDisplay } from "../../../applications/04-responsive-display";
import { DrawingOrders } from "../../../applications/05-drawing-orders";
import { Palettes } from "../../../applications/06-palettes";
import { Multipass } from "../../../applications/07-multipass";
import { GamepadShowcase } from "../../../applications/08-gamepad-input";
import { MobileShowcase } from "../../../applications/09-mobile-input";
import { AudioShowcase } from "../../../applications/10-audio";
import { CustomSpritesShowcase } from "../../../applications/11-custom-sprites";
import { BridgeShowcase } from "../../../applications/12-bridge-communication";
import { MultiDisplay } from "../../../applications/13-multi-display";
import { PostProcessShowcase } from "../../../applications/14-post-process";
import { MultiUserShowcase } from "../../../applications/15-multi-user";
import { Cp437Table } from "../../../applications/16-cp437";


import { VoxelSpaceApp } from "../../../applications/showcase-3d-01-voxel-space";
import { PrimitivCraft } from "../../../applications/showcase-3d-02-primitiv-craft";
import { RayMazeApp } from "../../../applications/showcase-3d-03-ray-maze";
import { Wireframe3DShowcase } from "../../../applications/showcase-3d-04-wireframe-3d";

import { RetroDashboard } from "../../../applications/showcase-01-pseudo-htop";
import { DungeonApp } from "../../../applications/showcase-02-dungeon";
import { GameOfLife } from "../../../applications/showcase-03-game-of-life";
import { Spaceship } from "../../../applications/showcase-04-spaceship";
import { PrimitivRadar } from "../../../applications/showcase-05-radar";
import { FluidShowcase } from "../../../applications/showcase-06-fluid";
import { TermBomber } from "../../../applications/showcase-07-terminal-bomber";
import { Minimal } from "../../../applications/showcase-08-snake";
import { Pong } from "../../../applications/showcase-09-pong";
import { Breakout } from "../../../applications/showcase-10-breakout";
import { MyGame } from "../../../applications/showcase-11-minimal-example";

export const APP_REGISTRY: AppEntry[] = [
  {
    slug: "01-simple-matrix",
    name: "01 Simple Matrix",
    description: "Digital rain. Palette, tick rate, subFrameMultiColor.",
    factory: () => new SimpleMatrix(),
  },
  {
    slug: "02-mouse-keyboard-input",
    name: "02 Mouse & Keyboard",
    description: "Input bindings, button states, mouse tracking, axes.",
    controls: "Arrow Keys: Move/Scroll | Space: Action | Mouse: Track",
    features: [
      "Binding abstraction (Keyboard/Mouse)",
      "Input state query types (Held/JustPressed)",
      "Mouse coordinate projection (Cell-local)",
      "Drawing orders sequence and limits",
    ],
    factory: () => new InputShowcase(),
  },
  {
    slug: "03-world-sectors",
    name: "03 World Sectors",
    description: "Large scrollable world with sector-based loading.",
    controls: "WASD / Arrows: Move vehicle",
    factory: () => new WorldSectors(),
  },
  {
    slug: "04-responsive-display",
    name: "04 Responsive Display",
    description: "Dynamic display resizing and scaling modes.",
    factory: () => new ResponsiveDisplay(),
  },
  {
    slug: "05-drawing-orders",
    name: "05 Drawing Orders",
    description: "All shape orders: rect, circle, line, text, fill.",
    factory: () => new DrawingOrders(),
  },
  {
    slug: "06-palettes",
    name: "06 Palettes",
    description: "Color palette system, slots, and switching.",
    controls: "1-4: Switch theme\nSpace: Toggle auto-cycle",
    factory: () => new Palettes(),
  },
  {
    slug: "07-multipass",
    name: "07 Multipass",
    description: "Multi-pass rendering with transparency overlay.",
    factory: () => new Multipass(),
  },
  {
    slug: "08-gamepad-input",
    name: "08 Gamepad Input",
    description: "Buttons, sticks, triggers, vibration (dual-rumble).",
    factory: () => new GamepadShowcase(),
  },
  {
    slug: "09-mobile-input",
    name: "09 Mobile Input",
    description: "Touch zones, virtual D-pad, phone vibration.",
    controls: "Touch: Move/Action | Shake: Vibrate",
    features: [
      "Touch zones (virtual D-pad, buttons)",
      "Haptic feedback (phone vibration)",
      "Accelerometer/gyroscope input",
    ],
    factory: () => new MobileShowcase(),
  },
  {
    slug: "10-audio",
    name: "10 Audio",
    description:
      "Loops, one-shots, effects (LPF/HPF/reverb/pitch), 2D spatial audio.",
    controls: "Arrows: Move Listener | Space: Toggle Rain | C: Click | V: Thunder",
    features: [
      "Spatial audio listener positioning",
      "Dynamic sound loading and effect filters",
      "Triggered haptic/audio synchronized events",
    ],
    factory: () => new AudioShowcase(),
  },
  {
    slug: "11-custom-sprites",
    name: "11 Custom Sprites",
    description:
      "GPU font atlas viewer: block 0 (CP437) and block 1 (custom PNG) rendered side by side as 16×16 glyph grids.",
    factory: () => new CustomSpritesShowcase(),
  },
  {
    slug: "12-bridge-communication",
    name: "12 Bridge Communication",
    description:
      "Bidirectional JSON messaging between engine and host web app.",
    controls: "Space: Send ping to host",
    factory: () => new BridgeShowcase(),
  },
  {
    slug: "13-multi-display",
    name: "13 Multi-Display",
    description:
      "One application driving two independent Display surfaces simultaneously.",
    factory: () => new MultiDisplay(),
  },
  {
    slug: "14-post-process",
    name: "14 Post-Process",
    description:
      "Demonstrates CRT scanlines, pixel grid, and Ambilight background effects.",
    controls: "1: Toggle CRT\n2: Toggle Ambilight\n3: Toggle Pixel Grid",
    factory: () => new PostProcessShowcase(),
  },
  {
    slug: "15-multi-user",
    name: "15 Multi-User",
    description:
      "Architecture for handling hundreds of concurrent users inside a single world simulation. Note: To truly test this, run it on a client-server runtime rather than standalone mode.",
    factory: () => new MultiUserShowcase(),
  },
  {
    slug: "16-cp437",
    name: "16 CP 437",
    description:
      "Full CP437 character table - tests Unicode -> CP437 conversion for all 256 glyphs.",
    factory: () => new Cp437Table(),
  },


  // ── Showcases ────────────────────────────────────────────────────────────
  {
    slug: "showcase-3d-01-voxel-space",
    name: "Voxel Space",
    description: "Pseudo-3D landscape flyover using the Voxel Space algorithm.",
    category: "showcase-3d",
    factory: () => new VoxelSpaceApp(),
  },
  {
    slug: "showcase-3d-02-primitiv-craft",
    name: "Primitiv Craft",
    description:
      "First-person 3D block world: DDA raycasting, 180-slot palette day/night cycle, physics.",
    controls: "WASD: Move\nArrows: Look\nSpace: Jump\nShift: Sprint",
    category: "showcase-3d",
    factory: () => new PrimitivCraft(),
  },
  {
    slug: "showcase-3d-03-ray-maze",
    name: "Ray Maze",
    description:
      "Inspired by the Windows 98 3D Maze screensaver. Raycasting, depth shading, billboard sprites.",
    category: "showcase-3d",
    factory: () => new RayMazeApp(),
  },
  {
    slug: "showcase-3d-04-wireframe-3d",
    name: "Synthwave AI",
    description:
      "Infinite retro-city dodging game with AI autopilot.",
    category: "showcase-3d",
    factory: () => new Wireframe3DShowcase(),
  },
  {
    slug: "showcase-01-pseudo-htop",
    name: "Pseudo Htop",
    description:
      "A fake Htop-style clone plotting simulated server metrics, processes, and network resources.",
    category: "showcase",
    factory: () => new RetroDashboard(),
  },
  {
    slug: "showcase-02-dungeon",
    name: "02 Dungeon Crawler",
    description:
      "A minimalist top-down dungeon crawler where you collect gold.",
    controls: "WASD / Arrows: Move",
    category: "showcase",
    factory: () => new DungeonApp(),
  },
  {
    slug: "showcase-03-game-of-life",
    name: "03 Game of Life",
    description:
      "An interactive implementation of Conway's Game of Life with drawing tools and dynamic 20Hz timing.",
    controls: "Mouse: Draw cells",
    category: "showcase",
    factory: () => new GameOfLife(),
  },
  {
    slug: "showcase-04-spaceship",
    name: "04 Starship",
    description:
      "3D starfield and spaceship interior with three navigable scenes. Palette cycling, dotCloudMulti, fullFrameMulti.",
    controls:
      "WASD / Arrows: Move\nF: Interact / Stand up\nL: Warp toggle\nY: Power toggle",
    category: "showcase",
    factory: () => new Spaceship(),
  },
  {
    slug: "showcase-05-radar",
    name: "05 Tactical Radar",
    description:
      "Atmospheric radar simulation demonstrating sample & hold tracking, phosphor decay, and static/dynamic layer separation.",
    category: "showcase",
    factory: () => new PrimitivRadar(),
  },
  {
    slug: "showcase-06-fluid",
    name: "06 Navier-Stokes Fluid",
    description: "Navier-Stokes based autonomous fluid simulation with pressure solvers.",
    controls: "None (Autonomous Simulation)",
    category: "showcase",
    factory: () => new FluidShowcase(),
  },
  {
    slug: "showcase-07-terminal-bomber",
    name: "07 Terminal Bomber",
    description:
      "Multiplayer Bomberman-style game in ASCII art. Host or join servers and play against other players or heatmap-driven bots. Multiplayer requires running on a server.",
    controls: "WASD / Arrows: Move\nSpace / Z: Drop bomb",
    category: "showcase",
    factory: () => new TermBomber(),
  },
  {
    slug: "showcase-08-snake",
    name: "08 Minimal Snake",
    description:
      "Complete Minimal Snake game. Arrow keys to move, eat ♦ to grow.",
    controls: "Arrow Keys: Move",
    category: "showcase",
    factory: () => new Minimal(),
  },
  {
    slug: "showcase-09-pong",
    name: "09 Pong",
    description:
      "Pong clone demonstrating 5-layer Z-buffer depth, 3D beveled frame, interpolated motion trails, and additive collision glows.",
    controls: "Space: Slow-motion",
    category: "showcase",
    factory: () => new Pong(),
  },
  {
    slug: "showcase-10-breakout",
    name: "10 Breakout",
    description:
      "Breakout clone with 5-layer Z-buffer depth system, 3D beveled frame, falling power-ups, interpolated motion trails, and additive collision glows.",
    controls: "Arrow Keys: Move paddle\nSpace: Launch Ball",
    category: "showcase",
    factory: () => new Breakout(),
  },
  {
    slug: "showcase-11-minimal-example",
    name: "11 Minimal Code Example",
    description: "A minimal interactive code example used for articles and tutorials.",
    controls: "Arrow Keys: Move character",
    category: "showcase",
    factory: () => new MyGame(),
  },
];

export function findApp(slug: string): AppEntry | undefined {
  return APP_REGISTRY.find((a) => a.slug === slug);
}
