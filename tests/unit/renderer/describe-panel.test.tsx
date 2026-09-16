import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from './helpers';

const invoke = vi.fn();
vi.mock('@/lib/ipc', async () => ({
    ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')),
    invoke,
}));

const toasts = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', async () => ({
    ...(await vi.importActual<typeof import('sonner')>('sonner')),
    toast: toasts,
}));

const download = { downloadTextFile: vi.fn() };
vi.mock('@/lib/download', () => download);

const { DescribePanel } = await import('@/components/templates/describe-panel');

const document_ = {
    kind: 'Pod',
    name: 'web-1',
    namespace: 'team-a',
    sections: [
        {
            title: 'Overview',
            rows: [
                { label: 'Node', value: 'node-1' },
                { label: 'Status', value: 'Running' },
            ],
            blocks: [],
        },
        {
            title: 'Containers',
            rows: [],
            blocks: [{ title: 'web', rows: [{ label: 'Image', value: 'nginx:1.27' }] }],
        },
    ],
};

beforeEach(() => {
    invoke.mockReset();
    toasts.success.mockReset();
    download.downloadTextFile.mockReset();
    invoke.mockResolvedValue(document_);
});

describe('describe panel', () => {
    it('lays out every section, with a block per container', async () => {
        renderWithQuery(<DescribePanel kind="Pod" name="web-1" namespace="team-a" />);
        const panel = await screen.findByTestId('describe');
        const overview = panel.querySelector('[data-section="Overview"]') as HTMLElement;
        expect(within(overview).getByText('Node')).toBeInTheDocument();
        expect(within(overview).getByText('node-1')).toBeInTheDocument();
        const containers = panel.querySelector('[data-section="Containers"]') as HTMLElement;
        expect(containers.querySelector('[data-block="web"]')).toHaveTextContent('nginx:1.27');
        expect(invoke).toHaveBeenCalledWith('resources.describe', {
            kind: 'Pod',
            name: 'web-1',
            namespace: 'team-a',
        });
    });

    it('copies and downloads exactly what it renders', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        renderWithQuery(<DescribePanel kind="Pod" name="web-1" namespace="team-a" />);
        await screen.findByTestId('describe');

        await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
        await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Description copied'));
        expect(writeText.mock.calls[0][0]).toContain('Overview:');
        expect(writeText.mock.calls[0][0]).toContain('nginx:1.27');

        await userEvent.click(screen.getByRole('button', { name: 'Download' }));
        expect(download.downloadTextFile).toHaveBeenCalledWith('web-1-describe.txt', expect.stringContaining('Node:'));
    });

    it('says nothing is there yet before the read answers', () => {
        invoke.mockReturnValue(new Promise(() => {}));
        renderWithQuery(<DescribePanel kind="Node" name="node-1" />);
        expect(screen.getByText('Nothing to show yet.')).toBeInTheDocument();
    });
});
