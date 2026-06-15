<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Color 設計原則

> **Foundational SSOT rationale**(2026-04-24 approved,cap 1000 — 2026-05-22 raised 800→1000 per /knowledge-prune deep audit + CLAUDE.md「foundational SSOT 例外 ≤ 800-1200」range):
> Token 系統 SSOT,涵蓋 primitive / semantic 兩層色彩架構、disabled 兩策略、Hover/Active 公式推導、新增語意色相 4-step 流程、neutral interaction 雙 family、nested theme。跨 30+ 元件消費,改一 token 影響全 DS。218 行語義色定義是純 token structural canonical 無法 reference out;不可拆不失原則。

## 架構流派定位

業界四大世界級色彩 token 流派各有取捨。我們選擇 **Atlassian 流派**（semantic state token），並有意識地拒絕其他三個。理解這個選擇對日後維護至關重要。

| 流派 | 代表系統 | 互動狀態怎麼處理 | 為何不選 |
|------|---------|---------------|---------|
| **Numbered Role Scale** | Radix Colors | 12 step scale，每個 step 號碼本身就是 role（step-9=solid bg、step-10=solid hover），light/dark scale 各自獨立定義值 | 工程量極大——需要重新設計每個色相 × 12 step × 2 mode = 192 個值，且全部 consumer 改 step 號 |
| **Semantic State Token**（**我們**） | Atlassian DS、GitHub Primer | 互動狀態用 semantic token (`--{hue}-hover` / `--{hue}-active`)，每個 mode 預先計算值 | ✓ 選這個 |
| **State Layer Overlay** | Material Design 3 | 互動狀態用透明 overlay（state layer），不改變底色 | 跟 Button 用 solid shade change 的視覺語言不一致——同設計系統內互動回饋會分裂成兩種風格 |
| **Consumer-side Mode Handling** | Tailwind CSS | 由 consumer 自己處理 dark mode 變體 (`hover:bg-blue-600 dark:hover:bg-blue-400`) | Token 系統的價值就是封裝 mode 知識，把它推給 consumer 等於放棄抽象化 |

### 為什麼選 Atlassian 流派

1. **跟 Button 視覺語言一致**——Button 用 solid shade change（從 step-6 到 step-5/-7），其他飽和色 bg 互動也應該用 solid shade，而不是 overlay
2. **務實的工程量**——不需要重構整套 primitives
3. **封裝 mode 知識**——把 dark mode 翻轉的 swap 邏輯關進 semantic 層，consumer 不需知道
4. **跟 `--primary-hover/active` 同模式**——`--blue-hover/active` 是同一個概念延伸到所有作為 bg 的色相

### Tag 為什麼是「primitive 靜態 + semantic 互動」混合存取

這**不是 code smell，是有意的職責分離**：

| 概念 | 是否需要 mode 知識 | 該住哪一層 |
|------|------------------|----------|
| **靜態色值**（subtle bg、text、solid bg） | ❌ Primitives 公式翻轉已自動處理 | **Primitive**——直接 `--color-blue-1`、`--color-blue-7`、`--color-blue-6` |
| **互動狀態**（hover、active） | ✅ 需要保證「hover 永遠較亮、active 永遠較暗」 | **Semantic**——`--blue-hover`、`--blue-active` 內含 dark mode swap |

兩個概念**本來就不該綁在同一層**。Tailwind 也這樣分離：`bg-blue-500`（靜態，scale step）vs `hover:bg-blue-600 dark:hover:bg-blue-400`（互動，需要 consumer 處理 mode）。差別只在於 Atlassian 流派把 mode swap 封裝進 token 裡，consumer 不需要寫 dark variant。

---

## 系統架構

色彩分兩層定義：

| 層 | 檔案 | 用途 | 範例 |
|---|---|---|---|
| **Primitive** | `primitives.css` | 原始色票，Tag / Avatar 直接消費 | `--color-blue-6`、`--color-blue-1` |
| **Semantic** | `semantic.css` | 語義 token，用於表達意圖（操作、狀態） | `--primary`、`--error`、`--info` |

```
Primitive              Semantic
──────────             ──────────
--color-blue-6      →  --primary（互動入口）
                    →  --info（資訊狀態）
--color-deep-orange-6 → --error（錯誤狀態）
--color-green-6     →  --success（成功狀態）
--color-yellow-6    →  --warning（警告狀態）
```

Semantic token 直接指向 primitive（無中間層）。

**消費規則**：

| 場景 | 使用層級 | 原因 |
|---|---|---|
| Tag、Avatar 的色彩 variant | **Primitive**（`--color-blue-1`、`--color-blue-6`、`--color-blue-7`） | 色名是顏色本身，不代表語義 |
| Tag、Avatar 的文字色（subtle 模式） | **Primitive step-7**（`--color-blue-7`、`--color-red-7`） | 小面積色塊文字需要更高對比，primitives 的相對色階公式在 dark mode 自動把 step-7 解析為高對比方向 |
| Button、Checkbox、Switch、Focus ring | **Semantic**（`--primary`） | 代表「使用者可以執行的操作」 |
| Badge 層級（high/medium） | **Semantic**（`--info`、`--info-subtle`、`--info-text`） | 代表「資訊狀態」，不是操作 |
| 錯誤訊息、驗證錯誤 | **Semantic**（`--error`） | 代表「系統出了問題」 |

**注意（categorical `red` vs semantic `--error` vs primitive `deep-orange` 三者獨立）**：
- `--error` = `--color-deep-orange-6`（primitive `deep-orange`，hue 38）—— semantic 狀態色,用於錯誤訊息。
- Tag / Avatar / Calendar 的 categorical `red` variant = `--color-red-*`（品牌紅家族 hue 25,與 `--brand` `#DF3232` 同族）。
- **三者無映射關係**：categorical `red`（hue 25）≠ `deep-orange`（primitive hue 38）≠ `--error`（semantic = deep-orange）。categorical 色相 1:1 對 `--color-{hue}-*`,零 offset（SSOT `tokens/categorical-color.ts`)。2026-06-04 修正原「red variant 接 deep-orange」offset。

Tailwind utility 透過 `@theme inline` 橋接 semantic token，元件寫 `bg-primary` 或 `bg-error` 即可。Tag / Avatar 使用 CSS 變數任意值（`bg-[var(--color-blue-6)]`）。

## Surface 分層（非常重要）

| Token / Utility     | 用途 | 說明 |
|---------------------|------|------|
| `bg-canvas`         | 頁面最底層背景 | HTML body 背景色 |
| `bg-surface`        | 非遮蓋型容器 | card、sidebar、table，dark mode 半透明 |
| `bg-surface-raised` | 遮蓋型浮層 | modal、popover、dropdown，必須不透明 |

`bg-surface-raised` 必須不透明，避免底層內容透出。

## 文字 / Icon 層級

| Utility            | 用途 |
|--------------------|------|
| `text-foreground`  | 主要文字（一般資訊）|
| `text-fg-secondary`| 次要資訊、helper text |
| `text-fg-muted`    | placeholder、caption、弱化 icon(**non-disabled only**)|
| `text-fg-disabled` | disabled 文字 + **disabled 元件內所有文字 / placeholder / icon**(state 勝 emphasis,M24)|

文字色一律使用 neutral alpha token，疊加在任何背景都能維持對比。
弱化 icon hover 後變 `text-fg-secondary`。

## Disabled 狀態

disabled 元件內的所有子元素必須呈現 disabled 狀態:

| 元素類型 | Disabled 處理 |
|---|---|
| 文字 / placeholder / Icon stroke | `text-fg-disabled`(state 勝 emphasis,M24)|
| 圖片 / Avatar | `opacity-disabled`——圖片無法套用語義色,用透明度弱化 |
| Checkbox / Radio | 元件自身的 disabled 樣式 |
| 背景色 | `bg-disabled`(如適用) |

**判斷標準**:disabled 元件內不應有任何元素呈現可互動 affordance。

**State precedence(M24,2026-05-04 升 SSOT)**:disabled 是 state,muted 是 emphasis decoration。disabled element 內 placeholder 用 muted = state 弱於 decoration → 違反語意層級。實作:`field-wrapper.tsx bareInputStyles` 加 `group-data-[field-mode=disabled]/field:placeholder:text-fg-disabled`,Select 等 ReadonlyDisplay 看 `resolvedMode === 'disabled'` 決定。詳 M24 + `.claude/memory/feedback_disabled_state_overlay_scroll_chain.md`。

### 兩種 disabled 策略:何時用哪個

系統有**兩種** disabled 視覺處理方式,判準是「**顏色是否是 semantic state 的唯一視覺載體**」:

| 策略 | 何時用 | 消費者 | 做法 |
|---|---|---|---|
| **灰階 token swap** | State 由形狀 / 位置 / icon / 文字 等**非顏色載體**承載,顏色只是美學 | Button、Checkbox、Input、Slider、Tag | 每個元素換到 disabled 對應的灰階 token(`bg-disabled` / `text-fg-disabled` / `bg-border` 等) |
| **`opacity-disabled`** | State **完全只靠顏色區分**(形狀在 on/off 之間沒有差異),灰階化會丟失 state 辨識 | **Switch** | Root 層套 `opacity-disabled`,保留原有顏色身分,透過透明度均勻降級 |

**具體判準(寫新元件時問自己)**:
1. 在 disabled 狀態下,使用者需要辨識的 state 資訊是什麼?
2. 這些資訊**沒有顏色**仍然能看出來嗎?
3. 能 → 灰階 swap;不能 → opacity

**範例**:
- Checkbox 的 checked:checkmark **形狀**是 state 載體 → 灰階 swap OK
- Slider 的 value:thumb **位置** + range **長度**是 state 載體 → 灰階 swap OK
- Radio 的 selected:內圓點 **形狀**是 state 載體 → 灰階 swap OK
- Switch 的 on/off:track 在 on/off 之間**形狀相同**,只有**顏色**差別 → 必須 opacity

### Disabled 視覺階層公式(多元素元件參考)

多元素互動元件(Slider、Progress、複合 Input 等)在 disabled 狀態常需要 2–3 階灰階深度來分層:

```
底層背景 (n-2)  <  中層填充 / 輪廓 (n-5)        <  文字 (n-6)
bg-muted          bg-border / border-border       text-fg-disabled
```

每階至少差 1 個 primitive step,使用者掃視時才能分清層次。Slider 的 disabled 就是這個公式:track(底,n-2)< range 填充 = thumb 邊框(n-5,**同色**——「Range 色 = Thumb border 色」invariant,thumb 邊框是 range 的視覺延續,不論 state 永遠同色,詳 slider.tsx 註解)< label 文字(n-6)。

> 2026-06-12 修:本段原寫 4 階公式、輪廓層用 `border-fg-disabled`(n-6)、文字層標 n-7+——三者皆與 code 不符(`border-fg-disabled` 全 code 零使用且違反下方規則 3「border-* 一律從 border family 選」;`--fg-disabled` 實為 n-6;slider.tsx 的 range/thumb 邊框同色是刻意設計,曾踩 thumb 融入 track 的同色融色 bug)。對齊 code 真實。

### ⚠️ fg token 不可當 bg 用(跨 family 借用是 smell)

Semantic token 按**載體類型**分成四個 family,**family 之間的 token 不能互借**:

| Family | 前綴 | 語意 | 範例 |
|---|---|---|---|
| **Foreground**(前景) | `--fg-*` / `--foreground` | 文字 / icon stroke 的前景色 | `--foreground`, `--fg-secondary`, `--fg-muted`, `--fg-disabled` |
| **Background**(背景) | `--bg-*` / `--surface` / `--muted` / 色相 subtle | 填充色 | `--surface`, `--muted`, `--bg-disabled`, `--primary-subtle` |
| **Border**(邊框 / 分隔)| `--border`, `--border-hover`, `--divider` | 視覺分隔線、容器邊框 | `--border`, `--border-hover` |
| **Ring**(聚焦環)| `--ring` | `focus-visible` 的聚焦環 | `--ring` |

**跨 family 借用是 smell**,即使「剛好是我想要的顏色」。曾經踩過的例子:

> **Case**:Slider disabled 的 Range(填充段)一開始寫成 `bg-fg-disabled`。理由:`--fg-disabled`(neutral-6)剛好是我想要的「比 track 深但比文字淺」的灰度。但 `--fg-disabled` 語意是「**disabled 文字的前景色**」,拿來當 bg 等於借 fg token 當 bg 用。
>
> **問題**:
> 1. **語意矛盾**:consumer 讀 code 時 `bg-fg-disabled` 會困惑「這到底是 bg 還是 fg」
> 2. **耦合未來變動**:未來若微調 `--fg-disabled`(例如從 n-6 改成 n-7 讓 disabled 文字更可讀),Slider range 會被迫一起變,但它不是文字、不需要文字可讀性的約束
> 3. **缺乏單一來源的 bg token**:應該存在一個「disabled 狀態的中層填充色」的 bg token(如果沒有,要新增一個 semantic alias,而不是借 fg)
>
> **修正**:改用 `bg-border`(neutral-5)。`--border` 屬於 Border family,語意是「視覺分隔線 / 容器邊框 / 階層分隔的視覺元件」——跟 range 的「填充視覺指示器」角色接近,且 family 對得上(非文字的視覺填充類)。

**規則**:

1. **新元件寫新樣式前,先確認 class 的 family 語意跟實際用途對齊**——`bg-*` 一律從 bg/surface family 選,`text-*` 一律從 fg family 選,`border-*` 一律從 border family 選
2. **沒有合適 token 時,新增 semantic alias,不要借** family——例如若 bg family 沒有「中層填充」token,在 semantic.css 開 `--fill-muted` 或類似名稱,不要借 `--fg-disabled`
3. **Code review 檢查**:看到 `bg-fg-*` / `bg-foreground` / `text-surface` / `border-fg-*` 這類命名組合,立刻質疑是否 family 借用

**唯一合法例外**:`--foreground` 偶爾用在 `bg-foreground`(暗色填充)表達「inverse surface」(例如 Tooltip 深底)——但這是 inverse namespace 的設計意圖,有專門的 `--inverse-*` token family 處理,不是隨便借。一般元件不該 `bg-foreground`。

## Icon 色彩原則

Icon 色彩 canonical 的 SSOT 住 `patterns/element-anatomy/item-anatomy.spec.md`「Icon 色彩原則」——核心規則:icon 代表內容/類別 → 與 label 同色;icon 純指示方向 → `fg-muted`;disabled 統一 `fg-disabled`。本檔不重述(Rule-of-3 pointer)。

## 語義色

### Action — Primary

`--primary` 只用於互動入口，代表「使用者可以執行的操作」。

| 用途 | 範例 |
|------|------|
| 主要按鈕 | `bg-primary` |
| 文字連結 | `text-primary` |
| Focus ring | `ring-ring` |

```tsx
<Button variant="primary">確認</Button>
<a className="text-primary hover:text-primary-hover">查看詳情</a>
```

### Status

狀態色表達系統回饋，代表「系統在告訴你什麼」，不用於互動操作。

| Token | 色相 | 用途 |
|-------|------|------|
| `--info` | blue | 資訊提示、進行中（in-progress）、active 指示、step indicator |
| `--error` | deep-orange | 錯誤 / 危險 |
| `--success` | green | 成功 |
| `--warning` | yellow | 警告 |

雖然 `--info` 與 `--primary` 目前同色（blue），**語義截然不同，不可混用**：

> 只要是「呈現狀態」就用 `--info`，只要是「互動入口」就用 `--primary`。
> 尤其在同一個 UI 脈絡中可能出現多種 status 色時（如任務列表、step indicator），一律使用 status 色系，絕不混入 `--primary`，否則使用者無法建立一致的色彩解讀框架。

```tsx
// ✅ 正確
<Progress className="bg-info" value={60} />
<Tag className="bg-info-subtle text-info-text">進行中</Tag>
<p className="text-error">此操作無法復原</p>

// ❌ 錯誤——progress bar 不是互動操作
<Progress className="bg-primary" value={60} />
```

**機械強制**:此規則對 status 元件(ProgressBar / CircularProgress / Steps / Calendar today)由 `scripts/status-color-invariant.mjs` 鎖住(release-preflight chain),回潮 `--primary` 即 fail。2026-06-05 user 拍板把這 4 個元件的 progress/step/in-progress 填色從 `--primary` 全遷 `--info`(同色 blue-6 零視覺差,語義正確 + brand-swap 安全)。

每個語義色的 bridge 同時產出 `bg-xxx`、`text-xxx`、`border-xxx` 三組 utility，視場景選用。

- warning 的文字色取決於底色：

  | 底色 | 文字色 | 原因 |
  |------|--------|------|
  | `bg-warning`（yellow-6，滿版） | `text-on-emphasis-dark`（`black-a85`，深色） | 黃色亮度高，白字對比不足，必須用深色（通用亮底深字 token，非 warning 專屬；定義見下「`--on-emphasis` / `--on-emphasis-dark` 配對」段） |
  | `bg-warning-subtle`（淡黃） | `text-[yellow-7]`（step-7） | subtle 底色夠淺，深一階的黃色文字可辨識（見「文字色 Step 原則」） |

### Indicator — Notification

| Token | Utility | 色相 | 用途 |
|-------|---------|------|------|
| `--notification` | `bg-notification` | deep-orange | 未讀計數 badge、通知紅點 |

`--notification` 目前與 `--error` 使用同色（deep-orange-6），但語義獨立——`--error` 表示「系統出了問題」，`--notification` 表示「有待處理的項目」。兩者保持分離的 token，未來可單獨調整顏色。

```tsx
<span className="bg-notification text-white">3</span>   // badge 計數
```

### Identity — 品牌

| Token | 用途 |
|-------|------|
| `--brand` | 品牌色，固定色 #DF3232，兩主題相同 |

### Primitive 色票與 Tag / Avatar 的消費

Tag、Avatar 等需要多色區分的場景（專案標籤、團隊分類等）直接消費 primitive token。消費端自行決定色彩用途。

每個色相的 primitive 包含完整的 step 序列，Tag / Avatar 主要消費以下 step：

| Step | 用途 | 範例 |
|------|------|------|
| step-1 | subtle 背景（淡色填充） | `--color-blue-1` |
| step-5 | dismiss hover（solid 模式） | `--color-blue-5` |
| step-6 | solid 背景（全色填充） | `--color-blue-6` |
| step-7 | subtle 文字、dismiss active（solid 模式） | `--color-blue-7` |

可用 categorical 色相（12 個，SSOT `tokens/categorical-color.ts` `CATEGORICAL_HUES`）：blue、green、deep-orange、yellow、red、orange、amber、lime、turquoise、indigo、purple、magenta。Tag / Avatar / Calendar event 三者共用此組,每個色相 variant 名 1:1 對 `--color-{hue}-*`（零 offset）。

**注意**：categorical `red` = `--color-red-*`（品牌紅 hue 25),與 primitive `deep-orange`（hue 38）及 semantic `--error`（= deep-orange）**完全無關**（見本檔頂部「消費規則」段注意事項）。

**與 semantic 色的差別**：semantic 色（primary/info/error/success/warning）有固定語義，primitive 色沒有。Tag / Avatar 使用 primitive 是因為「blue」代表顏色本身，不代表「主要操作」或「資訊狀態」。

### `--on-emphasis` / `--on-emphasis-dark` 配對:飽和 / 填色底的對比文字

填色底上的文字色**依底色明暗成對**提供(世界級共識:Material `on-primary` family、Radix `--accent-contrast`、Polaris `text-{x}-on-bg-fill` —— 都是「成對 on-color token」,不是單一固定白):

- `--on-emphasis = oklch(1 0 0)`(純白,dark mode 不反轉)—— 用於**夠深的飽和色底**(白字達 WCAG 門檻):primitive 6 階深色 / `--primary` / `--error` 等,及 categorical blue/deep-orange/red/turquoise/indigo/purple/magenta。
- `--on-emphasis-dark = var(--black-a85)`(深字,dark mode 不反轉)—— 用於**太亮的色底**(白字對比不足):categorical **yellow / amber / orange / lime**。

**合規門檻(2026-06-04 user 拍板「以最低為原則」)= WCAG large/bold 3:1**(solid chip / avatar 的字視為大粗字)。底色 step-6 白字達 3:1 → 用 `--on-emphasis`;不達 → 用 `--on-emphasis-dark`。

**★ green documented exception**:green-6 白字實測對比 2.47(連 3:1 都不過),但 user 拍板維持白字(沿用世界級慣見的「綠底白字」按鈕觀感)→ 列為知情違反,待日後評估是否調整 green-6 本身。

**`--warning-foreground` 2026-06-04 移除(改名 + 不留 alias,user「以乾淨為主」)**:原 `--warning-foreground`(= black-a85)被 categorical yellow/amber 借用 = 誤名(它跟 warning 無關,本質是「亮底深字」通用概念)→ 統一改名 `--on-emphasis-dark`,**不保留 warning 專屬 token**(grep 確認無任何元件消費 `text-warning-foreground`)。warning solid surface 若需黃底深字,一律消費通用 `--on-emphasis-dark`(與其他亮色 hue 同),不再有 warning 專屬前景。

**為什麼獨立於 `--foreground`**:`--foreground` = neutral-9 文字色(淺色 neutral 底的主文字);on-emphasis 配對是「飽和 / 填色底」專用,跟 neutral 表面前景語義不同(數值巧合相同也不可合併:light mode `--foreground` 是深色,混用會 break 飽和底白字)。

**消費者**(目前):Avatar / Tag solid color variants、Steps filled indicator(icon 色)、Calendar today、Tooltip 等。對比由 `scripts/categorical-color-invariants.mjs` I4 機械驗(oklch→相對亮度→contrast,green exempt)。

**不該消費的情境**:
- ❌ 淺色 subtle 底(step-1)用 on-emphasis 配對 — 請用 `--foreground` / `--color-{hue}-7` family。
- ❌ 把 on-emphasis 配對當 bg 用 — 它們是文字 token。

### `--inverse-*` namespace：inverse surface 上的內容色

`--inverse-*` 是一組 namespace，用來表達「繪製在 inverse surface（= solid `--color-neutral-9`，在 dark mode 自動反轉）上的內容」。Tag / Avatar 的 neutral solid variant 使用 neutral-9 作為底色，因此需要一組與 `--foreground` 家族對應、但方向相反的 token。

| Token | 對應的正常態 token | 用途 |
|-------|------------------|------|
| `--inverse-fg` | `--foreground` | inverse surface 上的文字色（Tag/Avatar neutral solid 的 label） |
| `--inverse-neutral-hover` | `--neutral-hover` | inverse surface 上的 hover overlay（如 dismiss hover） |
| `--inverse-neutral-active` | `--neutral-active` | inverse surface 上的 active overlay（如 dismiss active） |

**命名原則**：
- base 文字 token 命名為 `--inverse-fg`（對齊 `--foreground`），而不是 `--neutral-inverse`。原因是本 token 系統沒有 `--neutral` 這個 semantic base（只有 primitives `--color-neutral-1` ~ `--color-neutral-9`），若命名為 `--neutral-inverse-*` 會讓讀者誤以為存在 `--neutral` base，造成誤導。
- 互動 overlay token 命名為 `--inverse-neutral-hover` / `--inverse-neutral-active`，明確指出鏡射的是 `--neutral-hover` / `--neutral-active`。`fg` 自帶語意所以單獨用，但 `hover` / `active` 太籠統需要 `neutral-` 限定詞表明角色。
- 以 `--inverse-*` 為 namespace 則意義清晰：「inverse surface 上的 foreground / neutral-hover / neutral-active」。

**數值規則（嚴格對稱）**：`--inverse-neutral-*` 在某 mode 的值 = `--neutral-*` 在「另一 mode」的值。即 inverse 是 neutral 的 mode 鏡射。

| Token | Light | Dark |
|-------|-------|------|
| `--neutral-hover` | black @ 2% | white @ 4% |
| `--neutral-active` | black @ 4% | white @ 8% |
| `--inverse-neutral-hover` | white @ 4% (= dark neutral-1) | black @ 2% (= light neutral-1) |
| `--inverse-neutral-active` | white @ 8% (= dark neutral-2) | black @ 4% (= light neutral-2) |

好處：完全對稱、重用既有 tuned values、自動繼承感知補償（dark mode 4% 補償白色透明在深底較弱的視覺感受），未來改 neutral 強度時 inverse 自動同步。

**未來擴展**：當需要在 inverse surface 上表達文字層級時，可平行新增以下 token，對應 `--fg-*` 家族：

| 未來 token | 對應的正常態 token |
|-----------|------------------|
| `--inverse-fg-secondary` | `--fg-secondary` |
| `--inverse-fg-muted` | `--fg-muted` |
| `--inverse-fg-disabled` | `--fg-disabled` |

目前僅 `--inverse-fg` 有實際消費需求，其他層級在有明確使用情境時再加入，避免過度設計。

### 文字色 Step 原則

色彩用於文字時，step 的選擇取決於文字的**角色**——是「資訊呈現」還是「互動入口」？這兩種角色的視覺需求完全不同。

| 角色 | 例子 | Token | 為什麼這個 step |
|------|------|-------|---------------|
| **資訊呈現**（不強調互動，以表達資訊為主的有色文字） | Tag label、Avatar fallback、Badge medium 計數、status indicator | primitive step-7（`--color-{hue}-7`）<br>或 semantic `--{status}-text`（`--info-text`、`--error-text`） | **辨識度優先**——小面積色塊文字疊在 step-1 subtle 底色上，需要更高對比才能舒適閱讀。step-7 在 light mode 是「比 step-6 暗」，在 dark mode 透過 primitives 公式翻轉自動變成「比 step-6 亮」，**兩個 mode 都是離 step-1 subtle 背景最遠的高對比方向**。 |
| **互動入口**（吸引點擊，鼓勵操作） | Button label、Link、可點擊的 status text | semantic base（`--primary`、`--error`、`--info` 等）= step-6 | **鮮豔度優先**——step-6 是色相的飽和最高點，吸引注意力引導使用者操作。互動元素本身有 hover/active 回饋，不靠文字色階暗示。 |
| **互動 hover / active** | Button hover、Tag dismiss icon hover | semantic hover/active（`--primary-hover` 等）= step-5 / step-7 + dark mode swap | **回饋使用者操作**——hover lift / active press 方向跨 mode 一致 |

#### `--{hue}-text` 的角色

**`--{hue}-text` 專門用於「不強調互動、以表達資訊為主的有色相文字」**。它的存在是為了區分兩種完全不同的有色文字：

- **資訊呈現**用 `--{hue}-text` / `--color-{hue}-7` → 小面積色塊文字，最大對比，靜態閱讀
- **互動入口**用 `--primary` 等 semantic base = step-6 → 鮮豔，吸引點擊

**典型 `--{hue}-text` 消費者**：
| 元件 | 用法 | 為什麼是「資訊呈現」 |
|------|------|------------------|
| Tag subtle | label 文字 | Tag 是分類標籤，不可點擊（dismiss 是 inline action 不算 Tag 本體） |
| Avatar subtle | fallback 字 | 文字 fallback 是身份標識，不是按鈕 |
| Badge medium | 通知計數 | 計數是資訊指示器，本身不可點擊 |
| Status text | 「進行中」「已完成」等 | 狀態描述，不引導動作 |

**不該用 `--{hue}-text` 的場景**：
- ❌ Button label（用 `text-white` on primary bg）
- ❌ Link（用 `text-primary` = step-6，鮮豔度優先）
- ❌ 任何 hover/active 互動回饋

#### 為什麼 step-7 在兩個 mode 都對

Primitives 的相對色階公式在 dark mode 把 step-5 / step-7 公式互換：
- Light mode：step-7 = `l * 0.82`（較暗）→ 對白色 subtle 是暗色高對比 ✓
- Dark mode：step-7 = `l + (1-l) * 0.20`（較亮）→ 對深色 subtle 是亮色高對比 ✓

**step-7 永遠是「離 subtle 背景最遠的方向」**，與 mode 無關。這就是為什麼資訊文字可以直接用 primitive，不需要 semantic 層 swap。

Badge 使用語義色的 text token（`--info-text`、`--error-text`），不直接消費 primitive。

**step-7 vs semantic active 的區別**：兩者在 light mode 都指向 step-7，但 dark mode 行為不同。semantic active（如 `--primary-active`）在 dark mode 反轉為 step-5（壓暗模擬按壓感），而 primitive step-7 在 dark mode 仍維持高對比方向。簡言之：active 服務於互動回饋，step-7 服務於閱讀對比，兩者目的不同，dark mode 方向相反。

**例外：step-6 滿版底色上的「亮色 hue」文字用 `--on-emphasis-dark`（`black-a85`,深色)**——yellow / amber / orange / lime 亮度極高,白字（`--on-emphasis`）連 WCAG 3:1 都不過,必須深色文字（見上「`--on-emphasis` 配對」段)。此例外只在底色是 step-6 時觸發,step-1 subtle 底色上仍用 step-7。（green-6 白字亦不過 3:1,但列 documented exception 維持白字。)

### Subtle 背景（淡色填充）

所有語義色都有 `-subtle` 變體。Tag / Avatar 直接使用 primitive step-1（`--color-{hue}-1`）：

```tsx
// Semantic subtle
<div className="bg-primary-subtle" />
<div className="bg-error-subtle" />
<div className="bg-success-subtle" />
<div className="bg-warning-subtle" />

// Tag / Avatar 直接用 primitive step-1
<div style={{ backgroundColor: 'var(--color-blue-1)' }} />
<div style={{ backgroundColor: 'var(--color-purple-1)' }} />
```

#### Dark mode subtle

Light mode 的 step-1 使用不透明色票。Dark mode 的 step-1 在 primitives 中使用 alpha 公式自動計算：

```css
/* primitives.css dark mode */
--color-{hue}-1: oklch(from var(--color-{hue}-6) l c h / calc(0.12 / l));
```

`α = 0.12 / l`：亮度越高的色相 alpha 越低，在 dark canvas 上感知亮度自動統一。所有色相用同一套公式，無需在 semantic 層額外覆寫。

## 互動狀態推導（Hover / Active）

### 公式

Hover / active **直接引用色盤 step**，不使用獨立公式：

| | Hover（較亮） | Active（較暗） |
|---|---|---|
| Light | step **-5** | step **-7** |
| Dark | step **-7** | step **-5** |

相對色階公式保證 step -5 永遠比 base 亮、step -7 永遠比 base 暗，
所有色相適用同一規則，無例外。

高亮度色相（yellow 等）的 hover gap 較小（ΔL ≈ 0.03），
這是物理事實——亮色的淺色方向空間窄。
cursor 變化 + 細微色移疊加仍提供足夠互動回饋。

```tsx
<button className="bg-primary hover:bg-primary-hover active:bg-primary-active" />
```

### Semantic token 直接指向 primitive

| Token | 指向 primitive |
|-------|----------------|
| --primary / --primary-hover / --primary-active / --primary-subtle | → blue-6 / blue-5 / blue-7 / blue-1 |
| --info / --info-hover / --info-active / --info-subtle / --info-text | → blue-6 / blue-5 / blue-7 / blue-1 / blue-7 |
| --error / --error-hover / --error-active / --error-subtle / --error-text | → deep-orange-6 / deep-orange-5 / deep-orange-7 / deep-orange-1 / deep-orange-7 |
| --success / --success-hover / --success-active / --success-subtle / --success-text | → green-6 / green-5 / green-7 / green-1 / green-7 |
| --warning / --warning-hover / --warning-active / --warning-subtle / --warning-text | → yellow-6 / yellow-5 / yellow-7 / yellow-1 / yellow-7 |

每個色相使用色盤的 4 個 step：-1（subtle）、-5（hover）、-6（base）、-7（active / text）。

Dark mode 覆寫：hover/active 方向反轉（hover → step-7，active → step-5），subtle 使用 alpha 公式。text 不需覆寫——primitives 的相對色階公式已處理 dark mode 方向。

### `--{hue}-hover/active` — 非語意色相的互動 token

除了 semantic 色相（primary、info、error、success、warning）有完整 5 件套（base/hover/active/subtle/text）外，**作為 bg 使用的非語意色相**還有獨立的 hover/active 互動 token：

| Token | 指向 primitive | dark mode swap |
|-------|--------------|--------------|
| `--blue-hover` / `--blue-active` | blue-5 / blue-7 | blue-7 / blue-5 |
| `--red-hover` / `--red-active` | red-5 / red-7 | red-7 / red-5 |
| `--deep-orange-hover` / `--deep-orange-active` | deep-orange-5 / deep-orange-7 | deep-orange-7 / deep-orange-5 |
| `--orange-hover` / `--orange-active` | orange-5 / orange-7 | orange-7 / orange-5 |
| `--amber-hover` / `--amber-active` | amber-5 / amber-7 | amber-7 / amber-5 |
| `--lime-hover` / `--lime-active` | lime-5 / lime-7 | lime-7 / lime-5 |
| `--green-hover` / `--green-active` | green-5 / green-7 | green-7 / green-5 |
| `--yellow-hover` / `--yellow-active` | yellow-5 / yellow-7 | yellow-7 / yellow-5 |
| `--turquoise-hover` / `--turquoise-active` | turquoise-5 / turquoise-7 | turquoise-7 / turquoise-5 |
| `--purple-hover` / `--purple-active` | purple-5 / purple-7 | purple-7 / purple-5 |
| `--magenta-hover` / `--magenta-active` | magenta-5 / magenta-7 | magenta-7 / magenta-5 |
| `--indigo-hover` / `--indigo-active` | indigo-5 / indigo-7 | indigo-7 / indigo-5 |

#### 為什麼存在這組 token

**Tag/Avatar 的 solid 色相 dismiss 互動需要**：
- 跟 Button 同樣的 solid color shade change（hover 較亮、active 較暗）
- 跨 mode 一致的方向（dark mode 必須 swap step 號）
- 但 Tag 的「藍」≠ semantic primary（解耦：改 primary 不應影響 Tag）

直接用 primitive `--color-blue-5/-7` 不行——dark mode 公式互換會方向顛倒。所以擴展 semantic 互動 token 模式到全部 12 個 categorical 色相(SSOT `tokens/categorical-color.ts` `CATEGORICAL_HUES`)。

#### 嚴格限制

**只有 hover/active 兩個 token**——**沒有** `--blue` base、`--blue-subtle`、`--blue-text`：

| 用途 | 該用什麼 |
|------|---------|
| Tag/Avatar 的 base bg（solid） | primitive `--color-blue-6` |
| Tag/Avatar 的 subtle bg | primitive `--color-blue-1` |
| Tag/Avatar 的 text on subtle | primitive `--color-blue-7` |
| Tag/Avatar 的 dismiss hover bg | semantic `--blue-hover` |
| Tag/Avatar 的 dismiss active bg | semantic `--blue-active` |

**為什麼故意不加 base/subtle/text？** 那些不需要 mode 翻轉知識（primitives 已處理），加 semantic alias 只會污染命名空間、讓 semantic 層重新引入色相維度(backslide 到廢除的 categorical token layer)。只有 hover/active 真的需要 semantic 層處理 mode swap。

#### 新增非語意色相 hue 互動 token 的步驟

當需要在 Tag/Avatar 加入新色相 variant（例：lime）：

1. **確認 primitive 已存在**：`--color-lime-6` 等（primitives.css 應該已定義）
2. **在 semantic.css 加 hover/active**（light + dark）：
   ```css
   /* :root, [data-theme] */
   --lime-hover:  var(--color-lime-5);
   --lime-active: var(--color-lime-7);

   /* [data-theme="dark"] */
   --lime-hover:  var(--color-lime-7);
   --lime-active: var(--color-lime-5);
   ```
3. **更新 Tag/Avatar 元件**：variant cva 加 lime 條目，SOLID_DISMISS_HOVER 加 lime hover/active
4. **不要加** `--lime`、`--lime-subtle`、`--lime-text`（這些用 primitive 直接消費）

### 新增語意色相的標準流程

每次新增 semantic 色相（例：新增 `--accent` 指向 turquoise）必須**完整執行**這 4 步，不可省略——確保所有 semantic 色相結構一致。

#### Step 1: Primitive（如該色相不存在）

在 `primitives.css` 定義 base-6 值（只需指定 L、C、H），相對公式自動推導 1-10 階。如已存在則跳過。

```css
--color-turquoise-6: oklch(0.57 0.10 225);
/* 1-5 / 7-10 自動由公式推導 */
```

#### Step 2: Semantic 五件套（必填）

在 `semantic.css` 的 `:root, [data-theme]` 區塊新增 5 個 token，**不可缺任何一個**：

```css
--accent:        var(--color-turquoise-6);   /* base */
--accent-hover:  var(--color-turquoise-5);   /* hover */
--accent-active: var(--color-turquoise-7);   /* active */
--accent-subtle: var(--color-turquoise-1);   /* subtle bg */
--accent-text:   var(--color-turquoise-7);   /* text on subtle bg */
```

**對應規則**（不可亂改）：
| Semantic role | Primitive step | 為什麼 |
|---|---|---|
| base | -6 | 主色 |
| hover | -5 | 輕微變亮 |
| active | -7 | 輕微變暗（pressed feel） |
| subtle | -1 | 弱化背景（dark mode 自動 alpha） |
| text | -7 | 高對比文字（dark mode 自動反轉方向） |

#### Step 3: Dark mode 反轉（必填）

在 `[data-theme="dark"]` 區塊新增 hover/active 方向反轉：

```css
[data-theme="dark"] {
  --accent-hover:  var(--color-turquoise-7);   /* dark: 仍是較亮 */
  --accent-active: var(--color-turquoise-5);   /* dark: 仍是較暗 */
  /* subtle、text 不需覆寫 — primitives 已處理 */
}
```

**為什麼只反轉 hover/active？** Primitives 在 dark mode 已經：
- 把 step-1 改為 alpha 公式（subtle 自動正確）
- 把 step-5/-7 公式互換（step-7 在 dark mode 仍是高對比方向，所以 text 自動正確）

但 semantic token 直接 reference step number，所以 hover→step-5 在 dark mode 會變成 darker（錯方向）。必須在 semantic 層手動 swap。

#### Step 4: Tailwind Bridge（必填）

在 `semantic.css` 的 `@theme inline` 區塊加入：

```css
--color-accent:        var(--accent);
--color-accent-hover:  var(--accent-hover);
--color-accent-active: var(--accent-active);
--color-accent-subtle: var(--accent-subtle);
--color-accent-text:   var(--accent-text);
```

讓 `bg-accent`、`text-accent-text`、`hover:bg-accent-hover` 等 Tailwind utility 可用。

---

### 檢查清單

新增完一個語意色相，逐項對照：

- [ ] Primitive base-6 已定義（或已存在）
- [ ] Semantic 五件套全部寫齊（base / hover / active / subtle / text）
- [ ] Dark mode `hover` / `active` 方向反轉已加
- [ ] Dark mode `subtle` / `text` 沒亂加（primitives 已處理）
- [ ] Tailwind bridge 五件套全部加齊
- [ ] 命名遵循 `--{name}` / `--{name}-{role}` 模式（不混色相名）
- [ ] 用 `npx tsc --noEmit` 檢查零錯誤

## Neutral Interaction

中性互動背景分成**兩個獨立的 family**，對應兩種本質不同的狀態。

### active vs selected

**語意獨立,不可互用**。`--neutral-active` 和 `--neutral-selected` 目前**數值相同**(都是 neutral-2),但語意承載不同的「態」:

| Token | 語意 | 生命週期 | 典型場景 |
|---|---|---|---|
| `--neutral-active` | `:active` 瞬間 click 回饋 | **Transient**（按下去那一瞬間，放開就消失） | Button `:active`、list row 點擊回饋、inline action 按下瞬間 |
| `--neutral-selected` | 持續 toggle on / 長時間選中狀態 | **Persistent**（一直維持直到使用者切換） | Button text pressed、DropdownMenu 單選項目、SelectMenu 單選項目、Tab active、selected menu item |

**判斷法**：「這個狀態在使用者放開滑鼠後還存在嗎？」
- 不存在 → `active`（瞬間回饋）
- 存在 → `selected`（持續狀態）

### 為什麼同值仍分兩個 token

這是 token 層存在的核心價值：**把「值」和「用途」解耦**。

1. **讀 code 的語意清晰**：`bg-neutral-selected` 比 `bg-neutral-active` 更精準表達「這個 element 處於選中狀態」，不需要讀者在腦裡轉換語意
2. **未來演化的安全界線**：若未來要把 click 回饋加強（例：`--neutral-active` 改成 neutral-3），selected 狀態視覺不會被意外牽動
3. **對齊流派原則**：本系統選 Atlassian 流派（Semantic State Token），把互動狀態封裝進 semantic 層——active 和 selected 本來就是兩個語意 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

此原則對齊 Carbon Design System 的 `$layer-*` 族命名（`$layer-active` vs `$layer-selected`），是世界級系統處理「同值不同語意」的標準做法。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

### Default state family

用於 non-selected element 的互動回饋：

| Utility | Token | 用途 |
|---|---|---|
| `bg-neutral-hover` | neutral-1 | hover 回饋 |
| `bg-neutral-active` | neutral-2 | `:active` 瞬間 click 回饋 |

```tsx
<div className="hover:bg-neutral-hover active:bg-neutral-active">list row</div>
```

### Selected state family

用於持續 toggle on / 選中 element 的互動回饋。**三件成套，對應 rest / hover / :active 三種互動態**：

| Utility | Token | 用途 |
|---|---|---|
| `bg-neutral-selected` | neutral-2 | 持續 selected rest |
| `bg-neutral-selected-hover` | neutral-1 | selected 上 hover（反向變淺，暗示「可取消」） |
| `bg-neutral-selected-active` | neutral-3 | selected 上 `:active` 深一階 click 回饋 |

```tsx
// toggle button pressed 狀態
<button
  data-state="on"
  className="data-[state=on]:bg-neutral-selected data-[state=on]:hover:bg-neutral-selected-hover data-[state=on]:active:bg-neutral-selected-active"
>
  釘選
</button>

// 列表單選項目
<div className={cn(selected && 'bg-neutral-selected')}>選項 A</div>
```

### 禁止事項

- ❌ 不得用 `bg-neutral-active` 表達持續選中狀態——會造成 class name 語意與視覺行為不符
- ❌ 不得用 `bg-neutral-selected` 作為 `:active` 瞬間回饋——selected 是 persistent，不是 transient
- ❌ 不得因為目前同值就合併為一個 token——語意獨立就該獨立存在

## Static Subtle Background — `bg-muted` vs `bg-secondary` 使用原則(SSOT)

> **2026-05-20 v3 consolidation**(per user directive「全盤查 spec 是否曾寫過具體舉一反三 + 是否有矛盾」):原 L647-678 重複 3 處場景列表 + 「status indicator drift」已移除,本段為**單一 SSOT**。

兩者都是靜態中性背景,但傳達的**元素狀態**不同。**核心問句**:「這個元素是『還沒準備好 / 不可操作 / placeholder』嗎?」

| Token | 答 | 語意 | 典型場景(real consumer grep verified 2026-05-20) |
|---|---|---|---|
| `bg-muted`(neutral-2) | **是** | **靜態非互動 surface** — 退化 / placeholder / locked 視覺 | Skeleton(`skeleton.tsx:10`) / DataTable table header(`data-table.tsx:255 HEADER_BG`) / Calendar 非當月日格(`calendar.tsx:312`)/ Alert neutral(`alert.tsx:27`)/ DataTable filter-panel inner group container(`data-table-filter-panel.tsx:780`)/ tab 容器 / code block / scrollbar track(`semantic.css:353`)/ anatomy `<th>` |
| `bg-secondary`(neutral-3) | **否,只是視覺退後一級** | **存在且微淡可辨** — 元素是正常狀態,但需要退後一級 | Tag neutral(`tag.tsx`)/ Slider rest track(`slider.tsx`)/ FileItem compact-B progress track(`file-item.tsx`)/ Badge low(`badge.tsx:28`)/ CircularProgress track(`circular-progress.tsx:151`)/ Steps fillBg(`steps.tsx:688,701`)/ ProgressBar track(`progress-bar.tsx`)|

**判斷法**:「這個元素是『還沒準備好 / 不可操作』嗎?」
- 是 → `bg-muted`(退化、placeholder 語意)
- 不是,只是視覺上需要退後 → `bg-secondary`(微淡但正常存在)

**為什麼不能反過來**:Skeleton 用 `bg-secondary` 會太深,搶走真正內容出現時的視覺落差;Tag neutral 用 `bg-muted` 會太淡,小面積元素辨識度不足。深淺差一階(neutral-2 vs neutral-3)在小元素上的感知差異比大面積更明顯。

**跟 `bg-neutral-hover` / `bg-neutral-active` 的區別**:neutral 系列表達**互動**狀態(hover / 選中);muted / secondary 表達**結構性的靜態層級** — 即使沒有互動,它永遠是這個顏色。

**邊界 — component disabled bg 不走 muted**:Button / Input / Checkbox 等元件 disabled state 走 `--bg-disabled` semantic,不是 `--muted`(同值 neutral-2 但不同 owner — `--bg-disabled` 是 component-state token,`--muted` 是 surface-non-interactive token,per「為什麼同值仍分兩個 token」段 rule)。**Readonly state 同理但用自己的 token `--bg-readonly`**(2026-06-10):readonly ≠ disabled(可聚焦/選取/提交,僅不可改值,per Carbon「navigable but not operable」),不借 `--bg-disabled` 名;也不走 `--muted`(readonly 是互動元件 state,非 Skeleton 類靜態 surface)。三者同值 neutral-2、owner 獨立,可分離演進。

```tsx
<Skeleton className="h-4 w-32" />            {/* bg-muted — placeholder 語意 */}
<div className="bg-muted">table header</div>  {/* bg-muted — 靜態 surface 退化 */}
<Tag color="neutral">Status</Tag>             {/* bg-secondary — 正常存在但退後 */}
<Badge variant="low">5</Badge>                {/* bg-secondary — 小元素需更明顯底色 */}
```

## 邊框 / 分隔

| Utility | Token | 用途 |
|---------|-------|------|
| `border-border` | neutral-5 alpha 15% | 元件標準邊框（input / Field family / standalone control)|
| `border-border-hover` | neutral-6 alpha 25% | input、checkbox、radio 的 hover 邊框 |
| `border-divider` | neutral-4 alpha 9% | 分隔線（比 border 更淡)/ **table 外框 + row divider 同色**(T-junction connectivity)|
| `border-[var(--border-opaque)]` | neutral-5 opaque | alpha-immune 變體;cell bg 非白(disabled 灰底 / nested surface)時用 |

選中狀態的邊框或文字使用 hover token：

```tsx
<div className="border-primary-hover text-primary-hover" />
```

### T-junction connectivity 原則(2026-05-04 升 SSOT)

**問題**:Table row divider(horizontal)在 row 兩端 meet table outer border(vertical)。若 outer border 跟 divider **不同色** → 交匯處視覺斷層,user 感「不連續」。

**為什麼不能加重 divider**:divider 是密集分隔 N rows,加重 → 過搶眼,reading flow 被打斷。

**解法**:**淡化 outer border 至 divider 同色**(從 `border-border` 降到 `border-divider`)。交匯處 seamless,divider 視覺重量不變。

**實作**:DataTable outer 用 `border-divider`(對齊 row 內 dividers)。對齊 Ant Design `colorBorderSecondary` idiom — Ant table 外框 + row divider 同 token。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**何時 outer = `--border` vs `--divider`**:
- 元件**無 inner divider**(input / Field / Card / Dialog)→ 用 `--border`(獨立邊框,標準視覺重量)
- 元件**有 inner divider**(Table / List with dividers)→ outer 用 `--divider`(同色,T-junction seamless)
- 元件 cell bg **非白底**(FCG disabled cell)→ 用 `--border-opaque`(alpha-immune 變體)

## Utility Tokens

| Token | 用途 |
|-------|------|
| `--overlay` | dialog backdrop 遮罩 |
| `--tooltip` | tooltip 深色底（不透明）|
| `--chart-1` ~ `--chart-5` | 5 色類別標記（Chart 元件 data viz 用；固定到 primitive 而非 semantic — 避免 brand swap 污染 data viz 色義；light step-6 / dark step-5 / yellow 用 step-7 提對比）。**Numbered naming = industry canonical**(Material Data Viz palette / Polaris ChartPalette / Carbon Charts colors-N / IBM data-viz / D3 schemeCategory10)— categorical color 本質無 inherent priority,只能 by-index;**1→5 順序 ≠ priority**,只是 consumer 取色 idx convention。色相選擇 rationale:blue(冷靜入門)→ purple(分類二)→ green(成長 / 正面)→ yellow(警戒對比)→ deep-orange(暖色平衡)。Brand swap 不影響 data viz(`--chart-*` 直連 primitive,跳過 `--primary` 等 semantic 中間層)。<!-- @benchmark-cited: Material Data Viz https://m3.material.io/styles/color/the-color-system/color-roles + Polaris https://polaris.shopify.com/tokens/color + Carbon https://carbondesignsystem.com/data-visualization/color-palettes/ + D3 https://d3js.org/d3-scale-chromatic/categorical --> |
| `opacity-disabled` | disabled 元件整體透明度（0.45），用於無法改寫內部色彩的第三方元件 |

`opacity-disabled` 適用場景：包裝第三方元件（如圖表、地圖）的 disabled 狀態，無法逐一替換內部顏色時，直接對容器套用透明度：

```tsx
<div className={disabled ? 'opacity-disabled pointer-events-none' : undefined}>
  <ThirdPartyChart />
</div>
```

自己寫的元件優先用具體的 disabled 色彩（如 `text-fg-disabled`、`bg-[var(--bg-disabled)]`）。`opacity-disabled` 僅作為逃生艙，適用於無法逐一替換內部顏色的場景（第三方元件、複雜多層結構如 Switch）。

## shadcn Compat Aliases(已清除,2026-04-18)

shadcn compat aliases(`bg-background` / `bg-card` / `bg-popover` / `bg-destructive` / `bg-accent` / `border-input` / `*-foreground` 等)2026-04-18 全數移除。新 code 一律用 direct token(`bg-canvas` / `bg-surface` / `bg-surface-raised` / `bg-error` / `bg-neutral-hover` / `border-border`)。`bg-secondary` + `bg-muted` 已升正式語義 token(見 Static Subtle)。

## Nested Theme

任何容器都可以透過 `data-theme="dark"` 或 `data-theme="light"` 切換子元素的色彩語境。最常見的場景是 **Tooltip**——底色是深色，子元素需要 dark token 才可讀。

### 運作原理

CSS 變數在定義元素上解析。`:root` 的 `--foreground: var(--color-neutral-9)` 在 `:root` 就解析成 light 值，子孫繼承的是結果，不是 `var()` 表達式。

為了讓 nested theme 正確重新解析，`semantic.css` 的所有語義 token 定義在 `:root, [data-theme]`。任何帶 `data-theme` 的元素都會重新解析所有語義 token，子元素自動跟隨。

### CSS 結構

```
① :root               — 固定值（--brand，不隨 theme 變）
② :root, [data-theme] — 所有語義 token（default = light 值）
③ [data-theme="dark"] — 只覆寫跟 light 不同的值
```

判斷標準：「這個 token 在 dark 要不要變？」要 → ③ 覆寫。不要 → 只寫在 ②。

### 使用方式

```tsx
// Tooltip：子元素永遠 dark token
<TooltipContent>
  <div data-theme="dark" className="contents">{children}</div>
</TooltipContent>

// 任何容器都可以局部切換 theme
<div data-theme="dark">
  <Tag>dark mode tag</Tag>
</div>
```

容器自身的樣式（如 tooltip 的 `bg-tooltip`）不受子 div 的 `data-theme` 影響——`data-theme` 在子 div 上，只影響子元素。

## 常見誤解

各誤解的完整推理已在本檔對應段落,此處彙整索引:

- 「`--primary` 跟 `--info` 同色所以可互換」— 語義截然不同,status 元件混入 `--primary` 即 fail(見「Status」段 + `status-color-invariant.mjs`)。
- 「`--fg-disabled` 剛好是我要的灰,拿來當 bg」— 跨 family 借用是 smell(見「fg token 不可當 bg 用」段 Slider case)。
- 「`bg-muted` / `bg-secondary` 都是淡灰隨便選」— 前者 = 退化 / placeholder,後者 = 正常存在但退後一級(見「Static Subtle Background」段)。
- 「`--neutral-active` / `--neutral-selected` 同值可合併」— transient vs persistent 語意獨立(見「active vs selected」段)。
- 「categorical `red` = `--error`」— hue 25 vs deep-orange,完全無關(見「消費規則」注意事項)。

## 禁止事項

```tsx
// ❌ 原始色 / 硬碼 → ✅ semantic / primitive
<div className="bg-blue-500" />  <div className="bg-canvas" />
<div className="bg-[#1677FF]" /> <div className="bg-primary hover:bg-primary-hover" />
<div className="bg-[var(--color-blue-6)]" /> // ❌ semantic 場景用 primitive(Tag/Avatar 例外)
// ❌ 深色硬寫 text-white → ✅ <div data-theme="dark"><Tag /></div>
```

## 結構性保留 token canonical
SSOT → `.claude/references/structural-token-retention.md`(6 類保留 + sub-agent triple-verify 流程)

---

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `chart.spec.md`
- `date-grid.spec.md`
- `file-item.spec.md`
- `notice.spec.md`
- `opacity.spec.md`
- `progress-bar.spec.md`
- `separator.spec.md`
- `skeleton.spec.md`
- `token-system.spec.md`
