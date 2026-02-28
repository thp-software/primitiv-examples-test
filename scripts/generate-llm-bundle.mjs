import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const inputFile = path.join(rootDir, 'llms.md');
const outputFile = path.join(rootDir, 'llms-full.md');

async function main() {
    console.log('Generating LLM Bundle...');

    if (!fs.existsSync(inputFile)) {
        console.error(`Input file not found: ${inputFile}`);
        process.exit(1);
    }

    let content = fs.readFileSync(inputFile, 'utf8');

    // Find all application links: [label](path/to/file.ts)
    // We target links that point to the applications/ directory
    const linkRegex = /\[.*?\]\((applications\/.*?\.ts)\)/g;
    const matches = [...content.matchAll(linkRegex)];

    const uniqueFiles = [...new Set(matches.map(m => m[1]))];

    console.log(`Found ${uniqueFiles.length} unique applications referenced.`);

    let bundle = content + '\n\n---\n\n# Source Code Appendix\n\n';
    bundle += 'This appendix contains the full source code for all applications referenced in the guide above.\n\n';

    for (const relPath of uniqueFiles) {
        const fullPath = path.join(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
            console.log(`Appending: ${relPath}`);
            const sourceCode = fs.readFileSync(fullPath, 'utf8');
            const fileName = path.basename(relPath);

            bundle += `\n## File: ${relPath}\n\n`;
            bundle += '```typescript\n';
            bundle += sourceCode;
            if (!sourceCode.endsWith('\n')) bundle += '\n';
            bundle += '```\n';
            bundle += '\n---\n';
        } else {
            console.warn(`Warning: File not found: ${relPath}`);
        }
    }

    fs.writeFileSync(outputFile, bundle);
    console.log(`\nSuccess! Created bundle at: ${outputFile}`);
    console.log(`Total size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(err => {
    console.error('Error generating bundle:', err);
    process.exit(1);
});
