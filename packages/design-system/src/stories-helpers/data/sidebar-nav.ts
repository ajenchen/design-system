import { Bell, CalendarClock, Inbox, Settings, Users } from 'lucide-react'

/**
 * Story 範例用的側欄主導覽(2026-10-27 收成一份):Sidebar 展示頁與設計原則頁原本各抄一份逐字相同的清單
 * (scripts/story-helper-duplication-baseline.json 的 MAIN_NAV 組)。設計好的 1 層扁平,每項必須有 icon 以支援 icon 模式。
 *
 * 側欄項目的字 = 那一頁標頭的字(同字):頁面標頭一律讀這裡的 `label`(`navLabel`),不另寫一份
 * (`components/Sidebar/sidebar.spec.md`「選中項的字 = 那一頁標頭的字」;閘 `scripts/sidebar-label-matches-header-invariant.mjs`)。
 * 2026-11-15 前第一項是「Dashboard」:主區那張表(今天到期或快到期的議題)上方的區段標題 2026-11-11 拿掉後,
 * 標頭「Dashboard」說不出下面那張表是什麼 → 改成「Due soon」(圖示跟著換成日曆 + 時鐘),側欄與標頭同一份字。
 */
export const MAIN_NAV = [
  { id: 'due-soon', label: 'Due soon', icon: CalendarClock },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

/** 側欄選中項 → 頁面標頭的字(同一份文字來源;找不到 = 空字串,閘會把「側欄字 ≠ 標頭字」判紅) */
export const navLabel = (id: string): string => MAIN_NAV.find((n) => n.id === id)?.label ?? ''
