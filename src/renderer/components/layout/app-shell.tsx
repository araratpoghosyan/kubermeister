import { useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { UpdateBanner } from '@/components/update-banner';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

export function AppShell() {
    const [paletteOpen, setPaletteOpen] = useState(false);
    return (
        <div className="grid h-screen grid-cols-[252px_1fr] overflow-hidden" data-testid="app-shell">
            <Sidebar onOpenPalette={() => setPaletteOpen(true)} />
            <div className="flex min-w-0 flex-col overflow-hidden">
                <UpdateBanner />
                <TopBar />
                <main className="min-h-0 flex-1 overflow-hidden">
                    <Outlet />
                </main>
            </div>
            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </div>
    );
}
