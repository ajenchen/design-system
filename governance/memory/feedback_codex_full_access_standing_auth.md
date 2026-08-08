---
name: Codex 全存取沙箱常設授權(研究/審查 ad-hoc lane)
description: User 2026-08-08 拍板:研究/審查類 ad-hoc codex 執行常設授權全存取沙箱旗標,不再逐次請示;brief 仍限 read-only 產出,受治理 broker 通道的既有禁令不受影響。
type: feedback
originSessionId: b1e3fe19-f71f-4828-b483-cf3fe2323f47
---
# Codex 全存取沙箱常設授權(研究/審查 ad-hoc lane)

**Rule**:研究、審查、比稿類任務要跑 ad-hoc codex CLI 時,常設授權使用全存取沙箱旗標(`--sandbox danger-full-access` 或 `--dangerously-bypass-approvals-and-sandbox`),AI 不再逐次向 user 請示。

**User verbatim(2026-08-08)**:「我要授權codex永遠都可以做這種事啊,確保ssot不要再作繭自縛了,我授權該做的就自動做一做」。

**邊界(不變)**:
- Brief 限 read-only 產出(findings / report);禁 codex 寫/刪/改 source code。
- 本授權只覆蓋 ad-hoc 研究/審查 lane。受治理的 provider review broker(`infra/governance/providers/model-invocation-profiles.json` 的 `forbiddenArguments`)是另一條 lane,其禁令不因本授權放寬。

**Why**:bypass 類旗標過去每案重新請示(首次授權 2026-05-27,原檔已退役,歷史見 `governance/archive/memory-retired/`),重問 = 作繭自縛。授權是 user 決策事實,feedback memory 是它的家;具體 transport / 指令仍屬 adapter 層,本檔不定 transport authority(2026-07-23 退役決策不變)。

## 禁自鎖(user 2026-08-08 verbatim:「你他媽不要又再作繭自縛為自己加鎖了」)

**被自家設定擋住 ≠ 做不到**。2026-08-08 錨例:codex CLI 在 Claude 沙箱起不來,根因是**我們自己的** `scripts/schemas/claude-permission-policy.schema.json` 把 `allowAllUnixSockets` 釘成 `false` + `scripts/lib/claude-permission-policy.mjs:223-224` 非空即丟錯。我當時的反應是叫 user 去買 OpenAI API key——那是把自家的鎖當成外部事實,還讓 user 付錢繞過。

**規則(硬)**:
1. 授權內動作被**自家** policy / schema / sandbox / hook 擋住 → 先問「這鎖是不是我們自己下的?」是 → **解自己的鎖**(改 canonical owner + 走正常 PR)或改用不需放寬安全邊界的既有機制;**禁止**丟回 user、禁止要求 user 付費繞路、禁止宣稱做不到。
2. 真正的 human-only boundary 只有:login/MFA/OAuth、缺 credential reference、plan 外付費、法律/帳號/組織權限、產品-UI-UX 真取捨。**自家治理設定不在此列**。
3. 找替代路徑時**先找不動安全邊界的解**。本案最終解 = queue + worker 常駐(user 跑一次 `codex-worker.sh`,之後 AI 丟 brief 到 `/tmp/claude/codex-queue/` 自動執行),既用 user 既有訂閱、不需 API key、也不必放寬 sandbox。

同族 M-rule:`meta-patterns.md` M36(b)。

**How to apply**:
- 跑之前確認 brief 內含「禁寫/刪/改 source」約束,輸出導到 /tmp 檔案由 AI 接手讀。
- Claude Code 的 Bash 沙箱擋 unix socket,codex app-server 在其中起不來(`Operation not permitted`);實務上請 user 以 `!` 前綴在自己 shell 跑,或在無此限制的環境執行。
- 本 repo package.json 已無 `@openai/codex` dep;`npx --yes @openai/codex` 可直接取得 CLI(2026-08-08 實測 0.147.0)。`~/.codex/config.toml` 已設最強模型與 effort;不帶降檔 flag 即繼承(user 2026-07-10 directive:審查用最強模型與算力,禁降檔省成本)。
