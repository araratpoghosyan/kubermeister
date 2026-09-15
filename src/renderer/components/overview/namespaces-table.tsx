import type { Namespace } from '../../../shared/k8s/cluster';
import { NAMESPACE_TONE } from '@/lib/status';
import { StatusBadge } from '@/components/data-display/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const LABEL = { accent: 'Active', ok: 'Ready', warn: 'Terminating' } as const;

export function NamespacesTable({ namespaces }: { namespaces: Namespace[] }) {
    if (namespaces.length === 0) return <p className="text-sm text-muted-foreground">No namespaces found.</p>;
    return (
        <Table data-testid="namespaces-table">
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Pods</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {namespaces.map((ns) => (
                    <TableRow key={ns.name} data-namespace={ns.name}>
                        <TableCell className="font-medium">{ns.name}</TableCell>
                        <TableCell>
                            <StatusBadge tone={NAMESPACE_TONE[ns.tone]}>{LABEL[ns.tone]}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{ns.pods}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
