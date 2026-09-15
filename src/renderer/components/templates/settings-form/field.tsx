import { createContext, useContext, useId, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';

export function FormCard({
    title,
    desc,
    action,
    children,
}: {
    title: string;
    desc?: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Card className="gap-0 rounded-card py-0 shadow-none">
            <div className="flex items-start gap-3.5 border-b border-border px-4.5 py-3.5">
                <div className="flex-1">
                    <div className="text-lead font-semibold">{title}</div>
                    {desc && <div className="mt-0.5 text-meta text-text-muted">{desc}</div>}
                </div>
                {action}
            </div>
            <div className="px-4.5 pt-3.5 pb-4.5">{children}</div>
        </Card>
    );
}

/**
 * The id a `Field` generates for its control. A labelable control reads it through
 * {@link useFieldControl} and sets `id`, so the field's label is associated with it.
 */
const FieldContext = createContext<{ id: string; labelId: string } | undefined>(undefined);

export function useFieldControl(explicitId?: string) {
    const ctx = useContext(FieldContext);
    return { id: explicitId ?? ctx?.id, labelId: ctx?.labelId };
}

export function Field({
    label,
    hint,
    required,
    htmlFor,
    children,
}: {
    label: string;
    hint?: string;
    required?: boolean;
    /** Override the generated control id. */
    htmlFor?: string;
    children: ReactNode;
}) {
    const generatedId = useId();
    const id = htmlFor ?? generatedId;
    const labelId = `${id}-label`;
    return (
        <FieldContext.Provider value={{ id, labelId }}>
            <div className="mt-2.5 mb-1">
                <div className="mb-1.5 flex items-baseline justify-between">
                    <label
                        id={labelId}
                        htmlFor={id}
                        className="text-meta font-medium tracking-wide text-text-2 uppercase"
                    >
                        {label}
                        {required && <span className="ml-1 text-danger">*</span>}
                    </label>
                    {hint && <span className="text-label text-text-muted">{hint}</span>}
                </div>
                {children}
            </div>
        </FieldContext.Provider>
    );
}
