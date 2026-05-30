---
name: story-writing
description: Guide for writing Storybook stories (.stories.tsx / .principles.stories.tsx / .anatomy.stories.tsx) with world-class example quality. Enforces real-product scenarios, 「人」+「舉一反三」tests, Rule-note 原則>結論, and anatomy 6-story structure(含 A11y,2026-04-24). Invoke when user says「寫 story」「新增範例」「補 anatomy」「principles story」or is about to create/edit any `.stories.tsx` file in design-system.
---

# Story Writing

Purpose: Storybook 是公開文件,範例 = 設計系統品質。本 skill 把「怎麼挑範例 / 怎麼寫 anatomy / 三方連動怎麼不漂移」集中成 invoke-time playbook,CLAUDE.md 只留最高準則 + 禁止清單。

## When to run

- User 說「寫 story」「新增範例」「補 anatomy」「principles story」「審 story」
- AI 即將建立 / 編輯任一 `.stories.tsx` / `.principles.stories.tsx` / `.anatomy.stories.tsx`
- Review 其他 contributor 的 story PR

## Preconditions

- 讀過 `.claude/rules/story-rules.md`(三層定位 + title 命名 + 範例最高準則)
- 該元件的 `.spec.md` 已存在且本 session 已讀(stories 必須反映 spec,不發明新規則)
- 若寫 anatomy:元件 `.tsx` 的 cva 定義已看過(TOKEN_MAP / SIZE_SPECS 必須與 code 一致)

## Workflow

### Phase 0.0 — Registry-driven baseline grep(2026-05-20 升級 per codex Layer B D4)

**MUST 在 Phase 0 / 0.5 / 1+ 之前先跑**:

1. **Load registry**:Read `.claude/references/story-baseline-registry.json`。檔內列每個 primitive(Sidebar / DataTable / ChromeHeader / etc.)的:
   - `baseline`:production-grade canonical story path#StoryName
   - `requiredHelpers`:必 import 的 helper list(WorkspaceBrand / MAIN_NAV / etc.)
   - `antiPatterns`:regex + severity(block / warn)+ rationale
   - `variantRules`:variant + size + prop combo canonical(eg. DataTable toolbar = text + sm + iconOnly + pressed)
2. **Read baseline + helpers**:跑 grep + Read 取真實 production canonical 用法,Read 對應 helper source code
3. **Produce diff table**:`primitive → baseline path → copied structure → deviations(if any with rationale)`
4. **No registry entry?**:STOP,先 add registry entry 才能寫 story。不能憑直覺寫 simplified mock。
5. **Marker required**:story 檔頭標 `// @story-baseline: <path>#<StoryName>` cite。

### Phase 0 — Baseline grep(legacy,2026-05-20 由 Phase 0.0 registry 取代)

(per M35 升 registry-driven,Phase 0 內容由 Phase 0.0 自動 cover。保留段供 legacy reference。)

### Phase 0.5 — 展示層拆分原則 mapping(展示 stories 必走)

對 `{name}.stories.tsx`(展示)層,寫前必走 4 步(對齊 memory `feedback_proactive_5layer_pipeline.md`「5-step pre-check」— 若寫 stories 時消費其他元件 tsx,該層也適用):

1. **對 category**(see `references/category-templates.md`)— 元件屬 A-G 哪 category,suggested core stories 是什麼?
2. **讀 spec.md** 列該元件 distinct rules(每 variant / prop / state 一條)+ 對照 category core list 補缺
3. **產 mapping table** rule → story(對齊 Polaris / Carbon / Storybook 官方,2026-04-26 verified):
   - 同 affordance 同 rule 的 prop variations → **1 story + Controls 切**(❌ `WithStartIcon`+`WithEndIcon` → ✓ `WithIcon` 對照 grid)
   - 不同 affordance → 必分(`IconOnly` / `FullWidth` / `Disclosure`)
   - AllVariants / AllSizes 對照各 1
   - Compound 有 new constraint(prop 名變 + 必某 affordance)→ 必分(`OverlayBadgeOnIconOnly`)
   - 真實業務情境 → 1 場景 1 故事
4. **present mapping** 給 user sign-off(若走 skill);user 拍板才寫;反 pattern 在 step 3 即可避免

Hook `check_story_invariants.sh` R2 slot_split write-time block 同源反 pattern。Audit `/design-system-audit` Dim 28 後驗。

### Phase 1 — 定位(決定寫哪層 story)

問自己:這個 story 的受眾要做什麼?

| 目的 | 寫哪 | 職責 |
|------|------|------|
| 掃視 variant × size × state 渲染結果 | `{name}.stories.tsx`(展示) | 視覺目錄 |
| 查 token / 尺寸 / Inspect 面板取代 Figma | `{name}.anatomy.stories.tsx`(設計規格) | 技術查閱 |
| 學「何時用哪個 variant」的判斷 | `{name}.principles.stories.tsx`(設計原則) | 使用判斷 |

混層 = 污染(principles 放 anatomy 資料 / 展示塞 do/don't)。走錯層 → 重選。

### Phase 2 — 範例選擇(最高準則 + 驗收 test)

**參考 `references/example-selection.md`**——完整合法來源 / 禁止清單 / 2 個 test / 正確範例對照 / Rule note 品質 / 視覺品質。

核心三問:
1. 範例來源是真實 SaaS / 常見業務(Jira / Stripe / Notion / Figma 付款 / Slack 通知)?
2. 遮掉 title / label,5 秒看懂情境?(「人」test)
3. 讀者能推出自己產品怎麼用?(「舉一反三」test)

任一不過 → 改範例,不是補說明文字。

### Phase 3 — anatomy 6-story 結構(僅 anatomy 適用)

**參考 `references/anatomy-standard.md`**——每個元件 anatomy 必備 **6 件套**(`export const Overview / Inspector / ColorMatrix / SizeMatrix / StateBehavior / Accessibility`,一字不差;Accessibility 第 6 章 2026-04-24+ 對齊 Material / Polaris / Atlassian) + Inspect 面板規格 + token-first 原則 + 值溯源完整性。

**偏離 canonical 規則**(CLAUDE.md `# 稽核 canonical`「Consistency 類稽核必 Phase 0 全掃再判」;偏離需 rationale 由 design-system-audit Dim 13 enforce):
- 追加第 7+ 個元件特有 story → OK,免 rationale
- 取代 6-canonical 中某個 → **必須在元件 spec.md 寫 rationale**
- 同概念改名(如 `VisualTokens` 取代 `ColorMatrix`) → **禁止**

`/design-system-audit` Dimension 13 會強制 grep 比對偏離 + rationale 追溯。

Checkpoint: 寫完後必驗:
- TOKEN_MAP / SIZE_SPECS 每筆對得上元件 .tsx 的 cva 定義?
- 藍圖每層 padding/margin/gap 都畫?(含子元素 `px-1`)
- State 用開發術語(default 不是 rest)?
- 色塊用 `var()` inline style(dark mode 自動更新)?

### Phase 4 — 連動檢查(stop 點)

改 `.tsx` 或 `.spec.md` 後寫 story:
- **高風險漂移點:cva `defaultVariants`** → grep `star 預設 default` 該元件所有檔案,一次改完
- spec 新加 rule → principles stories 必有對應 do/don't 範例
- 元件改 variant/size → anatomy TOKEN_MAP / SIZE_SPECS 同步

**STOP 條件**:若三方(code / spec / story)任一有矛盾且原因不清楚 → 停下問 user,不默默改一邊。

### Phase 5 — 自我檢查 checklist

**參考 `references/self-check.md`**——7 題 checklist 全部打勾才算完成:範例真實性 / 「人」test / 舉一反三 / 無極端案例 / 無代號 / Rule note 原則>結論 / 無中英夾雜。

## References

- `references/category-templates.md` — 7 category(A-G)suggested core stories(展示層 emergent typology)
- `references/example-selection.md` — 完整範例選擇原則(合法來源 / 禁止清單 / 2 test / 正確範例 / Rule note / 視覺品質)
- `references/anatomy-standard.md` — anatomy 6-story 結構 + Inspect 面板 + 品質規則
- `references/self-check.md` — 7 題自我檢查 checklist

## 相關

- `.claude/rules/story-rules.md`:三層定位 + title 命名(high-level signal)
- CLAUDE.md `# 失敗記憶索引` → 三方漂移:SegmentedControl cva defaultVariants bug
- M3 mindset #3「改一處看三處」+ `.claude/hooks/pre_edit_spec_check.sh`:Edit 前讀 spec、三方連動靠 mindset(`check_sync_update.sh` retired/未實作)
