/**
 * Name: showcase-09-pong
 * Category: showcase
 * Description: Premium Pong — BLUE vs CPU at 120×67 resolution. Featuring 
 *   a 5-layer Z-buffer depth system, 3D beveled frame, interpolated ball
 *   comet trail, high-intensity solid glow, and parallax screen shake.
 *
 * Architecture (5-Layer Z-Buffer):
 *   - Z=0 (bgLayer): Perspective tunnel background.
 *   - Z=1 (courtLayer): 3D beveled frame and dashed net.
 *   - Z=2 (uiLayer): Large ASCII scores and game-over banner.
 *   - Z=3 (paddleLayer): Paddles with solid high-intensity hit glow.
 *   - Z=4 (ballLayer): Ball, particles, and interpolated gap-free trail.
 *
 * Key Primitiv Concepts demonstrated:
 *   - Multilayer Composition: Solving transparency artifacts with Z-ordering.
 *   - Advanced Trail: Linear interpolation between positions for fluid motion.
 *   - 3D Aesthetics: Three-step gradient bevels and vanishing point tunnel.
 *   - CRT Post-Process: Scanlines and ambient glow for retro immersion.
 */
import {
    Engine, User, Layer, Display, OrderBuilder, Vector2,
    KeyboardInput, InputDeviceType, ScalingMode,
    type IApplication, type IRuntime,
} from '@primitiv/engine';

// ─── Court dimensions ────────────────────────────────────────────────────────
const W = 120, H = 67;
const MARGIN = 4;
const DISPLAY_W = W + MARGIN * 2;
const DISPLAY_H = H + MARGIN * 2;
const OX = MARGIN;
const OY = MARGIN;

const PADDLE_H = 10;
const PADDLE_X_L = 4;
const PADDLE_X_R = W - 5;
const BASE_BALL_VX = 2;
const ACCEL_PER_HIT = 0.15;
const MAX_BALL_VX = 8;
const AI_REACTION = 0.25;
const WIN_SCORE = 5;

// ─── Screen shake ───────────────────────────────────────────────────────────
const SHAKE_INTENSITY = 3;
const SHAKE_DECAY = 0.7;

// ─── Particle parameters ────────────────────────────────────────────────────
const PARTICLE_COUNT = 6;
const PARTICLE_LIFE = 18;
const PARTICLE_CHARS = ['·', '∙', '•', 'o'];

// ─── Ball trail ─────────────────────────────────────────────────────────────
const TRAIL_LENGTH = 5;
const BALL_FLASH_DURATION = 4;   // Ticks the ball bg flashes paddle color

// ─── Slow-motion ────────────────────────────────────────────────────────────
const SLOW_FACTOR = 0.25;       // Speed multiplier during slow-mo
const SLOW_MAX_CHARGE = 60;     // Max charge in ticks (~2 seconds at 30 TPS)
const SLOW_RECHARGE_RATE = 0.5; // Charge gained per tick when not active
const SLOW_BAR_W = 20;          // Width of the charge bar in cells
const SLOW_BAR_Y = 0;           // Y position (top row)
const SLOW_BAR_X = W - SLOW_BAR_W - 2; // Right-aligned

// ─── Palette color IDs ──────────────────────────────────────────────────────
const BG = 0;
const COURT = 1;
const BLUE = 2;
const RED = 3;
const BALL_COLOR = 4;
const TEXT_COLOR = 5;
const NET = 6;
const BLUE_MID = 7;
const BLUE_DIM = 8;
const RED_MID = 9;
const RED_DIM = 10;
const BALL_MID = 11;
const BALL_DIM = 12;
const SLOW_BAR_COLOR = 13;
const SLOW_BAR_BG = 14;
const GRID_COLOR = 15;
const BLUE_HIGH = 16;          // Bright cyan for impact
const RED_HIGH = 17;             // Bright red for impact
const FRAME_HI = 18;             // Light color for 3D beveled frame
const FRAME_MID = 20;            // Middle transition for 3D beveled frame
const FRAME_LO = 19;             // Dark color for 3D beveled frame
const BLUE_GLOW = 21;
const RED_GLOW = 22;
const BLUE_HIT_GLOW = 23;      // Special bright hit color
const RED_HIT_GLOW = 24;       // Special bright hit color


const FADE_MAP: Record<number, number[]> = {
    [BLUE]: [BLUE, BLUE_MID, BLUE_DIM],
    [RED]: [RED, RED_MID, RED_DIM],
};

// ─── Big ASCII digits (5×3 bitmap font) ─────────────────────────────────────
const DIGITS: number[][] = [
    [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1], // 0
    [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], // 1
    [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1], // 2
    [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1], // 3
    [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1], // 4
    [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1], // 5
    [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1], // 6
    [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], // 7
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1], // 8
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1], // 9
];

// ─── Per-user application state ──────────────────────────────────────────────

interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    life: number;
    maxLife: number;
    color: number;
    char: string;
}

interface PongUserData {
    display: Display;
    bgLayer: Layer;
    courtLayer: Layer;
    uiLayer: Layer;
    paddleLayer: Layer;
    ballLayer: Layer;
    blueY: number;
    redY: number;
    ballX: number;
    ballY: number;
    ballVX: number;
    ballVY: number;
    blueScore: number;
    redScore: number;
    serving: boolean;
    serveTimer: number;
    gameOver: boolean;
    shakeX: number;
    shakeY: number;
    particles: Particle[];
    trail: { x: number; y: number }[];
    rallyHits: number;
    currentSpeed: number;
    slowCharge: number;
    slowActive: boolean;
    ballFlashLife: number;       // Remaining flash ticks
    ballFlashColor: number;      // Paddle color for ball bg
    blueTargetOffset: number;  // Intentional AI inaccuracy
    redTargetOffset: number;     // Intentional AI inaccuracy
    blueHitFlash: number;      // Frames remaining for paddle highlight
    redHitFlash: number;         // Frames remaining for paddle highlight
}

// Predict exact Y position of the ball when it reaches targetX, including bounces
function predictBallY(bx: number, by: number, bvx: number, bvy: number, targetX: number): number {
    if (bvx === 0) return by;
    const timeToTarget = (targetX - bx) / bvx;
    if (timeToTarget <= 0) return by;

    const predictedY = by + bvy * timeToTarget;
    const minY = 3;
    const maxY = H - 3;
    const range = maxY - minY;

    let normalizedY = predictedY - minY;
    if (normalizedY < 0) {
        normalizedY = -normalizedY;
    }

    const crossings = Math.floor(normalizedY / range);
    const remainder = normalizedY % range;

    if (crossings % 2 === 1) {
        return maxY - remainder;
    } else {
        return minY + remainder;
    }
}

function serveBall(data: PongUserData, towardsBlue: boolean): void {
    data.ballX = Math.floor(W / 2);
    data.ballY = Math.floor(H / 2);
    data.ballVX = towardsBlue ? -BASE_BALL_VX : BASE_BALL_VX;
    data.ballVY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random());
    data.serving = true;
    data.serveTimer = 30; // 1 second pause
    data.currentSpeed = BASE_BALL_VX;
    data.rallyHits = 0;
    data.blueTargetOffset = (Math.random() - 0.5) * (PADDLE_H - 2);
    data.redTargetOffset = (Math.random() - 0.5) * (PADDLE_H - 2);
    data.trail = [];
}

// ─── Application ─────────────────────────────────────────────────────────────

export class Pong implements IApplication<Engine, User<PongUserData>> {

    async init(runtime: IRuntime, engine: Engine) {
        engine.loadPaletteToSlot(0, [
            { colorId: BG, r: 8, g: 8, b: 16, a: 255 },
            { colorId: COURT, r: 50, g: 50, b: 80, a: 255 },
            { colorId: BLUE, r: 80, g: 220, b: 255, a: 255 },
            { colorId: RED, r: 255, g: 100, b: 100, a: 255 },
            { colorId: BALL_COLOR, r: 255, g: 255, b: 200, a: 255 },
            { colorId: TEXT_COLOR, r: 200, g: 200, b: 220, a: 255 },
            { colorId: NET, r: 100, g: 100, b: 140, a: 255 }, // Brighter net
            { colorId: BLUE_MID, r: 40, g: 120, b: 150, a: 255 },
            { colorId: BLUE_DIM, r: 20, g: 50, b: 70, a: 255 },
            { colorId: RED_MID, r: 150, g: 50, b: 50, a: 255 },
            { colorId: RED_DIM, r: 70, g: 25, b: 25, a: 255 },
            { colorId: BALL_MID, r: 160, g: 160, b: 120, a: 255 },
            { colorId: BALL_DIM, r: 60, g: 60, b: 50, a: 255 },
            { colorId: SLOW_BAR_COLOR, r: 100, g: 200, b: 255, a: 255 },
            { colorId: SLOW_BAR_BG, r: 25, g: 25, b: 40, a: 255 },
            { colorId: GRID_COLOR, r: 80, g: 80, b: 120, a: 255 },
            { colorId: BLUE_HIGH, r: 180, g: 255, b: 255, a: 255 },
            { colorId: RED_HIGH, r: 255, g: 180, b: 180, a: 255 },
            { colorId: FRAME_HI, r: 35, g: 35, b: 55, a: 255 }, // Subtle Frame Face
            { colorId: FRAME_MID, r: 25, g: 25, b: 40, a: 255 }, // Middle Transition
            { colorId: FRAME_LO, r: 15, g: 15, b: 25, a: 255 }, // Dark Inner Bevel
            { colorId: BLUE_GLOW, r: 15, g: 30, b: 45, a: 255 }, // Very subtle blue tint
            { colorId: RED_GLOW, r: 35, g: 15, b: 15, a: 255 },  // Very subtle red tint
            { colorId: BLUE_HIT_GLOW, r: 50, g: 140, b: 160, a: 255 }, // Very bright but softer than BLUE
            { colorId: RED_HIT_GLOW, r: 160, g: 60, b: 60, a: 255 },   // Very bright but softer than RED
        ]);
        runtime.setTickRate(30);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<PongUserData>) {
        // ── Display with CRT effects ─────────────────────────────────────────
        const display = new Display(0, DISPLAY_W, DISPLAY_H);
        user.addDisplay(display);
        display.switchPalette(0);
        display.setScalingMode(ScalingMode.Quarter);
        display.setAmbientEffect({ blur: 15, scale: 1.4 });
        display.setPostProcess({ scanlines: { enabled: true, opacity: 0.25, pattern: 'horizontal' } });

        // ── Layer 0: Background Tunnel (z=0) ────────────────────────────────
        const bgLayer = new Layer(new Vector2(OX, OY), 0, W, H, { mustBeReliable: true });
        user.addLayer(bgLayer);

        const bgOrders: any[] = [];
        bgOrders.push(OrderBuilder.fill(' ', BG, BG));

        // ── Vanishing Lines (radiating towards a central box) ─────────
        const cxGrid = Math.floor(W / 2);
        const cyGrid = Math.floor(H / 2);

        // The inner "distance" rectangle where lines stop
        const innerW = Math.floor(W * 0.2);
        const innerH = Math.floor(H * 0.2);

        // Define corners for vanishing lines: [Outer Corner, Inner Corner, CharCode]
        const segments = [
            [{ x: 1, y: 1 }, { x: cxGrid - innerW, y: cyGrid - innerH }, '.'],         // Top Left
            [{ x: W - 2, y: 1 }, { x: cxGrid + innerW, y: cyGrid - innerH }, '.'],     // Top Right
            [{ x: 1, y: H - 2 }, { x: cxGrid - innerW, y: cyGrid + innerH }, '.'],     // Bottom Left
            [{ x: W - 2, y: H - 2 }, { x: cxGrid + innerW, y: cyGrid + innerH }, '.']  // Bottom Right
        ];

        // Draw the 4 vanishing lines
        for (const seg of segments) {
            const p1 = seg[0] as { x: number, y: number };
            const p2 = seg[1] as { x: number, y: number };
            const char = seg[2] as string;
            bgOrders.push(OrderBuilder.line(p1.x, p1.y, p2.x, p2.y, {
                charCode: char,
                fgColor: GRID_COLOR,
                bgColor: BG
            }));
        }

        // Draw the inner "vanishing" rectangle with proper box characters
        const ix1 = cxGrid - innerW, iy1 = cyGrid - innerH;
        const ix2 = cxGrid + innerW, iy2 = cyGrid + innerH;
        bgOrders.push(OrderBuilder.char(ix1, iy1, '┌', GRID_COLOR, BG));
        bgOrders.push(OrderBuilder.line(ix1 + 1, iy1, ix2 - 1, iy1, { charCode: '─', fgColor: GRID_COLOR, bgColor: BG }));
        bgOrders.push(OrderBuilder.char(ix2, iy1, '┐', GRID_COLOR, BG));

        bgOrders.push(OrderBuilder.char(ix1, iy2, '└', GRID_COLOR, BG));
        bgOrders.push(OrderBuilder.line(ix1 + 1, iy2, ix2 - 1, iy2, { charCode: '─', fgColor: GRID_COLOR, bgColor: BG }));
        bgOrders.push(OrderBuilder.char(ix2, iy2, '┘', GRID_COLOR, BG));

        bgOrders.push(OrderBuilder.line(ix1, iy1 + 1, ix1, iy2 - 1, { charCode: '│', fgColor: GRID_COLOR, bgColor: BG }));
        bgOrders.push(OrderBuilder.line(ix2, iy1 + 1, ix2, iy2 - 1, { charCode: '│', fgColor: GRID_COLOR, bgColor: BG }));

        bgLayer.setOrders(bgOrders);


        // ── Layer 1: Static Court (z=1) ──────────────────────────────────────
        const courtLayer = new Layer(new Vector2(OX, OY), 1, W, H, { mustBeReliable: true });
        user.addLayer(courtLayer);

        const courtOrders: any[] = [];
        // Thick 3D Beveled Frame with 3-Step Gradient
        // 1. Homogeneous face (Outer surface - 1 cell thick)
        courtOrders.push(OrderBuilder.line(0, 1, W - 1, 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(0, H - 1, W - 1, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(0, 1, 0, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(W - 1, 1, W - 1, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));

        // 2. Middle transition bevel (Intermediate depth - 1 cell thick)
        courtOrders.push(OrderBuilder.line(1, 2, W - 2, 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(1, H - 2, W - 2, H - 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(1, 2, 1, H - 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(W - 2, 2, W - 2, H - 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));

        // 3. Inner depth bevel (Deepest part - 1 cell thick)
        courtOrders.push(OrderBuilder.line(2, 3, W - 3, 3, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(2, H - 3, W - 3, H - 3, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(2, 3, 2, H - 3, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(W - 3, 3, W - 3, H - 3, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));

        // Center net (dashed)
        const cxNet = Math.floor(W / 2);
        for (let y = 3; y < H - 2; y += 2) {
            courtOrders.push(OrderBuilder.char(cxNet, y, '│', NET, BG));
        }
        courtLayer.setOrders(courtOrders);


        // ── Layer 2: UI (Z=2) — Score and Banner ─────────────────────────────
        const uiLayer = new Layer(new Vector2(OX, OY), 2, W, H);
        user.addLayer(uiLayer);

        // ── Layer 3: Paddles (Z=3) ───────────────────────────────────────────
        const paddleLayer = new Layer(new Vector2(OX, OY), 3, W, H);
        user.addLayer(paddleLayer);

        // ── Layer 4: Ball & FX (Z=4) ─────────────────────────────────────────
        const ballLayer = new Layer(new Vector2(OX, OY), 4, W, H);
        user.addLayer(ballLayer);

        const data: PongUserData = {
            display,
            bgLayer,
            courtLayer,
            uiLayer,
            paddleLayer,
            ballLayer,
            blueY: H / 2,
            redY: H / 2,
            ballX: Math.floor(W / 2),
            ballY: Math.floor(H / 2),
            ballVX: 0,
            ballVY: 0,
            blueScore: 0,
            redScore: 0,
            serving: true,
            serveTimer: 30,
            gameOver: false,
            shakeX: 0,
            shakeY: 0,
            particles: [],
            trail: [],
            rallyHits: 0,
            currentSpeed: BASE_BALL_VX,
            slowCharge: SLOW_MAX_CHARGE,
            slowActive: false,
            ballFlashLife: 0,
            ballFlashColor: BG,
            blueTargetOffset: 0, // Initialized by serveBall
            redTargetOffset: 0,    // Initialized by serveBall
            blueHitFlash: 0,
            redHitFlash: 0,
        };
        user.data = data;
        serveBall(data, false);
        data.serveTimer = 30;

        // ── Input ────────────────────────────────────────────────────────────
        const registry = user.getInputBindingRegistry();
        registry.defineButton(1, 'SLOW', [{ sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.Space }]);
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<PongUserData>) {
        const d = user.data;

        // ── Slow-motion toggle ───────────────────────────────────────────────
        const wantSlow = !!user.getButton('SLOW');
        if (wantSlow && d.slowCharge > 0 && !d.gameOver && !d.serving) {
            d.slowActive = true;
            d.slowCharge = Math.max(0, d.slowCharge - 1); // Drains at normal rate
            if (d.slowCharge <= 0) d.slowActive = false;
        } else {
            d.slowActive = false;
            // Recharge when not slowing
            if (d.slowCharge < SLOW_MAX_CHARGE) {
                d.slowCharge = Math.min(SLOW_MAX_CHARGE, d.slowCharge + SLOW_RECHARGE_RATE);
            }
        }
        const sm = d.slowActive ? SLOW_FACTOR : 1; // Speed multiplier this tick

        // ── Screen shake decay ───────────────────────────────────────────────
        d.shakeX *= SHAKE_DECAY;
        d.shakeY *= SHAKE_DECAY;
        if (Math.abs(d.shakeX) < 0.1) d.shakeX = 0;
        if (Math.abs(d.shakeY) < 0.1) d.shakeY = 0;
        const ox = Math.round(d.shakeX);
        const oy = Math.round(d.shakeY);

        // All interactive elements shake fully (Full 100% parallax foreground)
        d.ballLayer.setOrigin(new Vector2(OX + ox, OY + oy));
        d.paddleLayer.setOrigin(new Vector2(OX + ox, OY + oy));
        d.uiLayer.setOrigin(new Vector2(OX + ox, OY + oy));
        d.courtLayer.setOrigin(new Vector2(OX + ox, OY + oy));

        // Background (perspective tunnel) shakes at 20% strength to create parallax depth
        const bgOx = Math.round(d.shakeX * 0.2);
        const bgOy = Math.round(d.shakeY * 0.2);
        d.bgLayer.setOrigin(new Vector2(OX + bgOx, OY + bgOy));

        // Ball flash decay
        if (d.ballFlashLife > 0) d.ballFlashLife--;
        if (d.blueHitFlash > 0) d.blueHitFlash--;
        if (d.redHitFlash > 0) d.redHitFlash--;

        if (d.gameOver) { this.draw(d); return; }

        // ── 1. BLUE AI ─────────────────────────────────────────────────────
        const blueDest = predictBallY(d.ballX, d.ballY, d.ballVX, d.ballVY, PADDLE_X_L);
        const blueTarget = d.ballVX < 0 ? (blueDest + d.blueTargetOffset) : H / 2;
        d.blueY += (blueTarget - d.blueY) * AI_REACTION * sm;
        d.blueY = Math.max(3 + PADDLE_H / 2, Math.min(H - 3 - PADDLE_H / 2, d.blueY));

        // ── 2. CPU AI ────────────────────────────────────────────────────────
        const cpuDest = predictBallY(d.ballX, d.ballY, d.ballVX, d.ballVY, PADDLE_X_R);
        const cpuTarget = d.ballVX > 0 ? (cpuDest + d.redTargetOffset) : H / 2;
        d.redY += (cpuTarget - d.redY) * AI_REACTION * sm;
        d.redY = Math.max(3 + PADDLE_H / 2, Math.min(H - 3 - PADDLE_H / 2, d.redY));

        // ── 3. Serve pause ───────────────────────────────────────────────────
        if (d.serving) {
            d.serveTimer--;
            if (d.serveTimer <= 0) d.serving = false;
            this.draw(d);
            return;
        }

        // ── 4. Ball physics (swept collision to prevent tunneling) ─────────
        d.trail.unshift({ x: d.ballX, y: d.ballY });
        if (d.trail.length > TRAIL_LENGTH) d.trail.length = TRAIL_LENGTH;

        const prevX = d.ballX;
        const prevY = d.ballY;
        d.ballX += d.ballVX * sm;
        d.ballY += d.ballVY * sm;

        // Top/bottom bounce
        if (d.ballY <= 3) { d.ballY = 3; d.ballVY = Math.abs(d.ballVY); }
        if (d.ballY >= H - 3) { d.ballY = H - 3; d.ballVY = -Math.abs(d.ballVY); }

        // BLUE paddle — swept collision
        const pLine = PADDLE_X_L + 1;
        const pTop = Math.round(d.blueY - PADDLE_H / 2);
        const pBot = Math.round(d.blueY + PADDLE_H / 2);
        if (d.ballVX < 0 && prevX >= pLine && d.ballX <= pLine) {
            const t = (d.ballVX === 0) ? 0 : (pLine - prevX) / (d.ballVX * sm);
            const hitY = Math.round(prevY + d.ballVY * sm * t);
            if (hitY >= pTop && hitY <= pBot) {
                d.rallyHits++;
                d.currentSpeed = Math.min(MAX_BALL_VX, BASE_BALL_VX + d.rallyHits * ACCEL_PER_HIT);
                d.ballVX = Math.round(d.currentSpeed);
                if (d.ballVX < 1) d.ballVX = 1;
                d.ballY = hitY;
                d.ballVY += (hitY - d.blueY) * 0.6; // Increased spin/deflection effect from edges
                d.ballX = pLine;
                this.triggerShake(d, 1);
                this.spawnParticles(d, d.ballX, d.ballY, 1, BLUE_HIGH); // Brighter particles
                d.ballFlashLife = BALL_FLASH_DURATION; d.ballFlashColor = BLUE_DIM;
                d.blueTargetOffset = (Math.random() - 0.5) * (PADDLE_H - 2); // Reroll offset
                d.blueHitFlash = BALL_FLASH_DURATION; // Highlight paddle
            }
        }

        // CPU paddle — swept collision
        const cLine = PADDLE_X_R - 1;
        const cTop = Math.round(d.redY - PADDLE_H / 2);
        const cBot = Math.round(d.redY + PADDLE_H / 2);
        if (d.ballVX > 0 && prevX <= cLine && d.ballX >= cLine) {
            const t = (d.ballVX === 0) ? 0 : (cLine - prevX) / (d.ballVX * sm);
            const hitY = Math.round(prevY + d.ballVY * sm * t);
            if (hitY >= cTop && hitY <= cBot) {
                d.rallyHits++;
                d.currentSpeed = Math.min(MAX_BALL_VX, BASE_BALL_VX + d.rallyHits * ACCEL_PER_HIT);
                d.ballVX = -Math.round(d.currentSpeed);
                if (d.ballVX > -1) d.ballVX = -1;
                d.ballY = hitY;
                d.ballVY += (hitY - d.redY) * 0.6; // Increased spin/deflection effect from edges
                d.ballX = cLine;
                this.triggerShake(d, -1);
                this.spawnParticles(d, d.ballX, d.ballY, -1, RED_HIGH); // Brighter particles
                d.ballFlashLife = BALL_FLASH_DURATION; d.ballFlashColor = RED_DIM;
                d.redTargetOffset = (Math.random() - 0.5) * (PADDLE_H - 2); // Reroll offset
                d.redHitFlash = BALL_FLASH_DURATION; // Highlight paddle
            }
        }

        // ── 5. Scoring ───────────────────────────────────────────────────────
        if (d.ballX <= 0) {
            d.redScore++;
            if (d.redScore >= WIN_SCORE) { d.gameOver = true; }
            else { serveBall(d, true); }
        } else if (d.ballX >= W - 1) {
            d.blueScore++;
            if (d.blueScore >= WIN_SCORE) { d.gameOver = true; }
            else { serveBall(d, false); }
        }

        // ── 6. Update particles ──────────────────────────────────────────────
        for (let i = d.particles.length - 1; i >= 0; i--) {
            const p = d.particles[i];
            p.x += p.vx * sm;
            p.y += p.vy * sm;
            p.life--;
            if (p.life <= 0) d.particles.splice(i, 1);
        }

        this.draw(d);
    }

    private spawnParticles(d: PongUserData, x: number, y: number, dirX: number, color: number): void {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const life = Math.floor(PARTICLE_LIFE * (0.5 + Math.random() * 0.5));
            d.particles.push({
                x, y,
                vx: dirX * (1 + Math.random() * 3),
                vy: (Math.random() - 0.5) * 4,
                life, maxLife: life, color,
                char: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
            });
        }
    }

    private triggerShake(d: PongUserData, dirX: number): void {
        d.shakeX = dirX * SHAKE_INTENSITY * (0.5 + Math.random() * 0.5);
        d.shakeY = (Math.random() - 0.5) * SHAKE_INTENSITY;
    }

    private drawBigDigit(orders: any[], digit: number, x: number, y: number, color: number): void {
        const grid = DIGITS[digit];
        if (!grid) return;
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === 1) {
                const dx = i % 3;
                const dy = Math.floor(i / 3);
                // Use space character with background color and transparent foreground (255)
                orders.push(OrderBuilder.char(x + dx, y + dy, ' ', 255, color));
            }
        }
    }

    private draw(d: PongUserData): void {
        const ballOrders: any[] = [];
        const paddleOrders: any[] = [];
        const uiOrders: any[] = [];

        // ── Big ASCII score (Z=2 uiLayer) ────────────────────────────────────
        const center = Math.floor(W / 2);
        this.drawBigDigit(uiOrders, d.blueScore, center - 8, 3, BLUE);
        this.drawBigDigit(uiOrders, d.redScore, center + 5, 3, RED);

        // ── Slow-mo charge (Z=2 uiLayer) ─────────────────────────────────────
        const filled = Math.round((d.slowCharge / SLOW_MAX_CHARGE) * SLOW_BAR_W);
        const barFilled: { posX: number; posY: number }[] = [];
        const barEmpty: { posX: number; posY: number }[] = [];
        for (let i = 0; i < SLOW_BAR_W; i++) {
            (i < filled ? barFilled : barEmpty).push({ posX: SLOW_BAR_X + i, posY: SLOW_BAR_Y });
        }
        if (barFilled.length) uiOrders.push(OrderBuilder.dotCloud(barFilled, '▬', SLOW_BAR_COLOR, 255));
        if (barEmpty.length) uiOrders.push(OrderBuilder.dotCloud(barEmpty, '▬', SLOW_BAR_BG, 255));
        if (d.slowActive) {
            uiOrders.push(OrderBuilder.text(SLOW_BAR_X - 5, SLOW_BAR_Y, 'SLOW', SLOW_BAR_COLOR, 255));
        }

        // ── Ball trail (Z=4 ballLayer) ───────────────────────────────────────
        const trailColors = [BALL_COLOR, BALL_MID, BALL_MID, BALL_DIM, BALL_DIM];
        const trailDots: { posX: number; posY: number; charCode: string; fgColorCode: number; bgColorCode: number }[] = [];

        // Include current ball position as the head of the trail for interpolation
        const fullPath = [{ x: d.ballX, y: d.ballY }, ...d.trail];

        for (let i = 0; i < fullPath.length - 1; i++) {
            const p1 = fullPath[i];
            const p2 = fullPath[i + 1];

            // Draw the actual point (from trail)
            const tx = Math.round(p2.x), ty = Math.round(p2.y);
            const color = trailColors[i] || BALL_DIM;
            if (tx >= 1 && tx < W - 1 && ty >= 1 && ty < H - 1) {
                trailDots.push({ posX: tx, posY: ty, charCode: '·', fgColorCode: color, bgColorCode: 255 });
            }

            // Interpolate between p1 and p2 to fill gaps with '.'
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 1.5) {
                const steps = Math.floor(dist);
                for (let s = 1; s < steps; s++) {
                    const ix = Math.round(p1.x + (dx * s) / steps);
                    const iy = Math.round(p1.y + (dy * s) / steps);
                    if (ix >= 1 && ix < W - 1 && iy >= 1 && iy < H - 1) {
                        // Use a subtle '.' between the '·' points
                        trailDots.push({ posX: ix, posY: iy, charCode: '.', fgColorCode: color, bgColorCode: 255 });
                    }
                }
            }
        }
        if (trailDots.length) ballOrders.push(OrderBuilder.dotCloudMulti(trailDots));

        // ── BLUE paddle (Z=3 paddleLayer) ────────────────────────────────────
        const pTop = Math.round(d.blueY - PADDLE_H / 2);
        const pGlow: { posX: number; posY: number }[] = [];
        for (let i = -1; i <= PADDLE_H; i++) {
            const gy = pTop + i;
            if (gy >= 2 && gy < H - 1) {
                pGlow.push({ posX: PADDLE_X_L - 1, posY: gy });
                pGlow.push({ posX: PADDLE_X_L + 1, posY: gy });
            }
        }
        if (pTop - 1 >= 2) pGlow.push({ posX: PADDLE_X_L, posY: pTop - 1 });
        if (pTop + PADDLE_H < H - 1) pGlow.push({ posX: PADDLE_X_L, posY: pTop + PADDLE_H });
        const pGlowColor = d.blueHitFlash > 0 ? BLUE_HIT_GLOW : BLUE_GLOW;
        const pColor = d.blueHitFlash > 0 ? BLUE_HIGH : BLUE;
        if (pGlow.length) paddleOrders.push(OrderBuilder.dotCloud(pGlow, ' ', 255, pGlowColor));
        paddleOrders.push(OrderBuilder.line(PADDLE_X_L, pTop, PADDLE_X_L, pTop + PADDLE_H - 1, { charCode: '█', fgColor: pColor, bgColor: 255 }));

        // ── RED paddle (Z=3 paddleLayer) ─────────────────────────────────────
        const cTop = Math.round(d.redY - PADDLE_H / 2);
        const cGlow: { posX: number; posY: number }[] = [];
        for (let i = -1; i <= PADDLE_H; i++) {
            const gy = cTop + i;
            if (gy >= 2 && gy < H - 1) {
                cGlow.push({ posX: PADDLE_X_R - 1, posY: gy });
                cGlow.push({ posX: PADDLE_X_R + 1, posY: gy });
            }
        }
        if (cTop - 1 >= 2) cGlow.push({ posX: PADDLE_X_R, posY: cTop - 1 });
        if (cTop + PADDLE_H < H - 1) cGlow.push({ posX: PADDLE_X_R, posY: cTop + PADDLE_H });
        const cGlowColor = d.redHitFlash > 0 ? RED_HIT_GLOW : RED_GLOW;
        const cColor = d.redHitFlash > 0 ? RED_HIGH : RED;
        if (cGlow.length) paddleOrders.push(OrderBuilder.dotCloud(cGlow, ' ', 255, cGlowColor));
        paddleOrders.push(OrderBuilder.line(PADDLE_X_R, cTop, PADDLE_X_R, cTop + PADDLE_H - 1, { charCode: '█', fgColor: cColor, bgColor: 255 }));

        // ── Particles (Z=4 ballLayer) ────────────────────────────────────────
        const particleDots: { posX: number; posY: number; charCode: string; fgColorCode: number; bgColorCode: number }[] = [];
        for (const p of d.particles) {
            const px = Math.round(p.x), py = Math.round(p.y);
            if (px >= 0 && px < W && py >= 2 && py < H - 1) {
                const ratio = p.life / p.maxLife;
                const stages = FADE_MAP[p.color] || [p.color, p.color, p.color];
                const col = ratio > 0.6 ? stages[0] : ratio > 0.25 ? stages[1] : stages[2];
                particleDots.push({ posX: px, posY: py, charCode: p.char, fgColorCode: col, bgColorCode: 255 });
            }
        }
        if (particleDots.length) ballOrders.push(OrderBuilder.dotCloudMulti(particleDots));

        // ── Ball (Z=4 ballLayer) ─────────────────────────────────────────────
        if (!d.serving || Math.floor(d.serveTimer / 4) % 2 === 0) {
            const ballColor = d.ballFlashLife > 0 ? d.ballFlashColor : BALL_COLOR;
            ballOrders.push(OrderBuilder.char(Math.round(d.ballX), Math.round(d.ballY), '•', ballColor, 255));
        }

        // ── Game over (Z=2 uiLayer) ──────────────────────────────────────────
        if (d.gameOver) {
            const isBlue = d.blueScore >= WIN_SCORE;
            const text = isBlue ? ' ☼  BLUE WINS!  ☼ ' : ' ☼  RED WINS!  ☼ ';
            const color = isBlue ? BLUE_HIGH : RED_HIGH;
            const tx = Math.floor(W / 2 - text.length / 2);
            const ty = Math.floor(H / 2);

            uiOrders.push(OrderBuilder.text(tx, ty - 1, '═'.repeat(text.length), color, 255));
            uiOrders.push(OrderBuilder.text(tx, ty, text, color, 255));
            uiOrders.push(OrderBuilder.text(tx, ty + 1, '═'.repeat(text.length), color, 255));
        }

        d.uiLayer.setOrders(uiOrders);

        d.paddleLayer.setOrders(paddleOrders);

        d.ballLayer.setOrders(ballOrders);

    }
}
