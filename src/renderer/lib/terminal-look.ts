/**
 * How a terminal looks. Lives apart from any component because both the drawer that renders shells
 * and the screens that open them need the same answer, and xterm needs literal colours: it cannot
 * read Tailwind classes, and remote output (`ls --color`, coloured prompts) is tuned per background,
 * so each theme ships a matched palette. Background, foreground and cursor come from the app tokens.
 */

export const DARK_ANSI = {
    black: '#2e3440',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#d0d0d0',
    brightBlack: '#4b5263',
    brightRed: '#ff7b86',
    brightGreen: '#b5e0a0',
    brightYellow: '#ffd9a0',
    brightBlue: '#82c0ff',
    brightMagenta: '#e0a0f0',
    brightCyan: '#7fd0da',
    brightWhite: '#ffffff',
} as const;
export const LIGHT_ANSI = {
    black: '#24292e',
    red: '#c0392b',
    green: '#1a7f4b',
    yellow: '#9a6700',
    blue: '#3d5bd6',
    magenta: '#8250df',
    cyan: '#0e7490',
    white: '#6b6b72',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#116329',
    brightYellow: '#7d4e00',
    brightBlue: '#2a45b0',
    brightMagenta: '#6639ba',
    brightCyan: '#0b5d6e',
    brightWhite: '#111318',
} as const;

/** The terminal theme for the current app theme: token colors plus the matched ANSI palette. */
export function readTerminalTheme(host: Element) {
    const styles = getComputedStyle(host);
    const light = document.documentElement.classList.contains('light');
    return {
        background: styles.getPropertyValue('--code-bg').trim() || '#0b0e14',
        foreground: styles.getPropertyValue('--text-2').trim() || '#c9d1d9',
        cursor: styles.getPropertyValue('--primary').trim() || '#4d7cff',
        ...(light ? LIGHT_ANSI : DARK_ANSI),
    };
}

/** The font, size and colours a terminal is created with, and kept in step with afterwards. */
export interface TerminalLook {
    fontFamily: string;
    fontSize: number;
    theme: Record<string, string>;
}

export function readTerminalLook(host: Element, fontSize: number): TerminalLook {
    const styles = getComputedStyle(host);
    return {
        fontFamily: styles.getPropertyValue('--font-mono').trim() || 'monospace',
        fontSize,
        theme: readTerminalTheme(host),
    };
}
