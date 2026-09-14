import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
    // Main is ESM: Electron 44 runs it natively and it keeps ESM-only dependencies usable.
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: {
                output: { format: 'es', entryFileNames: '[name].mjs' },
            },
        },
    },
    // Preload is CJS: Electron's sandboxed preload scripts only run CommonJS.
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: {
                output: { format: 'cjs', entryFileNames: '[name].cjs' },
            },
        },
    },
    renderer: {},
});
