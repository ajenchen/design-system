---
name: audit-preflight-must-scan-all-files-and-principles
description: /design-system-audit --deep 前必先「全面盤查」— 列全 DS 檔案 + 全設計原則 + audit-dim 覆蓋 matrix(無 cover gap)。違 = hook BLOCKER
type: feedback
---

# 稽核 Preflight 全面盤查 canonical

## Rule

**`/design-system-audit --deep` 跑 Phase 1 前,必先跑 Phase 0.5 Preflight,輸出 3 件:**

1. **檔案 enumeration**:全 DS 檔案 list(`src/design-system/**/*.{tsx,ts,css,md}` 含 `.stories.tsx` / `.anatomy.stories.tsx` / `.principles.stories.tsx` / `.spec.md` 全列)+ 數量計
2. **設計原則 enumeration**:全原則 list(CLAUDE.md M-rule M1-Mxx + spec.md frontmatter `traits:` 全集 + `.claude/rules/*.md` rules + `.claude/hooks/check_*.sh` 各自 invariant + `.claude/skills/*/SKILL.md` discipline 等)
3. **Coverage matrix**:每原則 → audit dim 對應(N 對應 / 「**NO COVER (gap)**」標記)

**Preflight 結果存** `.claude/logs/audit-preflight-{date}.json` 供 Phase 1 dispatch sub-agent 引用。

## User 原話 SSOT(2026-05-15)

> 「你完整稽核之前應該會先全面盤查全部檔案和所有設計原則對吧?**我記得之前我有命令你要在 infra 定義這件事**」

> 「**上面的都完成之後,就去確保所有 infra 要求的任何設計準則在設計系統進階稽核都會全面涵蓋,並要確保現在和未來都會自動涵蓋,當有新的準則就務必更新設計系統進階稽核的內容**」(早 2 turns)

## 為什麼 preflight 必要

- **「全盤不 sample」**(memory/feedback_audit_full_sweep_not_sample.md)需要 baseline:**到底全是多少**才能 verify「全」
- **「new 原則 → auto cover」**需要每次跑 audit 時 cross-check coverage,有 gap 即報
- **既往不咎 anti-pattern**:沒 baseline = 不知道漏多少,只能 sample → 漏 88% stories

## Implementation

### `scripts/audit-preflight.mjs`(新)

```js
// Read all files + all principles + map to audit dims
// Output JSON to .claude/logs/audit-preflight-{date}.json
// Exit 1 if any gap found(force user 補 dim or 撤 trait)
```

執行:
1. Glob `src/design-system/**/*.{tsx,ts,css,md,stories.tsx}` 計檔案
2. Parse `meta-patterns.md` M-rule headers
3. Parse `*.spec.md` frontmatter `traits:` 各 trait
4. Parse `.claude/rules/*.md` rules
5. Parse `.claude/hooks/check_*.sh` invariant comments
6. Read `design-system-audit/SKILL.md` audit dim list(Group A-O,Dim 1-46+)
7. Cross-map:每原則 / trait → audit dim
8. Output JSON:
   ```json
   {
     "filesCount": 190,
     "principles": [
       { "name": "M22 benchmark cite", "covered_by": ["Dim 33(c)"] },
       { "name": "story 範例真實業務", "covered_by": ["Dim 12"] },
       { "name": "<new principle>", "covered_by": [], "gap": true }
     ],
     "gaps": [...]
   }
   ```

### design-system-audit SKILL Phase 0.5

新 Phase 0.5「Preflight 全面盤查」插在 Phase 0(build baseline)後、Phase 1(parallel audit)前。
**不過 preflight 不能跑 Phase 1**(BLOCKER)。

### Hook

`stop_self_audit.sh` 偵測:`/design-system-audit --deep` invoke 但 24h 內無 audit-preflight log
→ BLOCKER warn「先跑 preflight」。

## How to apply

每次 `/design-system-audit --deep` 自動 Phase 0.5 chain。User invoke 時不需手動。

## Future-proof

新原則加入 CLAUDE.md / hook / SKILL → 下次 audit-preflight 自動偵測 + gap report。

## Related

- `feedback_audit_full_sweep_not_sample.md`(NO-SAMPLE invariant — preflight 是 baseline source)
- design-system-audit/SKILL.md Phase 0 build baseline(parallel — verify build,本 preflight verify coverage)
- M14 對話結論 → AUTO integrate(user prior directive 終於 codify)
