import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

const THEMES: readonly Theme[] = ['dark', 'light', 'system'];

function isTheme(value: string | null): value is Theme {
    return value !== null && (THEMES as readonly string[]).includes(value);
}

function applyTheme(theme: Theme) {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    const resolved =
        theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    root.classList.add(resolved);
}

export function ThemeProvider({ children, defaultTheme = 'dark', storageKey = 'km-theme' }: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>(() => {
        const stored = localStorage.getItem(storageKey);
        return isTheme(stored) ? stored : defaultTheme;
    });

    useEffect(() => {
        applyTheme(theme);
        if (theme !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => applyTheme('system');
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [theme]);

    const value: ThemeProviderState = {
        theme,
        setTheme: (next) => {
            localStorage.setItem(storageKey, next);
            setThemeState(next);
        },
    };

    return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeProviderContext);
    if (!context) throw new Error('useTheme must be used within a ThemeProvider');
    return context;
}
