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

**理由**：Switch 的 on/off 視覺差異**唯一載體是顏色**（track `bg-primary` vs `bg-border`）——track 和 thumb 在 on/off 之間形狀完全相同，只有顏色變。若用灰階 swap（把 primary 換成 border），disabled 的 ON 和 OFF 會看起來一模一樣，使用者無法分辨當前狀態。

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
