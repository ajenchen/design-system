// Carousel 三層 story(展示 / 設計原則 / 設計規格)共用的示範照片(`_` 前綴 = 示範用的私有 helper,不進 index;同 Calendar/_calendar-demo.tsx)。
//
// 為什麼三層共用一份:2026-11-18 前三層各寫一份 seed,原則頁的註解寫「跟展示頁「首頁主視覺橫幅」同一組城市照片」
// 「同展示頁「商品圖片輪播」那組耳機照片」。展示頁因稽核 A113(圖文不符)換了照片,原則頁與設計規格頁沒跟上 ——
// 「推薦目的地 京都」照樣配海鷗照,兩句註解也變成錯的(PV2 反駁 #2)。照片只住這裡,「同一組」由 import 保證,不靠註解。
//
// 範例一律用真實照片(2026-05-16 audit codex Round 6):story 要教 carousel 真實裁切 / 內容裁切 / 視覺層次,
// gradient 抽象 block 教不到。Picsum.photos 提供 stable seeded photos(免登入 / 免 API key / 跨環境一致)。
// seed 只保證「同一個字每次同一張」,**不保證照片內容是那個字**:2026-11-18 前 seed/kyoto 是海鷗(Picsum 第 611 張)、
// seed/reykjavik 是車站電扶梯(1033)、seed/headphones-front 是森林溪流(466)—— 稽核 A113 圖文不符。
// 現在每張都先看過照片、再找轉址到那一張的 seed(`curl -sI https://picsum.photos/seed/<seed>/1/1` 的 location 帶 /id/<n>/,
// 2026-11-18 實查,同一個 seed 不論尺寸都是同一張)。不直接寫 /id/<n>/:瀏覽器閘的本機代換圖只認 /seed/ 與 /<w>/<h>,
// /id/<n> 會照常連網(scripts/lib/launch-browser.mjs picsumRoute「/id/<n> 要看站上圖庫有沒有那張」),離線就變儀器失效。

/** 示範照片網址。同一個 seed 不論尺寸都是同一張,三層各取自己要的尺寸。 */
export const demoPhoto = (seed: string, width: number, height: number) =>
  `https://picsum.photos/seed/${seed}/${width}/${height}`

/** 四個推薦目的地。city 會疊在照片上、tagline 是展示頁主視覺的標語 —— 兩者都要跟照片內容對得上。 */
export const CITY_PHOTOS = [
  { city: '京都', tagline: '秋日楓紅限定行程', seed: 'demo-1100' }, // Picsum 923:紅葉林間步道
  { city: '雷克雅維克', tagline: '極光季早鳥 8 折', seed: 'demo-1764' }, // 901:雪地上空的綠色極光
  { city: '里斯本', tagline: '歐洲西岸 7 日自由行', seed: 'demo-114' }, // 419:里斯本黃色電車
  { city: '峇里島', tagline: '熱帶度假村 · 含機加酒', seed: 'demo-1262' }, // 645:椰子樹
] as const

/** 商品名(展示頁「商品圖片輪播」)。2026-11-18 前是「無線降噪耳機 Pro」配 seed 照片:四張沒有一張是耳機,
 *  Picsum 也沒有同一副耳機的多角度照 → 改商品配照片。 */
export const LAPTOP_NAME = '輕薄筆電 13 吋'

/** 同一台筆電的八張照片(Picsum 第 0–9 張是同一組桌面系列,第 7 張沒有筆電、第 4 張只拍到一角,不用)。
 *  label = 這張拍的是什麼,給讀屏的圖片名稱用。前四張 = 展示頁「商品圖片輪播」;八張全部 = 原則頁「8 張商品總覽用 Grid」。
 *  第一張(輪播預設畫面)選底部中央偏暗的那張:指示點是白色、疊在照片上(carousel.spec.md「dots 疊在深色 / 圖片內容上」),
 *  原本第一張是亮白溪水,指示點對比 1.05(實量,見 8337d81c 的 commit 訊息)。 */
export const LAPTOP_PHOTOS = [
  { label: '使用情境', seed: 'demo-1977' }, // Picsum 5:雙手在筆電上打字
  { label: '正面', seed: 'demo-693' }, // 8:正面
  { label: '右前方', seed: 'demo-2522' }, // 2:右前方
  { label: '左前方', seed: 'demo-1959' }, // 0:左前方
  { label: '打字情境', seed: 'demo-1017' }, // 1:從肩後看雙手打字
  { label: '搭配手機', seed: 'demo-1391' }, // 3:筆電前手拿手機
  { label: '側面', seed: 'demo-129' }, // 6:側面
  { label: '桌面俯視', seed: 'demo-1090' }, // 9:正上方俯視
] as const
