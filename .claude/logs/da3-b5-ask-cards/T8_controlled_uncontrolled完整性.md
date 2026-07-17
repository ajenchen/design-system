# 決策卡 — T8 開關/展開控制權的完整性(controlled / uncontrolled)

Verdict: **DECISION**(2 findings 都是真拍板題,無可降 AUTO)
Findings: d26i5(Steps 展開)+ d26i6(AppShell 側邊欄)— tradeoff 同構,合成單一決策卡,分元件給推薦。

---

## SSOT-check(先行,最重要)

**已有 canonical(判準),但沒有針對這兩個元件的既往拍板**:

1. **Dim 26 dual-mode canonical 已存在** — `.claude/skills/design-system-audit/references/audit-prompts.md:891-941, 1029-1033`。
   明文定義 4 種違反:V1 缺 uncontrolled / **V2 缺 controlled** / V3 無 callback / V4 內部 state 蓋掉 prop;並定義**例外機制**:「刻意只支援單一模式 → spec.md 該元件節必補『單一模式 rationale』段」。
   - d26i5(Steps 展開)= 典型 **V2**(有 `defaultExpanded` uncontrolled,缺 `expanded`/`onExpandedChange` controlled)。
   - d26i6(AppShell 側邊欄)= **V1 變體**(有 `asideOpen`/`onAsideOpenChange` controlled + 內部 `useState(false)` fallback,但缺 consumer 可設的 `defaultAsideOpen`)。
   - 這條 canonical **只規定「要嘛補齊、要嘛寫 rationale」,沒有替這兩個元件決定該走哪條** → 屬設計意圖決策,不是既已拍板。

2. **git 先例**:commit `ac86f526`「Dim 26 V2 rationale」曾用「補 spec rationale」的方式收 V2 —— 證明「記錄單向 rationale」是合法且用過的解法,但那是別的元件,不涵蓋 Steps/AppShell。

3. **我方最近親 canonical(M23 優先)= 都做完整雙向**:
   - Steps 最近親 = **TreeView**(同樣有展開狀態):`expandedIds` + `onExpandedChange` + `defaultExpandedIds` 完整雙向(tree-view.tsx:243-249, 288-300)。
   - AppShell 側邊欄最近親 = **Sidebar**:`open` + `onOpenChange` + `defaultOpen` 完整三件套(sidebar.tsx:106,646-675)。
   - DS-wide census:Tabs / Rating / Input / 各 Radix wrapper 皆完整雙向。

**結論**:兩個 finding 都無既往拍板,且解法在兩條 SSOT-affecting 分支間二選一(加公開 API vs 補 canonical rationale 段)→ **不可降 AUTO**,送 user 拍板。

downgradedIds: (無)

---

## World-class ≥3 對照(WebFetch 全成功)

| DS | 展開/面板狀態的 controlled | uncontrolled | callback | 結論 |
|---|---|---|---|---|
| **Radix Accordion** | `value` | `defaultValue` | `onValueChange` | 單/多重展開都同時給雙向 |
| **MUI Accordion** | `expanded` | `defaultExpanded` | `onChange` | 雙向 |
| **Ant Design Collapse** | `activeKey` | `defaultActiveKey` | `onChange` | 雙向 |
| **React 官方 docs** | controlled(props 驅動) | uncontrolled(local state) | — | 兩模式是正式 first-class pattern |

三家世界級對「展開/面板狀態」一致做**完整雙向**(controlled + `default*` uncontrolled + callback)。
來源:radix-ui.com/primitives/docs/components/accordion、mui.com/material-ui/react-accordion、ant.design/components/collapse、react.dev/learn/sharing-state-between-components。

M23 一致性:外部三家一致「完整雙向」,且我方既有 canonical(TreeView/Sidebar)本就完整雙向 —— **無外部覆蓋我方 canonical 的衝突**,方向一致。

---

## 決策卡(中文人話)

### 【問題】
兩個元件的「開關/展開控制權」都只做了半套:
- **Steps**(多重展開模式):只能設「一開始展開哪幾步」(`defaultExpanded`),但**沒法讓外部程式隨時控制**哪些步驟展開/收合。
- **AppShell 側邊欄**:剛好相反 —— 外部可以隨時控制開/關(`asideOpen`),但**沒法設「一開始是開還是關」**(初值被寫死成關閉)。
兩者的 spec 都沒寫「為什麼刻意只做半套」。

### 【選項 A — 補齊成完整雙向控制】
- Steps 加 `expanded` + `onExpandedChange`(外部可隨時讀寫展開狀態)。
- AppShell 加 `defaultAsideOpen`(外部可設側邊欄初始開/關)。
- **好處**:對齊我們自己的 TreeView(展開)和 Sidebar(開關)的完整做法,也對齊 Radix / MUI / Ant 三家世界級;consumer 用起來一致、可預期。
- **代價**:多 2-3 個公開 prop 要長期維護;目前沒有已知業務需求逼著要它們(有「先開了再說」的味道)。屬 additive,不會弄壞既有用法。

### 【選項 B — 明文記錄「刻意只做單向」】
- Steps spec 補一句:展開狀態刻意只由內部管理,因為多重展開是純顯示便利、不需外部同步。
- AppShell spec 補一句:側邊欄初值刻意固定關閉,因為實務上一定由 app 狀態驅動(它已標「modal mode 必須 controlled」)。
- **好處**:公開 API 面最小、零額外維護;符合 Dim 26 的合法例外機制。
- **代價**:跟我們自己 TreeView/Sidebar 的完整做法不一致;未來真有人要控制得再開 API(但那是 additive,不破壞)。

### 【推薦】
**Steps 走 A(補控制)、AppShell 走 B(記 rationale)**。理由:
- **Steps → A**:Steps 整體 API 哲學就是「parent 掌控狀態」——進度值 `completedValues`/`errorValues` 全由 parent 管(spec:363 明寫 parent-controlled)。唯獨展開狀態不給 parent 控,語意自相矛盾;而且最近親 TreeView 就是完整雙向。補控制才一致。
- **AppShell → B**:側邊欄實務上幾乎一定由 app 的 route/狀態驅動(文件已標「modal mode 必須 controlled」),初值寫死關閉是合理預設,額外加 `defaultAsideOpen` 偏 YAGNI。記 rationale 更乾淨。
- 這兩個可以分開拍。你也可以「兩個都 A」求最大一致,或「兩個都 B」求最小 API 面 —— 我上面是按各元件自身哲學給的建議。

### 【SSOT 理由】
- 選 A = **新增公開 API prop**(`expanded`/`onExpandedChange`/`defaultAsideOpen`)= 新 API contract。
- 選 B = 在 spec.md **新增「刻意單向」canonical rationale 段** = 改/增 canonical 語意。
- 兩條路都動 SSOT(不是純內部 refactor),且「選 A 還是選 B」本身就是 user 該定的設計意圖 —— 若自動寫「刻意單向」rationale 等於替 user 預設了答案,故送你拍板。
