import { Link } from '@tanstack/react-router';
import type { Pod } from '../../../shared/k8s/pods';
import { POD_TONE } from '@/lib/status';
import { StatusBadge } from '@/components/data-display/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function PodsTable({ pods }: { pods: Pod[] }) {
    if (pods.length === 0) return <p className="text-sm text-muted-foreground">No pods found.</p>;
    return (
        <Table data-testid="pods-table">
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Namespace</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ready</TableHead>
                    <TableHead className="text-right">Restarts</TableHead>
                    <TableHead>Node</TableHead>
                    <TableHead>Age</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {pods.map((pod) => (
                    <TableRow key={`${pod.namespace}/${pod.name}`} data-pod={pod.name}>
                        <TableCell className="font-medium">
                            <Link
                                to="/workloads/pods/$namespace/$name"
                                params={{ namespace: pod.namespace, name: pod.name }}
                                className="hover:underline"
                            >
                                {pod.name}
                            </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{pod.namespace}</TableCell>
                        <TableCell>
                            <StatusBadge tone={POD_TONE[pod.status]}>{pod.status}</StatusBadge>
                        </TableCell>
                        <TableCell className="tabular-nums">{pod.ready}</TableCell>
                        <TableCell className="text-right tabular-nums">{pod.restarts}</TableCell>
                        <TableCell className="text-muted-foreground">{pod.node}</TableCell>
                        <TableCell className="text-muted-foreground">{pod.age}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
