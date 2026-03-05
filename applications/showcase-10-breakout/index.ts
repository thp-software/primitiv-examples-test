/**
 * Name: showcase-10-breakout
 * Category: showcase
 * Description: Premium Breakout — 5-layer Z-buffer depth system, 3D beveled frame,
 *   interpolated comet trail, high-intensity collision glows, and parallax screen shake.
 * 
 * Architecture (5-Layer Z-Buffer):
 *   - Z=0 (bgLayer): Perspective tunnel background.
 *   - Z=1 (courtLayer): 3D beveled frame and destructible bricks.
 *   - Z=2 (uiLayer): Large ASCII score and life counter.
 *   - Z=3 (paddleLayer): Paddle with solid background highlight.
 *   - Z=4 (ballLayer): Ball, particles, and interpolated gap-free trail.
 */
import {
    Engine, User, Layer, Display, OrderBuilder, Vector2,
    KeyboardInput, InputDeviceType, ScalingMode,
    type IApplication, type IRuntime,
} from '@primitiv/engine';

// ─── Game configuration ──────────────────────────────────────────────────────
const W = 40; // Inner court width (Portrait)
const H = 64; // Inner court height (Portrait)
const MARGIN = 3;
const DISPLAY_W = W + MARGIN * 2;
const DISPLAY_H = H + MARGIN * 2;
const OX = MARGIN;
const OY = MARGIN;

const PADDLE_W = 8;
const PADDLE_Y = H - 4;
const BALL_SPEED_START = 1.0;
const BALL_SPEED_MAX = 2.5;

// Bricks
const BRICK_ROWS = 8;
const BRICK_COLS = 6;
const BRICK_W = 5;
const BRICK_H = 2;
const BRICK_TOP = 8;

// ─── Screen shake ───────────────────────────────────────────────────────────
const SHAKE_INTENSITY = 3;
const SHAKE_DECAY = 0.7;

// ─── Particle parameters ────────────────────────────────────────────────────
const PARTICLE_COUNT = 6;
const PARTICLE_LIFE = 15;
const PARTICLE_CHARS = ['·', '∙', '•', 'o'];

// ─── Ball trail ─────────────────────────────────────────────────────────────
const TRAIL_LENGTH = 6;
const BALL_FLASH_DURATION = 4;

const POWERUP_CHANCE = 0.2;
const POWERUP_DURATION = 300; // ~10 seconds at 30fps

// ─── Palette color IDs ──────────────────────────────────────────────────────
const BG = 0;
const FRAME_HI = 1;
const FRAME_MID = 2;
const FRAME_LO = 3;
const PADDLE = 4;
const PADDLE_GLOW = 5;
const PADDLE_HIT_GLOW = 6;
const BALL_COLOR = 7;
const BALL_MID = 8;
const BALL_DIM = 9;
const SCORE_COLOR = 10;
const GRID_COLOR = 11;

// Brick colors (6 tiers)
const B_RED = 12;
const B_ORANGE = 13;
const B_YELLOW = 14;
const B_GREEN = 15;
const B_BLUE = 16;
const B_PURPLE = 17;

const BRICK_COLORS = [B_RED, B_RED, B_ORANGE, B_ORANGE, B_YELLOW, B_GREEN, B_BLUE, B_PURPLE];

// Power-up Types
type PowerUpType = 'LIFE' | 'WIDE' | 'SUPER';
const POWERUP_ICONS: Record<PowerUpType, string> = { 'LIFE': '♥', 'WIDE': '♦', 'SUPER': '☼' };
const POWERUP_COLORS: Record<PowerUpType, number> = { 'LIFE': B_RED, 'WIDE': B_BLUE, 'SUPER': B_ORANGE };

interface PowerUpItem {
    x: number;
    y: number;
    type: PowerUpType;
    alive: boolean;
}

// ─── Bitmap Font (3x5) ──────────────────────────────────────────────────────
const DIGITS: Record<number, number[]> = {
    0: [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
    1: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    2: [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
    3: [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1],
    4: [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
    5: [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
    6: [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    7: [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    8: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    9: [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
};


interface Brick {
    x: number;
    y: number;
    color: number;
    alive: boolean;
}

interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    life: number; maxLife: number;
    color: number; char: string;
}

interface BreakoutUserData {
    bgLayer: Layer;
    courtLayer: Layer;
    uiLayer: Layer;
    paddleLayer: Layer;
    itemLayer: Layer;
    ballLayer: Layer;

    paddleX: number;
    paddleWidth: number;
    ballX: number;
    ballY: number;
    ballVX: number;
    ballVY: number;

    bricks: Brick[];
    items: PowerUpItem[];
    score: number;
    lives: number;

    serving: boolean;
    gameOver: boolean;

    shakeX: number;
    shakeY: number;
    particles: Particle[];
    trail: { x: number; y: number }[];

    paddleHitFlash: number;
    ballFlashLife: number;

    wideTimer: number;
    superTimer: number;
}

export class Breakout implements IApplication<Engine, User<BreakoutUserData>> {

    async init(runtime: IRuntime, engine: Engine) {
        engine.loadPaletteToSlot(0, [
            { colorId: BG, r: 12, g: 12, b: 24, a: 255 },
            { colorId: FRAME_HI, r: 60, g: 60, b: 90, a: 255 },
            { colorId: FRAME_MID, r: 40, g: 40, b: 65, a: 255 },
            { colorId: FRAME_LO, r: 25, g: 25, b: 40, a: 255 },
            { colorId: PADDLE, r: 200, g: 200, b: 255, a: 255 },
            { colorId: PADDLE_GLOW, r: 30, g: 30, b: 60, a: 255 },
            { colorId: PADDLE_HIT_GLOW, r: 80, g: 80, b: 150, a: 255 },
            { colorId: BALL_COLOR, r: 255, g: 255, b: 255, a: 255 },
            { colorId: BALL_MID, r: 180, g: 180, b: 180, a: 255 },
            { colorId: BALL_DIM, r: 100, g: 100, b: 100, a: 255 },
            { colorId: SCORE_COLOR, r: 255, g: 255, b: 150, a: 255 },
            { colorId: GRID_COLOR, r: 40, g: 40, b: 60, a: 255 },
            // Bricks
            { colorId: B_RED, r: 255, g: 80, b: 80, a: 255 },
            { colorId: B_ORANGE, r: 255, g: 150, b: 50, a: 255 },
            { colorId: B_YELLOW, r: 255, g: 220, b: 50, a: 255 },
            { colorId: B_GREEN, r: 80, g: 255, b: 80, a: 255 },
            { colorId: B_BLUE, r: 80, g: 150, b: 255, a: 255 },
            { colorId: B_PURPLE, r: 180, g: 80, b: 255, a: 255 },
        ]);
        runtime.setTickRate(30);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<BreakoutUserData>) {
        const display = new Display(0, DISPLAY_W, DISPLAY_H);
        user.addDisplay(display);
        display.switchPalette(0);
        display.setScalingMode(ScalingMode.None);
        display.setAmbientEffect({ blur: 12, scale: 1.3 });
        display.setPostProcess({ scanlines: { enabled: true, opacity: 0.2, pattern: 'horizontal' } });

        // Layers Setup
        const bgLayer = new Layer(new Vector2(OX, OY), 0, W, H, { mustBeReliable: true });
        user.addLayer(bgLayer);
        const bgOrders: any[] = [OrderBuilder.fill(' ', BG, BG)];
        // Plain colored background without perspective lines
        bgLayer.setOrders(bgOrders);

        const courtLayer = new Layer(new Vector2(OX, OY), 1, W, H);
        user.addLayer(courtLayer);

        const uiLayer = new Layer(new Vector2(OX, OY), 2, W, H);
        user.addLayer(uiLayer);

        const itemLayer = new Layer(new Vector2(OX, OY), 3, W, H);
        user.addLayer(itemLayer);

        const paddleLayer = new Layer(new Vector2(OX, OY), 4, W, H);
        user.addLayer(paddleLayer);

        const ballLayer = new Layer(new Vector2(OX, OY), 5, W, H);
        user.addLayer(ballLayer);

        // Bricks Init
        const bricks: Brick[] = [];
        const innerW = W - 6; // Space between bevels (3 cells on each side)
        const totalBricksW = BRICK_COLS * BRICK_W;
        const startX = 3 + Math.floor((innerW - totalBricksW) / 2);

        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                bricks.push({
                    x: startX + c * BRICK_W,
                    y: BRICK_TOP + r * BRICK_H,
                    color: BRICK_COLORS[r],
                    alive: true,
                });
            }
        }

        user.data = {
            bgLayer, courtLayer, uiLayer, paddleLayer, ballLayer, itemLayer,
            paddleX: W / 2,
            paddleWidth: PADDLE_W,
            ballX: W / 2, ballY: H / 2, ballVX: 0, ballVY: 0,
            bricks, items: [], score: 0, lives: 3,
            serving: true, gameOver: false,
            shakeX: 0, shakeY: 0, particles: [], trail: [],
            paddleHitFlash: 0, ballFlashLife: 0,
            wideTimer: 0, superTimer: 0,
        };

        const registry = user.getInputBindingRegistry();
        registry.defineAxis(0, 'MX', [{ sourceId: 0, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight }]);
        registry.defineButton(1, 'ACTION', [{ sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.Space }]);

        this.resetBall(user.data);
    }

    private resetBall(d: BreakoutUserData) {
        d.serving = true;
        d.ballX = Math.floor(d.paddleX);
        d.ballY = PADDLE_Y - 1;
        d.ballVX = 0;
        d.ballVY = 0;
        d.trail = [];
        d.wideTimer = 0;
        d.superTimer = 0;
        d.paddleWidth = PADDLE_W;
        // Keep items on screen or clear? Let's keep them.
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<BreakoutUserData>) {
        const d = user.data;

        // ── 0. ABSOLUTE PHYSICS (Always runs, regardless of state) ──────────
        for (let i = d.items.length - 1; i >= 0; i--) {
            const it = d.items[i];

            // Gravity is constant and independent of game state
            const fallSpeed = it.y > PADDLE_Y ? 0.8 : 0.4;
            it.y += fallSpeed;

            // Collection Check (stopped once item passes the paddle depth)
            const canCollect = !d.gameOver && !d.serving && it.y <= PADDLE_Y + 0.5;
            if (canCollect && it.y >= PADDLE_Y - 1.5) {
                if (Math.abs(it.x - d.paddleX) < d.paddleWidth / 2 + 1.2) {
                    if (it.type === 'LIFE') d.lives = Math.min(5, d.lives + 1);
                    else if (it.type === 'WIDE') d.wideTimer = POWERUP_DURATION;
                    else if (it.type === 'SUPER') d.superTimer = POWERUP_DURATION;

                    d.items.splice(i, 1);
                    d.paddleHitFlash = BALL_FLASH_DURATION;
                    this.triggerShake(d, 0.2, 0);
                    continue;
                }
            }

            // Cleanup
            if (it.y > H + 10) d.items.splice(i, 1);
        }

        const move = user.getAxis('MX');

        // Visual Particles only
        for (let i = d.particles.length - 1; i >= 0; i--) {
            const p = d.particles[i];
            p.x += p.vx; p.y += p.vy; p.life -= 1;
            if (p.life <= 0) d.particles.splice(i, 1);
        }

        // ── 1. Game Timers ────────────────────────────────────────────────

        d.paddleX += move * 1.5;

        if (d.wideTimer > 0) {
            d.wideTimer -= 1;
            d.paddleWidth = PADDLE_W + 6;
            if (d.wideTimer <= 0) d.paddleWidth = PADDLE_W;
        }
        if (d.superTimer > 0) d.superTimer -= 1;

        if (!d.gameOver) {
            const halfP = d.paddleWidth / 2;
            d.paddleX = Math.max(3 + halfP, Math.min(W - 4 - halfP, d.paddleX));
        }

        if (!d.gameOver) {
            if (d.serving) {
                d.ballX = d.paddleX;
                if (!!user.getButton('ACTION')) {
                    d.serving = false;
                    d.ballVX = (Math.random() - 0.5) * 2;
                    d.ballVY = -BALL_SPEED_START;
                }
            } else {
                // 2. Ball Physics
                d.trail.unshift({ x: d.ballX, y: d.ballY });
                if (d.trail.length > TRAIL_LENGTH) d.trail.pop();

                d.ballX += d.ballVX;
                d.ballY += d.ballVY;

                // Walls
                if (d.ballX <= 3) { d.ballX = 3; d.ballVX *= -1; this.triggerShake(d, 0.5, 0); }
                if (d.ballX >= W - 4) { d.ballX = W - 4; d.ballVX *= -1; this.triggerShake(d, -0.5, 0); }
                if (d.ballY <= 3) { d.ballY = 3; d.ballVY *= -1; this.triggerShake(d, 0, 0.5); }

                // Paddle Collision
                if (d.ballVY > 0 && d.ballY >= PADDLE_Y - 1 && d.ballY <= PADDLE_Y) {
                    const px = Math.round(d.paddleX);
                    if (Math.abs(d.ballX - px) < d.paddleWidth / 2 + 1) {
                        d.ballY = PADDLE_Y - 1;
                        d.ballVY = -Math.abs(d.ballVY);
                        d.ballVX += (d.ballX - d.paddleX) * 0.4;
                        // Cap speed
                        const speed = Math.sqrt(d.ballVX * d.ballVX + d.ballVY * d.ballVY);
                        const angle = Math.atan2(d.ballVY, d.ballVX);
                        const newSpeed = Math.min(BALL_SPEED_MAX, speed + 0.05);
                        d.ballVX = Math.cos(angle) * newSpeed;
                        d.ballVY = Math.sin(angle) * newSpeed;

                        d.paddleHitFlash = BALL_FLASH_DURATION;
                        this.triggerShake(d, 0, -1);
                    }
                }

                // Brick Collision
                for (const b of d.bricks) {
                    if (!b.alive) continue;
                    if (d.ballX >= b.x && d.ballX < b.x + BRICK_W && d.ballY >= b.y && d.ballY < b.y + BRICK_H) {
                        b.alive = false;
                        if (d.superTimer <= 0) d.ballVY *= -1;
                        d.score += 10;
                        d.ballFlashLife = BALL_FLASH_DURATION;
                        this.spawnParticles(d, d.ballX, d.ballY, b.color);
                        this.triggerShake(d, 0, 0.3);

                        // Power-up spawn
                        if (Math.random() < POWERUP_CHANCE) {
                            const types: PowerUpType[] = ['LIFE', 'WIDE', 'SUPER'];
                            const type = types[Math.floor(Math.random() * types.length)];
                            d.items.push({ x: b.x + BRICK_W / 2, y: b.y, type, alive: true });
                        }
                        if (d.superTimer <= 0) break;
                    }
                }
                // Win condition check: are there any bricks left?
                if (!d.bricks.some(b => b.alive)) {
                    d.gameOver = true;
                    d.items = []; // Clear items on win
                }

                // Death
                if (d.ballY > H) {
                    d.lives--;
                    if (d.lives <= 0) d.gameOver = true;
                    else this.resetBall(d);
                }
            }
        }

        // 4. Shake Management
        d.shakeX *= SHAKE_DECAY; d.shakeY *= SHAKE_DECAY;
        const ox = Math.round(d.shakeX), oy = Math.round(d.shakeY);
        [d.courtLayer, d.uiLayer, d.paddleLayer, d.ballLayer, d.itemLayer].forEach(l => l.setOrigin(new Vector2(OX + ox, OY + oy)));

        if (d.paddleHitFlash > 0) d.paddleHitFlash--;
        if (d.ballFlashLife > 0) d.ballFlashLife--;

        this.draw(d);
    }

    private triggerShake(d: BreakoutUserData, sx: number, sy: number) {
        d.shakeX = sx * SHAKE_INTENSITY;
        d.shakeY = sy * SHAKE_INTENSITY;
    }

    private spawnParticles(d: BreakoutUserData, x: number, y: number, color: number) {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const life = Math.floor(PARTICLE_LIFE * (0.5 + Math.random() * 0.5));
            d.particles.push({
                x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                life, maxLife: life, color, char: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
            });
        }
    }

    private drawBigDigit(orders: any[], digit: number, x: number, y: number, color: number) {
        const grid = DIGITS[digit];
        if (!grid) return;
        for (let i = 0; i < grid.length; i++) {
            if (grid[i]) orders.push(OrderBuilder.char(x + (i % 3), y + Math.floor(i / 3), ' ', 255, color));
        }
    }

    private draw(d: BreakoutUserData) {
        const courtOrders: any[] = [];
        const uiOrders: any[] = [];
        const paddleOrders: any[] = [];
        const ballOrders: any[] = [];

        // ── 3. Frame (Z=1 courtLayer) ────────────────────────────────────────
        // Outer face
        courtOrders.push(OrderBuilder.line(0, 0, W - 1, 0, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(0, 0, 0, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        courtOrders.push(OrderBuilder.line(W - 1, 0, W - 1, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_HI }));
        // Bevels
        courtOrders.push(OrderBuilder.line(1, 1, W - 2, 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(1, 1, 1, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(W - 2, 1, W - 2, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_MID }));
        courtOrders.push(OrderBuilder.line(2, 2, W - 3, 2, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(2, 2, 2, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));
        courtOrders.push(OrderBuilder.line(W - 3, 2, W - 3, H - 1, { charCode: ' ', fgColor: BG, bgColor: FRAME_LO }));

        // Bricks
        for (const b of d.bricks) {
            if (!b.alive) continue;
            courtOrders.push(OrderBuilder.rect(b.x, b.y, BRICK_W - 1, BRICK_H - 1, ' ', BG, b.color, true));
        }
        d.courtLayer.setOrders(courtOrders);

        // ── UI (Z=2) ────────────────────────────────────────────────────────
        let heartsStr = '';
        for (let i = 0; i < d.lives; i++) heartsStr += '♥';
        uiOrders.push(OrderBuilder.text(4, 1, heartsStr, B_RED, 255));
        let scoreStr = d.score.toString();
        while (scoreStr.length < 4) scoreStr = '0' + scoreStr;
        const scoreX = Math.floor(W / 2 - (scoreStr.length * 4) / 2);
        for (let i = 0; i < scoreStr.length; i++) {
            this.drawBigDigit(uiOrders, parseInt(scoreStr[i]), scoreX + i * 4, 1, SCORE_COLOR);
        }
        if (d.serving && !d.gameOver) uiOrders.push(OrderBuilder.text(Math.floor(W / 2 - 10), Math.floor(H / 2 + 6), 'PRESS SPACE TO START', B_BLUE, 255));
        if (d.gameOver) {
            const win = d.bricks.every(b => !b.alive);
            const msg = win ? 'YOU WIN!' : 'GAME OVER';
            uiOrders.push(OrderBuilder.text(Math.floor(W / 2 - msg.length / 2), Math.floor(H / 2), msg, win ? B_GREEN : B_RED, 255));
        }

        d.uiLayer.setOrders(uiOrders);

        // ── Paddle (Z=3) ─────────────────────────────────────────────────────
        const px = Math.round(d.paddleX), py = PADDLE_Y;
        const pw = d.paddleWidth;
        const gColor = d.paddleHitFlash > 0 ? PADDLE_HIT_GLOW : PADDLE_GLOW;
        paddleOrders.push(OrderBuilder.rect(px - pw / 2 - 1, py - 1, pw + 2, 3, ' ', BG, gColor, true));
        paddleOrders.push(OrderBuilder.rect(px - pw / 2, py, pw, 1, '█', PADDLE, 255, true));
        d.paddleLayer.setOrders(paddleOrders);

        // ── Items (Z=3) ────────────────────────────────────────────────────
        const itemOrders: any[] = [];
        for (const it of d.items) {
            let char = POWERUP_ICONS[it.type];
            let color = POWERUP_COLORS[it.type];
            // Sink effect: if passed the paddle, get smaller and darker
            if (it.y > PADDLE_Y + 0.5) {
                char = '·';
                color = FRAME_LO;
            }
            itemOrders.push(OrderBuilder.char(Math.round(it.x), Math.round(it.y), char, color, 255));
        }
        d.itemLayer.setOrders(itemOrders);

        // ── Ball & FX (Z=4) ──────────────────────────────────────────────────
        // Trail interpolation
        const trailDots: any[] = [];
        const trailColor = d.superTimer > 0 ? B_ORANGE : BALL_COLOR;
        const fullPath = [{ x: d.ballX, y: d.ballY }, ...d.trail];
        for (let i = 0; i < fullPath.length - 1; i++) {
            const p1 = fullPath[i], p2 = fullPath[i + 1];
            const color = [trailColor, BALL_MID, BALL_DIM][Math.min(i, 2)] || BALL_DIM;
            trailDots.push({ posX: Math.round(p2.x), posY: Math.round(p2.y), charCode: '·', fgColorCode: color, bgColorCode: 255 });
            const dx = p2.x - p1.x, dy = p2.y - p1.y, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1.2) {
                const steps = Math.floor(dist);
                for (let s = 1; s < steps; s++) {
                    trailDots.push({ posX: Math.round(p1.x + (dx * s) / steps), posY: Math.round(p1.y + (dy * s) / steps), charCode: '.', fgColorCode: color, bgColorCode: 255 });
                }
            }
        }
        if (trailDots.length) ballOrders.push(OrderBuilder.dotCloudMulti(trailDots));

        // Particles
        const pDots: any[] = [];
        for (const p of d.particles) {
            pDots.push({ posX: Math.round(p.x), posY: Math.round(p.y), charCode: p.char, fgColorCode: p.color, bgColorCode: 255 });
        }
        if (pDots.length) ballOrders.push(OrderBuilder.dotCloudMulti(pDots));

        if (!d.serving || Math.floor(Date.now() / 200) % 2) {
            const bColor = d.superTimer > 0 ? B_ORANGE : (d.ballFlashLife > 0 ? B_YELLOW : BALL_COLOR);
            ballOrders.push(OrderBuilder.char(Math.round(d.ballX), Math.round(d.ballY), '•', bColor, 255));
        }
        d.ballLayer.setOrders(ballOrders);
    }

    update() { }
}
