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

import { VoxelSpaceApp } from "../../../applications/showcase-3d-01-voxel-space";
import { PrimitivCraft } from "../../../applications/showcase-3d-02-primitiv-craft";
import { RayMazeApp } from "../../../applications/showcase-3d-03-ray-maze";
import { Wireframe3DShowcase } from "../../../applications/showcase-3d-04-wireframe-3d";

import { RetroDashboard } from "../../../applications/showcase-01-pseudo-htop";

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
    factory: () => new InputShowcase(),
  },
  {
    slug: "03-world-sectors",
    name: "03 World Sectors",
    description: "Large scrollable world with sector-based loading.",
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
    factory: () => new MobileShowcase(),
  },
  {
    slug: "10-audio",
    name: "10 Audio",
    description:
      "Loops, one-shots, effects (LPF/HPF/reverb/pitch), 2D spatial audio.",
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
    factory: () => new BridgeShowcase(),
  },
  {
    slug: "13-multi-display",
    name: "13 Multi-Display",
    description: "One application driving two independent Display surfaces simultaneously.",
    factory: () => new MultiDisplay(),
  },
  {
    slug: "14-post-process",
    name: "14 Post-Process",
    description: "Demonstrates CRT scanlines, pixel grid, and Ambilight background effects.",
    factory: () => new PostProcessShowcase(),
  },
  {
    slug: "15-multi-user",
    name: "15 Multi-User",
    description: "Isomorphic MMO architecture: separate global updates (NPCs) vs per-user graphical updates.",
    factory: () => new MultiUserShowcase(),
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
    name: "Wireframe 3D",
    description:
      "3D perspective projection with wireframe rendering and OBJ parsing.",
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
];

export function findApp(slug: string): AppEntry | undefined {
  return APP_REGISTRY.find((a) => a.slug === slug);
}
