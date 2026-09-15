import { Link } from '@tanstack/react-router';
import { Boxes, Gauge, Layers, Server } from 'lucide-react';
import type { ReactNode } from 'react';

type NavPath = '/overview/summary' | '/overview/nodes' | '/overview/namespaces' | '/workloads/pods';

interface NavItem {
    to: NavPath;
    label: string;
    icon: ReactNode;
}

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
    {
        title: 'Overview',
        items: [
            { to: '/overview/summary', label: 'Summary', icon: <Gauge className="size-4" aria-hidden /> },
            { to: '/overview/nodes', label: 'Nodes', icon: <Server className="size-4" aria-hidden /> },
            { to: '/overview/namespaces', label: 'Namespaces', icon: <Boxes className="size-4" aria-hidden /> },
        ],
    },
    {
        title: 'Workloads',
        items: [{ to: '/workloads/pods', label: 'Pods', icon: <Layers className="size-4" aria-hidden /> }],
    },
];

export function Sidebar() {
    return (
        <aside className="flex w-56 shrink-0 flex-col border-r" data-testid="sidebar">
            <div className="flex h-14 items-center px-4 text-sm font-semibold">Kubermeister</div>
            <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
                {SECTIONS.map((section) => (
                    <div key={section.title} className="flex flex-col gap-0.5">
                        <p className="px-2 pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {section.title}
                        </p>
                        {section.items.map((item) => (
                            <Link
                                key={item.to}
                                to={item.to}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                                activeProps={{ className: 'bg-muted text-foreground', 'aria-current': 'page' }}
                            >
                                {item.icon}
                                {item.label}
                            </Link>
                        ))}
                    </div>
                ))}
            </nav>
        </aside>
    );
}
