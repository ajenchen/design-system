# Meta-Pattern 合併 / 降級歷史分析(從 rules/meta-patterns.md 搬出)

> 2026-11-17 knowledge-prune(A40 第 7 筆)從 `rules/meta-patterns.md` 開頭搬來,原文不改。那份檔每個 session 都要讀,這幾段是 2026-05 的歷史分析、不是規則本身;現行 `@watch` 規則仍留在 meta-patterns.md 分群表下方。數字(25 skills、本季 net add 12 等)是當時的量測,現值以 `scripts/sync-governance-counters.mjs` 與 skills 目錄實數為準。

## 2026-05-22 fold prune(原 meta-patterns.md 當時第 18 行後半)

**2026-05-22 fold prune**:M33/M34/M35 各 absorb 1 bug → folded into parent cluster home(M33→M20 / M34→M7 / M35→M23(d)),減 3 條 M-rule 同時保留全部 invariants。Velocity 修正:本季 net add 12 rules(15 new − 3 fold)= 18 → 12 趨近 charter ≤3/quarter target,持續觀察。

## Why no merge content(原 meta-patterns.md 當時第 20 行)

**Why no merge content**:per codex Q-13「Keep M24/M25 because they are sharp, reusable state/chain invariants」+ Layer A own 認 cluster headers 是檢索輔助,不該強行 merge content(各 M-rule 已 1-line tight)。Cluster headers help 「舉一反三」without 削減 M-rule 數量。**Task #19 M21-M29 meta-merge analysis(2026-05-10 closed)**:re-audit M21-M31 全部,verdict **無 merge candidate**,各 rule sharp invariant 覆蓋 distinct failure mode(M22 implement-time cite vs M26 propose-time cite / M30 wrapper-primitive 跟 M27 framework-vs-DS / M31 collab discipline 跟 M14 / M19 auto-pipeline 各 unique scope)。Cluster table 已 cross-link,不需 merge。

## 2026-05-10 skills consolidation analysis(Task #20 closed;原 meta-patterns.md 當時第 22–36 行)

**Per Anthropic「~10 sweet spot」benchmark**:DS 現有 25 canonical skills(`packages/design-system/ds-canonical/skills/` 的一層目錄,2026-07-31 inventory),約 2.5x Anthropic typical recommend。**Verdict:無 aggressive merge candidate**,維持 25 skills justified:

| 類別 | Skills | 為何不 merge |
|---|---|---|
| Core audit | design-system-audit / visual-audit / component-quality-gate / knowledge-prune | 各 sharp trigger,invoke logs 顯示高頻(design-system-audit 6 / knowledge-prune 7) |
| Domain audit | ux-audit / performance-audit / code-quality-audit / product-ui-audit | D2/D3/D4/consumer-code dim 已 chain 進 design-system-audit |
| Workflow | prototype / new-component / delivery-handoff / story-writing / story-auto-compile-migrate / bug-fix-rhythm / governance-status | create / prototype / final-handoff / story / multi-fix rhythm / read-only status 各 phase distinct |
| Discipline | ensure-canonical / propose-options / codify-principle / codify-corrections / scan-similar-bugs / governance-health | trigger phrase / 4-Q gate / 5-layer artifact gen / batch log / post-fix scan / monthly metric 各 unique |
| Review / collaboration | codex-collab / canonical-reviewer / independent-review / deep-audit-cross-codex | 一般 cross-provider synthesis / canonical-only review / product-consumer review / no-sample deep audit 的 scope 與證據契約不同 |

**Marginal merge candidate**(Backlog,不擴張目前 frozen scope):`codify-principle` + `codify-corrections` 都產 5-layer artifact,trigger 不同(live propose vs batch log)— 可合 `codify` 一統 skill。**目前不執行原因**:codex Q-13 sharp-rule preference + 兩 skill SKILL.md 各自 250 lines budget 內，尚無 evidence 顯示合併是當前 Requirement 必需。未來若進入 frozen scope，由最高 certified capability 依 evidence 作工程判斷；task／deliverable 明確要求時才加 independent review，不需 user 工程核准。

**RFC**:Anthropic「~10 sweet spot」是 typical CRUD app benchmark;DS governance complexity（active M-rules / full-dimension audit / optional cross-provider review / Level 1–9 taxonomy）justified higher skill count。動態數量以 canonical counters / inventory 為準；每 skill 都過 knowledge-prune retire rule(3 月 invoke 或 rare-event 豁免;hooks 才是 6 月 fire,SSOT → knowledge-prune/SKILL.md)。

## 2026-11-21 @watch 判定:M25 升 sharp keep、M21 併入 M18(knowledge-prune WP-META)

判法照 `prune-dimensions-d5-d10.md`「D3 補充 — @watch 判法」,在 0fec5f18 上跑 `git log 0fec5f18 --since=2026-05-15 -F --grep=<M-ID> --format='%h %s'`(起算日 = `@watch` 標記日),判準照 meta-patterns 分群表下方那句:觀察期內有沒有「新 bug 被這條吸收」。

- 對照:同一條指令換成 M37 → 63 筆,拿得到資料,下面的筆數才可信。
- **M21:6 筆,逐筆讀 commit 訊息,0 筆是新 bug 被 M21 吸收** → 降成所屬 cluster(E. Propose-time discipline)母規則 M18 的子規則。規則句、3-test、hook `check_naming_and_abstraction.sh` D.1 與第 3 欄錨例整段併進 M18 那一列(一個字都沒刪),M-rule 數 33 → 32,分群表與 counters 同一個 commit 改。
  - 38649f5a(2026-11-17):knowledge-prune 自己的 Phase 0 觀察紀錄(「M21/M25 @watch 過期」),不是 bug。
  - 35a8f948(2026-06-18):是 bug(小螢幕 Sheet 蓋住 globalHeader,primary-header 版的抽屜沒有品牌與帳號),但根因是品牌只放在被蓋住的 header;M21 只出現在修法「consume existing,M21 對齊」(重用同一組 primitive、不另做元件)—— 規則被拿來約束修法,bug 本身不是「該用 prop variant 卻拆了元件」。
  - 6967c4ed(2026-06-03 FileUpload 加 `variant` prop,「M21 prop-variant test 過」)、0c53d1b1(2026-05-21 ChromeHeader `leadingRail`,「M21 3-test PASS」)、f439b730(2026-05-17 ChromeHeader 窄 API,「M21 防 prop variant」):設計當下先跑 3-test,事前套用,沒有 bug。
  - 649ad4f1(2026-05-23 deep-audit 批次):只把 M21 等條目裡缺檔的 hook 標成 retired / 未實作。
- **M25:10 筆;扣掉 knowledge-prune 自己的 4 筆(38649f5a、e017c41c 是 2026-11-17 那一輪,5e57ff9a、82a7681e 是 2026-11-21 這一輪),其餘 6 筆逐筆讀,有新 bug 被 M25 吸收** → 去掉 @watch,升 sharp keep。
  - b0fc1b52(2026-07-18):修「短視窗清單撐破夾住的 PopoverContent、底部選項被裁」—— CommandList 的 ScrollArea 補 `flex-1 min-h-0`,「對齊 M25 canonical」:整鏈沒 forward 造成的溢出,正是 M25 的 bug 類型。
  - 9e7c1204(2026-07-18):ColumnVisibilityPanel 原本 Fragment + 固定 `max-h-72`,判為「真 drift」,改成 root `flex flex-col h-full min-h-0`(M25 viewport-aware scroll chain)。
  - 22ca01e4 / 6e16d3cd(2026-08-12,同一段訊息):DatePicker 兩處 raw `overflow-y-auto` 換 ScrollArea,「M25 壓縮鏈由 flex-1 min-h-0 照傳」。
  - d057fa2f(2026-05-30)、649ad4f1(2026-05-23):hook 引用與缺檔標註整理,不是 bug。
- M16@watch 不在這次判定。

M21 併入前的原列(從 `rules/meta-patterns.md` 搬來,原文不改;放在程式碼框裡,因為單獨一列不是完整的表格):

```md
| **M21** | **新元件 / 新 sub-component 抽象前必過 prop variant test**。當新元件名 = `<Existing>+suffix`(Time / Range / Color / Light / Dark / Filled / Outline / Compact / Rich)→ 強烈 signal 應為 prop variant on `<Existing>`。3-test 通過才能分(全失敗 → prop):(1) `<Existing>` 加 prop 無法達成同 DOM/behavior?(2) ≥3 家 world-class DS 用分離元件而非 prop(必 cite source)?(3) value 結構或 contract 真的不同(如 Range = [start, end])?Hook:folded 入 `check_naming_and_abstraction.sh` D.1(P0 BLOCK,2026-05-08 cluster D consolidation;escape @separate-component-rationale)。 | DateTimePicker 從 DatePicker 拆 → 撤回合併 `<DatePicker showTime>`(2026-05-02);DataTableFilterPanel 5-file → 撤回 sub-file pattern |
```

## 已退役 M-rule 的 HTML 註解(原 meta-patterns.md 當時第 54–59 行,2026-11-17 knowledge-prune 搬來,原文不改)

這 4 段註解原本夾在 M36 與 M37 兩列之間,中間的空行把表格切斷,讓 M37 那一列在 GFM 不再是表格的一列;每個 session 也都要讀進這 1,252 字。fold 的摘要見本檔「2026-05-22 fold prune」。註解內的「Mechanism 4」是當時 `stop_self_audit.sh` 的編號。

```html
<!-- M27 retired 2026-05-15(per /knowledge-prune D3 audit):self-flagged「M23 子規則」 → collapsed into M23 sub-bullet (c) "framework prop name namespace conflict"。Original case (TanStack size vs DS density) + hook `check_datatable_invariants.sh(r2 folded,2026-06-11)` retained 在 M23 children。 -->
<!-- M33 retired 2026-05-22(per /knowledge-prune deep audit Lens 1+2):folded into M20 as sub-rule「Stop hook overfire defer anti-pattern」。Original session context(2026-05-13 claim-verify-gap)+ hook `stop_self_audit.sh` P1 warn detection(Mechanism 4 + 次 turn auto-inject)retained at M20 entry。Single-bug rule → 與 M20 同類「AI self-correction under feedback signals」合併。 -->
<!-- M34 retired 2026-05-22(per /knowledge-prune deep audit Lens 1+2):folded into M7 as sub-rule「Hook detection regex 必對齊 spec wording 廣度」。Original Triple test + 錨例(story-rules.md name field detection)retained at M7 entry。Single-bug rule + same-class「rule-authoring hygiene」與 M7 合併。 -->
<!-- M35 retired 2026-05-22(per /knowledge-prune deep audit Lens 1+2):folded into M23(d) as sub-rule「Nearest same-purpose canonical wins」。Original verdict(codex 2026-05-20「Cite 存在 ≠ consume 落實」)+ Triple test + registry SSOT + hook R8 retained at M23(d)。Single-bug rule + same-class「優先消費既有」與 M23 合併。 -->
```
