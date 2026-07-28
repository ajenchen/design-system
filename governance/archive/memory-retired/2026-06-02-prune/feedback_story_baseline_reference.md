---
name: 寫 stories wrap primitive 必先 reference 既有完整佈局 baseline
description: 寫 stories 時若 wrap 既有 primitive(Sidebar/ChromeHeader/Dialog/DataTable 等),必先 grep 該 family `stories.tsx` 完整佈局 story,Read helper(WorkspaceBrand/MAIN_NAV/PageContent/toolbar)當 baseline,禁直接寫 simplified mock
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Story baseline reference — anti-drift invariant

**Rule**:寫 stories.tsx wrap **既有 primitive** 時(`<Sidebar>` / `<ChromeHeader>` / `<Dialog>` / `<DataTable>` / `<Sheet>` 等),**必先 grep 該 primitive `*.stories.tsx`** 找「完整佈局」類 story,**Read 其 helper** 當 baseline reference。

**Why**:2026-05-20 user 抓 AppShell stories 跟 Sidebar 既有「完整佈局」story 視覺嚴重偏移(4 處):
- SidebarHeader 沒用 `<WorkspaceBrand>`(ItemAvatar square + text-body-lg)→ 我寫 minimal span
- SidebarMenuButton 沒用 `startIcon` + `tooltip` props → 我寫 children inline `<Icon className="size-4" />`
- 沒 `<SidebarFooter><UserFooter>` block
- ChromeHeader children 用 `flex-1` 撐 title 到中間造成 toggle + title 巨大間距

Root cause(codex Layer B 2026-05-20 D1):**story 被當成可隨手 mock 的展示殼,沒納入 production-grade visual SSOT replay**。Claude 已多次違 M1/M23/M29 但 story 層無 hard rule。

**How to apply**:
1. 寫 stories 前 grep `grep -nE "完整佈局|IconCollapse|WithBulkActions" src/design-system/components/<Primitive>/<primitive>.stories.tsx`
2. Read helper(`WorkspaceBrand` / `UserFooter` / `MAIN_NAV` / `PageContent` / toolbar pattern)
3. 在新 stories.tsx 檔頭標 `// @story-baseline: <path>#<StoryName>`
4. 抄該 helper 結構,不憑直覺改

**Enforcement**:
- `story-rules.md`「Production-grade composition fidelity」段
- `story-writing/SKILL.md` Phase 0
- `check_story_invariants.sh` R7(2026-05-20 ship)
- 本 memory pointer

**Anti-pattern 錨例**:
- `<SidebarHeader><span className="text-body font-medium px-2">Acme Inc.</span>` ← 應 wrap `<WorkspaceBrand>`(ItemAvatar + text-body-lg)
- `<SidebarMenuButton><Inbox className="size-4" /> Inbox</SidebarMenuButton>` ← 應 `<SidebarMenuButton startIcon={Inbox} tooltip="Inbox">Inbox</SidebarMenuButton>`
- `<ChromeHeader><span flex-1 ml-2>title</span></ChromeHeader>` ← 應 `<SidebarTrigger /><h1 className="text-body-lg font-medium">{title}</h1>` 緊鄰 gap-2(per Sidebar PageContent canonical)
