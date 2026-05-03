---
component: Switch
family: 4
variants: {}
sizes:
  sm:
    when: "form field-height 28 / compact chrome / dialog / panel context"
  md:
    when: "default general UI"
  lg:
    when: "touch / prominent CTA / stakeholder-facing surface"
traits:
  - hasSizes
  - hasInteractiveStates
  - isSelectionSingle
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Switch 設計原則

## 定位

Switch 是**即時套用的布林開關**——切換即生效，心智模型是「實體開關」（牆上 light switch、iPhone settings 開關）。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：基於 Radix Switch（shadcn 包裝）+ 橋接 DS token。

---

## 何時用

- **系統設定類 toggle**：Bluetooth / Wi-Fi / 飛航模式 / Dark mode / Push 通知
- **即時功能開關**：is_public / is_featured（admin 即時切換）、自動儲存 on/off
- **獨立 inline control**：切換即生效，旁邊沒有 submit / cancel button 流程
- **物理開關類比**：使用者心智模型是「我現在要打開 / 關閉這個功能」

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| Form 內的布林欄位（隨 submit 生效）| `Checkbox` | 見下「與 Checkbox 的分界」 |
| 同意條款 / 隱私政策 | `Checkbox` | 條款是「勾選送出才成立」的書面行為，不是物理開關 |
| 多選（複選多個選項）| `Checkbox` stack | Switch 是單一布林，多選用 Checkbox |
| 三態或更多（enum）| `RadioGroup` / `SegmentedControl` | Switch 只有 on/off |
| 有進度的動作（「正在開啟中」）| `Button` with loading state | Switch 是瞬時切換，不承載進度 |

---

## 與 Checkbox 的分界

**兩者都是布林 on/off，判斷核心是「套用時機」與「心智模型」**。

**完整對照 SSOT 在 `../Checkbox/checkbox.spec.md`「與 Switch 的分界」段落**——Checkbox 是此比較的 owner（包含三個判斷角度 + 9 項情境對照表）。

簡言：
- **Form 內、有 submit 流程、使用者可反悔** → `Checkbox`
- **獨立 inline、切換即生效、無 submit** → `Switch`

---

## 結構

```
Track（pill 形，rounded-full）
  └─ Thumb（白色圓 + 2px border + check icon when ON）
```

- Track 寬 = 2 × 高（pill 比例）
- Thumb 直徑 = track 高度
- ON 狀態 thumb 右滑 `translateX(trackHeight)`

---

## 尺寸

| Size | Track | Thumb | 白色圓 | Check icon | 配對 field |
|------|-------|-------|-------|-----------|-----------|
| sm / md（預設）| 20 × 40 | 20 | 16 | 12 | field sm / md |
| lg | 24 × 48 | 24 | 20 | 16 | field lg |

sm 和 md 視覺相同（純粹命名 mapping，讓消費者可直接傳同一個 size 對齊 Field family）。

### 為什麼不完全對齊 `--field-height-*`

- **現況**:track 高 sm/md=20px / lg=24px(不等於 `--field-height-sm/md/lg` = 28/32/36px);track 寬固定 2× 高(pill 比例);thumb 直徑 = track 高
- **Rationale**:Switch 是**實體開關類比**(iOS / macOS 系統開關),track 是 pill 形不是 field-like 容器;高度**小於 field-height** 才符合「嵌在一列中的小控件」的語意。放大到 field-height(28/32/36)會破壞 pill 比例(canonical 2:1),視覺語意從 toggle 降級為 generic action button,且失去「可滑動凹槽」的空間 affordance。行高對齊透過 `<Field>` 容器的 `flex items-center` 垂直置中達成
- **世界級對照**:iOS `UISwitch` = 32×20pt(獨立 pill 比例,不跟 form field 成比例)/ Material 3 Switch = 52×32dp / GitHub Primer ToggleSwitch = 40×24——全部 pill 比例 2:1、獨立於 field-height

---

## 視覺狀態

| 狀態 | Track | Thumb | Check icon |
|------|-------|-------|-----------|
| OFF | `bg-border`（neutral-5） | 白色無 border | 無 |
| ON | `bg-primary` | 白色 + 2px primary border | primary check |
| Disabled | 套 `opacity-disabled`（整體透明度降級） | 同 ON/OFF | 同 ON/OFF |
| Readonly | 視覺同一般態 | 但 `pointer-events-none` + `aria-readonly` | — |

### Disabled 用 `opacity`

**不用灰階 swap**——這是 Switch 的**特例**,跟 Checkbox / Button / Slider 的灰階策略不同。

**理由**：Switch 的 on/off 視覺差異**唯一載體是顏色**（track `bg-primary` vs `bg-border`）——track 和 thumb 在 on/off 之間形狀完全相同，只有顏色變。若用灰階 swap（把 primary 換成 border），disabled 的 ON 跟 OFF 會合併成同一視覺態,使用者無法分辨當前狀態(螢幕閱讀器只能靠 `aria-checked` 區分)。

**對照**：
- Checkbox disabled 可以灰階 swap——checkmark 形狀承載 state，顏色只是裝飾
- Slider disabled 可以灰階 swap——thumb 位置和 range 長度承載 state
- Switch disabled **必須保留顏色**——沒有形狀差異，灰階後 state 失傳

詳細對照見 `../Slider/slider.spec.md`「Disabled 策略」節。

### Readonly vs Disabled

| | Readonly | Disabled |
|---|---|---|
| 視覺 | 正常顏色（可讀） | 降透明度（弱化） |
| 互動 | 不可切換（pointer-events-none） | 不可切換（cursor-not-allowed） |
| aria | `aria-readonly` | `disabled` |
| Tab 焦點 | 不在 tab order | 不在 tab order |
| 用途 | 表單 readonly 呈現、DataTable cell 非編輯態 | 外部條件造成不可操作 |

---

## label / description 整合

Switch 可透過 `label` / `description` props 內部直接渲染緊鄰文字：

```tsx
<Switch label="啟用通知" description="收到新訊息時提醒" />
```

在 `<Field>` context 內時 label / description prop 自動忽略（由 FieldLabel / FieldDescription 接管），避免雙層 label。

### Horizontal Field 自動齊右(2026-04-20)

在 `<Field orientation="horizontal">` 內 Switch 自動 `ml-auto`(control area 是 `flex items-center`,Switch 被推到最右邊),**不需要 consumer 傳 className**。這對齊 iOS Settings / macOS System Settings / GitHub Settings / Figma preferences 的 canonical:**toggle 永遠齊右,label 左對齊、固定寬度**——視覺掃描快、列與列對齊一致。

視覺上等同於 horizontal `<DescriptionItem>`(label 左 / value 右 `justify-between`)——同一個心智模型:**label 描述、trailing slot 呈現狀態**(value 或 toggle)。

**同一畫面多個 horizontal Switch Field → 必搭配 `FieldGroup horizontalLabelWidth={...}`**:否則每個 label 會被內容撐到不同寬度,Switch 左邊緣不對齊,整排參差不齊(世界級 UI 通病,Settings 類型畫面特別明顯)。見 `../Field/field.spec.md`「FieldGroup horizontalLabelWidth cascade」。

### 對齊情境:Settings list vs Form edit(2026-04-20)

世界級對照 Switch 在 horizontal layout 有**兩種**對齊慣例,由 **context 決定**:

| Context | 對齊 | 世界級對照 |
|---------|------|-----------|
| **Settings list**(獨立每項 row,一項一個偏好,即時生效,無 submit) | **齊右** | macOS System Settings / iOS Settings / GitHub Settings / Linear Settings |
| **Form edit**(多欄位混合 control,使用者 submit 才生效) | **緊跟 label / 與其他 control 對齊** | Ant Design Form layout=horizontal / Material Form / Polaris Form |

**判斷法**:這個頁面有 submit button 嗎?
- **有** → form → Switch 本來就不是 canonical(該用 Checkbox,見上「與 Checkbox 的分界」)—— 若硬要用 Switch 代替 submit-flow Checkbox,需 consumer 明確不 ml-auto。
- **無** → settings list → **auto ml-auto 齊右 canonical**(本元件 2026-04-20 行為)

本 DS 的 `auto ml-auto` 邏輯是**為 settings list 最佳化**。若 consumer 把 Switch 放 submit form 並想「緊跟 label」,需自行在 `<Switch className="ml-0">` 覆寫——但更推薦重新考慮是不是該用 Checkbox。

> **記住**:在 form 內 + Switch 緊跟 label 的覆寫寫法是 **`<Switch className="ml-0" />`**。這是**目前唯一**需要 consumer 明示 override 的 Switch 行為(其他 layout 都 auto)。但 99% 情境使用者應該先問「是不是該用 Checkbox」——Switch 即時生效的心智模型跟 submit form 本來就衝突。

---

## 禁止事項

- ❌ 用 Switch 做 form 內的同意 / 勾選——「我同意條款」是書面成立行為，用 Checkbox
- ❌ 把 Switch 當三態使用（例：「on / off / auto」）——用 RadioGroup / SegmentedControl
- ❌ 對 disabled 狀態用灰階 swap 而非 opacity——會讓 on/off 視覺無法區分（見「Disabled 用 opacity」段）
- ❌ Switch 的 on/off 顯示「正在處理中」進度——用 Button + loading state
- ❌ 直接改動 track 顏色承載額外語意（例如 error 時改紅）——Switch 是單純布林，錯誤訊息放外部 help text

---

## 為何無 Inspector / ColorMatrix

- **無 Inspector**:Switch 決策維度只有 `size`(sm / md / lg)× `checked`(ON / OFF)× `disabled` / `readonly`——已由 `SizeMatrix` / `StateBehavior`(四 state + disabled 策略 + readonly) / `LabelIntegration`(Field 整合)三張 story 完整覆蓋。互動 Inspector 切 checked 只是重複 StateBehavior 的 ON / OFF 對照——Switch 是二元元件,互動試玩對教學價值低。
- **無 ColorMatrix**:Switch 只有一套色彩——ON 用 `bg-primary`(track) + `bg-surface`(thumb),OFF 用 `bg-muted`(track) + `bg-surface`(thumb),無 variant / hue 變體。狀態色完全內嵌在 `StateBehavior` story(ON / OFF / disabled 的 track bg + thumb 綁定)。重寫 ColorMatrix = 複製 StateBehavior 內容。

對應 anatomy story:保留 `Overview` + `SizeMatrix` + `StateBehavior` + 元件特有 `LabelIntegration`(Field 包裝後的 label/description 管理)。

---

## 相關

- `../Checkbox/checkbox.spec.md` — **與 Switch 的分界 SSOT owner**（套用時機、心智模型、情境對照）
- `../Slider/slider.spec.md` — Disabled 策略對照（為什麼 Switch 用 opacity 而 Slider 用灰階）
- `../Field/field.spec.md` — Switch 作為 Field control 的整合（label/description 由 Field 接管）
- `../Field/field-controls.spec.md` — Field Control 共用規則
- `../Button/button.spec.md` — `pressed` 狀態的 toggle button（非單純布林，有 label/icon 的情況改用 pressed Button）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `combobox.spec.md`
- `radio-group.spec.md`
- `select.spec.md`
