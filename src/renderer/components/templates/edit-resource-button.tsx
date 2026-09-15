import { useContext } from 'react';
import { PencilIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManifestEditContext } from './manifest-edit';

/**
 * The header's Edit action: opens the page's Manifest tab in edit mode. It renders nothing outside
 * a detail page, since there would be no manifest to edit.
 */
export function EditResourceButton() {
    const editControl = useContext(ManifestEditContext);
    if (!editControl) return null;
    return (
        <Button variant="outline" size="sm" onClick={editControl.requestEdit}>
            <PencilIcon />
            Edit
        </Button>
    );
}
