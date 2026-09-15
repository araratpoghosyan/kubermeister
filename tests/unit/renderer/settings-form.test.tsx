import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Field, FormCard, FormSelect, Toggle } from '@/components/templates/settings-form';

describe('settings form primitives', () => {
    it('associates the field label with its control and shows hint and required marker', () => {
        render(
            <FormCard title="Card" desc="About" action={<button>Act</button>}>
                <Field label="Interval" hint="seconds" required>
                    <FormSelect value="5" options={['5', '10']} />
                </Field>
            </FormCard>,
        );
        expect(screen.getByText('Card')).toBeInTheDocument();
        expect(screen.getByText('About')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument();
        expect(screen.getByText('seconds')).toBeInTheDocument();
        expect(screen.getByText('*')).toHaveClass('text-danger');
        const label = screen.getByText(/Interval/);
        expect(screen.getByRole('combobox')).toHaveAttribute('id', label.getAttribute('for'));
        expect(screen.getByRole('combobox')).toHaveTextContent('5');
    });

    it('renders a disabled placeholder when a select has no usable options', () => {
        render(
            <Field label="Role">
                <FormSelect value="" options={['', '']} placeholder="No roles" />
            </Field>,
        );
        // The field label names the control, so the placeholder text is its content, not its name.
        const placeholder = screen.getByRole('button', { name: 'Role' });
        expect(placeholder).toBeDisabled();
        expect(placeholder).toHaveTextContent('No roles');
        expect(placeholder).toHaveAttribute('id', screen.getByText('Role').getAttribute('for'));
    });

    it('drives a controlled select and an uncontrolled toggle', async () => {
        const onValueChange = vi.fn();
        const onCheckedChange = vi.fn();
        render(
            <>
                <FormSelect value="5" options={['5', '10']} onValueChange={onValueChange} />
                <Toggle defaultChecked label="Flag" onCheckedChange={onCheckedChange} />
                <Toggle checked={false} disabled label="Locked" />
            </>,
        );
        await userEvent.click(screen.getByRole('combobox'));
        await userEvent.click(await screen.findByRole('option', { name: '10' }));
        expect(onValueChange).toHaveBeenCalledWith('10');
        const flag = screen.getByRole('switch', { name: 'Flag' });
        expect(flag).toHaveAttribute('aria-checked', 'true');
        await userEvent.click(flag);
        expect(onCheckedChange).toHaveBeenCalledWith(false);
        expect(flag).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('switch', { name: 'Locked' })).toBeDisabled();
    });
});
