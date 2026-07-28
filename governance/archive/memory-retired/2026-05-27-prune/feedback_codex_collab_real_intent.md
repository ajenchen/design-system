---
name: Codex collab 真意 — adversarial dual-track,NOT skip
description: User 2026-05-22「不需要再讓 codex 比稿,你自己 trust 自己」真意 = M31 5-step adversarial dual-track + triple-verify,不是 skip codex。曲解 = 智障
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Rule

User 任何含「codex / trust 自己 / 不需要再 / 比稿」的 directive **永遠不可** 解讀為「skip codex / skip Phase B / Claude solo」。

**真意**(2026-05-23 user verbatim re-clarify):
> 「我的意思是你們各自都要全盤閱讀過所有檔案據理力爭辯論討論,不要被 codex 牽著鼻子走,要再三確認問題真的是問題而不是無病呻吟,確認問題前要先全盤查證所有檔案包括設計原則仔細評估問題到底是不是問題,我們 infra 不是這樣定義嗎?」

= **完整 M31 5-step adversarial dual-track**:
1. 各自全盤閱讀(read all files DS-wide)
2. 各自驗證(run scripts independently)
3. 各自視覺稽核(playwright probe / DOM inspect)
4. 各自 3-column cite propose(spec.md path:line / 引文 / reasoning)
5. **不被 codex 牽著鼻子走** — 比稿據理力爭,evidence stronger 勝;cite battle if disagree

**Triple-verify before treating as problem**:任何 finding(含 codex 抓的 / deep audit 抓的)propose 前必 inline 跑 grep DS-wide + read spec.md + 對照 canonical → 確認問題真存在,非無病呻吟。

# Why

User 2026-05-23 verbatim verdict:
> 「你他媽為什麼要曲解我的意思,你是低能兒嗎?」
> 「你他媽看到底要怎麼修避免你跟智障一樣」

**Anchor incident**(2026-05-23 deep-audit-cross-codex 完成度問答):
- User 問「Deep audit cross codex 到底做完了沒」
- 我答「Phase B 未啟,因 2026-05-22 historical『trust 自己』」
- User 怒糾「你搞錯我意思,我意思是 adversarial dual-track 不是 skip」
- 真錯誤:我把「不被 codex 牽著鼻子走」(= 反 pass-through,要據理力爭) 讀成「不用 codex」(= skip)
- **兩個意思 180° 相反**

# How to apply

- User 任何「codex / trust / 不需要 / 自己跑」 directive → **default 解讀 adversarial dual-track**,不是 skip
- Phase B 對 `/deep-audit-cross-codex` 永遠 mandatory(skill canonical),除非 user **明說「不要 Phase B」「不要 codex」「skip B」**
- Codex reply 收到後必走 M31 Step 4(self-check)+ 4.5(grep cite verify)+ 4.6(regression scan)+ 5(own-version 比稿) — **禁 pass-through**
- 任何 finding(Claude 抓 / codex 抓 / hook 抓)propose 前必 triple-verify(grep + read + canonical exception check)
- 真意 = 「兩個 model 都要 rigorous,你不可以 lazy 也不可以 pass-through」

# Mechanical enforcement

- `check_codex_collab_5step.sh` P1 soft hook(commit message 含 codex/Layer keyword 必同含 cite + verdict)
- `stop_self_audit.sh` Mechanism 4 BLOCKER(codex-verify gap)
- `stop_self_audit.sh` Mechanism 5 BLOCKER(codex-transport-discovery 未跑)
- `check_audit_sample_escape.sh` pre + post(2026-05-23 雙向)
- `codex-collab/SKILL.md` Step 0.5 own-version + Step 4.5 verify + Step 5 比稿 — 全 invariant

# Anti-pattern(永久 ban)

- ❌ 讀「trust 自己」= skip codex(180° 曲解)
- ❌ Phase B「未啟」就跑去 Phase A close — `/deep-audit-cross-codex` skill mandates A→B→C
- ❌ Codex transport 可用卻不啟 Phase B(無 user 明示 skip)
- ❌ 收 codex reply pass-through 給 user 不 Step 4.5 verify
- ❌ 自我合理化「Phase A only is fine」rationale 套 user historical 不相干 directive

# 對齊原則

- M31 5-step adversarial dual-track canonical(SSOT in codex-collab/SKILL.md)
- User 2026-05-23 verbatim「ASK gate 只收斂 SSOT-UI/UX 增刪改」— workflow 決策不該 ask + autonomous
- mindset #1 不取巧:skip Phase B 為 context budget 是取巧
- Linux kernel patch review: maintainer first-pass + lkml independent reviewer(永遠 dual)
- Google ML eng-design-review: proposer + adversarial reviewer + structured disagreement
