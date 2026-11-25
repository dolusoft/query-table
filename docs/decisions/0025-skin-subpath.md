# 0025 The reference skin as a subpath of the Vue package: `@dolusoft/query-table/table.css` (3.23)

Status: Accepted (2026-11-25), [query-table#253](https://github.com/dolusoft/query-table/issues/253). Decided by Enes on 2026-11-25: the reference skin ships as a subpath of the Vue package that no module imports (#253 D-01, which takes the place of #99 D-01 as #99 D-03), and `@dolusoft/query-table-skin` is published one last time in 3.23.0, then deprecated (#253 D-02) ([comment](https://github.com/dolusoft/query-table/issues/253#issuecomment-7160584019)); a scoped skin is a decision of its own (#253 D-03), and a manifest test guards `sideEffects` (#253 D-04) ([comment](https://github.com/dolusoft/query-table/issues/253#issuecomment-7160732906)). Supersedes K320-7 and K320-11 of [ADR 0023](0023-skin-package.md), and with them the package checks of K320-10; the content (K320-8) and the token promise (K320-9) stand at the new path. Takes [ADR 0002](0002-three-packages.md) back to three packages. Amends P5, P8, P9 and P14.

## Context

ADR 0023 put the reference skin in a fourth package and ruled out the Vue package in one sentence: the table would ship a look and break P5 for everyone who does not want it. #99 never measured that option. #253 did, with Vite 8.3.8 and webpack 5.113: an app that does not import the stylesheet gets no CSS from a subpath of the Vue package, and its JavaScript is byte for byte the one it gets with the separate package. The look P5 keeps out of a product does not reach it.

The separate package adds nothing to versioning. The packages are released together, and since 3.20 each of the skin's two changes was made in the same commit as a change of the DOM contract; no commit changed the skin alone. Nothing in the manifests ties a skin to its table either: a table of 3.18 installs next to a skin of 3.22. What the package does add is a fourth tarball, a fourth trusted publisher and a release that can stop halfway. The one product known to use the skin is Factory Line in dolusoft/dev.

## Decision

- **A subpath of the Vue package (K323-1).** `@dolusoft/query-table` exports the reference skin as `./table.css`: `import '@dolusoft/query-table/table.css'`. Its source is `packages/vue/styles/table.css`, outside `src/`, and the Vue package's build copies it into `dist/` as it is, after the script build. No module of any package imports it: an app that does not import it gets no CSS and the same JavaScript. The skin is, by construction, of the version of the table it ships with.
- **`sideEffects: ["*.css"]` (K323-2).** The Vue package's `sideEffects` changes from `false` to `["*.css"]`. With `false`, webpack drops `import '@dolusoft/query-table/table.css'` from a script without a warning, in `production` and in `development` (#253); Vite keeps it either way. The scripts stay free of side effects: the list names stylesheets only. `tests/repo/package-manifest.spec.ts` holds the value (#253 D-04).
- **The content and the tokens stand (K320-8, K320-9).** The stylesheet moves as it is: the same tokens, themes and selectors (C-41). Its token report moves to `packages/vue/etc/tokens.md`, and a token is still never renamed or removed. The check of K320-9 reads each release's report at the path of that release, `packages/query-table-skin/etc/tokens.md` up to 3.22.0 and `packages/vue/etc/tokens.md` after it, so the promise holds across the move.
- **One minor of overlap (K323-3).** `@dolusoft/query-table-skin` is published one last time in 3.23.0, with the same file: its build copies `packages/vue/styles/table.css`, and the release workflow does not change for 3.23. After that release the package is deprecated on npm with a pointer to the new path, and from 3.24.0 it is no longer published: it leaves the workspace and the release workflow (#254). Factory Line moves to the new path (dolusoft/dev#414).
- **The checks (K323-4).** They take the place of the package checks of K320-10:
  - `check:package`: of the table packages, only the Vue package holds a stylesheet, `table.css`, in its `dist/` and its tarball, and it is byte for byte `styles/table.css`, so it does not come out of the script build. No `.js` of a `dist/` and no `.d.ts` of a `dist/types/` names a `.css` specifier. `attw` runs on the Vue package with `--exclude-entrypoints table.css`: it reports a stylesheet export as `NoResolution`. In 3.23 the skin package is still held to its stylesheet alone, with the same bytes.
  - `check:no-css-leak` skips one file, `table.css` of the Vue package; every other file of the Vue package is still scanned.
  - `check:size` and `check:package-size`: the build of every fixture of a script entry gives no CSS asset. The `skin` entry of `check:package-size` measures `packages/vue/dist/table.css`.
  - `pack-install` imports `@dolusoft/query-table/table.css` and checks that the skin is applied in the dev server and in the production build.
  - The skin's contract test moves to the Vue package.
- **Layers (K323-5).** The stylesheet stays outside protocol → core → vue, as K320-11 had it, now inside the Vue package's tarball: it imports nothing, and no module imports it.

## Scope

In: the move, the export and `sideEffects`, the token report, the checks, the playground, the documentation (README, AGENTS.md, CONTRIBUTING, `docs/guide/`, the skill, CHANGELOG), the last build of the skin package with a note in its README, and the principle amendments below.

Out, each its own change:

- **Deprecating and removing the skin package** after 3.23.0 (#254): `npm deprecate`, then `packages/query-table-skin/` and its steps of `release.yml` go in 3.24.0.
- **Factory Line's move** to the new path (dolusoft/dev#414).
- **A scoped skin**, `@scope (.qt-skin)` or a `table.scoped.css` (#253 D-03). Loaded globally, the skin changes every element of frontendx's two tables, and wrapping it in `@layer` does not reduce that. It is decided in its own record when frontendx adopts the skin; until then C-41 and the tokens on `:root` stand.

## Principles

Amended in their own pull request, before the implementation:

- **P5.** The scripts of the table packages carry no styles and the table takes no styling props. The look ships in one file, `table.css` of the Vue package, which a consumer imports and no module imports.
- **P8.** The skin's budget is the gzip size of `packages/vue/dist/table.css`; no fixture of a script entry builds a CSS asset.
- **P9.** The skin's surface is its path, `@dolusoft/query-table/table.css`, and its tokens; it is versioned with the Vue package it ships in, and its token report moves.
- **P14.** The stylesheet is outside the layers, inside the Vue package: it imports nothing, and no module imports it.

## Consequences

- One install and one import line, and the skin is the table's version. A consumer of the separate package changes one import.
- The Vue package's tarball grows by the stylesheet, 215,681 B to 220,458 B (+4,777 B; unpacked 892,667 B to 911,944 B, +2.2%). An app that does not import the stylesheet ships the same bytes; one that imports it gets 13,238 B of CSS minified by Vite, 3,051 B gzip.
- `sideEffects` is no longer `false`. A bundler that reads it keeps an import of a `.css` file of the package; the package has one, imported by no module, so nothing else is kept.
- TypeScript reads the new import as it read the old one: an app types it through `vite/client` or a `declare module '*.css'`, without which both give TS2882.
- 3.23.0 publishes four tarballs one last time; from 3.24.0 a release publishes three.

## Alternatives

- **Keep the separate package (ADR 0023; not chosen).** Nothing changes for Factory Line, but the fourth tarball and publisher stay, and a table and a skin of different versions still install together.
- **Both paths for good (#253 S1; not chosen).** Two paths to one file to publish and document, for no consumer that needs both.
- **Freeze the old package at 3.22.0 (#253 S2; not chosen).** One release less of it, but a consumer on it gets no 3.23 change to the skin without changing the import first.
- **`sideEffects: false` (not chosen).** The field stays as it was, but webpack drops the import without a word.
- **A webpack build in `pack-install` (#253 S4; not chosen).** It catches the drop itself, at the cost of `webpack`, `css-loader` and `mini-css-extract-plugin` in the development dependencies; the drop depends only on the field the manifest test holds.

## Trade-off

The Vue package's tarball carries a stylesheet that only an app that imports it uses, and its `sideEffects` is a list instead of `false`. In return the skin is always the version of its table, a consumer installs one package, and a release publishes three tarballs instead of four.

## Rules

None change. C-41 holds the stylesheet's selectors as before; the DOM contract it selects is C-40 and C-128.
