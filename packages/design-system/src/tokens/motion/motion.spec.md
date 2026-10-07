---
component: motion
family: token
variants: {}
sizes: {}
traits: []
benchmark:
  - Material Design 3 motion tokens: m3.material.io/styles/motion/easing-and-duration
  - Carbon Design System duration tokens: carbondesignsystem.com/guidelines/motion/overview
  - Atlassian @atlaskit/tokens motion: atlassian.design/tokens/all-tokens#motion
  - Radix Tooltip delayDuration: radix-ui.com/primitives/docs/components/tooltip
  - MUI Tooltip enterDelay: mui.com/material-ui/api/tooltip
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Motion 設計原則

> **Foundational SSOT rationale**(2026-05-18 ship per user 拍板 #3A):跨 5+ overlay 消費者
> (Tooltip / HoverCard / ProfileCard / Avatar / OverflowIndicator)的 hover 開啟 / 關閉延遲統一。

## 定位

Hover delay token 是「hover 觸發 → 延遲 N ms → overlay 顯示」的延遲時間(對齊 token 名 `delay` 術語)。**目的不是動畫長度,是「user 真的想看」過濾器** — 短暫滑過不該觸發 expensive overlay(ProfileCard fetch 資料 / Tooltip 視覺擾動)。

**Scope**:motion token 統一在 `--motion-*` 前綴下,兩個 sub-family:(A)**delay**(hover 開/關延遲,見下)(B)**進出場動畫**(overlay fade/zoom/slide 的 duration/easing/幾何,與原地展開收合的高度動畫,見「進出場動畫 token」段與「開合動畫:何時播、怎麼收尾」段)。overlay 開啟後的 fetch loading 視覺(skeleton / 留空)屬各 consumer 元件 spec,不在 motion token scope。

## 三層 tier 系統

| Token | 值 | 用於 | 為何 |
|---|---|---|---|
| `--motion-delay-plain` | `500ms` | Tooltip 純文字提示 | 被動 hint,需 user「真停留」才觸發,避免滑過列表時 N 次視覺擾動。對齊 Material 3 plain tooltip 500ms / Apple HIG ~500ms / shadcn-Radix default 500ms 主流共識 | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| `--motion-delay-rich` | `700ms` | HoverCard / ProfileCard 內容預覽 | 含 avatar / fields / actions 的 rich content(可能含 fetch)。User 必須「真的想看」才停留 700ms,避免列表掃視時誤觸發 N 個 fetch waterfall |
| `--motion-delay-close` | `200ms` | 所有 overlay 關閉 | Mouse leave 後給 200ms 緩衝(user 可能誤滑出再回來)。對齊 UX 共識「close delay ≤ open delay」+ 既有 Avatar `closeDelay={200}` 值 |

## 為何不用單一值 / 為何不沿用過去 200ms

- **過去 200/300ms 偏快**(2026-05-18 ship,2026-05-20 user 抓「太快很容易干擾人」撤回):200ms plain 滑過列表 N 次觸發 Tooltip 視覺擾動;300ms rich 在含 fetch 的 HoverCard 場景列表掃視會打 N 次 server request waterfall。
- **MUI/Ant 100ms 是 fast-tier 例外**:適合 form input help text 等「我就是要快」的 dense 場景,不適合通用 chrome tooltip。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **單一值** 失去 plain / rich 語意區分:ProfileCard 含 fetch + image + actions 應比 Tooltip(純文字)delay 長,單一值會讓 ProfileCard 滑過列表時整列誤觸發 fetch waterfall。
- **過短**(< 100ms):每滑必觸發 → 視覺擾動 + 不必要 server request。
- **過長**(> 1s):user 已不期待 overlay,等出來變干擾。

## 何時用 / 何時不用

| 場景 | 用哪 token | 為何 |
|---|---|---|
| Icon-only Button → 顯示文字提示 | `--motion-delay-plain` | 純文字輔助 |
| Avatar / Username → 顯示完整人物卡 | `--motion-delay-rich` | 含 fetch + multi-section content |
| OverflowIndicator → 顯示隱藏列表 | `--motion-delay-plain` | 純列表展開,無 fetch |
| Tag / Chip → 顯示說明 | `--motion-delay-plain` | 純文字 |
| 任何 overlay 關閉延遲 | `--motion-delay-close` | universal |
| Click-triggered Popover / Dialog | — | N/A,click 不適用 hover delay |
| Tooltip 鍵盤 focus 觸發 | — | N/A,直接顯示(對齊 WAI-ARIA APG) |

## 命名 rationale(per `# 命名與語言一致性` 3 test)

1. **既有 DS 詞彙**:`plain` / `rich` 對齊 FileItem `compact / rich` mode tier idiom(world-class richness gradient)
2. **世界級 idiom**:Material 3 documentation 公開使用「plain tooltip」+「rich tooltip」術語(verified URL above) <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
3. **跨元件無語意衝突**:`plain` 不撞 cva variant(無元件用 `variant="plain"`;Select / Combobox 另有 `display="plain"` prop value,屬不同 slot 且同「簡單呈現」語意方向,無認知衝突);`rich` 跟 FileItem mode 同義(content density gradient)

### Anti-pattern 避免命名

- ❌ `--motion-delay-tooltip` / `--motion-delay-hovercard` — 元件名綁定 → 新元件(Popover variant)用哪個?
- ❌ `--delay-200` / `--delay-300` — 用值不用語意 → 改值要 rename
- ❌ `--motion-hover-fast` / `--motion-hover-slow` — fast/slow 在 hover 語境語意模糊(對 user 來說「fast」應該是 instant?)
- ❌ `--hover-time` / `--mouseover-pause` — 自創縮寫,跨人不可讀

## 消費者

- `components/Avatar/avatar.tsx` — HoverCard openDelay / closeDelay 消費 `MOTION_DELAY_RICH_MS` / `MOTION_DELAY_CLOSE_MS`(原硬寫 300/200,migrate 到 token)
- `components/HoverCard/hover-card.tsx` — Root 預設 `openDelay`=`--motion-delay-rich` / `closeDelay`=`--motion-delay-close`(Radix HoverCard 無 Provider;2026-06-11 落地,原宣稱與 code 脫鉤)
- `components/Tooltip/tooltip.tsx` — Radix Provider 預設 delayDuration override 為 `--motion-delay-plain`
- `components/ProfileCard/profile-card.tsx`(consumer of HoverCard)— 繼承 `--motion-delay-rich`
- `components/OverflowIndicator/overflow-indicator.tsx`(consumer)— 用 `--motion-delay-plain`
- 任何 future overlay hover consumer 必 import 此 token(per M17 SSOT 必可傳播)

## 世界級對照

| Framework | plain hint delay | rich preview delay |
|---|---|---|
| Material 3(plain vs rich tooltip 分流)| ~500ms | ~500ms+ |
| Apple HIG / macOS native | ~500ms | — |
| Radix Tooltip | 700ms(設保守避 mobile / touch 誤觸)| N/A(consumer 自定) |
| shadcn(defer Radix) | 500ms(provider override)| N/A |
| Polaris | 400ms | — |
| Atlassian Tooltip | 300ms | — |
| MUI / Ant Tooltip | 100ms(dense form input fast-tier) | — |
| **DS canonical(本 spec)** | **500ms** | **700ms** |

500ms 對齊 Material 3 / Apple HIG / shadcn 主流共識(三家集中在 500ms),避 MUI/Ant 100ms(form input fast-tier 不適通用 chrome)+ Radix 700(過保守)兩極端。Rich 700ms 比 plain 多 200ms 反映 fetch / multi-section content「真的想看」門檻。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## 相關

- `../elevation/elevation.spec.md` — overlay 視覺層(z-index)
- `../../patterns/overlay-surface/overlay-surface.spec.md` — overlay 結構 SSOT
- `../../components/Tooltip/tooltip.spec.md`(consumer)
- `../../components/HoverCard/hover-card.spec.md`(consumer)
- `../../components/Avatar/avatar.spec.md`(consumer)
## 進出場動畫 token(2026-07-11 加,user 拍板)

Overlay(Tooltip/Popover/HoverCard/DropdownMenu/Dialog/Sheet/FileViewer)的 fade/zoom/slide 進出場動畫,值統一 token 化(原各元件硬寫 zoom-95/slide-2/duration-300 = M17 假 SSOT)。由 tw-animate-css(Tailwind v4,= shadcn 官方機制)的 `--tw-duration`/`--tw-ease` 變數綁定;共用 SSOT = `overlay-motion.ts`(overlayMotion/surfaceMotion)。

| Token | 值 | 用於 | 世界級對照 |
|---|---|---|---|
| `--motion-duration-overlay` | `150ms` | 輕量浮層(Tooltip/Popover/HoverCard/DropdownMenu) | Material short3 / Carbon moderate-01 / Polaris 150 / tw-animate-css 預設 **四家一致** |
| `--motion-duration-surface` | `250ms` | 模態面板(Dialog/Sheet/FileViewer,面積大位移遠→慢一階) | Material medium1 / Polaris 250 / Carbon moderate-02(240) |
| `--motion-easing-enter` | `cubic-bezier(0,0,0,1)` | 進場(減速,快起平滑落定) | Material standard-decelerate(企業級中性沉穩) |
| `--motion-easing-exit` | `cubic-bezier(0.3,0,1,1)` | 出場(加速) | Material standard-accelerate |
| `--motion-enter-distance` | `0.5rem`(8px) | slide 位移 | shadcn/Radix canonical(= 現行 slide-*-2) |
| `--motion-enter-scale` | `0.95` | zoom scale | shadcn default(= 現行 zoom-95) |
| `--motion-duration-disclosure` | `200ms` | 原地展開收合的高度動畫(TreeView 子項 / Accordion 內容 / AgentPanel 思考塊;共用 SSOT `disclosure-motion.ts`) | 現況值,不是新選的:三個消費者 2026-07-14 起實際渲染的都是 tw-animate-css 1.4.0 collapsible / accordion 工具類的預設 `.2s`(`node_modules/tw-animate-css/dist/tw-animate.css`),也是 `components/AgentPanel/agent-panel.spec.md`「思考塊開合 200ms」與舊 base.css accordion 的宣告。2026-10-07 收成 token(待辦總帳 T8,見「開合動畫」段) |

**幾何原型分層(正當差異,不強行抹平)**:輕量 popup = fade+zoom+slide-side(8px,朝觸發點);模態置中 = **fade+zoom、不位移**(Dialog/FileViewer;2026-09-09 修正 —— 原「slide-center」是 shadcn v3 在 keyframe 內重寫置中位移的 hack,Tailwind v4 的 `translate` 屬性不再被 keyframe 蓋掉,留著會變成從左上角飛入;shadcn v4 已拿掉 <https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/dialog.tsx>,詳 `components/Dialog/dialog.spec.md`「動畫」段);邊緣抽屜 = slide-edge 100%、正當無 zoom(Sheet)。統一的是**何時播 / 時長 / 曲線 / 收尾 / 減少動態**(全 7 浮層 + 各自的遮罩,見下方「開合動畫」段),非幾何原型(對齊 Material standard-vs-emphasized / Carbon productive-vs-expressive tier 分層)。

**a11y**:`prefers-reduced-motion: reduce` 下全 7 浮層(含遮罩)與 3 個原地展開收合都**不播**開合動畫 —— 動畫本身只宣告在 `motion-safe:` 底下(見下方「開合動畫」段「何時播」)。

> **更正(2026-10-07,待辦總帳 T7)**:這一行原本寫「`motion-reduce:animate-none` 全 7 浮層統一關進出場動畫(overlay-motion SSOT 保證,無漏)」,與事實不符 —— 那條守衛的權重是 (0,1,0),被守的 `data-[state=open]:animate-in` / `data-[state=closed]:animate-out` 是 (0,2,0)(屬性選擇器多一級),不論先後都是後者贏,所以減少動態對全部浮層、TreeView、Accordion、AgentPanel 思考塊**從來沒有生效**(修前實測:reduce 下 Dialog 照播 0.25s、TreeView / Accordion 照播 0.2s;`scripts/open-close-motion-invariant.mjs` 對修前建置 R1 全紅)。

## 開合動畫:何時播、怎麼收尾(2026-10-07,待辦總帳 T6 / T7 / T8)

由 Radix `data-state`(open / closed)驅動的開合動畫,只有三份 SSOT 可以宣告,元件**只寫幾何**(`data-[state=closed]:fade-out-0`、`slide-out-to-right` 這類只設定 `--tw-enter-*` / `--tw-exit-*` 變數的 class),不得自己寫 `data-[state=…]:animate-*`:

| SSOT | 檔案 | 時長 token | 消費者 |
|---|---|---|---|
| `overlayMotion` | `overlay-motion.ts` | `--motion-duration-overlay` | Tooltip / Popover / HoverCard / DropdownMenu(含子選單) |
| `surfaceMotion` | `overlay-motion.ts` | `--motion-duration-surface` | Dialog / Sheet / FileViewer,**各自的遮罩也吃同一份**(Sheet 遮罩 2026-10-07 前自己寫、吃 tw-animate 預設 150ms / ease,沒接 token —— 與 `components/Dialog/dialog.spec.md`「動畫」表「Overlay:同上」不符,已收回) |
| `disclosureMotion` | `disclosure-motion.ts` | `--motion-duration-disclosure` | TreeView 子項容器 / Accordion 內容 / AgentPanel 思考塊(Accordion.Content 內部就是 Collapsible.Content,同一節點也有 `--radix-collapsible-content-height`,共用 collapsible keyframe) |

**`disclosure` 命名**(三重 test):(1)DS 既有詞 —— `patterns/element-anatomy/item-anatomy.spec.md` 的「Tree disclosure」箭頭;(2)世界級 —— W3C APG「Disclosure (Show/Hide) Pattern」:「A disclosure is a widget that enables content to be either collapsed (hidden) or expanded (visible).」(<https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/>,2026-10-07 開頁核對)、Apple HIG「Disclosure controls」(<https://developer.apple.com/design/human-interface-guidelines/disclosure-controls>,同日核對頁名);(3)DS 內沒有別的 `disclosure` token / prop。tier 依「什麼在動」命名,與 `overlay` / `surface` 同一套(不綁元件名)。

不在此族:Sidebar 可收合群組(Collapsible 但沒有動畫,收起當下就隱藏)、Steps 內容與 DataTable 巢狀列(條件渲染)、AgentPanel 面板 / 訊息的進場(只有進場、沒有 data-state,`animate-in … motion-reduce:animate-none` 權重相同、後寫者勝,減少動態有效)、Skeleton 脈動、CircularProgress 旋轉(各自規格另有減少動態規則)。

**何時播 —— 只在 `motion-safe:` 底下宣告動畫**。不再用「無條件宣告動畫 + `motion-reduce:animate-none` 守衛」:守衛與被守的東西分住兩處、還要靠權重比輸贏,而 `data-[state=…]` 變體天生多一級權重,守衛必輸(上方「更正」)。改成動畫只在使用者沒有要求減少動態時存在,就沒有輸贏可比;reduce 下 Radix Presence 讀到 `animation-name: none`,關閉當下就卸載,開與關照常完成。

**怎麼收尾 —— 關閉後的樣子由 CSS 保持**(`closed-end-state.ts` 的 `holdClosedEndState` = `data-[state=closed]:fill-mode-forwards`,三份 SSOT 都帶)。
Radix 關閉時先把 `data-state` 改成 `closed`、等收起動畫的 `animationend`,之後才由 React 重畫把內容卸載或加上 `hidden`;tw-animate-css 的動畫工具類填充模式是 `var(--tw-animation-fill-mode, none)`,動畫最後一格一結束元素就回到自然的樣子(收合內容回到原本高度、浮層回到不透明)。中間那一格不閃,原本**只**靠 Radix Presence 在 `animationend` 處理器裡臨時寫上 inline `animation-fill-mode: forwards`、再用 setTimeout 撤掉(`@radix-ui/react-presence` 1.1.5 `dist/index.mjs:76-91`,原始碼註解自己寫「creating a flash of visible content」)—— 補丁成立的前提是 JS 收尾跟得上 CSS 動畫時鐘;跟不上的環境就會整段長回來一格以上(待辦總帳 T6「收合時子項閃一下才消失」;那是總帳對 user 回報的描述,不是 user 原話)。關閉狀態宣告 forwards 之後,最後一格(高度 0 / 透明 / 滑出畫面)是 CSS 狀態,一直保持到卸載,與 JS 何時收尾無關。只掛在 closed:打開那一段若也 forwards,高度會被鎖在量到的像素,內容之後再變高就長不出來。
世界級沒有一家把收合終態只交給「動畫最後一格 + JS 補丁」:MUI Collapse 收完寫 inline `height: collapsedSize` 再加 `visibility: hidden`(<https://github.com/mui/material-ui/blob/d544fdd3e0995405751acba7cb4db574338c4427/packages/mui-material/src/Collapse/Collapse.js#L283>);Ant 收合目標值 `{ height: 0, opacity: 0 }` 寫在 inline style(<https://github.com/ant-design/ant-design/blob/bde03c864b2e9feb7f86f86d8a4b4451f8aefa6a/components/_util/motion.ts#L11-L14>);PatternFly TreeView 以 transition-delay 等淡出結束才切 `visibility: hidden`(<https://github.com/patternfly/patternfly/blob/b704123859d43181df66d6ca11b0bf339b5b3a6a/src/patternfly/components/TreeView/tree-view.scss#L383-L407>);Primer TreeView 收合當下卸載(<https://github.com/primer/react/blob/c4189aa896eaf53b7ce41a71150df10d757732f1/packages/react/src/TreeView/TreeView.tsx#L626-L628>)。

**修前實測**(2026-10-07,68d7860d 建置;`scripts/open-close-motion-invariant.mjs` 讓 JS 收尾晚到 200ms):9 個有收起動畫的成員,動畫結束的當下全部看得見(TreeView 子項回到 224px 高、Accordion 58px、思考塊 54px、Dialog / Sheet / FileViewer / Tooltip / HoverCard / DropdownMenu 回到不透明),之後 12–13 格每一格都看得見;修後 0 格。本機 Chromium 在**不**延後收尾時 Radix 補丁撐得住,所以這個閃只在 JS 落後的環境出現 —— 量的是「終態是不是 CSS 狀態」這個性質,不是本機有沒有閃。

**時長 —— 綁 token,不吃外掛預設**。三份 SSOT 都以 `[--tw-duration:var(--motion-duration-*)]` 綁 motion.css。DS 自己的 CSS 不得重宣告 tw-animate-css 已有的同名 keyframe / `animate-*` 工具類:2026-07-14 引入 tw-animate-css 之後,舊 `styles/base.css` 的 `animate-collapsible-*`(150ms)與同名外掛工具類併進同一條規則、後寫者勝,實際一直是 200ms,卻和 `agent-panel.spec.md` 的 200ms 各寫各的(待辦總帳 T8);2026-10-07 刪掉 base.css 那份,實際時長收成 `--motion-duration-disclosure`(值沿用現況 200ms,畫面不變)。

**同族另見(本段不處理,已回報待辦總帳)**:(1)Tooltip 打開從沒播過進場動畫 —— Radix Tooltip 的打開狀態是 `delayed-open` / `instant-open` 不是 `open`(`@radix-ui/react-tooltip` `dist/index.mjs:103-104`),`data-[state=open]:animate-in` 對它不成立;要不要補、補哪一種是看得見的取捨。(2)Popover 收起從沒播過動畫 —— `popover.tsx` 在 `PopoverPrimitive.Portal` 與 Content 之間包了 Provider,Portal 外層那個 Presence 拿不到節點、關閉當下整個卸載(原始碼推導 + 實測 0 個收起動畫);修好會讓 Select / Combobox / DatePicker 等所有 Popover 消費者關閉時多 150ms 淡出,屬看得見的變化。(3)展開箭頭與內容的時長不同步:TreeView / Sidebar / AgentPanel 思考塊箭頭 150ms、Accordion 箭頭 200ms,內容一律 200ms —— 要不要同步、同步到哪個值,是看得見的取捨。

**機械強制**:`scripts/motion-ssot-invariant.mjs`(靜態:SSOT 以外不得宣告 data-state 開合動畫、提高權重的變體上的動畫一律 `motion-safe:`、SSOT 宣告關閉動畫就帶 `holdClosedEndState`、不重宣告外掛同名動畫、時長綁 token、規格寫的毫秒數與 token 同值)+ `scripts/open-close-motion-invariant.mjs`(瀏覽器:10 個成員 × 收尾晚到 200ms 的每一格 + 減少動態下的開與關)。兩支都有 `--selftest` 對照組。

## hover 回饋不做過渡(2026-09-10 user 拍板;2026-09-26 延伸到字色、外框與滑過淡入)

**規則**:凡是 hover 驅動的**顏色與顯隱**變化,一律**瞬間**切換 —— 包括:

| 變化 | 例 |
|---|---|
| 底色 | 列、選單項、按鈕、日期格的滑過底色(2026-09-10) |
| 字色 | 麵包屑 / 連結 / 表頭排序區 / 手風琴標題的滑過字色(2026-09-26) |
| 外框色(含畫成外框的 ring) | Chip、分段控制、輸入框、多行輸入框、滑桿把手的滑過外框(2026-09-26) |
| 滑過才出現的元素(opacity 0 → 1) | 列上的行內小按鈕(`ItemSuffix hoverReveal`)、檔案列的下載 / 重試換鈕、頭像移除鈕、表格連結格的編輯鈕(2026-09-26) |

不寫任何會把該屬性一起過渡的宣告:`transition-colors`、`transition-opacity`、`transition-all`、不帶後綴的 `transition`、列出該屬性的 `transition-[…]`;ring 另含 `transition-shadow`。同一組屬性若也被選中 / 聚焦 / 按壓改變(例:Chip 選中的外框與字色、輸入框聚焦外框),一併瞬間 —— CSS 過渡綁的是屬性,同一個屬性做不到「hover 改時瞬間、選中改時過渡」(滑鼠點選的當下指標就在元件上),留著過渡就等於 hover 也在過渡。

**user 原話**:

- 2026-09-10(底色):「第三題改成全部瞬間,確保有SSOT不要有漂移」。當時題目只問滑過的底色(A 全部維持 150 毫秒 / B′ 掃過的列面瞬間、浮層選單維持 / C 全部瞬間)。
- 2026-09-26(延伸,待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` 〇節 L9 / N4(3)):對「延伸到字色、外框、列上小按鈕淡入」回「確定這樣才是一致設計語言就做」;同意清單回覆「確保符合我們一致的設計語言且不違背世界級的設計且都有確保整個ds 是SSOT,避免漂移就照你建議做」。延伸的判斷:底色已瞬間,同一次滑過字色與外框卻 0.15 秒 = 同一個 DS 兩套手感,就是 user 要避免的漂移。

**為什麼**:過渡的時長必須短於「指標停在一個項目上的時間」,否則底色永遠追不上指標。表格列高 36–52px,指標以 500–1000px/s 掃過時每 **40–90ms** 就換一列,150ms 的過渡在每一列都完成不了 —— 畫面上會同時有兩三列半亮的拖尾(2026-09-10 量到 hover 最終色延遲 p95 **109ms**,其中 **84ms** 是過渡本身)。浮層選單雖然是「移到目標就停」、停留時間夠,但一個 DS 裡兩種 hover 手感就是漂移的來源,所以統一瞬間;字色、外框與滑過淡入同理(2026-09-26)。

**一手來源**(底色,三家資料格 / 清單完全不做 hover 過渡):

| 來源 | 證據 |
|---|---|
| MUI X DataGrid | `packages/x-data-grid/src/components/containers/GridRootStyles.ts` 列 hover 只設 `backgroundColor`,整檔 `transition` 只有 icon opacity 與欄位分隔線 |
| AG Grid | `styles/ag-grid.css` `.ag-row-hover::before` 只有 `background-color: var(--ag-row-hover-color)`;唯二含 background 的 transition 屬於「值變閃爍」 |
| VS Code | `src/vs/base/browser/ui/list/listWidget.ts` 產生的 `.monaco-list-row:hover` 等規則完全沒有 transition |
| (反例,不採用)Ant Design Table | `components/table/style/index.ts` td `transition: background-color ${motionDurationMid}` = 200ms |
| (反例,不採用)MUI ListItemButton | `ListItemButton.js` `getTransitionStyles(theme,'background-color',{duration: shortest})` = 150ms |

**唯一的例外(已登記)**:Checkbox、Radio(RadioGroupItem)與 Switch 保留 `transition-colors` —— 那條過渡的主人是 **checked ↔ unchecked 的狀態切換**(勾選框打勾、單選圓轉主色、開關滑動;Ant / Material 的核取框與切換鈕同樣會動),不是 hover;它們是控件大小的點目標,不是指標掃過去的列面。滑過的外框升階與它共用同一條過渡,這是例外的已知代價。例外必須在該行上方寫 `// @hover-transition-allow: <理由>`(`checkbox.tsx`、`radio-group.tsx`、`switch.tsx` 各一處)。Radio 2026-09-26 補登:它與 Checkbox 同一份狀態規格(`components/Checkbox/checkbox.spec.md`「狀態 › Radio」),先前漏列。

**不在本規則(不是 hover 觸發,保留過渡)**:選中切換類動畫 —— 分頁底線淡出 / 淡入(`after:transition-colors`;每個分頁自己的底線,不會滑過去)、原地展開收合(手風琴 / 樹 / 思考塊,`disclosureMotion`)、展開箭頭旋轉(手風琴 / 樹 / 表格,`transition-transform`)、輪播指示點寬度(`transition-[width]`)、側欄收合寬度、進度條數值、浮層進出場(本檔「進出場動畫 token」段)。

**不在本規則(2026-09-26 同意範圍未涵蓋,維持現況)**:hover 造成的**形變與高度** —— 微放大(`hover:scale-*`)與陰影升級(`hover:shadow-*` / `hover:[box-shadow:…]`)。目前用到的只有 AI 浮動按鈕(`components/AgentPanel/agent-panel-fab.tsx`,微放大 + 陰影 150ms)與滑桿把手的陰影(`components/Slider/slider.tsx`,外框已瞬間、陰影 150ms)。要不要也改成瞬間是另一題,未經 user 決定前不動。

**機械強制**:`scripts/hover-instant-invariant.mjs` —— 同一個 class 宣告單位(一個 `cn()` / `cva()` 呼叫、一個 `*className` 屬性、一個 class 值的 const 或物件屬性)裡,同時有「hover 驅動的底色 / 字色 / 外框 / ring / 顯隱」與「會過渡同一族屬性、作用在同一個目標(元素本身 vs `after:` 等偽元素 vs 子元素)的 transition」→ 紅。hover class 或 transition 寫在別的 const、經 import 或函式回傳再傳進來也算(例:Calendar 事件方塊的 `CAT_EVENT`、Textarea 的 `fieldDefaultChromeCompounds`)。`--selftest` 的正反例證明它該紅時會紅、該綠時不紅(個數不在此寫死 —— 2026-09-25 曾因這裡寫「六個」、補跨檔後沒跟上被抓到,待辦總帳 C12③)。**掃不到**:hover 由 JS 狀態驅動、class 裡看不到 hover 字樣的淡入(例 `opacity: visible ? 1 : 0`),這類由元件自己的規格負責,已知清單見待辦總帳。「底」的滑過疊層(`bg-interaction-hover`,background-image)本來就不會被 `transition-colors` 過渡,天然瞬間。

**落地範圍**:
- 2026-09-10(底色,一次改完):MenuItem / DropdownMenu 四種項目 / TreeView 列與展開箭頭 / DataTable 列 / Sidebar 選單鈕與兩個動作鈕 / 行內動作鈕與其底色層 / TimePicker 欄 / Calendar 格 / DateGrid 日期 / Button / ScrollArea 捲軸 / InlineEdit / FileItem 兩種列 / Carousel 指示點 / 欄寬把手。箭頭旋轉(`transition-transform`)與指示點寬度(`transition-[width]`)不是顏色,保留。
- 2026-09-26(字色 / 外框 / 滑過淡入):Accordion 標題字色 / Breadcrumb 連結 / Chip / SegmentedControl / Textarea / LinkInput 連結 / DataTable 表頭排序區字色與連結格編輯鈕 / Slider 把手外框 / ItemSuffix `hoverReveal`(三種列:選單項、樹、列)/ FileItem 狀態換鈕 / PeoplePicker 頭像移除鈕;Radio 補登例外。同規則的其餘宿主(Tabs 標籤字色、Field 外框、Sidebar 行內動作鈕、FileUpload 拖放區外框、FileViewer 縮圖外框(同一條 ring 也畫選中框,選中切換一併瞬間)、Carousel 箭頭、AgentPanel 訊息工具列)同日全部落地;閘 `hover-instant-invariant` 綠 = 全 DS 落地。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-panel-fab.spec.md`
- `dialog.spec.md`
- `file-upload.spec.md`
- `hover-card.spec.md`
- `sidebar.spec.md`
- `tree-view.spec.md`
