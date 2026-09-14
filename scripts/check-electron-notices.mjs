// electron-builder.yml copies Electron's third-party license notices into the bundle from
// node_modules/electron/dist, which only exists after Electron's postinstall has run. A missing
// source is just a warning for electron-builder, so fail loudly here instead of shipping without
// the notices.
import { existsSync } from 'node:fs';

const notices = ['node_modules/electron/dist/LICENSE', 'node_modules/electron/dist/LICENSES.chromium.html'];
const missing = notices.filter((path) => !existsSync(path));

if (missing.length > 0) {
    console.error(`Electron license notices missing:\n  ${missing.join('\n  ')}`);
    console.error('Run `npm install` (or `node node_modules/electron/install.js`) so Electron downloads its binary.');
    process.exit(1);
}
