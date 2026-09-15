import { createFileRoute, redirect } from '@tanstack/react-router';
import { CLUSTER_LANDING } from '@/lib/nav';

export const Route = createFileRoute('/')({
    beforeLoad: () => {
        throw redirect({ to: CLUSTER_LANDING });
    },
});
