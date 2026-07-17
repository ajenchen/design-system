---
component: Accordion
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isStructural
benchmark:
  - Radix Accordion primitive: github.com/radix-ui/primitives/tree/main/packages/react/accordion
  - MUI Accordion: github.com/mui/material-ui/tree/master/packages/mui-material/src/Accordion
  - Ant Design Collapse: github.com/ant-design/ant-design/tree/master/components/collapse
  - Carbon Accordion: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/Accordion
---

# Accordion 設計原則

## 定位

Accordion 是**垂直堆疊、可收合的多區塊容器**——每個 item 由 header（含 chevron）點擊切換展開 / 收合狀態。適合「多段內容,多數時間只想看其中一段」的情境。

**實作基礎**：shadcn/ui 結構 + Radix Accordion primitive。本 DS 保留 shadcn 的 `Accordion / AccordionItem / AccordionTrigger / AccordionContent` API,視覺全改本 DS token(與 shadcn 預設的差異見「視覺規則」)。

**Layout Family**：非上述 family — composite / multi-section（多個 AccordionItem 垂直堆疊，自 own layout）。

---

## 何時用

- **FAQ / 說明**：常見問題、使用教學（預設全收合，使用者展開有興趣的）
- **設定分組**：一般 / 通知 / 安全 / 付款等多節 settings 頁（長 form 拆段）
- **進階選項可隱藏**：預設展示主要欄位，「進階選項」收合起來避免壓力
- **單邊 sidebar 多分類(淺層分組)**:notion-style 工作區 sidebar 的 section 收合;檔案樹 / 深度 tree 改用 `TreeView`(見「何時不用」)
- **多段獨立收合（非互斥切換）**：各段內容垂直堆疊、可各自展開收合——若是「同一塊空間互斥切換視圖」改用 Tabs（見「何時不用」）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 只有一個區塊要收合 | `<details>` 或自組 toggle | Accordion 是「多 item」pattern,單 item 無必要 |
| 切換平行視圖（A / B / C 三選一）| `Tabs` | Tabs 是互斥切換,Accordion 是獨立收合(或單選) |
| 複雜 sidebar 導航（深度 tree）| `TreeView` / `Sidebar` | Accordion 無 nested 結構 |
| 收合整個浮層/側欄 | `Dialog` / `Sheet` / `Popover` | 那是浮層控制不是 inline 收合 |
| 長列表只顯示 N 個 | 自組 「顯示更多」按鈕 | Accordion 不是「more / less」pattern |

---

## type：single vs multiple

**`type="single"`**（預設推薦）：一次只能展開一個 item。展開新 item 自動收合前一個。適合 FAQ / 指南類(讀者看完一段再下一段)。

**`type="multiple"`**：多個 item 可同時展開。適合 settings page / 工作 context(使用者同時比對多段)。

**判斷法**：「使用者會不會想同時看兩段?」會 → multiple;不會 / 同時看反而混亂 → single。

---

## collapsible (配合 single)

`single` 搭配 `collapsible={true}`:已展開的那個可以再點一次收合(回到「全部收合」狀態)。預設 `false`——已展開的無法再收合(必須保持有一個展開)。

- **FAQ / 使用教學** → `collapsible={true}`(允許全收起,乾淨視覺)
- **必須展開一個才合理** → `collapsible={false}`(罕見)

---

## 視覺規則

- **AccordionItem 底線**:相鄰 item 以底 divider 分隔(視覺界定每一段)
- **Trigger 文字**:正常閱讀色 + medium 字重(可掃視的 section heading 等級)
- **Trigger hover**:文字色 tint 弱化,**不用 underline**
- **Chevron**:朝下 → data-state=open 旋轉 180° → 朝上,transition 帶平滑
- **Content 文字**:次要閱讀色—— 主資訊在 trigger,展開內容是補充
- **焦點環**:鍵盤 focus 用 ring token(非自訂 outline)

**為什麼 hover 不用底線**:
- shadcn 預設 `hover:underline` 是 web 早期 link convention,現代 SaaS(Notion / Linear / Stripe / Vercel)皆不使用
- 改用文字色 tint 弱化,維持 DS 統一質感
- 仍保留可點擊提示——完全不變色會讓使用者不確定能否點擊;「失去可點擊提示」的風險大於「被誤以為是 link」

完整 class / token 對照見 anatomy story(`ColorMatrix` + `SizeMatrix`)。

---

## 禁止事項

- ❌ **不在 Accordion 內放另一個 Accordion**（巢狀會讓使用者迷失;用 TreeView 或拆頁）
- ❌ **不寫「全部展開 / 全部收合」按鈕**（違反 accordion 節省空間的設計意圖;若需要此功能,改用 TreeView 或 DescriptionList）
- ❌ **單一 item 不用 Accordion**（用 `<details>` 或自組 toggle;見「何時不用」）
- ❌ **不用 Accordion 做主要導航**（主導航用 Tabs / Sidebar,Accordion 是 content-level 收合）
- ❌ **AccordionContent 不放重焦點互動元素**（例:complex form / Dialog trigger）——a11y 硬限制:item 被收合時(尤其 `single` 模式展開他段會自動收合本段)內部焦點隨 content 隱藏而消失,鍵盤使用者失去落點。少量輸入欄位可以(UX 建議層級:使用者通常完成填寫才切換)

---

## A11y 預設

Radix Accordion 自動處理:
- **鍵盤**：Tab 到 trigger → Enter/Space 切換;ArrowUp/Down 在 trigger 間移動
- **ARIA**：trigger `aria-expanded` / `aria-controls` 自動設置,content `role="region"` + `aria-labelledby`
- **焦點**：收合時焦點停在 trigger,不會跳到隱藏 content 內

Consumer 無需額外處理,保留 Radix `data-state` 屬性即可。

---

## 常見誤解

**誤解**:「Accordion 該提供全部展開 / 全部收合按鈕」。
**事實**:期待「全展開一次讀完 / 全收合做導航」代表內容是參照型結構——那是 TreeView / DescriptionList 的場景。Accordion 的設計意圖是節省空間、一次聚焦一段(見「禁止事項」)。

---

## 邊界狀態

Empty state 由 consumer 處理(無 items 則不渲染);loading 狀態由 consumer 用 `<Skeleton />` 包;本元件無 density 概念,padding 固定為 `py-4 / pb-4`(不隨 density token 變動)。

**Disabled**(Accordion 是 composite 家族,**非 Field 家族**——disabled 行為由 Radix Accordion 提供,不走 field-controls SSOT):

- **Root `disabled`**:停用整個 accordion,所有 trigger 皆不可展開 / 聚焦。
- **AccordionItem `disabled`**:停用單一 item——Radix 將 `disabled` 設在原生 `<button>` trigger 上,故該 trigger 鍵盤 Tab / ArrowUp/Down 會**略過**(原生 disabled 不可聚焦),點擊亦無反應;視覺上 trigger 文字 + chevron 切語義 `text-fg-disabled`(非降透明度,對齊 Button variant=text)。live 展示見 anatomy `StateBehavior` 的「disabled item」段。

**固定 anatomy(不支援 `asChild`)**:`AccordionTrigger` 恆渲染 `children + ChevronDown` 兩個子節點,`AccordionContent` 恆以內層 `<div className="pb-4">` 包住 children——兩者的型別皆已 `Omit<..., 'asChild'>`,**不對外開放 `asChild`**。理由:傳入會讓 Radix Slot 觸發 `React.Children.only` runtime 錯(Trigger 多子節點),或 consumer 元素無法成為 Content host(只 clone 內層 div)。需替換 host 結構時改自組 Radix Accordion。

**垂直留白世界級對照(2026-06-12 source-verified)**:shadcn trigger `py-4`=16px(本 DS 基底,一字不差;[ui.shadcn.com/docs/components/accordion](https://ui.shadcn.com/docs/components/accordion))/ Ant Collapse header 垂直 = paddingSM 12px([github.com/ant-design/ant-design](https://github.com/ant-design/ant-design/tree/master/components/collapse))/ MUI Accordion = minHeight 48 + content margin 12px(expanded 64/20 漸進式;[github.com/mui/material-ui](https://github.com/mui/material-ui/tree/master/packages/mui-material/src/Accordion))/ Carbon = min-height token 模型([github.com/carbon-design-system/carbon](https://github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/Accordion))——業界垂直節奏值域 12-16px,16px 為舒適端上緣;item 數量無內建上限與虛擬捲動(全數 render),極長清單的收納(拆頁 / 搜尋)由 consumer 內容層處理。

---

## 相關

- `../Tabs/tabs.spec.md` — 互斥切換視圖（非收合）
- `../Dialog/dialog.spec.md` — 阻斷性浮層
- `../Sheet/sheet.spec.md` — 側邊抽屜
- `../TreeView/tree-view.spec.md` — 具層級結構的收合（Accordion 的巢狀延伸）
- Radix Accordion primitive — `@radix-ui/react-accordion`

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `tabs.spec.md`
