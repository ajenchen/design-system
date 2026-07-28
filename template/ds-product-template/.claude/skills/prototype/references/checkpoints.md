# Checkpoints — authority-classified product decisions

只在真正產品／UI／UX SSOT 取捨時 MUST ASK。Research、工程成本評估、報告、milestone
與 cleanup 都是 evidence receipts，不得升格成 user engineering-decision gate。

---

## Checkpoint 0 — Problem framing(conditional P2H)

**格式範本**:

```
🎯 Phase 0 Framing(請確認)

問題:{1-liner 重述 user 需求}
Primary user:{persona}
Jobs-to-be-done:{具體動機}
Constraints:{mobile? a11y? 時程?}

對嗎?
(a) 對,進 Phase 1 benchmark
(b) 以下需修正:...
(c) 情境不同 — 改: ...
```

若 user requirement 已清楚提供 persona/JTBD/constraints，以上內容是 readback receipt，直接
進 Phase 1；只有 framing 會導向不同產品行為且無法由現有 evidence 決定時才詢問。

**絕對不可**:
- ❌ 跳過 framing 直接開始 benchmark
- ❌ 假設 user 的 primary user persona(沒問就 "general user")

---

## Checkpoint 1 — Research evidence receipt(非 human gate)

**格式範本**:

```
📊 Phase 1 Benchmark Scan(5+ 家)

| Reference | Approach | Key mechanics | Screenshot |
|-----------|----------|---------------|------------|
| Linear    | ...      | ...           | link       |
| Stripe    | ...      | ...           | link       |
| Notion    | ...      | ...           | link       |
| ...       |          |               |            |

依 canonical benchmark coverage 與 evidence quality 自主判定是否足夠；達標直接進
Phase 2，未達標自行補足。若研究揭露新的產品 framing 真取捨，回 conditional
Checkpoint 0。
```

**絕對不可**:
- ❌ 只掃 3 家同 DS 就收工(違反 benchmark-sources.md「至少 5 家跨 tier」)
- ❌ 用 user confirmation 代替 research coverage/evidence 判定
- ❌ 抓 demo video / 口述而非 screenshot 或 link(失真)

---

## Checkpoint 2 — Shortlist product decision(conditional P2H,最關鍵)

**格式範本**:

```
🏆 Phase 2 Evaluation

{評分表,per evaluation-matrix.md 格式}

候選排序:
- ★ Linear Quick-Filter(14/15)
- ★ Stripe Step Wizard(12/15)
- ☆ Notion Command Palette(11/15 邊界)
- ✗ Atlassian Bulk Popover(8/15 drop 建議)

你決定 Phase 3 做哪 2-3 個?
(a) 採 AI 推薦:Linear + Stripe(2 個)
(b) 採 Linear + Notion(混 high + 邊界)
(c) 3 個全做(含 Notion 邊界 candidate)
(d) 混搭:Linear 的 interaction + Stripe 的視覺 = 候選 D
(e) Phase 2 評估偏誤 — 重新評估: ...
(f) 直接 drop 全部 — 回 Phase 0
```

只有兩個以上可行候選導向不同產品／UI／UX outcomes 時詢問；若既有 SSOT、明確
requirement 與 evidence 已唯一淘汰其他候選，記 receipt 後自主接續。

**絕對不可**:
- ❌ AI 自己 shortlist 不問 user(user 最終 accountability)
- ❌ 跳過 8 分以下 candidate 的 drop 說明(記入 notes.md 是學習價值)
- ❌ 擅自「混搭」而沒 surface 為新選項

---

## Checkpoint 3 — 新元件 / primitive 需求(conditional P2H)

若任一 candidate 可能需要**新 DS 元件或 primitive**，先依 consume-before-invent、
public/internal 與 promotion evidence 判定。只有 composition 與新 public semantics
皆為可行且代表不同 UI/UX outcomes 時才 pause:

**格式範本**:

```
⚙️ Phase 3 候選「Notion Command Palette」發現新元件需求

需要新元件:CommandPalette(全站 Cmd-K query 浮層)
現有相關 primitive:Command(cmdk 搜尋,內建於 SelectMenu);Dialog(modal 容器)

可能路徑:
(a) CommandPalette 是「Dialog + Command」的 composition,**不需要新元件**,
    建成 explorations/ 內 composition,採用後由 consumer 組合
(b) CommandPalette 升級為 Components/ 新元件(若跨 candidate / 未來其他場景也需)
(c) 不做 Notion candidate — 從 shortlist drop

你決定?
```

**絕對不可**:
- ❌ Phase 3 階段偷偷 add 到 Components/(違反 shared governance 規則分層)
- ❌ 不 surface 新元件需求(stakeholder 看不到成本)
- ❌ 混「新 primitive」與「新 variant」(前者 promotion 門檻高,後者在既有元件加)

---

## Checkpoint 4 — Final product decision & graduation(P2H)

**格式範本**:

```
🎨 Phase 4 Summary — 3 Candidates

## Linear Quick-Filter
- 適合:sales ops 重度 / PM bulk / support triage
- 不適合:新手 / mobile fallback 待設計
- Storybook:Explorations/Bulk Filter/Linear Quick-Filter

## Stripe Step Wizard
- 適合:destructive bulk / 合規 action
- 不適合:高頻日常
- Storybook:Explorations/Bulk Filter/Stripe Step Wizard

## Notion Command Palette
- 適合:多維 filter / 可 memory query
- 不適合:簡單情境 / onboarding 負擔
- Storybook:Explorations/Bulk Filter/Notion Command Palette

AI 推薦:Linear Quick-Filter(業務 fit 最強 + DS 一致性 100%)。
但最終 stakeholder 決定。

你 / stakeholder 決定:
(a) 採用 Linear,graduate 到 design-system/
(b) 採用 Stripe,graduate(低頻場景)
(c) 採用 Notion,討論 Checkpoint 3 新元件決策
(d) 混 Linear interaction + Stripe visual = 候選 D(新 exploration 輪)
(e) 全部不採用 — 本問題待定,保留 explorations/ 紀錄
(f) 更多輪 proposal:修改 A 的 ... / 加新候選
```

**絕對不可**:
- ❌ AI「幫 user 決定」用哪個(違反 exploration skill 精神)
- ❌ graduate 採用者但不 archive 其他(未採用也有學習價值,不可刪光)
- ❌ 跳過「為何沒採用 B / C」的 notes.md 記錄

---

## Checkpoint 5 — Cleanup receipt(非 human gate)

決策定案後整理:

**格式範本**:

```
🧹 Phase 5 Cleanup

採用:Linear Quick-Filter → 已 graduate 到 Components/ 下 ... (或 App-level UI)

其他 candidate 處理:
(a) Stripe Step Wizard → 移 explorations/_archive/(有未來複用潛力)
(b) Notion Command Palette → 刪除(新元件成本高,短期無計畫)

exploration notes.md 更新最終決策理由。

依已完成的產品決策，自主 archive/保留並更新 notes；有 unresolved future product
roadmap 取捨時才列 P2H，否則不再詢問。
```

**絕對不可**:
- ❌ 無已定產品決策或可恢復 archive 就破壞唯一候選 evidence
- ❌ 不更新 notes.md 最終決策記錄(未來會忘記為何沒選)

---

## 歷史 failure mode(作為 anchor)

(此 skill 首次建立,尚無 failure 紀錄。將來 skill 使用後踩坑記入此處,如 `design-system-audit` 的 checkpoints.md 歷史段落。)

**預期常見失敗**(前人經驗 + 其他 skill 類比):
- Checkpoint 2 skip:AI 挑 2 個 shortlist 後發現方向錯要從頭
- Checkpoint 3 忽視:新元件偷偷進 Components/ 污染 DS
- Phase 1 淺:只掃 3 家同 DS,Phase 2 評估失去對照
