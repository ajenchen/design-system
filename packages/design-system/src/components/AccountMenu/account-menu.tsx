/**
 * AccountMenu — 全域 chrome「自己的帳號入口」(24px avatar 觸發 + 帳號選單)
 *
 * ── 定位 ──
 * Primary-header 派 globalHeader 右側(desktop)/ mobile Sheet SidebarHeader 右側的
 * 帳號入口成品元件:點 avatar 開「個人資料 / 設定 / 登出」navigation 選單。
 * 是「自己」的入口,不是看「別人」的 ProfileCard(後者預設動作 Chat/通話,語義是聯絡某人)。
 * **Placement-agnostic**:哪個 mode 放哪裡是 consumer 職責,放置 canonical owner =
 * `../AppShell/app-shell.spec.md`「帳號入口(Account entry)放置 SSOT」(本元件不收 mode prop,
 * 不複製該 SSOT;consumer 讀 `useAppShell().layout` + `useSidebar().isMobile` 決定放置)。
 *
 * ── 實作基礎 ──
 * 消費:Avatar(raw size=24 trigger)+ DropdownMenu(Trigger asChild / Content / Group / Label / Item)
 * 對應 pattern:patterns/header-canonical(4.5 chrome header avatar SSOT)
 *
 * ── 消費的 SSOT ──
 * - components: [Avatar, DropdownMenu(DropdownMenuTrigger/Content/Group/Label/Item)]
 * - patterns: [header-canonical 4.5(chrome header avatar = raw `<Avatar size={24}>`,非 ItemAvatar)]
 * - tokens: [--chrome-header-avatar-size(JS 端 24 literal sync), --ring(focus-visible ring canonical)]
 * - spec refs: app-shell.spec.md「帳號入口(Account entry)放置 SSOT」/ header-canonical.spec.md 4.5
 *   / dropdown-menu.spec.md / profile-card.spec.md(近親分界:看別人 vs 自己)
 *
 * 升級歷程:2026-06-17 `AppShell/_demo-helpers.tsx` demo helper 誕生(user directive)→
 * 2026-07-30 F9 升 public:app-shell.spec.md + sidebar.spec.md 兩處 canonical 都 mandate
 * 消費本元件,「文件教得到、import 拿不到」= DT-EXPORT 斷鏈同款缺口(gen-component-indexes.mjs
 * 檔頭 anchor),npm consumer 被迫整包重造。世界級對照:Atlassian `@atlaskit/atlassian-navigation`
 * 出貨專門 `Profile` 元件作 top bar 帳號 trigger(ProfileProps = IconButtonProps,選單內容
 * composition;https://unpkg.com/@atlaskit/atlassian-navigation/dist/types/index.d.ts +
 * dist/types/components/Profile/types.d.ts);shadcn / Primer 走 DropdownMenu / ActionMenu
 * composition recipe(https://ui.shadcn.com/docs/components/dropdown-menu「An account switcher
 * dropdown triggered by an avatar」/ https://primer.style/components/action-menu)。本元件 =
 * Atlassian 專門元件 + shadcn canonical 內容組(Label(user)+ Groups)的收斂。
 */
import * as React from 'react'
import { User, Settings, LogOut } from 'lucide-react'
import { Avatar, type AvatarData } from '@/design-system/components/Avatar/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from '@/design-system/components/DropdownMenu/dropdown-menu'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AccountMenuUser {
  /** 顯示名(選單 Label 區;alt 未傳時同時作 avatar alt fallback) */
  name: string
  /**
   * Avatar 資料(消費既有 `AvatarData` type)。`hoverCard` 刻意排除:帳號入口是「自己」,
   * 不掛 ProfileCard(per app-shell.spec.md 帳號入口 SSOT「不用 ProfileCard」);
   * `alt` 可省,fallback `name`。
   */
  avatar?: Omit<AvatarData, 'hoverCard' | 'alt'> & { alt?: string }
}

export interface AccountMenuProps {
  /** 當前登入使用者 */
  user: AccountMenuUser
  /** 「個人資料」item handler(default 選單消費;命名對齊 `PersonData.onViewProfile` 既有 canonical) */
  onViewProfile?: () => void
  /** 「設定」item handler(default 選單消費) */
  onOpenSettings?: () => void
  /** 「登出」item handler(default 選單消費) */
  onSignOut?: () => void
  /**
   * 取代 default 選單內容(自組 `DropdownMenuGroup` / `DropdownMenuItem`;i18n / 產品自訂項走這)。
   * Identity Label(user.name)恆由本元件渲染於選單頂(對齊 shadcn account 例 Label(user)慣例);
   * 傳入 children 時三個 default callback 不再消費。
   */
  children?: React.ReactNode
  /** 選單對齊(轉傳 DropdownMenuContent `align`)。預設 `'end'`:右上入口靠右展開(demo baseline) */
  align?: 'start' | 'center' | 'end'
  /** Trigger aria-label(i18n override,對齊 Avatar `badgeAriaLabel` pattern)。預設「帳號與設定」 */
  triggerAriaLabel?: string
  /** 預設展開(uncontrolled,Radix passthrough)。Storybook OpenSnapshot(M15 visual-audit coverable)用 */
  defaultOpen?: boolean
}

// ── AccountMenu ─────────────────────────────────────────────────────────────

export function AccountMenu({
  user,
  onViewProfile,
  onOpenSettings,
  onSignOut,
  children,
  align = 'end',
  triggerAriaLabel = '帳號與設定',
  defaultOpen,
}: AccountMenuProps) {
  // Dev-mode warning(對齊 ProfileCardDefaultActions dev-warn 先例):default 選單項沒接任何
  // handler = item 點了永遠沒反應;production 必接 callback 或自組 children。
  if (
    process.env.NODE_ENV !== 'production' &&
    !children &&
    !onViewProfile &&
    !onOpenSettings &&
    !onSignOut
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      '[DS AccountMenu] default 選單項未接 onViewProfile/onOpenSettings/onSignOut——item 點擊無反應。請傳入 callback 或自組 children。'
    )
  }
  const avatar = user.avatar ?? {}
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        {/* 互動感由 focus-visible ring 提供(無 hover bg,chrome 輕量 entry),不放大到 field height
            — per app-shell.spec.md「Avatar 尺寸 + 邊距」+ header-canonical.spec.md 4.5 */}
        <button
          type="button"
          aria-label={triggerAriaLabel}
          className="flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          {/* 24 per header-canonical.spec.md 4.5 chrome header avatar canonical(brand + account 同尺寸); sync with --chrome-header-avatar-size */}
          <Avatar size={24} {...avatar} alt={avatar.alt ?? user.name} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {children ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
            </DropdownMenuGroup>
            {children}
          </>
        ) : (
          <>
            {/* Default 選單集合 = app-shell.spec.md「入口開什麼」canonical(個人資料 / 設定 / 登出,
                登出獨立 group — 破壞性動作分區,對齊 GitHub / Gmail / Slack 帳號選單慣例) */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
              <DropdownMenuItem startIcon={User} onSelect={onViewProfile}>
                個人資料
              </DropdownMenuItem>
              <DropdownMenuItem startIcon={Settings} onSelect={onOpenSettings}>
                設定
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuItem startIcon={LogOut} onSelect={onSignOut}>
                登出
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
AccountMenu.displayName = 'AccountMenu'

// Story auto-compile metadata — F9 public 升級(2026-07-30)
// Phase 2 fill needed: purpose descriptions + when rationale
export const accountMenuMeta = {
  component: 'AccountMenu',
  family: null, // composite(trigger = chrome header 24px avatar;浮層 = DropdownMenu Family 1 消費者)
  variants: {},
  sizes: {}, // trigger avatar 24px density-fixed(header-canonical.spec.md 4.5),無 size 軸 → 兩欄留空為 intentional
  states: ['default', 'focus-visible'],
  tokens: {
    bg: [],
    fg: [],
    ring: ['--ring'], // trigger focus-visible ring canonical
  },
} as const
