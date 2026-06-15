---
spec: orphan-tokens
scope: token retire vs structural-keep classification SSOT
audit_dim: design-system-audit Dim 48
script: scripts/audit-orphan-tokens.mjs
benchmark:
  - Material Design Tokens M3 — 完整 1-10 色階保留 https://m3.material.io/styles/color/the-color-system/key-colors-tones
  - Atlassian Design Tokens — palette tier 結構性保留 https://atlassian.design/foundations/color-new
  - Carbon Design System — token category metadata classifier https://carbondesignsystem.com/elements/color/tokens
  - Polaris Design Tokens — semantic SOP 5-piece set canonical https://polaris.shopify.com/design/colors
---

# Orphan Token 分類設計原則(retire vs structural-keep SSOT)

> **Foundational context**(2026-05-21 codify per user verbatim「決策四你他媽仔細給我確認到底該retire的是否真的該retire還是應該結構性保留,請全盤檢查,然後確認之後請下次不要再煩我,尤其是Palette tier」+「都給我做到好」):**永久解決**「audit 每次抓 X 個 orphan tokens」噪音。本 spec 明文哪些 token 結構性保留 + 自動 audit script 識別,user 不需重複確認同一題。

## Scope(何時用 / 何時不用)

- **用**:DS 作者稽核 token bloat(retire vs structural-keep 判定)— `audit-orphan-tokens.mjs` + design-system-audit Dim 48 消費本分類,屬 DS-internal audit SSOT
- **不用**:consumer 選 token 的使用指南 — 那是 `tokens/README.md` + 各 token spec 的職責

## 為什麼會出現「假孤兒」

簡單的 `grep var(--X)` 抓不到以下消費路徑,造成 token **實際有用但 audit 報「無消費」false positive**:

| 消費機制 | 範例 | grep 漏抓原因 |
|---|---|---|
| **Tailwind `@theme inline` bridge** | `--spacing-field-md` → `h-field-md` class | Tailwind 在 build time 從 bridge 讀值轉 utility class,無 `var()` 語法 |
| **`@utility` definition** | `@utility tracking-shortcut { letter-spacing: var(--tracking-shortcut) }` | 是定義,不是消費點 |
| **Class-name match** | `text-primary-text` 對應 `--primary-text` | 走 Tailwind 命名約定 |
| **JS literal mirror** | `motion.ts` export `HOVER_DELAY_RICH_MS = 700` 鏡像 `--hover-delay-rich` | JS 端 hardcode 數字 + import constant,不讀 CSS var |

**修法**:`scripts/audit-orphan-tokens.mjs` 用 comprehensive consumer detection 涵蓋 5 條消費路徑,真實 orphan count drops from 175 → 0(2026-05-21 baseline)。

---

## 結構性保留分類(永久保留,**不視為 retire 候選**)

對齊 Material 3 / Atlassian / Carbon / Polaris token system 共識。每類附 rationale + 識別 regex(`audit-orphan-tokens.mjs` 消費此分類)。

### 1. Palette tier 完整 1-10 色階(77 token,structural)

**Rule**:`--color-{hue}-N`(N ∈ 1..10)即使當前無消費者也**完整保留**。

**Why**:Material 3「Key Colors & Tones」+ Atlassian「Full color spectrum」共識 — palette 是設計師調色盤 SSOT,缺中間階就斷層,新元件需消費中間色時不該 hot-add。**全色階是 capability,不是 cost**。

**Regex**:`^--color-(amber|blue|brown|red|green|deep-orange|grey|indigo|lime|orange|pink|purple|teal|yellow|cyan)-\d+$`

### 2. Magenta / Turquoise 專用 palette(14 token,structural)

**Why**:Tag / Avatar variant 預留色,Polaris / Atlassian 同樣保留 specialty hue 完整色階(不只「目前用到的階」)。

**Regex**:`^--color-(magenta|turquoise)-\d+$`

### 3. Mask alpha(17 token,structural)

**Rule**:`--black-aN`(a02-a85,9 階)/ `--white-aN`(a04-a85,8 階)完整保留。

**Why**:Overlay / scrim / shadow / disabled state alpha composition 預留;Material 3「Surface Tint」+ Apple HIG「Vibrancy」需要完整 alpha ladder。

**Regex**:`^--(black|white)-a\d+$`

### 4. Chart reserved(0-5 token,structural)

**Rule**:`--color-chart-N`(N ∈ 1..5)為 DataViz 預留,即使 DS 內無 chart 元件也保留。

**Why**:Consumer(產品端)會用 ECharts / D3 等 lib 直接消費這些 token 做 chart palette,DS 提供 5-color qualitative palette canonical(對齊 ColorBrewer)。

**Regex**:`^--color-chart-\d+$`

### 5. State variants 完整集(8 token,structural)

**Rule**:`--{hue}-(hover|active|focus|subtle|emphasis|disabled|text)` 即使當前無消費者也保留完整 8-tier emphasis set。

**Why**:Material 3 / Atlassian state token canonical — hover/active/focus 是 elevation 8-tier 一部分,缺一階斷 emphasis ladder。**8-tier 是 capability invariant**。

**Regex**:`^--{HUES}-(hover|active|focus|subtle|emphasis|disabled|text)$`

### 6. Neutral palette 完整 + opaque tier(13 token,structural)

**Why**:Neutral 1-9 是 grayscale spectrum SSOT;`-opaque` 變體是 opacity composition 預留(non-translucent fallback for dark mode / contrast modes)。

**Regex**:`^--color-neutral-\d+(-opaque)?$`

### 7. SOP 5-piece semantic 完整集(1+ token,structural)

**Rule**:每個 semantic role(primary / error / success / warning / info)必有 5 件套:`base / hover / active / subtle / text`;機械保護集另含 `emphasis / foreground / focus`(下方 Regex 共 7 後綴,與 `audit-orphan-tokens.mjs` 一致;無後綴 base 由消費者直接引用不在 regex 內)。即使當前 variant 無消費者也保留。

**Why**:Consistency invariant — 缺 `-text` variant 設計時找不到「on-emphasis 文字色」會 hot-create,違反 SSOT。Polaris「Status colors complete set」canonical。

**Regex**:`^--(primary|error|success|warning|info)-(active|hover|text|subtle|emphasis|foreground|focus)$`

### 8. JS literal mirror(3 token,structural)

**Rule**:`--hover-delay-{plain|rich|close}` motion tokens 鏡像 JS constants(`HOVER_DELAY_PLAIN_MS` / `HOVER_DELAY_RICH_MS` / `HOVER_DELAY_CLOSE_MS`),CSS 端保留供 design SSOT 可見 + 未來 programmatic 讀取(`getComputedStyle`)。

**Why**:M17 SSOT 雙頭設計 — CSS 端是設計師 inspector 入口,JS 端是 runtime 消費入口,兩端必同步存在。

**Regex**:`^--hover-delay-(plain|rich|close)$`

---

## 真 retire 流程(comprehensive scan 後仍 0 consumer)

`audit-orphan-tokens.mjs` 跑完跨 5 消費機制 verify 仍 0 consumer + 不落任何 structural-keep 類別 → 才算真 retire 候選。

走 retire flow:
1. **Grep DS-wide** `*.spec.md` 看是否文件 cite 該 token 名(可能是「設計師未來會用」承諾)
2. **Git blame** declare 提交 — 提交訊息 / PR 描述是否說明用途
3. 兩 step 都無 → safe retire,從 `tokens/**/*.css` 刪宣告 + 加 git commit message cite 本 spec

## 邊界案例

- **Audit 間 token 重獲消費者(0 → N)**:audit 為每次執行的即時 snapshot(無跨次狀態),token 重獲消費後自動退出 retire 候選;無 deprecation period 機制
- **新 structural-keep token**:不在 baseline → `--check` fail,需 `--update` 顯式 justify(防 regex 過寬 silent absorb;baseline 縮減不 fail)— baseline SSOT `scripts/audit-orphan-tokens.baseline.json`
- **Dark-mode token mirror 驗證**:非本 audit scope — script 只驗「消費存在性」,不驗 light / dark 配對完整性

## Audit chain

- **Dim 48**(= `design-system-audit/SKILL.md` 的「Unused / orphan token detector」audit 維度)— chain 本 spec + `audit-orphan-tokens.mjs --check`(not raw `grep var()`)
- **CI**:`npm run audit:tokens`(future add to `package.json` scripts)— `node scripts/audit-orphan-tokens.mjs --check` fail = real orphan 出現
- **Hook**:無 hook(本 audit run-time / monthly cadence,非 PreToolUse 攔截場景)

## 永久解決承諾

本 spec land 後**永遠不會**再回頭問 user 同樣問題(palette tier / 完整色階 / mask alpha / JS literal mirror 是否該 retire)。Audit script 自動識別,只報真實「跨 5 消費路徑都 0」的 token(2026-05-21 baseline = 0 真孤兒)。

新加 hue / state / SOP semantic / JS literal mirror → 同步本 spec regex + `audit-orphan-tokens.mjs` 分類器(per M17 SSOT)。
