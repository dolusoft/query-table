# 0023 A fourth package for the reference skin: `@dolusoft/query-table-skin` (3.20)

Status: Proposed, [query-table#99](https://github.com/dolusoft/query-table/issues/99) under [query-table#201](https://github.com/dolusoft/query-table/issues/201). Decided by Enes on 2026-11-18: the reference skin ships as a separate package (#99 D-01), written in plain CSS driven by `--qt-*` custom properties (#99 D-02) ([comment](https://github.com/dolusoft/query-table/issues/99#issuecomment-7008639821)). Amends [ADR 0002](0002-three-packages.md): a fourth package next to the three.

## Context

P5 keeps CSS out of the packages, and that stays right: a table that owns any of the look forces every product to override it. The cost is that every consumer writes a whole skin for the `qt-*` contract on its own. frontendx is about to replace a 1,810-line stylesheet written for its old grid (#99), and every later consumer would repeat that work, each copy drifting away from the contract.

The product's table design now exists as a skin: `apps/playground/product/skin.css` (#214, #219). It is plain CSS with no build step; every color, size and font is a `--qt-*` token on `:root`; it has a light and a dark theme; it selects only the hooks of the DOM contract, the cell components of ADR 0022 included; and `product/skin.spec.ts` holds it to that. It is about 18 kB, 4.4 kB gzipped. It lives in the playground, so no product can install it.

#99 asked how to distribute it: as a package, as a recipe with a CSS file attached to each release, or not at all. D-01 chose the package, D-02 the plain CSS.

## Decision

- **A fourth package, CSS only (K320-7).** `@dolusoft/query-table-skin` (`packages/query-table-skin/`) publishes one stylesheet, `table.css`, at `@dolusoft/query-table-skin/table.css`. It holds no JavaScript and has no dependencies. None of the other three packages depends on it, and it depends on none of them: a consumer imports it next to `@dolusoft/query-table`. It is versioned with the three (P9, ADR 0006) and published by the same release workflow, after them, to npm only (ADR 0009). It dresses the DOM of the same version: a skin of 3.20 is for a table of 3.20.
- **The content (K320-8).** `apps/playground/product/skin.css` moves into the package as it is. The skin:
  - is plain CSS with no build step and no Tailwind, so it works in any design system;
  - keeps every value in a `--qt-*` token on `:root`;
  - follows the OS theme (`prefers-color-scheme`) unless `data-theme` on `<html>` says `light` or `dark`;
  - selects only the classes and attributes of `contract/dom.ts`, plus `:root` and `data-theme` (C-41);
  - covers the table's own parts and the cell components (ADR 0022).

  The playground's product page imports the package instead of its own copy. The shadcn-vue test skin (`apps/playground/skin/`) stays the playground's and is not distributed.
- **The tokens are public surface (K320-9).** A product themes the skin by setting tokens, so a token name is a promise, as a class of the DOM contract is. A token is never renamed or removed, since there is no major release to do it in (ADR 0019). A new token is a minor change; a new default value that changes the look is a minor change with a CHANGELOG entry. A token report, `packages/query-table-skin/etc/tokens.md`, lists every token with its light and dark default. It is generated and checked as the API reports are, so a removed or renamed token fails the check.
- **The checks (K320-10).** The CSS checks of P5 keep their meaning for the three table packages and learn the fourth:
  - `check-no-css` and `check-css-leak` skip the skin package. A new check holds it to the opposite: its `dist/` and tarball hold `table.css`, `README.md` and `LICENSE.md`, and no JavaScript.
  - `product/skin.spec.ts` moves with the stylesheet: contract hooks only, every token read is defined, the dark theme the same under the OS and under `data-theme`.
  - `check:package-size` gets a `skin` entry: the gzip size of `table.css`.
  - `pack-install` imports the stylesheet in the consumer app it builds outside the workspace.
  - The release workflow checks the skin's version with the others and publishes it fourth. The `api-report`, `check-entry-graph` and size fixtures of the Vue package do not apply: it has no TypeScript entry.
- **Layers (K320-11).** The skin package sits outside protocol → core → vue: it imports nothing, and no package imports it. The playground may import it.

## Scope

In: the package, the move of `skin.css`, the token report, the checks, the release workflow, a README with the install line and a theming example, and the principle amendments below.

Out, each its own change:

- **The minimal "list without a table frame" variant** suggested in #99. It is a second stylesheet, or a set of token values, decided once a second layout needs it.
- **A Tailwind preset or a shadcn-vue mapping.** D-02 chose plain CSS; a product with Tailwind maps its theme onto the tokens.
- **The design's custom page-size select.** It is a control drawn in the `pagination` slot, not part of the table's DOM.
- **frontendx's move onto the skin.** That is frontendx's own change, after this package is published.

## Principles

Amended in their own pull request, before the implementation:

- **P5.** The three table packages still ship no CSS and take no styling props. The skin package is the one place the look ships: CSS only, opt-in, never imported by the others.
- **P8.** Adds the size of the skin's stylesheet to the budgets.
- **P9.** Four packages are versioned together; the skin's public surface is its stylesheet's path and its tokens.
- **P14.** The skin package is outside the layers: it imports nothing and nothing imports it.

## Consequences

- A fourth manifest, tarball and npm package, released in lockstep. The release takes one more publish step.
- frontendx and every later consumer start from a skin that already follows the DOM contract, and map their design tokens onto `--qt-*` instead of writing pinning, filtering and the cell patterns from nothing.
- A change to the DOM contract now has a second place to change: the skin. The DOM is public API and consumer CSS depends on it (P6), so removing a hook breaks every skin; the skin's contract test fails as soon as it selects a hook that is no longer listed.
- The tokens can only grow. A design change keeps a token's name and changes its default value.

## Alternatives

- **A recipe and a release asset (#99 option B; not chosen).** Less to release, but frontendx would copy the file and update it by hand, and the copies drift.
- **No distribution (#99 option C; not chosen).** Every consumer writes its own skin again.
- **The skin inside `@dolusoft/query-table`.** One install fewer, but the table would ship a look and break P5 for everyone who does not want it.
- **The Tailwind source of the playground (#99 S2, not chosen).** No second stylesheet to keep, but it helps only Tailwind consumers, and the test skin is shadcn-vue's look, not the product's.

## Trade-off

One more package to release, and a set of tokens that can only grow. In return the product's look ships once, is versioned with the table it dresses, and is held to the DOM contract by tests, instead of being copied into every product and drifting.

## Rules

None. The skin is not table behavior; its checks are those of K320-10. The DOM contract it selects is C-40 and C-128, and its selectors are held by C-41.
