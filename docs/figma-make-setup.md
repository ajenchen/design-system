# Figma Make + `@qijenchen/design-system` Quick Start

3-step setup for using the DS inside Figma Make (or any sandboxed Tailwind v4 + Vite project).

> **Status (2026-05-25)**: `@qijenchen/design-system@0.1.0-beta.3` published to npm public. Stable `v1.0.0` (no `@beta` suffix) planned after beta soak.

## Step 1 — Install

```bash
npm install @qijenchen/design-system@beta
```

> ⚠️ The `@beta` dist-tag suffix is required during pre-release. After `v1.0.0` ships, `npm install @qijenchen/design-system` (no suffix) will work.

## Step 2 — Load token system (single import)

In your entry CSS file (commonly `globals.css` / `index.css` / `main.css`):

```css
@import 'tailwindcss';
@import '@qijenchen/design-system/styles/tokens';
```

That's it. One import loads the full token system in canonical order (primitives → semantic → typography → uiSize → layoutSpace → radius → opacity → motion).

> **Why one import is enough**: the aggregator at `styles/tokens` is auto-generated from `src/tokens/**/*.css` by `scripts/gen-figma-make-artifacts.mjs`. CI guards prevent drift, so when a new token category lands in a future release, your single import inherits it without code change on your side. See `scripts/gen-figma-make-artifacts.mjs` for the SSOT propagation contract.

## Step 3 — Use components

```tsx
import { Button } from '@qijenchen/design-system/components/Button'
import { Avatar } from '@qijenchen/design-system/components/Avatar'

export default function App() {
  return (
    <div className="bg-canvas text-foreground p-8">
      <Button variant="primary">Hello from DS</Button>
      <Avatar name="Wendy" />
    </div>
  )
}
```

Subpath imports (`/components/<Name>`) are recommended for optimal tree-shaking. The package marks `**/*.css` as `sideEffects` so unused components don't ship CSS.

## Optional — Provider setup

A few components require app-level providers. Wrap your root once:

```tsx
import { TooltipProvider } from '@qijenchen/design-system/components/Tooltip'

export default function App() {
  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      {/* your app */}
    </TooltipProvider>
  )
}
```

(Toast / Dialog also have providers — see the per-component docs for details.)

## Compatibility matrix

| Requirement | Status |
|---|---|
| React | `>= 18.0.0` (Figma Make ships React 19 — compatible) |
| Tailwind | `>= 4.0.0` (Figma Make ships Tailwind v4 — compatible) |
| TypeScript | optional; types ship with the package |
| Bundle size | 474.8 kB packed / 1.5 MB unpacked (subpath-import + tree-shake encouraged) |

## Known limitations in Figma Make

- **Storybook addons not applicable** — Figma Make is a prototype runtime, not a dev environment. The `@qijenchen/storybook-config` package targets standalone dev setups (separate from Figma Make).
- **DS Devmode addon not bundled** — same reason. The DS repo's internal Storybook devmode is repo-local.
- **Pre-release dist-tag** — use `@beta` until `v1.0.0`.

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `npm install @qijenchen/design-system` returns 404 | No `latest` tag yet. Use `@qijenchen/design-system@beta`. |
| Tailwind utility classes like `bg-primary` not generating | Ensure `@import '@qijenchen/design-system/styles/tokens'` appears AFTER `@import 'tailwindcss'`. Tailwind v4 needs `@theme` directives loaded at scan time. |
| `<Tooltip>` content not rendering | Wrap app root in `<TooltipProvider>`. |
| Dark mode colors not switching | Set `<html data-theme="dark">` on the root element. The DS color system uses `data-theme` attribute (per `tokens/color/semantic.css`). |

## SSOT canonical reference

The Figma Make consumer surface is a thin layer over the DS SSOT. The aggregator at `styles/tokens` is generated, not authored:

- **Source of truth**: `packages/design-system/src/tokens/**/*.css`
- **Generator**: `scripts/gen-figma-make-artifacts.mjs`
- **CI guard**: `release.yml` audit gates run `--check` mode before each publish
- **Adding a new token category in DS repo**: author the new CSS file → run generator → commit aggregator alongside. Consumers `npm update` and inherit automatically.

This way Figma Make consumers stay in lockstep with the DS SSOT without manual sync.
