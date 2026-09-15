/** Only `http:`/`https:` URLs are safe to hand to the OS browser. */
export function isExternalWebUrl(url: string): boolean {
    try {
        const { protocol } = new URL(url);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * A navigation is internal only if it targets the app's own document: the Vite dev server in
 * development or the packaged `file://` bundle. Anything else is denied so a compromised renderer
 * cannot navigate the top frame to a remote origin that would inherit the bridge.
 */
export function isInternalNavigation(url: string, devServerUrl: string | undefined): boolean {
    return devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://');
}
