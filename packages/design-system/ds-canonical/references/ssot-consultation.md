# SSOT 消費 canonical — 完整對照 + 反例

CLAUDE.md `# SSOT 消費 canonical` 的詳表 + 反例。主章留核心 + pointer,本檔放大對照表 + 禁止清單 + tsx 註解模板。

## 視覺決策 → 必查清單(完整)

| 決策 | 必查的 SSOT 家 |
|------|---------------|
| **元件選擇**(這該用哪個既有元件?)| `ls packages/design-system/src/components/` + `ls packages/design-system/src/patterns/` + 近親元件 spec |
| **Token / 值**(padding / gap / height / color)| 對應 `tokens/{name}/spec.md` + `tokens/README.md` |
| **Padding / spacing**(chrome vs 元件內 vs 精確幾何)| `.claude/references/ui-dev-rules.md`「Padding source 分層規則」+ `tokens/layoutSpace/layoutSpace.spec.md` |
| **Row / item 結構**(prefix / content / suffix slot)| `patterns/element-anatomy/item-anatomy.spec.md`(Family 1+2 SSOT) |
| **連續 item list wrapper gap** | `patterns/element-anatomy/item-anatomy.spec.md`「連續 item 貼邊合法性」— 公式:permanent standalone card/pill → 必 gap;permanent flush / transparent → 0 gap。元件專屬 gap 值 + mixed 混合情境決策表查該元件 spec「List wrapper canonical」節 |
| **視覺容器 breathing**(自建或 override 帶 bg/border/shadow 的 div)| `patterns/element-anatomy/element-anatomy.spec.md`「視覺容器 breathing invariant」— 有視覺邊界容器必有 inner padding。責任在父容器,子元件 w-full responsive 不變 |
| **Label ↔ Description gap**(2px)| Token `--item-gap-label-desc` + Primitive `<ItemContent>` — 改 token 一處 → 全 DS 同步。Consumer 2 擇 1:(a) token:`mt-[var(--item-gap-label-desc)]`(b) primitive:`<ItemContent label description descriptionTone>`。偏離必 spec 明文 rationale |
| **Dismiss / inline action / overflow menu**| `patterns/element-anatomy/item-anatomy.spec.md`「Dismiss 按鈕 canonical」+「Inline Action 設計規格」+「常用 icon canonical」 |
| **按鈕排列 / 群組 / 分隔**| `patterns/action-bar/action-bar.spec.md` |
| **Header 高度 / chrome padding**| `tokens/uiSize/uiSize.spec.md`(`--chrome-header-height`)+ `tokens/layoutSpace/layoutSpace.spec.md` |
| **Chrome header 選型**(fixed-h vs padding-based)| `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」— decision tree + 8 家世界級對照 + checklist |
| **Header 跨家族視覺契約**(border / padding / withTabs / dismiss size 連動)| `patterns/header-canonical/header-canonical.spec.md` — SSOT for chrome + overlay header 兩家族;含 withTabs 6 lockstep rules(W1 border auto-suppress / W2 padding align / W3 tabs size 對應 / W4 flush stack / W5 md future tier / W6 default sm)|
| **Overlay chrome dismiss / unbounded button**| `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical v5」 |
| **Overlay title size**(modal 16 vs non-modal 14)| `patterns/overlay-surface/overlay-surface.spec.md`「Overlay title typography canonical」 |
| **Form field gap**| `components/Field/field.spec.md` +「layoutSpace 規則 3:跟 block 相鄰 = tight,inline ↔ inline = loose」 |
| **Icon 選擇 / 尺寸**| `.claude/rules/ui-development.md`「元件 Props 命名」「Icon canonical」+ `ui-dev-rules.md`「Icon size 來源分層規則」 |
| **浮層 header / body / footer**| `patterns/overlay-surface/overlay-surface.spec.md` |
| **Scrollbar / 滾動**| `components/ScrollArea/scroll-area.spec.md` +「horizontal-overflow pattern」 |
| **Variant / prop 命名**| 既有元件 `variant=` 值 grep + `# 命名與語言一致性`「命名必過三重 test」 |
| **State 視覺**(selected / disabled / hover)| `patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」 |

## 強制 Checklist — 新 tsx 檔 top-of-file 註解

新元件 / 新 feature 的 tsx 開頭**必須**有註解段落:

```tsx
/**
 * {Component} — {定位一句話}
 *
 * ── 定位 ──
 * {...}
 *
 * ── 實作基礎 ──
 * 消費:{List components / primitives used}
 * 對應 pattern:{patterns/xxx}
 *
 * ── 消費的 SSOT ──
 * - components: [Button, Input, ItemInlineAction, ...]
 * - patterns: [item-anatomy, action-bar, overlay-surface]
 * - tokens: [--layout-space-loose, --chrome-header-height, --field-height-md]
 * - spec refs: {近親 spec 清單}
 */
```

Hook `check_ssot_consultation.sh`(retired;改靠 mindset #2 + `check_canonical_propagation.sh`)(原 Write 新 tsx 到 `packages/design-system/src/components/` 或 `src/explorations/` → 若檔內無上述註解區 → warn 要求補齊)。

## 禁止:隱性自創

下列行為等同自創(就算沒宣告新命名):
- 自寫 `h-14` / `h-12` 等 chrome 高度(應用 `--chrome-header-height` token)
- 自寫 `gap-3` 當 toolbar 按鈕群 gap(應查 `patterns/action-bar` canonical)
- 自寫 `<button aria-label="Close"><X /></button>` 作 dismiss(應用 `ItemInlineAction`)
- 自寫 Row `<div><Icon /><span>label</span><Button /></div>`(應用 `<MenuItem>` + slot)
- 自訂 Input `variant="custom-name"` 未先 grep 既有 variant 值
- 在 Toolbar 用 `<input className="bg-transparent border-0 ...">`(應用 `<Input variant="bare">` 若既有;無 → Ambiguity Protocol)
