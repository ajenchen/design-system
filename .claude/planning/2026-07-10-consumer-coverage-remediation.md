# Consumer 治理覆蓋收官計畫(2026-07-10)

**觸發**:user 問「以後其他 Consumer 做 WM 一樣的設計,是否可以被好好治理避免不該發生的問題?你應該全盤擬訂而不是東補西補」。
**證據 SSOT**:41-agent 對抗 workflow(`wa25pz694`)把 ds問題.pdf 46 findings 歸 20 個 failure class,逐 class 查「未來 fork consumer 重犯時,現有防線會不會機械擋」,每 verdict 經獨立對抗驗證(cite 齊)。完整資料 → `.claude/logs/failure-class-coverage-matrix.json`。

## 現況總分(誠實)

| Verdict | 數量 | 意思 |
|---|---|---|
| MECHANICAL_CONSUMER | 3 | 未來 consumer 被機械擋(幻覺 layout token / 手刻 mini-table / 手刻表單驗證)|
| DS_API_FIXED | 1 | 根因已在 DS 端消除(R2 export 斷鏈;隨 beta.84 生效)|
| MECHANICAL_DS_ONLY | 1 | 只在 DS repo 有防線(SelectMenu 直用)|
| DOC_ONLY | 14 | 只有 spec 條文,機械層零覆蓋 |
| UNGOVERNED | 1 | 連條文都不在 DS(兩欄 dialog 拍板「不進 DS」→ canonical 只在 WM docs)|

**結論:user 的質疑成立** — 46 findings 的「修好」≠「被治理」;20 class 只 4 個對未來 consumer 有真保護。

## 結構性洞見(全盤,非東補西補)

1. **單一 home 收斂**:20 class 中 ~11 個的最小補法都指向同一支 `check_consumer_app_invariants.sh` r3(已 SHIP_AS_IS,改一處 → build-fork-governance 重生 → 隨發版自動進所有 fork)。這是「一個家、N 條簽名」,不是 N 個新 hook。
2. **named-import 除鏽(系統性 false-negative)**:r2/r3 多數既有 pattern 綁 `<DS\.` 前綴,fork 用 named import(`import { DataTable } from '@qijenchen/design-system'`)整族繞過 → 全部改 `<(DS\.)?X\b` 可選前綴。
3. **eslint plugin 是紙防線**:`@qijenchen/eslint-plugin-design-system` 未發佈 npm(404)、fork 零消費 → 其 4 rules 對 consumer 貢獻 = 0。發佈 + wire 進 template CI 是「editor+CI+write-time 三處防線」宣稱兌現的前置條件(roadmap 方向 4)。
4. **判斷類不硬 regex**:spacing tier 選擇 / hug-fill 語義 / search 業務-工具判定屬 context judgment — 硬寫 write-time regex 會誤殺;歸 audit dim(product-ui-audit)+ spec,只把「可簽名化的半邊」上機械。
5. **治理自我打架修正**:fork 照 spec 手寫 `h-6 mx-1` divider 正解會被 magic-number hook 誤攔(懲罰正解、放行違規)→ 需豁免 `<Separator/ButtonDivider>` 行的 mx-1。

## 已落地(2026-07-10 本 session)

- ✅ C3 手刻 menu-item 可點列:**根因先修**(MenuItem `startContent` slot,佔位=startIcon 同容器)→ WM 左 rail 改包 MenuItem → r3 加 nav-row 簽名(hover+selected 成對 + 可點,test 27-30)。順序 = matrix 教訓「先給合法替代再上攔截,否則 brick fork」。
- ✅ 2 個 stale 治理描述修正(fork-hook-classification:ds_anchor「soft」→ P0 / known_coverage_gaps R9 過度宣稱)。
- ✅ **批次 A 第一波(test 46/46)**:r3 加 C5 對比配對 / C18 計數串接(children 錨定,aria 層不誤殺)/ C17 divider 幾何 / C20 裸 underline / C10 search-right / C11 dialog 雙 X(250 字窗,BSD grep 255 上限)/ C12 Field 硬寬 ×7 簽名;**named-import 除鏽**(r2 HIGH_RISK + r3 具名元件 pattern 全改 `<(DS\.)?`;r1 Pattern-4 mass-hand-mock 計數器**刻意不動** — 改可選前綴會把 consumer 自有 PascalCase 元件全算進去 = false-positive 爆炸);opacity hook 第 10 類幻覺 state 尾綴(hovered/actived/focussed/pressed,實測 DS 真尾綴只有 -hover/-active/-selected 家族);magic-hook divider 行豁免(治理自我打架修正,Separator/ButtonDivider 行的 canonical mx-1 不再被攔)。
- ✅ codex 最強模型強制 codify(task #102):禁 `-c model_reasoning_effort` 降檔,config.toml(最強 + xhigh)= SSOT;memory Rule 3 + SKILL B.0 + brief template 三處同步。

## 批次 A 殘項終局處置(2026-07-10 同日收官,user「不留任何待辦」directive — 原 blocked-on-design 4 項全數處置完畢,見 failure-class-registry 各 row 終態)

- **C16 恆-edit cell**:regex 設計撞真反例 — WM MembersTab RoleCell(`cell:` 渲染 `<Select variant="naked">` 無 editable/onCellCommit)是 2026-07-08 **拍板核可的 canonical**(cell-registry SelectCell),簽名無法與違規(WorkItemTable 恆-edit StatusCell)區分 → 需更利的 invariant(候選:story-baseline-registry antiPattern 條目 + audit dim 而非 write-time regex)。
- **C8 頁內 h2+TabsList**:合法 standalone Tabs 頁存在,「手刻 pane header + tabs」vs「正當 section tabs」邊界需 header-canonical W4 錨定的簽名設計,倉促上 = 誤殺。
- **C13 可收合 section header**:DS 無 SectionHeader primitive(R3-7 拍板留 WM 客製)→ 無合法替代就上攔截 = brick fork(C3 同款教訓)。前置 = 先拍板 DS 要不要收這個 primitive。
- **C14 avatar row-context**:前置 = PersonValue/PersonDisplay 尚未 export(R2 同類 DS 缺口),先補 export 才有正道可指。

## 隊列終態(2026-07-10 全數處置;原文保留作 audit trail)

**1-11+13-14+17 = 全落地**(r3 簽名 ×10 + tabs 半邊既有 P0 + opacity 第 10 類 + 除鏽 + harness case + dim 91);**判斷類歸位** = C8/C14/C15/C16 的 context-判斷半邊入 registry judgment + auditDim(regex 不可判有反例實證,硬上 = 誤殺);**12 後半(r3 整檔複查)明確不做** — r3 是 PreToolUse,整檔複查會在編輯舊檔任意行時被歷史違規卡死(ratchet-hostile,r1 是 PostToolUse catalog 特例才可行);**15(eslint 發佈)併入 #104 發版口令**(對外 publish 動作,與 beta.84 同一 gate);**16 已拍板組合非元件**(overlay-surface canonical + r3 C19)。

## 原待辦隊列(audit trail)

**批次 A — r3 簽名擴充**(全走已 SHIP 通道,每條帶 test + fork regen;P0 + per-line escape per 2026-05-27 doctrine):
1. C5 對比配對:`text-white` × 深字桶 hue `bg-[var(--color-(yellow|amber|orange|lime)-N)]` 同段 → 指 CAT_SOLID(hue 清單由 categorical-color.ts 機械生成,M17)
2. C16 恆-edit cell:`cell:` render 出 `<(DS\.)?(Select|Input|…)` 且整檔無 `editable|onCellCommit` → 指 data-table.spec.md:373;+ registry antiPattern 雙保險
3. C18 count 串接:`${label} (${count})` 兩形 regex → 指 item-anatomy.spec.md:176
4. C17 divider:`<Separator orientation="vertical"` 無 `mx-` → 指 ButtonDivider / h-6 mx-1;**同步修 magic-hook mx-1 打架**
5. C20 裸 underline 連結:用 verifier 修正版 regex `className="([^"]* )?(hover:)?underline( [^"]*)?"`(no-underline 不誤殺)→ 指 color.spec.md:195
6. C10 search-right:spacer/ml-auto 在 `placeholder="Search` Input 前 → 指 action-bar.spec.md:69/76(escape `@search-right-ok:` 工具 search 合法)
7. C11 dialog 雙 X / header 操作不走 actions slot 簽名
8. C12 Field family 硬寬:`<(DS\.)?(Select|Combobox|DatePicker|PeoplePicker)` + `w-(\d+|\[Npx\])` 雙條件(禁裸 `w-\d+` 全域攔 — icon sizing 誤殺)
9. C13 可收合 section header 簽名(flex justify-between + Chevron toggle 無 token)
10. C14 avatar row-context 直用簽名;+ **PersonValue/PersonDisplay export 缺口**(consumer 想守鏈 import 不到 = R2 同類,需 DS export)
11. C8 頁內 h2+TabsList → 擴 check_tabs_content_chrome_body_double_gap.sh ROOT_SIG
12. 系統性:r2/r3 全 pattern `<DS\.` → `<(DS\.)?` 除鏽 + r3 仿 r1 補整檔複查(fragment-split 繞過)
13. C1 姊妹簽名:`hover:bg-neutral-hovered` 類幻覺 semantic utility → check_opacity_token_usage 第 10 類(allowlist 自 semantic.css 生成)
14. C15 harness 補 MINI_TABLE 簽名 violation case(防 R4 分支 regress 靜默)

**批次 B — 基建前置**:
15. 發佈 eslint plugin + wire 進 template(方向 4 trigger;發佈前 plugin rules 對 consumer 零效)
16. C19 兩欄 dialog:拍板題 — (a) 實作 DialogSplitBody API(根治,升 DS_API_FIXED)or (b) 只上 r3 簽名。原拍板「不進 DS」導致 canonical 無家 → 建議 (a) 重議。

**批次 C — 常設閘(治理的治理;稽核確認基本原則)**:
17. `failure-class-coverage-matrix.json` 升 registry:新增 `scripts/audit-failure-class-coverage.mjs --check` — 每 class 必為 {MECHANICAL_CONSUMER, DS_API_FIXED} 或帶 documented JUDGMENT rationale + audit-dim pointer,否則 exit 1;wire 進 deep-audit 為新 dim(91)+ release preflight。**這條 = user 說的「建立治理的基本原則」機械化**:以後每抓一類新 failure,registry 加 row → 閘強制它終須有防線,deep-audit 每輪自動驗。

## 驗收條件

批次 A 每條:hook test 場景(positive/negative/escape)全綠 + `test-fork-governance.mjs` PASS + `build-fork-governance.mjs --check` 綠。批次 C:audit-coverage-matrix.mjs --check 含 dim 91 綠。全批完成後重跑 20-class matrix workflow → 目標 DOC_ONLY ≤ judgment-only 殘量、UNGOVERNED = 0。
