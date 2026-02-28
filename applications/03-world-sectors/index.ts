/**
 * Name: world-sectors
 * Description: Demonstrates world space, scene management, and layer manipulation without redrawing.
 *
 * Why study this:
 *   In previous examples, we sent new drawing orders every single frame. This is extremely costly.
 *   Primitiv's client is stateful: Once a layer is drawn, the client remembers it.
 *   To optimize your game, you should draw a layer ONCE (or rarely), and then simply move it, hide it,
 *   or move the camera (Display) to see different parts of the 65535x65535 world.
 *
 * The World Grid & Camera (Display):
 *    The engine world is a massive 65535x65535 grid. The `Display` is just a rectangular camera.
 *    Changing `display.setOrigin(new Vector2(x, y))` instantly teleports the user's view
 *    with zero network overhead for drawing. This allows you to pre-build "levels" or "scenes"
 *    in different sectors of the world and just jump between them.
 *
 * Moving Layers (Zero-Cost Translation):
 *    If an object moves but doesn't change its internal graphics, DO NOT redraw it!
 *    Calling `layer.setOrigin(new Vector2(x, y))` sends only the new coordinates (4 bytes),
 *    saving immense bandwidth compared to resending text or pixel orders.
 *
 * Hiding/Showing Layers (Zero-Cost Toggling):
 *    You can pre-load a layer (like a heavy UI menu) and use `layer.setEnabled(true/false)`.
 *    This toggles visibility instantly on the client without destroying or resending
 *    the drawing orders previously stored in memory.
 *
 * Zero-Cost Teleportation:
 *    Because everything is pre-drawn in different world coordinates, "teleporting" and
 *    "switching scenes" is reduced to a single camera position change.
 *
 * What this example demonstrates:
 *   - A 65535×65535 world pre-populated with three "sectors" (rooms), each drawn once
 *     during `initUser`. The camera teleports between them via `display.setOrigin()`.
 *   - A vehicle layer that translates across world space every tick with only 4 bytes
 *     of network overhead — no drawing orders resent.
 *   - A HUD layer that is toggled on/off with `layer.setEnabled()`, demonstrating
 *     zero-cost visibility switching without destroying or re-uploading the layer data.
 *
 * Key Concepts:
 *   - `display.setOrigin(new Vector2(x, y))` — move the camera to any world position; zero network cost for drawing.
 *   - `layer.setOrigin(new Vector2(x, y))` — translate a layer without resending its orders; only the coordinates are transmitted.
 *   - `layer.setEnabled(bool)` — toggle layer visibility on the client without any redraw.
 *   - `layer.commit()` — MUST be called after `setOrders()` AND after any metadata change (`setOrigin`, `setEnabled`) to flush the update to the client.
 *   - Multiple z-indexes: layers with higher zIndex paint over lower ones, enabling HUD overlays.
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

interface WorldSectorsUserData {
  /** The user's main camera view into the 16-bit world space. */
  display: Display;

  /** Reference to the vehicle layer so we can move its origin per-frame. */
  vehicleLayer: Layer;
  /** Logical position of the vehicle (accumulates smooth movement). */
  vehiclePos: { x: number; y: number };

  /** Reference to the UI HUD layer for zero-cost visibility toggling. */
  hudLayer: Layer;
}

export class WorldSectors implements IApplication<
  Engine,
  User<WorldSectorsUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const palette = [
      { colorId: 0, r: 10, g: 10, b: 15, a: 255 }, // Global Dark Void
      { colorId: 1, r: 40, g: 80, b: 40, a: 255 }, // S1: Moss Green (Accent)
      { colorId: 2, r: 100, g: 50, b: 40, a: 255 }, // S2: Earth Red (Accent)
      { colorId: 3, r: 40, g: 50, b: 100, a: 255 }, // S3: Steel Blue (Accent)
      { colorId: 4, r: 255, g: 255, b: 100, a: 255 }, // Vehicle Yellow
      { colorId: 5, r: 150, g: 160, b: 180, a: 255 }, // HUD Blue-Gray
      { colorId: 6, r: 240, g: 240, b: 248, a: 255 }, // Text Off-White
      { colorId: 7, r: 5, g: 20, b: 5, a: 255 }, // S1: Deep Forest (Background)
      { colorId: 8, r: 25, g: 10, b: 5, a: 255 }, // S2: Deep Sun-baked (Background)
      { colorId: 9, r: 5, g: 10, b: 25, a: 255 }, // S3: Deep Midnight (Background)
    ];
    engine.loadPaletteToSlot(0, palette);
    runtime.setTickRate(20);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<WorldSectorsUserData>,
  ): void {
    const width = 80;
    const height = 40;

    // Create the user camera
    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);
    display.setOrigin(new Vector2(0, 0)); // Start in Sector 1
    user.data.display = display;

    // --------------------------------------------------------------------------------
    // PRELOADING SECTORS (Executed ONCE)
    // --------------------------------------------------------------------------------

    // SECTOR 1: The Grasslands
    const s1 = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    s1.setOrders([
      /**
       * OrderBuilder.fill(char, fgColorId, bgColorId)
       * Fills the entire layer surface with a single character and color pair.
       * This is the CHEAPEST way to draw a background.
       */
      OrderBuilder.fill(".", 1, 7),

      /**
       * OrderBuilder.rect(x, y, w, h, char, fgColorId, bgColorId, isFilled)
       * Draws a rectangle. If isFilled=true, it clears the interior.
       * If isFilled=false, it only draws the border.
       */
      OrderBuilder.rect(2, 2, 40, 5, " ", 6, 0, true),
      OrderBuilder.text(4, 3, "SECTOR 1: THE GRASSLANDS", 1, 0),
      OrderBuilder.text(4, 4, "Press [1], [2], [3] to change sectors", 6, 0),
      OrderBuilder.text(4, 5, "Press [SPACE] to toggle HUD", 6, 0),
    ]);
    // VERY IMPORTANT: Even in initUser, you MUST call commit() after setOrders()
    // or any state change (origin, zIndex, enabled) to signal the engine to sync it.
    s1.commit();
    user.addLayer(s1);

    // SECTOR 2: The Red Desert
    const s2 = new Layer(new Vector2(1000, 1000), 0, width, height, {
      mustBeReliable: true,
    });
    s2.setOrders([
      OrderBuilder.fill(".", 2, 8),
      OrderBuilder.rect(2, 2, 40, 5, " ", 6, 0, true),
      OrderBuilder.text(4, 3, "SECTOR 2: THE RED DESERT", 2, 0),
      OrderBuilder.text(4, 4, "Notice how fast teleporting is.", 6, 0),
      OrderBuilder.text(4, 5, "You are at coordinates (1000, 1000).", 6, 0),
    ]);
    s2.commit();
    user.addLayer(s2);

    // SECTOR 3: The Deep Ocean
    const s3 = new Layer(new Vector2(2000, 0), 0, width, height, {
      mustBeReliable: true,
    });
    s3.setOrders([
      OrderBuilder.fill(".", 3, 9),
      OrderBuilder.rect(2, 2, 40, 5, " ", 6, 0, true),
      OrderBuilder.text(4, 3, "SECTOR 3: THE DEEP OCEAN", 3, 0),
      OrderBuilder.text(4, 4, "Drive your vehicle around with Arrows.", 6, 0),
      OrderBuilder.text(
        4,
        5,
        "The layer moves, but we send NO new orders!",
        6,
        0,
      ),
    ]);
    s3.commit();
    user.addLayer(s3);

    // --------------------------------------------------------------------------------
    // PRELOADING MOVING ELEMENTS
    // --------------------------------------------------------------------------------

    // VEHICLE: A tiny 3x3 layer that we will move around.
    user.data.vehiclePos = { x: 38, y: 18 };
    const vehicleLayer = new Layer(
      new Vector2(user.data.vehiclePos.x, user.data.vehiclePos.y),
      1,
      4,
      3,
      { mustBeReliable: false },
    );
    vehicleLayer.setOrders([
      OrderBuilder.text(0, 0, "/--\\", 4, 0),
      OrderBuilder.text(0, 1, "|  |", 4, 0),
      OrderBuilder.text(0, 2, "\\--/", 4, 0),
    ]);
    vehicleLayer.commit();
    user.addLayer(vehicleLayer);
    user.data.vehicleLayer = vehicleLayer;

    // HOLOGRAPHIC HUD: A complex diagnostic menu pre-drawn in initUser.
    // We use a higher Z-index (2) so it appears above sectors and vehicle.
    const hudLayer = new Layer(new Vector2(0, 0), 2, width, height, {
      mustBeReliable: true,
    });
    hudLayer.setOrders([
      // Decorative frame
      OrderBuilder.rect(53, 2, 25, 12, " ", 0, 0, true), // Clear background area
      OrderBuilder.rect(53, 2, 25, 12, "#", 6, 0, false), // Border using only hashes

      // Content
      OrderBuilder.text(55, 3, "--- HUD STATUS ---", 4, 0),
      OrderBuilder.text(55, 5, "VEHICLE: ONLINE", 1, 0),
      OrderBuilder.text(55, 6, "SECTOR: VALID", 1, 0),
      OrderBuilder.text(55, 7, "RADAR: SCANNING", 1, 0),
      OrderBuilder.text(55, 9, "PRESS [SPACE] TO", 6, 0),
      OrderBuilder.text(55, 10, "CLOSE INTERFACE", 6, 0),

      // Visual pulse decoration
      OrderBuilder.text(55, 12, ">>>>>", 4, 0),
    ]);

    /**
     * layer.setEnabled(boolean)
     * Toggles the visibility of the layer.
     * Hiding a layer does NOT destroy its content; it just tells the client
     * to stop rendering it. This is perfect for toggleable UI menus.
     */
    hudLayer.setEnabled(false);
    hudLayer.commit();
    user.addLayer(hudLayer);
    user.data.hudLayer = hudLayer;

    // --------------------------------------------------------------------------------
    // INPUT BINDINGS
    // --------------------------------------------------------------------------------
    const registry = user.getInputBindingRegistry();
    registry.defineButton(0, "JUMP_1", [
      {
        sourceId: 1,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit1,
      },
    ]);
    registry.defineButton(1, "JUMP_2", [
      {
        sourceId: 2,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit2,
      },
    ]);
    registry.defineButton(2, "JUMP_3", [
      {
        sourceId: 3,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit3,
      },
    ]);
    registry.defineButton(3, "TOGGLE_HUD", [
      { sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
    ]);

    registry.defineAxis(0, "VEHICLE_X", [
      {
        sourceId: 5,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowLeft,
        positiveKey: KeyboardInput.ArrowRight,
      },
    ]);
    registry.defineAxis(1, "VEHICLE_Y", [
      {
        sourceId: 6,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowUp,
        positiveKey: KeyboardInput.ArrowDown,
      },
    ]);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<WorldSectorsUserData>,
  ): void {
    const data = user.data;
    let teleported = false;

    // 1. Teleport Camera (Display) and Vehicle to different Sectors
    if (user.isJustPressed("JUMP_1")) {
      data.display.setOrigin(new Vector2(0, 0));
      data.vehiclePos = { x: 38, y: 18 };
      teleported = true;
    } else if (user.isJustPressed("JUMP_2")) {
      data.display.setOrigin(new Vector2(1000, 1000));
      data.vehiclePos = { x: 1038, y: 1018 };
      teleported = true;
    } else if (user.isJustPressed("JUMP_3")) {
      data.display.setOrigin(new Vector2(2000, 0));
      data.vehiclePos = { x: 2038, y: 18 };
      teleported = true;
    }

    // If we teleported, we must also snap the HUD to follow the camera Viewport!
    if (teleported) {
      /**
       * layer.setOrigin(Vector2)
       * Updates the layer's world coordinates.
       * Like display.setOrigin, this is a "metadata-only" update.
       * No drawing orders are re-sent. The client just moves the existing surface.
       */
      data.hudLayer.setOrigin(data.display.getOrigin());

      // We MUST commit after changing the origin to sync the new position.
      data.hudLayer.commit();
    }

    // 2. Toggle Layer Visibility
    if (user.isJustPressed("TOGGLE_HUD")) {
      data.hudLayer.setEnabled(!data.hudLayer.isEnabled());
      // setEnabled automatically marks the layer as needing commit.
      // But we can call commit explicitly to be safe.
      data.hudLayer.commit();
    }

    // 3. Move the Vehicle Layer WITHOUT sending new drawing orders.
    const vx = user.getAxis("VEHICLE_X");
    const vy = user.getAxis("VEHICLE_Y");

    if (vx !== 0 || vy !== 0 || teleported) {
      // Speed factor: less than 1 cell per tick makes it smooth and mathematically accumulate
      const SPEED = 1;
      data.vehiclePos.x += vx * SPEED;
      data.vehiclePos.y += vy * SPEED;

      /**
       * MOVING WITHOUT DRAWING
       * We only update the 2D coordinates. The client already has the
       * vehicle graphic pre-loaded. This loop only sends 4 bytes (X, Y)
       * instead of hundreds of bytes of drawing orders.
       */
      data.vehicleLayer.setOrigin(
        new Vector2(
          Math.floor(data.vehiclePos.x),
          Math.floor(data.vehiclePos.y),
        ),
      );

      // CRITICAL: .commit() is required after EVERY coordinate change
      // to mark the layer for network synchronization this tick.
      data.vehicleLayer.commit();
    }
  }

  update(_runtime: IRuntime, _engine: Engine): void { }
}
