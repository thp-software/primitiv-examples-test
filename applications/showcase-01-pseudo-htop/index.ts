/**
 * Name: showcase-01
 * Description: A fake Htop-style clone plotting simulated server metrics, processes, and network resources.
 * 
 * Why study this:
 *   This showcase demonstrates how to create a complex, dense text-based user interface 
 *   (like a terminal dashboard) using Primitiv's rendering APIs in an optimized way. 
 *   It heavily utilizes string padding, color grouping, and text drawing orders. 
 * 
 * Optimization Concepts:
 *   - The 255 Orders Limit: A single Layer in Primitiv can only hold up to 255 drawing orders
 *     per tick. Because a dashboard with hundreds of processes could easily exceed this, 
 *     this app demonstrates two critical strategies:
 *       1. Grouping: Using the `multiText` order format to send multiple strings of the same color 
 *          in a single render request.
 *       2. Z-Layers: Splitting the UI across multiple Layers (`htopLayer`, `listLayer1`, `listLayer2`)
 *          to bypass the 255 limit while keeping everything correctly stacked.
 * 
 * Key Features:
 *   - Dynamic simulated data generation (CPU, Mem, Swap, Uptime).
 *   - Complex text layout using specific string alignment coordinates.
 *   - Utilizing specific CP437 block characters (e.g. `|` and `[ ]`) to draw cheap retro UI bars.
 */

import {
    Engine,
    User,
    Layer,
    Display,
    OrderBuilder,
    Vector2,
    type IApplication,
    type IRuntime,
} from '@primitiv/engine';

const W = 120;
const H = 45;

function rnd(n: number) { return Math.floor(Math.random() * n); }
function padL(s: string | number, w: number, char = ' ') { return String(s).padStart(w, char); }
function padR(s: string | number, w: number, char = ' ') { return String(s).padEnd(w, char); }

interface Process {
    pid: number;
    user: string;
    pri: string;
    ni: string;
    virt: string;
    res: string;
    shr: string;
    s: string;
    cpu: number;
    mem: number;
    time: number;
    cmd: string;
}

interface HtopSim {
    cpu: number[];
    memUsed: number; memTotal: number;
    swpUsed: number; swpTotal: number;
    tasks: number; thr: number; run: number;
    load: number[];
    uptime: number;
    procs: Process[];
}

const USERS = ['root', 'john', 'mysql', 'nginx', 'daemon', 'nobody'];
const CMDS = [
    '/sbin/init', 'kthreadd', 'ksoftirqd/0', 'rcu_sched', 'systemd-journald',
    'sshd: thomas [priv]', '/usr/bin/zsh', 'htop', 'node index.js', 'pnpm dev',
    'docker daemon', 'nginx: master process', 'redis-server', 'postgres',
    'python3 server.py', 'code --type=renderer'
];

function makeSim(): HtopSim {
    const procs: Process[] = [];
    for (let i = 0; i < 60; i++) {
        procs.push({
            pid: 1 + rnd(30000),
            user: USERS[rnd(USERS.length)],
            pri: '20',
            ni: '0',
            virt: (rnd(900) + 100) + 'M',
            res: (rnd(400) + 10) + 'M',
            shr: (rnd(50) + 5) + 'M',
            s: rnd(10) < 2 ? 'R' : 'S',
            cpu: rnd(10) + rnd(10),
            mem: rnd(15) + Math.random(),
            time: rnd(3600),
            cmd: CMDS[rnd(CMDS.length)] + (rnd(5) === 0 ? ' --debug' : '')
        });
    }
    return {
        cpu: [0, 0, 0, 0, 0, 0, 0, 0], // 8 cores
        memUsed: 4.2, memTotal: 16.0,
        swpUsed: 0.1, swpTotal: 2.0,
        tasks: 142, thr: 310, run: 2,
        load: [1.2, 0.9, 0.6],
        uptime: 3600 * 24 * 3 + rnd(10000),
        procs
    };
}

export class RetroDashboard implements IApplication<Engine, User<any>> {
    name = "Htop Clone Dashboard";
    description = "A Linux htop style dashboard with fake data.";

    private sim: HtopSim = makeSim();

    /**
     * Global initialization (called once when the application starts).
     * We load the custom color palette that mimics a standard Linux terminal.
     */
    async init(runtime: IRuntime, engine: Engine): Promise<void> {
        // Setup initial application palette (HTOP standard colors)
        engine.loadPaletteToSlot(0, [
            { colorId: 0, r: 10, g: 10, b: 10, a: 255 },  // 0 Bg
            { colorId: 1, r: 220, g: 220, b: 220, a: 255 },// 1 Text
            { colorId: 2, r: 60, g: 220, b: 60, a: 255 },  // 2 Green (CPU normal)
            { colorId: 3, r: 240, g: 80, b: 80, a: 255 },  // 3 Red (CPU high)
            { colorId: 4, r: 80, g: 180, b: 240, a: 255 }, // 4 Cyan (Mem)
            { colorId: 5, r: 220, g: 200, b: 80, a: 255 }, // 5 Yellow / Orange
            { colorId: 6, r: 180, g: 80, b: 240, a: 255 }, // 6 Magenta
            { colorId: 7, r: 60, g: 60, b: 60, a: 255 },   // 7 Dark Grey (Bar bg)
            { colorId: 8, r: 80, g: 80, b: 200, a: 255 },  // 8 Blue (Low CPU)
            { colorId: 9, r: 180, g: 240, b: 180, a: 255 },// 9 Header Text
            { colorId: 10, r: 40, g: 100, b: 40, a: 255 }  // 10 Header Bg
        ]);
        runtime.setTickRate(10);
    }

    /**
     * User initialization (called whenever a new client connects).
     * We set up the user's Display and construct multiple Layers to handle
     * the dense rendering requirements without overflowing the 255 orders/layer limit.
     */
    initUser(_runtime: IRuntime, _engine: Engine, user: User<any>): void {
        const display = new Display(0, W, H);
        user.addDisplay(display);
        display.switchPalette(0);

        // Setup 3 Z-layers to stay under 255-order limit per layer
        display.setRenderPasses([{ id: 0, zMin: 0, zMax: 2 }]);

        const htopLayer = new Layer(new Vector2(0, 0), 0, W, H, { mustBeReliable: false });
        htopLayer.commit();
        user.addLayer(htopLayer);

        const listLayer1 = new Layer(new Vector2(0, 0), 1, W, H, { mustBeReliable: false });
        listLayer1.commit();
        user.addLayer(listLayer1);

        const listLayer2 = new Layer(new Vector2(0, 0), 2, W, H, { mustBeReliable: false });
        listLayer2.commit();
        user.addLayer(listLayer2);

        user.data = { display, htopLayer, listLayer1, listLayer2 };
    }

    /**
     * Global simulation loop (called 10 times per second, based on setTickRate).
     * This updates the fake system metrics independently of the rendering.
     * All users see the same 'server state' generated here.
     */
    update(_runtime: IRuntime, _engine: Engine): void {
        const s = this.sim;
        s.uptime++;
        for (let i = 0; i < s.cpu.length; i++) {
            let next = s.cpu[i] + (Math.random() - 0.5) * 20;
            if (next < 0) next = 0;
            if (next > 100) next = 100;
            s.cpu[i] = next;
        }

        s.memUsed = Math.max(1, Math.min(s.memTotal, s.memUsed + (Math.random() - 0.5) * 0.5));

        let runCount = 0;
        for (const p of s.procs) {
            p.cpu = Math.max(0, p.cpu + (Math.random() - 0.5) * 5);
            if (p.cpu > 0) p.time += 1;
            p.s = (p.cpu > 15) ? 'R' : 'S';
            if (p.s === 'R') runCount++;
        }
        s.run = runCount;

        if (rnd(10) === 0) {
            const p = s.procs[rnd(s.procs.length)];
            p.cpu = rnd(80) + 10;
        }

        s.procs.sort((a, b) => b.cpu - a.cpu);
    }

    /**
     * Per-user render loop.
     * We take the data from the global simulation and convert it into
     * Primitiv Drawing Orders (text, rectangles, lines).
     */
    updateUser(_runtime: IRuntime, _engine: Engine, user: User<any>): void {
        const d = user.data;
        const s = this.sim;
        const o: any[] = [];

        o.push(OrderBuilder.fill(' ', 0, 0));

        const CPU_BAR_LEN = 24;
        for (let i = 0; i < s.cpu.length; i++) {
            const y = i % 4;
            const xOff = i < 4 ? 0 : 38;

            o.push(OrderBuilder.text(1 + xOff, y, padL(i + 1, 2), 4, 0));
            o.push(OrderBuilder.text(4 + xOff, y, '[', 1, 0));

            const v = s.cpu[i];
            const activeLen = Math.round((v / 100) * CPU_BAR_LEN);
            let barStr = '';
            for (let j = 0; j < CPU_BAR_LEN; j++) barStr += j < activeLen ? '|' : ' ';

            o.push(OrderBuilder.text(5 + xOff, y, barStr, 2, 0));
            o.push(OrderBuilder.text(5 + CPU_BAR_LEN + 1 + xOff, y, padL(v.toFixed(1), 5) + '%]', 1, 0));
        }

        const MEM_BAR_LEN = 36;
        const yMem = 4;
        o.push(OrderBuilder.text(1, yMem, 'Mem[', 4, 0));
        const memLen = Math.round((s.memUsed / s.memTotal) * MEM_BAR_LEN);
        o.push(OrderBuilder.text(5, yMem, '|'.repeat(memLen).padEnd(MEM_BAR_LEN, ' '), 4, 0));
        o.push(OrderBuilder.text(5 + MEM_BAR_LEN + 1, yMem, padL(`${s.memUsed.toFixed(2)}G/${s.memTotal.toFixed(2)}G`, 13) + ']', 1, 0));

        const ySwp = 5;
        o.push(OrderBuilder.text(1, ySwp, 'Swp[', 3, 0));
        const swpLen = Math.round((s.swpUsed / s.swpTotal) * MEM_BAR_LEN);
        o.push(OrderBuilder.text(5, ySwp, '|'.repeat(swpLen).padEnd(MEM_BAR_LEN, ' '), 3, 0));
        o.push(OrderBuilder.text(5 + MEM_BAR_LEN + 1, ySwp, padL(`${s.swpUsed.toFixed(1)}M/${s.swpTotal.toFixed(1)}M`, 13) + ']', 1, 0));

        const rX = 76;
        o.push(OrderBuilder.text(rX, 0, `Tasks: ${s.tasks}, ${s.thr} thr; ${s.run} running`, 1, 0));
        o.push(OrderBuilder.text(rX, 1, `Load average: ${s.load[0].toFixed(2)} ${s.load[1].toFixed(2)} ${s.load[2].toFixed(2)}`, 1, 0));

        const days = Math.floor(s.uptime / 86400);
        const hrs = Math.floor((s.uptime % 86400) / 3600);
        const mins = Math.floor((s.uptime % 3600) / 60);
        const secs = s.uptime % 60;
        o.push(OrderBuilder.text(rX, 2, `Uptime: ${days} days, ${padL(hrs, 2, '0')}:${padL(mins, 2, '0')}:${padL(secs, 2, '0')}`, 1, 0));

        const headerY = 7;
        o.push(OrderBuilder.rect(0, headerY, W, 1, ' ', 1, 10, true));
        const headerStr = `${padL('PID', 5)} ${padR('USER', 8)} ${padL('PRI', 3)} ${padL('NI', 3)} ${padL('VIRT', 5)} ${padL('RES', 5)} ${padL('SHR', 5)} S ${padL('CPU%', 5)} ${padL('MEM%', 5)} ${padL('TIME+', 9)} Command`.padEnd(W, ' ');
        o.push(OrderBuilder.text(0, headerY, headerStr, 9, 10));

        // Instead of color buffers, we split orders into multiple arrays to stay under the 255 orders/layer limit
        const l1: any[] = [];
        const l2: any[] = [];

        for (let i = 0; i < 35 && i < s.procs.length; i++) {
            const dest = i < 17 ? l1 : l2;
            const p = s.procs[i];
            const y = headerY + 1 + i;

            const timeMins = Math.floor(p.time / 60);
            const timeSecs = padL((p.time % 60).toFixed(2), 5, '0');
            const timeStr = `${timeMins}:${timeSecs}`;

            dest.push(OrderBuilder.text(0, y, padL(p.pid, 5), 3, 0));
            dest.push(OrderBuilder.text(6, y, padR(p.user, 8), 4, 0));

            const priNiVirt = `${padL(p.pri, 3)} ${padL(p.ni, 3)}   ${padL(p.virt, 5)}`;
            dest.push(OrderBuilder.text(15, y, priNiVirt, 1, 0));

            const resShr = `${padL(p.res, 5)} ${padL(p.shr, 5)}`;
            dest.push(OrderBuilder.text(29, y, resShr, 5, 0));

            const sColor = p.s === 'R' ? 2 : 1;
            dest.push(OrderBuilder.text(41, y, p.s, sColor, 0));

            dest.push(OrderBuilder.text(43, y, padL(p.cpu.toFixed(1), 5), 2, 0));
            dest.push(OrderBuilder.text(49, y, padL(p.mem.toFixed(1), 5), 4, 0));
            dest.push(OrderBuilder.text(55, y, padL(timeStr, 9), 3, 0));
            dest.push(OrderBuilder.text(65, y, p.cmd, 1, 0));
        }

        const bY = H - 1;
        o.push(OrderBuilder.rect(0, bY, W, 1, ' ', 1, 0, true));
        const menuOpts = ['Help', 'Setup', 'Search', 'Filter', 'Tree', 'SortBy', 'Nice-', 'Nice+', 'Kill', 'Quit'];
        let mX = 0;
        for (let i = 0; i < 10; i++) {
            o.push(OrderBuilder.text(mX, bY, `F${i + 1}`, 1, 0));
            mX += (i < 9 ? 3 : 4);
            const opt = ` ${menuOpts[i]} `;
            o.push(OrderBuilder.text(mX, bY, opt, 1, 10));
            mX += opt.length + 1;
        }

        d.htopLayer.setOrders(o);
        d.htopLayer.commit();

        d.listLayer1.setOrders(l1);
        d.listLayer1.commit();

        d.listLayer2.setOrders(l2);
        d.listLayer2.commit();
    }
}
