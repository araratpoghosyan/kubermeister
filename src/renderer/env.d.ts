declare module '*.css' {}

interface Window {
    km: {
        invoke: (channel: string, input: unknown) => Promise<unknown>;
        subscribe: (channel: string, handler: (payload: unknown) => void) => () => void;
    };
}
