# Checkpoints — authority-classified audit decisions

只有真正未解的產品／UI／UX SSOT 取捨才是 user 決策點。治理、架構、security、
release、provider、migration、環境修復與其他工程決策依 canonical Standing
Authorization 自主處理；milestone、triage、review 與外部寫入都不是 approval
checkpoint。以下各 checkpoint 皆受此 authority classifier 約束。

---

## Checkpoint 1 — 稽核完畢後的 Triage receipt（每次 run 都會觸發）

稽核結果出來後先分類並保存 evidence；P0/P1 與所有工程 P2 依 frozen scope
連續 remediation，只有產品／UI／UX P2H 才 batch-at-end 請 user 決定：

**格式範本**：
```
🔍 稽核結果彙整

P0（自動修，無 scope 爭議）: N 項
- cva 三方漂移: X 處
- SSOT dead link: Y 處
- Tailwind v4 grep 違規: Z 處
- 硬寫 color 值: W 處

P1（批次修 + review）: M 項
- Rule A 文字品質違規: A 處
- Story 人話範例違規: B 處
- shadcn passthrough 缺失: C 處
- Anatomy 缺 section: D 處
- a11y aria-label 缺失: E 處

P2H（產品／UI／UX SSOT 真取捨）: K 項
1. [finding 1 的 user-visible trade-off] — 選項 A / B / C
2. [findings 2]

執行:
1. P0/P1/工程 P2E 依 Standing Authorization 自主修復與驗證
2. P2H 只在證據收斂後仍有真實產品選擇時批次提出
```

**絕對不可**：
- ❌ 跳過 triage evidence
- ❌ 把 P2H 當工程 P2E 執行
- ❌ 僅報總數不提供 file:line 讓 user 掃
- ❌ 用 triage receipt 要求 user 核准工程執行順序

---

## Checkpoint 2 — 稽核發現 canonical rules 沒覆蓋的 pattern

若新 pattern 會新增產品／UI／UX semantics，且存在多個可行 user-visible 方向，才
pause。若只是補足 engineering invariant、security、test、provider、release 或
governance coverage，agent 依 evidence 自主選定 canonical owner、寫入並生成 adapters：

**觸發情境**：
- a11y audit 發現 7 個元件無 focus-visible，但 canonical rule/spec 沒明訂 focus ring 規則
- Token audit 發現一個新 color 硬寫模式反覆出現
- shadcn passthrough 發現 `displayName` 以外另一種 anti-pattern

**格式範本**：
```
🔔 Audit 發現 canonical rules 未覆蓋的 pattern:

Pattern: [描述]
頻率: 出現在 X 個元件
Root cause (推測): [判斷 why 發生]

建議新增到 canonical owner 的規則:
「[draft]」

放哪一節 (按「規則分層」判斷):
- 若跨元件 → `packages/design-system/ds-canonical/rules/ui-development.md` / `spec-rules.md` / `story-rules.md`
- 若技術陷阱 → # 失敗記憶索引 + 根原位置 section
- 若純風格 → # 命名與語言一致性

若屬 P2H，你決定:
(a) 採用此 draft，我寫進上述 canonical owner，之後由 adapter 重建 provider view
(b) 修改措辭: ...
(c) 不新增,遇到再 case-by-case 處理
```

**絕對不可**：
- ❌ 直接寫新規則進任何 generated provider instruction/view
- ❌ 忽視 pattern 只修個別違規
- ❌ 把純工程新 invariant 冒充 user 產品決策

---

## Checkpoint 3 — 產品語意分類模糊（Internal vs Components）

只有 classification 會改變 public product／UI semantics 且 precedent 無法唯一收斂時
才詢問。Canonical file ownership、pointer、generator 與其他工程 SSOT ownership
由 agent 自主收斂：

**觸發情境**：
- 新元件的 Storybook title 應該放 `Components/` 還是 `Internal/`？
- 兩個元件互相比較，誰 own 完整對照、誰寫 pointer？
- 某 token 該歸類為 primitive 還是 semantic？

**格式範本**：
```
🤔 Classification 需要決定:

問題: [element / rule / token 是 A 還是 B?]

判斷依據:
- Canonical rule/reference「{判斷 test 的位置}」第 X 題: [...]
- 相似 precedent: [已分類的類似案例]

兩個選項的 trade-off:
選 A (...) → 優: [...] 缺: [...]
選 B (...) → 優: [...] 缺: [...]

我傾向 B 因為 [...]。此選擇會改變 user-visible semantics，需要你決定。
```

**絕對不可**：
- ❌ 憑感覺分類
- ❌ 用元件名稱 (HoverCard「看起來」公開) 分類
- ❌ 未查既有 precedent

---

## Checkpoint 4 — Cross-cutting engineering refactor receipt（影響 > 10 檔）

若修復涉及大量檔案的 mechanical 改動，agent 自行決定 batching、commit topology、
rollback 與驗證。這是可審查的 execution receipt，不是 human approval gate：

**觸發情境**：
- Helper function extraction 影響 41 個 anatomy files
- Token rename 影響 71 個 utility 使用
- Spec schema 改動影響所有 spec file 結構

**格式範本**：
```
⚠️ 大範圍 refactor 提議:

異動: [描述]
影響範圍: X 個檔案
風險:
- [風險 1]
- [風險 2]
回復難度: [rebase 難度]

執行方式:[agent 選定的唯一方案與依據]
Rollback:[具體 recovery]
Verification:[focused + affected Harness]
```

**絕對不可**：
- ❌ 直接跑 mechanical find-replace 不 preview
- ❌ 無 recovery／verification 就做大範圍改動
- ❌ 要求 user 替 agent 選 commit 或 migration 策略

---

## Checkpoint 5 — 環境 / 建置工程處理

稽核過程若遇環境問題（node_modules 壞、storybook 啟動失敗、tsc 報不相關錯），
先證明因果與 scope，再以 least-privilege、可回復方式自主修復或隔離；只有
login/MFA/OAuth/owner/billing、缺 secret reference 或額外付費才形成 human action：

**格式範本**：
```
⚠️ 環境 / 建置問題（非本 audit 引入）:

現象: [描述]
影響: 我無法 [verify X]
是否本 audit 引入的?  確認不是 (理由: git log / file touch 證實)
處理:
- 可在 frozen scope 內修復 → 自主修復後重跑受影響 checks
- 與 scope 無關 → 保留 evidence，使用仍可信的替代 guard，不擴張 scope
- 平台不可代理 → 只列唯一必要 human action，完成後自行 readback
```

**絕對不可**：
- ❌ 未證明 root cause 就破壞性重裝
- ❌ 編輯無關檔案「順便修」
- ❌ 把可自行處理的環境工程工作轉交 user

---

## Checkpoint 6 — 發現 spec 與 code 衝突

先用 owner、history、tests、runtime evidence 與產品 requirement 判定。若證據可唯一
判斷為 spec drift 或 code bug，agent 自主修正；只有兩者代表不同 user-visible
產品／UI／UX方向且無法由 evidence 收斂時才詢問：

**格式範本**：
```
⚠️ Spec 與 Code 衝突:

元件: X
Spec 說: [句子 + line N]
Code 實際: [行為 + line M]

誰對?
- 若 Code 是 "後來 fix 的對的版本"：Spec 過時，需要更新
- 若 Code 是 "bug 未修"：Code 要改
- 若 Code 和 Spec 都錯：需討論正確做法

我的判斷: [分析]
若仍為 P2H: [兩個 user-visible 選項與唯一建議]
```

**絕對不可**：
- ❌ 無 evidence 憑直覺選一個修
- ❌ 改 code 前未讀 git log 看是否刻意改動
- ❌ 已可由 canonical evidence 收斂仍要求 user 做工程判斷

---

## Checkpoint 7 — 「先不管」vs tech debt 語意區分（user directive）

User 不同用語表達「現在不做」,語意差別明顯,處理方式不同。**本 checkpoint 是 canonical Skill 層 SSOT**(對話 protocol 屬 skill,非 shared bootstrap 層):

### 語意對照表

| User phrasing | 語意 | 處理 |
|--------------|-----|------|
| 「先不管」/「這個先跳過」/「不要追蹤」/「算了」 | **完全忽略,不進任何 tracking** | 不寫進 memory、不加進 失敗索引、不在下次 audit 提及。就當沒這件事。 |
| 「之後再處理」/「先記下來」/「下次做」 | **Park 為 tech debt** | 寫進 `memory/project_audit_progress.md` 「仍待未來處理」區,下次 audit 會 surface |
| 「做完」/「繼續」/「執行」/「馬不停蹄」 | **立刻處理** | 進 TaskList,執行完 mark completed |

### 判斷法

看 user 語氣傾向:
- **明確否決這件事不重要** → 完全移除 tracking
- **表達現在沒時間但該做** → tech debt
- **表達立刻做** → execute

### 禁止混用

將 user 的「先不管」當作 tech debt 記下來,下次 audit 又提 —— 違反 user 意圖,製造雜訊。

### 範本

當 user 在 Checkpoint 1 triage 或討論 P2 時表達「先不管」:

```
✓ 了解,先不管「{item}」。
   完全不寫進 memory tech debt / 失敗索引 / 下次 audit。
   當沒這件事。
```

### 歷史

2026-04-18 session:user 對 icon micro tier(Tag dismiss X ratio)+ checkbox checkmark
 自繪說「先不管」。AI 最初差點寫進 memory tech debt,經 user 再次提醒「先不管就是完全不用理他」才移除。
