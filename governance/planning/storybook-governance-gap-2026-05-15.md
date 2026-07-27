<!-- Authority/status: governance/planning/registry.json -->
# Storybook governance gap — 2026-05-15 audit-the-audit

User 抓「DS 深度稽核漏 storybook 範例 content quality」+ 「會不會還有其他一堆東西漏掉?都已經叫深度稽核到底怎麼還能疏漏?」。本檔盤列**所有 storybook 已定義原則** × **audit dim 覆蓋率** × **gap + infra fix**。

## A. 所有 storybook 已定義原則(SSOT enumeration)

來源:`.claude/rules/story-rules.md` + `.claude/skills/story-writing/SKILL.md` + 4 references。

| 類 | 原則 | SSOT | 既有 Audit Dim | 狀態 |
|---|---|---|---|---|
| **A.1 Layer 定位** | L1 展示(trait-based v2)/ L2 設計規格(6-canonical: Overview/Inspector/ColorMatrix/SizeMatrix/StateBehavior/Accessibility)/ L3 設計原則(Polaris-aligned ≥2 of WhenToUse/WhenNotToUse/Vs*Rule/ContentGuidelines)| story-rules.md L9-13 | Dim 11/13/29/30 | ✅ covered |
| **A.2 三層齊全** | 每 Components/ 元件必 3 layer 檔 | story-rules.md | Dim 11 | ✅ |
| **B.1 Title 結構** | `Design System/{Tokens\|Patterns\|Components\|Internal}/{Name}/{展示\|設計規格\|設計原則}` | story-rules.md L18-20 | **NONE** | ❌ MISSING dim |
| **B.2 第一層英 PascalCase** | 同上 | story-rules.md L20 | **NONE** | ❌ MISSING |
| **B.3 子頁中文** | 同上 | story-rules.md L20 | **NONE** | ❌ MISSING |
| **B.4 子頁前不加元件名** | (❌ `MenuItem 展示` → ✓ `展示`) | story-rules.md L20 | **NONE** | ❌ MISSING |
| **B.5 Internal vs Components 三 test** | 預設視覺 / 直接 `<X>` 有視覺 / 所有 consumer 包 wrapper | story-rules.md L22 | **NONE**(僅 hook write-time)| ❌ MISSING |
| **C.1 精簡 + 0 重複** | 每 story earn its existence | story-rules.md L26 | Dim 24 | 🟡 **dim 存在但前次 audit SKIP** |
| **C.2 earn-existence 2 test** | (a) 教別 story 沒教的 (b) 移除後 spec degrade | story-rules.md L28 | Dim 25 | 🟡 **SKIP** |
| **C.3 拆分原則** | 同 affordance 同 rule → 1 story + Controls;不同 affordance 必分 | story-rules.md L30-34 | Dim 28 | ✅ |
| **C.4 真實業務情境** | Jira/Stripe/Notion/Figma 可辨識,禁 placeholder/抽象/極端 | story-writing SKILL Phase 2 | Dim 12 | 🟡 **SKIP** |
| **D.1 「人」test** | 遮 title/label,5 秒看懂情境 | story-writing references/example-selection.md | **NONE 顯式 dim** | ❌(被 Dim 12 隱含但 SKIP)|
| **D.2 「舉一反三」test** | 讀者推自己產品怎用 | story-writing references/example-selection.md | **NONE 顯式** | ❌ |
| **E.1 Rule note 原則>結論** | spec 用詞品質 | story-writing references/example-selection.md | **NONE** | ❌ MISSING |
| **E.2 無中英夾雜** | 單一檔不中英 | story-writing self-check.md | **NONE** | ❌ MISSING |
| **E.3 Story name 無 spec 內部代號** | L1-L7/canonical/spec X | hook check_story_name_jargon | **NONE audit dim** | 🟡 hook only |
| **F.1 cva defaultVariants 3-way drift** | code/spec/anatomy SIZE_SPECS 同步 | CLAUDE.md | Dim 1 | ✅ |
| **F.2 anatomy TOKEN_MAP / SIZE_SPECS 對 cva** | story-writing SKILL Phase 4 | Dim 23 partial | 🟡 partial |
| **F.3 6-canonical 偏離 rationale** | 取代 canonical 必 spec.md rationale | story-writing references/anatomy-standard.md | Dim 13 | ✅ |
| **G.1 範例佔位符禁止** | `Option A/B/C` / 抽象代號 | story-rules.md L42 | Dim 12 | 🟡 SKIP |
| **G.2 極端不現實禁止** | 同上 | 同上 | Dim 12 | 🟡 SKIP |
| **G.3 視覺符號禁止** | (e.g. ASCII art)| 同上 | Dim 12 | 🟡 SKIP |

## B. Gap 統計

| 類 | Gap | 影響 |
|---|---|---|
| **B (Title 命名)** | 4 個 sub-rule 全無 audit dim(structure / lang / no-component-prefix / Internal-vs-Components 三 test)| user 抓「title 感」 |
| **C/D (範例品質)** | Dim 12/24/25 SKILL.md 有定義,**但前次 audit 我寫 sub-agent prompt 時 SKIP 了**(理由「too heavy」)→ 深度稽核變淺 |
| **E (Rule note 品質)** | 3 個 sub-rule 全無 dim(原則>結論 / 無中英夾雜 / 無 jargon)|
| **F.2 (cva-anatomy drift)** | Dim 23 partial cover,沒 enforce TOKEN_MAP 全 row 對得上 cva |

## C. Root cause(why 深度稽核疏漏)

**不是 SKILL.md 規則沒寫**,**是執行紀律破口**:
1. 我前次 `/design-system-audit --deep` 寫 sub-agent prompt 時**自作主張說「Dim 12/24/25 too heavy → SKIP」**。這違 SKILL.md「`--deep` 必跑」精神。
2. SKILL.md `--deep` mode 沒有**明文 NO-SKIP enforcement** → AI 可自作主張跳 dim
3. Sub-agent prompt 沒有「weight 預算」(允許每 dim 多少 token / time)→ AI 用模糊「too heavy」當理由

## D. Infra fix proposal

### D.1 新 dims(加進 design-system-audit SKILL.md)

| Dim# | Name | 抓什麼 | 對應原則 |
|---|---|---|---|
| **40** | **Title 命名 quality** | (a) Title 結構 `Design System/{...}/{Name}/{中文}` regex check(b) 第一層 PascalCase / 子頁中文(c) 子頁前無元件名 | B.1-B.4 |
| **41** | **Story name jargon** | grep story name 無 `L1-L7 / canonical / spec X / phase Y` 等 spec 內部代號 | E.3 |
| **42** | **範例佔位符 / 抽象代號** | grep story body for `Option A/B/C` / `按鈕一` / `Foo/Bar/Baz` / abstract code | C.4 + G.1-G.3 |
| **43** | **Rule note 品質**(原則>結論 / 無中英夾雜) | sample-based grep + AI judgement | E.1-E.2 |
| **44** | **Internal vs Components 分類** | 三 test scan per element folder | B.5 |

### D.2 修改 design-system-audit SKILL.md `--deep` mode

加 **NO-SKIP enforcement directive**(Phase 1 dispatching section):

```markdown
### `--deep` mode NO-SKIP invariant(2026-05-15 user-mandated)

`/design-system-audit --deep` 跑時,**禁止 sub-agent prompt 含「SKIP」「too heavy」「DEFERRED per instruction」當理由跳 dim**。
每個 dim 必跑;heavy dim(Dim 12/24/25/40/41/42/43)分**獨立 sub-agent**,不擠進 batch。
若 sub-agent context budget 不夠,**拆 2-stage**(per-component scan → cross-component synthesis),不可省。
違反 = 深度稽核退化成淺,user 第 N 次抓「漏東漏西」事件累積。
```

### D.3 改 sub-agent prompt template

(於 `references/audit-prompts.md`)— heavy dim 12/24/25 每個獨立 prompt,不批量;Dim 40-44 各一獨立 prompt。

### D.4 加 hook 機械強制

`stop_self_audit.sh` 升級偵測:if `--deep` 跑了 + sub-agent prompt 含「SKIP」/「too heavy」keyword → BLOCKER inject。

## E. Bug & test 影響

- 前 cycle audit 報「PASS」的元件 stories,**Dim 12/24/25/40-44 未真跑** → 結果 fragile
- 需 re-run with full coverage 才能判 storybook 真實品質

## F. 下一步

1. **此檔 commit** 進 `governance/planning/`(audit trail)
2. **D.1-D.4 改動 design-system-audit SKILL + 加 hook** → 待 user 拍板 scope(改 canonical 是 substantive)
3. **Re-run full deep audit** with 5 new dims + NO-SKIP 後,真實列 storybook 違規
