/**
 * 範例人員照片名冊 —— 全 DS 範例裡「人」的臉只住這一份(M17;對外入口是 `stories-helpers/scene/person-card.tsx`)。
 *
 * 由來:user 2026-11-11「此外avatar的部分是否可以盡量都用真實圖片？目前的呈現方式也合規，但希望除了 avatar 本身元件與範例之外的範例可以美觀一點」。
 * 之前各檔自己寫 `https://i.pravatar.cc/48?u=<字串>`,字串雜湊到哪張臉沒人看過:目前登入者 Alan Chen 是女性臉、Alice 是男性鬼臉、
 * 設計原則頁的 Bob Lin 是幼兒、同一個 `u=bob` 同時給 Bob Lin 與 Bob Christopher Chen;另有 19 處只顯示縮寫。
 *
 * 規則(閘 `scripts/demo-people-roster-invariant.mjs` 機械檢查):
 * 1. 網址一律 `https://i.pravatar.cc/<px>?img=<n>` —— px 只能一段數字且 ≤ 1000(取顯示尺寸 ×2),瀏覽器閘的本機替身
 *    (`scripts/lib/launch-browser.mjs` pravatarRoute)才接得上;不得省參數、不得亂數或時間(story-determinism)。
 * 2. 同一個人全 DS 同一張臉(名字 → 編號只有這一張表);同一支 story 檔裡不同人不共用臉。
 *    跨檔可以共用(可用的臉比名字少):例 Dialog 成員清單 30 人各一張,其中有些臉在別支檔是另一個人。
 * 3. 臉要在 24–32px 也認得出來:正面或四分之三側臉、看得到眼睛、單一成人、沒被杯子 / 手 / 帽子 / 墨鏡遮住、不是重度藝術處理;
 *    臉的性別觀感配名字(名字性別不明確的 Alex / Jamie / Yuki 依原頁用法)。不合格的臉列在 `DEMO_FACE_UNUSABLE`,名冊不得引用。
 * 4. 字串型人員值只會顯示縮寫(PeoplePicker/person-display.tsx `toPersonData`)—— 要顯示照片就傳人員物件(`demoPersonData`)。
 *
 * Avatar 元件自己的頁(components/Avatar/**)寫死的照片示範不歸本名冊管;它們經 SAMPLE_PEOPLE 拿到的名片照片仍走本名冊。
 */
export const DEMO_PERSON_PHOTO = {
  // ── 高曝光(目前登入者與名錄常客):各給最清楚的彩色正面臉 ──
  'Alan Chen': 59,
  'Ada Chen': 32,
  'Alice Chen': 26,
  'Bob Lin': 8,
  'Betty Wu': 45,
  張美真: 23,
  林伯彥: 13,
  // ── SAMPLE_PEOPLE 名錄其餘成員(Avatar 頁名片也吃這份) ──
  'Bob Wang': 51,
  'Carol Lee': 16,
  'Dave Lin': 60,
  'Alex Wang': 21,
  'Ben Liu': 66,
  'Bella Wu': 36,
  // ── AppShell 示範 ──
  'Jamie Lin': 18,
  'Sophia Wang': 34,
  // ── DataTable 人員欄 ──
  'Alice Wonderland Wang': 21,
  'Bob Christopher Chen': 68,
  'Carol Liu': 34,
  'Alexander Hamilton Zhang': 69,
  'David Wu': 3,
  'Elizabeth Montgomery Johnson': 16,
  'Charlie Wu': 60,
  'Diana Huang': 43,
  // ── PeoplePicker ──
  'Eric Tsai': 12,
  'Fiona Lee': 27,
  'Carol Wu': 19,
  'David Lee': 17,
  'Emma Yang': 5,
  // ── Menu ──
  'Carol Lin': 25,
  // ── HoverCard / OverflowIndicator / SelectMenu / SelectionItem 中文名錄 ──
  黃怡君: 47,
  王文彬: 18,
  李思妤: 44,
  吳冠霆: 54,
  蔡佳芸: 36,
  陳俊宇: 12,
  周思涵: 43,
  // ── Sidebar / Skeleton / motion token ──
  林雅婷: 44,
  陳柏翰: 51,
  張詠晴: 5,
  王俊傑: 70,
  陳小明: 64,
  陳美惠: 21,
  // ── ProfileCard 長姓名換行 ──
  'Alexander Benjamin Christopher Davidson-Williams III': 17,
  // ── Dialog 成員清單(30 人同一支檔:30 張臉互不重複) ──
  'Charlie Lee': 63,
  'Diana Kim': 43,
  'Ethan Park': 12,
  'Fiona Lin': 9,
  'George Ho': 60,
  'Hana Yu': 47,
  'Ivan Sun': 3,
  'Julia Shen': 44,
  'Kevin Hsu': 54,
  'Lydia Cao': 36,
  'Mark Tseng': 66,
  'Nina Pan': 27,
  'Oscar Lo': 68,
  'Peggy Qin': 28,
  'Ray Tang': 69,
  'Sophia Fei': 19,
  'Tom Liang': 70,
  'Uma Jiang': 34,
  'Victor Ren': 13,
  'Wendy Xia': 21,
  'Xavier Ma': 64,
  'Yuki Du': 23,
  'Zach Feng': 17,
  'Amy Zhao': 16,
  'Brad Fan': 18,
  'Cathy Miao': 25,
  'Derek Qu': 51,
  'Elena Xu': 5,
} as const satisfies Record<string, number>

/** 名冊裡的人名 —— 打錯字編譯就紅(`npm run build:lib` / typecheck:stories)。 */
export type DemoPersonName = keyof typeof DEMO_PERSON_PHOTO

/**
 * 不得用的臉(pravatar `?img=1..70` 逐張看過,2026-11-11):24–32px 認不出人、或不適合當商務範例的人像。
 * 名冊引用其中任何一張,閘就紅。理由逐字寫在這裡,換臉前先看這張表。
 */
export const DEMO_FACE_UNUSABLE = {
  1: '兩人同框',
  2: '幼兒',
  4: '兒童',
  6: '誇張鬼臉',
  7: '黑白、戴帽低頭,臉被遮',
  10: '墨鏡 + 雙手捧臉',
  11: '墨鏡',
  14: '墨鏡 + 棒球帽',
  15: '墨鏡、吐舌',
  20: '側臉低頭,看不到眼睛',
  22: '喬裝眼鏡加假鬍子',
  24: '杯子遮住下半臉',
  29: '草帽遮住一眼',
  30: '大笑閉眼',
  31: '飛行員墨鏡',
  33: '墨鏡',
  35: '與 34 同一人(同一畫面會像同一個人)',
  37: '兒童',
  38: '臉轉開',
  39: '小黃瓜片蓋眼',
  40: '角色扮演服裝、雙手擋在臉前',
  41: '側臉、毛帽,小尺寸看不到眼睛',
  42: '兒童 / 青少年',
  46: '兒童',
  48: '側臉',
  49: '墨鏡',
  50: '喬裝眼鏡加假鬍子',
  52: '鏡面墨鏡',
  53: '畫面有第二人 + 逆光',
  55: '黑白側臉、樂器擋臉',
  56: '極暗,臉在陰影裡',
  57: '黑白高反差、臉朝上看不到正臉',
  58: '相機擋臉',
  61: '側臉、叼菸斗、逆光',
  62: '閉眼、泡在水中',
  65: '牛仔帽裝扮,且疑似公眾人物',
  67: '相機擋臉',
} as const satisfies Record<number, string>

/** pravatar 照片網址;px = 顯示尺寸 ×2(高 DPI),只能一段整數且 ≤ 1000(本機替身的形狀)。 */
export function demoPersonPhoto(name: DemoPersonName, px: number): string {
  if (!Number.isInteger(px) || px < 1 || px > 1000) {
    throw new Error(`demoPersonPhoto(${name}): px 必須是 1–1000 的整數,收到 ${px}`)
  }
  return `https://i.pravatar.cc/${px}?img=${DEMO_PERSON_PHOTO[name]}`
}
