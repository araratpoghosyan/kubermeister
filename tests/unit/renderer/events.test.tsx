import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClusterEvent } from '../../../src/shared/k8s/events';
import { renderWithQuery } from './helpers';

const invoke = vi.fn();
vi.mock('@/lib/ipc', async () => ({ ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')), invoke }));

const { EventsList } = await import('@/components/data-display/events-list');
const { ObjectEvents } = await import('@/components/templates/object-events');

const events: ClusterEvent[] = [
    {
        time: '12:00:05',
        type: 'Warning',
        reason: 'BackOff',
        object: 'pod/web-1',
        namespace: 'team-a',
        message: 'restarting',
    },
    {
        time: '12:00:00',
        type: 'Normal',
        reason: 'Scheduled',
        object: 'pod/web-1',
        namespace: 'team-a',
        message: 'assigned',
    },
];

describe('EventsList', () => {
    it('renders rows with a warning tone and the object column by default', () => {
        render(<EventsList events={events} />);
        const rows = within(screen.getByRole('list', { name: 'Events' })).getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(within(rows[0]!).getByText('Warning')).toHaveClass('text-warn');
        expect(within(rows[1]!).getByText('Normal')).not.toHaveClass('text-warn');
        expect(rows[0]).toHaveTextContent('pod/web-1');
        expect(rows[0]).toHaveClass('border-b');
        expect(rows[1]).not.toHaveClass('border-b');
    });

    it('hides the object column on request and renders loading, error and empty states', () => {
        const { rerender } = render(<EventsList events={events} showObject={false} />);
        expect(screen.queryByText('pod/web-1')).not.toBeInTheDocument();
        rerender(<EventsList events={[]} isLoading />);
        expect(screen.getByText('Loading events…')).toBeInTheDocument();
        rerender(<EventsList events={[]} isError />);
        expect(screen.getByText('Failed to load events.')).toBeInTheDocument();
        rerender(<EventsList events={[]} emptyMessage="Quiet." />);
        expect(screen.getByText('Quiet.')).toBeInTheDocument();
        rerender(<EventsList events={[]} />);
        expect(screen.getByText('No events found.')).toBeInTheDocument();
    });
});

describe('ObjectEvents', () => {
    beforeEach(() => {
        invoke.mockReset();
    });

    it('fetches the object events through the bridge and lists them without the object column', async () => {
        invoke.mockResolvedValue(events);
        renderWithQuery(<ObjectEvents kind="Pod" name="web-1" namespace="team-a" />);
        expect(screen.getByText('Loading events…')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId('object-events')).toHaveTextContent('BackOff'));
        expect(invoke).toHaveBeenCalledWith('events.forObject', { kind: 'Pod', name: 'web-1', namespace: 'team-a' });
        expect(screen.queryByText('pod/web-1')).not.toBeInTheDocument();
    });

    it('reports a failed read', async () => {
        invoke.mockRejectedValue(new Error('nope'));
        renderWithQuery(<ObjectEvents kind="Pod" name="web-1" />);
        expect(await screen.findByText('Failed to load events.')).toBeInTheDocument();
    });
});
