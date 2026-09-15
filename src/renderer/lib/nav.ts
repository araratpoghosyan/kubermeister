import {
    BoxIcon,
    BoxesIcon,
    CalendarClockIcon,
    LayoutDashboardIcon,
    type LucideIcon,
    FileTextIcon,
    GaugeIcon,
    GlobeIcon,
    LayersIcon,
    LockIcon,
    PlayIcon,
    RouteIcon,
    ServerIcon,
    SettingsIcon,
    ShieldIcon,
    TimerIcon,
    TrendingUpIcon,
    WaypointsIcon,
} from 'lucide-react';
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

/** The sidebar sections, the breadcrumbs and the command palette all derive from this one table. */
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
                    { id: 'summary', label: 'Cluster summary', path: '/overview/summary', icon: BoxesIcon },
                    { id: 'nodes', label: 'Nodes', path: '/overview/nodes', icon: ServerIcon },
                    { id: 'namespaces', label: 'Namespaces', path: '/overview/namespaces', icon: BoxesIcon },
                    { id: 'events', label: 'Events stream', path: '/overview/events', icon: CalendarClockIcon },
                    { id: 'quotas', label: 'Quotas', path: '/overview/quotas', icon: LayersIcon },
                    { id: 'limits', label: 'Limits', path: '/overview/limits', icon: GaugeIcon },
                ],
            },
        ],
    },
    {
        id: 'workloads',
        label: 'Workloads',
        icon: BoxIcon,
        basePath: '/workloads',
        groups: [
            {
                label: 'COMPUTE',
                items: [
                    { id: 'pods', label: 'Pods', path: '/workloads/pods', icon: BoxIcon },
                    { id: 'deployments', label: 'Deployments', path: '/workloads/deployments', icon: BoxesIcon },
                    { id: 'statefulsets', label: 'StatefulSets', path: '/workloads/statefulsets', icon: BoxesIcon },
                    { id: 'daemonsets', label: 'DaemonSets', path: '/workloads/daemonsets', icon: BoxesIcon },
                ],
            },
            {
                label: 'BATCH',
                items: [
                    { id: 'jobs', label: 'Jobs', path: '/workloads/jobs', icon: PlayIcon },
                    { id: 'cronjobs', label: 'CronJobs', path: '/workloads/cronjobs', icon: TimerIcon },
                ],
            },
            {
                label: 'CONFIG',
                items: [
                    { id: 'configmaps', label: 'ConfigMaps', path: '/workloads/configmaps', icon: FileTextIcon },
                    { id: 'secrets', label: 'Secrets', path: '/workloads/secrets', icon: LockIcon },
                    { id: 'autoscalers', label: 'Autoscalers', path: '/workloads/autoscalers', icon: TrendingUpIcon },
                ],
            },
        ],
    },
    {
        id: 'network',
        label: 'Network',
        icon: GlobeIcon,
        basePath: '/network',
        groups: [
            {
                label: 'TRAFFIC',
                items: [
                    { id: 'services', label: 'Services', path: '/network/services', icon: GlobeIcon },
                    { id: 'ingresses', label: 'Ingresses', path: '/network/ingresses', icon: RouteIcon },
                    { id: 'endpoints', label: 'Endpoints', path: '/network/endpoints', icon: WaypointsIcon },
                ],
            },
            {
                label: 'POLICY',
                items: [
                    {
                        id: 'networkpolicies',
                        label: 'NetworkPolicies',
                        path: '/network/networkpolicies',
                        icon: ShieldIcon,
                    },
                ],
            },
        ],
    },
];

export const SETTINGS_NAV: NavItem = { id: 'settings', label: 'Settings', path: '/settings', icon: SettingsIcon };

const SETTINGS_DOMAIN: Domain = {
    id: 'settings',
    label: 'Settings',
    icon: SettingsIcon,
    basePath: '/settings',
    groups: [{ label: null, items: [SETTINGS_NAV] }],
};

/** Every domain including Settings, which the sidebar renders in its footer rather than as a section. */
export const ALL_DOMAINS: Domain[] = [...DOMAINS, SETTINGS_DOMAIN];

export const CLUSTER_LANDING: RoutePath = '/overview/summary';

/** `pathname` is `path` or a sub-page beneath it, matched on a `/` boundary. */
export function isActivePath(pathname: string, path: string): boolean {
    return pathname === path || pathname.startsWith(path + '/');
}

export function domainForPath(pathname: string): Domain | undefined {
    return ALL_DOMAINS.find((domain) => isActivePath(pathname, domain.basePath));
}

/** Id of the domain owning the item that matches the pathname. */
export function activeSectionId(pathname: string): string | undefined {
    return navItemForPath(pathname)?.domain.id;
}

export function navItemForPath(pathname: string): { domain: Domain; item: NavItem } | undefined {
    for (const domain of ALL_DOMAINS) {
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
