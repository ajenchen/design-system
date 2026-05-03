<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# LayoutSpace 設計原則

Layout Space 定義頁面與容器的巨觀間距 token,隨 density 自動縮放(透過 `data-density` 或 `data-layout-space`)。

## Token 表

| Token | md | lg | 語意 |
|-------|----|----|------|
| `--layout-space-loose` | 16px | 24px | 主間距:容器水平 padding、parallel 元素 gap、bounded region 呼吸空間 |
| `--layout-space-tight` | 12px | 16px | 緊湊間距:Header → element、functional 交互的元素之間 |
| `--layout-space-bottom` | 48px | 48px | 結論留白:內容到 action buttons(commitment 前視覺暫停)|

**為什麼 bottom 不隨 density 變**:48px 是「結論前的留白」— content 到 action buttons 的視覺暫停。跟 density 無關(不論 compact 或 comfortable,使用者都需要「commitment 前」的節奏)。

---

## 元件角色:`region` / `element`(scope-relative)

**沒有元件級固定分類** — 角色是元件在「該層 layout」裡扮演的,不是元件本質。CSS `display` 跟此分類**無關**(避免撞名,2026-04 從 v1 `block` / `inline` 改為 `region` / `element`)。

| 角色 | 定義 |
|------|------|
| **region** | 寬高占主要空間(寬度撐滿、高度通常 flex-1 撐剩餘)/ 視覺畫布 / 該層展示主角 |
| **element** | 局部塊 / 控件感 / 寬高自然 |

### region 子分類

| 子類 | 條件 | 視覺邏輯 |
|-----|------|---------|
| **bounded** | 有視覺邊界:底色 / 邊框 / 明確上下分隔線(Card / Table with borders / Panel with chrome)| 邊界清楚,容器靠 outer padding 給 spacing |
| **unbounded** | 無視覺邊界:純 vertical collection,**靠 list 自帶 py + item 自帶高度**撐起視覺平衡(Cmd+K menu / Sidebar nav / unstyled list)| 邊界由 list 自帶 py 完成,outer padding = 0 才視覺對稱 |

### 判斷 3 題(scope-relative)

每進一層 layout container 重新判斷該層的子元件:

1. 該層占主要空間嗎?(寬+高占主導 → region;局部 → element)
2. 視覺重量是「畫布」還是「控件」?
3. 是該層展示主角,還是一塊區段?

任何元件(list / table / code block / image / form section / chart / sidebar)都套同邏輯。例:
- Page body 直接放 Table → Table = bounded region(該層展示主角 + 有 borders)
- Cmd+K menu list → list = unbounded region(主角 + 無 chrome,自帶 py)
- InfoPanel 內 DescriptionList → element(只是一塊,不主導)
- Field 內 Textarea → 不獨立分類(Field 整體才是該層的 element)

### Region 數量 invariant(2026-04-30 codified)

**Container body(vertical stack)通常最多 1 個 region — 罕見會多**。理由:
- region 多為 `flex-1` 撐剩餘 → 兩個並存競爭 flex space
- Multi-functional-group 慣用 **list group 切分**(`item-anatomy.spec.md` group separator)或多個 element,不另增 region
- **Unbounded + bounded 並存違 scroll affordance**:unbounded 無邊界 vs 內部 scroll 必須 bounded chrome 讓 user 知道可捲

**多 region 慣用 horizontal layout**(left-right panes / grid columns,Sidebar + Main + InfoPanel)。Vertical 多 region 罕見場景 → 走規則 3 親疏判 + consumer compose。

---

## 親疏 3 級(替代 v1 簡單 block-adjacent)

判斷兩元素的 spacing 規則前,先確定它們屬哪一級:

| 級別 | 條件 | layout rule? |
|------|------|------------|
| **同範疇 / bundled component family** | 元件 spec 寫成 bundle 並定 inter-component spacing(FileUpload+FileList、Pagination 內部、Toolbar+ButtonGroup) | 元件 spec own,layout rule **跳過** |
| **跨範疇 + 直接 functional 交互 / 依賴** | search → filter list / heading → labeled content / toolbar → table / form section heading → fields | 規則 3 = **tight** |
| **跨範疇 + parallel / independent** | form fields stack(parallel inputs)/ unrelated sections / 兩個獨立 functional groups | 規則 3 = **loose** |

「**Bundled component family**」客觀判斷:**有沒有 spec 文件把這些 components 寫成 bundle 並定義它們之間 spacing**(不是「同種類 component instance 多個」)。

「**Functional 交互 / 依賴**」具體:操作後在畫面上有交互(value 驅動 display)/ labeling(命名 / 描述 group identity)/ context dependency。

---

## 6 條 Layout 規則

### 規則 1:水平 padding(3 patterns 並存)

| Pattern | padding 寫哪 | 適用場景 |
|---------|------------|---------|
| **A. 元件自帶**(`px-loose` on root) | 元件 root | 有視覺邊界(border / bg / shadow / chrome):Sidebar / SurfaceHeader / Toolbar / Card / Panel |
| **B. 父層管**(consumer 或 wrapper) | 父層 div | 純 layout primitive 無邊界:Table / DescriptionList / DataTable(naked structure)|
| **C. Item 自帶**(each item `px-loose`,list naked)| 每個 item | List with hover row,hover bg 需 flush 容器邊界:Cmd+K menu / DropdownMenu items / Sidebar nav |

任何內容左右 padding 最終 = `loose`(對齊 inline 元件邊緣);**寫哪看元件本質**,不是 either-or。

Pattern C 的視覺邏輯見 `overlay-surface.spec.md`「Hover bg 貼邊 chrome」(hover bg 0 gutter 貼邊 + content 由 item-px 推進)。

### 規則 2:頂部(Header → 第一個元素)

| 第一個元素 | Header → 該元素 |
|-----------|--------------|
| **bounded region**(table / card / panel)| `loose` |
| **unbounded region**(自帶 py 的 list / nav stack)| **0**(讓 list 自帶 py 撐 spacing) |
| **element**(input / button / alert) | `tight` |

### 規則 3:元素間 gap(**只看親疏,role 無關**)

| 親疏 | gap |
|------|-----|
| **同範疇 / bundled** | 元件 spec own(跳此 rule)|
| **跨範疇 + functional 交互** | `tight` |
| **跨範疇 + parallel** | `loose` |

**核心**:gap 只看親疏不看 role(原 v1「block-adjacent 一律 tight」過機械,違 Gestalt proximity)。

世界級對齊:Material 3 / Polaris / Apple HIG / Atlassian 都按「relationship not type」決定 spacing。

### 規則 4:底部 — 拆兩個 distinct 概念

**核心**:**「內容 → action button 前留白」跟「元件 → 容器底邊」是兩個不同 spacing 概念**,不可混為一談。

| 情境 | gap | 概念 |
|------|-----|------|
| **任何最後內容 → action button**(inline / in SurfaceFooter / in chrome footer 內)| `bottom`(48)| **A. Commitment 前留白** — user 跨到決策 moment |
| **bounded region → 容器底**(後無 action buttons) | `loose` | **B. Spatial 邊界** |
| **unbounded region → 容器底**(後無 action buttons) | **0**(list 自帶 py 撐)| **B. Spatial 邊界** |
| **element → 容器底**(後無 action buttons) | `tight` | **B. Spatial 邊界** |

**Note**:Dialog body `pb-bottom 48` 是 line 1 的實作(預期後接 SurfaceFooter buttons,universal 套 48,**不是元件特例**)。「**底部 chrome band**」(Alert / BulkActionBar / Status bar / Footer)內含 action → 套 48;不含 → 套 loose(line 2)。

### 規則 5:橫排 Input Gap(固定不隨 density)

橫排並列的 input fields **固定 gap,不走 layout-space token**:

| 關聯性 | Gap | 範例 |
|---|---|---|
| 緊密相關(同一組值的起迄)| `gap-2`(8) | Sleep start ↔ Sleep end |
| 非緊密(不同組值並列)| `gap-4`(16) | Sleep 時段 ↔ Work 時段 |

**為什麼固定**:這是 field 級 micro-spacing,跟容器級 macro-spacing 是不同維度。Field gap 由**內容語意**決定(緊密 vs 獨立),不由 density 決定。

### 規則 6:Chrome 水平左右 padding(規則 1 specialization)

**所有 chrome 表面**(SurfaceHeader / SurfaceFooter / SurfaceBody / Sidebar header / FileViewer toolbar+filmstrip+InfoPanel header / app top bar / page header)**水平左右** padding 統一 `px-[var(--layout-space-loose)]`(md=16 / lg=24,density-aware)。

**為何 loose 而非 tight**:Chrome 是 surface 視覺邊界 + 內容呼吸區;`tight` 足夠 inline list item,chrome 需更穩定 anchor 讓 title / dismiss / actions 不貼邊。

**M8 8 家世界級對照**(default density 共識 16px):Material 3 Top App Bar 16dp / Carbon UI Shell 16px / Polaris Page Header 16px / Atlassian Page Header 16px / Apple HIG macOS Toolbar 16-20pt / Linear / Notion / GitHub Primer / Figma 全 16px。

**禁止**:硬寫 `px-4` / 自創值(`px-5`)/ 用 tight 當 chrome inline / 同 surface header/body/footer inline padding 不一致(三層左邊界必對齊)。

---

## 心智模型(三步推理 + 具體 self-questions)

### Step 1 — 判角色(對單一元素)

問 3 題:
1. 在該層 layout 占主導(寬度撐滿 + 高度 flex-1)嗎?
2. 視覺重量是「畫布」(占據 layout)還是「控件」(局部塊)?
3. 是該層展示主角(主導內容)嗎?

多數 yes → **region**;反之 → **element**。

若 region 再問 1 題:有視覺邊界(底色 / 邊框 / 上下分隔線)嗎?
- 有 → **bounded**(Card / Table with borders / Panel)
- 無 → **unbounded**(menu list / nav stack,自帶 py 撐)

### Step 2 — 判範疇(對兩元素之間)

問 2 題:
1. 兩元素在 spec.md 裡寫成 bundle 並定 spacing 嗎?(eg FileUpload+FileList / Pagination 內部 / button-group + SurfaceFooter)
   - **是 → 同範疇 / bundled** → 跳 layout rule,套元件 spec own
   - 否 → 跨範疇,進下一題
2. 兩元素有直接 functional 交互 / 依賴(操作驅動 / labeling / context dependency)嗎?
   - **是 → 相關**(search→list / heading→content / toolbar→table)→ tight
   - **否 → 不相關**(parallel / independent)→ loose

### Step 3 — 套規則(下節決策表 + walkthrough 範例)

---

## 套規則決策表(具體查詢)

「我要決定什麼?」找對應規則:

| 想決定的 | 走哪條規則 | 看哪些變數 | 答案分支 |
|---------|----------|----------|---------|
| 容器水平左右 padding | **規則 1** | 元件有無視覺邊界? | 有 → A 元件自帶 `px-loose` / 無 → B 父層管 / list-with-hover-row → C item 自帶 |
| Header → 第一個元素 gap | **規則 2** | 第一個元素 role | bounded region → `loose` / unbounded region → **0**(list 自帶 py 撐)/ element → `tight` |
| 兩元素之間 gap | **規則 3** | 親疏 | 同範疇 → 元件 spec own(跳)/ 跨範疇相關 → `tight` / 跨範疇 parallel → `loose` |
| 最後內容 → 容器底 | **規則 4** | (a) 後接 action button?(b) 元件 role | 後接 action → `bottom`(48,概念 A commitment 前留白)/ 否則看 role:bounded → `loose` / unbounded → **0** / element → `tight`(概念 B spatial 邊界)|
| 橫排並列 input 之間 gap | **規則 5** | 內容語意緊密度 | 同組值起迄 → `gap-2`(8) / 不同組並列 → `gap-4`(16) |
| Chrome 表面水平 padding | **規則 6** | (永遠) | `loose` |

---

## 具體推導 walkthrough(6 範例)

### 範例 1:Dialog 內 form fields stack(Field A ↔ Field B)

- **走規則**:規則 3(兩元素之間 gap)
- **判親疏**:
  - bundled?(在元件 spec 裡寫成 bundle 嗎?) → **否**(consumer-composed)→ 跨範疇
  - functional 交互?A 不驅動 B,parallel siblings → **不相關**
- **答**:`loose`(16/24)— 對齊 Material / Polaris / Apple HIG / Atlassian 共識

### 範例 2:Cmd+K menu 中 search input ↔ result list

- **走規則**:規則 3
- **判親疏**:
  - bundled?Input + list 不在同 spec bundle → 跨範疇
  - functional 交互?search value 驅動 list filter → **相關**
- **答**:`tight`(12/16)

### 範例 3:Header chrome → InfoPanel 內第一個 Field(說明)

- **走規則**:規則 2(Header → 第一個元素)
- **判 role**:Field = element(局部塊 / 控件感)
- **答**:`tight`(12/16)

### 範例 4:Cmd+K menu list 最後 row → menu 容器底

- **走規則**:規則 4
- **判**:後接 action button?**否** → 看 role:menu list = unbounded region(主導 + 自帶 py 撐)
- **答**:**0**(概念 B spatial 邊界,list 自帶 py 撐)

### 範例 5:Dialog body 最後 field → body 底

- **走規則**:規則 4
- **判**:後接 action button(在 SurfaceFooter 內)?**是** → 套 `bottom 48`
- **答**:48(概念 A commitment 前留白)。`dialog.tsx:203` body 預設 `pb-bottom` 是此規則的實作(預期 body 後接 SurfaceFooter buttons),非 Dialog 例外

### 範例 6:SurfaceFooter 內 [Cancel] ↔ [Save] gap

- **走範疇判**(在規則 3 之前):
  - bundled?**是**(`button-group.spec` + `overlay-surface.spec` 都自帶 button arrangement canonical = `gap-2`/8px)
  - → 同範疇 / bundled 第一級,**layoutSpace 一般規則跳過**
- **答**:`gap-2`(8)— 由 `button-group.tsx:51` / `overlay-surface.tsx:92`(SurfaceFooter)自帶 canonical own

**注意**:規則 5「橫排並列」**只**適用 input fields(line 102 明文),不套 button group。Button spacing 屬 bundled-family canonical,不走 layoutSpace 一般 rule。

---

## 典型容器範例

### Form 情境(Field stack 在 Dialog 內)

```
┌────────────────────────────────────┐
│  Title                        [X]  │  ← SurfaceHeader (chrome, py-tight)
├────────────────────────────────────┤
│← tight ─────────────────────────→ │  ← Header → element (規則 2)
│  ← loose → [Name input]   ← loose →│
│← loose gap ─────────────────────→ │  ← 跨範疇 parallel form fields (規則 3 不相關)
│  ← loose → [Description]  ← loose →│
│← loose ─────────────────────────→ │
│  ← loose → [Other field]  ← loose →│
│← bottom 48 ────────────────────→  │  ← 最後內容 → action buttons (規則 4 line 1, 概念 A)
├────────────────────────────────────┤  ← SurfaceFooter border-t
│  ← loose → [Cancel] [Save] ← loose →│  ← Footer (chrome, py-tight)
└────────────────────────────────────┘
```

### Page 情境(全頁 list / dashboard)

```
┌────────────────────────────────────┐
│ ← loose → [Toolbar items] ← loose →│  ← Toolbar(自帶 py-tight,跨範疇 functional → table 規則 3 tight)
│╔══════════════════════════════════╗│
│║← loose → DataTable       ← loose →║│  ← bounded region(規則 1 內 px = loose)
│╚══════════════════════════════════╝│
│← loose ─────────────────────────→  │  ← bounded region → 底部 chrome band(規則 4)
│ ← loose → [Alert hint]    ← loose →│  ← 底部 chrome band
│ ← loose → [BulkActionBar] ← loose →│
└────────────────────────────────────┘
```

---

## 模式切換

```html
<html data-density="md">
```

```ts
document.documentElement.setAttribute('data-density', 'lg')
```

單獨控制版面間距而不影響元件尺寸:

```ts
document.documentElement.setAttribute('data-layout-space', 'lg')
```

---

## Notes

- **不抽 universal LayoutBody / FormLayout primitive**:world-class(Material / Polaris / Atlassian / Carbon / Mantine)都「每元件 own variant + 共享 token」;規則 1-6 universal,角色 scope-relative 易誤封裝。獨特 chrome 已在 `overlay-surface.spec.md` + `action-bar.spec.md`
- **List-as-region in overlay body**(2026-05-01 canonical):當 Dialog / Sheet / Popover body 內容 = unbounded list-as-region(menu / Cmd+K / nav)時,consumer 用 className override 撤掉 chrome padding(`<DialogBody className="!px-0 !pt-0 !pb-0">`)+ 自管 list outer wrapper(`<div className="py-2">`)+ item 自帶 `px-loose rounded-md`。**不做成 body variant**(`flush?: boolean`)— Material/Atlassian/Mantine/shadcn 都 consumer 自管,Polaris flush API scope 極窄;variant 不解決底層脆弱(加 1 row search/banner 就破功),反把 1 surface decision 拆兩 API。詳 `overlay-surface.spec.md`「List-as-region in overlay body」+ `dialog.tsx:165` JSDoc
- **v1 → v6**(2026-04-30):block-adjacent 機械 → 親疏判 + bundled-family 分權 + region 二分(bounded/unbounded)+ 多 region 限制。詳 git + memory `feedback_layout_v6_canonical.md`

---

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護。

- `description-list.spec.md`
- `empty.spec.md`
- `overlay-surface.spec.md`
- `dialog.spec.md`
- `file-viewer.spec.md`

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `uiSize.spec.md`
