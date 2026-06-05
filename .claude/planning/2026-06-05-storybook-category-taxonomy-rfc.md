# RFC(DRAFT,待 user 討論,未執行)— Storybook 分類 taxonomy + category-aware 稽核 SSOT

**狀態**:DRAFT / for-discussion。**未動任何檔**。2026-06-05 user directive:「釐清 pattern 目標 + 善用既有 internal + 所有 storybook 稽核按 category 適性調整 + 共用稽核有 SSOT + 未雨綢繆新分類 + 符合世界級」。

---

## 1. 問題陳述(現況痛點)

1. **`patterns/` 是雜物櫃**:現 charter 把 pattern 定義為「runtime primitive 多元件 consume」,於是混進了 component(resize-handle)/ internal primitive(overlay-surface/header-canonical/element-anatomy)/ hook(horizontal-overflow)/ 真 guidance(action-bar)。6 個裡只有 action-bar 符合世界級「pattern = 組合指南」。
2. **category 邏輯散落、無 SSOT**:title format(audit-story-quality.mjs L40)、render-demo 要求(dim-11)、classification(dim-44)、trait check(check_story_invariants R3)、title regex 各自 hardcode category 判斷 → drift 風險 +「該不該套此稽核」每個 dim 自己決定。
3. **dim-11 假設 pattern 可 render**:要求「每個 patterns/<name>/ 必有 visual demo」→ 跟世界級「pattern = 指南非 render 件」相反。
4. **無未雨綢繆**:未來新增分類(如 template / recipes / foundations)沒有「加一處就讓所有稽核自動適配」的機制。

## 2. 世界級研究(2026-06-05 親驗,M26 ≥3 source)

| DS | Pattern 定義(verbatim) | source |
|---|---|---|
| Polaris | 「Patterns are reusable guidance for combining components」「Preferred solutions to common merchant goals」(Card layout / Common actions) | polaris-react.shopify.com/patterns |
| Atlassian | 「Patterns solve common user problems. They combine components and foundations」 | atlassian.design/patterns |
| Carbon | 「Component libraries specify individual UI elements; pattern libraries feature collections of UI-element groupings… proven combinations of components」 | carbondesignsystem.com |

**共識**:Component = 可 render 的單一建構塊;**Pattern = 組合多 component 解決情境的「指南 / blueprint」,不是新 render 件**;Primitives(Atlassian Box/Stack、MUI Base)= 低階 / 內部積木;Tokens/Foundations = 原子值。**user 直覺正確。**

## 3. 提案:5 分類 + 各自目標(善用既有 internal)

| 分類 | 目標(放什麼) | 既有? | 世界級對應 |
|---|---|---|---|
| **Tokens** | 原子設計值(色/字/間距/圓角…) | ✅ tokens/ | Foundations |
| **Components** | **可直接 render 的 public UI 建構塊**(Button/Dialog/**ResizeHandle**) | ✅ components/ | Components |
| **Internal** | **只被 DS 內部其他元件 wrap/compose 的 primitive**(ChromeHeader / SurfaceHeader / element-anatomy slot 件)| ✅ components/Internal/ + frontmatter isInternal | Primitives / unstyled |
| **Patterns** | **跨元件「組合指南」**(如何組多個 component 解決情境;spec/blueprint 為主,可附 composed example,**非單一 primitive render demo**)| ⚠️ 需純化(目前混料) | Patterns(guidance)|
| **Template** | fork 用的 consumer scaffold(apps/template)| ✅ apps/template(`Apps/` title)| Starter kit |
| (hooks) | 跨元件共用 React hook | ✅ hooks/ | utils |

## 4. 關鍵架構:兩條正交軸(別再混)

- **Axis 1 — Category**(token/component/pattern/internal/template):決定 **visibility + title format + 適用哪些稽核 + 要不要 render demo + 進不進 root barrel**。← **目前散落、要建 SSOT**。
- **Axis 2 — Traits**(per-component hasVariants/hasSizes/isOverlay…):決定**展示 story 的 shape**。← 已有 SSOT(`category-templates.md` v2 trait-based),**保留不動**。

`category-templates.md` v2 已明示「story shape 是 trait-based 非 category-based」(v1 7-category 已退役,理由含「Internal 是 visibility governance 不是 story shape」)。本 RFC **不碰 Axis 2**,只補 Axis 1 的 SSOT。

## 5. 核心交付:Category-Controls Matrix SSOT(新增)

單一宣告檔(建議 `packages/design-system/src/stories-governance.json` 或 `.claude/references/story-category-matrix.json`),所有 story 稽核 / hook **讀它**而非各自 hardcode:

```jsonc
{
  "categories": {
    "Token":     { "titleFormat": "Design System/Tokens/<Name>",            "parts": 3, "visibility": "public",   "stories": ["reference"],         "renderDemo": "swatch-scale", "threeLayer": false, "traitShape": false, "classification": "n/a",        "rootBarrel": "n/a-css" },
    "Component": { "titleFormat": "Design System/Components/<Name>/<頁>",    "parts": 4, "visibility": "public",   "stories": ["展示","設計規格","設計原則"], "renderDemo": "required",     "threeLayer": true,  "traitShape": true,  "classification": "mechanical=public",   "rootBarrel": "include" },
    "Internal":  { "titleFormat": "Design System/Internal/<Name>/<頁>",      "parts": 4, "visibility": "filtered", "stories": ["reference"],         "renderDemo": "reference-only","threeLayer": false, "traitShape": "optional", "classification": "mechanical=internal", "rootBarrel": "exclude" },
    "Pattern":   { "titleFormat": "Design System/Patterns/<Name>",          "parts": 3, "visibility": "public",   "stories": ["guidance"],          "renderDemo": "composed-example-or-doc", "threeLayer": false, "traitShape": false, "classification": "guidance-no-component", "rootBarrel": "n/a" },
    "Template":  { "titleFormat": "Apps/<name>/<情境>",                     "parts": "n/a","visibility": "consumer", "stories": ["app-scenario"],     "renderDemo": "consumer-app",  "threeLayer": false, "traitShape": false, "classification": "scaffold",  "rootBarrel": "n/a" }
  },
  "_futureproof": "新增分類 = 加一個 key + 欄位;所有讀此 matrix 的稽核/hook 自動適配,不需逐個改 dim。"
}
```

**效果**:dim-11 / dim-40 / dim-44 / check_story_invariants R3-R4 / audit-story-quality.mjs 全部改成「讀 matrix → 按該 unit 的 category 取對應 rule」。**未雨綢繆 = 新分類加一 row;SSOT = 一處改、全稽核跟。**

## 6. 受影響稽核的「增刪改」清單(category-aware 化)

| 稽核 | 現況 | 改成 |
|---|---|---|
| **dim-11** Story 三層 + pattern demo | 強迫每 pattern 有 render demo | 讀 matrix:Component→3-layer required;Internal→reference;**Pattern→guidance doc/composed-example(不強迫單件 render demo)**;Token→swatch |
| dim-40 Title format | regex hardcode 3/4-part | 讀 matrix.titleFormat(+ 納入 Template `Apps/` 形式) |
| dim-44 Public vs Internal | 機械 test ✓(保留) | 改為 matrix.classification 驅動 + 補「pattern=guidance 無 component」「primitive→Internal」分支 |
| dim-29 trait-based | 全元件套 | 只對 matrix.traitShape=true(Component)套;Internal/Pattern/Token 豁免 |
| check_story_invariants R3/R4 | hardcode | 讀 matrix |
| audit-story-quality.mjs | TITLE_CANONICAL hardcode | 讀 matrix |

## 7. 遷移 map(現 patterns/ → 正確家;**待 user 拍板**)

| 現居 | 真身 | 搬去 | 連帶 |
|---|---|---|---|
| resize-handle | 可 render component | **components/ResizeHandle/** | title→Components 4-part、root barrel 留 |
| overlay-surface | Dialog 內部 primitive | **components/Internal/** | frontmatter isInternal、title→Internal、出 root barrel |
| header-canonical | Sidebar 內部 primitive | **components/Internal/** | 同上 |
| element-anatomy | MenuItem + slot 件(內部 primitive)| **components/Internal/**(or 保留 patterns 當 anatomy SSOT?**討論點**)| 出 root barrel(item-anatomy 部分件可能 public,需逐件判)|
| horizontal-overflow | useOverflowItems **hook** | **hooks/** | title 移除(hook 無 story or 走 Internal)|
| action-bar | 組合指南(無 component)| **保留 patterns/**(✅ 唯一真 pattern)| charter 修正:patterns = guidance,移除「必有 .tsx」「必 render demo」 |

## 8. 待討論 open questions(user 拍板後才動)

1. element-anatomy:item-anatomy 的 `<MenuItem>`/slot 件——是 public component(consumer 直接組 row)還是 internal primitive?(影響搬去 components/ 或 Internal/)
2. Matrix 落地位置:`packages/design-system/src/` 內(runtime 可讀)還是 `.claude/references/`(governance-only)?
3. 是否同時把 `Apps/` template stories 納入此 matrix 的 Template 分類治理(目前 fork-side 另一套)?
4. 遷移影響 barrel + storybook title + import path + charter + 6+ 稽核 dim + 數個 hook → 分階段?哪些先?
5. **story 重整**(user 下一步):category 釐清後,各 story 的 3-layer / guidance / reference 形式怎麼 align(下一輪討論)。

## 9. 不做什麼(scope guard)

- 不碰 Axis 2 trait-based story shape SSOT(已世界級)。
- 本 RFC 階段**不搬任何檔**;等 user 拍板方向 + 階段化計畫。

---

## 10. 完整性稽核結果(2026-06-05,user challenge「你確定全部都有適性?足夠世界級?」)

**誠實結論:第一版 matrix(7 欄 / 6 dim)不夠世界級。** 窮舉 4 路稽核(SKILL 全 dim + 全 story hook + scripts + 世界級對照)結果:**88 controls — 42 category-adaptive / 16 trait-axis / 30 universal**。

### 三軸歸屬(每條控制只屬一軸)

- **42 category-adaptive**(必讀 matrix):dim 11/13/30/40/44/51/69/70/82 + check_story_invariants R6/R7/R8/R9 + check_canonical_propagation E.1 + check_naming_and_abstraction D.2 + check_consumer_*(app_story_title / story_baseline / no_ds_catalog / ds_primitive_misuse)+ check_chrome_header_avatar_canonical + _overlay_handcraft + audit-story-quality L40 title + compile-stories 三層 See-also 模板 + 世界級 16 維(見下)。
- **16 trait-axis**(留 `category-templates.md` v2,**不進 matrix**):dim 23/29/45/46/52/54/74 + R2 slot_split + R3 category + compile-stories variant/size key + overlay probe…。
- **30 universal**(對所有 story 一視同仁,但**需 degradation guard**):dim 12/24/25/28/41/42/43/49/68/73 + R1/R4/R5 + full-story sweep + escape-marker + audit-story-quality name_jargon/placeholder/mixed_english…。

### Matrix v2 完整欄位(原 7 + 世界級補 16 = 23 欄)

| 欄位 | Token | Component | Internal | Pattern(guidance) | Template |
|---|---|---|---|---|---|
| titleFormat / parts | `Tokens/<N>` 3 | `Components/<N>/<頁>` 4 | `Internal/<N>/<頁>` 4 | `Patterns/<N>` 3 | `Apps/<app>/<情境>` |
| visibility + **sidebarFilterTag** | public | public | **filtered(tag:internal,defaultFilter exclude)** | public | consumer |
| **statusMaturity** lifecycle | n/a | experimental→stable→deprecated tag | 同 | stable/guidance | n/a |
| renderDemo | swatch | required(展示) | reference-only | composed-example/blueprint | app-scenario |
| **threeLayer / autodocsPolicy** | reference + autodocs | 3-layer + autodocs | reference(no full 3-layer)| guidance doc | app stories |
| traitShape(gate) | false | **true**(走 Axis2)| optional | false | false |
| **anatomyDiagram** | n/a | required(numbered callouts)| thin/optional | n/a(用 composed diagram)| n/a |
| **propsApiReference** | n/a | required(ArgTypes)| required | n/a | n/a |
| **stateComboMatrix**(M5)| n/a | required(疊加態)| optional | n/a | n/a |
| **a11yTabTest** | n/a(swatch 非 text 豁免 contrast)| required(axe + a11y tab)| required | per-example | consumer |
| **visualRegressionPolicy** | swatch baseline | full VR baseline | VR baseline | composed snapshot | opt |
| **usageDoDont** | token 用法 | WhenToUse/WhenNotToUse | thin | **核心(pattern 就是 do/dont 指南)** | n/a |
| **codeSnippetPolicy** | token import | single-component snippet | import 註明 internal | **composed multi-component snippet** | scaffold |
| **tokenSwatchSubtype** | **color/spacing/type/radius 各自 viz** | n/a | n/a | n/a | n/a |
| **patternComposedExampleShape** | n/a | n/a | n/a | **required(多元件 blueprint)** | n/a |
| **responsiveRtlDensity** | density-aware swatch | 條件(density-lock 元件豁免)| 條件 | composed responsive | consumer |
| **contentUxWriting** | n/a | 有 user-facing 字串才要 | thin | 情境文案指南 | n/a |
| **openSnapshotCoverable**(M15)| n/a | required(overlay 必 OpenSnapshot)| required | composed open-snapshot | n/a |
| **sidebarOrder**(storySort)| 1 Tokens | 2 Components | 5 Internal(底)| 3 Patterns | n/a(Apps 區)|
| classification | n/a | mechanical=public | mechanical=internal | guidance-no-component | scaffold |
| rootBarrel | n/a-css | include | **exclude** | n/a | n/a |

### Universal 控制的 degradation guard(第三類關鍵,世界級才不誤判)

30 條 universal(禁 jargon / 禁佔位符 / 人話範例 / 去重 / a11y…)雖一視同仁,但**必加 story-subtype tolerance**:token swatch 的短技術 label(token 名)、pattern composed-example 的 primitive 角色名、swatch 非 text 的 contrast「失敗」——都**不可**被當違規。matrix 補一個 `universalGuard` 註記:該 category 的 story 是否屬「atypical(token/guidance)」→ universal 檢查套寬鬆白名單。

## 11. 分階段執行計畫(user「全部做完做到完美」)

| Phase | 內容 | 風險 | 可逆 |
|---|---|---|---|
| **P1 地基** | 建 `packages/design-system/src/story-governance/category-matrix.ts`(typed SSOT,23 欄 × 5 category)+ 單元 → category resolver(讀 frontmatter/folder/title)| 低(純新增)| 易 |
| **P2 rewire 稽核** | 42 adaptive 控制改讀 matrix(dim + hook + script)+ 30 universal 加 degradation guard;dim-11 拆 category 分支 | 中(改稽核邏輯,需 breadth-test 每條)| 中 |
| **P3 遷移檔** | resize-handle→Components / overlay-surface·header-canonical·element-anatomy→Internal / horizontal-overflow hook→hooks/ / action-bar charter 修;連帶 barrel + title + import + storySort | 高(動 public API + import path)| 難(需 codemod + 全驗)|
| **P4 story 重整** | 各 category story 按 matrix 形式 align(component 三層 / pattern composed-example / internal reference / token swatch subtype)| 中 | 中 |

每 Phase 完成跑:tsc / build:lib / 對應 invariant + breadth-test / storybook smoke / content-quality。**P3 前必出 codemod + dry-run 清單給 user 確認**(動 public API)。

## 12. 已拍板(2026-06-05 user)

- element-anatomy runtime 件 → **Internal**(slot 件本就 internal;MenuItem 是 row primitive;anatomy spec 留作 4-family 參考)。
- Matrix 落地 → **package**(`packages/design-system/src/`,typed `.ts`,storybook-config + governance + fork 共讀)。
- 範圍 → **全部做完做到完美世界級**(分 P1-P4)。
