# DialogSplitBody API 提案(2026-07-10,task #103 — **user 拍板:不做元件,已收案**)

> **Verdict(user verbatim)**:「比較像是 WM 根據 DS 所有元件和遵循所有設計原則和語言客製化出來的元件,且專屬於 WM 這個產品,應該不需要變為 DS 元件吧?」— 成立,且與研究一致(Atlassian modal 無兩欄 API 走 composition / MUI 同)。**替代落地(同日)**:overlay-surface.spec.md「兩欄 dialog 組合 canonical」(4 條組合鐵律 + archetype 指標,隨 npm ship 給 fork)+ r3 C19 簽名(共用捲軸機械攔)。本檔留作研究紀錄。

提案:DialogSplitBody 兩欄 dialog body(給你拍板)

════════════════════════════════════

一、結論一句話

在 dialog.tsx 內新增 `DialogSplitBody`(DialogBody 的兩欄兄弟元件):**分欄歸 body 層、header 維持全寬、左欄自帶釘底 footer slot、兩欄各自 ScrollArea、divider 由右欄 border-l 持有貫穿 body 頂到底**。這不是新發明——是把 WM WorkItemDetailDialog 已拍板落地的手刻結構(WorkItemDetailDialog.tsx:215-390 + GeneralInfoPanel.tsx:47-49)升格為 DS primitive,且逐項有世界級對照。

二、API shape

```tsx
<DialogContent maxWidth={1160}>
  <DialogHeader actions={...}>…</DialogHeader>   {/* 維持全寬,不動 */}
  <DialogSplitBody
    aside={<GeneralInfo …/>}        // 右欄內容(metadata / context),必填
    asideLabel="General info"       // 右欄 <aside> aria-label,必填
    asideWidth={288}                // 右欄固定寬 px,預設 288(可省略)
    mainFooter={<CommentComposer/>} // 左欄釘底 slot,選填
  >
    {主欄內容}                       {/* children = 左欄,同 DialogBody 慣例 */}
  </DialogSplitBody>
</DialogContent>
```

內部渲染骨架(全部消費既有 canonical,零新 token):

```tsx
<div data-dialog-body className="flex min-h-0 flex-1">
  <div className="flex min-w-0 flex-1 flex-col">
    <ScrollArea fillX className="flex-1 min-h-0">
      <div className={cn("px-loose pt-tight pb-bottom", className)}>{children}</div>
    </ScrollArea>
    {mainFooter && <SurfaceFooter data-dialog-footer>{mainFooter}</SurfaceFooter>}
  </div>
  <aside aria-label={asideLabel} style={{width: asideWidth}}
         className="flex shrink-0 flex-col border-l border-divider">
    <ScrollArea fillX className="flex-1 min-h-0">
      <div className={cn("px-loose pt-tight pb-bottom", asideClassName)}>{aside}</div>
    </ScrollArea>
  </aside>
</div>
```

三、每個設計決策的依據(WM 拍板 + 世界級 + DS canonical 三方對照)

1. **分欄歸 body 層,header/frame 不管欄**
   - WM:header 全寬放 breadcrumb + prev/next(WorkItemDetailDialog.tsx:164-208),分欄從 body 才開始
   - 世界級:Atlassian「frame(width/height)歸 dialog、欄結構歸 body 內組合」;Ant/MUI/Polaris 三家 dialog 一律 header/body/footer 三 slot,欄是 body 內的事
   - DS:DialogContent 已是 `flex flex-col`(dialog.tsx:109),SplitBody 只是替換 body region,Header/Footer 契約全不動

2. **左右各自捲動(不共用一條捲軸)**
   - WM 拍板 verbatim:「user 拍板 A:composer 歸左欄 + 左右獨立捲動」(WorkItemDetailDialog.tsx:209-214 註解)
   - 世界級:Atlassian 官方兩欄範例 per-column `flex:1 + minHeight:0 + overflowY:auto`;Linear「兩欄各自為政」
   - DS:每欄套 overlay-surface.spec.md:41-64「Body overflow canonical」ScrollArea 模板 verbatim(禁自寫 overflow-y-auto;padding 搬進 viewport 內層 div `px-loose / pt-tight / pb-bottom`)——跟現行 DialogBody(dialog.tsx:219-233)同一模板,只是 ×2

3. **mainFooter 釘左欄底(不是 dialog 全寬 footer)**
   - WM 拍板:comment composer 用 DialogFooter 放在左欄底(WorkItemDetailDialog.tsx:365-385),divider 因此只切左欄
   - 世界級:Atlassian 官方兩欄範例就是把 ModalFooter **巢狀進左欄底部**、不橫跨整個 modal(101-full-height-illustration.tsx);Jira issue view 的 quick-add 也在左內容欄
   - DS:slot 內部包 SurfaceFooter chrome(border-t border-divider + px-loose py-tight + shrink-0)+ `data-dialog-footer`,保留 openAutoFocus fallback 契約(dialog.tsx:88-91)。需要全寬 footer 的 dialog 照舊在 DialogContent 層放 DialogFooter,兩者不衝突

4. **divider = 右欄 border-l,從 body 頂貫到 body 底**
   - WM 拍板:「border-l 由 aside 持有,貫穿 body 頂到底」(GeneralInfoPanel.tsx:46-47);欄間距 = 左 px-loose + border + 右 px-loose,不另設 gap
   - 世界級:Linear divider 貫穿全高;MUI 欄間線要 consumer 手塞 `<Divider flexItem>` 修 0px 高 bug——我們用 border-l 直接迴避整類問題
   - DS 內部先例:FileViewer InfoPanel 就是 `<aside class="w-80 shrink-0 flex-col border-l border-divider">`(file-viewer.tsx:480-486),同款結構第 3 個實證 → 過 Rule-of-3,該收斂成 primitive

5. **右欄語意 = `<aside>` + 必填 asideLabel**
   - 世界級:Jira 官方語意分工「右 = context、左 = content」;Notion details panel 在右;Linear details pane 在右
   - DS 命名 3-test 全過:`aside` 是 AppShell 既有 prop(app-shell.tsx:51 `aside?: ReactNode`)+ HTML 語意詞 + 無跨元件語義衝突;label 必填對齊 AppShellAside `title` required(a11y landmark 需可辨識)

6. **asideWidth 固定寬,預設 288**
   - WM 實證 w-72 = 288(GeneralInfoPanel.tsx:47);型別 `number`(px)對齊 AppShellAside `width?: number` 先例(app-shell.tsx:63)
   - 世界級:Atlassian modal 兩欄無 resize;Ant Sider 也是宣告固定寬(default 200)

四、不做什麼(non-goals)

- **不做可拖曳 resize / collapsible**:Atlassian 把 resize 放 page-layout 且該 package 已 deprecated;Ant Splitter 是 page 級 primitive。dialog 內固定寬是 Jira/Linear/WM 共識。未來真要 → 消費既有 `patterns/resize-handle`,不在本 API 開洞
- **不做 3+ 欄 / aside 換邊(左側)**:全部世界級 detail-dialog canonical 都是右欄 metadata,無反例
- **不做 aside 自己的 header/footer slot**:WM 右欄標題「General info」就是內容第一行(GeneralInfoPanel.tsx:50),不需 chrome
- **不做 responsive 摺疊(窄視窗右欄收合)**:WM 未拍板此行為,Dialog maxWidth 已有 viewport 安全帽;等真實需求再提
- **不動 DialogBody**:單欄 dialog 照舊;也不先抽 overlay-surface 層 SurfaceSplitBody(Sheet 目前無兩欄 consumer,等第二個 consumer 再抽,Rule-of-3)

五、遷移效益(WM 改消費後刪多少)

- WorkItemDetailDialog.tsx:刪手刻 body wrapper + 左欄殼 + ScrollArea + padding div + 6 行「為什麼要手刻」註解(215-219、364、386、390、209-214)≈ 12 行;DialogFooter 段移進 `mainFooter` slot
- GeneralInfoPanel.tsx:刪 aside 殼 + ScrollArea + padding div + 3 行註解(44-49、140-141)≈ 7 行,元件退化成純內容(InfoRow 列表),可測可重用
- 合計 ≈ 19 行手刻 layout 歸零;更重要是 **4 個 drift 面(ScrollArea 模板 ×2、divider token、欄寬、body padding)收斂進 DS**——下一個兩欄 dialog(成員詳情、檔案詳情…)不再重手刻,FileViewer InfoPanel 未來也可評估對齊

六、落地清單(你說 OK 後執行)

1. dialog.tsx 加 `DialogSplitBody` + export;2. dialog.spec.md 補「兩欄 body canonical」節(cite 本提案對照);3. dialog.stories.tsx 補兩欄 OpenSnapshot story(M15);4. WM WorkItemDetailDialog + GeneralInfoPanel 改消費;5. tsc + build:lib + visual verify。

請拍板:A. 照此執行 / B. 調整(哪一條)/ C. 先看 storybook 原型再決定。

---

## 世界級研究原始引文

### Atlassian Design System — @atlaskit/modal-dialog(atlassian-frontend-mirror master 原始碼:src/types.tsx、src/modal-body.tsx、src/modal-header.tsx、src/modal-footer.tsx、examples/101-full-height-illustration.tsx)+ @atlaskit/page-layout(src/common/types.tsx)。已全盤讀取原始碼檔案(atlassian.design 文件頁為 JS render 無法取 prop 表,故直接讀 source SSOT)。

Verdict:ADS **沒有宣告式兩欄 modal API**——Modal 家族是單欄 slot 組合(Modal → ModalHeader/ModalTitle → ModalBody → ModalFooter),兩欄靠「composition + 官方範例 archetype」達成,官方範例即 examples/101-full-height-illustration.tsx。結構如下:(1) **欄怎麼宣告**:無 column prop。Modal 只給外框 `width?: number | string | 'small'|'medium'|'large'|'x-large'` + `height?: number | string`(範例固定 `height={420}` 讓兩欄等高);欄位是 consumer 自組:外層 Box 把 body 級 padding 歸零(`paddingBlock/Inline: 0, height: 100%, overflow: hidden, borderRadius: inherit`)→ 內層 Box `display: flex; height: 100%` → 兩個 `flex: 1` 的 Box(leftHalf/rightHalf)。ModalBody 本身是單一內容容器(props 僅 `children / testId / hasInlinePadding?: boolean`,後者可關掉 `paddingInline: token('space.300')` 做 full-bleed)。(2) **各自捲動**:Modal 級 `shouldScrollInViewport?: boolean` 決定捲動邊界(false = 捲動在 modal body,ModalBody 內建 TouchScrollable + ScrollContainer);兩欄模式下改為 per-column 自管——左欄 `flex-direction: column; minHeight: 0`,中段 content `flex: 1; overflowY: auto; minHeight: 0`,右欄 `overflow: hidden` 不捲。(3) **divider**:無 divider prop、無 resize;視覺分隔靠右欄自己的 `backgroundColor: token('color.background.accent.blue.subtlest')`,header/footer 與 body 間也僅靠 padding 無 keyline prop。(4) **footer slot**:ModalFooter(props 僅 `children?/testId?`,樣式 `display: flex; justifyContent: flex-end`)在兩欄模式下**巢狀進左欄底部**,不橫跨整個 modal;右欄用獨立具名 export `CloseButton`(`onClick + label`)absolute 定位在角落,ModalHeader 另有 `hasCloseButton?: boolean`(@default false)。(5) **可拖曳分欄(Jira issue-view 型)**:不在 modal-dialog scope;公開 API 是 @atlaskit/page-layout 的 pane:`LeftSidebar/RightSidebar extends SlotWidthProps`(`width?: number; shouldPersistWidth?: boolean; isFixed?: boolean`)+ resize 面:`resizeButtonLabel?: string; resizeGrabAreaLabel?: string; onResizeStart?/onResizeEnd?: (leftSidebarState) => void; collapsedState?: 'collapsed' | 'expanded'; overrides.ResizeButton.render`——但該 package 已標 deprecated(改推 @atlaskit/navigation-system),且 Jira issue view 兩欄本體是 Jira 私有實作非公開元件。對 DialogSplitBody 的含義:Atlassian 的答案 = frame(width/height/scroll boundary)歸 dialog、欄結構歸 composition、per-column scroll 用 `flex:1 + minHeight:0 + overflowY:auto` idiom、footer 屬於內容欄而非 dialog frame。

**verbatim**:types.tsx:「export type WidthNames = 'small' | 'medium' | 'large' | 'x-large';」/「/** Width of the modal dialog. The recommended way to specify modal width is using named size options. */ width?: number | string | WidthNames;」/「/** Height of the modal dialog. When unset the modal dialog will grow to fill the viewport and then start overflowing its contents. */ height?: number | string;」/「/** Will set the scroll boundary to the viewport. If set to false, the scroll boundary is set to the modal dialog body. */ shouldScrollInViewport?: boolean;」。modal-body.tsx:「export interface ModalBodyProps { children: React.ReactNode; testId?: string; hasInlinePadding?: boolean; }」(root style `flex: '1 1 auto'`;paddingInline: token('space.300'))。modal-header.tsx:「export interface ModalHeaderProps { children?: React.ReactNode; hasCloseButton?: boolean; testId?: string; }」(hasCloseButton JSDoc:「Shows a close button at the end of the header. @default false」)。modal-footer.tsx:「export interface ModalFooterProps { children?: ReactNode; testId?: string; }」+「display: 'flex', justifyContent: 'flex-end'」。101-full-height-illustration.tsx(官方兩欄範例):「modalContainer: { display: 'flex', height: '100%', ... }, leftHalf: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: '0px' }, content: { flex: '1', overflowY: 'auto', minHeight: '0px', ... }, rightHalf: { flex: '1', ... backgroundColor: token('color.background.accent.blue.subtlest') }」;JSX:「<Modal onClose={close} height={420}> <Box xcss={styles.modalBody}> <Box xcss={styles.modalContainer}> <Box xcss={styles.leftHalf}> <ModalHeader>…</ModalHeader> <Box xcss={styles.content}><ModalBody>…</ModalBody></Box> <ModalFooter>…</ModalFooter> </Box> <Box xcss={styles.rightHalf}> <Box xcss={styles.closeButton}><CloseButton onClick={close} label="Close modal" /></Box> …」。page-layout common/types.tsx:「interface SlotWidthProps extends SlotProps { shouldPersistWidth?: boolean; width?: number; }」/「interface LeftSidebarProps extends SlotWidthProps { … resizeGrabAreaLabel?: string; resizeButtonLabel?: string; onResizeStart?: (leftSidebarState: LeftSidebarState) => void; onResizeEnd?: (leftSidebarState: LeftSidebarState) => void; collapsedState?: 'collapsed' | 'expanded'; width?: number; }」。

**URL**:https://bitbucket.org/atlassian/atlassian-frontend-mirror/raw/master/design-system/modal-dialog/examples/101-full-height-illustration.tsx(兩欄 archetype);https://bitbucket.org/atlassian/atlassian-frontend-mirror/raw/master/design-system/modal-dialog/src/types.tsx(ModalDialogProps);https://bitbucket.org/atlassian/atlassian-frontend-mirror/raw/master/design-system/modal-dialog/src/modal-body.tsx;https://api.bitbucket.org/2.0/repositories/atlassian/atlassian-frontend-mirror/src/master/design-system/page-layout/src/common/types.tsx(pane/resize API);https://atlassian.design/components/modal-dialog/examples(官方 docs 首頁,JS render)

### Material UI (MUI) 官方文件 mui.com — 全文讀取:Dialog doc(19 節)、Dialog API、DialogContent API、DialogActions API、Stack doc(12 節)、Grid doc(13 節)、Drawer doc + Drawer API、Divider API、All components 總表

【verdict:MUI 無兩欄 dialog 專用 API,也無 SplitPane 元件】(1) 欄怎麼宣告:Dialog 只是 modal 殼(open: bool 必填 / maxWidth: 'xs'|'sm'|'md'|'lg'|'xl'|false|string 預設 'sm' / fullWidth: bool / fullScreen: bool / slots+slotProps: {backdrop, container, paper, root, transition});兩欄 = 消費者自己在 DialogContent 內放 layout primitive:Grid(container + size={{ xs: 6, md: 8 }} + spacing,12-column 二維)或 Stack(direction="row" + spacing,一維)。Dialog doc 全頁 19 節零個兩欄/Grid demo — 組合完全 free-form,非 declared-column API。(2) 各自捲動:無官方 per-column scroll API;只有 dialog 級 scroll: 'body'|'paper'(預設 'paper',「Scrolling long content」節 = DialogContent 整塊在 paper 內捲),欄內獨立捲動要自己 sx={{ overflow: 'auto' }},無 canonical。(3) divider:兩層 — DialogContent 的 dividers: bool(預設 false)是「水平」上下分隔線(把 content 從 title/actions 框出來,對應 scroll 情境),不是欄間線;欄間「垂直」線 = Stack 的 divider: node prop 塞 <Divider orientation="vertical" flexItem />(flexItem: bool 修正 flex container 內 vertical divider 高度 0px 問題)。Drawer 也無 divider variant,demo 內是手放 <Divider />。(4) footer slot:DialogActions(children: node / disableSpacing: bool 預設 false),固定在 paper 底部、不隨 DialogContent 捲動。(5) Drawer/SplitPane 類比:Drawer 是 page 級 side panel — variant: 'permanent'|'persistent'|'temporary'(預設 'temporary')/ anchor: 'bottom'|'left'|'right'|'top'(預設 'left')/ elevation: integer 預設 16;permanent =「always visible and pinned to the left edge, at the same elevation as the content」= MUI 做 master-pane+content 的正統法是 page 層 Drawer,不是 dialog 內分欄;MUI core 完全沒有 SplitPane/Resizable(all-components Layout 分類僅 Box/Container/Grid/Stack/Image List)。Grid vs Stack 分工:「Stack is concerned with one-dimensional layouts, while Grid handles two-dimensional layouts」。

**verbatim**:DialogContent API:`dividers` (bool, default false) — "Display the top and bottom dividers." | Dialog API:`maxWidth` ('xs'|'sm'|'md'|'lg'|'xl'|false|string, default 'sm') — "Determine the max-width of the dialog. The dialog width grows with the size of the screen. Set to `false` to disable `maxWidth`.";`scroll` ('body'|'paper', default 'paper') — "Determine the container for scrolling the dialog.";`fullWidth` (bool, default false) — "If `true`, the dialog stretches to `maxWidth`." | DialogActions API:`disableSpacing` (bool, default false) — "If `true`, the actions do not have additional margin." | Stack doc:"The Stack component manages the layout of its immediate children along the vertical or horizontal axis, with optional spacing and dividers between each child.";"Use the `divider` prop to insert an element between each child. This works particularly well with the Divider component";範例 code:<Stack direction="row" divider={<Divider orientation="vertical" flexItem />} spacing={2}> | Divider API:`flexItem` (bool, default false) — "If `true`, a vertical divider will have the correct height when used in flex container. (By default, a vertical divider will have a calculated height of `0px` if it is the child of a flex container.)";`orientation` ('horizontal'|'vertical', default 'horizontal') — "The component orientation." | Grid doc:size 語法 <Grid container spacing={2}><Grid size={{ xs: 6, md: 8 }}>;"Stack is concerned with one-dimensional layouts, while Grid handles two-dimensional layouts." | Drawer API:`variant` ('permanent'|'persistent'|'temporary', default 'temporary') — "The variant to use.";`anchor` ('bottom'|'left'|'right'|'top', default 'left') — "Side from which the drawer will appear." | Drawer doc:"Permanent navigation drawers are always visible and pinned to the left edge, at the same elevation as the content or background. They cannot be closed."

**URL**:https://mui.com/material-ui/api/dialog-content/(dividers prop);https://mui.com/material-ui/api/dialog/;https://mui.com/material-ui/react-dialog/(全 19 節無兩欄 demo);https://mui.com/material-ui/react-stack/(divider prop + vertical Divider 範例);https://mui.com/material-ui/react-grid/(size={{xs,md}} 語法);https://mui.com/material-ui/api/divider/(flexItem);https://mui.com/material-ui/api/dialog-actions/;https://mui.com/material-ui/api/drawer/;https://mui.com/material-ui/react-drawer/;https://mui.com/material-ui/all-components/(證無 SplitPane)

### Ant Design(Modal / Layout.Sider / Splitter 官方 docs)+ Shopify Polaris(Modal source code @ GitHub main)+ Atlassian Jira new issue view(developer docs)+ Linear changelog 2021-06-03 + Notion Help(Layouts)。全部 WebFetch 取回逐字對照,Polaris/Linear 兩段關鍵引文另跑第二輪 YES/NO 逐字 verify 通過。

Verdict:兩家 DS 都「沒有」first-class 兩欄 dialog API — dialog 一律是 header/body/footer 三 slot + 單一 scroll 容器,兩欄靠 body 內自行組合;而 Jira/Linear/Notion 產品層的 detail-dialog canonical 一致是「左內容欄 + 右 metadata 欄」。分述:(1) Ant Modal:無 built-in 兩欄/split API(官方 docs 僅 title/footer/width/centered + v5.10 semantic `classNames`/`styles: Record<SemanticDOM, CSSProperties>` 可對 body/content 個別 zero-padding 再自組欄)。footer 是 Modal-level 全寬 slot(`footer: ReactNode | (originNode, extra:{OkBtn,CancelBtn}) => ReactNode`),永遠橫跨兩欄下方,divider 不歸 Modal 管。Ant 的分欄 primitive 是另兩個元件:Layout+Sider(宣告式:`<Layout><Sider width=200 collapsible/><Content/></Layout>`,Layout 可自嵌套出 2/3 欄;page chrome 級,非 dialog 用)與 Splitter(`<Splitter orientation><Splitter.Panel defaultSize/min/max/resizable/collapsible>`,divider = 元件自帶可拖曳 dragger,per-panel 尺寸宣告)。(2) Polaris Modal:單欄堆疊 `<Dialog><Header/>{body}<Footer/></Dialog>`;body 包在 `<Scrollable shadow onScrolledToBottom>` 單一捲動容器(`noScroll?: boolean` 可移除),`sectioned?: boolean` 自動包 Modal.Section 分節 — 是「縱向分節」不是「橫向分欄」,無任何兩欄 API;deprecated 轉 App Bridge Modal。(3) 產品 canonical(detail-dialog 兩欄):Jira new issue view = 左 content 欄(description + quick-add `jiraIssueContents`)+ 右 context 欄(status 下方 fields/glances `jiraIssueGlances` + collapsible context panels `jiraIssueContexts`;舊制 `atl.jira.view.issue.left.context`/`right.context`),官方語意分工「右 = context、左 = content」;Linear = 內容欄置中限寬保 readability、右 details panel 隨螢幕寬「proportionally」成長(兩欄各自為政、divider 貫穿全高);Notion database page layout = 右側 details panel 可開關(View details toggle)、pinned properties ≤15 溢出走 horizontal scroller、property group 可宣告放 main page 或 details panel(= 欄歸屬是 per-group 宣告制)。對 DialogSplitBody 的含意:世界級做法是 split 屬於 body 層(header/footer 全寬跨欄)、右欄 = metadata/context 語意、兩欄各自捲動、divider 由 split 容器(非 dialog)持有。

**verbatim**:Ant Layout:「The layout wrapper, in which `Header` `Sider` `Content` `Footer` or `Layout` itself can be nested」;Sider props `width: number|string`(default 200)/`collapsible: boolean`/`collapsedWidth: number`(default 80)/`breakpoint: xs|sm|md|lg|xl|xxl`。Ant Modal:`footer: ReactNode | (originNode: ReactNode, extra: { OkBtn: React.FC, CancelBtn: React.FC }) => ReactNode`;`styles: Record<SemanticDOM, CSSProperties>`(5.10.0+);docs 無任何 two-column/split prop。Ant Splitter:「Resizable split panel layout」;`orientation: 'horizontal'|'vertical'`;Splitter.Panel `size/defaultSize/min/max: number|string`、`resizable: boolean`(default true)、`collapsible: boolean|{start?,end?}`。Polaris Modal.tsx(逐字 verify YES×4):「/** Automatically adds sections to modal */ sectioned?: boolean;」「/** Removes Scrollable container from the modal content */ noScroll?: boolean;」「/** Inner content of the footer */ footer?: React.ReactNode;」「/** Callback when the bottom of the modal content is reached */ onScrolledToBottom?(): void;」;body JSX:`<Scrollable shadow className={styles.Body} onScrolledToBottom={onScrolledToBottom}>{body}</Scrollable>`。Jira:「Glances are special user interface elements that appear in the right sidebar of the issue view under the status, and alongside other fields like assignee, priority, and labels」;「information on the right hand side provides context for the issue」/「panels on the left side should provide content」。Linear(逐字 verify YES):「We didn't want to make the issue content column too broad to keep the issue content readable, so we extended the issue details pane to the side of the screen.」「We're now centering the issue content when your window size grows beyond a certain size. The issue details panel will also grow proportionally with your screen size, giving you more room for all the labels your issue might have.」Notion:「The details panel on the right side of your database page can be opened and closed.」「You can pin up to 15 properties」「When you pin more properties than fit on screen, they appear in a horizontal scroller.」「Your Property group shows you the properties of your database page and can be displayed in the main page or in the details panel.」

**URL**:https://ant.design/components/modal ; https://ant.design/components/layout ; https://ant.design/components/splitter ; https://raw.githubusercontent.com/Shopify/polaris/main/polaris-react/src/components/Modal/Modal.tsx ; https://polaris-react.shopify.com/components/deprecated/modal ; https://developer.atlassian.com/cloud/jira/platform/new-issue-view-ui-locations/ ; https://developer.atlassian.com/cloud/jira/platform/issue-view-ui-locations/ ; https://linear.app/changelog/2021-06-03-issue-view-layout ; https://www.notion.com/help/layouts