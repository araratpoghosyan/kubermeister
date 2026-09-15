import type { ReactNode } from 'react';

interface SettingsPageProps {
    title: string;
    desc?: string;
    children: ReactNode;
}

export function SettingsPage({ title, desc, children }: SettingsPageProps) {
    return (
        <div className="h-full overflow-auto bg-background px-8 py-6" data-testid="settings-page">
            <div className="mx-auto max-w-[860px]">
                <div className="mb-5">
                    <h1 className="text-[18px] font-semibold tracking-tight">{title}</h1>
                    {desc && <p className="mt-1 text-body text-text-muted">{desc}</p>}
                </div>
                <div className="flex flex-col gap-3.5">{children}</div>
            </div>
        </div>
    );
}
