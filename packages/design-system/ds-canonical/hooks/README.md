# Provider-neutral hook corpus charter

**Canonical owner:** `packages/design-system/ds-canonical/hooks/**`. `.claude/hooks/**` is a deterministic compatibility view. Event registration is owned by `registrations.json`; provider events, matcher aliases, environment mapping, and config paths are bindings in `packages/governance/canonical/providers.json`.

## 這裡只收:pre/post tool event 的機械化自動檢查

每個 hook 是一個 shell / python script，必要的複雜機械判斷放在同一 canonical tree 的 static Node helper，由 provider adapter 在支援的 tool event 上觸發:
- **PreToolUse**:tool 執行前(可 block 或 inject context)
- **PostToolUse**:tool 執行後(通常 inject 提醒 / warning)
- **Stop**:turn 結束(sanity / harvest / metric capture)
- **SessionStart**:session 開始(governance check)

**核心特徵**:**不依賴 AI 自律**,tool 層強制執行;規則可用 `grep` / 條件判斷自動驗證。

## 當前居民(2026-04-26 重整,以 canonical `registrations.json` 註冊為準)

### PreToolUse(Bash / Edit / Write / MultiEdit / mcp__github__*)

| Hook | 做什麼 |
|------|--------|
| `check_solo_workflow.sh` | M28 git ops gate(branch sprawl / PR / merge — solo work canonical) |
| `check_codex_collab_5step.sh` | M31 independent-peer 5-step gate(legacy filename retained;peer 由 provider registry 決定) |
| `enforce_home_charter.sh` | classification-sensitive dir / 新檔案的 charter gate(Write only) |
| `check_file_size_budget.sh` | registry-declared instruction entry / spec / canonical-provider skill / memory 行數預算警告 |
| `check_story_invariants.sh` | stories 合一 invariant 檢查(anatomy / slot-split / category / principles canonical — 2026-05-10 已合併 5 個 sub-hook) |
| `check_canonical_propagation.sh` | canonical 改動(spec / token / primitive)時 consumer propagation 檢查 |
| `check_pattern_invariants.sh` | pattern 層 invariant(overlay-surface / item-anatomy / action-bar / 等) |
| `check_naming_and_abstraction.sh` | M21 prop variant test + M27 prop name conflict + naming 三 test |
| `check_benchmark_citation.sh` | M22 benchmark claim inline cite verify；component specs 禁止未驗證／檔級 escape，維持 zero evidence debt |
| `check_wrapper_primitive_schema_drift.sh` | M30 wrapper schema 必 extends primitive |
| `check_field_family_invariants.sh` | Field family layout / state machine 統一 |
| `check_datatable_invariants.sh` | DataTable canonical(virtualizer / column-types / autoRow / overflow) |
| `check_opacity_token_usage.sh` | opacity token 使用紀律 |
| `check_substantive_edit_approval_preflight.sh` | target-bound authority classifier：工程 remediation AUTO；產品／UI／UX SSOT 真取捨需 exact decision；unknown fail closed |

### PostToolUse(Edit / Write / MultiEdit)

| Hook | 做什麼 |
|------|--------|
| `block_prototype_imports.py` | 產品 code 禁止 import `explorations/` |
| `post_edit_dispatcher.sh` | **Dispatcher**(2026-05-13 prune):一次 orchestrate 8 個 lib helper(token_hygiene / hardcoded_strings / code_quality / layout_space / person_data / overlay_handcraft / cva_default_sync / story_compile_drift)— hook count 32 → 24 |
| `check_story_invariants.sh` | (同上,PostToolUse 路徑做 disk read drift check) |
| `check_pixel_quantified_audit.sh` | M32 audit script 必 pixel-quantified verify(scans audit scripts for `getAttribute(` without `getBoundingClientRect(`) |
| `check_field_controls_contracts.sh` | Field controls contract 強制(c)/(e)/(f) 等 |
| `log_governance_fires.sh` | 治理檔 fire log 寫入 `$GOVERNANCE_STATE_DIR/hook-fires.jsonl`(L2 anti-bloat) |

### PostToolUse(Skill)

| Hook | 做什麼 |
|------|--------|
| `log_skill_invokes.sh` | skill invoke log(本 hook 僅捕 Skill tool 呼叫,slash-command 走 user prompt 不被捕 — known limitation) |

### Stop

| Hook | 做什麼 |
|------|--------|
| `stop_passive_logging.sh` | **Dispatcher**(2026-05-13 prune):一次跑 5 rule(tsc sanity / harvest corrections / capture metrics / governance drift / infra best-practice score)— stop hook count 3 → 2 |
| `stop_self_audit.sh` | turn 行為 audit(claim 沒 verify / prune trigger / topic 重複 ≥ 3 次 → BLOCKER inject,M20 100+ failure mode 升級 2026-05-13) |
| `stop_meta_self_audit.sh` | turn infra-score audit(8 維 score 跌 ≥ 5 / 任何 dim < 80 → silent log,不 inject — 詳 known issue 段) |
| `stop_harvest_corrections.sh` | 掃 session 的 user 糾正信號寫 `$GOVERNANCE_STATE_DIR/user-corrections.jsonl` |
| `stop_capture_metrics.sh` | session 結束 metric snapshot |

### SessionStart

| Hook | 做什麼 |
|------|--------|
| `session_start_governance_check.sh` | 4 check(行數 / prune / corrections / benchmarks 過期 auto-fetch) |

### UserPromptSubmit

| Hook | 做什麼 |
|------|--------|
| `inject_pending_self_audit.sh` | 讀 stop_self_audit / stop_meta_self_audit silent log,dedup + 24h filter + 3KB cap,inject 到 next turn additionalContext。修補 Stop hook silent-log 不 inject 的 known issue。 |
| `check_propose_without_benchmark.sh` | DS-author 提案型 prompt 若缺可驗證 benchmark 證據則注入 M26 提醒；一般 prompt 不阻擋。 |

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
| `tests/registration-output-contracts.mjs` | registration output contract 的固定測試程式 |

Node helper 必須是本 canonical tree 內可盤點、可雜湊的 committed `.mjs`，shell 只能用 `node -- <exact-static-path> ...` 傳資料。禁止 `node -e`、`node -p`、`--eval`、`--print`、stdin / heredoc JavaScript；provider view 一律由 canonical source 生成。

## Anti-bloat 落地

- **L1 Pre-write**:`check_file_size_budget.sh` + `check_story_invariants.sh`(內含 principles canonical + l3 primitive 等 5 個合一)等(PreToolUse 阻擋 / 警告)
- **L2 Per-edit**(PostToolUse Write|Edit|MultiEdit,script 內自過濾 governance file):`log_governance_fires.sh` → `$GOVERNANCE_STATE_DIR/hook-fires.jsonl`(governance file 編輯軌跡)+ `log_skill_invokes.sh`
- **L3 Periodic**:`/knowledge-prune` skill 季度跑；量化 retire rate，但只 retire 有證據的噪音，禁止為湊比例硬刪

Runtime telemetry 必須由 trusted adapter 明示設定 `GOVERNANCE_TELEMETRY_OPT_IN=1`。`$GOVERNANCE_STATE_DIR` 只能在 Git-owned `<git-dir>/governance-runtime/` 內；未指定時使用該 Git-owned default，read-only / 未 opt-in 時不寫任何 runtime bytes。Generated provider homes 不是 telemetry authority。

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

**症狀**:Stop hooks(`stop_self_audit` / `stop_meta_self_audit`)silent-log 但不 inject,M14 / M20 的「auto-inject corrective prompt」 不生效 → AI reactive 模式持續。

**修法**:加 `inject_pending_self_audit.sh` 註冊在 UserPromptSubmit hook(該 event 確認支援 `hookSpecificOutput.additionalContext`)。鏈路:

```
turn 結束 Stop event → stop_self_audit / stop_meta_self_audit silent log to $GOVERNANCE_STATE_DIR/
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
