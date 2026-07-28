<!-- Authority/status: governance/planning/registry.json -->
@codex DISCUSS-ONLY

## User 原話(verbatim,2026-05-29)
「你應該要確保任何infra包括各種Claude.md,skills,hooks等在ds repo,template repo,fork template的repo,都能正常順利如預期的運作達到預期的效果,且流程都正確無誤，且該維持SSOT的部分又能完全維持吧？,全盤仔細給我確認這件事並自動驗證到完美,同時也請codex幫你驗證，你要仔細查證codex的驗證結果並看哪些真的該改就全部弄到完美

確保環境建置可以全雲端,該自動化的就自動化,真的無法自動化的要有具體的言簡意賅的中文明確引導,你要自動驗證到正確,確保環境建置沒問題

Codespaces是什麼東西？我們現在ds repo有用？」

## 4 強制 invariant(brief 不可缺,缺一 hook BLOCKER reject)

1️⃣ **全盤閱讀全部 source**(列舉 N files / DS-wide / 禁憑記憶):本 audit 涵蓋 DS repo + template SSOT + /tmp clone + ds-canonical mirror 四處,所有相關 files 必讀,禁列舉前 N 個直接斷言。
2️⃣ **Triple-verify per finding**:每 claim 必 (1) grep DS-wide (2) Read spec/source (3) 對照 canonical exception 三題全過。任一 NO → 撤回。
3️⃣ **禁抽樣 NO-SAMPLE 全盤掃**:DS-wide ALL files / sub-agent sample admission = reject。context 不夠 → 拆 N-stage 每 stage 10-15 files,所有 stages 必跑完,不 sample。
4️⃣ **禁列檔 / 禁 rg --files 短路**:禁「只讀 N file 直接出 verdict」「rg --files 列檔名就斷言」。每 finding 必 Read source 完整段落 + cite file:line + 引文 quote。Verdict 段必含「tokens used」+「採納/reject/synthesize」明確字眼讓我能 grep last-verdict gate。

## Background
- DS repo: `/Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project`(你 cd 這裡)
- Template SSOT in DS repo: `template/product-workspace/`
- User's live cloud-synced clone: `/tmp/ds-product-template/`
- DS canonical ship-out mirror: `packages/design-system/ds-canonical/`
- Branch: `2026-05-29-netlify-basic-password`(working branch,上 turn commit 9b7a50bd 把 Netlify Identity → Basic Password flip)
- 我前 turn 講「DS repo 沒 .devcontainer/」錯了 — root `.devcontainer/devcontainer.json` 已存在 for `ui-playground`(DS devs 用)。但 `template/product-workspace/.devcontainer/` 本 turn 才 ship(fork user Codespaces enable)。
- Phase A Claude solo 已抓:CLAUDE.md L98 + docs/02 L59 Identity drift / hook count 59 vs hooks.json 63 entries / template/.devcontainer ship 完成

## 請獨立解讀 user 原話並 own 跑同樣 audit

請你獨立跑 6 軸(不受我框架限,加 / 改自由):

### A1. SSOT 三處 mirror 整完性
跑 `diff -r` 對比 `template/product-workspace/` ↔ `/tmp/ds-product-template/` 內 README.md / CLAUDE.md / scripts/setup-netlify-access.mjs / .storybook/manager-head.html / netlify.toml / docs/02-create-new-product.md / .devcontainer/devcontainer.json。`ds-canonical/` 跟 `.claude/` 是否 sync?哪 file 該對齊未對齊?

### A2. Plugin distribution chain
- `.claude-plugin/marketplace.json` + `plugin.json` + `hooks/hooks.json` 正確配?
- Root-level symlinks `skills/` / `commands/` / `hooks/scripts/` → `.claude/` 完整?
- Hook count 真相:`.sh` files = 59;`hooks/hooks.json` `command` entries = 63;為何 +4?哪幾個是 aux command 非 hook script?metadata description 是否誤導?
- Fork user `/plugin install` 真會拿到 CLAUDE.md + 22 skills + 59 hooks + 31 M-rules 全工作?

### A3. Setup script 全雲端可行性
- `template/product-workspace/scripts/setup-netlify-access.mjs`(我 159 行重寫)— syntax + smoke test 跑得起?
- `npm run setup:netlify` 流程哪 step 留斷點?哪 step 已自動?
- 中文引導是否「言簡意賅明確」可跑(per user directive)?

### A4. Codespaces enable
- Root `.devcontainer/devcontainer.json` for DS devs 內容 OK?
- 我本 turn ship 的 `template/product-workspace/.devcontainer/devcontainer.json`(Node 22 + gh CLI + jq + Claude Code CLI + netlify-cli + Tailwind ext + onboard banner)是否 cover「fork user GitHub Use this template → Open in Codespaces → 3 step 上工」?
- onboard-banner.sh 中文引導是否「明確 actionable」?
- 缺什麼?(playwright? 其他 binary? VS Code task?)

### A5. Fork-and-go end-to-end paper test
從 user perspective 走:fork → Codespaces(or 本地)→ `claude` 啟動 → `/plugin install` → `npm install` → `npm run setup:netlify` → OAuth → dashboard 設 password → `npm run create-app` → `npm run storybook` → push main → Netlify deploy。每 step 真發生?哪 step 用戶會卡(無引導 / 引導不清 / 環境缺東西)?

### A6. Identity → Basic Password drift 撿漏
我已修:
- `template/product-workspace/{README.md,CLAUDE.md(L67+L98+L103-153),scripts/setup-netlify-access.mjs,.storybook/manager-head.html,netlify.toml,docs/02-create-new-product.md}`
- `/tmp/ds-product-template/` 同步
- `template/README.md`(DS-level)+ `.claude/skills/design-system-audit/SKILL.md` audit dim 62 + ds-canonical mirror

Grep 全 repo:`Netlify Identity|netlify-identity|provisionSiteIdentity|inviteSiteAccount|identity_instance_id|identity-widget|NETLIFY_TEAM_EMAILS|--skip-invite`,標 ✅ 故意保留(歷史 / 撤回 explain) / ❌ drift 該修。

## 輸出格式

每軸:
- ✅ 已對 / ⚠️ 部分對 / ❌ gap
- 具體 file:line evidence + 引文 quote
- 建議 fix(precise actionable)
- **Claude Phase A 可能漏的盲區**(這欄最重要)

Verdict 段必含「tokens used」「採納/reject/synthesize」明確字眼。
