<!-- Authority/status: governance/planning/registry.json -->
# governance/planning/ Charter

## 權威模型

本目錄同時保存 active plan 與歷史 decision record，但只有 `registry.json` 中
`status: active` 且 `executable: true` 的文件可作為執行軌道。`awaiting-approval` 只可
用於 genuine product／UI／UX SSOT 的 P2H 取捨，且必須等 user 明確拍板；純工程／治理
plan 不得使用此狀態。`reference/completed/rejected/superseded` 一律不能被模型自行重啟。

`node scripts/validate-planning-registry.mjs` 會驗證 registry 與實際檔案 exact inventory、狀態/可執行
布林、完成/拒絕檔名、regular-file/no-symlink 與每份文件的 registry pointer。新增 plan 但漏登記會直接失敗。

## 這裡**不收**(反例 + 正確去處)

| 疑似要放這但其實不是 | 正確去處 | 為什麼 |
|---------------------|---------|--------|
| 已開工且 in-progress 的 task | `TaskCreate` / TaskList(session-local)+ commit progress | planning 是 spec,不是 progress tracker |
| 設計 canonical judgment | `spec.md` | 已執行的 canonical 不該寄生 planning |
| 跨 session feedback / 用戶偏好 | `memory/` | memory 管 preferences,planning 管未來 tasks |
| 單次探索思考 / 過程紀錄 | commit messages / memory | planning 是定稿 execution plan,非思考 scratch |

## 新 planning 的 criteria

1. **Scope ≥ 1 day focused work**(小任務用 TaskCreate 或直接 commit)
2. **有明確 phases + deliverables**(否則是 wish-list,不該存)
3. **明示可驗證 start trigger**(dependency / hard gate / standing authorization；只有
   genuine product／UI／UX P2H 才以 user exact decision 作 trigger)
4. **成功 criteria 清楚**(做到什麼算 done)

## Memory vs Planning 分工

- **Memory**(`governance/memory/`)- pointer 指向 active planning doc + 1-line summary；Claude home 只是 cache
- **Planning**(本 dir)- 完整 spec / scope / phases / deliverables

Rationale:memory 會被 MEMORY.md 行數 cap 約束,planning doc 存 git 永久在。**冗餘一層**,防 AI forget。

## Plan 完成後處理

- **執行中 key learning** → session 結束 commit 到 planning doc(append「Execution notes」節)
- **完成後**:rename `plan-foo.md.completed.YYYYMMDD.md` 歸檔 OR retire(視是否再參考)
- **放棄**:rename `plan-foo.md.rejected.YYYYMMDD.md` + 寫 rejection rationale + **首段 H1 加「— REJECTED YYYY-MM-DD」suffix + 第一段顯式列「禁止重啟」+「正確 anchor」**(2026-05-09 加嚴 — 過往 rejected plan doc 只 status 標記不夠強,AI 會把當作 "PLANNED future plan" 重提;rename + H1 suffix + 禁止重啟 三層才能阻止鬼打牆)
- **M29 Anchor Preflight 補充**:做 cell / Field / DataTable 視覺結構 propose 前必 grep `*.rejected.*.md`,若命中 → 該 plan 是已 reject 路徑,不可作為 candidate option
