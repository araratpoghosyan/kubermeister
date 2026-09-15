import type { PodDetail } from '../../../shared/k8s/pods';
import { Card } from '@/components/ui/card';
import { PortForwardControl } from '@/components/pod/port-forward-control';

/** Pod-detail Network tab: connectivity facts plus the port-forward control. */
export function NetworkTab({ name, namespace, pod }: { name: string; namespace: string; pod?: PodDetail | null }) {
    const ports = pod?.containers.flatMap((c) => c.ports) ?? [];
    const rows: [string, string][] = [
        ['Pod IP', pod?.podIP ?? '—'],
        ['Host IP', pod?.hostIP ?? '—'],
        ['Node', pod?.node ?? '—'],
        ['Container ports', ports.length ? ports.join(', ') : '—'],
        ['QoS class', pod?.qos ?? '—'],
        ['DNS policy', pod?.dnsPolicy ?? '—'],
        ['Service account', pod?.serviceAccount ?? '—'],
    ];
    return (
        <Card className="gap-0 rounded-card py-0 shadow-none" data-testid="network">
            <div className="border-b border-border px-4 py-3 text-body font-semibold">Ports & connectivity</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 text-cell">
                {rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                        <span className="text-text-muted">{k}</span>
                        <span className="font-mono break-all text-text-2">{v}</span>
                    </div>
                ))}
            </div>
            <PortForwardControl name={name} namespace={namespace} pod={pod} />
        </Card>
    );
}
