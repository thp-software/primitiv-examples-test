/**
 * TermBombServerApp - UTSP server entrypoint.
 * Orchestrates lobby/menu, inputs, rendering, bots, and game loop.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  Vector2,
  type IApplication,
  ScalingMode,
  type IRuntime,
} from "@primitiv/engine";
// import { IApplication, ScalingMode } from '@utsp/types';
import { GameMap } from "../game/GameMap";
import { GameLogic } from "../game/GameLogic";
import { Direction, type GameState } from "../game/types";
import { PALETTE } from "../rendering/Appearance";
import { BoardRenderer } from "../rendering/BoardRenderer";
import { InputAdapter } from "../services/InputAdapter";
import { AudioManager } from "../services/AudioManager";
import { SceneRouter } from "../services/SceneRouter.js";
import { BotAI } from "../ai/BotAI";
import { MenuController } from "../scenes/MenuController";

// ==========================================
// USER DATA
// ==========================================

export interface TermBombUserData {
  // Scene management
  currentScene: "loading" | "mainMenu" | "serverList" | "lobby" | "game";
  audioReady: boolean;
  loadingStartTick: number; // Tick when loading started (for minimum 1s delay)
  menuSelectedOption: number;
  menuMode: "solo" | "host" | "join" | null; // Selected mode after pressing Enter

  // Server list state
  availableServers: { name: string; playerCount: number }[];
  serverListSelectedIndex: number;

  // Lobby state
  lobbyName: string;
  lobbySlots: LobbySlot[];
  lobbySelectedSlot: number; // Currently selected slot (0-3) or 4 for Start button
  lobbyIsHost: boolean; // true if hosting, false if joining

  // Game state
  gameState: GameState;
  gameMap: GameMap;
  gameLogic: GameLogic;

  // Multiplayer: reference to shared game (null for solo)
  sharedGame: SharedGame | null;
  // Player ID in the game (0 = host, 1-3 = joined players/bots)
  playerId: number;

  // Rendering
  layers: Map<string, Layer>;
  display: Display;
  animationTick: number;
  gameOverAnimationTick: number;
  gameOverTitle: string | null;
  renderState: RenderState;
  commitStats: CommitStats;
  bgMusicId: number | null;
  bgMusicMenuId: number | null;
  audioUnlocked: boolean;
  menuMusicAttempted: boolean;
  gameMusicAttempted: boolean;

  // Display
  displayWidth: number;
  displayHeight: number;
  gameOffsetX: number;
  controlsLeftWidth: number;
  controlsRightWidth: number;
  controlsEnabled: boolean;
  layoutMode: "wide" | "square";

  // Input edge detection
  wasMovingUp: boolean;
  wasMovingDown: boolean;
  wasMovingLeft: boolean;
  wasMovingRight: boolean;
  wasBombPressed: boolean;
  wasMenuPressed: boolean;
  wasRestartPressed: boolean;
  wasEnterPressed: boolean;

  // Movement cooldown (for controlled movement)
  moveCooldown: number;

  // Countdown before game starts (in ticks, 20 ticks = 1 second)
  countdownTicks: number;

  // AI memory to prevent oscillation (stores last direction for each AI)
  aiLastDirection: Map<number, Direction | null>;
  aiStuckCounter: Map<number, number>;

  // Debug: store heatmaps and targets for each AI
  aiDebugHeatMaps: Map<number, Map<string, number>>;
  aiDebugTargets: Map<number, { x: number; y: number } | null>;

  // Touch/Mouse virtual button states
  touchUp: boolean;
  touchDown: boolean;
  touchLeft: boolean;
  touchRight: boolean;
  touchBomb: boolean; // Button A (confirm/bomb)
  touchAction: boolean; // Button B (back/cancel)

  // Gamepad axis-derived states
  axisUp: boolean;
  axisDown: boolean;
  axisLeft: boolean;
  axisRight: boolean;
}

interface CommitStats {
  total: number;
  byLabel: Record<string, number>;
  lastLogTick: number;
}

interface RenderState {
  staticKey: string | null;
  destructibleKey: string | null;
  bombsKey: string | null;
  itemsKey: string | null;
  explosionsKey: string | null;
  playersKey: string | null;
  uiKey: string | null;
  controlsKey: string | null;
  menuKey: string | null;
  menuBgKey: string | null;
  menuItemsKey: string | null;
  serverListKey: string | null;
  lobbyKey: string | null;
}

// Lobby slot types
export type LobbySlotType = "empty" | "player" | "bot";

export interface LobbySlot {
  type: LobbySlotType;
  name: string; // Player name or "Bot 1", "Bot 2", etc.
  ready: boolean;
  isHost: boolean; // true for the host player (slot 0)
  disconnected?: boolean; // flag a slot whose owner disconnected without reshuffling
}

// Shared lobby info (visible to all users)
export interface SharedLobby {
  name: string;
  hostUser: User<TermBombUserData>;
  slots: LobbySlot[];
  inGame: boolean; // true when game has started
  // Map of connected users to their slot index (excluding host who is always slot 0)
  connectedUsers: Map<User<TermBombUserData>, number>;
}

// Shared game state (for multiplayer)
export interface SharedGame {
  gameMap: GameMap;
  gameLogic: GameLogic;
  // Map of user to their player ID (slot index)
  players: Map<User<TermBombUserData>, number>;
  // Inputs pushed by every user; only the host consumes and mutates state
  inputBuffer: Map<
    number,
    {
      up: boolean;
      down: boolean;
      left: boolean;
      right: boolean;
      bomb: boolean;
      restart: boolean;
      menu: boolean;
    }
  >;
}

// ==========================================
// CONSTANTS
// ==========================================

// Layer positions (each scene at different X position)
const MENU_LAYER_X = 1000;
const SERVER_LIST_LAYER_X = 3000;
const LOBBY_LAYER_X = 2000;
const GAME_LAYER_X = 0;

// Map 21x21 + 1 ligne pour le HUD en haut
const MAP_SIZE = 21;
const GAME_WIDTH = MAP_SIZE;
const GAME_HEIGHT = MAP_SIZE + 1; // +1 pour le HUD en haut

// Display size presets
// Tall-ish devices (>= 12/9 ratio): extended layout with side controls, 49x22
const WIDE_DISPLAY_WIDTH = 49;
// Square-ish devices (< 12/9 ratio): compact layout without side controls, 21x22
const SQUARE_DISPLAY_WIDTH = GAME_WIDTH;
const DISPLAY_HEIGHT = GAME_HEIGHT;

const MAP_OFFSET_X = 0;
const MAP_OFFSET_Y = 1; // La map commence à Y=1, HUD à Y=0

// Offsets and control widths are computed per-user depending on layout

const MOVE_COOLDOWN = 3; // Ticks between moves (adjusted for 20 ticks/sec)
const COUNTDOWN_SECONDS = 5; // Countdown before game starts
const COUNTDOWN_TICKS = COUNTDOWN_SECONDS * 20; // 20 ticks per second

// ==========================================
// MAIN APPLICATION
// ==========================================

export class TermBomb implements IApplication<Engine, User<TermBombUserData>> {
  // Active lobbies shared between all users
  private activeLobbies: Map<string, SharedLobby> = new Map();
  // Active games (by lobby name)
  private activeGames: Map<string, SharedGame> = new Map();
  private sceneRouter: SceneRouter<User<TermBombUserData>>;
  private menuController: MenuController;
  private boardRenderer: BoardRenderer;

  constructor() {
    this.sceneRouter = new SceneRouter<User<TermBombUserData>>();
    this.menuController = new MenuController({
      activeLobbies: this.activeLobbies,
      moveDisplayTo: this.moveDisplayTo.bind(this),
      resetMenuRenderState: this.resetMenuRenderState.bind(this),
      startGame: this.startGame.bind(this),
      startGameFromLobby: this.startGameFromLobby.bind(this),
      startGameForUser: this.startGameForUser.bind(this),
      recordCommit: this.recordCommit.bind(this),
      menuLayerX: MENU_LAYER_X,
      serverListLayerX: SERVER_LIST_LAYER_X,
      lobbyLayerX: LOBBY_LAYER_X,
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
    });
    this.boardRenderer = new BoardRenderer({
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
      displayHeight: DISPLAY_HEIGHT,
      mapOffsetX: MAP_OFFSET_X,
      mapOffsetY: MAP_OFFSET_Y,
      recordCommit: this.recordCommit.bind(this),
    });
    this.registerScenes();
  }

  async init(runtime: IRuntime, core: Engine): Promise<void> {
    // Load custom palette
    core.loadPaletteToSlot(0, PALETTE);
    await core.loadSound(
      "explosion",
      new URL("../assets/explosion.mp3", import.meta.url).href,
    );
    await core.loadSound(
      "collect",
      new URL("../assets/collect.mp3", import.meta.url).href,
    );
    await core.loadSound(
      "bg_music",
      new URL("../assets/bg_music.mp3", import.meta.url).href,
    );
    await core.loadSound(
      "bg_music_menu",
      new URL("../assets/bg_music_menu.mp3", import.meta.url).href,
    );
    runtime.setTickRate(20);
  }

  initUser(
    runtime: IRuntime,
    _core: Engine,
    user: User<TermBombUserData>,
  ): void {
    // Send game metadata to bridge
    runtime.sendBridge(user.id, "game-metadata", {
      title: "Terminal Bomber",
      author: "THP",
      description:
        "Use <b>W, A, S, D</b> to move.<br/>Press <code>SPACE</code> to drop a bomb!",
    });

    // Initialize game - 31x31 map
    const gameMap = new GameMap(MAP_SIZE, MAP_SIZE);
    const gameLogic = new GameLogic(gameMap);

    user.data = {
      currentScene: "loading",
      audioReady: false,
      loadingStartTick: 0,
      menuSelectedOption: 0,
      menuMode: null,
      gameState: "waiting",
      gameMap,
      gameLogic,
      sharedGame: null,
      playerId: 0,
      layers: new Map(),
      display: null!, // Will be set in setupDisplay
      animationTick: 0,
      gameOverAnimationTick: 0,
      gameOverTitle: null,
      renderState: {
        staticKey: null,
        destructibleKey: null,
        bombsKey: null,
        itemsKey: null,
        explosionsKey: null,
        playersKey: null,
        uiKey: null,
        controlsKey: null,
        menuKey: null,
        menuBgKey: null,
        menuItemsKey: null,
        serverListKey: null,
        lobbyKey: null,
      },
      commitStats: {
        total: 0,
        byLabel: {},
        lastLogTick: -1,
      },
      bgMusicId: null,
      bgMusicMenuId: null,
      audioUnlocked: false,
      menuMusicAttempted: false,
      gameMusicAttempted: false,
      displayWidth: 0,
      displayHeight: DISPLAY_HEIGHT,
      gameOffsetX: 0,
      controlsLeftWidth: 0,
      controlsRightWidth: 0,
      controlsEnabled: false,
      layoutMode: "wide",
      wasMovingUp: false,
      wasMovingDown: false,
      wasMovingLeft: false,
      wasMovingRight: false,
      wasBombPressed: false,
      wasMenuPressed: false,
      wasRestartPressed: false,
      wasEnterPressed: false,
      moveCooldown: 0,
      countdownTicks: 0,
      aiLastDirection: new Map(),
      aiStuckCounter: new Map(),
      aiDebugHeatMaps: new Map(),
      aiDebugTargets: new Map(),
      // Server list
      availableServers: [],
      serverListSelectedIndex: 0,
      // Lobby
      lobbyName: "",
      lobbySlots: [],
      lobbySelectedSlot: 0,
      lobbyIsHost: false,
      // Touch/Mouse virtual buttons
      touchUp: false,
      touchDown: false,
      touchLeft: false,
      touchRight: false,
      touchBomb: false,
      touchAction: false,
      axisUp: false,
      axisDown: false,
      axisLeft: false,
      axisRight: false,
    };

    this.setupDisplay(user);
    this.setupInputs(user);

    console.log(`User connected: ${user.id}`);
  }

  destroyUser(
    _runtime: IRuntime,
    _core: Engine,
    user: User<TermBombUserData>,
  ): void {
    // Remove user from any shared game; if no humans remain, drop the game
    if (user.data.sharedGame) {
      const shared = user.data.sharedGame;
      shared.players.delete(user);
      if (shared.players.size === 0) {
        this.activeGames.delete(user.data.lobbyName);
      }
      user.data.sharedGame = null;
    }

    // Remove from lobby if present
    if (user.data.lobbyName) {
      const lobby = this.activeLobbies.get(user.data.lobbyName);
      if (lobby) {
        const slotIndex = lobby.connectedUsers.get(user);
        if (slotIndex !== undefined) {
          lobby.slots[slotIndex] = {
            type: "empty",
            name: "",
            ready: false,
            isHost: false,
          };
          lobby.connectedUsers.delete(user);
        }

        const isHostLeaving = lobby.hostUser === user;

        if (isHostLeaving) {
          if (lobby.connectedUsers.size === 0) {
            // No one left to own the lobby: drop it
            this.activeLobbies.delete(user.data.lobbyName);
          } else {
            // Clear the old host slot but keep slot positions stable
            lobby.slots[0] = {
              type: "empty",
              name: "",
              ready: false,
              isHost: false,
              disconnected: true,
            };

            // Promote the earliest connected user as the new host without moving slots
            const [newHostUser, newHostSlotIndex] = lobby.connectedUsers
              .entries()
              .next().value as [User<TermBombUserData>, number];

            lobby.slots[newHostSlotIndex] = {
              ...lobby.slots[newHostSlotIndex],
              isHost: true,
              disconnected: false,
            };

            lobby.hostUser = newHostUser;
            newHostUser.data.lobbyIsHost = true;
          }
        } else if (lobby.connectedUsers.size === 0 && lobby.hostUser === user) {
          // Redundant safety: drop an ownerless lobby
          this.activeLobbies.delete(user.data.lobbyName);
        }
      }
    }

    console.log(`User disconnected: ${user.id}`);
  }

  private setupDisplay(user: User<TermBombUserData>): void {
    // Determine initial compatibility with defaults
    const display = new Display(0, WIDE_DISPLAY_WIDTH, DISPLAY_HEIGHT);
    user.addDisplay(display);
    user.data.display = display;

    // Always use wide layout
    const useWideLayout = true;

    const targetWidth = useWideLayout
      ? WIDE_DISPLAY_WIDTH
      : SQUARE_DISPLAY_WIDTH;
    const controlsEnabled = useWideLayout;
    const gameOffsetX = controlsEnabled
      ? Math.floor((targetWidth - GAME_WIDTH) / 2)
      : 0;
    const controlsLeftWidth = controlsEnabled ? gameOffsetX : 0;
    const controlsRightWidth = controlsEnabled
      ? targetWidth - GAME_WIDTH - gameOffsetX
      : 0;

    // Resize if our default guess wasn't right (though here we hardcode wide mostly)
    if (targetWidth !== WIDE_DISPLAY_WIDTH) {
      display.setSize(new Vector2(targetWidth, DISPLAY_HEIGHT));
    }

    user.data.displayWidth = targetWidth;
    user.data.displayHeight = DISPLAY_HEIGHT;
    user.data.gameOffsetX = gameOffsetX;
    user.data.controlsLeftWidth = controlsLeftWidth;
    user.data.controlsRightWidth = controlsRightWidth;
    user.data.controlsEnabled = controlsEnabled;
    user.data.layoutMode = useWideLayout ? "wide" : "square";

    display.setOrigin(new Vector2(MENU_LAYER_X, 0)); // Start at menu position

    display.switchPalette(0);
    display.setScalingMode(ScalingMode.Quarter);
    user.sendSounds();
    user.configureSpatialAudio({
      maxDistance: 80,
      referenceDistance: 2,
      rolloffFactor: 1.0,
      panSpread: 1.0,
    });
    // display.setCellSize(CELL_WIDTH, CELL_HEIGHT);

    display.setPostProcess({
      scanlines: {
        enabled: true,
        opacity: 0.4, // 0-1, défaut 0.15
        pattern: "horizontal",
        spacing: 5, // Pixels entre les lignes, défaut 2
        thickness: 2, // Épaisseur des lignes, défaut 1
        color: { r: 20, g: 30, b: 40 }, // Couleur, défaut noir
      },
    });

    // Menu layer (at position 1000 + offset to center in display)
    const menuLayer = new Layer(
      new Vector2(MENU_LAYER_X + gameOffsetX, 0),
      10,
      GAME_WIDTH,
      GAME_HEIGHT,
      { name: "Menu", mustBeReliable: true },
    );
    user.data.layers.set("menu", menuLayer);
    user.addLayer(menuLayer, "menu");

    // Menu background/logo layer (below menu items, changes rarely)
    const menuBgLayer = new Layer(
      new Vector2(MENU_LAYER_X + gameOffsetX, 0),
      9,
      GAME_WIDTH,
      GAME_HEIGHT,
      { name: "MenuBg", mustBeReliable: false },
    );
    user.data.layers.set("menuBg", menuBgLayer);
    user.addLayer(menuBgLayer, "menuBg");

    // Server list layer (at position 3000 + offset)
    const serverListLayer = new Layer(
      new Vector2(SERVER_LIST_LAYER_X + gameOffsetX, 0),
      10,
      GAME_WIDTH,
      GAME_HEIGHT,
      { name: "ServerList", mustBeReliable: false },
    );
    user.data.layers.set("serverList", serverListLayer);
    user.addLayer(serverListLayer, "serverList");

    // Lobby layer (at position 2000 + offset)
    const lobbyLayer = new Layer(
      new Vector2(LOBBY_LAYER_X + gameOffsetX, 0),
      10,
      GAME_WIDTH,
      GAME_HEIGHT,
      { name: "Lobby", mustBeReliable: false },
    );
    user.data.layers.set("lobby", lobbyLayer);
    user.addLayer(lobbyLayer, "lobby");

    const gameOrigin = new Vector2(GAME_LAYER_X + gameOffsetX, 0);

    // Static layer (floor + walls)
    const staticLayer = new Layer(gameOrigin, 10, GAME_WIDTH, GAME_HEIGHT, {
      name: "GameStatic",
      mustBeReliable: false,
    });
    user.data.layers.set("gameStatic", staticLayer);
    user.addLayer(staticLayer, "gameStatic");
    staticLayer.setOrders([]);
    staticLayer.commit();

    // Destructibles (bricks)
    const destructibleLayer = new Layer(
      gameOrigin,
      20,
      GAME_WIDTH,
      GAME_HEIGHT,
      {
        name: "GameDestructible",
        mustBeReliable: false,
      },
    );
    user.data.layers.set("gameDestructible", destructibleLayer);
    user.addLayer(destructibleLayer, "gameDestructible");
    destructibleLayer.setOrders([]);
    destructibleLayer.commit();

    // Items (powerups) - at original z-level
    const itemsLayer = new Layer(
      gameOrigin,
      30, // original z-level for items
      GAME_WIDTH,
      GAME_HEIGHT,
      { name: "GameItems", mustBeReliable: false },
    );
    user.data.layers.set("gameItems", itemsLayer);
    user.addLayer(itemsLayer, "gameItems");
    itemsLayer.setOrders([]);
    itemsLayer.commit();

    // Bombs - above auras/explosions to stay visible
    const bombsLayer = new Layer(gameOrigin, 45, GAME_WIDTH, GAME_HEIGHT, {
      name: "GameBombs",
      mustBeReliable: false,
    });
    user.data.layers.set("gameBombs", bombsLayer);
    user.addLayer(bombsLayer, "gameBombs");
    bombsLayer.setOrders([]);
    bombsLayer.commit();

    // Explosions
    const explosionsLayer = new Layer(gameOrigin, 40, GAME_WIDTH, GAME_HEIGHT, {
      name: "GameExplosions",
      mustBeReliable: false,
    });
    user.data.layers.set("gameExplosions", explosionsLayer);
    user.addLayer(explosionsLayer, "gameExplosions");
    explosionsLayer.setOrders([]);
    explosionsLayer.commit();

    // Players
    const playersLayer = new Layer(gameOrigin, 50, GAME_WIDTH, GAME_HEIGHT, {
      name: "GamePlayers",
      mustBeReliable: false,
    });
    user.data.layers.set("gamePlayers", playersLayer);
    user.addLayer(playersLayer, "gamePlayers");
    playersLayer.setOrders([]);
    playersLayer.commit();

    // Debug layer (between floor and game elements)
    const debugLayer = new Layer(
      new Vector2(gameOffsetX, 0),
      5, // Lower z-index than game layer
      GAME_WIDTH,
      GAME_HEIGHT,
      { name: "Debug", mustBeReliable: false },
    );
    user.data.layers.set("debug", debugLayer);
    user.addLayer(debugLayer, "debug");
    // Initial commit
    debugLayer.setOrders([]);
    debugLayer.commit();

    // UI layer (same position as game layer since it's used in game scene)
    const uiLayer = new Layer(
      new Vector2(GAME_LAYER_X + gameOffsetX, 0),
      100,
      GAME_WIDTH,
      GAME_HEIGHT,
      { name: "UI", mustBeReliable: false },
    );
    user.data.layers.set("ui", uiLayer);
    user.addLayer(uiLayer, "ui");
    // Initial commit
    uiLayer.setOrders([]);
    uiLayer.commit();

    // Touch controls layer (full display size, z-index below everything)
    // Positioned at same position as display (no offset needed)
    const controlsLayer = new Layer(
      new Vector2(MENU_LAYER_X, 0),
      1, // Very low z-index (below game layer z=10)
      targetWidth,
      DISPLAY_HEIGHT,
      { name: "Controls", mustBeReliable: false },
    );
    user.data.layers.set("controls", controlsLayer);
    user.addLayer(controlsLayer, "controls");

    // Initial commit WITH orders to activate the layer (only if enabled)
    this.boardRenderer.updateControlsLayer(user, "controls-init");
  }

  /**
   * Move display to a new X position and sync controlsLayer position
   * Also re-renders controls layer to ensure it's visible after position change
   */
  private moveDisplayTo(user: User<TermBombUserData>, layerX: number): void {
    user.data.display.setOrigin(new Vector2(layerX, 0));
    const controlsLayer = user.data.layers.get("controls");
    if (controlsLayer) {
      controlsLayer.setOrigin(new Vector2(layerX, 0));
      this.boardRenderer.updateControlsLayer(user, "controls-move");
    }
  }

  private setupInputs(user: User<TermBombUserData>): void {
    InputAdapter.registerBindings(
      user,
      {
        controlsEnabled: user.data.controlsEnabled,
        controlsLeftWidth: user.data.controlsLeftWidth,
        controlsRightWidth: user.data.controlsRightWidth,
        gameOffsetX: user.data.gameOffsetX,
        displayWidth: user.data.displayWidth,
        gameWidth: GAME_WIDTH,
      },
      DISPLAY_HEIGHT,
    );
  }

  /**
   * Update touch/mouse controls - detect which virtual button is being pressed
   * Uses the TouchZone-based axis system for D-pad and button zones for A/B
   */
  private updateTouchControls(user: User<TermBombUserData>): void {
    const touchState = InputAdapter.computeTouchState(
      user,
      {
        controlsEnabled: user.data.controlsEnabled,
        controlsLeftWidth: user.data.controlsLeftWidth,
        controlsRightWidth: user.data.controlsRightWidth,
        gameOffsetX: user.data.gameOffsetX,
        displayWidth: user.data.displayWidth,
        gameWidth: GAME_WIDTH,
      },
      DISPLAY_HEIGHT,
    );

    user.data.touchLeft = touchState.touchLeft;
    user.data.touchRight = touchState.touchRight;
    user.data.touchUp = touchState.touchUp;
    user.data.touchDown = touchState.touchDown;
    user.data.touchBomb = touchState.touchBomb;
    user.data.touchAction = touchState.touchAction;
  }

  updateUser(
    _runtime: IRuntime,
    _core: Engine,
    user: User<TermBombUserData>,
  ): void {
    user.data.animationTick++;
    // Keep a frozen tick to render post-game without animations
    if (user.data.gameState !== "gameover") {
      user.data.gameOverAnimationTick = user.data.animationTick;
    }

    // Check audio loading state (simplified for Primitiv - sounds loaded in init)
    if (!user.data.audioReady) {
      // Track when loading started
      if (user.data.loadingStartTick === 0) {
        user.data.loadingStartTick = user.data.animationTick;
      }

      // Minimum loading time: 1 second (20 ticks at 20 ticks/sec)
      const MIN_LOADING_TICKS = 20;
      const ticksElapsed = user.data.animationTick - user.data.loadingStartTick;
      const minTimeReached = ticksElapsed >= MIN_LOADING_TICKS;

      if (!minTimeReached) {
        // Show loading screen with time-based progress
        const progress = Math.min(ticksElapsed / MIN_LOADING_TICKS, 1);
        this.boardRenderer.renderLoading(user, progress);
        return;
      }
      user.data.audioReady = true;
      // Transition to main menu once loading is complete
      user.data.currentScene = "mainMenu";
      user.data.renderState.menuKey = null; // Force menu render
    }

    // Unlock audio + background music via AudioManager
    if (!user.data.audioUnlocked) {
      const anyInput =
        user.getButton("Up") ||
        user.getButton("Down") ||
        user.getButton("Left") ||
        user.getButton("Right") ||
        user.getButton("Bomb") ||
        user.getButton("Menu") ||
        user.getButton("Enter") ||
        user.data.touchUp ||
        user.data.touchDown ||
        user.data.touchLeft ||
        user.data.touchRight ||
        user.data.touchBomb ||
        user.data.touchAction;

      AudioManager.unlockOnFirstInput(user, anyInput);
    }

    const inGamePlaying =
      user.data.currentScene === "game" && user.data.gameState === "playing";
    AudioManager.handleBackgroundMusic(user, inGamePlaying);

    // Layout is permanently wide, no need to check
    // this.ensureLayout(user);

    // === TOUCH/AXIS CONTROLS DETECTION ===
    // This now handles both touch zones and gamepad stick via unified axes
    this.updateTouchControls(user);

    // Copy touch states to axis states (they now come from the same source)
    user.data.axisLeft = user.data.touchLeft;
    user.data.axisRight = user.data.touchRight;
    user.data.axisUp = user.data.touchUp;
    user.data.axisDown = user.data.touchDown;

    // Update controls layer only when playing (avoid post-game bandwidth)
    if (
      user.data.controlsEnabled &&
      user.data.currentScene === "game" &&
      user.data.gameState === "playing"
    ) {
      this.boardRenderer.updateControlsLayer(user);
    }

    const sceneBefore = user.data.currentScene;
    this.sceneRouter.run(user.data.currentScene, user, sceneBefore);

    // Periodically flush commit counters so commits inside menus still get logged
    this.flushCommitStats(user);
  }

  update(_runtime: IRuntime, _core: Engine): void {}

  private resetRenderState(user: User<TermBombUserData>): void {
    user.data.renderState = {
      staticKey: null,
      destructibleKey: null,
      bombsKey: null,
      itemsKey: null,
      explosionsKey: null,
      playersKey: null,
      uiKey: null,
      controlsKey: null,
      menuKey: null,
      menuBgKey: null,
      menuItemsKey: null,
      serverListKey: null,
      lobbyKey: null,
    };

    const layers = this.boardRenderer.getLayers(user);
    if (!layers) return;

    // Clear all game-facing layers to avoid stale visuals during scene switches
    const layersToClear: Layer[] = [
      layers.staticLayer,
      layers.destructibleLayer,
      layers.bombsLayer,
      layers.explosionsLayer,
      layers.playersLayer,
      layers.uiLayer,
    ];

    if (layers.controlsLayer) {
      layersToClear.push(layers.controlsLayer);
    }

    for (const layer of layersToClear) {
      layer.setOrders([]);
      layer.commit();
      if (layer === layers.controlsLayer) {
        this.recordCommit(user, "controls-reset");
      }
    }
  }

  private resetMenuRenderState(user: User<TermBombUserData>): void {
    user.data.renderState.menuKey = null;
    user.data.renderState.menuBgKey = null;
    user.data.renderState.menuItemsKey = null;
    user.data.renderState.serverListKey = null;
    user.data.renderState.lobbyKey = null;
  }

  private recordCommit(user: User<TermBombUserData>, label: string): void {
    const stats = user.data.commitStats;

    // Initialize the log tick on first commit so flush cadence works
    if (stats.lastLogTick < 0) {
      stats.lastLogTick = user.data.animationTick;
    }

    stats.total += 1;
    stats.byLabel[label] = (stats.byLabel[label] || 0) + 1;
  }

  private registerScenes(): void {
    this.sceneRouter.register(
      "mainMenu",
      (user: User<TermBombUserData>, sceneBefore: string) => {
        this.menuController.updateMainMenu(user);
        if (
          user.data.currentScene === sceneBefore &&
          user.data.renderState.menuKey === null
        ) {
          this.menuController.renderMainMenu(user);
        }
      },
    );

    this.sceneRouter.register(
      "serverList",
      (user: User<TermBombUserData>, sceneBefore: string) => {
        this.menuController.updateServerList(user);
        if (
          user.data.currentScene === sceneBefore &&
          user.data.renderState.serverListKey === null
        ) {
          this.menuController.renderServerList(user);
        }
      },
    );

    this.sceneRouter.register(
      "lobby",
      (user: User<TermBombUserData>, sceneBefore: string) => {
        this.menuController.updateLobby(user);
        if (
          user.data.currentScene === sceneBefore &&
          user.data.renderState.lobbyKey === null
        ) {
          this.menuController.renderLobby(user);
        }
      },
    );

    this.sceneRouter.register("game", (user: User<TermBombUserData>) => {
      this.updateGame(user);
      this.boardRenderer.renderGame(user);
    });
  }

  private flushCommitStats(user: User<TermBombUserData>): void {
    const stats = user.data.commitStats;

    // Nothing to flush
    if (stats.total === 0) return;

    // On first commit we only prime the lastLogTick
    if (stats.lastLogTick < 0) {
      stats.lastLogTick = user.data.animationTick;
      return;
    }

    // Flush once 20+ ticks have elapsed since the last log
    if (user.data.animationTick - stats.lastLogTick >= 20) {
      stats.total = 0;
      stats.byLabel = {};
      stats.lastLogTick = user.data.animationTick;
    }
  }

  private startGame(user: User<TermBombUserData>, playerCount: number): void {
    // Solo/local game path (not tied to a lobby)
    user.data.sharedGame = null;
    user.data.playerId = 0;

    this.moveDisplayTo(user, GAME_LAYER_X);

    const uiLayer = user.data.layers.get("ui");
    if (uiLayer) {
      uiLayer.setOrigin(new Vector2(GAME_LAYER_X + user.data.gameOffsetX, 0));
      uiLayer.setOrders([]);
      uiLayer.commit();
    }

    const controlsLayer = user.data.layers.get("controls");
    if (controlsLayer) {
      controlsLayer.setOrders([]);
      controlsLayer.commit();
      this.recordCommit(user, "controls-start");
    }

    this.resetRenderState(user);

    user.data.currentScene = "game";
    user.data.gameState = "countdown";
    user.data.gameOverTitle = null;
    user.data.countdownTicks = COUNTDOWN_TICKS;
    user.data.gameMap.reset();
    user.data.gameLogic.initPlayers(playerCount);
  }

  private startGameFromLobby(user: User<TermBombUserData>): void {
    // Count players and bots
    const activePlayers = user.data.lobbySlots.filter(
      (slot) => slot.type === "player" || slot.type === "bot",
    ).length;

    // Create shared game state
    const sharedGame: SharedGame = {
      gameMap: user.data.gameMap,
      gameLogic: user.data.gameLogic,
      players: new Map(),
      inputBuffer: new Map(),
    };

    // Add host as player 0
    sharedGame.players.set(user, 0);
    user.data.sharedGame = sharedGame;
    user.data.playerId = 0;

    // Add connected users from lobby
    const lobby = this.activeLobbies.get(user.data.lobbyName);
    if (lobby) {
      for (const [connectedUser, slotIndex] of lobby.connectedUsers) {
        sharedGame.players.set(connectedUser, slotIndex);
      }
    }

    // Store the shared game
    this.activeGames.set(user.data.lobbyName, sharedGame);

    // Switch display origin to game position (also moves controlsLayer)
    this.moveDisplayTo(user, GAME_LAYER_X);

    // THEN do initial commit on layers to activate them in UTSP sync
    const uiLayer = user.data.layers.get("ui");
    if (uiLayer) {
      uiLayer.setOrigin(new Vector2(GAME_LAYER_X + user.data.gameOffsetX, 0));
      uiLayer.setOrders([]);
      uiLayer.commit();
    }
    const controlsLayer = user.data.layers.get("controls");
    if (controlsLayer) {
      controlsLayer.setOrders([]);
      controlsLayer.commit();
      this.recordCommit(user, "controls-start");
    }

    this.resetRenderState(user);

    user.data.currentScene = "game";
    user.data.gameState = "countdown";
    user.data.gameOverTitle = null;
    user.data.countdownTicks = COUNTDOWN_TICKS;
    user.data.gameMap.reset();
    user.data.gameLogic.initPlayers(activePlayers);
    console.log(
      `Host created game ${user.data.lobbyName} with ${sharedGame.players.size} players`,
    );
  }

  // Start game for a user who joined (not the host)
  private startGameForUser(
    user: User<TermBombUserData>,
    _slots: LobbySlot[],
    lobbyName: string,
  ): void {
    const sharedGame = this.activeGames.get(lobbyName);
    if (!sharedGame) {
      console.error(`Shared game not found for lobby ${lobbyName}`);
      return;
    }

    // Determine this user's player index from the lobby mapping
    const lobby = this.activeLobbies.get(lobbyName);
    const slotIndex = lobby?.connectedUsers.get(user) ?? -1;
    const playerIndex = slotIndex >= 0 ? slotIndex : sharedGame.players.size;

    // Link user to shared game state
    sharedGame.players.set(user, playerIndex);
    user.data.sharedGame = sharedGame;
    user.data.playerId = playerIndex;
    user.data.gameMap = sharedGame.gameMap;
    user.data.gameLogic = sharedGame.gameLogic;

    // Move display and align UI/controls origins
    this.moveDisplayTo(user, GAME_LAYER_X);

    const uiLayer = user.data.layers.get("ui");
    if (uiLayer) {
      uiLayer.setOrigin(new Vector2(GAME_LAYER_X + user.data.gameOffsetX, 0));
      uiLayer.setOrders([]);
      uiLayer.commit();
    }

    const controlsLayer = user.data.layers.get("controls");
    if (controlsLayer) {
      controlsLayer.setOrders([]);
      controlsLayer.commit();
      this.recordCommit(user, "controls-start");
    }

    this.resetRenderState(user);

    user.data.currentScene = "game";
    user.data.gameState = "countdown";
    user.data.gameOverTitle = null;
    user.data.countdownTicks = COUNTDOWN_TICKS;
  }

  /**
   * Elect a new authoritative user for a shared game. Returns null if no players remain.
   */
  private pickCoordinator(
    sharedGame: SharedGame,
  ): User<TermBombUserData> | null {
    // Deterministic: pick the smallest playerId to avoid relying on insertion order
    let bestUser: User<TermBombUserData> | null = null;
    let bestId = Number.POSITIVE_INFINITY;

    for (const [candidate, playerId] of sharedGame.players.entries()) {
      if (playerId < bestId) {
        bestId = playerId;
        bestUser = candidate;
      }
    }

    return bestUser;
  }

  private updateGame(user: User<TermBombUserData>): void {
    const { gameLogic, gameState, sharedGame } = user.data;

    // Ensure there is always at least one human; pick a coordinator user to run the tick
    if (sharedGame) {
      if (sharedGame.players.size === 0) {
        // Only bots would remain: tear down the game
        this.activeGames.delete(user.data.lobbyName);
        return;
      }
    }

    // Coordinator = first user in the map; only the coordinator runs logic
    const coordinator = sharedGame ? this.pickCoordinator(sharedGame) : null;
    const isCoordinator = !sharedGame || coordinator === user;

    // Handle restart (only coordinator runs the restart to avoid duplication)
    // Combine keyboard and touch inputs
    const restart = user.getButton("Restart");
    if (restart && !user.data.wasRestartPressed && isCoordinator) {
      this.startGame(user, gameLogic.players.length);
      user.data.wasRestartPressed = restart;
      return;
    }
    user.data.wasRestartPressed = restart;

    // Handle menu (leave game)
    const menu = user.getButton("Menu") || user.data.touchAction; // B button = Back/Menu
    if (menu && !user.data.wasMenuPressed) {
      // Remove from shared game
      if (sharedGame) {
        sharedGame.players.delete(user);

        // If coordinator leaves, just continue with remaining players
        if (sharedGame.players.size === 0) {
          this.activeGames.delete(user.data.lobbyName);
        }

        user.data.sharedGame = null;
      }
      // Switch display origin back to menu position
      this.moveDisplayTo(user, MENU_LAYER_X);
      user.data.currentScene = "mainMenu";
      user.data.menuSelectedOption = 0;
      user.data.wasMenuPressed = menu;
      return;
    }
    user.data.wasMenuPressed = menu;

    // Non-coordinators never mutate shared state: coordinator is authoritative
    if (sharedGame && !isCoordinator) {
      return;
    }

    // Handle countdown state
    if (gameState === "countdown") {
      // Only coordinator decrements the countdown in multiplayer
      if (isCoordinator) {
        user.data.countdownTicks--;

        // Sync countdown to all players in shared game
        if (sharedGame) {
          for (const [connectedUser, _] of sharedGame.players) {
            if (connectedUser !== user) {
              connectedUser.data.countdownTicks = user.data.countdownTicks;
            }
          }
        }

        // When countdown reaches 0, start playing
        if (user.data.countdownTicks <= 0) {
          user.data.gameState = "playing";
          // Set playing for all connected players
          if (sharedGame) {
            for (const [connectedUser, _] of sharedGame.players) {
              if (connectedUser !== user) {
                connectedUser.data.gameState = "playing";
              }
            }
          }
        }
      }
      return; // Don't process game logic during countdown
    }

    if (gameState !== "playing") return;

    // Update cooldown
    // Authoritative input processing: coordinator pulls inputs for every player
    if (sharedGame) {
      for (const [playerUser, playerId] of sharedGame.players.entries()) {
        this.handlePlayerInput(playerUser, playerId);
      }
    } else {
      this.handlePlayerInput(user, 0);
    }

    // Only coordinator runs game logic, AI, and tick
    if (isCoordinator) {
      // Simple AI for bot players (any slot that's a bot)
      for (let i = 0; i < gameLogic.players.length; i++) {
        // Skip human players in shared game
        if (sharedGame) {
          let isHumanSlot = false;
          for (const [_u, slotIdx] of sharedGame.players) {
            if (slotIdx === i) {
              isHumanSlot = true;
              break;
            }
          }
          if (isHumanSlot) continue;
        } else {
          // Solo mode: player 0 is human, rest are AI
          if (i === 0) continue;
        }
        BotAI.run(user, i);
      }

      // Update game logic - returns number of bombs that exploded
      const bombsExploded = gameLogic.tick();

      // Vibrate all players when bombs explode
      if (bombsExploded > 0) {
        // Vibrate this user (mobile) and rumble gamepad if available
        const rumble = (target: User<TermBombUserData>) => {
          target.vibrate([30]); // Light pulse on mobile/touch

          const vibrateGamepad = (target as any).vibrateGamepad;
          if (typeof vibrateGamepad === "function") {
            // Short dual-motor rumble; keep it brief to avoid spam
            vibrateGamepad.call(target, 0, {
              duration: 120,
              strongMagnitude: 0.55,
              weakMagnitude: 0.35,
            });
          }
        };

        const explosions = Array.from(gameLogic.gameMap.explosions.values());
        let centerX = MAP_SIZE / 2;
        let centerY = MAP_SIZE / 2;
        if (explosions.length > 0) {
          const sum = explosions.reduce(
            (acc, e) => {
              acc.x += e.x;
              acc.y += e.y;
              return acc;
            },
            { x: 0, y: 0 },
          );
          centerX = sum.x / explosions.length;
          centerY = sum.y / explosions.length;
        }

        const playExplosion = (target: User<TermBombUserData>) => {
          target.playSound("explosion", {
            volume: 0.5,
            x: centerX,
            y: centerY,
          });
        };

        rumble(user);
        playExplosion(user);

        // Also vibrate all other players in shared game
        if (sharedGame) {
          for (const [connectedUser, _] of sharedGame.players) {
            if (connectedUser !== user) {
              rumble(connectedUser);
              playExplosion(connectedUser);
            }
          }
        }
      }

      // Check game over
      const humanPlayerIds = sharedGame
        ? Array.from(sharedGame.players.values())
        : [0];
      const anyHumanAlive = humanPlayerIds.some((pid) => {
        const player = gameLogic.players[pid];
        return player?.alive;
      });

      // Solo or host-alone: stop immediately when the only human dies
      const onlyOneHuman = !sharedGame || sharedGame.players.size === 1;
      if (onlyOneHuman && !anyHumanAlive) {
        this.finishGame(user, sharedGame);
        return;
      }

      if (gameLogic.isGameOver()) {
        this.finishGame(user, sharedGame);
      }
    }
  }

  private finishGame(
    coordinatorUser: User<TermBombUserData>,
    sharedGame: SharedGame | null,
    titleOverride?: string,
  ): void {
    const setGameOver = (target: User<TermBombUserData>) => {
      target.data.gameState = "gameover";
      target.data.gameOverAnimationTick = target.data.animationTick;
      target.data.gameOverTitle = titleOverride ?? null;
    };

    setGameOver(coordinatorUser);

    if (sharedGame) {
      for (const [connectedUser] of sharedGame.players) {
        if (connectedUser !== coordinatorUser) {
          setGameOver(connectedUser);
        }
      }
    }
  }

  private handlePlayerInput(
    user: User<TermBombUserData>,
    playerId: number,
  ): void {
    const { gameLogic } = user.data;
    const player = gameLogic.players[playerId];
    const prevInventory = player ? player.bombInventory : 0;

    // Cooldown per user/player
    if (user.data.moveCooldown > 0) {
      user.data.moveCooldown--;
    }

    // Combine keyboard and touch inputs
    const up = user.getButton("Up") || user.data.touchUp || user.data.axisUp;
    const down =
      user.getButton("Down") || user.data.touchDown || user.data.axisDown;
    const left =
      user.getButton("Left") || user.data.touchLeft || user.data.axisLeft;
    const right =
      user.getButton("Right") || user.data.touchRight || user.data.axisRight;
    const bomb = user.getButton("Bomb") || user.data.touchBomb;

    // Movement with cooldown
    if (user.data.moveCooldown === 0) {
      if (up) {
        if (gameLogic.movePlayer(playerId, Direction.North)) {
          user.data.moveCooldown = MOVE_COOLDOWN;
        }
      } else if (down) {
        if (gameLogic.movePlayer(playerId, Direction.South)) {
          user.data.moveCooldown = MOVE_COOLDOWN;
        }
      } else if (left) {
        if (gameLogic.movePlayer(playerId, Direction.West)) {
          user.data.moveCooldown = MOVE_COOLDOWN;
        }
      } else if (right) {
        if (gameLogic.movePlayer(playerId, Direction.East)) {
          user.data.moveCooldown = MOVE_COOLDOWN;
        }
      }
    }

    // If player collected a bomb powerup this tick, play collect SFX at player position (only for this user)
    const updatedPlayer = gameLogic.players[playerId];
    if (
      updatedPlayer &&
      updatedPlayer.bombInventory > prevInventory &&
      updatedPlayer.alive
    ) {
      user.playSound("collect", {
        volume: 0.85,
        x: updatedPlayer.x,
        y: updatedPlayer.y,
      });
    }

    // Place bomb (edge detection)
    if (bomb && !user.data.wasBombPressed) {
      gameLogic.placeBomb(playerId);
    }
    user.data.wasBombPressed = bomb;
  }
}
