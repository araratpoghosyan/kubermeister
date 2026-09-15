import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react';
import { REFRESH_INTERVAL_OPTIONS } from '../../shared/settings';
import { SettingsPage } from '@/components/templates/settings-page';
import { Field, FormCard, FormSelect, Toggle } from '@/components/templates/settings-form';
import { Button } from '@/components/ui/button';
import { useTheme, type Theme } from '@/components/theme-provider';
import { pickKubeconfig, resetKubeconfig, updateSettings, useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/settings')({ component: SettingsScreen });

const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon; desc: string }[] = [
    { value: 'light', label: 'Light', icon: SunIcon, desc: 'Cobalt, bright surfaces' },
    { value: 'dark', label: 'Dark', icon: MoonIcon, desc: 'Cobalt, dense night mode' },
    { value: 'system', label: 'System', icon: MonitorIcon, desc: 'Match OS preference' },
];

const intervalLabel = (sec: number) => `${sec} seconds`;

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3.5">
            <h2 className="text-label font-semibold tracking-[0.12em] text-text-dim uppercase">{title}</h2>
            {children}
        </section>
    );
}

function SettingsScreen() {
    const { theme, setTheme } = useTheme();
    const client = useQueryClient();
    const { data: settings } = useSettings();
    const [kubeconfigBusy, setKubeconfigBusy] = useState(false);

    const kubeconfigPath = settings?.connection.kubeconfigPath ?? null;
    const refreshSec = settings?.data.refreshIntervalSec ?? 12;
    // Fold the current value in so a non-preset interval (the 12 s default) still renders as selected.
    const intervalOptions = Array.from(new Set<number>([...REFRESH_INTERVAL_OPTIONS, refreshSec]))
        .sort((a, b) => a - b)
        .map(intervalLabel);

    const runKubeconfig = async (action: () => Promise<void>) => {
        setKubeconfigBusy(true);
        try {
            await action();
        } finally {
            setKubeconfigBusy(false);
        }
    };

    return (
        <SettingsPage title="Settings" desc="Preferences for this Kubermeister install.">
            <Section title="General">
                <FormCard
                    title="Restore last session on launch"
                    desc="Reopen on the context and namespace you last used."
                    action={
                        <Toggle
                            label="Restore last session on launch"
                            checked={settings?.session.restoreOnLaunch ?? true}
                            onCheckedChange={(restoreOnLaunch) =>
                                void updateSettings(client, { session: { restoreOnLaunch } })
                            }
                        />
                    }
                >
                    <p className="text-cell text-text-muted">
                        When off, Kubermeister follows your kubeconfig&apos;s current-context instead.
                    </p>
                </FormCard>

                <FormCard title="Live data refresh" desc="How often lists, metrics and the dashboard poll for updates.">
                    <Field label="Refresh interval">
                        <FormSelect
                            value={intervalLabel(refreshSec)}
                            options={intervalOptions}
                            onValueChange={(label) =>
                                void updateSettings(client, { data: { refreshIntervalSec: parseInt(label, 10) } })
                            }
                        />
                    </Field>
                </FormCard>
            </Section>

            <Section title="Appearance">
                <FormCard title="Theme" desc="Switches the entire workspace between light and dark.">
                    <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Theme">
                        {THEME_OPTIONS.map((opt) => {
                            const Icon = opt.icon;
                            const selected = theme === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setTheme(opt.value)}
                                    className={cn(
                                        'flex flex-col items-start gap-2 rounded-md border-[1.5px] p-3.5 text-left transition-colors',
                                        selected
                                            ? 'border-primary bg-accent-bg'
                                            : 'border-border bg-elev-2 hover:border-border-hi',
                                    )}
                                >
                                    <Icon className={cn('size-4', selected ? 'text-primary' : 'text-text-muted')} />
                                    <div className="text-lead font-medium">{opt.label}</div>
                                    <div className="text-label text-text-muted">{opt.desc}</div>
                                </button>
                            );
                        })}
                    </div>
                </FormCard>
            </Section>

            <Section title="Connection">
                <FormCard title="Kubeconfig">
                    <Field
                        label="Kubeconfig path"
                        hint="Choosing a file goes through a native dialog; the app never accepts a typed path."
                    >
                        <div className="flex flex-col gap-2">
                            <span
                                className="truncate font-mono text-cell text-text-2"
                                title={kubeconfigPath ?? undefined}
                                data-testid="kubeconfig-path"
                            >
                                {kubeconfigPath ?? '$KUBECONFIG or ~/.kube/config (default)'}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={kubeconfigBusy}
                                    onClick={() => void runKubeconfig(() => pickKubeconfig(client))}
                                >
                                    Browse…
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={kubeconfigBusy || !kubeconfigPath}
                                    onClick={() => void runKubeconfig(() => resetKubeconfig(client))}
                                >
                                    Use default
                                </Button>
                            </div>
                        </div>
                    </Field>
                </FormCard>
            </Section>
        </SettingsPage>
    );
}
