import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateState } from '../../../src/shared/ipc';

const invoke = vi.fn();
let push: ((state: UpdateState) => void) | undefined;
const unsubscribe = vi.fn();
const subscribe = vi.fn((_channel: string, handler: (state: UpdateState) => void) => {
    push = handler;
    return unsubscribe;
});
vi.mock('@/lib/ipc', () => ({ invoke, subscribe }));

const { UpdateBanner, describeUpdate } = await import('@/components/update-banner');

describe('describeUpdate', () => {
    it('is silent for states that need no attention', () => {
        for (const status of ['idle', 'checking', 'up-to-date', 'unsupported'] as const) {
            expect(describeUpdate({ status })).toBeNull();
        }
    });

    it('describes downloads, readiness and failures', () => {
        expect(describeUpdate({ status: 'downloading', version: '0.2.0', percent: 40 })).toBe('Downloading 0.2.0… 40%');
        expect(describeUpdate({ status: 'downloaded', version: '0.2.0' })).toBe('Version 0.2.0 is ready to install.');
        expect(describeUpdate({ status: 'error', message: 'offline' })).toBe('Update check failed: offline');
    });
});

describe('UpdateBanner', () => {
    it('lets a push that arrives before the initial read win', async () => {
        let resolveInitial: (state: UpdateState) => void = () => {};
        invoke.mockReturnValue(new Promise<UpdateState>((resolve) => (resolveInitial = resolve)));
        const { render } = await import('@testing-library/react');
        render(<UpdateBanner />);
        act(() => push?.({ status: 'downloaded', version: '0.3.0' }));
        await act(async () => resolveInitial({ status: 'up-to-date' }));
        expect(screen.getByTestId('update-banner')).toHaveTextContent('Version 0.3.0 is ready to install.');
    });

    beforeEach(() => {
        invoke.mockReset();
        unsubscribe.mockReset();
        push = undefined;
    });

    it('renders nothing while up to date and reacts to pushed state, offering a restart when downloaded', async () => {
        invoke.mockResolvedValue({ status: 'up-to-date' });
        const { render } = await import('@testing-library/react');
        const view = render(<UpdateBanner />);
        // Let the initial read settle so the test exercises pushes arriving afterwards.
        await act(async () => {});
        expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
        expect(subscribe).toHaveBeenCalledWith('update.state', expect.any(Function));
        act(() => push?.({ status: 'downloading', version: '0.2.0', percent: 10 }));
        expect(screen.getByTestId('update-banner')).toHaveTextContent('Downloading 0.2.0… 10%');
        act(() => push?.({ status: 'downloaded', version: '0.2.0' }));
        await userEvent.click(screen.getByRole('button', { name: 'Restart to update' }));
        expect(invoke).toHaveBeenCalledWith('update.install', {});
        view.unmount();
        expect(unsubscribe).toHaveBeenCalledOnce();
    });
});
