import { describeError } from '@/lib/k8s-error';
import { Skeleton } from '@/components/ui/skeleton';

export function LoadingRows({ rows = 3 }: { rows?: number }) {
    return (
        <div className="space-y-2" role="status" aria-label="Loading">
            {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
            ))}
        </div>
    );
}

export function QueryError({ error }: { error: unknown }) {
    const { title, detail } = describeError(error);
    return (
        <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <p className="font-medium">{title}</p>
            <p className="text-muted-foreground">{detail}</p>
        </div>
    );
}
