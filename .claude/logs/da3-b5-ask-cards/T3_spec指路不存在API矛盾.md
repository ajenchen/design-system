# 決策卡 — T3_spec指路不存在API矛盾

DS deep-audit B.5 ASK 收斂。本主題 3 個 finding（d33i2 / d44i1 / d7i19），全部通過 SSOT-check 後仍屬真拍板題，**無降 AUTO**。合成 2 張決策卡（d33i2 + d44i1 同構合併，d7i19 獨立）。

Verdict: **DECISION**（3 個全 ASK，0 個降 AUTO）

---

## SSOT-check 結果（先行，最重要）

| 議題 | 我方既有 canonical | 是否已拍板此議題 resolve? |
|------|--------------------|---------------------------|
| Command/CommandDialog 該 public 還 internal | `ui-development.md` 2026-07-10 refine：「isInternal = 需 subpath + 包裝後才用，**非禁止使用**」；`command.spec.md:170` 設計哲學「走 Material Autocomplete 一體封裝，app 不直接用 Command，必透過 wrapper」 | ❌ 未拍板「CommandDialog 該不該升 public front-door」。2026-07-10 canonical 只確立「internal 可經 subpath 消費」，**降低了矛盾嚴重度**（App 經 subpath 用 CommandDialog 其實不違反 canonical），但沒 resolve「該不該進 root barrel」 |
| creatable 該 public 還 internal | `combobox.spec.md:135`（近期 code-aligned）明文「Combobox 不暴露 creatable / onCreate（僅 SelectMenu primitive 支援）」 | ⚠️ 半拍板。此行是 commit `0658999c`「align-doc-to-code」改的——原文曾宣稱「Combobox forward onCreate」，被**修正成對齊 code 現況**。是 AI doc-to-code 對齊，**非 user 拍板**。而 `select-menu.spec.md:52`「用 Combobox + creatable」是最初建檔（`fee05f39`）的**stale 指路**，從未更新 |

**結論**：兩議題都沒有 user 拍板過的 resolve 方向。都有一條分岔會**新增公開 API**（SSOT-affecting），故都是真拍板題，不降 AUTO。但 SSOT-check 讓兩張卡都能給出**強推薦方向 + 便宜預設**，不讓 user 從零權衡。

---

## World-class 對照（≥3 家，真決策佐證）

**Command Palette wrapper 該 public 還 internal**
- **shadcn/ui**（ui.shadcn.com/docs/components/command）：`Command` + `CommandDialog` + `CommandInput/List/Group/Item/Empty/Separator` **全部公開**，app 直接 import 建 Cmd+K。
- **cmdk / Vercel**（github.com/pacocoursey/cmdk）：所有 primitive 公開，`Command.Dialog` 公開；為 Vercel command menu 而生的 composable API。
- **Radix UI**（github.com/radix-ui/primitives/issues/1492）：**無**專屬公開 CommandPalette primitive（僅 2022 feature request 未釋出）；官方走 public `Combobox` 低階 primitive 自組。
- **Material UI**：`Autocomplete` 一體公開，**無**分離的 command primitive（一體封裝哲學）。
- 判讀：世界級主流（shadcn/cmdk）把 command palette 全家族**公開**；但我方 `command.spec.md:170` 刻意對標 Material 一體封裝、明文「app 不直接用 Command」。M23：我方既有 canonical（刻意 internal + 一體哲學）優先於外部 shadcn/cmdk 開放模型。

**creatable（建立新選項）該 public 還 internal**
- **MUI Autocomplete**（mui.com/material-ui/react-autocomplete）：`freeSolo` + `Add "YOUR SEARCH"` option = **公開** consumer-facing creatable（組合式）。
- **Ant Design Select**（ant.design/components/select）：`mode="tags"` 讓使用者建新選項 = **公開**正式功能。
- **Radix / Polaris**：Radix 無內建 creatable；Polaris Combobox + Listbox 有「Add」action pattern。
- 判讀：世界級主流把 creatable 當**公開**功能。我方目前把它鎖在 internal SelectMenu primitive，`select-menu.spec.md:52` 曾承諾公開卻從未實作。

（來源：WebFetch 三家 200 OK — shadcn / MUI / Ant；Radix 為 WebSearch snippet，標 search-only confidence。）

---

## 決策卡 1 — Command / CommandDialog：public front-door 還是 internal + subpath?
（合成 finding：**d33i2** + **d44i1**，同一核心 boundary，tradeoff 同構）

**【問題】**
整個 Command 單元標為 internal（frontmatter isInternal、排除 root barrel、index.ts:591），但 `command.spec.md:23/69` 明文指示「App 不直接用 Command；要做 Cmd+K palette 就用本檔 export 的 `CommandDialog`」——把 CommandDialog 定位成 app 面向的入口，卻又被關在 internal 單元裡拿不到 front-door。**關鍵結構事實**：CommandDialog 不是 turnkey——`command.tsx:31` 它只吃 `children`，consumer 仍得自己塞 `CommandInput / CommandList / CommandItem`（全在 internal Command 家族）。所以「只升 CommandDialog 一個」做不出 palette，要嘛整個家族升 public，要嘛整個家族留 internal。

**【選項 A：整個 Command 家族升 public root barrel】**（finding 原建議的方向）
- 做法：Command / CommandDialog / CommandInput / CommandList / CommandGroup / CommandItem / CommandEmpty / CommandSeparator 全部進 root barrel front-door，consumer `import { CommandDialog, CommandInput, ... } from '@qijenchen/design-system'`。
- Tradeoff：對齊世界級主流（shadcn/cmdk 就是全家族公開），app 建 Cmd+K 零摩擦；但**一次新增 ~8 個 npm 公開 API（永久契約）**，且直接**違反 `command.spec.md:170` 我方刻意的「Material 一體封裝、app 不裸用 cmdk primitive」哲學**——等於推翻自己記載的設計立場。

**【選項 B：整個 Command 家族留 internal，spec 改口走 subpath】**（推薦）
- 做法：維持 internal 分類不動；把 `command.spec.md:23/69` 措辭改成「App 建 Cmd+K palette 經 subpath import `@qijenchen/design-system/components/Command`（自行包裝確認），非 root barrel」。順帶清掉綁在一起的 stale 措辭（見下方「附帶 AUTO 清理」）。
- Tradeoff：完全對齊 2026-07-10 ui-development.md canonical（「internal = 需 subpath + 包裝後才用，非禁止」）+ 我方一體封裝哲學；零新增 npm 公開面。代價是 Cmd+K 這個罕見 app 級需求要走 subpath（多一點摩擦）——但 palette 本來就不是每頁都要的東西，可接受。

**【推薦】選項 B。**
理由：(1) 2026-07-10 canonical 已明確「internal 經 subpath 消費是正當的、不是矛盾」——所以這個 finding 的「矛盾」其實在該次 refine 後已軟化，只剩 spec 措辭沒跟上；(2) Cmd+K palette 是罕見 app 級需求，subpath 摩擦可接受；(3) 選項 A 要一次曝 8 個 primitive、且推翻 `command.spec.md:170` 白紙黑字的一體哲學（M23：我方既有 canonical 優先於 shadcn/cmdk 外部開放模型）；(4) 選項 B 零永久 API 負債。**只有當你要「app 直接 `import { CommandDialog }` 零摩擦、且願意公開整個 cmdk 家族」才選 A。**

**【SSOT 理由】**
選項 A = 新增 ~8 個 root barrel 公開 export = **新 npm public API contract（永久）**；選項 B = 改 `command.spec.md` canonical 措辭語意（internal 存取路徑）。兩條都動 SSOT（一是新 API 契約、一是 canonical 語意），故必須 user 拍板方向。

**【附帶 AUTO 清理】**（方向定了就自動做，不另問）
d33i2 綁進來的次要矛盾，方向定後屬對齊性 AUTO：
- `command.spec.md:118` 稱「SelectMenu（公開消費入口）」是 stale/錯——SelectMenu 自身 isInternal，真正公開入口是 Select/Combobox/PeoplePicker，應改口。
- `principles:62`「不直接放 app」vs `spec:78`（2026-06-12 放寬 inline 嵌頁面必自帶邊框容器）的張力：spec:78 是 user 已拍板的例外，principles story 措辭補上「inline 例外見 spec 禁止事項」即可對齊。

---

## 決策卡 2 — SelectMenu 指路「Combobox + creatable」但該 API 不存在
（finding：**d7i19**）

**【問題】**
`select-menu.spec.md:52`「何時用」表寫「可建立新選項（creatable tag）→ 用 `Combobox` + `creatable` prop」。但 `Combobox` 根本沒有 `creatable / onCreate`（grep combobox.tsx = 零），而且 `combobox.spec.md:135` 近期才**明文寫死**「Combobox 不暴露 creatable / onCreate（僅 SelectMenu primitive 支援）」。同時 `select-menu.spec.md:53` 又禁止直接用 internal SelectMenu。等於這條指路指向一個**不存在的公開 API**，且跟另一份 spec 自相矛盾。creatable 能力其實存在（SelectMenu internal，select-menu.tsx:79-83），只是沒 forward 到公開 Combobox。

**【選項 A：把 creatable 做成公開功能，Combobox 曝 `creatable` / `onCreate`】**
- 做法：Combobox 加 `creatable` / `onCreate` / `createLabel` public props，forward 給底層已支援的 SelectMenu；補 spec + stories + a11y（「建立 xxx」row 的 role/鍵盤）。
- Tradeoff：兌現 `select-menu.spec.md:52` 最初的承諾，對齊世界級（MUI freeSolo / Ant tags 都公開 creatable）；但**新增公開 API + 新的「creatable tag」設計語言**，要完整 spec/story/a11y 落地，是真功能投資；且要推翻近期 `combobox.spec.md:135` 剛對齊 code 的「不暴露」立場。

**【選項 B：修 stale 指路，creatable 維持 internal-only】**（推薦）
- 做法：把 `select-menu.spec.md:52` 改成對齊 `combobox.spec.md:135`——移除「用 Combobox + creatable」假指路，改「目前無公開 creatable wrapper；creatable 僅 SelectMenu internal primitive 支援，尚未 forward 到公開元件」。
- Tradeoff：對齊近期 code-aligned canonical（combobox.spec.md:135）、消除 spec-vs-spec 矛盾、零新 API；代價是 consumer 現階段拿不到 creatable（但本來也拿不到，只是文件騙人）。

**【推薦】選項 B。**
理由：(1) `combobox.spec.md:135` 是近期 `0658999c`「align-doc-to-code」對齊過的 canonical，明文「不暴露 creatable」，而 `select-menu.spec.md:52` 是 2024 初建檔的 stale 承諾、從未實作——修 stale 對齊 code-aligned canonical 是最便宜、最一致的解；(2) 沒有任何 consumer 需求信號要 creatable；(3) 選項 A 是完整功能投資（API + story + a11y），沒需求前不該開。**只有當你確定要把「使用者自建選項」變成公開產品功能，才選 A。**

**【SSOT 理由】**
選項 A = Combobox 新增 `creatable / onCreate` **公開 API contract** + 新「creatable tag」視覺/互動設計語言；選項 B = 對齊 spec 語意到既有 code-aligned canonical（無新 API）。分岔含 SSOT-affecting 分支（選項 A），故需 user 拍板要不要開這個功能。

---

## 給 user 的一句話總結

兩題本質都是「spec 指路指向 internal / 不存在的東西」，我方 canonical 其實都**偏向 internal**（Command 一體哲學 + Combobox 明文不暴露 creatable）。兩張卡的**便宜預設都是「留 internal + 修 spec 措辭」（選項 B）**，只有當你想「把 Cmd+K palette / creatable 升成公開產品功能」才選 A。B 走的是對齊既有 canonical，A 走的是新公開 API 投資。
