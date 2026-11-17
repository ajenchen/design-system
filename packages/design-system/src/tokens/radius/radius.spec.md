<!-- @benchmark-cited: 2026-11-15 重寫;2026-11-18 複查 —— 外部對照在「禁止事項」第一段、「設計理由」(1)(2) 與「歷史」第二條,每段都附了原始來源網址(數值的網址都釘了版本),逐條開檔核對過,內容支持原句。還缺一段:「禁止事項」裡「特別注意 `rounded-sm`」那段說 Tailwind 預設的 `rounded-sm` 是 4px,同段沒有附網址(同一個值的出處在「禁止事項」第一段)。 -->

# Radius 設計原則

圓角只有四檔:`sm` 2px / `md` 4px / `lg` 8px / `full`。**選哪一檔看元素的用途,不看 Tailwind 的習慣**——先判斷「這個元素是哪一種東西」,再查下表。

## 四檔(唯一住處;機器讀這張表)

下表是圓角的唯一來源:

- 閘 `scripts/token-allowlist-invariant.mjs` 拿「class / token / 值」三欄比對 `../utility-registry.json` 的 `radius.allow`、`radius.css` 的宣告與 Tailwind 預設刻度(不在表上的 Tailwind 名字一律要被擋)。
- 閘 `scripts/radius-usage-invariant.mjs` 拿「值 / 機器判定」兩欄,在建置好的 Storybook 上逐則量每一個有圓角的元素。

<!-- radius-scale:start -->
| class | token | 值 | 用途 | 機器判定 |
|-------|-------|----|------|----------|
| `rounded-sm` | `--radius-sm` | 2px | 極小指示:圖表圖例色塊(8×8)這類短邊 ≤ 10px 的色塊 / 標記 | 短邊 ≤ 10px |
| `rounded-md` | `--radius-md` | 4px | 一般元件:Button、Input、Select、Checkbox、Tag、Tooltip、不浮起來的容器、列的 hover 底 | 其餘;Tooltip 外殼 |
| `rounded-lg` | `--radius-lg` | 8px | 浮層外殼:Dialog、Sheet、Popover、DropdownMenu、HoverCard、Command、Toast | 浮層外殼(Tooltip 除外) |
| `rounded-full` | `--radius-full` | 9999px | 膠囊 / 圓形:Avatar、Switch、ProgressBar、Badge 計數 | 不限 |
<!-- radius-scale:end -->

唯一的 bracket 寫法(也在 `radius.allow`):

<!-- radius-passthrough:start -->
- `rounded-[inherit]`:不是圓角值,是「跟著父層的圓角裁切」(token class 表達不了;實例 `ScrollArea` 的 Viewport 跟著外框裁)。量測閘不另判它,判它的父層。
<!-- radius-passthrough:end -->

**「機器判定」欄的意思**(`scripts/radius-usage-invariant.mjs` 照這幾個詞判,詞改了閘會讀不懂而紅):

| 詞 | 怎麼量 |
|----|--------|
| 短邊 ≤ Npx | 元素外框 `getBoundingClientRect()` 的寬、高取小的那個 ≤ N。【AI 推導 2026-11-15】用短邊而不是「直徑」:CSS 會把圓角夾在短邊的一半以內,圓角與邊長的比例看的是短邊(下方「`rounded-sm` 為什麼只給 ≤ 10px」的算法) |
| 浮層外殼 | 帶 `--elevation-200`(或 `-200-hover`)陰影的元素 —— `../elevation/elevation.spec.md`「層級」:200 = 浮層。外殼裡面「四個圓角都跟外殼重合」的裁切層算外殼的一部分,照外殼判 |
| Tooltip 外殼 | 浮層外殼裡含 `role="tooltip"` 的那一個(Radix Tooltip 的朗讀節點)|
| 其餘 | 不屬於上面任何一種的元素 |
| 不限 | 任何元素都可以用(`full` 本身就決定了形狀是膠囊 / 圓形)|

量到的值不在 2 / 4 / 8 / 9999px 裡(例:6px、50%)一律紅。逐筆有理由的例外登記在 `scripts/radius-usage-exceptions.json`(每筆寫理由與規格出處);「畫面會變、要 user 看過才改」的現況違規登記在同檔 `pending`,只准變少。

## 使用規則

### `rounded-sm`(2px)— 極小指示

只給短邊 ≤ 10px 的視覺指示,要「微圓而不是完全方」:

- 圖表圖例色塊(8×8)
- 其他短邊 ≤ 10px 的色塊、標記

短邊 ≥ 12px 的元素一律 `rounded-md`,不要為了「圓一點 / 方一點」改用 `sm`。

**`rounded-sm` 為什麼只給 ≤ 10px**(圓角 / 邊長比):4px 在 8×8 元素上 = 邊長 50%(圓角到半邊長就成膠囊,色塊的意思沒了);2px = 25%,輪廓仍是方形。≥ 12px 的元素上 4px ≤ 33%,比例剛好,不需要 2px。

### `rounded-md`(4px)— 一般元件

大多數互動元件,視覺上「有圓角但不搶眼」:

- Button、Input、Select、Checkbox、Tag
- 不浮起來的容器(頁面上的卡片、內嵌通知;DS 目前沒有 Card 元件)
- 表格格子、清單列的 hover 底
- Tooltip(雖然帶浮層陰影,圓角跟一般元件同一檔;`../elevation/elevation.spec.md`「浮層共用樣式」寫明這個例外)

### `rounded-lg`(8px)— 浮層外殼

浮在頁面上層的外殼:

- Dialog、Sheet
- Popover、DropdownMenu、HoverCard、Command
- Toast

浮層裡面的東西(列、按鈕、內嵌卡片)照它自己是什麼選檔,不跟著外殼用 8px —— 只有與外殼四角重合的裁切層例外。

### `rounded-full`(9999px)— 膠囊 / 圓形

需要完全膠囊或圓形的元件:

- Avatar(圓形)
- Switch 外框
- ProgressBar
- Badge 計數

## 禁止事項

**不在上表的名字一律不准用**,包括 Tailwind 預設有、但這套刻度沒有的名字(Tailwind 4.2.2 預設刻度是 `xs` / `sm` / `md` / `lg` / `xl` / `2xl` / `3xl` / `4xl`,[theme.css L397-404](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/v4.2.2/packages/tailwindcss/theme.css)):

```tsx
// ❌ 不在刻度上的名字(Tailwind 預設照樣產生,值不歸設計系統管)
<div className="rounded-xs" />     // 2px 這一檔叫 rounded-sm
<div className="rounded-xl" />     // 12px,不在刻度上
<div className="rounded-2xl" />    // 16px,不在刻度上
<div className="rounded" />        // 沒寫檔位,意圖不明

// ❌ 硬寫圓角值
<div className="rounded-[6px]" />
<div style={{ borderRadius: '8px' }} />

// ❌ 用變數語法(token class 已經夠用)
<div className="rounded-[var(--radius-md)]" />
```

```tsx
// ✅ 一般元件
<button className="rounded-md" />

// ✅ 浮層外殼
<div className="rounded-lg" />

// ✅ 膠囊
<span className="rounded-full" />
```

**特別注意 `rounded-sm`**:在 Tailwind 預設裡 `rounded-sm` 是 4px,在這套刻度裡是 2px。照 Tailwind 習慣寫 `rounded-sm` 想拿 4px,會靜默拿到 2px —— 所以不要靠名字猜,照上表的用途選;寫錯了會被 `scripts/radius-usage-invariant.mjs` 量出來(短邊 > 10px 的元素用 2px = 紅)。

### 不寫圓角的行為

不寫 `rounded-*` → `border-radius: 0`(CSS 預設直角),不會退回任何 token;不需要圓角的元素本來就不寫,不強制每個元素標圓角。

## 設計理由

**(1) 四檔、每一檔是上一檔的兩倍(2 → 4 → 8 → full)**

每跳一檔數值翻倍,目視一眼就分得出不同層級。中間不插檔:要在 2 與 4 之間插一檔,整數只能插 3 —— 3 對 4 差 25%、2 對 3 差 33%,兩段都分不太出來;要兩段差異都 ≥ 50% 沒有解。

對照(數值都讀自原始碼):

| | 本 DS | Tailwind 4.2.2 預設 | Material 3 | Polaris |
|---|---|---|---|---|
| 刻度 | sm 2 / md 4 / lg 8 / full | xs 2 / sm 4 / md 6 / lg 8 / xl 12 / 2xl 16 / 3xl 24 / 4xl 32([theme.css L397-404](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/v4.2.2/packages/tailwindcss/theme.css)) | extra-small 4 / small 8 / medium 12 / large 16 / extra-large 28 / full([_md-sys-shape.scss L17-L31](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/tokens/versions/v0_192/_md-sys-shape.scss#L17-L31)) | 050 2 / 100 4 / 150 6 / 200 8 / 300 12 …([border.ts L32-L60](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/themes/base/border.ts#L32-L60)、[size.ts L5-L10](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/size.ts#L5-L10)) |

**(2) `rounded-full` 是 9999px,不是 50%**

50% 在短矩形(高 < 寬,例如橫向的 Switch)上會變成橢圓;9999px 在任何長寬比都是膠囊(瀏覽器會把它夾在短邊的一半)。Polaris 的 full 也是 9999px([border.ts L59-L60](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/themes/base/border.ts#L59-L60))。

**(3) 不做連續曲率圓角(squircle)**

CSS `border-radius` 只畫得出單一半徑,連續曲率得靠 SVG path,多出執行期成本,不值得。

## 歷史(照實記)

- **第一天就是同值別名**:2026-03-25 第一個 commit `da71b526` 的 `globals.css` 寫 `--radius-sm: 4px; --radius-md: 4px;`,同一個 commit 裡 `src/design-system/` 目錄那份給 AI 讀的使用規則檔,圓角表同時列 `rounded-sm` 與 `rounded-md` 都是 4px,沒寫任何理由。同日 3 小時後的 `49075c74`(與 Claude Sonnet 4.6 合寫)把 `rounded-sm` 改標成禁用,但 `--radius-sm` 的宣告沒有拿掉。
- **「保留給未來」是 AI 後來加的,而且不成立**:`8a6fdd03`(2026-04-18,與 Claude Opus 4.7 合寫)把 71 處 `rounded-sm` 換成 `rounded-md`,第一次寫「保留 sm 給未來 2px」;兩天後 `f1f94465` 真的需要 2px(圖表圖例色塊),卻新開了 `--radius-xs`,sm 的理由改寫成「介於 md 和 xs 之間」—— 照 (1) 的算法這一階沒有任何值成立。`d4a8cc9c`(2026-05-01,作者 Claude)再加上「對齊 Material『reserve for future dense pattern』、先把名字佔著」:Material 的原始碼([_md-sys-shape.scss](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/tokens/versions/v0_192/_md-sys-shape.scss#L17-L31))與主題頁(https://material-web.dev/theming/shape/)都查無此句;密度也只有 md / lg 兩種(`../density/density.spec.md`),沒有「未來的 compact」可以接。
- **同值別名的代價**:2026-04-18 改掉 71 處之後,`rounded-sm` 又被 9 個 commit 寫回(`d45f39dd`、`ddd79a8f`、`07110dc9`、`f8cec708`、`d0534253`、`b2444ea8`、`e12e0fed`、`e524dc99`、`a7b2be94`),因為 `utility-registry.json` 的允許清單一直放行它。
- **2026-11-15 收成四檔**:`--radius-sm`(4px,與 md 同值)退場,`--radius-xs`(2px)改名 `--radius-sm`,`rounded-xs` 的用法改成 `rounded-sm`,畫面零差異(2px 的地方仍是 2px)。依據是 user 2026-11-15 同一則訊息(逐字):「難道不是我們的 token 變成只有sm(2px),md(4px),lg(8px)和full,然後其他不准用？所以就是把sm退場然後把xs改名sm？」與「目前整個ds都沒有實際消費者，所以不用顧及改名會造成breaking change」。原題:AI 先提出改名的代價(照 Tailwind 習慣寫 `rounded-sm` 會靜默拿到 2px),user 回「可是現在完全沒有人用sm」後才有這一則;AI 同日兩次回「照你說的做」,user 沒有反對【AI 判讀 2026-11-16:反問句 + 「不用顧及改名」= 要做】。那個代價改由 `scripts/radius-usage-invariant.mjs` 的實量檢查擋(DS 自己的範例裡,2px 用在短邊超過 10px 的元素就紅)。改名登記在 `../token-registry.json` 的 `retired` 與變更帳本 `../../../ds-changes.json`(`0.1.0-beta.149` 節,帶 rename-token fix);0.x 不留舊名(相容政策:`../../../ds-canonical/references/props-naming.md`「相容政策」)。
