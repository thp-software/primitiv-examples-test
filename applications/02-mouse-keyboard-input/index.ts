/**
 * Name: mouse-keyboard-input
 * Description: Demonstration of input handling (Keyboard and Mouse).
 *
 * Why study this:
 *   After initializing the engine and pushing a frame (seen in 01-simple-matrix),
 *   the next logical step is interaction. This application shows how to map raw hardware
 *   inputs into logical game actions and how to query their state per-frame.
 *
 * Input Binding (The Registry):
 *   Primitiv enforces an abstraction strictly separating physical hardware from game logic.
 *   - You do NOT hardcode `if (Keyboard.KeyW)`.
 *   - Instead, you define a logical binding via `registry.defineButton(id, 'JUMP', [...])`.
 *   - Then, in your loop: `user.getButton('JUMP')`.
 *   This makes adding new input sources or allowing custom keymaps trivial.
 *
 * Input State Types:
 *   - `getButton(name)`: true if the button is currently held down this tick.
 *   - `isJustPressed(name)`: true ONLY on the exact tick the button went from up to down.
 *   - `isJustReleased(name)`: true ONLY on the exact tick the button went from down to up.
 *   - `getAxis(name)`: Returns a float from -1.0 to 1.0 (snapped for keyboard keys).
 *
 * Mouse Display Info:
 *   The mouse also provides local 2D coordinates relative to a Display's viewport.
 *   `user.getMouseDisplayInfo()` handles the complex projection from the browser's
 *   CSS pixels into the engine's display-local cell coordinates automatically.
 *
 * Rendering Orders (Introduced here):
 *   In 01-simple-matrix we only used `.subFrameMulti()`. Here we introduce basic UI orders:
 *   - OrderBuilder.text(x, y, string, fgColorId, bgColorId)
 *   - OrderBuilder.char(x, y, character, fgColorId, bgColorId)
 *   - OrderBuilder.rect(x, y, width, height, char, fgColorId, bgColorId, isFilled)
 *   Color IDs (0-255) match the palette slots defined in the `init()` method.
 *
 * Order Execution & Limits:
 *   Note: Orders are drawn exactly in the sequence they appear in the array.
 *   If orders overlap within the same layer, the LAST one in the array is drawn on top.
 *   CRITICAL: A single layer cannot accept more than 255 orders per frame.
 *   Any additional orders beyond this limit will be truncated and ignored.
 *   Depending on the active log level, a warning may appear in the console.
 *
 * Multi-Layer & Reliability:
 *   This example uses two layers: one for the static background/UI (`mustBeReliable: true`)
 *   and one for the fast-moving mouse cursor (`mustBeReliable: false`).
 *   The cursor layer has a higher `zIndex` to appear on top.
 *   `mustBeReliable: false` prevents head-of-line blocking for data changing every frame.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  KeyboardInput,
  MouseInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

interface InputShowcaseUserData {
  staticLayer: Layer;
  dynamicLayer: Layer;
  cursorLayer: Layer;

  // Storing simple UI state changes triggered by "JustPressed" events
  clickCount: number;
  lastAction: string;
}

export class InputShowcase implements IApplication<
  Engine,
  User<InputShowcaseUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const palette = [
      { colorId: 0, r: 15, g: 15, b: 20, a: 255 }, // Dark BG
      { colorId: 1, r: 80, g: 200, b: 120, a: 255 }, // Success Green
      { colorId: 2, r: 250, g: 80, b: 80, a: 255 }, // Action Red
      { colorId: 3, r: 200, g: 200, b: 250, a: 255 }, // Text White
      { colorId: 4, r: 100, g: 100, b: 150, a: 255 }, // Text Gray
    ];
    engine.loadPaletteToSlot(0, palette);
    runtime.setTickRate(60);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<InputShowcaseUserData>,
  ): void {
    const width = 80;
    const height = 40;

    user.data.clickCount = 0;
    user.data.lastAction = "None";

    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0);
    display.setOrigin(new Vector2(0, 0));

    // Z0: Static layer for labels (drawn once, never updated)
    const staticLayer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    user.data.staticLayer = staticLayer;
    user.addLayer(staticLayer);

    // Z1: Dynamic layer for changing values
    const dynamicLayer = new Layer(new Vector2(0, 0), 1, width, height, {
      mustBeReliable: false,
    });
    user.data.dynamicLayer = dynamicLayer;
    user.addLayer(dynamicLayer);

    // Z2: Volatile layer for the fast-moving mouse cursor
    const cursorLayer = new Layer(new Vector2(0, 0), 2, width, height, {
      mustBeReliable: false,
    });
    user.data.cursorLayer = cursorLayer;
    user.addLayer(cursorLayer);

    // Draw static UI once (labels that never change)
    const staticOrders: any[] = [];
    staticOrders.push(
      OrderBuilder.fill(" ", 0, 0),
      OrderBuilder.text(2, 2, "--- PRIMITIV INPUT SHOWCASE ---", 3, 0),
      OrderBuilder.text(2, 4, "Keyboard and Mouse input demo.", 4, 0),
      OrderBuilder.text(2, 7, "ACTION STATE:", 3, 0),
      OrderBuilder.text(18, 7, "isPressed:", 4, 0),
      OrderBuilder.text(18, 8, "Events:", 4, 0),
      OrderBuilder.text(2, 11, "MOUSE TRACKING:", 3, 0),
      OrderBuilder.text(18, 13, "Right Button Held:", 4, 0),
      OrderBuilder.text(2, 16, "AXIS MAPPING:", 3, 0),
      OrderBuilder.text(18, 16, "(Arrow Keys)", 4, 0),
      OrderBuilder.text(18, 17, "Move X:", 4, 0),
      OrderBuilder.text(35, 17, "Move Y:", 4, 0),
      OrderBuilder.text(18, 19, "(Left Shift)", 4, 0),
      OrderBuilder.text(18, 20, "Accelerate:", 4, 0),
      OrderBuilder.rect(10, 22, 21, 1, "-", 4, 0, true),
    );
    staticLayer.setOrders(staticOrders);
    staticLayer.commit();

    /**
     * LOGICAL INPUT BINDINGS
     * We map hardware constants to semantic names.
     * Keyboard and Mouse only — see 08-gamepad-input for gamepad bindings.
     */
    const registry = user.getInputBindingRegistry();

    // 1. Basic Action (Keyboard Space bar)
    registry.defineButton(0, "ACTION_A", [
      { sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
    ]);

    // 2. Mouse Buttons
    registry.defineButton(1, "CLICK_LEFT", [
      {
        sourceId: 2,
        type: InputDeviceType.Mouse,
        mouseButton: MouseInput.LeftButton,
      },
    ]);
    registry.defineButton(2, "CLICK_RIGHT", [
      {
        sourceId: 3,
        type: InputDeviceType.Mouse,
        mouseButton: MouseInput.RightButton,
      },
    ]);

    // 3. Keyboard Axes
    // Pressing Left produces -1.0, Right produces 1.0.
    registry.defineAxis(0, "MOVE_X", [
      {
        sourceId: 4,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowLeft,
        positiveKey: KeyboardInput.ArrowRight,
      },
    ]);

    registry.defineAxis(1, "MOVE_Y", [
      {
        sourceId: 5,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowUp,
        positiveKey: KeyboardInput.ArrowDown,
      },
    ]);

    // 4. Keyboard modifier as an axis (0.0 or 1.0)
    registry.defineAxis(2, "ACCELERATE", [
      {
        sourceId: 6,
        type: InputDeviceType.Keyboard,
        positiveKey: KeyboardInput.ShiftLeft,
      },
    ]);

    // 5. Mouse Scroll Wheel
    registry.defineAxis(3, "SCROLL_Y", [
      {
        sourceId: 7,
        type: InputDeviceType.Mouse,
        mouseAxis: MouseInput.WheelDeltaY,
      },
    ]);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<InputShowcaseUserData>,
  ): void {
    const data = user.data;
    const dynamicLayer = data.dynamicLayer;
    const cursorLayer = data.cursorLayer;

    const orders: any[] = [];
    const cursorOrders: any[] = [];

    /**
     * STATE TRACKING: isJustPressed vs isPressed
     */
    const isActionHeld = user.getButton("ACTION_A");
    const isActionJustPressed = user.isJustPressed("ACTION_A");
    const isActionJustReleased = user.isJustReleased("ACTION_A");

    if (isActionJustPressed) data.lastAction = "Pressed Space";
    if (isActionJustReleased) data.lastAction = "Released Space";

    orders.push(
      OrderBuilder.text(
        29,
        7,
        isActionHeld ? "YES" : "NO ",
        isActionHeld ? 1 : 4,
        0,
      ),
      OrderBuilder.text(29, 8, data.lastAction.padEnd(15, " "), 2, 0),
    );

    /**
     * MOUSE INTERACTION
     * getMouseDisplayInfo() returns null if the mouse is outside the active display.
     */
    const mouse = user.getMouseDisplayInfo();
    let mouseText = "Mouse outside viewport";

    if (mouse) {
      // mouse.localX and localY are correctly snapped to the grid (0 to display.width)
      const mx = Math.floor(mouse.localX);
      const my = Math.floor(mouse.localY);
      mouseText = `X: ${mx}, Y: ${my}`.padEnd(22, " ");

      // Draw a crosshair at the mouse position on the volatile layer
      cursorOrders.push(OrderBuilder.char(mx, my, "+", 2, 0));

      // Mouse clicking logic
      if (user.isJustPressed("CLICK_LEFT")) {
        data.clickCount++;
      }
    }

    orders.push(
      OrderBuilder.text(18, 11, mouseText, 4, 0),
      OrderBuilder.text(
        18,
        12,
        `Left Clicks: ${data.clickCount}`.padEnd(20, " "),
        4,
        0,
      ),
    );

    const isRightHeld = user.getButton("CLICK_RIGHT");
    const scrollY = user.getAxis("SCROLL_Y");

    orders.push(
      OrderBuilder.text(
        37,
        13,
        isRightHeld ? "YES" : "NO ",
        isRightHeld ? 1 : 4,
        0,
      ),
      OrderBuilder.text(
        18,
        14,
        `Scroll Wheel Y: ${scrollY.toFixed(2)}`.padEnd(25, " "),
        scrollY !== 0 ? 1 : 4,
        0,
      ),
    );

    /**
     * KEYBOARD AXES
     */
    const moveX = user.getAxis("MOVE_X");
    const moveY = user.getAxis("MOVE_Y");
    const accel = user.getAxis("ACCELERATE");

    orders.push(
      OrderBuilder.text(
        26,
        17,
        moveX.toFixed(2).padStart(5, " "),
        moveX !== 0 ? 1 : 4,
        0,
      ),
      OrderBuilder.text(
        43,
        17,
        moveY.toFixed(2).padStart(5, " "),
        moveY !== 0 ? 1 : 4,
        0,
      ),
      OrderBuilder.text(
        30,
        20,
        accel.toFixed(2).padStart(5, " "),
        accel > 0 ? 1 : 4,
        0,
      ),
    );

    // Visual Axis Indicator
    // Draw a small block that moves horizontally based on the X axis.
    const centerX = 20;
    const indicatorX = centerX + Math.floor(moveX * 10);
    orders.push(
      OrderBuilder.rect(10, 22, 21, 1, "-", 4, 0, true),
      OrderBuilder.char(indicatorX, 22, "█", 2, 0),
    );

    // Apply all orders and send to the engine
    dynamicLayer.setOrders(orders);
    dynamicLayer.commit();

    cursorLayer.setOrders(cursorOrders);
    cursorLayer.commit();
  }

  update(_runtime: IRuntime, _engine: Engine): void {}
}
