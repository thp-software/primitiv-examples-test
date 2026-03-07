/**
 * Name: audio
 * Description: Complete audio system demonstration: playback, effects, and spatial sound.
 *
 * Why study this:
 *   Primitiv provides a full audio pipeline running on the client's Web Audio API,
 *   but controlled entirely from the server (or standalone) side. This means your
 *   game logic decides WHAT to play, and the engine handles HOW to deliver it.
 *
 * Audio Lifecycle:
 *   1. `engine.loadSound(name, url)` - Register a sound during `init()`.
 *      Returns a numeric soundId. The URL is relative to the public folder.
 *   2. `user.sendSounds()` - Call once in `initUser()` to push the sound registry
 *      to the client. Without this, the client has no sounds to play.
 *   3. `user.playSound(soundId, options)` - Trigger playback. Returns an instanceId
 *      for later manipulation. Options: volume, pitch, loop, fadeIn, x, y,
 *      lowpass, highpass, reverb.
 *   4. `user.setSoundEffects(instanceId, ...)` - Modify running sound in real-time.
 *   5. `user.stopSound(instanceId)` / `user.fadeOutSound(instanceId, duration)`.
 *   6. `user.pauseSound()` / `user.resumeSound()`.
 *
 * Spatial Audio:
 *   Sounds can be positioned in 2D space using `x` and `y` in `playSound()`.
 *   The listener position is set via `user.setListenerPosition(x, y)`.
 *   Configure the spatial model with `user.configureSpatialAudio({ maxDistance, ... })`.
 *   Moving the listener or the source changes volume and panning automatically.
 *
 * Audio Effects (Real-time):
 *   - Lowpass: Cuts high frequencies. Range ~20-20000 Hz. Use for muffled/underwater.
 *   - Highpass: Cuts low frequencies. Range ~20-10000 Hz. Use for tinny/radio.
 *   - Reverb: Wet/dry mix 0.0-1.0. Simulates room reflections.
 *   - Pitch: Playback rate multiplier. 1.0 = normal, 0.5 = octave down, 2.0 = octave up.
 *   - Volume: Gain multiplier. 0.0 = silent, 1.0 = normal, 2.0 = boosted.
 *
 * What this example demonstrates:
 *   - A looping ambient sound (rain) with interactive play/stop/fade-out controls.
 *   - Real-time manipulation of five audio effects on a running sound instance:
 *     lowpass filter, highpass filter, reverb wet/dry, pitch multiplier, and volume.
 *   - 2D spatial audio: a movable listener whose position automatically adjusts
 *     volume and panning of spatially positioned sounds.
 *   - One-shot sounds (click, thunder) played on demand with independent instances.
 *
 * Key Concepts:
 *   - `engine.loadSound(name, url)` - register a sound asset during `init()`; returns a numeric soundId.
 *   - `user.sendSounds()` - push the sound registry to the client once in `initUser()`.
 *   - `user.playSound(soundId, { volume, pitch, loop, fadeIn, x, y, lowpass, highpass, reverb })` - trigger playback; returns an instanceId.
 *   - `user.setSoundEffects(instanceId, { volume, pitch, lowpass, highpass, reverb })` - modify a running sound in real-time.
 *   - `user.stopSound(instanceId)` / `user.fadeOutSound(instanceId, duration)` - stop playback immediately or with a fade.
 *   - `user.pauseSound(instanceId)` / `user.resumeSound(instanceId)` - pause and resume.
 *   - `user.setListenerPosition(x, y)` - move the spatial audio listener.
 *   - `user.configureSpatialAudio({ maxDistance, ... })` - tune the spatial attenuation model.
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

// Sound IDs (set during init)
let rainSoundId: number | undefined;
let clickSoundId: number | undefined;
let thunderSoundId: number | undefined;

interface AudioUserData {
  staticLayer: Layer;
  dynamicLayer: Layer;

  // Playback state
  rainInstanceId: number | undefined;
  isRainPlaying: boolean;

  // Listener position (for spatial audio)
  listenerX: number;
  listenerY: number;

  // Real-time effect parameters
  lowpass: number;
  highpass: number;
  reverb: number;
  pitch: number;
  volume: number;
}

export class AudioShowcase implements IApplication<
  Engine,
  User<AudioUserData>
> {
  async init(_runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 10, g: 10, b: 20, a: 255 }, // Dark BG
      { colorId: 1, r: 80, g: 200, b: 120, a: 255 }, // Green
      { colorId: 2, r: 250, g: 80, b: 80, a: 255 }, // Red
      { colorId: 3, r: 200, g: 200, b: 250, a: 255 }, // White
      { colorId: 4, r: 100, g: 100, b: 150, a: 255 }, // Gray
      { colorId: 5, r: 255, g: 200, b: 80, a: 255 }, // Yellow
      { colorId: 6, r: 80, g: 150, b: 255, a: 255 }, // Blue
      { colorId: 7, r: 200, g: 100, b: 255, a: 255 }, // Purple
    ]);

    // Resource loading
    const ra = new URL("./rain.mp3", import.meta.url).href;
    const ta = new URL("./thunder.mp3", import.meta.url).href;
    const ca = new URL("./click.mp3", import.meta.url).href;

    rainSoundId = await engine.loadSound("rain", ra);
    thunderSoundId = await engine.loadSound("thunder", ta);
    clickSoundId = await engine.loadSound("click", ca);

    _runtime.setTickRate(60);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<AudioUserData>,
  ): void {
    const width = 80;
    const height = 40;

    user.data.rainInstanceId = undefined;
    user.data.isRainPlaying = false;
    user.data.listenerX = 40;
    user.data.listenerY = 30;
    user.data.lowpass = 20000;
    user.data.highpass = 0;
    user.data.reverb = 0;
    user.data.pitch = 1.0;
    user.data.volume = 0.5;

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
      OrderBuilder.text(2, 1, "--- PRIMITIV AUDIO SHOWCASE ---", 3, 0),
      // Playback section
      OrderBuilder.text(2, 3, "PLAYBACK:", 3, 0),
      OrderBuilder.text(2, 4, "[Space]", 4, 0),
      OrderBuilder.text(10, 4, "Rain Loop:", 4, 0),
      OrderBuilder.text(2, 5, "[C]", 4, 0),
      OrderBuilder.text(10, 5, "Click (one-shot, random pitch)", 4, 0),
      OrderBuilder.text(2, 6, "[V]", 4, 0),
      OrderBuilder.text(10, 6, "Thunder (spatial, left side)", 4, 0),
      // Effects section
      OrderBuilder.text(2, 9, "EFFECTS (on rain loop):", 3, 0),
      OrderBuilder.text(
        2,
        10,
        "Hold number to increase, letter to decrease",
        4,
        0,
      ),
      OrderBuilder.text(2, 12, "[1/Q] Lowpass:", 4, 0),
      OrderBuilder.text(2, 13, "[2/W] Highpass:", 4, 0),
      OrderBuilder.text(2, 14, "[3/E] Reverb:", 4, 0),
      OrderBuilder.text(2, 15, "[4/R] Pitch:", 4, 0),
      OrderBuilder.text(2, 16, "[5/T] Volume:", 4, 0),
      // Spatial section
      OrderBuilder.text(2, 19, "2D SPATIAL AUDIO:", 3, 0),
      OrderBuilder.text(2, 20, "Move listener with Arrow Keys", 4, 0),
      // Controls summary
      OrderBuilder.text(
        40,
        38,
        "Space=Rain  C=Click  V=Thunder  Arrows=Move",
        4,
        0,
      ),
    );
    staticLayer.setOrders(staticOrders);


    const registry = user.getInputBindingRegistry();

    // Toggle rain loop
    registry.defineButton(0, "TOGGLE_RAIN", [
      { sourceId: 0, type: InputDeviceType.Keyboard, key: KeyboardInput.Space },
    ]);

    // One-shot: click sound
    registry.defineButton(1, "PLAY_CLICK", [
      { sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyC },
    ]);

    // One-shot: thunder sound
    registry.defineButton(2, "PLAY_THUNDER", [
      { sourceId: 2, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyV },
    ]);

    // Effect controls
    registry.defineButton(3, "LP_UP", [
      {
        sourceId: 3,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit1,
      },
    ]);
    registry.defineButton(4, "LP_DOWN", [
      { sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyQ },
    ]);
    registry.defineButton(5, "HP_UP", [
      {
        sourceId: 5,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit2,
      },
    ]);
    registry.defineButton(6, "HP_DOWN", [
      { sourceId: 6, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyW },
    ]);
    registry.defineButton(7, "REV_UP", [
      {
        sourceId: 7,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit3,
      },
    ]);
    registry.defineButton(8, "REV_DOWN", [
      { sourceId: 8, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyE },
    ]);
    registry.defineButton(9, "PITCH_UP", [
      {
        sourceId: 9,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit4,
      },
    ]);
    registry.defineButton(10, "PITCH_DOWN", [
      { sourceId: 10, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyR },
    ]);
    registry.defineButton(11, "VOL_UP", [
      {
        sourceId: 11,
        type: InputDeviceType.Keyboard,
        key: KeyboardInput.Digit5,
      },
    ]);
    registry.defineButton(12, "VOL_DOWN", [
      { sourceId: 12, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyT },
    ]);

    // Listener movement (Arrow keys)
    registry.defineAxis(0, "LISTEN_X", [
      {
        sourceId: 13,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowLeft,
        positiveKey: KeyboardInput.ArrowRight,
      },
    ]);
    registry.defineAxis(1, "LISTEN_Y", [
      {
        sourceId: 14,
        type: InputDeviceType.Keyboard,
        negativeKey: KeyboardInput.ArrowUp,
        positiveKey: KeyboardInput.ArrowDown,
      },
    ]);

    /**
     * SEND SOUNDS TO CLIENT
     * This MUST be called in initUser(). It tells the client runtime to
     * download all registered sounds from the URLs provided in init().
     */
    user.sendSounds();

    /**
     * CONFIGURE SPATIAL AUDIO
     * Set up the distance model for 2D sound positioning.
     */
    user.configureSpatialAudio({
      maxDistance: 80,
      referenceDistance: 10,
      rolloffFactor: 1,
    });

    user.setListenerPosition(user.data.listenerX, user.data.listenerY);
  }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<AudioUserData>,
  ): void {
    const data = user.data;
    const o: any[] = [];

    // =====================================================================
    // PLAYBACK CONTROLS - Dynamic state
    // =====================================================================

    // Toggle rain (loop)
    if (user.isJustPressed("TOGGLE_RAIN")) {
      if (data.isRainPlaying && data.rainInstanceId !== undefined) {
        user.fadeOutSound(data.rainInstanceId, 1.0);
        data.isRainPlaying = false;
        data.rainInstanceId = undefined;
      } else {
        data.rainInstanceId = user.playSound(rainSoundId!, {
          volume: data.volume,
          loop: true,
          fadeIn: 1.0,
          x: 60, // Rain source is at right side
          y: 25,
          lowpass: data.lowpass,
          highpass: data.highpass,
          reverb: data.reverb,
          pitch: data.pitch,
        });
        data.isRainPlaying = true;
      }
    }

    o.push(
      OrderBuilder.text(
        21,
        4,
        data.isRainPlaying ? "PLAYING" : "STOPPED",
        data.isRainPlaying ? 1 : 2,
        0,
      ),
    );

    // One-shot: Click
    if (user.isJustPressed("PLAY_CLICK")) {
      user.playSound(clickSoundId!, {
        volume: 1.0,
        pitch: 0.8 + Math.random() * 0.4, // Slight random pitch variation
      });
    }

    // One-shot: Thunder (spatial, positioned far left)
    if (user.isJustPressed("PLAY_THUNDER")) {
      user.playSound(thunderSoundId!, {
        volume: 0.7,
        x: 5, // Thunder far left
        y: 30,
        reverb: 0.8,
      });
    }

    // =====================================================================
    // REAL-TIME EFFECTS (applied to running rain loop)
    // =====================================================================
    let effectsChanged = false;

    // Lowpass
    if (user.getButton("LP_UP")) {
      data.lowpass = Math.min(20000, data.lowpass * 1.05);
      effectsChanged = true;
    }
    if (user.getButton("LP_DOWN")) {
      data.lowpass = Math.max(20, data.lowpass * 0.95);
      effectsChanged = true;
    }

    // Highpass
    if (user.getButton("HP_UP")) {
      data.highpass = Math.min(10000, data.highpass + 100);
      effectsChanged = true;
    }
    if (user.getButton("HP_DOWN")) {
      data.highpass = Math.max(0, data.highpass - 100);
      effectsChanged = true;
    }

    // Reverb
    if (user.getButton("REV_UP")) {
      data.reverb = Math.min(1.0, data.reverb + 0.02);
      effectsChanged = true;
    }
    if (user.getButton("REV_DOWN")) {
      data.reverb = Math.max(0, data.reverb - 0.02);
      effectsChanged = true;
    }

    // Pitch
    if (user.getButton("PITCH_UP")) {
      data.pitch = Math.min(4.0, data.pitch + 0.01);
      effectsChanged = true;
    }
    if (user.getButton("PITCH_DOWN")) {
      data.pitch = Math.max(0.1, data.pitch - 0.01);
      effectsChanged = true;
    }

    // Volume
    if (user.getButton("VOL_UP")) {
      data.volume = Math.min(2.0, data.volume + 0.01);
      effectsChanged = true;
    }
    if (user.getButton("VOL_DOWN")) {
      data.volume = Math.max(0, data.volume - 0.01);
      effectsChanged = true;
    }

    // Apply effects to running rain loop
    if (effectsChanged && data.rainInstanceId !== undefined) {
      user.setSoundEffects(data.rainInstanceId, {
        lowpass: data.lowpass,
        highpass: data.highpass,
        reverb: data.reverb,
        pitch: data.pitch,
        volume: data.volume,
      });
    }

    // Effect values - dynamic content only
    const effY = 12;
    const col2 = 24;

    o.push(
      OrderBuilder.text(
        col2,
        effY,
        `${Math.round(data.lowpass)} Hz`.padEnd(12, " "),
        data.lowpass < 20000 ? 5 : 4,
        0,
      ),
    );

    o.push(
      OrderBuilder.text(
        col2,
        effY + 1,
        `${Math.round(data.highpass)} Hz`.padEnd(12, " "),
        data.highpass > 0 ? 5 : 4,
        0,
      ),
    );

    o.push(
      OrderBuilder.text(
        col2,
        effY + 2,
        `${(data.reverb * 100).toFixed(0)}%`.padEnd(8, " "),
        data.reverb > 0 ? 7 : 4,
        0,
      ),
    );

    o.push(
      OrderBuilder.text(
        col2,
        effY + 3,
        `${data.pitch.toFixed(2)}x`.padEnd(8, " "),
        data.pitch !== 1.0 ? 6 : 4,
        0,
      ),
    );

    o.push(
      OrderBuilder.text(
        col2,
        effY + 4,
        `${(data.volume * 100).toFixed(0)}%`.padEnd(8, " "),
        4,
        0,
      ),
    );

    // Visual lowpass bar
    const lpNorm = Math.log(data.lowpass / 20) / Math.log(20000 / 20); // log scale 0..1
    const lpLen = Math.floor(lpNorm * 30);
    o.push(OrderBuilder.rect(col2 + 12, effY, 30, 1, "-", 4, 0, true));
    if (lpLen > 0)
      o.push(OrderBuilder.rect(col2 + 12, effY, lpLen, 1, "=", 5, 0, true));

    // =====================================================================
    // SPATIAL AUDIO VISUALIZER
    // =====================================================================

    // Move listener
    const moveX = user.getAxis("LISTEN_X");
    const moveY = user.getAxis("LISTEN_Y");
    if (moveX !== 0 || moveY !== 0) {
      data.listenerX = Math.max(2, Math.min(77, data.listenerX + moveX * 0.5));
      data.listenerY = Math.max(23, Math.min(37, data.listenerY + moveY * 0.5));
      user.setListenerPosition(data.listenerX, data.listenerY);
    }

    // Draw spatial field
    o.push(OrderBuilder.rect(2, 22, 76, 16, ".", 4, 0, false));

    // Draw sound sources
    // Rain source (right side)
    o.push(OrderBuilder.char(60, 25, "R", data.isRainPlaying ? 6 : 4, 0));
    o.push(OrderBuilder.text(62, 25, "Rain", data.isRainPlaying ? 6 : 4, 0));

    // Thunder source (left side)
    o.push(OrderBuilder.char(5, 30, "T", 7, 0));
    o.push(OrderBuilder.text(7, 30, "Thunder", 7, 0));

    // Draw listener
    const lx = Math.floor(data.listenerX);
    const ly = Math.floor(data.listenerY);
    o.push(OrderBuilder.char(lx, ly, "@", 1, 0));
    o.push(OrderBuilder.text(lx + 2, ly, "Listener", 1, 0));

    // Listener coordinates
    o.push(
      OrderBuilder.text(
        2,
        38,
        `Listener: (${lx}, ${ly})`.padEnd(20, " "),
        4,
        0,
      ),
    );

    // Commit
    data.dynamicLayer.setOrders(o);

  }

  update(_runtime: IRuntime, _engine: Engine): void {}
}
