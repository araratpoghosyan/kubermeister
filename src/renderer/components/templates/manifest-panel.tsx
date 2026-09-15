import { CodeIcon, DownloadIcon } from 'lucide-react';
import type { ManifestKind } from '../../../shared/k8s/manifest';
import { YamlEditor } from '@/components/data-display/yaml-editor';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadTextFile } from '@/lib/download';
import { describeError } from '@/lib/k8s-error';
import { useIpcQuery } from '@/lib/query';
import type { DetailTab } from './resource-detail';

interface ManifestPanelProps {
    kind: ManifestKind;
    name: string;
    /** Tells same-named objects apart across namespaces; omitted for cluster-scoped kinds. */
    namespace?: string;
}

/**
 * The shared Manifest tab: the object's live YAML in a read-only editor with a Download action.
 * It fills the body and stays mounted, because the editor owns its own scrolling.
 */
export function manifestTab(props: ManifestPanelProps): DetailTab {
    return {
        id: 'manifest',
        label: 'Manifest',
        icon: CodeIcon,
        hint: 'YAML',
        fill: true,
        keepMounted: true,
        content: <ManifestPanel {...props} />,
    };
}

const FRAME = 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-border';

export function ManifestPanel({ kind, name, namespace }: ManifestPanelProps) {
    const query = useIpcQuery('resources.getYaml', { kind, name, namespace });
    const text = query.data?.yaml ?? '';

    if (query.isPending) {
        return (
            <div className={`${FRAME} gap-2 p-3.5`} data-testid="manifest-loading">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                ))}
            </div>
        );
    }

    if (query.isError) {
        const error = describeError(query.error);
        return (
            <div
                className={`${FRAME} items-center justify-center gap-3 p-6 text-center text-body text-text-muted`}
                data-testid="manifest-error"
            >
                <span>
                    {error.title}: {error.detail}
                </span>
                <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className={FRAME} data-testid="manifest-panel">
            <div className="flex items-center gap-2 border-b border-border py-1.5 pr-2 pl-3.5">
                <span className="font-mono text-caption text-text-muted">
                    {query.data?.kind ?? kind} “{name}”
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => downloadTextFile(`${name}.yaml`, text, 'text/yaml')}>
                    <DownloadIcon />
                    Download
                </Button>
            </div>
            <YamlEditor
                value={text}
                onValueChange={() => {}}
                readOnly
                aria-label={`${query.data?.kind ?? kind} manifest`}
                className="min-h-0 flex-1"
            />
        </div>
    );
}
