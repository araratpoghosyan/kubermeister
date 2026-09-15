import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

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
    renderer: {
        resolve: {
            alias: { '@': resolve(__dirname, 'src/renderer') },
        },
        plugins: [
            // The router plugin must run before react so generated route code is transformed too.
            tanstackRouter({
                target: 'react',
                routesDirectory: resolve(__dirname, 'src/renderer/routes'),
                generatedRouteTree: resolve(__dirname, 'src/renderer/routeTree.gen.ts'),
                quoteStyle: 'single',
                semicolons: true,
            }),
            react(),
            tailwindcss(),
        ],
    },
});
