# 治理進化 roadmap(2026-07-07,SSOT — Level 9 plan doc)

**來源**:user 提問「Fable 5 如何進化稽核/做產品 skill 使產出完美不打折 + 世界級 + 一致設計語言 + SSOT 不造輪」→ 8-agent 研究(3 路內部盤點 + 5 路世界級,全 URL+verbatim,artifact: deep-audit workflow wnk1hfk7x)→ user 拍板「確認全方位比之前好就直接做到完整完美」(2026-07-07)。
**Memory pointer**:`project_governance_evolution_roadmap.md`。

## 核心模型:雙柱(user 質疑後定案)

- **完整稽核 = 永久機構**,五類永遠需要它:存量(防線前寫的)/ 外來(別處進來的)/ 時間漂移(依賴升版、規則演進)/ 防線腐化(gate 假綠、baseline 過期)/ 品味與世界級演進(永不謂詞化)。「new audit layer ALWAYS expand never replace」不變。
- **謂詞化 = 稽核的機械化引擎**:每類被抓到的問題轉 deterministic 謂詞後,同一謂詞對存量/外來全量零抽樣免費掃——稽核不縮編,是機械部分逐季變厚、LLM 判斷聚焦真前沿。
- **「完美不打折」的工程化承諾形式**:fail-closed(該跑的閘漏跑 = 紅)+ 證據綁定(無 artifact 的 PASS 不算)+ 失敗單調轉防線(已知類別問題不二過)。

## 七條方向(1-3 本輪落地;4-7 分期,各有 trigger 條件)

### 1. 判準化引擎 ✅ 本輪落地
- **缺口**:`audit-coverage-matrix.mjs` 已能列 PURE-JUDGMENT gap list,但只報告、無驅動機制。
- **落法**:deep-audit-cross-codex C.0a 加「判準化 harvest」步(每輪收尾選 top 1-3 judgment dim 當場寫 deterministic script;寫不成者記「為何不能謂詞化」);governance-health 月度 metric 加 PURE-JUDGMENT 佔比 trend。
- **KPI**:PURE-JUDGMENT 佔比逐季下降;錨例:selected/active 謂詞、shifted-clock(2026-07-07 當場謂詞化實證)。

### 2. Fail-closed 合規掃蕩 ✅ 本輪落地
- **缺口**:4 支 SSOT 級 hook 是 soft(benchmark_citation P1 / propose_without_benchmark soft inject / opacity_token WARN / ds_anchor soft)——違反自家 doctrine「SSOT canonical 必 P0 BLOCKER 禁 P1 WARN」(user 2026-05-27 verbatim,memory feedback_ssot_mechanical_p0_not_p1)。
- **落法**:逐支 dry-run 列存量 → 升 P0 + per-line escape + test;誤殺率高者先收 regex 不降級(Polaris ratchet:styles-insert-stylelint-disable 同構——存量標記列冊、新寫入即刻生效)。

### 3. 造輪防護三洞 ✅ 本輪落地
- **洞 a**:tsx「── 消費的 SSOT ──」段驗證 hook 已 retired(ssot-consultation.md:53)→ 復活精簡版(新建 components tsx 無此段 → BLOCK;存量 ratchet 豁免)。
- **洞 b**:`check_ds_anchor_preflight.sh:59-60` 純手刻零 primitive 直接放行 → 補視覺簽名偵測(第一期 warn,誤殺率驗證後升 P0)。
- **洞 c**:new-component 無 propose-time 機械產物 → Phase 1 強制「primitive 覆蓋對照表」artifact(anatomy 段 × 消費的既有 primitive;對不上才准自建 + 理由)。
- **同族**:shadcn 目錄決策謂詞(2026-07-07 FileItem vs Attachment 研究定案)→ ui-development.md shadcn 段 + spec-rules.md L18 clarifier + file-item.spec 對照行。

### 4. 防線下沉 eslint/stylelint(分期;trigger:下一次 fork 端 token/primitive 違規實例,或 beta.9x 前主動排program)
- **理由**:hooks 只防 AI 經 Claude Code 寫入;fork user 手寫 code 無防線。Polaris(stylelint 40+ rules,「command line, CI, and supported editors」三處同源)/ Primer(eslint 20 rules)/ Atlassian(ensure-design-token-usage,68 rules)三家同款。
- **形態**:`@qijenchen/eslint-plugin-design-system` 隨 npm 發;第一批規則 = token 硬寫、shadcn compat alias、primitive 繞過(從 hooks 平移)。
- **驗收**:fork repo CI 掛 plugin 後注入違規 → 紅。

### 5. 品質狀態回灌(分期;trigger:方向 1 跑滿一季後,或 stakeholder 要求品質儀表板)
- **理由**:Carbon「@avt test tags populate accessibility statuses within component pages」——測試即文件。我們稽核結果躺 logs。
- **形態**:per-component quality manifest(45 項 gate / AVT / VRT / 成熟度)自動生成進 Storybook docs 頁。
- **驗收**:任一元件頁可見其品質狀態,資料源 = CI artifact 非手寫。

### 6. Codemod 基建(分期;trigger:第一個會影響 fork consumer 的 breaking API 變更)
- **理由**:Carbon definition-of-done「an automated code migration script should be written and made available through @carbon/upgrade」;Polaris migrator fail-loud「Unable to migrate... Please upgrade manually」。
- **形態**:輕量起步(rename map + jscodeshift runner);v1.0 前升硬規(breaking 必附 codemod 才算 done)。

### 7. Baseline accept workflow(分期;trigger:下一次 VR baseline 更新需求)
- **理由**:Chromatic「Baselines only update when changes are accepted by you or your team」;今日手動四輪(dispatch→下載→看圖→cp→commit)。
- **形態**:`scripts/accept-baseline.mjs`(下載 run artifact → 強制模型看圖陳述差異 → cp + commit);「模型親眼讀圖」步驟不可省(2026-07-07 today=7 誤判 anchor:只有看圖才抓到)。

## 世界級引證索引(全 verbatim 在 workflow artifact)

Polaris stylelint-polaris / polaris-migrator READMEs;Primer eslint-plugin-primer-react + contributor-docs/testing.md(@avt/@vrt);Carbon component-checklist mdx + docs/testing.md;Chromatic docs/visual + branching-and-baselines;Style Dictionary README + architecture。

## 內部盤點缺口索引(全 file:line 在 workflow artifact)

ssot-consultation hook retired(無機械驗證)/ ds_anchor_preflight:59-60 手刻放行 / 4 支 soft hook vs P0 doctrine drift / coverage-matrix 只報告不驅動 / performance-audit 自述「未來可加」項(bundle-size CI、why-did-you-render)/ delivery-handoff 幾乎無機械依賴。
