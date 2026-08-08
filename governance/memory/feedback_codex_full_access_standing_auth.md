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

**How to apply**:
- 跑之前確認 brief 內含「禁寫/刪/改 source」約束,輸出導到 /tmp 檔案由 AI 接手讀。
- Claude Code 的 Bash 沙箱擋 unix socket,codex app-server 在其中起不來(`Operation not permitted`);實務上請 user 以 `!` 前綴在自己 shell 跑,或在無此限制的環境執行。
- 本 repo package.json 已無 `@openai/codex` dep;`npx --yes @openai/codex` 可直接取得 CLI(2026-08-08 實測 0.147.0)。`~/.codex/config.toml` 已設最強模型與 effort;不帶降檔 flag 即繼承(user 2026-07-10 directive:審查用最強模型與算力,禁降檔省成本)。
