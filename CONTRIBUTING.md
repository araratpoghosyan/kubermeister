# Contributing to Kubermeister

Thanks for your interest in contributing! This guide covers the essentials: how to set up, how the
code is formatted, and how changes reach `main`.

## Prerequisites

- **Node.js 22** (see `.nvmrc`; `nvm use` picks it up).

Further tooling (Kubernetes CLI, Docker for end-to-end tests) will be listed here as the
corresponding parts of the codebase land.

## Getting started

The codebase is currently being brought over from its previous home one reviewed slice at a time,
so this repository does not yet build or run. This section will grow with each slice.

## Code style

- 4-space indent, single quotes, semicolons, 120-column width. Prettier (`.prettierrc`) and
  EditorConfig (`.editorconfig`) are the source of truth; JSON, YAML and Markdown use 2 spaces.
- **Never use `any`** in TypeScript. Prefer `unknown` plus narrowing, or generics.
- Self-documenting code; comments explain *why*, not *what*.

## Branching and commits

The project uses **GitHub Flow**: `main` is always releasable, and every change, maintainer changes
included, lands through a pull request from a short-lived branch. Pull requests are
**squash-merged**, so a PR becomes exactly one commit on `main`, and the **PR title and body become
that commit's message**.

### Branch names

`type/short-slug`, where `type` is one of the commit types below and the slug is kebab-case, two to
four words, describing the change. No issue numbers, no usernames.

```
feat/ipc-bridge
fix/window-bounds
chore/repo-hygiene
```

### Commit messages

Commits follow [Conventional Commits 1.0](https://www.conventionalcommits.org/):

```
type(scope): subject

Optional body explaining why the change is needed and anything a reader
of the history would not learn from the diff.
```

- **type** is one of `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`, `ci`, `build`,
  `style`, `revert`.
- **scope** is required and is one of `repo`, `main`, `preload`, `renderer`, `shared`, `ipc`,
  `k8s`, `build`, `ci`, `deps`, `docs`, `release`. When a change introduces a new area, add its
  scope to this list, to `CLAUDE.md`, and to `.githooks/commit-msg` in the same change.
- **subject** is lowercase, imperative ("add", not "added" or "adds"), has no trailing period, and
  keeps the whole first line at 72 characters or fewer.
- Breaking changes put `!` after the scope: `feat(ipc)!: rename stream channels`.
- No trailers (`Co-Authored-By`, `Signed-off-by`, etc.).

A local `commit-msg` hook enforces the first line. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

## Pull requests

- Keep changes focused. One concern per pull request.
- Give the PR a title that is a valid commit header (see above). It becomes the commit on `main`.
- Write the PR body as the commit body: why the change is needed, not a list of files.

## Releases

There are two release channels:

- **Tip (nightly)**: every merge to `main` rebuilds the rolling `tip` pre-release on GitHub. It is
  not a versioned release and may break.
- **Stable**: `vX.Y.Z` tags produce versioned releases.

Contributors never bump versions or edit changelogs by hand. The release pipeline is being set up
alongside the codebase import.
