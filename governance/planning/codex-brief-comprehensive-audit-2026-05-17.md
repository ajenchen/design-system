<!-- Authority/status: governance/planning/registry.json -->
# Codex Brief — Comprehensive DS audit M31 dual-track(2026-05-17)

## User 原話(verbatim,不 paraphrase)

> 「請codex先讀完我們的所有檔案和設計原則根據我們深層完整進階的設計系統稽核的流程，完完整整的稽核一次，要完整不要只是抽樣，然後整理出一份修正報告，你可以跟他討論和辯論，看最終的修改共識是什麼，基本上只有會影響SSOT的UI/UX的增刪改需要用中文具體人話言簡意賅地講給我聽讓我判斷決策，其他的決策基本上就是不以省工為前提，以確保程式碼或設計原則夠言簡意賅、夠有效率、效能夠好、夠能夠維護SSOT、夠易懂、夠好維護、夠好管理、夠好擴充、夠符合世界級的設計、夠符合我們一致的設計語言為目標，依此為前提來照你的建議來自主自動自發地做到完整、完美」

## 完整深度稽核 SOP(必走全部)

對齊 `.claude/skills/design-system-audit/SKILL.md` 53 audit dimensions(Groups A-P)+ `.claude/rules/meta-patterns.md` 32 M-rules。**Coverage requirement (STRICT NO-SAMPLE)**:DS-wide ALL components / tokens / patterns / stories,**不**挑樣本。Context 不夠 → 拆 stage 全跑,**不**寫「sample / top N」escape clause(per `check_audit_sample_escape.sh` PreToolUse 攔截)。

## Claude 理解 + Layer A own audit findings(本 session 已 ship)

### 本 session 已修(不要再列為 violation)
1. **Header canonical 全新 ship**:`patterns/header-canonical/header-canonical.spec.md` + ChromeHeader primitive + 6 consumer spec.md pointer + Tabs cva default md→sm + 4 hooks(tab_lg_chrome_header_equal / header_with_tabs_border / chrome_header_handcraft / spec_class_drift)+ audit Dim 52/53 新加
2. **A11y batch**:56 元件 anatomy.stories.tsx 補 `Accessibility` export(11 stub + 15 spec extract + 30 TODO marker)
3. **Token stories**:opacity / layoutSpace 補(uiSize 確認 internal token consumer = 0 → 不補)
4. **Utility registry exception**:`_meta.exceptions.anatomy_stories_inspector` + `principles_stories_codepre` 加入
5. **Size-limit config**:package.json 加 300KB JS / 30KB CSS,實測 70/22 KB 過 gate
6. **Dim 24 stories retire**:Avatar Shapes/Colors / Chip Layout* / Field States / RadioGroup States / Slider Default/Range / SegmentedControl 6 stories / Tabs Overflow* / Textarea Modes/WithError / Steps AllStates / Empty NoDocuments + Input BorderStates / Menu WithStartIcon / DescriptionList HorizontalDivided / Checkbox Disabled 全 retire
7. **Story name jargon humanize**:TreeView Drag&Drop / TimePicker A11y / DateGrid A11y / DatePicker A11y / DataTable Roadmap×2 / Slider Default / Tooltip Default / Textarea Default / Chart A11yRule / Separator DecorativeSemanticRule 全 humanize
8. **Rule note 3 處 generic template** 重寫:Accordion / Checkbox / PeoplePicker
9. **Hook cap** 升 30→35 對齊 reality
10. **Sidebar VariantMatrix** 加 default vs meta cva 對照
11. **結構性保留 token canonical SSOT**:`.claude/references/structural-token-retention.md` 6 類 + sub-agent triple-verify 流程
12. **FileViewer / DatePicker spec reverse drift** 修
13. **Patterns README header-canonical row** 加
14. **CLAUDE.md / meta-patterns** hook cap sync 30→35

### Dim 48 token retire = 0(已 strict verify 359 tokens DS-wide)
135 zero-consumer token 全屬結構性保留 6 類(Radix palette completeness / forward-looking / Tailwind bridge / State SOP / type scale / elevation dark pair)。不要再 propose retire 任何 token。

## 請你獨立完整稽核(M31 Step 0.05 不 frame 你)

不被 Claude 框架限,獨立讀完所有檔案 + 跑 Group A-P 53 dim 完整覆蓋。**NO-SAMPLE STRICT**,DS-wide 全 60+ components / 78 specs / 8 tokens / 32 hooks / 20 skills。

### 重點 Dim recheck

讀完所有檔案後,重點 recheck 以下 dim 是否本 session ship 後仍有 violation:

| # | Dim | 重點 |
|---|---|---|
| 1 | cva defaultVariants 三方漂移 | 本 session 動 Tabs cva md→sm,docblock + spec + stories sync 過嗎? |
| 2-3 | SSOT dead link + reciprocal | 本 session 加 header-canonical.spec.md + structural-token-retention.md,所有 pointer 對嗎? |
| 5 | Token consumption | hardcoded hex/rgb 全 DS-wide grep |
| 9 | shadcn passthrough | ChromeHeader / SurfaceHeader 改後 forwardRef + displayName + asChild + props spread 過嗎? |
| 15 | Cross-doc 一致性 | CLAUDE.md / meta-patterns / SKILL.md / spec.md 32→35 hook cap sync drift? |
| 16 | Layout Family 宣告 | 新 patterns/header-canonical/ + chrome-header.tsx Layout Family 第一段宣告? |
| 17 | Prop value 跨元件衝突 | withTabs / lockDensity 跟 DS 既有 prop 撞名? |
| 18 | shadcn alias 回流 | bg-popover/text-muted-foreground 等 |
| 23 | Story canonical drift | `compile-stories.mjs --all --check` |
| 26 | Controlled/Uncontrolled dual-mode | overlay + form-like 元件 prop pair 完整性 |
| 27 | Clean code | any / dead export / file-size / long function |
| 31 | Overlay body stripped-padding boolean variant | Dialog/Sheet/Popover 自刻 |
| 33 | Component classification + abstraction discipline | ChromeHeader 5-test:Internal vs Components / Premature abstraction / Sub-component / Benchmark cite / DS internal canonical |
| 34-39 | State precedence + chain invariants(M24-M25)| disabled token / overlay scroll chain / naked variant / Field focus / inline-action gap / row-layout slot |
| 47 | Tailwind utility registry compliance | 讀 utility-registry.json 比對 anatomy stories exception 是否真豁免 |
| 49 | a11y axe-core | Storybook a11y addon 跑全部 |
| 50 | Bundle size budget | 70/22 KB 跑 size-limit 過 limit |
| 52 | Header canonical W1-W6 | ChromeHeader withTabs / lockDensity 真實工作 / token equality / flush stack / md future tier / sm default |
| 53 | Code-to-spec reverse drift | 所有 spec.md 寫硬寫 class 但 code 已 token 的反向 drift |

### Triple-verify 強制(per `.claude/references/structural-token-retention.md` + `.claude/skills/design-system-audit/SKILL.md`)

每抓 1 個 violation 必過 3 layer:
1. grep cite 真實 file:line + quote
2. cross-check 對應 spec.md「禁止事項」/「何時用」段
3. cross-check 既有 DS canonical / .claude/rules / structural-token-retention.md / `// @story-trait-rationale` escape comments

任一 layer 顯示「不是 violation」→ retract from report,**不送 user 拍板**。

### Report format

```
# Comprehensive DS Audit Final Report

## Coverage
- Components scanned: N / total
- Tokens scanned: N / total
- Stories scanned: N
- Specs scanned: N
- Stages 拆分:列每 stage 元件 list

## 真實 violations(過 triple-verify)

### SSOT-UI/UX-affecting(需 user 拍板,中文人話)
- [清楚 layperson 中文描述]:現況 / 影響 / 兩選項 + outcome / 推薦

### Non-SSOT(autonomous-fix scope per user directive)
分類列:
- Code quality(any / dead export / long function / file size)
- SSOT integrity(reciprocal pointer / dead link / Rule-of-3 dup)
- World-class alignment(naming / cross-doc consistency)
- Performance(bundle / re-render / memo gap)
- Maintainability(complexity / docs / test)

每項含 file:line + quote + propose fix direction

## False-positive retracted(triple-verify 過濾)
列已過濾的 candidate + retract evidence(避免後續誤觸發)

## Self-improvement capture
新發現 audit pattern / anti-pattern / 建議 codify 進 SKILL.md
```

### 環境

- Working dir: `/Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project`
- 跑 `exec -s read-only`,read-only,**不 commit / Edit file**
- Claude 已自跑 tsc + vite + storybook build + audit-content-quality + visual-probe 全綠 baseline
- 你 verdict 出來後 Claude 走 Step 4-5 比稿 + 整合 final + ship non-SSOT autonomous + 中文 propose SSOT-affecting 給 user
