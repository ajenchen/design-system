<!-- Authority/status: governance/planning/registry.json -->
# 多包 / 多步工作流程 v7 的證據(2026-11-28)

> 用途:`packages/design-system/ds-canonical/rules/work-process.md` v7「適用」段補的那半句(待辦只住 `governance/backlog/`,交接資料夾只寫 BL 編號)的出處,加上這次搬遷的對照帳。只當出處,不是規則;流程只住在那一檔,待辦只住 `governance/backlog/items.json`(第 3 節「本機查不到現況」那一批由 BL-035 追蹤)。
> 證據類別:實測事故 —— 同一件 user 交代的事在換交接資料夾時遺失兩次,是 user 指出的。不是同任務對照,也沒有花費量測。

## 1. 「表格一次到位升級」兩度遺失

- user 2026-09-05 交代(原話逐字收在 `governance/backlog/items.json` BL-011 的 `source`),到 11-17 才第一次寫進交接追蹤檔(舊列 `tmp/wip-2026-10-13/batch1-2026-11-10/handoff-2026-11-12/OPEN-ITEMS.md` A101)。
- 11-25 開新交接資料夾 `tmp/wip-2026-11-25-backup/` 時沒有搬過去;11-28 user 追問才找回。user 原話(逐字,2026-11-28):「Table優化的部分肯定有，之前在其他session就有明確要你列成待辦，而且上一次你也是忘記你有列過，你他媽到底把它放到 repo 哪裡去？是否有一堆東西都是這樣？」(同句也錨在 `governance/memory/feedback_propose_discipline.md` Sub-rule 9)。
- 根因(協調者查證,AI 推導):repo 沒有「待辦唯一住處」的規定,也沒有任何檢查;每批在 git 不追蹤的 `tmp/` 自開清單,換資料夾時沒有搬遷核對。`work-process.md` v6「適用」只說交接夾放狀態與指向,但 repo 沒有待辦正本可以指向。

## 2. 收攏前的住處盤點(11 處 + 規格段落)

| # | 住處 | 收攏後 |
|---|---|---|
| 1–6 | `tmp/` 交接夾:MASTER-TODO、OPEN-ITEMS、`TRACKER.md` ×2、`notes/todo-consolidated-2026-11-28.md`、NEXT-SESSION(git 不追蹤) | 未結項查證後搬進正本;之後只寫 BL 編號 |
| 7 | `governance/planning/user-directed-backlog.md`(active) | 檔案移除、registry 拿掉;U1–U5 → BL-011 / BL-005 / BL-004 / BL-006 / BL-001 |
| 8 | `governance/planning/2026-09-25-interaction-and-hover-remediation.md`(active) | 改 reference,檔頭列對照 |
| 9–10 | `governance/planning/m22-citation-backlog.md`、`.claude/tracker/m22-citation-backlog.md` | 檔頭指向 BL-025 |
| 11 | `.claude/logs/dim74-overlay-backlog.md` | 檔頭指向 BL-026 |
| 規格 | calendar / data-table / date-picker / sidebar / tooltip / header-canonical 六份規格的「待定 / 待 user 決定 / 待決」 | 句子留在規格、帶 BL 編號(BL-004 / 029 / 027 / 002 / 003 / 028);chart、token-system 兩句是已定案的歷史敘述、color 一句是禁令,列進 `scripts/backlog.mjs` 允許清單 |

收攏後:正本 1 處(`governance/backlog/items.json`)+ 產生的視圖(`user-view.md`)。

## 3. 搬遷紀錄(user 2026-11-28 14:3x「確保那些待辦都是有查證過確認在當前狀態下依然是真的問題就好」)

每一項都在 a3330afe 查證;仍成立的才搬,證據寫在該項的 `evidence`。對照:

- **todo-consolidated 組 → BL**:2 → BL-012;3 → BL-013;6 的 T1 → BL-014;14 → BL-015;15 → BL-016;17 的 R37 / R85 → BL-017;18 的 R60 → BL-018;19 → BL-004;20 → BL-005、BL-006;21 → BL-007;22 的 T9 → BL-020;23 → BL-021;25 的 R67 → BL-019;29 → BL-022;30 → BL-030;31 → BL-001;32 → BL-010。
- **remediation(09-25)→ BL**:L11 / R94 → BL-006;N24 → BL-008;OD2 → BL-009;Q2b / N25 → BL-011;Q4a → BL-023;R1b-DT4 / DT6 → BL-024;K8 → BL-025;OD1 → BL-029;N79 → BL-022。
- **舊 OPEN-ITEMS(`notes/migration/open-items-carryover.json`,另一位對帳者對 a3330afe 判定)**:只記 37 條 → BL-031(T5 防線 2)、BL-032(AI 自查尾巴 32)、BL-033(user 已決定維持 2)、C9 → BL-023;A36 → BL-034(本版已做);已解 47、已在新表 5、已在正本 7 不搬。

**沒搬的(逐條理由)**:

- 已修 / 已定(HEAD 查得到):R1b-DT1(data-table.tsx 已無 `group-focus-within`)、R1b-DT3(簽名 class 0 筆)、R1b-DT8(focus-canonical 那一列已不在)、G13(avatar-anchor-box-invariant.mjs:164 已有 coverageControl)、OE27 / K3b(select.tsx 那句「另案」註解已不在)、N75(steps.spec.md:217 已有 `readOnly`)、J(OE21)、N12(a)、A17(已決或已出貨)。
- 前提已不在:N73(steps.spec.md:62 / :217 內容已換,原矛盾不在)。
- 本機查不到現況(要 CI / 排程 / 瀏覽器 / 外部讀回;整批由 BL-035 追蹤,查證後逐條收進正本或結案):組 1(R97、R105、R86、R44)、組 4(R59、R81、R47、R19、F-f、H10 後半)、組 5(T17、E7)、組 6 的 R102、組 7(R77)、組 8(R103、T12)、組 9(R91)與 Q3c、組 10(R98、R99)、組 11(R68)、組 13(D1–D3)、組 16(R72b、R76)、組 17 的 R78 同族掃描、組 18 的 R92、組 22 的 T3 / T8 / T10、組 24(R20、F-i、F-h、T7(b)(c)、B3)、組 25 的 R69、組 26(B6(b))、組 28(R16、R43、C6、T20(2));remediation 的 R1b-DT2(person-display.tsx 已不在原路徑)、DT5、DT7、FN1b、K5、Q4b、Q5、R1f、G1、G2、G9 補丁、N74、N76、N77、N85、OE28、OE32、OB1–OB3、N41。
- 現況成立但不是問題(AI 推導未實測或條件未觸發):組 12 E4(typography.css:81 日文字型排在 :85 中文前面,「Windows 用到日文字形」未實測)、組 22 的 T5(npm 仍是 11.19.0,升 12 才觸發)、組 27(T13、T15、T16、R28、R95、H37 殘留)、組 29 的 T7(a)(可選)。
- 不是待辦:N1(F6 區段鍵,AI 推導的點子)、N78、N80(記錄)。
- user 說先不做(只記錄、不問):A19「可以先不管嗎？」、N5、N28「logo先不做聆聽,其他可以」、N29「1.我覺得先不動」。

## 4. 為什麼寫進 work-process.md「適用」,不另立規則檔

- `work-process.md` 檔頭:多包 / 多步工作怎麼走只寫在這裡、每次對話都載入;交接資料夾該放什麼本來就寫在「適用」段,這次只補「待辦不放交接夾」。
- 待辦本身的規則(欄位、去重、查證、視圖)住 `governance/backlog/README.md`,由 `scripts/backlog.mjs`(governance:check 的 backlog stage)與 `enforce_home_charter.sh`(寫入當下)守;本檔不重述。
