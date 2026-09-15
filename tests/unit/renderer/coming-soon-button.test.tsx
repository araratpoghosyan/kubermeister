import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ComingSoonButton } from '@/components/coming-soon-button';
import { renderWithQuery } from './helpers';

describe('ComingSoonButton', () => {
    it('stays focusable, blocks activation, and explains itself on focus', async () => {
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
        // The reason is announced on focus, which is why the button is aria-disabled instead of disabled.
        await userEvent.tab();
        expect(button).toHaveFocus();
        expect(await screen.findByRole('tooltip', {}, { timeout: 3000 })).toHaveTextContent('Restart arrives later');
    });
});
