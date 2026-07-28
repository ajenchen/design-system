# DS canonical templates

This directory ships **canonical app templates** for consumer apps to mirror.
Per user 2026-05-27「ds repo push main → PW template 永遠 latest」directive.

## Files

- `dashboard-app.tsx` — AppShell + Sidebar + DashboardPage canonical full composition
  (aligned with `sidebar.stories.tsx#IconCollapse` + `header-canonical.spec.md:57-72`)

## Sync mechanism

DS protected `main` / immutable release → `mirror-to-published-template.yml`:
1. 由 DS SSOT build allowlisted `ds-product-template` snapshot，綁定 release BOM、npm integrity 與 scaffold lock
2. 在無寫入憑證的 job 完成 clean-room install / governance / typecheck / build / a11y conformance；這不會自動升級 provider runtime certification
3. 獨立、environment-gated Writer App 只可建立或更新 deterministic mirror PR，禁止 direct push target `main`
4. 消費者的 `sync-design-system.yml` 再以同樣的 evidence-bound、PR-only 流程升級，不接受未認證的 branch payload

Fork users 從 PW main fork → 取到當下最新 canonical baseline。Fork 後 diverge customization 是 fork user 自己責任。

## SSOT chain
DS canonical (this directory) → immutable release/BOM → evidence-verified published-template mirror PR → consumer upgrade PR → fork user 取得已審查的 exact version。
