/**
 * UIRenderer - Renders game UI (HUD, menus, etc.)
 * OPTIMIZED: Uses text() and rectangle() instead of char() loops
 */

import { OrderBuilder } from "@primitiv/engine";
import type { Player, GameState } from "../game/types";
import { C, PLAYER_COLORS, PLAYER_CHARS } from "./Appearance";

export class UIRenderer {
  /**
   * Render HUD (compact): P# Bombs:N | status of others
   */
  static renderPlayerHUD(
    currentPlayer: Player,
    allPlayers: Player[],
    startX: number,
    startY: number,
    width: number,
  ): any[] {
    const orders: any[] = [];

    // Background for the HUD line (starts at startX)
    orders.push(
      OrderBuilder.rect(startX, startY, width, 1, " ", C.BLACK, C.UI_BG, true),
    );

    const dots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    let x = startX + 1;

    // Current player label "P#"
    const playerColor = PLAYER_COLORS[currentPlayer.id % PLAYER_COLORS.length];
    const playerLabel = `P${currentPlayer.id + 1}`;
    orders.push(
      OrderBuilder.text(x, startY, playerLabel, playerColor, C.UI_BG),
    );
    x += playerLabel.length + 1;

    if (currentPlayer.alive) {
      // Available bombs (max - active)
      const availableBombs =
        (currentPlayer.baselineBombActive ? 0 : 1) +
        currentPlayer.bombInventory;
      const bombStr = `Bombs:${availableBombs}`;
      orders.push(OrderBuilder.text(x, startY, bombStr, C.WHITE, C.UI_BG));
      x += bombStr.length + 1;
    } else {
      orders.push(OrderBuilder.text(x, startY, "DEAD", C.GRAY_TEXT, C.UI_BG));
      x += 5;
    }

    // Legend is limited to current player only; no other player indicators

    if (dots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(dots));
    }

    return orders;
  }

  /**
   * Render touch controls (Game Boy style)
   * Left side: D-pad (cross)
   * Right side: A and B buttons
   * @param leftWidth Width of left control area
   * @param rightWidth Width of right control area
   * @param gameWidth Width of the game area (for calculating right side position)
   * @param displayHeight Total height
   * @param gameOffset X offset where the game area starts (controls are placed around it)
   * @param pressedStates Optional object indicating which buttons are pressed
   */
  static renderTouchControls(
    leftWidth: number,
    rightWidth: number,
    gameWidth: number,
    displayHeight: number,
    gameOffset: number = 0,
    pressedStates: {
      up?: boolean;
      down?: boolean;
      left?: boolean;
      right?: boolean;
      a?: boolean;
      b?: boolean;
    } = {},
  ): any[] {
    const orders: any[] = [];
    const dots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    // Left controls area is from 0 to gameOffset (14 wide)
    // Right controls area is from gameOffset + gameWidth to end (14 wide)

    // === LEFT SIDE: D-PAD (cross shape) ===
    const dpadCenterX = Math.floor(leftWidth / 2);
    const dpadCenterY = Math.floor(displayHeight / 2);

    // D-pad dimensions
    const armWidth = 4; // Width of each arm
    const armLength = 4; // Length of each arm from center
    const halfArm = Math.floor(armWidth / 2);

    // Color based on press state
    const upColor = pressedStates.up ? C.BUTTON_PRESSED : C.DPAD_BUTTON;
    const downColor = pressedStates.down ? C.BUTTON_PRESSED : C.DPAD_BUTTON;
    const leftColor = pressedStates.left ? C.BUTTON_PRESSED : C.DPAD_BUTTON;
    const rightColor = pressedStates.right ? C.BUTTON_PRESSED : C.DPAD_BUTTON;
    const aColor = pressedStates.a ? C.BUTTON_PRESSED : C.BUTTON_A;
    const bColor = pressedStates.b ? C.BUTTON_PRESSED : C.BUTTON_B;

    // UP arm (vertical rectangle above center)
    orders.push(
      OrderBuilder.rect(
        dpadCenterX - halfArm,
        dpadCenterY - armLength - halfArm,
        armWidth,
        armLength,
        "^",
        C.BLACK,
        upColor,
        true,
      ),
    );

    // DOWN arm (vertical rectangle below center)
    orders.push(
      OrderBuilder.rect(
        dpadCenterX - halfArm,
        dpadCenterY + halfArm,
        armWidth,
        armLength,
        "v",
        C.BLACK,
        downColor,
        true,
      ),
    );

    // LEFT arm (horizontal rectangle to the left of center)
    orders.push(
      OrderBuilder.rect(
        dpadCenterX - armLength - halfArm,
        dpadCenterY - halfArm,
        armLength,
        armWidth,
        "<",
        C.BLACK,
        leftColor,
        true,
      ),
    );

    // RIGHT arm (horizontal rectangle to the right of center)
    orders.push(
      OrderBuilder.rect(
        dpadCenterX + halfArm,
        dpadCenterY - halfArm,
        armLength,
        armWidth,
        ">",
        C.BLACK,
        rightColor,
        true,
      ),
    );

    // CENTER square (connects all arms)
    orders.push(
      OrderBuilder.rect(
        dpadCenterX - halfArm,
        dpadCenterY - halfArm,
        armWidth,
        armWidth,
        " ",
        C.BLACK,
        C.DPAD_BG,
        true,
      ),
    );

    // === RIGHT SIDE: A and B buttons (A on top green, B on bottom red) ===
    const rightStartX = gameOffset + gameWidth;
    const buttonCenterX = rightStartX + Math.floor(rightWidth / 2);
    const buttonSize = 5; // 5x5 buttons (large)
    const buttonSpacing = 3; // Space between buttons

    // Button A (green, on top)
    const aY = Math.floor(displayHeight / 2) - buttonSize - buttonSpacing;
    const aX = buttonCenterX - Math.floor(buttonSize / 2);
    orders.push(
      OrderBuilder.rect(
        aX,
        aY,
        buttonSize,
        buttonSize,
        " ",
        aColor,
        aColor,
        true,
      ),
    );
    // "A" letter in center of button
    dots.push({
      posX: buttonCenterX,
      posY: aY + Math.floor(buttonSize / 2),
      charCode: "A",
      bgColorCode: aColor,
      fgColorCode: C.WHITE,
    });

    // Button B (red, on bottom)
    const bY = Math.floor(displayHeight / 2) + buttonSpacing;
    const bX = buttonCenterX - Math.floor(buttonSize / 2);
    orders.push(
      OrderBuilder.rect(
        bX,
        bY,
        buttonSize,
        buttonSize,
        " ",
        bColor,
        bColor,
        true,
      ),
    );
    // "B" letter in center of button
    dots.push({
      posX: buttonCenterX,
      posY: bY + Math.floor(buttonSize / 2),
      charCode: "B",
      bgColorCode: bColor,
      fgColorCode: C.WHITE,
    });

    if (dots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(dots));
    }

    return orders;
  }

  /**
   * Render compact HUD on a single line at the top (LEGACY)
   * OPTIMIZED: 1 rectangle + few text orders instead of char-by-char
   * Format: P1:♥ B:2 F:3 | P2:♥ B:1 F:2 | ...
   */
  static renderCompactHUD(
    players: Player[],
    startX: number,
    startY: number,
    displayWidth: number,
  ): any[] {
    const orders: any[] = [];

    // Background for the HUD line - 1 ORDER instead of displayWidth
    orders.push(
      OrderBuilder.rect(
        0,
        startY,
        displayWidth,
        1,
        " ",
        C.BLACK,
        C.UI_BG,
        true,
      ),
    );

    // Collect player info dots for dotCloudMulti
    const playerDots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    let x = startX + 1;

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
      const playerChar = PLAYER_CHARS[player.id % PLAYER_CHARS.length];
      const statusColor = player.alive ? color : C.GRAY_TEXT;

      // Player icon
      playerDots.push({
        posX: x,
        posY: startY,
        charCode: playerChar,
        bgColorCode: C.UI_BG,
        fgColorCode: statusColor,
      });
      x++;

      if (player.alive) {
        // Bombs count - use text order
        const availableBombs =
          (player.baselineBombActive ? 0 : 1) + player.bombInventory;
        const bombStr = `B${availableBombs}`;
        orders.push(OrderBuilder.text(x, startY, bombStr, C.WHITE, C.UI_BG));
        x += bombStr.length;

        // Fire range - use text order
        const fireStr = `F${player.fireRange}`;
        orders.push(
          OrderBuilder.text(x, startY, fireStr, C.EXPLOSION_ORANGE, C.UI_BG),
        );
        x += fireStr.length;
      } else {
        // Dead indicator
        playerDots.push({
          posX: x,
          posY: startY,
          charCode: "X",
          bgColorCode: C.UI_BG,
          fgColorCode: C.GRAY_TEXT,
        });
        x++;
      }

      // Separator between players
      if (i < players.length - 1) {
        orders.push(OrderBuilder.text(x, startY, " | ", C.GRAY_TEXT, C.UI_BG));
        x += 3;
      }
    }

    // Add all player dots in 1 order
    if (playerDots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(playerDots));
    }

    // Controls hint on the right side - 1 text order
    const hint = "WASD:Move SPACE:Bomb R:Restart";
    const hintX = displayWidth - hint.length - 1;
    orders.push(OrderBuilder.text(hintX, startY, hint, C.GRAY_TEXT, C.UI_BG));

    return orders;
  }

  /**
   * Render the HUD (player stats) - legacy version
   * OPTIMIZED: Uses text() instead of char() loops
   */
  static renderHUD(
    players: Player[],
    startX: number,
    startY: number,
    _displayWidth: number,
  ): any[] {
    const orders: any[] = [];

    // Title - 1 ORDER
    const title = "BOMBERMAN";
    orders.push(OrderBuilder.text(startX, startY, title, C.HIGHLIGHT, C.UI_BG));

    // Collect sparse elements (status icons)
    const statusDots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    // Player stats
    let y = startY + 2;
    for (const player of players) {
      const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
      const statusChar = player.alive ? "♥" : "☠";
      const statusColor = player.alive ? color : C.GRAY_TEXT;

      // Player indicator - 1 text order
      const label = `P${player.id + 1}:`;
      orders.push(OrderBuilder.text(startX, y, label, statusColor, C.UI_BG));

      // Status icon
      statusDots.push({
        posX: startX + 4,
        posY: y,
        charCode: statusChar,
        bgColorCode: C.UI_BG,
        fgColorCode: statusColor,
      });

      if (player.alive) {
        // Bombs: B:2 - 1 text order
        const availableBombs =
          (player.baselineBombActive ? 0 : 1) + player.bombInventory;
        const bombStr = `B:${availableBombs}`;
        orders.push(
          OrderBuilder.text(startX + 6, y, bombStr, C.WHITE, C.UI_BG),
        );

        // Fire range: F:3 - 1 text order
        const fireStr = `F:${player.fireRange}`;
        orders.push(
          OrderBuilder.text(
            startX + 10,
            y,
            fireStr,
            C.EXPLOSION_ORANGE,
            C.UI_BG,
          ),
        );
      }

      y++;
    }

    // Add all status dots in 1 order
    if (statusDots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(statusDots));
    }

    return orders;
  }

  /**
   * Render game over screen
   * OPTIMIZED: Uses rectangle + text instead of char loops
   */
  static renderGameOver(
    winner: Player | null,
    centerX: number,
    centerY: number,
    titleOverride?: string,
  ): any[] {
    const orders: any[] = [];

    const title = titleOverride
      ? titleOverride
      : winner
        ? `PLAYER ${winner.id + 1} WINS!`
        : "DRAW!";
    const bannerWidth = 21;
    const startX = centerX - Math.floor(title.length / 2);

    // Background box - 1 ORDER instead of nested loops
    const boxWidth = bannerWidth;
    const boxHeight = 5;
    const boxX = centerX - Math.floor(boxWidth / 2);
    orders.push(
      OrderBuilder.rect(
        boxX,
        centerY - 1,
        boxWidth,
        boxHeight,
        " ",
        C.BLACK,
        C.BANNER_BG,
        true,
      ),
    );

    // Title - 1 ORDER
    const titleColor = winner
      ? PLAYER_COLORS[winner.id % PLAYER_COLORS.length]
      : C.WHITE;
    orders.push(
      OrderBuilder.text(startX, centerY, title, titleColor, C.BANNER_BG),
    );

    // Restart hint - 1 ORDER
    const hint = "Press R to restart";
    const hintX = centerX - Math.floor(hint.length / 2);
    orders.push(
      OrderBuilder.text(hintX, centerY + 2, hint, C.GRAY_TEXT, C.BANNER_BG),
    );

    return orders;
  }

  /**
   * Render countdown overlay before game starts
   * OPTIMIZED: Uses rectangle + text
   */
  static renderCountdown(
    secondsLeft: number,
    centerX: number,
    centerY: number,
  ): any[] {
    const orders: any[] = [];

    // Large number display
    const numberStr = secondsLeft > 0 ? secondsLeft.toString() : "GO!";
    const title = "GET READY";
    const bannerWidth = 21;

    // Background box
    const boxWidth = bannerWidth;
    const boxHeight = 7;
    const boxX = centerX - Math.floor(boxWidth / 2);
    const boxY = centerY - Math.floor(boxHeight / 2);

    orders.push(
      OrderBuilder.rect(
        boxX,
        boxY,
        boxWidth,
        boxHeight,
        " ",
        C.BLACK,
        C.BANNER_BG,
        true,
      ),
    );

    // Title "GET READY"
    const titleX = centerX - Math.floor(title.length / 2);
    orders.push(
      OrderBuilder.text(titleX, boxY + 1, title, C.HIGHLIGHT, C.BANNER_BG),
    );

    // Large countdown number or "GO!"
    const numberX = centerX - Math.floor(numberStr.length / 2);
    const numberColor = secondsLeft > 0 ? C.WHITE : C.HIGHLIGHT;
    orders.push(
      OrderBuilder.text(numberX, centerY, numberStr, numberColor, C.BANNER_BG),
    );

    // Subtitle
    const subtitle = secondsLeft > 0 ? "..." : "FIGHT!";
    const subtitleX = centerX - Math.floor(subtitle.length / 2);
    orders.push(
      OrderBuilder.text(
        subtitleX,
        boxY + boxHeight - 2,
        subtitle,
        C.GRAY_TEXT,
        C.BANNER_BG,
      ),
    );

    return orders;
  }

  /**
   * Render main menu
   * OPTIMIZED: Uses text() instead of char() loops
   */
  static renderMainMenu(
    centerX: number,
    centerY: number,
    selectedOption: number,
  ): any[] {
    const orders: any[] = [];

    // Title - 1 ORDER
    const title = "TERMINAL BOMBERMAN";
    const titleX = centerX - Math.floor(title.length / 2);
    orders.push(
      OrderBuilder.text(titleX, centerY - 4, title, C.HIGHLIGHT, C.BLACK),
    );

    // Menu options
    const options = ["1 Player", "2 Players", "3 Players", "4 Players"];
    let y = centerY;

    // Collect selection indicators
    const selectorDots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const optX = centerX - Math.floor(option.length / 2);
      const isSelected = i === selectedOption;
      const fg = isSelected ? C.HIGHLIGHT : C.WHITE;
      const bg = isSelected ? C.UI_BORDER : C.BLACK;

      // Selection indicator
      if (isSelected) {
        selectorDots.push({
          posX: optX - 2,
          posY: y,
          charCode: ">",
          bgColorCode: C.BLACK,
          fgColorCode: C.HIGHLIGHT,
        });
      }

      // Option text - 1 ORDER per option
      orders.push(OrderBuilder.text(optX, y, option, fg, bg));

      y += 2;
    }

    // Add selector dots
    if (selectorDots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(selectorDots));
    }

    // Controls hint - 1 ORDER
    const hint = "↑↓ Select  Enter Start";
    const hintX = centerX - Math.floor(hint.length / 2);
    orders.push(OrderBuilder.text(hintX, y + 2, hint, C.GRAY_TEXT, C.BLACK));

    return orders;
  }

  /**
   * Render new main menu with Solo/Host/Join options
   */
  static renderMainMenuNew(
    centerX: number,
    _centerY: number,
    selectedOption: number,
  ): any[] {
    const orders: any[] = [];

    // Logo using bitmask - pure background colors, no characters
    // Each letter is 3 wide x 5 tall, with 1 space between letters
    // "TERM" = 4 letters * 3 wide + 3 spaces = 15 wide
    const termWidth = 15;
    const termHeight = 5;

    // Helper to create letter patterns (3 wide x 5 tall)
    // prettier-ignore
    const T = [
      1,1,1,
      0,1,0,
      0,1,0,
      0,1,0,
      0,1,0,
    ];
    // prettier-ignore
    const E = [
      1,1,1,
      1,0,0,
      1,1,0,
      1,0,0,
      1,1,1,
    ];
    // prettier-ignore
    const R = [
      1,1,0,
      1,0,1,
      1,1,0,
      1,0,1,
      1,0,1,
    ];
    // prettier-ignore
    const M = [
      1,0,1,
      1,1,1,
      1,0,1,
      1,0,1,
      1,0,1,
    ];
    // prettier-ignore
    const B = [
      1,1,0,
      1,0,1,
      1,1,0,
      1,0,1,
      1,1,0,
    ];
    // prettier-ignore
    const O = [
      0,1,0,
      1,0,1,
      1,0,1,
      1,0,1,
      0,1,0,
    ];

    // Combine letters into TERM mask (15 wide x 5 tall = 75 elements)
    const termMask: boolean[] = [];
    for (let row = 0; row < 5; row++) {
      // T
      for (let col = 0; col < 3; col++) termMask.push(T[row * 3 + col] === 1);
      termMask.push(false); // space
      // E
      for (let col = 0; col < 3; col++) termMask.push(E[row * 3 + col] === 1);
      termMask.push(false); // space
      // R
      for (let col = 0; col < 3; col++) termMask.push(R[row * 3 + col] === 1);
      termMask.push(false); // space
      // M
      for (let col = 0; col < 3; col++) termMask.push(M[row * 3 + col] === 1);
    }

    // Combine letters into BOMB mask (15 wide x 5 tall = 75 elements)
    const bombWidth = 15;
    const bombHeight = 5;
    const bombMask: boolean[] = [];
    for (let row = 0; row < 5; row++) {
      // B
      for (let col = 0; col < 3; col++) bombMask.push(B[row * 3 + col] === 1);
      bombMask.push(false); // space
      // O
      for (let col = 0; col < 3; col++) bombMask.push(O[row * 3 + col] === 1);
      bombMask.push(false); // space
      // M
      for (let col = 0; col < 3; col++) bombMask.push(M[row * 3 + col] === 1);
      bombMask.push(false); // space
      // B
      for (let col = 0; col < 3; col++) bombMask.push(B[row * 3 + col] === 1);
    }

    // Use bitmask for TERM - render with background color only (space char)
    const termX = centerX - Math.floor(termWidth / 2);
    orders.push(
      OrderBuilder.bitmask(
        termX,
        1,
        termWidth,
        termHeight,
        termMask,
        " ", // Use space - we only care about bg color
        C.HIGHLIGHT, // fg (unused since char is space)
        C.HIGHLIGHT, // bg - this is what shows!
      ),
    );

    // Use bitmask for BOMB
    const bombX = centerX - Math.floor(bombWidth / 2);
    orders.push(
      OrderBuilder.bitmask(
        bombX,
        7,
        bombWidth,
        bombHeight,
        bombMask,
        " ",
        C.HIGHLIGHT,
        C.HIGHLIGHT,
      ),
    );

    // Menu options: Solo, Host, Join - below logo
    if (selectedOption < 0) {
      return orders;
    }

    const options = ["Solo", "Host", "Join"];
    let y = 14; // Start options below logo

    // Collect selection indicators
    const selectorDots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const isSelected = i === selectedOption;
      const fg = isSelected ? C.HIGHLIGHT : C.WHITE;
      const bg = isSelected ? C.UI_BORDER : C.BLACK;

      // Center the option text
      const optX = centerX - Math.floor(option.length / 2);

      // Selection indicator
      if (isSelected) {
        selectorDots.push({
          posX: optX - 2,
          posY: y,
          charCode: ">",
          bgColorCode: C.BLACK,
          fgColorCode: C.HIGHLIGHT,
        });
      }

      // Option text - 1 ORDER per option
      orders.push(OrderBuilder.text(optX, y, option, fg, bg));

      y += 2;
    }

    // Add selector dots
    if (selectorDots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(selectorDots));
    }

    return orders;
  }

  /**
   * Render only the main menu options (Solo/Host/Join) without logo/background.
   * Intended for the top menu layer so selection changes don't resend the logo.
   */
  static renderMainMenuOptions(centerX: number, selectedOption: number): any[] {
    const orders: any[] = [];

    const options = ["Solo", "Host", "Join"];
    let y = 14;

    const selectorDots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const isSelected = i === selectedOption;
      const fg = isSelected ? C.HIGHLIGHT : C.WHITE;
      const bg = isSelected ? C.UI_BORDER : C.BLACK;

      const optX = centerX - Math.floor(option.length / 2);

      if (isSelected) {
        selectorDots.push({
          posX: optX - 2,
          posY: y,
          charCode: ">",
          bgColorCode: C.BLACK,
          fgColorCode: C.HIGHLIGHT,
        });
      }

      orders.push(OrderBuilder.text(optX, y, option, fg, bg));
      y += 2;
    }

    if (selectorDots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(selectorDots));
    }

    return orders;
  }

  /**
   * Render controls help
   * OPTIMIZED: Uses text() instead of char() loops
   */
  static renderControls(startX: number, startY: number): any[] {
    const orders: any[] = [];

    const lines = [
      "CONTROLS:",
      "WASD/←↑↓→ Move",
      "SPACE     Bomb",
      "R         Restart",
      "ESC       Menu",
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fg = i === 0 ? C.HIGHLIGHT : C.GRAY_TEXT;
      // 1 ORDER per line instead of per char
      orders.push(OrderBuilder.text(startX, startY + i, line, fg, C.UI_BG));
    }

    return orders;
  }

  /**
   * Render lobby screen with 4 player slots
   * OPTIMIZED: Uses text() instead of char() loops
   */
  static renderLobby(
    centerX: number,
    lobbyName: string,
    slots: {
      type: "empty" | "player" | "bot";
      name: string;
      ready: boolean;
      isHost: boolean;
    }[],
    selectedSlot: number,
    isHost: boolean,
  ): any[] {
    const orders: any[] = [];

    // Subtitle (HOSTING/JOINING) at top - 1 ORDER
    const titleY = 1;
    const subtitle = isHost ? "HOSTING" : "JOINING";
    const subtitleX = centerX - Math.floor(subtitle.length / 2);
    orders.push(
      OrderBuilder.text(subtitleX, titleY, subtitle, C.GRAY_TEXT, C.BLACK),
    );

    // Lobby ID with # prefix to indicate it's an identifier - 1 ORDER
    const lobbyId = "#" + lobbyName;
    const titleX = centerX - Math.floor(lobbyId.length / 2);
    orders.push(
      OrderBuilder.text(titleX, titleY + 1, lobbyId, C.HIGHLIGHT, C.BLACK),
    );

    // Player slots (4 slots)
    const slotStartY = 5;
    const slotWidth = 17; // Width of each slot box
    const slotHeight = 3;

    // Collect all sparse elements for the slots
    const slotDots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    for (let i = 0; i < 4; i++) {
      const slot = slots[i] || {
        type: "empty",
        name: "",
        ready: false,
        isHost: false,
      };
      const slotY = slotStartY + i * (slotHeight + 1);
      const slotX = centerX - Math.floor(slotWidth / 2);

      // Slot border/background - no selection highlight
      const borderColor = C.UI_BORDER;
      const bgColor = C.BLACK;

      // Top border - use text for the middle dashes
      slotDots.push({
        posX: slotX,
        posY: slotY,
        charCode: "+",
        bgColorCode: bgColor,
        fgColorCode: borderColor,
      });
      const topDashes = "-".repeat(slotWidth - 2);
      orders.push(
        OrderBuilder.text(slotX + 1, slotY, topDashes, borderColor, bgColor),
      );
      slotDots.push({
        posX: slotX + slotWidth - 1,
        posY: slotY,
        charCode: "+",
        bgColorCode: bgColor,
        fgColorCode: borderColor,
      });

      // Middle content - side borders
      slotDots.push({
        posX: slotX,
        posY: slotY + 1,
        charCode: "|",
        bgColorCode: bgColor,
        fgColorCode: borderColor,
      });
      slotDots.push({
        posX: slotX + slotWidth - 1,
        posY: slotY + 1,
        charCode: "|",
        bgColorCode: bgColor,
        fgColorCode: borderColor,
      });

      // Slot content
      const contentX = slotX + 2;
      const contentY = slotY + 1;

      // Player number - use text
      const playerNum = `P${i + 1}`;
      const playerColor = PLAYER_COLORS[i % PLAYER_COLORS.length];
      orders.push(
        OrderBuilder.text(contentX, contentY, playerNum, playerColor, bgColor),
      );

      // Slot type icon and name
      let icon = " ";
      let nameColor = C.GRAY_TEXT;
      let displayName = "";

      if (slot.type === "player") {
        icon = "@";
        nameColor = C.WHITE;
        displayName = slot.name;
        if (slot.isHost) {
          displayName += "*"; // Host marker
        }
      } else if (slot.type === "bot") {
        icon = "#";
        nameColor = C.GRAY_TEXT;
        displayName = slot.name;
      } else {
        // Empty slot - show as "Bot" (will be replaced by bot if no player joins)
        icon = "#";
        nameColor = C.GRAY_TEXT;
        displayName = "(Bot)";
      }

      slotDots.push({
        posX: contentX + 3,
        posY: contentY,
        charCode: icon,
        bgColorCode: bgColor,
        fgColorCode: nameColor,
      });

      // Name (truncate if too long) - use text
      const maxNameLen = slotWidth - 8;
      const truncatedName =
        displayName.length > maxNameLen
          ? displayName.substring(0, maxNameLen - 1) + "."
          : displayName;
      orders.push(
        OrderBuilder.text(
          contentX + 5,
          contentY,
          truncatedName,
          nameColor,
          bgColor,
        ),
      );

      // Bottom border - use text for the middle dashes
      slotDots.push({
        posX: slotX,
        posY: slotY + 2,
        charCode: "+",
        bgColorCode: bgColor,
        fgColorCode: borderColor,
      });
      orders.push(
        OrderBuilder.text(
          slotX + 1,
          slotY + 2,
          topDashes,
          borderColor,
          bgColor,
        ),
      );
      slotDots.push({
        posX: slotX + slotWidth - 1,
        posY: slotY + 2,
        charCode: "+",
        bgColorCode: bgColor,
        fgColorCode: borderColor,
      });
    }

    // Add all slot dots in 1 order
    if (slotDots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(slotDots));
    }

    // Hint to start (only for host) - simple gray text
    const hintY = slotStartY + 4 * (slotHeight + 1);
    const hintText = isHost ? "ENTER to start" : "Waiting on host...";
    const hintX = centerX - Math.floor(hintText.length / 2);
    orders.push(
      OrderBuilder.text(hintX, hintY, hintText, C.GRAY_TEXT, C.BLACK),
    );

    return orders;
  }

  /**
   * Render server list screen for joining games
   * OPTIMIZED: Uses text() instead of char() loops
   */
  static renderServerList(
    centerX: number,
    servers: { name: string; playerCount: number }[],
    selectedIndex: number,
  ): any[] {
    const orders: any[] = [];

    // Title - 1 ORDER
    const titleY = 1;
    const title = "SELECT SERVER";
    const titleX = centerX - Math.floor(title.length / 2);
    orders.push(OrderBuilder.text(titleX, titleY, title, C.GRAY_TEXT, C.BLACK));

    // Server list
    const listStartY = 4;
    const maxVisibleServers = 12; // Max servers visible on screen

    // Collect sparse elements
    const serverDots: Array<{
      posX: number;
      posY: number;
      charCode: string | number;
      bgColorCode: number;
      fgColorCode: number;
    }> = [];

    if (servers.length === 0) {
      // No servers available - 1 ORDER
      const noServers = "No servers found";
      const noServersX = centerX - Math.floor(noServers.length / 2);
      orders.push(
        OrderBuilder.text(
          noServersX,
          listStartY + 2,
          noServers,
          C.GRAY_TEXT,
          C.BLACK,
        ),
      );
    } else {
      // Calculate scroll offset if needed (each server takes 2 lines)
      const maxVisibleItems = Math.floor(maxVisibleServers / 2);
      let startIndex = 0;
      if (selectedIndex >= maxVisibleItems) {
        startIndex = selectedIndex - maxVisibleItems + 1;
      }

      const endIndex = Math.min(startIndex + maxVisibleItems, servers.length);

      for (let i = startIndex; i < endIndex; i++) {
        const server = servers[i];
        const y = listStartY + (i - startIndex) * 2; // 2 lines per server
        const isSelected = i === selectedIndex;

        // Selection indicator
        if (isSelected) {
          serverDots.push({
            posX: 1,
            posY: y,
            charCode: ">",
            bgColorCode: C.BLACK,
            fgColorCode: C.HIGHLIGHT,
          });
        }

        // Line 1: Server name with # prefix - 1 ORDER
        const serverName = "#" + server.name;
        const nameColor = isSelected ? C.HIGHLIGHT : C.WHITE;
        const truncatedName = serverName.substring(0, 18);
        orders.push(OrderBuilder.text(3, y, truncatedName, nameColor, C.BLACK));

        // Line 2: Player count (indented) - 1 ORDER
        const playerStr = `${server.playerCount}/4`;
        orders.push(
          OrderBuilder.text(4, y + 1, playerStr, C.GRAY_TEXT, C.BLACK),
        );
      }

      // Scroll indicators if needed
      if (startIndex > 0) {
        serverDots.push({
          posX: centerX,
          posY: listStartY - 1,
          charCode: "^",
          bgColorCode: C.BLACK,
          fgColorCode: C.GRAY_TEXT,
        });
      }
      if (endIndex < servers.length) {
        serverDots.push({
          posX: centerX,
          posY: listStartY + maxVisibleItems * 2,
          charCode: "v",
          bgColorCode: C.BLACK,
          fgColorCode: C.GRAY_TEXT,
        });
      }
    }

    // Add all server dots in 1 order
    if (serverDots.length > 0) {
      orders.push(OrderBuilder.dotCloudMulti(serverDots));
    }

    // Hint at bottom - 1 ORDER
    const hintY = 20;
    const hintText = "ENTER to join";
    const hintX = centerX - Math.floor(hintText.length / 2);
    orders.push(
      OrderBuilder.text(hintX, hintY, hintText, C.GRAY_TEXT, C.BLACK),
    );

    return orders;
  }
}
