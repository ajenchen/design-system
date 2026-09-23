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
