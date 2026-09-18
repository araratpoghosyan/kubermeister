import { spawn as nodeSpawn } from 'node:child_process';

/**
 * A GUI app launched from the Finder, the Dock or a desktop menu inherits launchd's minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`), not the one the user's shell profile builds. Kubeconfigs
 * written by `aws eks update-kubeconfig` or `gcloud container clusters get-credentials` name their
 * credential plugin by bare command, so with that PATH every exec-authenticated context fails with
 * `spawn aws ENOENT`. Asking the login shell for its PATH once at startup, the way editors and
 * other Kubernetes clients do, is what makes those kubeconfigs work unchanged.
 */

const MARKER = '__KM_PATH__';
/** A profile that hangs (a prompt, a broken plugin) must not hold the app's start hostage. */
export const SHELL_PATH_TIMEOUT_MS = 5_000;

export interface ShellPathOptions {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    spawn?: typeof nodeSpawn;
    timeoutMs?: number;
}

/** The shell's entries first, in its order, then whatever the current PATH had that the shell did not. */
export function mergePath(current: string | undefined, resolved: string): string {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const entry of [...resolved.split(':'), ...(current ?? '').split(':')]) {
        if (!entry || seen.has(entry)) continue;
        seen.add(entry);
        merged.push(entry);
    }
    return merged.join(':');
}

/** Pull the PATH out of whatever the profile printed around it (banners, warnings, prompts). */
export function extractPath(output: string): string | null {
    const start = output.indexOf(MARKER);
    if (start < 0) return null;
    const end = output.indexOf(MARKER, start + MARKER.length);
    if (end < 0) return null;
    const path = output.slice(start + MARKER.length, end);
    return path.length > 0 ? path : null;
}

/**
 * The PATH the user's interactive login shell ends up with, or null when it cannot be learned
 * (Windows, no shell, a shell that fails or hangs). Never throws: this is a best-effort improvement
 * on the inherited environment, and the inherited one is still a working fallback.
 */
export function loginShellPath(options: ShellPathOptions = {}): Promise<string | null> {
    const platform = options.platform ?? process.platform;
    const env = options.env ?? process.env;
    const spawn = options.spawn ?? nodeSpawn;
    const timeoutMs = options.timeoutMs ?? SHELL_PATH_TIMEOUT_MS;
    if (platform === 'win32') return Promise.resolve(null);
    const shell = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash');

    return new Promise((resolve) => {
        let output = '';
        let settled = false;
        const finish = (value: string | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        let child: ReturnType<typeof nodeSpawn>;
        try {
            child = spawn(shell, ['-ilc', `printf '${MARKER}%s${MARKER}' "$PATH"`], {
                env,
                stdio: ['ignore', 'pipe', 'ignore'],
            });
        } catch {
            resolve(null);
            return;
        }
        const timer = setTimeout(() => {
            child.kill();
            finish(null);
        }, timeoutMs);
        child.stdout?.on('data', (chunk: Buffer | string) => {
            output += String(chunk);
        });
        child.on('error', () => finish(null));
        child.on('close', () => finish(extractPath(output)));
    });
}

/**
 * Replace the process PATH with the login shell's, keeping any inherited entry the shell lacks.
 * Returns the PATH now in force, or null when nothing changed.
 */
export async function adoptLoginShellPath(options: ShellPathOptions = {}): Promise<string | null> {
    const env = options.env ?? process.env;
    const resolved = await loginShellPath({ ...options, env });
    if (!resolved) return null;
    const merged = mergePath(env.PATH, resolved);
    if (merged === env.PATH) return null;
    env.PATH = merged;
    return merged;
}
