import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/components/theme-provider';

function Probe() {
    const { theme, setTheme } = useTheme();
    return (
        <div>
            <span data-testid="theme">{theme}</span>
            <button onClick={() => setTheme('light')}>light</button>
            <button onClick={() => setTheme('system')}>system</button>
        </div>
    );
}

type MediaListener = () => void;
function stubMatchMedia(dark: boolean) {
    const listeners = new Set<MediaListener>();
    const mq = {
        matches: dark,
        addEventListener: (_: string, fn: MediaListener) => listeners.add(fn),
        removeEventListener: (_: string, fn: MediaListener) => listeners.delete(fn),
    };
    vi.stubGlobal('matchMedia', () => mq);
    return { mq, fire: () => listeners.forEach((fn) => fn()), listeners };
}

describe('ThemeProvider', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.classList.remove('light', 'dark');
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('applies the default theme to the document root when nothing is stored', () => {
        render(
            <ThemeProvider>
                <Probe />
            </ThemeProvider>,
        );
        expect(screen.getByTestId('theme')).toHaveTextContent('dark');
        expect(document.documentElement).toHaveClass('dark');
    });

    it('prefers a valid stored theme and ignores garbage', () => {
        localStorage.setItem('km-theme', 'light');
        const first = render(
            <ThemeProvider>
                <Probe />
            </ThemeProvider>,
        );
        expect(screen.getByTestId('theme')).toHaveTextContent('light');
        expect(document.documentElement).toHaveClass('light');
        first.unmount();

        localStorage.setItem('km-theme', 'sepia');
        render(
            <ThemeProvider defaultTheme="dark">
                <Probe />
            </ThemeProvider>,
        );
        expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });

    it('persists a change under the storage key and swaps the root class', () => {
        render(
            <ThemeProvider storageKey="test-theme">
                <Probe />
            </ThemeProvider>,
        );
        act(() => screen.getByText('light').click());
        expect(localStorage.getItem('test-theme')).toBe('light');
        expect(document.documentElement).toHaveClass('light');
        expect(document.documentElement).not.toHaveClass('dark');
    });

    it('follows the OS preference under system and tracks changes until unmounted', () => {
        const media = stubMatchMedia(false);
        const view = render(
            <ThemeProvider>
                <Probe />
            </ThemeProvider>,
        );
        act(() => screen.getByText('system').click());
        expect(document.documentElement).toHaveClass('light');
        expect(media.listeners.size).toBe(1);

        media.mq.matches = true;
        act(() => media.fire());
        expect(document.documentElement).toHaveClass('dark');

        view.unmount();
        expect(media.listeners.size).toBe(0);
    });

    it('refuses to be used outside the provider', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within a ThemeProvider');
    });
});
