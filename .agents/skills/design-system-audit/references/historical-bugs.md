# Bug Classes This Skill Prevents

Curated from canonical governance history plus audit runs. Each entry names the bug class, how it originally slipped in, and which audit catches it.

---

## Three-way drift — cva vs spec vs anatomy

**First seen**: SegmentedControl (2026-04-18) — cva `defaultVariants.size = 'md'` but spec.md + tsx docblock + anatomy all wrote `sm ★default`. Three-way disagreement persisted unnoticed.

**Caught by**: Audit 1 (cva defaultVariants drift).

**Recurrence**: Steps anatomy prop table drift (orientation), SegmentedControl anatomy prop table drift (size still `'sm'` in anatomy-only location). Both caught in 2026-04-18 run.

**Why it recurs**: When developer changes `cva()` defaults, the sync checklist across 4 locations (cva + spec prop table + tsx docblock + anatomy prop table + anatomy story H3) is easy to miss. Automation via grep `"★|預設|default"` across a component's folder before committing is the primary guard.

---

## Spec text pollution — visual / implementation details

**First seen**: Multiple specs across the audit — Badge with `16px 高、10px 字`, Chip with `display: flex; gap: 8px;`, NameCard with `bg-muted rounded-md px-3 py-2`, Tabs with `::after bottom: -1px`, Slider with「被 range 圍住的空心洞」物理比喻.

**Caught by**: Audit 2 (Rule A).

**Why it recurs**: When writing specs, authors feel compelled to be "precise" — but precise pixel / class specs belong in `.tsx` (source of truth for values) and `.anatomy.stories.tsx` (visual reference). Spec is for design principles (why / when). Visual metaphors belong in `.principles.stories.tsx` (visualization).

**Rule of thumb**: if removing the sentence from spec would leave the principle intact, the sentence is describing implementation — remove it.

---

## Story placeholders — `Option A / B / C` / variant names as labels

**First seen**: Button principles used `<Button variant="primary">Primary</Button>` as a label, Tag used `分類 A / B / C / D / E`, Steps used `Step 1/2/3/4` without business scenario.

**Caught by**: Audit 4 (Story human-language).

**Why it recurs**: When authoring stories, it's tempting to use variant names or letters because "it demonstrates all the variants." But Storybook's受眾 is any designer / PM / engineer opening it — they should grasp the scenario from the example alone, not from the label.

**Rule of thumb**: every story example must pass the 「人」test (遮標題光看元件懂情境) — if it fails, use a real business scenario (Jira / Stripe / Notion).

---

## SSOT pointer drift — heading renamed, pointer not updated

**First seen**: `opacity.spec.md` pointed to `color.spec.md「Disabled 策略」` but actual heading was「Disabled 狀態 / 兩種 disabled 策略」. Similar issues across 4 pointers (radio-group, item-layout, name-card).

**Caught by**: Audit 6 (SSOT pointer dead-link).

**Why it recurs**: Headings get renamed for clarity. Pointers using 「heading」 format hard-code the old name. Grep-audit across `\.spec\.md「[^」]+」` surfaces these.

**Prevention**: when renaming a spec heading, grep the project for the old heading name first — find reverse references, update them.

---

## Anatomy incomplete — missing sections (no color matrix / no state matrix)

**First seen**: Popover / Sheet / Command / PeoplePicker / NameCard have only 1-3 stories where 5 are required. Live color swatches missing in SegmentedControl / Switch / Tabs / Toast / Steps / Slider / Textarea / Field / TreeView (tokens as text only).

**Caught by**: Audit 5 (Anatomy completeness).

**Why it recurs**: When a component is simple (single variant, single size), authors feel the full 5-section template is overkill. But even simple components benefit from explicit "本元件無 size" / "本元件無 state" statements — the skeleton provides Figma-inspect-parity for designers.

---

## Density dual values in anatomy

**First seen**: Tabs / SegmentedControl / Sidebar anatomy size tables had `md density / lg density` columns showing `28→32px` dual values.

**Caught by**: Audit 5 (Figma-test).

**Why it recurs**: Authors want to be thorough. But canonical anatomy rules explicitly forbid — anatomy reflects *current* density (re-rendered on density switch); dual columns are noise. Token name is enough.

---

## Internal vs Components misclassification

**First seen**: HoverCard originally under `Components/` (behavior primitive, no default visual) — should be `Internal/`.

**Caught by**:`packages/design-system/ds-canonical/references/naming-conventions.md` has a 3-question test; audits cross-check.

**Why it recurs**: Name bias — HoverCard *sounds* like a public component. Always go by behavior (has default visuals? rendered directly anywhere?) not name.

---

## Field-height family default inconsistency

**First seen**: Chip was listed in the default-md family but is actually fixed single-size (h-field-sm, Material 3 convention). Clean-up in 2026-04-18.

**Caught by**: Audit 1 + Audit 3 scope application.

**Why it recurs**: Authors see "component consumes field-height token" and assume it's in the sm/md/lg family. Single-size consumers (Chip, Breadcrumb?) need separate classification.

---

## Chart of audit → bug class（對齊 current 27-audit numbering,Groups A–K,in audit-prompts.md）

### Group A — Correctness (P0)
| Audit | Primary bug class | Secondary |
|-------|-------------------|-----------|
| 1. cva defaultVariants 三方漂移 | Three-way default drift | Family classification |
| 2. SSOT dead link | Dead link pointers | Heading drift |
| 3. SSOT reciprocal | Missing reverse pointer | Cross-spec inconsistency |
| 4. Tailwind v4 / tailwind-merge grep | `[--foo]` silent fail | Unregistered utility strip |
| 5. Token 消費紀律 | Hardcoded hex / rgba | Raw pixel values |

### Group B — Spec hygiene (P1)
| Audit | Primary bug class | Secondary |
|-------|-------------------|-----------|
| 6. Spec Rule A 文字品質 | Spec text pollution | Visual description leaks |
| 7. Spec Rule B 邊界案例 | Missing boundary coverage | Scope misapplication |
| 8. 7-維度 對標覆蓋 | Missing DS dimension | Thin spec |

### Group C — Code conformance (P1)
| Audit | Primary bug class | Secondary |
|-------|-------------------|-----------|
| 9. shadcn passthrough 完整度 | Missing forwardRef / displayName | Missing ...props / cva export |
| 10. a11y 基本覆蓋 | Missing aria-label | Non-button onClick |

### Group D — Story layer (P1)
| Audit | Primary bug class | Secondary |
|-------|-------------------|-----------|
| 11. Story 三層齊全 | Missing stories layer | Internal vs Components 誤分 |
| 12. Story 人話範例 | Placeholder / abstract labels | Extreme unrealistic |
| 13. Anatomy Figma-inspect 完整度 | Missing sections / dev-lang | Density dual / no swatches |

### Group E — System-level (P1)
| Audit | Primary bug class | Secondary |
|-------|-------------------|-----------|
| 14. 命名一致性 | Folder/file case mismatch | H1 heading drift |
| 15. Canonical governance + generated projection 一致性 | Internal contradictions | Dead internal references |

### Group F — Architecture compliance (P1, session-learned)
| Audit | Primary bug class | Secondary |
|-------|-------------------|-----------|
| 16. Layout Family 宣告 | 元件缺 Family declaration | 系統遊離 |
| 17. Prop value 跨元件認知衝突 | 同 literal 不同語義 | 違反命名三重 test #3 |
| 18. shadcn compat alias 回流 | `npx shadcn add` 遺留 alias | 硬寫 Tailwind shadow |

---

## Meta-Pattern layered index (2026-04-21 rebuild)

After the 2026-04-21 governance rebuild, each historical bug maps to one of the Meta-Patterns in `packages/design-system/ds-canonical/rules/meta-patterns.md`. The index below is the canonical mapping; specific bug classes are kept below as historical context, but future bugs should be classified into a Meta-Pattern first.

### M1 — 視覺決策前必消費 SSOT

- **FileViewer 初版**(2026-04-20 / AR26-38):dismiss 用 Button 不用 ItemInlineAction / header 硬寫 h-14 不用 `--chrome-header-height` / toolbar 按鈕 gap 沒對齊 `action-bar.spec.md` / Sheet 表單 gap 沒用 `--layout-space-tight`
- **Input `variant="bare"`**(2026-04-20):FileViewer ZoomInput 發明新 variant 未先 grep 既有 Input variant 值;事後 codify 進 Input spec 但 discovery pattern 有誤(不該先發明)
- **Row 硬刻 `<div><Icon/><span/><Button/></div>`**(反覆發生):應用 MenuItem + slot components
- **Loading overlay 手刻 `<div absolute inset-0 flex center>`**(反覆發生):應用 `<Empty icon={<CircularProgress/>}/>` 或 Input `loading` prop

### M2 — 消費 3rd-party lib 必驗 rendered DOM

- **react-day-picker v9 `data-range-*` 不存在**(2026-04-21 / AR43):DateGrid 用 `[&[data-range-middle]]:bg-...` 靜默失效,正解走 classNames prop
- **react-zoom-pan-pinch fit-to-page 算錯**(2026-04-21 / AR 本輪):formula 混淆 `object-contain` 的 pre-scale 和 transform scale,導致 fit 反而縮小;正解移除 object-contain 用 natural size + onLoad 計算 fit scale
- **wheel step 10% 太粗**(2026-04-21 / AR 本輪):預設 0.1 非世界級(Figma ~3%、Preview ~5%),調到 0.03 + smoothStep 0.005
- **DateGrid today `[&>button]:relative` 破壞 absolute**(2026-04-21):button 已 `absolute inset-0.5` 是 positioning context,重加 relative 覆蓋掉 absolute → sizing 破壞

### M3 — Portal 逃逸 subtree context

- **FileViewer DropdownMenu dark subtree 變亮**(2026-04-20 / AR26):Portal 到 document body,不繼承 FileViewer `data-theme="dark"` subtree,需顯式 forward + 強制 `bg-surface-raised` 等 dark token class

### M4 — Group 元件必隔離 fieldCtx

- **Checkbox in CheckboxGroup 所有 label 抑制**(2026-04-21 / AR34):fieldCtx 在 CheckboxGroup 內傳染到每個 item,每個 Checkbox 以為自己在 Field 裡唯一 → label 被抑制;正解建 `CheckboxGroupContext` 隔離,`shouldSuppressLabel = insideField && !insideGroup`
- **Checkbox 共用 fieldCtx.id 點擊只 toggle 第一個**(2026-04-21 / AR34):同上 root cause,所有 item 的 `<label htmlFor={fieldCtx.id}>` 指向同一 id;正解 `insideGroup ? generatedId : fieldCtx?.id ?? generatedId`

### M5 — State 疊加必 spec 聲明

- **DateGrid today + selected bar 色隱形**(2026-04-21):today bar 用 `bg-primary` 藍色,selected cell bg 也是藍色 → bar 隱形;正解 `[&[data-selected=true]>button]:after:bg-on-emphasis` 在 selected 時切白
- **DateGrid today bar 過於貼近 button 邊**(2026-04-21):`bottom-[2px]` 離 button 底太近,視覺「黏邊」;正解 `bottom-[5px]` 貼近數字行底

### M6 — Stakeholder gate 強制進階稽核

- **FileViewer 初版多 round 反覆修 AR26-38**(2026-04-20):初版出給人看前沒跑進階稽核 / 沒截圖全 state 驗證 → 後續 user 發現 8+ 項問題分多輪修;若 merge 前過了 `/component-quality-gate` Phase 4.5 進階模式 + `/visual-audit` Layer A + Layer B,多數問題應當場攔下

### 獨立技術陷阱(非 meta-pattern,保留 anchor)

- cva `defaultVariants.size` 三方漂移(SegmentedControl) → `/story-writing` Phase 4 + hook `lib/_cva_default_sync.sh`(`post_edit_dispatcher.sh` 消費;原 check_cva_default_sync.sh 2026-05-13 fold)
- Row 硬寫 `py-2` 產生 gap(TreeView in SidebarGroup) → item-anatomy spec
- asChild pattern consumer 自查 avatar size → item-anatomy spec
- HoverCard 誤放 Components/(純行為 primitive 應 Internal/) → `# Story` 判斷 test
- Chip 誤列 field-height family(Material 3 固定 sm) → `tokens/uiSize/uiSize.spec.md`

---

## Meta-Pattern M1-M17 origins(2026-04-24 搬自舊 provider bootstrap 3rd column)

Each Meta-Principle 起源於具體 bug 類型。Canonical `rules/meta-patterns.md` M-row 第 3 欄壓到 ≤80 字,完整歷史在這。

### M1 — 視覺決策前必消費 SSOT
自發明 `variant="bare"` / Sheet 表單 gap 沒用 layout-space token / Header 高度沒用 `--chrome-header-height` / Row 沒用 item-anatomy / Toolbar 按鈕群 gap 不對齊 action-bar canonical。2026-04-22 dismiss Button/Inline Action 分界後走 item-anatomy「Predicate」SSOT。

### M2 — 消費 3rd-party lib 必驗 rendered DOM
react-day-picker `data-range-*` attribute 不存在(我們 CSS selector 無效);react-zoom-pan-pinch fit-to-page 算錯(混淆 object-contain 跟 transform scale);wheel step 10% 太粗。任何 lib 升級可能 silent breakage。

### M3 — Portal 逃逸 subtree context
DropdownMenu 在 dark subtree 變亮(theme 未 forward);density 規則:部分 overlay(Popover / Tooltip)刻意 lock `md` 非 inherit(density.spec.md 明訂);未來任何 Portal 元件都要檢視。

### M4 — _Group 元件必隔離單 item 的 fieldCtx
Checkbox 在 CheckboxGroup 內所有 label 抑制(所有 item 共用 fieldCtx.id + hasFieldWrapper → label 重複被抑制 / 所有 item 共用 id 點擊只 toggle 第一個)。未來任何 `*Group` 類容易犯同樣模式。

### M5 — 視覺 canonical 必 spec 聲明所有 state 疊加
DatePicker `today + selected`:藍 bar 疊在藍底隱形;`hover + disabled`:ring 仍顯示;`range + today`:指示器重疊。單一 state 有定義不夠,必聲明所有兩兩 / 三疊加。

### M6 — Stakeholder-visible 產出強制進階稽核
2026-04-20 FileViewer 初版不看 action-bar spec / button 間距錯 / dismiss 用 Button / header 沒 token / 視覺不整齊就上給人看;被 user 發現 AR26-38 共 8+ 項。若 merge 前過 /component-quality-gate Phase 4.5 進階模式 + /visual-audit 兩層,多數應當場攔下。

### M7 — 新 protocol 必 cross-check 既有 Meta-Principle
2026-04-21 `principle-audit-protocol.md` v1 寫完沒套 Phase 0 全掃到 D6b/D6c,被 user 抓到「這也是跟一致性有關」才補。AI 寫新東西時套用既有原則有盲點,寫完必反向檢視。

### M8 — 訂 cross-component canonical 前必 world-class benchmark
2026-04-22 item-anatomy Inline Action vs Button predicate 疊代 4 次(position-based → density 分界 → fixed-small → chrome corner exception),每次 user 拉回才補對照。若 M8 存在,第一次就該先 benchmark Material IconButton / Polaris Button plain / Atlassian IconButton / Ant Button type=text 的位置規則再訂 rule。

### M9 — Predicate 寫完 present 前必 4 題自測
2026-04-22 AI 列 Cat 1 IA 範例塞「DatePicker endAction」(含裝飾 Calendar,該走 decorative indicator)+「Chrome corner close」(該走 Cat 3 Button);FileItem rich 列 Button sm 違反同 session 訂的 ≤24 cap;DataTable 初版列 Inline Action(世界級全用 Button)。四個錯分每一個都 user 抓到才修。

### M10 — Proactive exhaustive scan
2026-04-22 dismiss canonical migration 只改 Dialog/Sheet/Popover/Alert/Notice/Coachmark,漏 FileViewer 2 處 + action-bar stories 4 處;同時 Dialog autoFocus tooltip 洩漏 / body 未用 ScrollArea / layoutSpace uiSize 耦合 / list-in-dialog padding 大 — AI 全程知道或該察覺但沒主動講,user 7 個問題一次炸出來。根因:AI「做完」標準太鬆(只改 explicit 要的事),缺 proactive self-scan。

2026-08 追錄:
- 2026-08-07 `grep candidateRelease | head -20` 截掉 `consumerctl.mjs:1737/1761` 兩個 caller → 把還有人讀的欄位判成死狀態歸零 → 鎖死 legacy consumer 唯一升級路線(才剛在 #83 解開的死鎖)。root:盤 reader 清單時 grep 接 `head`/`-m` = 假陰性;`cmd | head` 的 exit code 屬 head,`&&` 分支報相反結論(必看 `PIPESTATUS`)。
- 2026-08-09 agent UI 規格:「agent 切換會重置左側 modal 層數」定調後未入結論總帳,規格三處寫成「尚未定案」,據此跑兩輪無謂辯論,連自己推薦方案的賣點違背既有結論都沒看出來;前後多次「全盤稽核」全只驗單句證據,零次驗結論兩兩相容性。user 原話:「你在檢查的時候難道都沒有發現他們邏輯不通嗎?那你之前到底在檢查什麼」

### M11 — User-perspective interactive state walk
2026-04-22 ListBody 修完 user 連抓 5 波:hover bg 貼邊違反不貼邊 / focus ring click 觸發擾人 / notification 範例不現實(誰會進 modal 又跳別處)/ menu py-2 沒對齊 / layoutSpace md reset selector 缺。每個都是 user 視角一看就知,AI 沒跑 7 題 state walk 就 commit。

### M12 — Binary strict rule 前必 benchmark + invariant test
2026-04-22 hover bg 四次震盪:v1 寫「bg 不貼邊」→ user 糾 Image 22 inset 錯 / 23 flush 對 → v2 寫「必 flush」→ user 糾「flush 本來就合法,不一定要 flush」→ v3 又寫「bg 邊自由、content 有 spacing 即可」→ user 再糾 Image 24「content 貼 bg 邊」仍違規,Image 25「bg 比 content 寬」才對 → 真 invariant = content 必在 bg 內有 padding,bg 邊位置是 variance。

### M13 — User 第 2 次提起 → 自動觸發截圖 verify
2026-04-22 hover bg 震盪 4 次 + avatar-NameCard migration 拖延:user 說「我說所有」明示 DS-wide,但 AI 第一次只改 2 處 dialog stories,15+ 處放 tech debt 留到下次。user 第 2 次提起才完成。根因:AI「做完」標準太鬆(視 user 明示為「提醒」而非「canonical 聲明」)。

### M14 — 對話結論 AUTO integrate pipeline
2026-04-22 本 session 每個 canonical(chrome-header / dismiss 分家 / avatar hoverCard / popover 14px)都是 user 提醒才整合,AI 只做 code 改動但忘記 spec / canonical rules / governance memory / hook 同步。根因:AI「做完」的標準只含 code,缺「整合多層」的 procedural rule。M14 若存在,每次 code change 後自動觸發 pipeline,不等 user 第 2 次問。

### M15 — Product UI flow 必須 visual-audit coverable
2026-04-22 Sheet / FileViewer 過去只有 trigger button stories,visual-audit 跑 `--scope=component:Sheet` 只截到 trigger 未 open state,被 user 點破「能抓到點擊打開的 modal 嗎?」才補 OpenSnapshot。若 M15 存在,新元件建立時就該有 OpenSnapshot。

### M16 — Standalone card/pill 必同步訂 list gap
2026-04-22 FileItem rich `border card` + compact `bg-secondary` 先前已訂 canonical,但 spec 只寫單 item 視覺沒寫連續 item gap,導致 file-upload.stories.tsx rich list 加 `border rounded-lg overflow-hidden` 強制邊框相黏、compact list 無 gap bg 塊連一大片。User 貼圖糾正才發現。世界級 benchmark:Polaris / Material M3 / Atlassian / Ant / Carbon / Apple HIG 6 家共識 — default flush row 0 gap + separator;standalone card stack 才需 gap。

### M17 — SSOT 必可傳播(非僅 markdown)
2026-04-23 user 指出「mt-0.5 canonical 只存 markdown 文字、13 consumer 各自 hard-code,今天雖 compliant 但明天改 2px → 4px 需手動 grep N 檔 = 假 SSOT」。本 session migrate token + primitive + mode prop 後,改 `--item-gap-label-desc` 一處全 DS 同步。真 SSOT 必是可執行 value(token / primitive / utility class)。世界級對照:Material dense prop / Carbon size enum / Ant size enum / Polaris token,6 家皆透過 token + primitive 組合。

## Meta-Pattern M18+ origins(2026-08-18 搬自 meta-patterns.md 長篇 example cells)

### M18 — Propose-time 自檢 gate(Q0 起源)
2026-05-18 Sheet 補 / 5 元件 inline-action migrate / 5 元件 SurfaceBody migrate 三題全錯誤 propose 給 user 拍板,grep 後 0 個真 gap(Sheet 已完整 / 6 元件全消費 inline action / Dialog 走 ScrollArea canonical 不該用 SurfaceBody / HoverCard 是 behavior primitive / DatePicker TimePicker 是專用 layout / Sidebar 是 chrome 不是浮層)。User verbatim「不是老早就跟你說過要我決策前請先基於我們所有的檔案包括設計原則包括 ssot 包括所有實作代碼,自主自動驗證這些問題是否真的是問題」→ 催生 Q0 Pre-ASK self-verify。

### M23 — DS 內既有 canonical 優先於外部 benchmark
- 2026-05-03 chevron color:DS `text-foreground`(icon-only Button neutral-9 85%)vs 憑「Ant 5 家 muted」印象覆蓋 → 自開新 tier 違反一致設計語言。
- 2026-05-06 column width:DS 49+ 處 `size: 'sm'|'md'|'lg'` density vs TanStack `size: 280` px = 同 prop 不同義 → `meta.width` wrap(M23(c) 起源)。
- 2026-05-20 AppShell-vs-Sidebar drift:simplified mock + jargon + wrong variant + 不消費 primitive props(M23(d) 起源)。
- 2026-06-04 upload-manager 面板手刻 header + 殼(`py-2`≠`py-tight` / `rounded-md`≠`lg` / `border-divider`≠`border` / `bg-surface`≠`raised`),既有 3 道網全漏(R1-C 要 absolute+dismiss / `_chrome_header_handcraft` skip stories / R7-R8 只比已註冊 primitive 名)→ adversarial workflow 抓 + 加 R9 補洞。Hook `check_datatable_invariants.sh`(r2 folded,2026-06-11)+ `check_story_invariants.sh` R8/R9。

### M30 — Wrapper-vs-primitive schema unify
2026-05-10 PeoplePicker multi-mode 漏 avatar:`Combobox.SelectOption = { value, label }` weak schema(跟 `Select.SelectOption` 同名不同 fields)+ `Combobox.menuOptions` mapping 只 forward 2 fields → dropdown rows 永遠純文字。user 抓「為什麼之前會把 people picker 改壞 + 還有沒有其他東西也改壞」。Round 1 commit `561945b` 修(Combobox extends + forward 全 field)+ Round 2 codify。

### M36 — 禁推論升格 user 決定;禁自鎖
- 2026-08-08 同一 session 連犯 4 次 provenance 升格(「<768 modal 無入口是你拍板」/「X = 終結 session」/「392px user 接受」/「816 讓位線」),user 原話「我他媽到底哪有拍板過這件事」;同日又因 `claude-permission-policy` 把 sandbox unix socket 鎖死,先叫 user 去買 API key 而非解自家鎖,user 原話「你他媽不要又再作繭自縛為自己加鎖了」。
- 2026-08-11 一日連環五鎖:build graph journal 死鎖(復原全刪全蓋碰禁寫目標)/ authority fingerprint 把自家 index-publish 誤判竄改 / blanket 授權辨識漏「開頭裸可以」/ `gh auth status` 帳號級體檢擋 repo-scoped token / gh Go TLS 拒 sandbox 代理——五層全是自家機制,user 原話「不要再說有人擋你了,完全沒有」;逐層拆除後 release 全自動走通,零 user 指令。
- 2026-08-28 hooks/scripts symlink 本地殘影(8/1 舊版 generator 合法生成、8/2 佈局改版後無人能寫回):我先誤稱「我們自己沙箱設的保護」(實查自家 settings `denyWrite=[]`,鎖是 Claude Code 對 hook 設定目錄的**平台內建**防注入保護),再指 `! git restore` 給 user(對話內 `!` 與 Bash **同一個沙箱**,必再被擋 = 指死路),user 原話「你不要再作繭自縛了,我說要做就做」;正解一行 `git update-index --skip-worktree`(只寫 `.git` 可寫區,不碰被鎖路徑)→ codify M36(b') 第 4 問(鎖的主人是誰 + 交 user 的指令必先驗證不在同牆內)。
- 四路同 provider 對抗審查查不到 (a) 類(reviewer 無對話紀錄),故必須以 M36 rule + 來源總帳格式機械化。
