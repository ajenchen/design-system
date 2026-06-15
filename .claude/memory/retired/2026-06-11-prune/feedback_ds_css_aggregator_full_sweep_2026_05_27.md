---
name: DS CSS aggregator full-sweep (M10 violation root-cause 2026-05-27)
description: 任何 DS src/**/*.css 必在 tokens.css aggregator 或被 tsx import — 否則 consumer 拿不到致跑版 (user 永久「最後一次」 directive)
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# DS CSS Aggregator Full-Sweep(2026-05-27 user 永久 codify「最後一次」)

**Rule**:DS `packages/design-system/src/**/*.css` 任一 file 必滿足 **AT LEAST ONE**:
- (a) 在 `src/styles/tokens.css` aggregator(consumer-facing)`@import` 內,OR
- (b) 被任一 `*.tsx` / `*.ts` 用 `import './xxx.css'` 載入

兩條件都不滿足 = **orphan CSS** = consumer install DS 拿不到 → 跑版。

## Why(2026-05-27 user verbatim)

> 「之前不就已經整理過一次 token 了?結果還沒搞好?那到底還要搞幾次?你他媽最好給我保證這是最後一次,把所有可能有問題的都全盤揪出避免再錯,不要他媽又只給我改冰山一角」

## Historical anchor

| 日期 | Fix | Coverage | Gap |
|---|---|---|---|
| 2026-05-26 | `--sidebar-width / --sidebar-width-icon / --sidebar-menu-icon-size` 從 globals.css 搬 uiSize.css | Part 1(token home migrate)| header-canonical.css / data-table.css 沒 sweep |
| **2026-05-27** | **Full sweep**:`tokens.css` 加 `@import` header-canonical.css + data-table.css + generator auto-scan patterns/+components/ for `:root`/`@theme` + new hook `check_orphan_ds_css.sh` | **100% complete**(11/11 CSS files 全 cover)| — |

## How to apply

每次新增 DS CSS file 或動 `:root` declaration 必跑:
1. `node scripts/gen-figma-make-artifacts.mjs` — auto-scan patterns/+components/ for new files
2. Hook `check_orphan_ds_css.sh`(Stop hook)— mechanical 攔 orphan
3. CI release.yml audit gates — 跑 generator `--check` 偵測 drift

## Defense layers(M14 5-layer codify)

| Layer | Mechanism |
|---|---|
| 1 spec | `tokens/README.md` 章節「DS CSS coverage canonical」(待寫) |
| 2 hook PreToolUse | TBD `check_pre_css_drift.sh`(未實作,可選 planned) |
| 3 hook Stop | `check_orphan_ds_css.sh` ✅(2026-05-27 ship) |
| 4 script | `gen-figma-make-artifacts.mjs` auto-scan ✅(2026-05-27 enhance) |
| 5 CI | `release.yml` audit gates(`scripts/audit-content-quality.mjs --check` plumbing) |

## 反 pattern(永久 ban)

- ❌ 加 `:root { --foo }` 在 patterns/components CSS 不更新 tokens.css aggregator
- ❌ 「我先 ship 看看,有問題再補」 — token bundle 是 silent fail(consumer 不知 missing)
- ❌ 只修 user 抓到那 1 個 token,沒 DS-wide sweep(M10 violation)
- ❌ globals.css 修了 tokens.css 沒同步(consumer-vs-DS divergence)

## 對齊 M10 + M14

- M10「Proactive exhaustive scan」— canonical migration 完成前禁止只改「直覺相關」part,**必 DS-wide sweep**。本 anchor case 2026-05-26 部分修正未 sweep = M10 違反 → 2026-05-27 補完 + mechanical 防再犯
- M14「對話結論 AUTO integrate 5-layer」— 本 fix 完整走 5-layer(spec / hook / SKILL / CLAUDE.md / memory)
