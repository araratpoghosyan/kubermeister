import { createFileRoute } from '@tanstack/react-router';
import { HeartIcon, KeyIcon, LockIcon } from 'lucide-react';
import { RefreshButton } from '@/components/refresh-button';
import { DetailCard, PropertyGrid } from '@/components/templates/detail-cards';
import { eventsTab, labelsTab, ResourceDetail, type DetailTabGroup } from '@/components/templates/resource-detail';
import { manifestTab } from '@/components/templates/manifest-panel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ipcQueryKey, useIpcQuery } from '@/lib/query';
import { useResource } from '@/lib/resources';
import { useRefreshIntervalMs } from '@/lib/settings';

export const Route = createFileRoute('/workloads/secrets/$namespace/$name')({ component: SecretDetailPage });

function SecretDetailPage() {
    const { namespace, name } = Route.useParams();
    const query = useResource('Secret', name, namespace);
    const secret = query.data;
    const entries =
        useIpcQuery('secrets.entries', { name, namespace }, { refetchInterval: useRefreshIntervalMs() }).data ?? [];

    const groups: DetailTabGroup[] = [
        {
            label: 'OBSERVE',
            items: [
                {
                    id: 'overview',
                    label: 'Overview',
                    icon: HeartIcon,
                    content: (
                        <DetailCard title="Details">
                            <PropertyGrid
                                rows={[
                                    ['Namespace', secret?.namespace ?? namespace],
                                    ['Type', secret?.type ?? '—'],
                                    ['Keys', String(secret?.keys ?? entries.length)],
                                    ['Age', secret?.age ?? '—'],
                                ]}
                            />
                        </DetailCard>
                    ),
                },
                eventsTab({ kind: 'Secret', name, namespace }),
            ],
        },
        {
            label: 'DATA',
            items: [
                {
                    id: 'data',
                    label: 'Keys',
                    icon: KeyIcon,
                    count: entries.length || undefined,
                    content: (
                        <DetailCard title="Data" desc="Values are masked here; the Manifest tab shows them as-is">
                            <Table data-testid="secret-keys">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[200px]">Key</TableHead>
                                        <TableHead>Value</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {entries.map((entry) => (
                                        <TableRow key={entry.key}>
                                            <TableCell className="font-mono text-primary">{entry.key}</TableCell>
                                            <TableCell className="font-mono tracking-widest text-text-muted">
                                                {entry.masked}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </DetailCard>
                    ),
                },
            ],
        },
        {
            label: 'INSPECT',
            items: [
                manifestTab({ kind: 'Secret', name, namespace }),
                labelsTab(secret ? { labels: secret.labels, annotations: secret.annotations } : undefined),
            ],
        },
    ];

    return (
        <ResourceDetail
            icon={LockIcon}
            eyebrow="Secret"
            title={name}
            kind="Secret"
            namespace={namespace}
            backTo="/workloads/secrets"
            query={query}
            found={!!secret}
            actions={
                <RefreshButton
                    queryKeys={[
                        ipcQueryKey('resources.get', { kind: 'Secret', name, namespace }),
                        ipcQueryKey('secrets.entries', { name, namespace }),
                    ]}
                />
            }
            meta={[
                `namespace: ${secret?.namespace ?? namespace}`,
                `type: ${secret?.type ?? '—'}`,
                `keys: ${secret?.keys ?? entries.length}`,
            ]}
            groups={groups}
            testId="secret-page"
        />
    );
}
