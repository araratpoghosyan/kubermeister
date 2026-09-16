import { useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { ShellDrawer } from '@/components/shell/shell-drawer';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

export function AppShell() {
    const [paletteOpen, setPaletteOpen] = useState(false);
    return (
        <div className="grid h-screen grid-cols-[252px_1fr] overflow-hidden" data-testid="app-shell">
            <Sidebar onOpenPalette={() => setPaletteOpen(true)} />
            <div className="flex min-w-0 flex-col overflow-hidden">
                <TopBar />
                <main className="min-h-0 flex-1 overflow-hidden">
                    <Outlet />
                </main>
                {/* Below the routes, never inside one: a shell must outlive the screen that opened it. */}
                <ShellDrawer />
            </div>
            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </div>
    );
}
