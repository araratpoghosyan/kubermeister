/**
 * Renderer-side OS detection for OS-specific affordances, such as the `⌘,` Settings hint. The
 * shortcut itself is a macOS-only menu accelerator; other platforms open Settings by click.
 */
export const isMac = /mac/i.test(navigator.platform || navigator.userAgent);
