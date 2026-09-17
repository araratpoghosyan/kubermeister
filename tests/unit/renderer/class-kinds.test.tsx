import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from './helpers';

const invoke = vi.fn();
const subscribe = vi.fn(() => () => {});
const stream = vi.fn(() => ({ stop: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/ipc', async () => ({
    ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')),
    invoke,
    subscribe,
    stream,
}));

const { routeTree } = await import('@/routeTree.gen');

const runtimeClass = {
    name: 'gvisor',
    handler: 'runsc',
    nodeSelector: 'sandbox=true',
    overhead: 'cpu=250m',
    age: '3h',
};
const ingressClass = {
    name: 'nginx',
    controller: 'k8s.io/ingress-nginx',
    parameters: '—',
    isDefault: true,
    age: '1h',
};
const plainClass = { ...ingressClass, name: 'traefik', isDefault: false };
const driver = {
    name: 'ebs.csi.aws.com',
    attachRequired: true,
    podInfoOnMount: false,
    storageCapacity: true,
    fsGroupPolicy: 'File',
    modes: 'Persistent',
    age: '1h',
};
const csiNode = { name: 'node-1', drivers: 2, driverNames: 'ebs.csi.aws.com, efs.csi.aws.com', age: '2h' };
const capacity = {
    name: 'csisc-abc',
    namespace: 'kube-system',
    storageClass: 'fast',
    capacity: '500Gi',
    maximumVolumeSize: '100Gi',
    topology: 'zone=eu-west-1a',
    age: '1h',
};

const meta = { labels: [['vendor', 'aws']], annotations: [] };
const rows: Record<string, unknown[]> = {
    RuntimeClass: [runtimeClass],
    IngressClass: [ingressClass, plainClass],
    CSIDriver: [driver],
    CSINode: [csiNode],
    CSIStorageCapacity: [capacity],
};
const details: Record<string, unknown> = {
    RuntimeClass: { ...runtimeClass, ...meta },
    IngressClass: { ...ingressClass, ...meta },
    CSIDriver: { ...driver, ...meta },
    CSINode: { ...csiNode, ...meta },
    CSIStorageCapacity: { ...capacity, ...meta },
};
const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
    'namespaces.list': [{ name: 'kube-system', pods: 3, tone: 'accent' }],
    'namespace.active': { name: 'kube-system' },
    'cluster.active': null,
    'events.forObject': [],
};

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (channel: string, input: { kind?: string }) => {
        if (channel === 'resources.list') return { kind: input.kind, items: rows[input.kind!] ?? [] };
        if (channel === 'resources.get') return { kind: input.kind, item: details[input.kind!] ?? null };
        return data[channel];
    });
});

describe('runtime and ingress class screens', () => {
    it('lists runtime classes with the handler they select', async () => {
        renderRoutes(routeTree, '/overview/runtimeclasses');
        const table = await screen.findByTestId('runtimeclasses-table');
        expect(invoke).toHaveBeenCalledWith('resources.list', { kind: 'RuntimeClass', namespace: undefined });
        const row = table.querySelector('[data-runtimeclass="gvisor"]') as HTMLElement;
        expect(row).toHaveTextContent('runsc');
        expect(row).toHaveTextContent('sandbox=true');
        expect(within(row).getByRole('link', { name: 'gvisor' })).toHaveAttribute(
            'href',
            '/overview/runtimeclasses/gvisor',
        );
    });

    it('badges the default ingress class and dashes the rest', async () => {
        renderRoutes(routeTree, '/network/ingressclasses');
        const table = await screen.findByTestId('ingressclasses-table');
        const nginx = table.querySelector('[data-ingressclass="nginx"]') as HTMLElement;
        expect(within(nginx).getByText('default')).toBeInTheDocument();
        expect(nginx).toHaveTextContent('k8s.io/ingress-nginx');
        const traefik = table.querySelector('[data-ingressclass="traefik"]') as HTMLElement;
        expect(within(traefik).queryByText('default')).not.toBeInTheDocument();
    });

    it('renders both cluster-scoped details without a namespace', async () => {
        const { unmount } = renderRoutes(routeTree, '/overview/runtimeclasses/gvisor');
        const page = await screen.findByTestId('runtimeclass-page');
        await waitFor(() => expect(page).toHaveTextContent('handler: runsc'));
        expect(invoke).toHaveBeenCalledWith('resources.get', {
            kind: 'RuntimeClass',
            name: 'gvisor',
            namespace: undefined,
        });
        expect(within(page).getByText('Pod overhead')).toBeInTheDocument();
        unmount();

        renderRoutes(routeTree, '/network/ingressclasses/nginx');
        const ingress = await screen.findByTestId('ingressclass-page');
        await waitFor(() => expect(ingress).toHaveTextContent('controller: k8s.io/ingress-nginx'));
        const rail = within(ingress).getByRole('tablist');
        expect(
            within(rail)
                .getAllByRole('tab')
                .map((t) => t.textContent),
        ).toEqual(['Overview', 'Events', 'ManifestYAML', 'Labels1']);
    });
});

describe('csi screens', () => {
    it('lists drivers with their flags in the API’s own words', async () => {
        renderRoutes(routeTree, '/storage/csidrivers');
        const table = await screen.findByTestId('csidrivers-table');
        const row = table.querySelector('[data-csidriver="ebs.csi.aws.com"]') as HTMLElement;
        expect(within(row).getAllByText('true')).toHaveLength(2);
        expect(within(row).getByText('false')).toHaveClass('text-text-muted');
        expect(row).toHaveTextContent('Persistent');
    });

    it('lists the drivers each node has registered', async () => {
        renderRoutes(routeTree, '/storage/csinodes');
        const table = await screen.findByTestId('csinodes-table');
        const row = table.querySelector('[data-csinode="node-1"]') as HTMLElement;
        expect(row).toHaveTextContent('2');
        expect(row).toHaveTextContent('efs.csi.aws.com');
    });

    it('lists storage capacity per topology segment and opens its namespaced detail', async () => {
        renderRoutes(routeTree, '/storage/capacity');
        const table = await screen.findByTestId('capacity-table');
        const row = table.querySelector('[data-capacity="csisc-abc"]') as HTMLElement;
        expect(row).toHaveTextContent('500Gi');
        expect(row).toHaveTextContent('zone=eu-west-1a');
        expect(within(row).getByRole('link', { name: 'csisc-abc' })).toHaveAttribute(
            'href',
            '/storage/capacity/kube-system/csisc-abc',
        );

        await userEvent.click(within(row).getByRole('link', { name: 'csisc-abc' }));
        const page = await screen.findByTestId('capacity-page');
        await waitFor(() => expect(page).toHaveTextContent('class: fast'));
        expect(page).toHaveTextContent('capacity: 500Gi');
    });

    it('renders the driver detail with its modes', async () => {
        renderRoutes(routeTree, '/storage/csidrivers/ebs.csi.aws.com');
        const page = await screen.findByTestId('csidriver-page');
        await waitFor(() => expect(page).toHaveTextContent('modes: Persistent'));
        expect(within(page).getByText('fsGroup policy')).toBeInTheDocument();
    });
});
