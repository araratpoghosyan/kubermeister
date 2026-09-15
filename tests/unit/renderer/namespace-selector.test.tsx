import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from './helpers';

const invoke = vi.fn();
vi.mock('@/lib/ipc', async () => ({ ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')), invoke }));

const { NamespaceSelector } = await import('@/components/layout/namespace-selector');

describe('NamespaceSelector', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'namespaces.list')
                return [
                    { name: 'team-a', pods: 1, tone: 'accent' },
                    { name: 'kube-system', pods: 9, tone: 'ok' },
                ];
            if (channel === 'namespace.active') return { name: 'team-a', pods: 1, tone: 'accent' };
            return undefined;
        });
    });

    it('shows the active namespace once both queries load', async () => {
        renderWithQuery(<NamespaceSelector />);
        const trigger = screen.getByTestId('namespace-selector');
        await waitFor(() => expect(trigger).toHaveTextContent('team-a'));
        expect(trigger).not.toBeDisabled();
    });

    it('shows All Namespaces when nothing is selected', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'namespaces.list') return [];
            if (channel === 'namespace.active') return { name: 'All Namespaces', pods: 12, tone: 'accent' };
            return undefined;
        });
        renderWithQuery(<NamespaceSelector />);
        await waitFor(() => expect(screen.getByTestId('namespace-selector')).toHaveTextContent('All Namespaces'));
    });
});
