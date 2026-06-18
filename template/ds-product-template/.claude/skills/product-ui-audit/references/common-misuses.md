# Common Misuses — 元件誤用 negative example 庫

針對本 DS 常見的元件誤用 pattern。每筆:**誤用 → 正解 → 理由**。

---

## Button 誤用

### ❌ 多個 primary Button 並列

```tsx
<div className="flex gap-2">
  <Button variant="primary">儲存</Button>
  <Button variant="primary">下載</Button>
  <Button variant="primary">分享</Button>
</div>
```

**正解**:一個 row 一個 primary,其他降階。

```tsx
<div className="flex gap-2">
  <Button variant="primary">儲存</Button>
  <Button variant="tertiary">下載</Button>
  <Button variant="tertiary">分享</Button>
</div>
```

**理由**:primary 是「這個流程的主 CTA」,多個 primary 會讓使用者不知該點哪個。

### ❌ icon-only 無 aria-label

```tsx
<Button iconOnly startIcon={Trash} />  // ❌
```

**正解**:`aria-label="刪除"`。screen reader 必要。

### ❌ Button 巢狀

```tsx
<Button onClick={outer}>
  外層
  <Button>內層</Button>  {/* ❌ 巢狀 button invalid HTML */}
</Button>
```

**正解**:拆成兩個 sibling Button 或 inline ItemInlineAction。

---

## Field / Input 誤用

### ❌ 裸 `<input>` 未包 Field wrapper

```tsx
<input type="text" className="border rounded p-2" />  {/* ❌ */}
```

**正解**:用 `<Input>` 元件或包 Field wrapper。

**理由**:DS `<Input>` 已帶 fieldWrapperStyles(hover / focus / error / disabled 狀態全套),自 roll `<input>` 失去一致性。

### ❌ Input 外層自訂 border / padding

```tsx
<div className="border-2 border-primary p-3 rounded-xl">
  <Input />
</div>
```

**正解**:用 Input 的 `error` prop 或 cva variant,不自套 wrapper。

---

## Dialog / Popover / Sheet 誤用

### ❌ Dialog 內放 Popover(巢狀浮層)

```tsx
<Dialog>
  <DialogContent>
    <Popover>...</Popover>  {/* ❌ 浮層巢狀不推薦 */}
  </DialogContent>
</Dialog>
```

**正解**:改用 Dialog 內 Tabs / Accordion / SelectMenu 等 inline 結構。

### ❌ Dialog 無 DialogTitle

```tsx
<DialogContent>
  <p>確定刪除?</p>
  <Button>確定</Button>
</DialogContent>
```

**正解**:必有 DialogTitle + DialogDescription(a11y 必要)。

```tsx
<DialogContent>
  <DialogHeader><DialogTitle>刪除專案?</DialogTitle></DialogHeader>
  <DialogBody><p>此動作無法復原</p></DialogBody>
  <DialogFooter>
    <Button variant="tertiary">取消</Button>
    <Button variant="primary">確定刪除</Button>
  </DialogFooter>
</DialogContent>
```

### ❌ Popover 當 Tooltip 用

```tsx
<Popover>
  <PopoverTrigger asChild>
    <button>hover me</button>
  </PopoverTrigger>
  <PopoverContent>提示文字</PopoverContent>
</Popover>
```

**正解**:Tooltip 元件。Popover 是 click 觸發互動面板,Tooltip 是 hover 觸發純文字提示。

---

## Empty / 空狀態誤用

### ❌ 自寫 flex+icon+title+desc 垂直居中

```tsx
<div className="flex flex-col items-center text-center gap-2 py-12">
  <FileSearch size={48} className="text-fg-muted" />
  <div className="text-body-lg font-medium">沒有符合的結果</div>
  <div className="text-body text-fg-secondary">請調整篩選條件</div>
  <Button>重設篩選</Button>
</div>
```

**正解**:

```tsx
<Empty
  icon={FileSearch}
  title="沒有符合的結果"
  description="請調整篩選條件"
  action={<Button>重設篩選</Button>}
/>
```

**理由**:Empty 元件 own icon size(Avatar 48px)/ typography tier / gap token。自寫 drift 風險。

---

## Skeleton / CircularProgress / Empty 混用

### ❌ Loading 狀態用 Empty

```tsx
{isLoading && <Empty description="Loading..." />}  {/* ❌ */}
```

**正解**:Skeleton(骨架)或 CircularProgress(不知時長,indeterminate)。Empty 是「確認無資料」。全頁 loading 可 `<Empty icon={<CircularProgress size={48}/>} title="載入中" />`。

### ❌ Error 狀態用 Empty

```tsx
{error && <Empty description="載入失敗" />}  {/* ❌ */}
```

**正解**:`<Alert variant="error">`。Empty 是中性空(可能有操作解除),Error 是需處理的問題。

---

## ProgressBar / CircularProgress 混用

### ❌ 不知進度硬套 ProgressBar(value=0 / 亂跳)

```tsx
<ProgressBar value={isLoading ? 30 : 100} />  // ❌ 進度無法量化
```

**正解**:`<CircularProgress>`(不傳 value)做 indeterminate。ProgressBar 是 determinate。

### ❌ 已知百分比的大區塊進度用 CircularProgress indeterminate

```tsx
<CircularProgress />  {/* 明明已知 45% */}
```

**正解**:大區塊 / 頁面級用 `<ProgressBar value={45} affix="value" />`;inline 小空間用 `<CircularProgress value={45} affix="value" />`。

---

## Tabs / Accordion / Carousel 誤用

### ❌ Tabs 切換「獨立功能」而非平行視圖

```tsx
<Tabs>
  <TabsTrigger value="settings">設定</TabsTrigger>
  <TabsTrigger value="logout">登出</TabsTrigger>  {/* ❌ 登出是 action 不是 tab */}
</Tabs>
```

**正解**:登出走 DropdownMenu 或獨立 Button。Tabs 是「切平行內容視圖」。

### ❌ Accordion 內巢狀 Accordion

```tsx
<Accordion>
  <AccordionItem>
    <AccordionContent>
      <Accordion>...</Accordion>  {/* ❌ */}
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

**正解**:改用 TreeView(有階層語意)或 flatten。

### ❌ Carousel 當資料切換器用

```tsx
<Carousel>
  <CarouselItem>總覽</CarouselItem>
  <CarouselItem>成員</CarouselItem>
  <CarouselItem>設定</CarouselItem>
</Carousel>
```

**正解**:`<Tabs>`。Carousel 是輪播同類內容(圖片組 / testimonial),不是命名視圖切換。

---

## Coachmark / Dialog / Popover 用錯場景

### ❌ 確認破壞性 action 用 Coachmark

```tsx
<Coachmark title="確定刪除?" onNext={del}>
  <Button variant="primary" danger>刪除</Button>
</Coachmark>
```

**正解**:`<Dialog>`。Coachmark 是 non-modal onboarding(使用者可忽略),Dialog 是 modal 阻斷(必須處理)。

### ❌ 錯誤訊息用 Coachmark

```tsx
<Coachmark title="載入失敗" description="網路異常" />
```

**正解**:`<Alert variant="error">` 或 `<Notice>` (非浮層)/ Toast(非阻斷)。Coachmark 是主動推送功能介紹,不是錯誤回報。

---

## ScrollArea / Native overflow 混用

### ❌ Consumer 內 DataTable 水平捲動用 native overflow-x-auto

```tsx
<div className="overflow-x-auto">
  <DataTable columns={...} data={...} />
</div>
```

**正解**:`<ScrollArea orientation="horizontal">` 包(跨 OS 一致)。

```tsx
<ScrollArea>
  <DataTable columns={...} data={...} />
  <ScrollBar orientation="horizontal" />
</ScrollArea>
```

---

## AspectRatio / 硬寫 aspect-* 混用

### ❌ media 容器硬寫 `aspect-video`

```tsx
<div className="aspect-video bg-muted">
  <img src={url} />
</div>
```

**正解**:

```tsx
<AspectRatio ratio={16 / 9} className="bg-muted">
  <img src={url} className="w-full h-full object-cover" />
</AspectRatio>
```

**理由**:`AspectRatio` 是 SSR-safe padding-bottom 方案,跨 OS / 未載入時穩定。硬寫 class 在某些邊緣瀏覽器失效。

---

## 色彩誤用

### ❌ primary 當狀態色用(Mindset #1 違反)

```tsx
<ProgressBar className="bg-primary" value={60} />  {/* ❌ 除非就是進度 */}
<Tag className="bg-primary">進行中</Tag>            {/* ❌ 應用 info */}
```

**正解**:進行中用 info,操作入口用 primary。

```tsx
<Tag className="bg-info-subtle text-info-text">進行中</Tag>
<Button variant="primary">開始</Button>
```

### ❌ 硬寫 Tailwind 預設色

```tsx
<div className="text-red-500 bg-blue-100">  // ❌
```

**正解**:改 semantic token(text-error / bg-info-subtle)。

---

## 此清單如何擴充

每次 audit 發現新 misuse pattern,append 到本檔。保留 negative example + 正解 + 理由 3 段格式。
