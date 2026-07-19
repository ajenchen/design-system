---
name: project-wm-ds-alignment-campaign
description: WM↔DS 對齊戰役(2026-07-08)— 完整收官(2026-07-15):beta.84/85 已發版、WM main 已 push(4e83402,13/13 真綠)、零殘項
metadata: 
  node_type: memory
  type: project
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
---

WM(work-management)ds問題.pdf 46 findings 根因戰役。交接 SSOT = `work-management/docs/2026-07-08-ds-alignment-handoff.md`;對帳 `node docs/ds-alignment/verify.mjs`(WM repo 腳本,本 DS repo 不存在)。**2026-07-14 收官**:beta.84 已發版 + WM lockfile 真綠(見文末「2026-07-14 發版收官」段);2026-07-10 re-audit 3 OPEN 已全收(見 `## 2026-07-10 收官 session`);**WM main 已 push(4e83402,2026-07-15,零殘項)**。

- **DS branch `2026-07-08-wm-rootcause-fixes`**(pushed):R2 export 斷鏈修 + R4 防線(幻覺 token/偽表格/表單簽名/R8R9 fork override/escape repo-ratchet/eslint-plugin)+ R3 拍板 spec 批(pane-header 判準/inline-create idle/計數 suffix/分隔線幾何)+ **Field width=fill/hug 軸**(4 控件鋪線;Input/LinkInput/NumberInput VariantProps 排除 width 避 TS2320)+ **indicator A 案**(cell view 態零恆顯 icon,6/6 benchmark;cell-registry 停傳 showDisplayEndIcon,prop 留 opt-in;推翻 2026-05-10/06-26 兩次拍板,RFC 已追記)。**已發版 beta.84(2026-07-14,見文末段)**。
- **WM branch `2026-07-08-ds-alignment`**(pushed,6 commits):Wave-1/2/3a/3b 全落地 — FilterPanel/欄面板/CAT_SOLID/useFormValidation×8/composer 歸左欄+獨立捲/count space-between/divider 幾何/SectionHeader/metadata 全 hug/Status 三處統一 select column/幻覺 utility 清零。**beta.84 已接上:lockfile bump + verify 13/13 真綠(2026-07-14,見文末段)**。
- R3 七題 user 逐題拍板紀錄在 handoff;indicator A 案 = view 態零恆顯 icon、affordance = hover outline(field-controls.spec cell 條文已改寫)。
- Backlog:DS API 缺口 5 項(panel i18n/條件數 helper/maxConditions/footer slot/now 注入)+ DialogBody 兩欄組合 API(Wave-3a 發現)+ prune P2 候選 hook `check_ssot_header_declaration.sh`(6 月 0 fire)。

## 2026-07-10 對抗 re-audit(5-agent)+ DS session 07-09/07-10 補

**re-audit(不信 handoff ✅,逐項 cite code)**:46 findings 多數 CLOSED(app source)。**但 verify 13/13 綠僅因本機 node_modules 被 `--no-save` 覆蓋成 unpublished DS**;lockfile 釘 `beta.82`(缺 `DataTableFilterPanel`)→ 乾淨 `npm ci` 會 build 掛。**published latest = beta.83(R2 exports 已在)**,但 `Select width=hug` / `DialogHeader actions` / DataTable tree sibling reservation 這 3 個 API **不在 published beta.83**、只在本機 unpublished DS branch → 需發版 + WM lockfile bump 才不 regress。**WM OPEN 3**:#1 TypeSettingsDialog 左 rail 手刻未消費 menu-item/item-anatomy;#6 MembersTab search 在右/actions 在左(違 `action-bar.spec.md:23`);#6b MembersTab toolbar→table 用 loose 應 tight(`layoutSpace.spec.md:67`)。**PARTIAL 2**:#4 左欄上方 divider-header 未實作;#11 MyWorkPage 僅 Status 可編非整張。

**DS session 07-09/07-10 補(branch `2026-07-08-wm-rootcause-fixes`,已 push;等 push main → beta.84)**:bare variant 全退役 + readonly a11y ring(WCAG 2.4.7)+ zoom maxLength + InlineEdit edit-in-place SSOT L1+L2(`field-edit-keys.ts` 修中文 IME bug / 泛型 renderRead Tag-SSOT / 多行)+ DataTable row-height I7 invariant + Field 框架地圖 spec。re-audit 抓的 **DS SSOT drift 4 項已修**(ssot-consultation bare stale→default+autoWidth + ds-canonical mirror + fork preamble regen / inline-edit.spec ring→border-primary / framework-map multiline stale / Focus 行為 readonly ring 矛盾)+ 新 hook `check_dynamic_tailwind_class.sh` 補分類(SHIP_AS_IS)。

## 2026-07-10 收官 session(user「全部照建議做到完整完美」拍板 b→c→a)

**DS backlog(b)全做完 + 驗**(branch `2026-07-08-wm-rootcause-fixes`,commit 5ee45131/87ae5bb8/b5050c8a):(b)(1) 鍵盤結算 IME guard 收斂進 `field-edit-keys.ts` 單一 SSOT —— helper 補完 Cmd/Ctrl+Enter 契約,cell string/number + InlineEdit multiline 3 consumer 全消費(消手刻 3 份;鍵盤契約單元測 10/10)。(b)(2) eslint-plugin 加 `no-dynamic-tailwind-class` rule + test(50/50);**該插件未發 npm/未被 fork 消費/不在發版鏈 = dormant「eslint 下沉」deferred,DS+fork 現由 write-time hook 守**,故 rule 為預備、版本留 beta.1。(b)(3) **不設新 hook**(Rule-of-3 只 2 host + hook 56/60 逼頂 D8a flag)→ 改 field-edit-keys.ts header 文件層規矩。+ 治理 hook 計數 55→56 drift 修 + prune verdict「成熟無真冗餘」(commit 9b8689e5)。

**WM(a)re-audit 3 OPEN 收官**(WM branch `2026-07-08-ds-alignment`,commit 9800bb2,verify 13/13 + tsc 0):#6b toolbar→table loose→tight(真錯,已修)/ #6 業務 search 移出工具層位置、歸業務層(action-bar.spec.md:69/76,已修)/ **#1 = re-audit 誤報,不改**:MenuItem `isInternal` 不在 public barrel(WM import 不到,只有 DropdownMenuItem/SidebarMenuItem = 錯語義)、手刻已正確用 item-anatomy token → 真根因 = DS 缺 public nav-list primitive(DS 增益機會另議,非 WM bug)。#4/#11 = 產品設計範圍決策,列給 user。

**2026-07-10 終局收官(user「不留任何待辦」)**:批次 A 全數處置 — r3 簽名 ×10 + PersonValue/PersonDisplay export(C14 前置,probe 驗 root barrel)+ item-anatomy「可收合 section header 組合 canonical」(R3-7 拍板 codify)+ registry antiPattern(C16 story 層)+ harness MINI_TABLE case;判斷類 5 項歸 judgment + auditDim(RoleCell/TypeSettings 拍板反例實證 regex 不可判)。**failure-class registry 終態:protected 15 / judgment 5 / remediating 0**。codex 三重對等(任務/資訊/閱讀鏡射 A.0,hook 5️⃣)+ 最強自動探測機(gpt-5.6-sol + ultra,CLI 換版自動重探)全上線。task #94/#100/#101/#102/#103 全 completed。

## 2026-07-14 發版收官

**beta.84 已發版**(npm `latest` + `beta` dist-tag 皆 = 0.1.0-beta.84;deep-audit 戰役 367 material 修復同車,DS commit `9b7234bd` + internal 型別通道補完 `b7466895`)。**WM 已接上**:lockfile bump beta.82→beta.84 + **CellSelect 包裝落地**(naked 合法化包裝,WM commit `2979dc9`)→ `verify.mjs`(WM repo 腳本,本 DS repo 不存在) **13/13 真綠對 published DS**(07-10 抓的「本機 --no-save tarball 假綠」問題根治;tsc 過)。**WM main 已收官(2026-07-15)**:squash merge + push(`4e83402`,tsc 0 + verify 13/13 真綠後推,branch 已砍)。戰役零殘項;deep-audit baton ledger 標 CAMPAIGN CLOSED。DS 端後續 beta.85(internal 型別通道)已發版,WM 下次 bump 可換用 DS `WithFieldVariantInternal` 型別取代 CellSelect 本地 widen(optional)。

**2026-07-10 治理覆蓋 matrix(user「未來 consumer 是否被治理?」)**:41-agent workflow 逐 class 驗 — 20 class 僅 3 MECHANICAL_CONSUMER + 1 DS_API_FIXED,**14 DOC_ONLY + 1 UNGOVERNED = user 質疑成立**。已落地:MenuItem `startContent`(佔位=startIcon 同容器 SSOT)+ WM 左 rail 改包 MenuItem + r3 nav-row 簽名(31/31 test)+ 2 stale 治理描述修。**收官計畫 SSOT → `.claude/planning/2026-07-10-consumer-coverage-remediation.md`**(批次 A r3 簽名 ×14 / B eslint 發佈 + 兩欄 dialog 拍板 / C 常設閘 dim 91 failure-class registry);完整證據 → `.claude/logs/failure-class-coverage-matrix.json`。系統性:r2/r3 `<DS\.` 綁定 = named-import 全繞過,需除鏽。

**DS backlog(4)更正保留**:hook 56/60 是「新防線成長」非 bloat——4「dead」全 false-positive(`_log-fire.sh`=sourced helper;`check_dynamic_tailwind_class`/`check_ssot_header_declaration`/`check_story_determinism` 全 07-07~09 新增剛出生),禁 retire。

相關:[[feedback-solo-dev-workflow]](push gate)、[[reference-cloud-governance-loading]](fork corpus;2026-07-14 吸收原 project-cprime-governance-shipped)。
