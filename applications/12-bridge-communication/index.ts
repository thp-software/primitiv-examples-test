/**
 * Name: bridge-communication
 * Description: Demonstrates bidirectional message passing between the Primitiv engine and
 *   the host application (React, Vue, or any JS wrapper embedding the Primitiv client).
 *
 * Why study this:
 *   Primitiv applications run inside a sandboxed engine loop. They have no direct access
 *   to the DOM, to React state, or to any external API. The Bridge is the official
 *   communication channel that connects the engine world to the outside host application.
 *
 *   Typical use cases:
 *   - A React admin panel sends configuration changes to the running game.
 *   - The engine notifies React of a game event (score update, player death) so React
 *     can update its own UI (leaderboard, modal, etc.).
 *   - A chat system where messages flow from a React input field into the engine world.
 *
 * Bridge Architecture:
 *   HOST (React/Vue/etc.)                     ENGINE (Primitiv Application)
 *   ─────────────────────                     ──────────────────────────────
 *   runtime.sendBridge(channel, data)  ──→    user.bridgeInbox (array of messages)
 *   onBridgeMessage(channel, data)     ←──    runtime.sendBridge(userId, channel, data)
 *                                     ←──    runtime.broadcastBridge(channel, data)
 *
 * Receiving Messages (Engine side):
 *   `user.bridgeInbox` is a plain array that ACCUMULATES messages pushed by the host.
 *   The engine does NOT auto-clear this array between ticks.
 *   CRITICAL: You MUST manually clear `user.bridgeInbox` after processing it
 *   (e.g. `user.bridgeInbox.length = 0`). If you forget, the same messages will be
 *   re-processed every tick indefinitely, causing bugs like stuck visual effects.
 *
 * Sending Messages (Engine → Host):
 *   `runtime.sendBridge(userId, channel, data)` sends a message to a SPECIFIC user's host.
 *   `runtime.broadcastBridge(channel, data)` sends to ALL connected users' hosts at once.
 *   The host application listens via its runtime's `onBridgeMessage` callback.
 *
 * What this example demonstrates:
 *   A "Remote Control Dashboard" where the React host panel acts as an admin console:
 *   - React changes the engine's color theme by switching palette slots (zero-cost recolor).
 *   - React injects visual alerts (border flash).
 *   - The engine broadcasts live stats (uptime, tick, clients) to all hosts via broadcastBridge.
 *   - A "PRESS SPACE" indicator lights up when the user sends a ping to React via sendBridge.
 *   - An event log records every bridge interaction (incoming + outgoing).
 *
 * Key Concepts:
 *   - `user.bridgeInbox`: Reading and clearing incoming messages from the host.
 *   - `runtime.sendBridge()`: Sending outgoing messages to a specific user's host.
 *   - `runtime.broadcastBridge()`: Sending outgoing messages to ALL users' hosts.
 *   - `update()` vs `updateUser()`: Global logic (broadcast) vs per-user logic (render).
 *   - Channel-based routing: Messages are tagged with a string channel name.
 *   - Real use case: Remote palette switching via bridge command.
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

// =====================================================================
// Constants
// =====================================================================

/** Maximum number of log entries displayed in the event log. */
const MAX_LOG_ENTRIES = 12;

/** Available theme names (each maps to a palette slot). */
const THEME_NAMES = ["CYBER", "FOREST", "SUNSET", "OCEAN"];

// =====================================================================
// User Data
// =====================================================================

/**
 * Custom data structure stored for each connected user.
 * In Standalone mode, there is only one user ("Player").
 */
interface BridgeUserData {
  /** The user's Display, stored so we can switch its palette at runtime. */
  display: Display;

  /** The single rendering layer for the UI. */
  layer: Layer;

  /**
   * Rolling event log displayed at the bottom of the screen.
   * Newest entries are at the front (index 0). Capped at MAX_LOG_ENTRIES.
   */
  eventLog: { text: string; color: number }[];

  /**
   * Remaining ticks for the "alert flash" effect (border turns red).
   * Triggered when the React host injects an alert via bridge.
   */
  alertFlash: number;

  /** Index of the currently active theme/palette (0-3). */
  currentTheme: number;

  /** Counter tracking how many messages this user has sent to the host. */
  sentToReactCount: number;

  /** Counter tracking how many broadcastBridge heartbeats have been emitted. */
  heartbeatCount: number;

  /**
   * Remaining ticks for the "PRESS SPACE" indicator highlight.
   * When > 0, the indicator renders with a bright background to show the key was pressed.
   */
  spaceFlash: number;
}

export class BridgeShowcase implements IApplication<
  Engine,
  User<BridgeUserData>
> {
  // =====================================================================
  // Global State (shared across all users)
  // =====================================================================

  /** Global tick counter, incremented in update(). Used for broadcast timing. */
  private tickCount = 0;

  /** Monotonic broadcast sequence number. Sent in every heartbeat payload. */
  private broadcastSeq = 0;

  /** Timestamp (ms) when the engine started. Used to compute uptime. */
  private startTime = Date.now();

  /**
   * Global initialization (called once when the application starts).
   * Use this to load resources shared by all users (palettes, fonts, sounds).
   *
   * We pre-load 4 palette themes into slots 0-3. Switching between them is
   * instantaneous and free (no orders resent, no layers redrawn).
   * The React panel will command which slot to activate via bridge.
   */
  async init(_runtime: IRuntime, engine: Engine): Promise<void> {
    // THEME 0: CYBER (default) — dark blue, neon accents
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 8, g: 12, b: 20, a: 255 }, // bg
      { colorId: 1, r: 0, g: 200, b: 120, a: 255 }, // green accent
      { colorId: 2, r: 255, g: 70, b: 70, a: 255 }, // red alert
      { colorId: 3, r: 200, g: 200, b: 220, a: 255 }, // light text
      { colorId: 4, r: 80, g: 90, b: 110, a: 255 }, // dim text
      { colorId: 5, r: 100, g: 180, b: 255, a: 255 }, // cyan title
      { colorId: 6, r: 255, g: 200, b: 60, a: 255 }, // amber
      { colorId: 7, r: 20, g: 28, b: 40, a: 255 }, // panel bg
      { colorId: 8, r: 180, g: 120, b: 255, a: 255 }, // purple
      { colorId: 9, r: 40, g: 55, b: 75, a: 255 }, // border
    ]);

    // THEME 1: FOREST — deep greens, earthy tones
    engine.loadPaletteToSlot(1, [
      { colorId: 0, r: 10, g: 18, b: 10, a: 255 },
      { colorId: 1, r: 80, g: 200, b: 80, a: 255 },
      { colorId: 2, r: 220, g: 100, b: 60, a: 255 },
      { colorId: 3, r: 200, g: 210, b: 180, a: 255 },
      { colorId: 4, r: 80, g: 100, b: 70, a: 255 },
      { colorId: 5, r: 120, g: 200, b: 100, a: 255 },
      { colorId: 6, r: 220, g: 180, b: 80, a: 255 },
      { colorId: 7, r: 18, g: 30, b: 18, a: 255 },
      { colorId: 8, r: 160, g: 200, b: 100, a: 255 },
      { colorId: 9, r: 40, g: 60, b: 40, a: 255 },
    ]);

    // THEME 2: SUNSET — warm oranges, purples
    engine.loadPaletteToSlot(2, [
      { colorId: 0, r: 20, g: 10, b: 15, a: 255 },
      { colorId: 1, r: 255, g: 150, b: 50, a: 255 },
      { colorId: 2, r: 255, g: 60, b: 80, a: 255 },
      { colorId: 3, r: 240, g: 220, b: 200, a: 255 },
      { colorId: 4, r: 120, g: 90, b: 80, a: 255 },
      { colorId: 5, r: 255, g: 120, b: 80, a: 255 },
      { colorId: 6, r: 255, g: 200, b: 100, a: 255 },
      { colorId: 7, r: 35, g: 18, b: 25, a: 255 },
      { colorId: 8, r: 200, g: 100, b: 180, a: 255 },
      { colorId: 9, r: 80, g: 40, b: 50, a: 255 },
    ]);

    // THEME 3: OCEAN — deep blues, aqua highlights
    engine.loadPaletteToSlot(3, [
      { colorId: 0, r: 5, g: 10, b: 25, a: 255 },
      { colorId: 1, r: 0, g: 180, b: 220, a: 255 },
      { colorId: 2, r: 255, g: 100, b: 100, a: 255 },
      { colorId: 3, r: 200, g: 220, b: 240, a: 255 },
      { colorId: 4, r: 60, g: 80, b: 120, a: 255 },
      { colorId: 5, r: 60, g: 160, b: 255, a: 255 },
      { colorId: 6, r: 100, g: 220, b: 200, a: 255 },
      { colorId: 7, r: 12, g: 20, b: 40, a: 255 },
      { colorId: 8, r: 100, g: 140, b: 255, a: 255 },
      { colorId: 9, r: 30, g: 45, b: 80, a: 255 },
    ]);

    this.startTime = Date.now();

    // 30 FPS — enough for a dashboard with floating text.
    _runtime.setTickRate(30);
  }

  /**
   * User initialization (called whenever a new client connects).
   * Sets up the Display, Layer, and input bindings for this user.
   */
  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<BridgeUserData>,
  ): void {
    const width = 80;
    const height = 40;

    // --- User Data ---
    user.data.eventLog = [];
    user.data.alertFlash = 0;
    user.data.currentTheme = 0;
    user.data.sentToReactCount = 0;
    user.data.heartbeatCount = 0;
    user.data.spaceFlash = 0;

    // --- Display Setup ---
    const display = new Display(0, width, height);
    user.addDisplay(display);
    display.switchPalette(0); // Start with CYBER theme
    display.setOrigin(new Vector2(0, 0));
    user.data.display = display;

    // --- Layer Setup ---
    // A single reliable layer for the UI.
    // `mustBeReliable: true` because this is a low-frequency dashboard.
    const layer = new Layer(new Vector2(0, 0), 0, width, height, {
      mustBeReliable: true,
    });
    user.data.layer = layer;
    user.addLayer(layer);

    // --- Input Bindings ---
    const registry = user.getInputBindingRegistry();

    // [SPACE]: Send a manual "ping" event to the React host via sendBridge.
    registry.defineButton(0, "SEND_PING", [
      {
        sourceId: 0,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Space,
      },
    ]);
  }

  /**
   * Per-user logic loop (called every tick, i.e. 30 times per second).
   * Handles bridge message processing, input, notification animation, and rendering.
   */
  updateUser(
    runtime: IRuntime,
    engine: Engine,
    user: User<BridgeUserData>,
  ): void {
    const data = user.data;

    // =====================================================================
    // 1. RECEIVE MESSAGES FROM HOST (React → Engine)
    // =====================================================================

    /**
     * Decrement the alert flash counter each tick.
     * This produces a brief red flash (~0.5s at 30fps = 15 ticks).
     */
    if (data.alertFlash > 0) data.alertFlash--;

    /**
     * Process all pending messages from the host application.
     * `user.bridgeInbox` is a plain array. Messages accumulate via .push() from the host.
     * We iterate over every message, checking the `channel` string to route logic.
     *
     * Supported incoming channels:
     * - 'message-to-engine': Text from React → spawns a floating notification bubble.
     * - 'inject-alert': Triggers a red border flash.
     * - 'set-theme': Changes the active palette slot (instant full-screen recolor).
     */
    for (const msg of user.bridgeInbox) {
      if (msg.channel === "message-to-engine") {
        const payload = msg.data as any;
        const text = payload.text || "Empty";

        this.pushLog(data, `[IN] ${text}`, 5);
        data.alertFlash = 10;
      }

      if (msg.channel === "set-theme") {
        const payload = msg.data as any;
        const themeIndex = payload.themeIndex ?? 0;
        if (themeIndex >= 0 && themeIndex < THEME_NAMES.length) {
          data.currentTheme = themeIndex;

          /**
           * PALETTE SWITCH VIA BRIDGE COMMAND
           * This is a powerful real-world pattern: the React admin panel sends a
           * "set-theme" command, and the engine instantly recolors the entire display
           * by switching palette slots. No orders are resent. No layers redrawn.
           * Just one call → the whole look changes.
           * (See also: 06-palettes example for deep-dive on this mechanic.)
           */
          data.display.switchPalette(themeIndex);

          this.pushLog(
            data,
            `[THEME] Switched to ${THEME_NAMES[themeIndex]}`,
            1,
          );
        }
      }
    }

    /**
     * CRITICAL: Clear the inbox after processing.
     * The engine does NOT automatically clear `user.bridgeInbox` between ticks.
     * If you skip this line, the same messages will be re-read every single tick,
     * causing effects like the flash counter being permanently reset (never fading).
     */
    user.bridgeInbox.length = 0;

    // =====================================================================
    // 2. KEYBOARD INPUT → SEND TO HOST (Engine → React)
    // =====================================================================

    /**
     * On [SPACE]: send a manual ping event to this user's host.
     * `runtime.sendBridge(userId, channel, data)` targets a SPECIFIC user.
     * This differs from `broadcastBridge` (see update()) which targets ALL users.
     */
    if (user.isJustPressed("SEND_PING")) {
      data.sentToReactCount++;
      data.spaceFlash = 12; // ~0.4s highlight at 30fps

      runtime.sendBridge(user.id, "message-from-engine", {
        count: data.sentToReactCount,
        text: `Engine Ping #${data.sentToReactCount}`,
      });

      this.pushLog(data, `[OUT] Ping #${data.sentToReactCount} to React`, 6);
    }

    // Decrement space flash indicator
    if (data.spaceFlash > 0) data.spaceFlash--;

    // =====================================================================
    // 3. RENDERING
    // =====================================================================

    const o: any[] = [];
    const width = 80;

    // --- Background ---
    o.push(OrderBuilder.fill(" ", 0, 0));

    // --- Border (flashes red during alerts) ---
    const borderColor = data.alertFlash > 0 ? 2 : 9;
    o.push(OrderBuilder.rect(0, 0, width, 40, " ", borderColor, 0, false));

    // --- Title Bar ---
    o.push(OrderBuilder.rect(1, 1, 78, 2, " ", 0, 7, true));
    o.push(OrderBuilder.text(3, 1, "BRIDGE COMMUNICATION", 5, 7));
    o.push(
      OrderBuilder.text(3, 2, `Theme: ${THEME_NAMES[data.currentTheme]}`, 4, 7),
    );

    // --- Server Stats (top right, from broadcastBridge data) ---
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const uptimeStr = this.formatUptime(uptime);
    const sessions = engine.sessions ? engine.sessions.size : 1;

    o.push(OrderBuilder.text(45, 1, `UPTIME: ${uptimeStr}`, 1, 7));
    o.push(
      OrderBuilder.text(
        45,
        2,
        `CLIENTS: ${sessions}  HB: #${data.heartbeatCount}`,
        4,
        7,
      ),
    );

    // =====================================================================
    // PRESS SPACE INDICATOR
    // Lights up with a colored background when the user presses [SPACE].
    // A simple, immediate visual feedback for the sendBridge action.
    // =====================================================================

    const spaceY = 5;
    const spaceActive = data.spaceFlash > 0;
    const spaceFg = spaceActive ? 0 : 6;
    const spaceBg = spaceActive ? 1 : 7;

    o.push(OrderBuilder.rect(1, 4, 78, 5, " ", 9, 0, false));
    o.push(OrderBuilder.rect(20, spaceY, 40, 3, " ", spaceFg, spaceBg, true));
    o.push(
      OrderBuilder.text(
        27,
        spaceY + 1,
        spaceActive
          ? `  PING #${data.sentToReactCount} SENT!  `
          : "  PRESS  [SPACE]  TO  PING  ",
        spaceFg,
        spaceBg,
      ),
    );

    // Hint line below the indicator
    o.push(
      OrderBuilder.text(
        22,
        spaceY + 4,
        "sendBridge() -> React host panel",
        4,
        0,
      ),
    );
    o.push(
      OrderBuilder.text(
        55,
        spaceY + 4,
        `Pings: ${data.sentToReactCount}`,
        3,
        0,
      ),
    );

    // =====================================================================
    // CONTROLS
    // =====================================================================

    const ctrlY = 11;
    o.push(OrderBuilder.text(2, ctrlY, "CONTROLS:", 3, 0));
    o.push(OrderBuilder.text(2, ctrlY + 1, "[SPACE]", 6, 0));
    o.push(
      OrderBuilder.text(12, ctrlY + 1, "Send ping to React (sendBridge)", 4, 0),
    );

    // =====================================================================
    // EVENT LOG
    // =====================================================================

    const logY = 14;
    o.push(OrderBuilder.text(2, logY, "EVENT LOG:", 3, 0));
    o.push(
      OrderBuilder.rect(1, logY + 1, 78, MAX_LOG_ENTRIES + 1, " ", 4, 7, true),
    );

    for (let i = 0; i < MAX_LOG_ENTRIES; i++) {
      const entry = data.eventLog[i];
      if (entry) {
        o.push(
          OrderBuilder.text(
            2,
            logY + 1 + i,
            entry.text.substring(0, 76),
            entry.color,
            7,
          ),
        );
      }
    }

    // Commit orders to the layer. Required every tick after setOrders().
    data.layer.setOrders(o);
    data.layer.commit();
  }

  // =====================================================================
  // GLOBAL UPDATE — broadcastBridge
  // =====================================================================

  /**
   * Global update (called every tick, independent of users).
   *
   * This is the ideal place for logic that is NOT per-user: timers, world simulation,
   * and BROADCAST messages that should reach every connected host at once.
   *
   * `runtime.broadcastBridge(channel, data)` sends a message to ALL connected users'
   * host applications simultaneously. Unlike `sendBridge(userId, ...)` which targets
   * one specific user, broadcast is fire-and-forget to everyone.
   *
   * Here we broadcast engine telemetry every second. The React host displays this data
   * in real-time (uptime, tick count, connected clients, current theme).
   */
  update(runtime: IRuntime, engine: Engine): void {
    this.tickCount++;

    // Broadcast engine stats to ALL connected hosts every ~1 second (30 ticks @ 30fps).
    if (this.tickCount % 30 === 0) {
      this.broadcastSeq++;
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const sessions = engine.sessions ? engine.sessions.size : 1;

      /**
       * `runtime.broadcastBridge(channel, data)`
       * Sends the payload to EVERY connected user's host in a single call.
       * In Connected mode (server/client), this reaches all remote clients.
       * In Standalone mode, there is only one user, so it behaves like sendBridge.
       */
      runtime.broadcastBridge("engine-heartbeat", {
        seq: this.broadcastSeq,
        uptimeSeconds: uptime,
        tickCount: this.tickCount,
        connectedClients: sessions,
        timestamp: Date.now(),
      });

      // Update each user's heartbeat counter for display purposes.
      if (engine.sessions) {
        for (const user of engine.sessions.values()) {
          (user as User<BridgeUserData>).data.heartbeatCount =
            this.broadcastSeq;
        }
      }
    }
  }

  // =====================================================================
  // HELPERS
  // =====================================================================

  /** Push a new entry to the top of the event log (capped at MAX_LOG_ENTRIES). */
  private pushLog(data: BridgeUserData, text: string, color: number): void {
    data.eventLog.unshift({ text, color });
    if (data.eventLog.length > MAX_LOG_ENTRIES) {
      data.eventLog.length = MAX_LOG_ENTRIES;
    }
  }

  /** Format seconds into a human-readable "Xh Xm Xs" string. */
  private formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
}
