# Dim 74 overlay-open 存量 backlog(2026-07-16 DA3 A.3 重掃;列帳不改)

**判準(加廣版,取代 hook 舊窄 regex)**:檔內任一 `open={<任何值/變數>}` / bare `open` JSX attr / `defaultOpen` / `play()` / `useState(true)` 皆算「有 open 機制」→ 不列帳。**真違規 = 檔內有真實 `<XxxTrigger>` JSX 使用 + 全檔零 open 途徑 + 無 `@overlay-open-skip` escape**(M15:overlay content 必須 visual-audit coverable)。

**方法**:全掃 `packages/design-system/src/**/*.stories.tsx`(64 檔含 overlay trigger 字樣 → 37 檔真實 JSX 使用)→ 逐檔驗 mechanism;prose 誤匹配(props 表 / 註解提及 trigger 或 open)逐檔人工排除。

## 對照原 2026-07-12 hook-residue 15 檔清單

- **加廣後除名 3 檔**(controlled `open={var}` 現在算有機制):
  - `FileViewer/file-viewer.principles.stories.tsx`(open={var},useState(false) 起始)
  - `AppShell/app-shell.stories.tsx`(open={filterOpen|sortOpen},useState(false) 起始)
  - `Coachmark/coachmark.principles.stories.tsx`(Coachmark 直傳 bare `open` attr)
- **原清單誤判修正 0 檔**;其餘 12 檔維持真違規。

## 真違規 12 檔(純 trigger-only,零 open 途徑)

| # | 檔案 | Trigger | 備註 |
|---|------|---------|------|
| 1 | `components/Breadcrumb/breadcrumb.principles.stories.tsx` | DropdownMenuTrigger ×1 | |
| 2 | `components/Breadcrumb/breadcrumb.stories.tsx` | DropdownMenuTrigger ×1 | 檔內 `@story-trait-rationale` 是別的 hook 的 escape,非 `@overlay-open-skip` |
| 3 | `components/Dialog/dialog.principles.stories.tsx` | DialogTrigger ×8 | |
| 4 | `components/DropdownMenu/dropdown-menu.anatomy.stories.tsx` | DropdownMenuTrigger ×3 | `useState(true)` 僅 CheckboxItem checked state,非 open;state-machine 動畫段為手動模擬非真 overlay |
| 5 | `components/Input/input.principles.stories.tsx` | TooltipTrigger ×1 | |
| 6 | `components/Input/input.stories.tsx` | TooltipTrigger ×1 | |
| 7 | `components/Popover/popover.principles.stories.tsx` | Dialog/DropdownMenu/Popover/Tooltip Trigger ×8 | 四種 overlay 全 trigger-only |
| 8 | `components/Separator/separator.principles.stories.tsx` | DropdownMenuTrigger ×1 | |
| 9 | `components/Sheet/sheet.anatomy.stories.tsx` | SheetTrigger ×3 | 檔內唯一 `open` 出現 = props 表 prose(`open / onOpenChange` 說明列),非機制 |
| 10 | `components/Sheet/sheet.principles.stories.tsx` | Dialog/Popover/Sheet Trigger ×7 | |
| 11 | `components/Tabs/tabs.stories.tsx` | DropdownMenuTrigger ×1 | overflow menu demo |
| 12 | `components/Tooltip/tooltip.principles.stories.tsx` | TooltipTrigger ×7 | |

## Prose-only 誤匹配(非違規,重掃時人工排除;供未來 hook regex 參考)

- `Breadcrumb/breadcrumb.anatomy.stories.tsx`(:442 prose 提及 DropdownMenuTrigger;靜態結構展示明文未接線)
- `DatePicker/date-picker.anatomy.stories.tsx`(:944-945 keyboard 文件 prose 提及 PopoverTrigger)
- `ProfileCard/profile-card.stories.tsx` / `profile-card.principles.stories.tsx`(註解提及 HoverCardTrigger,實際走 `<Avatar hoverCard>` 封裝)

## 修法(defer;本檔僅列帳)

各檔補 OpenSnapshot 變體(`defaultOpen` / `useState(true)` / `play()`)或 per-file `@overlay-open-skip` escape + rationale。Hook `check_overlay_open_focus_escape_probe.sh` regex 廣度 gap(只認 `open={true|isOpen|isVisible}`,漏 controlled `open={<var>}` 與 bare `open`)已由 hook-residue dim-74.json 記錄,同 defer。
