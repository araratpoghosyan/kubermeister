import type { Node } from '../../../shared/k8s/nodes';
import { NODE_TONE } from '@/lib/status';
import { StatusBadge } from '@/components/data-display/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function NodesTable({ nodes }: { nodes: Node[] }) {
    if (nodes.length === 0) return <p className="text-sm text-muted-foreground">No nodes found.</p>;
    return (
        <Table data-testid="nodes-table">
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">CPU</TableHead>
                    <TableHead className="text-right">Memory</TableHead>
                    <TableHead className="text-right">Pods</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Age</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {nodes.map((node) => (
                    <TableRow key={node.name} data-node={node.name}>
                        <TableCell className="font-medium">{node.name}</TableCell>
                        <TableCell>
                            <StatusBadge tone={NODE_TONE[node.status]}>{node.status}</StatusBadge>
                        </TableCell>
                        <TableCell>{node.role}</TableCell>
                        <TableCell className="text-right tabular-nums">{node.cpu}</TableCell>
                        <TableCell className="text-right tabular-nums">{node.memory} GiB</TableCell>
                        <TableCell className="text-right tabular-nums">{node.pods}</TableCell>
                        <TableCell className="text-muted-foreground">{node.version}</TableCell>
                        <TableCell className="text-muted-foreground">{node.age}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
