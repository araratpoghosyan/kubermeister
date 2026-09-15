import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

/**
 * The handshake between the detail chrome and the Manifest tab. The header's Edit action calls
 * `requestEdit`, which switches the page to the Manifest tab and tells the mounted panel to enter
 * edit mode. The panel registers that callback, and a request that arrives before it mounts is
 * replayed the moment it does.
 */
export interface ManifestEditControl {
    requestEdit: () => void;
    register: (enterEdit: () => void) => () => void;
}

export const ManifestEditContext = createContext<ManifestEditControl | null>(null);

export function useManifestEditBridge(onRequestEdit: () => void): ManifestEditControl {
    const onRequestEditRef = useRef(onRequestEdit);
    useEffect(() => {
        onRequestEditRef.current = onRequestEdit;
    });
    const enterEditRef = useRef<(() => void) | null>(null);
    const pendingRef = useRef(false);
    // Stable across renders, so providing it never churns every consumer.
    return useMemo<ManifestEditControl>(
        () => ({
            requestEdit: () => {
                onRequestEditRef.current();
                if (enterEditRef.current) enterEditRef.current();
                else pendingRef.current = true;
            },
            register: (enterEdit) => {
                enterEditRef.current = enterEdit;
                if (pendingRef.current) {
                    pendingRef.current = false;
                    enterEdit();
                }
                return () => {
                    if (enterEditRef.current === enterEdit) enterEditRef.current = null;
                };
            },
        }),
        [],
    );
}

/** The panel side: register `enterEdit` with the chrome, if a detail page is providing the bridge. */
export function useRegisterManifestEdit(enterEdit: () => void): void {
    const control = useContext(ManifestEditContext);
    const enterEditRef = useRef(enterEdit);
    useEffect(() => {
        enterEditRef.current = enterEdit;
    });
    useEffect(() => {
        if (!control) return;
        return control.register(() => enterEditRef.current());
    }, [control]);
}
