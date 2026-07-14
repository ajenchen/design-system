# Knowledge-prune P2 候選清單(2026-07-14,deep-audit C.0a closeout)

**性質**:P2 = retire / 重構「活防線或 canonical」,**只列候選、不執行**,等 user 拍板(quality-first 鐵律:每條機械防線保留,retire 前必確認保護已被別處覆蓋)。P0+P1 已 AUTO 執行(見文末「本輪已執行」)。

## Hooks(count 56,soft 26 / hard 60 — 在 hard cap 內)

**本季無安全 retire 候選。** `npm run audit:hook-quality` flag 的 3 個「dead」全是 false positive:

| Hook | Flag | 真相 | 處置 |
|---|---|---|---|
| `check_dynamic_tailwind_class.sh` | dead(0 fire)| 2026-07-09 root-cause 防線(DataTable row-height regression),wired 在 settings.json,**缺 `_log-fire.sh` instrumentation** 故 fire log 掛零 | P1 已補 instrumentation;下季 re-observe |
| `check_story_determinism.sh` | dead(0 fire)| 2026-07-07 治理進化軌道 7 防線(VR 換日假 breach),同上缺 instrumentation | 同上 |
| `check_ssot_header_declaration.sh` | dead(0 fire)| 2026-07-07 精簡復活版(CLAUDE.md 明文),rare-event(只 fire 在「Write 新 production tsx」)+ 缺 instrumentation | 同上;rare-event 豁免 |

cool 分類中 `fileExists=false` 的 5 筆(check_fork_user_plugin_install / check_plugin_freshness / check_propose_cite_required / check_propose_plain_chinese / check_story_slot_split)= 歷史已 retire/merge 名,僅存於舊 fire log,無動作。

**若未來必須降到 soft cap 的唯一路徑(P2 候選)**:dispatcher-consolidation — 同 event 的多支掃描 hook 合入 `post_edit_dispatcher.sh` / `chrome_header_dispatcher.sh` 既有 pattern(降檔案數不降防線數)。屬結構性工程,收益 = 檔案數美觀,風險 = 合併時 regex/exit-code 語意遷移錯。**建議維持現狀**(60 hard cap 有 4 headroom)。

## Memory(index 19→18,soft 18 達標)

| 候選 | 理由 | 為何 P2 不 P1 |
|---|---|---|
| `project_wm_ds_alignment_campaign.md` retire/merge | WM↔DS 對齊戰役若已收官(R3 研究完成、baton 顯示待 user 最終拍板 + beta.84 發版 task #104 pending)則 campaign entry 轉 stale | 戰役是否真收官取決於 user 拍板 R1-R3 + 發版,**現在還沒**——不確定,不動 |

## Specs(>300 budget 殘量)

P1 收斂後:`checkbox.spec.md` 372→358、`select.spec.md` 362→346(消掉的全是純重複/已被 SSOT 覆蓋段)。**殘餘超標內容全是 canonical,再砍必動 meaning**:

| Spec | 殘餘大段 | 深度重構選項(P2,需拍板)|
|---|---|---|
| checkbox.spec(358)| 「與 Switch 的分界」SSOT(~45 行)/「Clamp 政策」SSOT(~35 行)/ 狀態表 ×2 / CheckboxGroup zero-gap canonical | (a) Switch 分界 SSOT 遷至獨立 pattern spec 或 field-controls;(b) Clamp SSOT 遷回 selection-item.spec(消費端持有 SSOT 本身是倒置)— 兩者皆動 SSOT 住所 = 拍板題 |
| select.spec(346)| 「與 RadioGroup 的分界」SSOT(~40 行)/ hidden-input mirror 拍板記錄(~20 行)/ open-pair 例外 canonical(~10 行)| (a) 拍板記錄段(D2/API 策展 D)壓縮為 3 行 + git/log pointer;(b) RadioGroup 分界 SSOT 遷 pattern spec — 動 SSOT 住所 = 拍板題 |

**建議**:兩 spec 實質接近「foundational SSOT 例外(≤800-1200)」性質(各持有 2+ 個跨元件 SSOT 段);若 user 同意將此二檔標註為 SSOT-heavy 例外(或把 SSOT 段遷 pattern home),則 budget 壓力自然解除。

## Skills(既有 open 候選,非本輪新增)

- `codify-principle` + `codify-corrections` 合併為 `codify`(meta-patterns.md 2026-05-10 分析已列 marginal candidate,明文「user 後續 invoke /knowledge-prune 並 explicit approve 才動」)— 維持待拍板。

---

## 本輪已執行(P0+P1,AUTO,審計線索)

1. 3 hook 補 `_log-fire.sh` instrumentation(觀測性對齊,不動偵測邏輯)+ smoke 驗證 fire log 真寫入。
2. Memory D8:`project_cprime_governance_shipped` → `reference_cloud_governance_loading` 合併(campaign 已完結 + 同雲端治理域 + 同 originSession,invariant 零損;19→18);原檔移 `memory/retired/2026-07-14-cprime-consolidate/`(harness + repo mirror 皆移)+ `npm run sync-memory`。
3. checkbox.spec:Label 對齊機制 + SelectionItem 佈局表 → pointer 指 `selection-item.spec.md` / `item-anatomy.spec.md` SSOT(消措辭 drift);用法範例去重(垂直 group 例 → stories)。
4. select.spec:dual-mode 兩例 inline 化 + 歷史段壓縮(provenance 事實全留)。
5. deep-audit SKILL 288→243(≤250):Phase 0 detail → `references/phase-a-workflow.md`、C.1 template → `references/triage-rubric.md`,canonical 段(四要件 / SSOT 理由 / 全掃鐵律 / A.1b)全保留原文。
6. Validator K(決策四要件機械閘)ship + 測試 7/7 綠(Task 1,非 prune 但同批)。
