---
name: story-auto-compile-migrate
description: Batch-migrate design system components to Story Auto-Compile Phase 1+2 structure (tsx `componentMeta` export + spec.md YAML frontmatter). Mechanical steps auto (parse cva → generate componentMeta / infer sizes from cva / extract 禁止事項 from spec). Judgment fills (world-class 對照 / when descriptions) go to checkpoint for user/AI sign-off. Invoke via /story-auto-compile-migrate when user says「migrate 元件到 auto-compile / phase 4 migration / 把 X 元件加 componentMeta」OR auto-chained by /design-system-audit Dim 23 when un-migrated components found.
---

# Story Auto-Compile Migrate — 批次將元件移到 Phase 1+2 結構

**目的**:把全部元件從 hand-written stories 遷到 auto-compile-able 結構(tsx `componentMeta` export + spec YAML frontmatter)。分「mechanical auto」+「judgment checkpoint」兩層。元件總數 Phase 0 動態計(`ls -d packages/design-system/src/components/*/ | wc -l`,當前 62),禁 hardcode。

**不含**:不改元件實作(cva / tsx logic 不動);不產 stories(compile-stories 負責)。只加 metadata。

## When to run

- User 明言「migrate X 元件 / 批次 migrate / phase 4 migration」
- `/design-system-audit --deep` Dim 23 發現未 migrated 元件 + user 在 Checkpoint 1 sign-off
- 新建元件 via `/new-component` 時 Phase X 自動跑(未來延伸)

## Non-goals

- 不改 cva variants / defaults(變體結構不動)
- 不動 stories.tsx 實作
- 不填 judgment 欄位(world-class / when)— 只擺 TODO placeholder,跑 Phase 2 checkpoint

---

## Workflow(4 phases)

### Phase 0 — Scan 未 migrated 元件

```bash
node scripts/compile-stories.mjs --all 2>&1 | grep "Skipped"
```

得清單(default 模式 `Skipped(N):` 行):每元件 `{Name}(reason: no componentMeta export | no frontmatter)`。(`--check` 模式只印 drift / skipped 總數,不含 per-component reason。)

Output:待 migration 元件清單 + 每元件缺哪層(tsx only / spec only / 兩層都缺)。

### Phase 1 — Mechanical migration(AUTO,per component)

對每元件:

#### 1a. tsx: 加 `componentMeta` export

從 tsx cva 讀:
- `variants` keys → `componentMeta.variants = { [key]: {} }`(purpose 空)
- `size` variants keys → `componentMeta.sizes = { [key]: {} }`(fieldHeight/icon/typography 空,待 Phase 2 填)
- `defaultVariants` → `defaultVariant` / `defaultSize`
- `states` 預設 `['default', 'hover', 'active', 'focus-visible', 'disabled']`(元件無互動則改)
- `tokens` — grep tsx 的 `--*` token usage 自動列,或留 `{ bg: [], fg: [], ring: [] }` 待 Phase 2 填
- `family` — 讀 spec 第一段 Layout Family 宣告

插入位置:tsx 檔案 `export { Component, ... }` 之前。

#### 1b. spec.md: 加 YAML frontmatter

插到 spec.md 頂部(H1 之前):
```yaml
---
component: {Name}
family: {N from spec Layout Family declaration}
variants:
  {key}:
    when: "TODO: Phase 2 填"
    world-class: []  # TODO: Phase 2 填 ≥ 3 家對照
  # ... (mirror tsx.componentMeta.variants keys)
sizes:
  {key}: { when: "TODO: Phase 2 填" }
禁止事項:  # 從 spec 「禁止事項」section 自動 extract,若有
  - rule: "..."
    reason: "..."
    反例: "..."
related:
  近親: []  # TODO: Phase 2 填
  SSOT-anchor: "{name}.spec.md"
---
```

#### 1c. 每元件 migrate 完跑 `compile-stories {Name} --check`

- 若 keys 對齊 → ✅ 通過
- 若不齊 → 檢查 cva 是否有特殊 variant(danger / secondary / ghost 等 mapping 邏輯)需手動對應

Phase 1 output:N 元件成功 mechanical migrated / M 元件遇特殊 cva 邏輯需 Phase 2 手動 mapping。

### ⚠️ Checkpoint 1 — 批量 sign-off

Present user:
```
Phase 1 完成:
- ✅ {N} 元件 mechanical migrated(componentMeta + frontmatter placeholders in,compile --check passed)
- ⚠️ {M} 元件 needs manual cva mapping(列出 + 原因)
- TODO: {N+M} 元件 frontmatter 的 variants[].when / world-class[] / sizes[].when / related[] 是 judgment 欄位,Phase 2 填

Proceed Phase 2 judgment fill?(scope big)
OR commit Phase 1 先(mechanical only)讓後續 session 漸進 fill?
```

### Phase 2 — Judgment fill(STOP per component)

對每個 migrated 元件:
- `variants[].when` — 從 spec 現有「variants」section 或近親元件同名 variant 抄
- `variants[].world-class` — 讀 benchmarks/ 外部 snapshot,或 inline grep 既有 spec 對照
- `sizes[].when` — 從 spec size table 抄
- `related.近親` — grep SSOT reciprocal pointers

每元件過 Checkpoint(user 可快速看 frontmatter diff,approve 或 reject 單題)。

### Phase 3 — Verify + commit

```bash
node scripts/compile-stories.mjs --all --check
```

必 0 drift。跑 tsc -b 確認 tsx export 無 break。

Commit 每批 5-10 元件一個(不一次全推,好 review)。

### Phase 4 — Self-improvement capture

```markdown
## Self-improvement capture
- 新發現 cva patterns: {特殊邏輯整理到 planning/story-auto-compile.md 供未來參考}
- Mechanical migration 失敗 case: {列出 + 手動 workaround 紀錄}
- Migration 覆蓋率:{N migrated / total}(total = Phase 0 動態計 `ls -d packages/design-system/src/components/*/ | wc -l`)
```

---

## Checkpoints(禁止跳)

### ⚠️ Checkpoint 1 — Phase 1 batch sign-off

### ⚠️ Checkpoint 2 — Phase 2 judgment 單題 sign-off(per element × per field)

可 user 批准「全預設套 AI 推斷」模式加速,但每批後 stop 檢查 5-10 element 產出。

### ⚠️ Checkpoint 3 — 特殊 cva 遇到 mechanical 無法 map

STOP 提議 user:(a) 修 cva 對齊標準形;(b) componentMeta 特殊寫法;(c) 跳過該元件到下一個。

---

## 與 /design-system-audit 分工

| Flow | 誰做 |
|------|------|
| 偵測未 migrated | `/design-system-audit --deep` Dim 23 |
| 批次 mechanical migrate | **本 skill Phase 1** |
| Judgment fill | 本 skill Phase 2(CP 2) |
| Drift detection(已 migrated)| hook `post_edit_dispatcher.sh` → `lib/_story_compile_drift.sh`(原 check_story_compile_drift.sh folded)+ Dim 23 |

**Chain**:user 說「ds 完整 audit」→ `/design-system-audit --deep` Phase 1 跑 Dim 23 → 發現 N 未 migrated → CP 1 提報 user → user sign-off → Phase 3 auto-chain 本 skill → mechanical migrate + judgment CP → 全 migrated + 0 drift。

## References

- `.claude/planning/story-auto-compile.md` — 完整 4-phase plan
- `scripts/compile-stories.mjs` — compile + verify
- `.claude/skills/story-writing/references/anatomy-standard.md` — 6-story canonical
- `.claude/skills/new-component/SKILL.md` — 新建元件流程(本 skill 為已建元件 migration)
