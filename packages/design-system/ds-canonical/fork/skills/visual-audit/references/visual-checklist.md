# Visual Audit — 13 面向 checklist(怎麼量 / 合格標準 / refer 的 DS 規則)

每個面向 = SKILL.md Phase 1 的一個 TaskList 項。本檔案規範:**怎麼量、合格標準、對應哪條 DS 規則**。全部 mechanical 可驗證,不允許「看起來不順」這類主觀描述。

**通用量測原則**:
- 用 image reading 取 screenshot 像素座標(左上為原點 0,0;單位 px)
- 同一面向的 4 個量測點必須用「同一張 screenshot 的同一縮放比例」;混不同 screenshot 比例會誤判
- 容器寬度 / viewport / density / theme 必先向 user 確認(SKILL.md Preconditions 項 3)
- 合格標準若為 token → 對照「該元件 spec 宣告的 token 值」或 `tokens/*/` primitive;不是「看起來接近就算對」
- **容差規範**:px 量測允許 ±1px(螢幕截圖 sub-pixel rounding);ratio 允許 ±5%;明文標「精確」的項目(如對稱)不給容差

**記錄格式**(每項在 report 都長這樣):
- `狀態: PASS / FAIL / 無法判定`
- `實測: {量到的值}`
- `預期: {token 值或 ratio}`
- `差異: {若 FAIL,寫出 diff 和推測破壞規則}`
- `對應規則: {CLAUDE.md 章節 or spec.md 段落 or token 名}`

---

## 1. 4 邊邊距對稱

**Canonical source**: 元件自身 `spec.md` 宣告的 padding token;`tokens/layoutSpace/layoutSpace.spec.md`;`tokens/uiSize/uiSize.spec.md`

**怎麼量**:
1. 找元件最外層容器(含 border 的那層)的 4 個內邊到第一個 child 的距離
2. 分別量 top / right / bottom / left padding
3. 與 spec 宣告的 padding token 值比對(如 `layout-space-loose = 16px`)

**合格標準**:
- 4 邊全等 token 值 → PASS
- 元件 spec 明文宣告 asymmetric(例「top padding 較大為 sticky header」) → 照 spec 查
- 4 邊不等且 spec 無 rationale → FAIL

**FAIL 範例**:DatePicker 量到 top=12 / right=12 / bottom=8 / left=12,spec 未宣告 bottom asymmetric → FAIL,建議討論是對齊 12 還是補 spec rationale

**對應規則**:CLAUDE.md `# 稽核 canonical`「Consistency 類稽核必 Phase 0 全掃再判」(actual == canonical OR rationale-for-deviation;design-system-audit Dim 13 enforce)

---

## 2. 垂直對稱(to-top ↔ to-bottom)

**Canonical source**: 元件 `spec.md` 的結構描述;「外層 element 到容器頂」= 「內層末端到容器底」為共通視覺節奏,除非 spec 明文否認

**怎麼量**:
1. 找元件最上方功能 element(如 DatePicker 的 prev/next 箭頭按鈕)量其 top 邊到容器頂的距離 A
2. 找元件最下方 content element(如最後一排日期 cell)量其 bottom 邊到容器底的距離 B
3. A vs B 相等判定

**合格標準**:
- A == B(±1px) → PASS
- 元件 spec 明文有 asymmetric rationale(如「footer action bar 較高」) → 照 spec 查
- A != B 且無 rationale → FAIL

**FAIL 範例**:DatePicker 箭頭按鈕 top=12px 但最後一排日期 bottom=4px → 差異 8px 違反上下對稱

**對應規則**:該元件 spec.md + `node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「建立 UI 前必讀」 layout-space token

---

## 3. 水平 gap 實際值 == gap token 宣告值(hover bg 不可吃掉)

**Canonical source**: node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md `# 同 flex 列的互動 slot 幾何鐵律`(gap 鐵律)

**怎麼量**:
1. 量同一 flex row 相鄰兩 interactive slot 的 **box 邊** 之間距離(不是「視覺中心距離」,是右邊 slot 左緣 - 左邊 slot 右緣)
2. 比對 cva `gap-N` 或 `gap-[var(--layout-space-X)]` 的宣告值
3. **關鍵**:量 hover state 時的 gap(滑鼠移上去 hover bg 放大後),不只 default state
4. 檢查 hover bg / ring / focus outline 是否超出 slot box —— 若超出,實際 gap = 宣告 gap - overflow 量

**合格標準**:
- default + hover 兩態的 gap 都 == 宣告值(±1px) → PASS
- hover 狀態 gap 被 bg overflow 吃掉 → FAIL(違反 node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md「同 flex 列幾何鐵律」)

**FAIL 範例**:FileItem 2026-04-19 bug,Button hover-bg 24px 超出 16px box,`gap-2`(8px)實際剩 ~4px

**對應規則**:`node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md` → `# 同 flex 列的互動 slot 幾何鐵律`(必讀)

---

## 4. Overlay 定位(Badge / Popover / HoverCard / Tooltip)

**Canonical source**: 對應元件 spec(`tooltip.spec.md` / `popover.spec.md` / `hover-card.spec.md`);`patterns/overlay-surface/overlay-surface.spec.md`

**怎麼量**:
1. 定位 anchor 元件(底層觸發元件)的 box 四邊
2. 量 overlay 的位置:side-offset(overlay 離 anchor 的距離)、alignment(start / center / end)
3. 檢查:
   - **side-offset 對稱**:若 overlay 說明「距 anchor 8px」,實際量應 == 8px
   - **不覆蓋 anchor content**:overlay 不該遮住 anchor 上的可讀資訊
   - **不超出 viewport**:overlay 貼邊時仍在 viewport 內(flip 行為正確)
   - **Badge 特例**:badge 疊 anchor 時,offset 應用 token(`--ui-size-*`)非硬寫 px

**合格標準**:
- side-offset 等 spec 宣告值 → PASS
- 不覆蓋 anchor content → PASS
- 任一違反 → FAIL

**FAIL 範例**:Carousel prev/next 箭頭覆蓋 carousel item content;Badge 疊 Button 距離離譜用硬寫 px

**對應規則**:對應元件 spec;`node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「元件 Props 命名」「常用 icon canonical」(若箭頭用錯 icon);`node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「建立 UI 前必讀」 overlay-surface pattern

---

## 5. Typography baseline 對齊

**Canonical source**: `tokens/typography/typography.spec.md`;`patterns/element-anatomy/item-anatomy.spec.md`

**怎麼量**:
1. 找 icon + text 同行的 row(如 MenuItem / Button / Tag)
2. 量 icon 幾何中心的 y 座標 vs text baseline 的 y 座標
3. **重要區分**:icon 應對齊 text **中線(cap-height 中心)** 而非 baseline(baseline 是字母底緣,icon 對那會視覺偏下);但實務用 `items-center` flex 已處理 geometric center,只需檢查實際 render 是否視覺對齊

**合格標準**:
- icon 幾何中心 y == text optical center y(±1px) → PASS
- icon 明顯偏上 / 偏下 → FAIL(常見原因:用了 `items-baseline` 而非 `items-center`,或 icon box 高度與 text line-height 不匹配)

**FAIL 範例**:MenuItem icon 16px 與 body text 14px(line-height 1.5=21px),幾何中心若對 y=7 vs y=10.5,差 3.5px → 視覺偏上

**對應規則**:`tokens/typography/typography.spec.md` line-height(scanning 1.3 vs reading 1.5);`item-anatomy.spec.md` Inline Action 規格

---

## 6. Icon ↔ text gap 一致

**Canonical source**: `patterns/element-anatomy/item-anatomy.spec.md` Inline Action / slot 規格(`gap-2` = 8px 標準)

**怎麼量**:
1. 列出同一列表內所有 row(如 SidebarMenu 的 5 個 MenuItem)
2. 逐 row 量 icon right edge → text left edge 的距離
3. 5 個值應全等

**合格標準**:
- 全部相等(±1px) → PASS
- 任一 row 偏離 → FAIL(常見原因:某 row 用了不同 gap class,或某 row icon size 偏離 ICON_SIZE 常數)

**FAIL 範例**:5 個 MenuItem 有 4 個 gap=8px,1 個 gap=12px(consumer 手動加了 `gap-3`)

**對應規則**:`item-anatomy.spec.md`;`node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「新增數值前必須先查既有 pattern」

---

## 7. 容器寬度 fill

**Canonical source**: 元件 spec 宣告容器行為(block / inline / fill-container);`field-controls.spec.md` 對 field 類

**怎麼量**:
1. 量元件 outer box 寬度 vs 其 parent 容器寬度
2. 若元件是 block-level(如 FileUpload / FileItem / Empty / Field),應 100% fill parent width
3. 若元件是 inline-level(如 Tag / Chip / Button default),應 fit-content

**合格標準**:
- block-level == parent width(±1px) → PASS
- inline-level == content width → PASS
- block-level 內縮(未 fill) → FAIL

**FAIL 範例**:FileUpload 在 800px 容器內只佔 600px,兩側 100px 空白 → 違反 block-level 預設行為

**對應規則**:對應元件 spec;`components/Field/field.spec.md`(Field 類)

---

## 8. 同 row field 高度對齊

**Canonical source**: `tokens/uiSize/uiSize.spec.md` field-height family(`--field-height-sm/md/lg` = 28/36/44px)

**怎麼量**:
1. 找同一 row 並排的 field 類元件(Input / Select / DatePicker / Button 等)
2. 量每個 element box height
3. 全部相等且 == 對應 `--field-height-{size}` 值

**合格標準**:
- 全等 token 值(±1px) → PASS
- 任一偏離 → FAIL

**FAIL 範例**:Input(size=md, 36px)+ Button(size=md, 36px)+ Select(誤用 size=sm, 28px)→ Select 偏低 8px

**對應規則**:`uiSize.spec.md` field-height family;`node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「建立 UI 前必讀」 → uiSize token

---

## 9. 跨 OS 一致 scrollbar

**Canonical source**: `node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「建立 UI 前必讀」 「overflow 使用三規則」;`components/ScrollArea/`

**怎麼量**:
1. 找 screenshot 內的 scrollable area
2. 檢查 scrollbar 視覺:
   - **ScrollArea 的**:有 overlay scrollbar,不吃 content 寬度,macOS/Windows/Linux 視覺一致
   - **native overflow 的**:macOS 預設隱藏,Windows 吃 ~15px 寬度,跨 OS 不一致
3. 若 screenshot 來自 Windows,量 scrollbar 是否佔 content 寬度(佔 = native;不佔 = ScrollArea)

**合格標準**:
- 需捲動的場景使用 ScrollArea(scrollbar 為 overlay style) → PASS
- 用 native `overflow-auto` 且 user 實際用 Windows 會吃寬度 → FAIL
- horizontal-overflow pattern 刻意隱藏 scrollbar + fade mask → PASS(不同場景)

**FAIL 範例**:DataTable 水平捲動用 native overflow-x-auto → Windows user 看到 15px scrollbar 吃 cell 寬度

**對應規則**:`node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「建立 UI 前必讀」 → overflow 使用三規則

---

## 10. Zoom / step 幅度

**Canonical source**: `world-class-benchmarks.md` Figma/Photoshop zoom step;元件 spec(如 FileViewer / ImageViewer)

**怎麼量**:
1. 取 zoom-in/out 前後兩張 screenshot
2. 量某固定 element(如圖片裡一個標示)的 box 尺寸 before / after
3. 算 ratio = after / before

**合格標準**:
- 單次滾輪 / 單次 button tick 的 ratio 在 1.1×–1.25× 區間 → PASS(對標 Figma ≈ 1.1×,Photoshop ≈ 1.2×)
- 跳大步(如 1.5× / 2×)→ FAIL(user 會感覺「跳過想看的中間值」)
- 跳太小(如 1.02×)→ FAIL(user 要滑很久才有感)

**FAIL 範例**:ImageViewer 單次滾輪從 100% 跳到 200% → ratio 2.0,違反世界級習慣

**對應規則**:`world-class-benchmarks.md`「Figma zoom step」;元件 spec 若有宣告 step 以 spec 為準

---

## 11. Dark mode 對比 / token 聯動

**Canonical source**: `tokens/color/color.spec.md` semantic token dark mode 反轉;元件 spec 的 dark mode 行為段

**怎麼量**:
1. 取 light + dark 兩張 screenshot(同元件、同 state)
2. 逐元素檢查:
   - **fg / bg 對比比**:dark mode 文字是否仍可讀(對比 ≥ WCAG AA 4.5:1)
   - **border / divider 可見**:dark mode border 不該消失於 bg
   - **shadow 聯動**:`--elevation-*` token 在 dark mode 應調整(通常變更透明,因 dark bg 陰影要提亮)
3. 若元件**永遠 dark mode**(如 FileViewer 工具列)→ 檢查 light theme 下仍為 dark 外觀,不跟全域 theme 切

**合格標準**:
- fg/bg 對比符合 WCAG AA → PASS
- border/shadow 在 dark mode 仍可見 → PASS
- shadow 用 `--elevation-*` token 而非硬寫 `shadow-md` → PASS(看不出硬寫,但若 dark mode shadow 消失 = 強烈信號)
- 永遠 dark mode 元件在 light theme 下不跟切 → PASS

**FAIL 範例**:Popover 在 dark mode 下 shadow 消失(用了 `shadow-md` 硬寫);FileViewer 工具列在 light theme 變白(dark-mode override 失效)

**對應規則**:`color.spec.md`;`node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「Tailwind 5 條核心」「shadow 一律用 `--elevation-*` token」;元件 spec 的 dark mode 段

---

## 12. Overflow indicator 遮擋

**Canonical source**: `patterns/horizontal-overflow/horizontal-overflow.spec.md`;`components/OverflowIndicator/`(若存在)

**怎麼量**:
1. 找有 horizontal-overflow 的 container(Tabs / ChipGroup 等)
2. 檢查 fade mask 寬度 + 位置:
   - fade mask 應只蓋「視覺提示溢出」的範圍(通常 16–32px),不蓋完整 item
   - 箭頭按鈕(若有)不該蓋住 item 的可讀部分(text / icon)
3. 捲到最左 / 最右極端時,對應邊的 fade mask / 箭頭應消失(無溢出就無提示)

**合格標準**:
- fade mask 不蓋完整 item 的 text / icon → PASS
- 箭頭按鈕不遮 item 可讀資訊 → PASS
- 極端位置時對應邊指示器消失 → PASS

**FAIL 範例**:Tabs 箭頭按鈕遮住第一個 Tab 一半 text;fade mask 寬度 80px 完全蓋掉邊緣 tab

**對應規則**:`horizontal-overflow.spec.md`

---

## 13. 箭頭按鈕定位(Carousel / ImageViewer)

**Canonical source**: 對應元件 spec(Carousel / ImageViewer);`patterns/overlay-surface/` 若箭頭浮在 content 上

**怎麼量**:
1. 找箭頭按鈕(prev / next)的位置
2. 量:
   - **兩箭頭對稱**:prev 離左邊距離 == next 離右邊距離(除 spec 明文 asymmetric)
   - **不覆蓋 content**:箭頭 y 方向置中,x 方向在 content 外側或 overlay 層不蓋核心 content
   - **箭頭到容器邊**:該距離應用 token(如 `--layout-space-tight`),非硬寫 px

**合格標準**:
- 左右對稱(±1px) → PASS
- 不覆蓋 content 核心區 → PASS
- 使用 token 非硬寫 px → PASS(可從「距離對稱 + 是標準 token 值」反推)

**FAIL 範例**:Carousel prev 離左邊 8px、next 離右邊 16px(不對稱);箭頭 y 方向佔 content 垂直 1/3 高度並蓋住文字

**對應規則**:對應元件 spec;`tokens/layoutSpace/layoutSpace.spec.md`

---

## 補充:如何處理「checklist 沒涵蓋但視覺上怪」的情況

- 記為 `額外觀察`,附 screenshot 座標 + 描述(1-2 句)
- 交 user 決定是否升級為 checklist 項目
- **不直接寫成 FAIL**(checklist 是 SSOT,擴項需正式流程)
- 若同類觀察累積 3+ 次跨元件出現 → 建議升級為第 14 項 checklist 並更新本 reference
