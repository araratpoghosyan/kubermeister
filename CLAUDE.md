# Kubermeister

Desktop Kubernetes client (Electron).

## Commands

- `npm run dev` starts Electron with Vite HMR. `npm run build` writes `out/`.
- Node 24 and npm 11.19 or newer are required (`engines` + `engine-strict`). CI runs the same
  versions; older npm silently drops optional lockfile entries and breaks `npm ci`.
- Since Electron 42 the npm package no longer downloads its binary on install; the `postinstall`
  script runs Electron's installer so `node_modules/electron/dist` exists for electron-vite dev
  and for the license notices packaging copies. After an install with `--ignore-scripts`, run
  `node node_modules/electron/install.js` by hand.
- `npm run package` builds the current OS's installers into `release/` (`package:dir` for a fast
  unpacked bundle). The artifact name pattern in `electron-builder.yml` is load-bearing for the
  release workflows; change both together.
- After every change run `npm run lint`, `npm run typecheck`, and `npm run format`. ESLint does not
  type-check, and Prettier covers the whole repo including Markdown and JSON.

## Git workflow

- **Never commit on `main`.** Create a branch first: `type/short-slug` (kebab-case, 2 to 4 words,
  no issue numbers, no usernames). Example: `feat/ipc-bridge`.
- Every change lands as a **squash-merged PR**. The PR title is the resulting commit header on
  `main` and the PR body is its body, so both follow the commit rules below.
- Open PRs with `gh pr create`. Never merge; the user merges.
- The PR body becomes the commit body on `main` and GitHub re-wraps it at 72 columns: write each
  paragraph as one unwrapped line. GitHub appends ` (#N)` to the title: keep PR titles at 66
  characters or fewer.
- Enable the hook once per clone: `git config core.hooksPath .githooks`.

### Commit messages (Conventional Commits 1.0)

```
type(scope): subject

Body: why the change is needed, what a reader of the history cannot learn from the diff.
```

- **type**: `feat` `fix` `perf` `refactor` `docs` `test` `chore` `ci` `build` `style` `revert`.
- **scope** (required): `repo` `main` `preload` `renderer` `shared` `ipc` `k8s` `build` `ci`
  `deps` `docs` `release`. A new area adds its scope here and in `.githooks/commit-msg` within
  the same change.
- **subject**: lowercase, imperative, no trailing period, whole header 72 characters or fewer.
  Proper nouns that need capitals go in the body.
- Breaking change: `!` after the scope, e.g. `feat(ipc)!: rename stream channels`.
- **No trailers.** No `Co-Authored-By`, no `Signed-off-by`, nothing after the body.

## Architecture rules (load-bearing)

- **Main is ESM** (`.mjs`), **preload is CJS** (`.cjs`, sandboxed preloads only run CommonJS).
  Node-side relative imports (`src/main`, `src/shared`) carry explicit `.js` extensions; renderer
  imports omit them. `src/shared` is compiled by both tsconfig projects, so it must not touch DOM
  or Node APIs.
- `dependencies` holds only what the main process imports at runtime (it is externalized and
  shipped as `node_modules`). Everything renderer-side is a devDependency, bundled by Vite.
- **Renderer hardening is never relaxed:** `sandbox`, `contextIsolation` on, `nodeIntegration`
  off, `setWindowOpenHandler` and the `will-navigate`/`will-redirect` guard route only `http:`
  and `https:` URLs to the OS browser and deny everything else.
- **IPC contract:** every channel is declared in `src/shared/ipc.ts` with zod input and output
  schemas and listed in `src/shared/ipc-channels.ts`. Main validates both directions; the
  renderer reaches the bridge only through `src/renderer/lib/ipc.ts` (ESLint enforces this).

## Release model

Two channels, to be implemented with the CI workflows: a rolling `tip` pre-release rebuilt on
every merge to `main` (Ghostty-style nightly, fixed asset names, tag force-moved), and `vX.Y.Z`
tags for stable releases. Contributors never bump versions by hand.

## Code style

- Prettier (`.prettierrc`) and EditorConfig (`.editorconfig`) are authoritative. 4 spaces for
  source, 2 for JSON, YAML, Markdown. Single quotes, semicolons, 120 columns.
- Never `any` in TypeScript.
- Comments explain why, not what.
