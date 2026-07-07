---
component: Slider
family: self-contained
variants: {}
sizes:
  sm:
    px: 28
    when: "Toolbar / inline 編輯;對齊 field-height-sm(md density)"
    world-class: ["VS Code zoom slider", "Figma toolbar inline"]
  md:
    px: 32
    when: "預設 — Form + 設定面板 + DataTable cell inline edit;對齊 field-height-md(md density)"
    world-class: ["Material Slider default", "Polaris RangeSlider", "Ant Slider"]
  lg:
    px: 36
    when: "Marketing hero 互動 / 高 touch 區;對齊 field-height-lg(md density)"
    world-class: ["Apple HIG slider touch zone"]
traits:
  - hasSizes
  - hasInteractiveStates
  - isMatrixHeavy
benchmark:
  - Radix Slider primitive: github.com/radix-ui/primitives/tree/main/packages/react/slider
  - Ant Design Slider: github.com/ant-design/ant-design/tree/master/components/slider
  - MUI Slider: github.com/mui/material-ui/tree/master/packages/mui-material/src/Slider
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Slider 設計原則

**數值範圍選取器**——基於 Radix Slider primitive,橋接設計系統 token。

> 命名:`Slider`(沿用 Radix / shadcn / Material 慣例)。

---

## 定位

使用者沿著一條軌道拖曳 thumb 選擇一個數值(single)或一段範圍(range)。適合**連續或密集離散的數值選取**,當使用者在意「相對位置」勝過「精確數字」時使用。

**Layout Family**:非上述 family — self-contained primitive(track + thumb + range,非 row / pill / field 結構)。高度對齊 Field family 僅為視覺整齊(`size` prop 映射 `h-field-*`),並非消費 Field layout 的 slot 結構。

---

## 何時用

- **「感受性」連續值**:亮度 / 音量 / 縮放 / 透明度
- **範圍選取**:價格區間、日期區間、分數區間
- **使用者在意「相對位置」勝過「精確數字」**:粗略調整 > 精確輸入
- **搭配顯示值**:thumb 旁標籤或同步 NumberInput 讓使用者掌握精確數字

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 離散且少量選項(3–5 個) | `SegmentedControl` / `RadioGroup` | Slider 為連續值設計,離散少量用分段控件視覺更清楚 |
| 精確數字輸入 | `NumberInput` | Slider 難以拖到精確值,打字更快 |
| 布林切換 | `Switch` | 布林不是數值 |
| 「多少」而非「哪裡」(計數) | `NumberInput`(含 ±step) | Slider 傳達 position,不是 quantity |
| 純篩選布林 | `Checkbox` | 非數值型篩選 |

---

## 尺寸

### 一種視覺,多種容器尺寸

**track / thumb 是單一視覺規格**(track 4px、thumb 16px、邊框 2px,皆不隨 `size` 變):thumb 是位置指示器,必須夠大好捕捉(Fitts's Law),等比縮小會直接傷可用性;世界級同款——Material 3(track 4dp / thumb 20dp)/ iOS(3pt / 28pt)/ Ant(4px / 14px)/ Radix,全部 thumb / track 尺寸獨立於 form-size system。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

`size?: 'sm' | 'md' | 'lg'`(預設 `md`)**只控 root 容器外高 `h-field-*`**,內部視覺 `flex items-center` 垂直置中——Slider 丟進 `Field` 與 Input / Select / NumberInput 並排時對齊 field-height tier(否則一排 sm field 混一個 md 高 slider,rhythm 會崩),同時保持「一種尺寸,任何 context 長得都一樣」;API 與其他 field 元件一致(都有 `size`),消費者不需特別記「Slider 沒有 size」。focus 不加 ring / halo,改用 border 階變(詳「視覺規格」表)。

---

## 視覺規格(單一組,不隨 size 變)

| 元素 | 值 | Token |
|---|---|---|
| **Track** 厚度 | 4px | — |
| **Track** 底色 rest | `bg-secondary` | `--secondary`(neutral-3,跟 Tag neutral / Badge low 同級「微淡可辨」)|
| **Track** 底色 disabled | `bg-muted` | `--muted`(neutral-2,disabled-like 退化)|
| **Range** 填滿色 rest | `bg-primary` | `--primary` |
| **Range** 填滿色 disabled | `bg-border`(neutral-5)| `--border` |
| **Thumb** 直徑 | 16px | — |
| **Thumb** 底色 rest | `bg-on-emphasis`(白,深淺主題不反轉;對齊 Switch thumb / Radix Themes / iOS) | `--on-emphasis` |
| **Thumb** 底色 disabled | `bg-canvas`(不透明頁面背景色,沉回背景;= Radix disabled thumb gray-1 同款) | `--canvas` |
| **Thumb** 邊框 rest | 2px,色 = Range rest 同 token | `--primary` |
| **Thumb** 邊框 disabled | `border-border`(= Range disabled 同色)| `--border` |
| **Thumb** hover | border 升 hover 階(light mode 淺一階 lift,= Button primary hover 邏輯)+ 陰影 `--elevation-100` | `--primary-hover` |
| **Thumb** active(按壓拖曳) | border 深一階 `primary-active`(= Button active 邏輯;2026-07-06 修:原誤用 hover 階,全 DS 唯一 active-用-hover 偏移)+ 陰影 `--elevation-200` | `--primary-active` |
| **Thumb** focus | border 同 hover 視覺(`outline-none focus-visible:border-primary-hover`,不加 ring / halo)| `--primary-hover` |
| **Disabled cursor** | `cursor-not-allowed` + hover 陰影關閉 | — |

### 為什麼 thumb 是**白底 + 邊框**,不是**實心 primary**

實心 primary thumb 會讓 thumb fill 與 range fill 使用同一 token → 失去位置辨識語意(特別是 range mode 兩個 thumb 與 primary range 共存時)。白底 + 邊框讓 thumb 與 range 視覺可區分——thumb 作為位置指示器,必須能從 range 中辨別。這是 Material 3 / iOS / Linear 的共同解法。

### 為什麼 Track 底色維持「灰色凹槽」身分,不跟 enabled state 變動

Track 的視覺角色是「可滑動範圍的凹槽底線」,語意不因 enabled / disabled 改變——rest `bg-secondary`(neutral-3)、disabled 退一階 `bg-muted`(neutral-2),都在最淡 subtle bg 層級、凹槽身分不變(disable 時 Range / Thumb border 同步降級 primary → border)。semantic token 優先、不直接引 primitive;**若覺得 track 在 white canvas 上太淡**,那是 `--secondary` / `--muted` 的系統級議題(Badge / Skeleton 一起調),不是在 Slider 裡用 primitive 繞過的理由。

### Range 色 ↔ Thumb border 色的綁定規則

Range 填滿色和 Thumb border 色**永遠是同一個 token**:

| State | Range bg | Thumb border | 共享 token |
|---|---|---|---|
| Rest | `bg-primary` | `border-primary` | `--primary` |
| Disabled | `bg-border` | `border-border` | `--border` |

**為什麼綁在一起**:thumb 是 range 的端點標記、border 是 range 的視覺延續(物理滑桿 handle 屬於軌道的 mental model;呈現見 principles `ThumbBindingRule`)。**強制規則**:改 Range 任一 state 色必同步 Thumb border,不許漂移。

### 為什麼 hover / active 用陰影不用色變

Slider 不是 button——它是「當前位置指示器」,底色不該動(動了會暗示是另一個狀態);「不用色變」指 thumb 底色與 range 填色;thumb border 仍有同色相變化:hover / focus 升 hover 階(淺一階 lift)、按壓拖曳深至 `primary-active`(2026-07-06 修語:原文「加深至 primary-hover」與 token 實際方向相反,見視覺規格表)。陰影(elevation)是世界級 slider 的標準 hover 語言:Material 3 的 state layer + elevation、iOS slider 的 scale + shadow、Linear 的 drop shadow。對齊 `elevation.spec.md` 的 `--elevation-100` / `--elevation-200`。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## API

```tsx
<Slider
  value={number[]}                 // controlled
  defaultValue={number[]}          // uncontrolled
  onValueChange={(value) => void}
  onValueCommit={(value) => void}  // 放開滑鼠時才觸發
  min={number}                     // 預設 0
  max={number}                     // 預設 100
  step={number}                    // 預設 1
  size="sm" | "md" | "lg"          // 預設 md(只影響容器外高)
  disabled={boolean}
  orientation="horizontal"         // 不支援 vertical(DS 尚無垂直變體;未來真有需求再擴充)
  minStepsBetweenThumbs={number}   // range mode 時兩個 thumb 的最小距離
/>
```

### Range mode(雙 thumb)

Radix Slider 原生支援多 thumb——只要 `value` / `defaultValue` 傳長度 > 1 的 array,就自動渲染對應數量的 thumb,range(填滿段)落在最小和最大 thumb 之間。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

```tsx
// 單值
<Slider defaultValue={[50]} />

// 範圍
<Slider defaultValue={[20, 80]} />
```

### 跟 Field 整合

```tsx
<Field>
  <FieldLabel>音量</FieldLabel>
  <Slider size="md" defaultValue={[60]} />
  <FieldDescription>拖曳調整音量大小</FieldDescription>
</Field>
```

`size` prop 必須跟 Field 內其他 field 元件(Input / Select / NumberInput)傳同一個 size,才能對齊 field-height。

---

## States

| State | 視覺 | 觸發 |
|---|---|---|
| Rest | track `bg-secondary`,range `bg-primary`,thumb `bg-on-emphasis + border-primary` | 預設 |
| Hover(thumb) | thumb border 升 hover 階 `primary-hover` + 加 `--elevation-100` 陰影 | 滑鼠 hover 在 thumb 上 |
| Active(拖曳中) | border 深一階 `primary-active` + 加 `--elevation-200` 陰影 | 按住拖曳 |
| Focus | thumb border 升 hover 階 `primary-hover`(跟 hover 同視覺,不加 ring / halo)| 鍵盤 Tab 聚焦 |
| Disabled | 灰階降級:range `bg-border`、thumb `border-border`(= range 同 token)、thumb bg 沉回 `bg-canvas`(不透明背景色)、`cursor-not-allowed`、hover 陰影關閉 | `disabled` prop 或 Field context disabled |

**Mode / readonly / dark mode / density** 詳見 `../Field/field-controls.spec.md`(Slider 作為 Field 家族整合時繼承其 canonical;semantic token 自動處理 dark mode,無需元件內特殊 handling)。

### Disabled 視覺階層(三階,不是四階)

`track(muted, n-2)< range = thumb border(border, n-5)< text(n-7+)`——Range 與 Thumb border 刻意同 token 不拆階(見綁定規則);thumb fill(rest 白 / disabled canvas)與 range fill 對比、位置由 range 長度段決定;text 永遠最上層。

### 為什麼 range disabled 用 `--border` 不用 `--fg-disabled`

`--fg-disabled` 是「disabled 文字前景」語意,拿來當 bg = fg token 混用當 bg 的 smell(偶然 work 只因 neutral-6 深度剛好)。`--border`(neutral-5)語意對(視覺分隔家族、非文字元素不借 fg)、可同時作 Thumb 的 border-color(綁定規則的前提)、與 fg-disabled 解耦。詳 `tokens/color/color.spec.md`「fg token 不可當 bg 用」節。

---

## Disabled 策略

**Slider 用灰階不用 opacity**。這是系統內重要的判準,反覆確認後的結論——系統有兩個 disabled 處理派別,Slider 屬於**灰階派**(跟 Button / Checkbox 同家族)。判準比「多色彩 vs 單色彩」更精準,是:

### 判準:**顏色是否是 semantic state 的唯一載體?**

| 元件 | 顏色的角色 | State 載體 | Disabled 策略 |
|---|---|---|---|
| **Switch** | `bg-primary` vs `bg-border` 是 on/off 的**唯一視覺差異**(track 和 thumb 形狀在 on/off 之間完全相同,只有顏色變)| **顏色本身就是 state** | **`opacity-disabled`** — 必須保留色彩身分,否則灰階後失去狀態區辨 |
| **Checkbox** | 勾了有 checkmark,沒勾沒 checkmark——**形狀**決定 state,顏色只是美學 | **形狀(checkmark)** | **灰階 swap**(`bg-disabled`)— 灰色框裡的 checkmark 仍清楚可辨 |
| **Button** | Primary 色是品牌美學,不是 state | — | **灰階 swap** |
| **Slider** | Range 藍色是「已選長度」的美學視覺,**位置 + 長度是 state**,顏色只是裝飾 | **位置(thumb)+ 長度(range 佔比)** | **灰階 swap** — 灰色 range 跟灰色 thumb 的位置/長度仍然完全可辨 |

### 論證摘要

Disabled slider 要傳達的兩件事——thumb 位置、range 長度——**完全不依賴顏色**(灰階後 x 座標與填滿佔比一模一樣),失去藍色零資訊損失,故走灰階派(同 Checkbox:state 由形狀 / 位置承載、顏色是裝飾)。Switch 是唯一 opacity 特例:on/off 無任何形狀差異、顏色本身就是 state,灰階會讓兩態無法區分——此 rationale 不適用 Slider。

### 為什麼 shadcn / Material 3 用 opacity 仍然不是理由

- **shadcn 的 Slider 用 `opacity-50`**:shadcn 追求「最短 code path」,不是「設計嚴謹」,它對所有 disabled 元件都 lazy-apply opacity。這是實作偷懶,不是 design decision。
- **Material 3 的 38% opacity 全局規則**:M3 是為 Android 生態系設計的,opacity-based disabled 能跟 Android 原生控件的視覺一致。我們的系統是 web,不受此約束,且 Button / Checkbox / Input 已經選了灰階路線,Slider 跟進對齊才是 system consistency 的正確解。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

### 常見錯誤(避免)

**不要把 thumb 的 disabled bg 改成 `bg-muted`**——`--muted` 和 `--bg-disabled` 在這個系統都等於 `var(--color-neutral-2)`,同一個顏色。Thumb `bg-muted` 會跟 track `bg-muted` 完全融色,只剩 border 可見,失去 thumb 形狀辨識(真實踩過的 bug)。Disabled 用 **`bg-canvas`**(不透明頁面背景色,與 track 的 muted 不同值且隔 n-5 邊框,不融色)。2026-06-12 補:rest 態原為 `bg-surface`,但 `--surface` 深色 = 8% 白半透明 → thumb 在深色變破洞且 track 穿透,故改 `bg-on-emphasis`(固定白不反轉)。

**不要同時套 opacity + 灰階 swap**——兩個策略互斥,同時用會導致「灰階 swap 後再打 opacity 一層」,視覺雙重降級,整個 slider 褪色過度。選一條路走到底。

### 無 Error state

Slider 沒有獨立的 error 視覺——拖曳選值本身不太會「無效」。如果業務邏輯需要限制範圍,用 `min` / `max` 直接限制使用者能拖到的範圍,不要讓他拖到再報錯。

### Readonly(僅 Field cascade,無獨立 prop)

Slider 無獨立 `readOnly` prop;但在 `<Field mode="readonly">` 內(2026-06-12 拍板)= **鎖互動、保留正常視覺**(pointer-events-none + thumb tabIndex=-1 + aria-readonly on thumb;值仍可讀、不降色——readonly ≠ disabled)。理由:readonly 表單中 Slider 的值(thumb 位置 + range 長度)本身就是 value 呈現。若要在非表單情境顯示「歷史值」,用純文字或另一個 display 元件。

---

## 鍵盤操作(Radix 原生,免手工)

- **Left / Right Arrow**:- / + `step`
- **Up / Down Arrow**:+ / - `step`(vertical-inverted 時相反)
- **PageUp / PageDown**:± `step × 10`(Radix 預設)
- **Home / End**:跳到 `min` / `max`
- **Tab**:在多個 thumb 間切換焦點(range mode)

無需額外實作,Radix Slider primitive 已經全部處理。

---

## 常見誤解

- 「Slider 可以當計數器」——錯。Slider 傳達 position(在哪裡),計數(多少)用 NumberInput ±step(見「何時不用」)
- 「兩個選項可以用 Range mode」——錯。Range 是連續值區間(value = [start, end]),二元 / 布林選擇用 Switch / SegmentedControl
- 「focus 要加 ring」——本元件 documented 例外:focus 用 border 加深(同 hover 視覺),不加 ring / halo(見「視覺規格」表)

---

## Do / Don't

✅ **Do**
- 用 Slider 選「連續」或「密集離散」的數值
- Range mode 用於範圍選取(價格、日期、分數)
- 搭配顯示值(thumb tooltip 或旁邊的 NumberInput 同步)讓使用者知道精確數字
- 用 Field 包裝時傳跟 siblings 同一個 `size`

❌ **Don't**
- 用 Slider 選離散少量選項(用 SegmentedControl / RadioGroup)
- 用 Slider 表達「多/少」的 boolean(用 Switch)
- 硬寫 thumb / track 尺寸——單一視覺規格,跟 size 無關
- 用實心 primary thumb(thumb fill 與 range fill 使用同一 token → 失去位置辨識語意)
- thumb hover-fill 切換色(破壞「這是位置指示器」的 mental model,hover 應透過陰影表達而非色變)
- 給 Slider 加 error 紅色——用 min/max 限制輸入範圍,不讓錯誤發生

---

## Inspector 用途

Inspector 提供 `min` / `max` / `step` / `defaultValue` × `size` 即時調整(track / thumb 視覺固定,只有容器外高隨 size 變);色彩綁定 / 鍵盤等 side-by-side 對照題由各 matrix story 覆蓋。對應 anatomy story:`Overview` + `Inspector` + `ColorMatrix` + `SizeMatrix` + `StateBehavior` + 元件特有 `ColorBindingRule` + `KeyboardMatrix` + `Accessibility`。

---

## 相關

- `../NumberInput/number-input.spec.md` — 精確數字輸入的對應元件
- `../SegmentedControl/segmented-control.spec.md` — 離散少量選項的對應元件
- `../../tokens/uiSize/uiSize.spec.md` — `field-height-*` token family
- `../../tokens/elevation/elevation.spec.md` — Elevation hover / active 語意
- `../../tokens/color/color.spec.md` — Primary / muted / fg-disabled token
- `../Field/field.spec.md` — Field 容器整合規則
- Radix Slider primitive API — `@radix-ui/react-slider`

## A11y 預設

**ARIA / Pattern**:繼承 Radix `slider` primitive a11y 預設(role / aria-* / 鍵盤導覽)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/slider#accessibility)。

**Keyboard 行為**:完整鍵盤對照見上方「鍵盤操作(Radix 原生,免手工)」節,不重複列。

**Focus**:Radix primitive 自管 focus / restoration;thumb 鍵盤聚焦時 `outline-none focus-visible:border-primary-hover`(border 升 hover 階,跟 hover 同視覺,不加 ring / halo)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `number-input.spec.md`
- `switch.spec.md`
