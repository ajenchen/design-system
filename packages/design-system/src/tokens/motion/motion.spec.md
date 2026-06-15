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

**Scope 邊界**:本 token 系統僅管 hover open / close 延遲;overlay 開啟後的 fetch loading 視覺(skeleton / 留空)屬各 consumer 元件 spec(HoverCard / ProfileCard),不在 motion token scope。

## 三層 tier 系統

| Token | 值 | 用於 | 為何 |
|---|---|---|---|
| `--hover-delay-plain` | `500ms` | Tooltip 純文字提示 | 被動 hint,需 user「真停留」才觸發,避免滑過列表時 N 次視覺擾動。對齊 Material 3 plain tooltip 500ms / Apple HIG ~500ms / shadcn-Radix default 500ms 主流共識 | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| `--hover-delay-rich` | `700ms` | HoverCard / ProfileCard 內容預覽 | 含 avatar / fields / actions 的 rich content(可能含 fetch)。User 必須「真的想看」才停留 700ms,避免列表掃視時誤觸發 N 個 fetch waterfall |
| `--hover-delay-close` | `200ms` | 所有 overlay 關閉 | Mouse leave 後給 200ms 緩衝(user 可能誤滑出再回來)。對齊 UX 共識「close delay ≤ open delay」+ 既有 Avatar `closeDelay={200}` 值 |

## 為何不用單一值 / 為何不沿用過去 200ms

- **過去 200/300ms 偏快**(2026-05-18 ship,2026-05-20 user 抓「太快很容易干擾人」撤回):200ms plain 滑過列表 N 次觸發 Tooltip 視覺擾動;300ms rich 在含 fetch 的 HoverCard 場景列表掃視會打 N 次 server request waterfall。
- **MUI/Ant 100ms 是 fast-tier 例外**:適合 form input help text 等「我就是要快」的 dense 場景,不適合通用 chrome tooltip。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **單一值** 失去 plain / rich 語意區分:ProfileCard 含 fetch + image + actions 應比 Tooltip(純文字)delay 長,單一值會讓 ProfileCard 滑過列表時整列誤觸發 fetch waterfall。
- **過短**(< 100ms):每滑必觸發 → 視覺擾動 + 不必要 server request。
- **過長**(> 1s):user 已不期待 overlay,等出來變干擾。

## 何時用 / 何時不用

| 場景 | 用哪 token | 為何 |
|---|---|---|
| Icon-only Button → 顯示文字提示 | `--hover-delay-plain` | 純文字輔助 |
| Avatar / Username → 顯示完整人物卡 | `--hover-delay-rich` | 含 fetch + multi-section content |
| OverflowIndicator → 顯示隱藏列表 | `--hover-delay-plain` | 純列表展開,無 fetch |
| Tag / Chip → 顯示說明 | `--hover-delay-plain` | 純文字 |
| 任何 overlay 關閉延遲 | `--hover-delay-close` | universal |
| Click-triggered Popover / Dialog | — | N/A,click 不適用 hover delay |
| Tooltip 鍵盤 focus 觸發 | — | N/A,直接顯示(對齊 WAI-ARIA APG) |

## 命名 rationale(per `# 命名與語言一致性` 3 test)

1. **既有 DS 詞彙**:`plain` / `rich` 對齊 FileItem `compact / rich` mode tier idiom(world-class richness gradient)
2. **世界級 idiom**:Material 3 documentation 公開使用「plain tooltip」+「rich tooltip」術語(verified URL above) <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
3. **跨元件無語意衝突**:`plain` 不撞 cva variant(無元件用 `variant="plain"`);`rich` 跟 FileItem mode 同義(content density gradient)

### Anti-pattern 避免命名

- ❌ `--hover-delay-tooltip` / `--hover-delay-hovercard` — 元件名綁定 → 新元件(Popover variant)用哪個?
- ❌ `--delay-200` / `--delay-300` — 用值不用語意 → 改值要 rename
- ❌ `--motion-hover-fast` / `--motion-hover-slow` — fast/slow 在 hover 語境語意模糊(對 user 來說「fast」應該是 instant?)
- ❌ `--hover-time` / `--mouseover-pause` — 自創縮寫,跨人不可讀

## 消費者

- `components/Avatar/avatar.tsx` — HoverCard openDelay / closeDelay 消費 `HOVER_DELAY_RICH_MS` / `HOVER_DELAY_CLOSE_MS`(原硬寫 300/200,migrate 到 token)
- `components/HoverCard/hover-card.tsx` — Root 預設 `openDelay`=`--hover-delay-rich` / `closeDelay`=`--hover-delay-close`(Radix HoverCard 無 Provider;2026-06-11 落地,原宣稱與 code 脫鉤)
- `components/Tooltip/tooltip.tsx` — Radix Provider 預設 delayDuration override 為 `--hover-delay-plain`
- `components/ProfileCard/profile-card.tsx`(consumer of HoverCard)— 繼承 `--hover-delay-rich`
- `components/OverflowIndicator/overflow-indicator.tsx`(consumer)— 用 `--hover-delay-plain`
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

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `hover-card.spec.md`
