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
    console.log('Run `pnpm install` to apply the changes.');

    rl.close();
});
