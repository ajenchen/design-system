---
name: new-component
description: Create-phase workflow for building a new design-system component from scratch. Walks through 6 phases (近親 spec → Family 判定 → 7-dim spec → tsx → 3 stories → self quality-gate) with checkpoints, ensuring world-class discipline is applied *while building*, not discovered in review. Complements /component-quality-gate (review-phase gate). Invoke when user says「我要做新元件 X」「新增 X 元件」「create new X component」or is about to `mkdir packages/design-system/src/components/Xyz`.
---

# New Component 建立流程(create-phase workflow)

## 存在意義

`/component-quality-gate` 是 **review-phase** gate(元件做完後驗 45 項),但建 **create-phase** 沒 workflow guide → AI 每次從 CLAUDE.md 零散規則自己湊,容易漏規則、誤套 pattern。

本 skill 填 create-phase 空缺:6 phase 帶著 AI 一步一步建元件,對齊 CLAUDE.md 所有規則(Layout Family / Props 命名 / Spec 7 維度 / Stories 真實業務場景 / visual audit),最後自動 chain `/component-quality-gate` 做 exit check。

**跟 /component-quality-gate 互補**:create(本 skill)在元件沒寫前先指引;quality-gate 在元件寫完後驗收。兩者不重疊。

## When to invoke

- User 明說建新元件(「做一個 X」「新增 X 元件」)
- AI 即將 `mkdir packages/design-system/src/components/Xyz/`
- 建元件前的「先 plan 再建」需求

**不 invoke 的情境**:
- 改既有元件(小 variant / size prop 增加)→ 走 sync hook + `/component-quality-gate`
- prototype 比稿階段的 exploration UI → 走 `/prototype`(exploration 不進 DS)
- 重構既有元件(not from scratch)→ 走 `/component-quality-gate` review

## Preconditions

- User 已給出新元件的 **名字 + 大致用途**(否則先對話釐清,再 invoke)
- 元件 folder 不存在於 `packages/design-system/src/components/`(真的是新的)
- 已讀 CLAUDE.md(skill 會 re-ref 關鍵章節,但 session 整體已有 context 更好)

## Workflow(6 phase + 多 checkpoint)

### Phase 1 — 近親 spec 掃讀(不憑直覺發明)

對齊 CLAUDE.md mindset #2 + `# 遇不確定時的協議` Step 2 + memory `feedback_proactive_5layer_pipeline.md`「5-step pre-check」(寫 tsx 前必含 CLAUDE.md SSOT 清單 + tsx 開頭「── 消費的 SSOT ──」段)。

1. **識別 2-3 個近親元件**(同 family、同 pattern、同職責):
   - 視覺相似?(例:新 `StatusChip` → 近親 `Tag` / `Badge` / `Chip`)
   - 功能相似?(例:新 `MultiSelect` → 近親 `Select` / `Combobox`)
   - 資料形態相似?(例:新 `TimeRangePicker` → 近親 `DatePicker.Range` / `TimePicker`)
2. **完整讀近親 spec.md**,至少 2 個,抓:
   - 它的 Layout Family 宣告
   - API surface(props 命名 / 型別)
   - 禁止事項(往往透露 gotcha)
   - SSOT anchor(往哪指)
3. **查世界級對照**:Polaris / Material / Atlassian / Ant / Apple HIG 有沒對應元件?**至少 2 個** DS 的做法,記 3 行筆記(naming / API / 視覺模式)。
4. **查 baseline 狀況**:`ls packages/design-system/src/components/` 確認名字衝突;`grep` CLAUDE.md「失敗記憶索引」看有沒同類別的歷史 bug。

### Checkpoint 1 — 定位 Proposal(STOP 點)

回報 user:
- 元件名稱(按 CLAUDE.md `# 命名與語言一致性` 三重 test)
- 近親元件清單 + 跟本元件的異同一句話
- 世界級對照 2 個(Ant Design 叫 X / Material 叫 Y)
- **問 user**:「這個 positioning 對嗎?要不要改名 / 重 scope?」

**User 點頭才進 Phase 2。** 定位錯的話在此階段轉向最便宜。

### Phase 2 — Layout Family 判定

對齊 CLAUDE.md `# 4-Family Layout Model`。

**判斷流程**(照 CLAUDE.md 既有):
1. 垂直列表裡? → Family 1(menu)/ Family 2(reading)
2. 單行可點擊 pill? → Family 3(action trigger / data indicator sub-profile)
3. 單行可編輯? → Family 4(Field control,視覺對齊 Family 1)
4. 都不是? → Non-family(self-contained primitive OR composite multi-section,**必寫 rationale**)

**輸出**:
- Family 宣告一句話(「Family 4 — Field control」OR「Non-family,composite multi-section (toolbar + grid + tile)」)
- 若 non-family → 寫 3-5 行 rationale:為什麼不是 1-4
- 若 Family 1/2 → **必消費** `patterns/element-anatomy/item-anatomy` 的 `<MenuItem>` + slot components,不重寫 row 結構
- 若 Family 3 → follow Button Pill Layout canonical
- 若 Family 4 → follow field-controls.spec.md

### Phase 3 — 寫 spec.md 7 維度(先 spec 後 code,spec 是 judgment home)

對齊 `.claude/rules/spec-rules.md`。7 維度缺一不可(除非元件本質無該面向,寫「本元件無 X 狀態」):

1. **定位**(positioning + 實作基礎 + Layout Family + 世界級對照)
2. **何時用**(3-5 個情境,真實業務,不 generic)
3. **何時不用**(用表:情境 / 改用 / 原因)
4. **禁止事項**(❌ 列表,對應常見誤用)
5. **相關 / SSOT pointer**(近親元件互相 link,ownership 明確)
6. **空值呈現 / 驗證時機**(Field 家族必寫 / 非 Field 可簡答)
7. **Loading / 無障礙**(async 場景的 state / a11y 預設)

**Checkpoint 2**:spec 寫完,回報 user → 請 user 看 spec 判定 positioning 是否 lock in。改 positioning 比改 code 便宜得多。

### Phase 4 — 寫 tsx(shadcn 結構 + cva + 對齊 spec)

對齊 `.claude/rules/ui-development.md`「shadcn 元件規範」 + `.claude/references/cva-patterns.md`。

1. **結構**:`forwardRef + cva + VariantProps + cn() + { Component, componentVariants } export`
2. **cva 適用法**:className variant 用 cva;style prop variant 用 object map;結構 variant 用 conditional rendering(見 cva-patterns.md)
3. **Props 命名**:按 `.claude/rules/ui-development.md`「元件 Props 命名」:
   - 行為 → `onDismiss` / `onClose` / `onClear` / `onRemove`(語意分層,見 CLAUDE.md)
   - Slot icon → `startIcon` / `endIcon`(type `LucideIcon`)
   - Slot media → `avatar`(type `ReactNode`)
4. **Token 消費**:Padding / icon size / hover bg / shadow 全走 token(見 `.claude/rules/ui-development.md` 三層分層)
5. **禁止 shadcn compat alias**(`bg-popover` / `text-muted-foreground` 等)—— 用 direct token
6. **Field 家族元件**:default `size="md"` 對齊 field-height family(見 `tokens/uiSize/uiSize.spec.md`)
7. **cva defaultVariants 異動**:改之後必 grep 元件所有檔案同步三方(spec / docblock / anatomy story)

### Phase 5 — 寫 3 stories(真實業務場景,對齊 /story-writing skill 規格)

chain `/story-writing` skill(如果 user 沒自己啟,本 skill 自動走其規則):

**Phase 5.0 — Trait 宣告**(2026-04-26 M19 ensure-canonical pipeline):

寫 stories 前,在 spec.md frontmatter 宣告元件 traits(對齊 `category-templates.md` v2):

```yaml
---
component: {Name}
family: {1|2|3|4|self-contained}
traits:
  - hasVariants       # 若 cva 有 ≥ 2 visual variants
  - hasSizes          # 若 cva 有 ≥ 2 sizes
  - hasInteractiveStates  # 若有 hover/focus/disabled/loading
  - isOverlay         # 若是 portal-rendered overlay
  - isInputLike       # 若是 text/number field
  - isSelectionMulti  # 若是 Checkbox/Radio 多選
  - isSelectionSingle # 若是 Switch 單一 toggle
  - isMatrixHeavy     # 若 token × size 正交視覺軸(Avatar/Skeleton)
  - isStructural      # 若結構主導(DataTable/Steps/Tabs)
  - isInternal        # 若 L3 building block
---
```

**判斷法**:讀本元件 cva variants / 行為 → 對照 traits 表 → 列適用的。**scope-N/A 的 trait 在 spec.md「邊界案例 scope」段明寫 rationale**(例:「Toast `hasSizes=false`,單尺寸對齊 Sonner idiom」)。

**Phase 5.1-5.3 — 三層 stories**:

1. **`{name}.stories.tsx` 展示**:per Phase 5.0 declared traits → 對照 `category-templates.md` 衍生 required core stories(`hasVariants` → AllVariants / `hasSizes` → AllSizes / `isOverlay` → OpenSnapshot 等)。再加 1-2 真實業務 scenario(Jira / Stripe / Notion 過 earn-existence)。Hook `check_story_invariants.sh` R3 category(原 check_story_category.sh folded 折入)write-time 攔不符 trait core。
2. **`{name}.anatomy.stories.tsx` 設計規格**:5-story 標準(Overview + SizeMatrix + ColorMatrix + StateBehavior + Inspector)或合理 subset + rationale。
3. **`{name}.principles.stories.tsx` 設計原則**(對齊 Polaris/Carbon/Ant canonical,2026-04-26):universal core ≥ 2 of {`WhenToUse` / `WhenNotToUse` / `Vs{Sibling}Rule` / `ContentGuidelines`}。do / don't 情境對照,每則 Rule title + Rule note + 範例。Hook `check_principles_canonical.sh` write-time 攔不符。

**兩個 test**:
- 「人」test — 遮標題 5 秒讀者看懂情境?
- 「舉一反三」test — 讀者推得出自己產品怎麼用?

### Phase 6 — Self quality-gate(exit check)

**Mandatory**。chain `/component-quality-gate` 走 45 項 checklist + Phase 4.5 visual audit(Layer A + B)+ **Dim 27 code quality audit**(2026-04-24 新:`node scripts/code-quality-audit.mjs --scope=component:{Name} --check`,P0 violation 必 block)。對齊 CLAUDE.md 稽核 canonical Tier 1 stakeholder-gate:元件要 merge 前 code + visual + clean-code 三層過關。

**如何 chain**:
1. Invoke `/component-quality-gate` skill,以本元件為 scope
2. 45 項全綠 + visual 過關才算 create-phase 完成
3. 若 quality-gate 發現問題 → 回 Phase 3 / 4 / 5 對應階段修,再跑 quality-gate
4. 通過 → 回報 user「元件 {Name} 建立完成,已過 create + review 雙 gate」

## Non-goals

- 不自動進入 `packages/design-system/src/components/`(explorations/ 才是實驗場;prototype 階段跑 `/prototype` skill)
- 不替 user 決定 positioning(Checkpoint 1 必須 user 點頭)
- 不跳過 spec(`.claude/rules/spec-rules.md`:先 spec 後 code,spec 是 judgment home)
- 不省略 quality-gate(Phase 6 chain mandatory,merge 前必過)

## References

- `references/new-component-checklist.md` — 完整 6 phase checklist + 各項 CLAUDE.md pointer

## 相關 skill

- `/component-quality-gate` — review-phase gate,本 skill Phase 6 chain 進去(create/review 兩端互補)
- `/story-writing` — Phase 5 chain 進去寫 stories
- `/design-system-audit` — DS-wide audit(全 dim per design-system-audit SSOT,Phase 0 自建 baseline),不是 per-component
