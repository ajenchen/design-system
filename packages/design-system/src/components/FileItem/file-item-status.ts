import { CircleCheck, XCircle } from 'lucide-react'

/**
 * 「做完了」的結果圖示與顏色 —— FileItem 的上傳結果(`status`)與 TreeView 步驟導覽樹的步驟結果(`TreeItem status`)共用這一份。
 *
 * owner = FileItem(`file-item.spec.md`「Status ↔ Action hover-swap」表的 Passive icon 欄:completed 綠 ✓ / error 紅 ✗);
 * TreeView 沿用是 user 2026-10-06 的決定(待辦總帳 T4 第 4 點,步驟狀態「圖示與顏色沿用 FileItem」,原話全文見總帳),
 * 寫在 `../TreeView/tree-view.spec.md`「步驟結果」。抽成一份是為了兩處永遠一致(M17),不是改值:
 * 2026-10-07 前這張表住在 file-item.tsx 檔內(`STATUS_ICON`),值逐字搬過來。
 * icon 選字對齊 `ds-canonical/references/props-naming.md`「常用 icon canonical」:成功 `CircleCheck`、失敗 `XCircle`。
 */
export const RESULT_STATUS_ICON = {
  completed: { icon: CircleCheck, color: 'text-success' },
  error: { icon: XCircle, color: 'text-error' },
} as const
