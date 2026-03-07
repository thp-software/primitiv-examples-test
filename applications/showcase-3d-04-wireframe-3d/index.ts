/**
 * Name: Synthwave AI
 * Category: showcase
 * Description: Infinite retro-city dodging game with AI autopilot.
 *
 * What it demonstrates (engine perspective):
 *   This showcase demonstrates how the Primitiv engine can compute and rasterize 
 *   pure 3D vector graphics (lines) completely inside a 2D character-cell pipeline.
 *   It showcases custom implementation of Bresenham's line algorithm with math-based 3D 
 *   projection, custom depth-fog clipping, and pseudo-random procedural terrain generation.
 *
 * How it works (algorithm):
 *   1. A lightweight 3D Vector engine (projecting {x, y, z} coordinates onto a 2D plane)
 *      calculates the screen positions using simple frustum division.
 *   2. The map operates on an infinite scrolling treadmill constraint using a modulo step 
 *      on the camera Z. Objects (buildings, obstacles) that pass behind the camera are strictly 
 *      recycled and re-injected dynamically far off into the horizon grid.
 *   3. Mountains are fully procedural volumetric meshes generated using layered 
 *      sine/cosine noise functions connecting points on the X and Z axes.
 *   4. A custom Bresenham's line algorithm translates coordinate lines into 
 *      Primitiv pixel dots, complete with loop failsafes and depth clipping.
 *   5. An AI Autopilot Algorithm manages 100% of the movement natively: accelerating to a cruising 
 *      speed and computing real-time safety dodge trajectories on the X-axis.
 *
 * Primitiv patterns used:
 *   - Massive `dotCloudMulti` order payloads for high-density particle arrays (stars, sun slices, frame dots).
 *   - Painters Algorithm implementation for drawing Background objects (Sun, Stars) before Foregrounds (3D Lines).
 *   - Depth based visual geometry texturing: far away lines change their character symbols 
 *     ('#', '+', ':', '.') to simulate ASCII depth fog.
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
    ScalingMode,
    type IApplication,
    type IRuntime,
} from "@primitiv/engine";

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Building {
    x: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    color: number;
}

interface Obstacle {
    x: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    color: number;
    active: boolean;
}

interface WireframeUserData {
    layer: Layer;
    buildings: Building[];
    obstacles: Obstacle[];
    cameraZ: number;
    speed: number;
    cameraX: number;
    cameraY: number;
    score: number;
    gameOver: boolean;
    acceleration: number;
}

export class Wireframe3DShowcase implements IApplication<Engine, User<WireframeUserData>> {
    async init(_runtime: IRuntime, engine: Engine): Promise<void> {
        // Synthwave color palette
        engine.loadPaletteToSlot(0, [
            { colorId: 0, r: 5, g: 5, b: 20, a: 255 },       // Deep Dark Blue (Bg)
            { colorId: 1, r: 0, g: 255, b: 255, a: 255 },    // Neon Cyan (Buildings)
            { colorId: 2, r: 255, g: 0, b: 255, a: 255 },    // Neon Magenta (Road Grid)
            { colorId: 3, r: 255, g: 255, b: 0, a: 255 },    // Neon Yellow (Highlights/Score)
            { colorId: 4, r: 0, g: 0, b: 0, a: 255 },        // True Black (Text Bg)
            { colorId: 5, r: 255, g: 50, b: 50, a: 255 },    // Danger Red (Obstacles)
        ]);
        _runtime.setTickRate(60);
    }

    initUser(_runtime: IRuntime, _engine: Engine, user: User<WireframeUserData>): void {
        const width = 240;
        const height = 134; // Wide screen

        const display = new Display(0, width, height);
        display.setScalingMode(ScalingMode.None);

        // CRT scanlines for retro synthwave look
        display.setPostProcess({
            scanlines: {
                enabled: true,
                opacity: 0.2,
                pattern: 'horizontal',
                spacing: 3,
                thickness: 1,
                color: { r: 0, g: 0, b: 0 }
            }
        });

        // Ambilight edge glow (neon bleed around the display)
        display.setAmbientEffect({
            enabled: true,
            blur: 40,
            scale: 2.5,
            opacity: 1,
        });

        user.addDisplay(display);
        display.switchPalette(0);

        const layer = new Layer(new Vector2(0, 0), 0, width, height, {
            mustBeReliable: false,
        });
        user.data.layer = layer;
        user.addLayer(layer);

        this.resetGame(user.data);

        // Controls
        const registry = user.getInputBindingRegistry();
        registry.defineButton(0, "ACCELERATE", [{ sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowUp }]);
        registry.defineButton(1, "BRAKE", [{ sourceId: 2, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowDown }]);
        registry.defineButton(2, "LEFT", [{ sourceId: 3, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowLeft }]);
        registry.defineButton(3, "RIGHT", [{ sourceId: 4, type: InputDeviceType.Keyboard, key: KeyboardInput.ArrowRight }]);
        registry.defineButton(4, "RESTART", [{ sourceId: 5, type: InputDeviceType.Keyboard, key: KeyboardInput.Space }]);
    }

    private resetGame(data: WireframeUserData) {
        data.cameraZ = 0;
        data.speed = 1.0;
        data.cameraX = 0;
        data.cameraY = 8; // Camera height
        data.score = 0;
        data.gameOver = false;
        data.acceleration = 0;

        // Generate buildings aligned on a neat grid
        data.buildings = [];
        for (let i = 0; i < 12; i++) {
            const z = i * 100; // Spaced evenly by 100 units
            this.spawnBuilding(data, z, 0); // Left Side
            this.spawnBuilding(data, z, 1); // Right Side
        }

        // Generate initial obstacles
        data.obstacles = [];
        for (let i = 1; i < 6; i++) {
            this.spawnObstacle(data, i * 150); // Spawn fewer, further out
        }
    }

    private spawnBuilding(data: WireframeUserData, z: number, side: number) {
        // Enormous city blocks for architectural scale
        let x = side === 0 ? -50 : 50;

        data.buildings.push({
            x: x,
            z: z,
            width: 40,   // Massive width
            height: 60 + Math.random() * 120, // Towering height
            depth: 40,   // Massive depth
            color: Math.random() > 0.8 ? 3 : 1 // Mostly Cyan, sometimes Yellow
        });
    }

    private spawnObstacle(data: WireframeUserData, z: number) {
        // Spawn randomly within the road bounds (X: -12 to 12)
        const x = (Math.random() * 24) - 12;
        data.obstacles.push({
            x: x,
            z: z,
            width: 6,
            height: 8,
            depth: 6,
            color: 5, // Danger Red
            active: true
        });
    }

    update(_runtime: IRuntime, _engine: Engine): void { }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<WireframeUserData>): void {
        const data = user.data;
        const display = user.getDisplay(0)!;
        const width = display.width;
        const height = display.height;

        // --- AI Autopilot & Game Logic ---
        if (data.gameOver) {
            this.resetGame(data); // Instant retry
        } else {
            // Speed control
            if (data.speed < 4.0) {
                data.acceleration = 0.05;
            } else {
                data.acceleration = 0;
            }
            data.speed = Math.min(4.0, Math.max(1.0, data.speed + data.acceleration));

            // Steering (faster when moving faster)
            const steerSpeed = 0.5 + (data.speed * 0.15);
            const roadMaxX = 14;

            // AI: Find closest obstacle
            let closestObs: Obstacle | null = null;
            let minDist = Infinity;
            for (const obs of data.obstacles) {
                if (obs.active && obs.z > data.cameraZ) {
                    const dist = obs.z - data.cameraZ;
                    if (dist < minDist && dist < 300) { // Look ahead distance
                        minDist = dist;
                        closestObs = obs;
                    }
                }
            }

            // AI: Steer to safety
            if (closestObs) {
                const safeDistX = (closestObs.width / 2) + 2.5;

                // Are we in the collision lane of the obstacle?
                if (Math.abs(data.cameraX - closestObs.x) < safeDistX) {
                    const dodgeLeft = closestObs.x - safeDistX;
                    const dodgeRight = closestObs.x + safeDistX;

                    const canGoLeft = dodgeLeft >= -roadMaxX;
                    const canGoRight = dodgeRight <= roadMaxX;

                    if (canGoLeft && (!canGoRight || Math.abs(data.cameraX - dodgeLeft) < Math.abs(data.cameraX - dodgeRight))) {
                        data.cameraX -= steerSpeed; // Dodge Left
                    } else if (canGoRight) {
                        data.cameraX += steerSpeed; // Dodge Right
                    }
                }
            } else {
                // Gently center if no obstacles to dodge
                if (data.cameraX > 0.5) data.cameraX -= steerSpeed * 0.5;
                else if (data.cameraX < -0.5) data.cameraX += steerSpeed * 0.5;
            }

            // Clamp camera X to stay somewhat near the road
            data.cameraX = Math.max(-roadMaxX, Math.min(roadMaxX, data.cameraX));

            // Move forward and increment score
            data.cameraZ += data.speed;
            data.score += data.speed * 0.1;

            // Collision Detection with Obstacles
            // Player is approximated as a box around cameraX, cameraZ
            const playerRadius = 2.0;

            for (const obs of data.obstacles) {
                if (!obs.active) continue;

                // Z-check first (is it nearby?)
                if (Math.abs(data.cameraZ - obs.z) < (obs.depth / 2 + playerRadius)) {
                    // X-check
                    if (Math.abs(data.cameraX - obs.x) < (obs.width / 2 + playerRadius)) {
                        data.gameOver = true;
                        data.speed = 0; // stop instantly
                        break;
                    }
                }
            }

            // Recycle buildings that passed behind camera
            for (const b of data.buildings) {
                if (b.z < data.cameraZ - 40) {
                    b.z += 12 * 100; // Move far ahead (12 blocks * 100 spacing)
                    b.height = 60 + Math.random() * 120; // Randomize new height when recycled
                }
            }

            // Recycle obstacles that passed behind camera
            for (const obs of data.obstacles) {
                if (obs.z < data.cameraZ - 20) {
                    // Spread them out more, less density
                    const difficultyFactor = Math.max(150, 400 - (data.score * 0.05));
                    obs.z = data.cameraZ + 800 + (Math.random() * difficultyFactor);
                    obs.x = (Math.random() * 24) - 12;
                    obs.active = true;
                }
            }
        }

        // --- Draw logic ---
        const o: any[] = [];

        // Allocate a flat FrameBuffer matching the showcase-03 pattern
        const dots = new Array(width * height);
        dots.fill({ charCode: " ", fgColorCode: 0, bgColorCode: 0 }); // Dark background

        // Draw Starry Sky
        // Use a consistent pseudo-random distribution for the stars
        for (let i = 0; i < 150; i++) {
            // Fill the whole top half of the screen
            const sx = Math.abs(Math.floor(Math.sin(i * 12.9898 + 78.233) * 43758.5453)) % width;
            const sy = Math.abs(Math.floor(Math.cos(i * 4.1414 + 1.234) * 54321.1234)) % Math.floor(height / 2 - 5);
            // Twinkle effect based on camera movement
            if ((Math.floor(data.cameraZ * 0.1) + i) % 10 > 3) {
                dots[sy * width + sx] = { charCode: '.', fgColorCode: 1, bgColorCode: 0 }; // Cyan stars
            }
        }

        // Draw Horizon Sun
        // We draw it before the wireframes relying on painters algorithm (back to front)
        const horizonY = Math.floor(height / 2) - 1;
        const sunCenterY = horizonY; // Keep it exactly on the horizon
        const sunRadius = 26;

        for (let sy = 0; sy < sunRadius; sy++) {
            // Cut slices of the sun for that retro grid effect
            if (sy % 4 !== 0) {
                const sliceWidth = Math.sqrt(sunRadius * sunRadius - sy * sy) * 2.2; // compensate character ratio
                const startX = Math.round(width / 2 - sliceWidth);
                const endX = Math.round(width / 2 + sliceWidth);
                const yPos = Math.round(sunCenterY - sy);

                // Clip mathematically below the horizon point
                if (yPos <= horizonY) {
                    for (let px = startX; px <= endX; px++) {
                        if (px >= 0 && px < width && yPos >= 0) {
                            dots[yPos * width + px] = { charCode: '=', fgColorCode: 3, bgColorCode: 0 }; // Yellow Sun slices
                        }
                    }
                }
            }
        }

        function drawLine(x0: number, y0: number, x1: number, y1: number, char: string, fg: number) {
            // Bresenham's line algorithm with clipping
            if (isNaN(x0) || isNaN(y0) || isNaN(x1) || isNaN(y1)) return; // Failsafe
            x0 = Math.round(x0); y0 = Math.round(y0);
            x1 = Math.round(x1); y1 = Math.round(y1);

            const dx = Math.abs(x1 - x0);
            const dy = Math.abs(y1 - y0);
            const sx = (x0 < x1) ? 1 : -1;
            const sy = (y0 < y1) ? 1 : -1;
            let err = dx - dy;

            let loopCount = 0;
            while (loopCount++ < 3000) {
                // Bounds check
                if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
                    dots[y0 * width + x0] = { charCode: char, fgColorCode: fg, bgColorCode: 0 };
                }
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x0 += sx; }
                if (e2 < dx) { err += dx; y0 += sy; }
            }
        }

        const fovScale = Math.min(width, height * 2) * 0.7; // Wider view

        function project(x: number, y: number, z: number): Vector2 | null {
            const relZ = z - data.cameraZ;
            if (relZ < 1) return null; // Behind camera

            const relX = x - data.cameraX;
            const relY = y - data.cameraY;

            const px = (relX / relZ) * fovScale + width / 2;
            const py = -(relY / relZ) * (fovScale * 0.5) + height / 2;
            return new Vector2(px, py);
        }

        function drawLine3D(p1: Vector3, p2: Vector3, fg: number) {
            // Simple Z-Clipping: if both points are behind the camera, early return
            if (p1.z - data.cameraZ < 1 && p2.z - data.cameraZ < 1) return;

            let v1 = { ...p1 };
            let v2 = { ...p2 };

            // If one is behind, interpolate its coordinates to Z=1 (near plane)
            if (v1.z - data.cameraZ < 1) {
                const t = (1 - (v1.z - data.cameraZ)) / (v2.z - v1.z);
                v1.x = v1.x + t * (v2.x - v1.x);
                v1.y = v1.y + t * (v2.y - v1.y);
                v1.z = data.cameraZ + 1;
            } else if (v2.z - data.cameraZ < 1) {
                const t = (1 - (v2.z - data.cameraZ)) / (v1.z - v2.z);
                v2.x = v2.x + t * (v1.x - v2.x);
                v2.y = v2.y + t * (v1.y - v2.y);
                v2.z = data.cameraZ + 1;
            }

            // Depth Fog / Dimming based on Z distance
            const avgZ = (v1.z + v2.z) / 2;
            const dist = avgZ - data.cameraZ;
            let char = '#'; // Near
            if (dist > 800) char = '.'; // Very Far
            else if (dist > 500) char = ':'; // Far
            else if (dist > 250) char = '+'; // Mid

            const proj1 = project(v1.x, v1.y, v1.z);
            const proj2 = project(v2.x, v2.y, v2.z);
            if (proj1 && proj2) {
                drawLine(proj1.x, proj1.y, proj2.x, proj2.y, char, fg);
            }
        }

        function drawBox(x: number, z: number, w: number, h: number, d: number, color: number) {
            const hw = w / 2;
            const hd = d / 2;

            const v0 = { x: x - hw, y: 0, z: z - hd };
            const v1 = { x: x + hw, y: 0, z: z - hd };
            const v2 = { x: x + hw, y: 0, z: z + hd };
            const v3 = { x: x - hw, y: 0, z: z + hd };

            const v4 = { x: x - hw, y: h, z: z - hd };
            const v5 = { x: x + hw, y: h, z: z - hd };
            const v6 = { x: x + hw, y: h, z: z + hd };
            const v7 = { x: x - hw, y: h, z: z + hd };

            // Bottom base
            drawLine3D(v0, v1, color); drawLine3D(v1, v2, color);
            drawLine3D(v2, v3, color); drawLine3D(v3, v0, color);
            // Top base
            drawLine3D(v4, v5, color); drawLine3D(v5, v6, color);
            drawLine3D(v6, v7, color); drawLine3D(v7, v4, color);
            // Pillars
            drawLine3D(v0, v4, color); drawLine3D(v1, v5, color);
            drawLine3D(v2, v6, color); drawLine3D(v3, v7, color);
        }

        // Draw Road (Magenta)
        const roadWidth = 14;
        drawLine3D({ x: -roadWidth, y: 0, z: data.cameraZ }, { x: -roadWidth, y: 0, z: data.cameraZ + 1000 }, 2);
        drawLine3D({ x: roadWidth, y: 0, z: data.cameraZ }, { x: roadWidth, y: 0, z: data.cameraZ + 1000 }, 2);

        // Infinite scroll effect using a modulo step on the camera Z
        const roadZStart = Math.floor(data.cameraZ / 20) * 20;
        for (let z = 0; z < 1000; z += 20) {
            const absZ = roadZStart + z;
            drawLine3D({ x: -roadWidth, y: 0, z: absZ }, { x: roadWidth, y: 0, z: absZ }, 2);

            // Draw center dashed lines for speed effect
            if (z % 80 < 40) {
                drawLine3D({ x: 0, y: 0, z: absZ }, { x: 0, y: 0, z: absZ + 20 }, 3); // Yellow Dashes
            }
        }

        // Draw Volumetric Mountains on the sides (Full 3D Terrain Grid)
        for (const side of [-1, 1]) {
            // X distances from center: going outwards from 120 to 320
            const xSteps = [120, 160, 200, 240, 280, 320];

            function getMountHeight(nx: number, nz: number) {
                const depth = nx - 100;
                const amp = depth * 0.8;

                // Gentle rolling hills using sine/cosine combinations
                let h = (Math.sin(nz * 0.006 + nx * 0.015) * 0.5 + 0.5) * amp * 1.5 +
                    (Math.cos(nz * 0.011 - nx * 0.02) * 0.5 + 0.5) * amp;
                return h;
            }

            for (let z = 0; z <= 1000; z += 40) {
                const absZ = roadZStart + z;

                for (let xi = 0; xi < xSteps.length; xi++) {
                    const nx = xSteps[xi];
                    const x = nx * side;
                    const h = getMountHeight(nx, absZ);
                    const p = { x: x, y: h, z: absZ };

                    // Connect along Z axis (depth)
                    if (z > 0) {
                        const prevAbsZ = absZ - 40;
                        const hPrevZ = getMountHeight(nx, prevAbsZ);
                        drawLine3D({ x: x, y: hPrevZ, z: prevAbsZ }, p, 2);
                    }

                    // Connect along X axis (horizontal width)
                    if (xi > 0) {
                        const prevNx = xSteps[xi - 1];
                        const prevX = prevNx * side;
                        const hPrevX = getMountHeight(prevNx, absZ);
                        drawLine3D({ x: prevX, y: hPrevX, z: absZ }, p, 2);
                    } else {
                        // Connect the first ridge to the flat ground smoothly
                        drawLine3D({ x: 90 * side, y: 0, z: absZ }, p, 2);
                    }
                }
            }
        }

        // Draw Buildings
        // Sort by distance back-to-front for slightly better overdraw rendering
        const visibleBuildings = data.buildings.filter(b => b.z > data.cameraZ - 20 && b.z < data.cameraZ + 1000);
        visibleBuildings.sort((a, b) => b.z - a.z);
        for (const b of visibleBuildings) {
            drawBox(b.x, b.z, b.width, b.height, b.depth, b.color);
        }

        // Draw Obstacles
        const visibleObstacles = data.obstacles.filter(o => o.z > data.cameraZ - 20 && o.z < data.cameraZ + 1000 && o.active);
        visibleObstacles.sort((a, b) => b.z - a.z);
        for (const obs of visibleObstacles) {
            drawBox(obs.x, obs.z, obs.width, obs.height, obs.depth, obs.color);
        }

        // Submit the entire processed 2D frame buffer as a single binary order
        o.push(OrderBuilder.subFrameMulti(0, 0, width, height, dots as any));

        // UI Overlay
        if (data.gameOver) {
            o.push(OrderBuilder.text(width / 2 - 9, height / 2 - 2, "   CRASHED!   ", 5, 0));
            o.push(OrderBuilder.text(width / 2 - 12, height / 2, ` FINAL SCORE: ${Math.floor(data.score)} `, 3, 0));
            o.push(OrderBuilder.text(width / 2 - 14, height / 2 + 2, " PRESS [SPACE] TO RESTART ", 1, 0));
        } else {
            o.push(OrderBuilder.text(1, 1, `  SYNTHWAVE AI AUTOPILOT  `, 4, 3));
            o.push(OrderBuilder.text(1, 3, `Speed: ${data.speed.toFixed(1)} `, 3, 4));
            o.push(OrderBuilder.text(1, 4, `Status: Active Dodging `, 1, 4));
            o.push(OrderBuilder.text(width - 20, 1, ` SCORE: ${Math.floor(data.score)} `, 3, 4));
        }

        data.layer.setOrders(o);

    }
}
