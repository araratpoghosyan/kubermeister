import { Link, useNavigate } from '@tanstack/react-router';
import type { ComponentProps } from 'react';

type LinkTo = ComponentProps<typeof Link>['to'];
type LinkSearch = ComponentProps<typeof Link>['search'];

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & { to: string };

/**
 * Split a config-driven path string into its pathname and (optional) search object. Our nav is
 * stringly-typed (paths computed in `lib/nav.ts`, detail paths built by list screens), so a
 * `?namespace=…` suffix threaded from a clicked row travels as part of the string; here it's parsed
 * back out and handed to the router as a typed `search` object (the router owns URL serialization).
 */
function splitPath(to: string): { to: string; search?: Record<string, string> } {
    const q = to.indexOf('?');
    if (q === -1) return { to };
    const search = Object.fromEntries(new URLSearchParams(to.slice(q + 1)));
    return { to: to.slice(0, q), search };
}

/**
 * Thin wrapper over TanStack Router's strictly-typed `Link` that accepts a plain string `to` (with an
 * optional `?query`). Our navigation is config-driven (lib/nav.ts), so paths are computed strings;
 * the localized assertions here satisfy the router's nominal route/search typing without leaking
 * `any` into call sites.
 */
export function NavLink({ to, ...rest }: NavLinkProps) {
    const parsed = splitPath(to);
    return <Link to={parsed.to as LinkTo} search={parsed.search as LinkSearch} {...rest} />;
}

/** Programmatic navigation accepting a plain string path with an optional `?query` (same rationale as NavLink). */
export function useNavigateTo() {
    const navigate = useNavigate();
    return (to: string) => {
        const parsed = splitPath(to);
        void navigate({ to: parsed.to as LinkTo, search: parsed.search as LinkSearch });
    };
}
