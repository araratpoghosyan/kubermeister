import { describe, expect, it } from 'vitest';
import { ownedPodsInputSchema, ownerPath, restartableOwner } from '../../../src/shared/k8s/owners';

describe('owner links', () => {
    it('points at the screen for a kind the app shows, and nowhere for one it does not', () => {
        expect(ownerPath('Deployment', 'web', 'team-a')).toBe('/workloads/deployments/team-a/web');
        expect(ownerPath('Job', 'import', 'team-a')).toBe('/workloads/jobs/team-a/import');
        // Cluster-scoped kinds have no namespace in their route.
        expect(ownerPath('CustomResourceDefinition', 'widgets.example.com', 'team-a')).toBe(
            '/addons/crds/widgets.example.com',
        );
        // ReplicaSets have no list yet, and an unknown kind never will by guessing.
        expect(ownerPath('ReplicaSet', 'web-abc', 'team-a')).toBeNull();
        expect(ownerPath('Widget', 'thing', 'team-a')).toBeNull();
    });

    it('finds the owner a rollout restart would act on, and none for a job', () => {
        const rs = { kind: 'ReplicaSet', name: 'web-abc', namespace: 'team-a', path: null };
        const deployment = { kind: 'Deployment', name: 'web', namespace: 'team-a', path: '/x' };
        expect(restartableOwner([rs, deployment])).toBe(deployment);
        expect(restartableOwner([{ kind: 'Job', name: 'import', namespace: 'team-a', path: '/x' }])).toBeUndefined();
        expect(restartableOwner([])).toBeUndefined();
    });

    it('takes only the kinds that own pods', () => {
        const input = { name: 'web', namespace: 'team-a' };
        expect(ownedPodsInputSchema.safeParse({ ...input, kind: 'Deployment' }).success).toBe(true);
        expect(ownedPodsInputSchema.safeParse({ ...input, kind: 'CronJob' }).success).toBe(true);
        expect(ownedPodsInputSchema.safeParse({ ...input, kind: 'ConfigMap' }).success).toBe(false);
        expect(ownedPodsInputSchema.safeParse({ kind: 'Deployment', name: 'web' }).success).toBe(false);
    });
});
