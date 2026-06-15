<!-- @benchmark-cited: D5 retrofit backfill 2026-06-10 — body world-class claims marked per-claim inline;對齊 token spec 家族 7/9 既有 marker 慣例(deep-audit A.0 抓漏)。 -->

# Elevation 設計原則

Elevation 定義陰影層級，區分內容層（Card）和浮層（Modal/Popover）的視覺深度。

兩個層級對應兩種「浮起高度」，用 CSS 變數實現，light / dark mode 自動切換。

**不要用 Tailwind 的 `shadow-*`**，改用 CSS 變數：

```tsx
<div style={{ boxShadow: 'var(--elevation-100)' }} />
<div style={{ boxShadow: 'var(--elevation-200)' }} />
```

## 層級

| Token | 用途 | 對應元件 |
|-------|------|----------|
| `--elevation-100` | 頁面內容層，靜止 | Card |
| `--elevation-100-hover` | 頁面內容層，hover / 拖拽 lift | —(目前無 DS 內建 consumer;預留給 consumer 的可拖拽 / hover-lift card,如 board card drag) |
| `--elevation-200` | 浮層，靜止 | Modal、popover、dropdown、overlay drawer |
| `--elevation-200-hover` | 浮層，hover | —(同上,預留) |

elevation-100 < elevation-200，數字越大浮起越高。`*-hover` 兩枚為靜止 token 的「抬升一階」變體:元素被 hover / 拖起時切換,幾何(offset / blur)不變、只加深陰影 alpha(`tokens/color/primitives.css` 定義,light / dark 各一組)。

## 與 Surface 的配對規則

| Elevation | 必須搭配 | 原因 |
|-----------|----------|------|
| `--elevation-100` | `bg-surface` | 頁面內容層，半透明可接受 |
| `--elevation-200` | `bg-surface-raised` | 浮層必須不透明，否則底層內容透出 |

```tsx
// ✅ 正確
<div className="bg-surface rounded-md" style={{ boxShadow: 'var(--elevation-100)' }} />
<div className="bg-surface-raised rounded-lg" style={{ boxShadow: 'var(--elevation-200)' }} />

// ❌ 錯誤——浮層用了半透明 bg-surface
<div className="bg-surface rounded-lg" style={{ boxShadow: 'var(--elevation-200)' }} />
```

## 浮層間距（sideOffset）

所有從觸發元件彈出的浮層（Tooltip、Popover、SelectMenu、Dropdown、HoverCard、Coachmark）與觸發元件的間距統一 **8px**（`sideOffset={8}`）。

不因浮層類型或位置而異——一致的間距讓使用者建立穩定的空間預期。

**SSOT** → `tokens/elevation/overlay-geometry.ts` exports `OVERLAY_SIDE_OFFSET = 8` / `OVERLAY_COLLISION_PADDING = 8`。所有 primitive `default` 必 import 該 const(M17 SSOT 必可傳播);Radix `sideOffset` 接 number 不接 CSS var,因此用 JS const 共用,改值只動一處全部聯動。

**視窗邊緣碰撞(邊界案例)**:浮層貼近 viewport 邊不足以容納時,Radix `avoidCollisions`(預設開)自動翻轉 / 平移,並與邊緣保持 `collisionPadding` = `OVERLAY_COLLISION_PADDING`(8px;Tooltip / Popover / DropdownMenu 皆接此 const)。例外:HoverCard 用 12(Radix / browser rounding 讓 visual padding 少 1-2px 的補償,見 `hover-card.tsx` 註解)。

| 浮層類型 | sideOffset | 說明 |
|---------|-----------|------|
| Tooltip | 8px | TooltipContent 預設值 |
| SelectMenu | 8px | PopoverContent sideOffset |
| DropdownMenu | 8px | DropdownMenuContent sideOffset |
| Popover | 8px | 通用浮層 |

## 浮層共用樣式

所有 elevation-200 浮層共用：

| 屬性 | Token | 值 |
|------|-------|-----|
| 背景 | `bg-surface-raised` | 不透明，避免底層透出 |
| 陰影 | `--elevation-200` | 浮層陰影 |
| 圓角 | `rounded-lg` | 8px |
| 邊框 | `border border-border` | 1px |
| sideOffset | 8px | 與觸發元件的間距 |

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `motion.spec.md`
- `slider.spec.md`
- `token-system.spec.md`
