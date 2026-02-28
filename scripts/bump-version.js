import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const dir = process.cwd();

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            if (!fullPath.includes('node_modules') && !fullPath.includes('.git') && !fullPath.includes('dist')) {
                results = results.concat(walk(fullPath));
            }
        } else {
            if (fullPath.endsWith('package.json')) results.push(fullPath);
        }
    });
    return results;
}

rl.question('Enter the new @primitiv version (e.g. 0.20.0-nightly.XXX): ', (newVersion) => {
    if (!newVersion) {
        console.log('No version provided. Exiting.');
        rl.close();
        return;
    }

    console.log(`\nUpdating all package.json files to use @primitiv/* version: ${newVersion}\n`);

    const files = walk(dir);
    let updatedCount = 0;

    for (const file of files) {
        let content = fs.readFileSync(file, 'utf8');
        let json;
        try {
            json = JSON.parse(content);
        } catch (e) {
            console.warn(`WARNING: Could not parse JSON in ${file}`);
            continue;
        }

        let changed = false;

        ['dependencies', 'devDependencies', 'peerDependencies'].forEach(depType => {
            if (json[depType]) {
                for (const key of Object.keys(json[depType])) {
                    if (key.startsWith('@primitiv/')) {
                        json[depType][key] = newVersion;
                        changed = true;
                    }
                }
            }
        });

        if (changed) {
            // Use 2 spaces for JSON formatting as is standard for package.json
            fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
            console.log(`Updated ${path.relative(dir, file)}`);
            updatedCount++;
        }
    }

    console.log(`\nFinished! Updated ${updatedCount} package.json files.`);

    import('child_process').then(({ execSync }) => {
        console.log('\n--- 🧹 CLEANING CACHE & MODULES ---');
        console.log('Cleaning pnpm store...');
        try {
            execSync('pnpm store prune', { stdio: 'inherit' });
        } catch (e) {
            console.warn('Failed to prune pnpm store.');
        }

        console.log('Finding and deleting node_modules directories...');
        function removeNodeModules(targetDir) {
            const list = fs.readdirSync(targetDir);
            for (const file of list) {
                const fullPath = path.join(targetDir, file);
                const stat = fs.statSync(fullPath);
                if (file === 'node_modules' && stat.isDirectory()) {
                    console.log(`Deleting ${path.relative(dir, fullPath)}...`);
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } else if (stat.isDirectory() && file !== '.git' && file !== 'dist') {
                    removeNodeModules(fullPath);
                }
            }
        }
        removeNodeModules(dir);

        console.log('\n--- 📦 INSTALLING NEW VERSIONS ---');
        try {
            execSync('pnpm install', { stdio: 'inherit', cwd: dir });
            console.log('\n✅ Successfully installed the new @primitiv versions from scratch!');
        } catch (e) {
            console.error('\n❌ Failed to run pnpm install. You may need to run it manually.');
        }

        rl.close();
    });
});
