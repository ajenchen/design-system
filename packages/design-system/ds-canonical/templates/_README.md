# DS canonical templates

This directory ships **canonical app templates** for consumer apps to mirror.
Per user 2026-05-27「ds repo push main → PW template 永遠 latest」directive.

## Files

- `dashboard-app.tsx` — AppShell + Sidebar + DashboardPage canonical full composition
  (aligned with `sidebar.stories.tsx#IconCollapse` + `header-canonical.spec.md:57-72`)。
  DashboardPage 的主區只有一張 DataTable,直接接在 PageHeader 下(四邊 `--layout-space-loose`,`layoutSpace.spec.md` 規則 1 / 2 / 4),
  不另放區段標題與說明 —— 頁面標頭已經說明這頁是什麼(`app-shell.spec.md`「Main 內塞什麼」);表格用 `aria-label` 命名。

## Sync mechanism

DS protected `main` / immutable release → `mirror-to-published-template.yml`:
1. 由 DS SSOT build allowlisted `ds-product-template` snapshot，綁定 release BOM、npm integrity 與 scaffold lock
2. 在無寫入憑證的 job 完成 clean-room install / governance / typecheck / build / a11y conformance；這不會自動升級 provider runtime certification
3. 獨立、environment-gated Writer App 只可建立或更新 deterministic mirror PR，禁止 direct push target `main`
4. 產品 repo 的接收升級 workflow(`sync-design-system.yml`,0.1.0-beta.152 起受管出貨)收到 release 的 `repository_dispatch` → 在 GitHub runner 跑 `sync-all` → 只推 `automation/design-system-<版>` 分支,PR 由 release orchestrator 開,一樣以 PR 升級

Fork users 從 PW main fork → 取到當下最新 canonical baseline。Fork 後 diverge customization 是 fork user 自己責任。

## SSOT chain
DS canonical (this directory) → immutable release/BOM → evidence-verified published-template mirror PR → consumer upgrade PR → fork user 取得已審查的 exact version。
