import type { ObjectEventsInput } from '../../../shared/k8s/events';
import { Card } from '@/components/ui/card';
import { EventsList } from '@/components/data-display/events-list';
import { useIpcQuery } from '@/lib/query';

/**
 * Events tab panel for a single object, fetched by kind and name and rendered in a bordered card
 * with distinct loading and error states. Use as the content of an "Events" tab via `eventsTab`.
 */
export function ObjectEvents(target: ObjectEventsInput) {
    const { data, isPending, isError } = useIpcQuery('events.forObject', target, { refetchInterval: 15_000 });
    return (
        <Card className="gap-0 overflow-hidden rounded-card py-0 shadow-none" data-testid="object-events">
            <EventsList events={data ?? []} showObject={false} isLoading={isPending} isError={isError} />
        </Card>
    );
}
