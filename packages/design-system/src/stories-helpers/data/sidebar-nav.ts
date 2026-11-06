import { Bell, Inbox, LayoutDashboard, Settings, Users } from 'lucide-react'

/**
 * Story 範例用的側欄主導覽(2026-10-27 收成一份):Sidebar 展示頁與設計原則頁原本各抄一份逐字相同的清單
 * (scripts/story-helper-duplication-baseline.json 的 MAIN_NAV 組)。設計好的 1 層扁平,每項必須有 icon 以支援 icon 模式。
 */
export const MAIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const
