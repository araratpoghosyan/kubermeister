import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The theme defines its own font-size scale (`--text-body`, `--text-meta`, ...). Without this hint
// tailwind-merge files `text-meta` under text color and drops `text-text-muted` written next to it.
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-size': [{ text: ['eyebrow', 'caption', 'label', 'meta', 'cell', 'body', 'lead', 'title'] }],
        },
    },
});

export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

/** Insert spaces at camelCase boundaries so "ClusterRoleBinding" reads "Cluster Role Binding". */
export function spaceKind(kind: string): string {
    return kind.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}
