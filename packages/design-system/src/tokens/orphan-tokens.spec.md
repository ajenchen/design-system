---
spec: orphan-tokens
scope: token 保留 / 退場分類 SSOT(retire vs structural-keep;2026-11-15 收編原 ds-canonical/references/structural-token-retention.md)
audit_dim: design-system-audit Dim 48
script: scripts/audit-orphan-tokens.mjs
benchmark:
  - Material Design Tokens M3 — 完整 1-10 色階保留 https://m3.material.io/styles/color/the-color-system/key-colors-tones
  - Atlassian Design Tokens — palette tier 結構性保留 https://atlassian.design/foundations/color-new
  - Carbon Design System — token category metadata classifier https://carbondesignsystem.com/elements/color/tokens
  - Polaris Design Tokens — semantic SOP 5-piece set canonical https://polaris.shopify.com/design/colors
---

# Orphan Token 分類設計原則(retire vs structural-keep SSOT)

> **Foundational context**(2026-05-21 codify:user 要求把該退役的是否真的該退役、還是應該結構性保留全盤確認一次、做到好,之後不要再拿同一題回來問,尤其是 Palette tier —— 轉述;那段對話紀錄已不存在、登記簿查無原話):**永久解決**「audit 每次抓 X 個 orphan tokens」噪音。本 spec 明文哪些 token 結構性保留 + 自動 audit script 識別,user 不需重複確認同一題。

> **保留 / 退場分類只住這裡**(2026-11-15 收編):原 `packages/design-system/ds-canonical/references/structural-token-retention.md` 的 6 類併入本檔,那份檔只剩一行指標。給機器讀的只有分類表 `token-registry.json` 兩處 —— `retention`(每一類的鍵與按名字歸類的規則)與各列的 `retain`(單顆名字屬哪一類,例:`--brand`);本檔寫每一類的理由,不再寫識別規則(規則只住分類表,兩份必然漂移)。本檔每類標題裡的反引號字 = 分類表 `retention` 的鍵,兩邊由閘 `scripts/token-creation-invariant.mjs` C1 比對;`audit-orphan-tokens.mjs` 直接讀分類表,不內建第二份。
> **為什麼收編【AI 推導 2026-11-15】**:2026-11-15 `--brand` 被誤刪,其中一環就是保留規則住兩處 —— 本檔沒列 `--brand`,只有那份參考檔第 2 類寫「預留給 consumer-layer(`src/app` / product UI)消費的品牌色 token」;稽核只對本檔,於是把它當成沒人保護的孤兒(經過見下方 §9)。

## Scope(何時用 / 何時不用)

- **用**:DS 作者稽核 token bloat(retire vs structural-keep 判定)— `audit-orphan-tokens.mjs` + design-system-audit Dim 48 消費本分類,屬 DS-internal audit SSOT;各維度子代理的稽核發現也拿本檔做三重核對的第 (c) 層(`design-system-audit/SKILL.md` 子代理派工範本):屬下列任一類 → 撤回該發現,不列為違規
- **不用**:consumer 選 token 的使用指南 — 那是 `tokens/README.md` + 各 token spec 的職責

## 為什麼會出現「假孤兒」

簡單的 `grep var(--X)` 抓不到以下消費路徑,造成 token **實際有用但 audit 報「無消費」false positive**:

| 消費機制 | 範例 | grep 漏抓原因 |
|---|---|---|
| **Tailwind `@theme inline` bridge** | `--spacing-field-md` → `h-field-md` class | Tailwind 在 build time 從 bridge 讀值轉 utility class,無 `var()` 語法 |
| **`@utility` definition** | `@utility tracking-shortcut { letter-spacing: var(--tracking-shortcut) }` | 是定義,不是消費點 |
| **Class-name match** | `text-primary-text` 對應 `--primary-text` | 走 Tailwind 命名約定 |
| **JS literal mirror**(2026-11-15 起沒有這種 token:原例 `--motion-delay-*` 已退場,見 §8) | 程式常數有一份、CSS 另有一份同值鏡像 | JS 端 hardcode 數字 + import constant,不讀 CSS var |
| **產品端讀取** | 產品 repo 的 `bg-brand`、`var(--radius-sm)` | 設計系統 repo 裡根本看不到;WM 也只是其中一個產品 |
| **token 檔裡一般 CSS 屬性讀 `var()`**(2026-11-20 補,偵測器 2.1b) | `layoutSpace.css` 的 `[data-layout-body] { padding-top: var(--layout-body-start) }`(容器自己算底距,值只在這條規則裡被讀) | 不是 grep 漏抓,是偵測器自己的略過規則太寬:token 檔裡 `--a: var(--b)` 只是把名字接到另一個名字,不算有人用 `--b`,所以 `var()` 掃描整個略過 token 檔 —— 連同一個檔裡真的拿來畫東西的一般屬性也一起略過,`--layout-body-start` / `-end` 因此被判成孤兒(夜間 orphan-tokens 紅) |

**修法**:`scripts/audit-orphan-tokens.mjs` 用 comprehensive consumer detection 涵蓋 5 條消費路徑,真實 orphan count drops from 175 → 0(2026-05-21 baseline)。5 條 = `var()` 直接讀、`@theme inline`、`@utility`、class-name、JS literal;其中 `var()` 直接讀分兩半:token 檔以外的 `.tsx` / `.ts` / `.css` 全收,token 檔裡只收一般 CSS 屬性(屬性名不是 `--` 開頭)值裡的 `var()`,自訂屬性宣告 `--a: var(--b)` 不算(上表最後一列;偵測器 2.1 / 2.1b,meta-test `scripts/test-audit-orphan-tokens.mjs` 2a 兩面都驗)。表裡的「產品端」掃不到,所以產品可讀的名字另有退場規則(下方「退場流程」)。

---

## 結構性保留分類(永久保留,**不視為 retire 候選**)

每類標題裡的反引號字是分類表 `retention` 的鍵。有歸類規則的,腳本按名字歸類;沒有的(目前只有 `reservation`),由分類表那一列的 `retain` 指名。分類依據是 token 的用途與對外合約,不是「目前設計系統裡有沒有人用」。

### 1. `palette` — Palette tier 完整 1-10 色階(77 token,structural)

**Rule**:`--color-{hue}-N`(N ∈ 1..10)即使當前無消費者也**完整保留**。

**Why**:palette 是設計師調色盤 SSOT,缺中間階就斷層,新元件需消費中間色時不該 hot-add。**全色階是 capability,不是 cost**。即使目前只消費 step-{1,2,6,7} 給 Tag / Avatar,中間步階保留供未來 hue scale 擴充與 hue calibration 對照;`--color-red-{1..10}` 因 semantic 把錯誤色映射到 deep-orange 而不直接消費,一樣保留。Retire = 破壞 palette 完整契約,新加 hue 時要重訂全套。

### 2. `specialty-palette` — Magenta / Turquoise 專用 palette(14 token,structural)

**Why**:Tag / Avatar variant 預留色 —— specialty hue 保留完整色階(不只「目前用到的階」),新 variant 才有現成的階可用。

### 3. `mask-alpha` — Mask alpha(17 token,structural)

**Rule**:`--black-aN`(a02-a85,9 階)/ `--white-aN`(a04-a85,8 階)完整保留。

**Why**:Overlay / scrim / shadow / disabled state alpha composition 預留 —— 半透明疊色需要一條完整的 alpha 階梯,才不用為每個疊層臨時造值。

### 4. `chart` — Chart reserved(0-5 token,structural)

**Rule**:`--color-chart-N`(N ∈ 1..5)為 DataViz 預留,即使 DS 內無 chart 元件也保留。

**Why**:Consumer(產品端)會用 ECharts / D3 等 lib 直接消費這些 token 做 chart palette,DS 提供 5-color qualitative palette canonical(對齊 ColorBrewer)。

### 5. `state-variants` — State variants 完整集(8 token,structural)

**Rule**:`--{hue}-(hover|active|focus|subtle|emphasis|disabled|text)` 即使當前無消費者也保留完整 8-tier emphasis set。

**Why**:hover / active / focus 是互動強調階梯的一部分,缺一階就斷 emphasis ladder。**8-tier 是 capability invariant**。

### 6. `neutral-palette` — Neutral palette 完整 + opaque tier(13 token,structural)

**Why**:Neutral 1-9 是 grayscale spectrum SSOT;`-opaque` 變體是 opacity composition 預留(non-translucent fallback for dark mode / contrast modes)。

### 7. `sop-semantic` — SOP 5-piece semantic 完整集(1+ token,structural)

**Rule**:每個 semantic role(primary / error / success / warning / info)必有 5 件套:`base / hover / active / subtle / text`;機械保護集另含 `emphasis / foreground / focus`(共 7 後綴;無後綴 base 由消費者直接引用,不在歸類規則內)。即使當前 variant 無消費者也保留(例:`--info-active` / `--success-active` / `--warning-active` / `--primary-text`)。

**Why**:Consistency invariant — 缺 `-text` variant 設計時找不到「on-emphasis 文字色」會 hot-create,違反 SSOT;每個狀態色都要成套(底 / 文字 / 邊框),保留供未來互動 state 擴充。

### ~~8. JS literal mirror~~(2026-11-15 撤掉)

原本把 `--motion-delay-{plain|rich|close}` 三顆 CSS 鏡像列為結構性保留,理由是「CSS 端給設計師看 + 未來可能有程式讀」。這跟上游 `token-system.spec.md` 第 0 題「禁止『之後可能有人用』就先開」直接矛盾,而三顆執行期沒有任何 CSS 讀者(Radix 的延遲參數只吃數字)、產品又不讀(分類表 `--motion-` 列 `product: no`)—— 2026-11-15 三顆退場,值只住 `motion/motion.ts` 的 `MOTION_DELAY_*_MS`(稽核 P09 與反查更正;`audit-orphan-tokens.mjs` 同日拿掉這一類)。【AI 推導 2026-11-15:以上游原則為準撤掉本節,user 沒有逐字決定過】

### 9. `reservation` — 產品層預留(原 structural-token-retention.md 第 2 類)

**Rule**:分類表登記產品可讀、設計系統自己不讀、明文預留給產品層消費的名字,保留。成員由分類表該列 `retain: "reservation"` 指名;它的 Tailwind 轉接名跟著本尊。現有:`--brand`(品牌識別色,固定 #DF3232、兩主題相同)與轉接名 `--color-brand`(`bg-brand`)。

**Why**(原文):「預留給 consumer-layer(`src/app` / product UI)消費的品牌色 token。DS 本身不消費,跟 `--primary`(DS UI accent)分層。Retire = 未來產品做品牌頁時要重補 token + spec」。品牌色與互動色的用詞分界住 `color/color.spec.md`「用詞」。

**跟 `token-system.spec.md` 第 0 題的關係【AI 推導 2026-11-15】**:第 0 題「禁止『之後可能有人用』就先開」管的是**開新名字**;本類是**已經對外公開**的名字,退場走下方「退場流程」,不以「設計系統、WM 看不到讀者」為由刪。要新增本類成員 = 開新的對外名字,照第 0 題與命名三重檢驗,由 user 決定。

**2026-11-15 誤刪事故**:AI 把 `--brand` / `--color-brand` 刪了,user 沒有說過要刪,同日還原。三個環節:① 把「設計系統與 WM 裡看不到讀者」當成「沒有意義」—— 它在分類表是產品可讀的公開名字;② 保留規則住兩處,本檔沒列它,只有參考檔第 2 類有(現已收編進本節);③ 稽核把這題標「要 owner 決定」(稽核 P12),AI 把它移進 2026-11-11 決策頁「照既有原則直接做（不用你決定）」清單(那一句是 AI 寫的「沒人用的 `--brand` 刪除。」),又把「user 看過那一頁」當成同意。user 原話:「此外，「唯一會刪的是沒人用的品牌色 --brand，這句你在決策頁上看過。」為何這個要刪？你確定有合理的理由刪？我有說過要刪？沒人用只是因為現在你的視角看不到消費者，但這個 token 真的是沒有意義的存在？我沒有要質疑你，我只是要確保你有查證我上述的問題才做決定」。防線:本類由分類表 `retain` 機器指名(閘 C9 丙不再把它當沒人讀);產品可讀的名字悄悄消失由閘 C10 擋;「user 看過 ≠ 同意」記在 `ds-canonical/rules/meta-patterns.md` M36(a)。

### 10. `tailwind-bridge` — Tailwind 轉接名(原 structural-token-retention.md 第 3 類)

`--color-status-{online,busy,away,offline}` / `--color-inverse-neutral-{hover,active}`:`@theme inline` 轉接名讓 `bg-status-online` 這類 class 可用,即使現有程式走 `var(--status-online)` 直接讀(NameCard / Avatar / Tag 實際讀的是本尊,不是轉接名)。轉接名是給產品用 class 寫法的對外入口,retire = 限縮使用方式(哪些值開轉接名的規則住 `token-system.spec.md`「擺放」)。2026-06-04:原 `--color-warning-foreground` 已移除 —— 改名 `--on-emphasis-dark`,白 / 深的填色底文字配對見 `color/color.spec.md`。

### 11. `type-scale` — 字級完整(原 structural-token-retention.md 第 5 類)

`--font-h1-size` / `--font-h4-size` 等:字級整組完整,即使現有畫面只用 h2 / h3 / h5,h1 / h4 / h6 預留給行銷頁、首屏、抽屜標題等場景。

### 12. `elevation-dark-pair` — 陰影深色配對(原 structural-token-retention.md 第 6 類)

`--elevation-100-hover` / `--elevation-200-hover`:`color/primitives.css` 亮 / 暗兩段各自定義(`primitives.css:237,238,419,421`)→ 結構上成對,retire 會破深色主題的視覺合約。

---

## 退場流程

先看分類表那一列的 `product`:

**(一)產品可讀(`product` 是 `read`)的名字,與它的 Tailwind 轉接名**:
1. **要不要退場由 user 決定**(改的是對外的 token 組,屬產品 / UI SSOT)。「設計系統與已知產品(本 repo `apps/`、WM)都沒有讀者」可以列為提案理由之一,但 AI 不得只憑它自己刪 —— 還要說得出這個名字為什麼沒有意義(用途寫不出、與別的名字同值重複……)。
2. 分類表 `retired` 登記一筆:`name`、`quote`(user 原話,逐字)、`quoteDate`;改名另寫 `renamedTo`(新名字)。這是**授權紀錄**,不是相容:**0.x / 預發布版同一版直接刪**,不留舊名、不標 deprecated(相容政策 `../../ds-canonical/references/props-naming.md`「相容政策」,版本判斷 `scripts/lib/compat-policy.mjs`);1.0 以後的正式版才多寫 `deprecatedIn`(標 deprecated、名字仍在的那一版)與 `removedIn`(真正刪掉的那一版,不得等於 `deprecatedIn`),先保留一版。刪掉的名字(與它的 Tailwind 轉接名、改名的新名字)同一版寫進變更帳本(`../../ds-changes.json`,surface `token`;GitHub Release「破壞性變更」由它產生)。
3. 閘 `scripts/token-creation-invariant.mjs` C10:對照基準(與 main 的分岔點、HEAD),產品可讀的名字在工作樹不再宣告、又不在 `retired` → 紅;`retired` 缺 user 原話 / 日期 → 紅;1.0 以後的正式版缺兩個版本或兩版相同 → 紅。

**(二)產品不讀(`product: no`)的名字**:`audit-orphan-tokens.mjs` 跑完跨 5 消費機制 verify 仍 0 consumer + 不落任何保留類別 → 才算真 retire 候選。走 retire flow:
1. **Grep DS-wide** `*.spec.md` 看是否文件 cite 該 token 名(可能是「設計師未來會用」承諾)
2. **Git blame** declare 提交 — 提交訊息 / PR 描述是否說明用途
3. 兩 step 都無 → safe retire,從 `tokens/**/*.css` 刪宣告 + 加 git commit message cite 本 spec

(二)只有以下全部成立才 retire(原參考檔「Retire criteria 真實 strict」):真實 0 consumer + 不是產品可讀 + 不落任何保留類別(產品層預留 / 深色配對 / 色階完整……)。產品可讀的名字不走(二),走(一)。

## 邊界案例

- **Audit 間 token 重獲消費者(0 → N)**:audit 為每次執行的即時 snapshot(無跨次狀態),token 重獲消費後自動退出 retire 候選;0.x 沒有 deprecation period(相容政策);1.0 以後產品可讀的名字先保留一版(見「退場流程」(一))
- **新 structural-keep token**:不在 baseline → `--check` fail,需 `--update` 顯式 justify(防 regex 過寬 silent absorb;baseline 縮減不 fail)— baseline SSOT `scripts/audit-orphan-tokens.baseline.json`
- **Dark-mode token mirror 驗證**:非本 audit scope — script 只驗「消費存在性」,不驗 light / dark 配對完整性

## Audit chain

- **Dim 48**(= `design-system-audit/SKILL.md` 的「Unused / orphan token detector」audit 維度)— chain 本 spec + `audit-orphan-tokens.mjs --check`(not raw `grep var()`);保留分類由腳本讀分類表 `retention` 與各列 `retain`
- **三方一致**:本檔每類標題的鍵 ↔ 分類表 `retention` ↔ 各列 `retain` 指到的鍵,由 `scripts/token-creation-invariant.mjs` C1 比對(PR CI 必跑)
- **CI**:required CI —— `ci.yml` governance-control-plane job 的「Slow static gates that used to run only nightly」直呼 `node scripts/audit-orphan-tokens.mjs --check`(fail = real orphan 出現,或新名字落進保留類別卻不在 baseline),接著跑配對測試 `scripts/test-audit-orphan-tokens.mjs`:注入一顆假 orphan、注入只被自訂屬性讀的名字、拿掉分類表的一類,證明三種都會紅(2026-11-20 接上)。接上之前它只在夜間 `governance-harnesses.yml` 經配對測試帶跑(舊句寫的 `scripts/release-preflight.mjs` 已於 #40 退役、`release.yml` 也不再直呼;2026-09-27 對帳改寫)
- **Hook**:無 hook(本 audit run-time / monthly cadence,非 PreToolUse 攔截場景)

## Audit Dim 48 false-positive 經驗(2026-05-17,user 抓教訓;原 structural-token-retention.md)

Sub-agent 用 narrow grep(只看 utility class hit,沒看 `var()` direct + template literal + dark mode override + forward-looking)抓 58 個 retire candidate;Layer A own re-verify 後 100% 為 false positive(全是結構性保留)。

User verbatim 2026-05-17:「每次抓出的問題你他媽要給我基於我們所有的檔案包括設計原則去再三確認到底是不是問題,避免明明就不是問題卻一直要我決策浪費我的時間」。

**任一層顯示「有 consumer / 屬結構保留」→ 從 retire report 中拿掉**(不要送 user 拍板浪費時間)。

## 永久解決承諾

本 spec land 後**永遠不會**再回頭問 user 同樣問題(palette tier / 完整色階 / mask alpha 是否該 retire;JS literal mirror 一類 2026-11-15 依上游第 0 題撤掉,見 §8)。Audit script 自動識別,只報真實「跨 5 消費路徑都 0」的 token(2026-05-21 baseline = 0 真孤兒)。

新加 hue / state / SOP semantic → 同步分類表 `retention` 該類的歸類規則 + 本檔該類理由(per M17 SSOT;閘 C1 比對兩邊的鍵)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `color.spec.md`
- `motion.spec.md`
