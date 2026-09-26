# Canonical references charter

## 這裡收兩類:**agent infrastructure reference**,以及**跨元件互動 canonical**(2026-09-26 更正)

Agent 在執行時按需讀的深度 reference 檔 — audit protocol / FP 記憶 / workflow recipe / lookup tables。**單一元件的 product design canonical 不在這裡**(那該進該元件 spec.md / `packages/design-system/ds-canonical/rules/*.md`)。

**2026-09-26 更正 —— 承認第二類住戶:跨元件互動 canonical**。`hit-area-canonical.md`(滑過原則與命中區)/ `focus-canonical.md`(鍵盤游標與焦點框)/ `keyboard-model-canonical.md`(鍵盤模型與彈出框的 Tab / Esc)/ `drag-canonical.md`(拖曳)四份**就是**跨元件的產品互動 canonical:owner 在這裡,各元件 `spec.md` 只放指標指回來(例:`date-grid.spec.md`、`steps.spec.md`、`sidebar.spec.md` 的命中區段、`file-item.spec.md` 的焦點框段全指回這四份)。理由:這類規則一次管全 DS、不屬於任何一個元件 —— 塞進某個元件的 spec 會變成第二份 SSOT(其他元件得抄),塞進 `rules/*.md` 又會被當成 path-scoped 的編輯規則而不是設計契約。舊 charter「不收 product canonical」的三句與下方 2026-04-24 Lesson 只對**單一元件**的判斷(24px threshold / disabled state / primitive exposure 那類)成立,先前沒把這一類寫出來,四份檔案實際上已經在這裡當 owner 卻與 charter 打架,故補上。條件:元件 spec **只准指標、不准另抄一份**;新的跨元件互動 canonical 也照這個形狀(一個能力、一份跨元件契約、與這四份同層級)。

## 當前居民

| Ref | 用途 |
|-----|------|
| `build-ui-canonicals.md` | 建 UI 前 12 情境 + 8 layout primitive lookup |
| `certified-surfaces.md` | Provider surface certification policy；machine ledger 仍是唯一狀態 authority |
| `composition-fidelity.md` | Composition fidelity SSOT — consumer 用對 DS(conformance)為主,靜態 lint 驗(對齊 Polaris/Atlassian/Carbon);pixel/DOM identity diff 改 opt-in(2026-06-02 model 修正,非追求 product-vs-showcase 一致) |
| `cva-patterns.md` | cva 適用 / 不適用 + 例外清單(跟 canonical `packages/design-system/ds-canonical/rules/ui-development.md` shadcn 規範互補) |
| `drag-canonical.md` | 現行 drag behavior/visual ownership、DataTable/TreeView 能力矩陣與保留中的未來擴充邊界 |
| `focus-canonical.md` | 鍵盤游標與焦點指示的跨元件 SSOT — 誰能移動游標(只有鍵盤;已開啟的浮層選單是唯一例外,會搶反白的浮層選單與不搶的常駐清單兩類分開)、游標長什麼樣(一律畫框、不上底色;判準只有一題「是不是插入點控件」—— 2026-09-06 的「懸停→選中兩段式」判準已於 2026-09-09 撤回)、內外描邊判準(外 +2px / 放不下就內 −2px / 填色元素的白線) |
| `failure-class-registry.json` | 被抓過的 failure class → mechanical defense／judgment audit 的封閉追蹤表 |
| `hit-area-canonical.md` | **滑過原則**的跨元件唯一住所(2026-09-26:滑過只為三件事 —— 告訴你能操作、叫出按鈕、給你看資訊;能點的元件「滑過有變化的位置點下去一定有反應、能點的地方不一定要變」;判斷順序四題)+ 可點範圍細則:懸停回饋的形狀 ≡ 命中區、唯一例外(線與點)的四個條件、外擴硬限制、DS 現況盤點 |
| `keyboard-model-canonical.md` | 一串東西該用 Tab 逐項走還是 Tab 一次進去再用方向鍵的跨元件 SSOT — 五條判準(節點可被施加動作 / 真需要 tree 鍵盤 / 深度無上界 / 內容由使用者產生可改動 / 啟動不保證換 URL,同時滿足才是樹)、「列上有小按鈕的一串」一串一站 + 方向鍵(2026-09-25 user 拍板路線乙)、彈出框開著時 `Tab` / `Esc` 的單一住所、`aria-current` ≠ `aria-selected`、撤回「有沒有選中狀態」「是不是連結」「在不在側邊欄」三條錯判準、宣告 composite 角色就必須實作那套鍵盤 |
| `governance-audit-coverage.md` | 治理 home × 稽核機制 × 執行頻率覆蓋表 |
| `item-anatomy-recipe.md` | 7 步建立新 row primitive workflow + audit grep guard |
| `naming-conventions.md` | 命名詳表 + 禁止清單(AGENTS.md `# 命名與語言一致性` pointer) |
| `principle-dim-map.json` | M-rule / trait / hook → audit dim explicit mapping(SSOT for dim coverage) |
| `props-naming.md` | Props callback / Badge / icon canonical 詳表 |
| `repository-hygiene.md` + `repository-hygiene-policy.json` | Full/deep audit 的 repo 拓撲、冗餘分類與可攜機械政策 |
| `runtime-evidence-retention.md` | Git-local audit/review evidence 的 lifecycle retention、lazy bundle materialization 與 whole-run cleanup canonical |
| `scenario-definition.md` | Monorepo 2-Scenario architecture SSOT(Scenario A direct fork DS / Scenario B fork template + mirror chain + verify checkpoints)|
| `spec-rules.md` | SSOT 機制 / 邊界案例 scope default 詳展 |
| `story-baseline-registry.json` | Anti-drift registry — stories wrap 既有 primitive 的 machine-readable canonical archetype(hook `check_story_invariants.sh R8` 讀)|
| `story-baseline-registry.schema.json` | Story baseline registry 的封閉 JSON Schema |
| `ssot-consultation.md` | SSOT 消費完整對照表 |
| `ssot-index.md` | High-risk interface ownership map(propose 前 grep 找 owner) |
| `structural-token-retention.md` | 6 類結構性保留 token canonical(audit Dim 48 triple-verify) |
| `tailwind-gotchas.md` | Tailwind v4 / tailwind-merge 技術陷阱深展 |
| `ui-dev-rules.md` | flex slot 幾何 / 數值前先查 / Padding 三層 / Icon size 三類 |

## 這裡**不收**(反例 + 正確去處)

| 疑似要放這但其實不是 | 正確去處 | 為什麼 |
|---------------------|---------|--------|
| **單一元件**的設計 canonical judgment(non-programmable)| `spec.md` 或 `packages/design-system/ds-canonical/rules/*.md` | 元件/模式語意進 spec,跨單元 path-scoped 規則進 canonical rules。AI 做產品時**必讀** spec,不會必讀 references。**跨元件互動 canonical 是例外**(見上方 2026-09-26 更正):owner 在本目錄,元件 spec 放指標 |
| 實作值 / 計算公式 | tsx / cva / CSS | programmable rule 進 code |
| 跨 session 狀態 | `memory/` | references 不是 state 檔 |
| 多步驟 workflow + checkpoint | `packages/design-system/ds-canonical/skills/` | skill 管 workflow,reference 是 skill 按需讀的；provider skill home 只是 generated discovery view |

## 新 reference 的 criteria

1. **Audit / skill 按需查的 lookup data**(表格 / 詳細對照 / 反例清單)
2. **不含單一元件的 canonical judgment**(那在該元件 spec / `packages/design-system/ds-canonical/rules/*.md`);**跨元件互動 canonical 例外**,條件是各元件 spec 只放指標指回來、不得另抄一份(2026-09-26 更正)
3. **被 ≥ 1 skill / AGENTS.md / spec cite**(orphan file 不收,定期 prune 會 retire)

## 2026-04-24 Lesson

前曾把 canonical judgment(24px threshold / disabled state 策略 / primitive exposure 3 題)錯搬到 references,違反 2-home 架構(spec 該是 canonical home 讓 AI 做產品時讀)。Restored 回 spec。references 當時嚴格只收 agent-use lookup。

**2026-09-26 補**:這條 Lesson 管的是**單一元件層級**的判斷(上面三個例子都只屬於一個元件或一個 primitive)。跨元件互動 canonical(hit-area / focus / keyboard-model / drag)不在此列 —— 它們沒有「該回去的那個 spec」,owner 就在本目錄,見上方更正。
