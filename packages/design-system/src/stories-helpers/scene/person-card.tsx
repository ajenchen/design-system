import { fn } from '@storybook/test'
import { buildPersonProfileCard, type PersonData } from '@/design-system/components/PeoplePicker/person-display'
import { demoPersonPhoto, type DemoPersonName } from '../data/people'

// 照片名冊住 data/people.ts(純資料);對外一律從這支匯入(同一個人全 DS 同一張臉,user 2026-11-11)
export { DEMO_PERSON_PHOTO, DEMO_FACE_UNUSABLE, demoPersonPhoto, type DemoPersonName } from '../data/people'

/**
 * 名冊裡的人轉成 DS 人員物件(PersonData)—— 給 DataTable 人員欄 / PeoplePicker 已選值 / AgentPanel 表單這類吃 PersonValue 的地方。
 * 字串型人員值只會顯示縮寫(person-display.tsx `toPersonData`),要顯示照片就傳這個物件。
 * px = 顯示尺寸 ×2;`extra` 補部門 / 狀態等欄位(照片欄位不得覆寫 —— 同一個人同一張臉)。
 */
export function demoPersonData(name: DemoPersonName, px = 96, extra: Omit<Partial<PersonData>, 'name' | 'avatarUrl'> = {}): PersonData {
  return { ...extra, name, avatarUrl: demoPersonPhoto(name, px) }
}

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

// 範例人員名錄 —— 同一個人在全 DS 範例裡用同一組資料(2026-10-28 收成一份;之前 Ada Chen 在 HoverCard 頁是 ADACHEN / 1048217、
// 在 ProfileCard 設計規格是 EMP-2101,同一個人兩套編號)。副標 = {部門}｜{ID}｜{員工編號}(user 2026-04-22 10:27 定的格式),
// ID / 員工編號與名片的預設欄位同值;狀態與狀態訊息成對(線上不寫休假)。用 `samplePersonCard(SAMPLE_PEOPLE.ada)` 取名片,
// 本身會帶名片的 DS 元件(PersonDisplay 等)用 `samplePersonData(...)` 取同一筆資料。
export const SAMPLE_PEOPLE = {
  ada: {
    name: 'Ada Chen',
    avatarSrc: demoPersonPhoto('Ada Chen', 128),
    subtitle: 'Design｜ADACHEN｜1048217',
    id: 'ADACHEN',
    employeeNumber: '1048217',
    status: 'online',
    statusMessage: '正在處理 login 頁重構',
  },
  alice: {
    name: 'Alice Chen',
    avatarSrc: demoPersonPhoto('Alice Chen', 128),
    subtitle: 'Design｜ALICEC｜1031406',
    id: 'ALICEC',
    employeeNumber: '1031406',
    status: 'away',
    statusMessage: '休假中,週一回來。急事請找 @Wei-Lun Cheng。',
  },
  bob: {
    name: 'Bob Lin',
    avatarSrc: demoPersonPhoto('Bob Lin', 128),
    subtitle: 'Engineering｜BOBLIN｜1027734',
    id: 'BOBLIN',
    employeeNumber: '1027734',
    status: 'busy',
    statusMessage: '會議中,15:00 後回覆',
  },
  // ↓ Avatar 頁(展示 / 設計原則)用到的成員:補上各自的部門 / ID / 員工編號與成對的狀態(2026-10-28,OV-pe6);
  //   照片 2026-11-11 起走照片名冊(之前各自 `?u=` 雜湊,Bob Wang 是女性臉、Dave Lin 是蓋眼的女性臉)
  bobWang: {
    name: 'Bob Wang',
    avatarSrc: demoPersonPhoto('Bob Wang', 128),
    subtitle: 'Engineering｜BOBWANG｜1035518',
    id: 'BOBWANG',
    employeeNumber: '1035518',
    status: 'online',
    statusMessage: '在座位上,可以直接找我',
  },
  carol: {
    name: 'Carol Lee',
    avatarSrc: demoPersonPhoto('Carol Lee', 128),
    subtitle: 'Design｜CAROLL｜1039952',
    id: 'CAROLL',
    employeeNumber: '1039952',
    status: 'online',
    statusMessage: '今天進辦公室',
  },
  dave: {
    name: 'Dave Lin',
    avatarSrc: demoPersonPhoto('Dave Lin', 128),
    subtitle: 'Product｜DAVEL｜1042210',
    id: 'DAVEL',
    employeeNumber: '1042210',
    status: 'busy',
    statusMessage: '客戶會議中,16:00 後回覆',
  },
  alex: {
    name: 'Alex Wang',
    avatarSrc: demoPersonPhoto('Alex Wang', 128),
    subtitle: 'Engineering｜ALEXW｜1036625',
    id: 'ALEXW',
    employeeNumber: '1036625',
    status: 'busy',
    statusMessage: '專心處理上線問題,訊息晚點回',
  },
  ben: {
    name: 'Ben Liu',
    avatarSrc: demoPersonPhoto('Ben Liu', 128),
    subtitle: 'Product｜BENLIU｜1041187',
    id: 'BENLIU',
    employeeNumber: '1041187',
    status: 'away',
    statusMessage: '午休中,13:30 回來',
  },
  bella: {
    name: 'Bella Wu',
    avatarSrc: demoPersonPhoto('Bella Wu', 128),
    subtitle: 'Marketing｜BELLAW｜1029903',
    id: 'BELLAW',
    employeeNumber: '1029903',
    status: 'offline',
    statusMessage: '已下班,明天 9:00 上線',
  },
} satisfies Record<string, SamplePerson>

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
 * story 共用的人員名片樣本 —— 滑過人員頭像 / 選單列頭像時浮出的那一張(avatar.spec.md「Avatar HoverCard 原則」)。
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
export function samplePersonCard(person: SamplePerson) {
  return buildPersonProfileCard(samplePersonData(person))
}

/**
 * 同一筆樣本轉成 DS 的人員資料(PersonData)—— 給本身就會帶名片的 DS 元件(PersonDisplay 等)直接吃;
 * 名片的建構仍在元件內走 buildPersonProfileCard,這裡不另組。預設值同 samplePersonCard。
 */
export function samplePersonData({
  name, avatarSrc, subtitle, id = 'YHANAX', employeeNumber = 'EMP-1001',
  status = 'away', statusMessage = '休假中,週一回來。急事請找 @Wei-Lun Cheng。',
}: SamplePerson): PersonData {
  return {
    name,
    avatarUrl: avatarSrc,
    description: subtitle ?? `Design｜D-0042｜${employeeNumber}`,
    status,
    statusMessage,
    id,
    employeeNumber,
    ...demoPersonActions(name),
  }
}
