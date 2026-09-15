import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoxIcon, HeartIcon, ScrollIcon, TerminalIcon } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { KeyValueCard, labelsTab, overviewTab, ResourceDetail } from '@/components/templates/resource-detail';

vi.mock('@/lib/ipc', async () => ({
    ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')),
    invoke: vi.fn(),
}));

type Props = Partial<Parameters<typeof ResourceDetail>[0]>;
const ready = { isPending: false, isError: false, isSuccess: true, refetch: vi.fn() };

const groups = [
    {
        label: 'OBSERVE',
        items: [
            { id: 'overview', label: 'Overview', icon: HeartIcon, content: <p>overview body</p> },
            {
                id: 'logs',
                label: 'Logs',
                icon: ScrollIcon,
                fill: true,
                keepMounted: true,
                content: <p>logs body</p>,
                hint: 'live',
            },
        ],
    },
    {
        label: 'CONNECT',
        items: [{ id: 'shell', label: 'Shell', icon: TerminalIcon, count: 2, content: <p>shell body</p> }],
    },
];

function renderDetail(props: Props) {
    const root = createRootRoute({ component: Outlet });
    const index = createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => (
            <ResourceDetail
                icon={BoxIcon}
                eyebrow="Pod"
                title="web-1"
                groups={groups}
                query={ready}
                found
                kind="Pod"
                backTo="/list"
                testId="detail"
                {...props}
            />
        ),
    });
    const list = createRoute({ getParentRoute: () => root, path: '/list', component: () => <p>the list</p> });
    const router = createRouter({
        routeTree: root.addChildren([index, list]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(
        <QueryClientProvider client={new QueryClient()}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return router;
}

describe('ResourceDetail', () => {
    it('renders the header, grouped rail with counts and hints, and the first tab', async () => {
        renderDetail({});
        expect(await screen.findByText('web-1')).toBeInTheDocument();
        const rail = screen.getByRole('tablist');
        expect(rail).toHaveAttribute('aria-orientation', 'vertical');
        expect(rail).toHaveTextContent('OBSERVE');
        expect(rail).toHaveTextContent('CONNECT');
        expect(within(rail).getAllByRole('tab')).toHaveLength(3);
        expect(within(rail).getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
        expect(within(rail).getByRole('tab', { name: /Shell/ })).toHaveTextContent('2');
        expect(within(rail).getByRole('tab', { name: /Logs/ })).toHaveTextContent('live');
        expect(screen.getByText('overview body')).toBeVisible();
        expect(screen.queryByText('shell body')).not.toBeInTheDocument();
        // keepMounted panels exist hidden from the start so their live state can build up.
        expect(screen.getByText('logs body')).not.toBeVisible();
        expect(screen.getByTestId('detail-body')).toBeInTheDocument();
    });

    it('switches tabs on click, keeps mounted panels hidden, and unmounts the rest', async () => {
        renderDetail({});
        await userEvent.click(await screen.findByRole('tab', { name: /Shell/ }));
        expect(screen.getByText('shell body')).toBeVisible();
        expect(screen.queryByText('overview body')).not.toBeInTheDocument();
        expect(screen.getByText('logs body')).not.toBeVisible();
        await userEvent.click(screen.getByRole('tab', { name: /Logs/ }));
        expect(screen.getByText('logs body')).toBeVisible();
        expect(screen.getByRole('tabpanel')).toHaveClass('overflow-hidden');
    });

    it('moves the selection with arrow keys, wrapping around the flat order', async () => {
        renderDetail({});
        const overview = await screen.findByRole('tab', { name: /Overview/ });
        overview.focus();
        await userEvent.keyboard('{ArrowDown}');
        expect(screen.getByRole('tab', { name: /Logs/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: /Logs/ })).toHaveFocus();
        await userEvent.keyboard('{ArrowUp}{ArrowUp}');
        expect(screen.getByRole('tab', { name: /Shell/ })).toHaveAttribute('aria-selected', 'true');
        await userEvent.keyboard('{ArrowRight}');
        expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
        await userEvent.keyboard('{Enter}');
        expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('shows skeletons while loading', async () => {
        renderDetail({ query: { ...ready, isPending: true, isSuccess: false } });
        expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('shows the error panel with retry and a link back to the list', async () => {
        const refetch = vi.fn();
        const router = renderDetail({ query: { ...ready, isError: true, isSuccess: false, refetch } });
        expect(await screen.findByTestId('detail-error')).toHaveTextContent('Failed to load Pod.');
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(refetch).toHaveBeenCalledOnce();
        await userEvent.click(screen.getByRole('link', { name: 'Back to list' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/list'));
    });

    it('shows not found naming the namespace when known, otherwise the current one', async () => {
        renderDetail({ found: false, namespace: 'team-a' });
        expect(await screen.findByTestId('not-found')).toHaveTextContent(
            'Pod “web-1” was not found in namespace “team-a”.',
        );
        expect(screen.getByRole('link', { name: 'Back to list' })).toHaveAttribute('href', '/list');
    });

    it('falls back to generic copy without a kind or namespace and hides links without backTo', async () => {
        renderDetail({ found: false, kind: undefined, backTo: undefined });
        expect(await screen.findByTestId('not-found')).toHaveTextContent(
            'Resource “web-1” was not found in the current namespace.',
        );
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
});

describe('tab factories', () => {
    it('overviewTab renders a details grid and labelsTab counts the labels', () => {
        const overview = overviewTab([['Node', 'n1']]);
        render(<>{overview.content}</>);
        expect(screen.getByText('Details')).toBeInTheDocument();
        expect(screen.getByText('n1')).toBeInTheDocument();

        const labels = labelsTab({ labels: [['app', 'web']], annotations: [] });
        expect(labels.count).toBe(1);
        expect(labelsTab(undefined).count).toBeUndefined();
        expect(labelsTab({ labels: [], annotations: [] }).count).toBeUndefined();
        render(<>{labels.content}</>);
        expect(screen.getByText('app')).toBeInTheDocument();
        expect(screen.getByText('None.')).toBeInTheDocument();
    });

    it('KeyValueCard lists rows in mono with the last row unbordered', () => {
        render(
            <KeyValueCard
                title="Labels"
                rows={[
                    ['a', '1'],
                    ['b', '2'],
                ]}
            />,
        );
        expect(screen.getByText('a').parentElement).toHaveClass('border-b');
        expect(screen.getByText('b').parentElement).not.toHaveClass('border-b');
    });
});
