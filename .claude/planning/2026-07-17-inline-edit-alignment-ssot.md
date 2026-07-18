# InlineEdit 對齊 SSOT 方案(2026-07-17)

## 問題(user 抓,live preview 圖一/圖二/圖三)

InlineEdit display 狀態內容**沒跟 label 左緣對齊**——圖一(標題)/圖二(描述)歪、圖三部分對;tag 欄尤其歪。user 判斷「根本沒有 SSOT,才會有些對有些壞」。

## Root invariant(M12,真正的根)

InlineEdit 對 view 盒與 edit 盒套**同一個固定 `-mx`(-field-px,`inline-edit.tsx:193-196`)**。故:
- **零跳** ⟺ view px == edit px
- **對齊 label** ⟺ `-mx == -viewPx == -editPx`

單一固定 -mx 成立的**唯一充要條件 = 所有委派控件 view+edit 左 px 恆 = field-px(12px)**。這是 spec Model A(field-controls.spec.md:71/75)**宣稱但 code 未兌現**的契約,= user「px 一律統一 field-px」模型。

## 徹查結果(workflow wbdb6fm2y,10 agents,per-control)

**偏移源(view px ≠ field-px → 固定 -mx 下 protrude / 跳)**:
- Type A 裸-span 預設 view(px=0):Select plain/tag、Combobox plain/tag/多選、DatePicker/Range、TimePicker、PeoplePicker person/multi/empty、LinkInput plain → 全 protrude -12px + view↔edit 跳
- Type B tagPadding(≈6px≠field-px):Select/Combobox tag D-path → protrude ≈-6~8px
- Type C pill edit 缺 field-px:PeoplePicker pill D-path → view(12)≠edit(4-6)跳 6-8px
- **非偏移源(已對)**:Input plain/startIcon、Textarea default、NumberInput 全變體、各控件 showDisplayEndIcon D-path、LinkInput D-path — view px==edit px==field-px
- 疊加第二 bug:`fieldCtx &&` gate(`inline-edit.tsx:194`)→ standalone 連 -mx 都沒有(純值路徑也歪,圖一/圖二)

## 方案:unify-field-px(擴充既有 FieldSurface,非新造)

1. **`field-context.ts:21` FieldSurface union 加 `'inline-edit'`**(平行 table-cell,沿用 useFieldSurface/FieldSurfaceProvider);加 helper `useFieldUnifiedPx()`
2. **`inline-edit.tsx`**:view 委派盒(:246)+ edit 盒(:237)各包 `<FieldSurfaceProvider surface='inline-edit'>`;`-mx` 對齊盒不動;純值/標題路徑(fieldViewGeometry :252)已 field-px 不受影響。**移除 `fieldCtx &&` gate**(:194)→ standalone 預設 vertical 也得 -mx
3. **各委派控件兩 gate**(只加條件、不動 DataTable/standalone):
   - Fix-1 裸 span→wrapped:Select:392/394、Combobox:516/357-360、DatePicker:486-487/944、TimePicker:268-269、PeoplePicker:225-227、LinkInput:162-163,`surface==='inline-edit'` → 走 fieldWrapperStyles view×default(field-px);否則維持裸 span flush
   - Fix-2 tagPadding→field-px:Select(:400/461/545/774)、Combobox(:523/540/631/767)、PeoplePicker pill(:335 補 inject 對齊 stack :428)加 `surface!=='inline-edit' &&` → InlineEdit 內 fall through field-px(view+edit 皆是,同修 Type C)
   - Input/Textarea/NumberInput 不改(已 field-px)
4. **零跳保證**:inline-edit surface 內全控件 view px==edit px==field-px=12 → 固定 -mx=-12 → 值落 label x=0、零跳(1px 對稱 border 容差內)
5. **非-InlineEdit 逐字元不變**:override 只 `surface==='inline-edit'` 生效;DataTable cell(table-cell)/ 純表單 tagPadding+裸 span 不變(硬約束)
6. **機械鎖(M32 pixel)**:新增 `scripts/inline-edit-delegated-px-invariant.mjs`(Playwright 量各委派控件 InlineEdit story view/edit `getBoundingClientRect().left` == 相等 == label 左緣)→ preflight fail-closed
7. **spec 同步 7 段**:field-controls.spec.md:71/75/275/334/394/396 + inline-edit.spec.md:60/62/65 + people-picker.spec.md pill

## nuance 拍板結果(2026-07-17 user GO)

**user 決定:edit 態完全繼承原 field(Jira 式,不改任何)**。→ 方案簡化:
- **只有 display 統一 field-px**(Fix-1 裸span→wrapped);**edit 完全不動**(真 field,tag 保留 tagPadding)
- **移除 Fix-2**(不 override edit tagPadding)= 更少改動
- 結果:純文字欄 view↔edit 零跳;tag 點擊 ~6px 微移(= Jira 式,user 接受)
- edit box 保留 alignBleed(-mx)但**不套 surface='inline-edit'**;display box 套 surface='inline-edit'

## 問題 2(同 turn user 新報):blur 後 chrome 殘留

**現象**(截圖 1f69ba96,VerticalFieldForm Status 欄):點 Status(Select `defaultOpen`)後不選、blur → Select edit chrome 殘留,回不到 display。

**root cause**(`inline-edit.tsx:198-240`):預設 edit(Input/Textarea)有 `onBlur={()=>commit(false)}`;**自訂 renderEdit(Select)沒有** —— story 只接 `onChange→commit`(選中才結算),沒接「不選 blur/dismiss」exit → `commit()` 從沒呼叫 → 卡 `editing=true`。exit 不該靠 consumer 接,該 InlineEdit 保證。

**SSOT 修**:InlineEdit edit wrapper(:237)加 **portal-aware focusout**:blur 後 microtask 檢查 `document.activeElement` 是否在 edit 子樹內 OR 該 edit 的 popover(`[data-radix-popper-content-wrapper]`)內;都不在 → `commit(false)`。單一 exit SSOT(移除各控件自接 onBlur),所有委派控件(含 overlay)blur 保證回 display,popover 開著時 focus 在 portal 內不誤結算。

## 合併完整方案

| 項 | 內容 |
|---|---|
| A 對齊 | display 統一 field-px(Fix-1 裸span→wrapped,surface='inline-edit',display box only)+ 移除 `fieldCtx &&` gate;edit 完全不動(繼承原 field)|
| B blur exit | InlineEdit wrapper portal-aware focusout,保證所有控件 blur 回 display;移除各控件 onBlur(單一 SSOT)|
| C 全盤驗 | audit 全 overlay 控件(Select/DatePicker/Combobox/PeoplePicker/TimePicker)所有 exit 路徑(blur/Esc/點外/選中)無殘留 |
| D 機械鎖 | `inline-edit-delegated-px-invariant.mjs`(對齊 pixel)+ `inline-edit-exit-invariant.mjs`(blur/Esc/outside 後 data-editing 消失)接 preflight fail-closed |
| E spec | field-controls.spec.md + inline-edit.spec.md 明文化:display=field-px / edit=原 field / exit 由 InlineEdit 保證 |

## 世界級佐證

Atlassian inline-edit = 固定負邊距 + readView==editView(by construction),無 tagPadding、非變動邊距 = 等同 unify-field-px。否決 variable-mx(靜態無法知控件 px + 仍需修裸 span + tag 值內縮無法對齊)。

## 驗證計畫

tsc -b + build:lib(FieldSurface union 型別 surface)+ Playwright pixel(圖一/圖二/圖三/tag view↔edit 零位移 + 對齊 label)+ 新 invariant script。

## 狀態

- [x] Root cause 徹查(workflow wbdb6fm2y)
- [x] user GO + nuance 拍板
- [x] 實作(FieldSurface + InlineEdit + 6 控件 + spec + invariant)— commit 911749b7 + 5c8f52cc + 01b60c5a(皆 on main)
- [x] 驗證 — pixel 對齊 + blur exit invariant wire preflight(release-preflight.mjs inline-edit-view-geometry-invariant.mjs + probe-inline-edit-align.mjs);隨 beta.86 發版

> ✅ 2026-07-18 reconcile:本 plan 已全數落地上主線,checkbox 補回填(功能無缺,原為 doc-hygiene stale)。
