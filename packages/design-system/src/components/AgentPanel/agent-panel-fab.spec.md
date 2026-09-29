# AgentFab / AgentFabDock 設計原則(AgentPanel 家族附屬資產;獨立 SSOT)

> **本 spec 是 AgentPanel 家族入口鈕的獨立 SSOT**(2026-09-27 從 `agent-panel.spec.md`「AgentFab(浮動開關鈕;附屬資產)」節整段抽出,避免單一 spec 過長(674 行 > 500 硬上限,待辦總帳 N19);內容零改動,只加本檔頭、檔尾指標,與 N23 / N36 兩處改寫(見該處標註))。家族定位 / Token / 何時用 / 動畫總表 / 關閉語意 / 禁止事項仍住 `./agent-panel.spec.md`;程式碼對應 `agent-panel-fab.tsx`(`AgentFab` / `AgentFabDock`)與 `agent-panel.tsx`(`AgentPanelDock`)。
>
> **Layout Family**:同 `agent-panel.spec.md`(self-contained 容器家族);入口鈕是圓形 iconOnly 按鈕,本檔不另立 family。

## AgentFab(浮動開關鈕;附屬資產)

- 40 圓=`--field-height-lg` 於 lg 密度;圓形 iconOnly;面=`bg-surface-raised`+
  `--elevation-200`(不寫死白色);內置 24 標誌(同一造型)。
- 外框=AI 觸發鈕特調:錐形(環向)漸層描邊 2px(整數寬+環向漸層=正圓對稱);
  兩極=`AGENT_BRAND` 藍 258 / 紫 294(= `--color-blue-4` / `--color-purple-4`;品牌資產常數,agent-panel-logo.tsx 唯一數值來源;各落於兩緞帶
  色相家族內;2026-09-02 藍→紫改色)。
- 動畫:待機=靜止(=標誌 still 態;2026-09-02 拍板全家族待機一律靜止);
  有新訊=招喚態(標誌蓄勢;漣漪由邊框光圈代位:0–35% 貼邊聚亮至 .35(swell)→ 35% 呼氣起點
  自邊框射出 r 21→27(settle)→ 90% 散盡 → 靜止空拍;寬 2.5;與標誌同 dur/keyTimes/曲線、同一
  commit 掛載故同相;光圈漸層=環同兩極同方位);懸停=陰影升一級+微放大;點擊=開面板。
- 減動作:光圈屬位移 loop → 全停(標誌內部自回靜止)。
- **標誌狀態跟著面板裡的代理走**(prop `logoState`,與 `AgentPanelHeader.logoState` 同名 —— 產品端同一個變數餵兩邊;
  2026-09-03 user 拍板「若開啟的 session 是思考中,FAB 的 logo 也應該是思考中」):入口鈕 = 那個對話**收起來的樣子**,
  不是另一個獨立的東西 —— 代理在回覆時即使面板關著,入口鈕標誌照樣轉(`think`);有新訊 = 招喚(`attract`,標誌蓄勢
  + 邊框光圈);閒置 = 靜止(`still`)。兩種形態(40 圓 / 28 貼邊)都跟,尺寸變、狀態不變。光圈只給招喚態:思考態的
  訊號是標誌自己在轉,再加光圈會變成兩個 loop 互相打架。對照:[Android Bubbles 收合後仍以圖示承載該對話的動態](https://developer.android.com/develop/ui/views/notifications/bubbles)。
- **放置與互斥**(2026-09-02 拍板;2026-09-03 抽成元件):FAB 為 opt-in 浮動入口,固定於舞台右下、內距
  `--layout-space-loose`(16/24;Material FAB 最小邊距同值);**面板開 → FAB 隱藏、面板關 → FAB 回來**
  (兩者互斥,開面板的入口與關面板的 × 不並存)。互斥、位置記憶與標誌狀態的**唯一住所 = `AgentPanelDock`**
  (`<AgentPanelDock logoState={s}>{({ close, logoState }) => <AgentPanel>…</AgentPanel>}</AgentPanelDock>`,
  外層容器需 `relative`):開時只渲染面板(× 接 `close`)、關時只渲染入口鈕(點一下開回來);產品端與所有 story
  都用它,不各自寫一份 `open ? panel : fab`(「入口鈕三態」那個 story 例外:它展示的是獨立 `AgentFab` 的三種標誌狀態,沒有面板可互斥)。
  **一個舞台一個 Dock**:家的座標只有一組(右下角離邊 loose),同一個 relative 容器內放兩個 `AgentPanelDock` 會像素級重疊;
  要在同一頁擺兩個代理入口,請各自給不同的 relative 舞台(2026-09-03 稽核補上的不變式)。
- **遮擋與貼邊**(`AgentFabDock`;演進:2026-09-02 拖到邊 → hover 小鈕 → 拖曳自由座標 → 2026-09-03 user 拍板
  「只有家與貼邊兩種位置」→ 帶的幾何(寬 36、下半部)→ 帶的樣式(drop-target 底 + 三邊虛線框)。**用語統一**:
  位置叫「家 / 貼邊」、區域叫「帶」、動作文案叫「縮小按鈕 / 放大按鈕」,不再用「收到邊 / 收合 / 小鈕 / 藍框」):40 外徑 + loose 內距 = 佔右下 56×56(md)/ 64×64(lg),
  與表格分頁列「操作右」必撞 → 主鈕可拖到右緣貼邊:
  - **命中區 = 可視形狀本身**(2026-09-04 user 拍板原話:「按鈕的視覺 = 觸發事件的範圍 = 會觸發 tooltip 的範圍」;
    「當我點擊按鈕的任何地方包括左側靠近邊邊的地方,只要還在按鈕範圍內就應該觸發事件」)。
    三者**恆等**,沒有例外可以解釋:看得到的每一點都點得到、點得到的每一點都看得到、會出 tooltip 的範圍就是這一塊。
    作法:語意 `<button>` 的尺寸與圓角**都等於可視形狀**(貼邊 28 + `rounded-l-full`、在家 40 + `rounded-full`);
    漸層環是這一層自己的 2px padding,內層 span 只負責面色,所以按鈕的 border box 邊緣就是使用者看到的邊緣。
    **DOM 盒 / 無障礙 target / 命中區 / Radix 錨點四者是同一個形狀。**
    - **不外推**(2026-09-03 曾外推到 40×40,2026-09-04 撤回):外推會生出隱形帶,搶走底下內容的點擊,
      並把 Radix 錨點推遠(tooltip 離可視形狀 20px 而不是 8px)。tooltip 與觸發點的距離恆為 8px(`OVERLAY_SIDE_OFFSET`),
      兩者不重疊 —— 所以「點 tooltip 觸發按鈕」不是需求,也不該發生。
    - **「會出 tooltip 的範圍」指的是觸發範圍,不是「tooltip 保持開著的範圍」**(2026-09-05 更正敘述):Radix Tooltip
      未設 `disableHoverableContent` 時,游標離開鈕、穿過那 8px 空隙移向 tooltip 的期間 tooltip 不關
      ([Radix Tooltip `disableHoverableContent` / hoverable content](https://www.radix-ui.com/primitives/docs/components/tooltip)),
      這是**刻意保留**的 —— [WCAG 1.4.13 Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
      要求懸停內容可被指標到達(hoverable)。空隙上的點擊落到底下內容是正確的,tooltip 開著不代表那裡屬於鈕。
      定位殼改 `w-fit`(2026-09-04)拿掉的是殼比鈕寬 12px 的**結構鬆弛**(殼一直是 `pointer-events-none`,從未參與命中);
      它對「空隙上 tooltip 仍開著」沒有、也不可能有影響 —— 先前把「殼的帶讓 tooltip 開著」記為此症狀的根因是誤判,撤回。
      命中區 ≡ 可視形狀仍是這顆鈕的唯一契約(它沒有另外的懸停回饋,所以 `ds-canonical/references/hit-area-canonical.md`「一-4 細則」的「懸停回饋形狀 ≡ 命中區」在它身上退化成可視形狀;那條通則只管控件,不延伸成全 DS「點得到的都要看得到」—— 整列、整張卡照該檔滑過原則一-2)。
    - **也不內縮**:先前寫成「按鈕保持矩形、圓角只畫內層,角落才點得到」,那是把**多**當成修正 ——
      使用者要的是相等。(同時撤回一條誤判:2026-09-03 記錄「貼邊態 dy=±12 時最左 1–3px 點不到」並歸因於圓角命中;
      複核幾何後,D 形在該高度的左緣本來就在 x≈6.8 而非 x=0,那幾點原本就在**視覺之外**,不是死區。)
    - **貼邊鈕壓在別人的捲軸上時,鈕贏**(2026-09-04 user 拍板原話:「按鈕可能已經蓋到了表格的捲軸,
      但點按鈕仍應該觸發按鈕的事件而不應該是捲動捲軸,因為按鈕是蓋在表格上,fab 通常也都是 z-index 最上面的東西」)。
      入口鈕是浮在內容之上的全域入口,不是內容的一部分;它蓋到什麼,那一塊就歸它。
      實測(真實滑鼠,非 `elementFromPoint`):貼邊鈕 x=1179–1207 與 DataTable 垂直捲軸 x≈1175–1190 重疊約 11px,
      在重疊區點擊 → 面板開啟、`scrollTop` 不變。
      **注意**:`document.elementFromPoint` **看不到原生捲軸**(它不是 DOM 元素),所以這一條只能用真實指標事件驗,
      不能用命中圖 —— 先前的「每一點都命中」驗證對這個場景是盲的。
      (本條取代 2026-09-03 的舊立場「捲軸露出的那幾 px 不屬於鈕,點在那裡捲動內容是正確行為」。)
    - **懸停微放大掛在按鈕上**(不是內層):命中盒與可視形狀一起放大,兩者永遠同步;掛在內層的話
      放大後可視會比命中盒大一圈。陰影升一級畫在內層(陰影屬於那個看得見的形狀)。值與獨立
      `AgentFab` 同一組(`scale-[1.04]` + `--elevation-200-hover`),沒有另訂。
    - **已登記未修**(2026-09-04 對抗式稽核):(a) `AgentPanelDock` 開面板時整顆 `AgentFabDock` 被卸載,
      關回來是全新掛載 → 首格 `size` 為 0,`placementStyle` 在 `s.h === 0` 時不夾 y,若面板開著期間視窗
      變矮,記住的貼邊 y 會先畫在超出合法範圍的位置再跳回;同一格的 `inset` 也還是 fallback 16。
      (b) `resizable` 把手改用 `patterns/resize-handle` 後 pointerdown 多了 `preventDefault()`,
      讓「拖欄寬時編輯中的 cell 自動結算」不再發生。**狀態的 owner 是 `../DataTable/data-table-known-defects.spec.md` 缺陷表 U 列**
      (「不修,登記為既定行為」,隨 `a7b2be94`(#124)登記):編輯中拖欄寬不再自動結算退出編輯,cell 維持編輯態、
      naked Field 隨欄寬即時變形,放開後仍在編輯。本段先前寫「未實測(本機沙箱起不了 Chromium),不寫成已知行為」,與 U 列
      互相矛盾;2026-09-27(待辦總帳 N36)以缺陷表為 owner 對齊,這裡不再另記狀態 —— 是否曾實機驗證以 U 列的紀錄為準,本段不另作宣稱。
    - **機械閘**:`scripts/agent-fab-hit-area-invariant.mjs` 掃 `elementFromPoint().closest('button')` 的
      **真實命中測試**(不是 class 或 rect 的字面值),逐點分類「在可視形狀內/外」(圓角半徑直接讀
      computed style,所以任何形態都適用),斷言 **H1 可視形狀內每一點都點得到(0 個死點)/
      H4 可視形狀外不得點得到(只容 1.5px 次像素,再多就是隱形帶)/ H5 定位殼不得大於鈕 /
      H2 不越舞台右下緣 / H3 舞台零溢出**;
      **注意此閘驗不到「鈕壓在原生捲軸上」那一條** —— `elementFromPoint` 看不到捲軸(它不是 DOM 元素),
      那條只能用真實指標事件驗;
      併在 `npm run test:agent-panel-invariants`。**最小點擊尺寸不拿觸控裝置的準則來規範**(2026-09-27 依待辦總帳 N23 改寫;
      user 2026-09-24 原話:「此外我們在做的是web component ，你他媽不要一直拿觸控裝置的設計原則來規範吧？滑鼠的指標是可以比手指頭精細很多的欸」;
      owner `ds-canonical/references/hit-area-canonical.md`「本 DS 不採納觸控尺寸建議」):本 DS 以滑鼠指標的精度為前提。這裡先前列的
      [Apple HIG 44pt](https://developer.apple.com/design/human-interface-guidelines/buttons) /
      [WCAG 2.5.5 Target Size (Enhanced) 44 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
      是**觸控尺寸建議、AI 自己找來的對照**,不是 user 要求,也從來不是「命中要大於視覺」的依據 —— 要把可點範圍做大,做大的是**可視形狀**,不是加隱形邊。
  - **只有兩種合法位置**:「家」= 圓鈕 40,位置唯一在右下角(離右、下各 loose;[Android FAB 官方範例
    `layout_margin` 16dp](https://developer.android.com/develop/ui/views/components/floating-action-button)、Teambition 16,
    lg 密度 24)/「貼邊」= 收合鈕 `--field-height-sm` 28 貼右緣半圓(只留內側圓角、環只畫露出三邊、內置 16 標誌;
    招喚態同款蓄勢、光圈省略),只有 y 可變、夾在右緣帶內。沒有第三種位置,使用者不可能把鈕拖到難用的地方。
    **兩種形態點一下都直接開面板**(一段);< 8px 位移視為點擊。
    **拖曳(≥ 8px)放開不得開面板,且不得依賴事件時序**(2026-09-16 user:「拖拉 agent panel 的 fab 很容易一不小心就開啟 panel,
    但我明明就只是要移動它而已」):瀏覽器對同一顆鈕補發的 click 由旗標吞掉,旗標只在**下一次 pointerdown** 才清、不用計時器
    (舊版 `setTimeout(0)` 在 click 晚一個 task 送達的環境 —— 遠端隔離 / 輸入代理 —— 會漏);鍵盤合成的 click(detail 0)不吞。
    **拖曳的判準不是「中途收到幾個 pointermove」**:放開時若尚未判成拖曳,再以放開點走一次同一套位置計算(門檻 / 磁吸帶 / 落點),
    pointermove 被代理丟掉 / 合併(只剩按下與放開)時仍判成拖曳、仍落到同一個磁吸位置(舊版只在 pointermove 裡設 moved,0 個 move 放開在 80px 外會被當成點擊);
    已判成拖曳的手勢維持原判、落點取最後一次移動。
    機械閘 `scripts/agent-fab-drag-click-invariant.mjs`(晚到 100ms 的 click 必被吞;0 個 move 放開在 80px 外不開面板;對照組先發 pointerdown 把旗標清掉必紅)。
  - **右緣帶**(磁吸區;2026-09-03 user 留言拍板幾何):寬 36(= `--field-height-md`;游標離右緣 ≤ 36 即進帶,已在帶內時
    再多 16px 才算離開,遲滯防抖);上緣 = 貼邊鈕圓心落在視窗中線(鈕頂 = 舞台高 ÷ 2 − 14);下緣 = 貼邊鈕底離家頂一個
    loose(鈕頂 = 舞台高 − 2·loose − 68)。貼邊鈕只能從中線往下拖到家上方,永不與家重疊、不壓分頁列;矮視窗放不下時整帶
    收成中線一點。帶(底色)= 這個矩形 = 貼邊鈕合法 y 範圍。判定用**指標**位置(意圖在指尖)。
  - **拖 40 圓鈕(所見即所得)**:鈕全程跟著游標;整段拖曳期間右緣帶以**底色 + 三邊虛線框**標出(見下「帶的樣式」);
    游標一進帶內,預覽當場變成貼邊鈕**貼在右緣、停在放開會落的高度**(帶內所見即所得,不預告在游標下);
    放開在帶內 → 落定;放開在帶外 → 飛回家。
  - **拖 28 貼邊鈕**:不顯示帶;帶內沿 y 移動維持貼邊鈕;一出帶外當場變回 40 圓鈕、放開飛回家。
  - **帶的樣式**(2026-09-03 user 拍板;SSOT = `color.spec.md`「Drop target」段):消費 DS「可放下的區域」配對 ——
    底 `bg-drop-target`(`--primary` @ 15% **兩模式都半透明**:覆蓋在頁面內容上就不能不透明,VS Code theme-color 鐵律;
    15% = DS alpha 階梯上的既有階,且落在世界級區間 Material dragged 0.16 / VS Code 0.18 / Atlassian ≈0.20)+ **三邊 2px dashed**
    `border-drop-target-border`(= `--primary-hover`;dashed = DS「可放下的暫時目標」語彙,與 FileUpload 拖入區同一組 token)。
    **貼右緣那側不畫線、不留圓角**(`border-r-0 rounded-l-md`;Sheet / Sidebar / AppShell 側欄 / 貼邊鈕「環只畫露出三邊」同語言)。
    與 FileUpload 常駐拖入區的分工:那邊靜止就看得見、進入合法區只換邊框不填色;這裡憑空出現、需要整區底色才讀得出範圍,
    落點回饋由鈕自己的所見即所得預覽承擔(對照表在 color.spec.md)。
  - **等價路徑**:鍵盤 家 → `→` 貼邊(停在帶底 = 家頂上方一個 loose);貼邊 `↑↓` 16px、`←` / Home 回家;右鍵 / Shift+F10
    DropdownMenu 依狀態只給一項(家:「縮小按鈕」`ArrowRightToLine` / 貼邊:「放大按鈕」`ArrowLeftFromLine` —— 線 = 右緣、
    箭頭方向 = 鍵盤 → / ← 等價路徑,[lucide 官方 tags collapse / expand 鏡像對](https://github.com/lucide-icons/lucide/blob/main/icons/arrow-right-to-line.json);
    Maximize2 家族在 DS = 全螢幕、Panel 家族 = 面板本身,故不用;2026-09-03 user 拍板「縮小按鈕與放大按鈕
    + 前綴 icon」——「按鈕」點名對象,與 FileViewer 內容縮放的「放大 / 縮小」不混淆;DS 無 ContextMenu,以受控 DropdownMenu 代);
    拖曳中 Esc 取消回原位。Tooltip 兩態不同:家「問我或推走我」(2026-09-03 user 文案,邀請拖曳)/ 貼邊
    「開啟智慧代理」(2026-09-03 user 留言:小鈕只寫開啟;= aria-label);拖曳中不顯示。
  - **動作**(依 motion.spec.md;2026-09-03 對照四家後定):形態切換 `--motion-duration-overlay` 150ms
    ([Carbon moderate-01 150ms「小型展開、短距離移動」](https://carbondesignsystem.com/elements/motion/overview/))/
    飛回家與落點修正 `--motion-duration-surface` 250ms + enter 曲線([Atlassian transitions 150–400ms「較長時長幫助
    追蹤空間變化」](https://atlassian.design/foundations/motion);拖曳中跟指標不過渡)/ 帶底色淡入淡出 150ms;
    prefers-reduced-motion 三者全部直接落定([Atlassian「全部停用仍可用」](https://atlassian.design/foundations/motion)、
    [Fluent「提供 no motion 設定」](https://fluent2.microsoft.design/motion)、WCAG 2.3.3)。
  - **區域 → 落點表(可擴充)**:磁吸邏輯 = 依序判定指標所在區域,命中即決定「預覽 = 落點」;沒命中 = 圓鈕跟游標、
    放開回家;要加磁吸點(鏡像左緣、四角)只在 `agent-panel-fab.tsx` `SNAP_ZONES` 加一列(區域矩形同時就是帶的底色範圍),流程不變。
    判準:以指標判定、一區一落點一形狀、邊界 16px 遲滯、區域不重疊且邊帶優先於角落、無命中不做「最近磁吸點」
    (會從放開處跳走)。上緣 / 下緣永不設區(標題列 / 分頁列)。**指標 x 夾在舞台內再判區(超出右緣讀作右緣;y 不夾)**:
    拖曳用 pointer capture,`clientX` 可以越過視窗右緣,夾回舞台後仍落在右緣帶內 → 拖過頭一樣算貼邊;y 不夾,越過上下緣就是沒命中。
  - 位置由 consumer 受控/非受控(`placement / defaultPlacement / onPlacementChange`,`{kind:'home'}` /
    `{kind:'dock',y}`),DS 不寫 storage;要跨 session 記憶由 consumer 存。
  - 對照:[Copilot DAB 可拖到內容區側邊變小圖示、拖回畫布即展開](https://support.microsoft.com/en-us/office/foundations-experiences/copilot-dab/the-copilot-dynamic-action-button-in-word-excel-and-powerpoint)、
    [Windows Snap「拖到螢幕邊時 Snap 框當場顯示」= 拖曳中預告落點](https://support.microsoft.com/en-us/windows/snap-your-windows-885a9b1e-a983-a3b1-16cd-c531795e6241)、
    [Android Bubbles 任意拖、拖到底部才出現關閉區](https://developer.android.com/develop/ui/views/notifications/bubbles)、
    [Teambition 專案頁 hover「−」收到右緣、點圓弧先展開](https://www.teambition.com/)(2026-09-02 實測;本 DS 收合後
    一段即開、且形態在拖曳中就切換,比它少一步、回饋更早);Material 明文 FAB 不移動
    ([M3 FAB](https://m3.material.io/components/floating-action-button/guidelines))→ 可拖在 DS 為 opt-in。
- A11y:`aria-label="開啟智慧代理"`。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-panel.spec.md`
