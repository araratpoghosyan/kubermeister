import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/unit/**/*.test.ts'],
        setupFiles: ['tests/setup.ts'],
        coverage: {
            provider: 'v8',
            // Unit-testable code: main-process logic and the shared contract. Bootstrap files that
            // only wire Electron together (window creation, the preload bridge) and the DOM
            // renderer are covered end to end, not here.
            include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
            exclude: ['src/main/index.ts'],
            // Ratchet: raise these as coverage grows, never lower them.
            thresholds: {
                statements: 95,
                branches: 90,
                functions: 95,
                lines: 95,
            },
            reporter: ['text', 'lcov'],
        },
    },
});
