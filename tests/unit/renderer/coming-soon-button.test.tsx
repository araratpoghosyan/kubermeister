import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ComingSoonButton } from '@/components/coming-soon-button';
import { renderWithQuery } from './helpers';

describe('ComingSoonButton', () => {
    it('stays focusable, blocks activation, and explains itself on hover', async () => {
        const onClick = vi.fn((event: React.MouseEvent) => event.defaultPrevented);
        renderWithQuery(
            <form onSubmit={onClick}>
                <ComingSoonButton tip="Restart arrives later">Restart</ComingSoonButton>
            </form>,
        );
        const button = screen.getByRole('button', { name: 'Restart' });
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).not.toBeDisabled();
        expect(button).toHaveClass('opacity-50');
        await userEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
        await userEvent.hover(button);
        expect((await screen.findAllByText('Restart arrives later')).length).toBeGreaterThan(0);
    });
});
