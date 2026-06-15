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
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# FileItem 設計原則

**檔案上傳列表項目**——顯示檔案名稱、上傳進度、狀態（uploading / completed / error）。

**實作基礎**：組合元件——Icon + Text + ProgressBar + Button，無 external primitive base。

**Layout Family**：CLAUDE.md 4-Family Model **Family 2（List item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「List item layout」章節的 reading-mode 規格。FileItem 在 rich mode 用 avatar 作 item boundary。

**命名 rationale**：`compact / rich` 表達精簡 vs 完整內容呈現（對齊 Discord embed type='rich' / Slack rich preview / Notion rich text 世界級 idiom）。不叫 `lg/sm`——兩者是資訊量不同的展示策略，不是同一結構的尺寸縮放。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

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

> **當 FileItem rich 被放在「檔案上傳管理 box」等 tight-stack 情境**(consumer 移除 border 並 0 gap 相連時),avatar 作為**每個 item 的視覺邊界引導**——若 avatar 中心對齊,連續 item 的 avatar 會擠在一起失去「每筆檔案一個 thumbnail」的視覺節奏。top-align 讓 avatar 明確標示每個 item 的起點。

### Avatar 尺寸(固定 48px)

Avatar **固定 48px square**,不隨 content 高度變化。content(label + desc + bar)可自然 > 48(2-line desc 時)或 < 48(無 desc + 無 bar 時),avatar 始終 48。

## Padding

| Mode × surface | 規則 |
|---|---|
| compact(`surface=form` 預設) | `px-3 py-2`(FileItem 無 size prop,不走 `ROW_PADDING_BY_SIZE` 公式;`gap-2` 對齊 item-anatomy row) |
| compact(`surface=upload-manager`) | **`py-2` 保留 + 左右 padding 拿掉**(`px-0`)。py 是**純文字列高來源**(無 avatar 撐高)不可拿;左右拿掉讓列對齊面板 loose L/R |
| rich(`surface=form` 預設) | `px-3 py-3` border card(py 固定,高度由 avatar 決定不走 row 公式)|
| rich(`surface=upload-manager`) | **左右 + 上下 padding 全拿掉**(`px-0 py-0`)。**列高靠 avatar 48(content `minHeight`)**,卡片移除後 py 多餘 → 由面板 + gap 控制間距(2026-06-03 user 校準:rich 拿上下、compact 保留上下,因列高來源不同)|

**item 與容器分工**:item 只控「容器不該管的內距」—— compact `py-2`(純文字列高來源,無 avatar 撐高)/ rich `0`(列高靠 avatar 48);左右一律拿掉交給容器。**`surface=upload-manager` 浮層面板(容器)的左右 / 上下 padding / 列間 gap → 見「List wrapper canonical」的「upload-manager 浮層面板 composition」段**(SSOT 不在此重述,避免 drift)。

## 邊框 / 背景(AR15-21 canonical,2026-04-21 · 2026-04-22 擴充)

**容器視覺由 `mode` × `surface` 決定**（2026-06-03 加 surface 維度，codify rich-borderless）。`surface` prop：`form`（預設）/ `upload-manager`。

| Mode × surface | 容器視覺 | Rationale |
|------|---------|-----------|
| **rich + `surface=form`**（預設，表單/訊息附件）| `border border-divider rounded-md bg-surface` | Rich = 「檔案 card」自立輪廓——Slack / Notion / Linear attachment 慣例；邊框讓每 row 視覺獨立 |
| **rich + `surface=upload-manager`**（Google Drive / Dropbox 背景上傳 box）| **無邊框 + 無 bg**（`rounded-md` 保留供 thumbnail 切角）；avatar 作每筆 item 視覺邊界 | box 自身已是容器 → card border 多餘＝雙層容器；avatar thumbnail 提供「每筆檔案」邊界節奏。2026-06-03 codify（原僅 L116 旁註「consumer 自己移除 border」，現 `surface` prop 機械化）|
| **compact + 有 status**（uploading / error / upload-manager completed，有 progress bar）| 無背景、無邊框,只靠 progress bar 提供 affordance | 「正在發生」/「剛發生」的動態 narrative,progress 本身就是視覺焦點 |
| **compact + 無 progress**(form attachment 靜態態) | `bg-secondary rounded-md`(= neutral-3 色) | 靜態清單(form / 訊息附件)背景色區隔出「檔案 row」邊界,跟純文字內容區分。**為何 `bg-secondary` 不 `bg-neutral-3`**:`--secondary` 是 semantic token 經 `@theme inline` 橋接成合法 Tailwind utility,`--color-neutral-3` 是 primitive token(僅 `:root` CSS var)不生成 utility,寫 `bg-neutral-3` 會 silent 失效。對齊 Badge low / ProgressBar track SSOT(同色) |

### Hover 行為 canonical(2026-04-23)

**FileItem 永不顯示 hover-bg**,不論 mode / status / onClick。affordance 只靠 `cursor-pointer`(onClick 存在時)+ actions icon / hover-swap(status slot icon fade → action icon fade)。

**Rationale(permanent visual anchor → 不加 hover-bg double-emphasis)**:

| Mode | 永久 visual anchor | 加 hover-bg 後果 |
|------|-------------------|-----------------|
| rich | `border + rounded-md + bg-surface` 永遠 card | card + hover-bg = 雙層強調,視覺 heavy |
| compact 無 status(靜態) | `bg-secondary rounded-md` 永遠 pill | pill bg + hover-bg neutral-hover 兩層相近灰,視覺雜 |
| compact 有 status(uploading / error / completed with bar) | 底部 2px progress bar(分隔線型 permanent affordance) | bar + hover-bg 同時並存,affordance 重複 |

三種型態**都已 anchored**,hover-bg 是多餘的視覺層。Cursor + click 本身已是足夠互動 affordance,世界級檔案 card / attachment 皆如此。

**世界級對照**(M8 / M12 benchmark):

| DS | File card / attachment hover 行為 | 跟本 canonical 對齊? |
|----|----------------------------------|----------------------|
| Slack file tile | border highlight,**無 bg 變化** | ✓ |
| Notion file callout | **無 bg 變化**,action icons fade in | ✓ |
| Figma file card | shadow lift,**無 bg 變化** | ✓ |
| Gmail attachment chip | **無 bg 變化**,download icon fade in | ✓ |
| Dropbox / Google Drive file **row**(flush transparent 無 permanent anchor) | **有** hover-bg | Opposite case(證明 canonical:anchored → 無、flush → 有) |

**跟 MenuItem / DataTable row 對比**(它們用 hover-bg):兩者是 **flush transparent row**(無 permanent bg / border),hover-bg 是唯一 affordance。FileItem 三種型態皆已 anchored → 反向 canonical。

**反例**(本 session 修正):
- 原 code `hoverClass = onClick ? 'cursor-pointer hover:bg-neutral-hover' : ''` → rich card 上 hover 多一層灰 bg 雙層強調;無 status pill 上 hover 加 `bg-neutral-hover` 跟 pill 底色近似造成視覺雜
- 修為 `hoverClass = onClick ? 'cursor-pointer' : ''`

**❌ 反例**:
- Rich mode 無邊框 → 與一般 list item 無法區分,跟 MenuItem 混淆
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
| hover 行為 | **status slot hover-swap**:✓ → Download ↓(icon button)觸發 `onDownload` |
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
| hover 行為 | `cursor-pointer`(永不顯示 hover-bg ——permanent-anchored 元件不加 double-emphasis) |
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
      <a href="#logs" className="underline hover:text-error-hover">View log</a>
    </>
  }
  onRetry={noop}
/>
```

視覺上 underline + hover 色變讓使用者知道「那段文字可點」。

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

**規則:gap 由「item 視覺密度」決定** —— rich form(有邊框 card)`gap-2`(8px,邊框不相黏);rich `surface=upload-manager`(無邊框)`gap-[var(--layout-space-tight)]`(12px);compact(所有情境)`gap-1`(4px)。

| Mode × surface | List wrapper gap | Rationale |
|------|----------------|-----------|
| **Rich + `surface=form`**(border card)| `gap-2`(8px) | card 邊框不相黏(standalone card invariant) |
| **Rich + `surface=upload-manager`**(無邊框浮層面板)| `gap-[var(--layout-space-tight)]`(12px)| 卡片 + 48 縮圖列需垂直呼吸。**2026-06-03 圖五 user 校準:rich upload-manager 初版誤設 4px,已校正為 tight(12px)**,因 rich 列比 compact 大 |
| **Compact**(所有情境)| `gap-1`(4px) | 統一 — 有 status only / 無 status only / mixed 都 gap-1(2026-04-23 user 指示簡化:原條件式「全上傳中 → 0 gap」是 consumer 心智負擔 + state 轉換時 fragile,故捨棄 0-gap)|

**control→list gap(FileUpload 內建 list 消費)**:dropzone / button 控制項 ↔ 第一個 FileItem 的間距 = **同上 form gap 同值**(rich card 8px / compact bg-pill 4px),由 `file-upload.tsx` 依 `fileListMode` 套用。**FileUpload 內建 list 一律 `surface=form`**(dropzone 是表單上傳框,非獨立浮層 upload manager),故不套用下方 upload-manager 的 12px / 面板 padding。

### upload-manager 浮層面板 composition(Google Drive 右下角類獨立面板,**非** FileUpload dropzone)

`surface=upload-manager` 的 FileItem list 裝在獨立浮層面板(header + 列表),item 拿掉的左右 / 上下邊距改由容器負責:

- **它是 popover-class 浮層 surface,但不是 Radix `<Popover>`**(常駐面板:不靠 trigger 開、不 outside-click 關、用 chevron 收合非 X dismiss)→ **不包 `<Popover>`**,而是直接消費 overlay-surface 三件套 primitive。
- **殼 + header + body 全消費 overlay-surface SSOT(禁手刻)**:
  - 殼:用 Popover 同款 chrome token `rounded-lg border border-border bg-surface-raised shadow-[var(--elevation-200)] flex flex-col`(DS 無獨立 shell primitive — `PopoverContent`/`DialogContent` 各自套這組 token;常駐面板鏡像同值)。
  - header:`<SurfaceHeader className="justify-between [--chrome-slot-h:1.25rem]">` + `<PopoverTitle>`(輕量浮層 header SSOT,padding = px-loose py-tight + border-b + unbounded-slot 負 my trick)。
  - body:**`<SurfaceBody>`(body SSOT,含 px-loose py-tight + flex-1 scroll 鏈)**,FileItem-specific padding 用 className override(見下)。**這不是「List-as-region」**(那專指 edge-to-edge 選單清單:item hover-bg 貼容器、px-0;Cmd+K / menu / nav)—— upload-manager list 有 px-loose、item 無 hover-bg、是 chrome-padded body,故就用 SurfaceBody。**scroll(consumer 注意)**:SurfaceBody 的 `flex-1 / overflow-y-auto` 只在 shell 有 `max-h` + `overflow-hidden` 時生效;常駐面板若檔案數可超 viewport,shell 須加 `max-h`(對齊 overlay-surface.spec.md「viewport-aware scroll」),demo 短內容不需。
  - **禁手刻**:`<div px-loose py-2 border-b>`(header)/ 手刻 `<div px-loose py-tight>`(body)= drift(2026-06-03/04 user 抓:py-2≠py-tight / 殼 token 全偏 / body 重刻 SurfaceBody)。Hook `check_story_invariants.sh R9` 機械攔手刻 header。

- **左右**:`SurfaceBody` 預設 `px-[var(--layout-space-loose)]`(16px,item 內容左緣對齊 header 標題),不需 override。
- **上下:目標 = 邊緣到 item「ink」(可見內容)距離 `var(--layout-space-tight)`(12px),兩 mode + 上下都一致**。通則:**容器該側 padding = 12 − item 在該側自己的留白(ink inset)**。
  - **rich**:item 上下 ink inset 皆 0(avatar 頂、bar/content 底貼齊)→ 用 `SurfaceBody` 預設 `py-[var(--layout-space-tight)]`(12 / 12 對稱,不需 override)。
  - **compact**:item 上方自帶 `py-2`(8px)→ top 補 `4`(4+8=12);**進度條 `absolute bottom-0` 貼 item 底、下方無留白(inset 0)**→ bottom 留 SurfaceBody 預設 `py-tight`(12,12+0=12)。故 compact 用 **`SurfaceBody className="!pt-1"`** override 成上下不對稱(top=4 / bottom=12)。**為何用 `!`(important)**:twMerge 不 strip SurfaceBody 基底 `py-[tight]`,非 important 的 `pt-1` 跟基底 `py` 競爭 top 看 Tailwind stylesheet 生成順序(非決定性 → 可能 silent 變 12);`!pt-1` 強制決定性勝。對齊 List-as-region `!px-0` SurfaceBody override 慣例。
- **列間 gap**:套在 SurfaceBody className;值見上方「List wrapper canonical」gap 表(SSOT,不在此重述:rich upload-manager 12px / compact 4px)。
- **為何 compact container 上下不對稱**(2026-06-03 圖一研究校準):compact 進度條 absolute 貼底,item 的 py-2 那 8px 落在「文字↔bar」之間、bar 下方無 padding;若上下都用同值 → 下邊距(bar→邊緣)只剩容器值、比上邊距(含 item 8px)小。故用「12 − ink inset」逐側補。世界級對照:密集 list / dropdown 容器上下 padding 慣例 4–8px(Atlassian space.050–100 / 8px-base 共識);此處目標 12px 是「邊緣→ink」視覺值(含 item 自身留白),非容器裸值。
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
- FileItem 提供 `onClick` prop,consumer 傳入即進 clickable 模式(僅滑鼠可點 + `cursor-pointer`;刻意不加整列 keyboard 焦點 / hover-bg — 見「A11y 預設」nested-interactive rationale 與「Hover 行為 canonical」)
- 兩種 surface 都可以用 `onClick`(upload-manager 可跟 `onDownload` hover-swap 並存)
- consumer 決定具體行為(download / FileViewer),元件只提供 row 可點擊能力

## ProgressBar

**SSOT**:FileItem 不自 roll bar,消費 `../ProgressBar/progress-bar.spec.md` 元件(Radix Progress 包裝 + 本 DS token)。避免視覺漂移。

| 屬性 | 值 | 依據 |
|---|---|---|
| 消費元件 | `<ProgressBar status={...} value={...} height={compact ? 2 : undefined} />` | 本 DS ProgressBar SSOT(公開 API 固定 4px;`height` 是 internal-only 逃生艙,FileItem 為唯一合法 consumer) |
| status 映射 | `uploading → inProgress` / `completed → success` / `error → error` | ProgressBar `status` 原生支援 |
| height 映射 | `compact → 2px` / `rich → 4px`(預設) | compact mode 極密集 row layout 需要更細 track;rich mode 走 DS 預設 4px |
| value | `status === 'completed' ? 100 : progress` | completed 永遠 100% |

改動進度條視覺(高度 / 色 / 動畫) → 去 ProgressBar 改,**本元件無本地 bar 實作**。

## Actions（suffix,row dedicated region canonical）

Consumer 自行組合。按 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate」+「Row action 絕對值 cap」,**row dedicated action 絕對值 cap = ≤ 24px,不隨 row tier 放大**。依 row 高度分兩種實作:

**兩 mode 統一(2026-04-23 canonical)**:rich + compact 都用 **Button iconOnly `size="xs"`**(24 固定,≤ cap):

| Mode | 實作 | 尺寸 |
|------|------|------|
| `rich` | **Button iconOnly `size="xs"`**(24 固定,不隨 row 放大) | 24 |
| `compact` | **Button iconOnly `size="xs"`**(同 rich;靠 suffix wrapper `[&>[data-unbounded]]:my-[calc((1lh-var(--field-height-xs))/2)]` trick 把 24 footprint 收斂到 1lh,不撐高 row,視覺 / touch target 仍 24) | 24 |

```tsx
// Rich + Compact 統一 → Button xs iconOnly 固定 24(≤ 24 cap)
<FileItem actions={
  <Button size="xs" iconOnly variant="text" startIcon={Trash2} aria-label="刪除" onClick={del} />
} />
```

**為什麼 row action 固定 Button xs(24)**:row 放大不代表 action 要放大——世界級 DS(Material DataGrid / Polaris / Atlassian / Apple HIG)row action 都是固定小 icon button(20–24),row 高度變化只影響 row padding 與 content,不影響 action 尺寸。compact row 雖矮,但 Button 24 透過 suffix wrapper 的 data-unbounded margin trick 收斂到 1lh footprint(同 chrome SurfaceHeader dismiss canonical),不會填滿 row。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

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
- `mode="compact"` → `var(--field-height-xs)`(24,同 rich;compact 靠 status slot wrapper 的 `[&>[data-unbounded]]:my-[calc((1lh-var(--field-height-xs))/2)]` 把 24 footprint 收斂到 1lh,不撐高 row,視覺 / touch target 仍 24)

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
- **Row clickable 不做整列 keyboard 焦點**:傳 `onClick` 時整列僅滑鼠可點(`onClick` 直接掛在 row);**刻意不**把整列設成單一可聚焦按鈕(不加 `role="button"` / `tabIndex` / Enter-Space handler),避免與列內操作按鈕(下載 / 重試 / 移除)構成巢狀互動(axe nested-interactive)。keyboard user 直接 Tab 到列內 explicit 操作按鈕取得等價能力。世界級對照:Slack message row / Notion page row 同模式(整列只滑鼠點,鍵盤走列內按鈕)。
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

**常見誤解**:FileItem 該有 hover-bg → 永不(三型態 permanent-anchored,見「Hover 行為 canonical」);status 會染整 row 底色 → 只升階 progress bar / status icon / description(見「Inspector 與矩陣的教學分工」);`surface` 影響進度條 → 進度條只看 `status`(見「可下載狀態 canonical」)。

---

## 邊界案例

- **超長檔名**:label 經 `ItemContent` 預設 `truncate` 單行截斷(ellipsis),不換行。
- **過長 description**:自由換行不截斷(FileItem 未傳 `descriptionClamp`);rich 多行 desc 時 progress bar 隨內容下移並保 8px min gap(見 Rich layout invariant)。
- **progress 精度**:傳入值直接顯示(rich 的 `%` 文字與 bar 同源),元件不四捨五入;`completed` 強制 100。
- **RTL**:未特化——compact progress bar offset 用 physical `left/right`(見 `file-item.tsx`),RTL 支援需另案。
- **Dark mode**:走 semantic token 自動 adapt。無 `disabled` prop(展示型 row,非 form control)。

---

## Inspector 與矩陣的教學分工

FileItem 決策維度是 `mode`(compact / rich)× `status`(uploading / completed / error / static)。anatomy 同時提供 `Inspector`(右側 Controls 即時切 `mode` / `status` / `progress` / `description` 試玩單值)與 `ColorMatrix` / `SizeMatrix` / `StateBehavior` 結構矩陣——兩者分工:Inspector 給「單一組合長怎樣」的即時試玩,矩陣給「跨 status 並排比對」的 side-by-side 決策。

ColorMatrix 已建:展示 status × 元素(filename / description / progress bar / status icon)色彩矩陣,明示 status 只驅動 **progress bar + status icon + description** 升階,**不染容器背景**(避免整 row 轉紅蓋過其他 metadata)。容器本身無 hover-bg / selected / disabled state——FileItem 三型態皆 permanent-anchored,反向於 MenuItem / DataTable flush row 的 hover-bg primitive(詳「Hover 行為 canonical」段),且 interface 無 `disabled` prop。

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
