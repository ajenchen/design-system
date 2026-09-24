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
- 2026-09-23 「只有你能按」:重拍 visual baseline 要觸發 workflow,我憑上次的 403 記憶寫「我的 token 沒權限代按,是帳號層級的事」,叫 user 去 GitHub 按,連續 12 輪 30 分鐘監看空等;user 反問「為何你不能自己按」(而且他那台裝置根本沒登入,按鈕不會出現)。當場照 M36(b') 逐題探:workflow_dispatch 403 是真的,但**同一把 token 發 repository_dispatch 回 204**——擋住的不是帳號權限,是我們自己的 workflow 只監聽按鈕事件(第 3 問「有沒有已驗證可通的等價傳輸」從沒問過)。正解:workflow 多聽 `repository_dispatch: types:[visual-regression-run]`,三種觸發的輸入收斂到 job env 兩個變數。**憑記憶宣稱被擋 = 沒有探;宣稱前的四問要每次重跑,不能沿用上一次的答案。**
- 四路同 provider 對抗審查查不到 (a) 類(reviewer 無對話紀錄),故必須以 M36 rule + 來源總帳格式機械化。

## 失敗記憶索引搬家(2026-09-21)

repo 根的治理 bootstrap 檔,其 root→cwd 合併鏈超過預設 32KiB 上限(41252 bytes),超過就**靜默截斷**——
整份治理內容會被砍掉一段而沒有任何訊號。這條規則 bootstrap 自己就寫著,
而抓它的 `check-agents-bootstrap.mjs` 從來沒有任何執行面呼叫它。

依 canonical(「新 bug → 歸 Meta-Pattern OR 索引表 1 行」+ meta-patterns「具體 bug 歷史詳解移到本檔」),
把下列幾列的 narrative 逐字搬來,bootstrap 只留**判準一行 + 指標**。一個 invariant 都沒有刪。

### 工具靜默陷阱(rsync 等長同秒 / rg 黏寫 flag / mktemp 失敗回空)

| 工具靜默陷阱:`rsync -a` 等長同秒跳過 / `rg` 黏寫 `-rn` 的 `-r`=replace / `mktemp -d` 失敗回空 → `cd ""` 原地 → trap 刪掉 cwd | 必 `--checksum`、flag 分開寫;mktemp 後必 `[ -n "$V" ]` + `[ -d "$V" ]` 才可正規化／註冊 cleanup(2026-07-28)。**2026-09-18 beta.134 再犯**:consumer mirror 的 `package-lock.json` 換版號後與舊版**完全等長**(版本字串／resolved URL／integrity base64 三者都是固定長度,實測 292873 bytes 不變),clone 又與生成落在同一秒 → rsync 靜默跳過、lock 沒進 commit,直到 consumer 的 `npm ci` 才炸。**上游那句 `✓ lock pins the exact released version` 還是綠的,因為它驗的是來源那份、不是真的被複製過去的那份 —— 綠燈驗錯對象比沒有綠燈更騙人**。規則早就寫了、三處也遵守了,第四處漏掉 → 機械化 `scripts/rsync-checksum-invariant.mjs`(CI required,對照組用合成檔且必須只紅在合成檔上)。**2026-09-20 同一條的第二種形狀:驗了「怎麼判」,沒驗「判的那個值怎麼來」**——發版同意改綁分支後,判定表 8 格全綠、`npm run test:release-consent` 全綠,但餵給它的 `productVisibleFilesChanged` **恆回 true**(自家 helper `run()` 回 `{ok,stdout,stderr}` 沒有 `status`,寫成 `diff.status !== 0` 就是 `undefined !== 0`,恆真且零報錯),整個修正從第一天起是死的,是我刻意去驗它才抓到。**吃參數的純函式,參數邊界就是測試的天然盲點**:判定表把值當輸入,於是永遠測不到算那個值的程式。判準:純函式測試通過後,必再問「這個參數在正式流程裡是誰算的,那支有沒有被測」,並用**真實資料**(真 git commit、真 API 回應)跑兩面對照 —— 該 true 的一筆、該 false 的一筆,兩邊都找得到才算數,找不到對照組要 fail 而不是空跑當綠|

### 量 focus 顏色不等 transition

| 量 focus 顏色不等 transition = 量到過渡中間值 | `transition-colors` 的 transition-property **含 `outline-color`**;聚焦後立刻 `getComputedStyle().outlineColor` 會抓到中間值(量到 currentColor,看起來像「焦點框顏色壞了」)。2026-09-08 差點據此寫成「全 DS 焦點框失效」,等 600ms 後三個元件都回主色。**凡量 focus 顏色先等過渡**;另 `document.body.focus()` 不重設 Tab 起點(body 不可聚焦),Tab 會從上一個聚焦元素繼續往後走,要重設只能 reload |

### 拖曳 vs 點擊的判準(輸入代理會丟 move、延後 click)

| 拖曳 vs 點擊只靠「收到幾個 pointermove」或「setTimeout(0) 內吞 click」= 輸入代理 / 遠端隔離環境靜默失效 | 代理會丟掉 / 合併 pointermove、讓 click 晚一個 task 送達;本機 Chromium 兩者都成立所以永遠重現不了(2026-09-16 FAB「拖一下就開面板」,程式碼自 9/8 起零改動)。判準必是**放開點離按下點的距離**,吞 click 的旗標由**下一次 pointerdown** 才清,鍵盤合成 click(detail 0)放行;閘 `scripts/agent-fab-drag-click-invariant.mjs` 用合成事件造「晚到的 click」與「0 個 move 放開在 80px 外」 |

### git commit 指定路徑的部分提交會鎖住 index

| `git commit -- <路徑>`(指定路徑的部分提交)會讓治理 pre-commit 掛掉 | 錯誤訊息是 `authority generation index publish could not stage:hooks/scripts`,看起來像沙箱權限問題,其實是**部分提交模式下 git 自己鎖著 index**,hook 裡的 `git update-index --cacheinfo` 拿不到鎖。同一個 `update-index` 手動跑 rc=0。正解:把要的東西 `git add` 進暫存區,然後跑**不帶路徑**的 `git commit`;要排除某個檔就用 `git update-index --cacheinfo <HEAD 的 blob>` 把它還原成 HEAD 版(2026-09-18) (以下逐字引用的歷史紀錄提到 provider view,**那是 generated delivery view,不是 canonical authority、不得當 SSOT**) |

### 寫了閘卻沒有任何執行面呼叫它

| **寫了閘卻沒有任何執行面呼叫它** | spec 寫「由 `xxx.mjs` 機械強制」、腳本存在、甚至有包裝測試 —— 但 CI / npm script / hook 都沒提到它,那條保護是假的而且**零訊號**。2026-09-18 機械盤點:`scripts/*.mjs` 有**大量**名字像閘/測試卻不可達(把 CI + package.json + hooks + skills + infra/test 全算進來之後)。**確切數字不在本檔硬寫** —— 它會隨棘輪往下走,SSOT 是 `scripts/gate-reachability-baseline.json`(2026-09-20 prune 抓到本檔與 ci.yml 都還停在舊值 94,而 baseline 已是 93;2026-09-21 再降到 4)。**2026-09-21 補的第三種形狀**:量具把「被字面提到」當成「會被跑」的替身 —— 動態探索出來的執行路徑(`run-gate-meta-tests.mjs` 掃 pair、`run-harnesses.mjs` 讀 harness inventory)沒有任何地方會寫出被跑者的檔名,於是 63 支每晚真的在跑的測試被誤判成孤兒。閘要模出真正的執行路徑,不是只 grep 字串。同族錨例:推播閘(hook 在、6 個情境測試全綠,但真實入口被 `requires: peer-cli` 擋掉,從沒跑過)、native/custom parity 閘(只掛非 required 的 nightly)。**判準**:寫完任一支閘立刻問「誰呼叫它」,grep 執行面拿不到答案就等於沒寫。棘輪閘 `scripts/gate-reachability-invariant.mjs`(CI required)鎖 baseline,新增孤兒立刻紅。**同族第二種形狀(2026-09-19)**:文件講的那道防線**檔案根本不在**——hook home 自己的 README 在 Stop 區列 5 支 hook,其中 3 支(`stop_harvest_corrections` / `stop_capture_metrics` / `stop_meta_self_audit`)早在 2026-05-13 就折進 `stop_passive_logging.sh`、檔名已不存在,而「折進去」這件事就寫在同一張表的**上一列**。閘 `scripts/hook-citation-liveness-invariant.mjs`(CI required):文件提到的 hook 名必須存在於 canonical hook 樹,否則該行前後 3 行要明講它是舊名/已折/未實作 |
### 排程／手動 workflow 換了執行環境,PR 階段沒有任何 job 用同一個環境跑同一段命令(2026-09-23)

Visual Regression 改成在釘死的 Playwright 容器裡跑之後,連續兩次都是 user 親手按下去才紅:#288 簽出旗標 `lfs: true` 在容器裡沒有 git-lfs(36 秒死);#289 第一步安裝依賴就死 —— closed git 為了 hermetic 把 HOME 與 global config 全遮掉,把 actions/checkout 寫進 global 的 `safe.directory` 也一起遮掉,而容器裡執行者是 root、簽出目錄屬 uid 1001,`git ls-files` exit 128「dubious ownership」(錯誤訊息當時只印 exit 碼,stderr 沒帶出來,根因是從容器身分反推的)。**同一種病**:「閘存在」≠「有人跑」的環境版 —— 命令在 runner 上綠不代表在容器裡綠。修:(1) closed git 只把呼叫端指名的 cwd 與**同擁有者**的祖先列成 `safe.directory`(command scope,不是 `*`;`closedGitSafeDirectories`);(2) `ci.yml` 新增 `container-closed-git` job,用**同一個映像**每支 PR 跑那條 workflow 開頭的命令 + `scripts/closed-git-foreign-owner-invariant.mjs` 三面對照組(裸 git 必拒 / closed git 必通 / 上層 `.git` 是別人的仍拒);(3) fingerprint 的錯誤訊息帶 stderr 第一行。判準:**任何只在排程／手動 workflow 裡出現的執行環境(容器映像、runner 標籤、簽出旗標),PR 閘裡必須有一個 job 在同一個環境跑它的開頭命令**,否則環境設定的錯要等下次排程或 user 才會被看見。

### `tsc -b` **在本 repo 的 composite 設定下根本不檢查 DS 原始碼**

| `tsc -b` **在本 repo 的 composite 設定下根本不檢查 DS 原始碼** | 不只是「不 emit declaration」——2026-09-06 實證:`data-table.tsx` 少傳一個必填 prop(TS2741),`npx tsc -b --force` 回 **0**,`npm run build:lib` 才報錯。**「tsc -b 通過」不構成型別正確的證據**,任何 .tsx 改動的型別驗證一律以 `npm run build:lib` 為準 |

### hook 測試直跑留 fixture `.git/` 進 corpus

| hook 測試直跑留 fixture `.git/` 進 corpus | `git status` 不顯但 snapshot tree fingerprint 全算 → trio 漂移;測試必經 run-all.sh(自帶隔離),清 debris 用 `find -type f` 對照 `git ls-files`(2026-08-05) |

### SMIL `begin="indefinite"` 動畫掛上後沒人 `beginElement()` = 永不起跑(靜默)

| SMIL `begin="indefinite"` 動畫掛上後沒人 `beginElement()` = 永不起跑(靜默、base 值定格) | begin-once 守衛的觸發 key 必含每個會新掛動畫的狀態段(think→exit 同 key 漏掉 7 個 animate);驗證看 `getStartTime()` 是否丟例外,CI C6(2026-09-03) |

### `file://` 開 storybook = story 整個不渲染而且不報錯

| `file://` 開 storybook = story 整個不渲染而且不報錯 | CORS 擋掉模組載入,`#storybook-root` 子節點 0、畫面空白,探針卻拿得到 Storybook 自己的 UI(「Set string」按鈕)而誤以為有渲染。瀏覽器閘一律起本機靜態站。同場:CSSOM 對含 `var()` 的簡寫回**空字串**,用 `r.style.outline` 掃規則會全空,要用 `r.cssText`(2026-09-08)|

## M37 第十種形狀:發布鏈上「這個名字／這筆記錄存在」被當成「那件事真的發生了」(2026-09-21 → 22,一次「發版」裡 **11 個位置**)

使用者說一次「發版」,我以為是一步。實際上同一條規則在發布鏈上連續發作 11 次,
每一次長得都不一樣,而且**第 2 個以後幾乎都是在修前一個的那次跑裡才現形**(M10:修同族要當場列完同族)。
共同形狀:拿一個**名字、一筆記錄、或一個當下剛好成立的觀察量**,當成它所指的那件事。

| # | 要保證的性質 | 實際量到的值 | 何時分開 | 後果 |
|---|---|---|---|---|
| 1 | protected main 上這份內容已發布 | 這個版號字串有對應的 GitHub Release | 版號沒 bump | 五步全報 complete、exit 0,**一個位元都沒發出去** |
| 2 | 這個 head 通過 CI / 已在 main 上 | 這條分支有一個 PR / 那個 PR 是 MERGED | PR 合併後在同分支續推 commit | pr-checks + merge 讀**別份內容**的綠燈全綠 |
| 3 | tag 指的那個 commit 帶著這個版號 | tag 的名字 | bump 還沒併進 main | 在版號為 beta.140 的 commit 上建了 `v0.1.0-beta.141` |
| 4 | 守護 main 的 CI 通過了 | 那個 commit 上**所有** check-run | 發布流程自己失敗過一次 | main 看起來永久紅 → 自鎖;且指控「main CI 紅了」而 main CI 其實是 success |
| 5 | 這份發版授權被消耗掉了 | 帳本裡有一行 | 發布被中斷／失敗 | 一次失敗的嘗試燒掉授權,使用者被迫再說一次「發版」 |
| 6 | 要比的基準是線上目前那一份 | 最新的 tag | 建了 tag 但沒發成 | 拿從來沒出貨的東西當基準,印出與事實相反的「會不會改變畫面」 |
| 7 | 這個 head 的 CI 會有結果 | 必過項清單裡還沒有紅的 | PR 與 main 衝突(squash 分岔)→ GitHub 建不出合併 ref,**CI 一次都不觸發** | runner 每兩秒重試,結構上永不收斂,空轉十幾分鐘 |
| 8 | 那一輪 CI 過了 | 那一輪沒有失敗 | job 撞到 timeout-minutes → GitHub 回 `cancelled` | 「沒有裁決」被講成「main 壞了,先修 main」;報告端另寫一份較窄的紅燈條件,連名稱都篩不出來 |
| 9 | 這一版的鏈接得上前一版 | provider lifecycle 帳本最後一筆 | bump 了卻沒發成(beta.141) | beta.142 宣告前一版是從沒發布的 141 → WM 升級交易 GOV-UPGRADE-007,**發出去卻沒人裝得上** |
| 10 | incident release 可以發 | 授權只接在 publish | 要救火時 merge 先擋 | 「這份同意已經用在 beta.142 上了」→ 救火反而得再要一次同意 |
| 11 | 這一版的鏈接得上 consumer 手上那一版 | 線上**最新已發布**的版本 | 發布了卻沒人裝得上(正是 #9) | **為了防 #9 而加的閘,自己用同一種方式犯錯,擋掉正確的修復** |

同一天、同一條規則,還在**量具**上發作四次(它們不在發布鏈上,但同根):
- `data-table-scroll-cost` 的 1px 段用「過了 2 個 rAF」當「已達穩態」、「窗口總數」當「捲動成本」,慢的 runner 上假紅 154.1(**9/18 出現過同一個數字**);而 9/18 加的「超標再跑一次開追蹤」診斷從沒產出過線索 —— 暫態等到再跑一次時早就過去了。改成等每幀增量連續 3 幀相同 + 捲動窗口減不捲動窗口,三面對照組(掛載暫態 / 捲動引發的真回歸 / 與捲動無關的背景噪音)。
- `release-workflow.test.mjs` 把「最新兩個 tag」當「9/20 量過的那一對」,多了一個 tag 就在零改動下變紅;本機沒 fetch 到新 tag 所以綠、CI 抓 tag 所以紅。改成指名那一對,找不到以儀器失效的名義紅。
- **視覺回歸週跑連紅六週沒人看見,而紅的不是產品**(2026-09-22):curated baseline 是 7/28 在 runner 映像 20260720.247.2 拍的;8/5 最後一次綠,8/12 起 runner 映像每週更新(20260810.271.1 → 20260907.300.1),Playwright 鎖定 1.59.1 兩邊相同,25 張「超標」的差異圖**全是字緣、零區塊變動** —— 「截圖等於 baseline」被當成「產品沒變」,渲染器一浮動兩者就分開。而且它只排程、不進 PR,所以六週紅燈沒有觀眾。本機更不可比(macOS 字型 vs Linux;沙箱又擋 picsum / pravatar,圖片型場景直接 68%)。修:視覺 job 釘到 `mcr.microsoft.com/playwright:v<lock 版本>-noble` 容器(scope test 斷言 tag 等於 lock),`release:status` / `release:auto` 印出最新週跑結論(只講不擋),重拍 baseline 走 `workflow_dispatch` 的 `update_baseline` 輸入 → artifact → PR(接受新圖是產品語意決策,要拍板)。判準:**任何 pixel 比對閘,先問渲染器是誰、有沒有釘死**;跨主機／跨映像的比對無效(M32(h) 同族)。
- 我自己掛的監看:`release:status --json` 的 stdout 被一行人話診斷汙染成不可解析,python 失敗被 `|| true` 吞掉,30 分鐘零事件 —— 而零事件看起來跟「沒有變化」一模一樣。診斷改走 stderr;監看解析不出來時明講「監看壞了,不是沒有變化」。**隔天(2026-09-23)同一條再犯**:等 user 按 Visual Regression 的監看器,解析器是 f-string 裡帶反斜線(Python 3.9 直接 SyntaxError),`2>/dev/null || true` 把錯吞成空字串,**連續 12 輪、六個小時零事件**,我每輪都寫「屬預期的安靜」——user 真的按了(run #290)我也不會看見。判準升級為機械式:**任何監看第一次輪詢必印心跳(把當下狀態印出來),解析器 stderr 併進 stdout,空結果印「MONITOR-BROKEN」而不是沉默**;監看器本身是量具,寫完先「弄壞它會不會出聲」。
- **供應鏈閘把 registry 算出來的字串釘成身分**(2026-09-22 → 23):`npm` 那筆 metavulnerability 的 range 是 registry 依 npm 的**版本清單**算的,上游 17:11Z 發 12.1.0(帶修好的 tar),尾巴從 `>=12.0.0-pre.0.0` 變成 `12.0.0-pre.0.0 - 12.0.2`,閘 `finding.range === '<整條字串>'` 於是 17:16Z 起讓 main 與每一支 PR 的 CI 全紅,**零曝險變化**(overlay 早就裝 tar 7.5.22)。2026-08-28 那次 re-score 已經用「重釘字串」處理過一回 —— 同一條規則第二次咬人就代表釘的東西是代理:要保證的只有「治理版 11.19.0 仍受影響 / 下一個 patch 已不在範圍 / 只經 tar」三件,改成直接驗這三件(`metavulnerabilityRangeCovers`,最小子句求值器 + 判定表),12.x 尾巴隨上游怎麼變都無關。附帶:閘的每個 mismatch 現在都印實際形狀 —— 這次本機系統 npm 的 audit 對這幾筆回的 range 是空字串,真正的新字串只有治理版 npm(11.19.0)跑同一條指令才看得到。
- **重拍 baseline 走了五趟才到底**(2026-09-23,run #291 → #295,每趟往前一步):#291 歷史參考樹撞今天的弱點庫 → render-only 政策;#292 參考樹沒有 Chromium(`PLAYWRIGHT_BROWSERS_PATH=0` 各樹各裝)→ 重拍前自己裝;#293 參考樹用它自己八月版的截圖腳本,結束碼把「對舊 baseline 破預算」算失敗 → 結束碼政策抽純函式(重拍模式只有 render error 才紅)+ 儀器用今天的、內容用參考樹的;#294 歸因報告的裸 git 在容器裡撞 dubious ownership + 淺層簽出沒有 reference..HEAD 的歷史 → 改走 closed git + fetch-depth 0;#295 成功:identical 103 / within-budget 14 / approved-change-candidate 7,**穩定性再比 0 張超標**。每一步都是「在 runner 上綠、在容器裡紅」的環境差,而 PR 階段的容器 job 只跑開頭幾步 —— 判準:**一條只有排程／手動會跑的長 workflow,第一次在新環境跑到底之前,不要把「前幾步過了」當成「整條會過」**;每一趟都留下對照組與測試,下一次換環境不必再走五趟。
- **同一天,兩個閘在一個零執行期改動的 PR 上紅(#159,前十次 CI 全綠)**:(a) 治理測試「optional transcript 寫入器持續追加 → exit 2」——期待值建立在「寫入器每 1–2ms 追加、runner 擷取窗更短,所以永遠抓不到靜止切面」這個**時序代理**上;寫入器被事件迴圈延遲一下,runner 拿到合法的靜止切面、尾 600 行含 canonical Read → 放行(0)。修法是讓期待值不依賴賽跑:Read 之後墊 700 筆完整記錄,兩條合法路徑都必然 2。(b) 表格列 hover 閘「捲動後 hover」7 個可用樣本中位 17ms,卻有 3 次「1.5 秒內沒變色」而判 lost(產品沒變色)——同一份程式在 10 分鐘前的 main 上綠;那一輪串流**靜置期**送幀間隔最大 1231ms(門檻 1500ms),機器在卡頓。現行政策只把「零幀」算儀器看不到,「有幀但機器卡到 hover 事件 1.5 秒內沒處理」仍歸產品。**尚未改政策**(單次觀察、且真 bug 的樣態與此相同,只靠幀有無分不開),先記下數據;再犯就要把「靜置期抖動超過門檻的一輪」以儀器失效名義紅、或對 lost 樣本重量一次,而不是指控產品。
- **把 AI 抄成文件的程式行為當成「規則」,差點反著修(2026-09-23,M36(a) 的新形狀)**:重拍 baseline 看到日期區間中段 hover 有藍圈,我查到 `date-grid.spec.md` 寫「中段 hover ring 一併被壓制」、`date-picker.spec.md` 寫「無 hover 預覽」、story 說明寫「不出現第二層 hover ring」,就對 user 說「設計系統自己的定案是:中段 hover 不畫圈」並備好一行修法。user 反問「規則真的這樣說?確定是我說的?」—— 逐條 `git log -S` 查:三句分別是 2026-06-05「DOC_STALE 文件對齊 code」批次、07-05 deep-audit 對照套件原始碼、08-02 跨模型稽核(#28)寫的,**零 user 原話**;它們只是把當時程式「沒做預覽」抄成了規範。而 user 真正要的是反方向:停留時預覽「點下去會變成」的區間(五家世界級一致)。**判準**:文件裡一句沒有出處的「必 / 禁 / 一併壓制」,在拿它當「定案」之前先問「這句是誰、依什麼決定的」——`git log -S` 三十秒就有答案;答不出 user 原話或 benchmark,它就只是「程式現況的描述」,不是規則,更不能拿它去指控產品或反著修。與 M36(a)「規範的理由也要引得出原文」同根:那條管「理由」,這條管「規則本身」。
- **重拍第六趟(同日,run #297,第一次用 target_ref 拍 PR 分支)**:HEAD 新增三則區間預覽 story,今天的場景清單蓋進 8/5 的參考樹後拍到 story 404 → render error 3 → 重拍模式唯一會紅的條件成立,整條紅。「HEAD 有、參考沒有」是正常的產品演進,不是儀器壞掉;修法是參考樹只拍它自己有的場景(用它建好的 `storybook-static/index.json` 過濾今天的清單,`scripts/visual-manifest-intersect.mjs`),差集交給歸因報告標 new-scenario。判準:**兩棵不同時間的樹共用一支儀器時,儀器的輸入(場景清單)要以「兩棵都有」為準,不是以「今天」為準**。同一批修改順手把歸因報告檔頭寫著「suspicious / unmapped / missing-new 出現即 exit 1」但程式從未執行的那條落實(M37 第八形狀的近親:註解裡的斷言)。
- **同日第三次 runner 卡頓誤紅(PR #161 第一輪)**:DataTable dpr1 perception 閘印「5 次都碰到擷取送幀缺口:這台機器目前擷取不完整(不是表格);各次最長缺口 87 / 77 / 92 / 107 / 113ms」—— 閘自己已正確指名儀器、不指控產品(這正是 M37 要的),只是同一天第三次撞到慢 runner;治理 token 沒有 actions:write 不能重跑單一 job,只能再推一個 commit。**一天三次**已經不是單次觀察:PR 階段的 perception 類閘在慢 runner 上的誤紅率需要量化(從 CI 歷史抓最近 30 次的 runner 卡頓判定次數),決定是「在 job 內自動重跑那一支」還是「移到排程 lane」——這件事還沒做,登記在此免得又變成沒人看的紅燈。
- **把產品選項用散文＋artifact 列出來,再教 user 打通關密語(2026-09-23,M36(b) 的新形狀)**:填色日期格的焦點線我做了 C / D 兩張圖放在 artifact 裡,user 回「我會想要選D,因為 c的白線幾乎要切到文字了,你覺得呢?」—— 核准閘擋下所有 tsx 編輯(`EXACT_UI_UX_TARGET_BINDING_MISSING`:答案裡沒有 target 名、而且是問句),而我前一輪已經寫過「你的下一句話裡帶「三、四照修」,閘就放行」= 教 user 打我自己的閘的通關密語,是自鎖的變形。閘自己的註解(`approval-evidence.mjs` 2026-09-12 撤回段)早就寫著:擴充核准語彙讓自己通過是自己批改自己的考卷,**真正的核准通道是 provider 的結構化選擇題工具**(harness 把 assistant 的題目原文與 user 選的選項一起記進 transcript;target 綁定來自 assistant 提案文字 + user 選的那個選項)。正解:先回答問題(同意 D 與理由),再用結構化選擇題把「DatePicker / DateGrid … styles/base.css」寫進題目、D 放第一個選項 —— user 一鍵,三個檔的編輯全部放行。**判準**:凡要 user 在產品選項間拍板,一律結構化選擇題(題目裡寫 target 名),不用散文列選項再等 user 打字;「請你回一句 X」出現在 reply 裡就是自鎖訊號(Mechanism 10 管的是被擋後交指令,這是它的前一步)。
- **單格 hover 圈先閃一圈再變半圓(2026-09-23,M12 root-layer 修法)**:單格圈是 CSS `:hover`(指標一到就畫),框是 React 狀態(慢一幀),壓制圈的 class 掛在「停留後才出現」的 preview modifier 上,於是每次停留都閃。surface 修法是想辦法讓 React 更快;root 修法是壓制不能依賴慢的那一邊 —— 用「這一天停留會不會有框」當靜態 modifier(直接餵同一支純函式 `computeRangePreview`),停留前就掛好;順序不合與兩端都空時不掛,單格圈照畫。
- **「離開單格」被當成「離開日曆」(2026-09-23 晚,M37 代理;user:「從某日水平移動到其隔日,藍色的區間框線都會閃動一下」)**:停留日掛在 button 的 mouseenter / mouseleave,格間 4px `border-spacing` 縫隙屬於 table;指標跨格只要有一次 mousemove 落在縫裡,瀏覽器先送 leave(停留日清空 → 17 格的框一次卸掉)、下一幀才 enter(補回)。慢速滑動(≤ 240px/s)幾乎每次都踩進縫隙,直接跳格不閃 —— **這正是既有閘看不到它的原因**:`locator.hover()` 是單步(Playwright `steps=1`),永遠走 React 把同一個 mouseout 的 leave+enter 批成一次 commit 的路徑(M32「儀器要先有對照組」:閘在該紅的時候不會紅)。框的畫法早就用 −2px 跨縫把線接起來,命中幾何卻沒跟上 —— 修法讓 hit = paint:day button `::before` 外擴 2px;閘補「30 小步跨格逐步量框最少幾格」對照組(selftest 把 ::before 縮回 0 就紅)。世界級沒有任何一家在有縫隙的格子上做逐格 leave 清除(Ant td 相連;MUI 只在離開整個日曆才清;flatpickr 只 enter)。
  **2026-09-24 後續(同一條 bug,修法被換掉)**:那個 `::before` 是**表層**解 —— 閃動的根因是「停留日在縫裡被清掉」,
  幾何外擴改的是「縫裡有沒有人收 enter」。而且它名義 2px、**實測最遠外推 9.33px**(`::before` 是方的,
  把 `rounded-full` 圓四角外面也吃進命中區),違反 hit-area-canonical「懸停回饋的形狀 ≡ 命中區」,
  日期格既非線也非點吃不到例外。改成同一段註解自己就引到的 MUI 作法:**只在指標真的離開整張格陣時才轉發 leave**
  (`date-grid.tsx` 的 `data-day-grid` + `handleDayMouseLeave` / `handleGridMouseOver`)。
  閘的對照組也跟著換成「拔掉 `data-day-grid`」—— 舊那行 CSS 打在一個已經不存在的 `::before` 上,
  會變成永遠不紅的假對照組(這正是本條自己記過的 M32 病)。
  過程中還踩到兩個坑:(a) `MonthGrid` 覆寫寫成 render 內的 inline 元件 → 每次 render 都是新 component type →
  整個格陣 unmount/mount → React #185「Maximum update depth exceeded」,storybook 白畫面;
  (b) 只擋「還在格陣裡」不夠 —— 指標穿過縫之後停在**不可點**的日子時,disabled button 收不到滑鼠事件、
  不會再有任何 day enter/leave,上一天的預覽框會留著,`datepicker-range-preview.mjs`「順序不合不預覽」兩條因此紅;
  補 `handleGridMouseOver` 才收斂。**兩個坑都是閘先抓到的,不是自己看出來的。**
- **outside × range 從未被寫進疊加清單,code 憑 `!important` 決定了結果(2026-09-23 晚,M5 缺口 + M10 同族漏掃)**:user 圖一「五月的區塊非五月沒有變成該有非當月的樣式?…我怎麼印象中我們有討論甚至修正過類似的東西?」—— 全 repo 與 git 全史找不到任何 user 對「鄰月 × 區間」的原話;range 中段的 `[&>button]:!text-foreground` 是 2026-04-21 為了壓過 RDP range 模式中段自帶的 selected 白字加的,2026-05-03 改 mode="single" 自管區間時原封抄過去,任務已消失卻留著,`!important` 不看特異性,所以鄰月的淡字選擇器((0,3,1))照樣輸給它 → 鄰月日子一進區間就全深、起點藍圓在兩個面板各畫一次。user 記得的那次是 2026-09-07 outside × disabled(「明明都是 disabled 的日期,有些日期的文字比較深有些比較淺」),只修一對、沒掃同族。世界級五家兩月並排時沒有任何一家讓鄰月重複格吃到區間樣式(MUI / Polaris / flatpickr 不渲染,Ant 鎖在當月格),user 拍板「兩月時不顯示鄰月日子」(DateGrid 強制,MUI 同樣忽略 consumer 設定)。判準:**任何 `!important` 都要問「它壓的是誰、那個對手還在嗎」**,對手消失就拆,否則它會在別的疊加組合裡靜默勝出。
- **示範一載入就有鍵盤焦點框,第二次被抓(2026-09-23 晚;第一次 2026-09-08 只收了原生控件)**:user「我不要用滑鼠看範例結果直接就看到鍵盤焦點,我當下明明就沒有用鍵盤操作」。根因逐字讀 Chromium:只有真正的指標點擊會把上次聚焦來源記成滑鼠(`mouse_event_manager.cc` FocusType::kMouse),script focus 不更新(`document.cc`),合成點擊(userEvent.click 的 mousedown + focus() / element.click())之後元件自己 autoFocus 就落在 `!last_focus_from_mouse` 那一側。同一支 story 對照:真指標點擊 → 無框;`element.click()` → 有框。前 500 支 story 機械盤點:34 支載入即 `:focus-visible`,非刻意且畫得出線的 10 支(DatePicker 4 / Dialog 4 / Calendar 1 / DateGrid 1);截圖儀器 `visual-audit.mjs` 用 id regex 決定誰保留焦點、把不含關鍵字的 story 焦點 blur 掉才拍,所以**基準圖裡沒有框、Storybook 裡有框** —— 儀器把 user 看得到的東西擦掉。修法不逐支:預覽層 `settleDemoFocus`(每支 story 渲染完放掉畫得出線的鍵盤焦點,之後直到使用者第一次按鍵前程式再搬來的也放掉;`parameters.demoFocus='keep'` 宣告例外)+ 全 story 閘 + 儀器那份 regex 規則拆掉(M17)。**同日的兩個反覆**:(a) 第一版只在收尾量一次,全掃抓到 dialog long-content / list-body / tabs state-contract 三支在收尾之後才被 Radix 還焦點 / Dialog 聚焦捲動區 → 改成監聽到第一次按鍵;(b) 第二版全域開啟,結果 12 支用 `page.focus()` 量焦點框的閘會被它放掉焦點(區間閘鍵盤段當場紅:程式聚焦被放掉、方向鍵落在 body)—— **示範收尾是給人看的層,儀器不能吃到它**:只在管理介面的 iframe(`window.parent !== window`)或帶 `?demoFocus=on` 時才開,直接開 iframe.html 的儀器預設關,要拍「user 看到的畫面」的 visual-audit 自己帶 on。2026-09-08 那次把「用滑鼠開 modal 出鍵盤框」收成「禁原生 `<button>`」,是把一個實例當成類別 —— 同一族第二次才找到根因。
- **「hover ?? focus」把一個沒人決定的優先順序寫進了程式(2026-09-23,同 M37 代理)**:第一版用兩個變數、滑鼠恆優先,結果滑鼠停著時方向鍵怎麼按框都不動。要保證的性質是「框在最後一個輸入的那一天」,拿來判斷的卻是「滑鼠有沒有值」—— 兩者在「滑鼠停著、鍵盤在動」時分開。修成單一 anchor + 來源標記,各自只清自己設的,滑鼠離開退回鍵盤焦點;閘 `datepicker-range-preview.mjs` 的互搶段在舊版必紅(對照組)。
- **對照組只看「總數有紅」,一家量不到的假量具混在別家的紅裡過關(2026-09-24 發版前審查抓到,M32「儀器要先有對照組」的第二層)**:區間閘的 selftest 同時弄壞框 / 焦點 / 跨縫 / 鄰月 / 單月五樣,判定卻是 `fail > 0` —— 框那家紅了 74 條,跨縫那家**一條都沒紅也照樣綠**。而它真的量不到:跨縫段前一段留著鍵盤焦點 5/5,指標一離開格子預覽就退回 5/4→5/5 兩格,「最少幾格」永遠 ≥ 2,縫隙裡整條框消失的那一幀在儀器眼裡不存在(把 `::before` 縮回 0 也不紅)。修:每條斷言標家族、selftest 要求**每一家各自至少紅一條**;跨縫前先放掉鍵盤焦點並斷言「沒有任何框」。判準:對照組弄壞 N 樣,就要 N 個各自的紅,總數是假的。同一輪第二條:預覽層的示範收尾聽的是 iframe 自己的 keydown,鍵盤使用者從管理介面按 Tab 進畫布時 keydown 發生在**父文件**、iframe 只收到 focusin → 第一顆元素的框被當成程式搬來的放掉、第二次 Tab 才留得住。修:同源時一併聽父文件 keydown;對照組用管理介面真按 Tab(`parent-tab` 探針,第一顆必保住框)。
- **發版信號印了五次沒人讀:`release:status` 從第一次讀回起就印 `publish stale-version`,我當成正常狀態,合併後機器才說「版號沒 bump,沒有東西可發」(2026-09-24)**:內容 PR #160 沒帶版號,只好再開 #162 補 beta.145 再合併一次。判準:內容 PR 開著的時候 `release:status` 的 publish 列若是 `stale-version`,就是這個 PR 要帶 bump(`packages/design-system/package.json` + `node scripts/sync-version-to-all-manifests.mjs`);印出來的信號沒有被讀到 = 沒有信號(M37)。同一天第二件:#162 併進 main 後,main 那一輪的 dpr2 job 在任何閘之前死在 `npm audit` 的 advisory 端點 `read ECONNRESET`(runner 網路),required fan-in 紅;PAT 沒 `actions:write`,`rerun-failed-jobs` 與 `workflow_dispatch` 都 403 —— **拿到新一輪 main CI 的唯一路徑是再合併一個 PR**。根治不是再合併一次,是把暫時性網路錯誤在 `runVerifiedHighVulnerabilityAudit` 重試 3 次(退避 2s/4s;真漏洞與格式錯誤不重試;用盡仍 fail closed),判定抽成 `isTransientAdvisoryEndpointFailure` 純函式,測試兩面對照。
- **自己前一天才寫的閘,犯了 M32 第四題(2026-09-24,main 09d2eaa2 第二次假紅)**:`story-demo-focus-invariant` 用「根節點出現 + 900ms」當「play 跑完」的代理。同一份建置在 PR 上剛綠、本機 1042 支全綠;main 那一輪 runner 慢,Toast 朗讀區域 story 的 play 還在用合成點擊按第四顆按鈕(瀏覽器判成鍵盤焦點)閘就量了 → 指控一個不存在的問題。而 9/20 那條錨例(action-bar-toolbar 900ms)我三天前才讀過、同一天還修了它的同族。判準沒變:**等那件事本身**——preview.tsx 的 afterEach 跑完才蓋 `<html data-demo-focus-settled=<story id>>`(Storybook 的 afterEach 排在 play 之後、每支都跑),閘等這個章;證明與機器速度無關:selftest 把 CPU 節流 30 倍開同一支 story,「根節點 + 900ms」時章還沒蓋、等章再量乾淨,兩面都要成立。同一輪誤讀:avatar 閘印的 ✗ 是它 selftest 注入的對照組(下一行就是「✓ selftest…量具有效」),差點當成第二個紅 —— 讀 log 要讀到判定行,不是讀到第一個 ✗。
- **consumer 的舊閘擋住裝有修法的新版(2026-09-24,beta.145 第五步 consumer 卡 45 分鐘逾時)**:WM 本地 `scripts/lib/governance-dependency-bootstrap.mjs` 是 beta.144 時代的舊版,把 registry 算出的 npm metavulnerability range 字串釘成身分(DS 495d1f84 已改成 `metavulnerabilityRangeCovers`),npm 12.1.0 之後 ordinary sync 的交易稽核永遠 GOV-SUPPLY-005 —— 而修法在它裝不上的 beta.145 裡;交易依契約只能執行 protected base 的閘(`candidateCodeExecutionAllowed: false`),所以不是 bug,是設計上的自鎖,出口是 legacy profile 自己的 one-time reviewed full-snapshot(`scripts/consumer-fullsnapshot-upgrade.mjs`;8/7 的 #83 就是為此寫的,前例 WM #47 / #56)。這次的輸入清單:template repo 兩個 mirror commit 的 `git archive` 樹(不是 DS 內的 template/ 目錄)、Release 資產 release-bom.json + scaffold lock(先 `--verify --phase published`)、`requiredChecksDigest = sha256(stableStringify(desired/github.json 的 product-consumer requiredChecks, 0))`(與 8/5 的 087dde12… 相同)、release-rings candidate 先推到目標版(DS #165);plan 的三個 conflict 就是 8/5 那三個 consumer-owned 路徑,具名確認後 reviewReady;`--apply` 後本地 `npm ci` + `governance:check` 的第一次 GOV-CONTENT-002「changed after its authenticated replay」是 npm ci 剛寫完檔案的瞬時變動,單獨重跑 0 diagnostics;分支名用 orchestrator 期望的 `automation/design-system-<version>`,它自己開 PR(WM #93)→ Verify consumer 綠 → 合併讀回,五步全 complete。**兩個副產物**:release-rings candidate 從 8/7 起就停在 beta.119(每次發版都沒推,只有走 full-snapshot 時才會被要求);WM 本地 node_modules 停在 beta.127 —— 本地驗證前先 `npm ci`。
- **歷史參考樹撞今天的弱點資料庫**(同日,run #291):視覺回歸重拍把 8/5 的 commit 簽出到同一個容器重拍,那棵樹用它自己八月的治理程式裝依賴,`baseline-browser-mapping` 2.10.43 的 moderate advisory 是八月之後才登記的,舊閘照設計 fail closed —— 而且它永遠不可能修(相依是鎖在八月的)。這不是換參考 commit 能解的:任何歷史樹遲早都會撞到之後的 advisory。修:參考樹改用 **HEAD 的**治理程式安裝(`--root=.`),完整性(lock 精確安裝 / 簽章 / attestation)照舊 fail closed,只有弱點稽核在 `report-render-only-reference` 政策下「跑、印、記進 receipt、不擋」;政策名只在 workflow 明文指定,預設仍是 enforce;無憑證、用完即丟的渲染容器是它唯一的合法場景。判準:**「今天的閘」與「歷史的樹」不能用同一套弱點裁決**,但完整性裁決永遠同一套。
- **合併後沒有讀回 main 那一輪 CI**(同日):我只盯了 PR head 的 check-run,合併後 `release:auto` 走到「版號沒 bump,沒有東西可發」就 exit 1,而那道錯排在 main CI 讀回**之前** —— main 紅了六個多小時沒人看見,直到下一件事(#290)撞上同一道閘。修:main CI 讀回搬到「沒東西可發」之前;判準:**合併完成的定義包含「main 那一輪 CI 讀回有裁決」**,不是「PR 綠 + merge 回 200」。

**不可逆的代價**:#3 建出來的 `v0.1.0-beta.141` tag 受 GitHub ruleset 保護(`DELETE` 回 422),
不能刪也**不該繞**,永久指向錯的 commit,該版號報廢。#9 讓 `v0.1.0-beta.142` 發出去卻只有一半的
consumer 裝得上,由 beta.143 以 incident release 取代(帳本尾端改成 `139 → 140 → 143`,
丟掉的兩筆描述的是**沒有任何 consumer 到達過**的狀態)。**兩個版號,零位元組產品變動。**

**四個遞移教訓**:
1. **修同族缺陷要當場列完同族**(M10)。第 1 個修完就去發版,第 2–6 個當場現形;第 7–11 個是修 2–6 的過程中再現形。它們本來就在同一條鏈上,只是沒去看。
2. **fixture 缺欄位 = 判定表測不到要測的事**。四支測試失敗全是 fixture 沒給 `headSha` / `tagCommitSha` / `protectedMainSha` / `versionAtReleaseCommit` —— 缺欄位讓 fixture 同時也代表假綠狀態,那一格於是永遠綠。
3. **同一個 unknown 在不同用途要走相反方向**。同一支三值判定 `classifyReleaseLookup`,在「授權消耗掉了嗎」要把 `null` 算成**已消耗**(不讓一份授權發兩次),在「基準是哪一版」只有 `true` 能用(讀不到不得充當已發布)。兩邊都要寫下來,各有對照組。
4. **為了防某條而加的閘,自己會用同一條犯錯**(#11)。閘寫完立刻用它自己的三問再問一次:「我拿來判斷的這個值,在**它要防的那種事故裡**還成立嗎?」#11 用「線上最新已發布版」當基準,而它要防的事故正是「發布了卻沒人裝得上」——基準本身就是壞的。

- **2026-09-23 同一格再犯(儀器版)**:#161 併進 main 後 PR #160 與 main 衝突,GitHub 對有衝突的 PR **不啟動 pull_request workflow**,兩個 commit 只剩 Netlify 與 pull_request_target 的 4 個 check;我的 PR 監看腳本印「4/4 completed, red=[]」十輪,我照著回報「CI 都在跑」。「沒有紅」不是「有跑」:必過項**不存在**要以儀器失效紅,不是當綠燈等 —— 監看器改成「全部完成而必過項不存在 → MONITOR-BROKEN」。同根第二個:重拍 workflow 檔永遠來自 main、程式碼來自 target_ref,main 的 yml 呼叫 #161 才加的腳本,分支上沒有 → run #298 MODULE_NOT_FOUND;分支併 main 後才拍得成。判準:凡「拿 main 的流程跑分支的碼」,先問「流程引用的檔案在分支上有沒有」。

- **2026-09-24 同一格再犯(產生檢視版,而且這次是 P0 批准閘整場消失)**:`check_substantive_edit_approval_preflight.sh` 從 PreToolUse 第 7 群搬到新的第 8 群,`registrations.json` 改對了、`git index` 裡的 claude 的產生 hook 設定檢視 也改對了,**但工作樹那份還停在 7 群** —— 而 Claude Code 在 session 開場就把工作樹那份讀進去凍住。結果:那道閘在舊群組已被移走、新群組沒有任何入口,**整場零覆蓋、零訊號**;事後還有 11 個受治理檔案被寫成「都過了 P0 閘」,實際上是「沒有任何東西攔它」。既有的兩支閘都看不到這裡 —— `gate-reachability-invariant.mjs` 查的是「腳本有沒有被執行面呼叫」(它有,registrations 有寫),`ci-gate-coverage.mjs` 查的是「npm script 有沒有接進 CI」(不相關)。斷的是**產生檢視**那一層。**拿 runtime 當儀器是全盲**:派工器是被那份過期檢視叫起來的,缺掉的那一群結構上不可能被觀察到。新閘 `scripts/provider-view-group-reachability-invariant.mjs`(required CI)離線比對兩份文件,另在 `session_start_governance_check.sh` Check 12 補一層「你**現在這個 session** 手上的檢視有沒有缺群組」—— CI 那支擋的是「送出去的東西」,SessionStart 那支擋的是「你手上的東西」,兩者不可互相代替。

  **而新閘的第一版自己就犯了它要防的那條(M37)**:它拿「`registrations.json` 裡有幾群」當「這個 provider 該派工哪幾群」,於是對 codex 報假紅 —— codex 的 `runtime.transcript.stability` 是 `unstable-opaque`,而該群唯一的 hook 宣告 `transcript: "stable-required"`,依 `resolveProviderHookEligibility` 它對 codex **本來就不適用**,那一群在 codex 檢視裡不存在是正確的。修法是**逐 provider 呼叫產生器用的同一支適用性函式**,不自己重寫規則;selftest 為此加了第四格對照組(同一份過期檢視:對 claude 必紅、對 codex 必綠)。判準再記一次:**寫完閘立刻問「我拿來判斷的這個值,在它要防的那種事故裡還成立嗎」,而且要用一個不是拿來建構它的 provider / 元件去試打。**

- **2026-09-24 同日再犯,這次是「把一層的規則外推到另一層,而且沒做 benchmark」**:user 對**行內動作按鈕**裁示「可點擊範圍跟 hover 底色一樣,都是 18*18」,我把它升成全 DS 的「懸停回饋的形狀 ≡ 命中區」,然後**拿它去拆 DataTable 選取格的 `onClick`** —— 理由寫「那一格自己沒有懸停回饋(變色的是整列)」。user 當場反問:「如果表格是每一欄的垂直格線都畫出來的那種,其 checkbox 所在的 cell 一整個就是可以被點擊的視覺範圍啊,為何要把可觸控範圍改到只剩 checkbox?」

  查四家一手原始碼後,**我那條前提在四家裡 0/4 成立**:AG Grid / MUI X / react-data-grid 全都是「hover 回饋畫在**列**、點擊目標卻是**格**」,命中區跟懸停回饋形狀不一致是**常態**;react-data-grid 更是每個 cell 四邊都有格線、hover 仍在列、選取欄 checkbox 仍只有 20px。而且**四家沒有任何一家讓選取格的空白處變成死區**(聚焦該 cell / focus outline / active cell / 直接選列)。當天改回來。

  **三個各自獨立的錯,要分開記**:
  1. **跨層外推沒做 benchmark(M8 / M26)**。裁示的成立範圍是「控件」,我沒問「這條在表格的格上還成立嗎」就套過去。判準:**任何規則要從 A 類物件套到 B 類物件,那一步本身就是一個新的設計主張,要重新 benchmark**,不能靠「它是同一條規則」搭便車。
  2. **引文讀反(M22 的反面)**。我引 MUI 的 "click on checkbox should not trigger row selection" 當「整格不可點」的依據 —— 那句住在 `handleRowClick` 裡,跟 detail panel、actions 欄的 early-return 並列,擋的是「這一欄已經有自己的控制項,別讓列點擊再觸發一次」;同檔仍照常發 cell 事件與 cell focus。**有 cite 不等於 cite 支持我的結論**:引一句原文之前,要先讀它**住在哪個函式、跟誰並列**。
  3. **user 給的反駁理由也不是對的那個,但結論是對的**。他說的是「有格線 → 整格是視覺範圍」,而「有格線 → 整格可點」這條因果**查無一手依據**:AG Grid 的 `columnBorder` 預設就是 `color: 'transparent'`,同一份 DOM、同一份 JS,只差上不上色。真正切的那一刀是 `cellSelection` 這類 feature flag。**結論對、理由不對的時候,不能拿對的結論回頭背書那個理由** —— 那又是一次導果為因。

  同日另外兩條錯判準(鍵盤模型的「有沒有選到哪一個」與「能不能開新分頁」)是同一種病的不同臉:**都是先有結論、再回頭找一個聽起來乾淨的判準**。三次都是 user 戳破的,三次我都拿不出一手依據。判準:**propose 任何「A 類東西該怎樣」的通則之前,先找一個不是拿來建構它的實例去打它**;打不破再說。
