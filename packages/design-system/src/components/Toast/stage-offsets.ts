/**
 * @internal — 舞台佔用 → sonner `<Toaster>` 的落點參數 —— 純函式,供判定表逐格驗(`scripts/toast-stage-placement-invariant.mjs` 的 T 段)。
 * 不進 barrel / subpath(consumer 用不到它;只有 `toast.tsx` 與閘消費)。
 *
 * SSOT:`toast.spec.md`「落點」(規則 + user 2026-08-08 原話);舞台幾何通道 `lib/stage-geometry.ts`。
 *
 * 要保證的性質(逐字):**Toast 照它自己原本的對齊規則落在舞台上** —— 靠右的對齊舞台右緣、置中的對齊舞台中線、
 * 靠左的本來就在舞台左緣;入口鈕在家佔住右下角時,會碰到它的靠下 Toast 疊在它上方。
 *
 * 這裡的「距離」都量自 Toast 清單的定位框(`<Toaster>` 的 `position: fixed` 包含塊;一般 app = 視窗),
 * 換算由 `useStageGeometry` 負責,這裡只把距離翻成 sonner 吃的三種參數:
 * - `offset`(桌機)/ `mobileOffset`(`styles.css` `@media (max-width: 600px)`,sonner 整列滿寬)—— 寫進 `--offset-*` 自訂屬性;
 * - `style.left` —— 只給置中:sonner 的置中規則是寫死的 `left: 50%; transform: translateX(-50%)`(`styles.css:68-71`),
 *   不吃任何 offset;sonner 把 `style` 展開在清單 `<ol>` 上、排在自己的 offset 之前(`dist/index.mjs:1102-1107`),
 *   行內 `left` 蓋過樣式表那條。手機寬度永遠碰不到:並排要 960 的容器(`AGENT_PANEL_SIDE_BY_SIDE_MIN_CONTAINER`),
 *   有右緣佔用時視窗必然 > 600,所以行內 `left` 不會壓掉手機版置中那條規則。
 *
 * 型別只 import type(Node 直接載入本檔跑判定表時會整行抹掉),本檔沒有任何執行期 import。
 */
import type { ToasterProps as SonnerToasterProps } from 'sonner'
import type { StageGeometry } from '@/design-system/lib/stage-geometry'

export type ToastPosition = 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'

/**
 * sonner 2.0.7 的預設邊距 —— 只在「舞台有佔用、要重算那一側」時用,沒有佔用時一律不傳(交給 sonner 自己的預設)。
 * 來源:`node_modules/sonner/dist/index.mjs:413` `VIEWPORT_OFFSET = '24px'`、`:415` `MOBILE_VIEWPORT_OFFSET = '16px'`。
 * 兩個數字與 sonner 原始碼一致由 `scripts/toast-stage-placement-invariant.mjs` 的 C 段 import 這兩個值、與 sonner 原始碼的字面值比對(升級 sonner 改了就紅)。
 */
export const SONNER_VIEWPORT_OFFSET = 24
export const SONNER_MOBILE_VIEWPORT_OFFSET = 16

export type StageOffsets = Pick<SonnerToasterProps, 'offset' | 'mobileOffset' | 'style'>

/**
 * 舞台佔用 → sonner 的 offset / mobileOffset / style(只填被影響的那一側,其餘 sonner 補自己的預設)。
 * - 右緣被切走(並排的代理面板,`rightInset`):
 *   靠右 → 離**舞台**右緣 24,跟沒有面板時離視窗右緣一樣;
 *   置中 → 對齊**舞台**中線(舞台 = 定位框左緣到面板左緣,中線 = 50% − rightInset / 2);
 *   靠左 → 舞台左緣沒動,不改。上下都不動。
 * - 右下角被佔(在家的入口鈕,`bottomInset`)→ 靠下靠右的 Toast 疊在它上方、間距 = 入口鈕自己的 loose;左右不動。
 *   手機寬度 sonner 整列滿寬,任何靠下的位置都會碰到入口鈕,所以 mobileOffset 對所有 bottom-* 生效。
 */
export function stageOffsets(position: ToastPosition, geometry: StageGeometry): StageOffsets {
  const [y, x] = position.split('-') as ['top' | 'bottom', 'left' | 'right' | 'center']
  const offset: { right?: number; bottom?: number } = {}
  const mobileOffset: { bottom?: number } = {}
  let style: { left: string } | undefined
  if (geometry.rightInset !== null && x === 'right') offset.right = SONNER_VIEWPORT_OFFSET + geometry.rightInset
  if (geometry.rightInset !== null && geometry.rightInset > 0 && x === 'center') style = { left: `calc(50% - ${geometry.rightInset / 2}px)` }
  if (geometry.bottomInset !== null && y === 'bottom') {
    if (x === 'right' && geometry.bottomInset > SONNER_VIEWPORT_OFFSET) offset.bottom = geometry.bottomInset
    if (geometry.bottomInset > SONNER_MOBILE_VIEWPORT_OFFSET) mobileOffset.bottom = geometry.bottomInset
  }
  return {
    ...(offset.right !== undefined || offset.bottom !== undefined ? { offset } : null),
    ...(mobileOffset.bottom !== undefined ? { mobileOffset } : null),
    ...(style ? { style } : null),
  }
}
