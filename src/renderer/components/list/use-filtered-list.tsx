import { useState } from 'react';
import type { Kind } from '../../../shared/k8s/registry';
import { useWatchedList } from '@/lib/watch';
import { LabelFilter } from './label-filter';

/**
 * A watched list with a label filter over it. The selector travels to the API server with both the
 * list and the watch, so a filtered screen stays live and a filter means the same thing whether the
 * namespace holds ten objects or ten thousand.
 */
export function useFilteredList<K extends Kind>(kind: K, namespace?: string) {
    const [selector, setSelector] = useState('');
    const list = useWatchedList(kind, namespace, selector || undefined);
    return { ...list, filter: <LabelFilter value={selector} onChange={setSelector} /> };
}
