import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/unit/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            // Unit-testable code: main-process logic and the shared contract. Bootstrap files that
            // only wire Electron together (window creation, the preload bridge) and the DOM
            // renderer are covered end to end, not here.
            include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
            exclude: ['src/main/index.ts'],
            thresholds: {
                statements: 90,
                branches: 85,
                functions: 90,
                lines: 90,
            },
            reporter: ['text', 'lcov'],
        },
    },
});
