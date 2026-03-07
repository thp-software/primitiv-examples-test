/**
 * Name: showcase-11-minimal-example
 * Category: showcase
 * Description: A minimal interactive code example used for articles and tutorials.
 */
import {
    Engine,
    Layer,
    OrderBuilder,
    User,
    Display,
    Vector2,
    InputDeviceType,
    KeyboardInput,
    type IApplication,
    type IRuntime,
} from '@primitiv/engine';

interface PlayerData {
    layer: Layer;
    x: number;
    y: number;
}

export class MyGame implements IApplication<Engine, User<PlayerData>> {

    async init(runtime: IRuntime, engine: Engine) {
        engine.loadPaletteToSlot(0, [
            { colorId: 0, r: 0, g: 0, b: 0, a: 255 },
            { colorId: 1, r: 255, g: 255, b: 255, a: 255 },
            { colorId: 2, r: 0, g: 255, b: 0, a: 255 }
        ]);

        runtime.setTickRate(20);
    }

    async initUser(_runtime: IRuntime, _engine: Engine, user: User<PlayerData>) {
        const display = new Display(0, 40, 25);
        user.addDisplay(display);
        display.switchPalette(0);

        const layer = new Layer(new Vector2(0, 0), 0, 40, 25);
        user.addLayer(layer);

        user.data = { layer, x: 20, y: 12 };

        const registry = user.getInputBindingRegistry();
        registry.defineAxis(0, 'mx', [{
            sourceId: 0, type: InputDeviceType.Keyboard,
            negativeKey: KeyboardInput.ArrowLeft, positiveKey: KeyboardInput.ArrowRight
        }]);
        registry.defineAxis(1, 'my', [{
            sourceId: 1, type: InputDeviceType.Keyboard,
            negativeKey: KeyboardInput.ArrowUp, positiveKey: KeyboardInput.ArrowDown
        }]);
    }

    update() {
        // Update common to all users.
    }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<PlayerData>) {
        const d = user.data;
        d.x = Math.max(0, Math.min(39, d.x + user.getAxis('mx')));
        d.y = Math.max(0, Math.min(24, d.y + user.getAxis('my')));

        // Set render for this user.
        d.layer.setOrders([
            OrderBuilder.text(0, 0, 'Arrow keys to move', 1, 255),
            OrderBuilder.char(d.x, d.y, '@', 2, 255),
        ]);
    }

    async destroyUser() {
        // Clean user data, save in db...
    }
}