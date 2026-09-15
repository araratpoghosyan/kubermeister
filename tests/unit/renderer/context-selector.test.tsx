import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from './helpers';

const invoke = vi.fn();
vi.mock('@/lib/ipc', async () => ({ ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')), invoke }));

const { ContextSelector } = await import('@/components/layout/context-selector');

describe('ContextSelector', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'contexts.list') {
                return [
                    { name: 'alpha', cluster: 'a', user: 'u', current: true },
                    { name: 'beta', cluster: 'b', user: 'u', current: false },
                ];
            }
            return undefined;
        });
    });

    it('shows the current context once loaded', async () => {
        renderWithQuery(<ContextSelector />);
        const trigger = screen.getByTestId('context-selector');
        await waitFor(() => expect(trigger).toHaveTextContent('alpha'));
        expect(trigger).not.toBeDisabled();
    });

    it('is disabled until the list arrives', () => {
        invoke.mockImplementation(() => new Promise(() => {}));
        renderWithQuery(<ContextSelector />);
        expect(screen.getByTestId('context-selector')).toBeDisabled();
    });
});
