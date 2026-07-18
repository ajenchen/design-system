---
component: motion
family: token
variants: {}
sizes: {}
traits: []
benchmark:
  - Material Design 3 motion tokens: m3.material.io/styles/motion/easing-and-duration
  - Carbon Design System duration tokens: carbondesignsystem.com/guidelines/motion/overview
  - Atlassian @atlaskit/tokens motion: atlassian.design/tokens/all-tokens#motion
  - Radix Tooltip delayDuration: radix-ui.com/primitives/docs/components/tooltip
  - MUI Tooltip enterDelay: mui.com/material-ui/api/tooltip
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Motion 設計原則

> **Foundational SSOT rationale**(2026-05-18 ship per user 拍板 #3A):跨 5+ overlay 消費者
> (Tooltip / HoverCard / ProfileCard / Avatar / OverflowIndicator)的 hover 開啟 / 關閉延遲統一。

## 定位

Hover delay token 是「hover 觸發 → 延遲 N ms → overlay 顯示」的延遲時間(對齊 token 名 `delay` 術語)。**目的不是動畫長度,是「user 真的想看」過濾器** — 短暫滑過不該觸發 expensive overlay(ProfileCard fetch 資料 / Tooltip 視覺擾動)。

**Scope**:motion token 統一在 `--motion-*` 前綴下,兩個 sub-family:(A)**delay**(hover 開/關延遲,見下)(B)**進出場動畫**(overlay fade/zoom/slide 的 duration/easing/幾何,見「進出場動畫 token」段)。overlay 開啟後的 fetch loading 視覺(skeleton / 留空)屬各 consumer 元件 spec,不在 motion token scope。

## 三層 tier 系統

| Token | 值 | 用於 | 為何 |
|---|---|---|---|
| `--motion-delay-plain` | `500ms` | Tooltip 純文字提示 | 被動 hint,需 user「真停留」才觸發,避免滑過列表時 N 次視覺擾動。對齊 Material 3 plain tooltip 500ms / Apple HIG ~500ms / shadcn-Radix default 500ms 主流共識 | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| `--motion-delay-rich` | `700ms` | HoverCard / ProfileCard 內容預覽 | 含 avatar / fields / actions 的 rich content(可能含 fetch)。User 必須「真的想看」才停留 700ms,避免列表掃視時誤觸發 N 個 fetch waterfall |
| `--motion-delay-close` | `200ms` | 所有 overlay 關閉 | Mouse leave 後給 200ms 緩衝(user 可能誤滑出再回來)。對齊 UX 共識「close delay ≤ open delay」+ 既有 Avatar `closeDelay={200}` 值 |

## 為何不用單一值 / 為何不沿用過去 200ms

- **過去 200/300ms 偏快**(2026-05-18 ship,2026-05-20 user 抓「太快很容易干擾人」撤回):200ms plain 滑過列表 N 次觸發 Tooltip 視覺擾動;300ms rich 在含 fetch 的 HoverCard 場景列表掃視會打 N 次 server request waterfall。
- **MUI/Ant 100ms 是 fast-tier 例外**:適合 form input help text 等「我就是要快」的 dense 場景,不適合通用 chrome tooltip。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **單一值** 失去 plain / rich 語意區分:ProfileCard 含 fetch + image + actions 應比 Tooltip(純文字)delay 長,單一值會讓 ProfileCard 滑過列表時整列誤觸發 fetch waterfall。
- **過短**(< 100ms):每滑必觸發 → 視覺擾動 + 不必要 server request。
- **過長**(> 1s):user 已不期待 overlay,等出來變干擾。

## 何時用 / 何時不用

| 場景 | 用哪 token | 為何 |
|---|---|---|
| Icon-only Button → 顯示文字提示 | `--motion-delay-plain` | 純文字輔助 |
| Avatar / Username → 顯示完整人物卡 | `--motion-delay-rich` | 含 fetch + multi-section content |
| OverflowIndicator → 顯示隱藏列表 | `--motion-delay-plain` | 純列表展開,無 fetch |
| Tag / Chip → 顯示說明 | `--motion-delay-plain` | 純文字 |
| 任何 overlay 關閉延遲 | `--motion-delay-close` | universal |
| Click-triggered Popover / Dialog | — | N/A,click 不適用 hover delay |
| Tooltip 鍵盤 focus 觸發 | — | N/A,直接顯示(對齊 WAI-ARIA APG) |

## 命名 rationale(per `# 命名與語言一致性` 3 test)

1. **既有 DS 詞彙**:`plain` / `rich` 對齊 FileItem `compact / rich` mode tier idiom(world-class richness gradient)
2. **世界級 idiom**:Material 3 documentation 公開使用「plain tooltip」+「rich tooltip」術語(verified URL above) <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
3. **跨元件無語意衝突**:`plain` 不撞 cva variant(無元件用 `variant="plain"`;Select / Combobox 另有 `display="plain"` prop value,屬不同 slot 且同「簡單呈現」語意方向,無認知衝突);`rich` 跟 FileItem mode 同義(content density gradient)

### Anti-pattern 避免命名

- ❌ `--motion-delay-tooltip` / `--motion-delay-hovercard` — 元件名綁定 → 新元件(Popover variant)用哪個?
- ❌ `--delay-200` / `--delay-300` — 用值不用語意 → 改值要 rename
- ❌ `--motion-hover-fast` / `--motion-hover-slow` — fast/slow 在 hover 語境語意模糊(對 user 來說「fast」應該是 instant?)
- ❌ `--hover-time` / `--mouseover-pause` — 自創縮寫,跨人不可讀

## 消費者

- `components/Avatar/avatar.tsx` — HoverCard openDelay / closeDelay 消費 `MOTION_DELAY_RICH_MS` / `MOTION_DELAY_CLOSE_MS`(原硬寫 300/200,migrate 到 token)
- `components/HoverCard/hover-card.tsx` — Root 預設 `openDelay`=`--motion-delay-rich` / `closeDelay`=`--motion-delay-close`(Radix HoverCard 無 Provider;2026-06-11 落地,原宣稱與 code 脫鉤)
- `components/Tooltip/tooltip.tsx` — Radix Provider 預設 delayDuration override 為 `--motion-delay-plain`
- `components/ProfileCard/profile-card.tsx`(consumer of HoverCard)— 繼承 `--motion-delay-rich`
- `components/OverflowIndicator/overflow-indicator.tsx`(consumer)— 用 `--motion-delay-plain`
- 任何 future overlay hover consumer 必 import 此 token(per M17 SSOT 必可傳播)

## 世界級對照

| Framework | plain hint delay | rich preview delay |
|---|---|---|
| Material 3(plain vs rich tooltip 分流)| ~500ms | ~500ms+ |
| Apple HIG / macOS native | ~500ms | — |
| Radix Tooltip | 700ms(設保守避 mobile / touch 誤觸)| N/A(consumer 自定) |
| shadcn(defer Radix) | 500ms(provider override)| N/A |
| Polaris | 400ms | — |
| Atlassian Tooltip | 300ms | — |
| MUI / Ant Tooltip | 100ms(dense form input fast-tier) | — |
| **DS canonical(本 spec)** | **500ms** | **700ms** |

500ms 對齊 Material 3 / Apple HIG / shadcn 主流共識(三家集中在 500ms),避 MUI/Ant 100ms(form input fast-tier 不適通用 chrome)+ Radix 700(過保守)兩極端。Rich 700ms 比 plain 多 200ms 反映 fetch / multi-section content「真的想看」門檻。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## 相關

- `../elevation/elevation.spec.md` — overlay 視覺層(z-index)
- `../../patterns/overlay-surface/overlay-surface.spec.md` — overlay 結構 SSOT
- `../../components/Tooltip/tooltip.spec.md`(consumer)
- `../../components/HoverCard/hover-card.spec.md`(consumer)
- `../../components/Avatar/avatar.spec.md`(consumer)
## 進出場動畫 token(2026-07-11 加,user 拍板)

Overlay(Tooltip/Popover/HoverCard/DropdownMenu/Dialog/Sheet/FileViewer)的 fade/zoom/slide 進出場動畫,值統一 token 化(原各元件硬寫 zoom-95/slide-2/duration-300 = M17 假 SSOT)。由 tw-animate-css(Tailwind v4,= shadcn 官方機制)的 `--tw-duration`/`--tw-ease` 變數綁定;共用 SSOT = `overlay-motion.ts`(overlayMotion/surfaceMotion)。

| Token | 值 | 用於 | 世界級對照 |
|---|---|---|---|
| `--motion-duration-overlay` | `150ms` | 輕量浮層(Tooltip/Popover/HoverCard/DropdownMenu) | Material short3 / Carbon moderate-01 / Polaris 150 / tw-animate-css 預設 **四家一致** |
| `--motion-duration-surface` | `250ms` | 模態面板(Dialog/Sheet/FileViewer,面積大位移遠→慢一階) | Material medium1 / Polaris 250 / Carbon moderate-02(240) |
| `--motion-easing-enter` | `cubic-bezier(0,0,0,1)` | 進場(減速,快起平滑落定) | Material standard-decelerate(企業級中性沉穩) |
| `--motion-easing-exit` | `cubic-bezier(0.3,0,1,1)` | 出場(加速) | Material standard-accelerate |
| `--motion-enter-distance` | `0.5rem`(8px) | slide 位移 | shadcn/Radix canonical(= 現行 slide-*-2) |
| `--motion-enter-scale` | `0.95` | zoom scale | shadcn default(= 現行 zoom-95) |

**幾何原型分層(正當差異,不強行抹平)**:輕量 popup = fade+zoom+slide-side(8px);模態置中 = fade+zoom+slide-center(Dialog/FileViewer);邊緣抽屜 = slide-edge 100%、正當無 zoom(Sheet)。統一的是**時長/曲線/reduced-motion 守衛**(motion-reduce:animate-none 全 7 浮層),非幾何原型(對齊 Material standard-vs-emphasized / Carbon productive-vs-expressive tier 分層)。

**a11y**:prefers-reduced-motion 下 `motion-reduce:animate-none` 全 7 浮層統一關進出場動畫(overlay-motion SSOT 保證,無漏)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `hover-card.spec.md`
