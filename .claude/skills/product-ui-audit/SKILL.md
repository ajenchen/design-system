---
name: product-ui-audit
description: Audit product / consumer UI code (非 design-system 本身) against DS usage discipline + mindset adherence. Catches element misuse / design principle violations / token leakage / geometry bugs / a11y gaps across 7 dimensions. Invoke via /product-ui-audit when user says「audit 這個 UI」「檢查 X feature 用對 DS 嗎」「這段 code 符合設計原則嗎」,or auto-invoked by /prototype Phase 3.5 gate.
---

# Product UI Audit Workflow

Purpose: design-system-audit audits the **DS itself**(spec / cva / SSOT 三方漂移);product-ui-audit audits **consumer UI code**(不是 DS 本身,是 app / exploration / feature code — 即「consumer 用 DS 的地方」)。防止:

- 元件亂用(wrong variant / missing props / incorrect composition)
- 設計原則亂用(placeholder 文案 / 憑直覺創造 pattern / Mindset 違反)
- Token 逃逸(硬寫 hex / shadcn alias 回流 / shadow-sm 繞過 elevation)
- 幾何 bug(flex gap token 被 overflow 吃、slot box 不一致)
- A11y 缺口

## When to run

**明確觸發(直接 invoke)**:
- User 說「audit 這個 UI」「audit X feature」「檢查 /src/app/xxx」
- User 說「這段 code 符合設計原則嗎」「DS 用對了嗎」「有元件亂用嗎」
- `/prototype` Phase 3.5 自動 invoke(audit `src/explorations/{topic-slug}/`)
- PR review 前自我檢查

**不觸發**:
- 要 audit DS 本身 → 走 `/design-system-audit`(不同 scope)
- 要 audit token 定義 → 走 `design-system-audit`
- 只要求補 stories → 直接補,不需 audit

## 生態位

```
  /design-system-audit   audit DS 本身(設計系統內部)
  /product-ui-audit      audit consumer UI code(本 skill)
  /prototype             呼叫本 skill 作 Phase 3.5 gate
  /delivery-handoff      只在產品交付前執行(產 handoff 文件)
```

## Preconditions

- User 指定 audit target(file path / folder / feature area)
- Target 是 consumer 層 UI code(`src/app/**` / `src/explorations/**` / `src/pages/**` / `src/features/**` / `apps/**`(含 DS repo 自家 `apps/template` + create-app 產物)等 — **不掃 `packages/design-system/src/`**)
- CLAUDE.md 全讀(7 維 audit 都依此為基準)

---

## 7-Dimension Audit

每個 dimension 獨立檢查,產出 findings。詳細 grep pattern + rule 見 `references/audit-checks.md`。

### Dim 1 — Token 紀律(token hygiene)

- 硬寫 hex / rgb / rgba / hsl 色值
- shadcn compat alias(bg-popover / text-muted-foreground / bg-accent / bg-destructive / bg-background / bg-card / border-input / text-primary-foreground / text-accent-foreground / text-card-foreground / text-popover-foreground)**(完整 deny-list SSOT:`packages/design-system/src/tokens/utility-registry.json`;此處 inline 為 grep 便利,新增 alias 改 registry)**
- Tailwind default shadow(shadow-sm / md / lg / xl / 2xl / inner)— 應走 elevation token
- Tailwind v4 `[--foo]` shorthand 靜默失效
- 硬寫 px 值當該用 token(`w-[48px]` 應改 token)

此維對齊既有 token 防線(`lib/_token_hygiene.sh` 5-check:shadcn alias / v4 shorthand / hardcoded shadow / primitive-color-as-utility / native overflow，由 `post_edit_dispatcher.sh` source；+ `check_opacity_token_usage.sh` 對齊 utility-registry.json 類別 — pattern hardcode 於 hook,registry 僅存在性 fallback gate)+ 擴充硬色值 / 硬 px 檢查。

### Dim 2 — Layout primitive 消費(per CLAUDE.md 清單)

掃是否正確消費既有 layout primitives(非自 roll):

| 視覺 pattern | 應消費 | 違規 signal |
|------|---------|---------|
| icon+title+desc 垂直居中 | `<Empty>` | 自己寫 flex flex-col items-center 3-layer text |
| row prefix+content+suffix | `item-layout` | 自己寫 flex items-center gap-2 3-slot |
| overlay Header/Body/Footer | `overlay-surface` | 自己寫 border-b/border-t padding loose/tight |
| 橫向按鈕列 | `action-bar` pattern | 自己 flex gap-2 按鈕組 |
| 水平溢出 + fade mask | `horizontal-overflow` | 自己 overflow-x-auto + mask |
| 跨 OS 一致捲軸 | `ScrollArea` | native `overflow-(auto\|scroll)` |
| 圖像 / media 容器 | `AspectRatio` | 硬寫 `aspect-video` / `aspect-square` class |
| Field wrapper | `Field` + `fieldWrapperStyles` | 自己 border + padding + startIcon + endAction |

### Dim 3 — 元件使用正確性

- Button / Input / Select 等 variant / size / props 組合合理
  - icon-only 有 `aria-label`
  - Button primary 沒堆疊(一個 row 一個 primary)
  - Input 外有 Field wrapper(非 standalone input)
- Composition 正確
  - Popover 不放互動破壞(Dialog trigger in Popover content 避免)
  - Accordion / Tabs / Carousel 不巢狀
- Radix API 用對
  - Dialog 有 DialogTitle / DialogDescription for a11y
  - DropdownMenu 不當 Select 用

### Dim 4 — Mindset adherence

對齊 CLAUDE.md 5 條 mindset:

- **M1 對標世界級**:新 pattern 有對標備註? 或找得到對應既有元件?
- **M2 不憑直覺發明**:新數值(gap / padding / font-size)前有 grep 既有?
- **M3 改一處看三處**:若改 DS 的 cva defaultVariants,spec / docblock / anatomy 三方同步?
- **M4 真實業務場景**:stories / examples 用真實場景 (Jira / Stripe / Notion...)?無 `Option A/B/C` / `按鈕一` / `Rule A`?
- **M5 猶豫就問**:code 裡有 TODO-未確認留白?

### Dim 5 — 視覺幾何(Mindset #1 視覺擴充 + .claude/references/ui-dev-rules.md「同 flex 列互動 slot 幾何鐵律」)

- 同 flex 行的互動 slot box 尺寸一致(例:FileItem status / delete 都 h-field-sm)
- hover-bg / ring / focus outline 不溢出 box 吃 gap token
- padding 對稱正確
- Typography tier 正確(text-body / text-caption / etc.,不自造 `text-[13px]`)

### Dim 6 — A11y

- icon-only 元件有 `aria-label`
- interactive element `role` 正確
- Dialog / Popover / Sheet 有 title + description
- keyboard navigation 可用(Tab / Enter / Esc)
- color contrast(不用純 color 傳 state — 要 icon / label 配合)

詳見 `references/audit-checks.md`。

### Dim 7 — D6 設計原則自檢(consumer 是否牴觸 DS canonical)

chain `.claude/skills/design-system-audit/references/principle-audit-protocol.md` 做 4 子維 scoped 對 consumer code:

- **D6a 合理性**:consumer 自己的設計判斷是否有 rationale(為什麼這樣用 DS 元件)
- **D6b 一致性**:跨 feature 同概念處理一致(同 team 兩頁面 dismiss 不應用不同方式)
- **D6c 無矛盾**:consumer 實作是否牴觸 DS spec 聲明(例:用 Button 作 dismiss 明顯違 item-anatomy SSOT)
- **D6d 完整性**:state 覆蓋(error / loading / empty)

判斷 auto vs STOP 依 protocol 公式。修 consumer code 一致化 = AUTO;建議修 DS canonical 本身 = STOP 提議。

---

## Workflow

### Phase 0 — Scope

確認 audit target:file / folder / feature area。提問 user 若模糊。禁止掃整個 repo(失焦)。

### Phase 1 — Parallel 6-dim audit

7 個維度各自獨立 grep + code review。可 parallelize。

### Phase 2 — Report

產出 report 表格:

```
| Dim | File:Line | Finding | Severity | Fix suggestion |
|-----|-----------|---------|----------|----------------|
| 1 Token | src/app/foo.tsx:42 | 硬寫 `#3b82f6` | P0 | 改 var(--primary) |
| 2 Layout | src/app/bar.tsx:87 | 自己寫 icon+title+desc 垂直堆疊 | P1 | 改用 `<Empty>` |
| 3 Component | src/app/baz.tsx:12 | icon-only Button 無 aria-label | P0 | 加 aria-label |
| ... |
```

### ⚠️ Checkpoint 1 — Triage & fix decision

類似 design-system-audit 的 triage checkpoint:

```
🔍 Audit 結果

P0(必修,無爭議):N 項
P1(批次修 + review):M 項
P2(需討論):K 項

先修 P0?還是全給 user 看?
```

詳見 `references/report-template.md`。

### Phase 3 — Fix(optional)

若 user 同意 fix,surgical 修復。每批(Dim 1 / Dim 2 / ...)一個 commit。

### Phase 4 — Verify

- `npx tsc -b` 無錯(禁 `--noEmit` — root tsconfig `files: []` silent pass;動型別 surface 加跑 `npm run build:lib`,對齊 component-quality-gate + self-verify.md)
- re-run 本 skill(縮窄到原 findings)確認 zero regression

### Phase 5 — Visual audit(stakeholder-gate,mandatory on stakeholder-visible work)

對齊 **CLAUDE.md 稽核 canonical Tier 1 stakeholder-gate**:產品 UI 要給 stakeholder / end-user 看之前,**code + visual 雙層都要過**。Phase 1-4 是 code 層;本 Phase 補視覺層。

**Input**:Phase 4 verify 過關的產品 UI(screens / routes / embedded widgets)

**Process**:
1. 確認 user 有提供 **URL 清單**(產品 app routes)或 **Storybook scenario id**(若產品 stories 在 Storybook):
   - URL mode:`npm run visual-audit -- --urls=<csv>`(例:`--urls=http://localhost:3000/inbox,http://localhost:3000/settings`)
   - Storybook mode:`npm run visual-audit -- --scope=component:<topic>`
2. **Layer A mechanical**(auto):WCAG 對比度 + DOM 幾何 assertion + 1x screenshot(retina 需 `--retina` opt-in)→ `snapshots/`
3. **Layer B AI judgement**(chain `/visual-audit` skill):讀 `snapshots/*.png`,判斷設計合理性(視覺對齊 / 覆蓋限制 / 世界級對照 / typography hierarchy)
4. Violation 分級:
   - Contrast AA 不過 → **P0**(a11y 強制)
   - Geometry assertion fail → **P0**(機械規則違反)
   - Layer B AI 視覺判斷 finding → 按嚴重度 P0 / P1 / P2

**Gate 規則**:P0 有 → 停下修,不放給 stakeholder;P1 / P2 走跟 Phase 2 Report 同樣 user-decision 流程。

**何時可跳**:內部 UI(只給 engineer / admin 看,非 stakeholder / end-user)→ user 明示 skip,但建議跑一次 Layer A 抓 a11y P0。

**為什麼 mandatory**:code audit 對 + spec 對,視覺仍可能錯(對比不夠、overlay 疊到文字、跨 OS 捲軸跑版)——這類 bug 只有視覺層抓得到。產品給 stakeholder / user 看時 = stakeholder-visible artifact,必過 Tier 1 gate。

---

## 呼叫時的回答格式

audit 完畢報告應含:
1. **Scope**:audit 了什麼(path / file 數量)
2. **Summary**:per dimension 的 pass/fail 數
3. **Findings table**:具體 file:line + severity + fix
4. **Recommendations**:P0 優先 / 建議修順序
5. **Next step**:等 user Checkpoint 1 決策

---

## Non-goals

- 不 audit DS 本身(走 /design-system-audit)
- 不改 user 未同意的 P1/P2(僅 P0 可自動修,需 user 決策 P1+)
- 不 audit 業務邏輯正確性(本 skill 管 UI / DS consumption / design principles,不管 data flow 對不對)
- 不 replace code review(本 skill 是 pre-review self-check,不是 final QA)

## Common failure modes

- **Scope 太廣**:掃整個 repo 導致 findings 爆量,triage 崩潰 → 限制 scope 到 feature / folder
- **Dim 間互相矛盾**:Dim 2 建議用 Empty 但 Dim 3 說 Button 該在某處 — surface 而非自己選
- **P0/P1 分類偏誤**:把明確 bug 當 P1 / 把 style preference 當 P0 — 嚴格按 audit-checks.md 分類
- **AI 自行修 P2**:違反 checkpoint 精神,每個 P2 都是設計決策

## References

- [references/audit-checks.md](references/audit-checks.md) — 7 維度具體 grep pattern + rule
- [references/common-misuses.md](references/common-misuses.md) — 常見元件誤用 negative example 庫
- [references/report-template.md](references/report-template.md) — P0/P1/P2 severity 分類 + report 格式
