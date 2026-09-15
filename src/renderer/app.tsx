import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StartupGate } from '@/components/startup-gate';
import { queryClient } from '@/lib/query';
import { router } from '@/lib/router';

export function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <StartupGate>
                <RouterProvider router={router} />
            </StartupGate>
        </QueryClientProvider>
    );
}
