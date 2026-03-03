/**
 * MenuController - handles main menu, server list, and lobby flows for Bomberman.
 */
import type { User } from "@primitiv/engine";
import { OrderBuilder } from "@primitiv/engine";
import { C } from "../rendering/Appearance";
import { UIRenderer } from "../rendering/UIRenderer";
import { LobbyNameGenerator } from "../utils/LobbyNameGenerator";
import type {
  TermBombUserData,
  LobbySlot,
  SharedLobby,
} from "../apps/TermBomb";

export interface MenuSceneDeps {
  activeLobbies: Map<string, SharedLobby>;
  moveDisplayTo: (user: User<TermBombUserData>, x: number) => void;
  resetMenuRenderState: (user: User<TermBombUserData>) => void;
  startGame: (user: User<TermBombUserData>, playerCount: number) => void;
  startGameFromLobby: (user: User<TermBombUserData>) => void;
  startGameForUser: (
    user: User<TermBombUserData>,
    slots: LobbySlot[],
    lobbyName: string,
  ) => void;
  recordCommit: (user: User<TermBombUserData>, label: string) => void;
  menuLayerX: number;
  serverListLayerX: number;
  lobbyLayerX: number;
  gameWidth: number;
  gameHeight: number;
}

export class MenuController {
  deps: MenuSceneDeps;
  constructor(deps: MenuSceneDeps) {
    this.deps = deps;
  }

  updateMainMenu(user: User<TermBombUserData>): void {
    const up = user.getButton("Up") || user.data.touchUp || user.data.axisUp;
    const down =
      user.getButton("Down") || user.data.touchDown || user.data.axisDown;
    const enter = user.getButton("Enter") || user.data.touchBomb;

    if (up && !user.data.wasMovingUp) {
      user.data.menuSelectedOption = Math.max(
        0,
        user.data.menuSelectedOption - 1,
      );
      user.data.renderState.menuKey = null;
    }
    if (down && !user.data.wasMovingDown) {
      user.data.menuSelectedOption = Math.min(
        2,
        user.data.menuSelectedOption + 1,
      );
      user.data.renderState.menuKey = null;
    }

    if (enter && !user.data.wasEnterPressed) {
      const modes: ("solo" | "host" | "join")[] = ["solo", "host", "join"];
      user.data.menuMode = modes[user.data.menuSelectedOption];

      if (user.data.menuMode === "solo") {
        this.deps.startGame(user, 4);
      } else if (user.data.menuMode === "host") {
        this.startHostLobby(user);
      } else if (user.data.menuMode === "join") {
        this.openServerList(user);
      }
    }

    user.data.wasMovingUp = up;
    user.data.wasMovingDown = down;
    user.data.wasEnterPressed = enter;
  }

  renderMainMenu(user: User<TermBombUserData>): void {
    const menuLayer = user.data.layers.get("menu");
    if (!menuLayer) return;

    const menuBgLayer = user.data.layers.get("menuBg");
    if (!menuBgLayer) return;

    // Render background + logo only once (or when forced)
    const bgKey = `main-bg`;
    if (user.data.renderState.menuBgKey !== bgKey) {
      const bgOrders: any[] = [];

      bgOrders.push(
        OrderBuilder.rect(
          0,
          0,
          this.deps.gameWidth,
          this.deps.gameHeight,
          " ",
          C.BLACK,
          C.BLACK,
          true,
        ),
      );

      // Pass a fixed selection so we render only the logo portion.
      // The options are rendered separately on the top menu layer.
      bgOrders.push(
        ...UIRenderer.renderMainMenuNew(
          Math.floor(this.deps.gameWidth / 2),
          Math.floor(this.deps.gameHeight / 2),
          -1,
        ),
      );

      menuBgLayer.setOrders(bgOrders);
      menuBgLayer.commit();
      this.deps.recordCommit(user, "menu-bg");
      user.data.renderState.menuBgKey = bgKey;
    }

    // Render only the menu items keyed by selection
    const itemsKey = `main-items:${user.data.menuSelectedOption}`;
    if (user.data.renderState.menuItemsKey === itemsKey) return;

    const itemOrders: any[] = [];
    itemOrders.push(
      ...UIRenderer.renderMainMenuOptions(
        Math.floor(this.deps.gameWidth / 2),
        user.data.menuSelectedOption,
      ),
    );

    menuLayer.setOrders(itemOrders);
    menuLayer.commit();
    this.deps.recordCommit(user, "menu-items");
    user.data.renderState.menuItemsKey = itemsKey;
  }

  openServerList(user: User<TermBombUserData>): void {
    user.data.availableServers = [];
    for (const [name, lobby] of this.deps.activeLobbies) {
      if (!lobby.inGame) {
        const playerCount = lobby.slots.filter(
          (s) => s.type === "player" || s.type === "bot",
        ).length;
        user.data.availableServers.push({ name, playerCount });
      }
    }
    user.data.serverListSelectedIndex = 0;

    this.deps.resetMenuRenderState(user);
    this.deps.moveDisplayTo(user, this.deps.serverListLayerX);
    user.data.currentScene = "serverList";
  }

  updateServerList(user: User<TermBombUserData>): void {
    const up = user.getButton("Up") || user.data.touchUp || user.data.axisUp;
    const down =
      user.getButton("Down") || user.data.touchDown || user.data.axisDown;
    const enter = user.getButton("Enter") || user.data.touchBomb;
    const menu = user.getButton("Menu") || user.data.touchAction;

    if (menu && !user.data.wasMenuPressed) {
      this.deps.resetMenuRenderState(user);
      this.deps.moveDisplayTo(user, this.deps.menuLayerX);
      user.data.currentScene = "mainMenu";
      user.data.renderState.menuKey = null;
      user.data.wasMenuPressed = menu;
      return;
    }
    user.data.wasMenuPressed = menu;

    if (up && !user.data.wasMovingUp && user.data.availableServers.length > 0) {
      user.data.serverListSelectedIndex = Math.max(
        0,
        user.data.serverListSelectedIndex - 1,
      );
      user.data.renderState.serverListKey = null;
    }
    if (
      down &&
      !user.data.wasMovingDown &&
      user.data.availableServers.length > 0
    ) {
      user.data.serverListSelectedIndex = Math.min(
        user.data.availableServers.length - 1,
        user.data.serverListSelectedIndex + 1,
      );
      user.data.renderState.serverListKey = null;
    }

    if (
      enter &&
      !user.data.wasEnterPressed &&
      user.data.availableServers.length > 0
    ) {
      const selectedServer =
        user.data.availableServers[user.data.serverListSelectedIndex];
      this.joinLobby(user, selectedServer.name);
    }

    user.data.wasMovingUp = up;
    user.data.wasMovingDown = down;
    user.data.wasEnterPressed = enter;
  }

  renderServerList(user: User<TermBombUserData>): void {
    const serverListLayer = user.data.layers.get("serverList");
    if (!serverListLayer) return;

    const listKey = user.data.availableServers
      .map((s) => `${s.name}:${s.playerCount}`)
      .join("|");
    const key = `srv:${listKey}|sel:${user.data.serverListSelectedIndex}`;
    if (user.data.renderState.serverListKey === key) return;

    const orders: any[] = [];

    orders.push(
      OrderBuilder.rect(
        0,
        0,
        this.deps.gameWidth,
        this.deps.gameHeight,
        " ",
        C.BLACK,
        C.BLACK,
        true,
      ),
    );

    orders.push(
      ...UIRenderer.renderServerList(
        Math.floor(this.deps.gameWidth / 2),
        user.data.availableServers,
        user.data.serverListSelectedIndex,
      ),
    );

    serverListLayer.setOrders(orders);
    serverListLayer.commit();
    this.deps.recordCommit(user, "serverList");
    user.data.renderState.serverListKey = key;
  }

  private joinLobby(user: User<TermBombUserData>, lobbyName: string): void {
    const lobby = this.deps.activeLobbies.get(lobbyName);
    if (!lobby) {
      return;
    }

    let slotIndex = -1;
    for (let i = 1; i < lobby.slots.length; i++) {
      if (lobby.slots[i].type === "empty") {
        slotIndex = i;
        break;
      }
    }

    if (slotIndex === -1) {
      return;
    }

    lobby.slots[slotIndex] = {
      type: "player",
      name: `Player ${slotIndex + 1}`,
      ready: true,
      isHost: false,
    };
    lobby.connectedUsers.set(user, slotIndex);

    user.data.lobbyName = lobbyName;
    user.data.lobbyIsHost = false;
    user.data.lobbySelectedSlot = 0;
    user.data.lobbySlots = lobby.slots;

    this.deps.resetMenuRenderState(user);
    this.deps.moveDisplayTo(user, this.deps.lobbyLayerX);
    user.data.currentScene = "lobby";
    user.data.renderState.lobbyKey = null;
  }

  private startHostLobby(user: User<TermBombUserData>): void {
    user.data.lobbyName = LobbyNameGenerator.generate();
    user.data.lobbyIsHost = true;
    user.data.lobbySelectedSlot = 0;

    user.data.lobbySlots = [
      { type: "player", name: "Host", ready: true, isHost: true },
      { type: "empty", name: "", ready: false, isHost: false },
      { type: "empty", name: "", ready: false, isHost: false },
      { type: "empty", name: "", ready: false, isHost: false },
    ];

    this.deps.activeLobbies.set(user.data.lobbyName, {
      name: user.data.lobbyName,
      hostUser: user,
      slots: user.data.lobbySlots,
      inGame: false,
      connectedUsers: new Map(),
    });

    this.deps.resetMenuRenderState(user);
    this.deps.moveDisplayTo(user, this.deps.lobbyLayerX);
    user.data.currentScene = "lobby";
    user.data.renderState.lobbyKey = null;
  }

  updateLobby(user: User<TermBombUserData>): void {
    const enter = user.getButton("Enter") || user.data.touchBomb;
    const menu = user.getButton("Menu") || user.data.touchAction;

    const lobby = this.deps.activeLobbies.get(user.data.lobbyName);

    if (menu && !user.data.wasMenuPressed) {
      if (user.data.lobbyIsHost) {
        if (lobby) {
          for (const [connectedUser] of lobby.connectedUsers) {
            this.deps.moveDisplayTo(connectedUser, this.deps.menuLayerX);
            connectedUser.data.currentScene = "mainMenu";
          }
          this.deps.activeLobbies.delete(user.data.lobbyName);
        }
      } else {
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
        }
      }
      this.deps.resetMenuRenderState(user);
      this.deps.moveDisplayTo(user, this.deps.menuLayerX);
      user.data.currentScene = "mainMenu";
      user.data.wasMenuPressed = menu;
      return;
    }
    user.data.wasMenuPressed = menu;

    if (enter && !user.data.wasEnterPressed && user.data.lobbyIsHost) {
      if (lobby) {
        for (let i = 0; i < user.data.lobbySlots.length; i++) {
          const slot = user.data.lobbySlots[i];
          if (slot.type === "empty") {
            slot.type = "bot";
            slot.name = `Bot ${i}`;
            slot.ready = true;
          }
        }
        lobby.inGame = true;
      }

      this.deps.startGameFromLobby(user);

      if (lobby) {
        for (const [connectedUser, _slotIndex] of lobby.connectedUsers) {
          this.deps.startGameForUser(
            connectedUser,
            user.data.lobbySlots,
            user.data.lobbyName,
          );
        }
      }
    }

    user.data.wasEnterPressed = enter;
  }

  renderLobby(user: User<TermBombUserData>): void {
    const lobbyLayer = user.data.layers.get("lobby");
    if (!lobbyLayer) return;

    const slotsKey = user.data.lobbySlots
      .map((s) => `${s.type}:${s.name}:${s.ready ? 1 : 0}:${s.isHost ? 1 : 0}`)
      .join("|");
    const key = `lob:${user.data.lobbyName}|sel:${
      user.data.lobbySelectedSlot
    }|host:${user.data.lobbyIsHost ? 1 : 0}|${slotsKey}`;
    if (user.data.renderState.lobbyKey === key) return;

    const orders: any[] = [];

    orders.push(
      OrderBuilder.rect(
        0,
        0,
        this.deps.gameWidth,
        this.deps.gameHeight,
        " ",
        C.BLACK,
        C.BLACK,
        true,
      ),
    );

    orders.push(
      ...UIRenderer.renderLobby(
        Math.floor(this.deps.gameWidth / 2),
        user.data.lobbyName,
        user.data.lobbySlots,
        user.data.lobbySelectedSlot,
        user.data.lobbyIsHost,
      ),
    );

    lobbyLayer.setOrders(orders);
    lobbyLayer.commit();
    this.deps.recordCommit(user, "lobby");
    user.data.renderState.lobbyKey = key;
  }
}
