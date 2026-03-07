import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { execSync } from 'child_process';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Directories to scan for package.json
const directoriesToScan = [
    path.join(ROOT, 'applications'),
    path.join(ROOT, 'packages'),
    path.join(ROOT, 'runtimes'),
    ROOT // Root directory itself
];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const getPrimitivVersion = () => {
    return new Promise((resolve) => {
        rl.question('Enter the new @primitiv version: ', (answer) => {
            resolve(answer.trim());
        });
    });
};

const findPackageJsonFiles = (dir, fileList = []) => {
    if (!fs.existsSync(dir)) return fileList;

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            // Don't go into node_modules or dist folders
            if (file !== 'node_modules' && file !== 'dist' && file !== 'build' && file !== '.git') {
                findPackageJsonFiles(filePath, fileList);
            }
        } else if (file === 'package.json') {
            fileList.push(filePath);
        }
    }

    return fileList;
};

const updatePrimitivDependencies = (packagePath, newVersion) => {
    try {
        const rawData = fs.readFileSync(packagePath, 'utf8');
        const pkg = JSON.parse(rawData);
        let updated = false;

        // Helper to update a specific dependency object
        const updateDependencies = (deps) => {
            if (!deps) return false;
            let changed = false;
            for (const [key, _] of Object.entries(deps)) {
                if (key.startsWith('@primitiv/')) {
                    deps[key] = newVersion;
                    changed = true;
                    updated = true;
                }
            }
            return changed;
        };

        updateDependencies(pkg.dependencies);
        updateDependencies(pkg.devDependencies);
        updateDependencies(pkg.peerDependencies);

        if (updated) {
            // Preserve formatting (2 spaces indent)
            fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
            console.log(`\x1b[32m✔ Updated\x1b[0m: ${path.relative(ROOT, packagePath)}`);
        } else {
            // Only uncomment this if you want noisy logs
            // console.log(`\x1b[90m- Skipped\x1b[0m: ${path.relative(ROOT, packagePath)} (no @primitiv deps)`);
        }

        return updated;
    } catch (error) {
        console.error(`\x1b[31m✖ Error reading/writing ${packagePath}:\x1b[0m`, error.message);
        return false;
    }
};

async function main() {
    console.log('================================================');
    console.log('  @primitiv Dependency Version Updater');
    console.log('================================================\n');

    let targetVersion = process.argv[2];

    if (!targetVersion) {
        targetVersion = await getPrimitivVersion();
    }

    if (!targetVersion) {
        console.log('No version provided. Exiting.');
        rl.close();
        process.exit(1);
    }

    // Ensure it has a caret if requested, but let the user decide if they just typed numbers
    if (/^\d+\.\d+\.\d+$/.test(targetVersion)) {
        // User typed exact version, maybe ask if they want caret? Or assume exact/caret?
        // We'll just use exactly what they typed to give them full control.
        // If they want `^0.3.5`, they should type `^0.3.5`. If they type `latest`, we'll use `latest`.
    }

    console.log(`\nScanning for package.json files...`);

    let allPackageFiles = [];

    for (const dir of directoriesToScan) {
        if (fs.existsSync(dir)) {
            if (dir === ROOT) {
                allPackageFiles.push(path.join(ROOT, 'package.json'));
            } else {
                findPackageJsonFiles(dir, allPackageFiles);
            }
        }
    }

    // Remove duplicates
    allPackageFiles = [...new Set(allPackageFiles)];

    console.log(`Found ${allPackageFiles.length} package.json files. Updating @primitiv dependencies to "${targetVersion}"...\n`);

    let updatedCount = 0;
    let updatedDirs = [];

    for (const file of allPackageFiles) {
        if (fs.existsSync(file)) {
            const wasUpdated = updatePrimitivDependencies(file, targetVersion);
            if (wasUpdated) {
                updatedCount++;
                updatedDirs.push(path.dirname(file));
            }
        }
    }

    console.log(`\n================================================`);
    console.log(`  Done! Updated ${updatedCount} package.json files.`);

    if (updatedDirs.length > 0) {
        console.log(`  Running install command in updated directories...`);
        console.log(`================================================\n`);
        for (const dir of updatedDirs) {
            let pm = 'npm';
            if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) {
                pm = 'pnpm';
            } else if (fs.existsSync(path.join(dir, 'yarn.lock'))) {
                pm = 'yarn';
            }

            console.log(`\x1b[36m>> Running ${pm} install in: ${path.relative(ROOT, dir) || '.'}\x1b[0m`);
            try {
                execSync(`${pm} install`, { cwd: dir, stdio: 'inherit' });
                console.log(`\x1b[32m✔ Install successful\x1b[0m\n`);
            } catch (err) {
                console.error(`\x1b[31m✖ Failed to install dependencies in ${dir}\x1b[0m\n`);
            }
        }
    } else {
        console.log(`================================================`);
    }

    rl.close();
}

main();
