# Checkpoints — MUST ASK 時機(skill 內的 user 決策點)

5 個不可略過的 checkpoint。past 失敗都因 AI 自行決定了該問的事。

---

## Checkpoint 0 — Problem framing(Phase 0 後)

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

**絕對不可**:
- ❌ 跳過 framing 直接開始 benchmark
- ❌ 假設 user 的 primary user persona(沒問就 "general user")

---

## Checkpoint 1 — Research scope(Phase 1 後)

**格式範本**:

```
📊 Phase 1 Benchmark Scan(5+ 家)

| Reference | Approach | Key mechanics | Screenshot |
|-----------|----------|---------------|------------|
| Linear    | ...      | ...           | link       |
| Stripe    | ...      | ...           | link       |
| Notion    | ...      | ...           | link       |
| ...       |          |               |            |

上面 N 家研究足夠嗎?
(a) 足夠,進 Phase 2 評估
(b) 還想加:___ (指定 tier / 產品)
(c) 對整個 Phase 0 framing 重新思考
```

**絕對不可**:
- ❌ 只掃 3 家同 DS 就收工(違反 benchmark-sources.md「至少 5 家跨 tier」)
- ❌ 直接跳 Phase 2(user 未確認 research 代表)
- ❌ 抓 demo video / 口述而非 screenshot 或 link(失真)

---

## Checkpoint 2 — Shortlist decision(Phase 2 後,最關鍵)

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

**絕對不可**:
- ❌ AI 自己 shortlist 不問 user(user 最終 accountability)
- ❌ 跳過 8 分以下 candidate 的 drop 說明(記入 notes.md 是學習價值)
- ❌ 擅自「混搭」而沒 surface 為新選項

---

## Checkpoint 3 — 新元件 / primitive 需求(Phase 3 中)

若任一 candidate 需要**新 DS 元件或 primitive**,必 pause:

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
- ❌ Phase 3 階段偷偷 add 到 Components/(違反 CLAUDE.md 規則分層)
- ❌ 不 surface 新元件需求(stakeholder 看不到成本)
- ❌ 混「新 primitive」與「新 variant」(前者 promotion 門檻高,後者在既有元件加)

---

## Checkpoint 4 — Final decision & graduation(Phase 4 後)

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

## Checkpoint 5 — Cleanup(Phase 5)

決策定案後整理:

**格式範本**:

```
🧹 Phase 5 Cleanup

採用:Linear Quick-Filter → 已 graduate 到 Components/ 下 ... (或 App-level UI)

其他 candidate 處理:
(a) Stripe Step Wizard → 移 explorations/_archive/(有未來複用潛力)
(b) Notion Command Palette → 刪除(新元件成本高,短期無計畫)

exploration notes.md 更新最終決策理由。

確認?
```

**絕對不可**:
- ❌ 自動刪除未採用 candidate(user 可能有未來計畫)
- ❌ 不更新 notes.md 最終決策記錄(未來會忘記為何沒選)

---

## 歷史 failure mode(作為 anchor)

(此 skill 首次建立,尚無 failure 紀錄。將來 skill 使用後踩坑記入此處,如 `design-system-audit` 的 checkpoints.md 歷史段落。)

**預期常見失敗**(前人經驗 + 其他 skill 類比):
- Checkpoint 2 skip:AI 挑 2 個 shortlist 後發現方向錯要從頭
- Checkpoint 3 忽視:新元件偷偷進 Components/ 污染 DS
- Phase 1 淺:只掃 3 家同 DS,Phase 2 評估失去對照
