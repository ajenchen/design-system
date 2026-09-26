---
component: FileItem
family: 2
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
benchmark:
  - Ant Design Upload (file list): github.com/ant-design/ant-design/tree/master/components/upload
  - Polaris Thumbnail: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Thumbnail
  - shadcn Attachment (2026-06 chat 套件): ui.shadcn.com/docs/components/attachment
---


# FileItem 設計原則

**檔案上傳列表項目**——顯示檔案名稱、上傳進度、狀態（uploading / completed / error）。

**實作基礎**：組合元件——Icon + Text + ProgressBar + Button，無 external primitive base。

**Layout Family**：本元件是 `patterns/element-anatomy/item-anatomy.spec.md` 所擁有的 **Family 2（List item layout）** 消費者。結構繼承其「List item layout」章節,兩 mode 皆採 scanning-mode 規格（見下「Typography」段:FileItem 固定傳 ItemContent `mode="scanning"`）。FileItem 在 rich mode 用 avatar 作 item boundary。

**命名 rationale**：`compact / rich` 表達精簡 vs 完整內容呈現。不叫 `lg/sm`——兩者是資訊量不同的展示策略，不是同一結構的尺寸縮放。

---

## 何時用

- **檔案上傳清單**：drag-drop upload、multiple file selector 的選中檔案列表
- **附件展示**：email / comment / ticket 的附件列表（rich mode 顯示縮圖 + 檔名）
- **批次處理進度**：CSV / JSON 匯入的逐檔進度追蹤（compact mode，預設）
- **上傳錯誤回報**：顯示哪些檔案失敗 + 重試按鈕

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 只是顯示已上傳檔名（純連結）| `LinkInput` / plain `<a>` | FileItem 承載 upload 狀態，靜態連結不需要 |
| 下載進度（不是上傳）| 自訂 download 元件 | FileItem 專為 upload 流程設計，下載有不同 UX（瀏覽器原生）|
| 照片 / 影片 gallery | Grid / Carousel | Gallery 需要預覽 grid 佈局，FileItem 是 list 單行 |
| 資料夾階層 | `TreeView` | FileItem 是平面列表，階層用 tree |

---

## Mode

| Mode | Prefix | Typography | 適用場景 |
|---|---|---|---|
| `compact`（預設） | Paperclip icon 16px | 掃描模式 | 批次上傳的一般檔案（CSV、JSON） |
| `rich` | Avatar 48px square(固定) | 掃描模式(兩 mode 統一,見下「為什麼兩 mode 都 scanning」) | 需要縮圖預覽的檔案（圖片、文件） |

compact 為預設——多數 upload 清單是「快速掃視多檔」場景，只有需要縮圖預覽才升級為 rich。

## Typography（兩 mode 都 scanning typography · 2026-04-23 user 指示）

**兩 mode 統一 scanning typography**(row 帶 `leading-compact`,對齊 MenuItem / Steps 的 Family 1 scanning idiom):

| | compact | rich |
|---|---|---|
| label | text-body (14px) + `leading-compact` (1.3) | text-body (14px) + `leading-compact` (1.3) |
| description | text-caption (12px) + `leading-compact` | text-caption (12px) + `leading-compact` |
| ItemContent `mode` | `"scanning"` | `"scanning"` |
| Gap token | `--item-gap-label-desc-scanning` | `--item-gap-label-desc-scanning` |

**為什麼兩 mode 都 scanning**:FileItem 是檔案列表 row — 使用者需快速掃視多檔(Gmail attachment / Google Drive 清單),掃描 typography 視覺緊湊符合語義。Rich mode 保留 Avatar 48 thumbnail 作視覺引導,但文字層採 scanning idiom。

## 結構(2026-04-23 修正對齊 item-anatomy canonical)

### 共通 layout invariants(兩 mode 都遵守)

| 間距 | 值 | 來源 canonical |
|------|-----|--------------|
| **Label ↔ Description gap** | `--item-gap-label-desc-scanning`(2px,scanning mode)— FileItem 走 scanning typography(掃視密集列表) | `patterns/element-anatomy/item-anatomy.spec.md`「Label ↔ Desc 間距 / 4 token 矩陣」+ primitive `<ItemContent mode="scanning">` |
| **Content ↔ ProgressBar gap** | `gap-2`(8px) | 兩 mode 一致(compact 用 py-2 + absolute 自然達成;rich 用 explicit flex-col gap-2) |
| **Suffix 高度**(小 suffix,icons ≤24) | `h-[1lh]` + items-center inline 對齊 label 第一行 | `patterns/element-anatomy/item-anatomy.spec.md`「24px 閾值對齊規則」 |

### compact（預設）

```
[📎]  [ label
       ↓ --item-gap-label-desc-scanning (2px,scanning mode md)
       desc?        ] [suffix h-[1lh]]
      [ ██████████░░ ] ← 底部 progress bar(absolute,content 與 bar ≈ 8px gap)
```

### rich（完整呈現）

```
[Avatar 48 square    [ label ─────────────────── ↑ label top = avatar top
 固定,top-align       ↓ --item-gap-label-desc-scanning (2px,scanning mode md)
 作視覺引導]           desc                        ]  [suffix h-[1lh]]
                      ↓ 自動填滿餘空間(min 8px gap)
                     [ ██████████░░ ] ────────── ↓ bar bottom = avatar bottom(1-line 時)
```

### Rich layout invariant(2026-04-23 user 校準)

**1-line desc 時**:
- Content col `minHeight = AVATAR_SIZE (48)` + `justify-between` + `gap-2`
- **label 頂 = avatar 頂**(row `items-start`)
- **progress bar 底 = avatar 底**(minHeight + justify-between 的剩餘空間分配)
- 中間 gap 自動填(label+desc+bar 總高 < 48 時,剩餘空間成為 gap,至少 `gap-2`=8px)

**multi-line desc 時**:
- Content 自然高度超過 avatar 48
- Progress bar 溢出 avatar 底(正常語義:內容撐長了)
- **desc ↔ progress bar 保持 8px min gap**(`gap-2` 強制)

**無 progress bar 時**:`justify-center` 取代 `justify-between`,content 垂直置中對齊 avatar 中心。

### Rich Avatar 對齊的明文例外(上游 item-anatomy 24px 規則的例外)

item-anatomy「> 24 prefix + 有 desc」規則要求 prefix 對齊 content 塊**中心**(items-center)。
FileItem rich **刻意不遵守**這條,使用 `items-start`(top-align),原因:

> **當 FileItem rich 被放在「檔案上傳管理 box」等 tight-stack 情境**(`surface=upload-manager` 無邊框、縮圖與縮圖相距 `--layout-space-tight` 12px 緊貼時,見「List wrapper canonical」),avatar 作為**每個 item 的視覺邊界引導**——若 avatar 中心對齊,連續 item 的 avatar 會失去「每筆檔案一個 thumbnail」的視覺節奏。top-align 讓 avatar 明確標示每個 item 的起點。

### Avatar 尺寸(固定 48px)

Avatar **固定 48px square**,不隨 content 高度變化。content(label + desc + bar)可自然 > 48(2-line desc 時)或 < 48(無 desc + 無 bar 時),avatar 始終 48。

## Padding

| Mode × surface | 規則 |
|---|---|
| compact(`surface=form` 預設) | `px-3 py-2`(FileItem 無 size prop,不走 `ROW_PADDING_BY_SIZE` 公式;`gap-2` 對齊 item-anatomy row) |
| compact(`surface=upload-manager`) | **左右 = 列自帶 `--layout-space-loose`**;上 `tight/2`、下 `tight/2 + 0.5rem`(0.5rem = 原 `py-2` 的下緣:文字↔bar 6 + bar 2),bar 離列底 `tight/2`。**2026-09-25 待辦總帳 B12 推翻 06-03 的「`px-0`、左右交給面板」**:可點的列滑過底色要鋪到面板左右邊,gutter 只能由列自己帶(見下方「item 與容器分工」) |
| rich(`surface=form` 預設) | `px-3 py-3` border card(py 固定,高度由 avatar 決定不走 row 公式)|
| rich(`surface=upload-manager`) | **左右 = 列自帶 `--layout-space-loose`、上下各 `tight/2`**(列高 = avatar 48 + tight)。06-03 的 `px-0 py-0` 同樣由 B12 推翻;上下補 `tight/2` 是為了滑過底色不貼縮圖(AI 推導) |

**item 與容器分工**:判準是「誰負責左右 gutter」(`../../patterns/overlay-surface/overlay-surface.spec.md`「底部區域:按鈕列 vs 列式」)—— 列有整列滑過底色、要鋪到容器邊時,gutter 由列自己帶、容器給 0(`surface=upload-manager`);form 的列不鋪到容器邊,內距如上表。**`surface=upload-manager` 浮層面板(容器)的 padding / 列間 gap → 見「List wrapper canonical」的「upload-manager 浮層面板 composition」段**(SSOT 不在此重述,避免 drift)。

## 邊框 / 背景(AR15-21 canonical,2026-04-21 · 2026-04-22 擴充)

**容器視覺由 `mode` × `surface` 決定**（2026-06-03 加 surface 維度，codify rich-borderless）。`surface` prop：`form`（預設）/ `upload-manager`。

| Mode × surface | 容器視覺 | Rationale |
|------|---------|-----------|
| **rich + `surface=form`**（預設，表單/訊息附件）| `border border-divider rounded-md bg-surface` | Rich = 「檔案 card」自立輪廓——Slack / Notion / Linear attachment 慣例；邊框讓每 row 視覺獨立 |
| **rich + `surface=upload-manager`**（Google Drive / Dropbox 背景上傳 box）| **無邊框 + 無 bg + 直角**(2026-09-25 B12 起列鋪滿面板寬,圓角碰到面板直邊會缺角,AI 推導;縮圖切角是 Avatar `shape="square"` 自己的圓角,不靠列);avatar 作每筆 item 視覺邊界 | box 自身已是容器 → card border 多餘＝雙層容器；avatar thumbnail 提供「每筆檔案」邊界節奏。2026-06-03 codify（原僅 L116 旁註「consumer 自己移除 border」，現 `surface` prop 機械化）|
| **compact + 有 status**（uploading / error / upload-manager completed，有 progress bar）| 無背景、無邊框,只靠 progress bar 提供 affordance | 「正在發生」/「剛發生」的動態 narrative,progress 本身就是視覺焦點 |
| **compact + 無 progress**(form attachment 靜態態) | `bg-secondary rounded-md`(= neutral-3 色) | 靜態清單(form / 訊息附件)背景色區隔出「檔案 row」邊界,跟純文字內容區分。**為何 `bg-secondary` 不 `bg-neutral-3`**:`--secondary` 是 semantic token 經 `@theme inline` 橋接成合法 Tailwind utility,`--color-neutral-3` 是 primitive token(僅 `:root` CSS var)不生成 utility,寫 `bg-neutral-3` 會 silent 失效。對齊 Badge low / ProgressBar track SSOT(同色) |

### 滑過(2026-09-25,待辦總帳 B12;取代 2026-04-23「FileItem 永不顯示 hover-bg」)

**只有點了會有反應(傳了 `onClick`)的 FileItem 才有滑過底色;沒傳就沒有。** user 原話:「要點了會有反應的才加，並確保加上去之後不會有任何視覺奇怪的地方，且按鈕的互動樣式也是自然疊加上去吧？用再亮一層這樣的措辭是否不夠精準？」換上什麼色依平常底色配對,規則住在 `../../tokens/color/color.spec.md`「Hover 換色配對總則」,本表只列 FileItem 的對應:

| 型態 | 平常底色 | 有 `onClick` 時滑過 |
|---|---|---|
| rich `surface=form`(卡片) | `bg-surface`(「底」) | 底不換,疊一層 `hover:bg-interaction-hover` |
| compact 無 status(小膠囊) | `bg-secondary` | 換成自己的下一階 `hover:bg-secondary-hover` |
| compact 有 status、`surface=upload-manager` 的兩 mode | 透明 | 換成 `hover:bg-neutral-hover`;upload-manager 的列鋪滿面板寬(見「Padding」) |

- **沒有 `onClick` 的不加**:上傳管理器裡只會在滑過時把 ✓ 換成下載鈕、點列本身沒反應的列也不加(待辦總帳 A3 → B12)—— 換位照舊,只有那顆鈕有自己的滑過色。
- **列內按鈕**(刪除、下載、重試)滑過時換上自己的 `--neutral-hover`(半透明),疊在列的滑過色上,不寫特例;規則在 `color.spec.md`「巢狀滑過」段。
- **不加按住那一階**:FileItem「按下深一階」是待辦總帳 N4 / F 模型 D3(2),尚未提問(AI 推導:不先替 user 決定)。
- **撤回的舊理由**(「三型態皆常駐錨點,加底色 = 雙重強調」):有框、有常駐底色的附件卡可點時照樣換底色 —— [shadcn Attachment](https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4/registry/bases/radix/ui/attachment.tsx#L9)(`has-[>a,>button]:hover:bg-muted/50`,放了整卡觸發層才換);不可點的清單列不加滑過層 —— [Material Web list item](https://github.com/material-components/material-web/blob/cbd34a8921915af94d5ef65c2a69eece41d5b4f3/list/internal/listitem/list-item.ts#L161-L169)(`type="text"` 不渲染 ripple)。舊對照表(Slack / Notion / Figma / Gmail)沒有任何來源,一併撤回。不可點也上色的另一派([Ant Design Upload 文字清單](https://github.com/ant-design/ant-design/blob/4f9fe53933922d69f89bcd79de9de87b5124f522/components/upload/style/list.ts#L20-L32))與上面 user 原話不符,不採用。

**❌ 反例**:
- Rich `surface=form` 無邊框 → 失去 card 自立輪廓,與一般 list item 無法區分,跟 MenuItem 混淆(`surface=upload-manager` 例外:面板自身是容器 + avatar 作邊界,rich 刻意無邊框,見上表)
- Compact mode 靜態 item 無 bg → 純文字列,使用者不知這是「可點下載的檔案」
- 外層 list wrapper 加邊框 / `overflow-hidden` → 雙重邊框(list 邊框 + item card 邊框)視覺干擾;並強制邊框相黏破壞 card 自立性(2026-04-22 user 糾正)

---

## 可下載狀態 canonical(2 use case)

**核心區分**:同一個 FileItem,依**所在 surface** 分 2 種使用場景,各有 prop signature + 視覺節奏。唯一詞彙 = `surface` prop(`form` / `upload-manager`),以下兩節即其兩值。**一句話差別:`upload-manager` 完成後保留狀態(管理上傳是重點)/ `form` 完成後清除狀態變靜態附件。進度條兩者上傳中都會顯示(`progressBar` 只看 `status` 不看 `surface`,見 `file-item.tsx`)。**

### `surface="upload-manager"` — 上傳管理面板(Google Drive / Dropbox 右下角類)

**語意**:管理檔案上傳的 UI —— **上傳狀態是重點,完成後仍保留 progress + status narrative**(不清除),使用者回顧「這檔剛上傳完成」。裝在獨立浮層面板(非 dropzone)。

| 屬性 | 值 |
|------|---|
| `status` | `uploading` / `error` / `completed`(**completed 持續保留不清除** = 此情境精髓) |
| Progress bar | 隨 status 顯示;completed = 100% 完成條(不隱藏) |
| Status icon | uploading 無 / completed 綠 ✓ / error 紅 ✗ |
| hover 行為 | **status slot hover-swap**:✓ → Download ↓(icon button)觸發 `onDownload`;有 `onClick` 的列另有整列滑過底色(透明 → `neutral-hover`,鋪到面板左右邊),沒有 `onClick` 的列不上色(見「滑過」段) |
| Row-click | optional `onClick` 讓整 row 可點 → 預設 FileViewer 開啟;可與 hover-swap 並存 |
| Rich 容器 | **無邊框 + 無 bg**(面板自身是容器,avatar 作 item 邊界)。**2026-06-03 修正:原寫「border card 永遠」與 surface=upload-manager 無邊框矛盾** |
| Compact 容器 | 無 bg(progress bar 提供 affordance) |
| 刪除按鈕 | optional(業務權限) |

```tsx
<FileItem
  mode="rich"
  surface="upload-manager"
  name="report.pdf"
  status="completed"
  onDownload={() => download(id)}
  actions={<Button size="xs" iconOnly variant="text" startIcon={Trash2} onClick={del} aria-label="刪除" />}
/>
```

### `surface="form"`(預設)— 表單 / 訊息附件

**語意**:檔案是「已存在的附件」。**上傳中會顯示進度**(`status="uploading"`,暫時),**完成後 consumer 清掉 status → 變靜態**(無 bar、無 icon),不再是 upload 動作延續。

| 屬性 | 值 |
|------|---|
| `status` | 上傳中暫時 `uploading` / `error`;**靜態態 `undefined`**(清除) |
| Progress bar | 上傳中顯示;靜態態無 |
| Status icon | 同上 |
| hover 行為 | 有 `onClick` 時 `cursor-pointer` + 滑過底色(卡片疊一層 / 小膠囊 `secondary-hover` / 有進度條的列 `neutral-hover`,見「滑過」段);沒有 `onClick` 不上色 |
| Row-click | **`onClick` 為主要 affordance** → **預設 FileViewer 開啟**(consumer 決定,也可下載) |
| Rich 容器 | `border card`(永遠) |
| Compact 容器 | 靜態態 `bg-secondary`(灰底區隔「這是檔案 row」;= `--color-neutral-3` semantic 橋接名,見邊框 / 背景章節);上傳中有 bar 時無灰底 |
| 刪除按鈕 | optional(業務權限) |

```tsx
<FileItem
  mode="compact"
  name="report.pdf"
  description="2.3 MB"
  onClick={() => openViewer(id)}
  actions={hasDeletePermission ? <Button size="xs" iconOnly variant="text" startIcon={Trash2} onClick={del} aria-label="刪除" /> : undefined}
/>
```

**選用判斷**:
- 管理上傳、完成後仍要看狀態 → `surface="upload-manager"`
- 檔案進駐表單 / 留言 / 既有資料(完成後靜態)→ `surface="form"`(預設)

### Description ReactNode 可含 clickable 元素

Description 是 ReactNode,**不限純文字**。常見場景:
- Error 描述含 "View log" 需可點 → 用 `<a className="underline">View log</a>` 或 inline Button:

```tsx
<FileItem
  mode="compact"
  name="backup-failed.json"
  status="error"
  description={
    <>
      Network timeout.{' '}
      <a href="#logs" className="underline">View log</a>
    </>
  }
  onRetry={noop}
/>
```

連結**沿用錯誤訊息的字色**、平常就有底線,**滑過不換色**(user 2026-09-26 選「乙 紅字 + 底線，滑過不變」)。底線是整句紅字裡唯一標出「這段可點」的訊號;滑過不必有變化(`../../ds-canonical/references/hit-area-canonical.md` 已同意的原則:點得到的地方不一定要有滑過變化)。**不可**寫 `hover:text-error-hover`:`--error-hover` 是紅色填色 `--error` 的配對,套在紅字上淺色會變淡(對比 7.2 → 3.3)、深色與 `--error-text` 同一格而完全不變。世界級同款:Polaris 放在 Banner 裡的 Link 自動 monochrome —— 「Makes the link color the same as the current text color and adds an underline」,平常與滑過都是 `color:inherit`([Link.out.css @13.9.5](https://cdn.jsdelivr.net/npm/@shopify/polaris@13.9.5/build/esnext/components/Link/Link.out.css))。顏色規則的例外寫在 `../../tokens/color/color.spec.md`「不該用 `--{hue}-text` 的場景」。

### 不可混用 invariants

**Invariant 1 — rich 跟 compact 不可混用**:
同一 list 內**只能一種 mode**。rich 是「檔案 card」視覺語言(border + avatar + 完整 metadata),compact 是「掃視密集列表」視覺語言(paperclip + filename),兩者並排會:
- 高度差異過大(rich ~72px / compact ~36px)破壞 row rhythm
- Avatar vs paperclip prefix 視覺語言衝突
- consumer 要混用代表情境定位不清 —— 選一種

**Invariant 2 — completed-保留 跟 靜態-無 status 不共存**:
upload-manager 的 completed(100% bar + ✓)屬「剛完成的 upload session」視覺;form 靜態(無 bar / status=undefined)屬「已存 attachment」視覺 —— 業務語義互斥。表單情境完成後 consumer 把 item 清掉 status 轉靜態,不會同時顯示「completed with bar」+「無 bar」。

**合法 mixed 情境**(email 草稿 / 多步驟 upload flow):同一 form list 內「上傳中」(`status="uploading"`/`error`,顯示進度)+「已存附件」(無 status,靜態)— 只在 **compact mode 內**。

---

## List wrapper canonical(多 item 間距)

**規則:gap 由「item 視覺密度」決定** —— rich form(有邊框 card)`gap-2`(8px,邊框不相黏);compact form `gap-1`(4px);`surface=upload-manager`(兩 mode)`gap-0`,列間距改由列自帶的上下 `tight/2` 相加(2026-09-25 B12)。

| Mode × surface | List wrapper gap | Rationale |
|------|----------------|-----------|
| **Rich + `surface=form`**(border card)| `gap-2`(8px) | card 邊框不相黏(standalone card invariant) |
| **`surface=upload-manager`**(rich + compact,無邊框浮層面板)| `gap-0` | 縮圖↔縮圖、bar↔下一列文字仍是 tight(12px):**2026-06-03 圖五 user 校準的 12px**(rich 初版誤設 4px 後校正)不變,只是從「列間 gap」改由兩列各自的上下 `tight/2` 相加得出 —— 可點的列滑過底色上下相接,不在兩列之間留一條沒上色的縫(B12,AI 推導) |
| **Compact + `surface=form`** | `gap-1`(4px) | 統一 — 有 status only / 無 status only / mixed 都 gap-1(2026-04-23 user 指示簡化:原條件式「全上傳中 → 0 gap」是 consumer 心智負擔 + state 轉換時 fragile,故捨棄 0-gap)|

**control→list gap(FileUpload 內建 list 消費)**:dropzone / button 控制項 ↔ 第一個 FileItem 的間距 = **同上 form gap 同值**(rich card 8px / compact bg-pill 4px),由 `file-upload.tsx` 依 `fileListMode` 套用。**FileUpload 內建 list 一律 `surface=form`**(dropzone 是表單上傳框,非獨立浮層 upload manager),故不套用下方 upload-manager 的 12px / 面板 padding。

### upload-manager 浮層面板 composition(Google Drive 右下角類獨立面板,**非** FileUpload dropzone)

`surface=upload-manager` 的 FileItem list 裝在獨立浮層面板(header + 列表);左右 gutter 由列自己帶、面板 body 給 0,上下由列與 body 各給一半(2026-09-25 B12):

- **它是 popover-class 浮層 surface,但不是 Radix `<Popover>`**(常駐面板:不靠 trigger 開、不 outside-click 關、用 chevron 收合非 X dismiss)→ **不包 `<Popover>`**,而是直接消費 overlay-surface 三件套 primitive。
- **殼 + header + body 全消費 overlay-surface SSOT(禁手刻)**:
  - 殼:消費 Popover-class surface contract(border / radius / elevation / raised surface)，但保持 persistent panel 語意；確切 utility 由對應 story / component source 擁有。
  - header:`<SurfaceHeader className={cn("justify-between", COMPACT_HEADER_SLOT)}>` + `<PopoverTitle>`(輕量浮層 header SSOT,slot 走 `COMPACT_HEADER_SLOT`=21 衍生自 text-body title;padding = px-loose py-tight + border-b + unbounded-slot 負 my trick)。
  - body:**`<SurfaceBody className="flex flex-col gap-0 !px-0 !py-[calc(var(--layout-space-tight)/2)]">`**(body SSOT 的 flex-1 scroll 鏈照用,padding 用 className override,見下)。左右 0 是「列式」(同 `../../patterns/overlay-surface/overlay-surface.spec.md`「誰負責左右 gutter」);它**仍不是**「List-as-region」—— 那個判定還要求上下也撤掉、清單外層自帶 `py-2`,owner 在同檔「List-as-region in overlay body」,本檔不複述。**scroll(consumer 注意)**:SurfaceBody 的 `flex-1 / overflow-y-auto` 只在 shell 有 `max-h` + `overflow-hidden` 時生效;常駐面板若檔案數可超 viewport,shell 須加 `max-h`(對齊 overlay-surface.spec.md「viewport-aware scroll」),demo 短內容不需。
  - **禁手刻**:header / body 必直接消費 overlay-surface primitives；另建等價 wrapper 會形成第二份 spacing 與 surface authority。Hook `check_story_invariants.sh R9` 機械攔截。

- **左右**:body `!px-0`,列自帶 `--layout-space-loose`(16px)→ item 內容左緣仍對齊 header 標題(x 與 06-03 相同),可點列的滑過底色則鋪到面板左右邊(`overlay-surface.spec.md` M11 state walk 三題:底色邊 = chrome 邊、內容對齊標題、內容離底色邊 ≥ loose)。**推翻 2026-06-03「左右交給面板」**:那時列沒有滑過底色;B12 後可點的列有了,底色若只到內容邊會貼著縮圖與文字(同檔「❌ 禁止:Item `px=0` 讓 content 直接觸 hover bg 邊」)。
- **上下:目標不變 = 邊緣到 item「ink」(可見內容)、ink 到 ink 都是 `var(--layout-space-tight)`(12px)**,通則仍是「容器該側 padding = 12 − item 在該側自己的留白(ink inset)」。B12 後兩 mode 的列上下各自帶 `tight/2`(compact 的 bar 離列底 `tight/2`,見「Padding」)→ body 上下都給 `tight/2`、列間 gap 0,兩 mode 同一個 body 寫法;06-03 compact 的 `!pt-1` 上下不對稱(因 bar 貼列底)隨之取消。**為何用 `!`(important)**:沿用 List-as-region `!px-0` 與 06-03 `!pt-1` 的寫法 —— 覆寫的勝負不依賴 twMerge 對 arbitrary 值的分組判斷,也不依賴 Tailwind stylesheet 的生成順序。
- **列間 gap**:套在 SurfaceBody className;值見上方「List wrapper canonical」gap 表(SSOT,不在此重述)。
- Demo:`file-item.stories.tsx` 的 `UploadManagerSurface`(rich)/ `UploadManagerCompactSurface`(compact)。

**Rich + Compact 不可混用**(見 Invariant 1 上方),故無「混用 gap」決策。

### List wrapper 本身不加視覺

**規則**(2026-04-22 user 直指):FileItem 各自 own 視覺(rich card / compact bg),list wrapper 只負責垂直排列 + gap。**不應該有外框**(無 `border` / 無 `rounded-*` / 無 `overflow-hidden`)— 否則:
- FileItem rich 自帶 card,list 再加外框 → 雙重 card
- 強制邊框合併(user 2026-04-22 指出的 `border rounded-lg overflow-hidden` 反例)

```tsx
// ✅ Rich list
<div className="flex flex-col gap-2">
  {files.map(f => <FileItem key={f.id} mode="rich" {...f} />)}
</div>

// ✅ Compact 一律 gap-1(無 status / 有 status / mixed 上傳中+已存附件 都同此 wrapper,見上表)
<div className="flex flex-col gap-1">
  {files.map(f => <FileItem key={f.id} mode="compact" status={f.isUploading ? 'uploading' : undefined} {...f} />)}
</div>

// ❌ 反例:list 加外框 + overflow-hidden(雙重 card / 強制邊框相黏)
<div className="flex flex-col border rounded-lg overflow-hidden">
  {files.map(f => <FileItem key={f.id} mode="rich" {...f} />)}
</div>
```

**Clickable → 下載 / 預覽 canonical**(AR15):
- FileItem 提供 `onClick` prop,consumer 傳入即進 clickable 模式：滑鼠保留整列 hit area；鍵盤透過同層透明 native button 以 Tab / Enter / Space 觸發，並以 `actionAriaLabel`（預設「開啟 {name}」）命名。row 本身不加互動 role，避免包住 trailing actions 形成 nested-interactive。
- 兩種 surface 都可以用 `onClick`(upload-manager 可跟 `onDownload` hover-swap 並存)
- consumer 決定具體行為(download / FileViewer),元件只提供 row 可點擊能力
- **為什麼是「列不互動 + 覆蓋控件」而不是「列自己是 button」**:因為本元件的列裡裝了必須被輔助科技讀到的結構——`ProgressBar`(自帶 `role="progressbar"`)、`Avatar`、以及 hover-swap 的 `<Button>`;依 `../../patterns/element-anatomy/item-anatomy.spec.md`「整列可點時,誰當那顆控件」表,這是**第二類**。Sidebar 的列只有文字與圖示,走**第一類**(列自己就是 `<button>`)。判準與規範逐字出處在該表,本檔不重述。

## ProgressBar

**SSOT**:FileItem 不自 roll bar,消費 `../ProgressBar/progress-bar.spec.md` 元件(Radix Progress 包裝 + 本 DS token)。避免視覺漂移。

| 屬性 | 值 | 依據 |
|---|---|---|
| 消費元件 | `<ProgressBar status={...} value={...} className={compact ? '!h-0.5' : undefined} />` | 本 DS ProgressBar SSOT(公開 API 固定 4px；compact 2px 是 FileItem 私有 composition styling，不形成 ProgressBar size API) |
| status 映射 | `uploading → inProgress` / `completed → success` / `error → error` | ProgressBar `status` 原生支援 |
| height 映射 | `compact → 2px` / `rich → 4px`(預設) | compact mode 極密集 row layout 需要更細 track;rich mode 走 DS 預設 4px |
| value | `status === 'completed' ? 100 : progress` | completed 永遠 100% |

改動進度條視覺(高度 / 色 / 動畫) → 去 ProgressBar 改,**本元件無本地 bar 實作**。

### 焦點框 × 貼著列底的進度條(2026-09-26)

**適用範圍**:只有 `surface="form"` 的 compact 列、而且有 `status`(進度條貼列底)。這種列拿到鍵盤焦點時(本元件的整列焦點框,或 FileUpload 清單列的焦點框),往內 2px 的焦點框底邊與 2px 的進度條落在同一條線上。`upload-manager` 的進度條離列底 `tight/2`、rich 的進度條在內容區,都碰不到框,不適用本段。

**問題(實測)**:進度條本來就畫在框的**上面**,但它沒有把框蓋住 —— 軌道 `--secondary` 是半透明(淺色 6% 黑、深色 12% 白),框的藍從軌道透出來;填色 `--info` 又與框 `--ring` 同為 blue-6。聚焦時填色對軌道只剩 1.10:1(深色 1.17:1),平常是 4.55:1(深色 4.04:1);填色與框黏成一條,看不出進度從哪裡開始、到哪裡。

**規則**:進度條留在框的上面(user 2026-09-26 選的方向,逐字:「我喜歡墊在鍵盤焦點上的方向，依此方向仔細研究怎樣最好」),框在**進度條那一段挖空**,連同進度條兩端各多挖 2px 的縫(挖空與縫寬是 AI 研究後的建議,user 同日回「我覺得方向可以，確保整個設計符合我們一致的設計語言且不違背世界級的設計就照你建議」)。聚焦時底邊讀起來是「框|縫|進度條|縫|框」。

- **挖空,不是墊底色**:挖掉的地方露出的是真正在後面的東西(列自己的滑過色、卡片、面板、頁面),所以聚焦時進度條的每個像素與平常相同,任何底色上都對。墊一塊固定底色(例如 `--canvas`)只在那一種底上對:深色卡片上軌道會從平常的 `#383838` 變成 `#272727`;列正被滑過時也會少掉滑過色。改用「容器宣告自己底色」的變數也不行 —— 深色的 `--surface` 本身是白 8% 半透明,卡片放在浮層面板裡時真正的底是「面板 + 白 8%」,變數表達不了疊了幾層(實測軌道 `#383838` 對平常 `#4a4a4a`)。與 `../Avatar/avatar.spec.md`「頭像堆疊」選挖空、不畫外圈是同一個理由。
- **縫 = `--stack-gap`(2px)**:與全域外描邊離元件的間隙、頭像堆疊的縫、步驟條外圈的縫同一個 token —— DS 把「疊在一起的兩樣東西分開」的縫都是它(`tokens/uiSize/uiSize.css`;設計理由住 `../Avatar/avatar.spec.md`「頭像堆疊」段,2026-09-26 抽成 token 前是 6 處字面值)。縫讓同色的藍分開:進度的起點(填色左端)與框的底邊之間隔著一道底色,不再黏成一條;進度條右端與框之間同樣留縫,兩端對稱。
- **世界級對照**(一手原始碼,釘版本):同色的兩樣東西相鄰時,用一道底色的縫分開 —— Material 的線性進度條在填色與軌道之間留 4dp 的縫(MDC-Android 1.14.0 `app:indicatorTrackGapSize`:「size of the gap between the indicator and the track, 4dp by default」,[ProgressIndicator.md#L317-L325](https://github.com/material-components/material-components-android/blob/1.14.0/docs/components/ProgressIndicator.md#L317-L325)),而且那道縫是**不畫**,軌道從填色尾端加上縫之後才開始畫([DeterminateDrawable.java#L373-L391](https://github.com/material-components/material-components-android/blob/1.14.0/lib/java/com/google/android/material/progressindicator/DeterminateDrawable.java#L373-L391))—— 與本段的挖空同一種做法。IBM Carbon 的按鈕焦點框與主色填色同藍時,中間墊一道 `$background` 內線(`inset 0 0 0 $button-border-width $background`,[button/_mixins.scss#L133-L137 @v11.117.0](https://github.com/carbon-design-system/carbon/blob/v11.117.0/packages/styles/scss/components/button/_mixins.scss#L133-L137));那是固定底色 token,本段不採用固定底色的理由見上一條。
- **怎麼做到**:框改畫在與列同形同大的 `::before`「框圖層」上(`FILE_ITEM_RING_LAYER_CLASS`),遮罩只挖這一層(`fileItemRingCutoutStyle`,位置與進度條同源 —— 都讀 `compactBarInset`)。框若畫在列本身,列是進度條的祖先,遮罩會連進度條一起挖掉。線寬、顏色、往內 2px、圓角全部照舊是 `focus-ring-inset`,不是第四種幾何(`ds-canonical/references/focus-canonical.md`「框怎麼畫」框圖層列)。FileUpload 的清單列用同一個框圖層與同一個遮罩(`../FileUpload/file-upload.spec.md`「A11y 預設 › 檔案清單鍵盤」)。
- **代價(寫明)**:框的底邊在進度條那一段(含兩端縫)不畫,框在那一段由進度條本身接上;框的上、左、右三邊與底邊兩端(含圓角)完整。這是「進度條留在框上面」這個方向本身的代價,不是實作取捨。
- **平常的樣子一個像素都不動**:框圖層只在聚焦時有東西可畫,遮罩也只作用在這一層;進度條的位置、顏色、高度都不變(user 2026-09-26:「我他媽不想要動到這邊的一般視覺」)。
- 不走的其他改法(逐條對應的規則):聚焦時把填色換成別的顏色 → `focus-canonical.md`「一個項目只有一個指示器」且狀態色被改掉;框往內多退 → 同檔「只准三種幾何」禁手寫其他退距;聚焦時把進度條抬離框 → 不是 user 選的方向。

## Actions（suffix,row dedicated region canonical）

Consumer 自行組合。按 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate」+「Row action 絕對值 cap」,**row dedicated action 絕對值 cap = ≤ 24px,不隨 row tier 放大**。依 row 高度分兩種實作:

**兩 mode 統一(2026-04-23 canonical)**:rich + compact 都用 **Button iconOnly `size="xs"`**(24 固定,≤ cap):

| Mode | 實作 | 尺寸 |
|------|------|------|
| `rich` | **Button iconOnly `size="xs"`**(24 固定,不隨 row 放大) | 24 |
| `compact` | **Button iconOnly `size="xs"`**(同 rich;靠 suffix wrapper `[&>[data-unbounded]]:my-[calc((1lh-var(--field-height-xs))/2)]` trick 把 24 footprint 收斂到 1lh,不撐高 row,視覺與命中區仍 24) | 24 |

```tsx
// Rich + Compact 統一 → Button xs iconOnly 固定 24(≤ 24 cap)
<FileItem actions={
  <Button size="xs" iconOnly variant="text" startIcon={Trash2} aria-label="刪除" onClick={del} />
} />
```

**為什麼 row action 固定 Button xs(24)**:row 放大不代表 action 要放大；row 高度變化只影響資料 padding 與 content，utility action 維持固定的輔助權重。compact row 雖矮,但 Button 24 透過 suffix wrapper 的 data-unbounded margin trick 收斂到 1lh footprint(同 chrome SurfaceHeader dismiss canonical),不會填滿 row。

**Trash/Delete 不是 dismiss 語意**:`dismiss` 嚴格保留給「X close overlay session」(Dialog / Sheet / Popover / Alert close X)。Row 的 Trash/Delete 語意是 `onRemove`(從集合移除一個 item,見 `.claude/rules/ui-development.md`「元件 Props 命名」「onRemove」),**不套 Button `dismiss` prop**:Button `variant="text"` 預設 icon 已是 fg-muted → foreground,hover 弱化視覺自然呈現(兩 mode 同)。

參見 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate」+「Real case 表」+「Row action 絕對值 cap」。

## Status ↔ Action hover-swap（passive → active affordance）

**世界級 UX pattern**（Gmail / Slack / Dropbox 附件 convention）:status 預設是 passive 狀態標記(綠 ✓ / 紅 ✗),使用者 hover 整個 row 時,**狀態 icon 自動換成「相應的操作」**,click 即觸發:

| status | Passive icon | Hover 換成 | Consumer handler |
|--------|-------------|-----------|------------------|
| `completed` | `CircleCheck` 綠 ✓ | `Download ↓` | `onDownload` |
| `error` | `XCircle` 紅 ✗ | `RotateCw ⟲` | `onRetry` |
| `uploading` | *(progress %)* | *(無 swap)* | — |

**幾何一致性(2026-04-23 統一 canonical · row action ≤ 24 cap)**:status slot 容器大小 **= consumer 的 delete action 尺寸**,兩 mode 統一:
- `mode="rich"` → `var(--field-height-xs)`(24 固定,與 Button xs iconOnly 同)
- `mode="compact"` → `var(--field-height-xs)`(24,同 rich;compact 靠 status slot wrapper 的 `[&>[data-unbounded]]:my-[calc((1lh-var(--field-height-xs))/2)]` 把 24 footprint 收斂到 1lh,不撐高 row,視覺與命中區仍 24 —— 命中 ≡ 可視,owner = `ds-canonical/references/hit-area-canonical.md`;2026-09-24 把本檔兩處原文的「touch target」正名為命中區,本 DS 以滑鼠指標的精度為前提,尺寸不以觸控門檻推導)

Passive status icon 置中於 action-sized 容器,hover 時 active action 填滿同一容器。這讓 flex gap token 測量的是**兩個同尺寸 action slot 之間的真實 gap**,不被 hover bg overflow 吃掉——status slot 尺寸 = 同 size delete slot,gap token 才能如實呈現;歷史 bug 細節見 `.claude/skills/design-system-audit/references/historical-bugs.md`。

世界級 DS 的幾何鐵律:**同一 flex 列的互動元素必須有統一 box 尺寸**,gap token 才能如實呈現。

**Backward compat**:consumer 若沒傳 `onDownload` / `onRetry`,status icon 永遠保持 passive(不響應 hover)——既有使用者無感。

**為什麼值得這麼做**:
- passive 階段清楚告知使用者檔案狀態(✓ / ✗ 顏色強訊號)
- hover 階段立即提供相應行動(completed → 下載 / error → 重試),不需另外挪位置做按鈕
- 符合「改一處看多處」的 design system primitive 思維:passive + active 共用 slot,不讓使用者多認一處

```tsx
<FileItem
  mode="rich"
  name="report.pdf"
  status="completed"
  onDownload={() => downloadFile(id)}   // hover ✓ → ↓;error 場景同理:onRetry → hover ✗ → ⟲
  actions={<Button size="xs" iconOnly variant="text" startIcon={Trash2} onClick={del} aria-label="刪除" />}
/>
```

## Suffix 24px 閾值

兩 mode 統一:suffix 最大元素 = Button xs = 24px ≤ 24px(小 suffix)→ `h-[1lh]` inline,不因 desc wrap 改公式(對齊 item-anatomy「24px 閾值對齊規則」)。

| Mode | 最大 suffix 元素 | alignment |
|---|---|---|
| compact（預設） | Button xs = 24px ≤ 24px | `h-[1lh]` inline |
| rich | Button xs = 24px ≤ 24px | `h-[1lh]` inline |

## A11y 預設

- **ProgressBar 整合(進度 context 帶檔名)**:消費的 `<ProgressBar>` 自帶 `role="progressbar"` + `aria-valuenow` / `aria-valuemax`(Radix Progress primitive 提供),本元件再傳 `aria-label={檔名 上傳進度}` 作 context;keyboard 不需 focus progress bar(被動指示器,非互動元素)。
- **Action button labels**:Download / retry / remove 等 inline action 必傳 `aria-label`(中文 / consumer locale)— 「下載 report.pdf」/「重試上傳」/「移除附件」,單純「下載」/「刪除」缺檔名 context SR user 無法區分多 row。
- **Status icon hover-swap a11y**:hover-swap 不改變 SR 語意 — passive status icon `aria-hidden`,active action button 自帶 `aria-label`,避免 SR user 收到視覺 swap 噪音。
- **Row primary action 鍵盤可達且不 nested-interactive**:傳 `onClick` 時，row 保持非互動容器並保留整列 pointer hit area；另渲染與 trailing actions 同層的透明 full-row native button（pointer-events none，只承接 Tab / Enter / Space），focus-visible 的框畫在 row 上(往內畫的內描邊;form 的 compact 列有 `status` 時畫在 row 的 `::before` 框圖層、進度條那段挖空,見「焦點框 × 貼著列底的進度條」)。**為什麼是內描邊,理由是結構性的**:拿到焦點的是那顆 `opacity-0` 的透明整列 button,它自己畫不出框,所以指示器改畫在 row 上 —— 這正是 `ds-canonical/references/focus-canonical.md` 認可的「指示器畫在別的元素上,而且必須指得出承擔者」形狀,承擔者就是 row。而全域外描邊只作用在「被聚焦的那個元素」身上,套不到非焦點的 row;能掛在 row 上的只有 `focus-ring-inset` 與填色專用的 `focus-ring-inset-emphasis`,row 不是主色填色 → `focus-ring-inset`。**不是**因為四周淨空(表單的列間 4–8px;上傳管理器的列 2026-09-25 起鋪滿面板、列間 0 —— 兩種幾何都一樣用內描邊),**也不是**因為捲動容器會裁切(捲動與否明文不進判準)。幾何 SSOT = `ds-canonical/references/focus-canonical.md`「框怎麼畫」。`actionAriaLabel` 預設「開啟 {name}」且可由 consumer 覆寫。Primary button 與下載／重試／移除皆為 sibling，禁止把 row 本身改成 `role="button"` 包住互動後代。
- **status / error 不額外加 row ARIA**:`status="uploading"` / `status="error"` 不在 row 上加 `aria-busy` / `role="status"` / `aria-live`;狀態由 progress bar 的 `role="progressbar"` 與 description 文字本身傳達。若 consumer 需要上傳完成 / 失敗的即時 announce,由外層上傳流程容器(FileUpload)統一管理 live region,避免每列各自宣告造成 SR 噪音。

---

## 與 FileUpload 的分界

| 元件 | 職責 | 場景 |
|------|------|------|
| **FileItem** | 單一檔案 row primitive — 顯示一個檔案的 name / status / progress / actions | List 內的單筆 / detail / preview / message attachment |
| **FileUpload** | Dropzone + file list orchestrator — 拖放區 + 多 FileItem 排列 + 上傳狀態管理 | 完整上傳流程入口 |
| **FileViewer** | 檔案內容預覽 overlay — FileItem `onClick` 的預設開啟目標 | 點 row 後的檔案全幅預覽 |

**判斷**:

- **完整上傳流程**(drag-drop / validate / list multiple files)→ 用 `FileUpload`(內部消費多個 `FileItem`)
- **單一檔案展示 / preview**(message bubble 附件 / detail page header / FileViewer 觸發點)→ 直接用 `FileItem`
- **Form attachment field**(留言區附件、ticket attachments)→ 視場景:有上傳行為走 `FileUpload`,只展示既有附件走 `FileItem` list(`surface="form"` 靜態)

**簡單記**:**有 dropzone 用 FileUpload,沒 dropzone 用 FileItem**。FileItem 不應自帶 dropzone(會跟 FileUpload 重複職責)。

---

## 禁止事項

- ❌ **不用 FileItem 做 generic list row**(menu / settings 列表 / nav)→ 改 `MenuItem`。FileItem prefix(paperclip / Avatar 48 thumbnail)、status pattern(uploading / error)、ProgressBar slot 都是檔案專屬語義,套到 generic row 會視覺 / 語意誤導。
- ❌ **不用 FileItem 做 selection picker**(選檔案、選 template)→ 改 `Combobox` / `Select` / `Listbox`。FileItem 設計是「展示已存在的檔案 row」,不是「從候選池挑一個」;hover / selected state 與 picker 語義不對齊。
- ❌ **不在 FileItem 內塞自組 ProgressBar**(`<div className="bg-primary h-1" style={{width: `${progress}%`}} />`)→ 必消費內建 `<ProgressBar>` SSOT。自組會視覺漂移(高度 / 動畫 / status 色不一致)+ 失去 a11y attributes。
- ❌ **不混用 rich + compact 在同一 list**(詳「Invariant 1」)— 高度差破壞 row rhythm,prefix 視覺語言衝突。
- ❌ **不用 FileItem 做下載進度**(瀏覽器原生下載 UX 已足夠)— FileItem 為 upload narrative 設計,download progress 走自訂元件。

**常見誤解**:FileItem 一律有 / 一律沒有滑過底色 → 都不對,有 `onClick`(點了會有反應)才有(見「滑過」段);status 會染整 row 底色 → 只升階 progress bar / status icon / description(見「Inspector 與矩陣的教學分工」);`surface` 影響進度條 → 進度條只看 `status`(見「可下載狀態 canonical」)。

---

## 邊界案例

- **超長檔名**:label 經 `ItemContent` 預設 `truncate` 單行截斷(ellipsis),不換行。
- **過長 description**:自由換行不截斷(FileItem 未傳 `descriptionClamp`);rich 多行 desc 時 progress bar 隨內容下移並保 8px min gap(見 Rich layout invariant)。
- **progress 精度**:傳入值直接顯示(rich 的 `%` 文字與 bar 同源),元件不四捨五入;`completed` 強制 100。
- **RTL**:不支援；全域 LTR-only compatibility contract 見 `packages/design-system/README.md#compatibility-matrix`。compact progress offset 維持 physical direction。
- **Dark mode**:走 semantic token 自動 adapt。無 `disabled` prop(展示型 row,非 form control)。

---

## Inspector 與矩陣的教學分工

FileItem 決策維度是 `mode`(compact / rich)× `status`(uploading / completed / error / static)。anatomy 同時提供 `Inspector`(右側 Controls 即時切 `mode` / `status` / `progress` / `description` 試玩單值)與 `ColorMatrix` / `SizeMatrix` / `StateBehavior` 結構矩陣——兩者分工:Inspector 給「單一組合長怎樣」的即時試玩,矩陣給「跨 status 並排比對」的 side-by-side 決策。

ColorMatrix 已建:展示 status × 元素(filename / description / progress bar / status icon)色彩矩陣,明示 status 只驅動 **progress bar + status icon + description** 升階,**不染容器背景**(避免整 row 轉紅蓋過其他 metadata)。容器本身沒有 selected / disabled state(interface 無 `disabled` prop);滑過底色只在有 `onClick` 時出現,由 `StateBehavior` 示範(詳「滑過」段)。

## 與 shadcn Attachment 的分界(2026-07-07 codify,目錄新增元件謂詞 anchor)

shadcn 2026-06 chat 套件的 Attachment(ui.shadcn.com/docs/components/attachment)與 FileItem 同情境(附件 + 上傳狀態 + 動作)。**不遷移架構、不改名**:Attachment 為純組合式(無 Radix primitive 核心,AttachmentAction 即其 Button),無 primitive 增益且缺我們的 item-anatomy 幾何深度與 ProgressBar 量化 a11y(其進度僅 title shimmer,SR 無量化值);shadcn 為 copy-in scaffold 無上游更新流入;改名破壞 File* 家族(FileUpload / FileViewer)+ npm breaking + `completed` lifecycle family(props-naming.md)。判準 SSOT → `ui-development.md`「shadcn 目錄後續新增元件 vs DS 既有」。

**Known-gaps(對照後承認、留 anchor,現無產品需求不動)**:
- `processing` / `idle` state:Attachment 5 態 enum 可表達「傳完但伺服器處理中」(掃毒 / transcode / AI ingestion);我們 3 態 + undefined 表達不了 — 未來需求出現時走 prop 演進 ASK
- `orientation="vertical"` + Group 橫向 scroll(chat composer tile;gallery 既定走 Grid / Carousel):屬 SSOT-affecting,對應需求出現時 ASK 再議。AttachmentTrigger 的 stacking-order 鍵盤路徑已由本元件 sibling primary-action button contract 吸收，不再列為 gap。

---

## 相關

- `../../patterns/element-anatomy/item-anatomy.spec.md` — row anatomy primitive(ItemContent / ItemPrefix;FileItem 兩 mode 採 scanning idiom)
- `../Avatar/avatar.spec.md` — Avatar shape（rich mode 的 icon 容器）
- `../FileUpload/file-upload.spec.md` — **配對元件**:FileUpload 是拖放 / 點擊上傳區塊,FileItem 是已上傳檔案 row 顯示;兩者構成完整 file-handling 元件組
- `../LinkInput/link-input.spec.md` — 純連結（非 upload 流程）替代
- `../TreeView/tree-view.spec.md` — 階層 file structure 場景
- `../ProgressBar/progress-bar.spec.md` — ProgressBar SSOT(FileItem consumes ProgressBar for upload bar)
- `../../tokens/color/color.spec.md` — Track 底色（`bg-secondary` 使用原則）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `file-upload.spec.md`
