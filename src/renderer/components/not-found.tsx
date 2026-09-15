import { LayoutDashboardIcon } from 'lucide-react';
import { NavLink } from '@/components/layout/nav-link';
import { Button } from '@/components/ui/button';

/** The screen for a path that names nothing, reached through the router's not-found handling. */
export function NotFound() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-8" data-testid="page-not-found">
            <div className="max-w-md text-center">
                <div className="font-mono text-[84px] leading-none font-semibold tracking-tighter text-primary">
                    404
                </div>
                <h1 className="mt-2 text-lg font-semibold text-primary">Page not found</h1>
                <p className="mt-2 text-lead text-text-muted">
                    The page you&apos;re looking for doesn&apos;t exist. It may have been moved, or you might be on the
                    wrong cluster.
                </p>

                <div className="mt-[22px] flex justify-center">
                    <Button asChild>
                        <NavLink to="/overview/summary">
                            <LayoutDashboardIcon />
                            Back to overview
                        </NavLink>
                    </Button>
                </div>
            </div>
        </div>
    );
}
