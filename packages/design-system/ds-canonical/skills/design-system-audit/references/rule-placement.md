# 規則分層(8 個 home)— 完整參考

**CLAUDE.md 已留**:8 個 home 名稱清單 + decision flowchart + signal-to-noise 原則(high-level)。**本檔 own**:每個 home 的 scope 完整展開 + 現行 skill 生態 + 歷史放置案例 + 未採納的 Claude Code 能力評估。

寫規則 / audit 規則分層時,走 CLAUDE.md 的 flowchart 先決定 home,然後查本檔對應 home 的完整 scope 描述。

---

## 8 個 home 的完整 scope

### 設計規則層(DS 設計知識,按影響範圍分層)

### Level 1 — `CLAUDE.md`(專案層跨元件設計規則 SSOT)

- 跨元件架構判斷框架(Props 命名、Family 分類、token 消費紀律)
- AI 反覆踩的**技術陷阱**(Tailwind v4 `var()`、tailwind-merge、Provider 放置、shadcn alias 回流)
- 系統級 meta 規則(命名三重 test、cva 適用範圍、Story 三層定位)
- **短指標**指向 spec 深度細節(一行連結不展開)
- **判斷法**:AI 每次執行都需要的提醒 → CLAUDE.md;查閱特定 spec 就找得到 → spec
- **不適合**:超過 5 行的對照表 / 場景列舉 / 公式推導

### Level 2 — 元件 `spec.md`(單元件設計規則)

- 元件定位 + Layout Family 宣告(第一段必含)
- variant / size / state 的「何時用 / 不用」與理由
- 元件特有的設計決策 + do/don't 原則
- 對 cross-cutting 規則的**例外**(documented 理由)
- 指向 CLAUDE.md / pattern spec 的反向引用
- **不適合**:適用多個元件的規則(應升級到 pattern spec 或 CLAUDE.md)

### Level 3 — Pattern `spec.md`(跨元件佈局 / 互動公式)

- 多元件共用的基礎設計規則
- pattern rationale + 公式 + token 結構
- **明列 pattern 的 consumers**
- 例:`item-anatomy.spec.md`(4-Family Model 頂層 taxonomy + Family 1+2 SSOT)
- **重要限制**:patterns/ 只收 runtime UI primitive,不收文件撰寫指南(那屬 Skill)。詳見 `packages/design-system/src/patterns/README.md` charter。

### Level 4 — Code(`.tsx` / `.css`)

- 被強制執行的 variant type (cva)、TS 型別約束
- **不需人類判斷**的實作細節
- 行內註解解釋微妙實作決策(**不是**設計理由——那去 spec)

### 執行與狀態層(DS 設計之外的知識)

### Level 5 — Skill (`.claude/skills/*/SKILL.md` + `references/`)

- **Audit / 稽核協議**(如 `design-system-audit` 的 22 個 audits / `product-ui-audit` 的 6 維度檢核)
- **AI↔user 對話 protocol**(checkpoint 範本:「先不管」vs tech debt / 新 rule 提議 / 分類模糊等)
- **特定工作流 playbook**(only-when-invoked 的多步驟流程)
- **文件撰寫指南**(story-writing 等)
- **pre-merge quality gate**(component-quality-gate 等)
- **判斷法**:這條規則是否「只在某個 invoke 情境才需要」? 是 → Skill;否(每次都要)→ CLAUDE.md
- **不適合**:設計規則(放 CLAUDE.md / spec)、session 狀態(放 memory)、runtime primitive(放 patterns/)

### Level 6 — Memory (`~/.claude/projects/.../memory/*.md`)

- **跨 session 狀態**(audit progress、tech debt 清單、決策紀錄)
- user 偏好 / 角色 / 專案 goal
- **每次 session 開啟時載入**
- **判斷法**:這是「會變化的狀態」還是「固定的規則」? state → memory;rule → CLAUDE.md/spec/skill
- **不適合**:固定規則、跑得出的資訊(git log / 現行 code 有就不用記)、user 明確「先不管」的事項

### Level 7 — Hook (`.claude/hooks/*.sh` / `*.py`)

- **Pre/post-tool 自動化**(邊界守衛、sync check 提醒、token hygiene、import guard、charter gate)
- **判斷法**:這條規則能「機械化在 tool 執行前後自動跑」嗎? 是 → hook;否 → CLAUDE.md 或 spec
- **當前 hooks**(7 個):
  - `pre_edit_spec_check.sh`(retired;改靠 M3 mindset #3「改一處看三處」)— 編輯 tsx 前讀 spec
  - `check_sync_update.sh`(retired/未實作 — 改靠 M3 mindset #3 + `pre_edit_spec_check.sh`)
  - `lib/_token_hygiene.sh`(由 `post_edit_dispatcher.sh` source)— 硬寫 shadow / shadcn alias / primitive-color / raw overflow 抓違規
  - `block_prototype_imports.py` — 產品 code 禁 import explorations
  - `enforce_home_charter.sh` — Write 到 classification-sensitive dir 時注入 charter(本 audit 設計時新增)

### Level 8 — Slash Command (`.claude/commands/*.md`)

- **輕量 user-invokable shortcut**(單步 action,無 workflow / checkpoints)
- 跟 Skill 的差別:Skill 是多步驟 workflow + user 決策點;Command 是一次性 scaffold / 單步觸發
- **判斷法**:這是「一次性 scaffold 或單步 action」嗎? 是且**重複使用 ≥ 3 次** → Command;否 → 需要 workflow → Skill
- **當前狀態**:無 commands(評估後認為 scaffold 流程太僵化,改回用 CLAUDE.md 清單 + AI 判斷)

---

## 當前 skill 生態(5 skills)

| Skill | Invoke 時機 | Scope |
|-------|------------|-------|
| `design-system-audit` | 稽核 DS 本身(spec/cva/SSOT 漂移 18 audits) | design-system/ 內部 |
| `product-ui-audit` | 「audit X feature」「DS 用對了嗎」/ prototype Phase 3.5 自動 | consumer UI code 6 維檢核 |
| `prototype` | user 明言「做 prototype / MVP / 原型」 | 建 exploration candidates(Phase 3.5 強制 audit gate) |
| `delivery-handoff` | 產品 final 後「要交付 / handoff」 | 產 figma-like 交付包 |
| `component-quality-gate` | 元件即將合入 DS | 45 項 spec+code+story+ship checklist |
| `story-writing` | 寫 / 審 story | 範例選擇 + anatomy 5-story + 三方連動 |

**不走 skill 的情境**:user 日常對話「比幾個版本 / 世界級怎麼做」等模糊語,AI 先 clarify 再決定走 skill 還是直接口頭討論。

---

## 放哪裡 decision flowchart(CLAUDE.md 已留,這裡重述供查閱)

```
Q1. 是設計規則嗎?(如何寫 spec / code / token / story / pattern)
    → YES: 進 Level 1-4(按影響範圍 + 判斷法)
    → NO: 繼續 Q2

Q2. 只在「特定 invoke 情境」才需要嗎?(audit / code review / setup 等)
    → YES 且是**多步驟 workflow + user 決策點**: Skill(SKILL.md + references/)
    → YES 且是**一次性單步 action**(scaffold / 單一 check): Slash Command
    → NO: 繼續 Q3

Q3. 是「隨時間變化的狀態」嗎?(已完成 / 待辦 / 決策紀錄 / user 偏好)
    → YES: Memory
    → NO: 繼續 Q4

Q4. 能用 script「機械化自動執行」嗎?(pre/post tool)
    → YES: Hook
    → NO: 繼續 Q5

Q5. 是 CLAUDE.md / SKILL.md 已有項目的「深層細節」嗎?
    → YES: Skill `references/*.md` 或 spec.md(視上層所在)
    → NO: **不合任何 home——重新思考 scope 或 ask user**
```

**硬輔助:README charter gate**(本 audit 新增)
所有 classification-sensitive dir 在根層有 `README.md` 作為 charter + 「收什麼 / 不收什麼 / 新增 criteria」。`enforce_home_charter.sh` hook 在 Write 到新 subdir / flat file 時自動注入 charter,確保 AI 不憑 flowchart 記憶分類,有明確 per-dir 對照表。

---

## 搬動規則的雙向處理

把規則從任一 home 搬到另一 home 時,**原位置必須留下一行指標**(「詳見 X」);反之亦然。**規則有家、也有路標**,不可只搬走不留索引。

---

## 歷史案例:正確 vs 錯誤放置(用於 audit / 回顧)

| 規則 | 原本想放 | 最終放 | 理由 |
|------|---------|--------|------|
| 命名三重 test | CLAUDE.md ✓ | CLAUDE.md | 每次新 variant/prop 都觸發,Level 1 |
| cva 適用範圍 | CLAUDE.md ✓ | CLAUDE.md | 寫元件 code 的 pattern 決策,Level 1 |
| 4-Family Model 頂層 taxonomy | CLAUDE.md + item-layout SSOT(舊) | `patterns/element-anatomy/element-anatomy.spec.md`(taxonomy overview)+ `patterns/element-anatomy/item-anatomy.spec.md`(F1/F2 deep)flat 並列 | 2026-04-20 refactor:folder `element-anatomy` = topic home,flat 多檔 topical pattern(overview + 具體 topic),對齊 Material / Polaris Foundations 組織法;不用 nested / 不用頂層飛地 |
| 「先不管」語意區分 | CLAUDE.md(❌ 錯放) | **`design-system-audit` Checkpoint 7** | AI↔user 對話 protocol,不是設計規則;只在 audit triage 情境需要 |
| 22 個 audits | CLAUDE.md(❌ 若放這會污染) | **`design-system-audit` skill** | 只在 `/design-system-audit` invoke 時需要 |
| Tech debt 清單 | CLAUDE.md(❌ 會過期變誤導) | **Memory** | 隨時間變化的 session 狀態 |
| Spec 寫作要交叉比對 | CLAUDE.md 或 spec 或 Hook | **M3 mindset #3 + `pre_edit_spec_check.sh`**(`check_sync_update.sh` retired/未實作)| Edit 前讀 spec + mindset 連動 |
| `ItemLayout` export(ghost) | 本來以為是 industry idiom | **移除,改用 `<MenuItem>` + slot components** | 實查 Material 用 `<ListItem>` / Polaris `<ResourceItem>` / Ant `<List.Item>`——都無 Layout 後綴。ItemLayout 違反「element-level 不用 layout 字」鐵律 + 不是 idiom。只是 doc 裡 ghost reference,真實 exports 是 `ItemIcon / ItemAvatar / ItemLabel / ItemSuffix / ItemInlineAction`(slot pattern)+ `MenuItem`(canonical F1) |
| Element anatomy 放哪 / item anatomy 結構 | 3 次 iteration:nested(X)→ 頂層飛地(F)→ 合併 merge(Y)→ flat topical(Z,final) | **`patterns/element-anatomy/` flat 多檔** | Z 比 X 少一層、比 Y 保 scope 純淨(taxonomy 和 deep SSOT 分檔);對齊 Material / Polaris 的 flat topical foundations 組織法 |
| Story 寫作完整指南 | CLAUDE.md(過度膨脹) / patterns/(類別錯) | **`story-writing` skill** | 文件撰寫 workflow,invoke-only 多步驟;不是 runtime primitive 所以不屬 patterns |
| 元件完成 checklist | CLAUDE.md(過度膨脹) / components/ 根目錄(破壞慣例) | **`component-quality-gate` skill** | pre-merge gate,invoke-only 多步驟;components/ 只收 PascalCase folder |
| 規則分層 scope 完整展開 | CLAUDE.md(佔 140 行) | **本檔(`design-system-audit/references/rule-placement.md`)** | governance reference,只在 audit 規則放置時查 |

---

## 已知但未採納的 Claude Code 能力(future-ready)

僅供參考,**目前專案未使用**——寫新規則前先用上述 8 個 home,用盡才考慮這些。

| 能力 | 路徑 | 何時該採納 |
|------|------|-----------|
| Custom sub-agent | `.claude/agents/*.md` | 需要 persona 化的 specialized agent,且會重複使用(目前用 generic + 客製 prompt 就夠) |
| MCP server | 外部 server | 需要對接外部工具 / 資料(e.g., Figma token sync)——屬整合層,非規則放置 |
| Output style | `.claude/output-styles/*.md` | 特定場合需要自訂輸出格式(對 DS 工作無關) |
| Custom statusline | settings.json `statusLine` | 需要持續在狀態列顯示 session health(如 audit progress / 未解 tech debt 數) |
| ScheduleWakeup / CronCreate | 內建 tool | 需要 scheduled recurring task(目前無此需求) |

採納新能力前先走:能力真的解決問題嗎? → 目前 8 個 home 是否已涵蓋?(若是 → 不加) → 採納成本 vs 收益?

---

## CLAUDE.md vs Skill 的 signal-to-noise 原則

- **CLAUDE.md 每次對話都載入**——每加一條規則都增加 AI 掃描成本。**只放每次都需要 signal 的 DS 規則**。
- **Skill 只在 invoke 時載入**——audit / workflow / interaction protocols 放這裡不污染每次對話。
- **不對家**:把 audit protocol 放 CLAUDE.md → 每次對話都讀 audit-only 內容 = 噪音;把 DS 規則放 Skill → audit 以外的 session 讀不到 = 遺失 signal。
