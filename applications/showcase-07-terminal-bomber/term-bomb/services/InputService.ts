import {
  Vector2,
  InputDeviceType,
  KeyboardInput,
  GamepadInput,
  type User,
} from "@primitiv/engine";
import type { TermBombUserData } from "../apps/TermBomb";

export interface InputLayoutConfig {
  controlsEnabled: boolean;
  controlsLeftWidth: number;
  controlsRightWidth: number;
  gameOffsetX: number;
  displayWidth: number;
  gameWidth: number;
}

export interface TouchState {
  touchUp: boolean;
  touchDown: boolean;
  touchLeft: boolean;
  touchRight: boolean;
  touchBomb: boolean;
  touchAction: boolean;
}

/**
 * InputAdapter - centralizes UTSP bindings and derives touch/gamepad state for the game.
 */
export class InputAdapter {
  /**
   * Register all keyboard/gamepad/touch bindings against the user input registry.
   */
  static registerBindings(
    user: User<TermBombUserData>,
    layout: InputLayoutConfig,
    displayHeight: number,
  ): void {
    const inputRegistry = user.getInputBindingRegistry();

    const leftWidth = layout.controlsLeftWidth;
    const rightStartX = layout.gameOffsetX + layout.gameWidth;
    const rightWidth = layout.controlsRightWidth;
    const topHalfHeight = Math.floor(displayHeight / 2);
    const bottomHalfHeight = displayHeight - topHalfHeight;

    // Touch zones
    inputRegistry.defineTouchZone(
      10,
      "DPadZone",
      0,
      0,
      leftWidth,
      displayHeight,
    );
    inputRegistry.defineTouchZone(
      11,
      "ButtonAZone",
      rightStartX,
      0,
      rightWidth,
      topHalfHeight,
    );
    inputRegistry.defineTouchZone(
      12,
      "ButtonBZone",
      rightStartX,
      topHalfHeight,
      rightWidth,
      bottomHalfHeight,
    );

    // Movement buttons
    inputRegistry.defineButton(0, "Up", [
      {
        sourceId: 0,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ArrowUp,
      },
      { sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyW },
      {
        sourceId: 20,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadUp,
      },
    ]);

    inputRegistry.defineButton(1, "Down", [
      {
        sourceId: 2,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ArrowDown,
      },
      { sourceId: 3, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyS },
      {
        sourceId: 21,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadDown,
      },
    ]);

    inputRegistry.defineButton(2, "Left", [
      {
        sourceId: 4,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ArrowLeft,
      },
      { sourceId: 5, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyA },
      {
        sourceId: 22,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadLeft,
      },
    ]);

    inputRegistry.defineButton(3, "Right", [
      {
        sourceId: 6,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.ArrowRight,
      },
      { sourceId: 7, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyD },
      {
        sourceId: 23,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.DPadRight,
      },
    ]);

    // Axes (stick + touch zones)
    inputRegistry.defineAxis(
      0,
      "MoveX",
      [
        {
          sourceId: 30,
          type: InputDeviceType.Gamepad,
          gamepadIndex: 0,
          axis: GamepadInput.LeftStickX,
          deadzone: 0.2,
        },
        {
          sourceId: 110,
          type: InputDeviceType.TouchZone,
          touchZoneId: 10,
          touchZoneAxis: "x",
        },
      ],
      -1,
      1,
      0,
    );

    inputRegistry.defineAxis(
      1,
      "MoveY",
      [
        {
          sourceId: 31,
          type: InputDeviceType.Gamepad,
          gamepadIndex: 0,
          axis: GamepadInput.LeftStickY,
          deadzone: 0.2,
        },
        {
          sourceId: 111,
          type: InputDeviceType.TouchZone,
          touchZoneId: 10,
          touchZoneAxis: "y",
        },
      ],
      -1,
      1,
      0,
    );

    // Actions
    inputRegistry.defineButton(4, "Bomb", [
      { sourceId: 8, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
      {
        sourceId: 24,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonA,
      },
      { sourceId: 112, type: InputDeviceType.TouchZone, touchZoneId: 11 },
    ]);

    inputRegistry.defineButton(5, "Restart", [
      { sourceId: 9, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyR },
    ]);

    inputRegistry.defineButton(6, "Menu", [
      {
        sourceId: 10,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Escape,
      },
      {
        sourceId: 25,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonB,
      },
      { sourceId: 113, type: InputDeviceType.TouchZone, touchZoneId: 12 },
    ]);

    inputRegistry.defineButton(7, "Enter", [
      {
        sourceId: 11,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Enter,
      },
      {
        sourceId: 26,
        type: InputDeviceType.Gamepad,
        gamepadIndex: 0,
        button: GamepadInput.ButtonA,
      },
      { sourceId: 114, type: InputDeviceType.TouchZone, touchZoneId: 11 },
    ]);
  }

  /**
   * Compute virtual D-pad/button states from touch/mouse/gamepad axes.
   * Returns booleans to be copied into user data.
   */
  static computeTouchState(
    user: User<TermBombUserData>,
    layout: InputLayoutConfig,
    displayHeight: number,
  ): TouchState {
    const touchAxisX = user.getAxis("MoveX") ?? 0;
    const touchAxisY = user.getAxis("MoveY") ?? 0;

    const axisThreshold = 0.2;
    let touchLeft = touchAxisX < -axisThreshold;
    let touchRight = touchAxisX > axisThreshold;
    let touchUp = touchAxisY < -axisThreshold;
    let touchDown = touchAxisY > axisThreshold;

    let touchBomb = !!user.getButton("Bomb");
    let touchAction = !!user.getButton("Menu");

    const displayOrigin =
      user.getDisplays()[0]?.getOrigin() ?? new Vector2(0, 0);
    const toLocalPoint = (info: any): { x: number; y: number } | null => {
      if (!info) return null;

      let x = typeof info.localX === "number" ? info.localX : (info as any).x;
      let y = typeof info.localY === "number" ? info.localY : (info as any).y;

      if (
        (x === undefined || y === undefined) &&
        typeof info.worldX === "number" &&
        typeof info.worldY === "number"
      ) {
        x = Math.floor(info.worldX - displayOrigin.x);
        y = Math.floor(info.worldY - displayOrigin.y);
      }

      if (typeof x !== "number" || typeof y !== "number") return null;

      const lx = Math.floor(x);
      const ly = Math.floor(y);

      if (
        lx < 0 ||
        lx >= layout.displayWidth ||
        ly < 0 ||
        ly >= displayHeight
      ) {
        return null;
      }

      return { x: lx, y: ly };
    };

    const leftAreaWidth = layout.controlsLeftWidth;
    const rightAreaStart = layout.gameOffsetX + layout.gameWidth;
    const dpadCenterX = Math.floor(leftAreaWidth / 2);
    const dpadCenterY = Math.floor(displayHeight / 2);
    const dirDeadzone = 1;

    const processPoint = (x: number, y: number) => {
      if (!layout.controlsEnabled) return;

      if (x < leftAreaWidth) {
        const dx = x - dpadCenterX;
        const dy = y - dpadCenterY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (absX >= absY && absX > dirDeadzone) {
          if (dx < 0) touchLeft = true;
          else if (dx > 0) touchRight = true;
        } else if (absY > dirDeadzone) {
          if (dy < 0) touchUp = true;
          else if (dy > 0) touchDown = true;
        }
      } else if (x >= rightAreaStart) {
        const splitY = Math.floor(displayHeight / 2);
        if (y < splitY) touchBomb = true;
        else touchAction = true;
      }
    };

    const mouseClick = user.getButton("MouseClick");
    const mouseInfo = toLocalPoint(user.getMouseDisplayInfo());
    if (mouseClick && mouseInfo) {
      processPoint(mouseInfo.x, mouseInfo.y);
    }

    const anyTouchDown = user.getButton("TouchClick");
    if (anyTouchDown) {
      for (let i = 0; i < 5; i++) {
        const touchInfo = user.getTouchDisplayInfo(i);
        if (!touchInfo) continue;

        const activeFlag =
          (touchInfo as any).isActive ??
          (touchInfo as any).pressed ??
          (touchInfo as any).down;
        if (activeFlag === false) continue;
        if (activeFlag === undefined && i > 0) continue;

        const touchPoint = toLocalPoint(touchInfo);
        if (touchPoint) {
          processPoint(touchPoint.x, touchPoint.y);
        }
      }
    }

    return {
      touchUp,
      touchDown,
      touchLeft,
      touchRight,
      touchBomb,
      touchAction,
    };
  }
}
