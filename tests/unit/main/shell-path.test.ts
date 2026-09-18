import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    SHELL_PATH_TIMEOUT_MS,
    adoptLoginShellPath,
    extractPath,
    loginShellPath,
    mergePath,
} from '../../../src/main/shell-path';

class FakeChild extends EventEmitter {
    stdout = new EventEmitter();
    kill = vi.fn();
}

/** A spawn stub that scripts what the shell prints and how it exits. */
function fakeSpawn(script: (child: FakeChild) => void) {
    const spawn = vi.fn((_shell: string, _args: string[], _opts: unknown) => {
        const child = new FakeChild();
        queueMicrotask(() => script(child));
        return child as never;
    });
    return spawn as unknown as typeof import('node:child_process').spawn & typeof spawn;
}

const printPath = (path: string) => (child: FakeChild) => {
    child.stdout.emit('data', `Last login: banner\n__KM_PATH__${path}__KM_PATH__`);
    child.emit('close', 0);
};

describe('mergePath', () => {
    it('puts the shell entries first and keeps inherited ones the shell lacks, without duplicates', () => {
        expect(mergePath('/usr/bin:/bin:/extra', '/opt/homebrew/bin:/usr/bin:/bin')).toBe(
            '/opt/homebrew/bin:/usr/bin:/bin:/extra',
        );
        expect(mergePath(undefined, '/a::/b:/a')).toBe('/a:/b');
    });
});

describe('extractPath', () => {
    it('finds the PATH between the markers whatever the profile printed around it', () => {
        expect(extractPath('motd\n__KM_PATH__/a:/b__KM_PATH__\nbye')).toBe('/a:/b');
        expect(extractPath('no markers')).toBeNull();
        expect(extractPath('__KM_PATH__/a')).toBeNull();
        expect(extractPath('__KM_PATH____KM_PATH__')).toBeNull();
    });
});

describe('loginShellPath', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('asks the login shell from $SHELL, interactively, and reads its PATH', async () => {
        const spawn = fakeSpawn(printPath('/opt/homebrew/bin:/usr/bin'));
        const env = { SHELL: '/bin/fish', PATH: '/usr/bin' };
        const result = loginShellPath({ platform: 'darwin', env, spawn });
        await vi.advanceTimersByTimeAsync(0);
        await expect(result).resolves.toBe('/opt/homebrew/bin:/usr/bin');
        expect(spawn).toHaveBeenCalledWith(
            '/bin/fish',
            ['-ilc', expect.stringContaining('"$PATH"')],
            expect.objectContaining({ env, stdio: ['ignore', 'pipe', 'ignore'] }),
        );
    });

    it('defaults to zsh on macOS and bash elsewhere when $SHELL is unset', async () => {
        for (const [platform, shell] of [
            ['darwin', '/bin/zsh'],
            ['linux', '/bin/bash'],
        ] as const) {
            const spawn = fakeSpawn(printPath('/x'));
            const result = loginShellPath({ platform, env: {}, spawn });
            await vi.advanceTimersByTimeAsync(0);
            await expect(result).resolves.toBe('/x');
            expect(spawn.mock.calls[0]?.[0]).toBe(shell);
        }
    });

    it('is null on Windows without spawning anything', async () => {
        const spawn = fakeSpawn(() => {});
        await expect(loginShellPath({ platform: 'win32', env: {}, spawn })).resolves.toBeNull();
        expect(spawn).not.toHaveBeenCalled();
    });

    it('is null when the shell fails to start, exits without markers, or cannot be spawned', async () => {
        const failing = fakeSpawn((child) => child.emit('error', new Error('ENOENT')));
        const failed = loginShellPath({ platform: 'linux', env: {}, spawn: failing });
        await vi.advanceTimersByTimeAsync(0);
        await expect(failed).resolves.toBeNull();

        const silent = fakeSpawn((child) => child.emit('close', 1));
        const quiet = loginShellPath({ platform: 'linux', env: {}, spawn: silent });
        await vi.advanceTimersByTimeAsync(0);
        await expect(quiet).resolves.toBeNull();

        const throwing = vi.fn(() => {
            throw new Error('EACCES');
        }) as unknown as typeof import('node:child_process').spawn;
        await expect(loginShellPath({ platform: 'linux', env: {}, spawn: throwing })).resolves.toBeNull();
    });

    it('gives up on a hanging shell after the timeout and kills it', async () => {
        let child: FakeChild | undefined;
        const spawn = fakeSpawn((c) => {
            child = c;
        });
        const result = loginShellPath({ platform: 'linux', env: {}, spawn });
        await vi.advanceTimersByTimeAsync(SHELL_PATH_TIMEOUT_MS);
        await expect(result).resolves.toBeNull();
        expect(child?.kill).toHaveBeenCalledOnce();
        // A late answer after the timeout changes nothing.
        child?.stdout.emit('data', '__KM_PATH__/late__KM_PATH__');
        child?.emit('close', 0);
        await expect(result).resolves.toBeNull();
    });
});

describe('adoptLoginShellPath', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('replaces the process PATH with the merged one and reports it', async () => {
        const env: NodeJS.ProcessEnv = { SHELL: '/bin/zsh', PATH: '/usr/bin:/bin' };
        const spawn = fakeSpawn(printPath('/opt/homebrew/bin:/usr/bin'));
        const result = adoptLoginShellPath({ platform: 'darwin', env, spawn });
        await vi.advanceTimersByTimeAsync(0);
        await expect(result).resolves.toBe('/opt/homebrew/bin:/usr/bin:/bin');
        expect(env.PATH).toBe('/opt/homebrew/bin:/usr/bin:/bin');
    });

    it('leaves the environment alone when nothing was learned or nothing would change', async () => {
        const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' };
        const same = adoptLoginShellPath({ platform: 'linux', env, spawn: fakeSpawn(printPath('/usr/bin:/bin')) });
        await vi.advanceTimersByTimeAsync(0);
        await expect(same).resolves.toBeNull();
        expect(env.PATH).toBe('/usr/bin:/bin');
        await expect(adoptLoginShellPath({ platform: 'win32', env })).resolves.toBeNull();
        expect(env.PATH).toBe('/usr/bin:/bin');
    });
});
