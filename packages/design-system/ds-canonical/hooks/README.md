# .claude/hooks/ Charter

## 這裡只收:pre/post tool event 的機械化自動檢查

每個 hook 是一個 shell / python script,在 Claude Code tool event 上自動觸發:
- **PreToolUse**:tool 執行前(可 block 或 inject context)
- **PostToolUse**:tool 執行後(通常 inject 提醒 / warning)
- **Stop**:turn 結束(sanity / harvest / metric capture)
- **SessionStart**:session 開始(governance check)

**核心特徵**:**不依賴 AI 自律**,tool 層強制執行;規則可用 `grep` / 條件判斷自動驗證。

## 當前居民(2026-04-26 重整,以 `settings.json` 註冊為準)

### PreToolUse(Bash / Edit / Write / MultiEdit / mcp__github__*)

| Hook | 做什麼 |
|------|--------|
| `check_solo_workflow.sh` | M28 git ops gate(branch sprawl / PR / merge — solo work canonical) |
| `check_codex_collab_5step.sh` | M31 codex collab 5-step gate(claude+codex dual-track discipline) |
| `enforce_home_charter.sh` | classification-sensitive dir / 新檔案的 charter gate(Write only) |
| `check_file_size_budget.sh` | CLAUDE.md / spec / SKILL / memory 行數預算警告 |
| `check_story_invariants.sh` | stories 合一 invariant 檢查(anatomy / slot-split / category / principles canonical — 2026-05-10 已合併 5 個 sub-hook) |
| `check_canonical_propagation.sh` | canonical 改動(spec / token / primitive)時 consumer propagation 檢查 |
| `check_pattern_invariants.sh` | pattern 層 invariant(overlay-surface / item-anatomy / action-bar / 等) |
| `check_naming_and_abstraction.sh` | M21 prop variant test + M27 prop name conflict + naming 三 test |
| `check_benchmark_citation.sh` | M22 benchmark claim inline cite verify |
| `check_wrapper_primitive_schema_drift.sh` | M30 wrapper schema 必 extends primitive |
| `check_field_family_invariants.sh` | Field family layout / state machine 統一 |
| `check_datatable_invariants.sh` | DataTable canonical(virtualizer / column-types / autoRow / overflow) |
| `check_opacity_token_usage.sh` | opacity token 使用紀律 |
| `check_substantive_edit_approval_preflight.sh` | substantive edit 前 user 拍板 preflight |

### PostToolUse(Edit / Write / MultiEdit)

| Hook | 做什麼 |
|------|--------|
| `block_prototype_imports.py` | 產品 code 禁止 import `explorations/` |
| `post_edit_dispatcher.sh` | **Dispatcher**(2026-05-13 prune):一次 orchestrate 8 個 lib helper(token_hygiene / hardcoded_strings / code_quality / layout_space / person_data / overlay_handcraft / cva_default_sync / story_compile_drift)— hook count 32 → 24 |
| `check_story_invariants.sh` | (同上,PostToolUse 路徑做 disk read drift check) |
| `check_pixel_quantified_audit.sh` | M32 audit script 必 pixel-quantified verify(scans audit scripts for `getAttribute(` without `getBoundingClientRect(`) |
| `check_field_controls_contracts.sh` | Field controls contract 強制(c)/(e)/(f) 等 |
| `log_governance_fires.sh` | 治理檔 fire log 寫入 `.claude/logs/hook-fires.jsonl`(L2 anti-bloat) |

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
| `stop_harvest_corrections.sh` | 掃 session 的 user 糾正信號寫 `.claude/logs/user-corrections.jsonl` |
| `stop_capture_metrics.sh` | session 結束 metric snapshot |

### SessionStart

| Hook | 做什麼 |
|------|--------|
| `session_start_governance_check.sh` | 4 check(行數 / prune / corrections / benchmarks 過期 auto-fetch) |

### UserPromptSubmit

| Hook | 做什麼 |
|------|--------|
| `inject_pending_self_audit.sh` | 讀 stop_self_audit / stop_meta_self_audit silent log,dedup + 24h filter + 3KB cap,inject 到 next turn additionalContext。修補 Stop hook silent-log 不 inject 的 known issue。 |

### Helper(非註冊 hook)

| File | 用途 |
|------|------|
| `_log-fire.sh` | 各 hook source 的 fire-logging helper |

## Anti-bloat 落地

- **L1 Pre-write**:`check_file_size_budget.sh` + `check_story_invariants.sh`(內含 principles canonical + l3 primitive 等 5 個合一)等(PreToolUse 阻擋 / 警告)
- **L2 Per-edit**(PostToolUse Write|Edit|MultiEdit,script 內自過濾 governance file):`log_governance_fires.sh` → `.claude/logs/hook-fires.jsonl`(governance file 編輯軌跡)+ `log_skill_invokes.sh`
- **L3 Periodic**:`/knowledge-prune` skill 季度跑,retire ≥ 5%

## 這裡**不收**(反例)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 需要 AI 走流程才能判斷的規則 | `.claude/skills/` | hook 只能機械判斷,複雜 workflow 屬 skill |
| 每 session signal rule | `CLAUDE.md` | hook 是 tool-level,不是 session-level |
| 單一元件的 lint rule | 該元件 spec + code | hook 是跨元件系統級,單元件屬 spec |

## 新 hook 的 criteria(必須全部通過)

1. **規則可機械判斷**(grep / 條件邏輯,不需人類 judgment)
2. **觸發 event 清楚**(PreToolUse / PostToolUse / Stop / SessionStart + matcher)
3. **已有明確 tech debt 或 bug class**(不做預防性空守衛)
4. **失敗模式安全**(hook 掛掉不會 block 合法操作 / 誤殺)

## 接線到 settings.json

新 hook 必須在 `.claude/settings.json` 的 `hooks.PreToolUse` / `hooks.PostToolUse` / `hooks.Stop` / `hooks.SessionStart` 陣列註冊,並用 `$CLAUDE_PROJECT_DIR` 作為路徑前綴。範例:

```json
{
  "type": "command",
  "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/your-hook.sh\""
}
```

## Hook 退出碼約定(Claude Code 協議)

- `exit 0` — 正常,不 inject context
- `exit 2` + stderr — **blocking**,AI 看到 stderr 訊息後必須處理
- `stdout` with `{"hookSpecificOutput":{"hookEventName":"...","additionalContext":"..."}}` — non-blocking context injection

## 已修(2026-04-28):Stop hook → UserPromptSubmit inject 鏈路

**症狀**:Stop hooks(`stop_self_audit` / `stop_meta_self_audit`)silent-log 但不 inject,M14 / M20 的「auto-inject corrective prompt」 不生效 → AI reactive 模式持續。

**修法**:加 `inject_pending_self_audit.sh` 註冊在 UserPromptSubmit hook(該 event 確認支援 `hookSpecificOutput.additionalContext`)。鏈路:

```
turn 結束 Stop event → stop_self_audit / stop_meta_self_audit silent log to .claude/logs/
                                              ↓
user 下一個 prompt → UserPromptSubmit fires → inject_pending_self_audit.sh
                                              ↓
                                        讀 log (since last-inject-ts)
                                        dedup + 24h filter + 3KB cap
                                              ↓
                                        inject 給 AI next-turn context
```

**Self-test**:`bash .claude/hooks/tests/test_inject_pending_self_audit.sh`(5/5 pass)。

## Retired

`retired/` 目錄存舊 hook(不再註冊),保留 reference 不刪除。當前已 retire 的 hook 不在本 inventory 列出 — 以 `settings.json` 為 SSOT。

最近 retire(2026-04-28):
- `check_button_icon_literal.sh` — 違反 Rule-of-3(DS-wide 0 hits,只我 1 次失誤建)

## 建立前必 Read

本 README + 最接近的既有 hook 當範本 + CLAUDE.md `# 治理 canonical` 的 Hook 章節。
