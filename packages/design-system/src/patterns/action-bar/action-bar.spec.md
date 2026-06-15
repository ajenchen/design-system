<!-- @benchmark-unverified-blanket: body 含 pattern 級 world-class 對照(世界級對照表 L17-24 + Variant narrow-scope 對照 L141-156:Material/VS Code/Figma/Atlassian/Polaris/Linear/GitHub/Gmail/Notion/MUI/Carbon),為 named-reference 級而非 per-source URL/#L/snapshot cite,故 file-level 標 unverified-blanket。 -->

# Action Bar 設計原則

> **Foundational SSOT rationale**(cap 800,2026-04-25 approved):
> 跨 pattern operations / utilities 角色系統 SSOT。Toolbar / DataTable / FileViewer / Dialog 等 action region 皆消費本 spec 的 overflow mechanics / section divider rules / primary 位置 / danger placement。scope 本質 > 單一 pattern。

## 定位

**Layout Family**:composite(cross-pattern;consumed by Toolbar / DataTable / FileViewer / Dialog 等 action region)。本 pattern 為 role system + overflow mechanics SSOT,非單一 layout family。

操作列（Action Bar）是在有限空間內組合多個操作的排列模式，涵蓋 Toolbar、卡片操作列、對話框操作區等場景。

本文件定義：操作的語意角色、視覺 pattern、Variant 選擇、分群與分隔線、溢出機制。
Button 元件層規則（variant、size、icon、狀態）見 `button.spec.md`。

## 世界級對照(按 pattern 類型)

| 我們的 canonical | 對照 world-class |
|------------------|-----------------|
| Toolbar(純工具按鈕群)| Material Toolbar / VS Code EditorToolbar / Figma ToolbarLeft / Atlassian Appbar |
| Action bar(業務操作列,primary CTA 結尾)| Polaris `ActionList / PageActions` / Linear Cmd+K bar / GitHub `toolbar` + `Save` grouping |
| Search + filter(左搜尋右操作)| Gmail inbox toolbar / Linear list toolbar / Notion DB toolbar |
| Overflow rule(space 不足)| Material M3 menu anchor / Atlassian overflow menu |

---

## 一、角色系統

操作列中的所有操作分為兩種語意角色。**角色決定視覺 pattern 與位置。**

### 業務操作（Operations）

**使用者在此功能脈絡下，為完成目標所採取的一切操作。**

> 判斷標準：移除這個操作，使用者是否無法完成他來這裡要做的事？是 → 業務操作。

| 類型 | 範例 |
|------|------|
| 內容 CRUD | 新增、編輯、刪除、封存 |
| 資料操作 | 篩選、排序、分組、搜尋 |
| 資料流 | 匯入、匯出、列印 |
| 協作 | 分享、指派、留言 |
| 狀態推進 | 發佈、送審、完成 |

### 工具操作（Utilities）

**支援工作條件的操作，而非執行功能的核心工作。**

> 判斷標準：這個操作跟「現在在做什麼任務」無關，任何頁面都可能有它？是 → 工具操作。

| 類型 | 範例 |
|------|------|
| 環境調整 | 全螢幕、縮放、密度切換 |
| 系統維護 | ↺ 刷新、重新載入 |
| 全域設定 | ⚙ 設定 |
| 輔助資源 | ? 說明文件、FAQ（外部連結亦同） |

### Search 的角色判斷

Search 的角色**不由「產品核心是不是搜尋」決定**，而由——

> **結果如何被使用？**
> - 點擊結果**跳走**（wayfinding） → **工具**
> - 結果**留在當前頁被操作**（filter、bulk action） → **業務**

| Search 類型 | 角色 | 代表 |
|-------------|------|------|
| 過濾當前視圖的資料 | **業務** | Data table / Kanban / list 的搜尋框，和 filter / sort / group 同類 |
| 跨頁跳轉（結果點擊後跳走） | **工具** | App header search、Cmd+K、跨 workspace 文件 search |
| 搜尋結果頁面（結果是操作對象） | **業務** | 結果頁本身支援圈選、批次處理；搜尋是進入該操作流程的入口 |

**Gmail 陷阱**：Gmail 核心任務是處理信件，但 header search 點擊結果後跳去那封信——是 wayfinding，是**工具**。把「產品核心」當判斷依據會讓所有 search 都算成業務，角色分類失效。

**擺放**：
- 業務 search → 業務層，和 filter / sort / group 同區
- 工具 search → 通常不在 action bar 內（放 app header 或快捷鍵）；若必須放 action bar，放工具層最右側

---

## 二、標準結構

**工具層的位置由空間慣例決定，不由業務層排序推導。**
工具層永遠在操作列最右側（LTR 語境），不隨對齊方式或業務層內容改變。

> 為什麼：使用者對工具操作（設定、刷新、溢出）建立的是**位置記憶**，不是視覺掃描。位置一致比排序邏輯的對稱性更重要。

```
┌──────────────────────────┐ ┆ ┌──────────────────────┐
│       業務操作群組        │ ┆ │  工具操作    溢出      │
└──────────────────────────┘ ┆ └──────────────────────┘
    業務層(Operations)          工具層(Utilities)
```

兩種對齊的差異只在業務層內部排序方向，工具層位置不變：

**靠右對齊 Toolbar**（最常見）：

```
業務操作（primary 在業務層最右）  ┆  工具操作  全域溢出
```

**靠左對齊**：

```
業務操作（primary 在業務層最左）  ┆  工具操作  全域溢出
```

**對齊方向的決定**：操作列有標題時，標題在左、按鈕靠右（最常見）。操作列沒有標題時，按鈕靠左——空白放在右邊不會造成視覺斷裂，但空白放在左邊會讓按鈕群組像是漂在半空。

---

## 三、Variant 與排序

### 業務操作

| | |
|--|--|
| **允許 variant** | primary、secondary、tertiary、text（`link` 是導覽語意,不屬於操作列）。**啟用態(on/checked)不是 variant** —— 由 `pressed` prop 表達(產生 `data-state=on`) |
| **Variant 選擇** | 以有框 variant（primary、secondary、tertiary）為主,`text` 用於視覺重量最低的輔助操作。有框操作定義「這是操作區的重心」,text 是補充,不是預設。可切換按鈕維持其 variant + 加 `pressed` toggle(非換成 checked variant) |
| **全局排序** | 先對所有可見業務按鈕做全局排序：`primary > secondary > tertiary > text`；靠右對齊時 primary 在業務層最右，靠左對齊時 primary 在業務層最左（工具層永遠在業務層右側，見第二節）。正確排序後有框操作自然在前、text 在後，不需要額外的集中規則。切換按鈕（維持 variant + `pressed` toggle）依預設（未啟用）狀態的 variant 決定排序位置 |
| **danger 位置** | `danger` 不影響跨 variant 排序。同 variant 內，danger 排在非 danger 之後（遠離主要焦點）。`primary+danger` 不受此規則影響——在刪除確認等場景中，破壞性操作本身就是主要動作 |
| **danger 可見性** | 破壞性操作預設收進溢出選單。只有同時滿足**高頻**（使用者每次進入此畫面都可能用到）且**可逆**（有 undo 或垃圾桶機制）時，才值得攤開為可見按鈕。頻率不夠高或不可逆的破壞性操作，攤開只會增加誤觸風險（Gmail 的教訓：Delete 從預設可見改為隱藏，因為誤觸是最大客訴） |
| **功能性分群** | 排序完成後，依功能關係在適當位置加分隔線形成群組；**不要先定義群組再各自排序**（會導致多個 primary 競爭焦點） |
| **溢出位置** | 溢出按鈕（···）排除在全局排序之外，永遠放在所屬群組末端或工具層末端 |
| **Size** | Toolbar 用小尺寸維持緊湊；form / dialog 用中尺寸配合表單元素的高度 |

**可配置資料操作**（篩選、排序、分組）的 variant 建議：

| 狀態 | Variant | Label |
|------|---------|-------|
| 未配置 | `text`（預設，在 Toolbar 脈絡下）／`tertiary`（脈絡不明確時，見下方 affordance 原則） | 通常 icon-only；脈絡不明確時補 label |
| 已配置 / 啟用 | 維持 variant 不變 + `pressed={true}`（產生 `data-state=on`） | icon-only |

篩選、排序、分組三個圖示（Filter、ArrowUpDown、Layers）在資料表格脈絡下意義唯一，Toolbar 場景通常全程 icon-only。

**啟用態（`data-state=on`）的視覺由 `pressedTone` prop 決定（非底層 variant）**：
- `pressedTone="emphasis"`（**button.tsx 預設**）→ `bg-primary-subtle` + `text-primary`（藍底 + 藍色 icon），存在感強。secondary / tertiary / text 三者在此 tone 下視覺相同
- `pressedTone="neutral"` → `bg-neutral-selected`（灰底 + 原色 icon），低調但仍可辨識

**Variant 選擇 narrow scope**(2026-05-20 codex Layer B D1 verdict + WebFetch ≥ 5 world-class):

| Context | Variant | Cite |
|---|---|---|
| **DataTable / Kanban / list 等 dense always-visible data toolbar** filter / sort / column controls | **`text` + pressed** + iconOnly + Popover wrap real panel(DataTableFilterPanel / DataTableSortManager) | `data-table.stories.tsx#WithBulkActions` SSOT |
| **Standalone / labeled** sole state carrier(toolbar 外 / 單獨 filter UI 非 DataTable context) | `tertiary` + pressed | 視 case |
| 純動作工具(無 state)/ 低重量輔助 | `text` | 既有 default |

**Rationale**:dense data toolbar 已自帶 affordance + active state 由 pressed/chips/badges 顯示,trigger 用 low visual weight `text` 不該放大重量。`tertiary` 反而留給 standalone 場景(無 toolbar 上下文,trigger 是唯一 state carrier)。

**World-class consensus(2026-05-20 WebFetch verified)**:
- MUI Data Grid toolbar = `baseIconButton`(text-equivalent)/ active filters 用 toolbar chips 顯示
- Polaris IndexFilters = toggle button + panel,active filters 用 badges/tags
- Carbon dense toolbar = icon-only button + ghost variant
- Linear filter button = low weight + filter chips 顯示 conditions
- Notion DB view settings = compact button + 不放大重量

**舊 wording**(retired 2026-05-20):「filter/sort 狀態是 toolbar 重點資訊 → tertiary」過寬,導致 DataTable scope 誤用 tertiary;canonical 已 narrow 到 standalone-only。

### 工具操作

| 子類型 | Variant |
|--------|---------|
| 純動作工具（點了就執行，無當前狀態） | `text` |
| 可切換工具（全螢幕等）— 未啟用 | `text` |
| 可切換工具 — 已啟用 | 維持 variant（如 `text`）+ `pressed={true}` |

**不允許**：primary、secondary（工具層必須是操作列中最低視覺重量）。`danger` 不適用於工具層——破壞性操作一定是對物件的業務操作，不是環境調整。

**層內排序**：固定工具在前，全域溢出永遠最末。

---

## 三之一、tertiary vs text 的選擇（affordance 原則）

`tertiary` 和 `text` 的差別**不是重要性程度，是 affordance 來源**：

- **`tertiary` = 自帶 affordance**：按鈕用自己的框主動告訴使用者「這是可點的」
- **`text` = 借用脈絡 affordance**：按鈕依賴周圍脈絡暗示可點

### 判斷標準

**這顆按鈕所在的位置，脈絡本身已經暗示「這裡可以點」了嗎？**

| 脈絡暗示可點？ | 代表場景 | 選 |
|----------------|----------|-----|
| ✅ 是 | Toolbar、Table row hover、Card 的 action 區、已標記的 button group、Sidebar 內部操作 | **text** |
| ❌ 否 | Dialog footer、Empty state、Form 主區塊的次要動作、獨立頁面中孤立出現的 dropdown trigger | **tertiary** |

**為什麼**：若脈絡已經暗示可點，每顆按鈕再自帶框 = 視覺雜訊重複，搶走主要焦點；若脈絡沒暗示，`text` 按鈕會被當成純文字標籤看不見。

### 常見應用

| 情境 | Variant | 原因 |
|------|---------|------|
| Dialog Cancel / Back | **tertiary** | Footer 區域本身沒有點擊暗示，每顆按鈕要自帶 affordance |
| Toolbar 的 Filter / Sort / View icons | **text** | Toolbar 是明確的操作區，脈絡已暗示可點 |
| Table row 的 Edit / Delete | **text** | Row hover + 末端位置已是強線索 |
| Empty state 的次要 CTA | **tertiary** | 按鈕漂浮在空白中，無脈絡線索 |
| Dropdown trigger（Sort by ↓）在 Toolbar 內 | **text** | 借用 Toolbar 脈絡 |
| Dropdown trigger 獨立出現在 page header | **tertiary** | 沒有 Toolbar 脈絡包覆，需自帶框 |
| 可配置資料操作（filter/sort/group）在 Toolbar 的預設狀態 | **text** | 借用 Toolbar 脈絡 |

### 推論

- **同一顆按鈕搬家可能換 variant**：從 empty state 搬進 toolbar → tertiary 變 text。判斷依據不是按鈕本身，是它所處的脈絡
- **成對出現不等於按鈕群**：Dialog 的 Cancel + Confirm 是兩顆，但 footer 區沒有脈絡暗示，兩顆都需要自帶 affordance——Cancel 仍是 tertiary、Confirm 仍是 primary，不會因為「成對」就變成 text 群組
- **Toolbar 的工具按鈕群全程 text**：即使其中某顆被提升為 `tertiary` 想要加強可操作性，也要謹慎——它會在一排 text 按鈕中變得突兀。通常寧可全員 text + hover 狀態強化，也不要混合

### 反例

❌ **Toolbar 內用 tertiary 加強「可操作性」**
```
[🔽 tertiary] [👁 tertiary]  [+ New (primary)]  [⋯]
```
Toolbar 已經是明確操作區，tertiary 的框變成重複 affordance；多顆並排時視覺成格狀雜訊，還會和 primary 的視覺重量拉近，搶焦點。

✅ **正確版本**
```
[🔽 text] [👁 text]  [+ New (primary)]  [⋯]
```
Tool 按鈕群靠 Toolbar 脈絡 + hover 狀態浮出，視覺退讓給 primary。

---

## 四、Icon 使用原則

### 業務操作

Icon 的目的是幫助辨識，不是視覺對稱。

| 情境 | 規則 |
|------|------|
| Icon 非強制 | form / dialog 等場景可省略，label 即可 |
| 同優先等級的操作 | 建議一致：同時有 `startIcon` 或同時沒有 |
| 不同優先等級（primary vs tertiary） | 可以不同，視覺重量差異是刻意設計 |
| `endIcon`（ChevronDown 等） | 互動指示器，不計入 `startIcon` 一致性判斷 |

### 工具操作

工具操作預設 icon-only。Icon 的適用性靠判斷，非硬規定：

| 類型 | 說明 | 範例 |
|------|------|------|
| 脈絡無關 | 任何頁面都能辨識，永遠安全 | ⚙ ··· ✕ ⤢ ? |
| 脈絡明確 | 在此 context 意義唯一 | ↺（資料 toolbar）、⬆（上傳功能區） |
| 需謹慎 | 同 icon 在不同 context 意義可能不同 | ⬆（上傳 or 移上 or 捲頂） |

原則：「在這個畫面脈絡下，使用者不需要讀 label 就能確定這個 icon 做什麼嗎？」若是，icon-only 可行；若不確定，補 label。

所有 icon-only 按鈕必須設定 `aria-label`，Button 元件自動產生 tooltip。

---

## 五、分隔線規則

分隔線有兩種語意，各自適用不同場景：

**群組溢出邊界**
群組溢出（···）標記一個群組的結束。**群組溢出右側必須加分隔線**，無論右側是另一個業務群組還是工具層，也無論右側的視覺類型為何。群組溢出邊界優先於角色接壤：即使右側是 text 工具層，只要有群組溢出，就必加分隔線。

**角色接壤（無群組溢出時）**
業務層沒有群組溢出，最後一個真實業務按鈕直接接工具層：

```
[...  最後一個業務按鈕]  ?  [第一個工具按鈕  ...]
          有框         →       無框     = 不加（視覺差異已標記邊界）
          無框         →       無框     = 必須加（邊界不可見）
```

**溢出按鈕（···）本身不構成工具層。** 工具層的存在取決於是否有固定工具按鈕（⚙ 設定、↺ 刷新、⤢ 全螢幕等）。沒有固定工具按鈕時，··· 是業務層的末端，不存在角色邊界，不加角色邊界分隔線。

| 情境 | 分隔線 | 依據 |
|------|--------|------|
| 群組溢出右側（接任何內容） | **必須** | 群組溢出邊界 |
| 業務層有框結尾 → 固定工具 text（無群組溢出） | **不加** | 角色接壤：視覺差異已足夠 |
| 業務層無框 text 結尾 → 固定工具 text（無群組溢出） | **必須** | 角色接壤：邊界不可見 |
| 業務操作層內的功能性分群 | **可選** | 同視覺類型功能域不同，視需要加 |
| 固定工具 → 全域溢出（同屬工具層） | **不加** | 同屬工具層 |
| 無固定工具（··· 是業務層末端） | **不加** | 沒有工具層，沒有角色邊界 |
| 最右側為關閉 / 解除按鈕 | **必須** | 誤觸保護 |
| 單一按鈕兩側都有分隔線 | 審查兩條各自的語意理由；正確套用規則後孤立自然不出現，若出現則代表某條分隔線應移除 | 孤立是症狀，根因是無語意的分隔線 |

**分隔線語意判斷**：遵守以上規則後孤立自然不出現。若出現孤立，先問「這條分隔線有語意理由嗎？」而非接受孤立。

**切換按鈕**：`text` + `pressed` toggle——依預設（未啟用）狀態決定位置與分隔線；切為啟用（`pressed=true`）時不移動、不調整分隔線（啟用態不是 variant，見三節）。

---

## 六、溢出選單

溢出是機制，不是角色。**溢出按鈕一律最低視覺重量（無框 icon-only）**，不隨業務層有框/無框而改變。溢出排除在全局排序之外。

### 判斷標準

所有群組的低頻操作放進同一個選單，使用者能快速找到目標嗎？

- **能** → 末端溢出（一個溢出在操作列最右，選單內用 section divider 分群）
- **不能**（群組之間功能性質差異大，混在一起找東西慢）→ 群組溢出（各群組各自管理）

### 末端溢出

**一個溢出按鈕，在操作列絕對末端。** 選單內用 section divider 表達功能分群。

適用於大多數操作列（資料表工具列、對話框操作區、卡片操作列等）。

```
[業務操作]  ┆  [固定工具]  [···]
                              ↑ 唯一的溢出，永遠在最右

[業務操作]  [···]             ← 沒有固定工具時
```

### 群組溢出

各群組各自管理可見與隱藏的項目。每個群組獨立決定——有些群組需要溢出，有些全部攤開：

```
[B  I  U  ∨] | [☑  🖼  @  😀  🔗  +] | [↩  ↪]
      ↑                  ↑                   ↑
   有溢出             沒有溢出            沒有溢出
```

群組溢出可以是**永久的**（低頻項目攤開是雜亂，設計師主動策展）、**響應式的**（空間不足時收合），或兩者疊加。在群組數量多、群組之間功能性質差異大的 toolbar 中較常見（如 rich text editor）。

規則：
- 溢出附著在所屬群組末端（左側直接接該群組按鈕，無分隔線），只收納該群組的項目
- 溢出右側必須加分隔線（群組溢出邊界，見第五節）
- 不與末端溢出混用——避免使用者分不清各個 ··· 的範疇

### 共通規則

- 溢出按鈕不構成工具層。工具層需要有固定工具按鈕（⚙ 設定、↺ 刷新、⤢ 全螢幕等）才存在，只有 ··· 不算
- 溢出選單本體的浮層行為（超出 viewport 的 collision 翻轉 / 內容過長捲動 / Esc 關閉 / 鍵盤導覽）由 `DropdownMenu` own（Radix 預設），本 pattern 不重定義
- **如果操作列出現大量溢出按鈕，這是資訊架構的問題，應回到功能規劃層重新設計**

---

## 七、空間不足時的降級

### 末端溢出的操作列

```
1. 低頻業務操作收進末端溢出
2. 工具操作已是 icon-only，維持不變
3. 業務操作降級：低優先等級先降為 icon-only，主按鈕最後保留 label
4. 降級後的 icon-only 業務操作需符合 icon-only 辨識度條件
```

### 群組溢出的操作列

```
1. 各群組內低頻項先收進該群組的溢出
2. 群組繼續收合：保留最高頻的按鈕作為群組代表，其餘進溢出
3. 單一按鈕的群組不需要溢出，空間極端不足時整個隱藏
```

---

## 八、常見錯誤

### ❌ 工具操作混入業務層

```
[儲存 | 複製] ┆ [↺ | 🗑] ┆ [···] ┆ [✕]
                  ↑ 角色混用：↺ 是工具操作，🗑 是業務操作
                    分在同一視覺群組 → 角色邊界失效，分隔線規則無從套用
```

正確版本：先分清角色，再套分隔線：

```
[儲存(framed) | 複製(framed) | 🗑(text danger)] ┆ [↺(text) | ···global] ┆ [✕]
                                                  ↑                        ↑
                                              text→text 角色接壤      關閉保護
      有框→無框接壤，不加分隔線（視覺差異已足夠）
```

- 儲存、複製 = 有框業務（tertiary）；🗑 = 無框業務（text danger）→ 有框集中在前，不加分隔線
- 🗑（業務）→ ↺（工具）= text→text 角色接壤 → 必加分隔線
- ↺ → ···global = 同屬工具層 → 不加分隔線
- ✕ 在末端 → 關閉保護，分隔線在 ✕ 左側；···global 左側一條（角色接壤），右側一條（關閉保護），各有語意

### ❌ 同優先等級業務操作，icon 處理不一致

```
⬆ 上傳    匯出
（同為 text variant，一個有 startIcon 一個沒有）
```

### ❌ 工具操作使用 primary 或 secondary

工具層必須是操作列中最低視覺重量，否則搶走業務操作的焦點。

### ❌ 工具層與全域溢出之間加分隔線，造成孤立

```
[ 業務操作 ]  ┆  ⚙  ┆  ···   ← ❌ ⚙ 兩側都有分隔線
[ 業務操作 ]  ┆  ⚙  ···       ← ✅
```

### ❌ 無工具層卻加分隔線

```
⬆ 上傳   ⬇ 匯出   ┆   ···   ← ❌ 無角色邊界，分隔線無意義
⬆ 上傳   ⬇ 匯出   ···        ← ✅
```

### ❌ Variant 排序錯誤：有框夾在無框之間

```
[ text ]  [ tertiary ]  [ text ]   ← ❌ tertiary 重量高於 text，應排在前
[ tertiary ]  [ text ]  [ text ]   ← ✅
```

### ❌ 操作列被包上邊框

加上邊框會變成 Segmented Control，語意與互動完全不同，不可混用。

---

## 九、快速判斷

```
這個操作是什麼角色？
├── 移除它，使用者無法完成任務  →  業務操作
│     ├── 一般操作                →  label 或 icon + label
│     ├── 含多個子選項            →  + endIcon={ChevronDown}
│     └── 可配置資料操作          →  text + pressed（未配置 pressed=false / 已配置 pressed=true）
│           └── 需要更強可操作性提示  →  tertiary（未配置）
└── 跟任務無關，服務環境          →  工具操作  →  icon-only + tooltip

有工具層嗎？
├── 有  →  業務層用什麼結尾？
│           ├── 有框按鈕      →  不加分隔線（有框→無框視覺差異已足夠）
│           └── 無框 text 按鈕 →  必須加分隔線（無框→無框邊界不可見）
└── 無  →  不加任何分隔線（除非有關閉按鈕保護需求）

溢出用哪種？
└── 所有群組的低頻操作放進同一個選單，使用者能快速找到目標嗎？
    ├── 能  →  末端溢出（一個，在最右）
    └── 不能（群組多、功能性質差異大、找東西慢）→  群組各自管理溢出
```

---

## 邊界與分權

本 pattern 是組合指南（無 runtime 元件）——元件級邊界（無可見 action 時不渲染空操作列 / loading / disabled 狀態）與 a11y 細節由消費端元件 own：icon-only 必設 `aria-label` + tooltip（見第四節，Button own）；溢出選單的鍵盤 / focus 行為由 `DropdownMenu` own（見第六節）。

## 關聯文件

- `button.spec.md`：Button 元件層的設計原則
- `../../components/DropdownMenu/dropdown-menu.spec.md`：溢出選單浮層行為 SSOT（collision / 捲動 / Esc / 鍵盤）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `bulk-action-bar.spec.md`
- `button.spec.md`
- `calendar.spec.md`
- `data-table.spec.md`
- `file-viewer.spec.md`
- `popover.spec.md`
