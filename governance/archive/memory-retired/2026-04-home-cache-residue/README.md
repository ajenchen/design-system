# 2026-04 home cache residue(歷史 provenance,非 authority)

這 13 個檔在 2026-08-08 前**只存在於 Claude home 快取的 `memory/retired/`,repo git 全歷史從未收錄**(逐檔 `git log --all --diff-filter=A` 驗證為零筆)。它們是 repo-SSOT 模型建立(2026-05-27 起 `governance/archive/memory-retired/` 開始收錄)之前,退役在本機的記憶。

**為何搬進來**:`scripts/sync-memory.mjs` 是 repo → home 的精確鏡像,home 端多出來的項目會被當 extras 清掉;而快取裡的 `retired/` 目錄同時讓 sync 直接 fail(`memory cache may contain only regular files:retired`)。不搬進 repo 就等於「等著被自己的同步機制刪掉」。

**地位**:純歷史 provenance,**非 current authority**。內容多已被上游吸收:
- `feedback_world_class_consistency` / `feedback_verify_design_claims` → AGENTS.md mindset #1(對標世界級)、#2(不憑直覺發明)與 M12/M22/M26。
- `feedback_dont_delete_scaffolding` → M10「改一處必看三處」與掃描不得截斷子規則。
- `*.retired-20260424.md.bak` 六個 feedback + 四個 project → 命名/SSOT/chrome canonical 等,已由 `packages/design-system/ds-canonical/` 對應 rules 與 spec 承接。

不得把本目錄任何檔案當成現行規則引用。
