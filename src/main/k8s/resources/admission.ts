import type {
    V1MutatingWebhookConfiguration,
    V1ValidatingAdmissionPolicy,
    V1ValidatingWebhookConfiguration,
} from '@kubernetes/client-node';
import type {
    AdmissionPolicy,
    AdmissionPolicyDetail,
    WebhookConfig,
    WebhookConfigDetail,
    WebhookStatus,
} from '../../../shared/k8s/admission.js';
import { apis, readOrNull } from '../client.js';
import { withK8s } from '../errors.js';
import { age, dash, toPairs } from '../format.js';

/*
 * Admission: what stands between a write and the cluster. Pure transforms first, readers at the end.
 */

/** One configuration's webhooks, whichever kind it is: the two differ only in what they may change. */
type Configuration = V1MutatingWebhookConfiguration | V1ValidatingWebhookConfiguration;

const unique = (values: string[]): string[] => [...new Set(values)];

/**
 * A webhook whose failure policy is Fail stops the writes it matches when its endpoint is down.
 * That is the fact worth seeing on a list: the configuration is a dependency of writing at all.
 */
export function webhookStatus(policies: string[]): WebhookStatus {
    // Fail is the API's own default, so a webhook that names no policy blocks too.
    return policies.some((policy) => policy !== 'Ignore') ? 'Blocking' : 'Permissive';
}

export function toWebhookConfig(configuration: Configuration, now = Date.now()): WebhookConfig {
    const webhooks = configuration.webhooks ?? [];
    const policies = webhooks.map((webhook) => webhook.failurePolicy ?? 'Fail');
    return {
        name: configuration.metadata?.name ?? '',
        status: webhooks.length === 0 ? 'Permissive' : webhookStatus(policies),
        webhooks: webhooks.length,
        webhookNames: dash(webhooks.map((webhook) => webhook.name).join(', ')),
        failurePolicy: dash(unique(policies).join(', ')),
        age: age(configuration.metadata?.creationTimestamp, now),
    };
}

export function toWebhookConfigDetail(configuration: Configuration, now = Date.now()): WebhookConfigDetail {
    return {
        ...toWebhookConfig(configuration, now),
        labels: toPairs(configuration.metadata?.labels),
        annotations: toPairs(configuration.metadata?.annotations),
    };
}

export function toAdmissionPolicy(policy: V1ValidatingAdmissionPolicy, now = Date.now()): AdmissionPolicy {
    const rules = policy.spec?.matchConstraints?.resourceRules ?? [];
    const matches = rules.flatMap((rule) =>
        (rule.resources ?? []).map((resource) =>
            (rule.apiGroups ?? []).some((group) => group && group !== '*')
                ? `${rule.apiGroups?.filter((group) => group)[0]}/${resource}`
                : resource,
        ),
    );
    return {
        name: policy.metadata?.name ?? '',
        failurePolicy: policy.spec?.failurePolicy ?? 'Fail',
        validations: policy.spec?.validations?.length ?? 0,
        matches: dash(unique(matches).join(', ')),
        age: age(policy.metadata?.creationTimestamp, now),
    };
}

export function toAdmissionPolicyDetail(policy: V1ValidatingAdmissionPolicy, now = Date.now()): AdmissionPolicyDetail {
    return {
        ...toAdmissionPolicy(policy, now),
        labels: toPairs(policy.metadata?.labels),
        annotations: toPairs(policy.metadata?.annotations),
    };
}

export function listMutatingWebhooks(): Promise<WebhookConfig[]> {
    return withK8s('resources.list', async () => {
        const { items } = await apis().admission.listMutatingWebhookConfiguration();
        return items.map((configuration) => toWebhookConfig(configuration));
    });
}

export function getMutatingWebhook(name: string): Promise<WebhookConfigDetail | null> {
    return withK8s('resources.get', async () => {
        const configuration = await readOrNull(() => apis().admission.readMutatingWebhookConfiguration({ name }));
        return configuration ? toWebhookConfigDetail(configuration) : null;
    });
}

export function listValidatingWebhooks(): Promise<WebhookConfig[]> {
    return withK8s('resources.list', async () => {
        const { items } = await apis().admission.listValidatingWebhookConfiguration();
        return items.map((configuration) => toWebhookConfig(configuration));
    });
}

export function getValidatingWebhook(name: string): Promise<WebhookConfigDetail | null> {
    return withK8s('resources.get', async () => {
        const configuration = await readOrNull(() => apis().admission.readValidatingWebhookConfiguration({ name }));
        return configuration ? toWebhookConfigDetail(configuration) : null;
    });
}

export function listAdmissionPolicies(): Promise<AdmissionPolicy[]> {
    return withK8s('resources.list', async () => {
        const { items } = await apis().admission.listValidatingAdmissionPolicy();
        return items.map((policy) => toAdmissionPolicy(policy));
    });
}

export function getAdmissionPolicy(name: string): Promise<AdmissionPolicyDetail | null> {
    return withK8s('resources.get', async () => {
        const policy = await readOrNull(() => apis().admission.readValidatingAdmissionPolicy({ name }));
        return policy ? toAdmissionPolicyDetail(policy) : null;
    });
}
