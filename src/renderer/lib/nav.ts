import { BoxesIcon, GaugeIcon, LayersIcon, LayoutDashboardIcon, type LucideIcon, ServerIcon } from 'lucide-react';
import type { RoutePath } from './router';

export interface NavItem {
    id: string;
    label: string;
    /** Typed against the generated route tree, so a renamed or removed route breaks typecheck. */
    path: RoutePath;
    icon: LucideIcon;
}

export interface NavGroup {
    label: string | null;
    items: NavItem[];
}

export interface Domain {
    id: string;
    label: string;
    icon: LucideIcon;
    basePath: string;
    groups: NavGroup[];
}

/** The sidebar and the breadcrumbs both derive from this one table. */
export const DOMAINS: Domain[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: LayoutDashboardIcon,
        basePath: '/overview',
        groups: [
            {
                label: null,
                items: [
                    { id: 'summary', label: 'Cluster summary', path: '/overview/summary', icon: GaugeIcon },
                    { id: 'nodes', label: 'Nodes', path: '/overview/nodes', icon: ServerIcon },
                    { id: 'namespaces', label: 'Namespaces', path: '/overview/namespaces', icon: BoxesIcon },
                ],
            },
        ],
    },
    {
        id: 'workloads',
        label: 'Workloads',
        icon: LayersIcon,
        basePath: '/workloads',
        groups: [{ label: null, items: [{ id: 'pods', label: 'Pods', path: '/workloads/pods', icon: LayersIcon }] }],
    },
];

export const CLUSTER_LANDING: RoutePath = '/overview/summary';

/** `pathname` is `path` or a sub-page beneath it, matched on a `/` boundary. */
export function isActivePath(pathname: string, path: string): boolean {
    return pathname === path || pathname.startsWith(path + '/');
}

export function domainForPath(pathname: string): Domain | undefined {
    return DOMAINS.find((domain) => isActivePath(pathname, domain.basePath));
}

/** Id of the domain owning the item that matches the pathname. */
export function activeSectionId(pathname: string): string | undefined {
    return navItemForPath(pathname)?.domain.id;
}

export function navItemForPath(pathname: string): { domain: Domain; item: NavItem } | undefined {
    for (const domain of DOMAINS) {
        for (const group of domain.groups) {
            for (const item of group.items) {
                if (isActivePath(pathname, item.path)) return { domain, item };
            }
        }
    }
    return undefined;
}

/** For a sub-page beneath a list item (a detail), the list path; otherwise undefined. */
export function listPathForSubPage(pathname: string): string | undefined {
    const match = navItemForPath(pathname);
    return match && pathname !== match.item.path ? match.item.path : undefined;
}

export interface Crumb {
    label: string;
    icon?: LucideIcon;
    to?: string;
}

/** Breadcrumbs: the owning nav item, then one crumb per remaining path segment, decoded. */
export function breadcrumbsForPath(pathname: string): Crumb[] {
    const match = navItemForPath(pathname);
    if (!match) return [];
    const crumbs: Crumb[] = [{ label: match.item.label, icon: match.item.icon, to: match.item.path }];
    if (pathname.startsWith(match.item.path + '/')) {
        for (const segment of pathname.slice(match.item.path.length + 1).split('/')) {
            if (segment) crumbs.push({ label: decodeURIComponent(segment) });
        }
    }
    return crumbs;
}
