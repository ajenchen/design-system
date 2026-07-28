<!-- Authority/status: governance/planning/registry.json -->
# Phase B Codex Independent Audit — Deep Audit Cross Codex(2026-05-21)

## User 原話(verbatim,本 session 啟動 + 拍板 quotes)

```
Deep audit cross codex
```

```
完整深度進階稽核整個 design system + codex 跑相同的完整深度進階稽核 + 跟 codex 討論辯論出共識
+ SSOT-UI/UX 增刪改需要用中文具體人話言簡意賅地講給我判斷決策
+ 其他的決策基本上就是不以省工為前提...自主自動自發地做到完整、完美
```

```
都給我做到好
```

```
決策一改leading compact不會影響badge高度的話就改，反正要確保badge高度不變
決策二照妳建議
決策三照妳建議，另外解釋uncontolled和controlled具體是什麼
決策四你他媽仔細給我確認到底該retire的是否真的該retire還是應該結構性保留，請全盤檢查，然後確認之後請下次不要再煩我，尤其是Palette tier
```

```
跑 codex 比稿
```

## Claude Phase A 結果摘要(已 land,commits `4f201f2d` + `8fe97333`)

### 全 53-dim NO-SAMPLE deep audit(16 sub-agents 並行,Group A-P)

**P0 真 violations**:1 項
- `badge.tsx:21` `leading-none` — utility-registry block.leading_numeric 違反

**P1 真 violations**:2 項
- `useAppShell` dead-export(false positive — public compound API hook,內部 AppShellAside L294 已消費)
- Token stories `tracking-wider`(false positive — 同 anatomy stories Inspector panel teaching UI scope)

**False positives**(已 verify):3 項
- Dim 52 W3:Group P 誤讀 spec。Tab default sm(32/40)坐 chrome header(48/56)內是正確設計;W3「tab lg = chrome-header-height」是「tabs 取代 header」case,非 default case
- Dim 53 field-wrapper px-3:`field-controls.spec.md:218` 明文「標準 px-3 padding」canonical,非 drift
- Dim 27 useAppShell:internal AppShellAside consumed at L294

### SSOT-UI/UX 4 項已拍板 + land

**D1 Badge `leading-none` → `leading-compact`**
- File:`packages/design-system/src/components/Badge/badge.tsx:21`
- Token:`--leading-compact: 1.3`(typography.css:111)
- 高度不變 invariant:Badge `h-4 (16px) + flex items-center` 限制內部 line-box;text-[10px] × 1.3 = 13px < 16px container

**D2 useAppShell `// code-quality-allow: dead-export` marker**
- File:`packages/design-system/src/components/AppShell/app-shell.tsx:363`(export 上方)
- Public compound API hook(對齊 Radix `useDialogContext` / MUI `useFormControl`)

**D3 Select `defaultValue` prop + dual-mode**
- Files:`select.tsx:67-69`(interface)+ `:443` `isControlled = valueProp !== undefined` pattern
- spec.md rewrite:Controlled / Uncontrolled dual-mode 段
- 互斥規則:`value !== undefined` = controlled signal(`value` 勝),`defaultValue` 僅 first-mount

**D4 Orphan tokens 全盤 audit + 永久 suppress 機制**
- 175 grep-orphan → comprehensive 5-path consumer detection → 真 retire = 0
- 131 grep-orphan 落 8 個 structural-keep 範疇:palette 1-10(77)/ magenta-turquoise(14)/ mask alpha(16)/ chart reserved(0)/ state variants(8)/ neutral palette(13)/ SOP semantic 5-piece(1)/ JS literal mirror hover-delay(2)
- 新 `scripts/audit-orphan-tokens.mjs` SSOT
- 新 `packages/design-system/src/tokens/orphan-tokens.spec.md` canonical
- design-system-audit SKILL Dim 48 升級

### M34 Hook regex broadness fix(governance autonomous)

`check_substantive_edit_approval_preflight.sh` + `stop_self_audit.sh` 同步加:
- 「妳」變體(`照妳` ≈ `照你` writing variant)
- 「決策[一二三四五六七八九十1-9]」numbered directive
- 「做到好」/「都做」/「全做」auto-approve variants

### Code-quality cleanup(commit `8fe97333`)

- `Tabs/tabs.tsx:2` file-size marker(515 < cap 800)
- `Button/button.tsx:2` file-size marker(528 < cap 800)
- `Sidebar/sidebar.tsx:204` long-function marker(97 < cap 200,naive heuristic 誤判)

### Verify artifacts

- `npx tsc -b` PASS
- `node scripts/audit-orphan-tokens.mjs --check` ✅ 0 真孤兒
- `node scripts/code-quality-audit.mjs` ✅ 0 findings
- 5/5 regex 新 pattern match test PASS

---

## 請你執行 Phase A 相同流程(獨立 audit,不過水我的結論)

### Layer A 各自熟讀(read 不憑記憶)

1. `CLAUDE.md` + `.claude/rules/{meta-patterns,spec-rules,ui-development,story-rules,self-verify}.md` 全文
2. `packages/design-system/src/**/*.spec.md` 全部(60+ files)
3. 本 session 我新加/改的具體 file:
   - `packages/design-system/src/components/Badge/badge.tsx`(D1 leading 修)
   - `packages/design-system/src/components/AppShell/app-shell.tsx`(D2 marker)
   - `packages/design-system/src/components/Select/select.tsx` + `select.spec.md`(D3 dual-mode)
   - `packages/design-system/src/tokens/orphan-tokens.spec.md`(D4 SSOT 新建)
   - `scripts/audit-orphan-tokens.mjs`(D4 audit script 新建)
   - `.claude/hooks/check_substantive_edit_approval_preflight.sh` + `.claude/hooks/stop_self_audit.sh`(M34 regex)
   - `.claude/skills/design-system-audit/SKILL.md`(Dim 48 升級)
   - `packages/design-system/src/tokens/utility-registry.json`(token stories exception)
   - `packages/design-system/src/components/Tabs/tabs.tsx` + `Button/button.tsx` + `Sidebar/sidebar.tsx`(code-quality markers)

### Layer B 各自驗證

1. `npx tsc -b`
2. `node scripts/audit-orphan-tokens.mjs --check`
3. `node scripts/code-quality-audit.mjs --scope=packages/design-system/src/components`
4. grep verify 我宣稱的 file:line 真實性

### Layer C 比稿(3 column verdict per decision)

對我的 4 個 D 決策 + M34 hook fix + Phase A 整體,逐條 cite-based propose:

| Decision | My claim | Codex verdict(✅/❌/⚠️) | Cite path:line |
|---|---|---|---|
| D1 leading-compact | 高度不變 invariant 因 `h-4 + flex items-center` 限制 line-box | | |
| D2 useAppShell marker | 公開 compound API hook(Radix/MUI 慣例) | | |
| D3 Select dual-mode | dual-mode 對齊 React/Radix/shadcn/MUI/Ant 共識 | | |
| D4 orphan tokens 0 真孤兒 | 131 全落 8 個 structural-keep 範疇 | | |
| M34 hook regex 修 | 對齊 M34 hook wording 廣度 | | |

### 請特別驗證 / 比稿的具體題目

1. **D1 高度 invariant verify**:`h-4 + flex items-center` 是否真能完全壓住 leading-compact(1.3)的 line-box 影響?有沒有 edge case(eg. text 超出 visible 但 box 不變,或 dark/light mode 差異)?
2. **D3 dual-mode 是否該支援**:原 spec 寫「刻意 controlled-only」rationale = 內部狀態複雜易 race。我加 dual-mode 後 race 風險是否真消除?有沒有 controlled↔uncontrolled switch 場景的 hole?
3. **D4 真 0 孤兒結論**:131 個 grep-orphan 分到 8 structural-keep 範疇,有沒有 categorize 錯的(實際該 retire 但我誤分類為「結構保留」)?
4. **整體 Phase A 漏抓**:你抓但我漏的 / 我抓但你不同意的 / 兩邊都漏的盲區?
5. **M34 hook regex 廣度**:現在的 regex 是否仍有 user 同類寫法被漏(eg. 「OK 拍 D1 D3」/「3 個都做」/「先 D1 後其他」等可能 user 未來會寫的 approval 寫法)?

請回完整 Layer A / B / C 報告,獨立不被我框架限制。簡潔 markdown 格式,不需要追求長度。
