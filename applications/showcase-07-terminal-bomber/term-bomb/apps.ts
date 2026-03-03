/**
 * Barrel file to avoid directory imports in ESM runtime.
 * Compiles to dist/term-bomb/apps.js, so `import "./term-bomb/apps"` resolves to a file.
 */
export { TermBomb } from './apps/index.js';
