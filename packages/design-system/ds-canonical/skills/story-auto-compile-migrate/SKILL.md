---
name: story-auto-compile-migrate
description: Batch-migrate design system components to Story Auto-Compile Phase 1+2 structure (tsx `componentMeta` export + spec.md YAML frontmatter). Mechanical steps auto (parse cva → generate componentMeta / infer sizes from cva / extract 禁止事項 from spec). Judgment fills use existing canonical evidence plus the highest certified capability; independent review is added only when the task or deliverable explicitly requires it, and only a genuine product/UI/UX SSOT tradeoff stops. Invoke via /story-auto-compile-migrate when user says「migrate 元件到 auto-compile / phase 4 migration / 把 X 元件加 componentMeta」OR auto-chained by /design-system-audit Dim 23 when un-migrated components found.
---

# Story Auto-Compile Migrate — 批次將元件移到 Phase 1+2 結構

**目的**:把全部元件從 hand-written stories 遷到 auto-compile-able 結構(tsx `componentMeta` export + spec YAML frontmatter)。分「mechanical auto」+「evidence-bound judgment」兩層。元件總數由 Phase 0 inventory 動態計，禁止 hardcode。

**不含**:不改元件實作(cva / tsx logic 不動);不寫入 stories files。`compile-stories.mjs` 只在 stdout 編譯 canonical rows並驗 drift；本 skill 只加 metadata。

## When to run

- User 明言「migrate X 元件 / 批次 migrate / phase 4 migration」
- `/design-system-audit --deep` Dim 23 發現未 migrated 元件後自動 chain
- 新建元件 via `/new-component` 時 Phase X 自動跑(未來延伸)

## Non-goals

- 不改 cva variants / defaults(變體結構不動)
- 不動 stories.tsx 實作
- Phase 1 不憑空填 judgment 欄位(world-class / when)；Phase 2 必以 owning spec、primary-source benchmark補齊，不留 TODO；task／deliverable 明確要求時才加 independent review

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

### Phase 1.5 — Batch evidence receipt

記錄並回報:
```
Phase 1 完成:
- ✅ {N} 元件 mechanical migrated(componentMeta + frontmatter placeholders in,compile --check passed)
- ⚠️ {M} 元件 needs manual cva mapping(列出 + 原因)
- TODO: {N+M} 元件 frontmatter 的 variants[].when / world-class[] / sizes[].when / related[] 是 judgment 欄位,Phase 2 填

Authority:ENGINEERING-AUTO；直接進 Phase 2。只有填值會創造新的產品／UI／UX SSOT 語意且仍有真取捨才列 human-only decision。
```

### Phase 2 — Judgment fill(AUTO, evidence-bound)

對每個 migrated 元件:
- `variants[].when` — 從 spec 現有「variants」section 或近親元件同名 variant 抄
- `variants[].world-class` — 讀 benchmarks/ 外部 snapshot,或 inline grep 既有 spec 對照
- `sizes[].when` — 從 spec size table 抄
- `related.近親` — grep SSOT reciprocal pointers

每元件過 owning-spec、benchmark、cross-field consistency 與 compile check；工程 mapping 自主收斂。若現有 SSOT 無法回答且選擇會改產品／UI／UX語意，集中成一次 human-only decision，不逐元件詢問。

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

## Authority gates(禁止跳 evidence，不設 blanket sign-off)

### Gate 1 — Phase 1 batch evidence

確認 keys、source citations、input digest 與 rollback；receipt 不停止 execution。

### Gate 2 — Phase 2 judgment(per element × per field)

禁止無證據套預設。每批後 agent review 5-10 element 產出；全部元件仍須 complete-bytes／protocol coverage，不取樣判全域完成。

### Gate 3 — 特殊 cva 遇到 mechanical 無法 map

Agent 依 public contract、owning spec、consumer evidence與 rollback 自行選出唯一工程方案；若方案會改 public component 的產品／UI／UX語意且存在真取捨才 STOP，否則不可把(a)修 cva／(b)metadata 特例／(c)skip 的工程選擇丟給 user。

---

## 與 /design-system-audit 分工

| Flow | 誰做 |
|------|------|
| 偵測未 migrated | `/design-system-audit --deep` Dim 23 |
| 批次 mechanical migrate | **本 skill Phase 1** |
| Judgment fill | 本 skill Phase 2(CP 2) |
| Drift detection(已 migrated)| hook `post_edit_dispatcher.sh` → `lib/_story_compile_drift.sh`(原 check_story_compile_drift.sh folded)+ Dim 23 |

**Chain**:user 說「ds 完整 audit」→ `/design-system-audit --deep` Phase 1 跑 Dim 23 → 發現 N 未 migrated → 自動 chain 本 skill → mechanical migrate + evidence-bound judgment → 全 migrated + 0 drift；中途 report 只是 receipt。

## References

- `governance/planning/story-auto-compile.md` — historical 4-phase plan + current non-executable status
- `scripts/compile-stories.mjs` — compile + verify
- `packages/design-system/ds-canonical/skills/story-writing/references/anatomy-standard.md` — 6-story canonical
- `packages/design-system/ds-canonical/skills/new-component/SKILL.md` — 新建元件流程(本 skill 為已建元件 migration)
