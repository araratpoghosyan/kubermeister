import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/check-preload.mjs');
let dir = '';

function run(): { status: number | null; stderr: string } {
    const result = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
    return { status: result.status, stderr: result.stderr };
}

describe('check-preload', () => {
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('passes a bundle that only requires electron', () => {
        dir = mkdtempSync(join(tmpdir(), 'km-preload-'));
        writeFileSync(
            join(dir, 'index.cjs'),
            'const e = require("electron"); e.contextBridge.exposeInMainWorld("km", {});',
        );
        expect(run().status).toBe(0);
    });

    it('fails a bundle that requires anything else and names the offender', () => {
        dir = mkdtempSync(join(tmpdir(), 'km-preload-'));
        writeFileSync(join(dir, 'index.cjs'), 'const z = require(\'zod\'); const e = require("electron");');
        const { status, stderr } = run();
        expect(status).toBe(1);
        expect(stderr).toContain("index.cjs: require('zod')");
        expect(stderr).toContain('ipc-channels.ts');
    });
});
