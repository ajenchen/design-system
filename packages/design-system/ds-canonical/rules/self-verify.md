# Self-verify canonical(path-scoped)

僅在編輯任何 file(`src/**` / `.claude/**` / `*.spec.md` / `*.tsx` / `*.css`)時 load。

**Why**:M10/M11/M20/M32 散在 meta-patterns,缺單一「改檔前中後該驗什麼」canonical。本 rule SSOT。對齊 Linux kernel patch checklist / Toyota TPS 自働化 / Google CL pre-submit。

## 4 階段強制(每階段 fail 任一 → STOP)

| 階段 | 動作 | 工具 / cmd |
|---|---|---|
| **Pre-edit** | (1) M29 3-column owner table(grep `*.spec.md` 找 anchor)(2) M23 既有 canonical 優先(`# SSOT 消費 canonical` 清單)(3) Touched file inventory + Read 真讀(非憑記憶)(4) 若 SSOT-UI/UX substantive → STOP 用中文 propose 等 user 拍板 | grep / Read / propose-options skill |
| **Mid-edit** | (1) 每 5-8 個檔案或跨新 domain 跑 scoped invariant grep(2) 發現 spec/code 衝突 STOP,不選邊(3) Hook 自動 intercept(check_substantive_edit_approval_preflight / check_solo_workflow / check_story_invariants 等)| auto-fire hooks |
| **Post-edit** | (1) `npx tsc -b`(任何 tsx/ts 改);**⚠️ 動 export/型別 surface(interface/type/cva variant union/discriminated union/新 export)必加跑 `npm run build:lib`** —— `tsc -b`(composite/build mode)**不做 declaration emit**,漏 TS4023「cannot be named」等 declaration-emit 錯;Netlify build.command = `build:lib && build-storybook`(`build:lib` 含 `build:dts` = `tsc -p` emit .d.ts)才會炸。**tsc -b PASS ≠ deploy-safe**(2026-06-05 anchor:Badge discriminated union BadgeDotProps 沒 export → Sidebar SidebarMenuBadge .d.ts TS4023 → Netlify build 連掛 3 commit,tsc -b 全綠騙過)。type-surface deploy-safety 證明 = `build:lib` exit 0,非 tsc -b。(2) 相關 invariant script(`node scripts/data-table-invariants.mjs` 若動 DataTable / `node scripts/audit-content-quality.mjs --check` 若動 spec)(3) M10 proactive scan(`/scan-similar-bugs` 或 manual grep 同 pattern DS-wide)(4) UI 改動加 visual probe(`/visual-audit --scope=changed` 或 Playwright screenshot)(5) M14 5-layer pipeline(spec / hook / SKILL / CLAUDE.md / memory 該動的同步)| `tsc` / `*.mjs` 腳本 / visual-audit |
| **Pre-commit / Pre-final** | (1) Claim-verify table:每「已修」「已驗」對應具體 command + artifact + file:line(2) 過 `scripts/audit-content-quality.mjs --check`(3) Stop hook BLOCKER 紅燈通過(claim-verify-gap / codex-verify / codex-transport)(4) Commit message 含 cite + verdict keyword 滿足 `check_codex_collab_5step.sh` | claim-verify table + content-quality + stop hook |

## 強制 trigger condition(滿足任一 → 整 4 階段必跑)

- 動 `packages/design-system/src/**`(production code)
- 動 `*.spec.md`(canonical text)
- 動 `.claude/{rules,skills,hooks,memory,commands}/**`(governance)
- 動 `CLAUDE.md`
- 動 token(`packages/design-system/src/tokens/**`)
- 動 component primitive consumer 行為

## 例外 escape(明寫,**不**靠記憶)

- Typo fix(無語意改變)→ Pre-edit + tsc 即可
- 純 markdown layout / 標點 → tsc + content-quality 即可
- Hook script 內部 logic refactor(無 BLOCKER 邏輯變)→ Pre-edit + smoke test(`bash -n` + `echo {} | bash hook.sh`)
- Audit / explore agent dispatch(不動 file)→ Pre-edit 即可

## Mechanical enforcement

- **Pre-edit**:`check_substantive_edit_approval_preflight.sh`(production code)+ `stop_self_audit.sh`(spec/canonical 補位)+ `check_ds_anchor_preflight.sh`(M29 anchor)
- **Post-edit**:`stop_self_audit.sh` Mechanism 1(claim-verify-gap)BLOCKER
- **Pre-final(宣告完成前)**:`stop_self_audit.sh` Mechanism 7(完整性宣告閘)BLOCKER — 宣告「全做完 / 全部完成」+ 本 turn 實質改動但**無全庫 stale-ref 掃描證據** → block。**觸發器 = 「宣告完成」本身,非等 user 問第二次**(2026-06-03 user-authorized,根治重複 failure)
- **Pre-final(重大 / SSOT / 模型 / 跨多檔改動)**:除 M7 自掃外,**宣告完成前必跑「獨立對抗稽核」**(multi-agent Workflow,每路假設「還有 loose end」主動去找 + cite 證據)。**理由**:self-grep 系統性漏(self-assessment unreliable,對齊 `feedback_ai_ground_truth_unreliable_mechanical_primary`)+ 信任機械閘(preflight / R4 / hook BLOCKER)勝於自評。**小改 = M7 自掃即可**,不需對抗稽核(避免過度)。2026-06-03 user-authorized,根治「宣告做完 → user 問第 N 次 → 才補掃出 loose end」
- **Pre-commit**:`scripts/audit-content-quality.mjs --check` + `scripts/extract-canonical-rules.mjs` 各 fail = block

## Anti-pattern(永久 ban)

- ❌「我感覺修好了」沒跑 tsc / invariant 就 claim done
- ❌ 動 export/型別 surface 只跑 `tsc -b` 就宣告 deploy-safe(必 `npm run build:lib`,詳上方 Post-edit row — 單一住所)
- ❌ 動 spec / src 沒先 grep owner anchor(M29 違反)
- ❌ 改 hook 沒跑 syntax check + smoke test
- ❌「下個 session 補」defer 可做的 verify(M33 違反)
- ❌ pass-through Explore / codex propose 沒 own-version 比稿
- ❌ 宣告「全做完 / 全部完成」前沒自己跑 M10「改一處看三處」全庫 stale-ref 掃描 → 等 user 問「真的做完?」才補掃出 loose end(M7 BLOCKER;anchor:CF model 改完漏 3 ref / iceberg)
- ❌ **重大 / SSOT / 模型改動只靠自 grep 就宣告完成** → 漏 fragility / 沒貫徹到 consumer。2026-06-03 anchor:R8 用相對路徑讀 registry 非 root cwd 靜默失效、CF 模型修沒貫徹到 App.tsx marker — **全是 4-agent 對抗稽核 + preflight/R4 機械閘抓到,自 grep 漏了**。重大改動宣告前必跑獨立對抗稽核 + 信任機械 preflight 勝於自評

- Linux kernel:`scripts/checkpatch.pl` pre-submit + `git log --oneline | head -3` 後 sign-off
- Toyota TPS:Jidoka(自働化)— 機器發現異常自己停,人別繼續(對應 hook BLOCKER)
- Google CL:LGTM + 必跑 presubmit(對應 Pre-commit table)
- Atlassian RFC:cite + counter-example scan 必過 reviewer round

對應 CLAUDE.md `# 自主執行 canonical` + meta-patterns M10/M11/M20/M32。
