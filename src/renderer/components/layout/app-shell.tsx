import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { UpdateBanner } from '@/components/update-banner';

export function AppShell() {
    return (
        <div className="flex h-screen" data-testid="app-shell">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
                <UpdateBanner />
                <TopBar />
                <main className="min-h-0 flex-1 overflow-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
