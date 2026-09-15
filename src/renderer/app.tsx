import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StartupGate } from '@/components/startup-gate';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { queryClient } from '@/lib/query';
import { router } from '@/lib/router';

export function App() {
    return (
        <ThemeProvider defaultTheme="dark" storageKey="km-theme">
            <QueryClientProvider client={queryClient}>
                <TooltipProvider delayDuration={300}>
                    <StartupGate>
                        <RouterProvider router={router} />
                    </StartupGate>
                </TooltipProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}
