/**
 * Name: showcase-08-snake
 * Category: showcase
 * Description: The smallest complete game possible with Primitiv - a fully
 *   playable Minimal Snake clone. One palette, two layers, two
 *   input axes, and five drawing orders per frame.
 *
 * Architecture:
 *   - Layer 0 (walls): Static border + title, mustBeReliable: true.
 *     Drawn once on connect, zero per-tick network cost.
 *   - Layer 1 (game): Dynamic snake, food, score, game-over text.
 *     Rebuilt every tick with text, char, and polyline orders.
 *
 * Key Primitiv Concepts demonstrated:
 *   - Minimal application structure: init → initUser → updateUser.
 *   - Static vs dynamic layers: walls committed once, game layer every tick.
 *   - Input bindings: two axes (MX, MY) mapped to arrow keys.
 *   - OrderBuilder variety: fill, text, bitmask, char, polyline in one app.
 */
import {
    Engine, User, Layer, Display, OrderBuilder, Vector2,
    KeyboardInput, InputDeviceType,
    type IApplication, type IRuntime,
} from '@primitiv/engine';

// ─── Grid dimensions ─────────────────────────────────────────────────────────
const WIDTH = 22, HEIGHT = 14;

// ─── Palette color IDs ───────────────────────────────────────────────────────
const BG_COLOR = 0;
const SNAKE_COLOR = 2;
const DANGER_COLOR = 3;
const FOOD_COLOR = 4;
const TEXT_COLOR = 5;

// ─── Per-user application state ──────────────────────────────────────────────

interface SnakeUserData {
    gameLayer: Layer;
    snake: { x: number; y: number }[];
    direction: { x: number; y: number };
    nextDirection: { x: number; y: number };
    food: { x: number; y: number };
    alive: boolean;
    score: number;
    moveTimer: number;
}

/** Spawn food at a random position, rejection-sampled to avoid the snake. */
function spawnFood(snake: { x: number; y: number }[]): { x: number; y: number } {
    let x: number, y: number;
    do {
        x = 1 + Math.floor(Math.random() * (WIDTH - 2));
        y = 1 + Math.floor(Math.random() * (HEIGHT - 2));
    } while (snake.some(segment => segment.x === x && segment.y === y));
    return { x, y };
}

// ─── Application ─────────────────────────────────────────────────────────────

export class Minimal implements IApplication<Engine, User<SnakeUserData>> {

    async init(runtime: IRuntime, engine: Engine) {
        engine.loadPaletteToSlot(0, [
            { colorId: BG_COLOR, r: 12, g: 14, b: 20, a: 255 },      // Deep Midnight
            { colorId: SNAKE_COLOR, r: 50, g: 180, b: 130, a: 255 },   // Rich Emerald
            { colorId: DANGER_COLOR, r: 210, g: 60, b: 60, a: 255 },   // Muted Crimson
            { colorId: FOOD_COLOR, r: 230, g: 170, b: 40, a: 255 },    // Golden Amber
            { colorId: TEXT_COLOR, r: 190, g: 200, b: 210, a: 255 },   // Silver Mist
        ]);
        runtime.setTickRate(20);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<SnakeUserData>) {
        // ── Display ──────────────────────────────────────────────────────────
        const display = new Display(0, WIDTH, HEIGHT);
        user.addDisplay(display);
        display.switchPalette(0);

        // ── Layer 0: static walls ────────────────────────────────────────────
        const wallLayer = new Layer(new Vector2(0, 0), 0, WIDTH, HEIGHT, { mustBeReliable: true });
        user.addLayer(wallLayer);

        wallLayer.setOrders([
            OrderBuilder.fill(' ', BG_COLOR, BG_COLOR),
            OrderBuilder.line(0, 0, WIDTH - 1, 0, { charCode: ' ', bgColor: TEXT_COLOR }),
            OrderBuilder.line(0, HEIGHT - 1, WIDTH - 1, HEIGHT - 1, { charCode: ' ', bgColor: TEXT_COLOR }),
            OrderBuilder.line(0, 0, 0, HEIGHT - 1, { charCode: ' ', bgColor: TEXT_COLOR }),
            OrderBuilder.line(WIDTH - 1, 0, WIDTH - 1, HEIGHT - 1, { charCode: ' ', bgColor: TEXT_COLOR }),
            OrderBuilder.text(1, 0, ' SNAKE ', BG_COLOR, TEXT_COLOR),
        ]);

        // ── Layer 1: dynamic game state (rebuilt every tick) ─────────────────
        const gameLayer = new Layer(new Vector2(0, 0), 1, WIDTH, HEIGHT);
        user.addLayer(gameLayer);

        const snake = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
        user.data = {
            gameLayer,
            snake,
            direction: { x: 1, y: 0 },
            nextDirection: { x: 1, y: 0 },
            food: spawnFood(snake),
            alive: true,
            score: 0,
            moveTimer: 0,
        };

        // ── Input ────────────────────────────────────────────────────────────
        const registry = user.getInputBindingRegistry();
        registry.defineAxis(0, 'MX', [{ sourceId: 0, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight }]);
        registry.defineAxis(1, 'MY', [{ sourceId: 1, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown }]);
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<SnakeUserData>) {
        const data = user.data;

        // ── 1. Read input - prevent 180° reversal ────────────────────────────
        const inputX = Math.round(user.getAxis('MX'));
        const inputY = Math.round(user.getAxis('MY'));
        if (inputX && inputX !== -data.direction.x) data.nextDirection = { x: inputX, y: 0 };
        else if (inputY && inputY !== -data.direction.y) data.nextDirection = { x: 0, y: inputY };

        // ── 2. Advance game state ────────────────────────────────────────────
        data.moveTimer += 8;
        if (data.alive && data.moveTimer >= 20) {
            data.moveTimer -= 20;

            data.direction = data.nextDirection;
            const head = { x: data.snake[0].x + data.direction.x, y: data.snake[0].y + data.direction.y };

            const hitsWall = head.x < 1 || head.x >= WIDTH - 1 || head.y < 1 || head.y >= HEIGHT - 1;
            const hitsSelf = data.snake.some(segment => segment.x === head.x && segment.y === head.y);

            if (hitsWall || hitsSelf) {
                data.alive = false;
            } else {
                data.snake.unshift(head);
                if (head.x === data.food.x && head.y === data.food.y) {
                    data.score++;
                    data.food = spawnFood(data.snake);
                } else {
                    data.snake.pop();
                }
            }
        }

        // ── 3. Draw game state ───────────────────────────────────────────────
        const layer = data.gameLayer;

        const orders = [
            OrderBuilder.text(10, 0, ` Score: ${data.score} `, BG_COLOR, TEXT_COLOR),
            OrderBuilder.char(data.food.x, data.food.y, '♦', FOOD_COLOR, 255),
            OrderBuilder.polyline(data.snake, '█', SNAKE_COLOR),
            OrderBuilder.char(data.snake[0].x, data.snake[0].y, '@', SNAKE_COLOR, 255)
        ];

        if (!data.alive) {
            orders.push(OrderBuilder.text(6, 6, ' GAME OVER! ', DANGER_COLOR, TEXT_COLOR));
        }

        layer.setOrders(orders);

    }

    update() { }
}

