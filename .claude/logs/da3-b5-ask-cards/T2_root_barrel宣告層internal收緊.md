# T2 — Root barrel 宣告層 @internal 收緊

**Verdict:MIXED**(一部分降 AUTO、剩一張真決策卡)
**收斂者:Claude(claude-opus-4-8)/ 2026-07-17 / DS deep-audit B.5**

---

## SSOT-check 先行(這議題我方拍過板嗎?)

查我方 spec / rules / git,這議題的**大原則早就拍板過**,而且做過一輪:

| 證據 | 內容 |
|---|---|
| `git bdec45b4` | `fix(dim-72): internal 元件不進 root barrel front-door — subpath-only SSOT(Q2 拍板)` — 2026-06-05 user Q2 拍板「internal 不進 front door」 |
| `ui-development.md:33` | 明文 codify:「Root barrel front-door 排除(2026-06-05 dim-72 SSOT,user Q2 拍板)」 |
| `git 9b7234bd`(beta.84,`feat(ds)!`)| 「API 表面策展」— user 拍板「全部收窄」,已做過**破壞性移除**(commit 帶 `!`);gen-barrel.mjs 目前已擋 `/Meta$/`(componentMeta)+ `/Internal$/`(型別通道)|
| `ui-development.md:20` | 明文列 `RowSizeProvider` / `ItemInlineAction(Button)` / `useOverflowItems` 為 internal primitive |
| `inline-action.spec.md:289` | 明文「app-code 不可直接 import L3 primitive(ItemInlineActionButton / ItemInlineAction / RowSizeProvider)」|
| `horizontal-overflow.spec.md:2-4` | frontmatter `internal: true`,scope 明列 use-overflow-items hooks 為「DS-internal consumer only」|

**結論**:方向(internal 不進 root barrel)+ 機制(生成時自動排除)+ 「全部收窄」授權**都已拍板**。目前的漏洞純粹是 generator 只認**名稱慣例**(`/Internal$/`、`/Meta$/`)跟**整單元 frontmatter isInternal**,**不解析宣告層 `@internal` jsDoc**,所以散在 public 單元內、被個別 jsDoc 標 `@internal` 的符號仍從 front door 漏出去。

---

## 世界級對照(≥3 家)

三家世界級一致:實作細節不該出現在公開入口 / 公開型別,而且都有「解析 @internal 標記自動剔除」的成熟機制:

1. **TypeScript `stripInternal`**(官方 tsconfig)— 正是「解析宣告層 `@internal` jsDoc → 從公開 `.d.ts` 剔除」的官方機制。我方 generator 要補的就是這個。<https://www.typescriptlang.org/tsconfig/stripInternal.html>
2. **MUI** — 「public components = 從 `@mui/material` 匯出的;internal components = 不從 package 匯出、只在 public component 內部使用」。跟我方「internal 不進 root barrel」一模一樣;另用 `unstable_` / `internal_` 前綴分級。<https://mui.com/material-ui/guides/api/> + RFC #5463
3. **Microsoft api-extractor** — release tag `@public/@beta/@alpha/@internal` + trimmed `.d.ts` rollup(`publicTrimmedFilePath` 只含 `@public`,自動剔 `@internal`)。宣告層可見度分級的業界標準工具。<https://api-extractor.com/pages/setup/configure_rollup/>

(我方 `ui-development.md:35` 另已 cite Atlassian `@atlaskit` vs unstyled primitives、Carbon turnkey vs utilities、Apple HIG「Presented controls vs implementation primitives」——同一共識。)

**M23 一致設計語言**:外部 benchmark 跟我方既有 canonical **完全同向**,無衝突。世界級做法 = 我方已拍板方向,直接對齊。

---

## 降 AUTO(對齊既有拍板的實作缺口,不送 user 重問)

以下符號的 internal 身分**已有權威 SSOT 明文**,把它們排出 root barrel = 對齊既有分類的實作補洞,非新決策:

- **d44i4 — RowSizeProvider / ItemInlineActionButton / ItemInlineAction(+ props types)**
  三方權威:`item-anatomy.tsx:449/605/671` jsDoc `@internal` + `ui-development.md:20` 列為 internal primitive + `inline-action.spec.md:289` 明禁 app-code import。移除 = 對齊已拍板分類。**AUTO**。
- **d44i5 — use-overflow-items(整個 hook module)**
  `horizontal-overflow.spec.md:2-4` frontmatter `internal: true`「DS-internal consumer only」+ `ui-development.md:20` 列 useOverflowItems 為 internal。改 subpath-only。**AUTO**。
- **d44i3 — ButtonGroupContext / CheckboxGroupContext**
  純 wrapper→child 注入用的實作 context,零 standalone consumer(唯一 consumer 皆 DS 內部)→ 命中 `ui-development.md:20` 判準「只有 DS 內部元件用 = internal」。補宣告層 `@internal` + 排除 = 對齊 public-vs-internal SSOT。**AUTO**。
- **generator 機制本身(d72i0 的機制面)** — 擴充 gen-barrel.mjs 解析宣告層 `@internal`(對標 TS stripInternal / api-extractor @internal trimming)= 對齊 2026-06-05 Q2 + 2026-07-14「全部收窄」的治理基礎建設。**AUTO**。
- **d72i0 其餘明確內部符號** — `floatingLayerClass`、`getMenuListMinHeight`、PeoplePicker layout helpers(`PEOPLE_PICKER_LENGTH1_WRAPPER_CLASS` / `getPeoplePickerTagWrapperClass`)、`INLINE_ACTION_HOVER_BG_SIZE` / `ROW_PADDING_BY_SIZE`:raw tailwind / 尺寸 wiring helper,無 standalone consumer 場景 → 命中判準即 internal。**AUTO**。

> AUTO 前置驗證(機械、非決策):移除前 grep 消費端 app(WM app 等)確認沒 import 到這批符號;有 import → 先改 subpath / 換公開 API 再移除。這是機械步驟,不需 user 拍板。

---

## 真決策卡(剩下這些不能歸到「已拍板分類」——請 user 一次通盤拍板)

### 【問題】
方向已定(internal 不進 front door),但有**三類符號的分類本身還沒定案 / SSOT 自相矛盾**,而且移除它們 = 破壞已發佈 npm export。要不要**現在就一次性做完這批破壞性收窄**,還是保守只動上面 AUTO 那批、這幾個先留?具體 3 個懸而未決點:

1. **`handleSheetOpenAutoFocus`(d44i2)— SSOT 自相矛盾的真岔路**
   它被標 `@internal`(sheet.tsx:96),但**同一段註解卻叫 consumer「需自訂前置行為時 import 接力呼叫」**,而且從 root front door 匯出——三方意圖打架。今天只有 DS 內部 AppShell 用它。這不是機械漏洞,是「它到底 public 還 internal」的真分類決策。
2. **`AVATAR_SIZE` / `ICON_SIZE`(d72i0 邊界子集)— 是不是消費者要的公開 token?**
   這兩個是尺寸常數表。`ICON_SIZE` 另有 token 路徑(`tokens/uiSize/icon-size`)也公開同名值。消費者若自己排 row layout 可能會想拿這尺寸對齊。算 public token 還是 internal wiring?
3. **`tagAreaPaddingLeftPx`(d33i1)— 無 consumer 的預留 prop**
   Combobox 上 5 個 `@internal` PeoplePicker 量測 prop,其中這一個**現在完全沒 consumer**(people-picker 傳 undefined),是預留給未來的。刪掉 vs 藏起來?

### 【選項 A】現在就一次做完整批破壞性收窄(擴充 generator 解析 @internal + 把三個懸點也定案)
- `handleSheetOpenAutoFocus` → **保留 internal、排出 root**,同時修掉那句誤導 consumer 的註解;真要自訂開場 focus,Radix 原生 `onOpenAutoFocus` 就是公開逃生口。
- `AVATAR_SIZE` / `ICON_SIZE` → element-anatomy 這條**重複 re-export 移除**(`ICON_SIZE` 仍經 token 路徑公開,不影響拿值);消費者對齊尺寸走 token 路徑。
- `tagAreaPaddingLeftPx` → **直接刪**(YAGNI)。
- **tradeoff**:一次收乾淨、公開面最誠實、跟 beta.84「全部收窄」同一批精神;但這是**破壞性 npm 變更**(移除已發佈 export),消費端若誤用需同步改(beta 階段可接受,且這批都是實作細節,正常 consumer 不該碰)。

### 【選項 B】保守——只做 AUTO 那批(三方權威已明確 internal 的),三個懸點先留
- **tradeoff**:零爭議、破壞面最小;但公開面**留一半不一致**(有些 @internal 漏、有些不漏),generator 仍不解析宣告層 @internal,下次稽核還會再抓一次,等於把同一批 churn 往後推——違反「一次做完」。

### 【推薦】選項 A
理由:(1) 方向 + 「全部收窄」授權 user 已拍板,beta.84 已有帶 `!` 的破壞性移除**先例**;(2) 三家世界級(TS stripInternal / MUI / api-extractor)一致——internal 不該在公開入口,且解析 `@internal` 是標準做法;(3) 消費端只有內部 app,實作細節本就不該被 import,破壞風險低且可先 grep 驗;(4) 保守方案只是把同批工作延後,違反一次做完。**唯獨 `handleSheetOpenAutoFocus` 這條**因為 SSOT 自相矛盾,值得 user 一句確認方向(保留 internal 還是扶正成 public);另兩點(尺寸 token 去重、刪預留 prop)風險低,順推薦即可。

### 【SSOT 理由】
這是會影響 SSOT 的 UI/UX 改動 —— **改 npm 公開 API contract**:移除已發佈的 root export = consumer 既有 `import { X } from '@qijenchen/design-system'` 會斷;且 `handleSheetOpenAutoFocus` 這條同時**改 public-vs-internal canonical 語意**(它到底是不是受支援的 consumer API,牽動 Sheet spec 要不要收錄)。兩者都逾越「對齊既有分類」範圍,屬新 API contract / canonical 語意決策,故送 user 拍板。
