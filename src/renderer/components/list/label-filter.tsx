import { useState } from 'react';
import { TagIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isUsableSelector } from '../../../shared/k8s/selectors';
import { cn } from '@/lib/utils';

/**
 * A label-selector box for a list screen. The selector goes to the API server rather than filtering
 * rows already on screen: that is the only way the same filter can apply to the watch behind the
 * list, and the only way it means anything for a namespace with more objects than one page.
 */
export function LabelFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const [text, setText] = useState(value);
    // The box follows the committed selector when it changes elsewhere (a cleared filter, a new
    // screen), adjusted during render rather than in an effect, which would render twice.
    const [applied, setApplied] = useState(value);
    if (applied !== value) {
        setApplied(value);
        setText(value);
    }
    // Committed on Enter or on blur rather than per keystroke: a half-typed selector matches
    // nothing, and restarting the watch on every character would empty the list as the user types.
    const commit = () => onChange(isUsableSelector(text) ? text.trim() : '');
    const dirty = text.trim() !== value;

    return (
        <div className="flex items-center gap-1.5">
            <TagIcon className="size-3.5 text-text-muted" />
            <Input
                value={text}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') commit();
                    if (event.key === 'Escape') setText(value);
                }}
                placeholder="app=web,tier!=db"
                aria-label="Label selector"
                className={cn('h-8 w-56 font-mono text-meta', dirty && 'border-primary')}
                data-testid="label-filter"
            />
            {value && (
                <Button variant="ghost" size="icon-xs" aria-label="Clear label selector" onClick={() => onChange('')}>
                    <XIcon />
                </Button>
            )}
        </div>
    );
}
