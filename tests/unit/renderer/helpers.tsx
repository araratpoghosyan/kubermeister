import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

/** Render under a fresh QueryClient with retries off so failures surface immediately. */
export function renderWithQuery(ui: ReactElement): RenderResult {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
