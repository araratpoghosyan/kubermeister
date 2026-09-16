import {
    ArrowUpNarrowWideIcon,
    BoxIcon,
    BoxesIcon,
    CalendarClockIcon,
    CodeIcon,
    CopyIcon,
    CpuIcon,
    DatabaseIcon,
    LayoutDashboardIcon,
    type LucideIcon,
    FileTextIcon,
    GaugeIcon,
    GlobeIcon,
    HardDriveIcon,
    KeyRoundIcon,
    LayersIcon,
    LockIcon,
    PackageIcon,
    PlayIcon,
    PlugIcon,
    RocketIcon,
    RouteIcon,
    ServerIcon,
    SettingsIcon,
    ShieldCheckIcon,
    ShieldIcon,
    TimerIcon,
    TrendingUpIcon,
    UserIcon,
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
                    {
                        id: 'priorityclasses',
                        label: 'PriorityClasses',
                        path: '/overview/priorityclasses',
                        icon: ArrowUpNarrowWideIcon,
                    },
                    { id: 'leases', label: 'Leases', path: '/overview/leases', icon: KeyRoundIcon },
                    {
                        id: 'runtimeclasses',
                        label: 'RuntimeClasses',
                        path: '/overview/runtimeclasses',
                        icon: CpuIcon,
                    },
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
                    { id: 'replicasets', label: 'ReplicaSets', path: '/workloads/replicasets', icon: CopyIcon },
                    {
                        id: 'replicationcontrollers',
                        label: 'ReplicationControllers',
                        path: '/workloads/replicationcontrollers',
                        icon: CopyIcon,
                    },
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
                    {
                        id: 'disruptionbudgets',
                        label: 'DisruptionBudgets',
                        path: '/workloads/disruptionbudgets',
                        icon: ShieldCheckIcon,
                    },
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
                    {
                        id: 'ingressclasses',
                        label: 'IngressClasses',
                        path: '/network/ingressclasses',
                        icon: LayersIcon,
                    },
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
    {
        id: 'storage',
        label: 'Storage',
        icon: DatabaseIcon,
        basePath: '/storage',
        groups: [
            {
                label: null,
                items: [
                    { id: 'volumes', label: 'Volumes', path: '/storage/volumes', icon: DatabaseIcon },
                    { id: 'claims', label: 'Claims', path: '/storage/claims', icon: HardDriveIcon },
                    {
                        id: 'storageclasses',
                        label: 'StorageClasses',
                        path: '/storage/storageclasses',
                        icon: LayersIcon,
                    },
                    { id: 'snapshots', label: 'Snapshots', path: '/storage/snapshots', icon: CopyIcon },
                ],
            },
            {
                label: 'CSI',
                items: [
                    { id: 'csidrivers', label: 'CSIDrivers', path: '/storage/csidrivers', icon: PlugIcon },
                    { id: 'csinodes', label: 'CSINodes', path: '/storage/csinodes', icon: ServerIcon },
                    { id: 'capacity', label: 'StorageCapacity', path: '/storage/capacity', icon: GaugeIcon },
                ],
            },
        ],
    },
    {
        id: 'access',
        label: 'Access',
        icon: ShieldIcon,
        basePath: '/access',
        groups: [
            {
                label: 'IDENTITY',
                items: [
                    {
                        id: 'serviceaccounts',
                        label: 'ServiceAccounts',
                        path: '/access/serviceaccounts',
                        icon: UserIcon,
                    },
                ],
            },
            {
                label: 'ROLES',
                items: [
                    { id: 'roles', label: 'Roles', path: '/access/roles', icon: ShieldIcon },
                    {
                        id: 'rolebindings',
                        label: 'RoleBindings',
                        path: '/access/rolebindings',
                        icon: ShieldCheckIcon,
                    },
                    { id: 'clusterroles', label: 'ClusterRoles', path: '/access/clusterroles', icon: ShieldIcon },
                    {
                        id: 'clusterrolebindings',
                        label: 'ClusterRoleBindings',
                        path: '/access/clusterrolebindings',
                        icon: ShieldCheckIcon,
                    },
                ],
            },
        ],
    },
    {
        id: 'addons',
        label: 'Add-ons',
        icon: BoxesIcon,
        basePath: '/addons',
        groups: [
            {
                label: null,
                items: [
                    { id: 'charts', label: 'Helm charts', path: '/addons/charts', icon: PackageIcon },
                    { id: 'releases', label: 'Releases', path: '/addons/releases', icon: RocketIcon },
                    { id: 'crds', label: 'CRDs', path: '/addons/crds', icon: CodeIcon },
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
