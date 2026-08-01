# Troubleshooting

常見問題 + fix。

## Install / Build

| 症狀 | 修法 |
|---|---|
| `npm ci` ERESOLVE peer dep | 加 `--legacy-peer-deps`(`.npmrc` 已配)|
| `Failed to resolve "lucide-react"` / `react-is` | 用 `sync-all --apply --to <known-good-exact-version>` 開 upgrade PR；不要安裝 `@beta` |
| `npm run build` TS5062 path substitution | Root tsconfig 不要 paths 用 `*`,per-app tsconfig 才宣告 `@/*: ./src/*` |
| Tailwind class 不生效(Button 純文字無樣式)| globals.css 漏 `@source '../node_modules/@qijenchen/design-system/src/**/*'` directive |

## Render

| 症狀 | 修法 |
|---|---|
| iconOnly Button 卡 / warn | App root 缺 `<TooltipProvider>` |
| Sidebar selection 行為怪 | 用 `<SidebarProvider activeId={...}>` 不要 `isActive` prop |
| Dark mode 不切 | `<html data-theme="dark">`(attribute 不是 class)|
| Dialog content 空 | Dialog 需 `<DialogPrimitive.Trigger>` 或 `open` prop |
| Chart 不 render(width(-1) warning)| Chart container 要 explicit width / height(或 aspect ratio)|

## Governance / provider session

| 症狀 | 修法 |
|---|---|
| 治理狀態不明 / native hook 沒 fire | 先跑 `npm run governance:check -- --hooks-off`。若失敗，依 rule ID 修 lock/BOM/payload；若通過，native hook 只是該 provider 的 trust/discovery 問題，不影響 hard-gate 結果 |
| `GOVERNANCE-DEPS-MISSING` | session 不會自動修；結束或暫停工作，在 repo root 執行 `npm run setup:all`，任一 install/signature/check/provider-toolchain 階段失敗都不可繼續宣稱 compliant |
| Claude 每個 prompt 都顯示 `TRANSCRIPT_SIZE_OR_TYPE_INVALID` | 這是舊 DS-author/plugin adapter 對 provider 逐字稿檔名、檔案型別或**整份檔案大小**的錯誤假設；長期 session 即使只輸入 `Hi` 也可能在 prompt 送出前被擋。新版 runner 不讀取整份逐字稿，只會從穩定 regular file 驗證並複製有上限的 JSONL 尾端，過大單筆、替換或非檔案輸入仍 fail closed。不要改名、截斷或手動操作 Claude session 檔；先記錄錯誤中的實際 hook command。若 command 指向 repo 的 `scripts/run-provider-hook.mjs`，以受審 release 執行 `npm run setup:all`（升級走 `npm run sync-all` reviewed 流程）。若 command 含 `${CLAUDE_PLUGIN_ROOT}`，package sync 不會更新獨立的 Claude plugin cache；請把 marketplace/plugin 更新到修正版，或從 product 移除這個不必要的 optional plugin（managed endpoint 由管理員改 policy）。更新後須**完整退出所有 Claude Code 程序再重開**，不可只開新 tab 或沿用舊的 `--continue` process。Product dispatcher 本身不應包含 `check_propose_without_benchmark.sh`。 |
| Claude/Codex skill 不一致 | 不要手改 generated view；從 canonical release 重跑 exact upgrade。產品自有 skill 必同時提供 `.claude/skills` 與 `.agents/skills` 等價內容 |
| Codex hooks 未執行 | Codex repo hook 需要信任；完成 trust 後重試。CI/hook-off checker 仍為 authority，不可把未 trust 誤報成 compliant |
| Upgrade 報 `GOV-UPGRADE-PATH-*` / managed body missing | 不要手抄 workflow 或腳本。該 exact release 的 corpus／BOM 不完整或 patch 超出封閉 materialization policy；停止合併並回 DS authority 修正、重發更高版本 |
| Upgrade 報 `GOV-UPGRADE-BOOTSTRAP-001/002` | 這兩個是相容性保留的穩定錯誤 ID；代表 exact release 改到 workflow、可執行腳本、`.npmrc`、`governance/bin` 或 `package.json#scripts`。已是 v2 的 consumer 改走 DS authority 的 recurring reviewed control-plane 六階段流程；只有仍在 `legacy-bootstrap-v2` 的舊 consumer 才走一次性 bootstrap |
| 上游 template PR 未出現 | 在 design-system release SSOT 檢查 mirror readback；template 本身沒有 release-dispatch/updater workflow，也不需要 Governance App environment |
| PR 存在但沒有 `Verify consumer` | 確認 `audit.yml` 存在於 candidate、Actions 可執行，並重新跑唯一 required job；不要以 preview/a11y/visual/canary context 取代它 |
| 已合併的 DS release 有問題 | 不移動 dist-tag、不降版、不只回一包。保留證據並由 DS authority 發布更高的 corrected exact release，再走正常 upgrade PR |

## Netlify deploy

| 症狀 | 修法 |
|---|---|
| Deploy 404 | 第一次 deploy 還沒成功 → 看 Netlify build log debug |
| ERESOLVE during deploy | `.npmrc` legacy-peer-deps=true 已配,確認 file 在 repo root |
| Build 過但 site 純白 | SPA root `<div id="root">` 沒 hydrate,看 console JS error(F12)|

## Misc

| 症狀 | 修法 |
|---|---|
| `npm run lint:imports` 報內部路徑 | 改 import 為 top barrel `from '@qijenchen/design-system'` |
| 改 DS 想 fix bug 怎麼辦? | **不改 node_modules**。Open issue / PR to `ajenchen/design-system` repo |
| 找不到某 component | Storybook https://ajenchen-design-system.netlify.app/ 全覽 |

## Get help

- DS Storybook: https://ajenchen-design-system.netlify.app/
- DS repo issues: https://github.com/ajenchen/design-system/issues
- Claude/Codex 的 skill 列表應涵蓋 committed classified skills；最終以 `governance:check` 證據為準
