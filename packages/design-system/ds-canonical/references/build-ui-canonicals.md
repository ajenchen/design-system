# 建立 UI 前的 DS canonical 對照(從 CLAUDE.md 拆出的完整對照)

本檔是 `.claude/rules/ui-development.md`「建立 UI 前必讀」的**完整對照表**。Rule 主章只留「超級規則 + 自我檢查腳本」,遇到具體情境要查對照時讀本檔。

---

## 既有 DS 元件 / primitive 優先消費(完整表)

**超級規則**:**`ls packages/design-system/src/components/` + `ls packages/design-system/src/patterns/` 看一次。任何視覺 / 行為命中既有元件 → 必消費,不 hand-craft raw HTML 繞過**。

### 常見手刻 vs canonical 對照

| 情境 | ❌ anti-pattern(手刻) | ✅ canonical(用 DS) |
|------|---------------------|---------------------|
| Select / 下拉選單 | `<Popover><PopoverContent><button className="flex items-center px-2">...</button></PopoverContent></Popover>` | `<Select options={...} />` or `<DropdownMenu><DropdownMenuItem>` |
| Input 欄位 | `<input className="h-field-sm w-20 pl-3 pr-7 border ..." />` | `<Input size="sm" />` or `<NumberInput />` |
| 列表項目 row(icon + text + action) | `<div className="flex items-center gap-2"><Icon/><span/><Button/></div>` | `<MenuItem>` + slot components(`<ItemIcon>` / `<ItemLabel>` / `<ItemSuffix>`) |
| 資料表格(含 header / sorting / sticky) | `<table><thead>...</thead><tbody>...</tbody></table>` | `<DataTable columns={...} data={...} />` |
| 檔案上傳列表 | `<div>filename</div><ProgressBar /><Paperclip />` | `<FileItem mode="compact" />` or `<FileUpload>` |
| 表單欄位(label + control + error) | `<label>...</label><input/><span className="text-error">...</span>` | `<Field><FieldLabel>...<Input />...<FieldError/>` |
| 全頁 / 區域 loading | `<div className="absolute inset-0 flex center"><Spinner /></div>` | `<Empty icon={<CircularProgress />} description="..." />` |
| 確認對話框 | raw `<div className="fixed inset-0 bg-black/50">...<button>OK</button>` | `<Dialog>` + `<DialogHeader>` etc |
| 分隔線 | `<hr className="..." />` or `<div className="h-px bg-..."/>` | `<Separator />`(必要時)or CSS border(見 separator.spec) |
| 標籤分類 / 狀態 chip | `<span className="inline-flex px-2 py-0.5 bg-... rounded">...</span>` | `<Tag variant="..." />` or `<Badge />` |
| 使用者頭像 | `<img className="w-8 h-8 rounded-full" />` | `<Avatar>` |
| 浮層(彈出資訊) | `<div className="absolute bg-white shadow p-3">...</div>` | `<Popover>` / `<HoverCard>` / `<Tooltip>`(視語義選) |
| 浮層 media + title + description + actions | 自組 `<div>` 結構 | `<Coachmark>` 或 `<Dialog>`(視是否阻斷) |
| 固定高度 chrome header(toolbar / page top bar / panel 標題列)| 自組 `<div className="flex h-12 items-center border-b px-4">...</div>` | `<ChromeHeader>`(消費 header-canonical;或在 `<AppShell header={...}>` slot 傳它)|

**Story 特別提醒**:**stories 也是 code**。如果 story 在 label / comment 說「DataTable cell 用法」「Table 配額」「Menu 選單」等,**要 render 真的該元件 demo,不可用 raw `<table>` / raw `<button>` 假裝**。否則 story 教壞 consumer、自己也在破壞 DS 訓練資料。

`check_story_invariants.sh` hook(R1 anatomy,原 `check_story_anatomy.sh` folded 折入)會在 Write/Edit 階段攔下這類手刻;allowlist `// @anatomy-exempt: <reason>`(檔首)/ `// @anatomy-exempt-next`(下一行)可豁免教學用 raw primitive。

---

## Layout primitive 特別子集(建立 pattern-level 新元件前 mechanical 掃)

以下是 **pattern-level** primitives(跨元件共用的視覺結構),建立新元件前必查。若新元件的視覺結構命中任一 row 的 pattern → **必消費該 primitive**,不自己重寫一套。漏掉 = 雙邊漂移 bug(改一邊另一邊失效)。

| 視覺 pattern | 既有 primitive | 典型觸發情境 |
|------|---------|---------|
| 單列 row:prefix(icon/avatar) + content + suffix(action) | `patterns/element-anatomy/item-anatomy.*` — `<MenuItem>` canonical + slot components | 任何「列表項目」元件(Menu/Tree/Sidebar/TableRow/StepItem/FileItem...) |
| 浮層容器的 Header + Body + Footer(border-b/t + padding token) | `patterns/overlay-surface/` — `SurfaceHeader/Body/Footer` | Dialog / Popover / Drawer / Sheet / 任何 elevation-200 浮層的結構化 sub-components |
| **固定高度 chrome header(toolbar / page top bar / panel 標題列,border-b + px-loose + 高度 token)** | `patterns/header-canonical/` — `<ChromeHeader>`(`withTabs` / `leadingRail` / `lockDensity`)+ `header-canonical.spec.md` 設計契約 + `Patterns/Header Anatomy` story | Sidebar header / FileViewer Toolbar+InfoPanel / AppShell `header` slot / 未來 Drawer top bar |
| **垂直居中 icon + title + description(+ action)** | `components/Empty/` — `<Empty>` 元件 | **「告訴使用者狀態」的 surface**:空資料 / 拖放邀請(FileUpload)/ 錯誤 / 首次引導 / 無權限 / 載入佔位(非 Skeleton)|
| 橫向操作按鈕列（gap-2 分組）| `patterns/action-bar/` | Toolbar、page header actions、form footer buttons |
| 水平溢出處理(捲動/收合,**隱藏捲軸+ fade-mask** UX)| `patterns/horizontal-overflow/` | Tabs / ChipGroup / 未來 Steps 的溢出(刻意隱藏 scrollbar) |
| **跨 OS 一致 overlay 捲軸(顯示捲軸但不吃寬度)** | `components/ScrollArea/` | DataTable 水平捲動 / Sheet / Dialog body / Sidebar 長 nav 等需要使用者知道有捲軸又要跨 OS 視覺一致 |
| **固定長寬比容器(防 CLS 坍塌,多張圖統一 ratio)** | `components/AspectRatio/` | Coachmark media / Carousel item image / Card thumbnail / Chart container(override default 16:9) |
| Field wrapper（border + padding + startIcon + endAction 結構) | `components/Field/field-wrapper.tsx` + `field-controls.spec.md` | 所有單行可編輯欄位元件 |

### 自我檢查腳本(.claude/rules/ui-development.md「建立 UI 前必讀」保留這節的精簡版,完整對照在本檔上表)

- 新元件有 icon+text 垂直堆疊? → 用 `<Empty>`,不自己畫 icon + title + desc
- 新元件有橫向 row 結構(prefix/content/suffix)? → 用 `element-anatomy/item-anatomy` 的 `<MenuItem>` + slot components(`<ItemIcon>` / `<ItemAvatar>` / `<ItemLabel>` / `<ItemSuffix>` / `<ItemInlineAction>`)
- 新元件是浮層 + 有 header/body/footer? → 用 `overlay-surface`
- 新元件是 **固定高度 chrome header(toolbar / page top bar / panel 標題列)**? → 用 `header-canonical` 的 `<ChromeHeader>`(border/padding/高度/tabs/dismiss 全契約;或在 `<AppShell header={...}>` slot 傳 `<ChromeHeader>`),**先讀 `header-canonical.spec.md` + `Patterns/Header Anatomy` story**,不自刻 `<div className="flex h-12 items-center border-b px-4">`
- 新元件內容**可能溢出容器且需要使用者捲動**? → 用 `ScrollArea`(跨 OS 一致 overlay 捲軸);若是刻意隱藏捲軸 + fade-mask → 用 `horizontal-overflow` pattern
- 新元件有**圖像 / media 容器需要鎖定長寬比**(防 CLS、統一多張圖比例)? → 用 `AspectRatio` primitive,不硬寫 `aspect-video` / `aspect-square` class
- 以上都沒命中 → 才可自建,但 **建完要立刻回來加行**(防下一個人又重造輪子)
- **本規則同樣適用 story / consumer / exploration code**:不 hand-craft 已有 prop 能做的事(如 Input loading 走 `loading` prop 不自刻 `<div className="relative"><input/><div className="absolute">` / 全頁 loading 走 `<Empty icon={<CircularProgress/>}/>` 不自刻 `absolute inset-0`)。遇缺口**回元件 spec 擴 API**,不自刻繞過 — hand-craft 視覺對齊 bug 上游

具體 anti-pattern signals → `/design-system-audit` Dim 21;pixel-level 視覺 regression(API 用對但視覺仍跑掉)→ `/visual-audit`(D5)抓(原 memory `project_pending_tasks` 已 retire)。

---

## overflow 使用三規則(避免跨 OS 跑版)

1. Design-system 元件 `.tsx` 內**禁止** raw `overflow-auto / overflow-scroll / overflow-{x,y}-{auto,scroll}`(hook `lib/_token_hygiene.sh` Check 5 守衛)
2. 需捲軸且跨 OS 一致 → 用 `ScrollArea`
3. 刻意隱藏捲軸 + fade-mask → 用 `horizontal-overflow` pattern
4. 例外:`overlay-surface` spec 明文允許 Dialog body `flex-1 overflow-y-auto`(viewport-fill 特殊 context);若未來此場景需跨 OS 一致,遷移 ScrollArea 再更新 spec
