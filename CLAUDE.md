# 每次任務前的 6 條 mindset(世界級設計系統的工作底色)

這 6 條是本專案所有規則背後的**態度**。接到任務先複習一遍,再看具體規則。

1. **對標世界級 + 不取巧省工**——每個設計決策都要能回答「Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 怎麼做?我們為什麼一樣 / 為什麼不同?」。沒對齊又說不出不同的理由 = 設計 bug。**視覺上也必須跟世界級一樣整齊**:用我們的 token / 元件換掉第三方樣式時,不能讓視覺比原版鬆散、錯位、比例失調——「符合我們的設計語言」和「視覺整齊度不輸原版」是**同時成立**的要求,不是二選一。**遇到取捨禁止以「選較簡單」「省 N 個 edits」為由選 shortcut**——一律選最世界級做法。說到「快速修」「省工程」是 yellow flag,停下重想。權宜若真必要,明說是權宜 + 存 tech debt + 將來回來重做。
2. **不憑直覺發明 / 優先消費既有**——新增任何值 / 名 / pattern / 視覺結構 / variant 前先 `grep` 既有,**也包含 layout primitive**(見 `# 建立 UI 前必讀` 的「既有 layout primitives 清單」)。若新元件的視覺結構命中既有 primitive(item-anatomy / overlay-surface / Empty 等),必消費不重寫。專案已有的 gap、padding、font-size、命名慣例優先沿用;不是「看起來順」就能造新值。**強制執行 `# SSOT 消費 canonical` 清單**——寫任何視覺 code 前列出消費了哪些 components / patterns / tokens / spec。**提出設計建議也算在定 pattern**——討論階段給 option A/B/C 時,每個 option 都必須同時對照「DS canonical」+「世界級 idiom」,兩邊都有才叫有根據的建議。**禁止自己憑印象列部分家**——任一個相關的家沒掃就是螺絲鬆(consumer 會 ship 你的建議,建議就是 pattern)。**只看世界級 = 螺絲鬆**。
3. **改一處必看三處**——code / spec / story 三方聯動是常態,不是例外。改 cva `defaultVariants`、改 variant、改 token 前先 grep 該元件所有檔案,一次改完。
4. **範例必須是真實業務場景**——Jira / Stripe / Notion / Figma 等可辨識的情境;禁止 `Option A/B/C`、「按鈕一」、極端不現實、ASCII art。Storybook 的受眾是任何打開它的人,不是作者。
5. **猶豫就問,不往前推**——遇到無前例的設計決策:(a) 先 grep 既有 pattern,(b) 讀近親元件 spec,(c) 仍不確定就停下問使用者。**禁止憑直覺造新 pattern**——這是本專案最常被糾正的錯誤。
6. **大原則吸收瑣碎,記憶索引不該長**——同類 bug 反覆被糾正 = 規則寫太細、meta 層沒抓住。真正該寫的是「哪一類 meta-pattern 誤用」,不是「哪一個具體 bug」。失敗記憶索引應該長**不大**;若一直長,代表 meta-principle 漏寫或沒執行。見 `# Meta-Pattern 預警` 的 15 條大原則。**AI 不需要被 user 提醒才去找 root invariant**——rule 震盪(寫成 A → 被糾 → 寫成 not A)發生時 AI 必**自己**停下,跑 M12 benchmark + invariant test。**User 就同主題第 2 次問 → 必主動截圖 verify**(M13),不靠第 3 次才醒。**User 說「所有 X」= DS-wide 聲明,當下做完 + 建 hook 防線,不拖 tech debt**。**每次對話達成 canonical 結論 → AUTO 跑整合 pipeline**(M14:world-class benchmark → spec → code → hook → CLAUDE.md → memory → 驗證,5 層至少 3 層,不等 user 催)。使用者 tell me once,我不該要 tell me twice。

每條規則展開請讀後面對應章節(`# Spec 規則`、`# UI 開發規則`、`# Story`、`# 命名與語言一致性` 等)。


# Meta-Pattern 預警(15 條大原則)

**mindset #6 的具體化**。每條能吸收數十個具體 bug,是失敗記憶索引的上游。接到任務先過這 15 條,再跑 `# 任務導航表`。

| # | Meta-Principle | 能吸收的 bug 類型(舉例,非窮舉) |
|---|---|---|
| **M1** | **視覺決策前必消費 SSOT**(元件 / token / pattern / spec)。強制跑 `# SSOT 消費 canonical` 清單,沒列出 = 自創。 | `variant="bare"` 自發明 / chrome-header token 漏用 / Row 沒用 item-anatomy(詳 historical-bugs.md) |
| **M2** | **消費 3rd-party lib 必驗 rendered DOM**(不信 docs)。任何 `[&\[data-...\]]:` attribute selector 針對第三方元件前,inspect 真實 DOM 有無該 attribute。Library API(fit / zoom / wheel step)先寫 3 行 POC 驗證行為,再寫到元件裡。 | react-day-picker `data-range-*` 不存在 / react-zoom-pan-pinch fit-to-page 算錯(詳 historical-bugs.md) |
| **M3** | **Portal 逃逸 subtree context**(theme / density / provider)。任何 overlay 元件(DropdownMenu / Popover / Dialog)走 Portal 到 document body,**不繼承觸發點的 subtree attribute**;顯式 forward `data-theme`;`data-density` 部分 overlay 刻意 lock `md`(詳 `density.spec.md`)。 | DropdownMenu 在 dark subtree 變亮(詳 historical-bugs.md) |
| **M4** | **`_Group` 元件必隔離單 item 的 fieldCtx**。當 Group 元件(CheckboxGroup / RadioGroup / SwitchGroup)包在 Field 內,其 child items **不可共用 fieldCtx.id / fieldCtx.hasFieldWrapper**;Group 必建自己的 Context 告訴 items「你在 group 裡」。 | CheckboxGroup 共 fieldCtx.id,label 全抑制 / 點擊只 toggle 第一個(詳 historical-bugs.md) |
| **M5** | **視覺 canonical 必 spec 聲明所有 state 疊加組合**。單一 state(today / selected / hover / disabled)有視覺定義不夠;**所有兩兩疊加、三疊加組合也要在 spec 有明文**。 | DatePicker today+selected 隱形 / hover+disabled ring 仍顯示(詳 historical-bugs.md) |
| **M6** | **Stakeholder-visible 產出 → 強制進階稽核才出稿**(不是 merge 後補)。任何「有視覺可以給 stakeholder 看」的產出(新元件 / 元件新功能 / 新產品頁 / 比稿)**必過進階完整稽核**(6 維 + 全截圖視覺驗證)。日常 dev 可用高效模式,stakeholder gate 不可。 | FileViewer 初版 8+ 項給人看才發現(詳 historical-bugs.md) |
| **M7** | **新 protocol / skill / rule 寫完,必反向 cross-check 既有 Meta-Principle 是否該套用**。尤其:consistency-class 的 protocol 必走「一致性類稽核必先全掃再判」(本章節);audit skill 必加「Self-improvement capture」Phase F step;Rule 觸及「canonical」「SSOT」「rationale」keyword → 必明示 substantive vs 表達層分權。 | principle-audit-protocol v1 漏套既有 Phase 0 全掃(詳 historical-bugs.md) |
| **M8** | **訂立 / 修改 cross-component canonical 前必 world-class benchmark**。任何 predicate / decision tree / taxonomy 類 spec,**必先 grep 至少 3 家世界級 DS**(Polaris / Material / Atlassian / Ant Design / Carbon / Apple HIG / VS Code / Figma 等)列對照表,再訂 rule。**絕對禁止**憑直覺開場寫 predicate,user 問才補對照。每個 category / variant / case 必附世界級 reference(實作名或 API 指向),沒有對照的 rule 視同未成熟,走 Checkpoint 3。 | item-anatomy Inline Action 疊代 4 次才有世界級對照(詳 historical-bugs.md) |
| **M9** | **Predicate / decision tree 寫完,present 前必 4 題自測**,防 membership drift。(a) **每 example 回跑決策樹**:把 real case 表 / 範例清單的每一個 item 丟回 Q1/Q2/Q3,確認它真的落在 claim 的 category,不是憑印象塞。(b) **cap / constraint cross-check**:spec 若有「絕對值 ≤ X」/「必 size Y」類 constraint,grep 表內所有 value 驗沒 violation。(c) **每 example 對 ≥3 家 world-class DS**:不是整個 predicate 對,是**每個 real case** 對(e.g. Dialog corner close 對 Material/Polaris/Atlassian 各一家怎麼做)。(d) **每 category ≥1 example**:空 category = 概念未收斂。任一題失敗 → 重收斂,**禁止 present**。 | Cat 1 IA 塞 endAction / FileItem sm 違 ≤24 cap / DataTable 錯 Inline Action(詳 historical-bugs.md) |
| **M10** | **Proactive exhaustive scan:canonical migration 完成前禁止只改「直覺相關」元件;final report 前禁止省略「我知道但沒講」的 tech debt**。流程:(a) 訂 / 改 canonical → `grep -r` **所有** `.tsx / .stories.tsx / .spec.md` 找 pattern,不是憑印象列 N 個元件改完就收工;(b) Phase 4 final report 必 proactive 自問 3 題 —「還有哪些消費者沒跟上 canonical?」「本 session 動過的 code 有無 known issue 沒講?」「有無明顯 UX / a11y / visual 瑕疵我注意到但沒 flag?」;(c) 回覆 user「做完了」前強制 pause,自問「還有什麼我知道但沒主動講?」— 有必誠實列出 present,等 user 決策。**Silent tech debt = 違反本條**。 | dismiss migration 漏 FileViewer / 7 題 silent tech debt user 一次炸(詳 historical-bugs.md) |
| **M11** | **User-perspective interactive state walk — 改完 UI 後 present 前必親自走一次 user 視角**,不留待 user 抓。改 UI 完成必過 7 題 self-test:(a) **static**(對齊 / padding / 色);(b) **hover / selected / active**(overlay list 三 invariant 必同時成立:(1) hover bg flush chrome 邊、(2) content 對齊 header title、(3) content 在 bg 內有 loose breathing;world-class Linear / Notion / Slack / Raycast / VS Code Quick Pick 共通;**必用截圖驗證 3 invariant 幾何**,不靠記憶判斷;詳 `patterns/overlay-surface/overlay-surface.spec.md` 規則 3.1;鼠標 cursor;hover 區覆蓋整列);(c) **focus-visible**(只 keyboard tab 顯示 ring,滑鼠 click 不該 — 檢查 `focus:` vs `focus-visible:` 用對);(d) **active / pressed**;(e) **keyboard**(Tab / Shift+Tab / Esc / Enter 正確);(f) **範例真實性**(「誰會這樣用?」— modal 內 list item 通常 in-modal 直接設定,不 navigate 去別處;symbolic tags / placeholder content 全改掉);(g) **CSS 對稱**(`lg` override 必對應 `md` reset;`dark` 必對應 `light` default)。每 UI 改動未跑 7 題 walk 就 commit = 違反本條。 | ListBody 修完 user 連抓 5 波(hover / focus ring / 範例 / padding)(詳 historical-bugs.md) |
| **M12** | **Binary strict rule(「必 X」/「禁 Y」)前必 benchmark + invariant test**。使用者單次視覺 preference、單次觀察 → **不是** canonical;canonical 是 **invariant across context**。強化 rule 前必 3 題自測:(a) **≥3 家世界級 DS 一致**(Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 取 3 比對;有差異 = variance 不是 canonical);(b) **Counter-example scan**:能舉出 legal 的反例嗎?能 → 不該寫 strict rule,rule 寫錯 layer;(c) **Root invariant vs surface observation**:「flush bg」是表象(bg 邊位置),真實 invariant 通常比表象深一層(例:真正規則在 **content 與 bg 的關係** — content 必在 bg 內有 breathing,與 bg 邊位置無關)。**震盪症狀**:同一概念的 rule 被 A → not A → A 糾正 = meta invariant 沒抓到,**停下 present,自己跑 3 題 benchmark + invariant test,不要寫第 3 版**。**禁止**把「我這 case 偏好 X」機械升級成「canonical must X」。**AI 不該靠 user 提醒才 benchmark** — rule 寫強(必 / 禁)的瞬間就要觸發本條 self-check。 | hover bg 震盪 4 次(bg-edge vs content-padding invariant)(詳 historical-bugs.md) |
| **M13** | **User 第 2 次提起相關問題 → 自動觸發截圖 verify,不靠第 3 次提醒**。當 user 就同一視覺 / 行為主題 **第 2 次**問 / 糾正(even 用不同角度),AI **必自動 invoke 截圖 verify**(`node scripts/visual-audit.mjs --scope=component:XXX` + `Read snapshots/*.png`),用視覺證據 compare user image vs 當前狀態。**禁止靠記憶 / 推論回答**。第 3 次才 verify = 已違反本條。**Scope = 任何 UI / 視覺 / interaction pattern** 的問答。**Corollary(大規模 migration)**:user 指定「所有 X 都要 Y」(e.g.「所有 avatar hover NameCard」),不可分批 / 拖延 / 留 tech debt — 同 session 全部做完 + 建 hook 防線。 | avatar-NameCard migration 分批拖延 user 第 2 次催才全改(詳 historical-bugs.md) |
| **M14** | **對話結論 → AUTO integrate pipeline**(不等 user 催)。每次對話達成 canonical / 設計決策 / 新 rule 結論時,AI **必自動執行**整合 pipeline,5 層至少 3 層落地:(1) **World-class benchmark**(≥3 家對照,M8 已規定);(2) **SSOT home 識別**(哪 spec / code / token / pattern 該收這條?);(3) **Spec**:canonical text + rationale + 世界級對照表(primary home);(4) **Code**:programmable 部分落地(新增 prop / CSS rule / API signature,避免 canonical 只留在文字層);(5) **Hook** `.claude/hooks/*.sh`:auto-detectable 違規(regression prevention);(6) **CLAUDE.md navigation**:如 SSOT 消費清單 / 任務導航表要 cross-link;(7) **Memory**:跨 session 記憶 `project_*.md` + 更新 MEMORY.md 索引;(8) **驗證**:`tsc --noEmit` + `visual-audit --scope=component:X` + hook smoke test。**違反 trigger**:user 問「你有沒有整合到 X spec」/「還有沒有要做的」/「是不是該程式化」 → 代表 pipeline 沒自動跑 = M14 violation。**為什麼自動**:canonical decisions without integration 會隨時間 drift;session 結束後無 spec anchor = 下 session 忘記;mindset #6「meta 吸收瑣碎」的具體執行形式。 | chrome-header / dismiss / hoverCard 每個都 user 提醒才整合(詳 historical-bugs.md) |
| **M15** | **Product UI flow 必須 visual-audit coverable**(設計階段就要考慮)。任何 stakeholder-facing 的 product flow(prototype / exploration / product page / 多步驟 wizard / modal confirm flow 等)**必須**提供 visual-audit 可捕捉的 state snapshot — 每個 flow state 有對應 story / exploration scenario 用 **initial-state pattern**(`defaultOpen` / `useState(true)` / initial-open prop)或 `play()` interaction 讓 Playwright 能截圖。**禁止**留「必須靠真人點擊才能看到的 state」未截圖覆蓋。**違反 trigger**:stakeholder review 時要 live demo 才能看到某個 state / visual-audit 截到的只是 trigger button 而非 overlay。**為什麼**:(1)stakeholder gate(M6)需要完整 visual proof,不是 live demo 即興;(2)跨 session AI audit 必須能跑 visual-audit 才能驗;(3)regression 防護必須對每個 state 有 baseline snapshot。**實作**:新 prototype / exploration 必含 OpenSnapshot 類 stories(對齊 Dialog / Sheet / FileViewer 2026-04-22 canonical);/prototype skill + /product-ui-audit + /delivery-handoff 流程 Phase 強制包含 flow snapshot coverage 檢查。 | Sheet / FileViewer 只截 trigger 缺 OpenSnapshot(詳 historical-bugs.md) |
| **M16** | **訂 standalone card/pill 容器 canonical 必同步訂 multi-instance gap canonical**。任何元件的**永久視覺層**呈現為 **standalone card/pill**(bg + radius + 不貼父容器邊 inset)時,**必**同時在 spec 訂「多個連續排列時的最小 gap」canonical + **mixed 混合情境決策**(e.g. FileItem Type A + Type B 同 list 取最保守 gap)—— 因為 consumer 寫 `.map()` 時極易漏 gap 造成 card 融合 / bg 塊相連。**核心公式 3 條**(item-anatomy SSOT「連續 item 貼邊合法性」):(1) 同類 standalone card/pill → 必 gap;(2) 同類 permanent flush / transparent → 0 gap 合法(分隔靠 border-b / progress bar / connector);(3) **混合視覺語言 list → 必取最保守 gap**(相鄰兩類 affordance 會互相吸收,分隔線型緊貼 card 型會被 bg 邊界吸收失效)。**不 trigger 的情況**:M3 Nav drawer / Apple Inset Grouped(permanent transparent + state radius)、DataTable / MenuItem(flush + border-b / hover-only radius)。**違反 trigger**:consumer stories / product code 連續 N 個 standalone card/pill 視覺相連 = spec 缺 list-gap canonical,M16 violation。**實作**:(1)元件 spec 加「List wrapper canonical」節,列單一 + mixed gap 值 + rationale + 反例 + code example;(2)hook `check_item_list_gap.sh` P2 block 外框、P1 warn 缺 gap;(3)audit Dim 加「consumer 層 list wrapper 是否正確消費 item gap canonical」;(4)**配套 breathing invariant**:standalone card/pill 在 consumer chrome 內時,chrome 層必有 inner padding(hook `check_container_breathing.sh` P1 warn 攔自建無 padding 容器;SSOT `element-anatomy.spec.md`「視覺容器 breathing invariant」)。**世界級 benchmark 支持**:2026-04-22 掃 Polaris / Material M3 / Atlassian / Ant / Carbon / Apple HIG 6 家共識 — default flush row 0 gap + separator;standalone card stack 才需 gap。**為什麼 state 視覺(hover/focus/selected/active)不獨立寫規則**:跟隨 permanent layer 分類,不獨立觸發 — 瞬時 state 單一啟用不創造相鄰衝突;selected 連續 bg 在 permanent flush/transparent item 是 multi-select feature(Finder / Gmail idiom),在 permanent standalone card 依然必 gap。 | FileItem rich card + compact bg 連續相連(詳 historical-bugs.md) |
| **M17** | **SSOT 必可傳播**(非僅 markdown 文字)。Canonical 只存 markdown 文字 ≠ 真 SSOT — consumer 各自 hard-code 就算今天全 compliant,改值仍需手動 grep N 檔。真 SSOT 必是**可執行 value**,consumer 被動消費:(a) **Token**(CSS 變數,如 `--item-gap-label-desc`)/ (b) **Primitive**(封裝結構的元件,如 `<ItemContent>`)/ (c) **Utility class**(註冊到 tailwind-merge)三擇一或組合。**違反 trigger**:同值 / 同公式 hard-code 在 **3+ consumer** = 必抽成 token / primitive。**兩層 SSOT 架構**(2026-04-23 本 DS 實踐):底層 token(值可調)+ primitive(結構封裝 + 消費 token),consumer 2 擇 1 消費;偏離需 spec 明文 rationale。**實作**:token 定義 → primitive 消費 token → consumer 消費 primitive (OR token);hook 偵測新 code 硬寫原值 → warn 改 primitive / token。**世界級對照**:Material `dense` prop(boolean 切密度)/ Carbon `size` enum / Ant `size` enum / Polaris token 手選 — 6 家皆透過 token + primitive 組合達到「改一處全同步」。本 DS 採 density-prop 派(self-documenting 比 `dense` 更明確,如 FileItem `mode="compact\|rich"`、ItemContent `mode="scanning\|reading"`)。 | mt-0.5 canonical 13 consumer hard-code 假 SSOT(詳 historical-bugs.md) |

**判斷 meta-principle 是否漏寫的 test**:
- 同類 bug 一年內被糾正 3 次 → meta-principle 漏寫或沒執行,檢討本清單
- 某 bug 跟 17 條中任一條對不上 → 可能要新增第 18 條(跟 user 討論)

**與失敗記憶索引的關係**:Meta-principle 是**上游**(預防)、失敗記憶索引是**下游**(事後記帳)。具體 bug 的歷史詳解移到 `.claude/skills/design-system-audit/references/historical-bugs.md`;CLAUDE.md 只留 meta-principle + 極高 signal 的 one-liner anchor。


# 稽核 canonical

稽核是 DS 品質的 gate。**任何 stakeholder-visible artifact(prototype / 元件 merge / 產品 demo)必已過 code + visual 雙層 audit**。搭配 M6 + M10 讀。

## 3 層級 × 6 維度 × 觸發判定

| Tier | 時機 | Scope | 實作 |
|------|------|-------|------|
| **1. Stakeholder-gate**(強制)| 新元件 merge / prototype / 產品 demo | artifact-scoped | `/prototype` P3.5 / `/component-quality-gate` P4 Ship / `/product-ui-audit` P5 強制 chain `/visual-audit` |
| **2. Daily dev** | bug / refactor / 文字改 | `git diff` + direct consumer | `visual-audit --scope=changed`(default) |
| **3. Periodic deep** | release / token 大改 / 季度 | full DS | `/design-system-audit --deep`(或 `--scope=all`);年度 2-4 次 |

| # | 維度 | Canonical / skill |
|---|------|-----------------|
| D1 | 設計語言一致 | `/design-system-audit` / `/baseline-audit` |
| D2 | 程式語言一致 | tsc + lint + `/design-system-audit` |
| D3 | 元件效能 | `/performance-audit` |
| D4 | UX 行為 | `/ux-audit` |
| D5 | 視覺品質 | `/visual-audit`(Layer A mechanical + B AI) |
| D6 | 設計原則自檢(4 子維)| `design-system-audit/references/principle-audit-protocol.md` |

**觸發**:新元件 / feature / 比稿 → Tier 1 強制;日常 → Tier 2 scope=changed;release / 季度 → Tier 3 scope=all;spec-only 改可跳視覺。Hook `check_stakeholder_visual_audit.sh` pre-commit 偵測新視覺檔 + 未跑 Tier 1 → block。世界級(Figma / Material / Polaris)共識 3-tier。

**禁止**:Stakeholder artifact 沒過 Tier 1 就 review / 日常硬跑 Tier 3(developer 會跳)/ Tier 3 無限期推遲。

## 一致性稽核必 Phase 0 先全掃再判

單元件看必漏系統 drift(Notice title-desc mt-0.5 漏 Dialog/Tooltip/Coachmark;DateGrid today bar 漏 state-stacking;Checkbox disabled 漏 Radio/Switch/SelectionItem)。`/design-system-audit` / `/visual-audit` 的 consistency phase 一律 Phase 0 全掃 → Phase 1+ 判 → Phase F 報告,無例外。

## Canonical 優先順序(衝突 ladder)

1. **WCAG mechanical floor**(最高)— 對比 / keyboard / ARIA。Layer A 實作 WCAG 2.1 豁免(incidental text / disabled / logotype / decorative)不誤報
2. **DS spec + CLAUDE.md**(次高)— documented rationale 偏離 = `deviation ✓`
3. **世界級對照**(reference,非 canonical)— spec 有 rationale 故意不跟 → AI 不 flag

**流程**:Mechanical assertion → 查 rationale → 有 = `deviation ✓`,無 = P0;AI judgement → 必先讀元件 spec.md,spec 當 hard constraint,世界級當 reference 不 override。WCAG 法規硬底;DS spec 是 design language 存在意義;世界級是參考(mindset #1 允許「對齊 or 說為什麼」)。

## Consistency audit 三件套

宣稱「跨元件要一致」必三件套齊全,否則是風格偏好不是 canonical:
1. **Canonical 明確指向**(CLAUDE.md / spec.md / skill reference,非口頭 / 直覺)
2. **偏離元件在自己 spec.md 記 rationale**(不寫 = drift,不是故意設計)
3. **Audit 公式**:`actual == canonical OR (actual != canonical AND rationale ✓)`

**Why**:DS 品質 ≠「元件都長一樣」,而是「差異可追」。沒 canonical 無一致性可言;沒 rationale 機制一致性會僵化。新增前 test:能指 canonical 一段?偏離能記 rationale?兩題皆 YES 才寫規則。

## 稽核 vs 執行 分權(auto-mode 邊界)

**稽核 = 提議,執行 = 人 sign-off**。核心公式:

```
動 canonical 的 substantive meaning → STOP(提議,等 user sign-off)
對齊 canonical / 表達統一 / 補 pointer → AUTO(直接修)
```

**Substantive keyword**:「canonical / 聲明 / 必須 / SSOT / rationale / 為什麼 / 不允許 / 禁止」— 觸及 + 動 meaning → STOP。

| AUTO-fix | STOP(提議等 sign-off) |
|----------|----------------------|
| spec ↔ tsx / cva 不同步(tsx = source of truth) | 原則 / 世界級對照有疑 |
| 用詞不一致但 meaning 同 | 跨 spec 矛盾(兩邊都有 rationale) |
| SSOT pointer 缺 / reciprocal 缺 / dead link | 新增 / 刪 canonical rule |
| 編號 / 格式 / 排序 | 命名決策(新 prop value / 術語) |
| 術語 drift 修(對齊既有 canonical) | 原則 scope 擴充 / 收緊 |
| hardcoded class / px → token 名 / pointer | 擴 SSOT 納入新 branch |
| Rule A prose 移除 class → 遷 anatomy | Rationale 疑似過時 |

**Why**:Canonical 是共識產物,非個人判斷。AI 自改 canonical 造成 session 標準漂移。D6 scan 走 `design-system-audit/references/principle-audit-protocol.md`;audit skill report 必含「提議討論(待 user sign-off)」專區 + Phase F「Self-improvement capture」。



# 資訊治理 canonical(8 home + anti-bloat)

Governance 自身遵循 SSOT + anti-bloat。**寫新規則前先決定放哪個 home**,不全塞 CLAUDE.md。

## 8 home 分層

| Level | Home | 收什麼 |
|-------|------|--------|
| 1 | `CLAUDE.md` | 每 session signal 的 DS 規則 / 技術陷阱 / 架構框架 |
| 2 | `{name}.spec.md` | 單元件「何時用 / 為什麼」 |
| 3 | Pattern `spec.md` | **runtime** 跨元件 primitive |
| 4 | Code(`.tsx` / `.css`)| cva / 型別等機械強制 |
| 5 | Skill(`.claude/skills/`)| invoke 情境的多步驟 workflow + checkpoint |
| 6 | Memory(`~/.claude/.../memory/`)| 跨 session 狀態 |
| 7 | Hook(`.claude/hooks/`)| 機械化 pre/post tool 檢查 |
| 8 | Slash Command(`.claude/commands/`)| 一次性單步 action |

**決策 flowchart**(Q1 YES 即家):Q1 設計規則 → Level 1-4 / Q2 invoke 情境 → Skill or Command / Q3 隨時間變化 → Memory / Q4 機械化 → Hook / Q5 深層細節 → Skill references 或 spec.md。搬動規則必在原位留一行 pointer。完整 flowchart → `.claude/skills/design-system-audit/references/rule-placement.md`。

**硬規則**:Write 新檔到 `src/design-system/patterns|components|tokens/` / `.claude/skills|hooks|commands|agents/` 前,**必先 Read 該 dir 的 `README.md` charter**。`enforce_home_charter.sh` hook 自動注入 charter + 三題 verification。

## Anti-bloat pipeline(L1-L3)

| Layer | 觸發 | Artifact |
|-------|------|---------|
| **L1 — Pre-write** | PreToolUse hook | `pre_write_subsumption_check.sh` / `check_file_size_budget.sh` / `check_governance_compliance.sh`(7 題 self-audit)|
| **L2 — Per-commit** | PostToolUse | `log_governance_fires.sh` → `.claude/logs/hook-fires.jsonl` |
| **L3 — Periodic deep**(季度 / audit --deep)| `/knowledge-prune` skill(retire ≥ 5%)| Phase F report |

**行數預算**(hook 攔):CLAUDE.md 400(過渡 800)/ spec 300(過渡 500,**foundational SSOT 類 800**)/ SKILL 250(過渡 400)/ memory 100。過渡期至 2026-07-24 收斂到 400。

**Foundational SSOT 類 spec**(cap 800,2026-04-24 加):涵蓋 cross-pattern 或 cross-component canonical 的 SSOT spec,scope 本質 > 單一元件,不可拆不失原則。該 spec 頂部 frontmatter 或首段必寫 `**foundational SSOT rationale**: {涵蓋 X / 為何不可拆}`。現況 4 檔:`item-anatomy.spec.md`(Family 1+2 SSOT,**super-foundational cap 1200 exception approved 2026-04-24**)/ `color.spec.md`(token SSOT,cap 800)/ `sidebar.spec.md` / `tree-view.spec.md`(獨立 cva SSOT,cap 800)。

## 加規則前必過 3 題

1. 既有 Meta-Pattern / 近親 spec / canonical chapter 有命中 → append pointer 不新寫
2. **Rule-of-3**:同概念 ≥ 3 處 → 選 SSOT,其他 pointer only
3. 7 天後還會 fire 嗎?不確定 → 不寫,先進 session 記憶觀察

## Retire 鐵律(反 append-only)

季度 retire ≥ 5%(M1-Mn / MEMORY / skills / hooks)。候選:6 月無 fire 的 hook / 3 月無 invoke 的 skill / 被上游 Meta 吸收的具體 bug 條目。**上游加 = 下游減**。

**違反 trigger**:新增 Meta-Pattern 未檢討舊條目合併 / MEMORY stale / 同概念 3 處都完整寫(Rule-of-3 violation)/ 聲稱「定期 / 自動」無 fire log(寫進 3 hook:`stop_harvest_corrections` / `session_start_governance_check` / `log_governance_fires`)。

## Audit Phase F 強制「Self-improvement capture」

```markdown
## Self-improvement capture
- 新發現 FP pattern: {描述 + 回填位置} OR "無新 FP"
- 新確立 meta-pattern: {描述 + 提議位置} OR "無新 pattern"
- 修完的矛盾 / 糾正: {list + 回填位置} OR "無糾正"
```

**User 糾正回填 home 判斷**:個人偏好 → `memory/feedback_*.md`;DS 本質 → CLAUDE.md;audit skill 改進 → `skills/*/references/`。


# SSOT 消費 canonical(做 X 前必查 Y)

mindset #2 的**機械化執行清單**。寫任何視覺 code 前,對照本表**列出你查過的家** — 沒列等同自創(hook `check_ssot_consultation.sh` 會 inject 提示)。

## 高頻決策 quick lookup(詳表 → `.claude/references/ssot-consultation.md`)

| 決策 | 必查 SSOT |
|------|----------|
| 元件選擇 | `ls components/` + `ls patterns/` + 近親 spec |
| Token / 值 | `tokens/{name}/spec.md` |
| Padding 分層 | `# UI 開發規則`「Padding source 分層規則」 |
| Row / item 結構 | `patterns/element-anatomy/item-anatomy.spec.md`(Family 1+2 SSOT) |
| **連續 item list gap** | item-anatomy.spec「連續 item 貼邊合法性」+ 元件 spec「List wrapper canonical」(standalone card/pill → 必 gap / flush → 0 gap) |
| **視覺容器 breathing** | `element-anatomy.spec.md`「視覺容器 breathing invariant」— 有邊界必 inner padding |
| **Label ↔ Desc gap** | Token `--item-gap-label-desc` / primitive `<ItemContent>`(改 token 一處全 DS 同步) |
| Dismiss / Inline action / Overflow menu | item-anatomy spec 三個 section |
| 按鈕排列 / 群組 | `patterns/action-bar/action-bar.spec.md` |
| Chrome header 選型 + 高度 | `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」|
| Overlay(header/body/footer / dismiss / title size)| `patterns/overlay-surface/overlay-surface.spec.md` |
| Icon 選擇 / 尺寸 | `# 元件 Props 命名原則`「常用 icon canonical」+ `# UI 開發規則`「Icon size 來源分層規則」 |
| Variant / prop 命名 | 既有 grep + `# 命名與語言一致性`「三重 test」 |

## 強制 checklist — 新 tsx top-of-file 註解

新元件 tsx 開頭**必須**含「── 消費的 SSOT ──」段列出 components / patterns / tokens / spec refs。Hook 自動檢測;模板 + 禁止清單(隱性自創反例 6 條)詳 `ssot-consultation.md`。


# 任務導航表（做 X → 讀 Y）

接到任務後先對照這張表，找出必讀章節再動手。**章節名即 `#` heading**，可用 grep 直接跳。

| 任務類型 | 必讀章節（按順序） |
|---------|-----------------|
| **新增元件** | `# 建立 UI 前必讀` → `# shadcn 元件規範` → `# Spec 規則` → skill `/component-quality-gate` |
| **修改元件 variant / size / state** | 該元件 `spec.md` → skill `/story-writing`(Phase 4 連動) |
| **改 cva `defaultVariants`** | skill `/story-writing` Phase 4 高風險漂移點 |
| **新增 / 修改 token** | `tokens/README.md` charter → `# Token 命名原則` → 對應 `tokens/xxx.spec.md` |
| **新增 / 修改 pattern** | `patterns/README.md` charter → `# 建立 UI 前必讀` → 對應 `patterns/{name}/spec.md` |
| **寫任何 story** | skill `/story-writing`(含 anatomy 標準 + 範例選擇 + 自我檢查) |
| **跨元件比較 / 加 SSOT pointer** | `# Spec 規則` → SSOT 規則與 anchors 清單 |
| **命名新檔案 / 變數 / prop** | `# 命名與語言一致性` + `# 元件 Props 命名原則` |
| **新元件的內部 layout 選型** | `# 系統內部 Layout — 4-Family Model` 判斷流程 → `patterns/element-anatomy/element-anatomy.spec.md`(完整 taxonomy) |
| **新 row / item 元件的結構(Family 1+2)** | `patterns/element-anatomy/item-anatomy.spec.md`(Family 1+2 row 結構 SSOT) |
| **新 skill / hook / command** | 對應 `.claude/{home}/README.md` charter → `design-system-audit/references/rule-placement.md` |
| **建立新 chrome header** | `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」(fixed-h vs padding-based + 8 家對照) |
| **無明確前例的設計決策** | `# 遇不確定時的協議` |
| **提設計建議 / option A/B/C** | 每 option 必含 DS canonical(spec:line / token name)+ 世界級對照;只給世界級 = 螺絲鬆 |
| **Tailwind / CSS 出怪事** | `# Tailwind 使用規則` + `# 失敗記憶索引` 技術陷阱 anchor |
| **寫任何視覺 code 前** | `# SSOT 消費 canonical` 對照表列出查過的家 |
| **Stakeholder-visible 產出**(新元件 / 新功能 / 新產品頁 / 比稿) | `# 稽核 canonical` → Tier 1 強制 |
| **稽核結論 = 修實作 or 改原則?** | `# 稽核 vs 執行 分權 canonical`(auto vs STOP 判斷公式 + 表) |
| **跑 D6 設計原則稽核** | `.claude/skills/design-system-audit/references/principle-audit-protocol.md`(4 子維 scan + 判斷表 + FP 記憶) |
| **User 糾正 AI 後** | `# 資訊治理 canonical`(判斷 home + 寫到 memory / CLAUDE.md / skill reference) |
| **spec 跟 code 結論衝突** | `# Spec 規則`(主動提出討論,不默默改) |
| **在 classification-sensitive dir 建新檔** | **先 Read 該 dir 的 `README.md` charter`**(硬規則,見 `# 規則分層`) |
| **稽核缺口 / 覆蓋盤點 / 補洞決策** | `.claude/references/audit-coverage-vs-24-checklist.md`(業界 24 節 vs 我們 / Dim 9 framework multiplier / 刻意不補清單) |

**找不到對應的任務類型** → 進 `# 遇不確定時的協議`，不要自己決定讀什麼。

---

# 專案規則

本專案使用：

- Vite + React + TypeScript
- Tailwind CSS v4（@tailwindcss/vite）
- shadcn/ui 元件庫
- Storybook
- 自訂 Design Token 系統

專案必須可以正常啟動。

必要檔案：

- index.html（位於專案根目錄）
- src/main.tsx
- src/globals.css
- vite.config.ts
- package.json
- tsconfig.json

若缺少上述檔案，請先建立再進行其他修改。




# 遇不確定時的協議(Ambiguity Protocol)

**最常發生的錯誤是「AI 憑直覺造新 pattern」**(延伸 mindset #2 + #5)。無明確前例時強制 3 步,禁止跳步 / 憑感覺往前:

1. **grep 既有 pattern**(30 秒):命名 → 同類元件值;設計決策 → 最近親 spec;token → 對應 spec;pattern → `ls patterns/`。找到就沿用,不合理進 Step 3
2. **讀近親 spec.md**:檢查設計決策可類推?SSOT anchor 有談?禁止事項隱含規則?可類推直接套用並寫反向引用
3. **仍不確定停下問**:「找到的 pattern:A/B;傾向 A 因 X,B 也合理;偏好?」

**禁止**:跳 grep 憑記憶造值 / 兩選項隨便挑 / 發明新 suffix/prefix / 留「TODO 待確認」照樣往前。

**可跳過**(非「無前例」):bug 修復 / 純機械勞動(import / typo / 格式)/ user 明確指示。


# 失敗記憶索引(meta anchors only)

**本索引只留純技術沉默陷阱** — 設計判斷類 bug 已被 Meta-Pattern M1-M17 吸收(上表),具體事件歷史詳 `design-system-audit/references/historical-bugs.md`(含「Meta-Pattern M1-M17 origins」節)。

| 技術陷阱 | 一行 anchor | 詳細位置 |
|--------|-----------|---------|
| Tailwind v4 `[--foo]` 必 `var()` | 不被自動包 var,silent 失效 | `# Tailwind 使用規則` |
| tailwind-merge 自訂 utility 註冊 | 不註冊 → group 誤判 strip | `# Tailwind 使用規則` |
| 元件自包 Provider | shadcn 原版 Sidebar 帶 TooltipProvider 劫持全站 | `# shadcn 元件規範` |
| 清 unused imports 後 runtime | tsc 不充分,需 storybook | `# UI 開發規則` |
| shadcn compat alias 回流 | `bg-popover` / `text-muted-foreground` 等 | hook `check_token_hygiene.sh` |
| Tailwind `shadow-md/lg` 繞 elevation token | dark mode 不聯動 | hook `check_token_hygiene.sh` |

**規則**:新 bug 能歸 Meta-Pattern → 回填 historical-bugs.md「M1-M17 origins」節,不寫本索引;不能歸 → 本表 1 行 + 詳細 pointer;條目 > 10 條 = meta-principle 漏寫(跟 user 討論新增 M18)。


# 命名與語言一致性(Meta 規則)

**本節 meta 規則** — 影響所有命名決定(檔案 / 資料夾 / 變數 / spec 章節 / story / API prop)。

命名前必 `ls` / `grep` 既有 pattern,嚴格對齊不憑直覺。詳表 + 禁止清單 → `.claude/references/naming-conventions.md`。

## 命名必過三重 test(governance)

任何新命名(variant / mode / prop value / token / 元件名 / section 名)**必同時通過**:

1. **既有設計語言 test**:跟本專案現行命名對齊?跟 CLAUDE.md 既有詞彙(`compact / rich / sm / md / lg / action / indicator / scanning / reading` 等)沿用而非發明?

2. **世界級 idiom test**:≥2 家 world-class DS 用此詞(Polaris / Material / Atlassian / Ant / Carbon / Apple HIG / Discord / Slack / Notion)?孤立發明詞(即使意思對)不算世界級。

3. **跨元件認知衝突 test**(最易漏):同字串在其他元件是否已有不同語義?例:`text` 是 Button `variant="text"`(文字樣式),若 FileItem `mode="text"` 變「文字為主呈現」= 雙語義,consumer 混淆。grep 既有 prop value 確認同字不撞。

**三個 test 全過才採納**。一個不過 → 改詞或加明確區隔(prefix / 語境)。

**歷史**:FileItem mode 本來差點用 `text / picture`(Ant idiom + 既有語言 ✓),撞 Button `variant="text"` 語義 → 改 `compact / rich`。

## 語言一致性

- spec.md 原則繁中(技術術語保留英);Code identifier 一律英;單一檔案註解統一語言,不中英夾雜;同段落不跨語言(「Rule A」「判斷法 A」擇一)


# 技術架構概覽

```
src/
├── globals.css             ← Tailwind v4 入口 + CSS token bridge
├── lib/utils.ts            ← cn()(clsx + tailwind-merge)
├── hooks/                  ← app-level React hooks
├── design-system/
│   ├── README.md           ← DS 入口 + 各子 dir charter 索引
│   ├── hooks/              ← DS 共用 React hooks(use-overflow-items / use-is-mobile)
│   ├── tokens/             ← charter: tokens/README.md
│   ├── components/         ← charter: components/README.md(PascalCase folder 一元件一家)
│   └── patterns/           ← charter: patterns/README.md(runtime UI primitive)
└── explorations/           ← 未定案 prototype 比稿
```

**目錄以實際檔案系統為準**。查看元件 / pattern / token 清單前先 `ls` 對應 dir。各子 dir 的 charter(收什麼 / 不收什麼)寫在該 dir 的 `README.md`——建立新檔前必讀(見 `# 規則分層` 硬規則)。

Internal primitive vs public-facing 元件的分類 test 見 `components/README.md` 及 Storybook title 命名(`# Story` 章節)。


# Token 系統運作方式

**純 CSS token(無 JS 需求)**:`color/` `typography/` `uiSize/` `layoutSpace/` `opacity/` `radius`。初始狀態 `<html data-theme="light" data-density="md">` 在 `index.html` 設;動態切換操作 `documentElement.setAttribute('data-theme', 'dark')` 即可。JS 端用 `var(--token-name)` 字串。

**完整檔案清單 + dark mode selector + density 切換機制** → `src/design-system/tokens/README.md`(charter)。


# Spec 規則

## 核心原則

- 回答設計問題前必先讀相關 spec.md,不憑記憶
- 編輯 spec 或建新元件時必對照 **Polaris / Material / Ant / Atlassian / Carbon / Apple HIG** 的 7 維度:何時用 / 何時不用 / 近親分界 / 常見誤解 / 相關 links / 空值 / 驗證 / Loading / a11y 預設。有缺口主動提出討論,不假設「沒寫 = 不需要」。SegmentedControl spec 是本專案 template
- 編輯 spec 必交叉比對相關 spec + Storybook,確認無矛盾 / 術語一致 / 無重複
- 與既有 spec 有邏輯衝突 / 概念混淆 → 主動提出討論,不默默改 / 不迴避
- 所有元件遵循 shadcn 框架(forwardRef / Slot / data-* / cva),不從零重寫
- 每個元件 spec「定位」段必明確宣告實作基礎:`基於 Radix X` / `基於 cmdk / sonner` / native / `自建 + 理由`(自建必說明為何不用現有 primitive)
- Spec 文字品質:不描述視覺形狀 / 實作細節(「窄長形」「會變寬」「zero layout shift」屬 story 不進 spec);術語一致;「禁止事項(❌)」列所有常見誤用

## SSOT + 邊界案例覆蓋 + 職責分離

詳 `.claude/references/spec-rules.md` — SSOT 深度判斷 / reciprocal 規則 / 目前 6 個 SSOT anchors / 邊界案例 scope 預設(Field 家族 / dark mode / density / 純 wrapper)/ spec 與 tsx 職責分離 / calc() 公式表達。


# 建立 UI 前必讀

**先 `ls src/design-system/{components,patterns}/`**(不依賴本文件列表)。

## Spec 索引(必查)

| 主題 | Spec |
|------|------|
| Tokens(色彩 / 字體 / 密度 / 尺寸 / 間距 / 陰影 / 圓角)| `tokens/{color|typography|density|uiSize|layoutSpace|elevation|radius}/*.spec.md` |
| Row primitive + List item 必消費 + 選擇/狀態視覺 | `patterns/element-anatomy/item-anatomy.spec.md` |
| 工具列 / 溢出 / 浮層外殼 | `patterns/{action-bar,horizontal-overflow,overlay-surface}/*.spec.md` |
| Field 容器 / Controls / 驗證 | `components/Field/{field,field-controls,form-validation}.spec.md` |

## 既有 primitive 優先消費(超級規則)

命中既有元件 → 必消費,不 hand-craft。**自我檢查**:icon+text 垂直 → `<Empty>`;橫向 row → `<MenuItem>` + slot;浮層 → `overlay-surface`;跨 OS 捲軸 → `<ScrollArea>`(隱藏 + fade → `horizontal-overflow`);鎖長寬比 → `<AspectRatio>`。都沒命中才自建,建完立刻回來加條目。

缺口回元件 spec 擴 API 不自刻。`check_story_anatomy.sh` 攔手刻。完整對照(12 情境 + 8 layout primitive + overflow 三規則)→ `.claude/references/build-ui-canonicals.md`。

**Pattern 規則**:建 UI 前必檢查 pattern;exploration 定案 → 升級 pattern;平坦結構(一 pattern 一資料夾),同領域 ≥ 3 pattern 才建子資料夾。


# UI 開發規則

- 必須優先重用 `src/design-system/components/` 內已存在的元件
- 必須使用 design tokens(Tailwind utilities / CSS 變數);不硬寫顏色、font-size、spacing、radius
- 建立新 UI 前必先檢查 pattern(見 `# 建立 UI 前必讀`);缺元件明確指出不假裝存在
- 使用 `cn()` 合併 Tailwind class(`@/lib/utils`)

## 深度規則 → `.claude/references/ui-dev-rules.md`

| 規則 | Anchor |
|------|--------|
| **同 flex 列互動 slot 幾何鐵律** | 新 slot 進 row 前 3 步 mechanical check(統一 box 尺寸保 gap token)|
| **新增數值前必先查既有 pattern** | gap / padding / font-size / icon size 等 grep 既有系統值 |
| **Padding source 分層規則** | Chrome `layout-space token` / 元件內 slot `p-N` / 精確幾何 `calc()` 三 canonical |
| **Icon size 來源分層規則** | Row 讀 Context / Button 自 mapping / 一次性對齊 uiSize token |

## Row primitives 共用 item-anatomy 公式

寫任何新 row 元件前,讀 `patterns/element-anatomy/item-anatomy.spec.md`(Family 1+2 深度 SSOT)。Audit grep guard 和 SidebarMenuButton 獨立實作風險在該 spec「自我檢查」節。

## 清 unused imports 後必須跑 runtime 驗證

`tsc -b` 必要但不充分(曾漏抓 JSX 內 identifier 和未宣告 export)。任何 import/export 異動後:
1. `npx tsc -b`(**禁用 `--noEmit`**,root tsconfig `files: []` 會 silent pass)
2. grep `export {}` 確認每個 identifier 都有定義
3. `npm run storybook` 實際載入動到的 story
4. 互動操作確認動態 path

## 一句話 Pointer

- **Inline Action vs Button**:判斷樹 + 場景表 → `patterns/element-anatomy/item-anatomy.spec.md`「Inline Action 設計規格」
- **Separator vs CSS border**:誰決定「這裡要分隔」→ `components/Separator/separator.spec.md`
- **陰影**:一律 `--elevation-*`;禁 `shadow-sm/md/lg/xl/2xl` / 硬寫;`shadow-none` OK → `tokens/elevation/elevation.spec.md`
- **視覺容器 breathing**:有明確邊界(bg/border/shadow)→ 必 inner padding → `patterns/element-anatomy/element-anatomy.spec.md`
- **選擇 / 狀態視覺**:使用既有 state prop,指示器對應 selection model → item-anatomy「選擇 / 狀態視覺規則」


# Tailwind 使用規則

Tailwind 預設間距 / 尺寸 class 可用;對應 token 時用 `className="p-[var(--layout-space-loose)]"` 任意值。圓角:`rounded-md` 4px / `rounded-lg` 8px / `rounded-full` 9999px。

## 5 條核心規則(每條過真實 bug,詳見 `.claude/references/tailwind-gotchas.md`)

1. **CSS variable 必 `var()` 包覆** — `w-[var(--foo)]` 而非 `w-[--foo]`(v4 silent 失效)
2. **自訂 utility 必在 `lib/utils.ts` 註冊 group** — 否則 tailwind-merge 誤判 strip
3. **禁 `shadow-sm/md/lg` / `text-xs/sm/base` / 硬寫色值** — 用 `shadow-[var(--elevation-*)]` / `text-body`
4. **禁 shadcn compat alias**(`bg-popover` / `text-muted-foreground` / `bg-accent` 等)— 用 direct token;hook `check_token_hygiene.sh` 攔
5. **禁 primitive 色名作 utility**(`bg-neutral-3` / `text-blue-6` — silent 失效,無 `@theme inline` 橋接)— 用 semantic utility 或 `bg-[var(--color-blue-6)]`


# Token 命名原則

所有 design token 必一致命名邏輯 — 看 token 名就知層級 / 角色 / 關聯。

## 核心區分

- **Primitive**(無語意):`--color-*` 前綴 + 編號(`--color-blue-6` / `--color-neutral-9` / `--field-height-md`)
- **Semantic**(賦 purpose):無 `--color-` 前綴,直接表 purpose(`--primary` / `--foreground` / `--neutral-hover` / `--inverse-fg`)

**Namespace + Role 結構**:`--{namespace}-{role}-{variant?}` —
- Namespace:`primary / error / neutral / inverse / fg / bg / field`
- Role:`fg / bg / hover / active / subtle / text / height / size`
- Variant:`secondary / muted / disabled / xs/sm/md/lg`

## 4 條硬規則

1. **對齊既有 family**:新 token 鏡射既有 family,不孤立發明(詳 `tokens/color/color.spec.md`)
2. **不混語義與色名**:Tag / Avatar 用 primitive(`var(--color-deep-orange-1)`);Button / Checkbox 用 semantic(`var(--error-subtle)`)。改 `--error` 色不影響 Tag red variant
3. **新增語意色相**:走 `tokens/color/color.spec.md`「新增語意色相的標準流程」(SSOT)。本系統採 **Atlassian-style Semantic State Token** 流派(靜態色用 primitive,互動狀態用 semantic)
4. **禁止事項**:籠統命名(`--inverse-hover` 不知 text/bg/border)/ 孤立命名 / 自創縮寫(`--fg` vs 既有 `--foreground`) / Primitive 帶語意(`--color-primary-6`) / Semantic 帶色相(`--primary-blue`) / Categorical 中間層(`--blue-hover` 已廢除)


# 元件 Props 命名原則

**按「是什麼」命名,不按「在哪裡」命名**(Material Chip / Ant Tag idiom):
- slot 只接 icon → `startIcon` / `endIcon`(型別 `LucideIcon`,元件控尺寸)
- slot 接任意視覺 → 描述內容類型(`avatar`,型別 `ReactNode`)
- slot 是行為 → callback(`onDismiss`,元件渲染互動 + 樣式)
- ❌ 禁 `prefix` / `suffix` / `left` / `right`(位置名不傳達本質)

**4 名關閉 / 移除 callback 各有語意不合併**(詳 `.claude/references/props-naming.md`):
`onClose`(Dialog / Sheet / Popover overlay session)/ `onDismiss`(Alert / Toast 通知忽略)/ `onRemove`(集合移除 item)/ `onClear`(欄位內容清空)。

**Badge 命名按放置**:`badge`(inline in pill 有 label)/ `overlayBadge`(疊視覺重心 iconOnly)/ `badgeCount`(Avatar count)/ `status`(Avatar presence dot 非 Badge)。禁組合:有 label 的 Button/Chip 不疊 `overlayBadge`。

**Icon canonical**:Overflow `MoreVertical` / Breadcrumb ellipsis `MoreHorizontal`(唯一保留)/ Close `X`(error 才 `XCircle`)/ 成功 `Check` / 警告 `TriangleAlert` / 資訊 `Info`。


# shadcn 元件規範

**結構**:每元件一資料夾 `{name}.{tsx,spec.md,stories.tsx,anatomy.stories.tsx,principles.stories.tsx}`。tsx 用 forwardRef + cva + VariantProps + cn() + `{Component, componentVariants}` export(讀 Button/Input 當範本)。Import `@/design-system/components/{Name}/{name}`(無 barrel)。`npx shadcn add` 後**立刻 grep 移除 shadcn compat alias**。

**cva 適用**(詳 `.claude/references/cva-patterns.md`):className-only 差異 → cva;style 物件 → object map + `style={{}}`;不同 JSX 樹 → conditional rendering。禁:塞 style prop 入 cva / 不同結構硬塞同 JSX。

## 元件不得自包全域 Provider(Tooltip / Theme / Toast / Portal)

由應用層(main.tsx / preview.tsx)統一設定。**判斷**:Context 是**行為狀態**(open / size / current)→ 可包;**全域外觀配置**(delay / theme / portal / variant defaults)→ 禁止。

歷史 bug:shadcn 原版 SidebarProvider 包 `TooltipProvider delayDuration={0}` 覆寫全站 hover 節奏。從 shadcn 複製時必 grep 移除內建 Provider。


# Primitive Exposure Layer(3 層暴露 canonical)

設計系統的 primitive 按**暴露對象**分 3 層。建新元件 / 新 API 時先決定層級,錯置會造成 consumer 選用困擾(Button 太複雜卻當 embedded action 用)。

| Layer | 對象 | API 形式 | 例 |
|-------|------|---------|---|
| **L1 — User-facing** | 所有人(app + stories + consumer) | variant / size prop / ReactNode slot | Button / Input / MenuItem / FileItem / DataTable |
| **L2 — Host slot API** | 消費 L1 host 的 app code | config-based `{icon, label, onClick}` | `Input.endAction` / `MenuItem.inlineActions` |
| **L3 — Internal**(不暴露 app)| 建新 host / row primitive 的 DS 作者 | 低階 building block,only export for composition | `ItemInlineAction` / `ItemIcon` / `RowSizeProvider` |

## 判斷新 primitive 放哪層(3 題)

1. **App code 需要直接 import 嗎?** → 是 → L1(e.g. `Button`);否 → 看 Q2
2. **它是「host 內部 embedded action」的 config API 嗎?** → 是 → L2(e.g. `InlineActionConfig` + host slot prop);否 → 看 Q3
3. **它是「建新 host 元件時的低階 building block」嗎?** → 是 → L3(e.g. `ItemInlineActionButton`);否 → **不該是新 primitive**(可能是舊元件的 feature,走 feature prop)

## 規則

- **L3 primitive 的 stories / docs 必明示「internal; app 請走 host slot API」**
- **L1 上不做 L3 該做的事**(例:Button 不該加「embedded=true」density 維度;embedded 情境走 L2 host slot)
- **L2 config-based 比 ReactNode slot 更 opinionated**(防 consumer drift),新 host 元件優先 config
- **新 L1 primitive 要經 Checkpoint 3**(classification ambiguity);L2 / L3 可 AUTO

## 世界級對照

本 taxonomy 是 DS 原創,但結構對齊:
- **Radix / Headless UI / Ariakit**:compound component 模式(L1 wrapper + L3 primitives 給 composition)
- **Polaris / Material / Atlassian**:host 元件 slot 吃 ReactNode(相當於 L2 但無 config-based opinionation)
- **我們的 L2 config-based** 比世界級 slot 更 opinionated(防 consumer drift),是 slight deviation 有 rationale

## Icon action primitive 的 3 層分佈(範例)

- **L1**:`<Button iconOnly />` — 獨立 action(toolbar / chrome corner / standalone)
- **L2**:`Input.endAction` / `MenuItem.inlineActions` / 未來 `FileItem.actions / DataTable.rowActions`(config API,host 內部渲染 L3 primitive)
- **L3**:`ItemInlineAction`(config wrapper)/ `ItemInlineActionButton`(raw button)— 不直接暴露給 app

完整 Inline Action vs Button predicate 見 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate」。


# 系統內部 Layout — 4-Family Model

**每個元件 spec 第一段必須聲明 Layout Family**(1/2/3/4 或「非上述 / self-contained」),確保相同用途用相同 layout,AI 舉一反三。

| Family | 用途 | SSOT |
|--------|------|------|
| **1. Menu item** | Menu 內掃視單列(scanning) | `patterns/element-anatomy/item-anatomy.spec.md` |
| **2. List item** | 頁面閱讀式單列(reading) | 同上 |
| **3. Pill** | 單行互動 pill | `components/Button/button.spec.md`「Pill Layout」 |
| **4. Field control** | 可編輯資料輸入 | `components/Field/field-controls.spec.md` |

**判斷**:垂直列表 → F1(menu)/ F2(頁面);單行可點 / 可讀 pill → F3;單行可編輯 → F4;都不是 → 停下討論(新 family 還是 self-contained)。

**dual-anchor**:`element-anatomy.spec.md` = 4-Family 整體 taxonomy(cross-pattern governance);`item-anatomy.spec.md` = Family 1+2 row 深度 SSOT(runtime primitive)。

**命名鐵律**:「layout」保留給 page-level(未來家);element 結構永遠用「anatomy」。Material / Polaris / Atlassian / Carbon 皆如此 — Foundations > Layout 是 page-level,element 屬 component anatomy。


# 元件完成 checklist

元件即將合入 DS 時 invoke `/component-quality-gate` skill:45 項 Spec / Code / Stories / Ship checklist,走完才算 ready。`block_prototype_imports.py` hook 另會自動擋正式 code import `explorations/`。


# Exploration & Prototype

- **正式 vs 比稿**:`src/design-system/` 已定案可重用 / `src/explorations/` 未定案 prototype;正式 code 禁 import explorations(hook `block_prototype_imports.py` 強制)
- **Exploration 檔案**:每題一個 `src/explorations/{topic}/` folder,含 `*.v1.stories.tsx` / `*.v2.stories.tsx` + `notes.md`(記差異 / 假設 / 比較重點)
- **定案流程**:整理完升級為 `patterns/`(若屬 runtime primitive)或 `components/`(若是新元件);不再需要可刪整個 folder
- **/prototype skill**:user 明言「做 prototype / MVP / 原型」時走,含 5 phases + Phase 3.5 強制 audit gate(invoke `/product-ui-audit`)


# Story

**完整 workflow → `/story-writing` skill**。本節只留每 session signal。

## 三層定位

| 層 | 檔案 | 職責 |
|---|---|---|
| **展示** | `{name}.stories.tsx` | 設計規格便利瀏覽(車子展示間) |
| **設計規格** | `{name}.anatomy.stories.tsx` | token / 尺寸藍圖 / Inspect,取代 Figma(車子規格表) |
| **設計原則** | `{name}.principles.stories.tsx` | do/don't / 情境選擇(駕駛手冊) |

三層「看→查→判斷」閱讀深度遞進,職責不重複。

## Title 命名 + Internal vs Components

Title path:`Design System/{Tokens|Patterns|Components|Internal}/...`;第一層英文、元件 PascalCase、子頁中文;子頁前不加元件名(❌ `MenuItem 展示` → ✅ `展示`)。

**Internal vs Components 三題 test**:(1) 元件有預設視覺(bg/border/shadow/padding/rounded)?(2) 直接 `<X>` 放頁面有視覺?(3) 所有消費者都包 wrapper?三題都傾向 Internal → `Internal/`;任一明確傾向 Components → `Components/`。**看行為不看名字**(HoverCard 名字 public 但純行為 → Internal/)。

現有分類:Components/(Button / Input / Select / Dialog / Popover / Sheet)/ Internal/(Menu / SelectMenu / Notice / SelectionControl / OverflowIndicator / HoverCard / Command)。

## 範例最高準則

**精簡幹練、0 重複、每 story earn its existence**。Story 的唯一任務是教學:讓讀者推得出自己產品怎麼用,或把模糊原則具象化給人看懂。

**核心 philosophy**(2026-04-24):
- **以「可舉一反三」範例為主** — 一個 story 教一條原則,讀者能類推到其他情境
- **Manual 範例補充模糊原則,讓抽象具象化** — 若 spec rule 模糊(如「真實場景」),manual story 用具體 Jira/Stripe/Notion 劇情把它釘下來讓「人」看懂
- **禁止湊數 / 重複 / 秀肌肉** — 跟別 story 重疊 = noise,造成 drift + 維護成本 + 讀者噪音。audit Dim 24/25 會抓

**兩 earn-existence test**:(a) 教一條別 story 沒教的原則?(b) 移除後 spec 理解會 degrade?兩題皆 NO → retire。

❌ 禁止:佔位符(`Option A/B/C` / Lorem / foo)/ 抽象代號(「按鈕一」/ `Variant X`)/ 極端不現實 / 視覺符號 / spec 內部代號

**兩驗收 test**:「人 test」遮標題 5 秒懂情境?/「舉一反三 test」讀者推得出自己產品怎麼用?

詳細合法場景(Jira / Stripe / Notion / Figma...)/ anatomy 5-story / Rule note / 連動 cva defaultVariants 漂移 → `/story-writing` skill。
