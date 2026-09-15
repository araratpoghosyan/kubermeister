import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFieldControl } from './field';

export function FormSelect({
    id,
    value,
    options,
    placeholder = 'None available',
    onValueChange,
}: {
    id?: string;
    value: string;
    options?: string[];
    placeholder?: string;
    onValueChange?: (value: string) => void;
}) {
    const { id: fieldId } = useFieldControl(id);
    // Radix rejects empty-string item values, so drop blanks; an empty source shows a disabled
    // placeholder rather than crashing.
    const items = (options ?? [value]).filter((o) => o.length > 0);
    if (items.length === 0) {
        return (
            <button
                type="button"
                id={fieldId}
                disabled
                className="flex h-8 w-full items-center rounded-md border border-border bg-elev-2 px-3 text-body text-text-muted"
            >
                {placeholder}
            </button>
        );
    }
    const controlledProps = onValueChange ? { value, onValueChange } : { defaultValue: value };
    return (
        <Select {...controlledProps}>
            <SelectTrigger id={fieldId} className="h-8 w-full text-body">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {items.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                        {opt}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function Toggle({
    checked,
    defaultChecked,
    disabled,
    onCheckedChange,
    label,
}: {
    checked?: boolean;
    defaultChecked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    label?: string;
}) {
    const controlledProps = checked !== undefined ? { checked, onCheckedChange } : { defaultChecked, onCheckedChange };
    return <Switch {...controlledProps} disabled={disabled} aria-label={label} />;
}
