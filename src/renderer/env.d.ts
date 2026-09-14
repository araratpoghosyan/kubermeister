interface Window {
    km: {
        invoke: (channel: string, input: unknown) => Promise<unknown>;
    };
}
