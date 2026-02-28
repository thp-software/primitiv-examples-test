/**
 * Name: gamepad-input
 * Description: Exhaustive demonstration of gamepad input handling.
 *
 * Why study this:
 *   This example covers everything related to gamepad (controller) input in Primitiv.
 *   While 02-mouse-keyboard-input demonstrates Keyboard and Mouse bindings,
 *   this example focuses exclusively on gamepads.
 *
 * Gamepad Input Types:
 *   BUTTONS (digital, on/off):
 *     Face buttons: ButtonA, ButtonB, ButtonX, ButtonY
 *     D-Pad: DPadUp, DPadDown, DPadLeft, DPadRight
 *     Shoulders: LeftShoulder (L1), RightShoulder (R1)
 *     Stick Clicks: LeftStick (L3), RightStick (R3)
 *
 *   AXES (analog, -1.0 to 1.0 or 0.0 to 1.0):
 *     Left Stick: LeftStickX, LeftStickY
 *     Right Stick: RightStickX, RightStickY
 *     Triggers: LeftTriggerAxis (L2), RightTriggerAxis (R2) — range 0.0 to 1.0
 *
 *   VIBRATION (Haptic Feedback):
 *     Dual-rumble support via `user.vibrateGamepad()`.
 *     Supports duration, strong magnitude (low-freq), and weak magnitude (high-freq).
 *     - Face Buttons: Trigger fixed bursts of varying intensities.
 *     - Triggers: Trigger continuous rumble scaling with pressure (L2=Strong, R2=Weak).
 *
 * gamepadIndex:
 *   Primitiv supports multiple gamepads. The `gamepadIndex` field (0, 1, 2, ...)
 *   identifies which physical controller the binding targets.
 *   This example binds everything to gamepadIndex 0 (first connected controller).
 *
 * How to test:
 *   1. Connect a gamepad (Xbox, PlayStation, or any XInput/DInput controller).
 *   2. Press any button to wake it up (browsers require a user gesture).
 *   3. All buttons, sticks, and triggers will show live values on screen.
 *   4. Press A, B, X, or Y to trigger different vibration patterns.
 *
 * What this example demonstrates:
 *   - Live display of all standard gamepad inputs: face buttons (A/B/X/Y), D-Pad,
 *     shoulder buttons (L1/R1), stick clicks (L3/R3), dual analog sticks, and
 *     pressure-sensitive triggers (L2/R2).
 *   - Dual-rumble haptic feedback: fixed vibration bursts triggered by face button
 *     presses, and continuous rumble scaling with trigger pressure
 *     (L2 = strong magnitude, R2 = weak magnitude).
 *   - Multi-gamepad architecture: every binding targets a specific `gamepadIndex` so
 *     multiple controllers can coexist without conflict.
 *
 * Key Concepts:
 *   - `registry.defineButton(actionId, name, [{ sourceId, type: InputDeviceType.Gamepad, gamepadIndex, button: GamepadInput.ButtonA }])` — map a gamepad button to a logical action.
 *   - `registry.defineAxis(actionId, name, [{ sourceId, type: InputDeviceType.Gamepad, gamepadIndex, axis: GamepadInput.LeftStickX }])` — map an analog axis.
 *   - `user.getButton(actionId)` — returns `{ pressed, justPressed, justReleased }`.
 *   - `user.getAxis(actionId)` — returns the current axis value (−1.0 to 1.0; triggers: 0.0 to 1.0).
 *   - `user.vibrateGamepad({ duration, strongMagnitude, weakMagnitude })` — dual-rumble haptic output.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  GamepadInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

interface GamepadUserData {
  layer: Layer;
  lastAction: string;
}

export class GamepadShowcase implements IApplication<
  Engine,
  User<GamepadUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 15, g: 15, b: 25, a: 255 }, // Dark BG
      { colorId: 1, r: 80, g: 200, b: 120, a: 255 }, // Active Green
      { colorId: 2, r: 250, g: 80, b: 80, a: 255 }, // Highlight Red
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
    user: User<GamepadUserData>,
  ): void {
    const width = 70;
    const height = 40;

    user.data.lastAction = "None";

    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);

    const layer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: false,
    });
    user.data.layer = layer;
    user.addLayer(layer);

    /**
     * GAMEPAD BINDINGS
     * All bindings target gamepadIndex: 0 (first connected controller).
     */
    const registry = user.getInputBindingRegistry();

    // Face Buttons
    registry.defineButton(0, "GP_A", [
      {
        sourceId: 1,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonA,
      },
    ]);
    registry.defineButton(1, "GP_B", [
      {
        sourceId: 2,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonB,
      },
    ]);
    registry.defineButton(2, "GP_X", [
      {
        sourceId: 3,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonX,
      },
    ]);
    registry.defineButton(3, "GP_Y", [
      {
        sourceId: 4,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonY,
      },
    ]);

    // D-Pad
    registry.defineButton(4, "GP_UP", [
      {
        sourceId: 5,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadUp,
      },
    ]);
    registry.defineButton(5, "GP_DOWN", [
      {
        sourceId: 6,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadDown,
      },
    ]);
    registry.defineButton(6, "GP_LEFT", [
      {
        sourceId: 7,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadLeft,
      },
    ]);
    registry.defineButton(7, "GP_RIGHT", [
      {
        sourceId: 8,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadRight,
      },
    ]);

    // Shoulders
    registry.defineButton(8, "GP_L1", [
      {
        sourceId: 9,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.LeftShoulder,
      },
    ]);
    registry.defineButton(9, "GP_R1", [
      {
        sourceId: 10,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.RightShoulder,
      },
    ]);

    // Stick Clicks (L3 / R3)
    // These are the buttons triggered by pressing the joystick down without tilting it.
    // W3C Gamepad standard: buttons[10] = LeftStick, buttons[11] = RightStick.
    registry.defineButton(10, "GP_L3", [
      {
        sourceId: 17,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.LeftStick,
      },
    ]);
    registry.defineButton(11, "GP_R3", [
      {
        sourceId: 18,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.RightStick,
      },
    ]);

    // Sticks (Axes: -1.0 to 1.0)
    registry.defineAxis(0, "LEFT_X", [
      {
        sourceId: 11,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.LeftStickX,
      },
    ]);
    registry.defineAxis(1, "LEFT_Y", [
      {
        sourceId: 12,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.LeftStickY,
      },
    ]);
    registry.defineAxis(2, "RIGHT_X", [
      {
        sourceId: 13,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.RightStickX,
      },
    ]);
    registry.defineAxis(3, "RIGHT_Y", [
      {
        sourceId: 14,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.RightStickY,
      },
    ]);

    // Triggers (Axes: 0.0 to 1.0)
    registry.defineAxis(4, "L2", [
      {
        sourceId: 15,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.LeftTriggerAxis,
      },
    ]);
    registry.defineAxis(5, "R2", [
      {
        sourceId: 16,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        axis: GamepadInput.RightTriggerAxis,
      },
    ]);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<GamepadUserData>,
  ): void {
    const data = user.data;
    const o: any[] = [];

    o.push(OrderBuilder.fill(" ", 0, 0));
    o.push(OrderBuilder.text(2, 1, "--- PRIMITIV GAMEPAD INPUT ---", 3, 0));
    o.push(
      OrderBuilder.text(
        2,
        2,
        "Connect a controller and press any button.",
        4,
        0,
      ),
    );

    // =====================================================================
    // FACE BUTTONS (A, B, X, Y)
    // =====================================================================
    o.push(OrderBuilder.text(2, 4, "FACE BUTTONS:", 3, 0));

    const faceButtons = [
      { name: "GP_A", label: "A", x: 2 },
      { name: "GP_B", label: "B", x: 12 },
      { name: "GP_X", label: "X", x: 22 },
      { name: "GP_Y", label: "Y", x: 32 },
    ];

    for (const btn of faceButtons) {
      const held = user.getButton(btn.name);
      const just = user.isJustPressed(btn.name);
      if (just) {
        data.lastAction = `Pressed ${btn.label}`;

        // TRIGGER VIBRATION on face button press
        // Patterns vary per button to demonstrate strong vs weak motors
        if (btn.label === "A")
          user.vibrateGamepad({
            duration: 150,
            strongMagnitude: 0.5,
            weakMagnitude: 0.5,
          });
        if (btn.label === "B")
          user.vibrateGamepad({
            duration: 300,
            strongMagnitude: 1.0,
            weakMagnitude: 0.0,
          });
        if (btn.label === "X")
          user.vibrateGamepad({
            duration: 300,
            strongMagnitude: 0.0,
            weakMagnitude: 1.0,
          });
        if (btn.label === "Y")
          user.vibrateGamepad({
            duration: 100,
            strongMagnitude: 1.0,
            weakMagnitude: 1.0,
          });
      }

      o.push(OrderBuilder.text(btn.x, 5, `[${btn.label}]`, held ? 1 : 4, 0));
      o.push(
        OrderBuilder.text(btn.x, 6, held ? "HELD" : "----", held ? 1 : 4, 0),
      );
    }

    // =====================================================================
    // D-PAD
    // =====================================================================
    o.push(OrderBuilder.text(2, 8, "D-PAD:", 3, 0));

    const dpadButtons = [
      { name: "GP_UP", label: "Up", x: 2 },
      { name: "GP_DOWN", label: "Down", x: 12 },
      { name: "GP_LEFT", label: "Left", x: 22 },
      { name: "GP_RIGHT", label: "Right", x: 32 },
    ];

    for (const btn of dpadButtons) {
      const held = user.getButton(btn.name);
      if (user.isJustPressed(btn.name)) data.lastAction = `DPad ${btn.label}`;

      o.push(OrderBuilder.text(btn.x, 9, btn.label, held ? 1 : 4, 0));
      o.push(
        OrderBuilder.text(btn.x, 10, held ? "HELD" : "----", held ? 1 : 4, 0),
      );
    }

    // =====================================================================
    // SHOULDERS (L1 / R1)
    // =====================================================================
    o.push(OrderBuilder.text(2, 12, "SHOULDERS:", 3, 0));

    const l1 = user.getButton("GP_L1");
    const r1 = user.getButton("GP_R1");
    if (user.isJustPressed("GP_L1")) data.lastAction = "Pressed L1";
    if (user.isJustPressed("GP_R1")) data.lastAction = "Pressed R1";

    o.push(OrderBuilder.text(2, 13, "L1:", 4, 0));
    o.push(OrderBuilder.text(6, 13, l1 ? "HELD" : "----", l1 ? 1 : 4, 0));
    o.push(OrderBuilder.text(16, 13, "R1:", 4, 0));
    o.push(OrderBuilder.text(20, 13, r1 ? "HELD" : "----", r1 ? 1 : 4, 0));

    // Stick Clicks (L3 / R3)
    const l3 = user.getButton("GP_L3");
    const r3 = user.getButton("GP_R3");
    if (user.isJustPressed("GP_L3")) data.lastAction = "Pressed L3";
    if (user.isJustPressed("GP_R3")) data.lastAction = "Pressed R3";

    o.push(OrderBuilder.text(34, 13, "L3:", 4, 0));
    o.push(OrderBuilder.text(38, 13, l3 ? "HELD" : "----", l3 ? 1 : 4, 0));
    o.push(OrderBuilder.text(48, 13, "R3:", 4, 0));
    o.push(OrderBuilder.text(52, 13, r3 ? "HELD" : "----", r3 ? 1 : 4, 0));

    // =====================================================================
    // TRIGGERS (L2 / R2) — analog axes 0.0 to 1.0
    // =====================================================================
    o.push(OrderBuilder.text(2, 15, "TRIGGERS:", 3, 0));

    const l2 = user.getAxis("L2");
    const r2 = user.getAxis("R2");

    // CONTINUOUS TRIGGER VIBRATION
    // We use a short duration (100ms) refreshed every frame to follow pressure.
    // L2 = Strong motor (Heavy), R2 = Weak motor (Buzz)
    if (l2 > 0.05 || r2 > 0.05) {
      user.vibrateGamepad({
        duration: 100,
        strongMagnitude: l2,
        weakMagnitude: r2,
      });
    }

    o.push(OrderBuilder.text(2, 16, "L2:", 4, 0));
    o.push(
      OrderBuilder.text(
        6,
        16,
        l2.toFixed(2).padStart(5, " "),
        l2 > 0.1 ? 5 : 4,
        0,
      ),
    );

    // L2 bar
    const l2Len = Math.floor(l2 * 20);
    o.push(OrderBuilder.rect(2, 17, 20, 1, "-", 4, 0, true));
    if (l2Len > 0) o.push(OrderBuilder.rect(2, 17, l2Len, 1, "=", 5, 0, true));

    o.push(OrderBuilder.text(30, 16, "R2:", 4, 0));
    o.push(
      OrderBuilder.text(
        34,
        16,
        r2.toFixed(2).padStart(5, " "),
        r2 > 0.1 ? 5 : 4,
        0,
      ),
    );

    // R2 bar
    const r2Len = Math.floor(r2 * 20);
    o.push(OrderBuilder.rect(30, 17, 20, 1, "-", 4, 0, true));
    if (r2Len > 0) o.push(OrderBuilder.rect(30, 17, r2Len, 1, "=", 5, 0, true));

    // =====================================================================
    // LEFT STICK
    // =====================================================================
    o.push(OrderBuilder.text(2, 19, "LEFT STICK:", 3, 0));

    const lx = user.getAxis("LEFT_X");
    const ly = user.getAxis("LEFT_Y");

    o.push(
      OrderBuilder.text(
        2,
        20,
        `X: ${lx.toFixed(2).padStart(6, " ")}`,
        lx !== 0 ? 6 : 4,
        0,
      ),
    );
    o.push(
      OrderBuilder.text(
        2,
        21,
        `Y: ${ly.toFixed(2).padStart(6, " ")}`,
        ly !== 0 ? 6 : 4,
        0,
      ),
    );

    // Visual: square 11x11 box with a dot for the stick position
    const lBoxX = 2;
    const lBoxY = 23;
    o.push(OrderBuilder.rect(lBoxX, lBoxY, 11, 11, ".", 4, 0, true));
    // Center cross drawn FIRST so the stick cursor 'O' appears on top
    o.push(OrderBuilder.char(lBoxX + 5, lBoxY + 5, "+", 4, 0));
    const ldx = lBoxX + 5 + Math.round(lx * 5);
    const ldy = lBoxY + 5 + Math.round(ly * 5);
    o.push(OrderBuilder.char(ldx, ldy, "O", 6, 0));

    // =====================================================================
    // RIGHT STICK
    // =====================================================================
    o.push(OrderBuilder.text(30, 19, "RIGHT STICK:", 3, 0));

    const rx = user.getAxis("RIGHT_X");
    const ry = user.getAxis("RIGHT_Y");

    o.push(
      OrderBuilder.text(
        30,
        20,
        `X: ${rx.toFixed(2).padStart(6, " ")}`,
        rx !== 0 ? 6 : 4,
        0,
      ),
    );
    o.push(
      OrderBuilder.text(
        30,
        21,
        `Y: ${ry.toFixed(2).padStart(6, " ")}`,
        ry !== 0 ? 6 : 4,
        0,
      ),
    );

    // Visual: square 11x11 box with a dot for the stick position
    const rBoxX = 30;
    const rBoxY = 23;
    o.push(OrderBuilder.rect(rBoxX, rBoxY, 11, 11, ".", 4, 0, true));
    // Center cross drawn FIRST so the stick cursor 'O' appears on top
    o.push(OrderBuilder.char(rBoxX + 5, rBoxY + 5, "+", 4, 0));
    const rdx = rBoxX + 5 + Math.round(rx * 5);
    const rdy = rBoxY + 5 + Math.round(ry * 5);
    o.push(OrderBuilder.char(rdx, rdy, "O", 6, 0));

    // =====================================================================
    // VIBRATION INFO
    // =====================================================================
    o.push(OrderBuilder.text(2, 35, "VIBRATION:", 3, 0));
    o.push(
      OrderBuilder.text(18, 35, "A/B/X/Y: Bursts | L2/R2: Scaled Rumble", 4, 0),
    );

    // =====================================================================
    // LAST ACTION
    // =====================================================================
    o.push(OrderBuilder.text(2, 37, "LAST ACTION:", 3, 0));
    o.push(OrderBuilder.text(16, 37, data.lastAction, 2, 0));

    // Commit
    data.layer.setOrders(o);
    data.layer.commit();
  }

  update(_runtime: IRuntime, _engine: Engine): void { }
}
