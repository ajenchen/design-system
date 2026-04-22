# NameCard 設計原則

人員 HoverCard 的內容元件。提供統一的人員資訊展示格式，作為 HoverCard 的 content 消費者。

**實作基礎**：組合元件——Avatar + Text + Button 配 HoverCard 浮層。NameCard 本身不含觸發或定位邏輯（那是 HoverCard 的職責），只是 HoverCard content 的標準人員模板。

**Layout Family**:非上述 family — composite(Avatar prefix + text block + action suffix,組合自 HoverCard content 內部;跨 section 垂直堆疊由 `border-t border-divider` 分隔,不屬 Family 1-4 的任何單行結構)。

---

## 何時用

- **Avatar hover 顯示人員詳情**：留言者 / 指派者 / 成員列表 hover 彈出詳細資訊
- **@提及互動**：`@username` hover 顯示該使用者的 card
- **團隊 / 成員快速預覽**：Settings 頁的成員列表、PR reviewer 清單的 hover 預覽
- **需要快速動作的人員資訊**：NameCard 可放 CTA button（Message / Invite / Follow）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 點擊進入人員 profile 頁 | `<a>` 或 Link | Navigation 不需 hover card 的浮層 |
| 人員清單 row（不需要 hover 展開詳情）| `Avatar` + inline text | NameCard 是 hover content，list row 不需要 |
| 單純顯示一個名字 | `Avatar` + `Text` | NameCard 是完整資訊卡，單名字用更輕量元件 |
| 複雜人員表單（編輯角色 / 權限）| `Dialog` 或專用頁面 | NameCard 是快速預覽，不承載複雜互動 |

## 結構

NameCard 為固定寬度的垂直 section 堆疊：
- **Profile header** — Avatar + Name + Subtitle
- **Action buttons**（選用）— 快速動作列
- **Status section**（選用）— 狀態標籤 + 訊息
- **Info fields**（選用）— 透過 DescriptionList 呈現結構化欄位
- **View more** — 導向 profile 頁的 link。**Hover context(HoverCard / Popover 浮層)必含**;standalone page-level NameCard(profile panel / directory card 等非 hover 情境)可省略。詳「View more canonical」節

Section 之間用 `border-t border-divider` 固定分隔（見 `separator.spec.md`「元件固定結構 → CSS border-t/b」）。詳細 class / padding token 見 `name-card.tsx`。

## 寬度（元件級常數）

NameCard 固定 **320px 寬**（見 `.tsx` 的 `w-[320px]`）——HoverCard 浮層寬度由 NameCard 決定，不隨內容伸縮（避免 hover 時浮層寬度跳動）。

對照世界級：Material Snackbar 固定 344px、Slack message modal 固定寬度——**單一元件的 canonical 寬度屬於該元件自己的 design spec，不抽為跨元件 token**。Token 系統只管共享值（如 `--field-height-*`、`--layout-space-*`）；單一元件獨有的結構常數留在 component code + 本 spec。

## Action 行(2026-04-20 canonical)

Action 區的 layout **永遠等寬均分容器寬度**——multiple actions 每個 Button 取相同 `1fr` 寬、single action 撐滿整個 NameCard width。實作 = `grid grid-flow-col auto-cols-fr gap-2` + `[&>*]:w-full` 強制每個 child fill grid cell。

```
[ Chat      ][ Audio call ▾ ]   ← 2 個 action:各 50%
[     Message           ]       ← 1 個 action:100%
[ Follow  ][ Message ][ ...]    ← 3 個 action:各 33%
```

**為什麼等寬均分**:
- NameCard 是**人員關係卡**,action 是 relationship actions(Chat / Audio / Message / Follow)——這類動作視覺權重對等,無主次之分,等寬最直覺
- Single action 撐滿讓「行動列」永遠占滿 card 底部,視覺節奏一致(不會「單一 button 孤零零縮在左邊」)
- 世界級對照:iOS Contact card / macOS Contact / LinkedIn profile card / Slack profile modal 的 action row——全部等寬

**Consumer 跨 story / 跨 consumer 必須用同一組 canonical actions**:

NameCard 的 default actions **是 `Chat + Audio call`**(chat app 標配,對齊 name-card.stories.tsx 的 `actionButtons` 常數)。story / principles / consumer code 不要每個範例改成不同 action——同一個元件在不同 demo 下出現 3 種不同 action 組合,讓 consumer 誤以為 action 會隨情境自動變。**例外**:要展示 single-action / 3-action 數量差異時才改,並明示「這是展示 action 數量變化」。

## Profile Header

- **Avatar**：透過 Avatar `status` prop 顯示狀態圓點（見 `avatar.spec.md`）
- **Text column 對齊**：最小高度對齊 avatar 高度——短文字（單行名字）垂直置中於 avatar；長文字（多行名字 + subtitle）自然撐高
- **字級層級**：Name > Subtitle；name 為 strong weight,subtitle 為 secondary color

## Status 區

非互動狀態標籤以 `bg-muted` 承載(不用 `bg-secondary`——Muted 視覺重量更低,對齊 Badge / Skeleton family)。狀態點顏色走 `--status-*` presence token(2026-04-20):`online` / `away` / `busy` / `offline`——跟 Avatar status 同源、獨立於 success/warning/error(presence 不是 validation state)。訊息必須包在 `<DescriptionList>` 內以 `<DescriptionItem>` 呈現(不可孤立 dt/dd),clamp 兩行避免無限伸展。

## Info Fields

使用 `DescriptionList cols={2}`，適合展示 ID、員工編號等短屬性。

## View More

`Button variant="link" size="sm" className="w-full"`——填滿容器寬度的文字按鈕。位於獨立的 bordered section（`border-t border-divider`），`py-2` 較緊湊。

只在傳入 `onViewMore` callback 時顯示。

## 設計決策

- **固定寬度而非 min/max**：HoverCard 內容量可預期，固定寬度避免不同人員 card 寬度跳動
- **Section 用 border-t 分隔**：清晰的資訊分區，每個 section 獨立存在或不存在
- **Status badge 用 muted 而非 interactive 色**：狀態是展示資訊，不可點擊，不應暗示互動性

---

## 禁止事項

- ❌ 不要在 HoverCard 外直接用 NameCard 當 standalone card——它不是獨立 Card primitive,是 HoverCard content 模板,缺少浮層外殼(radius / border / shadow)與定位邏輯。需要 card 佈局時用專屬元件或自組 Surface
- ❌ 不要硬寫內部 Avatar size——NameCard Profile Header 的 avatar 尺寸由元件內部規格決定,consumer 覆寫會破壞 text column 對齊公式
- ❌ 不要 override HoverCard `z-index` / `sideOffset` / `collisionPadding`——浮層行為由 `../HoverCard/hover-card.spec.md` + `../../patterns/overlay-surface/overlay-surface.spec.md` 管理,單獨 override 會破壞跨浮層的一致 stacking
- ❌ 不要把非人員資料塞進 NameCard(例如檔案預覽、物件資訊)——NameCard 是人員專屬模板,語意不可挪用;其他 hover 詳情請自組 HoverCard content
- ❌ Status section 的狀態點不要自訂色——走 `--status-online/away/busy/offline` presence token canonical,與 Avatar status 同源,改色會跨元件漂移
- ❌ Action button 不要放動詞性 icon-only(例 Trash2 刪除)——NameCard actions 是關係型快速動作(Message / Invite / Follow),破壞性操作應走 Dialog confirm flow

---

## 無障礙

- **Trigger 整合**:Avatar 作為 HoverCard trigger 時,`onFocus` / `onBlur` 與 mouseenter/leave 同時觸發由 Radix HoverCard 管理——鍵盤使用者 Tab 到 avatar 可自動顯示 card,Escape 關閉
- **Focus 順序**:NameCard 內若有 Action button,Tab 順序為 trigger(Avatar)→ 第一個 action → 後續 action → view more;不抓取 focus 進入浮層(保留 Radix `HoverCard` 預設語意,與 Popover 的 focus trap 不同)
- **Live region 語意**:NameCard 是展示內容,非 announcement,不套 `aria-live`
- **DL 語意**:Info Fields 使用 DescriptionList(`<dl>/<dt>/<dd>`),screen reader 會讀成「term X, description Y」對話;詳見 `../DescriptionList/description-list.spec.md`「無障礙」段
- **CTA button aria-label**:icon-only action button 必須帶 `aria-label`(「傳訊息給 {name}」「加入 {name} 為好友」),不只是 icon 視覺
- **色彩對比**:Status badge `bg-muted` + `text-foreground` / Avatar status 圓點均通過 WCAG AA,不依賴單一色彩載體(搭配文字標籤)

---

## 為何無 Inspector / SizeMatrix

- **無 Inspector**:NameCard 的決策維度是「section 組合」(avatar + profile / status / info / viewMore 的開關)——互動 Inspector 切換 toggle 可以做,但 `SectionMatrix` 的 side-by-side 矩陣(最簡 → 中 → full)對 consumer 的判斷更直接(「什麼 section 組合適合什麼 context」)。多維組合用矩陣呈現比單組合互動玩耍有效。
- **無 SizeMatrix**:NameCard 固定 **280px 寬**(元件級常數,見本 spec「寬度」段),跨 consumer / variant 不變——人員資訊卡的 canonical width 屬於元件自身,不抽為 token。Section 高度由內容撐開,無 size tier。

對應 anatomy story:保留 `Overview` + `SectionMatrix` + `ColorMatrix`(Status 色) + 元件特有 `HoverCardIntegration`(canonical usage pattern) + `StateBehavior`(空值 / 過長文字邊界)。

---

## 相關

- `../HoverCard/hover-card.spec.md` — NameCard 的浮層容器（觸發與定位由 HoverCard 負責）
- `../Avatar/avatar.spec.md` — Profile header 的身份視覺（Avatar 的 `hoverCard` prop 自動整合 NameCard）
- `../Tooltip/tooltip.spec.md` — 純文字 hover 提示（NameCard 是可互動 hover content）
- `../DescriptionList/description-list.spec.md` — Info fields 的 label / value 佈局
- `../Button/button.spec.md` — Action button（Message / Invite 等 CTA）
