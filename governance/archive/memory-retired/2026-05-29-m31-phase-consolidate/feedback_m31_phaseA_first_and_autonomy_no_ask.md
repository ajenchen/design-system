---
name: M31 Phase-A-first(codex = second opinion)+ auto-mode 不為 non-SSOT 決策 ASK
description: 啟 codex 前 Claude 必先跑自己完整 Phase A audit(Explore agent OR inline deep grep/Read sweep);codex 是 second opinion 非 primary。Auto mode 只為 SSOT-UI/UX substantive ASK,其他自己 pick best execute。
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# 兩條永久紀律(2026-05-29 user 第 N 次糾正,升 mechanical backstop)

## Rule 1 — M31 Phase-A-first:codex 是 second opinion,不是 primary

**Rule**:啟 `codex exec`(Phase B)前,Claude **必先自己跑完整 Phase A audit** — 不是 run 幾個 deterministic script(tsc / test / validate)就 defer codex。Phase A = Claude 獨立深度 audit(dispatch Explore agent 做 thorough read+reason,OR inline 大量 grep / Read / 分析),產出 Claude-solo findings,**然後**才 codex parallel,**然後**比稿。

**Why**:codex 是「第二把關 AI」降單一 model bias(per codex-collab SKILL.md 生態位)。若 Claude 跳過自己 Phase A 直接 defer codex = (a) 違反 M31 dual-track「各自獨立 audit 才比稿」(b) codex 變 primary 而非 second opinion(c) Claude 自己的 model perspective 沒貢獻 = 失去 dual-track 價值。

**How to apply**:
- `/deep-audit-cross-codex` Phase A 必 complete(SKILL.md Phase A.0-A.4)才進 Phase B
- 「跑幾個 script + 看 codex」≠ Phase A;Phase A 要 Claude 真的獨立找 findings
- 實作:dispatch Explore agent 做 Claude-solo deep audit,OR inline 自己 grep+Read+reason 列 P0/P1/P2,**先有 Claude findings 才 launch codex**
- codex reply 回來走 Step 4.5 verify + Step 5 比稿(既有紀律)

**Anchor 2026-05-29**:user 要「所有 repo deep audit cross codex」,我 run `test:scenarios` + tsc + validate(幾個 script)就直接 launch codex,**跳過自己的 Phase A 深度 audit**。user 抓「並不是全部都仰賴 codex 喔,codex 只是 second opinion...你確定你有先跑一遍?」。補做 Explore agent Claude-solo audit → 抓 3 P0(codex 另抓 3 P0 互補)→ 證實 dual-track 價值。**若我一開始就跳過 Claude Phase A,會漏掉那 3 個只有 Claude 抓到的 P0**。

**Mechanical backstop(soft warn,非 BLOCKER)**:`stop_self_audit.sh` 偵測「本 turn 有 codex reply read 但無 prior Claude-solo audit trace(Agent/Explore dispatch OR ≥5 Grep/Read)」→ **soft warn**(next-turn inject 提醒)。設計為 warn 非 block:Phase-A-first 判斷需 context(有時 codex 是 follow-up 而非 primary),hard block 會 false-positive;warn + memory anchor 提醒已足夠 self-correct。Anchor 2026-05-29 codex 自己也指出此 warn vs memory「backstop」用詞需一致 → 本句精確化為「soft warn backstop」。

## Rule 2 — Auto mode 只為 SSOT-UI/UX substantive ASK,其他自己 pick best execute

**Rule**:Auto mode 下,**只有 SSOT-affecting UI/UX substantive 增刪改**(動 component / token / spec.md 視覺結構 / 跨元件 design language / 新 API contract)才停下用中文人話 ASK user 拍板。**其他所有決策**(refactor 方向 / sync direction / governance home 選擇 / 架構 option / 命名 / test 策略 等 non-SSOT-UI/UX)→ **AI 自己 pick best + execute**,不列「A/B/C 你拍板」。

**Why**:per CLAUDE.md `# 自主執行 canonical`(2026-05-14 user SSOT directive)+ 反 pattern「『OK 嗎?』過度 ASK」(L152)。User verbatim 2026-05-29:「基本上只有會影響 SSOT 的 UI/UX 的增刪改需要用中文具體人話講給我聽讓我判斷決策,其他的決策基本上就是不以省工為前提...依此為前提來照你的建議來自主自動自發地做到完整、完美」。過度 ASK = (a) 煩 user(b) 違反 autonomous default(c) 把該自己扛的判斷推給 user。

**How to apply**:
- 決策前先分類:此決策動 SSOT-UI/UX substantive?
  - YES → 中文人話 propose + STOP 等拍板
  - NO(governance / refactor / sync / 架構 / 命名 / test)→ **自己選最佳 + 執行 + report 結果**(不問)
- Auto mode 下禁「要 A / B / C?」「你拍板」「要不要我做」for non-SSOT-UI/UX
- 判斷標準同 7 軸:言簡意賅 / 效率效能 / SSOT / 易懂維護擴充 / 世界級一致設計 / self-verify / self-improve → 哪 option 最符合就選哪個,自己決

**Anchor 2026-05-29**:ds-canonical 32 untracked sync 方向(.claude vs ds-canonical 哪個 SSOT)= non-SSOT-UI/UX governance 決策,我列「A/B/C 你拍板」問 user。user 抓「你他媽現在不是 auto mode 嗎?為何要一直我允許?可以不要再煩了嗎」。正確做法:自己判(ds-canonical 15-marker 較新且 template CLAUDE.md 引用確認 legit → 自己選 sync .claude←ds-canonical + 執行),不問。

**Mechanical backstop**:`stop_self_audit.sh` 偵測「auto mode + reply 結尾含 ASK keyword(要 A/B/C / 你拍板 / 要不要 / which do you want)+ 無 SSOT-UI/UX component/token/spec keyword」→ warn「auto mode 不為 non-SSOT 決策 ASK,自己 pick best」。

## 共通:不需 user 耳提面命

兩條都是 CLAUDE.md / meta-patterns 早已定義的紀律(自主執行 canonical + M31)。User 已講「幾百次」。本 memory + mechanical backstop = 確保**任何 session 自動遵守,不靠 user 每次提醒**。違反 = 偷懶 = 違 mindset #1「不取巧省工」。
