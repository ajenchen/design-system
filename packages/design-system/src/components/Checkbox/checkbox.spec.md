---
component: Checkbox
family: self-contained
variants: {}
sizes:
  sm:
    when: "form field-height 28 / compact chrome / dialog / panel context"
  md:
    when: "default general UI"
  lg:
    when: "touch / prominent CTA / stakeholder-facing surface"
traits:
  - hasSizes
  - hasInteractiveStates
  - isSelectionMulti
benchmark:
  - Radix Checkbox primitive: github.com/radix-ui/primitives/tree/main/packages/react/checkbox
  - Ant Design Checkbox: github.com/ant-design/ant-design/tree/master/components/checkbox
  - MUI Checkbox: github.com/mui/material-ui/tree/master/packages/mui-material/src/Checkbox
  - Polaris Checkbox: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Checkbox
---

<!-- 行數說明(不是豁免標記,沒有任何工具會「准」它):行數上限以 `check_file_size_budget.sh` 的 case 表為準,本檔走一般 spec 那一檔(超過 budget 只提醒;寫完超過 transition cap 而且這次變長才擋)。本檔偏長是因為持有兩段跨元件 SSOT:「與 Switch 的分界」與「Clamp 政策(Label / Description 行數)」;2026-07-14 knowledge-prune P2 的結論是「殘餘超標內容全是 canonical,再砍必動 meaning」。 -->


# Checkbox 設計原則

(Radio 共用本規格,詳見 `../RadioGroup/radio-group.spec.md`;本文件通用於兩者視覺與行為,名稱保留 Checkbox 為主體)

## 定位

Checkbox 和 Radio 是**表單內的選擇控件**，視覺語言完全一致，差異只有形狀和語意。兩者都綁在 form state、隨 submit 才生效（非即時套用——這是與 Switch 的根本差異，見下「與 Switch 的分界」）。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：Checkbox 基於 Radix Checkbox、Radio 基於 Radix RadioGroup（皆 shadcn 包裝 + 橋接 DS token;shadcn [checkbox.tsx#L6](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/checkbox.tsx#L6)、[radio-group.tsx#L6](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/radio-group.tsx#L6) 各自 import Radix 原件）。

| | Checkbox | Radio |
|---|---|---|
| 形狀 | `rounded-md`（方） | `rounded-full`（圓） |
| 指示器 | Check icon | Filled dot |
| 語意 | 獨立 toggle（多選） | 互斥選擇（單選，必須在 RadioGroup 內） |

---

## 何時用 Checkbox

- **表單多選**：通知類型、權限授予、標籤群組
- **單一同意**：服務條款、隱私政策、訂閱行銷訊息（勾選才送出表單）
- **indeterminate 半選**：階層式表格的「全選」checkbox 反映部分子項已選
- **部分綁定的布林欄位**：form 裡的 is_public / is_featured（**但若是即時套用 → 用 Switch**）

## 何時用 Radio

- **表單單選且 2-5 個選項全部可見**：付款方式、訂閱方案、權限角色、票種
- **選項需要描述文字**（法律條款、方案比較、feature list）
- **決策節點**（使用者需要對比評估才能選）

**Radio vs Select 的分界詳見 `../Select/select.spec.md`「與 RadioGroup 的分界」**（SSOT 在 Select spec）。

## 何時不用（Checkbox / Radio 皆不適合）

| 場景 | 改用 | 原因 |
|------|------|------|
| 布林且即時套用（bluetooth、notification enable）| `Switch` | 見下「與 Switch 的分界」 |
| 單選但 6+ 選項 / 空間受限 | `Select` | Radio 全可見會佔滿頁面 |
| 多選但 6+ 選項 / 空間受限 | `Combobox` | Checkbox stack 全可見會佔滿頁面 |
| 階層結構（部門 / 資料夾）| `TreeView` | Checkbox 是平面選項 |
| 純視覺切換（側欄收合）| `Button pressed` | 切換狀態屬於介面行為，不是 form value |

---

## 與 Switch 的分界

兩者都是布林 on/off，常被誤用互換。判斷**不是視覺形狀**，而是以下三個角度——**任何一個明確傾向哪邊就選哪邊**：

### 1. 套用時機

- **Checkbox**：值隨 form submit 才套用。使用者勾選 → 按「儲存」→ 生效。中途可反悔
- **Switch**：值即時套用。使用者切換 → 立刻生效（呼叫 API / 改 URL / 觸發副作用）。沒有「取消」

### 2. 心智模型

- **Checkbox**：選擇 / 同意——「我選這個項目」、「我同意這個條件」。與書面表單類比
- **Switch**：開啟 / 關閉——「這個功能我要開」、「這個設定我要關」。與物理開關（牆上 light switch、iPhone settings 開關）類比

### 3. 結果可逆性的即時感

- **Checkbox**：勾選不代表生效——送出前可反悔。視覺語言強調「尚未確定」
- **Switch**：切換即結果——使用者按下那刻就改變系統狀態。視覺語言強調「現在是這樣」

### Fallback heuristic

- 在 form 裡、旁邊有 submit button / cancel button → **Checkbox**
- 獨立的 inline control、旁邊沒有 submit 流程 → **Switch**
- **常見誤解**:「無 submit button 就一定用 Switch」→ 錯。判準是上方三角度(套用時機優先);值仍屬 form 欄位語意(暫存後一併儲存)就用 Checkbox,本 heuristic 只是輔助

### 常見誤解(其餘)

- 只傳 `checked` 不傳 `onCheckedChange` ≠ readonly——那只是值鎖死,仍可 focus / click;readonly 必用 `readOnly` prop(見「Controlled / Uncontrolled API」)
- `<Field disabled>` cascade 與自身 `disabled` prop 同效(SSOT resolver),不需兩處都傳

### 情境對照表

| 場景 | 選哪個 | 原因 |
|------|-------|------|
| 我同意服務條款 | Checkbox | 隨 form submit 才成立 |
| 通知類型勾選（email / SMS / push）| Checkbox | form 設定，按儲存才套用 |
| Bluetooth on/off | Switch | 立刻開 / 關，不經 submit |
| Wi-Fi on/off | Switch | 立刻生效 |
| Dark mode 切換 | Switch | 即時套用 |
| Push 通知開關（settings 頁）| Switch | 立刻生效 |
| 訂閱行銷訊息 | Checkbox | form 內，按儲存才套用 |
| is_public / is_featured（編輯表單）| Checkbox | form field，送出才生效 |
| is_public（admin 即時切換）| Switch | 切換立刻套用 |

### 選單裡(DropdownMenu 的布林項目,2026-11-27)

**一句話:選單裡的布林項目,這一項本身是一個功能 / 設定的開關 → 開關外觀;這一項是一組同類東西裡的一員、使用者在挑「要哪幾個」→ 勾選外觀。** 兩種都用 `DropdownMenuCheckboxItem`(整列點了就切換、立刻生效、選單不關、整列 `role="menuitemcheckbox"` + `aria-checked`),只差 `indicator`。

為什麼看第 2 角度:選單沒有送出鈕,選單裡的布林項目點了**一律**立刻生效 —— 第 1 角度「套用時機」在選單裡兩邊都一樣、分不出來(上方 Fallback heuristic 的「套用時機優先」在選單裡不適用),剩下第 2 角度「心智模型」能分。拿不準時的檢驗:把這一項單獨搬到設定頁,它會是「一列開關」(→ 開關),還是「一組勾選清單裡的一個勾」(→ 勾選)?

| 情境 | 用 | 理由 |
|------|-------|------|
| (a) 單獨一個即時生效的設定,跟一般動作並列:聊天室選單「全寬顯示」、任務列表 ⋮「隱藏已完成和已取消」、檢視選單「緊湊列高」 | `indicator="switch"`(列尾開關) | 字是功能名,心裡想的是「開 / 關它」(上方「Dark mode 切換 → Switch」同一題) |
| (b) 從一組裡挑幾個:顯示哪幾欄、篩選哪幾個狀態、Chip 溢出選單 | 預設 `indicator="checkbox"`(前綴勾選框) | 字是成員名,心裡想的是「選這幾個」;`../Switch/switch.spec.md`「何時不用」:多選用 Checkbox。一組裡的每一項雖然也點了就生效,仍用勾選 |
| (c) 勾了還要按「套用」才生效 | 不放選單:Popover / 表單裡的 `Checkbox` + 套用鈕 | 第 1 角度:隨送出才套用 → Checkbox;選單項點了就生效,裝不下這個流程 |
| (d) 互斥選一個 | `DropdownMenuRadioItem` | 不是布林(`../DropdownMenu/dropdown-menu.spec.md`「Item 類型」) |

不在本段:DataTable 欄位顯示面板不是選單 —— 它是浮層裡可拖曳排序的清單,顯示 / 隱藏是列上的副動作(眼睛圖示鈕,`../DataTable/data-table-column-visibility-panel.tsx` 檔頭「固定零件」),零件清單照 `../DataTable/data-table.spec.md`「欄位顯示面板的固定零件」。不要把 `<Switch>` / `<Checkbox>` 放進 `DropdownMenuItem`(`../DropdownMenu/dropdown-menu.spec.md`「禁止事項」;產品 repo 由寫入檢查擋)。

**來源**:(a) user 2026-11-27 原話(逐字,DS 對話;問題由協調者擬:「下拉選單裡『切了就立刻生效』的開關項目(例:Chat 房間選單的 Full width、Tasks 列表 ⋮ 的 Hide done and cancelled),要用哪種外觀?」,建議選項「用開關外觀」):「基本上可以照你建議，確保整個ds在相關的地方沒有衝突且任何情境都能合理解釋且不違背世界級的設計，就照你建議做」。(b)(c)(d)、「看第 2 角度」與上面的檢驗是 **AI 推導**(由本節三個角度與 switch.spec「何時不用」推出,回應 user 附的條件「任何情境都能合理解釋」);2026-11-27 前 DS 的判定是「選單裡的開關一律勾選」(AI 推導、非 user 定,已由本段取代)。

**世界級對照**:Fluent UI 的 `MenuItemSwitch` 就是 (a):「A variant of `MenuItemCheckbox` that displays selection using a switch design. This is commonly used for menus that don't really have strong selection function but needs to support an exceptional selected option.」(https://github.com/microsoft/fluentui/blob/b9b6302a1b00e739e18c799cd1e74a62cd2a7ea7/packages/react-components/react-menu/stories/src/Menu/MenuSwitchItem.stories.tsx#L30-L32 ),行為與勾選項同一套(`role: 'menuitemcheckbox'`、`persistOnClick: true`,https://github.com/microsoft/fluentui/blob/b9b6302a1b00e739e18c799cd1e74a62cd2a7ea7/packages/react-components/react-menu/library/src/components/MenuItemCheckbox/useMenuItemCheckbox.tsx#L44-L47 )。Apple HIG「Toggled items」對一組屬性用勾:「Consider using a checkmark to show that an attribute is currently in effect. It's easy for people to scan for checkmarks in a list of attributes to find the ones that are selected.」(https://developer.apple.com/design/human-interface-guidelines/menus#Toggled-items )。(b) 這種「即時生效的多選」世界級兩派都有、同一家也換過:MUI X 表格欄位面板 v6 用開關(`rootProps.slots.baseSwitch`,https://github.com/mui/mui-x/blob/v6.19.0/packages/grid/x-data-grid/src/components/panel/GridColumnsPanel.tsx#L234 ),現行改成勾選框(`rootProps.slots.baseCheckbox`,https://github.com/mui/mui-x/blob/acf1c383cc9547ba210598cbc7db1672c01ac667/packages/x-data-grid/src/components/columnsManagement/GridColumnsManagement.tsx#L304 );AG Grid 欄位工具面板用勾選框(`AgCheckboxSelector`,https://github.com/ag-grid/ag-grid/blob/9a24add90b3f6327bc67ffb49a99479d007ea71a/packages/ag-grid-enterprise/src/columnToolPanel/toolPanelColumnComp.ts#L92 )。本 DS 採勾選那一派,理由是上面第 2 角度與 switch.spec「多選用 Checkbox」(AI 推導)。

**本節是 Checkbox vs Switch 的 SSOT**，未來 Switch 建立 spec 時用一行 pointer 指回本節。

---

## 尺寸

三種尺寸（sm/md = 16px、lg = 20px），對齊 icon 系統。sm 和 md 視覺相同，純粹是命名 mapping 讓消費者直接傳同一個 size。

| Size | 控件尺寸 | 內部 icon | 配對 field |
|------|---------|----------|-----------|
| sm | 16px | 12px | field sm |
| md | 16px | 12px | field md |
| lg | 20px | 16px | field lg |

### 為什麼不完全對齊 `--field-height-*`

- **現況**:控件 sm=16 / md=16 / lg=20px(不等於 `--field-height-sm/md/lg` = 28/32/36px)
- **Rationale**:Checkbox 控件是**選擇指示器**(indicator),不是容器;field-height 是「可編輯 control 的容器高度」,indicator 視覺上要明顯小於容器,才符合「選項前有個小方框」的心智模型。控件本體走 icon tier(sm/md=16, lg=20),行高對齊透過 SelectionItem 的 `py = (field-height - 1lh) / 2` 保證(控件垂直置中於 1lh 容器)
- **幾何 owner**:Checkbox control 與 field-height 分開管理；field row 擁有可點範圍與垂直置中，control source 擁有 icon box 的確切尺寸。

---

## Label 對齊

Checkbox/Radio 控件本體不畫 label——label 由 `SelectionItem` 承載:提供一級 `label` / `description` props 時元件內部自動包 `SelectionItem`(checkbox.tsx,consumer 不手刻);需自訂佈局時才手動組合 `SelectionItem`。

**icon / avatar prefix(2026-06-12 M30 轉發)**:一級 `icon`(LucideIcon)/ `avatar`(AvatarData)props 直接轉發 `SelectionItem` 既有三槽 canonical 的 prefix 槽(互斥;尺寸與 inline/block 對齊規則 SSOT = `selection-item.spec.md`「3-slot 結構」+ selection-item.tsx jsDoc)。RadioGroupItem 同。

對齊機制(`text-body[-lg]` 建立 `1lh` context / 控件包 `h-[1lh]` 容器垂直置中 / 外層 `items-start` 多行對齊第一行)**SSOT → `../SelectionControl/selection-item.spec.md`「結構 / 字體」**,本 spec 不重述(2026-07-14 收斂原重述段,措辭已現 drift)。

---

## SelectionItem 佈局

垂直排列和水平排列共用 `SelectionItem`,各值 SSOT 不重述:
- **Item padding / 單行高度 = field-height / 多行撐高公式** → `selection-item.spec.md`「Padding 公式」(`py = (field-height - 1lh) / 2`)
- **Label ↔ Description 2px gap** → `item-anatomy.spec.md`「Label ↔ Desc 間距」(`--item-gap-label-desc-reading[-lg]`,size-aware)
- **Item 間距**(垂直 0 / 水平 `gap-4`)→ 下方「群組模式」zero-gap 鐵律 + Orientation 段

---

## Clamp 政策(Label / Description 行數)

| Prop | 預設 | 理由 |
|---|---|---|
| `labelMaxLines` | `'none'`(∞) | Form 欄位的選項標籤可能很長,絕不可截斷 |
| `descMaxLines` | `'none'`(∞) | Form 欄位的補充說明、條款、隱私聲明必須完整呈現 |

**為什麼預設不截斷?**

Checkbox / Radio 在 form 內承載的常常是:
- **法律條款**(「我同意服務條款 + 隱私政策...」)
- **隱私聲明**(「允許 Cookie 用於...」)
- **複雜條件描述**(「啟用此功能會...」)

**任何截斷都是違法或誤導**——使用者必須完整看到他正在同意什麼。MenuItem 的「掃視優先」不適用,SelectionItem 的核心訴求是「**完整閱讀後同意**」。

### Per-instance override

若 consumer 有合理理由(例如 settings 頁的選項列表想截斷過長 label 維持掃視節奏),可以顯式覆寫:

```tsx
<SelectionItem labelMaxLines={1} descMaxLines={2} ... />
```

**注意:不能傳 `undefined` 表達「不截」**——React 的 destructure default 會把 undefined 當「沒傳」、fallback 到預設值。要明確表達「不截」傳 `'none'`(雖然語意等同預設,但更明確)。

### 為什麼不像 MenuItem 強制截斷?

| | MenuItem | SelectionItem |
|---|---|---|
| 使用情境 | 浮層選單,挑一個 | Form 內,**同意**或**選擇**內容本身 |
| 內容性質 | 選項名稱(短) | 條款 / 聲明 / 條件描述(可長) |
| 截斷後果 | 失去 context,但可重開選單看完 | **法律或道德問題**(同意了沒看到的內容) |
| 預設政策 | label / desc 都 `1`(掃視優先) | label / desc 都 `'none'`(完整閱讀優先) |

---

## 狀態

### Checkbox

| 狀態 | 邊框 | 底色 | 指示器 |
|------|------|------|--------|
| unchecked | border | surface | 無 |
| checked | primary | primary | on-emphasis check |
| indeterminate | primary | primary | on-emphasis minus |
| hover unchecked | border-hover | surface | 無 |
| hover checked | primary-hover | primary-hover | on-emphasis check |
| hover indeterminate | primary-hover | primary-hover | on-emphasis minus |
| readonly × hover(任一勾選狀態,含指標停在 label 上) | 同該狀態靜止值 | 同該狀態靜止值 | 同該狀態靜止值 |
| disabled unchecked | transparent | bg-disabled | 無 |
| disabled checked | transparent | bg-disabled | fg-disabled check |
| disabled indeterminate | transparent | bg-disabled | fg-disabled minus |

(token 名對齊 `checkbox.tsx` cva 真值;表內一律 semantic token,不寫視覺色名。**readonly × hover 列**:`pointer-events-none` 只擋指標直接在框上,指標停在 SelectionItem 的 `<label for>` 時 HTML 讓控件一起進入 `:hover`,所以每個勾選狀態都另以 `data-[readonly=true]:enabled:data-[state=…]:hover:` 釘回自己的靜止值 —— 與 `switch.tsx` 的 disabled hover 守衛同理;`enabled:` 讓 readonly + disabled 同時成立時交給 disabled 列。Radio 同一套。)

### Indeterminate（半選）

`checked="indeterminate"` 表示「部分子項被選中」。視覺上與 checked 相同（藍底白圖示），只是圖示從 Check 換成 Minus。

典型場景：SelectMenu 的「全選」checkbox——當部分選項被勾選時顯示 indeterminate。

Indeterminate 是由父層邏輯控制的狀態，Checkbox 本身不會自動進入 indeterminate——必須明確傳入 `checked="indeterminate"`（controlled 與 uncontrolled `defaultChecked="indeterminate"` 皆正確渲染 Minus——圖示切換由 Radix `data-state` CSS 驅動,2026-07-14 修復原「只讀 `props.checked`」的 uncontrolled known-gap）。**常見誤解**:「部分子項已選」不可用 disabled + checked 混搭表達——半選是可互動狀態,disabled 是鎖互動,語意不同。

**狀態切換視覺**(code 真值):unchecked ↔ checked / indeterminate 之間色彩走 `transition-colors` 150ms;Check ↔ Minus 圖示由 `data-state` CSS 即時 swap,無過渡動畫。

### Radio

| 狀態 | 邊框 | 底色 | 指示器 |
|------|------|------|--------|
| unchecked | border | surface | 無 |
| checked | primary | surface | primary dot |
| hover unchecked | border-hover | surface | 無 |
| hover checked | primary-hover | surface | primary-hover dot |
| readonly × hover(含指標停在 label 上) | 同該狀態靜止值 | surface | 同該狀態靜止值 |
| disabled unchecked | transparent | bg-disabled | 無 |
| disabled checked | transparent | bg-disabled | fg-disabled dot |

### Loading（N/A）

Checkbox / Radio **無 Loading 狀態**——選擇控件是同步 toggle,值隨 form submit 才套用(見「定位」),不承載非同步進度。提交進行中的 loading 狀態由**表單的 submit `Button` loading state** 擁有;提交期間若需鎖定選項,將 Checkbox 設 `disabled` 即可,不在控件本體加 spinner。（對齊 Switch spec「無 loading state」——async 進度不屬選擇控件本體。）

---

## Controlled / Uncontrolled API(M26)

繼承 Radix `CheckboxPrimitive.Root` triplet:`checked` / `defaultChecked` / `onCheckedChange`(Radix forward 不改名)。Form 用 `name` + `value`(native form contract)。3 模式:

- **Uncontrolled**:只傳 `defaultChecked`,DOM 自管 — 適合表單 native submit
- **Controlled**:傳 `checked` + `onCheckedChange`,React state 主導 — 適合需即時聯動其他欄位
- **Read-only**:用 `readOnly` prop(不是省略 `onCheckedChange`)。standalone:`readOnly` 設 `aria-readonly` / `data-readonly` / `tabIndex=-1` + cva `pointer-events-none` + onClick preventDefault guard(2026-07-05 D4 補:`<label htmlFor>` 的 synthetic click 非 pointer event,`pointer-events-none` 攔不到,需 guard 才真鎖),鎖互動但保留 checked 視覺;**Field 內(無 inline label)改渲染 readonly 灰框 + ✓/—**(見上方 mode 段)。注意:只傳 `checked` 而不傳 `onCheckedChange` 僅讓 Radix 把值鎖在 prop(不會更新),控件仍可 focus / click、不會進 disabled state — 那不是 readonly

### `mode` prop(Field mode,正交於 size)

`mode?: 'edit' | 'view' | 'readonly' | 'disabled'`(默認 inherit Field context 或 `'edit'`),對齊 `field-types.ts` FieldMode(完整 4-mode canonical SSOT → `Field/field-controls.spec.md`;本段鏡像 switch.spec.md 同名段):
- `edit`(預設)— 可勾選的 Checkbox。
- `view` — **純展示**:渲染 **Check icon(true=勾)/ X icon(false=叉)**,中性 `text-foreground` 色,非互動、無 input chrome,供 DataTable boolean cell 非編輯態共用。boolean 值符號 SSOT = `../SelectionControl/boolean-value.tsx`(勾/叉 icon + 中性色;M22 世界級:MUI X DataGrid Check/Close icon 中性色([GridRootStyles.ts#L702-L707](https://github.com/mui/mui-x/blob/7d387072c89002693bd423eef0b3ab6db87837f9/packages/x-data-grid/src/components/containers/GridRootStyles.ts#L702-L707):true = `foreground.muted`、false = `foreground.disabled`,皆非紅)/ React-admin TrueIcon-FalseIcon([BooleanField.tsx#L34-L35](https://github.com/marmelab/react-admin/blob/v5.10.0/packages/ra-ui-materialui/src/field/BooleanField.tsx#L34-L35));false 中性非紅 = 「否」值非「錯誤」)。
- `readonly` — **Field 內(無 inline label)**= `fieldWrapperStyles` readonly 灰框 + 勾/叉 icon(與 Input readonly 同一視覺語言,2026-06-12 user 拍板〔UD-J05〕;原附的兩家世界級對照沒有一手來源,2026-11-16 撤回);**standalone / 有 inline label**(SelectionItem row)= 正常色鎖互動(同下方 Read-only)。
- `disabled` — 落到真 disabled chrome(`effectiveDisabled`,2026-06-12 修:mode='disabled' 直傳〔如 `<Field mode="disabled">` cascade〕與 `disabled` prop 等效,降色 + 不可 focus)。DataTable cell 無 disabled 態(已廢除);cell 非編輯態 = `view` 純展示。

CheckboxGroup 是純 layout primitive — **不**持有 group-level selection state(無 `value` / `defaultValue` / `onValueChange`)。每個 `<Checkbox>` child 各自管自己的 `checked` / `defaultChecked` / `onCheckedChange`;CheckboxGroup 只透過 `CheckboxGroupContext` 告知 child「你在 group 裡」(保留各自 label)。

### 表單驗證接線(useFormValidation v1 邊界)

Checkbox 值走 `onCheckedChange`(非 value/onChange 型控件),接 `useFormValidation`(`../Field/form-validation.spec.md`)時用 **`setFieldValue` 自接、不經 `getInputProps`**。這是該 spec「v1 邊界」誠實記載的已知限制:**無自動 blur 驗證 / 邊改邊清 error**(該層 timing 只覆蓋 value/onChange 型控件)—— Checkbox 值變更後由 consumer 於 `setFieldValue` 後自行 re-validate,或隨 submit 全驗。**error 視覺不受此限制影響**:`Field invalid` context 是 engine-agnostic 的,紅框 + `FieldError` 照常呈現;`<Field>` 錯誤群組化見 field.spec.md。

---

## 群組模式(CheckboxGroup)

**`<CheckboxGroup>`** 是多選 Checkbox 的 layout primitive,跟 `<Checkbox>` **同資料夾**(合併於 2026-04-21,原單獨 `CheckboxGroup/` folder 併入)。兩者共享 selection semantics、Field integration 與 group context，因此由同一元件家族維護。

### Canonical 鐵律:零外部 gap

**垂直 CheckboxGroup item 之間沒有外部 gap**。間距完全靠每個 Checkbox 內部的 SelectionItem `py = (field-height - 1lh) / 2` 公式生成 — 單行高度對齊 field-height,多 row stacked 時 row-to-row 自然有 py × 2 的呼吸空間。

**禁止**外層加 `gap-y-*` / `space-y-*` / margin → double padding,違反 canonical。

### 為什麼 zero gap valid（不違反 inline-action canonical）

SelectionItem py 公式保證:
1. 單行 checkbox 高度 = field-height(對齊 Input 高度,row align)
2. 多行堆疊時相鄰 row 的 py 各自擴散 = 2×py 真實視覺呼吸空間
3. Density 切換時 py 自動跟 field-height 縮放,間距等比例變化

外加 gap → double-padding 視覺斷裂。

### 世界級對照

- **本 DS 依據**:row 間距由 item 自身 py 擁有,group 無 gap(理由見上方 1–3:命中區即整列、py 隨 field-height 縮放、外加 gap 會 double-padding)
- **流派:row 高度定義 gap,不加外部 gap** — 本 DS 採此

### CheckboxGroupContext(隔離 fieldCtx)

Group 內的 Checkbox 透過 `CheckboxGroupContext` 知道自己在 group 裡:
- `insideGroup && insideField` → 保留 label(每個 Checkbox 是 group 內選項)
- `insideField && !insideGroup` → 抑制 label(let FieldLabel 接管,solo-in-Field 場景)
- `insideField && !insideGroup` 也掛「沒有框的值」記號(`fieldFramelessValueProps`):閱讀情境(同一組裡有就地編輯)標籤在左時,單一勾選框往右內縮到框內字線,跟看得見的值在同一條線;CheckboxGroup 的選項不掛。規則住 `../Field/field.spec.md`「閱讀情境」(唯一住所)

每個 Checkbox 自己的 `id` 透過 `useId` 生成(不共用 fieldCtx.id)→ 修了 2026-04-21「點擊只 toggle 第一個」bug。

### Orientation

| 值 | Layout | 典型場景 |
|---|---|---|
| `vertical`(預設) | `grid`(無 gap,靠 SelectionItem py) | 篩選條件、偏好設定、權限組 |
| `horizontal` | `flex flex-wrap gap-4` | 短 label 並排(Email / Push / SMS) |

Horizontal 需 `gap-4` 因 row 的 py 不擴散到左右。

本表同時管 `CheckboxGroup` 與 `RadioGroup` 的 `orientation`;兩者的版面字串都由 `../SelectionControl/selection-item.tsx` 的 `selectionGroupLayoutClass` 提供,不各自寫。

### Field 整合

`<CheckboxGroup>` 有 `fieldLayout: 'block'` 屬性(跟 RadioGroup 一致),在 `<Field orientation="horizontal">` 內 control area 自動切 `items-start` + padding-top 對齊第一個 item 的 label 第一行。

### 用法範例

```tsx
<Field orientation="horizontal">
  <FieldLabel>通知方式</FieldLabel>
  <CheckboxGroup orientation="horizontal">
    <Checkbox label="Email" />
    <Checkbox label="Push" />
    <Checkbox label="SMS" />
  </CheckboxGroup>
</Field>
```

（垂直 group / defaultChecked 等更多場景 → `checkbox.stories.tsx`）

---

## 禁止事項

- ❌ Radio 不可單獨使用——必須在 RadioGroup 內
- ❌ 不手刻外部 `<label>` 排版——用 `label` prop(內部自動包 SelectionItem)或手動組合 `SelectionItem`
- ❌ 垂直 CheckboxGroup 加 `gap-y-*` / `space-y-*`——違反 zero-gap canonical
- ❌ 多選一不用 Checkbox——用 Radio 或 Select
- ❌ 即時套用的布林開關用 Checkbox——用 Switch（見「與 Switch 的分界」）
- ❌ Form 內同意條款用 Switch——條款是「勾選送出才成立」的書面行為，用 Checkbox

---

## 相關

- `../Switch/switch.spec.md` — 即時套用的布林開關（Checkbox vs Switch SSOT 在本 spec「與 Switch 的分界」）
- `../Select/select.spec.md` — 單選下拉（Radio vs Select SSOT 在 Select spec）
- `../Combobox/combobox.spec.md` — 多選下拉（Checkbox stack vs Combobox 對照在 Combobox spec）
- `../RadioGroup/radio-group.spec.md` — Radio 的 group 容器 + 結構對稱 reciprocal
- `../SelectionControl/selection-item.spec.md` — Checkbox / Radio 共用的 SelectionItem 佈局 primitive（本 spec 的 Clamp 政策為其 SSOT）
- `../Field/field-controls.spec.md` — Field Control 共用規則
- `../Field/form-validation.spec.md` — 表單驗證引擎;Checkbox 用 `setFieldValue` 自接的 v1 邊界見「Controlled / Uncontrolled API → 表單驗證接線」

## A11y 預設

**ARIA / Pattern**:繼承 Radix `checkbox` primitive a11y 預設(role / aria-* / 鍵盤導覽)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/checkbox#accessibility)。

**Focus**:單一 toggle 控件,無 focus trap / restoration(那是 Dialog / Sheet 等浮層容器的行為);聚焦中被切 disabled 時由瀏覽器原生 drop focus(native disabled button 行為),不另行管理。焦點指示分兩路,對應兩個真 tab stop:**edit 控件**(Radix `<button role="checkbox">`;`checkbox.tsx` 不寫任何焦點 class)吃 `styles/base.css` 的全域 `:focus-visible` 外描邊(`outline: 2px solid var(--ring)`,往外 2px);**Field 內的 readonly 灰框**(`checkbox.tsx:298-316` 的 `<div role="checkbox" tabIndex={0}>`,消費 `fieldWrapperStyles({ mode: 'readonly' })`)走 Field 家族統一的「欄位邊框轉主色 1px」——靜止的 1px 透明邊框**鍵盤**聚焦時轉成主色、**滑鼠點不變**(2026-11-11,`../Field/field-controls.spec.md`「Focus 行為」readonly 段),同一行的 `focus-visible:outline-none` 把全域外描邊壓掉,長相與可編輯欄位一致(長相 user 2026-09-10 拍板,見 `../Field/field-wrapper.tsx` 檔頭 JSDoc)。standalone 的 readOnly 走 `tabIndex={-1}`(`checkbox.tsx:336`),不是 tab stop。SSOT `ds-canonical/references/focus-canonical.md`「框怎麼畫」。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `combobox.spec.md`
- `field-control-group.spec.md`
- `menu-item.spec.md`
- `radio-group.spec.md`
- `segmented-control.spec.md`
- `select.spec.md`
- `selection-item.spec.md`
- `switch.spec.md`
