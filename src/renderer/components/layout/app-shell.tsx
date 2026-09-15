import { Outlet } from '@tanstack/react-router';
import { UpdateBanner } from '@/components/update-banner';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

export function AppShell() {
    return (
        <div className="grid h-screen grid-cols-[252px_1fr] overflow-hidden" data-testid="app-shell">
            <Sidebar />
            <div className="flex min-w-0 flex-col overflow-hidden">
                <UpdateBanner />
                <TopBar />
                <main className="min-h-0 flex-1 overflow-hidden">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
