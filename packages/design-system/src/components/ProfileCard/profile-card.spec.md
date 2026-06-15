---
component: ProfileCard
family: composite
traits:
  - isInternal
variants: {}
sizes: {}
benchmark:
  - Polaris MediaCard: github.com/Shopify/polaris/tree/main/polaris-react/src/components/MediaCard
  - MUI Card: github.com/mui/material-ui/tree/master/packages/mui-material/src/Card
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# ProfileCard 設計原則

人員 HoverCard 的內容元件。提供統一的人員資訊展示格式，作為 HoverCard 的 content 消費者。

**實作基礎**：組合元件——Avatar + Text + Button 配 HoverCard 浮層。ProfileCard 本身不含觸發或定位邏輯（那是 HoverCard 的職責），只是 HoverCard content 的標準人員模板。

**Layout Family**:非上述 family — composite(Avatar prefix + text block + action suffix,組合自 HoverCard content 內部;跨 section 垂直堆疊由 `border-t border-divider` 分隔,不屬 Family 1-4 的任何單行結構)。

---

## 何時用

- **Avatar hover 顯示人員詳情**：留言者 / 指派者 / 成員列表 hover 彈出詳細資訊
- **@提及互動**：`@username` hover 顯示該使用者的 card
- **團隊 / 成員快速預覽**：Settings 頁的成員列表、PR reviewer 清單的 hover 預覽
- **需要快速動作的人員資訊**：ProfileCard 可放 CTA button（Message / Invite / Follow）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 點擊進入人員 profile 頁 | `<a>` 或 Link | Navigation 不需 hover card 的浮層 |
| 人員清單 row（不需要 hover 展開詳情）| `Avatar` + inline text | ProfileCard 是 hover content，list row 不需要 |
| 單純顯示一個名字 | `Avatar` + `Text` | ProfileCard 是完整資訊卡，單名字用更輕量元件 |
| 複雜人員表單（編輯角色 / 權限）| `Dialog` 或專用頁面 | ProfileCard 是快速預覽，不承載複雜互動 |

## 近親職責分界

| 元件 | 職責 | 不管 |
|---|---|---|
| ProfileCard(本元件) | 人員資訊**內容模板**(header / status / info / view more) | 觸發、定位、浮層外殼(radius / border / shadow) |
| HoverCard | 浮層**容器**(觸發 / 定位 / 外殼),詳 `hover-card.spec.md` | 內容結構 |
| Avatar | 身份視覺;`hoverCard` prop 一鍵整合 ProfileCard | card 內容本身 |
| Tooltip | 純文字 hover 提示(不可互動) | 結構化人員資訊 |

## 結構

ProfileCard 是**三層 chrome 結構**(2026-04-23 canonical):

```
┌─────────────────────────────┐
│ HEADER(固定不捲)            │  ← Profile(Avatar + Name + Subtitle)+ Actions(選用)
├─────────────────────────────┤
│ BODY(可垂直捲動)            │  ← Status section(v12 conditional)+ Info fields(always-render)
│ ↕ 空間不足時此區捲動         │    Status undefined → 整 status block skip
├─────────────────────────────┤
│ FOOTER(固定不捲)            │  ← View more(hover context 必含,詳「View More」)
└─────────────────────────────┘
```

- **Header 固定**:Profile + Actions 一體,**不捲動**(使用者的視覺 anchor:誰 + 可對他做什麼)
- **Body 可捲動**:Status section + Info fields。以 `<ScrollArea>` 包(cross-OS overlay 捲軸)
- **Footer 固定**:View more **永遠可見**(hover preview 的 escape hatch 到完整 profile)

**Status section v12 conditional rule(2026-05-14 user 拍板)**:`status` 在 production 一定會被設定(每個 user 都有 presence state)。如果 status undefined,**唯一可能性 = 資料還沒讀到(loading transient)**,**不**是「user 沒設定狀態」。所以 status undefined 期間 → **整 status block 隱藏**(等資料到才 render),**禁** render「Status not set」這種 placeholder 文字(語義錯,user presence 不會「沒設定」)。**此規則 ProfileCard-specific 不外推至 DS 其他元件**(FileItem / DescriptionList / DataTable cell 各自 placeholder 邏輯 unrelated)。

**取消「精簡版」變體**:ProfileCard 只有**一種結構**,consumer 未傳的 section 不另開 minimal variant。世界級對照:Slack / GitHub / LinkedIn hover-profile 皆單一結構,不分「簡版/full 版」。

**DS-wide PersonData 預設展示一致 canonical**:任何 PersonData 來源展示 ProfileCard 時,`description` / `fields` 預設都應提供;`status` / `statusMessage` opt-in(僅 loading transient 或 consumer mock data 才會缺,production data 必有)。

Section 之間用 `border-t border-divider` 分隔(見 `separator.spec.md`「元件固定結構 → CSS border-t/b」)。詳細 class / padding token 見 `profile-card.tsx`。

<!-- 2026-05-18 D2 fix:width SSOT 統一 320(對齊 tsx `w-[320px]`)。本檔之前殘留「280px」自相矛盾已撤,只保留「## 寬度」段 320 canonical。 -->

**View more 按鈕 padding**:固定 `py-3`(12px),比 Body `py-3` 同位 — 讓 footer 有明顯呼吸空間,不跟 body section 邊界混淆。

## 寬度（元件級常數）

ProfileCard 固定 **320px 寬**（見 `.tsx` 的 `w-[320px]`）——HoverCard 浮層寬度由 ProfileCard 決定，不隨內容伸縮（避免 hover 時浮層寬度跳動）。

對照世界級：Material Snackbar 固定 344px、Slack message modal 固定寬度——**單一元件的 canonical 寬度屬於該元件自己的 design spec，不抽為跨元件 token**。Token 系統只管共享值（如 `--field-height-*`、`--layout-space-*`）；單一元件獨有的結構常數留在 component code + 本 spec。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## Action 行(2026-04-20 canonical)

Action 區的 layout **永遠等寬均分容器寬度**——multiple actions 每個 Button 取相同 `1fr` 寬、single action 撐滿整個 ProfileCard width。實作(grid 等寬均分 class)見 `profile-card.tsx` Action 區註解。

```
[ Chat      ][ Audio call ▾ ]   ← 2 個 action:各 50%
[     Message           ]       ← 1 個 action:100%
[ Follow  ][ Message ][ ...]    ← 3 個 action:各 33%
```

**為什麼等寬均分**:
- ProfileCard 是**人員關係卡**,action 是 relationship actions(Chat / Audio / Message / Follow)——這類動作視覺權重對等,無主次之分,等寬最直覺
- Single action 撐滿讓「行動列」永遠占滿 card 底部,視覺節奏一致(不會「單一 button 孤零零縮在左邊」)
- 世界級對照:iOS Contact card / macOS Contact / LinkedIn profile card / Slack profile modal 的 action row——全部等寬 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**Consumer 跨 story / 跨 consumer 必須用同一組 canonical actions**:

ProfileCard 的 default actions **是 `Chat + Audio call`**(chat app 標配,canonical 由 profile-card.tsx export 的 `ProfileCardDefaultActions` 元件承載)。story / principles / consumer code 不要每個範例改成不同 action——同一個元件在不同 demo 下出現 3 種不同 action 組合,讓 consumer 誤以為 action 會隨情境自動變。**例外**:要展示 single-action / 3-action 數量差異時才改,並明示「這是展示 action 數量變化」。

## Profile Header

- **Avatar**：透過 Avatar `status` prop 顯示狀態圓點（見 `avatar.spec.md`）
- **Text column 對齊**：最小高度對齊 avatar 高度——短文字（單行名字）垂直置中於 avatar；長文字（多行名字 + subtitle）自然撐高
- **字級層級**：Name > Subtitle；name 為 strong weight,subtitle 為 secondary color

## Status 區

非互動狀態標籤以 `bg-muted` 承載(不用 `bg-secondary`——Muted 視覺重量更低,對齊 Badge / Skeleton family)。狀態點顏色走 `--status-*` presence token(2026-04-20):`online` / `away` / `busy` / `offline`——跟 Avatar status 同源、獨立於 success/warning/error(presence 不是 validation state)。訊息必須包在 `<DescriptionList>` 內以 `<DescriptionItem>` 呈現(不可孤立 dt/dd),**完整顯示不截斷**——內容過長時由 Body 區 `<ScrollArea>` 在固定高度內捲動,不 clamp 行數。

## Info Fields

使用 `DescriptionList cols={2}`，適合展示 ID、員工編號等短屬性。

## View More

`Button variant="link" size="sm" className="w-full"`——填滿容器寬度的文字按鈕。位於獨立的 bordered section（`border-t border-divider`），`py-3`（12px,對齊本 spec「View more 按鈕 padding」段,比一般 link 按鈕多呼吸空間）。

只在傳入 `onViewMore` callback 時顯示。

## 設計決策

- **固定寬度而非 min/max**：HoverCard 內容量可預期，固定寬度避免不同人員 card 寬度跳動
- **Section 用 border-t 分隔**：清晰的資訊分區，每個 section 獨立存在或不存在
- **Status badge 用 muted 而非 interactive 色**：狀態是展示資訊，不可點擊，不應暗示互動性

---

## 邊界案例

- **Name / Subtitle 超長**:自然換行撐高 header,不截斷(text column 最小高度對齊 avatar,見「Profile Header」)
- **Status / statusMessage 缺值**:status undefined = loading transient → 整 status block 隱藏(v12 rule,見「結構」);ProfileCard **無整卡 loading prop**,資料未到的整卡呈現由 consumer 決定
- **Info fields 缺值**:default fields 永遠 render,缺資料顯 `—` placeholder(section 結構不收合);consumer `fields` label 撞 default 時 consumer 值 win(dedup canonical,詳 `profile-card.tsx`)
- **內容過長**:Body 在固定高度內以 ScrollArea 捲動,不 clamp 行數(見「Status 區」)

---

## 禁止事項

- ❌ 不要在 HoverCard 外直接用 ProfileCard 當 standalone card——它不是獨立 Card primitive,是 HoverCard content 模板,缺少浮層外殼(radius / border / shadow)與定位邏輯。需要 card 佈局時用專屬元件或自組 Surface
- ❌ 不要硬寫內部 Avatar size——ProfileCard Profile Header 的 avatar 尺寸由元件內部規格決定,consumer 覆寫會破壞 text column 對齊公式
- ❌ 不要 override HoverCard `z-index` / `sideOffset` / `collisionPadding`——浮層行為由 `../HoverCard/hover-card.spec.md` + `../../patterns/overlay-surface/overlay-surface.spec.md` 管理,單獨 override 會破壞跨浮層的一致 stacking
- ❌ 不要把非人員資料塞進 ProfileCard(例如檔案預覽、物件資訊)——ProfileCard 是人員專屬模板,語意不可挪用;其他 hover 詳情請自組 HoverCard content
- ❌ Status section 的狀態點不要自訂色——走 `--status-online/away/busy/offline` presence token canonical,與 Avatar status 同源,改色會跨元件漂移
- ❌ Action button 不要放動詞性 icon-only(例 Trash2 刪除)——ProfileCard actions 是關係型快速動作(Message / Invite / Follow),破壞性操作應走 Dialog confirm flow

---

## A11y 預設

> 命名對齊 DS canonical(2026-05-18,per `# 命名與語言一致性`)。本節原標題「無障礙」,改「A11y 預設」與其他 spec 一致。

- **Trigger 整合**:Avatar 作為 HoverCard trigger 時,`onFocus` / `onBlur` 與 mouseenter/leave 同時觸發由 Radix HoverCard 管理——鍵盤使用者 Tab 到 avatar 可自動顯示 card,Escape 關閉
- **Focus 順序**:Radix `HoverCard` 預設**不抓取 focus 進入浮層**——`HoverCardContent` 每次 render 用 TreeWalker 把浮層內所有 `tabIndex >= 0` 節點 set `tabindex="-1"`(`@radix-ui/react-hover-card` dist `index.js` 的 TreeWalker + `getTabbableNodes`;dist 行號隨安裝版本浮動,不 pin),刻意把 ProfileCard 的 action button / view more 移出 tab order。因此 hover-integrated 路徑下,鍵盤使用者 Tab 只停在 trigger(Avatar),**無法 Tab 逐一聚焦浮層內的 action / view more**(與 Popover 的 focus trap 截然不同,這是 HoverCard 作為「hover-only 預覽」的刻意設計)。需要鍵盤可達 action 的情境應改用 Popover / Dialog,不要用 HoverCard
- **Live region 語意**:ProfileCard 是展示內容,非 announcement,不套 `aria-live`
- **DL 語意**:Info Fields 使用 DescriptionList(`<dl>/<dt>/<dd>`),screen reader 會讀成「term X, description Y」對話;詳見 `../DescriptionList/description-list.spec.md`「無障礙」段
- **CTA button aria-label**:icon-only action button 必須帶 `aria-label`(「傳訊息給 {name}」「加入 {name} 為好友」),不只是 icon 視覺
- **色彩對比**:Status badge `bg-muted` + `text-foreground` / Avatar status 圓點均通過 WCAG AA,不依賴單一色彩載體(搭配文字標籤)

---

## 為何無 SizeMatrix

- **無 SizeMatrix**:ProfileCard 固定 **320px 寬**(元件級常數,見本 spec「寬度」段),跨 consumer / variant 不變——人員資訊卡的 canonical width 屬於元件自身,不抽為 token。Section 高度由內容撐開,無 size tier。

對應 anatomy story:保留 `Overview` + `Inspector`(section 開關 Controls,單組合互動檢閱)+ `SectionMatrix`(side-by-side 組合矩陣)+ `ColorMatrix`(Status 色)+ 元件特有 `HoverCardIntegration`(canonical usage pattern)+ `StateBehavior`(空值 / 過長文字邊界)+ `Accessibility`。

---

## 相關

- `../HoverCard/hover-card.spec.md` — ProfileCard 的浮層容器（觸發與定位由 HoverCard 負責）
- `../Avatar/avatar.spec.md` — Profile header 的身份視覺（Avatar 的 `hoverCard` prop 自動整合 ProfileCard）
- `../Tooltip/tooltip.spec.md` — 純文字 hover 提示（ProfileCard 是可互動 hover content）
- `../DescriptionList/description-list.spec.md` — Info fields 的 label / value 佈局
- `../Button/button.spec.md` — Action button（Message / Invite 等 CTA）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `avatar.spec.md`
- `description-list.spec.md`
- `hover-card.spec.md`
- `people-picker.spec.md`
- `tag.spec.md`
