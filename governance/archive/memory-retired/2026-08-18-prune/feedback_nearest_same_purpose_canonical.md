---
name: Nearest same-purpose canonical usage wins(M35 / M23(d))
description: 寫 stories wrap 既有 primitive 前必查 registry + grep 完整佈局 baseline + Read helper + 抄結構 + 標 marker;cite 存在 ≠ consume 落實(2026-06-02 fold 同事件 feedback_story_baseline_reference 的 R7 機制進來)
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Nearest same-purpose canonical usage wins(M35 / M23(d))

**Rule**:寫 stories(或任何 UI composition)wrap 既有 primitive(`<Sidebar>` / `<ChromeHeader>` / `<Dialog>` / `<DataTable>` / `<Sheet>` 等)前必:(a) Read `packages/design-system/ds-canonical/references/story-baseline-registry.json`;(b) grep 該 family `*.stories.tsx` 的「完整佈局」story,Read 其 helper(`WorkspaceBrand` / `UserFooter` / `MAIN_NAV` / `PageContent` / toolbar)當 baseline;(c) 逐 prop / 逐 className 抄該 production archetype 結構,**不准憑記憶寫 simplified mock**。

**Why(codex Layer B D4 2026-05-20 verdict)**:Claude 反覆偏移真 root cause = **「SSOT 消費被當成引用儀式,而不是同目的 canonical usage 的機械證明」**。Cite 存在(`@story-baseline:` marker)≠ consume 落實(實際抄 baseline 結構)。最相近同目的 canonical 用法**優於**泛用 spec wording。story 過去被當成可隨手 mock 的展示殼,沒納入 production-grade visual SSOT replay。

具體事件 — 2026-05-20 user 抓 AppShell stories 跟 Sidebar 既有「完整佈局」story 視覺嚴重偏移 4 處:
- SidebarHeader 沒用 `<WorkspaceBrand>`(ItemAvatar square + text-body-lg)→ 寫成 minimal span
- SidebarMenuButton 沒用 `startIcon` + `tooltip` props → 寫成 children inline `<Icon className="size-4" />`
- 沒 `<SidebarFooter><UserFooter>` block
- ChromeHeader children 用 `flex-1` 撐 title 到中間造成 toggle + title 巨大間距

**How to apply**:
1. 寫 stories 前必 Read `packages/design-system/ds-canonical/references/story-baseline-registry.json`
2. 該 primitive 有 entry → 抄 baseline + requiredHelpers + variantRules(逐 prop / 逐 className);無 entry → STOP,先 add registry entry 才寫
3. 另 grep `grep -nE "完整佈局|IconCollapse|WithBulkActions" <primitive>.stories.tsx` 找完整佈局 story,Read helper 當 baseline
4. 檔頭標 `// @story-baseline: <path>#<StoryName>` cite
5. 違 antiPattern → P0 BLOCKER(`check_story_invariants.sh` R7 marker-presence + R8 registry antiPattern regex)

**反覆違反錨例(2026-05-20 4 類 + 具體 code)**:
- simplified mock:`<SidebarHeader><span className="text-body font-medium px-2">Acme Inc.</span>` ← 應 wrap `<WorkspaceBrand>`(ItemAvatar + text-body-lg)
- dev jargon(anatomy「規則 1A/1B/1C 三派並存」designer 看不懂)
- wrong variant(toolbar filter/sort 用 tertiary,canonical 是 text)
- 結構不消費 primitive props:`<SidebarMenuButton><Inbox className="size-4" /> Inbox>` ← 應 `<SidebarMenuButton startIcon={Inbox} tooltip="Inbox">Inbox</SidebarMenuButton>`;`<ChromeHeader><span flex-1>title</span>` ← 應 `<SidebarTrigger /><h1 className="text-body-lg font-medium">{title}</h1>` 緊鄰 gap-2(per Sidebar PageContent canonical)

**Mechanical enforcement(5-layer)**:
- `check_story_invariants.sh` R7(marker-presence,2026-05-20 ship)+ R8(registry antiPattern regex)
- `story-rules.md`「Production-grade composition fidelity」段
- `story-writing/SKILL.md` Phase 0
- `packages/design-system/ds-canonical/references/story-baseline-registry.json`(registry SSOT)
- 本 memory(SSOT;2026-06-02 fold 原 `feedback_story_baseline_reference.md` 同事件同原則的 R7 grep 機制 + 4 缺陷 + 錨例進此檔)

**對齊 world-class**:Storybook portable stories + Polaris / Atlassian「prebuilt components first, composition with primitives, real component examples not simplified visual mocks」。
