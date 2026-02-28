/**
 * Name: 16-motion-input
 * Category: tutorial
 * Description: Complete catalog of all Motion input types — Tilt, Accelerometer, Gyroscope, and Compass.
 *
 * What it demonstrates (engine perspective):
 *   This example is the definitive reference for the `InputDeviceType.Motion` system.
 *   It shows how to bind and read every available motion axis from a mobile device:
 *   accelerometers, gyroscopes, device orientation, and processed tilt values.
 *   Because these are standard Primitiv input axes, they work identically whether the
 *   application runs standalone or over a network — the client captures raw sensor data
 *   and forwards it as part of the normal input frame.
 *
 * How it works:
 *   The application displays four "pages" (switchable with keys [1]–[4] or by tapping
 *   the tab buttons at the top) that each demonstrate one family of motion sensors:
 *
 *   Page 1 — TILT (Processed):
 *     MotionInput.TiltX, MotionInput.TiltY
 *     Pre-processed by the client into a smooth -1..+1 range, ideal for character/ball
 *     movement. Supports `deadzone` and `invert` options.
 *
 *   Page 2 — ACCELEROMETER (Raw):
 *     MotionInput.AccelerometerX, AccelerometerY, AccelerometerZ
 *     Raw acceleration in m/s² including gravity. Useful for shake detection:
 *     compute magnitude = sqrt(x² + y² + z²), threshold around 20 for a violent shake.
 *
 *   Page 3 — GYROSCOPE (Angular velocity):
 *     MotionInput.GyroscopeAlpha, GyroscopeBeta, GyroscopeGamma
 *     Rotation rate in rad/s around Z (yaw), X (pitch), and Y (roll).
 *     Use `scale` to reduce sensitivity. Ideal for spaceship/camera rotation controls.
 *
 *   Page 4 — COMPASS / ORIENTATION (Absolute):
 *     MotionInput.OrientationAlpha, OrientationBeta, OrientationGamma
 *     Absolute device orientation. Alpha = 0-360° magnetic heading (compass),
 *     Beta = -180..180° front/back tilt, Gamma = -90..90° left/right tilt.
 *
 * Primitiv API used:
 *   - `registry.defineAxis(id, name, [{ sourceId, type: InputDeviceType.Motion, motionAxis: MotionInput.* }])`
 *   - `registry.defineTouchZone(id, name, x, y, w, h)` — touch zones for tab buttons
 *   - `registry.defineButton(id, name, [...])` — buttons mapped to both keys and touch zones
 *   - `user.getAxis(name)` — read the motion value
 *   - `user.getButton(name)` — read button state for page switching
 *   - Optional axis config: `deadzone`, `scale`, `invert`
 *   - On desktop, keyboard fallbacks are provided for testing without a phone.
 *
 * Key Concepts:
 *   - All motion inputs are mapped as standard Primitiv axes, queried with `user.getAxis()`.
 *   - The client captures DeviceMotionEvent / DeviceOrientationEvent and streams the
 *     values to the engine at the tick rate, just like any other input source.
 *   - Multiple sources (motion + keyboard) can be bound to the same logical axis.
 *   - `deadzone` ignores small values near center (anti-jitter).
 *   - `scale` multiplies the raw value (useful for gyroscope sensitivity).
 *   - `invert` flips the axis direction.
 *
 * Important:
 *   Primitiv cells are SQUARE (1:1 aspect ratio). When computing visual positions
 *   (circles, compass roses, etc.) treat X and Y identically — no aspect correction needed.
 *   All printable characters MUST be valid CP437 glyphs. Stick to standard ASCII
 *   (0x20-0x7E) and well-known block chars. Never use arbitrary Unicode.
 */

import {
    Engine,
    User,
    Layer,
    Display,
    OrderBuilder,
    Vector2,
    InputDeviceType,
    KeyboardInput,
    TouchZoneInput,
    MotionInput,
    type IApplication,
    type IRuntime,
} from "@primitiv/engine";

// ─── Per-user state ──────────────────────────────────────────────────────────
interface MotionData {
    layer: Layer;
    page: number;         // 0-3 = Tilt, Accel, Gyro, Compass
    prevPage: boolean[];  // edge-detect for page buttons

    // Tilt demo state
    ballX: number;
    ballY: number;

    // Accelerometer demo state
    shakeTimer: number;
    peakMagnitude: number;

    // Gyroscope demo state
    yaw: number;
    pitch: number;
    roll: number;
}

const W = 80;
const H = 45;
const PAGE_NAMES = ["TILT", "ACCEL", "GYRO", "COMPASS"];
const TAB_WIDTH = 16;

export class MotionInputShowcase implements IApplication<Engine, User<MotionData>> {

    // ─── Global init ─────────────────────────────────────────────────────
    async init(runtime: IRuntime, engine: Engine): Promise<void> {
        const palette = [
            { colorId: 0, r: 0, g: 0, b: 0 },       // Background
            { colorId: 1, r: 255, g: 255, b: 255 },   // White text
            { colorId: 2, r: 50, g: 255, b: 50 },     // Green (active / ball)
            { colorId: 3, r: 40, g: 40, b: 55 },      // Dark panel bg
            { colorId: 4, r: 100, g: 100, b: 120 },   // Muted text
            { colorId: 5, r: 255, g: 80, b: 80 },     // Red (shake alert)
            { colorId: 6, r: 80, g: 180, b: 255 },    // Blue (compass)
            { colorId: 7, r: 255, g: 200, b: 50 },    // Yellow (gyro)
            { colorId: 8, r: 50, g: 50, b: 70 },      // Crosshair
        ];
        engine.loadPaletteToSlot(0, palette);
        runtime.setTickRate(60);
    }

    // ─── Per-user init ───────────────────────────────────────────────────
    initUser(_runtime: IRuntime, _engine: Engine, user: User<MotionData>): void {
        const display = new Display(0, W, H);
        display.switchPalette(0);
        user.addDisplay(display);

        const layer = new Layer(new Vector2(0, 0), 0, W, H, { mustBeReliable: false });
        user.addLayer(layer);

        const reg = user.getInputBindingRegistry();

        // ── Touch zones for tab buttons at the top ───────────────────────
        // 4 zones side by side along the top row.
        reg.defineTouchZone(0, "tab0", 2, 0, TAB_WIDTH, 2);
        reg.defineTouchZone(1, "tab1", 2 + TAB_WIDTH, 0, TAB_WIDTH, 2);
        reg.defineTouchZone(2, "tab2", 2 + TAB_WIDTH * 2, 0, TAB_WIDTH, 2);
        reg.defineTouchZone(3, "tab3", 2 + TAB_WIDTH * 3, 0, TAB_WIDTH, 2);

        // ── Page switching buttons: keyboard [1]-[4] + touch zones ───────
        reg.defineButton(0, "PAGE_1", [
            { sourceId: 100, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit1 },
            { sourceId: 104, type: InputDeviceType.TouchZone, touchZoneId: TouchZoneInput.Zone0 },
        ]);
        reg.defineButton(1, "PAGE_2", [
            { sourceId: 101, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit2 },
            { sourceId: 105, type: InputDeviceType.TouchZone, touchZoneId: TouchZoneInput.Zone1 },
        ]);
        reg.defineButton(2, "PAGE_3", [
            { sourceId: 102, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit3 },
            { sourceId: 106, type: InputDeviceType.TouchZone, touchZoneId: TouchZoneInput.Zone2 },
        ]);
        reg.defineButton(3, "PAGE_4", [
            { sourceId: 103, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit4 },
            { sourceId: 107, type: InputDeviceType.TouchZone, touchZoneId: TouchZoneInput.Zone3 },
        ]);

        // ══════════════════════════════════════════════════════════════════
        // PAGE 1 — TILT (processed -1..+1)
        // ══════════════════════════════════════════════════════════════════
        reg.defineAxis(0, "TILT_X", [
            { sourceId: 0, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight },
            { sourceId: 1, type: InputDeviceType.Motion, motionAxis: MotionInput.TiltX, deadzone: 0.1 },
        ]);
        reg.defineAxis(1, "TILT_Y", [
            { sourceId: 2, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown },
            { sourceId: 3, type: InputDeviceType.Motion, motionAxis: MotionInput.TiltY, deadzone: 0.1, invert: true },
        ]);

        // ══════════════════════════════════════════════════════════════════
        // PAGE 2 — ACCELEROMETER (raw m/s²)
        // ══════════════════════════════════════════════════════════════════
        reg.defineAxis(2, "ACCEL_X", [
            { sourceId: 10, type: InputDeviceType.Motion, motionAxis: MotionInput.AccelerometerX },
        ]);
        reg.defineAxis(3, "ACCEL_Y", [
            { sourceId: 11, type: InputDeviceType.Motion, motionAxis: MotionInput.AccelerometerY },
        ]);
        reg.defineAxis(4, "ACCEL_Z", [
            { sourceId: 12, type: InputDeviceType.Motion, motionAxis: MotionInput.AccelerometerZ },
        ]);

        // ══════════════════════════════════════════════════════════════════
        // PAGE 3 — GYROSCOPE (angular velocity, rad/s)
        // ══════════════════════════════════════════════════════════════════
        reg.defineAxis(5, "GYRO_ALPHA", [
            { sourceId: 20, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.KeyQ, positiveKey: KeyboardInput.KeyE },
            { sourceId: 21, type: InputDeviceType.Motion, motionAxis: MotionInput.GyroscopeAlpha, scale: 0.1 },
        ]);
        reg.defineAxis(6, "GYRO_BETA", [
            { sourceId: 22, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown },
            { sourceId: 23, type: InputDeviceType.Motion, motionAxis: MotionInput.GyroscopeBeta, scale: 0.1 },
        ]);
        reg.defineAxis(7, "GYRO_GAMMA", [
            { sourceId: 24, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight },
            { sourceId: 25, type: InputDeviceType.Motion, motionAxis: MotionInput.GyroscopeGamma, scale: 0.1 },
        ]);

        // ══════════════════════════════════════════════════════════════════
        // PAGE 4 — COMPASS / ORIENTATION (absolute degrees)
        // ══════════════════════════════════════════════════════════════════
        reg.defineAxis(8, "ORIENT_ALPHA", [
            { sourceId: 30, type: InputDeviceType.Motion, motionAxis: MotionInput.OrientationAlpha },
        ]);
        reg.defineAxis(9, "ORIENT_BETA", [
            { sourceId: 31, type: InputDeviceType.Motion, motionAxis: MotionInput.OrientationBeta },
        ]);
        reg.defineAxis(10, "ORIENT_GAMMA", [
            { sourceId: 32, type: InputDeviceType.Motion, motionAxis: MotionInput.OrientationGamma },
        ]);

        user.data = {
            layer,
            page: 0,
            prevPage: [false, false, false, false],
            ballX: W / 2,
            ballY: H / 2,
            shakeTimer: 0,
            peakMagnitude: 0,
            yaw: 0,
            pitch: 0,
            roll: 0,
        };
    }

    // ─── Per-user update ─────────────────────────────────────────────────
    updateUser(runtime: IRuntime, _engine: Engine, user: User<MotionData>): void {
        const d = user.data;
        const dt = 1 / runtime.getTickRate();

        // ── Page switching (edge detection) ──────────────────────────────
        for (let i = 0; i < 4; i++) {
            const pressed = user.getButton(`PAGE_${i + 1}`);
            if (pressed && !d.prevPage[i]) d.page = i;
            d.prevPage[i] = pressed;
        }

        const o: any[] = [];
        o.push(OrderBuilder.fill(" ", 0, 0));

        // ── Tab bar (touchable) ──────────────────────────────────────────
        for (let i = 0; i < 4; i++) {
            const active = d.page === i;
            const label = ` [${i + 1}] ${PAGE_NAMES[i]} `;
            const x = 2 + i * TAB_WIDTH;
            o.push(OrderBuilder.rect(x, 0, TAB_WIDTH, 2, " ", 0, active ? 3 : 0));
            o.push(OrderBuilder.text(x + 1, 0, label, active ? 2 : 4, active ? 3 : 0));
        }
        // Separator line under tabs
        for (let x = 0; x < W; x++) {
            o.push(OrderBuilder.char(x, 2, "-", 3, 0));
        }

        // ── Render active page ───────────────────────────────────────────
        switch (d.page) {
            case 0: this.renderTilt(o, user, d, dt); break;
            case 1: this.renderAccelerometer(o, user, d, dt); break;
            case 2: this.renderGyroscope(o, user, d, dt); break;
            case 3: this.renderCompass(o, user); break;
        }

        d.layer.setOrders(o);
        d.layer.commit();
    }

    // ═════════════════════════════════════════════════════════════════════
    // PAGE 1 — TILT
    // ═════════════════════════════════════════════════════════════════════
    private renderTilt(o: any[], user: User<MotionData>, d: MotionData, dt: number): void {
        const tiltX = user.getAxis("TILT_X");
        const tiltY = user.getAxis("TILT_Y");
        const speed = 30;

        d.ballX += tiltX * speed * dt;
        d.ballY += tiltY * speed * dt;
        d.ballX = Math.max(2, Math.min(W - 3, d.ballX));
        d.ballY = Math.max(5, Math.min(H - 3, d.ballY));

        // Crosshair at center
        o.push(OrderBuilder.text(W / 2, H / 2, "+", 8, 0));

        // Ball
        o.push(OrderBuilder.circle(Math.round(d.ballX), Math.round(d.ballY), 2, {
            charCode: "O", fgColor: 2, bgColor: 0, filled: true,
        }));

        // Info panel
        o.push(OrderBuilder.rect(2, 4, 35, 7, " ", 0, 3));
        o.push(OrderBuilder.text(4, 5, "TILT - Processed input", 1, 3));
        o.push(OrderBuilder.text(4, 7, `Tilt X: ${fmt(tiltX)}`, 2, 3));
        o.push(OrderBuilder.text(4, 8, `Tilt Y: ${fmt(tiltY)}`, 2, 3));

        o.push(OrderBuilder.text(2, H - 2, " Tilt phone to roll the ball. Desktop: Arrow keys. ", 4, 0));
    }

    // ═════════════════════════════════════════════════════════════════════
    // PAGE 2 — ACCELEROMETER
    // ═════════════════════════════════════════════════════════════════════
    private renderAccelerometer(o: any[], user: User<MotionData>, d: MotionData, dt: number): void {
        const ax = user.getAxis("ACCEL_X");
        const ay = user.getAxis("ACCEL_Y");
        const az = user.getAxis("ACCEL_Z");
        const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);

        // Track peak and shake timer
        if (magnitude > d.peakMagnitude) d.peakMagnitude = magnitude;
        if (magnitude > 20) d.shakeTimer = 1.5;
        if (d.shakeTimer > 0) d.shakeTimer -= dt;

        const shaking = d.shakeTimer > 0;

        // Info panel
        o.push(OrderBuilder.rect(2, 4, 50, 12, " ", 0, 3));
        o.push(OrderBuilder.text(4, 5, "ACCELEROMETER - Raw sensor (m/s2)", 1, 3));
        o.push(OrderBuilder.text(4, 7, `Accel X: ${fmt(ax, 6)}`, 2, 3));
        o.push(OrderBuilder.text(4, 8, `Accel Y: ${fmt(ay, 6)}`, 2, 3));
        o.push(OrderBuilder.text(4, 9, `Accel Z: ${fmt(az, 6)}`, 2, 3));
        o.push(OrderBuilder.text(4, 11, `Magnitude: ${fmt(magnitude, 6)}`, magnitude > 15 ? 5 : 1, 3));
        o.push(OrderBuilder.text(4, 12, `Peak:      ${fmt(d.peakMagnitude, 6)}`, 4, 3));
        o.push(OrderBuilder.text(4, 14, `Status:    ${shaking ? "!! SHAKE !!" : "Idle"}`, shaking ? 5 : 4, 3));

        // Visual magnitude bar
        const barW = Math.min(W - 8, Math.round(magnitude * 2));
        if (barW > 0) {
            o.push(OrderBuilder.rect(4, 18, barW, 1, "#", shaking ? 5 : 2, 0));
        }
        o.push(OrderBuilder.text(4, 20, "|" + "-".repeat(40) + "|", 4, 0));
        o.push(OrderBuilder.text(4, 21, "0              10              20   (threshold=20)", 4, 0));

        o.push(OrderBuilder.text(2, H - 2, " Shake your phone! Threshold > 20 triggers alert. ", 4, 0));
    }

    // ═════════════════════════════════════════════════════════════════════
    // PAGE 3 — GYROSCOPE
    // ═════════════════════════════════════════════════════════════════════
    private renderGyroscope(o: any[], user: User<MotionData>, d: MotionData, dt: number): void {
        const gAlpha = user.getAxis("GYRO_ALPHA");
        const gBeta = user.getAxis("GYRO_BETA");
        const gGamma = user.getAxis("GYRO_GAMMA");

        // Accumulate rotation (simulating a spaceship)
        d.yaw += gAlpha * dt * 60;
        d.pitch += gBeta * dt * 60;
        d.roll += gGamma * dt * 60;

        // Info panel
        o.push(OrderBuilder.rect(2, 4, 50, 8, " ", 0, 3));
        o.push(OrderBuilder.text(4, 5, "GYROSCOPE - Angular velocity (rad/s)", 1, 3));
        o.push(OrderBuilder.text(4, 7, `Alpha (Yaw):   ${fmt(gAlpha, 6)}  Accum: ${fmt(d.yaw, 8)}`, 7, 3));
        o.push(OrderBuilder.text(4, 8, `Beta  (Pitch): ${fmt(gBeta, 6)}  Accum: ${fmt(d.pitch, 8)}`, 7, 3));
        o.push(OrderBuilder.text(4, 9, `Gamma (Roll):  ${fmt(gGamma, 6)}  Accum: ${fmt(d.roll, 8)}`, 7, 3));

        // Visualize orientation with a simple "ship" — cells are square (1:1)
        const cx = W / 2;
        const cy = 28;
        const angle = d.yaw * Math.PI / 180;
        const shipLen = 5;
        const dx = Math.cos(angle) * shipLen;
        const dy = Math.sin(angle) * shipLen;

        // Ship body
        o.push(OrderBuilder.text(Math.round(cx), Math.round(cy), "*", 7, 0));
        // Ship direction indicator (nose)
        o.push(OrderBuilder.text(Math.round(cx + dx), Math.round(cy + dy), ">", 7, 0));
        // Ship tail
        o.push(OrderBuilder.text(Math.round(cx - dx), Math.round(cy - dy), ".", 4, 0));

        o.push(OrderBuilder.text(2, H - 2, " Rotate phone to steer. Desktop: Q/E (yaw), Arrows (pitch/roll). ", 4, 0));
    }

    // ═════════════════════════════════════════════════════════════════════
    // PAGE 4 — COMPASS
    // ═════════════════════════════════════════════════════════════════════
    private renderCompass(o: any[], user: User<MotionData>): void {
        const alpha = user.getAxis("ORIENT_ALPHA");  // 0-360 heading
        const beta = user.getAxis("ORIENT_BETA");    // -180..180 front/back
        const gamma = user.getAxis("ORIENT_GAMMA");  // -90..90 left/right

        // Cardinal direction
        const heading = ((alpha % 360) + 360) % 360;
        let cardinal = "N";
        if (heading >= 22.5 && heading < 67.5) cardinal = "NE";
        else if (heading >= 67.5 && heading < 112.5) cardinal = "E";
        else if (heading >= 112.5 && heading < 157.5) cardinal = "SE";
        else if (heading >= 157.5 && heading < 202.5) cardinal = "S";
        else if (heading >= 202.5 && heading < 247.5) cardinal = "SW";
        else if (heading >= 247.5 && heading < 292.5) cardinal = "W";
        else if (heading >= 292.5 && heading < 337.5) cardinal = "NW";

        // Info panel
        o.push(OrderBuilder.rect(2, 4, 50, 10, " ", 0, 3));
        o.push(OrderBuilder.text(4, 5, "COMPASS / ORIENTATION - Absolute", 1, 3));
        o.push(OrderBuilder.text(4, 7, `Alpha (Heading): ${heading.toFixed(1).padStart(7)}`, 6, 3));
        o.push(OrderBuilder.text(4, 8, `Beta  (Tilt FB): ${fmt(beta, 7)}`, 6, 3));
        o.push(OrderBuilder.text(4, 9, `Gamma (Tilt LR): ${fmt(gamma, 7)}`, 6, 3));
        o.push(OrderBuilder.text(4, 11, `Direction:  ${cardinal.padEnd(3)}`, 1, 3));

        // Visual compass rose — cells are SQUARE so X and Y use the same scale
        const cx = W / 2;
        const cy = 28;
        const r = 8;
        const rad = -heading * Math.PI / 180;

        // Draw compass circle outline using characters
        for (let a = 0; a < 32; a++) {
            const theta = (a / 32) * Math.PI * 2;
            const px = cx + Math.cos(theta) * r;
            const py = cy + Math.sin(theta) * r;
            o.push(OrderBuilder.text(Math.round(px), Math.round(py), ".", 8, 0));
        }

        // Cardinal labels — rotate with heading
        const dirs = [
            { label: "N", angle: 0 },
            { label: "E", angle: Math.PI / 2 },
            { label: "S", angle: Math.PI },
            { label: "W", angle: -Math.PI / 2 },
        ];
        for (const dir of dirs) {
            const a = dir.angle + rad;
            const px = cx + Math.sin(a) * (r + 2);
            const py = cy - Math.cos(a) * (r + 2);
            if (px >= 0 && px < W && py >= 4 && py < H - 2) {
                o.push(OrderBuilder.text(Math.round(px), Math.round(py), dir.label, dir.label === "N" ? 5 : 6, 0));
            }
        }

        // Center point
        o.push(OrderBuilder.text(Math.round(cx), Math.round(cy), "+", 6, 0));

        // Needle pointing North
        const nx = cx + Math.sin(rad) * (r - 2);
        const ny = cy - Math.cos(rad) * (r - 2);
        o.push(OrderBuilder.text(Math.round(nx), Math.round(ny), "^", 5, 0));

        o.push(OrderBuilder.text(2, H - 2, " Point your phone around. Alpha = magnetic heading. ", 4, 0));
    }

    update(_runtime: IRuntime, _engine: Engine): void { }
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function fmt(v: number, pad = 6): string {
    return v.toFixed(2).padStart(pad, " ");
}
