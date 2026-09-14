import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // Plain Node scripts and root config files run under Node, not the browser.
        files: ['scripts/**/*.mjs', '*.config.{mjs,ts}', 'eslint.config.mjs'],
        languageOptions: { globals: globals.node },
    },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
        },
    },
    {
        // Only these two type-aware rules, scoped to app source: they catch unawaited promises and
        // async handlers passed where a sync callback is expected, the two IPC-heavy Electron bugs
        // that survive `strict`. The full type-checked preset fights the deliberate `unknown` at
        // the bridge boundary.
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
        },
    },
    {
        // The untyped `window.km` bridge is reachable only through the typed wrapper in lib/ipc.ts,
        // so a wrong channel name or payload shape fails at compile time, at one seam.
        files: ['src/renderer/**/*.ts'],
        ignores: ['src/renderer/lib/ipc.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: "MemberExpression[object.name='window'][property.name='km']",
                    message: 'Reach the main process through lib/ipc.ts, not window.km directly.',
                },
            ],
        },
    },
    prettier,
    { ignores: ['out/**', 'dist/**', 'release/**'] },
);
