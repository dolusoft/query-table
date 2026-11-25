# @dolusoft/query-table-skin

**This package has moved into `@dolusoft/query-table`.** From 3.23.0 the reference skin ships with the table itself, at `@dolusoft/query-table/table.css` ([ADR 0025](https://github.com/dolusoft/query-table/blob/main/docs/decisions/0025-skin-subpath.md)). This package is published one last time, in 3.23.0, with the same file, and is then deprecated; from 3.24.0 it is no longer published.

To move, remove this package and change one import. The stylesheet, its `--qt-*` tokens and its selectors are the same, and the skin is now always the version of your table:

```bash
pnpm remove @dolusoft/query-table-skin
```

```diff
- import '@dolusoft/query-table-skin/table.css'
+ import '@dolusoft/query-table/table.css'
```

## What it is

The reference skin of [`@dolusoft/query-table`](https://github.com/dolusoft/query-table): one stylesheet that draws the table's DOM contract (the `qt-*` classes and `data-*` attributes) in the product's table design, with a light and a dark theme. Plain CSS, no build step, no JavaScript. It dresses `QueryTable`, `DataTable` and the cell components of `@dolusoft/query-table/cells`.

## Theme

Every color, size and font is a `--qt-*` custom property on `:root`. Map your design system onto them; the rules stay.

The theme follows the operating system (`prefers-color-scheme`). Set `data-theme="light"` or `data-theme="dark"` on `<html>` to fix it. The skin sets its dark colors in two places, under the media query and under `data-theme="dark"`, so a dark value of yours goes in both. Use the skin's selectors and load your rules after the stylesheet: the selectors weigh the same, so the later rule wins.

```css
:root {
  --qt-font-family: 'Inter', system-ui, sans-serif;
  --qt-radius: 0.5rem;
  --qt-accent: var(--brand-500);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --qt-bg: var(--surface-900);
    --qt-border: var(--surface-700);
  }
}

:root[data-theme='dark'] {
  --qt-bg: var(--surface-900);
  --qt-border: var(--surface-700);
}
```

Only colors have a dark value. A size, a font, or a color the dark theme leaves alone (such as `--qt-accent`) set on `:root` holds in both themes; a color the dark theme sets keeps the skin's dark value until you give yours.

The tokens and their defaults for the version you installed are the first rules of `table.css`, on `:root`. The report of the latest version, with light and dark side by side, is [`packages/vue/etc/tokens.md`](https://github.com/dolusoft/query-table/blob/main/packages/vue/etc/tokens.md); a token listed there may be newer than your version. A token is never renamed or removed; a release may add new ones ([ADR 0023](https://github.com/dolusoft/query-table/blob/main/docs/decisions/0023-skin-package.md)).

## What it does not style

What your slots draw is yours: the toolbar, the controls of the `pagination` slot, the content of the `subtable` slot. The skin styles only the hooks of the table and of the cell components.
