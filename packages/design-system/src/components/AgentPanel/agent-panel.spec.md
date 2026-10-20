---
component: AgentPanel
family: self-contained
traits:
  - hasInteractiveStates
  - isStructural
---

# AgentPanel 家族(智慧代理面板)

> 來源:提案規格 v4(2026-09-01 核心互動全數定案 + 2026-09-02 各單項拍板;Figma「Task-Desktop」
> 智慧代理頁 30:306094 六畫面 + 54:174061 附件,間距皆節點實測)。本檔為入庫後唯一 SSOT。

## 定位

- 產品右側智慧代理面板:一個家族資料夾、9 個元件 + 2 個附屬資產(AgentLogo / AgentFab),
  同 Sidebar 前例(單一 `agent-panel.tsx` 家族檔;標誌與 FAB 因 SVG 幾何量體獨立成
  `agent-panel-logo.tsx` / `agent-panel-fab.tsx`)。
- **實作基礎**:組合式——消費 ChromeHeader(header-canonical)、overlay-surface(SurfaceHeader/
  Footer)、Popover surface 配方、SelectMenu 同源 primitives(Popover+Command+MenuItem)、
  Radix Collapsible(經 disclosureMotion)、RadioGroup、Chip(assist 分支)、Tag、
  OverflowIndicator、CircularProgress、Dialog、Empty、Button 家族。無自建 primitive;
  唯一自建=AgentLogo/AgentFab 的品牌 SVG 資產(無既有 primitive 可對應)。
- **Layout Family**:self-contained 容器家族(面板=容器;各子元件按其節聲明消費對應 anatomy)。
- **世界級對照**:GitHub Copilot Chat panel(VS Code 右側欄)/ Notion AI side panel /
  Intercom Fin 面板同型:右欄固定寬 + chrome header + 卷軸訊息區 + 底部複合輸入。

## Token(本家族新增 3 個)

| Token | 值 | 家 | 出處 |
|---|---|---|---|
| `--motion-easing-swell` | cubic-bezier(0.4,0.14,0.3,1) | motion.css (C) 循環動態 | 循環「起」;Carbon expressive 參考 |
| `--motion-easing-settle` | cubic-bezier(0.2,0,0.38,0.9) | motion.css (C) 循環動態 | 循環「收」;Carbon productive 參考 |
| `--motion-duration-shimmer` | 2s | motion.css (C) 循環動態 | shadcn shimmer 逐字(2026-09-02 實開頁複核) |

面板寬**沒有 CSS token**:預設 360 / 400 / 640 只住 `agent-panel.tsx` `AGENT_PANEL_WIDTH_MIN / DEFAULT / MAX`(與 `../AppShell/app-shell.spec.md`「版面規則」§1 同一份;400 = 稿全六畫面 rightSider 實測)。
`--agent-panel-width`(2026-09-02 立)**2026-10-15 退役**:執行期從來沒有任何讀取者(元件一直用 JS 常數 400),同一個值兩個住所(M17;r1b 複驗 F8)——
與 2026-09-21 退役 `-min` / `-max` 同一個理由;寬度一律經 `widthRange` / `width` / `defaultWidth` 設定。

標誌/FAB 環的漸層停駐色=**品牌資產常數**(oklch 內嵌,色相落於 DS 藍 252-268 /
紫家族(2026-09-02 user 拍板由藍→土耳其藍改為藍→紫,再依「所有顏色都要根據我們的設計語言」改為
**逐階取自自家 primitives.css light 色階**:藍緞帶 blue-3→7、紫緞帶 purple-3→7、紫底面陰影 purple-8、
藍提亮 blue-2、招喚波 blue-5→indigo-5→purple-5、FAB 環/光圈 blue-4 / purple-4;色相固定 258 / 294,
兩緞帶明度各跨 .37 保留原稿立體感,尾端停在 -7 使 dark `--surface-raised` 上仍可辨);品牌色不隨主題
(`tokens/color/color.spec.md`「品牌」段),資產內嵌 light 數值而非 var(),每個常數行尾 `// = --color-xxx-N`
由 `scripts/agent-logo-brand-scale-invariant.mjs` 機械比對(容差 .01);FAB 環/光圈只 import `AGENT_BRAND`。
SMIL keySplines 無法消費 CSS var,`agent-panel-logo.tsx` 內常數為 swell/settle token 值的
逐字鏡像(檔頭註記;改 token 必同步)。

## 何時用

- 產品頁右側需要常駐可開合的智慧代理對話(任務助理、資料問答、批次操作代理)。
- 代理需要人類拍板時(AgentDecisionCard)、需要回顧歷史對話時(歷史浮層)。
- 頁面需要一顆全域入口喚起代理(AgentFab,含有新訊招喚)。

## 何時不用

| 情境 | 改用 | 原因 |
|---|---|---|
| 單次確認/破壞性確認 | Dialog | 阻擋語意屬 modal,非代理協作卡 |
| 靜態說明/導覽提示 | Coachmark / Tooltip | 無對話回合 |
| 全螢幕沉浸式對話產品 | 產品自建頁面 | 面板定位=側欄輔助,非主畫面 |
| 一般表單輸入 | Field 家族 | AgentPromptInput 是代理複合輸入盒,非通用欄位 |

## 元件規格

### 1. AgentPanel(容器)

- 寬 = 這種內容類型的寬度設定(預設初始 400,`AGENT_PANEL_WIDTH_DEFAULT`)、全高;面=`bg-surface`;左緣分隔線**只有一個 owner**:可拖時由
  ResizeHandle 的 1px line 擁有(idle divider / hover border-hover / 拖曳中 primary;DataTable 欄間同款),
  `resizable=false` 才由容器畫 `border-l border-divider`(app-shell aside 前例)。兩者並存 = 2px 粗線
  (2026-09-02 user 抓到「比 aside 粗」;第二輪雙層 -3px 偏移已由單一元件收斂)。
- Anatomy:`[AgentPanelHeader][AgentConversation flex-1][AgentPromptInput]`;
  AgentDecisionCard 出現時絕對定位貼底覆蓋輸入區。
- 開合=淡入+自右滑入 `--motion-duration-surface`(模態面板級);減動作停。
- **可調寬**(`resizable`,預設開):左緣 `<ResizeHandle direction="horizontal" position="start">`
  (`patterns/resize-handle` 視覺 primitive:熱區 7、線 1、idle divider / hover border-hover / 拖曳中 primary,
  與 DataTable 欄寬把手同一顆 primitive,2026-09-02 起兩邊同元件);**並排與浮層都可拖**(user 2026-10-14 規格 U:4、U:55)。寬度 = 這種內容類型的最小 / 初始 / 最大(`contentType` + `widthRange={{ min, initial, max }}`),預設 360 / 400 / 640(`AGENT_PANEL_WIDTH_MIN / DEFAULT / MAX`,只住 `agent-panel.tsx`;CSS 沒有面板寬 token);
  可拉範圍、寬度紀錄與實際顯示寬的規則只住 `../AppShell/app-shell.spec.md`「版面規則」§5、§7、§9(本檔不重述)。受控 `width` +`onWidthChange`(拖曳中每格都發,
  受控端才有即時回饋)/ `onWidthCommit`(一次調整結束發一次:拖曳放開且有位移、鍵盤每按一下;只點一下不發 —— 「版面規則」§7;要落地儲存接這個);或
  非受控 `defaultWidth`。**無雙擊重設**(2026-09-02 拍板)。
  鍵盤:把手為 `role="separator"`(`aria-orientation="vertical"` + valuemin/max/now),
  ←/→ 每步 16、Home=最窄、End=最寬(DataTable 欄寬把手同語意:箭頭往哪、邊緣就往哪);
  聚焦可見=DataTable 同款 outline;減動作不影響(無動畫)。
- A11y:`role="complementary"` + `aria-label="智慧代理"`。
- **形態:並排 / 浮層(2026-10-14 起由 AppShell 決定)**

  面板住在 AppShell 的 AI agent 位置。何時並排、何時變右側浮層、可拉多寬、寬度紀錄,全部照 `../AppShell/app-shell.spec.md`「版面規則」(放得下就並排、放不下變浮層,每次用各區最小寬現算,**沒有固定門檻**);本檔只寫兩種形態各自長什麼樣:

  | 形態 | 長相與行為 |
  |---|---|
  | **並排** | flex 兄弟,佔版面、自然把 Main 推窄;可拖,上限 = AppShell 給的可拉上限;不抑制任何東西 |
  | **浮層** | `absolute` 貼右、上下貼齊;寬 = 寬度紀錄夾在「版面規則」§9 的範圍(最小 ~ min(最大, 版面寬 − 48)),**左側至少留 `--layout-space-viewport-inset`(48px)**;底色 `--surface-raised` + 陰影 `--elevation-200`(遮蓋型浮層必不透明,與 Sheet 同一組);底下鋪並存遮罩(`CoexistenceMask`,z-30、`--overlay`,**點擊關閉面板**;2026-09-17 裁示,取代 2026-09-16 的「點了不關」);**渲染拖曳把手**(2026-10-14 前「寬 = 容器 − 48、不渲染把手」已退場) |

  2026-10-14 前的「容器 ≥ 960 才並排、上限 `min(640, ⌊容器 × 3/8⌋)`、面板 ≤ 舞台 3/5、≤ 視窗 50%」整套被 user 2026-10-14 規格取代(「版面規則」§12);當時的原話留在 v14 來源總帳:2026-09-07「50% 基準由視窗改舞台」、2026-09-09「我覺得 960px 作為 agent 蓋板的斷點應該可以」。匯出常數 `AGENT_PANEL_SIDE_BY_SIDE_MIN_CONTAINER` 隨之退場。
  **不在 AppShell 裡單獨使用時**:AgentPanel 只算自己 —— 用同一支 `../AppShell/layout-model.ts`(`computeStandaloneAgentLayout`)、只排 AI agent 這一區(放得下就並排、放不下變浮層,沒有固定門檻);AI 建議,在 user 以 D:10 核准的 D:30 清單(新增項 N14)。宿主那一側的最小寬由 `hostMinWidth` 傳入(省略 = 0 = 只要放得下面板自己的最小寬就並排;工程決定);在 AppShell 裡不用這個 prop。

  浮層時抑制的是**宿主**(共用 `lib/overlay-coexistence.ts` 的 `inertOutside`:保留節點以外設 `inert`、頁面上不屬於任何控件的播報區 `[aria-live]`(Toast 區、DS 播報)照常保留,body portal 的浮層也被抑制;2026-10-07 前用 `aria-hidden` 套件的 `suppressOthers`,與 Radix 共用一份計數而在兩個對話框同時關閉時留下 `inert`,見該檔說明);宿主之外仍要可用的節點
  (瀏覽器 chrome:網址列、上一頁 / 下一頁、重新整理)由消費端以 `persistentElements` 傳入,與 Dialog 同一份契約
  (2026-09-09 user:「範例變成滿版狀態時,上面那虛擬的網址列完全無法點擊」—— 模擬瀏覽器的工具列不是宿主)。並排態不抑制任何東西。
  **疊在浮層上面的不是宿主**(AI 推導,2026-10-14 審查抓到):變成浮層那一刻**已經開著**、層級比面板高的層(一般確認框、AppShell 的 Menu 浮層 —— `../../tokens/elevation/elevation.spec.md`「疊放順序」第 6 列 `z-50` > 第 5 列 `z-[45]`)也留在保留集合裡,照樣可點、可聚焦;
  並存 modal(第 4 列 `z-40`)照舊在面板底下、被抑制。判定 = `agent-panel.tsx` `openLayersAbove`(開著的 `role="dialog"` / `alertdialog`、不在面板裡、在整頁疊放脈絡的層級高於面板);
  遮罩挖洞仍只看面板 + 遮罩 + `persistentElements`(上面那些層本來就畫在遮罩上方)。之後才開的層(例:面板裡開的改名對話框)本來就不在抑制範圍裡(`inertOutside` 只盤點開始那一刻)。

  「留一道邊 + 遮罩」是 2026-09-16 user 裁示(逐字見 v14「來源總帳(2026-09-16)」):「讓 agent panel 最左邊與視窗左邊維持一定的邊距(該邊距應該同滿版
  modal 距離視窗的最小邊距,應該是 48px?),且此時該 agent panel 底下會有滿版的遮罩,若點擊到該遮罩不會有任何反應故點擊遮罩不會關閉 agent panel,
  其單純只是用來讓使用者知道 agent panel 底下還有東西」。三個值全部借既有 SSOT、不新造:
  - **另一側留白** = Dialog 的 `--layout-space-viewport-inset`(`../Dialog/dialog.spec.md`「Viewport Inset」是 owner);2026-10-14 起語意是「浮層另一側至少留 48px」(user U:55),寬度不再是「版面寬 − 48」撐滿,而是照紀錄(「版面規則」§9);
  - **遮罩點擊行為改動(2026-09-17 user 裁示)**:原裁示(2026-09-16,逐字保留在上方)是「若點擊到該遮罩不會有任何反應故點擊遮罩
    不會關閉 agent panel」;2026-09-17 user 改裁示為**點擊遮罩關閉面板**。**後者取代前者**,舊句不刪(M36:兩條裁示都是 user 的,
    保留才看得出演變)。改動理由與 DS 既有語言一致 —— `../Dialog/dialog.spec.md`「Overlay click:點擊 overlay 關閉」、
    「洞外點下去是外部點擊 → 關閉(modal 語意)」,先前的「點了不關」反而是那條線上的例外。
    **並存 modal 時只關面板、modal 留著**(2026-09-17 user 在 a / b 兩案中選 a):遮罩在面板的保留集合裡,並存 modal 的
    外部點擊守衛看到目標落在保留區子樹內就不關,所以並存邏輯一行未動;面板收掉後 modal 自然完整露出。
    **API**:`AgentPanel` 新增 `onClose`(命名依據 `ds-canonical/references/props-naming.md`「關閉 overlay session」,
    與 Dialog / Sheet / Popover 同名同義);面板不自己關 `open`,只發通知(同 `onModeChange` 的分工)。
    `onClose` **必填**(2026-09-18 修正):第一版寫成可選、理由是「向後相容」,結果沒傳的那些照舊點了不關,
    而全庫最像產品的那則範例(URL 註冊表示意)剛好沒傳 —— user 在預覽站上點遮罩「根本沒有任何反應」。
    面板自己關不了(`open` 住在 `AgentPanelDock`)= 沒有內建 fallback,依 §2「固定 anatomy 恆渲染」與
    M23(f)「無內建行為的 callback 一律必填 prop(型別層擋)」必為必填。鍵盤路徑:浮層時 Esc 也關閉面板(2026-10-14,見「Esc 與關閉語意」)。
  - **遮罩** = `lib/overlay-coexistence.ts` 的 `CoexistenceMask`,與並存 Dialog 同一層 `z-30`、同一顆 `--overlay`、同樣替 `persistentElements` 挖洞
    (浮層 `z-[45]`、遮罩 `z-30`;整張表 → `../../tokens/elevation/elevation.spec.md`「疊放順序」);它是面板根節點的**兄弟**,
    **接住**留白處的指標:**點它會關閉面板**(2026-09-17 裁示,見上方「形態」表),但不會穿到底下去關掉並存的 modal 或碰到宿主
    (2026-09-16 user 第二次回報:第一版遮罩 `pointer-events:none`,點擊穿過去打到 modal 的外部點擊偵測、把 modal 關掉;修法 = 遮罩在面板的保留集合裡、
    modal 的外部點擊守衛把常駐殼子樹裡的目標視為不關,Dialog 遮罩算洞時「遮罩不是洞」);面板的關閉有四條路(× / 入口鈕 / 浮層時點遮罩 / 浮層時 Esc,見「Esc 與關閉語意」);
  - **淡入** = 與面板同相的 `--motion-duration-surface`(見「動畫總表」),偏好減少動態時不淡入。
  「像 Sheet」只到外觀:面板**不是** Sheet、也不用 `SheetOverlay`(Sheet 遮罩是 z-50,會壓過並存 modal;且面板永不進 Radix 的 DismissableLayer 疊,見負向鐵律)。
  世界級對照:各家**預設**都是點遮罩即關 —— Material Components Web dialog 的 `scrimClickAction` 預設 `close`
  (<https://github.com/material-components/material-components-web/blob/master/packages/mdc-dialog/README.md>)、
  Ant Design Drawer 的 `maskClosable` 預設 `true`(<https://github.com/ant-design/ant-design/blob/master/components/drawer/index.en-US.md>)、
  Radix Dialog 外點即關(要不關才寫 `onPointerDownOutside` + `preventDefault`,
  <https://github.com/radix-ui/website/blob/main/data/primitives/docs/components/dialog.mdx>)。
  **2026-09-17 之後本元件與各家預設一致**;2026-09-16 到 09-17 之間的「點了不關」才是那條線上的例外(三家都提供關掉此行為的開關,所以那一版也不是憑空發明)。
  浮層用 absolute 而不是把宿主推走:浮層不佔並排空間(user U:53),不改變底下內容的版面;變回並排時才由 AppShell 重排。
  形態以 `data-agent-panel-mode` 標在根節點,並由 `onModeChange` 回報給消費端。

  **浮層時從代理導向 Main → 代理收成入口鈕(2026-09-09 user 推翻 AI 推導;2026-10-14 保留)**:浮層時「內容與 agent 同時運作」
  (v14 原文)不可能成立;user 原話「開啟 agent 點內部連結當然要有優先呈現該連結內容啊,怎麼可能讓 agent 還霸道佔位?」。
  所以代理內任何導向 Main 的動作 —— 內部連結、有網址的 modal、沒有網址的確認框按「確認前往」—— 都讓代理收成入口鈕、
  Main 顯示目標;對話、草稿、閱讀位置全部保留(下方「關閉不等於卸載」);並排態不變,代理維持開啟。
  點入口鈕重開 → 浮層再蓋回 Main,Main 上並存中的 modal 在它後方暫不可操作、按 × 又顯露。
  2026-10-14 user 規格 U:12 寫「唯一會連帶關閉其他面板的情況」是要求 Right panel;這條收的是代理自己、不是「其他面板」—— AI 建議保留,
  user 以「其他app shell 我沒意見的部分…就照你建議做」核准(D:23;`../AppShell/app-shell.spec.md`「版面規則」§4)。
  **實作契約**:面板**不知道連結**,收合是消費端在自己的內部導航裡做的。**在 AppShell 裡**:同一個事件裡呼叫 `useAppShell().navigateFromAgent()`
  (AppShell 知道形態:浮層 → 收起、焦點回 Main;並排 → 不動;`../AppShell/app-shell.spec.md`「版面規則」§4 末條,2026-10-14 審查抓到模型的這一條沒有任何執行面呼叫它而補上)。
  **單獨使用時**:用 `onModeChange` 記住形態,「浮層且代理開著 → `onOpenChange(false)`」;目標是頁面時把焦點交給 Main(`<main tabIndex={-1}>`,AppShell skip-to-main 同款),
  目標是 modal 時由 Dialog 開啟時自己聚焦。瀏覽器 chrome 的上一頁 / 下一頁不是「代理內的動作」,不收合
  (2026-10-14 依據改寫、結論不變:HTML Standard 的 close request 例子是「桌機的 Esc」與「Android 等行動平台的返回鍵」,
  <https://html.spec.whatwg.org/multipage/interaction.html#close-requests>;桌機上一頁不在其中、只做歷史導航;Radix / Headless UI 的浮層也不綁 history。
  浮層時的 Esc 關閉走 keydown(`useEscapeRegion`),不用 CloseWatcher —— 用了會讓 Android 返回鍵也一起收掉代理。原依據「Esc 永遠不關面板」已隨 2026-10-14 失效;
  2026-09-29 待辦總帳 OD3,完整對照在 `governance/planning/2026-09-06-agent-principles-v14.md` 來源總帳)。
  示範 `agent-panel.stories.tsx` UrlRegistryDemo;閘 `scripts/agent-url-registry-demo-invariant.mjs` S9。
  對照(同一條「模態抽屜選定目的地即讓位、常駐抽屜維持」):
  [Material navigation drawer:modal 供手機、選定項目即 `drawerLayout.close()`;standard 供平板 / 桌機、可與內容同時互動](https://github.com/material-components/material-components-android/blob/master/docs/components/NavigationDrawer.md)、
  [Material side sheet:standard 與主區域共存並可同時互動;modal 阻擋其餘畫面](https://github.com/material-components/material-components-android/blob/master/docs/components/SideSheet.md)、
  [Angular Material sidenav:`over` 浮在內容上並加背幕 / `side` 與內容並排並縮內容寬](https://github.com/angular/components/blob/main/src/material/sidenav/sidenav.md)、
  [Android supporting pane:compact 寬度把輔助內容放主內容下方或 bottom sheet,medium / expanded 才並排](https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts)。

  **量的是 AppShell 的版面寬,不是視窗**(「版面規則」§1:ResizeObserver 量 AppShell 根節點看得到的寬,不量 window、不含水平捲出去的部分 ——
  側欄收合、分頁切換都不會發 window resize)。排法的判定表 = `scripts/test-app-shell-layout-model.mjs`;
  瀏覽器閘 `scripts/app-shell-layout-invariant.mjs` 驗真頁面逐步等於模型,並守遮罩、層級(40 < 45 < 50)、把手外側命中與浮層時宿主不可操作(2026-10-14 取代已 retired 的 `agent-panel-breakpoint.mjs`)。

  **Toast 不為面板讓位**:並排或浮層,Toast 都以整個視窗為準、落在套件預設角落,可能疊在面板上 —— 刻意如此,不是 bug
  (user 2026-10-13 決定;規則、原話與理由只住 `../Toast/toast.spec.md`「落點」)。面板不向 Toast 登記或提供任何幾何。

### 2. AgentPanelHeader(標題列)

- chrome header 家族:消費 `<ChromeHeader>`(固定高 `--chrome-header-height`:md 48 / lg 56 隨 density);
  標題=chrome typography `text-body-lg font-medium`(16;`header-canonical.spec.md`「Title typography」)。
  **標題群 ↔ 動作群間距 = `--layout-space-loose`**(2026-09-02 user 拍板「chevron 至少與其右方按鈕距離 loose」):
  ChromeHeader 根層預設 `gap-2` 在長標題截斷時會讓 chevron 貼到 28px 圖示鈕(8px)、被讀成同一群;本面板以
  className 覆寫根層 gap 為 loose,其餘 ChromeHeader 消費者(Dialog / AppShell)不受影響。
  **不取 14**(2026-09-02 user 問「可否客製選 14」→ 判定維持 16):14 是 non-modal 浮層(Popover / Coachmark /
  Tooltip)的專屬檔(`popover.spec.md` Modal / Non-modal 字級表),AgentPanel 是與 AppShell aside 同級的常駐面板,
  改 14 = 與相鄰 aside 標題不同級,且標誌 24 / 箭頭 20 是照 16 字配的 tier(縮字後箭頭偏大);垂直置中不受影響。
- Anatomy:`[AgentLogo 24][gap-2][標題+chevron 複合觸發]…[新對話 +][ButtonDivider][關閉 ×]`。
  - 標誌+標題=側欄品牌區前例逐字(gap-2 + 24 標誌);標誌隨代理狀態動畫(思考=think 態)。
  - **標題+chevron 是同一顆觸發**(原生 button,幾何逐字沿用品牌區前例:`gap-2`、標題
    `text-body-lg font-medium` 單行截斷(消費 `<TruncatedText>`:截斷時才顯 tooltip 補全,
    owner `tooltip.spec.md:32` / 引擎 `truncated-text.spec.md`;禁手刻 truncate span)、零 padding、無懸停底;focus-visible ring 同 AgentThinking
    標題列):點標題或 chevron 都開歷史浮層;chevron 只是指示,**與 Select 觸發器 chevron 逐字同款**:
    色 `text-fg-muted`(neutral-7,`../Field/field-controls.spec.md` icon 純指示方向)、線粗同全域 1.75、
    尺寸走「字級↔icon tier」= 標題 text-body-lg 對應 `ICON_SIZE.lg` 20(select.tsx lg 同款)、
    開啟時 `rotate-180`(select.tsx / AgentThinking 同款;旋轉跟歷史浮層同一份時長與曲線 = `overlayIndicatorMotion`,見本檔「動畫總表」);第二輪覆核:禁用 Button 殼——會多出
    左 9 / 右 5 內距與 28 高懸停底,破壞品牌區間距;第三輪:16 改 20 是 tier 對齊,非新值。
  - 關閉=`<Button dismiss size="sm">`(header 專屬 sm);新對話=Button text sm iconOnly。
  - **固定 anatomy 恆渲染**:標題觸發、新對話 +、關閉 × 不因缺 callback 而消失——
    `onNewConversation`/`onClose` 為必填 prop;歷史相關 callback 可省略但列仍顯示
    (2026-09-02 根因:以 callback 有無決定渲染 → 各 story 面板長相不一)。
  - **新對話停用**:`conversationEmpty`(目前對話尚無已送出訊息)→ + 鈕 `disabled`,
    避免堆疊空對話(Claude / ChatGPT 同行為)。
  - ButtonDivider 置於自動高度 actions cluster(gap-2)內(action-bar 規則 3 誤觸保護;
    直接放固定高 chrome header 會退化為容器高)。
- A11y:每鈕 `aria-label`;標題觸發 `aria-haspopup="dialog"` + `aria-expanded`;
  改名/刪除 Dialog 關閉後焦點還給開啟它的行內動作鈕;那一列已隨歷史浮層收起 → 回標題觸發(全 DS 一支 `../../lib/overlay-focus-return.ts`,2026-09-30)。

### 3. AgentConversation(訊息卷軸區)

- ScrollArea(跨 OS 一致捲軸;Dialog body 同法)包 `flex-1`;內距 16(--layout-space-loose);**輪距 40**(我方↔代理)=
  8+24(工具列 xs 高)+8,懸停工具列絕對定位於輪距內,出現不推擠。
- **底部內距 = `--layout-space-bottom` 48**:最後內容(常駐工具列)→ 輸入盒的送出動作 = layoutSpace 規則 4
  「內容 → action button = bottom」(`tokens/layoutSpace/layoutSpace.spec.md` L118;2026-09-02 user 抓工具列貼輸入盒)。
- **常駐判定 = 本元件**:直接子 `AgentMessage` 中最後一則 `role="agent"` 的工具列常駐(在流內佔位),
  其餘懸停/鍵盤聚焦時瞬間出現(絕對定位,零推擠);consumer 不設 `pinned`(SSOT,各 agent 一致)。
- **自動捲到最新**:掛載與訊息數增加時捲到底;使用者往上捲離底部 > 40px 時不搶捲(ChatGPT / Claude
  「貼底跟隨、離底不擾」同款);由本元件實作,consumer 不自接。
- A11y:`role="log"` + `aria-live="polite"`。

### 4. AgentMessage(訊息)

- 我方:氣泡 `bg-secondary`、`rounded-md`、內距 8/12、max-width 85%、靠右;
  進場=淡入+下滑 8、0.15s。代理:無氣泡、全寬、text-body;內文連結由代理層樣式提供(`text-primary` / hover `text-primary-hover` + 底線,長文閱讀需要底線可掃描),**不是** Button link variant。
- 附件列(氣泡內文字上方):**`<Chip variant="assist">`**(按鈕語意;位置距氣泡緣左 12/
  上 8、與文字距 8;**chip 相互垂直/水平間距 4**=與 Combobox 內 Tag 區間距一致
  (combobox.tsx Tag area gap 預設 4;2026-09-02 拍板,非 ChipGroup filter 的 gap-2))。A11y:`aria-label="附件:{檔名}"`。

### 5. AgentThinking(思考塊)

- Anatomy:`[標題+chevron][內文:border-l border-divider + 左縮排 12 + 上距 8 之步驟串流]`。
- 標題狀態換字:進行中「思考中」/完成「思考過程」;AI 回覆中自動展開、回覆完自動收合。
- Chevron=accordion 慣例(Suffix 位、rotate-180、減少動態下不轉);旋轉跟下方思考內容同一份時長與曲線 —— `disclosureIndicatorMotion`,`--motion-duration-disclosure` 200ms、`ease-out`(本檔「動畫總表」;2026-10-13 起,原本 150ms 與內容 200ms 不同步;owner = `tokens/motion/motion.spec.md「展開箭頭跟它打開的東西同步」`);色=`text-fg-muted`
  恆定(同 Select/Combobox 觸發器 chevron:select.tsx `text-fg-muted`),**不吃微光、不隨懸停變色**
  (Accordion 亦僅 chevron 靜色;2026-09-02 拍板)。
- 微光:**僅文字**(標題字+正在寫入的最新一行);shadcn shimmer 參數(帶寬 3ch+40px、斜 20°、
  `--motion-duration-shimmer` linear);色階=基 fg-muted、亮帶 neutral-6(同一條中性階梯);
  reduced-motion 自停。**完成步驟靜態、色 `text-fg-secondary`**(次要層級,非 muted)。
- 開合=Radix Collapsible + `disclosureMotion`(`tokens/motion/disclosure-motion.ts`,與 TreeView / Accordion 同一份):`--motion-duration-disclosure` 200ms、ease-out;收起後保持高度 0 直到卸載;減少動態不播。
- A11y:標題=button + `aria-expanded`;內文不另設 aria-live(容器已是 live region)。

### 6. AgentToolbar(訊息工具列)

- 高 24;代理**最後一則**常駐(由 AgentConversation 判定,在流內佔位);其他訊息懸停/焦點時**瞬間出現**(滑過造成的變化一律不做過渡,`tokens/motion/motion.spec.md`;user 2026-09-26 對「全部瞬間」延伸(AI 的題目名)答「確定這樣才是一致設計語言就做」),
  絕對定位於輪距內、不推擠版面。
- `[複製][ButtonDivider][讚][倒讚]`=Button text xs + Tooltip;各鈕 aria-label。

### 7. AgentPromptInput(複合輸入盒)

- Anatomy:`[附件列?][值(多行)][工具列:+ … 送出/停止]`;外框 = **Textarea edit×default 同一組字串**
  (`components/Field/field-wrapper.tsx` 的 `fieldChromeStyles({ mode: 'edit', variant: 'default' })`:border-border、
  hover 一階 border-hover、focus-within 主色;radius 4 —— 單行欄位 / Textarea / 本輸入盒三種宿主同一份)。
  2026-09-02 user 抓「跟 Textarea 互動不同」→ 收斂為單一住所,禁自刻。
- 內距=欄位家族:上 `--field-control-py-md`、左右 `--field-px`、text-body;
  單行=32 等高鐵律。總高驗算:1+28(附件列)+32+40(工具列)+1=102=稿。
- 附件列=**Tag md 恆帶 ×**(`onRemoveAttachment` 必填;相互間距 4、距內緣 4);單列不換行,
  超寬=`../OverflowIndicator/overflow-tag-list.tsx` `OverflowTagList`(+N,浮層列出被藏 Tag)—— 與 Combobox 多選的 Tag 列同一份量測
  (規則 `../Combobox/combobox.spec.md`「單行溢出」:「+N」寬量真的、全部放得下就不留「+N」的位;2026-10-13 前用 `useOverflowIndices`
  + 寫死 48px 給「+N」留位、全部放得下也照留,最後一顆放得下卻被收進「+1」)。
  分工:輸入中 Tag(可 dismiss)、送出後 Chip assist 視覺(2026-09-01 拍板之本家族分工)。
- 鍵盤:`Enter` 送出、`Shift+Enter` 換行;**輸入法組字中的 `Enter` 是選字,不送出**(判準全 DS 一支 `../../lib/ime-composition.ts` `isImeComposing`;2026-09-30 前只看 `isComposing`,Safari 用注音按 Enter 選字的那一顆 `isComposing` 已是 false、只剩 `keyCode` 229,訊息會被直接送出)。
- 工具列高 40、鈕 xs、內距 8;`+`(`onAddAttachment` 必填)恆渲染;送出=Button primary xs;
  **送出↔停止**:代理進行中同鈕同位換實心正方,0.15s 淡切;停止態 `aria-label="停止生成"`。
  實心正方=**12/24 grid 自繪**(8px @ icon 16;= Material Symbols `stop` 480/960 比例,
  https://fonts.google.com/icons?icon.query=stop;lucide Square 填滿為 20/24 = 13.3px,較
  ArrowUp/Plus 線稿(14/24)視覺偏重,2026-09-02 user 抓「太巨大」後改自繪)。
- textarea `aria-label="訊息"`。
- **焦點**(2026-10-01,待辦總帳 OE30):textarea 握著焦點時用滑鼠按附件 ×、+、送出、停止、「+N」卡裡的 × —— 焦點與正在打的字都留在輸入盒,click 照常
  (同一個複合輸入控件的零件;判準全 DS 一支 `../../lib/pointer-press.ts` `keepFocusOnPointerPress`,外框與 +N 卡各掛一次,同 Combobox 觸發欄位;
  修前 Chrome 在 mousedown 把焦點交給那顆 ×、移除後掉到 body,接著打的字不見)。鍵盤移除(焦點在 × 上按 Enter / 空白)照 `../Combobox/combobox.spec.md`
  「Tag 操作 › 個別移除」的接力:下一顆 × → 前一顆 → textarea;+N 卡裡的 × → 直接回 textarea(`../../lib/collection-removal-focus.ts`,三份收成一支)。

### 8. AgentDecisionCard(決策卡)→ `agent-decision-card.spec.md`(2026-09-27 抽出,獨立 SSOT)

決策卡的外觀(繼承 Popover surface 配方 + SurfaceFooter)/ 選項卡與滑過 / 步進與跳過 / 產題守則 14 條,整段住在 `./agent-decision-card.spec.md`;本檔只留這個指標。

### 9. AgentDecisionSummary(決策回執)

- 決策完成後在對話流中的靜態回執:`border-border rounded-md`;問題=fg-secondary、
  答案=foreground。無互動。

### 附:歷史浮層(消費現成,不新增公開元件)

- **寬度 = Popover canonical `w-72`(288)**,不另訂(2026-09-02 user 問「寬度訂多少」:實測 ChatGPT 側欄 260、
  Claude 側欄 290,DS 既有 rich-popover 288 落在其間;面板最窄 360 時自標題左緣起仍有 312 可容)。
- **與觸發點距 = `OVERLAY_SIDE_OFFSET` 8**(`tokens/elevation/overlay-geometry.ts`;實測 popper wrapper
  translateY = 觸發鈕底 + 8;量測時分頁必在前景,背景分頁會凍在 slide-in 起點量到 0.5)。

- 可搜尋單選選單:SelectMenu 同源 primitives 之 DS 內部組合(Popover+Command+MenuItem;
  SelectMenu 資料驅動 API 放不下列級行內動作與進度圖示替換,故同源組裝——metrics 全同:
  容器 p-0/rounded-lg/elevation-200/minWidth 240、搜尋列 40、列 32/px-12/gap-8、組標 py-2)。
- 錨=標題觸發下緣+8(OVERLAY_SIDE_OFFSET);列=CommandItem `p-0 rounded-none` 包 MenuItem
  (select-menu.tsx 同源:選中列 `bg-neutral-selected`;標題單行截斷 `labelMaxLines={1}`,SelectMenu 列同款;
  後綴=MenuItem endContent slot 內 ItemSuffix hoverReveal + ItemInlineAction 16/18、gap 8、距列右緣 12,
  逐項對齊 inline-action.spec.md);組標=CommandGroup `heading`(MenuItem header,
  今天/昨天/更早)+ CommandSeparator;無結果=`<Empty>`(CommandEmpty);搜尋列 `h-8 py-0`(列高 40 守 SelectMenu)。
- 懸停/聚焦浮出「改名/刪除」(ItemSuffix `hoverReveal` + ItemInlineAction 16/18,**瞬間出現、不淡入** —— 2026-09-26 待辦總帳 L9「全部瞬間」延伸到滑過才出現的按鈕,規則住 ItemSuffix;2026-09-26 前 150ms 淡入);**鍵盤(2026-09-25 待辦總帳 B9 路線乙,user 逐字「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」;規則住 `ds-canonical/references/keyboard-model-canonical.md`「列上有小按鈕的一串」)**:改名/刪除**不在 Tab 路上**(09-25 前 4 列 = 8 站);搜尋框 ↑↓ 移反白,插入點在字尾時 `→` 進反白列的「改名」、再 `→`「刪除」(停住),`←` 退一顆、第一顆 `←` 回搜尋框;鈕上 ↑↓ / Home / End = 回搜尋框並移反白;鈕上 Tab / Shift+Tab 一下離開這一串(浮層照舊在面板裡繞圈);鍵盤反白的那一列浮出改名/刪除,焦點進到鈕上時反白列的框讓給那顆鈕(一個項目一個指示器)——「插入點在字尾」條件(搜尋框的 `→` 仍要能移插入點)與「鍵盤反白列浮出」是 AI 推導;Esc 不規定(照舊關浮層)。
  **Enter / Space 在行內動作上 = 啟動該動作**,不是選列——cmdk 的 Enter=選列由 Command 根統一擋掉(`../Command/command.spec.md`「A11y」;2026-09-02 實測補時本元件另寫了一份,2026-09-26 收回 Command,待辦總帳〇節「按鍵規則合併」);思考中列首圖示原地換 **CircularProgress 16**,等寬等高不動版面。
- 改名=Dialog(`autoHeight` 隨內容、寬 440 = DS 確認框/短表單慣例;Field「名稱」+Input 預填全選、`required`;
  **驗證走 `useFormValidation`**(2026-10-01,待辦總帳 N70;`../Field/form-validation.spec.md` 更新類):沒改停用、改了亮、還原再停;焦點在欄位裡不報錯(規則 1)、
  清空後直接按「取消」那一下不會被長出來的錯誤推走(規則 2 延後);**空白時「儲存」可按**,按了才顯示 FieldError「名稱不可空白」並把焦點移到欄位(規則 7 / 8;
  原「空白時停用」查無 user 原話且與 hook 的 submitDisabled 衝突,AI 推導改寫);Enter=儲存;**Esc 分兩層**:改過名稱第一下 Esc 回復、第二下才關
  (`ds-canonical/references/keyboard-model-canonical.md`「焦點所在的控件自己那一層也算一層」),沒改直接關);
  刪除=Dialog 危險樣式(`primary + danger`,同 autoHeight/440)。
  **刪當前對話契約**(consumer 實作,spec 定義):切到最近一則;全空→空狀態(NewConversation)。
- 選定→切換對話、標題同步、浮層關閉;Dialog 關閉後焦點:浮層仍開 → 回觸發它的行內動作(改名/刪除),浮層已關 → 回標題觸發(開啟時 `captureFocusOrigin` 記下行內動作鈕、關閉時 `returnFocusToOpener` 還,找不到就走標題觸發這條 fallback;2026-09-30 前是關閉後 `setTimeout 0` 聚焦標題的另一份實作)。
- 所有 callback(`onSelectConversation` / `onRenameConversation` / `onDeleteConversation`)可省略,列與動作仍渲染(固定 anatomy 律)。

### 附:空狀態

- 問候區圖示位=`<AgentLogo state="attract" size={48}>`(招喚態邀請開始);
  其餘照既有 Empty 元件(icon slot)。

## AgentLogo(標誌;附屬資產)→ `agent-panel-logo.spec.md`(2026-09-27 抽出,獨立 SSOT)

造型 / 三態(still / attract / think)/ 呼吸包絡 / 思考轉速與轉心 / 負空間形變 / 轉場與減動作,整段住在 `./agent-panel-logo.spec.md`(對應 `agent-panel-logo.tsx`);本檔只留這個指標。

## AgentFab(浮動開關鈕;附屬資產)→ `agent-panel-fab.spec.md`(2026-09-27 抽出,獨立 SSOT)

入口鈕的尺寸 / 環 / 動畫 / 標誌狀態跟隨 / 放置與互斥(`AgentPanelDock`)/ 遮擋與貼邊(`AgentFabDock`:命中區 = 可視形狀、家與貼邊兩種位置、右緣帶、拖曳 ≠ 點擊判準、等價路徑、區域 → 落點表),整段住在 `./agent-panel-fab.spec.md`(對應 `agent-panel-fab.tsx`);本檔只留這個指標。

## 附:anatomy 分層 rationale(2026-09-03 稽核補)

設計規格層提供 Overview / 尺寸對照表 / 色彩對照表 / 狀態行為 / 無障礙五節。**Inspector 判 N/A** 並寫在這裡(而不是只寫在
story 檔頭):本家族沒有可切換的視覺 variant/size prop —— 面板寬是連續值(拖拉/鍵盤即所見)、標誌狀態已由展示層
「標誌三態」與「思考起步與減速停止」承載、入口鈕形態由位置決定而非 prop,即時預覽面板會退化成一個沒有旋鈕的空殼。
其餘五節齊備,尺寸與色彩皆標 token 來源。

## 動畫總表

| 場景 | 動畫 | 級距 |
|---|---|---|
| 面板開合 | 淡入+右滑 | `--motion-duration-surface` 250ms |
| 浮層遮罩(AI agent 為浮層時)| 淡入,與面板同相 | `--motion-duration-surface` 250ms;減動作停 |
| 訊息/決策卡/送出↔停止 進場 | 淡入(+`--motion-enter-distance` 8) | `--motion-duration-overlay` 150ms |
| 非最後一則的工具列(懸停/聚焦才出現) | 瞬間出現(滑過造成的變化不做過渡) | 0 |
| 思考塊開合 | Radix Collapsible + disclosureMotion | `--motion-duration-disclosure` 200ms ease-out |
| 歷史浮層 | 照選單元件 | — |
| 歷史 chevron | 旋轉,與歷史浮層一起開始、一起停(`overlayIndicatorMotion`) | `--motion-duration-overlay` 150ms;打開 enter、收起 exit 曲線 |
| 標誌招喚呼吸(本體/疊層/單波/FAB 光圈) | 一息 3s;35% 吸頂 / 85% 到底 / 90% 波散盡 / 靜止空拍 | swell → settle → 停 |
| 標誌思考旋轉 | 起步 0.25s(=半圈,exit)→ 0.5s/圈 linear | 一息/12、一息/6 |
| 標誌思考洞形變 | 起步 0.25s 橢圓→圓(exit)/ 減速段圓→橢圓(0,0,0.7,1) | 與轉速同拍;等速持圓 |
| 標誌思考吸氣微亮 | 6s = 2 息 | swell → settle → 停 |
| 標誌思考減速停止 | 從當下角度以 exit 鏡像曲線續轉至正位 | 0.50–1.21s(Δ/(720°/s·0.7)) |
| 標誌狀態切換 | 新狀態淡入 | `--motion-duration-overlay` 150ms |
| 入口鈕吸邊 / 放回 | top / inset 位移 | `--motion-duration-surface` 250ms + enter |
| 思考 chevron | 旋轉,與思考內容一起開始、一起停(`disclosureIndicatorMotion`) | `--motion-duration-disclosure` 200ms ease-out |
| 輸入框邊框 | transition | `--motion-duration-overlay` 150ms |
| 減動作 | 互動觸發必可停;常駐 loop 全停、淡入停 | 見 AgentLogo 節 |

## 關閉不等於卸載(2026-09-07 G2)

**面板關閉時仍然渲染,只是 `display:none`。** 視覺上仍與入口鈕互斥(關著只看得到入口鈕),
但捲到哪、展開了哪些、面板內部的狀態全部留著 —— 這是 E 條「閱讀位置保存」與 F 條
「初始化為關閉」能成立的前提(原本 `if (open) return children`,關一次全部歸零,
初始關閉之後第一次打開必然是全新的面板,「回到原本在看的地方」根本無從談起)。

三個實作上的必要細節,少一個就不成立:

1. **外面包一層 `display: contents`**:面板通常是 flex/grid 的直接子項,憑空多一層盒子會改版面。
   `display: contents` 讓那層從盒子樹消失,實測子項寬度與沒有 wrapper 時逐像素相同。
   用 wrapper 而不是把 `hidden` 交給 render prop —— 交出去就會有人忘記套。
2. **`display:none` 而不是 `visibility:hidden`**:後者保狀態但**仍佔版面**。
3. **捲動位置要自己補回去**:實測祖先被 `display:none` 之後瀏覽器會把捲動位置歸零,
   而且 ResizeObserver 會以 0×0 觸發一次 —— 那一刻量到的數字全是 0,
   拿去更新「使用者剛剛在哪」會被洗成「貼在底部」。所以 `AgentConversation` 的
   自動捲動兩個 handler 都先擋掉「沒有版面」的情況,並記住最後一次看得見時的位置,
   回來時補上。**沒有版面時量到的數字不代表任何事,不能拿來做決定。**

機械閘:`scripts/agent-panel-reopen-state.mjs`。

**F 條的最後半句「原分頁離開宿主後返回」**(2026-09-29 補,待辦總帳 OE2):瀏覽器從 back/forward cache 還原舊畫面時元件不會重新掛載,`defaultOpen=false` 不會再跑;`AgentPanelDock` 聽 `pageshow`(`persisted` 才算)自己關回去,「新對話」由宿主聽同一個事件重設(示範 `UrlRegistryDemo`;閘 `scripts/agent-url-registry-demo-invariant.mjs` S14,persisted:false 必不動)。

## Esc 與關閉語意(2026-09-07 訂;2026-10-14 依形態分開)

**一句話**:Esc 只關「暫時性的東西」,而且只關**焦點所在那一區裡最內層**的那一個。**並排**的面板是常駐 app UI,Esc 永遠不關它;**浮層**的面板蓋在宿主上、讓宿主不能操作、點遮罩就關 —— 它本身就是一層暫時性的東西,裡面沒有更內層時 Esc 關閉它(= 按 ×)。

依據:[Microsoft 平台鍵盤指引](https://learn.microsoft.com/en-us/windows/apps/design/input/keyboard-interactions)逐字「The Esc key lets a user cancel transient UI (along with any ongoing actions in that UI).」「The Esc key only affects transient UI, it does not close, or back navigate through, app UI.」—— 並排 = app UI、浮層 = transient UI。同一個面板依形態切換 Esc 行為是通則:HTML `<dialog>` 以 `show()` 開的不被 Esc 關、以 `showModal()` 開的會(<https://html.spec.whatwg.org/multipage/interactive-elements.html#attr-dialog-closedby>);Fluent `OverlayDrawer` 底層是 Dialog、收到 Escape 就關,`InlineDrawer` 不處理(<https://github.com/microsoft/fluentui/blob/bde1e01ca1d4628ba0b6f0b24532a20cb97e5169/packages/react-components/react-drawer/library/src/components/OverlayDrawer/useOverlayDrawer.tsx#L37>);Material modal side sheet 返回鍵內建關閉、standard 要 App 自己接(<https://github.com/material-components/material-components-android/blob/60ff09436d5d477a4b9d02940f31eb01e1250620/docs/components/SideSheet.md#L380-L392>)。
**決定來源**:user 2026-10-14 問句「AI agent 若變為浮層的情況難道點擊esc不用關閉？」(U:83);AI 建議浮層時關、並排不變,user 以「其他app shell 我沒意見的部分…就照你建議做」核准(D:22;`governance/planning/2026-10-14-app-shell-layout-user-spec.md`)。2026-09-07 到 10-14 的「Esc 永遠不關它」是 AI 在「並排時 Esc 歸誰」題目下推出、沒限定形態的條文,user 2026-09-16 以「照你建議開工」採納 AI 的「其餘不動」(含 Esc;v14 來源總帳 09-07 / 09-16 兩列,後者標「AI 建議、user 採納」)—— 「浮層時 Esc 不關」那一格 user 從沒單獨決定過,10-14 依上句核准改成依形態分開。

| 形態 | 焦點與狀態 | 第一下 Esc | 第二下 |
|---|---|---|---|
| 並排 | 在面板內,裡面開著選單 / 歷史浮層 / Tooltip / 確認框 | 只關那一層,焦點回開它的那一個 | 什麼都不關 |
| 並排 | 在面板內,裡面沒有任何浮層 | **什麼都不關** | — |
| 浮層 | 在面板內,裡面開著選單 / 歷史浮層 / Tooltip / 確認框 | 只關那一層 | **關閉面板** |
| 浮層 | 在面板內,裡面沒有任何浮層 | **關閉面板**(= ×:開關紀錄變關;對話、草稿、閱讀位置保留,見「關閉不等於卸載」;決策卡關掉 ≠ 回答,重開時還在);焦點回入口鈕 | — |
| 浮層 | 底下壓著有網址的 modal、焦點在面板 | 關閉面板,modal 留著(與點遮罩的 a 案同一個結果) | 交給露出來的 modal |
| 浮層 | 輸入法組字中 | 只取消組字,什麼都不關(`../../lib/ime-composition.ts`) | 照上列 |
| 任一 | 焦點在面板裡改過、還沒存的欄位 | 欄位自己那一層先(`ds-canonical/references/keyboard-model-canonical.md`「焦點所在的控件自己那一層也算一層」;宣告了卻沒認領的那一下照常往下關,不困住使用者) | 照上列 |
| 任一 | 焦點在面板外(Menu / Main / Dialog)且那裡開著浮層 | 關該區自己的浮層,不跨區碰面板(作用域封閉在焦點所在區) | — |

**焦點**(AI 推導,WCAG 2.4.3):浮層形態**開啟時焦點進面板**(同 Dialog / Sheet;落在輸入盒);並排形態不移焦(維持現行)。**用鍵盤**關閉(浮層時 Esc、焦點在 × 上按 Enter / 空白鍵)後焦點回入口鈕 —— 入口鈕在面板開著時卸載、關閉時重掛,要還給新掛上的那一顆(`AgentPanelDock`);用指標關閉(點 ×、點遮罩)不搬焦點:被程式聚焦的入口鈕會自己彈出提示,點完 × 冒出一個提示不是使用者要的(2026-10-14 實作時量到,機械閘 `scripts/overlay-detached-anchor-invariant.mjs` A;規格階段原寫「Esc 或點遮罩」,點遮罩那半依此收窄)。因版面被連帶關閉(「版面規則」§4)時焦點回 Main(同檔 §10)。

**機制只有一個判定點**(2026-10-01):原本 `agent-panel.tsx` 自己掛一支 window 捕獲監聽(Radix 在 document 捕獲階段收 Esc、只送給疊最上層而不看焦點在哪一區;
window 結構上一定早於它)。「這一下 Esc 該不該關浮層」全 DS 收成 `../../lib/overlay-escape.ts` 一支:面板的分區判定 = `useEscapeRegion(rootRef)`(行為逐條保留,
含 Tooltip 特例;留住的那一下記成「已交給控件」,面板裡改過的欄位才讀得到這一下是給它的),浮層守門 = `withOverlayEscape`(「焦點所在的控件自己那一層也算一層」,
`ds-canonical/references/keyboard-model-canonical.md`)。

**關閉路徑**:header 的 `×`、FAB 的切換、**浮層時點面板外的遮罩**(2026-09-17 user 裁示;2026-09-16 到 09-17 之間是「點了不關」,已被取代)、**浮層時 Esc**(2026-10-14,上表)。另有兩種由版面引起的收起:浮層時從代理導向 Main(上方「形態」後段)、使用者要求 Right panel 而放不下時的連帶關閉(`../AppShell/app-shell.spec.md`「版面規則」§4)。浮層的 Esc 加在同一個判定點 `useEscapeRegion`,**不**進 Radix 的關閉疊(下節負向鐵律不變)。

### 負向鐵律:AgentPanel 永不進入 Radix 的 DismissableLayer 疊

這是本家族**唯一的單向門** —— 一旦哪天有人把面板包進 `DismissableLayer`(或任何自帶 dismiss 的 Radix primitive:`Popover.Content` / `DropdownMenu.Content` / `Dialog.Content` / `HoverCard.Content`),上表會同時失效,而且**是靜默失效**:

- `dismissable-layer.tsx:59-61` 把 Esc 只送給疊最上層、不看焦點在哪一區 → 面板一旦入疊,並排時也會在「它剛好是最上層」時被 Esc 關掉(和上表並排列直接相反),浮層時的「焦點所在區、先關內層」也被「只看最上層」取代;
- 入疊還連帶吃到 `disableOutsidePointerEvents`(外點關閉)與焦點 trap,面板會從常駐 app UI 變成暫時性浮層。
- 浮層時的遮罩是面板自家渲染的 `CoexistenceMask`(點擊 = 關閉面板,不是 Radix 的 dismiss 語意),**不是** Radix Overlay;「像 Sheet」只到外觀,不得改用 Sheet / SheetContent 承載面板。

因為靜默,所以配一支機械閘:`scripts/agent-panel-dismissable-layer-invariant.mjs`。

## 禁止事項

- ❌ 手刻 chrome header / 浮層殼 / row 結構(必消費 ChromeHeader / overlay-surface /
  MenuItem 家族)。
- ❌ AgentDecisionCard 加 Esc / 外點關閉(阻擋語意)。
- ❌ 標誌動畫另立第三種本體語言(蓄勢=招喚態同款;「變淡」已於 2026-09-02 收斂棄用)。
- ❌ 附件在氣泡內用 Tag 或 FileItem(送出後=Chip assist 視覺;輸入中才是 Tag)。
- ❌ 思考塊微光套到已完成步驟(僅標題+最新一行)。
- ❌ 寫死面板寬(`style={{ width }}` / 寬度 class):寬度一律經 `widthRange` / `width` / `defaultWidth`,實際顯示寬與範圍由「版面規則」§5、§7、§9 算。
- ❌ 讓 AgentPanel 進入 Radix 的 DismissableLayer 疊(見上節負向鐵律;機械閘
  `scripts/agent-panel-dismissable-layer-invariant.mjs`)。
- ❌ 並排時用 Esc 關閉面板本身(並排是常駐 app UI;只有浮層時 Esc 才關,見「Esc 與關閉語意」)。
- ❌ 用 Sheet / SheetContent 承載浮層(進 DismissableLayer 疊、遮罩 z-50 壓過並存 modal)。
- ❌ 手刻 `bg-overlay` 遮罩(浮層遮罩 = 與並存 Dialog 同一支 `CoexistenceMask`;機械閘 `scripts/app-shell-layout-invariant.mjs`)。
- ❌ 把 `onClose` 寫成可選、或以「有沒有傳 `onClose`」決定遮罩點了關不關(2026-09-18:這樣寫過一次,沒傳的範例就靜靜地點了不關;
  機械閘 `scripts/agent-panel-fixed-anatomy-invariant.mjs`)。

## 邊界案例 scope

- `hasVariants=false`:家族各元件無視覺 variant 軸(結構分支如 Chip assist 屬 Chip 元件)。
- `hasSizes=false`:面板寬/列高/鈕尺寸全由消費的 primitive/token 決定,無獨立 size 軸。
- Field 家族空值/驗證:AgentPromptInput 空值時送出鈕不可按(剛送出而變空的那一刻送出鈕握著焦點 → 不轉原生 disabled、焦點留在原鈕,
  `../Button/button.tsx` 可聚焦的停用);改名 Dialog 走 form-validation 更新類規則(未異動停用/dirty 亮/還原再停;空白可按、按了報錯並移焦點 ——
  2026-10-01 前這裡寫「空白時一併停用,避免可按卻無反應」,查無 user 原話,且 hook 下按了會報錯移焦點,前提不成立,見上方「改名」條)。

## Loading / 無障礙預設

- 代理回覆中:列首 CircularProgress 16(歷史列)、送出鈕變停止、AgentThinking 展開+微光。
- 全家族鍵盤:chevron/工具列/決策卡各自獨立焦點站;focus-visible 藍框;
  radiogroup/menu 原生方向鍵。
- 螢幕閱讀:面板 complementary、對話 log/polite、決策卡 group、停止態改名 aria-label。

## 相關

- `components/AppShell/app-shell.spec.md`「版面規則」(形態、可拉上限、寬度紀錄、連帶關閉的唯一住所)
- `components/Sidebar/sidebar.spec.md`(家族資料夾前例)/ `patterns/header-canonical`
  / `patterns/overlay-surface` / `components/Chip/chip.spec.md`(assist 分支)
  / `components/Tag` / `components/OverflowIndicator` / `components/CircularProgress`
  / `components/Empty` / `components/RadioGroup` / `components/Dialog`
  / `tokens/motion/motion.css` / `tokens/uiSize/uiSize.css`。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-decision-card.spec.md`
- `agent-panel-fab.spec.md`
- `agent-panel-logo.spec.md`
- `app-shell.spec.md`
- `motion.spec.md`
- `overflow-indicator.spec.md`
- `toast.spec.md`
