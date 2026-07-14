# @qijenchen/eslint-plugin-design-system

DS write-time hooks **同源**的 ESLint flat-config plugin(eslint >= 9,純 JS,無 build step,無 dependencies)。

## 為什麼存在(三處防線)

DS 的 token-first 紀律原本只有一道防線:`.claude/hooks/`(AI write-time,只擋當下 diff)。本 plugin 把同一套規則平移成 ESLint 規則,補齊三處防線:

| 防線 | 載體 | 時機 | 範圍 |
|------|------|------|------|
| AI write-time | `.claude/hooks/*.sh` | AI Edit/Write 當下 | 該次 diff |
| Editor | 本 plugin(IDE eslint)| 打字當下紅線 | 開著的檔案 |
| CI | 本 plugin(`eslint .`)| PR / push | **全量掃** |

實證動機(fork 端違規實例):work-management repo 寫了 `gap-[var(--layout-space-distant)]`(幻覺 token)——CSS 變數未定義 → silent resolve 成空值 → spacing 變 0 → 區塊全黏死,build / runtime 都不報錯。write-time hook 只在 AI 編輯當下 fire,無法回頭掃既有 code;ESLint 版可以。

## 安裝

```bash
npm install -D @qijenchen/eslint-plugin-design-system eslint
```

## 用法(flat config,eslint 9)

```js
// eslint.config.js
import ds from '@qijenchen/eslint-plugin-design-system';

export default [
  ds.configs.recommended, // 3 條規則全 error
];
```

或逐條控制:

```js
import ds from '@qijenchen/eslint-plugin-design-system';

export default [
  {
    plugins: { 'design-system': ds },
    rules: {
      'design-system/no-arbitrary-tailwind-values': 'error',
      'design-system/no-shadcn-compat-alias': 'error',
      'design-system/no-undefined-layout-token': 'error',
      'design-system/no-dynamic-tailwind-class': 'error',
    },
  },
];
```

## 規則

| 規則 | 抓什麼 | 正解 | 同源 hook | escape |
|------|--------|------|-----------|--------|
| `no-arbitrary-tailwind-values` | className 中 Tailwind arbitrary magic 數值:`text-[13px]` / `w-[240px]` / `gap-[8px]` / `p*-[Npx]`,含 logical props `ps-/pe-/ms-/me-`(hook regex 曾漏接的洞)。允許 `var(--…)` 消費、`w-[min(92vw,var(--x))]` 響應式、純 `vw/vh/%` | spacing → `p-[var(--layout-space-loose)]` / `gap-[var(--layout-space-tight)]`(`tokens/layoutSpace/layoutSpace.spec.md` 6 條規則 + 親疏 3 級);typography → `text-h1..h6` / `text-body` / `text-caption` | `check_layout_space_magic_numbers.sh` | 行內(或上一行)`@layout-space-magic-ok: <rationale>` |
| `no-shadcn-compat-alias` | shadcn compat alias:`bg-popover` / `text-popover-foreground` / `text-muted-foreground` / `bg-accent` / `text-accent-foreground` / `bg-destructive` / `bg-background` / `text-background` / `border-input`(不聯動 DS dark mode)| DS semantic utility:`bg-surface-raised` / `text-foreground` / `text-fg-muted` / `bg-neutral-hover` / `bg-error` / `bg-canvas` / `text-on-emphasis` / `border-border`。清單 SSOT:`tokens/utility-registry.json` `shadcn_alias.block` | `check_opacity_token_usage.sh` 第 8 類 | 行內(或上一行)`@token-registry-ok: <rationale>` |
| `no-undefined-layout-token` | `var(--layout-space-X)` 的 X 不在 SSOT:僅 `loose` / `tight` / `bottom` 存在(`tokens/layoutSpace/layoutSpace.css`)。幻覺 token(如 `--layout-space-distant`)silent 失效 → spacing 0 | 3 個真 token 擇一(選哪個 → `layoutSpace.spec.md`);真需要新間距級 → 先進 layoutSpace.css SSOT + spec,再 allow 進本 rule | (無單一 hook;WM PDF 案新洞)| 無(幻覺 token 無合法場景)|
| `no-dynamic-tailwind-class` | class 名本身含 `${…}` 插值的動態 Tailwind class:`h-table-row-${size}` / `w-${col}` / `gap-${g}` / `py-${p}`(尺寸/間距 utility)。Tailwind 靜態掃描看不到 → **靜默不生成規則** → 塌版(2026-07-09 DataTable row-height regression 實證)。arbitrary value `h-[calc(${x})]` / `var(--x-${i})` 排除 | 完整 literal class 對照表:`{ sm: 'h-table-row-sm', md: 'h-table-row-md', lg: 'h-table-row-lg' }[size]` | `check_dynamic_tailwind_class.sh` | 行內(或上一行)`@dynamic-tailwind-allow: <rationale>` |

前三條規則**全量掃所有字串**(JSX `className`、`cva()` / `cn()` / `clsx()`、先存變數再用、template literal、style 物件字串),不只掃 JSX attribute;`no-dynamic-tailwind-class` 專掃 template literal 的「靜態↔插值邊界」——regex 都要求 Tailwind class 專屬簽名,誤判風險極低。

## 與 DS write-time hooks 的同源關係 + 規則新增流程

本 plugin 的每條規則都對應一個(或補洞一個)`.claude/hooks/` write-time hook,**規則語意必須同源**(同一 SSOT、同一 escape marker),否則 editor/CI 與 AI write-time 會給出矛盾訊號。

新增規則流程:

1. **先有 SSOT**:規則背後的 canonical 必須已存在於 DS(token css / `*.spec.md` / `utility-registry.json`)。ESLint 規則只是 SSOT 的 enforcement 載體,不是規則本身的家(對齊 CLAUDE.md M17「SSOT 必可傳播」)。
2. **對照同源 hook**:若已有 write-time hook,平移其 regex 家族觀念並補 hook 因「只掃 diff」而漏的洞(如本批 logical props);若沒有 hook,評估是否也該補 hook(雙向同步)。
3. **escape marker 對齊 hook**:同一 marker(`@layout-space-magic-ok:` / `@token-registry-ok:`),讓一個豁免註解同時滿足三處防線。
4. **tests/ 每條 ≥ 4 case**(含 escape / allow 路徑),`node --test tests/` 全綠才收。
5. **README 規則表 + `configs.recommended` 同步**(改一處必看三處)。
6. SSOT 清單變動(如 `utility-registry.json` 加 alias)→ 同步更新 rule 內平移清單 + 對應 hook。

## 開發

```bash
cd packages/eslint-plugin
npm install   # 只裝 devDependency eslint(測試用)
npm test      # node --test "tests/*.test.js"(Node 21+ 的 --test 吃 glob,不吃 bare directory)
```
