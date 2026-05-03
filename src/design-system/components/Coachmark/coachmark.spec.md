---
component: Coachmark
family: null
traits:
  - isOverlay
variants: {}
sizes: {}
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Coachmark 設計原則

## 定位

Coachmark 是**主動推送的功能介紹浮層**——anchor 到特定 UI 元素,帶 media + title + description + footer 按鈕列,用於首次功能介紹 / onboarding 多步導覽 / 新功能提示。

**實作基礎**:Popover 的 composition pattern——完全消費 Popover 的定位、動畫、焦點管理、overlay-surface padding 系統,不自寫浮層邏輯。差別:(1) **Header 可選**(`kind="tips" | "new-features" | ReactNode`;single-step 常無 header、multi-step tour 建議帶 header 提示整體脈絡),(2) 有 **Media 區**(可選,頂部 full-width 圖 / 截圖 / illustration),(3) Footer 是 `justify-between`(左 step 計數 / 右 actions)而非 `justify-end`。

**Layout Family**:非上述 family — composite / multi-section(Media / Body / Footer 多區塊組合)。

**世界級對照**:Apple HIG「Coachmark」(Apple 命名原處)/ Material「Feature Discovery」/ Ant Design `<Tour>` / Shepherd.js / react-joyride / Intercom Product Tours。命名採 Apple HIG 詞彙(最早且最廣泛被理解的術語)。

---

## 與 Popover 的關係

Coachmark **就是** Popover 的 composition —— 不是競品。改 Popover 視覺(bg / border / shadow / radius / padding)Coachmark 自動跟進,不需雙邊同步。唯一 Coachmark 自己擁有的視覺決策:

- **預設比 Popover 寬一階**:容納 media + 多行 description(主動推送內容量 > 篩選面板);具體寬度 class 見 `coachmark.tsx` cva
- **`p-0 overflow-hidden`**:移除 PopoverContent 預設 padding,讓 Media 邊緣對齊圓角;Body / Footer 自己消費 overlay-surface padding token
- **Footer `justify-between`**:step 計數(左)+ actions(右),對齊 Ant Tour / Intercom convention

SSOT 規則:**Coachmark 不重寫 Popover 的任何視覺 token**,只加自己結構層的差異。

---

## 與 Dialog 的分界

**核心差別:是否阻斷使用者流程**。

- **Coachmark**(non-modal 輔助):使用者可忽略、可 skip、可繼續原本的操作。onboarding 的精神是「幫忙介紹但不強迫」
- **Dialog**(modal 阻斷):使用者必須處理(確認 / 取消 / 完成表單)才能繼續

**判斷法**:「這個資訊不看會怎樣?」不看也能用 → Coachmark;不看就做不下去(破壞性動作、必要資訊輸入、多步表單)→ Dialog。

**為什麼 onboarding 絕不用 Dialog**:強制彈窗打斷使用者自主探索的動線,心理上造成「又是 tutorial?跳過」的本能反彈。Coachmark 的 non-modal 特性讓使用者保持主控權,tour 反而更容易被完整看完。

---

## 何時用

| 場景 | 範例 |
|------|------|
| 首次功能介紹 | 第一次使用 AI 助理功能時,anchor 到 AI 按鈕介紹「點這裡開始對話」 |
| Onboarding 多步導覽 | Notion-style 3-step tour:建立 workspace → 邀請成員 → 建立第一個頁面 |
| 版本更新 / What's new | 新 dashboard view 上線時提示「試試新的圖表模式」 |
| 新功能發現 | Intercom-style feature discovery,anchor 到功能 icon 並說明價值 |

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 錯誤訊息 / 系統通知 | `Notice` / `Alert` / `Toast` | Coachmark 是主動推送「要不要試試」,不是事件回饋 |
| 靜態 help text(hover 說明) | `Tooltip` | Tooltip 是被動查詢,Coachmark 是主動推送 |
| 確認破壞性動作 | `Dialog` | Coachmark 可忽略,破壞性動作必須阻斷 |
| 必要資訊輸入(表單 wizard) | `Dialog` + `Tabs` | 必填欄位不能讓使用者 skip |
| 一般點擊觸發的浮層面板 | `Popover` | Coachmark 是「系統主動出現」,Popover 是使用者點擊才出現 |
| Hover 觸發可互動浮層 | `HoverCard` | 觸發模型不同(Coachmark 由外部狀態控制) |

---

## Anatomy

```
┌────────────────────────────────┐
│ Header(可選)                  │  ← SurfaceHeader padding;kind="tips"/"new-features"
│   使用技巧 / 新功能介紹        │     text-caption uppercase text-fg-secondary
├────────────────────────────────┤
│ Media                          │  ← 可選,頂部 full-width,AspectRatio {16/9} default
│ (image / illustration / video) │     邊緣對齊(overflow-hidden)
├────────────────────────────────┤
│ Body                           │  ← SurfaceBody padding(px-loose py-tight)
│   Title                        │     text-body-lg font-medium
│   Description                  │     text-body text-fg-secondary
├────────────────────────────────┤
│ Footer(justify-between)        │  ← SurfaceFooter padding(px-loose py-tight)
│   2 of 3       [Skip] [Next]   │     左 step / 右 actions
│   1 of 3  [Prev] [Next]        │     多步驟中段:無 Skip,加 Prev
│                  [知道了]      │     單步驟:無 step / Prev / Skip,只 CTA
└────────────────────────────────┘
```

---

## Props 結構

- `children` — trigger anchor(用 Popover asChild 定位)
- `kind` — `'tips' | 'new-features' | ReactNode`;有值則渲染 Header(tour-level title)
- `image` — ReactNode 媒體區;不傳則不渲染
- `title` / `description` — 文字內容;兩個都不傳則整個 Body 不渲染
- `step` — `{ current, total }`;有值則 footer 左側顯示 `2 of 3`
- `onSkip` / `onNext` / `onPrev` — footer 按鈕 callback;無 callback 不渲染該按鈕
- `isLastStep` — `true` 影響 CTA 文字(見下方「CTA 語義表」)
- `doneLabel` — 單步驟 CTA 自訂文字(預設 `'知道了'`)
- `open` / `onOpenChange` — controlled 控制(多步 tour 由 consumer 管理)
- `side` / `align` / `sideOffset` — 定位,對齊 Popover props(**`align` 跟隨 trigger 位置:左 → start / 中 → center / 右 → end**,見 `popover.spec.md`「Align 對齊 canonical」SSOT)

### CTA 語義表(世界級 canonical)

| 情境 | `onPrev` | `isLastStep` | CTA 文字 | Skip 顯示? |
|------|----------|--------------|----------|-----------|
| **單步驟**(只 1 步) | — | `true` | `doneLabel ?? '知道了'` | 否(單步驟無 skip 意義) |
| Multi 第一步 | — | `false` | `Next` | **是**(尚未投入進度) |
| Multi 中間步 | ✓ | `false` | `Next` | 否(有 Prev 時不再 Skip) |
| Multi 最後步 | ✓ | `true` | `Done` | 否 |

**為什麼單步驟 CTA 不叫 "Next"**:Next 語義隱含「還有下一步」,single step 用 Next 使用者會困惑「後面還有嗎?」。Apple HIG / Intercom / Pendo 同樣慣例:single-step tip / onboarding toast 一律用「知道了 / Got it / Start」類完成詞。

**為什麼有 Prev 時不顯示 Skip**:使用者按 Next 進到 step 2+ 代表已投入進度,此時同時出現「Prev(回上一步)」和「Skip(放棄全部)」語義衝突。Linear / Shepherd.js / Pendo tour 都在第 2 步後隱藏 Skip;想退出的使用者按 Esc / 關閉圖示即可(Radix 預設 Esc = dismiss)。

---

## Media 區規則

- **尺寸**:固定 `aspect-video`(16:9),確保不同 tour 步驟視覺一致,consumer 不需自己算高度
- **背景**:預設 `bg-muted`(當內容是 illustration 或透明 PNG 時有底色)
- **邊緣**:`overflow-hidden` + `rounded-t-lg` 讓媒體切齊浮層圓角
- **支援內容**:image / video / SVG illustration / animated GIF / Lottie
- **禁止**:不放互動元件(按鈕 / 輸入框)——media 純視覺說明,互動一律走 footer

---

## Multi-step Tour 模式

**Coachmark 本身不管理 step state**——consumer 自己管理 `currentStep` + 每步 anchor element:

```tsx
const [step, setStep] = useState(0)
const steps = [
  { anchorRef: workspaceBtnRef, title: '建立 workspace', ... },
  { anchorRef: inviteBtnRef, title: '邀請成員', ... },
  { anchorRef: projectBtnRef, title: '建立第一個專案', ... },
]
// 每步渲染一個 Coachmark,anchor 到對應元素
```

**設計建議**:
- **≤ 5 步**——超過使用者疲勞,改用靜態 onboarding 頁面
- **Skip 只在第一步提供**——進到 step 2+ 後 Skip 自動隱藏(canonical,見上方「CTA 語義表」);想退出走 Esc / header Close 按鈕
- **最後一步 `isLastStep`**——Next → Done 語意切換,讓使用者知道「這是最後一步」
- **每步 anchor 到對應 feature**——不 anchor 或 anchor 到無關元素 = 失去「教 X 怎麼用」的精準性
- **Multi-step 建議傳 `kind="tips"` 或 `"new-features"`**——header 讓使用者一眼看出 tour 性質 / 何時結束的預期

---

## Footer 按鈕順序

Previous(可選)→ Skip(可選)→ Next / Done。對齊 Ant Tour / Intercom convention:

- **Previous 最左**——回到上一步(負方向,視覺權重低)
- **Skip 中間**——exit escape hatch,tertiary 不搶焦點;**僅第一步顯示**(見 CTA 語義表)
- **Next / Done 最右**——推進主動線(正方向,primary 視覺權重高);**不強制 autoFocus** — 讓 Radix 預設行為接管(通常 focus 第一個 focusable),避免使用者還在讀 body 時按 Enter 誤推進

第 1 步通常無 Previous;最後步 Next 改 Done(由 `isLastStep` 控制)。單步驟 CTA 改 `'知道了'`。

---

## 視覺 Token

| 層 | Token | 說明 |
|----|-------|------|
| 浮層外殼 | 繼承 Popover(`bg-surface-raised` / `border-border` / `rounded-lg` / `--elevation-200`) | 改 Popover 自動跟進 |
| Media 背景 | `bg-muted` | illustration / 透明 PNG 底色 |
| Title | `text-body-lg font-medium text-foreground` | 比 Popover header 輕(Coachmark 無 header 分隔線) |
| Description | `text-body text-fg-secondary` | 主說明文字 |
| Step 計數 | `text-caption text-fg-secondary tabular-nums` | 數字等寬,切換步驟不跳動 |
| Body padding | `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]` | overlay-surface SSOT(PopoverBody) |
| Footer padding | 同上 | overlay-surface SSOT(PopoverFooter) |
| Width | 比 Popover 預設寬一階(固定,具體 class 見 `coachmark.tsx`) | 固定;consumer 可 className 覆寫 |

---

## 禁止事項

- ❌ **不用 Coachmark 做錯誤提示**——錯誤是系統回饋使用者動作的結果,用 `Notice` / `Alert` / `Toast`。Coachmark 是主動推送教學,語意相反
- ❌ **不用 Coachmark 做確認框**——確認破壞性動作必須阻斷流程,改用 `Dialog`
- ❌ **Media 區不放互動元件**——按鈕 / 輸入 / checkbox 一律走 footer。Media 是視覺說明不是互動區
- ❌ **Description 不寫超過 3 行**——Coachmark 是快速說明,超過 3 行改用 Dialog + 完整 body 或連結到說明文件
- ❌ **不強迫完成 tour**——永遠提供退出機制(Esc / header Close / 第一步 Skip)。沒有退出的 onboarding 讓使用者感到被綁架,反而降低完成率
- ❌ **單步驟 CTA 不叫 "Next"**——沒有下一步就不用 Next 字眼,用 `'知道了' / 'Got it' / 'Start'`
- ❌ **有 Prev 時不同時顯示 Skip**——使用者投入進度後兩個退出路徑衝突(見 CTA 語義表)
- ❌ **不自包視覺 token**——bg / shadow / radius / padding 一律繼承 Popover,改視覺就改 Popover
- ❌ **不在 Coachmark 內放 nested Popover / Dialog**——層級混亂焦點崩壞,複雜互動結束 tour 後再開

---

## A11y

- **焦點管理**:由 Popover(Radix)處理——開啟移焦點進 content,關閉 return to trigger
- **Esc 關閉**:預設啟用(= Skip 行為)——user 按 Esc 等同 skip,尊重退出意願
- **ARIA**:trigger 自動 `aria-expanded` / `aria-controls`,content `role="dialog"`(Radix 預設)
- **Step 計數 tabular-nums**:螢幕閱讀器讀「2 of 3」語意清楚

---

## 邊界狀態

disabled / density 繼承 Popover(density 鎖 md,見 `../Popover/popover.spec.md`);empty(title + description 都不傳)則 Body 不渲染(已於「Props 結構」規定);loading 由 consumer 決定。

---

## 相關

- `../Popover/popover.spec.md` — Coachmark 的實作基礎,所有浮層視覺 SSOT
- `../Dialog/dialog.spec.md` — modal 阻斷浮層,與 Coachmark non-modal 對立
- `../../patterns/overlay-surface/overlay-surface.spec.md` — Body / Footer padding SSOT(經 Popover 消費)
- `../Tooltip/tooltip.spec.md` — hover 觸發純文字提示
- `../HoverCard/hover-card.spec.md` — hover 觸發互動浮層
- `../Notice/notice.spec.md` — 系統通知 / 錯誤訊息
- Apple HIG Coachmarks / Ant Design `<Tour>` / Shepherd.js — 世界級對照

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `aspect-ratio.spec.md`
