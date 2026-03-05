/**
 * Name: mobile-input
 * Description: Demonstration of touch input and phone vibration (haptics).
 *
 * Why study this:
 *   Modern web apps run on mobile. Primitiv provides two layers of touch support:
 *   1. Touch Zones: Named screen regions (defined in grid cells) that act as
 *      virtual buttons or directional axes. The client handles hit-testing.
 *   2. Phone Vibration: `user.vibrate(pattern)` triggers the device's vibration
 *      motor via the browser's Navigator.vibrate API.
 *
 * Touch Zone Workflow:
 *   a) Define zones via `registry.defineTouchZone(id, name, x, y, w, h)`.
 *   b) Map zones to logical buttons/axes via `registry.defineButton()` / `registry.defineAxis()`.
 *      Use `InputDeviceType.TouchZone` and reference the zone by its `touchZoneId`.
 *   c) Query state with `user.getButton()` / `user.getAxis()` as usual.
 *
 * Vibration:
 *   `user.vibrate(50)` — Single buzz, 50ms.
 *   `user.vibrate([100, 50, 100])` — Vibrate 100ms, pause 50ms, vibrate 100ms.
 *   Note: Most browsers require a prior user interaction (first tap) before
 *   allowing vibrations. This is a browser security policy, not an engine limit.
 *
 * Combining Inputs:
 *   The same logical action can have multiple sources. The example below maps
 *   each virtual button to BOTH a touch zone AND a keyboard key, so you can
 *   test this app on desktop too.
 *
 * What this example demonstrates:
 *   - A virtual D-pad and two action buttons built from touch zones, with live
 *     visual feedback showing each zone's activation state in real-time.
 *   - Phone haptic feedback: button taps trigger vibration patterns via the
 *     browser's Navigator.vibrate API — single buzzes and patterned sequences.
 *   - Dual input binding: every action is mapped to both a touch zone and a
 *     keyboard key so the example is fully testable on desktop.
 *
 * Key Concepts:
 *   - `reg.defineTouchZone(id, name, x, y, w, h)` — declare a screen region (in grid cells) as a named input source.
 *   - `registry.defineAxis(actionId, name, [{ sourceId, type: InputDeviceType.TouchZone, touchZoneId, touchZoneAxis: 'x'|'y' }])` — bind a touch zone to a logical axis.
 *   - `registry.defineButton(actionId, name, [{ sourceId, type: InputDeviceType.TouchZone, touchZoneId }])` — bind a touch zone to a logical button.
 *   - `user.getButton(actionId)` / `user.getAxis(actionId)` — query state as usual, regardless of input source.
 *   - `user.vibrate(pattern)` — trigger device vibration: number for a single buzz, array `[on, off, on, ...]` for a patterned sequence.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  KeyboardInput,
  TouchZoneInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

interface MobileUserData {
  staticLayer: Layer;
  dynamicLayer: Layer;
  lastAction: string;
  tapCount: number;
}

export class MobileShowcase implements IApplication<
  Engine,
  User<MobileUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 10, g: 10, b: 20, a: 255 }, // Dark BG
      { colorId: 1, r: 80, g: 200, b: 120, a: 255 }, // Active Green
      { colorId: 2, r: 250, g: 80, b: 80, a: 255 }, // Red
      { colorId: 3, r: 200, g: 200, b: 250, a: 255 }, // White Text
      { colorId: 4, r: 100, g: 100, b: 150, a: 255 }, // Gray Text
      { colorId: 5, r: 255, g: 200, b: 80, a: 255 }, // Yellow
      { colorId: 6, r: 80, g: 150, b: 255, a: 255 }, // Blue
    ]);
    runtime.setTickRate(60);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<MobileUserData>,
  ): void {
    const width = 40;
    const height = 30;

    user.data.lastAction = "None";
    user.data.tapCount = 0;

    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);

    // Static layer for labels and fixed UI
    const staticLayer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    user.data.staticLayer = staticLayer;
    user.addLayer(staticLayer);

    // Dynamic layer for changing values
    const dynamicLayer = new Layer(new Vector2(0, 0), 1, width, height, {
      mustBeReliable: false,
    });
    user.data.dynamicLayer = dynamicLayer;
    user.addLayer(dynamicLayer);

    // Draw all static content once
    const staticOrders: any[] = [];
    staticOrders.push(
      OrderBuilder.fill(" ", 0, 0),
      OrderBuilder.text(2, 1, "--- MOBILE INPUT ---", 3, 0),
      OrderBuilder.text(2, 2, "Touch zones + vibration", 4, 0),
      // Axes section
      OrderBuilder.text(2, 5, "AXES:", 3, 0),
      OrderBuilder.text(2, 6, "Move X:", 4, 0),
      OrderBuilder.text(2, 7, "Move Y:", 4, 0),
      // Buttons section
      OrderBuilder.text(2, 9, "BUTTONS:", 3, 0),
      OrderBuilder.text(2, 10, "Action A:", 4, 0),
      OrderBuilder.text(2, 11, "Action B:", 4, 0),
      // Status section
      OrderBuilder.text(2, 15, "LAST HAPTIC:", 3, 0),
      // D-Pad label
      OrderBuilder.text(4, 17, "D-PAD", 3, 0),
      // Button labels
      OrderBuilder.text(29, 26, "Space", 4, 0),
      OrderBuilder.text(29, 18, "Ctrl", 4, 0),
      // Legend
      OrderBuilder.text(18, 5, "Desktop:", 4, 0),
      OrderBuilder.text(18, 6, "Arrows = D-Pad", 4, 0),
      OrderBuilder.text(18, 7, "Space  = A", 4, 0),
      OrderBuilder.text(18, 8, "Ctrl   = B", 4, 0),
    );
    staticLayer.setOrders(staticOrders);


    const reg = user.getInputBindingRegistry();

    /**
     * TOUCH ZONE DEFINITIONS
     * Zones are screen regions in grid cells. The client hit-tests all active
     * touches against these rectangles every frame.
     */
    reg.defineTouchZone(0, "dpad", 2, 18, 12, 10); // Left side: virtual D-Pad
    reg.defineTouchZone(1, "btnA", 28, 22, 10, 6); // Right side: Action A
    reg.defineTouchZone(2, "btnB", 28, 14, 10, 6); // Right side: Action B

    /**
     * AXIS: MOVE_X mapped to D-Pad zone + Keyboard arrows
     * Touch inside the dpad zone: finger position relative to center → -1..+1.
     */
    reg.defineAxis(0, "MOVE_X", [
      {
        sourceId: 0,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowLeft,
        positiveKey: KeyboardInput.ArrowRight,
      },
      {
        sourceId: 1,
        type: InputDeviceType.TouchZone,
        touchZoneId: 0,
        touchZoneAxis: "x",
      },
    ]);

    /**
     * AXIS: MOVE_Y mapped to D-Pad zone + Keyboard arrows
     */
    reg.defineAxis(1, "MOVE_Y", [
      {
        sourceId: 2,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowUp,
        positiveKey: KeyboardInput.ArrowDown,
      },
      {
        sourceId: 3,
        type: InputDeviceType.TouchZone,
        touchZoneId: 0,
        touchZoneAxis: "y",
      },
    ]);

    /**
     * BUTTON: ACTION_A mapped to zone 1 + Space key
     */
    reg.defineButton(0, "ACTION_A", [
      { sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
      {
        sourceId: 5,
        type: InputDeviceType.TouchZone,
        touchZoneId: TouchZoneInput.Zone1,
      },
    ]);

    /**
     * BUTTON: ACTION_B mapped to zone 2 + Ctrl key
     */
    reg.defineButton(1, "ACTION_B", [
      {
        sourceId: 6,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ControlLeft,
      },
      {
        sourceId: 7,
        type: InputDeviceType.TouchZone,
        touchZoneId: TouchZoneInput.Zone2,
      },
    ]);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<MobileUserData>,
  ): void {
    const data = user.data;
    const o: any[] = [];

    // =====================================================================
    // D-PAD (Touch Zone 0) - Dynamic content
    // =====================================================================
    const moveX = user.getAxis("MOVE_X");
    const moveY = user.getAxis("MOVE_Y");

    // Draw D-Pad zone outline
    o.push(OrderBuilder.rect(2, 18, 12, 10, ".", 4, 0, false));

    // D-Pad center cross
    const dpCx = 2 + 6; // center X of the zone
    const dpCy = 18 + 5; // center Y of the zone
    o.push(OrderBuilder.char(dpCx, dpCy, "+", 4, 0));

    // D-Pad cursor (shows axis position)
    const dpDx = dpCx + Math.round(moveX * 5);
    const dpDy = dpCy + Math.round(moveY * 4);
    o.push(OrderBuilder.char(dpDx, dpDy, "O", 6, 0));

    // Axis values - dynamic values only
    o.push(
      OrderBuilder.text(
        10,
        6,
        `${moveX.toFixed(2).padStart(6, " ")}`,
        moveX !== 0 ? 6 : 4,
        0,
      ),
    );
    o.push(
      OrderBuilder.text(
        10,
        7,
        `${moveY.toFixed(2).padStart(6, " ")}`,
        moveY !== 0 ? 6 : 4,
        0,
      ),
    );

    // =====================================================================
    // ACTION BUTTONS (Touch Zones 1 & 2) - Dynamic content
    // =====================================================================

    // Action A
    const holdA = user.getButton("ACTION_A");
    const justA = user.isJustPressed("ACTION_A");

    o.push(
      OrderBuilder.rect(
        28,
        22,
        10,
        6,
        holdA ? "#" : ".",
        holdA ? 1 : 4,
        0,
        false,
      ),
    );
    o.push(OrderBuilder.text(31, 24, "A", holdA ? 1 : 4, 0));

    if (justA) {
      data.lastAction = "Action A";
      data.tapCount++;
      // Short pulse
      user.vibrate(30);
    }

    o.push(
      OrderBuilder.text(12, 10, holdA ? "HELD" : "----", holdA ? 1 : 4, 0),
    );

    // Action B
    const holdB = user.getButton("ACTION_B");
    const justB = user.isJustPressed("ACTION_B");

    o.push(
      OrderBuilder.rect(
        28,
        14,
        10,
        6,
        holdB ? "#" : ".",
        holdB ? 2 : 4,
        0,
        false,
      ),
    );
    o.push(OrderBuilder.text(31, 16, "B", holdB ? 2 : 4, 0));

    if (justB) {
      data.lastAction = "Action B";
      data.tapCount++;
      // Rhythmic pattern: vib 100ms, pause 50ms, vib 100ms
      user.vibrate([100, 50, 100]);
    }

    o.push(
      OrderBuilder.text(12, 11, holdB ? "HELD" : "----", holdB ? 2 : 4, 0),
    );

    // =====================================================================
    // STATUS - Dynamic values
    // =====================================================================
    o.push(
      OrderBuilder.text(2, 13, `Taps: ${data.tapCount}`.padEnd(15, " "), 4, 0),
    );
    o.push(OrderBuilder.text(15, 15, data.lastAction.padEnd(12, " "), 5, 0));

    // Commit
    data.dynamicLayer.setOrders(o);

  }

  update(_runtime: IRuntime, _engine: Engine): void {}
}
