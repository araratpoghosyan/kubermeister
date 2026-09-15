import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingRows, QueryError } from '@/components/overview/query-state';
import { IpcError } from '@/lib/ipc';

describe('LoadingRows', () => {
    it('renders the requested number of skeleton rows', () => {
        render(<LoadingRows rows={4} />);
        expect(screen.getByRole('status', { name: 'Loading' }).children).toHaveLength(4);
    });
});

describe('QueryError', () => {
    it('describes a classified query error', () => {
        render(
            <QueryError
                error={new IpcError({ kind: 'forbidden', detail: 'Access denied (RBAC).', op: 'nodes.list' })}
            />,
        );
        expect(screen.getByRole('alert')).toHaveTextContent('Access denied');
        expect(screen.getByRole('alert')).toHaveTextContent('Access denied (RBAC).');
    });
});
