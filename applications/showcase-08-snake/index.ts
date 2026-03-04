/**
 * Name: minimal
 * Description: Snake — the smallest complete game possible with Primitiv.
 * Arrow keys to move. Eat ♦ to grow. Don't hit walls or yourself.
 */
import {
    Engine, User, Layer, Display, OrderBuilder, Vector2,
    KeyboardInput, InputDeviceType,
    type IApplication, type IRuntime,
} from '@primitiv/engine';

const WIDTH = 22, HEIGHT = 14;

// Palette color IDs
const BG = 0;
const WALL = 1;
const SNAKE = 2;
const DANGER = 3;
const FOOD = 4;
const TEXT = 5;

// Per-user application data
interface SnakeUserData {
    gameLayer: Layer;
    snake: { x: number; y: number }[];
    direction: { x: number; y: number };
    nextDirection: { x: number; y: number };
    food: { x: number; y: number };
    alive: boolean;
    score: number;
}

function spawnFood(snake: { x: number; y: number }[]): { x: number; y: number } {
    let x: number, y: number;
    do {
        x = 1 + Math.floor(Math.random() * (WIDTH - 2));
        y = 2 + Math.floor(Math.random() * (HEIGHT - 3));
    } while (snake.some(segment => segment.x === x && segment.y === y));
    return { x, y };
}

export class Minimal implements IApplication<Engine, User<SnakeUserData>> {

    async init(runtime: IRuntime, engine: Engine) {
        // Create and load palette
        engine.loadPaletteToSlot(0, [
            { colorId: BG, r: 10, g: 10, b: 18, a: 255 }, // Dark background
            { colorId: WALL, r: 60, g: 60, b: 90, a: 255 }, // Dim wall
            { colorId: SNAKE, r: 80, g: 220, b: 120, a: 255 }, // Green snake
            { colorId: DANGER, r: 255, g: 80, b: 80, a: 255 }, // Red game over
            { colorId: FOOD, r: 255, g: 220, b: 50, a: 255 }, // Yellow food
            { colorId: TEXT, r: 200, g: 200, b: 220, a: 255 }, // Light text
        ]);

        // Set application tick rate
        runtime.setTickRate(8);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<SnakeUserData>) {
        // Create the viewport
        const display = new Display(0, WIDTH, HEIGHT);
        user.addDisplay(display);
        display.switchPalette(0);

        // Create the static wall layer
        const wallLayer = new Layer(new Vector2(0, 0), 0, WIDTH, HEIGHT, { mustBeReliable: true });
        user.addLayer(wallLayer);

        const wallGrid = Array.from({ length: WIDTH * HEIGHT }, (_, index) => {
            const x = index % WIDTH, y = Math.floor(index / WIDTH);
            return x === 0 || x === WIDTH - 1 || y === 1 || y === HEIGHT - 1;
        });
        wallLayer.setOrders([
            OrderBuilder.fill(' ', BG, BG),
            OrderBuilder.text(1, 0, 'SNAKE', TEXT, BG),
            OrderBuilder.bitmask(0, 0, WIDTH, HEIGHT, wallGrid, '#', WALL, BG),
        ]);
        wallLayer.commit();

        // Create the dynamic game layer
        const gameLayer = new Layer(new Vector2(0, 0), 1, WIDTH, HEIGHT);
        user.addLayer(gameLayer);

        // Initial snake: 3 segments going right
        const snake = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
        user.data = {
            gameLayer,
            snake,
            direction: { x: 1, y: 0 },
            nextDirection: { x: 1, y: 0 },
            food: spawnFood(snake),
            alive: true,
            score: 0,
        };

        // Bind keyboard arrows to axes
        const registry = user.getInputBindingRegistry();
        registry.defineAxis(0, 'MX', [{ sourceId: 0, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight }]);
        registry.defineAxis(1, 'MY', [{ sourceId: 1, type: InputDeviceType.Keyboard, negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown }]);
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<SnakeUserData>) {
        const data = user.data;

        // Read input — prevent 180° reversal
        const inputX = Math.round(user.getAxis('MX'));
        const inputY = Math.round(user.getAxis('MY'));
        if (inputX && inputX !== -data.direction.x) data.nextDirection = { x: inputX, y: 0 };
        else if (inputY && inputY !== -data.direction.y) data.nextDirection = { x: 0, y: inputY };

        // If snake alive, update game state
        if (data.alive) {
            data.direction = data.nextDirection;
            const head = { x: data.snake[0].x + data.direction.x, y: data.snake[0].y + data.direction.y };

            // Check collision with walls or self
            const hitsWall = head.x <= 0 || head.x >= WIDTH - 1 || head.y <= 1 || head.y >= HEIGHT - 1;
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

        // Draw game state
        const orders: any[] = [];
        orders.push(OrderBuilder.text(8, 0, `Score: ${data.score}`, TEXT, BG));
        orders.push(OrderBuilder.char(data.food.x, data.food.y, '♦', FOOD, BG));
        orders.push(OrderBuilder.polyline(data.snake, '█', SNAKE));
        orders.push(OrderBuilder.char(data.snake[0].x, data.snake[0].y, '@', SNAKE, BG));
        if (!data.alive) orders.push(OrderBuilder.text(6, 6, 'GAME OVER!', DANGER, BG));

        // Register orders and commit
        data.gameLayer.setOrders(orders);
        data.gameLayer.commit();
    }

    update() { }
}
