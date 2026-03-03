type SceneHandler<TUser> = (user: TUser, sceneBefore: string) => void;

/**
 * Minimal scene router to avoid long switch statements.
 */
export class SceneRouter<TUser = any> {
  private handlers = new Map<string, SceneHandler<TUser>>();

  register(scene: string, handler: SceneHandler<TUser>): void {
    this.handlers.set(scene, handler);
  }

  run(scene: string, user: TUser, sceneBefore: string): void {
    const handler = this.handlers.get(scene);
    if (handler) {
      handler(user, sceneBefore);
    }
  }
}
