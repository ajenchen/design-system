# Provider-neutral hook corpus charter

**Canonical owner:** `packages/design-system/ds-canonical/hooks/**`. The `.claude/hooks/` mirror was retired on 2026-08-04; providers execute hooks through `scripts/run-provider-hook.mjs`. Event registration is owned by `registrations.json`; provider events, matcher aliases, environment mapping, and config paths are bindings in `packages/governance/canonical/providers.json`.

## 這裡只收:pre/post tool event 的機械化自動檢查

每個 hook 是一個 shell / python script，必要的複雜機械判斷放在同一 canonical tree 的 static Node helper，由 provider adapter 在支援的 tool event 上觸發:
- **PreToolUse**:tool 執行前(可 block 或 inject context)
- **PostToolUse**:tool 執行後(通常 inject 提醒 / warning)
- **Stop**:turn 結束(sanity / harvest / metric capture)
- **SessionStart**:session 開始(governance check)

**核心特徵**:**不依賴 AI 自律**,tool 層強制執行;規則可用 `grep` / 條件判斷自動驗證。

## 當前居民

**清單以 canonical `registrations.json` 為準**(事件 / matcher / outputMode / requires),每支 hook 做什麼看該檔檔頭;provider 實際接線看生成的 `generated/governance/provider-hook-coverage.json`。本檔不再維護手寫清單(2026-11-17 knowledge-prune:原表自稱「以 registrations.json 為準」,實際只列 24/60 支,還寫錯 Stop 的支數)。

兩個常被找的舊名:2026-05-13 把 `stop_harvest_corrections.sh` / `stop_capture_metrics.sh` / `stop_meta_self_audit.sh` 折進 `stop_passive_logging.sh` 的 R2 / R3 / R5;2026-11-17 把 `log_skill_invokes.sh` 併進 `log_governance_fires.sh`(matcher `Write|Edit|MultiEdit|Skill`,要 `GOVERNANCE_TELEMETRY_OPT_IN=1` 才寫)。舊檔名都已不存在。

### Provider transcript 排錯

Claude 每個 prompt（包含 `Hi`）都在送出前顯示 `TRANSCRIPT_SIZE_OR_TYPE_INVALID`，代表仍在執行舊的 transcript adapter；舊版可能把整份長期 session 檔案大小、provider 自訂檔名或檔案型別誤當成拒絕條件。現行 runner 只從穩定 regular file 驗證並複製有上限的 JSONL 尾端，不讀取整份 transcript；過大單筆、非 JSONL、symlink／FIFO 或讀取期間替換仍 fail closed。

先記錄錯誤所列的完整 hook command，不要改名、截斷或手動搬動 session 檔。Command 指向 repo `scripts/run-provider-hook.mjs` 時，重新產生／同步受審 provider view；指向 `${CLAUDE_PLUGIN_ROOT}` 時，另行更新 plugin cache，repo sync 不會代替 plugin 更新。更新後必須完整退出所有 Claude Code process 再重開，不能只開新 tab 或沿用舊的 `--continue` process。

### Helper(非註冊 hook)

| File | 用途 |
|------|------|
| `_log-fire.sh` | 各 hook source 的 fire-logging helper |
| `lib/provider-marker-regex.mjs` | 驗證 provider registry marker array 並輸出 escaped ERE |
| `lib/audit-report-validator.mjs` | audit report matrix / prompt / 決策證據的固定資料運算 |
| `lib/tsx-governance-analysis.mjs` | 從 consumer project 解析 pinned TypeScript，執行三個 TSX AST governance analyzer |
| `lib/benchmark-citation.mjs` | M22 世界級對照來源判定的唯一實作(關鍵字 / 網域 / 逐家比對 / 段落切法 / tsx 只看註解與 note= / md 跳過程式碼框);`check_benchmark_citation.sh` 與 `scripts/benchmark-citation-invariant.mjs` 共用 |
| `lib/benchmark-citation-sources.json` | 上一列讀的名稱 / 網域資料表(2026-11-05 K8 盤點的名稱對網域表) |
| `lib/ask-route.mjs` | `stop_self_audit.sh` Mechanism 13「該不該問」的判定;合法集合每次從 AGENTS.md 決策區塊、`lib/approval-evidence.mjs` 的 `humanOnlyAuthorityScopes()`、`infra/governance/release-workflow.json` 讀,本檔與 hook 都不帶清單 |
| `tests/registration-output-contracts.mjs` | registration output contract 的固定測試程式 |
| `lib/_deny_norm.py` | deny 正規化的唯一實作(展開函式 / 變數包裝、sh -c、eval,還原 git -C / -c / 別名、env 前綴、絕對路徑後比對 `adapters/claude-settings-base.json` 的 deny);`check_bash_command_shape.sh` 用 `hook` 子指令、`check_solo_workflow.sh` R1 用 `check` 子指令。判定表唯一一份:`tests/fixtures/deny-norm/cases.json`(改 deny 清單要同一次改期望值與 denySha256) |

Node helper 必須是本 canonical tree 內可盤點、可雜湊的 committed `.mjs`，shell 只能用 `node -- <exact-static-path> ...` 傳資料。禁止 `node -e`、`node -p`、`--eval`、`--print`、stdin / heredoc JavaScript；provider view 一律由 canonical source 生成。

## Anti-bloat 落地

- **L1 Pre-write**:`check_file_size_budget.sh` + `check_story_invariants.sh`(內含 principles canonical + l3 primitive 等 5 個合一)等(PreToolUse 阻擋 / 警告)
- **L2 Per-edit**(PostToolUse Write|Edit|MultiEdit|Skill,script 內自過濾 governance file;僅在 `GOVERNANCE_TELEMETRY_OPT_IN=1` 時寫,預設關):`log_governance_fires.sh` → `$GOVERNANCE_STATE_DIR/hook-fires.jsonl`(governance file 編輯軌跡)+ `skill-invokes.jsonl`(Skill tool 呼叫)
- **L3 Periodic**:`/knowledge-prune` skill 季度跑；量化 retire rate，但只 retire 有證據的噪音，禁止為湊比例硬刪

Runtime telemetry 必須由 trusted adapter 明示設定 `GOVERNANCE_TELEMETRY_OPT_IN=1`。`$GOVERNANCE_STATE_DIR` 只能在 Git-owned `<git-dir>/governance-runtime/` 內；未指定時使用該 Git-owned default，read-only / 未 opt-in 時不寫任何 telemetry bytes。Generated provider homes 不是 telemetry authority。

閘自己要讀回來判定或宣稱稽核的**功能狀態**(例:`check_solo_workflow.sh` R1 的同 session 分支紀錄、`GOVERNANCE_BYPASS_*` 稽核紀錄)不是遙測,不看 opt-in:由 adapter 啟動(有 `GOVERNANCE_RUNTIME_ROOT`)且非 `GOVERNANCE_READ_ONLY=1` 時寫進同一個 Git-owned 目錄;CI replay、hooks:test、直接手動跑 hook 仍然一個 byte 都不寫。條件與函式見 `_log-fire.sh`「兩種寫入、兩道開關」。

## 這裡**不收**(反例)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 需要 AI 走流程才能判斷的規則 | `packages/design-system/ds-canonical/skills/` | hook 只能機械判斷,複雜 workflow 屬 canonical skill |
| 每 session signal rule | shared / registry-declared instruction entry | hook 是 tool-level,不是 session-level |
| 單一元件的 lint rule | 該元件 spec + code | hook 是跨元件系統級,單元件屬 spec |

## 新 hook 的 criteria(必須全部通過)

1. **規則可機械判斷**(grep / 條件邏輯,不需人類 judgment)
2. **觸發 event 清楚**(PreToolUse / PostToolUse / Stop / SessionStart + matcher)
3. **已有明確 tech debt 或 bug class**(不做預防性空守衛)
4. **失敗模式安全**(hook 掛掉不會 block 合法操作 / 誤殺)

## 接線到 provider registry

新 hook 必須在 canonical `registrations.json` 註冊。Hook core 只讀 `GOVERNANCE_*`；legacy provider env 由 `scripts/run-provider-hook.mjs` 依 registry 映射。Provider view 由 `node scripts/sync-ds-canonical.mjs` 生成，禁止手改 `.claude/settings.json` / `.codex/hooks.json`。範例:

```json
{ "kind": "hook", "hook": "your-hook.sh", "runtime": "bash" }
```

## Hook 退出碼約定(portable command-hook contract)

- `exit 0` — 正常,不 inject context
- `exit 2` + stderr — **blocking**,AI 看到 stderr 訊息後必須處理
- `stdout` with `{"governanceContext":{"hookEventName":"...","message":"..."}}` — provider-neutral non-blocking context;adapter 轉成各 provider 的 native transport

## 已修(2026-04-28):Stop hook → UserPromptSubmit inject 鏈路

**症狀**:Stop hooks(`stop_self_audit` / 當時的 `stop_meta_self_audit`,現為 `stop_passive_logging` R5)silent-log 但不 inject,M14 / M20 的「auto-inject corrective prompt」 不生效 → AI reactive 模式持續。

**修法**:加 `inject_pending_self_audit.sh` 註冊在 UserPromptSubmit hook(該 event 確認支援 `hookSpecificOutput.additionalContext`)。鏈路:

```
turn 結束 Stop event → stop_self_audit / stop_passive_logging R5 silent log to $GOVERNANCE_STATE_DIR/
                                              ↓
user 下一個 prompt → UserPromptSubmit fires → inject_pending_self_audit.sh
                                              ↓
                                        讀 log (since last-inject-ts)
                                        dedup + 24h filter + 3KB cap
                                              ↓
                                        inject 給 AI next-turn context
```

**Self-test**:`bash packages/design-system/ds-canonical/hooks/tests/test_inject_pending_self_audit.sh`。

## Retired

`retired/` 目錄存舊 hook(不再註冊),保留 reference 不刪除。當前已 retire 的 hook 不在本 inventory 列出 — 以 canonical `registrations.json` 為 SSOT。

最近 retire(2026-04-28):
- `check_button_icon_literal.sh` — 違反 Rule-of-3(DS-wide 0 hits,只我 1 次失誤建)

## 建立前必 Read

本 README + 最接近的既有 canonical hook 當範本 + shared `AGENTS.md` 的 Hook 治理章節。
