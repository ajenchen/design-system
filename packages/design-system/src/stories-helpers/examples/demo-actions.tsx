import React from 'react'
import { Button } from '@/design-system/components/Button/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose,
} from '@/design-system/components/Dialog/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from '@/design-system/components/DropdownMenu/dropdown-menu'
import { toast } from '@/design-system/components/Toast/toast'

/**
 * 範例裡的按鈕接上「按鈕本來的行為」(2026-10-28 BA-specimen):畫面上看得到的按鈕都要能動(ssot F-S2;
 * 登記簿 A16「一堆按鈕都無法正常反應」),接的是按鈕本來的行為、不另造演出(A13):
 * - 一次性動作(匯出 / 新增 / 儲存 / 送出…)= 做完跳 Toast,寫做了什麼(登記簿 B26 送出成功跳提示)→ `done('已匯出 3 份文件')`;
 * - 有開關狀態的 = `pressed` 切換(Button 本來的 toggle)→ `<DemoToggle>{(on, flip) => <Button pressed={on} onClick={flip} … />}</DemoToggle>`;
 * - 溢出(···)、下拉指示、帶計數的入口 = 打開它收的那一串 → `<DemoMenu items={…}>`;
 * - 後面還有一層確認的危險動作(secondary / text + danger,button.spec.md「danger prop — 語意意圖」表)= 先開確認框
 *   → `<ConfirmAction>`;刪除用 `<ConfirmDelete>`(標題寫要不要刪哪一類、內文寫刪的是哪一個,登記簿 E17)。
 * 用到 `done` / 選單 / 確認框的 story 檔,meta 要掛 `<Toaster />`(toast.spec.md:consumer 在 app root 放一次)。
 * 原本 Action Bar 教學頁自己寫一份(2026-10-28 前),Button / Badge 頁要用同一套 → 收成這一份(M17)。
 */

/** 一次性動作做完的回饋:Toast 寫「做了什麼」 */
export const done = (title: string) => () => { toast({ variant: 'success', title }) }

/** 有開關狀態的按鈕:子節點拿到目前狀態與切換函式,按鈕本身照舊寫在原位(操作列的順序閘看得到) */
export function DemoToggle({ defaultOn = false, children }: { defaultOn?: boolean; children: (on: boolean, flip: () => void) => React.ReactNode }) {
  const [on, setOn] = React.useState(defaultOn)
  return <>{children(on, () => setOn((v) => !v))}</>
}

export type DemoMenuEntry = string | { label: string; description?: string }

/**
 * 按下打開它收的那一串:溢出(···)收的低頻動作(點了 = 做那件事,Toast「已…」),
 * 或帶計數的入口(訊息 / 通知:`open` —— 點其中一則 = 開啟那一則)。`title` = 選單標題(寫「是什麼、共幾則」)。
 */
export function DemoMenu({
  items, title, open = false, align = 'end', children,
}: { items: DemoMenuEntry[]; title?: string; open?: boolean; align?: 'start' | 'end'; children: React.ReactElement }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {title && <DropdownMenuLabel>{title}</DropdownMenuLabel>}
        {items.map((item) => {
          const { label, description } = typeof item === 'string' ? { label: item, description: undefined } : item
          return (
            <DropdownMenuItem key={label} description={description} onSelect={done(open ? `已開啟「${label}」` : `已${label}`)}>
              {label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 後面還有一層確認的危險動作:先開確認框,確認後才做(Toast 寫做了什麼) */
export function ConfirmAction({
  title, body, confirmLabel, doneTitle, children,
}: { title: string; body: string; confirmLabel: string; doneTitle: string; children: (open: () => void) => React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      {children(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent height="hug" maxWidth={480}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-body">{body}</p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="tertiary">取消</Button>
            </DialogClose>
            <Button variant="primary" danger onClick={() => { setOpen(false); done(doneTitle)() }}>{confirmLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 刪除:先確認再刪(登記簿 E17:標題寫要不要刪哪一類東西、內文寫刪的是哪一個) */
export function ConfirmDelete({ noun, target, children }: { noun: string; target: string; children: (open: () => void) => React.ReactNode }) {
  return (
    <ConfirmAction title={`是否刪除${noun}`} body={`確定要刪除${target}嗎?刪除後無法復原。`} confirmLabel="刪除" doneTitle={`已刪除${target}`}>
      {children}
    </ConfirmAction>
  )
}
