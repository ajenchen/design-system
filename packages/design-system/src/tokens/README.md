# tokens/ Charter

> **跨 family canonical SSOT** → `token-system.spec.md`(5-layer 架構 / 命名 family-scoped 規則 / token vs hardcode 判斷 / co-location rationale)。每個 family spec.md 只 codify 自家具體規則,本 README 列 family 居住地圖,SSOT 集中在 `token-system.spec.md` 避免 drift。

## 這裡只收:design token 定義 + spec + stories

每個 token 類別一個 folder:
- `{name}.css` — CSS custom properties 定義
- `{name}.spec.md` — 命名原則 / 用法規則 / 家族結構
- `{name}.stories.tsx` — token 展示(色票 / 字級 / 尺寸對照)
- primitives vs semantic 分檔(如 `color/primitives.css` + `color/semantic.css`)

**folder 名規則**:
- 單字 → lowercase(`color/` / `radius/` / `typography/`)
- 多字 → camelCase 反映 CSS `--uiSize` 命名風格(`uiSize/` / `layoutSpace/`)

## 當前居民

`color/` / `typography/` / `uiSize/` / `layoutSpace/` / `density/` / `elevation/` / `radius/` / `opacity/` / `motion/`

例外居民:`categorical-color.ts` 住 tokens/ 根層(非 folder)— `CATEGORICAL_HUES` 的 TypeScript SSOT,由 `color/color.spec.md` 指認(Tag / Avatar 等 categorical 色相消費)。

## Consumer scope:public vs internal token(2026-05-17 codified)

| Token folder | Scope | Consumer 範例 |
|---|---|---|
| `color/` / `typography/` / `radius/` / `elevation/` / `opacity/` / `layoutSpace/` / `density/` | **Public** — consumer-layer(`src/app` / `src/explorations`)直接消費 | UI 開發者寫 `text-body` / `bg-primary` / `--layout-space-loose` 等 |
| `uiSize/`(`--field-height-*` / `--tab-height-*` / `--table-row-*` / `--tree-indent-*`)| **Internal primitive** — DS 內部 component 消費,consumer 不直接用 | Button / Input / Tabs / DataTable / TreeView 等 primitive 內部消費;consumer 用 `<Button size="sm">` 不用 `h-[var(--field-height-sm)]` |
| `motion/`(`--hover-delay-*`)| **Internal primitive** — DS overlay 元件內部消費,consumer 不直接用 | Tooltip / HoverCard / Avatar / OverflowIndicator 的 hover open / close delay;consumer 用元件預設,不直接讀 token |

**Internal token 規則**(`uiSize/` / `motion/` 適用):
- **不必補 Storybook stories**(consumer 不直接看;審查 grep 結果:`src/app` + `src/explorations` 0 個檔案直接消費 uiSize token,2026-05-17 verified)
- 但仍有 `.spec.md` codify family / 命名 / 派生公式
- 出現在 consumer-layer code = anti-pattern(該用 component prop 不該 raw token)

**Public token 規則**:
- 必補 Storybook stories(色票 / 字級 / 間距對照展示)
- consumer 可直接消費 utility(`text-body` / `gap-[var(--layout-space-loose)]` 等)
- 2026-05-17 ship:opacity / layoutSpace 補齊 stories(原本只 spec.md + css 沒展示頁)

## 這裡**不收**(反例)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 元件消費 token 的 code | `../components/{Name}/` | token 被 consume,不在 token home 寫 consumer |
| cross-cutting design rule(如「何時用 semantic token vs primitive」)| `.claude/rules/ui-development.md`「Token 命名 4 條硬規則」 | 系統級 rule,不只關某個 token |
| shadcn compat alias 遷移規則 | `.claude/rules/ui-development.md`「Tailwind 5 條核心」 | 技術陷阱屬 UI 開發 |

## 新增 token 的 criteria

1. 找不到現有 family 可鏡射 → **先質疑是否真需要**(見 CLAUDE.md 「對齊既有 family」)
2. 命名過三重 test(既有語言 / 世界級 idiom / 跨元件不衝突)
3. Primitive / semantic 分層清楚
4. 若是語意色相 → 走 `color/color.spec.md`「新增語意色相的標準流程」4 步

## 建立前必 Read

`.claude/rules/ui-development.md`「Token 命名 4 條硬規則」+ 對應 family 的 spec(如 `color/color.spec.md`)。
