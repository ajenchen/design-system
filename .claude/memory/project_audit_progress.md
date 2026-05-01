---
name: project_audit_progress
description: Pointer + latest audit run summary. Historical detail in git log.
type: project
originSessionId: 7fa6c876-f1f7-4537-8cb3-1c97212e5a80
---
## Current state(2026-05-01)

**DS scope**: 60 components + 4 patterns + 7 token families. All have spec / showcase / anatomy / principles stories. Build baseline green(tsc -b 0 real errors / audit-content-quality clean / compile-stories 60/60 aligned).

**Skills(18+)** + **Hooks(26)** — see `.claude/skills/README.md` + `.claude/hooks/README.md` censuses。

## Latest audit run — 2026-05-01 `/design-system-audit` 31-dim sweep + dismiss canonical deep dive

7 parallel sub-agents Phase 1(31 audits)→ Phase 2 triage → Phase 3 fix(per-batch commit + push)→ Phase 4 report。

**Fixed + pushed**(branch `claude/ds-complete-audit-1Jich`,9 commits beyond audit baseline):

1. **`fix(visual-audit)`**(`3c85b58`): ensure-playwright-browsers symlink fallback 修 sandbox v1217 expected vs cache v1194 mismatch — visual-audit 復活
2. **`docs(spec)`**(`0f6836b`): Dim 2 7 SSOT dead pointers — Dismiss canonical 從 item-anatomy 抽到 inline-action 後 stale references(alert / sheet / file-viewer / overlay-surface / element-anatomy)+ overlay-surface.spec.md L296-326 stale v1 段刪除(矛盾 v5 canonical sm + data-dismiss),24 行瘦身
3. **`refactor(dismiss)`**(`f2328e5`): Dim 17 Button.dismiss prop semantic — FileUpload list remove(`onRemove` callback,collection 操作非 surface dismiss)→ `variant="text"` + manual fg-muted className;Tag dismiss 從自刻 `<button>` refactor 為 `<ItemInlineActionButton>` + 新增 `hoverBgClassName?: string` override prop(支援 Tag solid variant chromatic hover bg);消除 Tag.tsx 自陳 tech debt
4. **`docs(spec)`**(`4af1397`): Dim 3 SSOT reciprocal — re-run `add-reciprocal-pointers.mjs`,9 spec 補 13 inbound back-pointers
5. **`refactor(Select)`**(`0ae347a`): Dim 17 prop value cross-component collision — `Select.display='text'` rename `'plain'`(避撞 `Button.variant='text'`);P0 menu-item.stories.tsx Default label 改真實業務情境

**Validation**:tsc 0 real errors / audit-content-quality clean / compile-stories 60/60 aligned / visual-audit Tag stash test 證實 my refactor 0-pixel-impact

**Visual baseline drift identified**(non-action):tag-all-variants.png 0.789% diff 是預存 baseline drift(Chromium build version / OS font rendering 差異),非 my refactor 造成 — stash test 確認

**False positives identified**(audit agent 報但實際無問題):
- Dim 28 Story 拆分 — MenuItem/SegmentedControl 只有 `WithStartIcon` 沒 `WithEndIcon`,不違反 same-slot rule。FP

**Unresolved P1/P2 — 需 user scope 決策**(下次 session pick up):
- Dim 7 邊界案例 10 處 — Tag/Notice/Toast/Empty/AspectRatio/Input/Combobox/DropdownMenu/Select/RadioGroup 補「本元件無 X 狀態」one-liner
- Dim 8 7-維度 對標 — Field/NumberInput/AspectRatio/HoverCard/Empty 補缺維
- Dim 20 Spec 硬寫機械化值 ~25-30 — top: FileItem 22 / Menu 18 / Button 18 / TimePicker 17 / Steps 17
- Dim 23 Benchmark gap 5(extra audit)— typography / radius / opacity / form-validation / command 補 ≥3 家 world-class 對照
- Dim 27 Clean code `any` 6 處 — DataTable 集中(filter-panel / sort-manager / data-table.tsx)
- Dim 29 Trait stories P0 = 41(批次 migration via /story-auto-compile-migrate)
- Dim 30 Principles canonical P0 = 56(strict reading;lenient reading 0)— 需 user 裁示 strict vs lenient
- Dim 19 patterns/i18n/ relocate or stub spec

## Self-improvement capture(2026-05-01)

- **New FP**: visual-audit baseline drift 不等於 my-change visual regression — 必跑 stash test(checkout pre-refactor → re-run audit → 比對 diff numbers)才能 isolate cause。回填 `.claude/skills/design-system-audit/references/principle-audit-protocol.md` 的「常見 FP 記憶」節
- **New FP**: 「dismiss prop 跨 collection-remove 場景」是 audit Dim 17 prop semantic 漂移的 missed coverage — 應加進 audit-prompts.md Dim 17 grep pattern(callback `onRemove` / `onClear` / `onDelete` 但用 `dismiss` prop = violation)
- **No new meta-pattern**(本 session 無 M21 候選)
- **User correction integrated**:BulkActionBar X 是 dismiss surface(關 bar)非 onClear collection — 撤回原本「FileUpload + BulkActionBar 都改 variant=text」批次,只改 FileUpload(`onRemove` 真 collection 操作),BulkActionBar 保留 `dismiss` prop。M10 scan DS-wide 後確認剩下 dismiss usage 全合法

## Previous audit run — 2026-04-26 `/design-system-audit --deep` 30-dim sweep

4 parallel sub-agents Phase 1 → Phase 2 triage → Phase 3 fix → Phase 4 report.

**Fixed + pushed**(`5ed79d9` + `512620a`):
- Dim 15: CLAUDE.md + tokens/README 7 dead anchors → path-scoped rules pointers
- Dim 1: Button/Tag anatomy Inspector seeds 對齊 cva default(sm→md / blue→neutral)
- Dim 7+8: Avatar/Sidebar/FileItem 補 ## A11y 預設;FileItem 補 與 FileUpload 分界 + 禁止事項;Button 補 何時用/何時不用
- Dim 13: 30 anatomy 加 // @anatomy-rationale: 註解(N/A by design 或 canonical alias),Avatar 補 StateBehavior 真實 section
- Dim 24: DataTable showcase Bordered retire(anatomy.BorderedProp canonical 涵蓋);RowHeightModes/HeightModes → RowAutoHeight/ContainerHeight 鑒別 prop 教學
- Dim 27: SelectionItem 函式 body 128→<80 行(抽 PrefixSlot + ContentSlot)

**False positives identified**(audit agent 報但實際無問題):
- Dim 27 file-size 4 P0 + 3 P1 → 7 檔均有 `// code-quality-allow: file-size` rationale 註解,canonical script(code-quality-audit.mjs)顯示 0 P0
- Dim 25 Button TooltipVisible/HoverFocusState retire candidates → 是 visual-audit Layer A interactive state pilot 基礎設施,earn existence,keep

**Build state final**:tsc 0 / vite 580ms / content-quality 0 drift / compile-stories 59/59 / code-quality 0 findings

## Self-improvement capture(2026-04-26)

- **New FP**: 跑 file-size audit dim 必先 grep `// code-quality-allow: file-size` escape comment(canonical 機制),勿用純行數判斷 → 回填 audit-prompts.md Dim 27 prompt
- **New FP**: Story-grounding dim(Dim 25)應排除 visual-audit 基礎設施 stories(`tags: ['!autodocs']` + `play()` interactive pilot)→ 回填 audit-prompts.md Dim 25 prompt
- **No new meta-pattern**(本 session 無 M21 候選)

## Historical(by commit, not detail here)

- 2026-04-18~19: 全 spec coverage / 4-Family Layout Model / overlay-surface / 4-skill 生態
- 2026-04-21~24: see `project_audit_history_2026_04.md`(8 sessions 合輯)
- DS Devmode addon: source-first token + calc formula + Author CSS + redline T-caps,完整 spec 在 `.claude/planning/ds-devmode.md`

**Tech debt**: 清空。
