import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClusterSummary } from '@/components/overview/cluster-summary';
import { NamespacesTable } from '@/components/overview/namespaces-table';
import { NodesTable } from '@/components/overview/nodes-table';
import { QueryError } from '@/components/overview/query-state';
import { IpcError } from '@/lib/ipc';

describe('overview tables', () => {
    it('renders node rows with a status badge tone per status', () => {
        render(
            <NodesTable
                nodes={[
                    {
                        name: 'n1',
                        status: 'Ready',
                        role: 'control-plane',
                        version: 'v1.36',
                        cpu: 4,
                        memory: 7.8,
                        pods: 12,
                        age: '3d',
                        instanceType: 'k3s',
                    },
                    {
                        name: 'n2',
                        status: 'Cordoned',
                        role: 'worker',
                        version: 'v1.36',
                        cpu: 2,
                        memory: 3.9,
                        pods: 0,
                        age: '1h',
                        instanceType: '—',
                    },
                ]}
            />,
        );
        expect(screen.getAllByRole('row')).toHaveLength(3);
        expect(screen.getByText('Ready')).toHaveAttribute('data-tone', 'ok');
        expect(screen.getByText('Cordoned')).toHaveAttribute('data-tone', 'warn');
        expect(screen.getByText('7.8 GiB')).toBeInTheDocument();
    });

    it('renders an empty state without a table', () => {
        render(<NodesTable nodes={[]} />);
        expect(screen.getByText('No nodes found.')).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('labels namespaces by tone', () => {
        render(
            <NamespacesTable
                namespaces={[
                    { name: 'team-a', pods: 3, tone: 'accent' },
                    { name: 'kube-system', pods: 9, tone: 'ok' },
                    { name: 'old', pods: 0, tone: 'warn' },
                ]}
            />,
        );
        expect(screen.getByText('Active')).toHaveAttribute('data-tone', 'accent');
        expect(screen.getByText('Ready')).toHaveAttribute('data-tone', 'ok');
        expect(screen.getByText('Terminating')).toHaveAttribute('data-tone', 'warn');
    });

    it('shows cluster facts and health', () => {
        render(
            <ClusterSummary
                cluster={{
                    name: 'alpha',
                    nodes: 3,
                    status: 'Degraded',
                    version: '1.36.4',
                    provider: 'k3s',
                    region: 'eu',
                }}
            />,
        );
        expect(screen.getByText('alpha')).toBeInTheDocument();
        expect(screen.getByText('Degraded')).toHaveAttribute('data-tone', 'warn');
        expect(screen.getByText('1.36.4')).toBeInTheDocument();
    });

    it('describes a classified query error', () => {
        render(
            <QueryError
                error={new IpcError({ kind: 'forbidden', detail: 'Access denied (RBAC).', op: 'nodes.list' })}
            />,
        );
        expect(screen.getByRole('alert')).toHaveTextContent('Access denied');
        expect(screen.getByRole('alert')).toHaveTextContent('Access denied (RBAC).');
    });
});
