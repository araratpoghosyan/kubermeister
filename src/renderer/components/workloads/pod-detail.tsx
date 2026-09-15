import type { PodDetail as PodDetailModel } from '../../../shared/k8s/pods';
import { StatusBadge } from '@/components/data-display/status-badge';
import { DetailCard, PropertyGrid } from '@/components/templates/detail-cards';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CONTAINER_TONE } from '@/lib/status';

function Pairs({ title, pairs }: { title: string; pairs: Array<[string, string]> }) {
    return (
        <DetailCard
            title={title}
            desc={pairs.length === 0 ? 'None' : `${pairs.length} ${pairs.length === 1 ? 'entry' : 'entries'}`}
        >
            {pairs.length === 0 ? (
                <p className="text-cell text-text-muted">None</p>
            ) : (
                <dl className="space-y-1 text-cell">
                    {pairs.map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                            <dt className="shrink-0 font-mono text-text-muted">{key}</dt>
                            <dd className="font-mono break-all text-text-2">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </DetailCard>
    );
}

export function PodDetail({ pod }: { pod: PodDetailModel }) {
    return (
        <div className="space-y-4" data-testid="pod-detail">
            <div className="grid gap-4 lg:grid-cols-2">
                <DetailCard title="Placement" desc="Where the pod runs">
                    <PropertyGrid
                        columns={1}
                        rows={[
                            ['Namespace', pod.namespace],
                            ['Node', pod.node],
                            ['Service account', pod.serviceAccount],
                            ['QoS class', pod.qos],
                            ['DNS policy', pod.dnsPolicy],
                        ]}
                    />
                </DetailCard>
                <DetailCard title="Network" desc="Addresses">
                    <PropertyGrid
                        columns={1}
                        rows={[
                            ['Pod IP', pod.podIP],
                            ['Host IP', pod.hostIP],
                            ['Ready', pod.ready],
                            ['Restarts', String(pod.restarts)],
                        ]}
                    />
                </DetailCard>
            </div>

            <DetailCard
                title="Containers"
                desc={`${pod.containers.length} ${pod.containers.length === 1 ? 'container' : 'containers'}`}
                bodyClassName="p-0"
            >
                <Table data-testid="containers-table">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Image</TableHead>
                            <TableHead className="text-right">Restarts</TableHead>
                            <TableHead>CPU req / lim</TableHead>
                            <TableHead>Memory req / lim</TableHead>
                            <TableHead>Ports</TableHead>
                            <TableHead>Probes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pod.containers.map((c) => (
                            <TableRow key={c.name} data-container={c.name}>
                                <TableCell className="font-medium">{c.name}</TableCell>
                                <TableCell>
                                    <StatusBadge tone={CONTAINER_TONE[c.state]}>{c.state}</StatusBadge>
                                </TableCell>
                                <TableCell className="font-mono text-xs break-all">{c.image}</TableCell>
                                <TableCell className="text-right tabular-nums">{c.restarts}</TableCell>
                                <TableCell className="font-mono tabular-nums">{`${c.cpuRequest} / ${c.cpuLimit}`}</TableCell>
                                <TableCell className="font-mono tabular-nums">{`${c.memRequest} / ${c.memLimit}`}</TableCell>
                                <TableCell className="font-mono">{c.ports.join(', ') || '—'}</TableCell>
                                <TableCell className="text-xs">
                                    {c.probes.length === 0
                                        ? '—'
                                        : c.probes.map((p) => `${p.kind}: ${p.spec}`).join('; ')}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </DetailCard>

            <DetailCard title="Conditions" desc="Latest transition per condition">
                <ul className="space-y-1.5 text-cell" data-testid="conditions">
                    {pod.conditions.map((c) => (
                        <li key={c.type} className="flex items-center gap-2">
                            <StatusBadge tone={c.ok ? 'ok' : 'warn'}>{c.ok ? 'True' : 'False'}</StatusBadge>
                            <span>{c.type}</span>
                            <span className="text-text-muted">{c.time}</span>
                        </li>
                    ))}
                </ul>
            </DetailCard>

            <div className="grid gap-4 lg:grid-cols-2">
                <Pairs title="Labels" pairs={pod.labels} />
                <Pairs title="Annotations" pairs={pod.annotations} />
            </div>
        </div>
    );
}
