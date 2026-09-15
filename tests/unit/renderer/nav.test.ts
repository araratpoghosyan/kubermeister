import { describe, expect, it } from 'vitest';
import {
    activeSectionId,
    breadcrumbsForPath,
    CLUSTER_LANDING,
    DOMAINS,
    domainForPath,
    isActivePath,
    listPathForSubPage,
    navItemForPath,
} from '@/lib/nav';

const allItems = DOMAINS.flatMap((domain) => domain.groups.flatMap((group) => group.items));

describe('navigation config', () => {
    it('has unique domain and item ids and every item under its domain base path', () => {
        expect(new Set(DOMAINS.map((d) => d.id)).size).toBe(DOMAINS.length);
        expect(new Set(allItems.map((i) => i.id)).size).toBe(allItems.length);
        for (const domain of DOMAINS) {
            for (const item of domain.groups.flatMap((g) => g.items)) {
                expect(item.path.startsWith(domain.basePath + '/')).toBe(true);
            }
        }
    });

    it('lands on a page that exists in the config', () => {
        expect(allItems.map((i) => i.path)).toContain(CLUSTER_LANDING);
    });
});

describe('isActivePath', () => {
    it('matches the path itself and sub-pages on a slash boundary only', () => {
        expect(isActivePath('/workloads/pods', '/workloads/pods')).toBe(true);
        expect(isActivePath('/workloads/pods/team-a/web-1', '/workloads/pods')).toBe(true);
        expect(isActivePath('/workloads/podsecurity', '/workloads/pods')).toBe(false);
        expect(isActivePath('/overview/nodes', '/workloads/pods')).toBe(false);
    });
});

describe('navItemForPath / activeSectionId / domainForPath', () => {
    it('resolves list and detail paths to their item and domain', () => {
        expect(navItemForPath('/overview/nodes')?.item.id).toBe('nodes');
        expect(navItemForPath('/workloads/pods/team-a/web-1')?.item.id).toBe('pods');
        expect(activeSectionId('/workloads/pods/team-a/web-1')).toBe('workloads');
        expect(domainForPath('/overview/summary')?.id).toBe('overview');
    });

    it('returns undefined outside the configured tree', () => {
        expect(navItemForPath('/nowhere')).toBeUndefined();
        expect(activeSectionId('/')).toBeUndefined();
        expect(domainForPath('/settings')).toBeUndefined();
    });
});

describe('listPathForSubPage', () => {
    it('maps a detail page to its owning list', () => {
        expect(listPathForSubPage('/workloads/pods/team-a/web-1')).toBe('/workloads/pods');
    });

    it('returns undefined on a list page or outside any list item', () => {
        expect(listPathForSubPage('/workloads/pods')).toBeUndefined();
        expect(listPathForSubPage('/overview/summary')).toBeUndefined();
        expect(listPathForSubPage('/nope/nowhere')).toBeUndefined();
    });
});

describe('breadcrumbsForPath', () => {
    it('starts at the owning item and adds one decoded crumb per extra segment', () => {
        const crumbs = breadcrumbsForPath('/workloads/pods/team%20a/web-1');
        expect(crumbs.map((c) => c.label)).toEqual(['Pods', 'team a', 'web-1']);
        expect(crumbs[0]?.to).toBe('/workloads/pods');
        expect(crumbs[0]?.icon).toBeDefined();
        expect(crumbs[1]?.to).toBeUndefined();
    });

    it('is a single crumb on a list page and empty outside the tree', () => {
        expect(breadcrumbsForPath('/overview/nodes').map((c) => c.label)).toEqual(['Nodes']);
        expect(breadcrumbsForPath('/workloads/pods/')).toHaveLength(1);
        expect(breadcrumbsForPath('/nowhere')).toEqual([]);
    });
});
