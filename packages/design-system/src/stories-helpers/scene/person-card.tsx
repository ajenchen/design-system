import { fn } from '@storybook/test'
import { buildPersonProfileCard, type PersonData } from '@/design-system/components/PeoplePicker/person-display'

export interface SamplePerson {
  name: string
  /** 頭像圖;省略 = 首字 */
  avatarSrc?: string
  /** 名片副標;省略 = 「部門|部門代碼|員工編號」那一句(員工編號與下方欄位同一個值) */
  subtitle?: string
  /** 帳號 ID(預設欄位);同一個人在不同頁要同一個值(例:Ada Chen = ADACHEN,同 HoverCard 家族) */
  id?: string
  /** 員工編號(預設欄位);副標裡若也寫了員工編號,兩邊必須是同一個值 */
  employeeNumber?: string
  /** 在線狀態與狀態訊息(成對:線上不寫休假);省略 = 「離開」配休假訊息 */
  status?: PersonData['status']
  statusMessage?: string
}

/**
 * 名片三顆預設動作(傳訊息 / 語音通話 / 查看更多)在範例裡的反應:Storybook「Actions」面板記一筆
 * (`fn().mockName()` 的呼叫由 addon-actions 自動記錄;稽核 M102「展示層可以接 Storybook action」)。
 * 真實產品由 consumer 接到聊天、通話與個人頁(`../../components/Avatar/avatar.spec.md`「Avatar HoverCard 原則」消費者寫法)。
 * 2026-10-28 前接的是空函式 —— 點了沒有任何反應(登記簿 A16「一堆按鈕都無法正常反應」)。
 */
export function demoPersonActions(name: string) {
  return {
    onChat: fn().mockName(`傳訊息給 ${name}`),
    onCall: fn().mockName(`語音通話給 ${name}`),
    onViewProfile: fn().mockName(`查看 ${name} 的完整資料`),
  }
}

/**
 * story 共用的人員名片樣本 —— 滑過人員頭像 / 選單列頭像時浮出的那一張(avatar.spec.md「person avatar hover → ProfileCard」)。
 * 名片本身交給 DS 既有的建構器 `buildPersonProfileCard`(PeoplePicker/person-display.tsx;PersonAvatar / PeoplePicker / DataTable 人員格同一支),
 * 這裡只放樣本資料,不另組一份 ProfileCard(M17 / M23(d))。
 *
 * 2026-10-20 前同一段 ProfileCard 手抄在 5 支 story(item-anatomy 展示、Menu 展示、OverflowIndicator 展示 / 設計規格、Avatar 設計原則),
 * 每份都有同樣三個問題(M17:一份 bug 抄五次):
 * - 用 `fields` 傳兩個預設欄位(ProfileCard 的舊寫法,dev 會警告;預設欄名改成中文「員工編號」後會變成兩列重複);
 * - 副標寫員工編號 EMP-1001、欄位卻是 1234567(同一張卡兩個員工編號);
 * - 狀態「線上」配狀態訊息「Out of Office: Back on Monday!」(自相矛盾;獨立驗證 OV-V01 同族)。
 * 這裡定一次:狀態「離開」配休假訊息(可傳別的狀態,狀態與訊息要成對)、預設欄位走 PersonData 的 id / employeeNumber、預設動作接 demoPersonActions。
 */
export function samplePersonCard({
  name, avatarSrc, subtitle, id = 'YHANAX', employeeNumber = 'EMP-1001',
  status = 'away', statusMessage = '休假中,週一回來。急事請找 @Wei-Lun Cheng。',
}: SamplePerson) {
  return buildPersonProfileCard({
    name,
    avatarUrl: avatarSrc,
    description: subtitle ?? `Design｜D-0042｜${employeeNumber}`,
    status,
    statusMessage,
    id,
    employeeNumber,
    ...demoPersonActions(name),
  })
}
