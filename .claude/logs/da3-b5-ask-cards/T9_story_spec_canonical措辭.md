# T9 — story / spec canonical 措辭　決策卡

**Verdict: MIXED** — 6 findings：3 真拍板題（d68i3 / d17i0 / d12i56）+ 3 降 AUTO（d24i10 / d24i12 / d24i15，story 去重已被既有 canonical 管住）。

SSOT-check 方法：grep 我方 `*.spec.md` + `.claude/rules|references|skills` + `git log`；真決策做 WebFetch/WebSearch ≥3 家世界級對照。

---

## 決策 1 — d68i3　Button `tertiary + danger` 到底合不合法（真 spec-vs-spec 衝突）

**【問題】**
兩份 spec 直接打架：`button.spec.md:416` 明文禁止 `tertiary + danger`（說「無對應 compoundVariant，會靜默渲染成一般灰色 tertiary，沒有紅色危險視覺」），但 `bulk-action-bar.spec.md:84/147/197/208` 反過來**強制規定**批次危險操作（例如「刪除選取」）要用 `tertiary + danger`。結果 = BulkActionBar 的批次刪除鈕現在靜默渲染成灰色，使用者看不出那是危險操作。這是真的 bug + 真的 canonical 衝突。

**【世界級對照，≥3 家】**
- **Carbon**：danger 鈕明確有三個強調層 —— primary / **tertiary** / **ghost**；官方指引「當版面有多個動作（toolbar、data list、dashboard），低強調的 tertiary/ghost danger 更適合」。Carbon 甚至有多個 GitHub issue（#5610 / #534 / #1838）就是在補 tertiary + ghost danger。這正好就是 BulkActionBar 的場景。（carbondesignsystem.com/components/button/usage）
- **Ant Design**：`danger` 是**正交 prop**，可套在任何 type 上 —— `type="primary" danger`、`danger`（default+danger）、`type="text" danger`、甚至 `type="primary" danger ghost`。低強調 danger（text danger / ghost danger）完全支援。（ant.design/components/button）
- **Material 3 / Polaris / Atlassian**：低強調 destructive 動作是跨系統共識（搜尋結果明列 Material Design 3 / Polaris / Atlassian / Salesforce / Fluent 均實作低強調 destructive）。

**【選項】**
- **選項 A — 給 Button 補 `tertiary + danger` compoundVariant（紅字、無填色）**
  - tradeoff：Button 多一個 danger 強調層（公開 variant 組合擴充）；但這正是 Carbon/Ant 的世界級做法，且直接兌現 BulkActionBar 既有 mandate、消掉靜默灰色 bug。
- **選項 B — 改 BulkActionBar canonical，destructive 改用 `text + danger` 或 `secondary + danger`（Button 現已支援）**
  - tradeoff：不動 Button 契約；但 BulkActionBar 的危險操作視覺強調會改變（`text danger` 比 `tertiary` 更輕、`secondary danger` 有填色更重），且要改 BulkActionBar spec 三處 mandate。

**【推薦】選項 A。**
理由：Carbon 明確把「toolbar / data list 的多動作低強調 danger」點名成 tertiary-danger 的適用場景，跟 BulkActionBar 一模一樣；Ant 也證明 danger 應能組合到低強調層。BulkActionBar spec 早已 mandate 這個組合，補 compoundVariant 是「讓 Button 兌現既有跨元件契約」而非發明新東西。選 B 會讓我方 destructive 視覺語言偏離世界級低強調 danger 共識。

**【SSOT 理由】** 新 API contract —— Button 新增 `tertiary + danger` compoundVariant = 公開 variant 組合擴充，同時解掉 `button.spec.md` ↔ `bulk-action-bar.spec.md` 的 canonical 直接衝突。

---

## 決策 2 — d17i0　Alert `placement="inline"` 跨元件命名一詞兩義

**【問題】**
`Alert.placement = "inline" | "fixed"`（inline = 頁內嵌卡片、fixed = 頂部全域橫幅），但 DS 別處 `ItemAvatar.mode` / `Field` layout 用 `inline | block`（inline = 單行 / 首行對齊）。同一個 `"inline"` 字在不同元件承載「表面擺放位置」vs「子元素佈局」兩套認知 —— 命中 AGENTS.md 命名 3-test 第 3 條（跨元件認知衝突）。

**【世界級對照，≥3 家】**
- **Carbon**：頁內嵌訊息叫 **InlineNotification**、全域頂部叫 **Banner**。我方 Alert 的 `"inline"` 正好對齊 Carbon InlineNotification idiom。（carbondesignsystem.com/components/notification）
- **Carbon 社群**：自己也有 banner-vs-inline 術語混淆 issue（#3659）—— 顯示這個命名張力連世界級都沒有乾淨解法。
- **我方既有 canonical**：`alert.spec.md:154-157` 已 codify `inline`（rounded card）/`fixed`（page bar）的圓角 rationale，且明白對齊 Card tier。M23：我方既有 canonical + 世界級 idiom 雙重命中。

**【選項】**
- **選項 A — 保留 `Alert.placement="inline"|"fixed"`（不動）**
  - tradeoff：對齊 Carbon InlineNotification 世界級 idiom + 保住 `alert.spec.md` 既有 codified rationale + 不破壞已發佈公開 API；代價 = 容忍 `"inline"` 在不同 prop namespace（`placement` vs `mode`/layout）的一詞兩義。
- **選項 B — Alert 改 `scope="embedded"|"global"`**
  - tradeoff：消除跨元件 `"inline"` 認知衝突；代價 = 破壞公開 API contract（`placement`→`scope`）+ 偏離 Carbon InlineNotification idiom + 改 spec/stories。

**【推薦】選項 A（保留）。**
理由：`placement` 與 `mode`/layout 是不同 prop namespace，實務混淆風險低；Alert 的 `"inline"` 同時命中 Carbon 世界級 idiom 與我方既有 codified canonical（M23 我方 canonical + 世界級雙重優先）；rename 一個已發佈 npm 公開 prop 破壞 consumer 契約，得不償失。這題本質是「這個一詞兩義能不能容忍」的跨元件 design-language 判斷，因涉公開 API 才上呈拍板。

**【SSOT 理由】** 公開 prop rename（`placement`→`scope`）= API contract 變更 + 改 `alert.spec.md` placement canonical 語意；即使推薦不改，「容忍 or 重命名」本身是跨元件命名 canonical 拍板。

---

## 決策 3 — d12i56　FieldControlGroup「Mode A/B」字母代號 →語意名（低風險）

**【問題】**
FCG 的 `field-control-group.spec.md:92,103` + `principles.stories.tsx:94/100/112` 用「Mode A / Mode B / Mode C」字母代號描述 size 解析與使用場景。字母代號本身沒有產品語意（story 已補描述性副標「包進 Field 當 control slot」「Filter row 場景」，但仍掛 Mode A/B 前綴）。

**【對照（先例 + mindset，屬內部 canonical 決策）】**
- **我方先例**：2026-06-03 已 **user-approved** 退役 FileItem「Type A/B」jargon 改語意詞彙（commit `880ed390`，理由「code 只有一個真實機制，spec 另立一套代號 →必漂移」）。
- **mindset #4**：禁抽象 `Option A/B/C`／「按鈕一」類代號，範例必真實語意。
- 世界級 story 慣例（category-templates.md 引 Ant/MUI/Carbon）= 描述性 story 標題（`OutlinedButtons`/`LoadingButtons`），不用字母代號。

**【選項】**
- **選項 A — spec + story 同步把「Mode A/B/C」改成語意名**（如 story 層「Field 內複合控制」/「篩選列」；spec 層「Field-context 尺寸」/「standalone 逐一設」/「Popover 鎖 md」）
  - tradeoff：更易懂、對齊 FileItem 先例 + mindset #4；代價 = 改 canonical 用語需 spec + story 跨檔同步。
- **選項 B — 保留 Mode A/B/C**
  - tradeoff：零改動；代價 = 抽象代號違 mindset #4 精神、與 FileItem 已退役的 Type A/B 不一致。

**【推薦】選項 A（可與 FileItem 同一取向一次核准）。**
理由：FileItem Type A/B 退役已立 user-approved 先例、mindset #4 明禁抽象代號、世界級 story 用描述性標題。這是本主題最低風險的一題 —— 只是因為要動 spec canonical 用語（被 :92/:103 引用）+ 需選定新語意名，才上呈拍板；若你同意「跟 FileItem 同一方向」，可一句核准全部帶過。

**【SSOT 理由】** 改 canonical 用語 —— `field-control-group.spec.md` 的 Mode A/B/C 是被引用的 canonical 措辭，rename 需 spec + story 同步。

---

## 降 AUTO（3 finding，不佔用你的決策力）

story 去重類（Input / LinkInput / NumberInput 的 Modes / Default / Validation / FormatOptions 等）—— **既有 canonical 已經把「該留哪些」拍板過了**，我方只要對齊執行，不需你再決定：

- **既有 canonical 1（Universal Default）**：`category-templates.md`「### Universal（每元件必有）— Default」明文規定 Default 每元件必留 →退役 Default 直接違反 canonical。
- **既有 canonical 2（field-family 展示慣例）**：`checkbox.stories.tsx` + `switch.stories.tsx` 檔頭 `@story-trait-rationale` 已 codify「四模式(Modes) / 狀態(States) 是家族標準展示，不另開抽象 Default/AllSizes」→ Input/LinkInput/NumberInput 的「四模式」story 是**刻意的家族一致性展示**，不是意外重複。`number-input.stories.tsx` 甚至已掛 rationale 註記 tracked。

審計「退役重複」的前提與這兩條既有 canonical 直接衝突（M23：我方既有 canonical 優先）。而且 story 檔屬**文件層、非 SSOT-UI/UX 視覺結構**（無 component/token/spec 視覺改動、無 API 契約改動、無 design-language 改動）→ 寫不出 SSOT 拍板理由 → 降 AUTO。

**AUTO 執行內容（對齊既有決策）**：每個 field-family story 集對齊 checkbox/Switch 檔頭慣例 —— 保留 Universal Default + 家族標準「四模式/狀態」+ 缺的補 `@story-trait-rationale` 註解；只有真正無 canonical 保護的冗餘 story（clean/refactor→AUTO）才清。

| id | 元件 | 一句 cite |
|----|------|-----------|
| d24i10 | Input | Modes/EndAction：Modes 受 family 慣例保護（checkbox/switch 檔頭豁免），EndAction 若真冗餘屬 AUTO story cleanup；無 API/視覺/design-language 改動 |
| d24i12 | LinkInput | Default 受 `category-templates.md`「Universal 每元件必有」保護禁退役 + Modes 受 field-family 慣例保護；story 文件層寫不出 SSOT 理由 |
| d24i15 | NumberInput | Modes 受 family 慣例保護（`number-input.stories.tsx` 已有 `@story-trait-rationale` tracked 註記）；FormatOptions/InDataTable 若真冗餘屬 AUTO clean/refactor |
