# Steps 狀態視覺設計原則(indicator / 焦點外環 / label / connector 的 state 疊加;獨立 SSOT)

> **本 spec 是 Steps 狀態視覺的獨立 SSOT**(2026-09-27 從 `steps.spec.md` 抽出「State」「自動推導」「Focus marker — Outer ring」「Label 色彩」「Connector 路徑色」五段,避免單一 spec 過長(530 行 > 500 硬上限,待辦總帳 N19);內容零改動,只加本檔頭、檔尾指標,與一處回指 `steps.spec.md` 的路徑)。定位 / Size / Linear vs Non-linear / Expansion / Orientation / API / A11y 仍住 `./steps.spec.md`;「指示點不是命中目標」講的是命中區、不是狀態,也留在 `steps.spec.md`。程式碼對應 `steps.tsx`(`computeState` / `resolveRingColor` / `getOuterRingStyle`)。
>
> **Layout Family**:同 `steps.spec.md`(`patterns/element-anatomy/item-anatomy.spec.md` Family 2 List item 的消費者);本檔不另立 family。

## State(Content state,跟 Focus 正交)

| State | 視覺 | 觸發 |
|---|---|---|
| `upcoming` | 灰底(inline `background: var(--muted)`)+ 灰字(`text-fg-disabled`)| 未走到 |
| `current` | 藍底(`bg-info`)+ 白字數字 | step === `value` 且不在 completedValues / errorValues |
| `completed` | 藍底(`bg-info`)+ 白色 ✓ | step 在 `completedValues` 內 |
| `reachable` | 藍底(`bg-info`)+ 白字數字(僅 linear;sm 為空心環)| linear 下「下一個未完成」step(非 current / completed / error),可點 |
| `error` | 紅底(`bg-error`)+ 白色 ✕ | step 在 `errorValues` 內(或單項 `state="error"` override)|

### Sm size 的 state 視覺

sm 沒有 icon 空間,用色塊表達:
- `upcoming` → 灰實心點(`bg-fg-disabled`)
- `current`(linear)→ 藍色**空心**環(`border: 2px solid var(--info-hover)`);non-linear current 走灰實心點(`bg-fg-disabled`)。`reachable` 也是空心環
- `completed` → 藍實心點(`bg-info`)
- `error` → 紅實心點(`bg-error`)

### 自動推導(順序即優先級,對齊 `computeState`)

**Consumer 不手寫每個 step 的 state**。State 由 Steps root 的 props 依下列順序推導(`steps.tsx` `computeState`):

```
per-item state override(escape hatch)              → 直接採用
step 在 errorValues                                 → error(優先於 completed;交集一律 error)
step 在 completedValues                             → completed
step === value                                      → current(linear / non-linear 都成立)
linear && step 在 reachable(completed ∪ 首個未完成)→ reachable
其他                                                → upcoming
```

**關鍵**:`value` 命中的 step 在兩種模式下 content state 都是 `current`,但 **filled 藍的「正在做」視覺只屬於 linear**。非 linear 的 current 渲染中性 `bg-secondary` + `foreground` 數字(見「Non-linear 被選中 ≠ filled 藍」),focus 由 outline 外環表達,**不會**出現 filled 藍。

### 為什麼非 linear 的 current 不渲染 filled 藍

非 linear 模式讓使用者跳著點 step(例如設定頁、教學目錄),value 的語意是「使用者在看哪一步」,**不是**「使用者在做哪一步」。如果非 linear 也渲染 filled 藍,會造成:

- 使用者點 upcoming step 想預覽 → step 立刻變 filled 藍,像是「標記為正在做」
- 跟 mental model「我只是在看,這步還沒做」衝突
- completedValues 沒有變化,前一個 filled 藍 step 突然不見

正確做法:focus 視覺跟「進度視覺」完全解耦——focus 透過 outline 外環表達,filled 藍由 linear / completedValues 決定。filled「正在做」視覺是 linear 的概念。

Per-item `state="error"` prop 存在但是 **escape hatch**,僅用在 inline JSX 想直接宣告錯誤的罕見場景;一般情況用 `errorValues` array 統一管理,不要混用。

---

## Focus marker — Outer ring(outline + offset,bounding box 永遠不變)

**`value` 指向的 step,透過「outline 外圈環」視覺表達 focus**。

### Outer ring 的關鍵設計

- **Bounding box 固定**:focus 外環以 outline 表達,不改變 indicator 的 bounding box——focused / non-focused 佔用完全相同的寬高(md=24px,lg=32px,sm=24px 排版盒)
- **透明間隙 + 外環**:`outline` 2px、`outline-offset` 2px —— indicator 與環之間那 2px 是**透明**的,露出底下真正的背景,形成「indicator 外有一圈帶間隙的環」;數值見 steps.tsx `getOuterRingStyle`(`RING_GAP_PX` / `RING_WIDTH_PX`),與全 DS 焦點框(`styles/base.css` `:focus-visible` 的 `outline: 2px solid var(--ring); outline-offset: 2px`)同一組粗細與間隙。outline 不改變 bounding box,因此不會推動連接線或文字。
- **Ring 色由 state 決定**:`error` → `--error-hover`;non-linear `current` → `--border-hover`;其餘(含 linear current / completed / upcoming / reachable)→ `--info-hover`

### State × Focus 視覺矩陣(md/lg)

filled 底色與內容色**完全由 content state 決定,不因 focused 改變**;focused 只額外疊一圈 outline 外環。

| State | 底色 + 內容(focused / non-focused 相同) | Focused 額外疊加 |
|---|---|---|
| upcoming(linear)| `bg-muted` + `fg-disabled` 數字 | `--info-hover` 外環 |
| upcoming(non-linear)| `bg-secondary` + `foreground` 數字 | `--info-hover` 外環 |
| current(linear)| `bg-info` + white 數字 | `--info-hover` 外環 |
| current(non-linear)| `bg-secondary` + `foreground` 數字 | `--border-hover` 外環 |
| completed | `bg-info` + white ✓ | `--info-hover` 外環 |
| error | `bg-error` + white ✕ | `--error-hover` 外環 |

> **linear vs non-linear upcoming 底色刻意不同**:linear upcoming 用 `bg-muted` + `fg-disabled`(灰、弱字 = 「還到不了/鎖住」);non-linear upcoming 用 `bg-secondary` + `foreground`(中性、可讀 = 「可導覽但非當前」)。因為 non-linear 模式所有 step 都可點(reachable),upcoming 不該呈現 linear 那種「鎖住」的 muted 感。
>
> **為何 upcoming 用 `--muted`(locked surface)而非 `--bg-disabled`(互動元件 disabled)**:indicator 是 `aria-hidden` 狀態圖示(非互動 control),填色是「狀態色盤」不是「互動元件背景」;linear upcoming 恰是不可點(`isClickable`=false、無 `role=button`)的 locked 狀態。世界級 source-verified(2026-06-01 M26 benchmark):Atlassian Progress Tracker `unvisited`(`--ds-background-neutral-bold`)≠ `disabled`(`--ds-background-disabled`)為兩個獨立 status;Carbon `incomplete`(`$border-subtle`)≠ `disabled`(`$icon-disabled`);Ant Steps `wait` 用 `colorFillContent`/`colorTextLabel` 刻意避開 `colorTextDisabled`。4/5 家以 neutral/locked 語義處理 upcoming。元件真正的 disabled(`disabled` prop)走 `opacity-disabled` 疊加(保留狀態色不換 token)。

**注意 linear mode 的 current 永遠 focused**,所以 linear mode 下 current step 永遠帶外環(底色仍是 filled 藍,只是多疊一圈 ring)。

### Sm 尺寸的 focus 處理

sm 的 8px dot 用同一套 `getOuterRingStyle` outline 外環在 dot 外圍繞圈——**但仍在 24px 的 indicator 排版盒內**,所以 bounding 不變。(那個盒是欄寬,不是命中區;見 `steps.spec.md`「指示點不是命中目標」。)

### 為什麼 bounding 不變這麼重要

連結線幾何依賴 indicator 的邊緣位置。如果 focus 改變 bounding box,連結線的起點/終點會跟著變,造成「focused step 的連結線比別的短一點點」的視覺不齊感。**outline 外環不佔 layout**——focus 狀態變化時外部幾何完全不變——連結線可以用統一公式,自然一致。

### 為什麼外環與圓之間要有一圈間隙

直接在 filled circle 外貼一圈同色 ring 會讀成「雙圈」很醜;環與 indicator 之間隔一圈 2px 的間隙,視覺乾淨且各 state 都清楚。

**間隙必須是透明的,不可以用某個底色「畫」出來**(2026-09-26 修,待辦總帳 N48 / L14)。2026-09-25 以前的寫法是兩層 box-shadow:內層用 `var(--surface)` 實心畫一圈假裝間隙,外層再疊環色。`--surface` 在淺色是不透明白,看起來沒事;在深色是白 8% 半透明,底下那層環色透上來 —— 實測(storybook 非線性「總覽」)淺色 圓 #0065EA / 間隙 #FFFFFF / 外環 #2F85FE,深色 圓 #1982FF / 間隙 **#58A5FF**(應為頁面底 #0A0A0A)/ 外環 #4A9DFF,深色整顆看起來是一個大藍圓,兩主題長得不一樣(user 09-25 原話:「另外我發現圖一的總覽的藍色外圈為何在深色模式看起來跟在亮色模式看起來不一致的設計語言？」)。而且就算換成不透明色,Steps 放在卡片、對話框、側欄裡時,那個顏色也不會剛好等於底下的背景。

現行寫法是 `outline` + `outline-offset`:offset 那一圈本來就不畫任何東西,露出的永遠是真正的背景,兩主題、任何容器都同一個長相 ——與全 DS 焦點框(`../../ds-canonical/references/focus-canonical.md`「框怎麼畫」;`styles/base.css` `:focus-visible`)同一種畫法。

### Non-linear 被選中 ≠ filled 藍(關鍵規則)

非 linear 模式使用者點 upcoming step 瀏覽時,step 的 content state 變為 `current`(`computeState` 對 value 命中者一律回 current),但渲染**刻意中性**。視覺上會是(md/lg):
- 底色:`bg-secondary`(**刻意不同於 linear upcoming 的 `bg-muted`**——non-linear 所有 step 都可點,不該像 linear upcoming 那樣呈現「鎖住/還到不了」的 muted 灰;secondary 傳達「可導覽但非當前」)
- 數字:`foreground`(可讀,非 disabled 弱字——呼應 step 可達)
- 外環:`--border-hover` outline 外環(focus marker,表達「你在看這一步」;`resolveRingColor` 對 non-linear current)

**不會**出現 linear current 的 filled 藍——這對齊使用者 mental model「我只是在看,這步還沒做」。non-linear current 與 upcoming 同為 `bg-secondary` 底,被選中(focused)的 step 以 `--border-hover` 外環標示。sm 尺寸的 dot 在 non-linear current 仍用 `fg-disabled` 灰點(8px dot 最小化呈現)。

**Ring 不是 selection marker**。Steps 不是 SelectMenu / DropdownMenu 這類 selection control;ring 是 focus marker 單一語意。`patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」規則 B 指出的 `bg-neutral-selected`、radio 圓圈等 selection 視覺**都不適用 Steps**——Steps 用 outline 外環表達「you are here」,不是「你選中了這個」。

---

## Label 色彩(error state 例外)

Label 色彩優先順序:

```
disabled > error > focused > default
```

- `disabled` → `text-fg-disabled`(最優先,覆蓋所有其他狀態)
- `error` → **`text-error-text`**(error state 時 label 變紅,跟 indicator 的紅 ✕ 協調表達「這步出錯」)
- `focused`(非 disabled 非 error)→ `text-foreground`(使用者當前在看這步,加強)
- `default` → `text-fg-secondary`(一般狀態)

### 為什麼 error label 要跟 indicator 同色

Steps 的 step 本身是「狀態載體」,跟 Field 的「label 只是欄位名,error 靠 help text 表達」不同。Steps 的 label 在視覺上屬於 indicator 的延伸資訊,兩者應該一起講故事:紅 ✕ indicator + 紅 label 形成一致的 error visual language,讓使用者一眼看出這步出了什麼錯(description 不變色,見下段)。

這跟 `components/Field/field.spec.md`「樣式規範」的 FieldLabel foreground 原則不衝突——那是 Field 家族的規則(edit / readonly / disabled 三態的欄位容器)。Steps 是**進度指示器**不是**輸入容器**,label 色彩跟著 step state 走是正確做法。

### Description 沒有 error 變色

Description 在 error state 下維持 `text-fg-secondary`(跟其他 state 一樣)。理由:
1. Error 的「為什麼出錯」訊息該放在 `<StepContent>` 內(可以用 `text-error-text` 寫錯誤詳情),description 只是輔助說明
2. 太多紅字會造成視覺壓迫,三層紅(indicator + label + description + content)過多
3. 保留 description 為 secondary 給 consumer 一個「寫冷靜說明」的空間

---

## Connector 路徑色

連接 `stepA → stepB` 的 connector:**當且僅當 stepA 是 completed 時,該 connector 為藍色**(`bg-info`),其他一律灰(`bg-border`)。connector 是一條 `w-px`(vertical)/ `h-px`(horizontal)的有底色 div line,故用 `bg-*` 而非 `border-*`。

### 為什麼藍色只跟 completedValues 走,不跟 value 走

藍色代表「實際走過的進度路徑」,必須跟 `completedValues` 一對一對應,才能跟 step 本身的底色邏輯保持一致。非線性模式下:

- 使用者把 `value` 跳到中間未完成的 step 5
- step 1-4 仍為 upcoming(灰底)
- 若藍色延伸到 step 5 前面,會產生「藍線連灰 step」的矛盾視覺
- 正確做法:藍色 connector 跟 step 的 bg 同步,都只在 completed 區段出現

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `steps.spec.md`
