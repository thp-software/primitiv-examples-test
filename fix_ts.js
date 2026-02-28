const fs = require('fs');

function replace(file, search, replaceStr) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(search, replaceStr);
    fs.writeFileSync(file, content);
}

// 01
replace('applications/01-simple-matrix/index.ts',
    'const frameData = data.grid.map((cell) => {',
    'const frameData = data.grid.map((cell: any) => {');

// 04
replace('applications/04-responsive-display/index.ts',
    'const frameData = data.grid.map((cell) => {',
    'const frameData = data.grid.map((cell: any) => {');

// 07
replace('applications/07-multipass/index.ts',
    'data.drops = data.drops.filter((drop) => {',
    'data.drops = data.drops.filter((drop: any) => {');

// showcase-3d-01
replace('applications/showcase-3d-01-voxel-space/index.ts',
    'update(runtime: IRuntime, engine: Engine): void {',
    'update(_runtime: IRuntime, _engine: Engine): void {');

// showcase-3d-02
replace('applications/showcase-3d-02-primitiv-craft/index.ts',
    'import { Vector2, Vector3, Matrix4x4, MatrixMath, ScalingMode } from "@primitiv/core";',
    'import { Vector2, Vector3, Matrix4x4, MatrixMath } from "@primitiv/core";'
);
replace('applications/showcase-3d-02-primitiv-craft/index.ts',
    'update(runtime: IRuntime, engine: Engine): void {',
    'update(_runtime: IRuntime, _engine: Engine): void {'
);
replace('applications/showcase-3d-02-primitiv-craft/index.ts',
    'destroyUser(runtime: IRuntime, engine: Engine, user: User<any>): void {',
    'destroyUser(_runtime: IRuntime, _engine: Engine, user: User<any>): void {'
);
replace('applications/showcase-3d-02-primitiv-craft/index.ts',
    'function setSunsetColor(pixP, i) {',
    'function setSunsetColor(pixP: any, i: any) {'
);

// showcase-3d-04
replace('applications/showcase-3d-04-wireframe-3d/index.ts',
    'updateUser(runtime: IRuntime, _engine: Engine, user: User<WireframeUserData>): void {',
    'updateUser(_runtime: IRuntime, _engine: Engine, user: User<WireframeUserData>): void {'
);
replace('applications/showcase-3d-04-wireframe-3d/index.ts',
    'a.y - b.y',
    '(a: any, b: any) => a.y - b.y'
); // wait, to be safe, I'm going to find the exact line using regex 
let c4 = fs.readFileSync('applications/showcase-3d-04-wireframe-3d/index.ts', 'utf8');
c4 = c4.replace(/o\.vertices\.sort\(\(a, b\) => a\.y - b\.y\);/g, 'o.vertices.sort((a: any, b: any) => a.y - b.y);');
c4 = c4.replace(/data\.pendingOrders\.sort\(\(a, b\) => {/g, 'data.pendingOrders.sort((a: any, b: any) => {');
c4 = c4.replace(/data\.pendingOrders\.forEach\(\(o\) => {/g, 'data.pendingOrders.forEach((o: any) => {');
fs.writeFileSync('applications/showcase-3d-04-wireframe-3d/index.ts', c4);
console.log("TS fixes applied");

