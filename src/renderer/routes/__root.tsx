import { createRootRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/layout/app-shell';

export const Route = createRootRoute({
    component: AppShell,
    notFoundComponent: () => <p className="text-sm text-muted-foreground">This page does not exist.</p>,
});
