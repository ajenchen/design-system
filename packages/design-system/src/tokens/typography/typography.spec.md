<!-- @benchmark-cited: D5 retrofit 2026-05-18 — verified 0 world-class DS claim in body; blanket retract removed. -->

# Typography 設計原則

Typography 定義字體尺寸與行高的 token 系統，確保全系統文字層級一致。

## 設計原則

Typography 由三個獨立維度組成，分開疊加：

<!-- typography-allow-weight:start -->
| 維度 | 控制方式 | 說明 |
|------|---------|------|
| font-size | `text-{role}` utility | token 決定，不可繞過 |
| line-height | 烤進 token，需要時覆蓋 | heading / supplementary → 1.3；body → 1.5 |
| font-weight | `font-normal` / `font-medium` / `font-bold` | 使用端疊加，不寫死在 token |
<!-- typography-allow-weight:end -->

**line-height 的選擇基於「是否適合多行閱讀」：**
- `1.5`：適合連續閱讀的段落（14px / 16px）
- `1.3`：標題、短文字、截斷場景、不需要閱讀行距
- 12px 以下不適合作為連續閱讀內文，一律 1.3

**font-weight 等同 `<strong>` 的疊加邏輯：**
- 不加 = 400，一般文字
- `font-medium` = 500，行內中等強調
- `font-bold` = 700，強調（等同 `<strong>`）。**以上三階是元件與產品範例的全部字重**;`font-semibold`(600)只用在文件外框的標題 —— 教學頁的段落標題與規則標題(`stories-helpers/examples/tutorial-page.tsx`):來源 user 2026-10-07「第一題照你建議」,採 AI 同日建議 ②「段落標題 text-h3 半粗體 + 淺分隔線、只用在教學頁」(`ds-canonical/skills/story-writing/references/category-templates.md`「教學框的間距與標題」);設計規格頁的小標(`stories-helpers/anatomy/anatomy-utils.tsx` `H3`;main `ec7466f5` 是 `font-bold`)與展示頁畫布上的分組小標(main 只有 4 處:Avatar 3、item-anatomy 1)改成 600,是本 PR `7ec9cb61`(2026-10-07 AI 全 DS 範例掃除)改的;user 2026-10-27 回「Q2照你建議」—— 採 AI 建議 ③ 維持 600(題目:設計規格頁小標與展示頁分組小標要不要跟教學頁一樣用 600),定案。元件、pattern、token 原始碼不得出現 `font-semibold`(閘 `scripts/owner-claims-invariant.mjs` C4;r1b OTH-06)


## Token 表

允許清單的來源:本表、上方「設計原則」表的字重、下方「line-height 覆蓋」與「既定 role」兩段框起來的 utility(閘 `scripts/token-allowlist-invariant.mjs` 驗 `../utility-registry.json` 的 `typography.allow` 逐字相等,並驗 Tailwind 預設的 `text-*` / `font-*` / `leading-*` / `tracking-*` 名字全部被擋)。選字級照「用途」欄,不照 Tailwind 名字對應。

<!-- typography-allow-size:start -->
| Utility        | font-size | line-height | 用途 |
|----------------|-----------|-------------|------|
| `text-h1`      | 48px      | 1.3         | 頁面主標題 |
| `text-h2`      | 32px      | 1.3         | 區塊標題 |
| `text-h3`      | 24px      | 1.3         | 子區塊標題 |
| `text-h4`      | 20px      | 1.3         | 小節標題 |
| `text-h5`      | 16px      | 1.3         | 元件層級標題 |
| `text-h6`      | 14px      | 1.3         | 最小層級標題 |
| `text-body-lg` | 16px      | 1.5         | 16px 為主版面的段落內文 |
| `text-body`    | 14px      | 1.5         | ★ 主要內文基準 |
| `text-caption` | 12px      | 1.3         | 圖表附註、標籤文字、元件內次要說明 |
| `text-footnote`| 10px      | 1.3         | 法律文字、來源標注（極少用）|
<!-- typography-allow-size:end -->

> **10px a11y 用途限制**（2026-07-17）：`text-footnote` 僅限**非必要的附帶資訊**（法律細字、來源標注、storybook 註解）——目前全庫零正式元件消費，只用於 stories `<p>` 註解。**使用者需理解才能操作的資訊禁止只靠 10px**；任何 ≤12px 用途上線前須驗 200% 放大（WCAG 1.4.4）不裁切。視覺標題 ≠ 語義標題（一律用 `h1–h6`，WCAG 1.3.1）。

**h5（16px）vs body-lg（16px）/ h6（14px）vs body（14px）**：同尺寸配對的統一判別法——line-height 區分角色（標題 1.3 / 段落 1.5），使用端再疊 font-weight / color 強化標題層級，需有意識地選擇（詳「同尺寸但不同角色的選法」）。


## 整頁預設字級(2026-11-24)

**整頁預設字級 = `text-body`**:`../../styles/base.css` 的 `body` 規則寫 `font-size: var(--font-body-size)` 與 `line-height: 1.5` —— 字級 token 與行高都跟上表 `text-body` 那一列相同(`typography.css` 的 `@utility text-body`)。**唯一住處就是那條規則**:DS 的元件外殼與浮層不另設「這一區的預設字級」,repo 裡其他 CSS 也不在 `html` / `body` 上設字級。

- **誰吃到它**:沒自己設字級的文字 —— 浮層內文(浮層經 Portal 掛在 `body` 底下,外殼不另設,`../../patterns/overlay-surface/overlay-surface.spec.md`「SurfaceBody」)、範例或產品頁裡沒帶 `text-*` 的段落與清單、沒帶 `text-*` 的 `h1`–`h6`(Tailwind preflight 把標題設成 `font-size: inherit`)、原生表單控制項(preflight 設 `font: inherit`)。
- **自己設了 `text-*` 的文字不受影響**:字級 token 是 px(`typography.css` 的 `:root`),不跟著整頁預設、也不跟著瀏覽器的預設字級變。
- **行高**:Tailwind preflight 在 `html` 也設了 `line-height: 1.5`(無單位,子元素依自己的字級重算),與這裡同值;`body` 照寫一次,讓整頁預設不依賴 preflight。
- **產品要別的字級**:在那個元素上用元件參數或 `text-*` className(照上方 Token 表的用途選);不覆寫 `--font-body-size`(`../token-system.spec.md`「產品不寫任何 token」、「產品要『設定』元件的值,走元件參數,不覆寫 token」)。
- **2026-11-24 前**:`body` 沒設字級,上面那些文字吃到瀏覽器預設(預設 16px)。2026-11-24 實測:Calendar 事件 Popover 內文 16px 比 14px 的 PopoverTitle 大;Dialog 內文沒帶 class 的段落 16px,跟 16px 的 DialogTitle 一樣大;把 `html` 字級暫時改成 20px(模擬使用者調大瀏覽器字級),這些文字跟著變 20px。
- **依據**:user 2026-11-24 追問(逐字)「那是否直接改全域預設字體比較乾淨且符合世界級的設計？此外這個預設會是我們的字體token 嗎？然後，如果消費者要改寫就自己再去針對元件改？」,選 AI 擬的選項「照全域做 (Recommended)」,並說「確定是世界級的設計就照你建議」。行高照寫、浮層外殼不另設這兩點【AI 推導 2026-11-24】。
- **閘**:`scripts/global-body-font-invariant.mjs`(`npm run test:global-body-font`,CI 必跑;`--selftest` 對照組):靜態比對 `base.css` 的 `body` 字級必須是 `var(--font-body-size)`、行高必須等於 `@utility text-body` 的行高;瀏覽器開 Popover / Dialog / Sheet 的浮層 story,經 Portal 掛出去、繼承整頁預設的內文必須是 14px,外殼與 Body 不另設字級(body 暫改 20px 做 A/B,跟著變的才是繼承來的)。

**世界級對照**(兩派;本 DS 採第一派):
- 整頁預設寫在 `body`、浮層內文繼承:MUI CssBaseline「Set the `theme.typography.body1` style on the `<body>` element.」([來源](https://raw.githubusercontent.com/mui/material-ui/master/docs/data/material/components/css-baseline/css-baseline.md)),Dialog 內文繼承它,要固定字級的 `DialogContentText` 自己指定 `variant="body1"`([來源](https://raw.githubusercontent.com/mui/material-ui/master/packages/mui-material/src/DialogContentText/DialogContentText.js));Primer CSS 的 body 寫 `font-size: var(--body-font-size, $body-font-size)`、`$body-font-size: 14px !default`([來源](https://raw.githubusercontent.com/primer/css/main/src/base/base.scss)),Primer React Dialog 的 `.Body` 不設字級([來源](https://raw.githubusercontent.com/primer/react/main/packages/react/src/Dialog/Dialog.module.css));Salesforce Lightning(SLDS)在 body 設 `font-size: 0.8125rem`,`.slds-modal__content` 不設、繼承 body([來源](https://cdn.jsdelivr.net/npm/@salesforce-ux/design-system@2.264.3/assets/styles/salesforce-lightning-design-system.css))。
- 另一派(浮層元件根自己設字級):Ant Design 的 `.ant-modal-body` 寫 `fontSize: token.fontSize`([來源](https://raw.githubusercontent.com/ant-design/ant-design/master/components/modal/style/index.ts));Atlassian `modal-body` 宣告 `font: var(--ds-font-body)`([來源](https://cdn.jsdelivr.net/npm/@atlaskit/modal-dialog@17.3.0/dist/cjs/modal-body.compiled.css));Carbon 的 `.cds--modal-content` 套 `type-style('body-01')`([來源](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/styles/scss/components/modal/_modal.scss)),它的 body 只設字重與字體、不設字級([來源](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/type/scss/_reset.scss));Fluent 的 `DialogContent` 展開 `typographyStyles.body1`([來源](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/react-components/react-dialog/library/src/components/DialogContent/useDialogContentStyles.styles.ts))。
- 取捨【AI 推導 2026-11-24】:第一派一處設定,浮層、範例與產品頁裡沒設字級的文字全部一致;代價是要固定字級的元件得自己設 —— 本 DS 元件本來就各自帶 `text-*`(上方「設計原則」表:font-size 由 token 決定),所以改變的只有原本沒設字級的文字。


## line-height 覆蓋（僅 14/16px body 可覆蓋）

**Token canonical**：除 `text-body`（14px）/ `text-body-lg`（16px）外，**所有 size 行高皆固定**：
- `text-h1`–`text-h6`：全部 lh 1.3 固定（標題不需多行閱讀行距）
- `text-caption`（12px）/ `text-footnote`（10px）：全部 lh 1.3 固定（小字不適合 1.5）
- `text-body` / `text-body-lg`：**唯二**可覆蓋（預設 lh 1.5 閱讀段落，可 `leading-compact` 覆蓋為 1.3）

唯一合理覆蓋情境：`text-body` / `text-body-lg` 用於**單行固定高度容器**（Button / Tabs trigger / Chip / Notice banner / MenuItem row / SelectMenu / TreeView / DropdownMenu / Combobox input），避免 1lh > chrome height 造成垂直偏移：

```tsx
{/* ✅ Button 文字（單行 28/32/36px chrome height）*/}
<button className="h-field-sm text-body leading-compact">確認</button>

{/* ✅ Notice banner 單行 alert text */}
<span className="text-body leading-compact">已儲存</span>
```

單行保證由容器自身承擔（Button / SegmentedControl item 等套 `whitespace-nowrap`）——`leading-compact` 不處理 2 行以上的 label；多行截斷是 `line-clamp-*` + 預設行高的職責（見下方反 pattern）。

可用的 override utility(只有這兩個;Tailwind 預設的 `leading-tight` / `snug` / `relaxed` / `loose` 與數字行高一律擋):
<!-- typography-allow-leading:start -->
- `leading-compact`：1.3（自訂，只給 `text-body` / `text-body-lg`）
- `leading-normal`：1.5（Tailwind 內建，正式 DS 元件**不需**主動覆蓋成 1.5，因為 `text-body` / `text-body-lg` 預設就是 1.5）
<!-- typography-allow-leading:end -->

### 反 pattern（禁用）

```tsx
{/* ❌ 用 leading-compact + line-clamp 「截斷副標」
       line-clamp 自己處理截斷，不需要動 line-height；該選對的 token */}
<p className="text-body leading-compact line-clamp-2">副標說明</p>

{/* ❌ 用 h5/h6 + leading-normal「當段落」
       h5/h6 是標題語義，不該當段落；同 size 該換 body-lg / body */}
<p className="text-h5 leading-normal">較小的說明段落</p>
```

### 同尺寸但不同角色的選法（用 token 自然區分，不靠 leading 覆寫）

| 尺寸 | 段落（閱讀） | 標題（掃視 + bold） |
|---|---|---|
| 16px | `text-body-lg`（lh 1.5） | `text-h5`（lh 1.3，加 `font-medium`） |
| 14px | `text-body`（lh 1.5） | `text-h6`（lh 1.3，加 `font-medium`） |

**結論**：90% 情境用 token 預設就對；唯一覆寫 = body/body-lg 進單行固定高度容器套 `leading-compact`。


## 組合範例

```tsx
{/* 頁面標題 */}
<h1 className="text-h1">專案總覽</h1>

{/* 區塊標題加重 */}
<h2 className="text-h2 font-medium">執行進度</h2>

{/* 主要內文 */}
<p className="text-body">一般說明段落，預設 400 weight。</p>

{/* 行內強調 */}
<p className="text-body">
  此操作將<span className="font-medium">永久刪除</span>該筆資料。
</p>

{/* 截斷副標 */}
<p className="text-body leading-compact line-clamp-2 text-fg-secondary">
  這是一段較長的副標說明，超過兩行會被截斷顯示。
</p>

{/* 欄位附屬說明 */}
<span className="text-caption text-fg-muted">最多 200 字元</span>
```


## 禁止事項

```tsx
// ❌ 不要用 Tailwind 原始 text-sm / text-lg / text-base
<p className="text-sm">內文</p>

// ❌ 不要硬寫 font-size 或 line-height
<p style={{ fontSize: '14px' }}>內文</p>

// ❌ 不要用 12px 做連續閱讀段落
<p className="text-caption">這是一整段很長的說明文字...</p>

// ❌ 不要把 font-weight 寫死在外層容器（應在需要的元素上疊加）
<section className="text-body font-medium">...</section>

// ❌ 不要用 Tailwind 原始 tracking-* utility(letter-spacing 必 role-specific)
<kbd className="tracking-widest">⌘K</kbd>
```


## Letter-spacing(role-specific only)

**哲學**:`letter-spacing` 跟 font-size / line-height 同層 — utility scale(`tracking-tight..widest`)是 raw scale 非 semantic role,每 consumer 自挑值 = 跨元件不一致。本 DS 採 **single semantic value per role**,每個需要 letter-spacing 變化的 role 必先 codify token。

### 既定 role

<!-- typography-allow-tracking:start -->
| Token | 值 | Tailwind utility | Role |
|---|---|---|---|
| `--tracking-shortcut` | `0.1em` | `tracking-shortcut` | 鍵盤快捷鍵 hint(`⌘K` / `Ctrl+S` 等),Command/CommandShortcut + DropdownMenuItem `shortcut` 後綴 + 同類 kbd 顯示 consumed via `text-caption` 或 `text-footnote` |
<!-- typography-allow-tracking:end -->

### 新增 role 流程

1. typography.css `:root` 加 `--tracking-<role>: <value>;`
2. typography.css 加 `@utility tracking-<role> { letter-spacing: var(--tracking-<role>); }`
3. utility-registry.json `typography.allow` 加 `tracking-<role>`
4. 本 spec.md 加 row 到上表 + 對應 role 對齊世界級 cite(M22)
5. Consumer code 用新 utility

**對齊**:Material 3「letter-spacing per type role」(每個 type role 各有 `*-tracking`)/ Tailwind「wider tracking for uppercase + labels」([來源](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/tokens/versions/v0_192/_md-sys-typescale.scss#L40-L57))。


## 世界級對照

對齊 M8(binary strict rule 必 ≥3 家世界級對照),「禁 Tailwind `text-sm`/`text-base` raw utility」+「禁硬寫 fontSize」是本 spec 的 binary strict rule,以下為支撐 rationale。

本 DS 字級:base 14px(= `text-body`,也是整頁預設字級,住 `styles/base.css` 的 `body`,見上方「整頁預設字級」)、10 個 utility 內;line-height 二元(scanning 1.3 / reading 1.5);字重三階(normal / medium / bold)—— 各自理由見下方三段。

## 設計哲學

四個關鍵決策,各自有世界級先例支撐:

**(1) Body base = 14px(對齊 Material / Carbon / Ant 三家共識)**
三家的預設內文都是 14px:Material 3 `$body-medium-size: 0.875rem`([來源](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/latest/sass/_md-sys-typescale.scss));Carbon `body-01` 的字級是 `rem(scale02)`([來源](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/type/src/styles.ts)),`export const scale02 = 14;`([來源](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/type/src/scale.ts));Ant Design seed token `fontSize` 預設 14,其他字級由它派生([來源](https://raw.githubusercontent.com/ant-design/ant-design/master/components/theme/interface/seeds.ts))。base 14px 在程式裡就是 `text-body`,也是整頁預設(上方「整頁預設字級」;2026-11-24 前整頁沒設字級,沒帶 class 的文字吃瀏覽器的 16px,與這一條不一致)。

14px 適合 productivity 工具:一屏要放規格、表格、Dashboard 等密集資訊;16px 是 reading-first 的選擇(長文閱讀、行動裝置)。本 DS 場景是 dense workspace,14px 同時讓 information density 高、又仍是舒適的內文大小。捨棄 16 base 的代價是「行動裝置可讀性」,但 DS 主場景是 desktop。

**(2) 二元 line-height(1.5 / 1.3)— 對齊 Carbon「productive vs supplementary」哲學** <!-- @benchmark-unverified -->

ratio ladder(行高隨字級連續變化)雖精細,但 consumer 心智負擔重(每 size 對應不同 lh,需查表)。二元規則「連續閱讀 1.5 / 掃描 1.3」讓 reader 一眼判斷「是要連續閱讀還是 scanning」即可選對 — 對應本 DS 的 scanning(MenuItem / FileItem)vs reading(Empty / Field description)二分法。

捨棄連續 ratio 的代價是「極大字級 lh 過鬆」(48px h1 仍 1.3),實測無此問題(本 DS 無 60+ display 級字)。

**(3) h5/h6 與 body-lg/body 同 size(16/14)— 靠 lh + weight 區分,不開新 size tier**

Material 3 用 15 個 type role(display / headline / title / body / label 各分 large / medium / small)—— size scale 一大是 DS 維護負擔(每加 1 tier 就要全 component grep 評估)([來源](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/tokens/versions/v0_192/_md-sys-typescale.scss))。

本 DS 採二元覆寫(同 16px 用 lh 1.3 = h5 標題 / lh 1.5 = body-lg 段落),靠 line-height + font-weight + color 區分角色,維持 token table 在 10 個 utility 內。代價是「使用端需有意識選 h5 vs body-lg」,但對應「同尺寸但不同角色的選法」判別法明寫「需有意識地選擇」。

**(4) Font weight 3 階(400/500/700)— 對齊 Carbon / Polaris 共識** <!-- @benchmark-unverified -->

Tailwind / Apple SF 的 9 階 weight scale(Apple:「SF Pro features nine weights」,<https://developer.apple.com/fonts/>)涵蓋 marketing / 印刷需求,但 productivity DS 的場景幾乎只用 normal / medium / bold 三階(Polaris 也只開 regular 450 / medium 550 / semibold 650 / bold 700 四階)。捨棄 100-300 hairline + 800-900 black 的代價是「行銷 hero text 表現力」,DS 不收 marketing 場景,接受([來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/themes/base/font.ts#L108-L118))。

## 跨元件參考

行高在 row 類元件中的應用（scanning vs reading 模式）詳見 `patterns/element-anatomy/item-anatomy.spec.md`「兩種閱讀模式」節。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `empty.spec.md`
- `popover.spec.md`
