import { Loader2 } from 'lucide-react';

export function Preloader({ label = 'Checking your cluster connection…' }: { label?: string }) {
    return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground" role="status">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            <p className="text-sm">{label}</p>
        </div>
    );
}
