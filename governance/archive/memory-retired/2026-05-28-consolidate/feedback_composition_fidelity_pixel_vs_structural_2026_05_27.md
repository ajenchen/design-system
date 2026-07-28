---
name: Composition fidelity — pixel diff 是錯工具(template-vs-canonical),用 anti-pattern hooks + 架構保障
description: 2026-05-27 verified — DS canonical 跟 consumer template AppShell pixel diff 1.4% 是 INTENTIONAL content variation,非 SSOT drift。架構(workspace link + portal)保 render fidelity;hooks 攔 SSOT 違反;pixel diff 僅同內容 story 適用
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Composition Fidelity: Pixel vs Structural canonical

## Rule

**Render-level fidelity 由架構保障,非 pixel diff**:
- Consumer (product-workspace) `@qijenchen/design-system` = workspace link `file:.../packages/design-system`(local)OR npm tag(deployed)
- 兩端是**同一份 DS source**,**code-level drift 不可能**
- "Drift" 只能來自:(a) consumer wraps DS w/ broken pattern → anti-pattern hooks 攔 (b) Netlify stale deploy → operational fix

**Pixel diff 適用 vs 不適用**:
- ✅ **適用**:同內容 story re-render 一致性驗(eg. button.stories.tsx#Default 多次跑像素 ≤ 0.5%)
- ❌ **不適用**:template AppShell vs DS canonical sidebar.stories.tsx#IconCollapse — **內容刻意不同**(nav items / brand text / page widgets / chrome rightSlot 全 differ by design),pixel diff 1.4% ≈ 13000 px = noise 而非 drift

**Composition fidelity 真機制**:
1. **Anti-pattern static hooks**(已 ship):
   - `check_sidebar_menu_button_implicit_wrap.sh` — `<SidebarMenuButton>` 無 asChild 包 `<ItemAvatar>` BLOCK
   - `check_chrome_header_avatar_canonical.sh` — chrome header 用 `<ItemAvatar>` BLOCK(必 raw `<Avatar size={24}>`)
   - `check_consumer_ds_primitive_misuse.sh` — 6 anti-pattern
   - `check_consumer_story_baseline.sh` — high-risk primitive 必含 `@story-baseline` marker
   - `check_consumer_no_ds_catalog.sh` — 禁 PW 重寫 DS catalog
2. **架構保障**:`@qijenchen/design-system` npm workspace link / portal pattern(`AllDsComponents.stories.tsx` iframe to DS Storybook)— consumer 不可能 fork DS source 偏移
3. **Visual diff 補充工具**(不是 SSOT):`scripts/composition-fidelity-visual-diff.mjs` v3 — 對「同內容」story 適用;對「不同內容」template 加 `@composition-fidelity-mode: shell-only` + `@composition-fidelity-mask:` 也只能 cover `<main>`,nav items 等仍 differ

## Why

User 2026-05-27 verbatim:
> 確保所有 ds repo 涵蓋的場景以及各種元件狀態和互動和視覺和樣式,在消費端都能不偏不移的完美復刻

**真意 = render fidelity(component render output 一致),不是 pixel diff per-template**。Architecture 已保 render fidelity。Pixel diff 對 template 是 false-positive 來源。

**Anchor**(2026-05-27 phase D 執行):
- `node scripts/composition-fidelity-visual-diff.mjs` 跑 PW App.tsx vs DS sidebar.stories.tsx#IconCollapse → 1.4% diff
- 三 verify:diff PNG 看到 sidebar nav labels(Dashboard/Inbox/Team vs Dashboard/Customers/Orders)/ brand text("Acme Inc" vs "Acme Product")/ footer 文字 / chrome rightSlot button 全 differ
- 結構對齊(Avatar 24 + text-body-lg / chrome header height / sidebar width / footer pattern 全 byte-identical)
- 結論:1.4% diff = intentional content variation,不是 drift

## How to apply

1. **新元件 / pattern propose**:用 anti-pattern hooks + spec.md SSOT,**不**仰賴 pixel diff
2. **PW template stories**:
   - 同 DS canonical 結構 → 加 `@story-baseline:` marker(機械強制 per check_consumer_story_baseline.sh)
   - Content 刻意 differ → 加 `@composition-fidelity-mode: shell-only` + `@composition-fidelity-mask: main, [custom-selectors]`(目前 mask 只 cover `<main>`,nav/header 還是 differ 是 known limitation)
3. **CI gate**(`.github/workflows/composition-fidelity.yml`)主要 catch **新加 consumer story** structural break;intentional content variation 用 threshold override(`@composition-fidelity-threshold: 1.5`)
4. **未來改進**:v4 加 DOM structural diff(class signature equivalence + computed style equivalence)— 取代 pixel diff for template comparison

## Mechanical enforcement

- `scripts/composition-fidelity-visual-diff.mjs` v3 — pixel/shell-only/structural mode + per-mapping threshold
- `.github/workflows/composition-fidelity.yml` — DS + PW build + diff CI gate
- 5 anti-pattern hooks(check_consumer_*)— P0 BLOCKER catch SSOT 違反
- Audit dim 70-78 — design-system-audit SKILL.md cover composition fidelity audit dim list

## Anti-pattern

- ❌ 把 template-vs-canonical pixel diff 當 SSOT drift verdict(false positive)
- ❌ 為通過 pixel diff 修 consumer 內容(違反 template demo 性質)
- ❌ 跳過 anti-pattern hooks 仰賴 pixel diff(pixel diff 是補充,不是主防線)
- ❌ 改 DS canonical source 對齊 consumer 內容(SSOT 反向 dependency)

## 對齊原則

- mindset #1 不取巧:render fidelity 由架構保(workspace link),不靠 pixel diff
- M17 SSOT 鐵律:DS source = single source,consumer link to it
- M23 DS canonical 優先:anti-pattern hooks 攔 consumer 偏離 DS
- M29 spec 先 grep:propose 前 grep DS spec 找 owner
- 對齊 Chromatic / Percy:pixel diff for same-content;structural diff for templates

## Cross-link

- Dim 77 — Composition-fidelity visual diff(design-system-audit/SKILL.md)
- Dim 70 — Consumer @story-baseline enforcement
- Hook check_consumer_story_baseline.sh / check_chrome_header_avatar_canonical.sh / check_sidebar_menu_button_implicit_wrap.sh
- Memory feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md(P0 BLOCKER preference)
