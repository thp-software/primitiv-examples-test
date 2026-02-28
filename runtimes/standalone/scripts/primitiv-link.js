/**
 * Primitiv Link Manager for Website (Simplified version)
 *
 * Manages switching between local @primitiv/client (and server) packages and NPM versions.
 */

import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// This script is at scripts/primitiv-link.js
const SCRIPTS_DIR = __dirname;
const PROJECT_ROOT = resolve(SCRIPTS_DIR, '..');
// Monorepo is a sibling of the current project directory (primitiv-examples)
// Project root: /Users/Thomas/Documents/primitiv/primitiv-examples/runtimes/standalone
// Monorepo root: /Users/Thomas/Documents/primitiv/primitiv
const MONOREPO_ROOT = resolve(PROJECT_ROOT, '..', '..', '..', 'primitiv');
const PRIMITIV_PACKAGES_PATH = resolve(MONOREPO_ROOT, 'packages');

// List of all packages in the /packages directory (for transitive overrides)
const PRIMITIV_PACKAGES = existsSync(PRIMITIV_PACKAGES_PATH)
    ? readdirSync(PRIMITIV_PACKAGES_PATH).filter((name) =>
        statSync(join(PRIMITIV_PACKAGES_PATH, name)).isDirectory()
    )
    : [];

const STATE_FILE = join(PROJECT_ROOT, '.primitiv-link-state.json');
const PACKAGE_JSON_FILES = [join(PROJECT_ROOT, 'package.json')];

// ============================================================================
// HELPERS
// ============================================================================

function log(msg) {
    console.log(`[primitiv-link] ${msg}`);
}

function error(msg) {
    console.error(`[primitiv-link] ❌ ${msg}`);
}

function success(msg) {
    console.log(`[primitiv-link] ✅ ${msg}`);
}

function loadState() {
    if (existsSync(STATE_FILE)) {
        try {
            return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
        } catch {
            return { mode: 'npm', backups: {} };
        }
    }
    return { mode: 'npm', backups: {} };
}

function saveState(state) {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getSourcePath(packageName) {
    return join(PRIMITIV_PACKAGES_PATH, packageName);
}

function getLocalPath(packageName) {
    const absolutePath = getSourcePath(packageName);
    return `file:${absolutePath.replace(/\\/g, '/')}`;
}

function readPackageJson(filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writePackageJson(filePath, content) {
    writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
}

function cleanAllCaches() {
    log('🗑️  Cleaning caches...');

    for (const pkgJsonPath of PACKAGE_JSON_FILES) {
        const dir = dirname(pkgJsonPath);

        // Vite caches
        const viteCache = join(dir, 'node_modules', '.vite');
        if (existsSync(viteCache)) {
            rmSync(viteCache, { recursive: true, force: true });
            log(`  ✓ Deleted ${viteCache.replace(PROJECT_ROOT, '.')}`);
        }

        // TS build info
        const tsBuildInfo = join(dir, 'tsconfig.tsbuildinfo');
        if (existsSync(tsBuildInfo)) {
            rmSync(tsBuildInfo, { force: true });
            log(`  ✓ Deleted ${tsBuildInfo.replace(PROJECT_ROOT, '.')}`);
        }

        // Primitiv hardlinks cache (Force pnpm to relink from source)
        const primitivCache = join(dir, 'node_modules', '@primitiv');
        if (existsSync(primitivCache)) {
            try { rmSync(primitivCache, { recursive: true, force: true }); } catch (e) { }
            log(`  ✓ Deleted @primitiv local links in ${dir.replace(PROJECT_ROOT, '.')}`);
        }

        const pnpmCache = join(dir, 'node_modules', '.pnpm');
        if (existsSync(pnpmCache)) {
            try { rmSync(pnpmCache, { recursive: true, force: true }); } catch (e) { }
            log(`  ✓ Deleted .pnpm virtual store in ${dir.replace(PROJECT_ROOT, '.')}`);
        }
    }

    success('Caches cleared!');
}

// ============================================================================
// COMMANDS
// ============================================================================

function cmdLink() {
    log('🔗 Switching to LOCAL packages...\n');

    if (!existsSync(PRIMITIV_PACKAGES_PATH)) {
        error(`Packages directory not found at: ${PRIMITIV_PACKAGES_PATH}`);
        process.exit(1);
    }

    const state = loadState();

    // Backup original state
    if (!state.backups || Object.keys(state.backups).length === 0) {
        log('Backing up package.json...');
        state.backups = {};
        for (const pkgJsonPath of PACKAGE_JSON_FILES) {
            state.backups[pkgJsonPath] = readPackageJson(pkgJsonPath);
        }
    }

    // Update package.json files
    log('\nUpdating pnpm.overrides...');

    for (const pkgJsonPath of PACKAGE_JSON_FILES) {
        const pkgJson = readPackageJson(pkgJsonPath);

        if (!pkgJson.pnpm) pkgJson.pnpm = {};
        if (!pkgJson.pnpm.overrides) pkgJson.pnpm.overrides = {};

        let modified = false;

        // We override ALL @primitiv packages found in monorepo 
        // to handle transitive workspace dependencies correctly.
        for (const pkg of PRIMITIV_PACKAGES) {
            const pkgName = `@primitiv/${pkg}`;
            const localPath = getLocalPath(pkg);
            pkgJson.pnpm.overrides[pkgName] = localPath;
            modified = true;
        }

        if (modified) {
            writePackageJson(pkgJsonPath, pkgJson);
            log(`  ✓ Updated pnpm.overrides in ${pkgJsonPath.replace(PROJECT_ROOT, '.')}`);
        }
    }

    state.mode = 'link';
    state.linkedAt = new Date().toISOString();
    saveState(state);

    cleanAllCaches();

    log('\n📦 Running pnpm install...');
    try {
        execSync('pnpm install', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    } catch (e) {
        error(`Install failed`);
    }

    success('\n🔗 Switched to LOCAL packages!');
}

function cmdUnlink() {
    log('📦 Switching back to NPM versions...\n');

    const state = loadState();

    if (state.mode !== 'link') {
        log('Already using NPM packages.');
        return;
    }

    for (const [pkgJsonPath, originalContent] of Object.entries(state.backups)) {
        if (!existsSync(pkgJsonPath)) continue;
        writePackageJson(pkgJsonPath, originalContent);
        log(`  ✓ Restored ${pkgJsonPath.replace(PROJECT_ROOT, '.')}`);
    }

    state.mode = 'npm';
    state.backups = {};
    saveState(state);

    cleanAllCaches();

    log('\n📦 Running pnpm install...');
    try {
        execSync('pnpm install', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    } catch (e) {
        error(`Install failed`);
    }

    success('\n📦 Switched to NPM packages!');
}

function cmdStatus() {
    const state = loadState();
    console.log(`Current Mode: ${state.mode === 'link' ? '🔗 LOCAL' : '📦 NPM'}`);
    console.log(`Monorepo: ${PRIMITIV_PACKAGES_PATH}`);

    for (const pkgJsonPath of PACKAGE_JSON_FILES) {
        const pkgJson = readPackageJson(pkgJsonPath);
        console.log(`\n${pkgJsonPath.replace(PROJECT_ROOT, '')}:`);

        const overrides = pkgJson.pnpm?.overrides || {};

        // Show packages that are either in overrides or in dependencies
        const allPackages = new Set([
            ...Object.keys(overrides),
            ...(pkgJson.dependencies ? Object.keys(pkgJson.dependencies) : []),
            ...(pkgJson.devDependencies ? Object.keys(pkgJson.devDependencies) : [])
        ]);

        for (const pkgName of allPackages) {
            if (!pkgName.startsWith('@primitiv/')) continue;

            const override = overrides[pkgName];
            const inDeps = (pkgJson.dependencies && pkgJson.dependencies[pkgName]) ||
                (pkgJson.devDependencies && pkgJson.devDependencies[pkgName]);

            console.log(`  ${override ? '🔗' : '📦'} ${pkgName}: ${inDeps || 'transitive'} ${override ? `-> ${override}` : ''}`);
        }
    }
}

function cmdRefresh() {
    cleanAllCaches();
    log('\n📦 Running pnpm install...');
    try {
        execSync('pnpm install', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    } catch (e) {
        error(`Install failed`);
    }
    success('Refresh complete!');
}

const command = process.argv[2];
switch (command) {
    case 'link':
        cmdLink();
        break;
    case 'unlink':
        cmdUnlink();
        break;
    case 'status':
        cmdStatus();
        break;
    case 'refresh':
        cmdRefresh();
        break;
    default:
        console.log('Usage: node scripts/primitiv-link.js [link|unlink|status|refresh]');
}
