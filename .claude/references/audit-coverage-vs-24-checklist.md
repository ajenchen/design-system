# Audit 覆蓋 vs 業界 24 節 checklist —— 對照 + 決策

**Date**: 2026-04-24
**Trigger**: User 問「我們稽核缺了哪些?」→ 用業界通用 24 節 checklist 做 gap 分析
**本 doc 目的**: 釘住「為什麼不補某些項」的 rationale,避免下次又被誤認為缺口

---

## 核心洞察 — Dim 9 是 multiplier

**「符合 shadcn / Radix primitive 框架」這條 audit(`/design-system-audit` Dim 9)驗過 → 自動吃掉 24 節中 8 節大部分**。

這是 M1「SSOT」+ mindset #2「優先消費既有」在 meta 層的體現:shadcn + Radix = 我們的 framework SSOT,它一致 = 下游一致,不必平行補 24 dim。

| 24-checklist # | 被 Dim 9 / Radix 吸收的原因 |
|---|---|
| #4 Ref | shadcn 強制 `forwardRef` + `displayName`,Dim 9 必驗 |
| #5 Composition | shadcn 強制 `asChild` + Slot + `{...props}` spread |
| #6 HTML 語意 | Radix primitive 用對 `<button>` / `<a>` / `[role]` |
| #7 A11y 核心 | Radix 內建 keyboard / ARIA / SR |
| #8 state 大半 | Radix forwards `data-state="open/closed/checked"` |
| #11 Overlay focus trap / portal | Radix DialogPortal / Popover 內建 |
| #12 form native props | `{...props}` spread 到 native input |
| #1 native HTML attributes | `{...props}` spread 解 |

## 被 tsconfig + Vite + ESM 架構吸收

| 項目 | 吸收者 |
|---|---|
| #2 TS 大半 | `strict / noUnusedLocals / noUnusedParameters / noFallthroughCasesInSwitch / noUncheckedSideEffectImports` |
| #19 Package export | `type: module` + Vite dev/build + 無 barrel |
| #16 SSR | **不適用**(Vite SPA 不是 Next/Remix) |
| #14 unmount / listener cleanup 大半 | React strict mode dev 雙 mount + tsc useEffect deps |

## 刻意不補 — 架構決策

| 項目 | 不補的 rationale |
|---|---|
| #17 unit test | 走 **story-as-test + visual-regression**(stories + `/visual-audit` Layer A + M11 interactive state walk)。補 unit = 重複 story 覆蓋,`/story-writing` earn-existence 原則視其為 noise |
| #19 CJS 輸出 | 內部 DS 非發 npm package,CJS 是 dead requirement |
| #22 cross-browser full matrix | Firefox / IE 不是我們受眾;iOS Safari 有 Radix ensures 大半。補全 matrix = 過度 |
| #20 CVE 全套 | 內部 DS 非 public npm,補 `npm audit` weekly cron 夠 |

## 真缺 + 已補(2026-04-24)

| 真缺項 | 補的形式 | Commit |
|---|---|---|
| #13 i18n 硬寫字串 | `post_edit_dispatcher.sh → lib/_hardcoded_strings.sh` PostToolUse flag(2026-05-13 由獨立 hook `check_hardcoded_strings.sh` folded 進 dispatcher lib),flag DS primitive tsx(非 stories)CJK ≥ 3 chars / 英文 sentence-case label;支援 `// i18n-allow: {rationale}` 白名單 | 本次 session |
| #3 Controlled / Uncontrolled + #12 Form dual-mode | `design-system-audit` Dim 26(新 Group J)— 掃 form + overlay 元件 value/defaultValue / open/defaultOpen / checked/defaultChecked 的 pair 完整性;V1-V4 violation types | 本次 session |
| #23 edge case(null / empty / rapid / success) | `/ux-audit` Phase 5 從 3 態 → 5 態 + null-safety + rapid-interaction + edge case corollary | 本次 session |

## 未補 — 以後真需要再補

| 項目 | trigger 條件 |
|---|---|
| #22 cross-browser 抽測 | 第一個 Safari-specific bug 落地 → 建 weekly Playwright Safari smoke test |
| #20 `npm audit` cron | 第一次 dep CVE 被通知 → schedule `npm audit` weekly report |
| RTL 支援 | 第一個 RTL 產品需求 → 補 RTL audit dim + 測 logical properties |
| Next.js / Remix 整合 | DS 要發 npm 時 → 補 `use client` boundary + SSR 測試 |

## 為什麼不寫成 24 dim 平行 audit

**`/design-system-audit` 若膨脹成 24 dim** → 平行跑 24 個 sub-agent 每個吐 400-字 report → user cognitive load 爆 + 重複判斷(e.g. #4 Ref / #5 Composition 都是 shadcn 已驗的)。正確姿態:

1. **Framework audit(Dim 9)嚴格化** = 一條驗過 cascade 吸收 8 節
2. **新 dim 只為真無法從 framework 推導的 gap**(i18n / controlled-uncontrolled / edge case 三個)
3. **FAQ / 常被問到但已覆蓋的項**寫本 doc,下次 user 問「我們缺 X 嗎」先讀本 doc 再答

## Cross-link

- CLAUDE.md `# 稽核 canonical` 3-tier × 6-dim
- CLAUDE.md Meta-Pattern M1(SSOT)+ M8(benchmark)+ M10(exhaustive scan)
- `.claude/skills/design-system-audit/SKILL.md` Groups A-J
- `.claude/skills/ux-audit/SKILL.md` Phase 5
