# Tailwind 使用完整陷阱對照(從 CLAUDE.md 拆出)

`.claude/rules/ui-development.md`「Tailwind 5 條核心」段保留最精要 rules 和一行 bug anchor;完整範例、完整禁止清單、每條 bug 的詳細歷史在本檔。

---

## Tailwind v4 任意值:CSS variable 必須用 `var()` 包覆

**必須寫 `w-[var(--foo)]`,不能寫 `w-[--foo]`**。Tailwind v4 對任意值裡的 CSS variable 處理改了——舊的 `[--foo]` shorthand **不會自動包 `var()`**,會被當成 custom property declaration,整個 class **靜默失效**(不報錯,但完全沒效果)。

**曾經發生的 bug**:Sidebar 從 shadcn 複製的 `w-[--sidebar-width]` 在 8 個位置寬度全失效,sidebar 寬度變成 content fallback 導致主內容被蓋住。

```tsx
// ❌ 錯(v4 失效)
<div className="w-[--sidebar-width] min-w-[--sidebar-width-min]" />

// ✅ 對
<div className="w-[var(--sidebar-width)] min-w-[var(--sidebar-width-min)]" />
```

**自我檢查**:若 CSS var 相關寬高看起來怪怪的,先 `grep '\[--[a-z]'` 在 src 裡找有沒有漏網的 shorthand 語法。

---

## 圓角對應表

| Utility class   | 值                         |
|----------------|---------------------------|
| `rounded-md`   | 4px(--radius-md)    |
| `rounded-lg`   | 8px(--radius-lg)    |
| `rounded-full` | 9999px(--radius-full)|

---

## tailwind-merge 自訂 utility 註冊(技術陷阱)

新增任何 `text-*`、`bg-*`、`border-*`、`ring-*` 自訂 utility 後,**必須到 `lib/utils.ts` 顯式註冊到正確的 group**(font-size / text-color 等)。否則 tailwind-merge 會用 heuristic 猜分組,把不衝突的 class 誤判為衝突並 strip 掉。

**曾發生的 bug**:`text-body`(font-size)和 `text-fg-secondary`(color)被誤判同組,description 失去 font-size。

**診斷法**:`cn()` 後某個 class 消失 → 99% 是 tailwind-merge 誤判 → 去 `lib/utils.ts` 註冊。
**逃生艙**:inline style + CSS variable(`style={{ fontSize: 'var(--font-body-size)' }}`)。

---

## 何時可以 / 不可以用 Tailwind utility

### 核可清單(我們的元件 code 可以直接用)

| 類別 | 允許 utility | 備註 |
|------|-------------|------|
| **Layout / Flex / Grid** | `flex`, `grid`, `items-*`, `justify-*`, `gap-*`, `p-*`, `m-*`, `w-*`, `h-*`, `min-*`, `max-*` 等 Tailwind 預設 | spacing scale `p-4` / `gap-2` 等都 OK |
| **Display / Position** | `block`, `hidden`, `absolute`, `relative`, `z-*` | |
| **我們 DS 自訂 token utility** | `bg-surface-raised`, `text-foreground`, `text-fg-secondary`, `text-fg-muted`, `border-border`, `border-divider`, `text-body`, `text-caption`, `h-field-*`, `rounded-md` 等 | 所有 semantic token 對應的 utility |
| **CSS variable 任意值** | `shadow-[var(--elevation-200)]`, `h-[var(--field-height-md)]` 等 | **必須 `var()` 包覆**,不能 `[--foo]` shorthand |

### 禁止清單

| 類別 | 為什麼禁止 | 改用 |
|------|----------|------|
| `shadow-sm/md/lg/xl/2xl` | 繞過 elevation token 系統,沒跟 dark mode 調整聯動 | 用 `shadow-[var(--elevation-N)]` 其中 N ∈ `{100, 200, 300}`(per elevation.spec.md tier)|
| 硬寫色值 `#xxx`, `rgb(...)`, `bg-red-500` | 繞過 semantic token,dark mode / brand swap 會斷 | 對應 semantic token |
| Tailwind 預設 typography `text-xs/sm/base/lg` | 我們有自己的 `text-caption/body/body-lg/h1/h2` 系統 | 用我們的 typography token |
| 硬寫 px 值 `w-[48px]` 當有 token | 失去 token 關聯,改值時零散處要一起改 | 對應 token 或 calc() |

---

## shadcn compat aliases — 不給我們元件用

`semantic.css` 的「shadcn Compat Aliases」段(`--popover`, `--popover-foreground`, `--muted-foreground`, `--accent`, `--accent-foreground` 等)**只是 `npx shadcn add X` 複製貼上時的安全網**,讓 shadcn 原生 className 不會因找不到 CSS variable 而 fallback。

**我們自己 design-system 的元件 code 禁止直接使用這些 alias**:

| 禁止(shadcn alias) | 必用(我們的 token) |
|--------------------|--------------------|
| `bg-popover` | `bg-surface-raised` |
| `text-popover-foreground` | `text-foreground` |
| `text-muted-foreground` | `text-fg-muted` |
| `bg-accent` | `bg-neutral-hover` |
| `text-accent-foreground` | `text-foreground` |
| `bg-muted` | 這個是我們核可的 token(neutral-2 subtle bg),**不是** shadcn alias,OK 用 |

**原則**:shadcn 原生 utility 只在 shadcn 自動生成的檔案**暫時**存在(作遷移緩衝);任何人類編輯或新增的元件 code 都必須用我們的 direct token。**用 shadcn alias = 設計 bug**,優先改為 direct token。

**為什麼**:shadcn alias 是「臨時橋」讓 shadcn add 不炸;我們有自己 design opinion 後直接用 own token,保持 DS 單一真實來源。允許 shadcn alias 進我們的 code = 慢慢讓 shadcn 命名污染回流,DS 自主性退化。

**曾經發生的 bug**:Popover.tsx / Command.tsx 保留 shadcn template 的 `bg-popover`, `text-popover-foreground`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground` 多處,2026-04-18 session 時 audit 發現統一遷移為 direct token(`bg-surface-raised` / `text-foreground` / `text-fg-muted` / `bg-neutral-hover`)。hook `check_token_hygiene.sh` 現已自動攔截此類回流。
