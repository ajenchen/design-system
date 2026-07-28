<!-- Authority/status: governance/planning/registry.json -->
# Codex Brief — Phase 2-3 final independent verify

## User 原話(verbatim)

「所有任務都要做完，不要留任何待辦，然後做完之後你和codex要各自檢驗包括截圖視覺稽核」

「你和codex 的共識馬不停蹄的做完」+「1. B 2. B 3. B」(approve all 3 decisions)

## Claude 已 ship list(本 session Phase 2 + 3 + audit infra)

### Phase 2 production code
1. NEW `packages/design-system/src/patterns/header-canonical/chrome-header.tsx` — ChromeHeader primitive
   - API: `<ChromeHeader withTabs?: boolean lockDensity?: 'inherit' | 'lg'>`(per codex Q5 比稿:narrow API,不開自由 density,M21 防禦)
   - 內部:`flex items-center gap-2 shrink-0 h-[var(--chrome-header-height)] px-[var(--layout-space-loose)]`,withTabs 時移除 `border-b border-divider`,lockDensity='lg' 時 set `data-density="lg"`
2. `packages/design-system/src/patterns/overlay-surface/overlay-surface.tsx` — SurfaceHeader 加 `withTabs?: boolean` prop conditional 移 border
3. `packages/design-system/src/components/Sidebar/sidebar.tsx:424` — SidebarHeader migrate to consume `<ChromeHeader>`,forward `withTabs` prop,保留 icon-mode override(`group-data-[collapsible=icon]:!px-0`)
4. `packages/design-system/src/components/FileViewer/file-viewer.tsx:328,459` — Toolbar + InfoPanel header migrate to `<ChromeHeader lockDensity="lg">`
5. `packages/design-system/src/components/Tabs/tabs.tsx:127` — TabsList default size `md` → `sm`
6. `packages/design-system/src/components/Tabs/tabs.tsx:380` — cva `defaultVariants.size` `md` → `sm`

### Spec.md updates
7. `tabs.spec.md:128` — size table ★ default 從 md 改 sm,md 標 future tier
8. `tabs.tsx:30` docblock size 段同步
9. `tabs.principles.stories.tsx` — SizeSelection Rule titles 全更
10. `header-canonical.spec.md` — W1 重寫(semantic owner vs paint owner)/ W3 加 assert enforcement / W6 改 Phase 2 visual audit gate / Layer 3 加 ChromeHeader API + M21 evidence
11. `file-viewer.spec.md:103` — L103 反向 drift 修(code 已對,wording 倒寫成 drift)

### Phase 3 hooks(4 個新 hook + settings.json 註冊)
12. `.claude/hooks/check_tab_lg_chrome_header_equal.sh` — W3 assert,parse uiSize.css + globals.css md/lg 值對等 BLOCKER
13. `.claude/hooks/check_header_with_tabs_border.sh` — W1 雙線 BLOCKER:含 header JSX + Tabs JSX 必有 `withTabs`
14. `.claude/hooks/check_chrome_header_handcraft.sh` — Layer 3 P1 soft warn:偵測 `h-[var(--chrome-header-height)] ... border-b border-divider` 自刻簽名
15. `.claude/hooks/check_spec_class_drift.sh` — Dim 53 reverse drift:spec 寫「固定 h-NN/寫死」但 tsx 已消費 token
16. `.claude/settings.json` PreToolUse Edit/Write 註冊 4 個新 hook

### Audit infra extension
17. `.claude/skills/design-system-audit/SKILL.md` — Group P 加 Dim 52(Header canonical cross-family W1-W6)+ Dim 53(Code-to-spec reverse drift),heavy dim list 加 52/53;從 46-dim 升 53-dim
18. `.claude/references/principle-dim-map.json` — hooks 段加 4 mapping + newDims_2026_05_17 加 52/53

## 請你獨立 verify(Step 4.5 / 4.6 / 5)

**Step 4.5 — grep cite verify**(read-only `exec -s read-only`):

1. ChromeHeader primitive API 對齊 Layer 3 spec:`grep -n "withTabs\|lockDensity" packages/design-system/src/patterns/header-canonical/chrome-header.tsx`,確認(a) `withTabs` conditional 移 `border-b border-divider` (b) `lockDensity='lg'` set `data-density="lg"` (c) 不開 free `density` prop
2. Sidebar / FileViewer migrate 對 — `grep -n "ChromeHeader\|h-\[var\(--chrome-header-height\)\]" packages/design-system/src/components/{Sidebar,FileViewer}/*.tsx`,確認 production tsx 已不再自寫 chrome header className signature(只剩 primitive import + consumption)
3. Tabs cva default — `grep -n "defaultVariants\|size = 'md'\|size = 'sm'" packages/design-system/src/components/Tabs/tabs.tsx`,確認 line 127 + 380 都是 `sm`
4. Hook 4 個都存在 + executable — `ls -la .claude/hooks/check_{tab_lg_chrome_header_equal,header_with_tabs_border,chrome_header_handcraft,spec_class_drift}.sh`
5. settings.json 註冊 4 hook — `grep -n "tab_lg_chrome_header_equal\|header_with_tabs_border\|chrome_header_handcraft\|spec_class_drift" .claude/settings.json`
6. principle-dim-map.json 完整 mapping — `grep -n "tab_lg_chrome_header_equal\|header_with_tabs_border\|chrome_header_handcraft\|spec_class_drift\|\"52\"\|\"53\"" .claude/references/principle-dim-map.json`
7. SKILL.md Group P 完整 — `grep -n "Group P\|Dim 52\|Dim 53\|53 audit dimensions" .claude/skills/design-system-audit/SKILL.md`

**Step 4.6 — regression scan**:

- 任何 Tabs JSX 在 production tsx 還用 `size="md"` explicit?該檢查不會被新 cva default 改成 sm 的場景(`grep "TabsList size=\"md\"" src/design-system --include="*.tsx" | grep -v stories`)
- ChromeHeader migration 有無漏(Dialog/Sheet/Popover header 應走 SurfaceHeader 不應 migrate;Sidebar/FileViewer 應 migrate 完;有其他 chrome header consumer 嗎?)
- W1 hook 偵測 production code 有真實 chrome header + tabs 並用的 case 嗎?
- Phase 3 hook 各自 smoke test 在我這邊都 pass(Hook 1: token equal pass / Hook 2: 無 tabs in file pass / Hook 3: 無 handcraft signature pass / Hook 4: 無 drift pass)— 你能 reproducing 或 catch counter-example 嗎?

**Step 5 — own-version verdict**:

獨立判斷:
- 我這個 Phase 2-3 ship 整套有沒有 over-engineering / 漏層 / API 不對?
- 53-dim audit 是否真 sustainable?還是 dim sprawl risk(per knowledge-prune 5% retire rate)?
- 有沒有任何 user verbatim「不要留任何待辦」我漏的(W2 padding align 我有沒有真 codify 進 ChromeHeader?還是只在 spec.md?)

請給 verdict + 任何 regression catch。

## 環境

- Working dir: `/Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project`
- 跑 `exec -s read-only`,read-only,**不 commit / Edit file**
- 我已自跑 `npx tsc -b` ✅ / `audit-content-quality --check` ✅ / `extract-canonical-rules` ✅
- 我正在跑 `npm run build-storybook`(visual baseline gate per Q4 decision B);你也可獨立 verify
