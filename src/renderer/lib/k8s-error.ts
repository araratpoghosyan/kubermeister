import type { K8sErrorKind } from '../../shared/k8s/errors';
import { IpcError } from './ipc';

export interface DescribedError {
    kind: K8sErrorKind;
    title: string;
    detail: string;
}

const TITLES: Record<K8sErrorKind, string> = {
    unreachable: 'Cluster unreachable',
    forbidden: 'Access denied',
    unauthorized: 'Not authenticated',
    notFound: 'Not found',
    conflict: 'Conflict',
    invalid: 'Invalid manifest',
    unknown: 'Something went wrong',
};

/** The short title for a classified kind, for places that carry the kind without an error object. */
export function titleForKind(kind: K8sErrorKind): string {
    return TITLES[kind];
}

/** Title and detail for any failure: structured for an {@link IpcError}, best effort otherwise. */
export function describeError(error: unknown): DescribedError {
    if (error instanceof IpcError) {
        return { kind: error.kind, title: TITLES[error.kind], detail: error.detail || TITLES[error.kind] };
    }
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return { kind: 'unknown', title: TITLES.unknown, detail: message || TITLES.unknown };
}
