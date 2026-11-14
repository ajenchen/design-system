#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 不在 AppShell 裡、單獨使用的 Sidebar,按開關(SidebarTrigger)真的收起來 —— `collapsible="icon"` 收起後外框寬 = `--sidebar-width-icon`、
 *         細列上第一個選單項點得到(不 inert、不 aria-hidden、命中測試打得到它);`collapsible="offcanvas"` 收起後外框寬 0、裡面的選單項 inert +
 *         aria-hidden(看不到的不留在 Tab 順序);再按一次回到 `--sidebar-width`、選單項可操作。量的是**寬度本身**與**點得到**,不讀 class(M37)。
 *         收成細列後另量:細列裡放什麼,列鈕的版面都不比看得到的寬(sidebar.spec.md「Collapsible」的「收起後的寬」;elevation.spec.md「浮層間距」),
 *         單獨使用的細列與 AppShell 的細列(主側欄佈局按開關)都量,完整佈局與 AppShell 主側欄另量寬鬆密度:
 *           R1 細列上每一顆列鈕的版面矩形都在細列看得到的範圍內(看得到的範圍 = 列鈕矩形與每一層 overflow 非 visible 祖先的 padding box 取交集);
 *           R2 / R3 滑鼠停在列鈕上、鍵盤聚焦列鈕時打開的 Tooltip:左緣 − 列鈕看得到的右緣 = `OVERLAY_SIDE_OFFSET`(值從 overlay-geometry.ts 讀,不寫死);
 *           R4 鍵盤聚焦框四邊完整:焦點框(往內畫的 outline)每一邊的中線取樣點,命中測試都打到列鈕本身(被裁掉 / 被蓋住就打不到);
 *           R3k 真按 Tab(不是程式聚焦)走到細列列鈕:AppShell 主標頭佈局 820×700 一開始就是細列、全域標頭比視窗寬,Tab 途中外層捲動容器會先捲到右邊、
 *               走到細列時瀏覽器再把它捲回來 —— Tooltip 打開後過 TAB_PERSIST_MS 仍開著、左緣 − 列鈕看得到的右緣 = `OVERLAY_SIDE_OFFSET`
 *               (tooltip.spec.md「A11y 預設」「Tab — focus trigger 時顯示」;途中容器一次都沒捲 = 這格沒量到聚焦捲動 = 儀器失效);
 *           量的列鈕 = 捲動區裡第一顆 + 帳號列(有的話)。
 *           另在完整佈局的細列放三種「會讓列鈕比細列寬」的東西再量 R1–R4(標準 / 寬鬆密度;DS 沒有範例這樣放,由閘注入,並先證明它真的比細列寬):
 *           `SidebarMenuSkeleton showIcon` 與 `SidebarInput` 的同幾何元素(最小寬比細列寬 → 撐開捲動區內容層:SidebarContent 的 ScrollArea 開 `fillX` 管);
 *           第一顆列鈕掛上「有列尾動作」時的預留右內距(左內距 + 右內距比細列寬 → 撐開列鈕自己:列鈕細列時 `!pr-0` 管)。
 *         細列內容比視窗高時(1440×230:完整佈局標準與寬鬆密度、混合前綴標準密度、AppShell 主側欄標準與寬鬆密度)滑過細列:
 *           R5 直捲軸出現、整條在細列看得到的範圍內、命中測試打得到它;R6 捲軸那一欄不與任何圖示 / 頭像那一欄重疊;
 *           R7 捲軸浮出時,列鈕伸到捲軸底下的那段照樣點得到 —— 沿每顆列鈕中線逐 px 命中測試,滑塊畫到的地方 = 滑塊、其餘(含透明軌道)= 列鈕;
 *              真指標停在軌道上:列鈕 :hover、細列列鈕的 Tooltip 打開;按住滑塊拖 24px 捲動位置往下、軌道上滾輪往上捲動位置往上。
 *              只量細列:細列軌道不接指標是 Sidebar 細列自己的規則(sidebar.spec.md「收起後的寬」),展開時與全 DS 其他捲動區照 ScrollArea 通則(點軌道跳頁)。
 *         收合前後圖示中心不動(R8;sidebar.spec.md「尺寸規範」`--sidebar-width-icon` 那一列的幾何保證)—— 真按開關,展開量一次、收成細列再量一次:
 *           R8a 圖示中心(相對側欄外框左緣)展開 = 收合;
 *           R8b 收合外框寬 = 2 × 當下的 `--layout-space-loose`(探針量)+ 畫出來的圖示寬(量 svg),不寫死數字;
 *           R8c(只在 AppShell 裡)AppShell 自己量到的細列寬(`[data-token-probe="rail"]`)= 側欄收合外框寬;
 *           R8d 收合外框寬 = 規格「尺寸規範」寫的那一格(值從 sidebar.spec.md 讀:一般 / 大密度 × 側欄 size sm·md / lg 四格,不在閘裡另寫一份);
 *           格子(RAIL_CENTER_CASES,十二格。R8 的格名用規格的叫法「一般 / 大密度」(density.spec.md;R8d 比的就是規格那四格),
 *           R1–R7 既有的格名沿用 Storybook 工具列的叫法「標準 / 寬鬆」—— 同一件事,這次沒有改既有的格名):
 *           完整佈局一般 / 大密度(size md)、AppShell「狀態行為」一般 / 大密度 × size md / lg(`&args=menuSize:lg`)、
 *           一般密度頁面裡 `data-density="lg"` 的區塊(掛在 SidebarProvider 外面那一層 / 裡面的側欄外框,由閘掛上,DS 沒有這種範例;size md)、
 *           單獨使用 × size lg 一般 / 大密度(閘自己的夾具 scripts/test-fixtures/sidebar-rail-center/fixture.tsx,DS 沒有這種範例)、
 *           同一支夾具 × size lg 再把密度掛在側欄外框上(一般密度頁面掛大密度 → 68;大密度頁面鎖回一般密度 → 52):SidebarProvider 外層設的圖示欄(20)
 *           要穿過外框這道密度邊界繼承下去。size md 的區塊格驗不到這件事 —— 16 剛好等於備用值 1rem,繼承斷了照樣綠(2026-11-13 審查實測)。
 *           只量「圖示列、沒開全域前綴對齊」:頭像列與開了 `uniformPrefix` 的混用列收合時移到細列中線是 item-anatomy.spec.md 的既有規則,不在這條保證裡。
 *         另有靜態段:全 DS 的 `.tsx` / `.ts` 沒有任何元素在自己身上同時帶 `group` 與 `group-*` 變體、或 `peer` 與 `peer-*` 變體
 *         (Tailwind 的 `group-*` 編譯成後代選擇器、`peer-*` 編譯成兄弟選擇器,都比不到自己 → 靜默失效;2026-10-14 Sidebar 收合寬就是這樣失效的)。
 *         一個元素的 class 來源 = `className=` 屬性與 `cn(` / `clsx(` / `twMerge(` / `cva(` 的引數(TypeScript 語法樹;疊加變體、具名 group 都算)。
 *   紅: 任一則 story 收起後寬度不符、細列選單項點不到、offcanvas 收起後選單項仍可聚焦、展開後選單項不可操作、R1–R6 任一格不符,或靜態段找到違規 → exit 1。
 *       `--selftest` 兩種對照組:(a) 靜態:把 2026-10-14 那段 Sidebar 寫法(逐字)與同一陷阱的 8 種其他寫法(cva / cn 變數 / peer / 疊加變體 /
 *           具名 group / clsx / 樣板字串;2026-10-20 r1b 複核 D5)餵給掃描器都必須被抓到,6 種乾淨寫法不得誤報;
 *       (b) 頁面:注入 CSS 把收起的外框寬釘回 `--sidebar-width`(= 2026-10-14 的實際症狀)每一則都必須紅;
 *           注入腳本拿掉寬 0 那一份的 inert,offcanvas 那則必須紅;
 *           注入 CSS 把細列的內層釘回 `--sidebar-width`(= 2026-05-21 → 10-27 的實際症狀:Tooltip 離細列 201px、焦點框缺右邊、捲軸畫在被裁掉的右緣)
 *           → 每一則細列 story(含 AppShell)R1 紅、R2 / R3 / R4 / R5 都紅;
 *           拿掉 `fillX`(內容層放回 Radix 預設的 `display: table`)→ 放了骨架列 / 搜尋框的細列 R1–R4 都紅(標準 / 寬鬆);
 *           拿掉列鈕的 `!pr-0` → 預留列尾動作右內距的細列 R1–R4 都紅(標準 / 寬鬆);
 *           Tooltip 外殼右移 4px → R2、R3 紅;細列捲軸 visibility:hidden(= 不出捲軸)→ R5 紅;捲軸加寬到 28px → R6 紅;
 *           Tab 到細列列鈕 300ms 後再派一次外層捲動容器的 scroll(= 修前症狀:捲動把剛打開的 Tooltip 關掉)→ R3k 紅;
           捲軸軌道接指標(= 2026-10-28 修前:軌道蓋住列鈕右側約 10px)→ 每一格細列捲軸 case R7 紅;滑塊也不接指標(拖不動)→ 每一格 R7 紅;
 *           R8 五種(注入 CSS;前兩種要 `!important` 才蓋得過 SidebarProvider 外層的 inline 值,第三、四種蓋的是樣式檔的規則與 AppShell 探針的寬):圖示欄固定 20(= 2026-05-26 → 11-13 的實際症狀:圖示欄跟密度不跟 size)
 *           → size md 的六格 R8a / R8b / R8d 紅、size lg 的六格維持綠;圖示欄固定 16 → size lg 的六格紅、size md 的六格維持綠;
 *           SidebarProvider 外層不重算細列寬(= 樣式檔的選擇器漏了外層)→ size lg、而且外層與側欄外框之間沒有再換密度的四格(A3 / A4 / F1 / F2)紅,
 *           其餘八格維持綠(size md 的六格本來就等於備用值;F3 / F4 的側欄外框自己是換密度的元素,公式在外框上重算,不靠外層算好的值);
 *           AppShell 的細列量值探針釘成 40px(= AppShell 量到的寬與側欄實際寬脫鉤)→ AppShell 四格 R8c 紅、其餘規則與其餘格維持綠;
 *           在換密度的元素上把圖示欄重設成 1rem(= 圖示欄沒有穿過密度邊界繼承下去;不加 `!important`,SidebarProvider 外層自己的 inline 值不受影響)
 *           → 只有 F3 / F4 的 R8a / R8b / R8d 紅、其餘十格維持綠(2026-11-13 審查實測:還沒有這兩格時,這種破法十格全綠 = 當時的盲點)。
 *           另有 R8 判定表(純計算):前 6 列取自 2026-11-13 修前 / 修後建置的實量(修前 size lg 的兩列是夾具量的 = 這次的程式配修前的樣式),
 *           第 7、8 列是同日審查實測的 F3 / F4 破法數字,最後 4 列是邊界情境(設想的數字);
 *           修前大密度 × size md(展開 32 / 收合 34 / 外框 68)、修前一般密度 × size lg(26 / 24 / 48)與審查實測的兩列(34 / 32 / 64、26 / 24 / 48)必紅,其餘實量列必綠。
 *       story 開不起來 = 儀器失效,點名 story、exit 1。該有 Tooltip 的列鈕一格都沒量到、聚焦後不是 :focus-visible、焦點框往外畫(本量法只量往內畫的框)、
 *       細列內容沒有比視窗高(量不到捲軸)= 儀器失效(量不到不等於沒問題,M37 第八形);R7 沒有列鈕伸到軌道底下、找不到離開滑塊的列 = 該格紅(不放行)。
 *       R8 量不到(找不到帶圖示的列鈕、一開始不是展開、畫出來的圖示不是要量的那個 size、密度沒切到、開了全域前綴對齊)= 那一格紅並標「儀器失效」、其餘格照量,
 *       結尾另印 INSTRUMENT-FAIL、exit 1(對照組裡量不到的格不算「被抓到」)。
 *   綠: 六則 story 收起 / 展開兩步都符合、R1–R8 全部相符(含寬鬆密度、放了骨架列 / 搜尋框 / 預留動作內距的細列、AppShell 細列捲軸、收合前後圖示中心十二格)、靜態段 0 違規時綠。寬度比到 0.75px(瀏覽器以小數 px 排版),Tooltip 間距比到 1px。
 *
 * 出處:2026-10-15 r1b 複驗 F1(P0)—— 單獨使用的 Sidebar `icon` / `offcanvas` 收起後外框仍 240(main 是 48 / 0),offcanvas 還把看得到的選單設 inert +
 * aria-hidden(看得到、點不到、讀不到)。根因:sidebar.tsx 把 `group-data-[collapsible=…]:!w-…` 寫在帶 `group` 的那個元素自己身上。
 * 那天 test:app-shell-layout / test:sidebar-menu-keyboard 全綠 —— 沒有任何閘量「單獨使用時收起後的寬」。規則:sidebar.spec.md「Collapsible」。
 * R1–R6:2026-10-21 user:「我發現 sidebar 變成 icon only的時候，每個sidbar menu item 的tooltip距離 sidebar好遠，你確保你知道我在講的問題是什麼，並查證root cause」。2026-05-21 起細列內層保持展開寬、
 * 只靠外框裁 → 列鈕版面 240、Tooltip 錨在被裁掉的右緣(248)、離細列 201px;本閘先前只量外框寬(48 本來就對),沒有任何一格量「裡面的東西」。
 * 量的是使用者看到的距離(Tooltip ↔ 列鈕看得到的右緣),不是「Tooltip ↔ 列鈕矩形」—— 後者在內層 240 時照樣 = 8(錨點就是那個 240 的矩形),
 * 量它等於拿症狀的原因當答案(M37)。放骨架列 / 搜尋框那幾格:2026-10-27 獨立審查實測 —— 細列放 `SidebarMenuSkeleton showIcon`,Radix 的 `display: table` 內容層被撐到 56
 * (寬鬆 72)、放 `SidebarInput` 被撐到 212,所有列鈕跟著變寬,Tooltip 離細列 17px(寬鬆 13px)/ 173px、焦點框右邊被裁;第一版只靠列鈕自己的右內距歸零,
 * 只壓住已知的那一個元素(M12 表層修法)。內容層鎖住之後,列鈕自己的內距仍可能比細列寬(有列尾動作的列),所以兩件事各量一組。R5 / R6:2026-10-21 user 回 E3:「ds規定本來就應該盡量讓使用者在各種情況下都能看完完整內容吧？如果不出現捲軸要如何看完完整內容？？？」。
 * R7:2026-10-27 獨立審查實測 —— E3 乙的細列捲軸浮出時蓋住每顆列鈕右側約 10px(標準密度 x37–47、寬鬆 x57–67 打到捲軸),選中底色與焦點框畫到 47、
 * 點與 Tooltip 只到 37。跟 hit-area-canonical「懸停回饋形狀 ≡ 命中區」衝突,屬產品取捨;2026-10-28 user 選「只在側欄細列讓軌道不接收滑鼠」(回覆原文「乙：只在側欄細列讓軌道不接收滑鼠。照這樣」)。
 * (2026-10-28 先前一版 82490733 把全 DS 捲軸軌道都改成不接指標、還引了 2026-09-04 那則講「浮在表格上方的高層按鈕」的話當依據 —— 情境不同,已回退 fce86582。)
 * R8:2026-11-13(來源是既有規格與 git 歷史,AI 的工程判斷;user 沒有決定過這個改法,只問過一句,原話見 token-system.spec.md「搬家與收回的紀錄」)。細列寬公式裡的圖示欄 2026-05-26(commit 3d79e867)起誤跟密度走,
 * 畫出來的圖示卻跟側欄的 size 走 —— 兩者不同檔的兩格,圖示收合前後各跳 2px(大密度 × size md 往右、一般密度 × size lg 往左)。
 * 毛病存在的五個多月(2026-05-26 → 11-13)裡沒有任何閘量圖示中心;本閘是 2026-10-15 那次複驗之後才有的(見上方出處;進 main 是 2026-11-06 的 commit 8eb473c7),而且只量「外框寬 = `--sidebar-width-icon`」(上方收起那一格):
 * 那顆變數自己算錯時這條照樣綠(M37:拿「等於那顆 token」代替「圖示不動」)。
 * R8a 量性質本身;R8d 另把規格寫的數字釘在量到的寬上(2026-07-14 的稽核把規格的 64 改成 68 去遷就程式,沒有任何東西會紅)。
 *
 * Run: `node scripts/sidebar-standalone-collapse-invariant.mjs [--static=<dir>] [--selftest]`(預設讀 `storybook-static`)
 */
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { FixtureInstrumentError, startStorybookCssFixture } from './lib/storybook-css-fixture.mjs'
import {
  openStory,
  parkPointer,
  StoryRenderInstrumentError,
  INSTRUMENT_FAIL_MARKER,
  launchBrowserOrSkip,
  requireFreshStorybookBuild,
  settleAfterInteraction,
} from './lib/launch-browser.mjs'

const ROOT = process.cwd()
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(ROOT, staticArg)) : join(ROOT, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const TOL = 0.75
const SETTLE_FRAMES = 10
// 浮層與觸發元件的間距 SSOT(tokens/elevation/overlay-geometry.ts);讀原始碼,不在閘裡另寫一份 8
const OVERLAY_SIDE_OFFSET = Number(/export const OVERLAY_SIDE_OFFSET = (\d+)/.exec(readFileSync(join(ROOT, 'packages/design-system/src/tokens/elevation/overlay-geometry.ts'), 'utf8'))?.[1])
if (!Number.isFinite(OVERLAY_SIDE_OFFSET)) { console.error('✗ 讀不到 OVERLAY_SIDE_OFFSET(overlay-geometry.ts)—— 儀器失效'); process.exit(1) }
// R8 用:每個 size 畫出來的圖示寬 SSOT(patterns/element-anatomy/item-anatomy.tsx 的 ICON_SIZE);讀原始碼,不在閘裡另寫一份 16 / 16 / 20
const ICON_SIZE = Object.fromEntries([...(/export const ICON_SIZE: Record<RowSize, number> = \{([^}]*)\}/.exec(readFileSync(join(ROOT, 'packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx'), 'utf8'))?.[1] ?? '').matchAll(/\b(sm|md|lg):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]))
if (!['sm', 'md', 'lg'].every((k) => Number.isFinite(ICON_SIZE[k]))) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:讀不到 ICON_SIZE 的 sm / md / lg(item-anatomy.tsx)`); process.exit(1) }
// R8d 用:細列寬四格數字的 SSOT = sidebar.spec.md「尺寸規範」`--sidebar-width-icon` 那一列(「一般密度 × sm / md = 2×16+16 = 48、…」;
// 密度的叫法照 density.spec.md:一般密度 = md、大密度 = lg);
// 讀規格,不在閘裡另寫一份 48 / 52 / 64 / 68。key = `<密度 md|lg>/<size sm|md|lg>`;同一格讀到兩個不同的數字、或缺任何一格 = 儀器失效(規格的寫法變了,先修這裡)
const SPEC_RAIL = (() => {
  const seen = {}
  for (const m of readFileSync(join(ROOT, 'packages/design-system/src/components/Sidebar/sidebar.spec.md'), 'utf8').matchAll(/(一般|大)密度 × (sm \/ md|lg) = [0-9×+]+ = (\d+)/g)) {
    for (const size of m[2] === 'lg' ? ['lg'] : ['sm', 'md']) (seen[`${m[1] === '大' ? 'lg' : 'md'}/${size}`] ??= new Set()).add(Number(m[3]))
  }
  const keys = ['md', 'lg'].flatMap((d) => ['sm', 'md', 'lg'].map((s) => `${d}/${s}`))
  const bad = keys.filter((k) => seen[k]?.size !== 1)
  if (bad.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:sidebar.spec.md「尺寸規範」讀不到細列寬(每格要正好一個數字):${bad.map((k) => `${k} → ${[...(seen[k] ?? [])].join(' / ') || '沒有'}`).join(';')}`); process.exit(1) }
  return Object.fromEntries(keys.map((k) => [k, [...seen[k]][0]]))
})()

// ── 靜態段:元素自己帶 `group`(或 `peer`)又在自己身上用 `group-*`(或 `peer-*`)變體 ──
// 一個元素的 class 來源 = JSX `className="…"` / `className={…}`,以及 `cn(` / `clsx(` / `twMerge(` / `cva(` 的引數
// (cva 的 base 與各 variant 都套在同一個元素上;`const c = cn(…)` 存成變數再給 className 也照樣抓)。
// 用 TypeScript 語法樹找區段(註解天然不算;`className={cn(…)}` 裡的 cn 已被外層區段涵蓋、不重算),區段裡的字串字面量合起來看。
// 2026-10-20 r1b 複核 D5:第一版只看 `className=` 屬性、只認 `group-` 開頭的單一變體 —— cva / cn 變數、`peer` + `peer-*`、
// 疊加變體(`md:group-hover:`)都漏(M7 / M34:閘的廣度要對齊規則的廣度,tailwind-gotchas 寫的是「全 DS」)。
const CLASS_CALLS = new Set(['cn', 'clsx', 'twMerge', 'cva'])
/** class 字串切成變體段 + 本體(冒號在 `[…]` / `(…)` 裡不算分隔) */
function splitVariants(token) {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth -= 1
    if (ch === ':' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return parts
}
/** 變體段是不是 group-* / peer-*;回 { kind, name }(name = 具名 group 的名字,沒有 = '') */
function relationalVariant(v) {
  const m = /^(group|peer)-(.+)$/.exec(v)
  if (!m) return null
  // 具名:結尾 `/<name>`,而且那個斜線不在 `[…]` 裡(`group-hover/item`、`group-data-[state=open]/menu`)
  let depth = 0, slash = -1
  for (let i = 0; i < m[2].length; i += 1) {
    const ch = m[2][i]
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth -= 1
    else if (ch === '/' && depth === 0) slash = i
  }
  return { kind: m[1], name: slash >= 0 ? m[2].slice(slash + 1) : '' }
}
/** 一個區段裡的 class 字串(物件的 key 不算,例如 cva 的 variant 名) */
function classStrings(node) {
  const out = []
  const visit = (n) => {
    if (ts.isPropertyAssignment(n)) { visit(n.initializer); return }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text)
    else if (ts.isTemplateExpression(n)) { out.push(n.head.text); for (const sp of n.templateSpans) { visit(sp.expression); out.push(sp.literal.text) } return }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}
export function selfGroupVariantSites(src, fileName = 'snippet.tsx') {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX)
  const regions = []
  const visit = (n) => {
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'className' && n.initializer) { regions.push(n.initializer); return }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && CLASS_CALLS.has(n.expression.text)) { regions.push(n); return }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  const hits = []
  for (const region of regions) {
    const tokens = classStrings(region).flatMap((x) => x.split(/\s+/)).filter(Boolean)
    // 這個元素自己是哪些 group / peer(`group`、`group/menu-item`、`peer`、`peer/name`)
    const markers = new Set(tokens.map((t) => /^(group|peer)(?:\/([\w-]+))?$/.exec(t)).filter(Boolean).map((x) => `${x[1]}/${x[2] ?? ''}`))
    if (!markers.size) continue
    const bad = tokens.filter((t) => splitVariants(t.replace(/^!/, '')).slice(0, -1).some((v) => { const r = relationalVariant(v); return !!r && markers.has(`${r.kind}/${r.name}`) }))
    if (bad.length) hits.push({ line: sf.getLineAndCharacterOfPosition(region.getStart(sf)).line + 1, tokens: [...[...markers].map((k) => k.replace(/\/$/, '')), ...bad] })
  }
  return hits
}
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n === 'storybook-static') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (n.endsWith('.tsx') || (n.endsWith('.ts') && !n.endsWith('.d.ts'))) acc.push(p)
  }
  return acc
}
function staticScan() {
  const files = walk(join(ROOT, 'packages/design-system/src'))
  const bad = []
  for (const f of files) for (const h of selfGroupVariantSites(readFileSync(f, 'utf8'), f)) bad.push(`${relative(ROOT, f)}:${h.line} ${h.tokens.join(' ')}`)
  return { files: files.length, bad }
}

// 2026-10-14 那段寫法(sidebar.tsx Sidebar 外框,逐字取自 be2f1324)—— 對照組 (a)
const PRE_FIX_SNIPPET = `        <div
          ref={ref}
          className={cn(
            "group peer relative shrink-0 text-foreground",
            // 單獨使用:寬度走 token(展開 \`--sidebar-width\`、細列 \`--sidebar-width-icon\`、offcanvas 0);在 AppShell 裡由 style 給
            !inShell && [
              "w-[var(--sidebar-width)]",
              "group-data-[collapsible=offcanvas]:!w-0",
              "group-data-[collapsible=icon]:!w-[var(--sidebar-width-icon)]",
            ],
            panel?.resizing ? "transition-none" : "transition-[width] duration-200 ease-linear motion-reduce:duration-0"
          )}
        >`
// 同一種陷阱的其他寫法(2026-10-20 r1b 複核 D5 抓到第一版全部漏掉)—— 每一種都必須被抓到
const RED_SNIPPETS = [
  ['cva 的 base 自己帶 group + group-*', `const v = cva("group relative group-data-[collapsible=icon]:!w-0", { variants: {} })\nconst X = () => <div className={v()} />`],
  ['cva 的 base 帶 group、variant 裡寫 group-*(同一個元素)', `const v = cva("group relative", { variants: { size: { sm: "group-hover:bg-muted" } } })`],
  ['cn 先存成變數再給 className', `const cls = cn("group peer", "group-data-[state=open]:w-0")\nconst X = () => <div className={cls} />`],
  ['peer + peer-* 寫在自己身上(兄弟選擇器,同樣比不到自己)', `const X = () => <input className="peer peer-checked:bg-primary" />`],
  ['疊加變體(md:group-hover:)', `const X = () => <div className={cn("group", "md:group-hover:opacity-100")} />`],
  ['具名 group 配同名變體', `const X = () => <li className="group/item group-hover/item:bg-muted" />`],
  ['clsx + 單引號', `const X = () => <div className={clsx('peer', 'peer-focus-visible:ring-2')} />`],
  ['樣板字串', 'const X = ({ x }) => <div className={`group ${x} group-data-[open=true]:w-0`} />'],
]
const CLEAN_SNIPPETS = [
  // group 在父層、變體在子層(正確用法)
  `<div className="group peer"><span className="group-data-[collapsible=icon]:hidden" /></div>`,
  // 具名 group(group/menu-item)配不具名的變體:變體找的是祖先那個不具名的 group,不是自己
  `<li className={cn("group/menu-item relative", "group-data-[collapsible=icon]:hidden")} />`,
  // 註解裡提到不算
  `<div className={cn("group", /* group-data-[x]:w-0 */ "w-4")} />`,
  // peer 在前一個兄弟、peer-* 在後一個兄弟(正確用法)
  `<label><input className="peer sr-only" /><span className="peer-checked:bg-primary" /></label>`,
  // 具名 group 配別的名字的變體
  `<li className="group/item group-hover/menu:bg-muted" />`,
  // cva 的 variant 名剛好叫 group(物件的 key 不是 class)
  `const v = cva("relative", { variants: { group: { true: "group-hover:underline" } } })`,
]
// ── 頁面段 ──
// tooltip:這則 story 的細列列鈕有沒有給 `tooltip`(狀態行為的即時示範沒給 → 那則不量 R2 / R3,R1 / R4 照量)
const STORIES = [
  { id: 'design-system-components-sidebar-展示--icon-collapse', mode: 'icon', tooltip: true },
  { id: 'design-system-components-sidebar-展示--group-action', mode: 'icon', tooltip: true },
  { id: 'design-system-components-sidebar-展示--mixed-content', mode: 'icon', tooltip: true },
  { id: 'design-system-components-sidebar-展示--integration-sidebar', mode: 'icon', tooltip: true },
  { id: 'design-system-components-sidebar-展示--offcanvas', mode: 'offcanvas' },
  { id: 'design-system-components-sidebar-設計規格--state-behavior', mode: 'icon', tooltip: false },
]
// AppShell 的細列(同一個判斷式的 AppShell 分支):主側欄佈局在 1440 寬並排展開,按開關收成細列
const SHELL_RAILS = [
  { id: 'design-system-components-appshell-展示--primary-sidebar', tooltip: true },
]
// 寬鬆密度的細列(R1–R4):細列寬、圖示左內距、Tooltip 錨點都隨密度變,標準密度綠不代表寬鬆也綠
const DENSITY_RAILS = [
  { id: 'design-system-components-sidebar-展示--icon-collapse', kind: 'standalone', density: 'lg', tooltip: true },
  { id: 'design-system-components-appshell-展示--primary-sidebar', kind: 'shell', density: 'lg', tooltip: true },
]
// 細列裡放會讓列鈕比細列寬的東西(R1–R4;標準 / 寬鬆密度;DS 沒有範例把它們放進細列,由閘注入,見 injectStressor):
//   skeleton = `SidebarMenuSkeleton showIcon`(sidebar.spec.md「狀態」段建議載入中用骨架)/ input = `SidebarInput` —— 撐開捲動區內容層(SidebarContent 的 `fillX` 管);
//   action = 有列尾動作的列鈕預留的右內距 —— 撐開列鈕自己(列鈕細列時 `!pr-0` 管)
const STRESSORS = { skeleton: '細列放骨架列', input: '細列放搜尋框', action: '第一顆列鈕預留列尾動作的右內距' }
const STRESS_RAILS = Object.keys(STRESSORS).flatMap((stressor) => ['md', 'lg'].map((density) => ({ id: 'design-system-components-sidebar-展示--icon-collapse', density, stressor })))
// 細列內容比視窗高:視窗 1440×230(收起後 = 標頭 + 捲動區 + 帳號列,捲動區放不下主選單)。完整佈局與 AppShell 主側欄量兩種密度(圖示);
// 混合前綴量標準密度(頭像 24 比圖示寬,細列 48 時頭像右緣 36、捲軸左緣 37,是最貼的一格)
const SCROLL_CASES = [
  { id: 'design-system-components-sidebar-展示--icon-collapse', kind: 'standalone', density: 'md', viewport: { width: 1440, height: 230 } },
  { id: 'design-system-components-sidebar-展示--icon-collapse', kind: 'standalone', density: 'lg', viewport: { width: 1440, height: 230 } },
  { id: 'design-system-components-sidebar-展示--integration-sidebar', kind: 'standalone', density: 'md', viewport: { width: 1440, height: 230 } },
  { id: 'design-system-components-appshell-展示--primary-sidebar', kind: 'shell', density: 'md', viewport: { width: 1440, height: 230 } },
  { id: 'design-system-components-appshell-展示--primary-sidebar', kind: 'shell', density: 'lg', viewport: { width: 1440, height: 230 } },
]
// R3k:真按 Tab 走到細列列鈕(2026-10-27 t2-sidebar 獨立審查第 8 點:主標頭佈局窄視窗一開始就是細列,鍵盤 Tab 到細列「Inbox」不開 Tooltip;
// 2026-11-05 實測根因:Tab 經過全域標頭右側「帳號與設定」時外層水平捲動容器捲到右邊,Tab 到細列時瀏覽器捲回來,那一下 scroll 讓 Radix 關掉
// 剛打開的 Tooltip —— 修在 tooltip.tsx「聚焦帶來的捲動不關提示」)。R3 是程式聚焦,不會經過標頭、也不會捲,所以量不到這件事。
const TAB_CASES = [
  { id: 'design-system-components-appshell-展示--primary-header', kind: 'shell', viewport: { width: 820, height: 700 } },
]
// R8:收合前後圖示中心不動(檔頭契約 R8a–R8d)。key = 格名(對照組用它指名該紅 / 該綠的格)。
//   density = 整頁的密度;block = 另外在哪一層換密度(由閘掛上 `data-density`)、blockDensity = 那一層換成哪個密度。
//   S = 單獨使用的完整佈局;A = AppShell「狀態行為」(Right panel 與 AI agent 用網址參數關掉,Menu 在 1440 寬一開始並排展開;
//       布林值的寫法同 app-shell-layout-invariant.mjs 的 storyUrl;size lg 用 `menuSize:lg` —— DS 唯一「size lg 又能收成細列」的 story 入口);
//   D = 一般密度頁面裡的大密度區塊(size md):outside = 掛在 SidebarProvider 外面那一層(驗外層有重算)、
//       inside = 掛在 SidebarProvider 裡面的側欄外框(驗公式在外框這道密度邊界上用新的 loose 重算。它驗不到「圖示欄穿過邊界繼承下去」:
//       size md 的圖示欄 16 剛好等於備用值 1rem,繼承斷了照樣綠 —— 那件事由 F3 / F4 驗);
//   F = 閘自己的夾具(單獨使用 × size lg;DS 沒有這種範例。樣式來自正在服務的建置,所以配修前的建置量得到修前的寬)。
//       F1 / F2 = 整頁一般 / 大密度;F3 / F4 = 再把密度掛在側欄外框上(F3 一般密度頁面掛大密度 → 68;F4 大密度頁面鎖回一般密度 → 52):
//       圖示欄 20 要從 SidebarProvider 外層穿過外框這道密度邊界繼承下去,公式在外框上用外框的 loose 重算
//       (2026-11-13 審查抓到的盲點:在換密度的元素上把圖示欄重設成 1rem,當時的十格全綠;審查用自己的量測腳本注入同一種破法,
//       量到這兩種組合的細列寬變成 64 / 48、圖示收合後往左 2px —— 數字收在下方判定表)。
const ICON_COLLAPSE = 'design-system-components-sidebar-展示--icon-collapse'
const SHELL_STATE = 'design-system-components-appshell-設計規格--state-behavior'
const SHELL_STATE_ARGS = 'rightOpen:!false;agentOpen:!false'
const RAIL_FIXTURE_SOURCE = 'scripts/test-fixtures/sidebar-rail-center/fixture.tsx'
const RAIL_CENTER_CASES = [
  { key: 'S1', kind: 'standalone', id: ICON_COLLAPSE, density: 'md', size: 'md' },
  { key: 'S2', kind: 'standalone', id: ICON_COLLAPSE, density: 'lg', size: 'md' },
  { key: 'A1', kind: 'shell', id: SHELL_STATE, args: SHELL_STATE_ARGS, density: 'md', size: 'md' },
  { key: 'A2', kind: 'shell', id: SHELL_STATE, args: SHELL_STATE_ARGS, density: 'lg', size: 'md' },
  { key: 'A3', kind: 'shell', id: SHELL_STATE, args: `${SHELL_STATE_ARGS};menuSize:lg`, density: 'md', size: 'lg' },
  { key: 'A4', kind: 'shell', id: SHELL_STATE, args: `${SHELL_STATE_ARGS};menuSize:lg`, density: 'lg', size: 'lg' },
  { key: 'D1', kind: 'standalone', id: ICON_COLLAPSE, density: 'md', block: 'outside', blockDensity: 'lg', size: 'md' },
  { key: 'D2', kind: 'standalone', id: ICON_COLLAPSE, density: 'md', block: 'inside', blockDensity: 'lg', size: 'md' },
  { key: 'F1', kind: 'standalone', fixture: true, density: 'md', size: 'lg' },
  { key: 'F2', kind: 'standalone', fixture: true, density: 'lg', size: 'lg' },
  { key: 'F3', kind: 'standalone', fixture: true, density: 'md', block: 'inside', blockDensity: 'lg', size: 'lg' },
  { key: 'F4', kind: 'standalone', fixture: true, density: 'lg', block: 'inside', blockDensity: 'md', size: 'lg' },
]
const MD_CENTER_KEYS = RAIL_CENTER_CASES.filter((c) => c.size === 'md').map((c) => c.key)
const LG_CENTER_KEYS = RAIL_CENTER_CASES.filter((c) => c.size === 'lg').map((c) => c.key)
const SHELL_CENTER_KEYS = RAIL_CENTER_CASES.filter((c) => c.kind === 'shell').map((c) => c.key)
// size lg、密度掛在側欄外框上的格(F3 / F4):外框自己就是換密度的元素 —— 公式在外框上重算,圖示欄要從 SidebarProvider 外層繼承進來
const LG_INSIDE_KEYS = RAIL_CENTER_CASES.filter((c) => c.size === 'lg' && c.block === 'inside').map((c) => c.key)
// R8 的格名用規格的叫法(density.spec.md:md = 一般密度、lg = 大密度;R8d 比的是規格那四格)。
// R1–R7 既有的格名沿用下方 densityName(Storybook 工具列的「標準 / 寬鬆」),這次沒有動
const SPEC_DENSITY_NAME = { md: '一般', lg: '大' }
const BLOCK_NAME = { outside: 'SidebarProvider 外面那一層', inside: 'SidebarProvider 裡面的側欄外框' }
const blockVerb = (c) => (c.blockDensity === 'lg' ? '掛大密度' : '鎖回一般密度')
const railCenterPrefix = (c) => `${c.key} ${c.fixture ? '夾具(單獨使用)' : short(c.id)} ${c.block ? `${SPEC_DENSITY_NAME[c.density]}密度頁面、${BLOCK_NAME[c.block]}${blockVerb(c)}` : `${SPEC_DENSITY_NAME[c.density]}密度`} × size ${c.size}`
/** 打開之後再等這麼久仍要開著(> tooltip.tsx 的 FOCUS_SCROLL_IDLE_MS 150:修前是聚焦後約 15ms 就被捲動關掉)。量的是「持續」,所以是固定等待,不是代理。 */
const TAB_PERSIST_MS = 600
const TAB_ROLE = 'Tab 到的細列列鈕'
const scrollPrefix = (c) => `${short(c.id)} ${c.viewport.width}×${c.viewport.height} ${densityName(c.density)}密度 ${c.expanded ? '展開' : '收起'}`
const DEFAULT_VIEWPORT = { width: 1440, height: 900 }
const short = (id) => id.replace('design-system-components-sidebar-', '').replace('design-system-components-appshell-', 'AppShell ')
const densityName = (d) => (d === 'lg' ? '寬鬆' : '標準')
const densityQuery = (d) => `&globals=${encodeURIComponent(`density:${d}`)}`

// 「單獨使用的 Sidebar 外框」= 頁上第一顆開關(閘按的就是它)控制的那一個:外框往上找到第一個也裝著那顆開關的祖先,
// 那個祖先裡只有它一個外框 = 同一個 SidebarProvider。頁上沒有開關 → 取第一個。2026-11-05 起設計規格「狀態行為」
// 在可切換的那格之前多了三格固定狀態的真 Sidebar(A-M070),「頁上第一個外框」不再是開關控制的那個(M37:第一個 ≠ 被按的那個)。
/** 頁面端:單獨使用的 Sidebar 外框(帶 data-side / data-state、不在 AppShell 裡)與它的選單項 */
function measure() {
  const r2 = (n) => Math.round(n * 100) / 100
  const frame = ((fs, tr) => fs.find((el) => { if (!tr) return true; let p = el.parentElement; while (p && !p.contains(tr)) p = p.parentElement; return !!p && fs.filter((x) => p.contains(x)).length === 1 }))([...document.querySelectorAll('[data-side][data-state]')].filter((el) => !el.closest('[data-app-shell]') && el.querySelector('[data-sidebar="sidebar"]')), document.querySelector('[data-sidebar="trigger"]'))
  if (!frame) return { err: '找不到單獨使用的 Sidebar 外框([data-side][data-state])' }
  // token 的實際寬:在同一個 SidebarProvider 底下放探針(變數可能被 consumer 覆寫,不寫死 240 / 48)
  const host = frame.parentElement
  const probe = (v) => { const p = document.createElement('div'); p.style.cssText = `position:absolute;visibility:hidden;height:1px;width:${v}`; host.appendChild(p); const w = p.getBoundingClientRect().width; p.remove(); return r2(w) }
  const button = frame.querySelector('[data-sidebar="menu-button"]')
  const b = button?.getBoundingClientRect()
  const f = frame.getBoundingClientRect()
  // 細列只露出左側那一段:命中點取「按鈕在外框可見範圍內」的中心
  const x = b ? Math.min(b.left + 12, f.right - 2) : 0
  const y = b ? b.top + b.height / 2 : 0
  const hit = b && f.width > 1 ? document.elementFromPoint(x, y) : null
  return {
    state: frame.getAttribute('data-state'),
    collapsible: frame.getAttribute('data-collapsible'),
    width: r2(f.width),
    tokenExpanded: probe('var(--sidebar-width)'),
    tokenRail: probe('var(--sidebar-width-icon)'),
    button: button ? (button.getAttribute('aria-label') || button.textContent || '').trim().slice(0, 20) : null,
    buttonInert: !!button?.closest('[inert]'),
    buttonHidden: !!button?.closest('[aria-hidden="true"]'),
    buttonHit: !!hit && !!button && (hit === button || button.contains(hit)),
  }
}

/**
 * 頁面端(序列化傳入,不得引用外部變數):細列的量測。kind = standalone(單獨使用)/ shell(AppShell 版面上那一份)。
 * op:buttons(R1 每顆列鈕的版面與看得到的範圍)/ mark(標出要量的列鈕)/ point(列鈕看得到那一段的中心)/ tip(這顆列鈕開著的 Tooltip)/
 *     focus(程式聚焦)/ ring(焦點框四邊取樣)/ scroll(捲動區、直捲軸、圖示)。
 */
function railProbe({ kind, op, role }) {
  const r2 = (n) => Math.round(n * 100) / 100
  const frame = kind === 'shell'
    ? document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])')
    : ((fs, tr) => fs.find((el) => { if (!tr) return true; let p = el.parentElement; while (p && !p.contains(tr)) p = p.parentElement; return !!p && fs.filter((x) => p.contains(x)).length === 1 }))([...document.querySelectorAll('[data-side][data-state]')].filter((el) => !el.closest('[data-app-shell]') && el.querySelector('[data-sidebar="sidebar"]')), document.querySelector('[data-sidebar="trigger"]'))
  if (!frame) return { err: `找不到${kind === 'shell' ? ' AppShell 版面上的' : '單獨使用的'} Sidebar 外框` }
  // 看得到的水平範圍 = 元素矩形與每一層 overflow-x 不是 visible 的祖先的 padding box 取交集(clip / hidden / auto / scroll 都會裁)
  const visibleX = (el) => {
    const b = el.getBoundingClientRect()
    let left = b.left, right = b.right
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (getComputedStyle(a).overflowX === 'visible') continue
      const ab = a.getBoundingClientRect()
      left = Math.max(left, ab.left + a.clientLeft)
      right = Math.min(right, ab.left + a.clientLeft + a.clientWidth)
    }
    return { left: r2(left), right: r2(right) }
  }
  const rendered = (el) => el.getClientRects().length > 0 && !el.closest('[inert],[aria-hidden="true"]')
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20)
  if (op === 'buttons') {
    return {
      collapsible: frame.getAttribute('data-collapsible'),
      buttons: [...frame.querySelectorAll('[data-sidebar="menu-button"]')].filter(rendered).map((el) => {
        const b = el.getBoundingClientRect(), v = visibleX(el)
        return { label: label(el), left: r2(b.left), right: r2(b.right), visLeft: v.left, visRight: v.right }
      }),
    }
  }
  if (op === 'mark') {
    // 要量的列鈕:捲動區裡第一顆可操作的 + 帳號列(footer)那一顆
    document.querySelectorAll('[data-rail-probe]').forEach((el) => el.removeAttribute('data-rail-probe'))
    const pick = (scope) => scope && [...scope.querySelectorAll('[data-sidebar="menu-button"]')].find((el) => rendered(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
    const targets = []
    for (const [name, scope] of [['捲動區第一顆列鈕', frame.querySelector('[data-sidebar="content"]')], ['帳號列', frame.querySelector('[data-sidebar="footer"]')]]) {
      const el = pick(scope)
      if (!el) continue
      el.setAttribute('data-rail-probe', name)
      targets.push({ role: name, label: label(el) })
    }
    return { targets }
  }
  if (op === 'scroll') {
    const vp = frame.querySelector('[data-sidebar="content"] [data-radix-scroll-area-viewport]')
    if (!vp) return { err: '找不到細列的捲動區' }
    const vb = vp.getBoundingClientRect(), v = visibleX(vp)
    const base = { overflow: r2(vp.scrollHeight - vp.clientHeight), point: { x: (v.left + v.right) / 2, y: vb.top + vb.height / 2 } }
    const bar = vp.parentElement.querySelector(':scope > [data-orientation="vertical"]')
    if (!bar) return { ...base, bar: null, icons: [] }
    const bb = bar.getBoundingClientRect(), bv = visibleX(bar)
    const thumb = bar.firstElementChild
    const tb = thumb?.getBoundingClientRect()
    const hit = tb && tb.height > 0 ? document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2) : null
    const icons = [...vp.querySelectorAll('[data-sidebar="menu-button"]')].filter(rendered).flatMap((btn) =>
      [...btn.querySelectorAll('[data-prefix-type], svg, img')].filter((el) => el.getClientRects().length > 0).map((el) => {
        const r = el.getBoundingClientRect()
        return { label: label(btn), left: r2(r.left), right: r2(r.right) }
      }))
    return { ...base, bar: { state: bar.getAttribute('data-state'), left: r2(bb.left), right: r2(bb.right), visLeft: bv.left, visRight: bv.right, thumbHeight: tb ? r2(tb.height) : 0, hit: !!hit && bar.contains(hit) }, icons }
  }
  if (op === 'reach' || op === 'reachState') {
    // R7:捲軸浮出時,列鈕伸到捲軸底下的那段點不點得到 —— 沿每顆伸到捲軸底下的列鈕中線逐 px 命中測試:
    // 滑塊畫到的地方 = 滑塊,其餘(含透明軌道)= 列鈕(hit-area-canonical「一-4 細則」;scroll-area.spec.md「A11y 預設」的「Pointer 支援」)
    const vp = frame.querySelector('[data-sidebar="content"] [data-radix-scroll-area-viewport]')
    const bar = vp?.parentElement.querySelector(':scope > [data-orientation="vertical"]')
    if (op === 'reachState') {
      const t = document.querySelector('[data-reach-probe]')
      const id = t?.getAttribute('aria-describedby')
      return { scrollTop: vp ? r2(vp.scrollTop) : null, hover: !!t?.matches(':hover'), tip: !!id && document.getElementById(id)?.getAttribute('role') === 'tooltip', thumbHover: !!bar?.firstElementChild?.matches(':hover') }
    }
    if (!bar) return { err: '沒有直捲軸' }
    document.querySelectorAll('[data-reach-probe]').forEach((el) => el.removeAttribute('data-reach-probe'))
    const bb = bar.getBoundingClientRect(), vpb = vp.getBoundingClientRect()
    const thumb = bar.firstElementChild, tb = thumb && thumb.getBoundingClientRect().height > 0 ? thumb.getBoundingClientRect() : null
    // 一個取樣點 = [x, x+1) × [y, y+1) 那一格(見下方取樣的註解)。整格在滑塊中段裡 = core(一定打到滑塊);整格碰不到滑塊 = out(一定打到列鈕);
    // 其餘 = cap:滑塊兩端是半圓(rounded-full,命中測試照圓角裁)、或那一格只碰到滑塊的一部分,兩種結果都算對
    const cap = tb ? tb.width / 2 : 0
    const where = (x, y) => (!tb || x + 1 <= tb.left || x >= tb.right || y + 1 <= tb.top || y >= tb.bottom ? 'out'
      : x >= tb.left && x + 1 <= tb.right && y >= tb.top + cap && y + 1 <= tb.bottom - cap ? 'core' : 'cap')
    const miss = []
    let rows = 0, trackPts = 0, thumbPts = 0, cand = null
    for (const btn of [...vp.querySelectorAll('[data-sidebar="menu-button"]')].filter(rendered)) {
      const b = btn.getBoundingClientRect(), v = visibleX(btn), y = b.top + b.height / 2
      if (y < vpb.top + 1 || y > vpb.bottom - 1 || v.right <= bb.left + 1) continue // 捲出視野、或沒伸到捲軸底下的列不量
      rows += 1
      const bad = []
      for (let x = Math.ceil(v.left); x < Math.floor(v.right); x += 1) {
        // Chrome 的命中測試把一個點當成 [x, x+1) 那一格:2026-10-28 實測滑塊 39–46,x38 → 列鈕、x38.25 → 滑塊、x45.75 → 滑塊、x46 → 列鈕;
        // 所以取整數 x = 量第 x 個 px(取 x + 0.25 會同時碰到第 x + 1 個 px,邊界上那一格會判給右邊的鄰居)
        const px = x
        const h = document.elementFromPoint(px, y)
        const got = !h ? '沒有東西' : h === btn || btn.contains(h) ? '列鈕' : thumb && (h === thumb || thumb.contains(h)) ? '滑塊' : bar.contains(h) ? '軌道' : (h.getAttribute('data-sidebar') || h.tagName.toLowerCase())
        const w = where(px, y)
        if (px >= bb.left && px < bb.right) { if (w === 'core') thumbPts += 1; else if (w === 'out') trackPts += 1 }
        if (!(w === 'core' ? got === '滑塊' : w === 'cap' ? got === '滑塊' || got === '列鈕' : got === '列鈕')) bad.push(`x${x}→${got}`)
      }
      if (bad.length) miss.push(`「${label(btn)}」${bad.length} 點(${bad[0]} … ${bad[bad.length - 1]})`)
      // 真指標要停的點:軌道上、離滑塊上下各 ≥ 2px 的那一列
      if (!cand && tb && (y < tb.top - 2 || y > tb.bottom + 2)) {
        cand = { x: r2((bb.left + Math.min(v.right, bb.right)) / 2), y: r2(y), label: label(btn) }
        btn.setAttribute('data-reach-probe', '')
      }
    }
    return { bar: `${r2(bb.left)}–${r2(bb.right)}`, thumb: tb ? { x: r2(tb.left + tb.width / 2), y: r2(tb.top + tb.height / 2), span: `${r2(tb.left)}–${r2(tb.right)} × ${r2(tb.top)}–${r2(tb.bottom)}` } : null, rows, trackPts, thumbPts, miss, cand }
  }
  const t = document.querySelector(`[data-rail-probe="${role}"]`)
  if (!t) return { err: `找不到量測對象「${role}」` }
  if (op === 'point') {
    const b = t.getBoundingClientRect(), v = visibleX(t)
    return { x: (v.left + v.right) / 2, y: b.top + b.height / 2 }
  }
  if (op === 'tip') {
    // Radix Tooltip 開著時,觸發點掛 aria-describedby → role="tooltip" 的節點;泡泡 = 它所在 popper 外殼的第一個子元素
    const id = t.getAttribute('aria-describedby')
    const node = id ? document.getElementById(id) : null
    const bubble = node?.getAttribute('role') === 'tooltip' ? node.closest('[data-radix-popper-content-wrapper]')?.firstElementChild : null
    if (!bubble) return { open: false }
    return { open: true, left: r2(bubble.getBoundingClientRect().left), visRight: visibleX(t).right, right: r2(t.getBoundingClientRect().right) }
  }
  if (op === 'focus') {
    t.focus()
    return { active: document.activeElement === t, focusVisible: t.matches(':focus-visible') }
  }
  if (op === 'ring') {
    if (!t.matches(':focus-visible')) return { instrument: '列鈕不是 :focus-visible(量不到鍵盤焦點框)' }
    const cs = getComputedStyle(t)
    const w = parseFloat(cs.outlineWidth) || 0, off = parseFloat(cs.outlineOffset) || 0
    if (cs.outlineStyle === 'none' || w < 1) return { ok: false, missing: ['四邊'], detail: `沒有焦點框(outline ${cs.outlineStyle} ${cs.outlineWidth})` }
    if (off + w > 0.5) return { instrument: `焦點框往外畫(outline-offset ${off} + width ${w} > 0),本量法只量往內畫的框` }
    const b = t.getBoundingClientRect(), v = visibleX(t)
    const c = -(off + w / 2) // 框的中線在邊框內側幾 px(focus-ring-inset:offset −2、寬 2 → 1)
    const sides = { 上: [], 右: [], 下: [], 左: [] }
    for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const x = b.left + b.width * f, y = b.top + b.height * f
      sides.上.push([x, b.top + c]); sides.下.push([x, b.bottom - c]); sides.左.push([b.left + c, y]); sides.右.push([b.right - c, y])
    }
    const hits = ([x, y]) => { const h = document.elementFromPoint(x, y); return !!h && (h === t || t.contains(h)) }
    const missing = Object.entries(sides).filter(([, pts]) => !pts.every(hits)).map(([k]) => k)
    return { ok: missing.length === 0, missing, detail: `列鈕版面 ${r2(b.left)}–${r2(b.right)}、看得到 ${v.left}–${v.right}` }
  }
  return { err: `未知的 op:${op}` }
}

/** 頁面端:這顆列鈕的 Tooltip 開 / 關(waitForFunction 用;等元素本身,不固定睡) */
function tipState({ role, open }) {
  const t = document.querySelector(`[data-rail-probe="${role}"]`)
  const id = t?.getAttribute('aria-describedby')
  const node = id ? document.getElementById(id) : null
  if (open) return node?.getAttribute('role') === 'tooltip'
  return !node && !document.querySelector('[data-radix-popper-content-wrapper] [role="tooltip"]')
}

/** 頁面端:細列捲動區的直捲軸浮出來了(Radix hover 型:指標進入捲動區才掛上、data-state=visible)。kind 同 railProbe */
function railScrollbarShown({ kind }) {
  const frame = kind === 'shell'
    ? document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])')
    : ((fs, tr) => fs.find((el) => { if (!tr) return true; let p = el.parentElement; while (p && !p.contains(tr)) p = p.parentElement; return !!p && fs.filter((x) => p.contains(x)).length === 1 }))([...document.querySelectorAll('[data-side][data-state]')].filter((el) => !el.closest('[data-app-shell]') && el.querySelector('[data-sidebar="sidebar"]')), document.querySelector('[data-sidebar="trigger"]'))
  const vp = frame?.querySelector('[data-sidebar="content"] [data-radix-scroll-area-viewport]')
  return vp?.parentElement.querySelector(':scope > [data-orientation="vertical"]')?.getAttribute('data-state') === 'visible'
}

/**
 * 頁面端(序列化傳入,不得引用外部變數):在單獨使用的細列放一個「會讓列鈕比細列寬」的東西,再量 R1–R4。stressor:
 *   skeleton —— 捲動區第一個 SidebarMenu 尾端放兩列 `SidebarMenuSkeleton showIcon` 的同幾何列
 *               (sidebar.tsx sidebarMenuSkeletonVariants:`flex items-start gap-2 px-[var(--layout-space-loose)]` + 圖示 `--item-icon-size` + 彈性文字條);
 *   input    —— 捲動區尾端放 `SidebarInput` 的同幾何框(sidebar.tsx SidebarInput = Input `w-full`:fieldWrapperStyles 的 inline-flex 外框 +
 *               bareInputStyles 的 `flex-1 min-w-0` 原生 `<input>`;包一層兩側 loose 內距,同 2026-10-27 獨立審查的測試頁);
 *   action   —— 捲動區第一顆列鈕掛上「有列尾動作」時 SidebarMenuButton 給的右內距(inline paddingRight = loose + 動作寬 16 + gap-2;
 *               細列時動作 display:none,但這個預留內距照樣在)。
 * 回傳證明它真的比細列寬:skeleton / input = 那個東西的最小寬(min-content,Radix `display: table` 內容層被撐到的就是它);
 * action = 列鈕左內距 + 預留的右內距(border-box 的寬不會小於左右內距之和)。不比細列看得到的寬 = 量不到要量的事(儀器失效)。
 */
function injectStressor({ stressor }) {
  const r2 = (n) => Math.round(n * 100) / 100
  const frame = ((fs, tr) => fs.find((el) => { if (!tr) return true; let p = el.parentElement; while (p && !p.contains(tr)) p = p.parentElement; return !!p && fs.filter((x) => p.contains(x)).length === 1 }))([...document.querySelectorAll('[data-side][data-state]')].filter((el) => !el.closest('[data-app-shell]') && el.querySelector('[data-sidebar="sidebar"]')), document.querySelector('[data-sidebar="trigger"]'))
  const content = frame?.querySelector('[data-sidebar="content"]')
  const layer = content?.querySelector('[data-radix-scroll-area-viewport] > div')
  if (!layer) return { err: '找不到細列捲動區的內容層' }
  const rail = r2(frame.getBoundingClientRect().width)
  // 細列看得到的寬 = 裁切層(SidebarInner 的父層,overflow-x hidden、右緣分隔線畫在這層)的 clientWidth(扣掉分隔線那 1px;內層寬多少都不影響)
  const visible = r2(frame.querySelector('[data-sidebar="sidebar"]').parentElement.clientWidth)
  const minContent = (el) => {
    const probe = el.cloneNode(true)
    probe.removeAttribute('data-gate-stressor')
    probe.style.cssText += ';position:absolute;visibility:hidden;width:min-content'
    el.parentElement.appendChild(probe)
    const w = r2(probe.getBoundingClientRect().width)
    probe.remove()
    return w
  }
  if (stressor === 'skeleton') {
    const menu = content.querySelector('[data-sidebar="menu"]')
    if (!menu) return { err: '找不到細列捲動區裡的 SidebarMenu' }
    for (let i = 0; i < 2; i += 1) {
      const li = document.createElement('li')
      li.setAttribute('data-sidebar', 'menu-item')
      li.setAttribute('data-gate-stressor', 'menu-skeleton')
      li.innerHTML = '<div data-sidebar="menu-skeleton" style="display:flex;align-items:flex-start;gap:0.5rem;padding:4px var(--layout-space-loose)">'
        + '<div data-sidebar="menu-skeleton-icon" style="flex-shrink:0;width:var(--item-icon-size);height:var(--item-icon-size);border-radius:6px;background:var(--neutral-hover)"></div>'
        + '<div data-sidebar="menu-skeleton-text" style="flex:1;height:1rem;max-width:70%;border-radius:6px;background:var(--neutral-hover)"></div></div>'
      menu.appendChild(li)
    }
    return { size: minContent(menu.querySelector('[data-gate-stressor] [data-sidebar="menu-skeleton"]')), rail, visible, what: '骨架列最小寬' }
  }
  if (stressor === 'input') {
    const box = document.createElement('div')
    box.setAttribute('data-gate-stressor', 'sidebar-input')
    box.style.cssText = 'padding:0 var(--layout-space-loose)'
    box.innerHTML = '<div style="display:inline-flex;align-items:center;min-width:0;width:100%;box-sizing:border-box;height:32px;padding:0 8px;border:1px solid var(--border);border-radius:6px">'
      + '<input type="text" data-sidebar="input" placeholder="搜尋專案" aria-label="搜尋專案" style="flex:1 1 0%;min-width:0;border:none;padding:0;background:transparent;outline:none;font:inherit;text-overflow:ellipsis"></div>'
    layer.firstElementChild.appendChild(box)
    return { size: minContent(box), rail, visible, what: '搜尋框最小寬' }
  }
  if (stressor === 'action') {
    const btn = [...content.querySelectorAll('[data-sidebar="menu-button"]')].find((el) => el.getClientRects().length > 0 && !el.disabled)
    if (!btn) return { err: '找不到細列捲動區裡的列鈕' }
    const reserve = 'calc(var(--layout-space-loose) + 16px + 0.5rem)'
    btn.style.paddingRight = reserve
    btn.setAttribute('data-gate-stressor', 'action-padding')
    const p = document.createElement('div')
    p.style.cssText = `position:absolute;visibility:hidden;height:1px;width:0;padding-right:${reserve}`
    btn.parentElement.appendChild(p)
    const pr = r2(p.getBoundingClientRect().width)
    p.remove()
    return { size: r2(parseFloat(getComputedStyle(btn).paddingLeft) + pr), rail, visible, what: '列鈕左內距 + 預留的右內距' }
  }
  return { err: `未知的 stressor:${stressor}` }
}

class RailInstrumentError extends Error {}

/**
 * 指標離開列鈕,等 Tooltip 關掉。Radix Tooltip 預設可以把指標移進提示本身(hoverable content):離開觸發點時先畫一塊「通往提示的緩衝區」,
 * **下一個** pointermove 落在緩衝區外才關 —— Playwright 的 mouse.move 只送一個事件,停在遠處也不會關(2026-10-27 修前建置實測,提示一直開著)。
 * 真人的指標會連續送事件,所以停好之後再挪 1px 補一個事件;5 秒還沒關 = 儀器失效(後面的鍵盤量測會量到這一個提示)。
 */
async function leaveAndWaitTipClosed(page, prefix, role) {
  const spot = await parkPointer(page)
  await page.mouse.move(spot.x + 1, spot.y + 1)
  const closed = await page.waitForFunction(tipState, { role, open: false }, { timeout: 5000 }).then(() => true, () => false)
  if (!closed) throw new RailInstrumentError(`${prefix}:${role}的 Tooltip 指標離開 5 秒後仍開著`)
  await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
}

/** R1–R4:細列(已收起)上的列鈕、Tooltip、焦點框。prefix = 格名前綴;tooltip = 這則的列鈕有沒有給 tooltip */
async function railCells(page, kind, prefix, tooltip) {
  const out = []
  const push = (label, ok, detail) => out.push({ ok, label: `${prefix}:${label}`, detail })
  const btns = await page.evaluate(railProbe, { kind, op: 'buttons' })
  if (btns.err) throw new RailInstrumentError(`${prefix}:${btns.err}`)
  if (btns.collapsible !== 'icon') return [{ ok: false, label: `${prefix}:R1–R4`, detail: `外框不是細列(data-collapsible=${btns.collapsible})` }]
  if (!btns.buttons.length) throw new RailInstrumentError(`${prefix}:細列上一顆列鈕都沒有`)
  const wide = btns.buttons.filter((b) => b.right - b.visRight > TOL || b.visLeft - b.left > TOL)
  push('R1 細列上每一顆列鈕的版面都在細列看得到的範圍內(看得到多寬,版面就多寬)', !wide.length,
    wide.length ? wide.map((b) => `「${b.label}」版面 ${b.left}–${b.right}、看得到 ${b.visLeft}–${b.visRight}`).join(';') : `${btns.buttons.length} 顆`)
  const { targets } = await page.evaluate(railProbe, { kind, op: 'mark' })
  if (!targets.length) throw new RailInstrumentError(`${prefix}:細列上找不到可量的列鈕`)
  for (const { role, label } of targets) {
    if (tooltip) {
      // R2:滑鼠停在列鈕看得到的那一段中心
      const pt = await page.evaluate(railProbe, { kind, op: 'point', role })
      await page.mouse.move(pt.x, pt.y)
      const opened = await page.waitForFunction(tipState, { role, open: true }, { timeout: 5000 }).then(() => true, () => false)
      if (opened) await settleAfterInteraction(page, { frames: SETTLE_FRAMES }) // 進場動畫(滑入 + 放大)跑完才量
      const tip = opened ? await page.evaluate(railProbe, { kind, op: 'tip', role }) : { open: false }
      push(`R2 滑鼠停在${role}「${label}」的 Tooltip:左緣 − 列鈕看得到的右緣 = ${OVERLAY_SIDE_OFFSET}`, tip.open && Math.abs(tip.left - tip.visRight - OVERLAY_SIDE_OFFSET) <= 1,
        tip.open ? `tooltip.left=${tip.left} 列鈕看得到的右緣=${tip.visRight} 列鈕版面右緣=${tip.right}` : '滑過 5 秒內沒打開 Tooltip')
      await leaveAndWaitTipClosed(page, prefix, role)
    }
    // R3 / R4:鍵盤聚焦(先按一下 Shift = 最近一次輸入是鍵盤,程式聚焦才會是 :focus-visible;聚焦後驗證,不是就算儀器失效)
    await page.keyboard.press('Shift')
    const f = await page.evaluate(railProbe, { kind, op: 'focus', role })
    if (f.err || !f.active || !f.focusVisible) throw new RailInstrumentError(`${prefix}:${role}聚焦失敗或不是 :focus-visible(${JSON.stringify(f)})`)
    await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
    if (tooltip) {
      const opened = await page.waitForFunction(tipState, { role, open: true }, { timeout: 5000 }).then(() => true, () => false)
      if (opened) await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      const tip = opened ? await page.evaluate(railProbe, { kind, op: 'tip', role }) : { open: false }
      push(`R3 鍵盤聚焦${role}「${label}」的 Tooltip:左緣 − 列鈕看得到的右緣 = ${OVERLAY_SIDE_OFFSET}`, tip.open && Math.abs(tip.left - tip.visRight - OVERLAY_SIDE_OFFSET) <= 1,
        tip.open ? `tooltip.left=${tip.left} 列鈕看得到的右緣=${tip.visRight} 列鈕版面右緣=${tip.right}` : '聚焦 5 秒內沒打開 Tooltip')
    }
    const ring = await page.evaluate(railProbe, { kind, op: 'ring', role })
    if (ring.instrument || ring.err) throw new RailInstrumentError(`${prefix}:${role}:${ring.instrument ?? ring.err}`)
    push(`R4 鍵盤聚焦${role}「${label}」的焦點框四邊完整`, ring.ok, ring.ok ? ring.detail : `缺 ${ring.missing.join('、')}邊(${ring.detail})`)
    await page.evaluate(() => document.activeElement?.blur?.())
    if (tooltip && !(await page.waitForFunction(tipState, { role, open: false }, { timeout: 5000 }).then(() => true, () => false))) {
      throw new RailInstrumentError(`${prefix}:${role}的 Tooltip 失焦 5 秒後仍開著`)
    }
    await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  }
  return out
}

/**
 * R5 / R6:細列內容比視窗高時滑過細列,直捲軸看得到、不蓋到圖示。R7(只量細列):捲軸浮出時列鈕伸到捲軸底下的那段點得到。
 * kind 同 railProbe;expanded = 量展開的側欄(只量 R7);tooltip = 細列列鈕有 Tooltip(R7 的真指標那一步另等 Tooltip 打開)
 */
async function scrollCells(page, kind, prefix, { expanded = false, tooltip = false } = {}) {
  const s0 = await page.evaluate(railProbe, { kind, op: 'scroll' })
  if (s0.err) throw new RailInstrumentError(`${prefix}:${s0.err}`)
  if (!(s0.overflow >= 1)) throw new RailInstrumentError(`${prefix}:${expanded ? '側欄' : '細列'}內容沒有比捲動區高(超出 ${s0.overflow}px),量不到捲軸`)
  await page.mouse.move(s0.point.x, s0.point.y)
  const shown = await page.waitForFunction(railScrollbarShown, { kind }, { timeout: 3000 }).then(() => true, () => false)
  if (shown) await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  const s = await page.evaluate(railProbe, { kind, op: 'scroll' })
  const bar = s.bar
  const out = []
  if (!expanded) {
    const inside = !!bar && bar.left >= bar.visLeft - TOL && bar.right <= bar.visRight + TOL
    out.push({ ok: shown && inside && bar.hit && bar.thumbHeight > 0, label: `${prefix}:R5 滑過細列時直捲軸浮出、整條在細列看得到的範圍內、命中測試打得到`,
      detail: bar ? `捲軸 ${bar.left}–${bar.right}(${bar.state})、看得到 ${bar.visRight > bar.visLeft ? `${bar.visLeft}–${bar.visRight}` : '無(整條被裁掉)'}、滑塊高 ${bar.thumbHeight}、命中 ${bar.hit};內容超出 ${s.overflow}px` : `滑過 3 秒內沒有捲軸;內容超出 ${s.overflow}px` })
    const over = bar ? s.icons.filter((i) => bar.left < i.right - TOL && bar.right > i.left + TOL) : []
    out.push({ ok: !!bar && s.icons.length > 0 && !over.length, label: `${prefix}:R6 細列直捲軸那一欄不與任何圖示 / 頭像那一欄重疊`,
      detail: !bar ? '沒有捲軸' : over.length ? over.map((i) => `「${i.label}」${i.left}–${i.right} × 捲軸 ${bar.left}–${bar.right}`).join(';') : `${s.icons.length} 個圖示都在捲軸(${bar.left}–${bar.right})左邊` })
  }
  out.push(await reachCell(page, kind, prefix, shown, tooltip && !expanded))
  await parkPointer(page)
  return out
}

/**
 * R7:捲軸浮出時,列鈕伸到捲軸底下的那段照樣點得到 —— 軌道透明、不接指標,只有滑塊畫到的地方歸滑塊;滑塊照樣拖得動、滾輪照樣捲。
 * (a) 逐 px 命中測試(railProbe op=reach);(b) 真指標停在軌道上(離開滑塊上下的那一列):列鈕 :hover 成立、細列列鈕的 Tooltip 打開;
 * (c) 真指標按住滑塊往下拖 24px:捲動位置往下;(d) 指標回軌道上滾輪往上:捲動位置往上。任一步不成立、或量不到(沒有列鈕伸到軌道底下)都紅,不丟例外
 * (對照組「細列內層釘回展開寬」會讓捲軸整條被裁掉,那時本格紅、其他格照量)。
 */
async function reachCell(page, kind, prefix, shown, tooltip) {
  const label = `${prefix}:R7 捲軸浮出時,列鈕伸到捲軸底下的那段照樣點得到(軌道不接指標、只有滑塊畫到的地方歸滑塊)、滑塊拖得動、滾輪捲得動`
  if (!shown) return { ok: false, label, detail: '滑過 3 秒內沒有捲軸(量不到)' }
  const r = await page.evaluate(railProbe, { kind, op: 'reach' })
  if (r.err) return { ok: false, label, detail: r.err }
  const notes = [`捲軸 ${r.bar}、滑塊 ${r.thumb?.span ?? '無'};${r.rows} 顆列鈕伸到捲軸底下,軌道上 ${r.trackPts} 點、滑塊中段 ${r.thumbPts} 點`]
  let ok = r.rows > 0 && r.trackPts > 0 && !r.miss.length
  if (!(r.rows > 0 && r.trackPts > 0)) notes.push('沒有列鈕伸到軌道底下(量不到)')
  if (r.miss.length) notes.push(`命中不對:${r.miss.join(';')}`)
  const state = () => page.evaluate(railProbe, { kind, op: 'reachState' })
  const waitScroll = async (from) => { // 等捲動位置離開 from 並停下(滾輪可能是平滑捲動);約 2 秒(60 × 兩幀)不動 = 沒捲
    let prev = from
    for (let i = 0; i < 60; i += 1) {
      await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))))
      const st = (await state()).scrollTop
      if (st !== from && st === prev) return st
      prev = st
    }
    return prev
  }
  if (r.cand) {
    await page.mouse.move(r.cand.x, r.cand.y)
    const hovered = await page.waitForFunction(() => !!document.querySelector('[data-reach-probe]')?.matches(':hover'), null, { timeout: 3000 }).then(() => true, () => false)
    const tipOpen = tooltip
      ? await page.waitForFunction(() => { const t = document.querySelector('[data-reach-probe]'); const id = t?.getAttribute('aria-describedby'); return !!id && document.getElementById(id)?.getAttribute('role') === 'tooltip' }, null, { timeout: 5000 }).then(() => true, () => false)
      : null
    if (!hovered || tipOpen === false) ok = false
    notes.push(`指標停在軌道上(${r.cand.x}, ${r.cand.y},「${r.cand.label}」):列鈕 :hover ${hovered}${tooltip ? `、Tooltip ${tipOpen ? '開' : '沒開'}` : ''}`)
  } else { ok = false; notes.push('找不到離開滑塊上下的列(真指標那一步量不到)') }
  if (r.thumb) {
    await page.mouse.move(r.thumb.x, r.thumb.y)
    const st0 = (await state()).scrollTop
    await page.mouse.down()
    await page.mouse.move(r.thumb.x, r.thumb.y + 24, { steps: 6 })
    await page.mouse.up()
    const st1 = await waitScroll(st0)
    const dragged = st1 > st0 + 1
    let wheeled = null
    if (r.cand) {
      await page.mouse.move(r.cand.x, r.cand.y)
      await page.mouse.wheel(0, -400)
      const st2 = await waitScroll(st1)
      wheeled = st2 < st1 - 1
      notes.push(`拖滑塊 24px:捲動位置 ${st0} → ${st1};軌道上滾輪往上:${st1} → ${st2}`)
    } else notes.push(`拖滑塊 24px:捲動位置 ${st0} → ${st1}`)
    if (!dragged || wheeled === false) ok = false
  } else { ok = false; notes.push('沒有滑塊(拖曳那一步量不到)') }
  return { ok, label, detail: notes.join(';') }
}

/**
 * 頁面端(序列化傳入,不得引用外部變數):R8 的量測。kind = standalone(單獨使用,含夾具)/ shell(AppShell 版面上那一份)。
 * op:block(把 `data-density="<blockDensity>"` 掛到 block 指定的那一層:outside = SidebarProvider 外層的父層 / inside = 側欄外框)/
 *     measure(外框寬、圖示寬與中心、當下的 loose、AppShell 的細列量值探針)。
 * 量的列鈕 = 捲動區裡第一顆看得到、前綴是圖示的列鈕;圖示中心相對側欄外框左緣(外框位置會跟著版面移,不比視窗座標)。
 */
function railCenterProbe({ kind, op, block, blockDensity }) {
  const r2 = (n) => Math.round(n * 100) / 100
  const frame = kind === 'shell'
    ? document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])')
    : ((fs, tr) => fs.find((el) => { if (!tr) return true; let p = el.parentElement; while (p && !p.contains(tr)) p = p.parentElement; return !!p && fs.filter((x) => p.contains(x)).length === 1 }))([...document.querySelectorAll('[data-side][data-state]')].filter((el) => !el.closest('[data-app-shell]') && el.querySelector('[data-sidebar="sidebar"]')), document.querySelector('[data-sidebar="trigger"]'))
  if (!frame) return { err: `找不到${kind === 'shell' ? ' AppShell 版面上的' : '單獨使用的'} Sidebar 外框` }
  if (op === 'block') {
    // SidebarProvider 外層:2026-11-13 起帶 data-sidebar="wrapper";修前的建置沒有這個屬性,退回它一直都有的 class(group/sidebar-wrapper)
    const wrapper = frame.closest('[data-sidebar="wrapper"]') ?? frame.closest('[class~="group/sidebar-wrapper"]')
    const host = block === 'outside' ? wrapper?.parentElement : block === 'inside' ? frame : null
    if (!host || host === document.documentElement) return { err: `找不到要掛密度的那一層(${block})` }
    if (blockDensity !== 'md' && blockDensity !== 'lg') return { err: `區塊要換成哪個密度沒給(blockDensity=${blockDensity})` }
    host.setAttribute('data-density', blockDensity)
    return { ok: true }
  }
  const btn = [...frame.querySelectorAll('[data-sidebar="content"] [data-sidebar="menu-button"]')].find((el) => el.getClientRects().length > 0 && !el.closest('[inert],[aria-hidden="true"]') && el.querySelector('[data-prefix-type="icon"] svg'))
  const svg = btn?.querySelector('[data-prefix-type="icon"] svg')
  if (!svg) return { err: '側欄捲動區裡找不到帶圖示的列鈕' }
  const f = frame.getBoundingClientRect(), s = svg.getBoundingClientRect()
  // 當下的值:探針放在側欄外框裡(區塊換密度時,外框裡的 loose 才是列鈕用的那一個)
  const probe = (v, host = frame) => { const p = document.createElement('div'); p.style.cssText = `position:absolute;visibility:hidden;height:1px;width:${v}`; host.appendChild(p); const w = p.getBoundingClientRect().width; p.remove(); return r2(w) }
  const shellProbe = kind === 'shell' ? document.querySelector('[data-token-probe="rail"]') : null
  return {
    state: frame.getAttribute('data-state'),
    collapsible: frame.getAttribute('data-collapsible'),
    htmlDensity: document.documentElement.getAttribute('data-density'),
    width: r2(f.width),
    loose: probe('var(--layout-space-loose)'),
    pageLoose: probe('var(--layout-space-loose)', document.body),
    itemIcon: probe('var(--item-icon-size)'),
    iconWidth: r2(s.width),
    iconCenter: r2(s.left + s.width / 2 - f.left),
    label: (btn.getAttribute('aria-label') || btn.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20),
    shellProbe: shellProbe ? r2(shellProbe.getBoundingClientRect().width) : null,
  }
}

/**
 * R8 的判定(純函式;`--selftest` 的判定表直接餵實量的數字,不用開瀏覽器)。
 * m = { expandedCenter, collapsedCenter, railWidth, loose, iconWidth, specWidth, shellProbe(null = 不在 AppShell 裡,不判 R8c) }
 * 回傳每一條規則 { key, name, ok, detail }。
 */
export function railCenterVerdict(m, tol = TOL) {
  const r2 = (n) => Math.round(n * 100) / 100
  const near = (a, b) => Math.abs(a - b) <= tol
  const formula = 2 * m.loose + m.iconWidth
  const out = [
    { key: 'R8a', name: '收合前後圖示中心不動(相對側欄外框左緣)', ok: near(m.collapsedCenter, m.expandedCenter), detail: `展開 ${m.expandedCenter}、收合 ${m.collapsedCenter}(差 ${r2(m.collapsedCenter - m.expandedCenter)})` },
    { key: 'R8b', name: '收合外框寬 = 2 × 當下的 loose + 畫出來的圖示寬', ok: near(m.railWidth, formula), detail: `外框 ${m.railWidth};2 × ${m.loose} + ${m.iconWidth} = ${r2(formula)}` },
    { key: 'R8d', name: `收合外框寬 = 規格「尺寸規範」寫的這一格(${m.specWidth})`, ok: near(m.railWidth, m.specWidth), detail: `外框 ${m.railWidth}、規格 ${m.specWidth}` },
  ]
  if (m.shellProbe != null) out.push({ key: 'R8c', name: 'AppShell 自己量到的細列寬 = 側欄收合外框寬', ok: near(m.shellProbe, m.railWidth), detail: `AppShell 量到 ${m.shellProbe}、外框 ${m.railWidth}` })
  return out
}
// 判定表(--selftest)。前 6 列取自 2026-11-13 修前 / 修後兩份建置的實量(修前 = 圖示欄跟密度走;修後 = 跟側欄的 size 走);
// 其中修前 size lg 的兩列是夾具量的 —— 這次的程式配修前的樣式(修前的建置沒有「size lg 又能收成細列」的 story 入口)。
// 第 7、8 列是 2026-11-13 審查用自己的量測腳本在修後建置上量的(同一種夾具、同一種破法:在換密度的元素上把圖示欄重設成 1rem)。
// 最後 4 列是邊界情境(數字是設想的,不是哪一份建置量到的)。
const RAIL_CENTER_TABLE = [
  ['修前 一般密度 × size md', { expandedCenter: 24, collapsedCenter: 24, railWidth: 48, loose: 16, iconWidth: 16, specWidth: 48, shellProbe: null }, []],
  ['修前 大密度 × size md(圖示往右 2px)', { expandedCenter: 32, collapsedCenter: 34, railWidth: 68, loose: 24, iconWidth: 16, specWidth: 64, shellProbe: null }, ['R8a', 'R8b', 'R8d']],
  ['修前 一般密度 × size lg(夾具;圖示往左 2px)', { expandedCenter: 26, collapsedCenter: 24, railWidth: 48, loose: 16, iconWidth: 20, specWidth: 52, shellProbe: null }, ['R8a', 'R8b', 'R8d']],
  ['修前 大密度 × size lg(夾具)', { expandedCenter: 34, collapsedCenter: 34, railWidth: 68, loose: 24, iconWidth: 20, specWidth: 68, shellProbe: null }, []],
  ['修後 大密度 × size md', { expandedCenter: 32, collapsedCenter: 32, railWidth: 64, loose: 24, iconWidth: 16, specWidth: 64, shellProbe: 64 }, []],
  ['修後 一般密度 × size lg', { expandedCenter: 26, collapsedCenter: 26, railWidth: 52, loose: 16, iconWidth: 20, specWidth: 52, shellProbe: 52 }, []],
  ['審查實測:一般密度頁面、側欄外框掛大密度 × size lg,圖示欄在外框上被重設成 1rem(F3 的破法;圖示往左 2px)', { expandedCenter: 34, collapsedCenter: 32, railWidth: 64, loose: 24, iconWidth: 20, specWidth: 68, shellProbe: null }, ['R8a', 'R8b', 'R8d']],
  ['審查實測:大密度頁面、側欄外框鎖回一般密度 × size lg,圖示欄在外框上被重設成 1rem(F4 的破法;圖示往左 2px)', { expandedCenter: 26, collapsedCenter: 24, railWidth: 48, loose: 16, iconWidth: 20, specWidth: 52, shellProbe: null }, ['R8a', 'R8b', 'R8d']],
  ['AppShell 量到的細列寬與側欄實際寬脫鉤(SidebarProvider 包在 AppShell 裡面時 size lg 的樣子)', { expandedCenter: 26, collapsedCenter: 26, railWidth: 52, loose: 16, iconWidth: 20, specWidth: 52, shellProbe: 48 }, ['R8c']],
  ['規格的數字被改去遷就算錯的寬(2026-07-14 那種:量到 68、規格也寫 68)—— R8d 會綠,R8a / R8b 照樣紅', { expandedCenter: 32, collapsedCenter: 34, railWidth: 68, loose: 24, iconWidth: 16, specWidth: 68, shellProbe: null }, ['R8a', 'R8b']],
  ['小數 px 排版:差 0.5 不算跳', { expandedCenter: 24, collapsedCenter: 24.5, railWidth: 48.5, loose: 16, iconWidth: 16, specWidth: 48, shellProbe: null }, []],
  ['差 1px 就算', { expandedCenter: 24, collapsedCenter: 25, railWidth: 49, loose: 16, iconWidth: 16, specWidth: 48, shellProbe: null }, ['R8a', 'R8b', 'R8d']],
]

/**
 * R8:一格 = 展開量一次 → 真按開關 → 收成細列再量一次。回傳的每一筆帶 center(格名)與 rule(R8a–R8d);量不到 = instrument: true 的紅格(不丟例外,其餘格照量)。
 */
async function railCenterCells(page, c, prefix) {
  const tag = { center: c.key }
  const instrument = (detail) => [{ ok: false, instrument: true, ...tag, rule: 'R8', label: `${prefix}:R8 量不到(儀器失效)`, detail }]
  if (c.block) {
    const b = await page.evaluate(railCenterProbe, { kind: c.kind, op: 'block', block: c.block, blockDensity: c.blockDensity })
    if (b.err) return instrument(b.err)
    if (!(await settleAfterInteraction(page, { frames: SETTLE_FRAMES })).ok) return instrument('掛上區塊密度後等不到版面靜止')
  }
  await parkPointer(page)
  const e = await page.evaluate(railCenterProbe, { kind: c.kind, op: 'measure' })
  if (e.err) return instrument(e.err)
  if (e.state !== 'expanded') return instrument(`一開始不是展開(data-state=${e.state}),量不到展開時的圖示中心`)
  const wantIcon = ICON_SIZE[c.size]
  if (Math.abs(e.iconWidth - wantIcon) > TOL) return instrument(`要量的是側欄 size=${c.size}(圖示 ${wantIcon}),畫出來的圖示是 ${e.iconWidth} —— size 的入口沒生效`)
  if (Math.abs(e.itemIcon - e.iconWidth) > TOL) return instrument(`前綴欄(--item-icon-size ${e.itemIcon})不等於圖示寬 ${e.iconWidth} —— 這一頁開了全域前綴對齊的混用列,不在 R8 的保證裡`)
  if (e.htmlDensity !== c.density) return instrument(`要量的是整頁${SPEC_DENSITY_NAME[c.density]}密度,<html data-density>=${e.htmlDensity}`)
  // 區塊格:側欄外框裡的 loose 要跟整頁的不一樣、而且方向對(掛大密度 → 比整頁大;鎖回一般密度 → 比整頁小),
  // 否則掛上去的密度沒生效(量到的只是整頁的密度,不是區塊)
  if (c.block && !(c.blockDensity === 'lg' ? e.loose > e.pageLoose + TOL : e.loose < e.pageLoose - TOL)) return instrument(`區塊密度沒生效(要${blockVerb(c)};側欄外框裡的 loose ${e.loose}、整頁 ${e.pageLoose})`)
  await page.click('[data-sidebar="trigger"]')
  if (!(await settleAfterInteraction(page, { frames: SETTLE_FRAMES })).ok) return instrument('按開關後等不到版面靜止')
  await parkPointer(page)
  const k = await page.evaluate(railCenterProbe, { kind: c.kind, op: 'measure' })
  if (k.err) return instrument(k.err)
  if (k.state !== 'collapsed' || k.collapsible !== 'icon') return [{ ok: false, ...tag, rule: 'R8', label: `${prefix}:R8 按開關後收成細列`, detail: `data-state=${k.state} data-collapsible=${k.collapsible}` }]
  if (c.kind === 'shell' && k.shellProbe == null) return instrument('找不到 AppShell 的細列量值探針([data-token-probe="rail"])')
  // 區塊格的規格數字 = 區塊換成的那個密度的那一格(sidebar.spec.md「換了密度的區塊裡也照區塊的密度算」)
  const specWidth = SPEC_RAIL[`${c.block ? c.blockDensity : c.density}/${c.size}`]
  return railCenterVerdict({ expandedCenter: e.iconCenter, collapsedCenter: k.iconCenter, railWidth: k.width, loose: k.loose, iconWidth: k.iconWidth, specWidth, shellProbe: c.kind === 'shell' ? k.shellProbe : null })
    .map((v) => ({ ok: v.ok, ...tag, rule: v.key, label: `${prefix}:${v.key} ${v.name}`, detail: `「${k.label}」${v.detail}` }))
}

function judge(story, step, m) {
  const near = (a, b) => Math.abs(a - b) <= TOL
  if (m.err) return [{ ok: false, label: `${story.id} ${step}`, detail: m.err }]
  const out = []
  const push = (label, ok, detail) => out.push({ ok, label: `${short(story.id)} ${step}:${label}`, detail })
  if (step === '收起') {
    push('data-state = collapsed', m.state === 'collapsed', `state=${m.state}`)
    if (story.mode === 'icon') {
      push(`外框寬 = --sidebar-width-icon(${m.tokenRail})`, near(m.width, m.tokenRail), `width=${m.width}`)
      push('細列上的選單項點得到(不 inert、不 aria-hidden、命中測試打得到)', !m.buttonInert && !m.buttonHidden && m.buttonHit, JSON.stringify({ button: m.button, inert: m.buttonInert, hidden: m.buttonHidden, hit: m.buttonHit }))
    } else {
      push('外框寬 = 0', near(m.width, 0), `width=${m.width}`)
      push('寬 0 時選單項 inert + aria-hidden', m.buttonInert && m.buttonHidden, JSON.stringify({ inert: m.buttonInert, hidden: m.buttonHidden }))
    }
  } else {
    push('data-state = expanded', m.state === 'expanded', `state=${m.state}`)
    push(`外框寬 = --sidebar-width(${m.tokenExpanded})`, near(m.width, m.tokenExpanded), `width=${m.width}`)
    push('選單項可操作', !m.buttonInert && !m.buttonHidden && m.buttonHit, JSON.stringify({ inert: m.buttonInert, hidden: m.buttonHidden, hit: m.buttonHit }))
  }
  return out
}

/** only:對照組只跑會讓指定斷言紅的那幾段(stories = 單獨使用的 story id;shell / density / stress / center / tab / scroll = 跑不跑 AppShell 細列 / 寬鬆密度細列 / 放了東西的細列(STRESS_RAILS)/ 收合前後圖示中心(RAIL_CENTER_CASES)/ 真按 Tab / 捲軸段) */
/** R3k:從文件開頭真按 Tab,走到細列上的第一顆列鈕為止;途中記下外層捲動容器捲到的最大 scrollLeft。 */
async function tabCells(page, c, prefix) {
  const out = []
  const btns = await page.evaluate(railProbe, { kind: c.kind, op: 'buttons' })
  if (btns.err) throw new RailInstrumentError(`${prefix}:${btns.err}`)
  if (btns.collapsible !== 'icon') throw new RailInstrumentError(`${prefix}:一開始不是細列(data-collapsible=${btns.collapsible}),量不到「一開始就是細列」這一格`)
  await parkPointer(page)
  await page.evaluate(() => {
    document.activeElement?.blur?.()
    const sc = document.querySelector('[data-app-shell-scroll]')
    window.__r3kMaxScroll = sc ? sc.scrollLeft : -1
    sc?.addEventListener('scroll', () => { window.__r3kMaxScroll = Math.max(window.__r3kMaxScroll, sc.scrollLeft) })
  })
  const path = []
  let reached = null
  for (let i = 0; i < 20 && !reached; i++) {
    await page.keyboard.press('Tab')
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const a = await page.evaluate(({ kind, role }) => {
      const frame = kind === 'shell' ? document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])') : null
      const el = document.activeElement
      const name = (el?.getAttribute('aria-label') || el?.textContent || el?.tagName || '').trim().replace(/\s+/g, ' ').slice(0, 16)
      const onRail = !!(frame && el && el.matches('[data-sidebar="menu-button"]') && frame.contains(el))
      if (onRail) { document.querySelectorAll('[data-rail-probe]').forEach((x) => x.removeAttribute('data-rail-probe')); el.setAttribute('data-rail-probe', role) }
      return { name, onRail, focusVisible: !!el?.matches(':focus-visible') }
    }, { kind: c.kind, role: TAB_ROLE })
    path.push(a.name)
    if (a.onRail) reached = a
  }
  if (!reached) throw new RailInstrumentError(`${prefix}:按 20 下 Tab 都沒走到細列列鈕(${path.join(' → ')})`)
  if (!reached.focusVisible) throw new RailInstrumentError(`${prefix}:Tab 到的細列列鈕不是 :focus-visible`)
  const maxScroll = await page.evaluate(() => window.__r3kMaxScroll)
  if (!(maxScroll > 0)) throw new RailInstrumentError(`${prefix}:Tab 途中外層捲動容器一次都沒捲(scrollLeft 最大 ${maxScroll}),這一格量不到聚焦帶來的捲動`)
  const isOpen = (role) => { const t = document.querySelector(`[data-rail-probe="${role}"]`); const id = t?.getAttribute('aria-describedby'); return !!t && t.getAttribute('data-state') !== 'closed' && document.getElementById(id ?? '')?.getAttribute('role') === 'tooltip' }
  const opened = await page.waitForFunction(isOpen, TAB_ROLE, { timeout: 5000 }).then(() => true, () => false)
  await page.waitForTimeout(TAB_PERSIST_MS)
  const still = await page.evaluate(isOpen, TAB_ROLE)
  if (still) await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  const tip = still ? await page.evaluate(railProbe, { kind: c.kind, op: 'tip', role: TAB_ROLE }) : { open: false }
  out.push({
    ok: opened && still && tip.open && Math.abs(tip.left - tip.visRight - OVERLAY_SIDE_OFFSET) <= 1,
    label: `${prefix}:R3k 真按 Tab 走到細列「${reached.name}」(${path.length} 下;途中外層捲動容器捲到 ${maxScroll}px):Tooltip 打開、${TAB_PERSIST_MS}ms 後仍開著、左緣 − 列鈕看得到的右緣 = ${OVERLAY_SIDE_OFFSET}`,
    detail: !opened ? '聚焦 5 秒內沒打開 Tooltip' : !still ? `打開過,但 ${TAB_PERSIST_MS}ms 後已關(焦點仍在列鈕上)` : `tooltip.left=${tip.left} 列鈕看得到的右緣=${tip.visRight} 列鈕版面右緣=${tip.right}`,
  })
  await page.evaluate(() => document.activeElement?.blur?.())
  if (!(await page.waitForFunction(tipState, { role: TAB_ROLE, open: false }, { timeout: 5000 }).then(() => true, () => false))) {
    throw new RailInstrumentError(`${prefix}:${TAB_ROLE}的 Tooltip 失焦 5 秒後仍開著`)
  }
  return out
}

async function runPages(page, sv, sabotage, only = null) {
  const results = []
  const open = async (id, query = '') => {
    try {
      await openStory(page, `${sv.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${query}`, {
        settleFrames: SETTLE_FRAMES,
        notFound: sv.notFound,
        waitFor: '[data-sidebar="trigger"]',
        beforeSettle: sabotage ? async (p) => {
          if (sabotage.css) await p.addStyleTag({ content: sabotage.css })
          if (sabotage.script) await p.addScriptTag({ content: sabotage.script })
        } : null,
      })
      return true
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      console.error(`\n✗ ${id}:${error.message}`)
      return false
    }
  }
  // 夾具頁(R8 的 F 格):網址參數給 size;密度寫在 <html data-density>(Storybook 預覽也是寫在這裡),對照組的注入照樣進這一頁
  const openFixture = async (c) => {
    try {
      await openStory(page, `${railFixture.url}?size=${c.size}`, {
        settleFrames: SETTLE_FRAMES,
        notFound: railFixture.notFound,
        waitFor: '[data-sidebar="trigger"]',
        label: `細列圖示中心夾具 size=${c.size}`,
        beforeSettle: async (p) => {
          await p.evaluate((d) => document.documentElement.setAttribute('data-density', d), c.density)
          if (sabotage?.css) await p.addStyleTag({ content: sabotage.css })
          if (sabotage?.script) await p.addScriptTag({ content: sabotage.script })
        },
      })
      return true
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      console.error(`\n✗ 細列圖示中心夾具 size=${c.size}:${error.message}`)
      return false
    }
  }
  try {
    await page.setViewportSize(DEFAULT_VIEWPORT)
    for (const story of STORIES) {
      if (only && !(only.stories ?? []).includes(story.id)) continue
      if (!(await open(story.id))) return { instrumentFail: true, results }
      for (const step of ['收起', '展開']) {
        await page.click('[data-sidebar="trigger"]')
        const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
        if (!settled.ok) { results.push({ ok: false, label: `${story.id} ${step}`, detail: '等不到版面靜止(儀器失效)' }); break }
        await page.mouse.move(0, 0)
        results.push(...judge(story, step, await page.evaluate(measure)))
        if (step === '收起' && story.mode === 'icon') results.push(...await railCells(page, 'standalone', `${short(story.id)} 收起`, story.tooltip))
      }
    }
    for (const rail of SHELL_RAILS) {
      if (only && !only.shell) continue
      if (!(await open(rail.id))) return { instrumentFail: true, results }
      await page.click('[data-sidebar="trigger"]')
      const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      if (!settled.ok) { results.push({ ok: false, label: `${short(rail.id)} 收起`, detail: '等不到版面靜止(儀器失效)' }); continue }
      await parkPointer(page)
      results.push(...await railCells(page, 'shell', `${short(rail.id)} 收起`, rail.tooltip))
    }
    for (const rail of DENSITY_RAILS) {
      if (only && !only.density) continue
      if (!(await open(rail.id, densityQuery(rail.density)))) return { instrumentFail: true, results }
      await page.click('[data-sidebar="trigger"]')
      const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      const prefix = `${short(rail.id)} ${densityName(rail.density)}密度 收起`
      if (!settled.ok) { results.push({ ok: false, label: prefix, detail: '等不到版面靜止(儀器失效)' }); continue }
      await parkPointer(page)
      results.push(...await railCells(page, rail.kind, prefix, rail.tooltip))
    }
    for (const c of STRESS_RAILS) {
      if (only && !only.stress) continue
      if (!(await open(c.id, densityQuery(c.density)))) return { instrumentFail: true, results }
      await page.click('[data-sidebar="trigger"]')
      const prefix = `${short(c.id)} ${densityName(c.density)}密度 收起 + ${STRESSORS[c.stressor]}`
      if (!(await settleAfterInteraction(page, { frames: SETTLE_FRAMES })).ok) { results.push({ ok: false, label: prefix, detail: '等不到版面靜止(儀器失效)' }); continue }
      const inj = await page.evaluate(injectStressor, { stressor: c.stressor })
      if (inj.err) throw new RailInstrumentError(`${prefix}:${inj.err}`)
      if (!(inj.size > inj.visible + TOL)) throw new RailInstrumentError(`${prefix}:${inj.what} ${inj.size} 沒有比細列看得到的 ${inj.visible} 寬,量不到列鈕會不會被撐寬`)
      const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      if (!settled.ok) { results.push({ ok: false, label: prefix, detail: '等不到版面靜止(儀器失效)' }); continue }
      await parkPointer(page)
      results.push(...await railCells(page, 'standalone', `${prefix}(${inj.what} ${inj.size} > 細列看得到的 ${inj.visible})`, true))
    }
    for (const c of RAIL_CENTER_CASES) {
      if (only && !only.center) continue
      if (!(await (c.fixture ? openFixture(c) : open(c.id, `${densityQuery(c.density)}${c.args ? `&args=${c.args}` : ''}`)))) return { instrumentFail: true, results }
      results.push(...await railCenterCells(page, c, railCenterPrefix(c)))
    }
    for (const c of TAB_CASES) {
      if (only && !only.tab) continue
      await page.setViewportSize(c.viewport)
      if (!(await open(c.id))) return { instrumentFail: true, results }
      results.push(...await tabCells(page, c, `${short(c.id)} ${c.viewport.width}×${c.viewport.height} 一開始就是細列`))
    }
    for (const c of SCROLL_CASES) {
      if (only && !only.scroll) continue
      await page.setViewportSize(c.viewport)
      if (!(await open(c.id, densityQuery(c.density)))) return { instrumentFail: true, results }
      if (!c.expanded) await page.click('[data-sidebar="trigger"]')
      const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      const prefix = scrollPrefix(c)
      if (!settled.ok) { results.push({ ok: false, label: prefix, detail: '等不到版面靜止(儀器失效)' }); continue }
      await parkPointer(page)
      results.push(...await scrollCells(page, c.kind, prefix, { expanded: !!c.expanded, tooltip: true }))
    }
  } catch (error) {
    if (!(error instanceof RailInstrumentError)) throw error
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}(量不到不等於沒問題)`)
    return { instrumentFail: true, results }
  } finally {
    await page.setViewportSize(DEFAULT_VIEWPORT)
  }
  return { instrumentFail: false, results }
}

// ── 對照組 (b):2026-10-14 的症狀、「拿掉 inert」、2026-05-21 → 10-27 的細列症狀與它的各個面 ──
const ICON_IDS = STORIES.filter((s) => s.mode === 'icon').map((s) => s.id)
const redAt = (res, re) => res.some((r) => !r.ok && re.test(r.label))
// R8 的對照組判定:某一格的某一條規則紅了(量不到的格不算「被抓到」);某一格全部規則都綠(一條都沒量到不算綠)
const centerRed = (res, key, rule) => res.some((r) => r.center === key && r.rule === rule && !r.ok && !r.instrument)
const centerGreen = (res, key, rules = null) => { const rs = res.filter((r) => r.center === key && (!rules || rules.includes(r.rule))); return rs.length > 0 && rs.every((r) => r.ok) }
const WIDTH_RULES = ['R8a', 'R8b', 'R8d']
const PAGE_SABOTAGE = [
  ['收起的外框寬釘回 --sidebar-width(2026-10-14 實際症狀)', { css: '[data-side][data-collapsible="icon"],[data-side][data-collapsible="offcanvas"]{width:var(--sidebar-width)!important}' },
    { stories: STORIES.map((s) => s.id) },
    (res) => STORIES.every((s) => res.some((r) => !r.ok && r.label.startsWith(short(s.id)) && /收起/.test(r.label)))],
  ['寬 0 那一份拿掉 inert', { script: `const strip = () => document.querySelectorAll('[data-side][data-collapsible="offcanvas"] [inert]').forEach((el) => el.removeAttribute('inert'))
    strip(); new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert'] })` },
    { stories: ['design-system-components-sidebar-展示--offcanvas'] },
    (res) => redAt(res, /展示--offcanvas 收起:寬 0 時選單項 inert/)],
  ['細列的內層釘回 --sidebar-width(2026-05-21 → 10-27 實際症狀:Tooltip 離細列 201px、焦點框缺右邊、捲軸畫在被裁掉的右緣)',
    { css: '[data-side][data-collapsible="icon"] [data-sidebar="sidebar"]{width:var(--sidebar-width)!important;min-width:var(--sidebar-width)!important}' },
    { stories: ICON_IDS, shell: true, density: true, scroll: true },
    (res) => [...ICON_IDS.map(short), ...SHELL_RAILS.map((s) => short(s.id))].every((p) => res.some((r) => !r.ok && r.label.startsWith(p) && /:R1 /.test(r.label)))
      && redAt(res, /寬鬆密度 收起:R1 /) && redAt(res, /:R2 /) && redAt(res, /:R3 /) && redAt(res, /:R4 /) && redAt(res, /:R5 /)],
  // `fillX` 的效果拿掉:捲動區的內容層放回 Radix 預設的 `display: table; min-width: 100%`,被子元素的最小寬撐開。
  // 放在最前面的 @layer theme:Tailwind v4 的 `[&>div]:!block` 是 utilities 層的 !important,而 !important 的層序是反的(越前面的層越強)
  ['拿掉 SidebarContent 的 fillX(內容層放回 display: table:骨架列 / 搜尋框把內容層撐寬,所有列鈕跟著變寬)',
    { css: '@layer theme { [data-sidebar="content"] [data-radix-scroll-area-viewport] > div{display:table!important;width:auto!important;min-width:100%!important} }' },
    { stress: true },
    (res) => [STRESSORS.skeleton, STRESSORS.input].every((s) => ['標準', '寬鬆'].every((d) => ['R1', 'R2', 'R3', 'R4'].every((k) => redAt(res, new RegExp(`${d}密度 收起 \\+ ${s}.*:${k} `)))))],
  // 細列列鈕的 `!pr-0` 拿掉(從元素上移掉那個 class;React 重繪會加回來,所以用 MutationObserver 一直移)。
  // 只在元素真的帶著那個 class 時才移:classList.remove 就算沒有那個 token 也會重寫 class 屬性 → 又觸發 observer → 無限迴圈卡死頁面(2026-10-28 實測)
  ['拿掉細列列鈕的 !pr-0(有列尾動作的列鈕:左內距 + 預留右內距比細列寬)',
    { script: `const T = 'group-data-[collapsible=icon]:!pr-0'
    const strip = () => document.querySelectorAll('[data-sidebar="menu-button"]').forEach((el) => { if (el.classList.contains(T)) el.classList.remove(T) })
    strip(); new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })` },
    { stress: true },
    (res) => ['標準', '寬鬆'].every((d) => ['R1', 'R2', 'R3', 'R4'].every((k) => redAt(res, new RegExp(`${d}密度 收起 \\+ ${STRESSORS.action}.*:${k} `))))],
  ['Tooltip 外殼右移 4px', { css: '[data-radix-popper-content-wrapper]{margin-left:4px!important}' },
    { stories: [ICON_COLLAPSE] },
    (res) => redAt(res, /展示--icon-collapse 收起:R2 /) && redAt(res, /展示--icon-collapse 收起:R3 /)],
  // 修前症狀的面:焦點還在細列列鈕上,一個捲動把剛打開的 Tooltip 關掉。延後 300ms(> FOCUS_SCROLL_IDLE_MS)才派,所以修好的放過窗也不會放過它
  ['Tab 到細列列鈕 300ms 後再派一次外層捲動容器的 scroll(= 修前:捲動把剛打開的 Tooltip 關掉)',
    { script: `document.addEventListener('focusin', (e) => { const b = e.target instanceof Element && e.target.closest('[data-sidebar="menu-button"]'); if (!b) return; setTimeout(() => { const sc = document.querySelector('[data-app-shell-scroll]'); if (sc) sc.dispatchEvent(new Event('scroll')) }, 300) }, true)` },
    { tab: true },
    (res) => TAB_CASES.every((c) => res.some((r) => !r.ok && r.label.startsWith(short(c.id)) && /:R3k /.test(r.label)))],
  ['細列捲軸 visibility:hidden(= 細列不出捲軸)', { css: '[data-collapsible="icon"] [data-radix-scroll-area-viewport] ~ [data-orientation="vertical"]{visibility:hidden!important}' },
    { scroll: true },
    (res) => redAt(res, /:R5 /)],
  ['細列捲軸加寬到 28px(蓋到圖示)', { css: '[data-collapsible="icon"] [data-radix-scroll-area-viewport] ~ [data-orientation="vertical"]{width:28px!important}' },
    { scroll: true },
    (res) => redAt(res, /:R6 /)],
  // 2026-10-28 修前的實際狀態:捲軸軌道接指標(Radix 預設),浮出時蓋住列鈕右側約 10px —— 那段點不到、滑過不變、不開 Tooltip
  ['捲軸軌道接指標(列鈕被軌道蓋住的那段點不到)', { css: '[data-sidebar="content"] [data-radix-scroll-area-viewport] ~ [data-orientation="vertical"]{pointer-events:auto!important}' },
    { scroll: true },
    (res) => SCROLL_CASES.every((c) => res.some((r) => !r.ok && r.label.startsWith(scrollPrefix(c)) && /:R7 /.test(r.label)))],
  ['滑塊也不接指標(拖不動)', { css: '[data-sidebar="content"] [data-radix-scroll-area-viewport] ~ [data-orientation="vertical"] > *{pointer-events:none!important}' },
    { scroll: true },
    (res) => SCROLL_CASES.every((c) => res.some((r) => !r.ok && r.label.startsWith(scrollPrefix(c)) && /:R7 /.test(r.label)))],
  // ── R8 的五種破法(前兩種注入的 !important 蓋過 SidebarProvider 外層的 inline 值;第三、四種蓋的是樣式檔的規則與 AppShell 探針的寬)。每一種都同時指名「必紅的格」與「必須維持綠的格」:
  //    量具分得出 size md 與 size lg、分得出側欄自己的寬與 AppShell 量到的寬、分得出「外層算的」與「外框自己重算的」,不是一律紅 ──
  // 2026-05-26 → 11-13 的實際症狀:圖示欄不跟側欄的 size(那時是跟密度);釘成 20 = 當時大密度的值 → size md 的格圖示往右 2px
  ['圖示欄固定 20、不跟側欄的 size(2026-05-26 → 11-13 大密度 × size md 的實際症狀)', { css: '[data-sidebar="wrapper"]{--sidebar-rail-icon-slot:1.25rem!important}' },
    { center: true },
    (res) => MD_CENTER_KEYS.every((k) => WIDTH_RULES.every((rule) => centerRed(res, k, rule))) && LG_CENTER_KEYS.every((k) => centerGreen(res, k))],
  // 同一個症狀的另一半:釘成 16 = 當時一般密度的值 → size lg 的格圖示往左 2px(F3 / F4 的側欄外框繼承到的也是這個 16,同樣紅)
  ['圖示欄固定 16、不跟側欄的 size(2026-05-26 → 11-13 一般密度 × size lg 的實際症狀)', { css: '[data-sidebar="wrapper"]{--sidebar-rail-icon-slot:1rem!important}' },
    { center: true },
    (res) => LG_CENTER_KEYS.every((k) => WIDTH_RULES.every((rule) => centerRed(res, k, rule))) && MD_CENTER_KEYS.every((k) => centerGreen(res, k))],
  // 樣式檔「衍生值」段的選擇器漏了 SidebarProvider 外層:外層沿用整頁 / 區塊算好的值(圖示欄用備用值 16)→ size lg 少 4px;size md 本來就等於那個值。
  // F3 / F4 不靠外層算好的值:側欄外框自己帶 data-density,公式在外框上重算、圖示欄 20 照常從外層繼承進來 → 維持綠
  ['SidebarProvider 外層不重算細列寬(樣式檔的選擇器漏了外層)', { css: '[data-sidebar="wrapper"]{--sidebar-width-icon:inherit!important}' },
    { center: true },
    (res) => LG_CENTER_KEYS.filter((k) => !LG_INSIDE_KEYS.includes(k)).every((k) => WIDTH_RULES.every((rule) => centerRed(res, k, rule)))
      && [...MD_CENTER_KEYS, ...LG_INSIDE_KEYS].every((k) => centerGreen(res, k))],
  // AppShell 的量值探針量到別的寬(SidebarProvider 包在 AppShell 裡面時 size lg 會這樣):版面模型用的細列寬 ≠ 側欄實際寬。
  // 40 不等於任何一格的細列寬 → AppShell 四格的 R8c 都紅;側欄自己的寬沒動 → 同四格的 R8a / R8b / R8d 與其餘八格維持綠
  ['AppShell 量到的細列寬釘成 40(與側欄實際寬脫鉤)', { css: '[data-token-probe="rail"]{width:40px!important}' },
    { center: true },
    (res) => SHELL_CENTER_KEYS.every((k) => centerRed(res, k, 'R8c') && centerGreen(res, k, WIDTH_RULES))
      && RAIL_CENTER_CASES.filter((c) => c.kind !== 'shell').every((c) => centerGreen(res, c.key))],
  // 圖示欄沒有穿過密度邊界繼承下去(2026-11-13 審查的破法):在每個換密度的元素上把圖示欄重設成備用值 1rem。不加 !important ——
  // SidebarProvider 外層自己的 inline 值照樣贏,所以 <html> 與外層的父層被重設不影響任何一格;只有「外層裡面又有換密度的元素」那裡會斷。
  // size md 的格(含 D2)圖示欄本來就是 16 = 1rem → 維持綠(= 還沒有 F3 / F4 時這種破法十格全綠的原因);
  // size lg、密度掛在側欄外框上的 F3 / F4 → 細列寬少 4(64 / 48)、圖示收合後往左 2px → R8a / R8b / R8d 紅
  ['換密度的元素上把圖示欄重設成 1rem(圖示欄沒有穿過密度邊界繼承下去)', { css: '[data-density],[data-ui-size],[data-layout-space]{--sidebar-rail-icon-slot:1rem}' },
    { center: true },
    // LG_INSIDE_KEYS 是空的(有人把 F3 / F4 拿掉)= 這種破法沒有任何一格在驗 → 不算被抓到(空集合的 every 恆真,M37「沒觀察到 ≠ 沒發生」)
    (res) => LG_INSIDE_KEYS.length > 0 && LG_INSIDE_KEYS.every((k) => WIDTH_RULES.every((rule) => centerRed(res, k, rule)))
      && RAIL_CENTER_CASES.filter((c) => !LG_INSIDE_KEYS.includes(c.key)).every((c) => centerGreen(res, c.key))],
]

// ── 跑 ──
const problems = []
if (SELFTEST) {
  const pre = selfGroupVariantSites(PRE_FIX_SNIPPET)
  if (pre.length === 1) console.log(`✓ 對照組 (a):2026-10-14 的 Sidebar 寫法被抓到(${pre[0].tokens.join(' ')})`)
  else problems.push(`對照組 (a):2026-10-14 的 Sidebar 寫法沒被抓到(${pre.length} 處)—— 靜態段無效`)
  for (const [name, red] of RED_SNIPPETS) {
    const v = selfGroupVariantSites(red)
    if (v.length) console.log(`✓ 對照組 (a):${name} → 抓到(${v[0].tokens.join(' ')})`)
    else problems.push(`對照組 (a):${name} 沒被抓到 —— 靜態段的廣度不夠`)
  }
  for (const clean of CLEAN_SNIPPETS) {
    const v = selfGroupVariantSites(clean)
    if (v.length) problems.push(`靜態段誤報乾淨寫法:${clean}`)
  }
  if (!problems.length) console.log(`✓ 乾淨寫法 ${CLEAN_SNIPPETS.length} 種都不誤報`)
  // R8 判定表:實量的數字餵給純函式,該紅的規則紅、其餘綠(紅的集合要一模一樣,多紅一條也算錯)
  for (const [name, m, mustRed] of RAIL_CENTER_TABLE) {
    const red = railCenterVerdict(m).filter((v) => !v.ok).map((v) => v.key).sort()
    if (red.join(',') === [...mustRed].sort().join(',')) console.log(`✓ R8 判定表:${name} → ${red.length ? `${red.join('、')} 紅` : '全綠'}`)
    else problems.push(`R8 判定表「${name}」:該紅 ${mustRed.join('、') || '無'},實際紅 ${red.join('、') || '無'}`)
  }
} else {
  const st = staticScan()
  console.log(`${st.bad.length ? '✗' : '✓'} 靜態:元素自己帶 group / peer 又用 group-* / peer-* 變體(掃 ${st.files} 檔)${st.bad.length ? '\n    ' + st.bad.join('\n    ') : ''}`)
  if (st.bad.length) problems.push(`靜態段 ${st.bad.length} 處`)
}

requireFreshStorybookBuild(S, [
  'packages/design-system/src/components/Sidebar/sidebar.tsx',
  // 細列寬的公式住這個樣式檔(2026-11-13 修的正是它;沒列的話拿舊建置跑,R8 會假綠 / 假紅)
  'packages/design-system/src/components/Sidebar/sidebar.css',
  'packages/design-system/src/components/Sidebar/sidebar.stories.tsx',
  'packages/design-system/src/components/Sidebar/sidebar.anatomy.stories.tsx',
  'packages/design-system/src/components/AppShell/app-shell.tsx',
  'packages/design-system/src/components/AppShell/app-shell.stories.tsx',
  // R8 的 A 格:AppShell「狀態行為」與它用的示範側欄(`menuSize` 參數住這裡)
  'packages/design-system/src/components/AppShell/app-shell.anatomy.stories.tsx',
  'packages/design-system/src/components/AppShell/_demo-helpers.tsx',
  'packages/design-system/src/components/ScrollArea/scroll-area.tsx',
  'packages/design-system/src/components/Tooltip/tooltip.tsx',
])
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
// R8 的 F 格用的夾具頁(樣式 = 正在服務的這一份建置;元件 = 這次 checkout 的原始碼)。掛不起來 = 儀器失效
let railFixture = null
try {
  railFixture = await startStorybookCssFixture(sv.servedRoot, { source: RAIL_FIXTURE_SOURCE, label: '細列圖示中心夾具', title: '細列圖示中心夾具' })
} catch (error) {
  await sv.stop()
  if (!(error instanceof FixtureInstrumentError)) throw error
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${error.message}(${RAIL_FIXTURE_SOURCE})—— 夾具掛不起來是儀器失效,不是產品裁決`)
  process.exit(1)
}
const stopServers = async () => { await railFixture.stop(); await sv.stop() }
const br = await launchBrowserOrSkip({}, { cleanup: stopServers })
const page = await br.newPage({ viewport: DEFAULT_VIEWPORT })
/** R8 量不到的格:結尾另印標記(meta-test 靠它分辨「量不到」與「被抓到」) */
const unmeasured = (results) => results.filter((r) => r.instrument)

if (!SELFTEST) {
  const run = await runPages(page, sv, null)
  if (run.instrumentFail) { await br.close(); await stopServers(); process.exit(1) }
  // 綠的格也印量到的值(R1–R8 的數字是證據,不只是勾)
  for (const r of run.results) console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.ok && !/:R\d[a-z]? /.test(r.label) ? '' : ` | ${r.detail}`}`)
  const failed = run.results.filter((r) => !r.ok).length
  if (failed) problems.push(`頁面段 ${failed} 格不符`)
  const blind = unmeasured(run.results)
  if (blind.length) console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:R8 有 ${blind.length} 格量不到(${blind.map((r) => r.center).join('、')})—— 量不到不等於沒問題`)
} else {
  // 前提:未破壞的頁面本身全綠(否則對照組紅了也不代表什麼)
  const base = await runPages(page, sv, null)
  if (base.instrumentFail) { await br.close(); await stopServers(); process.exit(1) }
  const baseBad = base.results.filter((r) => !r.ok)
  if (baseBad.length) problems.push(`前提不成立:未破壞的頁面就有 ${baseBad.length} 格不符(${baseBad[0].label})`)
  for (const [name, sabotage, only, isRed] of PAGE_SABOTAGE) {
    const run = await runPages(page, sv, sabotage, only)
    if (run.instrumentFail) { await br.close(); await stopServers(); process.exit(1) }
    const blind = unmeasured(run.results)
    if (blind.length) problems.push(`對照組 (b)「${name}」有 ${blind.length} 格量不到(${blind.map((r) => `${r.center}:${r.detail}`).join(' / ')})—— ${INSTRUMENT_FAIL_MARKER},量不到不算被抓到`)
    else if (isRed(run.results)) console.log(`✓ 對照組 (b)「${name}」→ 指定的斷言紅(${run.results.filter((r) => !r.ok).length} 格)`)
    else problems.push(`對照組 (b)「${name}」沒讓指定的斷言紅 —— 量具無效(紅的格:${run.results.filter((r) => !r.ok).map((r) => r.label).join(' / ') || '無'})`)
  }
}
await br.close(); await stopServers()
if (problems.length) { console.log(`\n✗ ${SELFTEST ? 'selftest' : '單獨使用的 Sidebar 收合'}:\n  ${problems.join('\n  ')}`); process.exit(1) }
console.log(SELFTEST
  ? `\n✓ selftest:靜態對照組、R8 判定表 ${RAIL_CENTER_TABLE.length} 列與 ${PAGE_SABOTAGE.length} 種頁面破壞各自讓閘紅 —— 量具會紅`
  : `\n✅ 單獨使用的 Sidebar:${STORIES.length} 則 story 收起 / 展開的寬度與可操作性、細列(含 AppShell ${SHELL_RAILS.length} 則、寬鬆密度 ${DENSITY_RAILS.length} 則、放骨架列 / 搜尋框 / 預留動作內距 ${STRESS_RAILS.length} 格)的列鈕版面 / Tooltip 間距 / 焦點框四邊、收合前後圖示中心與細列寬(${RAIL_CENTER_CASES.length} 格:兩種密度 × 側欄 size md / lg、區塊密度、AppShell)、真按 Tab 到細列的 Tooltip(${TAB_CASES.length} 格)、捲軸(${SCROLL_CASES.length} 種組合,含 AppShell;細列捲軸蓋到的那段列鈕點得到,只量細列)都符合、靜態段 0 違規`)
process.exit(0)
