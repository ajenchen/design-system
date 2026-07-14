# RFC: Cell Indicator SSOT Divergence Decision

**Date**: 2026-05-08(updated round 6)
**Status**: **Round 6 codex synthesized → 10-step plan ready,等 user wave green 開始 Step 1**
**Trigger**: Phase 1-2 round 1-5 collab(2026-05-07~08)反覆踩同一 trap;Round 6 codex confirm「D = A 修正版」+ rejected my Notion/Airtable hallucination claim。

## Round 6 → Round 7 Final Decision(codex synthesized)

**選 (A) Field-as-SSOT** with **explicit boolean opt-in**(round 7 fix round 6 implicit coupling):

```tsx
<Select       variant="naked" mode="display" showDisplayEndIcon />
<DatePicker   variant="naked" mode="display" showDisplayEndIcon />
<TimePicker   variant="naked" mode="display" showDisplayEndIcon />
<Combobox     variant="naked" mode="display" showDisplayEndIcon />
<PeoplePicker variant="naked" mode="display" showDisplayEndIcon />
{/* LinkInput 不加 — URL anchor 行為例外 */}
```

**Future-proof**:`variant="naked" mode="display"` 在 table 外用(toolbar / spreadsheet / editable list)→ 不傳 `showDisplayEndIcon` = 純展示無 icon。DataTable cell-registry 顯式 opt-in。

**Owner table**:
| Concern | Owner |
|---|---|
| Whether DataTable cells show picker affordance | DataTable cell-registry(opt-in via prop) |
| Which icon a picker uses(Chevron/Calendar/Clock)| Field picker component(intrinsic) |
| DOM placement(`<ItemSuffix>` alignment)| Field picker component(in fieldWrapperStyles DOM tree, never sibling) |
| `naked` geometry + cell substrate | Field wrapper |
| Non-cell naked/display purity | Field mode contract — naked 不暗示 display affordance |

**M22 world-class cite**(round 7 verified URLs):
- MUI X Data Grid singleSelect colDef:type → editor canonical(`gridSingleSelectColDef.tsx#L42`)
- AG Grid cell data types:type-specific built-in editor / renderer
- Glide Data Grid custom cells:`draw` + `provideEditor` 同 type-local
- Ant Select `suffixIcon`:component owns suffix(non-table example)
- Polaris TextField `suffix`:component owns

**Naming rationale**(round 7 codex):
- ❌ `displayAffordance` — UX-correct but too abstract in code review
- ❌ `intrinsicSuffix` — "intrinsic" 內部 architecture 用語;`suffix` 已被 NumberInput 用為 content unit(`NumberInput suffix`)
- ❌ `endAdornment` — 世界級用為 slot 名(Material/Mantine),boolean 不該借用
- ✅ **`showDisplayEndIcon`** — explicit、scoped 到 mode="display"、leverage 既有 DS vocabulary(`TimePicker` 已有 `endIcon` prop)、avoid DataTable leakage

## 10-Step Migration Plan(codex round 6 final)

| # | Step | Verify gate |
|---|---|---|
| 1 | **Codify** new prop `showDisplayEndIcon?: boolean` on Field picker components(Select / DatePicker / TimePicker / Combobox / PeoplePicker)。Spec 補:naked 不暗示 display affordance,DataTable 顯式 opt-in。default `false`(non-cell context 純展示)| spec + types 一致 |
| 2 | **Select canary**:display branch 改 Field naked-display wrapper,`showDisplayEndIcon` true 才 render `<ItemSuffix><ChevronDown/></ItemSuffix>`(in fieldWrapperStyles DOM tree,never sibling)。cell-registry SelectCell 傳 `showDisplayEndIcon` | tsc + tests |
| 3 | **Retire `getEditIndicator` 中 select+multiSelect**(同 commit)| `getEditIndicator()` 只剩其他 colType |
| 4 | **DOM invariant**:該 cell 只能有 1 個 suffix icon | grep playwright |
| 5 | **Geometry invariant**:display text x/y vs baseline ≤ 0.5 px;edit text x/y match display | probe-cell-picker-geometry.mjs |
| 6 | **Cropped PNG diff**:Select display/edit/readonly/disabled vs `.claude/snapshots-baseline/cell-picker-offset/select-{display,edit}.png` | maxDiffPixels: 0 strict |
| 7 | **依序 migrate**:TimePicker → DatePicker → Combobox → PeoplePicker(每 picker 重複 step 2-6)| 每 picker user 拍板才下一個 |
| 8 | **LinkInput 最後**:只遷 wrapper,**不**加 picker suffix(URL anchor click vs edit affordance 是另一個行為,另立小 RFC) | LinkInput tsc + visual diff |
| 9 | **刪空 `getEditIndicator()` + DataTable 平行註解**(`data-table.tsx:1190` 反向 SSOT comment fix)| grep 0 reference |
| 10 | **Update drift specs**:(a)`field.spec.md:411` v12 L5 absolute canonical → v14 flow baseline(`!absolute -inset-px` 已 revert)(b)DataTable indicator authority 指回 Field naked-display branch | spec/code 對齊 |

## Migration Order Reasoning(codex round 6)

| Order | Why |
|---|---|
| 1 Select | 最小 picker(no popover sub-mode)|
| 2 TimePicker | 比 Date 少 range / datetime 分支 |
| 3 DatePicker | 有 single / range / showTime |
| 4 Combobox | tag stack / wrap mode |
| 5 PeoplePicker | composite Avatar+Name / single+multi |
| 6 LinkInput | URL anchor click 行為例外,**只遷 wrapper 不加 suffix** |

## Counter-proposals 全 rejected(codex round 6 Q6)

- ❌ X:Field 偵測 colType-ish hint → DataTable schema leak 進 Field
- ❌ Y:cell 完全 own padding(Field edit 也 `px-0`)→ 打破 edit token ownership
- ❌ Z:left-pad trick → round 4 symptom fix 同類

## API design 6 option round 7 評比(codex final)

| Option | Verdict | Rationale |
|---|---|---|
| 1 implicit `naked && display` coupling | ❌ Reject | 「naked display means table affordance」hidden global rule;future non-table 用例破 |
| **2 explicit boolean `showDisplayEndIcon`** | **✅ Best** | DataTable opts in;Field owns intrinsic icon;non-cell naked/display 純展示 |
| 3 React Context `DataTableCellContext` | ❌ Reject | Hidden dependency;Field 知道 DataTable context = leak |
| 4 `endAdornment` slot | ⚠ World-class idiom 但 wrong owner | DataTable 重複 per-picker icon mapping(Select=Chevron / Date=Calendar / Time=Clock 各 consumer 自管)|
| 5 new variant `cell` | ⚠ Plausible 但 over-weight | Variant proliferation(round 1-3 trap)|
| 6 caller-rendered `<ItemSuffix>` 同 fragment | ❌ Reject | DOM/layout 跟 round 4 Path A 同失敗 |

## Round 7 acceptance additions(codex final)

加進 round 6 acceptance:
1. `rg "showDisplayEndIcon" src/design-system` only hits picker props/impl + `DataTable/cell-registry.tsx`
2. `mode="display"` without `showDisplayEndIcon` snapshots remain no-icon per picker
3. `showDisplayEndIcon` renders inside same `fieldWrapperStyles` DOM tree,never sibling
4. `TimePicker endIcon={null} showDisplayEndIcon` renders no icon(respect 既有 `endIcon` null override)
5. No duplicate icon across display/edit transition
6. Spec explicitly:`naked` does not imply display affordance;DataTable opts into picker display end icon

## Round 8 真比稿 5 axis cross-decisions(2026-05-08)

User round 8 抓 round 7 不是真比稿 → 重做 Step 5 invariant。Codex round 8 出獨立 v1(`displayAffordance: 'none' | 'intrinsic'`),dimension matrix 比稿:

| Axis | Claude v1 | Codex v1 | Final | Rationale |
|---|---|---|---|---|
| A Prop name | `showDisplayEndIcon` boolean | `displayAffordance: 'none' \| 'intrinsic'` | **Claude** | Boolean 簡單;`displayAffordance` 太重(目前只 boolean 決策) |
| B DOM guard | wrapper migrate | opt-in path only changes DOM | **合成** | Claude prop + **Codex absolute guard**「未傳 prop = DOM 不變」 |
| C Retire timing | per-step retire | final batch retire | **Codex** | 中間 SSOT drift 風險,反 review 看不到 owner authority |
| D Test cases | 11 axis × 250 case | targeted invariants + checklist | **合成** | Claude 11 axis as checklist,Codex anti-Cartesian execution(不全跑笛卡爾積) |
| E Baseline frames | 180 | 65-75 | **Codex** | 180 too big as PR-1;65-75 穩定核心,Select canary 後再擴 |
| F Migration order | Select→Time→Date→Combo→People→Link | Same | **Same** | 順序合理 |

## Codex Q2 — 9 axes Claude 漏的(本 PR 必補)

加進 D test plan(per round 8):

7. **IME / composition** — Combobox/PeoplePicker search trigger,composition 中不誤 commit/cancel
8. **DPR split** — 1x + 2x baseline(Claude 只 2x → 0.5px geometry 邊際漏)
9. **Browser smoke** — Chromium primary + Firefox/WebKit smoke(focus ring / font metrics / native select)
10. **Reduced motion** — popover open / chevron rotate / hover transition,baseline disable or settle
11. **Locale/timezone freeze** — Date/Time baseline 固定 timezone+locale,否則 CI vs local 漂
12. **Browser zoom** — 100% baseline + smoke at 125%
13. **Portal clipping** — Date/Time/Combobox popup near pinned/virtual scroll 容器邊界
14. **Disabled affordance negative** — `showDisplayEndIcon` 只 display opt-in,readonly/disabled 原 intrinsic icon 行為不可被新 prop 影響
15. **Multi-value overflow** — Combobox/PeoplePicker `+N` hover tooltip / wrap=true vs false / autoRowHeight

## Round 8 acceptance(absolute guards)

加進 round 6+7 acceptance:
7. **「未傳 `showDisplayEndIcon` 的 `mode="display"` 完全不改 DOM」** — codex round 8 absolute(snapshot diff = 0 against pre-PR baseline for non-opt-in path)
8. **`getEditIndicator` final batch retire**(non-per-step):picker migration commits 期間 `getEditIndicator` 仍存在,不 per-picker 刪;最後一個 picker(LinkInput)完工後 single commit 刪 select/multiSelect/date/time/person/multiPerson cases + 同 commit fix `data-table.tsx:1190` 反向 SSOT comment + spec drift
9. **Cross-platform baseline split** — Local/macOS Chromium baseline ≠ CI/Linux Chromium baseline(Playwright 官方:screenshot 隨 OS/browser/font/headless 變,baseline 同環境產生比對)
10. **Browser smoke matrix** — Chromium full / Firefox + WebKit only key states(display idle/focus/open + multi overflow + Date range/showTime)

## Capture plan(round 8 final 65-75 frame minimal core)

| Frame group | Count | Scope |
|---|---|---|
| 5 picker × display opt-in × {sm,md,lg} × {idle, focus} | 30 | Core display affordance |
| 5 picker × display **no-icon** × md × idle | 5 | **Negative baseline**(non-opt-in DOM 不變 verify)|
| 5 picker × edit × md × {open, focus, error where applicable} | ~15 | Edit interaction snapshot |
| Layout smoke:pinned-left / pinned-right / virtual-middle / autoRowHeight | ~10 | Cross-context regression |
| Special states:Combobox `+N` overflow / People multi stack/pill / Date range / Date showTime / Time seconds | ~8 | High-risk composite |

**~68 frame minimal core**。Select canary 完成 + visual diff 綠 → 擴張更多 hover state / cross-browser frames。





## Divergence Evidence

| Source | 文字 | 隱含 owner |
|---|---|---|
| `data-table.spec.md:204` | Body cell internal(display endAction / clear / edit indicator)= **Field family endAction(自動繼承)** | **Field** |
| `inline-action.spec.md:157` | DataTable body cell internal = Inline Action(**自動繼承 Field family endAction**)。**Field display 元件已對齊** | **Field** |
| `data-table.tsx:1190`(comment)| **SSOT 在 DataTable cellEl,Field component 不渲染 indicator** | **DataTable** |
| `data-table.tsx:1074-1191` | `getEditIndicator(colType)` per-type icon mapping render at cell wrapper level | **DataTable** |
| Field components(Select/Date/Time/LinkInput etc.)`<ItemSuffix>` rendered in edit/readonly/disabled mode | per-component icon | Field 同時也 render |

→ **Spec 兩處說 Field SSOT;code 一個 comment + 實作說 DataTable SSOT。spec ≠ code。**

## 4 Candidate Owners(codex round 5 比稿後 final)

### A. Field-as-SSOT(spec 文字直讀,**recommended**)
- Field components show `<ItemSuffix>` icon CONSISTENTLY 在 4 mode(display/edit/readonly/disabled)
- DataTable cell `getEditIndicator` **REMOVED**(parallel system retire)
- Field 改 icon → cell 自動跟動 ✅ 真 SSOT
- **Cite**:MUI X column type → built-in editor;AG Grid cell data types → editor;Notion property type → affordance + editor

### B. DataTable-as-SSOT(NOT recommended)
- Field display 不 render icon,DataTable per-type indicator 為唯一
- 仍 parallel(Field readonly/edit 仍有自己 icon),不解問題
- **Codex round 5 反對**

### C. Hybrid Registry(transition path)
- Field family export `getFieldDisplayEndAction(type)` registry
- DataTable `getEditIndicator` 改讀 Field registry(不再自定 mapping)
- 程式 SSOT 真合一,但 DataTable 仍參與 Field visual decision
- **適合**:短期 transition,長期還是 A

### D. Substrate Path(A 的 engineering-grade)
- 新 primitive `FieldDisplayCell` / `CellFieldHost`(Field 家族 own)
- 提供 display + suffix + padding,DataTable 純 consume
- 解 Field form-semantics 太重塞 cell 不適合的問題
- **Codex round 5 推薦長期方向**

## Decision Required

**user 拍板 1 個 owner**:
- (A) Field-as-SSOT — direct read of spec,user round 5 directive 也指向這
- (C) Hybrid registry — 短期 stepping stone to A
- (D) Substrate path — A 的更乾淨工程化版本(更多前期 work)
- **(E) Containment-only**:不修 SSOT,只修 picker x-offset,explicitly label「indicator SSOT 仍 unresolved tech debt」

每條的 implementation 規模:
- A:Field 6 component × 1 mode(display)加 ItemSuffix + DataTable cell remove getEditIndicator
- C:Field 加 1 export registry + DataTable 改讀
- D:新 primitive 設計 + Field 6 component migrate + DataTable consume
- E:picker 6 component display branch 微改 padding 對齊 edit,加 known-debt comment

## Process(per codex round 5 + user round 5)

**Track 1 — Decision RFC(本檔)**:
- declare divergence ✅(本 doc)
- user 選 owner(等)
- 若選 A/C/D → update spec(or 補 spec rationale)
- 若選 E → update spec 註明 known limitation

**Track 2 — Implementation(等 owner 拍板才開始)**:
- 一次只動 1 picker × 1 mode,visual diff verify(cropped PNG)
- user approve → batch migrate 剩下
- 強制 acceptance gate(下方)

## Acceptance Gate(全 mandatory before merge)

per codex round 5 Q5:
1. **DOM invariant**:no duplicate suffix icons in display/edit transition
2. **Geometry invariant**:value text x/y = approved baseline or approved target(`<= 0.5 CSS px`)
3. **Visual invariant**:cropped PNG diff per picker × mode;**unexpected diff = fail**
4. **Story invariant**:affected stories pass visual baseline or user-approved baseline update
5. **Spec invariant**:`data-table.spec.md` + `inline-action.spec.md` 對齊新 owner decision
6. **Code invariant**:`rg "CellInteractionRing|nakedCellOverlay"` returns 0 production usage(已 revert,verify 不重新引入)

## Process Improvements(已 codify,本次同 commit ship)

per codex round 5 Q1 5 layers defense:
- **(a) M29 new rule** — 視覺結構 propose 前必 grep `*.spec.md` 找 anchor + 列「3-column owner table」
- **(b) Hook** `check_ds_anchor_preflight.sh` — pre-edit Field/DataTable cell 程式時 stderr 提醒 grep specific anchor(soft warn,不阻擋)
- **(c) codex-collab/SKILL.md Step 0.1** — pre-grep DS spec anchor mandatory before brief
- **(d) Audit Dim 38** — reviewer 第二查 layer:patch 的 SSOT owner 真對齊 spec
- **(e) `ssot-index.md`** — high-risk interface → owner spec mapping(本次同 commit ship)

## Why round 1-5 失敗(歸納)

| Round | 失敗點 |
|---|---|
| 1 | Codex 提到「remove or consolidate the DataTable external picker indicator」但沒 enforce,我也沒抓到 |
| 2 | 我跟 codex 合議 D path,雙方都沒 grep `data-table.spec.md:204` |
| 3 | Codex round 3 提 `nakedCellOverlay` variant + `CellInteractionRing` primitive;我承接落地 — 雙方再次違反 SSOT |
| 4 | User 抓到 v13.3 SSOT;我 revert D + 提 path A — 但 path A 顯式承認「無 icon 避雙 icon」= work-around 不是 fix |
| 5 | User 抓到 indicator SSOT 也該管;我 revert path A,進 Decision RFC |

**根因**:Step 0.1 DS anchor preflight 沒做 → owner-first 沒做 → 後面所有 implementation 都在錯 owner 上補丁。

## 給 user 的 1 個問題

**選哪條?(A) / (C) / (D) / (E)**

我推薦 **(C) Hybrid Registry** 作 transition stepping stone:
- 不大動程式(Field 加 1 export,DataTable 改讀)
- 程式 SSOT 真合一(改 Field registry → DataTable 跟動)
- 為將來 (A) 或 (D) 鋪路
- 不像 (E) 是 debt,(C) 是 progress

但若 user 想一步到位走 spec 文字直讀 → **(A)**。
若 user 接受短期 known limitation → **(E)**。

---

## 2026-07-08 拍板更新(v16 — A 案:display 態撤恆顯 indicator)

User 問「editable cell 是否要顯示指示型 icon 佔據一個位置?」→ 7 路調查(內部全盤 + 6 家 source-code 級 benchmark)後拍板 **A 案**:

- **世界級 6/6 一面倒**(product-table 域):Ant(editable-cells:idle 純文字,hover 顯 input 形 border,恆留 24px 尾端留白但不放 icon)/ MUI X(singleSelect display = 純文字 valueFormatter)/ AG Grid(無內建 indicator,官方推 cell 背景色標可編)/ Atlaskit inline-edit(v1 hover-pencil 於 2017 v2.0.0 明文移除,9 版未回歸;hover = bg tint)/ Notion / Airtable(click-to-edit,零 idle icon)。唯一恆顯派 = Google Sheets Chip/Arrow(spreadsheet 域、user 可選檔位,另 Plain text = 零 indicator 也是合法檔位);Excel = selected 才顯且浮 cell 外緣。
- **落地**:cell-registry 6 個 picker 站停傳 `showDisplayEndIcon`;url 站改 `isEditable === true`(wrapper-only,修 I1 等式);prop 保留為 opt-in 逃生門;editable affordance 統一 = hover outline(L4)+ boolean live Checkbox + url hover Pencil(功能性入口非型別 indicator)。
- **推翻**:2026-05-10「Indicator = editable affordance」+ 2026-06-26 cell 例外恆顯 — 兩次拍板均在無此輪 benchmark 下做成,user 2026-07-08 重判。
- 改A壞B 防線:只動旋鈕 3(cell-registry 傳值端);5 控件 gate expression(select.tsx:360 等)的非 naked 臂(form field readonly/disabled 行為)一字未動。
