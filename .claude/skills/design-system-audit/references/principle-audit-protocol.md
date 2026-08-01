# D6 設計原則稽核 Protocol(SSOT)

**此檔是 D6「設計原則自檢」的唯一執行 SSOT**。所有 audit skill(design-system-audit / component-quality-gate / prototype / product-ui-audit)的 D6 phase 都 chain 本檔,不重複寫邏輯。

對齊 `packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md` 的 canonical audit taxonomy 與 Audit-vs-execute 分權。

---

## 為什麼有這個檔

2026-04-21 user 發現 D6 過去只做 triage 不真 scan → 漏掉 Inline Action icon SSOT 矛盾(item-anatomy 說「統一 fg-muted」vs Tag spec 說「繼承 Tag 文字色」),跨 spec 矛盾自 2026 年初累積到被 user 透過 BTW 發現才修。

**原因**:D6 散在各 skill 裡描述為「提議討論 triage」,無統一掃描方法 → 每次 audit 的 sub-agent 沒有強制 scan 動作 → 矛盾無人發現。

**解**:本檔定義 D6 的 4 子維 + auto-vs-STOP 判斷公式 + scan 方法。一處 SSOT,所有 skill chain。

---

## D6 5 子維(含 scan mode 分類)

**關鍵**:5 子維依「單 item 檢」vs「跨 item 比對」vs「predicate 自測」分三類。跨 item 比對的**必走 Phase 0 全掃再判**(對齊 canonical design-system-audit「一致性類稽核必先全掃再判」),否則無法檢出矛盾 / 不一致。

| # | 子維 | Scan mode | 掃什麼 | 怎麼掃 |
|---|------|-----------|-------|-------|
| **D6a** | **合理性** | **per-item**(單 spec 可判)| 每條 canonical 是否世界級對照支持?有明文 rationale? | 讀 spec 找「為什麼」prose + 對照 Polaris / Material / Atlassian / Ant / Apple HIG;孤立 rule 無對照 = flag |
| **D6b** | **一致性** | **cross-inventory**(必全掃)| 同概念跨 spec / 跨元件表達 / 術語是否一致? | 必先全掃建 inventory(見下 Phase 0)→ 比對 |
| **D6c** | **無矛盾** | **cross-inventory**(必全掃)| spec↔spec / canonical rules↔spec / canonical 聲明衝突 | 必先全掃 canonical concept index(見下 Phase 0)→ 比對 |
| **D6d** | **完整性** | **per-item + reference**(per spec 但要比 scope default canonical)| 原則有無覆蓋 applicable state / scope / edge case? | 單 spec 檢 + 對照 `rules/spec-rules.md` Rule B scope defaults|
| **D6e** | **Predicate 自測**(**new 2026-04-22**) | **predicate-internal**(對含 decision tree + example 表的 spec)| Membership drift / cap 違反 / example × world-class / empty category | 對齊 `rules/meta-patterns.md` M9;4 題 coherence check(見下 D6e scan) |

## Phase 0 — 全掃再判(cross-inventory 子維硬規則)

**D6b / D6c 跑前必先**:

### Phase 0a — 建 token / 術語 inventory(for D6b)
```
1. grep 所有 spec 中的 token 名(fg-muted / foreground / neutral-hover / primary-subtle 等)
   建 {token_name: [{spec_path, line, context}]} 表
2. grep 所有 .tsx 的 cva variants / prop literals
   建 {literal: [{component, prop_key, context}]} 表
3. grep 所有 spec 的 prop value 宣稱
   建 {component.prop.value: {spec_line, literal, semantic}} 表
```

### Phase 0b — 建 canonical concept inventory(for D6c)
```
1. 列 `packages/design-system/ds-canonical/{rules,references}/` + patterns/*/spec.md 所有「canonical」宣告的 concept
   (dismiss canonical / overlay padding canonical / icon size canonical 等)
2. 對每個 concept,grep 所有 spec 宣告該 concept 的段落
   建 {concept: [{spec_path, line, prose, rule}]}
3. 這是 baseline 的 concept matrix,**沒建完不能進 Phase 1 判決**
```

### Phase 0 自建 inventory(scan-only)

D6b / D6c 跑前 inline grep 建 concept matrix(本檔上方 Phase 0 已展開步驟),scan-only,不判決。

**為什麼 Phase 0 非走不可**:沒 inventory 就判 consistency = 盲人摸象。典型漏抓 case:
- 只看 Tag spec 不看 item-anatomy.spec → 漏 Inline Action icon SSOT 矛盾(2026-04-21 實例)
- 只看 Dialog spec 不看 Sheet / Popover → 漏 overlay padding 跨元件不一致
- 只看一個 spec 判 token 用法 → 漏跨 spec 用錯層級

## Phase 1 — 逐點判(per-item 子維 + cross-inventory 比對)

基於 Phase 0 inventory,才進行:
- D6a per-item:逐 spec 檢 rationale + 世界級對照
- D6b 比對 inventory:找 token 用法不一致 / 同字 prop value 跨元件語義撞
- D6c 比對 inventory:找 concept 兩聲明**不同規定** / canonical 有 drift
- D6d per-item + 對照 scope default:單 spec 驗 coverage

---

## Auto-fix vs 提議(STOP)判斷公式

### 核心判斷:**動 canonical 的 substantive meaning 與否**

| Finding 類型 | 動作 | 判斷依據 |
|--------------|------|---------|
| spec 跟 tsx / cva 不同步(tsx 是 source of truth) | **AUTO** 修 spec 對齊 tsx | tsx 是 code canonical,spec 該反映實作 |
| spec 跟 spec 用詞不一致 **但 substantive meaning 同** | **AUTO** 對齊 wording | 純表達統一,不改 meaning |
| SSOT pointer 缺 / reciprocal 缺 / dead link | **AUTO** 補 | 架構已定,機械補齊 |
| 編號 / 格式 / 排序問題(anatomy numbering / heading 順序) | **AUTO** 修 | 無 substantive 改變 |
| 命名對齊 **既有** canonical(術語 drift 修) | **AUTO** 統一 | canonical 已定 |
| 某 spec hardcoded class / px 漂移 → 用 token 名或 pointer 取代 | **AUTO** 修 | 表達層,不動 canonical |
| Rule A spec prose 移除 class name(遷到 anatomy) | **AUTO** 遷移 | 職責分離 |
| Scope default pointer 缺(該指 field-controls.spec.md 沒指) | **AUTO** 補 | SSOT 已存在 |

---

| Finding 類型 | 動作 | 為何 STOP |
|--------------|------|----------|
| spec 聲明的原則世界級對照有疑 | **CLASSIFY** | 有唯一證據答案則 P2E auto；會改產品/UI/UX meaning 且有真取捨才 P2H |
| 跨 spec 矛盾 **兩邊都有 rationale** | **CLASSIFY** | evidence 可收斂則 P2E auto；兩個可行 user-visible semantics 才 P2H |
| 新增／刪除 governance canonical rule | **AUTO(P2E)** | 工程治理 policy 由 agent 依 evidence/hard gates 決策 |
| 命名決策(新 prop value / 新術語)| **CLASSIFY** | public component semantics 真取捨為 P2H；機械命名/治理為 P2E |
| 工程治理 scope 擴充 / 收緊 | **AUTO(P2E)** | 依 frozen scope、least privilege 與 tests；task／deliverable 明確要求時才加 independent review |
| 擴產品/UI/UX SSOT 新 branch | **STOP(P2H)** | user-visible canonical 真取捨 — 2026-04-21 Inline Action icon 案例屬此 |
| Rationale 疑似過時 | **CLASSIFY** | evidence 唯一則 P2E auto；兩個 user-visible outcomes 才 P2H |

### 核心公式

```
動工程／治理 canonical substantive meaning → P2E AUTO
動產品／UI／UX canonical 且存在真取捨 → P2H STOP(exact target-bound decision)
對齊 canonical / 表達統一 / 補 pointer → AUTO(直接修)
```

**判斷 substantive 的 keyword**:
- 「canonical」「聲明」「必須」「統一規則」「SSOT」「rationale」「為什麼」「不允許」「禁止」
- 出現在 spec prose 且動到的 edit 觸及這些關鍵字 → 觸發 **CLASSIFY**；evidence
  已唯一決定的工程／治理修正是 P2E AUTO，只有會改變產品／UI／UX SSOT 且仍有真取捨
  才 P2H STOP。關鍵字本身不是 human gate。

---

## Scan 方法

### D6a 合理性 scan

```
對每個 .spec.md:
1. grep 「為什麼」/「rationale」/「世界級對照」章節
2. 找不到 = P1 flag(spec 缺 rationale)
3. 找到但無外部對照(自立論)= P2 flag(需補世界級對照)
```

### D6b 一致性 scan(grep-heavy)

```
1. Token 用法一致性
   - grep `fg-muted` / `fg-secondary` / `fg-tertiary` 在所有 spec
   - 檢查是否用在對的 role(color.spec.md 定義)
   - 誤用 → AUTO 修

2. Prop value literal 跨元件
   - grep 所有 `variant:` / `size:` / `mode:` 在 .tsx
   - 建立 {literal: [components]} 表
   - 同字跨元件 → 驗語義一致(命名三 test #3)
   - 語義不一致 → CLASSIFY；機械／治理命名由 evidence 收斂(P2E AUTO)，只有不同
     public semantics 導向不同 UI／UX outcomes 才 P2H

3. 術語一致性
   - 常見 drift:dismiss vs close vs dismiss vs onDismiss / onClose
   - fg-muted vs fg-secondary 用對層級
```

### D6c 無矛盾 scan(AI 讀 spec pairs)

```
1. 建「canonical concept index」(從 `packages/design-system/ds-canonical/{rules,references}/` + patterns/*/spec.md)
2. 對每個 canonical concept,grep 所有 spec 聲明該 concept 的段落
3. 比對:
   - 同 concept 兩 spec 聲明**不同**規定 → P0 矛盾(修其一或擴 SSOT)
   - 同 concept 某 spec 靜默違反 canonical rule → P0 矛盾
   - 某 spec rationale 跟 tsx 實作不符 → P1 矛盾(spec 過時或 tsx 錯)
4. 每個 P0 矛盾 flag 前驗是否為 documented deviation(rationale 存在 → deviation ✓)
```

### D6d 完整性 scan

```
1. 對每個 .spec.md,checkpoint 是否覆蓋(applicable):
   - disabled state
   - loading state(async 元件)
   - empty state(容器類)
   - dark mode(non-scope-default 元件)
   - density(non-scope-default)
   - icon-only rule(interactive 元件)
   - a11y 預設

2. 缺且無 scope default pointer → flag(可能 AUTO 補 pointer or STOP 補 prose)
```

### D6e Predicate coherence scan(對齊 canonical Meta-Pattern M9)

針對含 **decision tree + example 表 / real case 表 / category 分類** 的 spec
(item-anatomy.spec.md 的 Predicate、button.spec.md 的 variant 選擇、field-controls.spec.md
的 mode 選擇等),跑 4 題 coherence check。任一題失敗 → P0 violation(絕對不可忽略)。

```
1. Example → decision tree 回跑驗證:
   - Parse spec 的決策樹 Q1/Q2/Q3 條件
   - Parse real case 表的每個 entry 的 claim(category / primitive / size 等)
   - 對每個 entry:把 context 屬性(位置 / row size / interaction 類型)丟回 decision tree
   - 結果 vs claim 不一致 → P0 membership drift violation
   - 典型 FP 避免:tree 條件有模糊詞(「大」/「小」),對照表內 value 明確(24 / 28)
     時,以明確值為準判斷

2. Cap / constraint cross-check:
   - grep spec 內「絕對值 X」/「≤ Y」/「必 size Z」類 constraint 句
   - 對 real case 表 grep 相同欄位的所有 value
   - 有 value 超出 cap → P0 violation

3. Example × world-class benchmark(per example,非整體):
   - 對 real case 表每個 entry 各取 ≥3 家世界級 DS 對照
   - 我方選擇跟世界級 3 家中過半不同 → flag(可能對或可能錯)
     → 查 spec 有無 rationale 解釋為何不同
     → 有 rationale = deviation ✓
     → 無 rationale = P1 應補 rationale(AUTO 加 pointer)；若 benchmark 證據唯一則
       P2E 自主 revise，只有真產品／UI／UX outcomes 取捨才 P2H

4. Empty category check:
   - Decision tree 所有 category 都要有 ≥1 example
   - 空 category = 概念未收斂 / predicate 未完成 → P1 flag
```

**Phase 0 要求**:D6e 必先 grep 專案所有 `.spec.md` 找 decision tree / real case 表 /
category 分類,建 inventory 再逐個跑 4 題。不是隨機挑。

**世界級 benchmark source**(從 governance memory 或 `packages/design-system/ds-canonical/rules/meta-patterns.md` M8 列表):Polaris / Material / Atlassian /
Ant Design / Carbon / Apple HIG / VS Code / Figma。對每個 example,至少查 3 家的對應
實作名 / API / spec 段落。

**常見 FP 記憶**(2026-04-22 新增):
- decorative indicator 被誤列入 action predicate:DatePicker Calendar icon 放 Cat 1
  Inline Action(實際 pointer-events-none 不可點)→ D6e 應抓出,flag 為「點了不做事
  的 icon 不屬 action predicate」
- cap 違反自 session 訂立的 cap:FileItem rich 用 Button sm(28),同 spec 說 ≤ 24 cap
  → cap cross-check 應抓出
- **Cap scope 必明示 context**(2026-04-22 D6e scan 自測發現)— 預估 cap 違反前先確認 example 屬該 cap 的 context
  - 例:「Row dedicated action ≤ 24 cap」只適用 Row context,Chrome corner 不受此 cap 束縛
  - flag 前先 grep cap 句的 scope prefix(「Row」/「Chrome」/「Field」)再判斷
- **Benchmark 粒度匹配 predicate 粒度**(2026-04-22 D6e scan 自測發現)— per-variant / per-category predicate 需 per-variant benchmark,不是整體兜底一句
  - 例:Button 5 variant 選擇 predicate 需 per-variant world-class mapping(不只 L74 整體「Material / Polaris 共識」兜底)
  - flag 時區分「predicate 粒度 vs benchmark 粒度」不匹配 = P1 補 pointer
- **Overlay autoFocus canonical**(2026-04-22 新增)— Portal overlay 元件需檢 autoFocus 行為是否對齊 DS-wide canonical(body first interactive,不是 chrome close X)。詳見下方「Overlay autoFocus canonical」section。
- **Binary strict rule 震盪 FP**(2026-04-22 新增,canonical M12):visual preference 類 rule 被寫成「必 X」或「禁 Y」時,**先驗 ≥3 世界級 DS 一致**再 flag;找得到 counter-example = variance 不是 canonical,這是 AI 最常陷的 FP。
  - 例:「hover bg 必 flush 容器內邊」— Material / Polaris / Linear list row 多 flush 但非 must,Material Bottom Sheet / Polaris card-in-modal 允許 inset → 不該寫成 strict rule
  - 例:「chrome close X 必 size=sm」— Dialog / Sheet sm,但 Popover 因輕量浮層用 xs 合法 → 必 per-component context 判
  - **判斷公式**:strict rule 寫完前自問「我能想出一個 legal 的反例嗎?」→ 能 → relax 成「canonical 偏好 + variance 允許」,不寫 strict
  - **震盪症狀**:同一概念的 rule 被 A → not A → A 糾正 = meta invariant 沒抓到,停下找 root invariant
  - **Layer 確認 question**:rule 寫錯 layer(在 variance layer 糾結)是震盪主因。問「真實 invariant 在哪 layer?」通常深一層:
    - Surface:「bg flush 還是 inset」(bg-edge layer,是 variance)
    - Root invariant:「content 必在 bg 內有 padding」(content-vs-bg relationship,是 invariant)
    - 這兩 layer 的規則彼此 orthogonal:bg 邊可以 flush 也可以 inset,**content-inside-bg padding 跟 bg 邊位置無關**,但都必要
  - **AI 必自己跑此 check,不該靠 user 提醒**:rule 寫「必 / 禁」的瞬間就要觸發 M12 self-check。user 提醒第 3 次還沒 trigger = meta-loop 完全 bypass,違反「自我升級機制」
- **Markdown 表格 row 計數 FP**(2026-04-22 audit session 發現)— sub-agent 跑 canonical meta-pattern 一致性 audit(Dim 15 count drift)時,若表格中間有**空行分隔**(`| **M11** | ... |` 後接空行再接 `| **M12** | ... |`),agent 可能只算到第一段 rows。實際上 markdown table 中的 blank line 是 **visual spacing**或**table 終止**(根據 parser)— 兩種都可能被誤判。Mitigation:agent 計數前 prefer `grep -c "^| \*\*M[0-9]" packages/design-system/ds-canonical/rules/meta-patterns.md` 機械式計數,不靠 visual scan。
- **Dim 2 SSOT dead link 只檢 heading anchor 不檢 bare file path**(2026-04-22 audit session 漏掉)— element-anatomy.spec.md dead pointer `packages/design-system/src/ELEMENT-ANATOMY.md` 從未存在,但 agent 未 flag 因為 Dim 2 regex `\.spec\.md「」` 只抓 heading-anchor pointers。裸 file-path reference 落在檢測外。**已擴 Dim 2 prompt**(見 audit-prompts.md)增加 Part B(file path existence)+ Part C(spec self-placement drift)。本 FP 類別:**doc-structural drift**(doc 寫在 impl 前,impl 換方向後 doc 未更新),audit 應對 `README.md` home governance claim vs 實際 spec 位置交叉驗證

---

## Report 格式

```markdown
# D6 Principle Audit — {Scope} — {YYYY-MM-DD}

## 執行 scope
- 子維:D6a / D6b / D6c / D6d
- 元件 scope:{all / changed / component:X}

## AUTO-fixable findings(直接修)
### D6a 合理性(AUTO)
- {file:line} {desc}

### D6b 一致性(AUTO)
- ...

### D6c 無矛盾(AUTO)
- ...

### D6d 完整性(AUTO)
- ...

## P2H 提議討論(只有產品／UI／UX SSOT 真取捨才 STOP)
### 跨產品／UI／UX canonical 矛盾需仲裁
1. **{Concept}**:spec A 說 {X}(line),spec B 說 {Y}(line)
   - 選項 A:修 A 對齊 B,因為 {reason}
   - 選項 B:修 B 對齊 A,因為 {reason}
   - 選項 C:擴 SSOT 納入新 branch(例如兩 host 分類)
   - **我的建議**:{choice}

### 原則本身有疑
1. **{spec:line}** 聲稱 {claim} 但世界級對照 {evidence}
   - 是否修?

### 命名決策
1. **{prop value collision}** → 建議改名 {X → Y}

## Self-improvement capture(每次 audit 結束寫)
- 新發現的 FP pattern:{描述},回填到 audit-prompts.md
- 新確立的 meta-pattern:{描述},回填到 `packages/design-system/ds-canonical/rules/meta-patterns.md`
- 修完的矛盾:{list},回填到 memory `project_audit_progress`
```

---

## 常見 false positive 記憶(活文件,每次 audit 回填)

**sub-agent 跑 D6 前必讀此節,避免重複過去 FP**。

### 2026-04-21 Session 已收錄 FP

- **SSOT reciprocal 以 `##` heading 為唯一格式** → FALSE。inline prose pointer「詳見 `X.spec.md`「Y」」也是合法 reciprocal。flag 前要完整 grep target spec 找 anchor 再判。
- **「缺 dark mode section」** → FALSE,若 spec 用 semantic token(`--primary` / `--fg` 等)= 自動豁免;若有 pointer 到 color.spec.md = 豁免。
- **「缺 empty state」** → FALSE,若 spec 寫「empty 由 consumer 用 <Empty>」= 豁免。
- **「anatomy 缺 Inspector」** → 2026-04-21 revert applicable-where-meaningful → 改回 strict-by-default。但確實 props < 2 的(Separator / Skeleton / CircularProgress)有 hard rationale 豁免。
- **「ARIA / tabIndex 不對」** → FALSE,若 wrap Radix primitive(Radix 處理)= 豁免。grep import 確認。
- **「7-dim 覆蓋不足」** → 多數是 scope default 豁免(Field family pointer / Internal / wrapper),flag 前驗 scope default。

### Meta-lesson(AI 自我提醒)

- **寫新 protocol / skill / rule 時,必反向自檢:**
  - `packages/design-system/ds-canonical/` 既有 Meta-Principle(M1-M6)/ Scope 預設 / 分權 canonical 有哪條適用?
  - 若新 protocol 是 consistency-class audit → **必走 Phase 0 全掃再判**(canonical design-system-audit「一致性類稽核必先全掃再判」)
  - 若新 protocol 是 audit skill → **必加 Self-improvement capture** Phase F step
  - **歷史**:2026-04-21 第一版 principle-audit-protocol.md 寫完未套「Phase 0 全掃」到 D6b/D6c,被 user 抓到「這也是跟一致性有關」才補。Meta-pattern:**新規則寫完,先跟既有原則 cross-check 再送出**。

### 回填格式

每次 audit 結束,若 sub-agent 回報「某 finding 經驗證為 FP」→ main agent 在此節追加一行:
`- **{FP pattern}** → FALSE,{豁免條件}`

---

## Overlay autoFocus canonical(2026-04-22)

**所有 Portal overlay**(Dialog / Sheet / Popover / Coachmark / DropdownMenu)開啟時:
- **必 avoid** focus 到 chrome close X(否則 tooltip leak bug — user-hostile,opening overlay 就彈 tooltip)
- **必 focus** body 第一個有意義互動元素(primary input / primary button),若無 → content root(overlay container)

**違反 → tooltip leak bug**(user-hostile):chrome close X 多半帶 aria-label tooltip,開 overlay 就顯示 tooltip 搶焦點,語意錯位(user 是來跟 overlay body 互動,不是關掉它)。

**D6e scan memory**:跑 D6e predicate coherence check 時,對所有 overlay 元件 spec 額外檢:
- 有無聲明 autoFocus 行為?
- 聲明是否對齊此 canonical(body first interactive,不是 chrome X)?
- Storybook 實作是否對齊 spec?

**世界級對照**:
- Radix `onOpenAutoFocus` 預設 focus 到 content root 第一個 interactive,不是 close trigger
- Material Dialog 有 `disableAutoFocus` 但預設走 first tab stop inside content
- Polaris Modal focus 到 title + tab 到 primary action,不預設 close X
- iOS sheet 開啟不 focus 到 dismiss handle

**實例**(2026-04-22 Coachmark):Coachmark 原預設 autoFocus 到 chrome close X → 開 coachmark 立即彈「關閉」tooltip,打擾 user。修法:改走 body first interactive。此類行為應 DS-wide 強制。

## Portal theme/density subtree escape canonical（M3,2026-05-31 audit-time）

**為何 audit-time 不是 write-time hook**:M3 是 runtime CSS cascade + 設計意圖判斷 —— Portal overlay 搬到 `document.body` 後,CSS 繼承 chain 從 app root `<html data-theme>` 起算,**正解對 11 個 overlay 元件是「什麼都不做」**(自然繼承 app root),只有極少數(eg. OverflowIndicator 刻意 lock dark）才需顯式 set。「何時需要 override」無法靠 write-time regex 可靠決定(絕大多數情況不需要,硬偵測必大量誤判)→ 故**不設 hook**,改 audit-time visual probe(誠實:此 invariant 非機械可強制)。

**新 Portal overlay 元件 merge 前必跑 dark-subtree visual probe**:
1. 把 trigger 放進 `data-theme="dark"` subtree(或反向:trigger 在 dark、app root light)
2. 開啟 overlay,截圖 Portal Content
3. **驗**:Content 顏色對齊「它該繼承的 theme」(預設 = app root theme,不被 trigger subtree 污染);若元件刻意要繼承 trigger theme → 必在 spec 聲明 + 顯式 set `data-theme` on Portal Content
4. **同類 chain**:`data-density` 部分 overlay 刻意 lock `md`(見 `density.spec.md`)→ 同樣 probe 驗

**違反 → M3 portal escape bug**(歷史:DropdownMenu 在 dark subtree 變亮 / Avatar HoverCard NameCard 文字白色)。

**D6e scan memory**:對所有 Portal overlay 元件,額外檢 spec 有無聲明 theme/density 繼承行為 + story 是否有 dark-subtree probe 覆蓋。

---

## Integration — 哪個 skill 在哪個 phase 跑 D6

| Skill | Phase | Scope |
|-------|-------|-------|
| `/design-system-audit` --deep | Phase 3.5d | D6 全 4 子維,全 DS scope(真 scan 而非 triage) |
| `/design-system-audit` --changed | Phase 3.5d | D6b(一致性)+ D6c(無矛盾)scope to changed files |
| `/component-quality-gate` | Phase 4.5(6 維內) | D6 scoped to 該元件 + 跨 spec pointer 涵及的 kin |
| `/prototype` | Phase 3.5d | D6 scoped to exploration code 是否牴觸 DS 原則 |
| `/product-ui-audit` | new dim(增) | D6 scoped to consumer code(檢查是否誤用 DS canonical) |

### 使用公式(每個 skill 的 Phase 對應段落)

skill 只需寫:
```
Phase X — D6 設計原則自檢:chain `principle-audit-protocol.md`
scope: {all / component:X / consumer_code_path}
```

skill 不再重複 scan 方法 / 判斷表。

---

## 本 protocol 自己也是活文件

每次 audit 結束,main agent 自動回填 4 類學習(對齊 canonical Audit skill Phase F 節):

1. 新 FP → 加到上方「常見 FP 記憶」
2. 新 meta-pattern → 提議加到 `packages/design-system/ds-canonical/rules/meta-patterns.md`
3. 新 canonical SSOT 擴張 → 提議加到對應 pattern spec
4. User 糾正 → `governance/memory/feedback_*.md`

無新 learning 必寫 "無新 pattern"(不省略,確保 step 被執行)。
