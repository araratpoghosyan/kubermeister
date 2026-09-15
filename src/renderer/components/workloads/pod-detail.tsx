import type { PodDetail as PodDetailModel } from '../../../shared/k8s/pods';
import { CONTAINER_TONE, POD_TONE } from '@/lib/status';
import { StatusBadge } from '@/components/data-display/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function Facts({ facts }: { facts: Array<[string, string]> }) {
    return (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {facts.map(([label, value]) => (
                <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium break-all">{value}</dd>
                </div>
            ))}
        </dl>
    );
}

function Pairs({ title, pairs }: { title: string; pairs: Array<[string, string]> }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {pairs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                ) : (
                    <dl className="space-y-1 text-sm">
                        {pairs.map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                                <dt className="shrink-0 font-mono text-muted-foreground">{key}</dt>
                                <dd className="font-mono break-all">{value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </CardContent>
        </Card>
    );
}

export function PodDetail({ pod }: { pod: PodDetailModel }) {
    return (
        <div className="space-y-4" data-testid="pod-detail">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{pod.name}</CardTitle>
                    <StatusBadge tone={POD_TONE[pod.status]}>{pod.status}</StatusBadge>
                </CardHeader>
                <CardContent>
                    <Facts
                        facts={[
                            ['Namespace', pod.namespace],
                            ['Node', pod.node],
                            ['Pod IP', pod.podIP],
                            ['Host IP', pod.hostIP],
                            ['QoS', pod.qos],
                            ['Service account', pod.serviceAccount],
                            ['DNS policy', pod.dnsPolicy],
                            ['Ready', pod.ready],
                            ['Restarts', String(pod.restarts)],
                            ['Age', pod.age],
                        ]}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Containers</CardTitle>
                </CardHeader>
                <CardContent>
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
                                    <TableCell className="tabular-nums">{`${c.cpuRequest} / ${c.cpuLimit}`}</TableCell>
                                    <TableCell className="tabular-nums">{`${c.memRequest} / ${c.memLimit}`}</TableCell>
                                    <TableCell>{c.ports.join(', ') || '—'}</TableCell>
                                    <TableCell className="text-xs">
                                        {c.probes.length === 0
                                            ? '—'
                                            : c.probes.map((p) => `${p.kind}: ${p.spec}`).join('; ')}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Conditions</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-1 text-sm" data-testid="conditions">
                        {pod.conditions.map((c) => (
                            <li key={c.type} className="flex items-center gap-2">
                                <StatusBadge tone={c.ok ? 'ok' : 'warn'}>{c.ok ? 'True' : 'False'}</StatusBadge>
                                <span>{c.type}</span>
                                <span className="text-muted-foreground">{c.time}</span>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                <Pairs title="Labels" pairs={pod.labels} />
                <Pairs title="Annotations" pairs={pod.annotations} />
            </div>
        </div>
    );
}
