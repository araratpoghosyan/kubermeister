import { createRootRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/layout/app-shell';
import { NotFound } from '@/components/not-found';

export const Route = createRootRoute({
    component: AppShell,
    notFoundComponent: NotFound,
});
