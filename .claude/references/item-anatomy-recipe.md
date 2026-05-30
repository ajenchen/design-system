# Item Anatomy Recipe — 建立新 row primitive 的完整 workflow

Extracted from `packages/design-system/src/patterns/element-anatomy/item-anatomy.spec.md`(2026-04-24 prune)。Recipe 是創建 workflow(不是日常 canonical),留 spec 會讓 SSOT 過長;搬本檔,spec 只留 1-line pointer。

建立新 row primitive 時讀本檔 + 讀 item-anatomy.spec.md 其他 section 的 canonical(結構 / padding / 24px 閾值等)。

---

## Recipe:7 步建立新的 row primitive

要做一個跟 SidebarMenuButton / TreeItem / MenuItem / DropdownMenuItem 同套規格的全新 row primitive,**永遠按這 7 步**。整套花 30 分鐘以內,而且不會有任何漂移空間。

### Step 1 — Container 提供 `RowSizeContext`

在你的 row primitive 的「容器層」(Provider / Root / Menu 等),把整個子樹包進 `<RowSizeProvider>`:

```tsx
import { RowSizeProvider, type RowSize } from "@/design-system/patterns/element-anatomy/item-anatomy"

function MyMenuProvider({ size = "md", children }: { size?: RowSize, children: React.ReactNode }) {
  return (
    <MyMenuContext.Provider value={...}>
      <RowSizeProvider value={size}>
        {children}
      </RowSizeProvider>
    </MyMenuContext.Provider>
  )
}
```

**為什麼**:讓子樹的所有 `<ItemIcon>` / `<ItemAvatar>` / `<ItemInlineAction>` 自動拿到對的 size。沒這層,asChild consumer 就要自己手算 size,必定漂移。

### Step 2 — Item cva 用 item-layout 公式

不要自己發明 padding / typography 公式,複製 MenuItem / SidebarMenuButton 的 cva 結構:

```tsx
import { cva } from "class-variance-authority"

const myItemVariants = cva(
  [
    "flex w-full items-start gap-2 text-left",
    "px-[var(--layout-space-loose)]",  // ← 跨 row primitive 共用 padding
    "cursor-pointer select-none outline-none",
    "transition-colors",
    "hover:bg-neutral-hover focus-visible:bg-neutral-hover",
    "data-[active=true]:bg-neutral-selected",
  ],
  {
    variants: {
      size: {
        sm: "text-body leading-compact py-[calc((var(--field-height-sm)-1lh)/2)]",
        md: "text-body leading-compact py-[calc((var(--field-height-md)-1lh)/2)]",
        lg: "text-body-lg leading-compact py-[calc((var(--field-height-lg)-1lh)/2)]",
      },
    },
    defaultVariants: { size: "md" },
  }
)
```

**公式**:`py = (field-height - 1lh) / 2`,行高與 field-height 自動同步,density 切換無需手動調。

### Step 3 — Prefix 用 helper(不手刻)

```tsx
import { ItemIcon, ItemAvatar, ItemLabel } from "@/design-system/patterns/element-anatomy/item-anatomy"

// 帶 startIcon prop 的非 asChild 路徑:
<button className={myItemVariants({ size })}>
  <ItemIcon icon={Folder} />
  <ItemLabel>{label}</ItemLabel>
</button>

// asChild 路徑(consumer 自組 children):
<MyItem asChild>
  <button>
    <ItemAvatar alt="User" color="blue" />
    <ItemLabel>User Name</ItemLabel>
  </button>
</MyItem>
```

**禁止**手寫 `<Icon size={16} />` 或 `<Avatar size={24} />` ——helper 已從 `RowSizeContext` 自動查表。

### Step 4 — Suffix inline actions(如需)

```tsx
import { ItemInlineAction, type InlineActionConfig } from "@/design-system/patterns/element-anatomy/item-anatomy"

interface MyItemProps {
  // ... 其他 props
  inlineActions?: InlineActionConfig[]
  actionsReveal?: false | "hover"
}

// 在 render 內:
{inlineActions && inlineActions.length > 0 && (
  <span className={cn(
    "h-[1lh] shrink-0 ml-auto flex items-center gap-2",
    actionsReveal === "hover" &&
      "opacity-0 group-hover/my-item:opacity-100 group-has-[:focus-visible]/my-item:opacity-100 transition-opacity"
  )}>
    {inlineActions.map((action, i) => (
      <ItemInlineAction key={action.label + i} action={action} />
    ))}
  </span>
)}
```

**用 `group-has-[:focus-visible]`,不要用 `group-focus-within`**——後者會被 mouse click 觸發。

### Step 5 — Single selection(如需)

如果 row primitive 是「導覽」性質(每次只有一個 active),把 selection state 放 Provider:

```tsx
type MyMenuContextValue = {
  activeId: string | undefined
  setActiveId: (id: string) => void
}

// MyMenuProvider 接 controlled / uncontrolled props:
function MyMenuProvider({
  activeId: activeIdProp,
  defaultActiveId,
  onActiveChange,
  children,
}: {
  activeId?: string
  defaultActiveId?: string
  onActiveChange?: (id: string) => void
  children: React.ReactNode
}) {
  const [_id, _setId] = React.useState<string | undefined>(defaultActiveId)
  const activeId = activeIdProp ?? _id
  const setActiveId = (id: string) => {
    if (activeIdProp === undefined) _setId(id)
    onActiveChange?.(id)
  }
  return <MyMenuContext.Provider value={{ activeId, setActiveId }}>{children}</MyMenuContext.Provider>
}

// MyItem 接 id prop,自動算 isActive、自動 onClick 設 activeId:
function MyItem({ id, onClick, ...props }: { id?: string, onClick?: ... }) {
  const { activeId, setActiveId } = useMyMenu()
  const isActive = id !== undefined && activeId === id
  const handleClick = (e: React.MouseEvent) => {
    if (id !== undefined) setActiveId(id)
    onClick?.(e)
  }
  return <button data-active={isActive} onClick={handleClick} ... />
}
```

**Consumer 只需要傳 `id`**,無法寫出啞 item。

### Step 6 — Meta variant(如需「Show more」類命令)

如果有 section 底部需要放「查看更多」這類非導覽命令,加 `variant: "default" | "meta"`:

```tsx
const myItemVariants = cva([...], {
  variants: {
    size: { ... },
    variant: {
      default: "",
      meta: [
        "font-normal text-fg-muted",
        "data-[active=true]:bg-transparent data-[active=true]:text-fg-muted",
      ],
    },
  },
  defaultVariants: { size: "md", variant: "default" },
})

// MyItem 內部:meta 永不參與 single-selection
const isActive = variant === "meta" ? false : (... 同上)
```

### Step 7 — Spec + stories

1. 寫 `{name}.spec.md`,**只**寫元件特有的設計決策(variant 何時用、語意)+ 反向引用 `item-anatomy.spec.md`(共用部分不重寫)
2. 寫 `{name}.stories.tsx`,demo single-selection、inlineActions、variant=meta(如有)、uniformPrefix(如有)
3. 寫 `{name}.anatomy.stories.tsx` 設計規格,用 token-first 標註
4. 寫 `{name}.principles.stories.tsx` do/don't 範例

---

## 自我檢查:這個系統夠 reusable 嗎?

新人(或新 AI session)能不能在不問問題的情況下做完一個新的 row primitive?測試方式:

- 看 `item-layout.tsx` 的 export → 找到 `ICON_SIZE` / `AVATAR_SIZE` / `ItemPrefix` / `ItemLabel` / `ItemIcon` / `ItemAvatar` / `ItemInlineAction` / `ItemInlineActionButton` / `ItemSuffix` / `RowSizeProvider` / `useRowSize` / `getUniformPrefixSlotStyle` / `INLINE_ACTION_HOVER_BG_SIZE` ✓
- 看本 spec 的 Recipe → 7 步 copy-paste ✓
- 看 `MenuItem` / `SidebarMenuButton` / `TreeItem` 三個現成 row primitive → canonical 實作參考 ✓
- 跨檔案 grep 規則 → `patterns/element-anatomy/item-anatomy.spec.md`「Row primitives item-layout 公式」節列出禁止事項 ✓

如果以上四條任何一條斷掉,就是 spec / code drift,該補。

### Audit 指令（grep guard）

任何時候不確定 row primitive 內部是否漂移，跑這幾條 grep：

```bash
# 找出可疑的 raw ItemPrefix wrap 用法（應該幾乎沒有）
rg '<ItemPrefix>\s*<[A-Z]' src/design-system

# 找出硬寫 size 的 Avatar / Icon（在 row primitive 內應該為零）
rg '<Avatar[^>]*size=\{[0-9]+\}' packages/design-system/src/components/{Sidebar,TreeView,SelectMenu,DropdownMenu}
rg 'size=\{16\}|size=\{20\}|size=\{24\}' packages/design-system/src/components/{Sidebar,TreeView}

# 找出沒走 ItemInlineAction 的 inline action button
rg "group/action.*relative grid place-content-center" src/design-system
```

任何一條結果非空就是 drift，要修。

### SidebarMenuButton 獨立實作風險

SidebarMenuButton 不繼承 MenuItem，而是直接 import item-layout helpers 自己用 cva 實作。兩者共享同一套 item-layout 公式但實作獨立。

**風險**：如果 MenuItem 的視覺公式（padding、typography、hover 色彩）有改動，SidebarMenuButton 需要手動跟進。

**檢查法**：改動 MenuItem 的 menuItemVariants 後，grep `sidebarMenuButtonVariants` 確認對應值是否需要同步。
