import fs from 'fs';
import path from 'path';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git')) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('./applications');
let totalReplaced = 0;
files.forEach(f => {
    let code = fs.readFileSync(f, 'utf8');
    if (code.includes('.commit(')) {
        // Regex to match "  layer.commit();" or " d.uiLayer.commit()"
        const newCode = code.replace(/[ \t]*[a-zA-Z0-9_.]+\.commit\(\);?[ \t]*/g, '');

        // Also remove any resulting empty lines that might have been left if commit was on its own line
        // We'll just write it back
        fs.writeFileSync(f, newCode);
        totalReplaced++;
        console.log(`Replaced in ${f}`);
    }
});
console.log(`Total files modified: ${totalReplaced}`);
