# Kubermeister

Desktop Kubernetes client (Electron). The codebase is being brought over from
`~/Projects/Personal/kubermeister-old` one reviewed slice at a time.

## Import rule

Nothing is copied from the old repository without the user's explicit approval for that specific
slice. Read the old code, discuss it, propose the exact files, wait for approval, then import.
Rewrite rather than copy when the old text describes things that do not exist here yet.

## Git workflow

Contributor-facing version: [CONTRIBUTING.md](CONTRIBUTING.md). Keep the two in sync.

- **Never commit on `main`.** Create a branch first: `type/short-slug` (kebab-case, 2 to 4 words,
  no issue numbers, no usernames). Example: `feat/ipc-bridge`.
- Every change lands as a **squash-merged PR**. The PR title is the resulting commit header on
  `main` and the PR body is its body, so both follow the commit rules below.
- Open PRs with `gh pr create`. Never merge; the user merges.
- Enable the hook once per clone: `git config core.hooksPath .githooks`.

### Commit messages (Conventional Commits 1.0)

```
type(scope): subject

Body: why the change is needed, what a reader of the history cannot learn from the diff.
```

- **type**: `feat` `fix` `perf` `refactor` `docs` `test` `chore` `ci` `build` `style` `revert`.
- **scope** (required): `repo` `main` `preload` `renderer` `shared` `ipc` `k8s` `build` `ci`
  `deps` `docs` `release`. A new area adds its scope here, in CONTRIBUTING.md, and in
  `.githooks/commit-msg` within the same change.
- **subject**: lowercase, imperative, no trailing period, whole header 72 characters or fewer.
  Proper nouns that need capitals go in the body.
- Breaking change: `!` after the scope, e.g. `feat(ipc)!: rename stream channels`.
- **No trailers.** No `Co-Authored-By`, no `Signed-off-by`, nothing after the body.
- Describe what the change does, not that it was imported. Origin, if useful, goes in the body.

## Release model

Two channels, implemented in the CI slice: a rolling `tip` pre-release rebuilt on every merge to
`main` (Ghostty-style nightly, fixed asset names, tag force-moved), and `vX.Y.Z` tags for stable
releases. Contributors never bump versions by hand.

## Code style

- Prettier (`.prettierrc`) and EditorConfig (`.editorconfig`) are authoritative. 4 spaces for
  source, 2 for JSON, YAML, Markdown. Single quotes, semicolons, 120 columns.
- Never `any` in TypeScript.
- Comments explain why, not what.
