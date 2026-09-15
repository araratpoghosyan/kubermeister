// The preload runs sandboxed, where `require` only resolves a few Electron built-ins. Any other
// module pulled in through an import chain makes the whole bridge fail to load, silently leaving
// `window.km` undefined. Fail the build instead.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set(['electron']);
const dir = process.argv[2] ?? 'out/preload';
const offenders = [];
for (const file of readdirSync(dir)) {
    if (!file.endsWith('.cjs') && !file.endsWith('.js')) continue;
    const source = readFileSync(join(dir, file), 'utf8');
    for (const match of source.matchAll(/require\((['"])([^'"]+)\1\)/g)) {
        if (!ALLOWED.has(match[2])) offenders.push(`${file}: require('${match[2]}')`);
    }
}
if (offenders.length > 0) {
    console.error('Preload bundle requires modules the sandbox cannot load:\n  ' + offenders.join('\n  '));
    console.error('Keep src/shared/ipc-channels.ts import-free and import only it from the preload.');
    process.exit(1);
}
