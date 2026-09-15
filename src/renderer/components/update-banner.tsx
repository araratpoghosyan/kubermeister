import { useEffect, useState } from 'react';
import type { UpdateState } from '../../shared/ipc';
import { invoke, subscribe } from '@/lib/ipc';
import { Button } from '@/components/ui/button';

export function describeUpdate(update: UpdateState): string | null {
    switch (update.status) {
        case 'downloading':
            return `Downloading ${update.version ?? 'update'}… ${update.percent ?? 0}%`;
        case 'downloaded':
            return `Version ${update.version ?? ''} is ready to install.`;
        case 'error':
            return `Update check failed: ${update.message ?? 'unknown error'}`;
        default:
            // idle, checking, up-to-date and unsupported are not worth a banner.
            return null;
    }
}

/** Shows update progress pushed from the main process; silent unless something needs attention. */
export function UpdateBanner() {
    const [update, setUpdate] = useState<UpdateState | null>(null);

    useEffect(() => {
        // A push can arrive before the initial read resolves; the push is newer, so it wins.
        let active = true;
        let pushed = false;
        const unsubscribe = subscribe('update.state', (state) => {
            pushed = true;
            if (active) setUpdate(state);
        });
        void invoke('update.state', {}).then((state) => {
            if (active && !pushed) setUpdate(state);
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    const text = update ? describeUpdate(update) : null;
    if (!update || !text) return null;

    return (
        <div
            role="status"
            data-testid="update-banner"
            data-status={update.status}
            className="flex items-center justify-between gap-3 border-b bg-muted px-4 py-2 text-sm"
        >
            <span>{text}</span>
            {update.status === 'downloaded' && (
                <Button size="sm" onClick={() => void invoke('update.install', {})}>
                    Restart to update
                </Button>
            )}
        </div>
    );
}
