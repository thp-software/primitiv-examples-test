import type { User } from "@primitiv/engine";
import type { TermBombUserData } from "../apps/TermBomb";

export class AudioManager {
  /**
   * Unlock audio on first user interaction (helps autoplay restrictions).
   */
  static unlockOnFirstInput(
    user: User<TermBombUserData>,
    anyInput: boolean,
  ): void {
    if (user.data.audioUnlocked) return;
    if (!anyInput) return;
    user.data.audioUnlocked = true;
  }

  /**
   * Handle menu/game background music switches.
   */
  static handleBackgroundMusic(
    user: User<TermBombUserData>,
    inGamePlaying: boolean,
  ): void {
    if (inGamePlaying) {
      if (user.data.bgMusicMenuId !== null) {
        user.fadeOutSound(user.data.bgMusicMenuId, 0.6);
        user.data.bgMusicMenuId = null;
      }
      user.data.menuMusicAttempted = false;

      if (!user.data.gameMusicAttempted) {
        const id = user.playSound("bg_music", { loop: true, volume: 0.3 });
        user.data.bgMusicId = id ?? null;
        user.data.gameMusicAttempted = true;
      }
    } else {
      if (user.data.bgMusicId !== null) {
        user.fadeOutSound(user.data.bgMusicId, 0.6);
        user.data.bgMusicId = null;
      }
      user.data.gameMusicAttempted = false;

      if (!user.data.menuMusicAttempted && user.data.audioReady) {
        const id = user.playSound("bg_music_menu", { loop: true, volume: 0.3 });
        user.data.bgMusicMenuId = id ?? null;
        user.data.menuMusicAttempted = true;
      }
    }
  }
}
