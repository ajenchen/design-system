// ── 消費的 SSOT ──
// - Family 4 外殼 / 字級:Field/field-wrapper.tsx `fieldWrapperStyles` `fieldDisplayTextClass`(field-controls.spec.md 共享 contract (d)(e))
// - 值的前綴圖示(`icon`):排法 = item-anatomy `ItemPrefix` + 內容、間距 gap-2 = 8(item-anatomy.spec.md「消費元件預設」prefix ↔ content gap);
//   尺寸 = tokens/uiSize/icon-size `ICON_SIZE`(sm / md 16、lg 20);顏色跟著值(select.spec.md 圖示對照表「Value icon」、field-controls.spec.md「Icon 色彩原則」)
// - 截斷 + 提示:patterns/element-anatomy/truncated-text `TruncatedText`(tooltip.spec.md「截斷文字」)
// - 命中區:ds-canonical/references/hit-area-canonical.md 一-4「懸停回饋形狀 ≡ 命中區」(圖示在連結裡)
import * as React from 'react'
import { Pencil, type LucideIcon } from 'lucide-react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant, FieldVariantInternal, FieldWidth } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, fieldWidthVariant, fieldWidthStyle, bareInputStyles, fieldDisplayTextClass, FIELD_TEXT_ENTRY_CURSOR, focusFieldInputFromChrome } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid, useFieldEmptyDisplay, fieldEmptyColorClass } from '@/design-system/components/Field/field-context'
import { ItemInlineAction, ItemPrefix, ItemSuffix, type ItemSuffixHoverGroup } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'
import { Button } from '@/design-system/components/Button/button'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { editSettleKeyProps } from '@/design-system/components/Field/field-edit-keys'
import { FieldClearButton } from '@/design-system/components/Field/field-clear-button'
import { FieldError } from '@/design-system/components/Field/field'
import { keepFocusOnPointerPress } from '@/design-system/lib/pointer-press'
import { isWithinCompositeField } from '@/design-system/lib/composite-field-focus'
import { escapeLayerProps, isEscapeTakenElsewhere } from '@/design-system/lib/overlay-escape'

// ── URL Validation ──────────────────────────────────────────────────────────

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** 沒寫協定、但看起來就是網址:主機名由「標籤.標籤…頂級網域(2 個字母以上)」組成,可帶 :埠號與路徑 / 查詢 / 錨點;不含空白與 @(信箱不算網址) */
const LOOKS_LIKE_WEB_ADDRESS = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#]\S*)?$/i

/**
 * 「頂級網域」要是真的頂級網域(link-input.spec.md「驗證」):主機名結尾是下面這些檔案副檔名的字是檔名(`report.pdf`、`invoice-2026.xlsx`、`node.js`),
 * 不是網址 —— 這些副檔名沒有一個是頂級網域(IANA 頂級網域清單 2026-11-03 版逐一查過)。副檔名剛好也是頂級網域的(`.md`、`.zip`、`.ai` …)不在這裡。
 */
const FILE_EXTENSIONS_NOT_TLD = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'key', 'numbers', 'pages',
  'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log', 'lock', 'env',
  'html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'php', 'rb', 'go', 'kt', 'swift', 'cpp', 'cs', 'sql',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'psd', 'sketch', 'fig',
  'avi', 'mkv', 'wav', 'flac', 'mpeg', 'rar', 'tar', 'gz', 'tgz', 'dmg', 'exe', 'msi', 'apk', 'ipa', 'iso', 'bak', 'tmp',
])

/**
 * 網址值 → 可以安全點的網頁網址(link-input.spec.md「驗證」;F2 乙,2026-10-21 確認頁):
 * 已經是 http(s) 網址 → 原樣;沒寫協定、看起來像網址(`www.acme.com`、`acme.com/pricing`)→ 補 `https://`;
 * 其他(`javascript:` / `data:` / `mailto:` / `ftp:` 等別的協定、信箱、中間有空白的字、檔名 `report.pdf`)→ null,永遠不會變成 href。
 * 顯示(唯讀 / 檢視 / 表格連結格)與編輯模式的驗證、提交都經這一支。
 */
function toWebUrl(value: string): string | null {
  const v = value.trim()
  if (!v || /\s/.test(v)) return null
  if (isHttpUrl(v)) return v
  if (!LOOKS_LIKE_WEB_ADDRESS.test(v)) return null
  const host = v.split(/[:/?#]/, 1)[0]
  if (FILE_EXTENSIONS_NOT_TLD.has(host.slice(host.lastIndexOf('.') + 1).toLowerCase())) return null
  const candidate = `https://${v}`
  return isHttpUrl(candidate) ? candidate : null
}

/**
 * 網址不合法時框下那一行的預設字(2026-11-22,user 11-22 確認頁拍板丙;link-input.spec.md「驗證」「錯誤說明」)。
 * 句型照 DS 既有的「請輸入…」;例子用沒寫 https:// 的寫法,因為沒寫協定也收(上方 toWebUrl 自動補)。使用端用 `errorText` 換字。
 */
const LINK_INPUT_DEFAULT_ERROR_TEXT = '請輸入網址,例如 acme.com' // i18n-allow: DS default validation message(同 FieldError 範例句型「請輸入…」)

function formatHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ── View rendering(inline,2026-05-05 Phase B3 retire LinkInputDisplay)──
// 取代 LinkInputDisplay sub-component:純展示 a tag,無 input chrome、無 hover affordance。
// edit mode 內 link state(showLink branch)也共用此 helper,確保「編輯態的 link 顯示」與
// view mode 的視覺完全一致(SSOT)。
// 連結 hover 字色瞬間切換,不寫 transition-colors(tokens/motion/motion.spec.md「hover 回饋不做過渡」;2026-09-26 由底色延伸到字色,待辦總帳 L9 / N4(3))。
// **連結的可點範圍 = 網址文字本身**(link-input.spec.md「Link 狀態」;2026-10-13 起所有模式適用,待辦總帳 Q3a):
// `inline-block` 讓盒子只有文字那麼寬,`max-w-full` + truncate 讓太長時縮到外層寬並截斷,`align-top` 抵掉
// inline-block + overflow 時基線落到下緣的那一截(靜止畫面 0 像素差,靠左 / 靠右 / 置中三種對齊不動)。
// 2026-10-13 前是 `block`:block 盒子撐滿外層,文字右邊看起來空白的那一段點下去會開網頁 —— 09-26 只把編輯模式那一支的外層
// 改成 flex 修掉,唯讀 / 檢視模式與表格連結格(用檢視模式)仍是整行連結。改這一處,全部模式一起好。
// 不用 `w-fit`:block + w-fit 會讓靠右 / 置中的連結欄文字跑到左邊(實測靠右時文字左緣 1546 → 1480)。
// **框裡 Pencil 以外整個框都開連結**(`stretch`;2026-11-06 user「照①乙②b」,link-input.spec.md「Link 狀態」):
// 能不能編輯都一樣 —— 框裡不是按鈕的地方,最常用的「開連結」拿整個框;能編輯的地方 Pencil 是滑鼠唯一的編輯入口(它自己 `relative`,照樹的順序畫在延伸區上面)。
// 做法 = 延伸連結(連結自己的 `::before` 鋪滿最近的定位祖先;Bootstrap `.stretched-link` 同一招(它用 ::after):
// https://github.com/twbs/bootstrap/blob/v5.3.3/scss/helpers/_stretched-link.scss#L1-L15),所以中鍵 / Ctrl+點 / 右鍵選單都是真的連結,
// 而且滑過整框就是滑過連結:底線 + 手形跟點擊範圍同一塊(hit-area-canonical「懸停回饋 ≡ 命中區」)。
// 盒子本身仍是文字寬(L1 量的那一個)。用 `::before` 不用 `::after`:文字那一層也設 `relative`(`[&>*]:relative`)後,
// 兩者同在定位層、照樹的順序畫 —— ::before 在前、文字在上,截斷提示仍抓得到滑過,不必另開 z 值(疊放順序表,layer-order 閘)。
// `data-link-stretch`:宿主要暫時收起延伸區時用(DataTable 試算表沒選中的格第一下只選格,見 data-table.css)。
// `coverBorder`:框的邊框看得見、滑過會變深(編輯模式)時,延伸區往外多蓋一條框寬(`--field-border-width`,1px;框沒有 overflow 裁切)——
// 變色的地方都點得開;其他模式的邊框透明、滑過不變,只蓋到內距。
// **值的前綴圖示(`icon`,2026-11-27 user 定案;link-input.spec.md「值的前綴圖示」)**:有傳時連結改成 `inline-flex items-center gap-2`
// —— 圖示(ItemPrefix,不縮)+ 間距 8 + 字(TruncatedText,截斷的是字),排法同 Select 欄位上的值圖示(select.tsx SelectedValuePrefix + 欄位 gap-2)。
// 圖示在 `<a>` 裡:顏色跟字一樣(lucide 用 currentColor → 吃連結的 text-primary / 滑過 text-primary-hover),滑過圖示就是滑過連結,
// 盒子 = 圖示 + 間距 + 字(仍不撐滿整行)。底線只畫在字上(text-decoration 不畫在 svg 上)。沒傳 = 原本的 inline-block,DOM 不變。
function renderLinkAnchor(value: string, label?: string, stretch = false, coverBorder = false, icon?: LinkValueIcon) {
  const displayText = linkDisplayText(value, label)
  return (
    <a
      // 看起來像網址的值補上 https://(toWebUrl);站內路徑原樣
      href={toWebUrl(value) ?? value}
      target="_blank"
      rel="noopener noreferrer"
      data-link-stretch={stretch ? '' : undefined}
      className={cn(
        'inline-block max-w-full align-top truncate min-w-0 text-primary hover:text-primary-hover hover:underline',
        // 有圖示:inline-flex 取代 inline-block(cn 的 tailwind-merge 去掉後者);truncate 留著無害 —— 截斷由裡面的字自己做,
        // 延伸區(::before)的定位祖先在連結外面,不受連結的 overflow 裁切(同修前)
        icon && 'inline-flex items-center gap-2',
        stretch && "before:absolute before:content-[''] [&>*]:relative",
        // 多蓋的那一圈 = 欄位框寬(--field-border-width;2026-11-25 前寫死 -inset-px,值不變)
        stretch && (coverBorder ? 'before:-inset-[var(--field-border-width)]' : 'before:inset-0'),
      )}
    >
      {icon && renderValueIcon(icon)}
      {/* 截斷必附 tooltip(tooltip.spec.md:30)— anchor 自身即 hover 目標、無疊層,TruncatedText
          放 anchor 內(trigger = 其 span child)即可;view/readonly/edit-showLink 共用本 helper 一處修。
          display="block":anchor 是 inline-block 容器(有圖示時是 inline-flex,字是 flex 子項、min-w-0 讓它縮),截斷照常運作(對照 breadcrumb.tsx anchor 內同型消費)。 */}
      <TruncatedText display="block">{displayText}</TruncatedText>
    </a>
  )
}

/** 值的前綴圖示(`LinkInputProps.icon`):圖示元件 + 這個欄位的圖示尺寸 */
interface LinkValueIcon { Icon: LucideIcon; size: number }

/**
 * 值的前綴圖示那一格(連結 / 一般文字 / 停用三處同一支):ItemPrefix(`h-[1lh] shrink-0` —— 跟第一行字置中、截斷時不縮)+ 圖示。
 * 顏色不寫:吃外層(連結色 / 一般文字色 / 停用色),跟字永遠同一個顏色。讀屏略過(aria-hidden),連結的名字仍是顯示的字。
 * `data-link-value-icon`:閘用(data-table-link-cell-invariant L11 / link-input-url-display-invariant)。
 */
function renderValueIcon({ Icon, size }: LinkValueIcon) {
  return <ItemPrefix data-link-value-icon=""><Icon size={size} className="pointer-events-none" aria-hidden /></ItemPrefix>
}

/** 站內路徑:以 `/` 開頭、解析後仍在同一個網站(擋掉 `//host`、`/\\host`、夾 tab 換行的那些被瀏覽器正規化成別的網站的寫法)。 */
const SAME_SITE_PROBE = 'https://same-site.invalid'
function isSameSitePath(value: string): boolean {
  if (!value.startsWith('/')) return false
  try {
    return new URL(value, SAME_SITE_PROBE).origin === SAME_SITE_PROBE
  } catch {
    return false
  }
}

/**
 * 顯示一個網址值:能安全點的才畫成連結,其他一律畫成一般文字(2026-10-13,待辦總帳 Q3e)。
 * 能點 = 網頁網址(http(s) 開頭,或看起來像網址而補上 https://;與編輯模式的驗證同一支 `toWebUrl`,link-input.spec.md「驗證」)
 * **或站內路徑**(`/projects/8821/tasks/4821` 這種同一個網站裡的位址 —— 修前就畫成連結,`AgentPanel` 網址登記示範的任務標題欄靠它開對話框;
 * 它解析後一定是本站的 http(s),不是「不合法的字」,不在這次要修的範圍)。
 * 唯讀 / 檢視模式與表格連結格(`DataTable/cell-registry.tsx` UrlCell 用檢視模式)都經這裡 ——
 * `javascript:` / `data:` / `mailto:` 等別的協定、信箱、中間有空白的字,一律不會成為 `href`。編輯模式不收站內路徑(只收網頁網址)。
 */
function renderLinkValue(value: string, label?: string, stretch = false, icon?: LinkValueIcon) {
  if (isLinkable(value)) return renderLinkAnchor(value, label, stretch, false, icon)
  const text = <TruncatedText display="block">{linkDisplayText(value, label)}</TruncatedText>
  // 不是連結的值也畫值的圖示(同 Select 值圖示「四個 mode 都畫、顏色跟著值」:這裡跟字同為一般文字色)【AI 推導 2026-11-27,link-input.spec.md「值的前綴圖示」】
  return icon ? renderIconRow(icon, text) : text
}

/** 不是連結的值(一般文字 / 停用的灰字)帶圖示:同一套排法(圖示 + 間距 8 + 字),顏色由外層給 */
function renderIconRow(icon: LinkValueIcon, text: React.ReactNode, className?: string) {
  return <span className={cn('flex min-w-0 items-center gap-2', className)}>{renderValueIcon(icon)}{text}</span>
}

/** 能安全點的值(網頁網址或站內路徑;見上方 renderLinkValue) */
function isLinkable(value: string): boolean {
  return toWebUrl(value) != null || isSameSitePath(value)
}

/**
 * @internal — 這個值在檢視 / 唯讀時會不會畫成連結(與 `renderLinkValue` 同一支判斷)。DataTable 用它分網址格:
 * 有連結 = 格裡 Pencil 以外都開連結,不是「點格即編輯」的格;空值 / 不是網址 = 沒有連結可開,照其他可編輯格點格進編輯
 * (link-input.spec.md「Link 狀態」;data-table.spec.md「Navigate-valued cell 通用類別」第 1 條)。
 */
export function isLinkInputValueLinkable(value: unknown): boolean {
  return typeof value === 'string' && value !== '' && isLinkable(value)
}

/**
 * 一個網址值在畫面上顯示的字 —— 連結、一般文字、停用的灰字**同一份**(2026-10-21,r1b fields F2 收成一支):
 * 有 `label` 用 label;能點的顯示主機名(`formatHostname`);其他顯示原字串 —— 不走 formatHostname:`mailto:` / `tel:` / `javascript:` / `data:`
 * 解析得動、hostname 卻是空的,會整格空白(2026-10-13 探針實測)。2026-10-21 前停用那一支另寫 `label || formatHostname(value)`,
 * 這幾種值在停用時被畫成「-」(看起來像沒填;唯讀 / 檢視顯示原字串,link-input.spec.md「readonly / disabled」)。
 */
function linkDisplayText(value: string, label?: string): string {
  if (label) return label
  return isLinkable(value) ? formatHostname(toWebUrl(value) ?? value) : value
}

/**
 * 裝著連結的那一層外殼:**只給 `min-w-0`(在 flex 裡縮得下),不裁切**(2026-10-21,r1b DT-01)。
 * 截斷由被截的那個葉節點自己做 —— 連結 = `renderLinkAnchor` 的 `inline-block max-w-full truncate`、不是連結的值 = `TruncatedText`、
 * 空值與停用的純文字各自 `block truncate`。外殼若再 `truncate`(`overflow:hidden`),連結的焦點框(全域外描邊,往外 2px)
 * 會被裁到只剩右邊一條 2px、看起來像文字游標 —— 2026-10-21 前鍵盤停在表格連結格與唯讀 / 檢視的連結上都是這樣。
 * `ds-canonical/references/focus-canonical.md`「問題二」→「正當障礙」:截斷用的 wrapper 不是正當障礙,修 wrapper、框照樣往外
 *(DataTable 開關格 2026-09-07 同一例);編輯模式連結狀態那一支本來就是 `flex-1 min-w-0 flex`,不裁。
 * 閘:`scripts/data-table-link-cell-invariant.mjs` L8(焦點框四邊真的畫出來,截圖比對)。
 */
const LINK_HOST_CLASS = 'min-w-0'

/**
 * @internal — 檢視態編輯入口那一層的標記(`viewEditAction`)。宿主用它找鈕做「編輯結束後焦點歸還」—— 標記是 LinkInput 自己的,
 * 不帶任何宿主字眼:欄位不知道表格(`governance/planning/cell-indicator-ssot-rfc.md` 否決選項 3 的理由「Field 知道 DataTable context = leak」)。
 */
export const LINK_INPUT_EDIT_ENTRY_ATTR = 'data-link-edit-entry'

/**
 * @internal — 檢視態(view × 外殼)的編輯入口,只給 DataTable 連結格(跟 naked variant 同一條 cell 通道)。2026-10-28 user「Q4用乙'」:表格網址格滑過才出現的鉛筆是 Button text xs(24、無框),
 * 由 LinkInput 依模式自己換(欄位編輯態 = 行內小按鈕,這裡 = Button xs),宿主只管出現時機與按下去做什麼。
 * 依據 `patterns/element-anatomy/inline-action.spec.md` 實例表「DataTable body cell internal — 檢視態滑過才出現的動作」。
 */
export interface LinkInputViewEditAction {
  /** 按下「編輯連結」:宿主決定怎麼進編輯(DataTable 連結格 = `onRequestEdit`)。鈕自己 stopPropagation,不讓宿主的點擊規則再處理一次 */
  onClick: () => void
  /** 只在這個群組滑過 / 鍵盤焦點時出現(宿主元素要帶 `group/<名>`;瞬間出現不淡入)。不給 = 一直顯示 */
  revealGroup?: ItemSuffixHoverGroup
}

// ── Component ───────────────────────────────────────────────────────────────

export interface LinkInputProps
  // `defaultValue` 一併 Omit(2026-07-05 deep-audit A.1b):spec.md「controlled-only,不支援
  // defaultValue」宣稱的型別面機械封鎖 — 原本仍在型別 surface 且經 {...props} spread 到已
  // controlled 的 input(React dev warning)。
  // 原生 `width` / `height` 一併 Omit(2026-11-15「尺寸:甲」;理由同 input.tsx InputProps 上方註解):寫了不報錯也不生效。
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'defaultValue' | 'onChange' | 'width' | 'height'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode' | 'variant' | 'width'> {
  mode?: FieldMode
  /**
   * 寬度軸(field-controls.spec.md「寬度軸」):`'fill'`(預設)撐滿容器 / 數字 = 固定寬(px;窄容器裡不超出容器)。
   * 套在有外框的那幾態(編輯 / 唯讀 / 停用,以及 `showDisplayEndIcon` 的檢視外殼);純文字的檢視態沒有外框,寬度跟著文字。
   */
  width?: Exclude<FieldWidth, 'hug'>
  /**
   * Visual chrome(2026-05-05 Phase B3)。對齊 FieldContext.variant 透傳。
   * - `'default'`(預設)— Field wrapper 完整 chrome(form / Field 內嵌)。
   * (2026-07-09 `bare` variant 退役;naked = cell-as-input substrate,@internal)
   *
   * mode='view' 時 chrome 無視覺意義(view 完全無 wrapper);chrome 僅作用於 edit / readonly / disabled。
   */
  variant?: FieldVariant
  error?: boolean
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 自訂顯示文字（非編輯時） */
  label?: string
  /**
   * 值的前綴圖示(2026-11-27 user 定案;link-input.spec.md「值的前綴圖示」):畫在顯示的字前面、**在連結裡**,
   * 跟字同為連結色(滑過一起變色)、一起算點擊與滑過範圍;排法同「一般值加圖示」(Select 欄位上的值圖示:圖示 + 間距 8 + 字),
   * 截斷時圖示不縮、字截斷;停用時跟字一起變停用色。值不是網址時跟一般文字同色照畫;空值與打字狀態不畫【後三者 AI 推導】。
   * 讀屏略過圖示,連結的名字仍是顯示的字。
   * **不是 `startIcon`**(field-controls.spec.md「startIcon」= 提示欄位用途的灰色圖示、不屬於值):這個圖示是值的一部分,由使用端依值傳入,
   * DS 不依網址自動判類型。與 `label` 一對(值的顯示字 / 值的圖示,同 `SelectOption` 的 `label` / `icon`)。表格網址欄用 `meta.linkIcon`。
   */
  icon?: LucideIcon
  /**
   * View 態是否包 Field naked wrapper(D-path opt-in,2026-05-08)
   * — DataTable cell view↔edit 像素級對齊用。預設 false(檢視態只畫值:裸 anchor;理由:檢視態只顯示值,跟表格 2026-07-08 A 案同一方向,
   *   見 field-controls.spec.md「LinkInput / PeoplePicker 預設 view 路徑不包 wrapper」)。
   * 設 true 時 view 走 fieldWrapperStyles(naked variant)包覆 anchor,
   * 與 cell edit (`<Input naked>`) 同 DOM 結構,消除 Layer-B padding mismatch。
   * **本元件沒有型別 icon**(edit 無 endIcon,UrlCell 用 plain Input edit;`icon` 是值的圖示、畫在連結裡,不是型別 icon)→ 這個開關只給 wrapper;
   * 可編輯時的編輯入口另由 `viewEditAction` 畫(那是 action,不是型別 icon)。
   */
  showDisplayEndIcon?: boolean
  /**
   * @internal — view 態的編輯入口(2026-10-28 user「Q4用乙'」):給了才在外殼裡畫右側槽 + Button text xs「編輯連結」(24、無框),
   * view 一律走外殼(同 `showDisplayEndIcon=true`)。目前只有 DataTable 可編輯的連結格傳。見 `LinkInputViewEditAction`。
   */
  viewEditAction?: LinkInputViewEditAction
  /**
   * @internal — 「框裡 Pencil 以外點了開連結」的範圍交給宿主(2026-11-06,user「照①乙②b」):預設延伸範圍 = LinkInput
   * 自己的框(外殼 / 檢視那一行);設 true 時改成最近的定位祖先,宿主自己負責 `position: relative`。
   * 目前只有 DataTable 網址格傳(能不能編輯都延伸到整格;格本來就是 `relative`)。
   */
  linkHitAreaFromHost?: boolean
  /**
   * 打字狀態可一鍵清空(2026-11-21,user 2026-11-19 拍板提案 A;link-input.spec.md「可清除(clearable)」)。與 Select / Combobox /
   * DatePicker / TimePicker 的 `clearable` 同名同語意、預設關:只在編輯模式的**打字狀態**、框裡有字時,右側出現清除 ×
   *(Field 共用的那一顆 `Field/field-clear-button.tsx`)。按 × = 清掉打的字(草稿)、焦點留在輸入框,**不**當場提交;
   * 跟原生輸入框清空一樣送出 `input` 事件(使用端接的 `onInput` 收得到,例:清掉自己給的錯);
   * 之後照既有規則結算(離開 / Enter:空白 = 清值、合法 = 提交、不合法 = 紅框),Esc 還原原值。連結狀態沒有 ×(照舊只有 Pencil)。
   * 何時開照 select.spec.md「何時開 clearable」:「沒有網址」是有效值(選填)才開。
   */
  clearable?: boolean
  /**
   * 網址不合法時框下那一行說明的字(2026-11-22,user 11-22 確認頁拍板丙;link-input.spec.md「驗證」「錯誤說明」)。
   * 不給(或空字串)= 預設「請輸入網址,例如 acme.com」。只能換字、不能關掉:紅框之外一定要有字(form-validation.spec.md「A11y 預設」)。
   * 包在 `<Field>` 裡時這行出在 Field 的錯誤區(FieldError 同位置同長相);使用端自己的 `<FieldError>` 有字時以使用端為準,不出兩行。
   */
  errorText?: string
  /**
   * LinkInput 自己的驗證結果有變時呼叫(link-input.spec.md「驗證」「錯誤說明」):`invalid` = 現在是不是「網址不合法」那一態(紅框 + 說明),
   * `draft` = 當下框裡的字。結算(離開 / Enter)出不合法 → true;開始打字、按 ×、Esc、結算成合法或空白 → false。
   * 不合法的字不會經 `onChange` 送出來(onChange 只送合法網址或空白)—— 要自己寫說明、或在表單層擋送出,用這一支。
   */
  onInvalidChange?: (invalid: boolean, draft: string) => void
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const LinkInput = React.forwardRef<HTMLInputElement, LinkInputProps>(
  (
    {
      mode: modeProp,
      variant: variantProp,
      error: errorProp = false,
      size: sizeProp,
      value,
      onChange,
      placeholder = 'https://',
      width,
      className,
      disabled: disabledProp,
      label,
      icon,
      showDisplayEndIcon = false,
      viewEditAction,
      linkHitAreaFromHost = false,
      clearable = false,
      errorText,
      onInvalidChange,
      readOnly,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      onBlur: onBlurProp,
      onKeyDown: onKeyDownProp,
      ...props
    },
    ref
  ) => {
    const fieldCtx = useFieldContext()
    const size = useResolvedFieldSize(sizeProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode 統一解析(prop > 有效 disabled > fieldCtx.mode > readOnly > 'edit')。
    // spec field-controls.spec.md L125「readOnly 原生屬性自動覆蓋 mode」契約落地。
    const resolvedMode: FieldMode = useResolvedFieldMode({ mode: modeProp, disabled, readOnly })
    const emptyDisplay = useFieldEmptyDisplay()
    const isEditable = resolvedMode === 'edit'
    // 值的前綴圖示:尺寸 = 這個欄位的圖示尺寸(ICON_SIZE:sm / md 16、lg 20,同 Select 欄位上的值圖示)
    const valueIcon: LinkValueIcon | undefined = icon ? { Icon: icon, size: ICON_SIZE[size] } : undefined
    // chrome resolution:per-prop > context > 'default'
    const resolvedVariant: FieldVariantInternal = useResolvedFieldVariant(variantProp)

    // 2026-07-05 D4:invalid 經 useResolvedFieldInvalid 統一接 fieldCtx.invalid(field-controls.spec.md
    // resolver 契約「error/invalid = prop OR fieldCtx.invalid」)— 原本紅框只吃 errorProp||localError、
    // aria-invalid 卻 inline 加 fieldCtx?.invalid → <Field invalid> 下 AT 聽到 invalid 視覺卻正常框
    // (聚焦還變藍)。紅框與 aria 自此同源。宣告於 view early return 之前(Rules-of-Hooks)。
    const fieldInvalid = useResolvedFieldInvalid(errorProp)

    // ── Local state / refs ──────────────────────────────────────────────────
    // 2026-07-04 Rules-of-Hooks 修:hooks 必在 view early return 之前宣告,
    // 否則 mode 於 render 間切換 view↔edit 會改變 hook 呼叫數 → React #310 crash
    // (同 beta.76 Combobox 同款修法;僅搬位置,hook 邏輯不變)。
    const [editing, setEditing] = React.useState(false)
    const [localValue, setLocalValue] = React.useState(value ?? '')
    const [localError, setLocalError] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const pencilRef = React.useRef<HTMLButtonElement | null>(null)
    // 鍵盤結算(Enter 提交 / Esc 取消)後焦點去哪(同 InlineEdit「退出 edit 態(focus 分流)」):結算讓輸入框卸載(切回連結狀態)時,
    // 焦點本來會掉到 body → 交給鉛筆(編輯入口);輸入框還在(網址無效 / 清空)就留在輸入框。只在焦點真的掉了才接手,焦點已被別處接走不搶。
    // 2026-10-01 前 Enter 走 blur、Esc 後焦點掉到 body(實測);同日第一版在 keydown 當下同步聚焦鉛筆、沒 preventDefault,
    // 同一下 Enter 的 keypress 落到鉛筆上又把編輯打開 —— 現改走 Field/field-edit-keys.ts(它會 preventDefault),焦點在 commit 之後才搬。
    const returnFocusRef = React.useRef(false)

    // Sync external value → local
    React.useEffect(() => {
      if (!editing) setLocalValue(value ?? '')
    }, [value, editing])

    // ── 錯誤說明(2026-11-22,user 11-22 確認頁拍板丙;link-input.spec.md「驗證」「錯誤說明」)──
    // 自己驗出不合法(紅框那一態)時框下一行字:預設 LINK_INPUT_DEFAULT_ERROR_TEXT,`errorText` 換字。
    // 包在 Field 裡 → 交給 Field 的錯誤區畫(Field/field-context.ts registerControlError:同 FieldError 的位置、長相、id;
    // 使用端自己的 <FieldError> 有字時 Field 只畫使用端那行)。單獨用 → 自己在框下畫一個 FieldError(間距同 Field 的 gap-1)。
    // 表格格(naked)不畫:格的錯誤由表格自己顯示(DataTable/data-table.spec.md cellErrors)。
    const errorLineText = isEditable && localError && resolvedVariant !== 'naked' ? (errorText || LINK_INPUT_DEFAULT_ERROR_TEXT) : null
    const registerControlError = fieldCtx?.registerControlError
    const standaloneErrorId = `${React.useId()}-error`
    // 這行字的 id:Field 裡 = Field 的 errorId(那一行由 Field 畫;使用端的字勝出時同一個 id 指的是使用端那行),單獨用 = 自己那行
    const errorLineId = errorLineText == null ? undefined : registerControlError ? fieldCtx?.errorId : standaloneErrorId
    // layout effect:跟紅框同一格畫面出現,不先閃一格沒字的紅框
    React.useLayoutEffect(() => {
      if (!registerControlError || errorLineText == null) return
      registerControlError(errorLineText)
      return () => registerControlError(null)
    }, [registerControlError, errorLineText])
    // 驗證結果回呼(`onInvalidChange`):只在「網址不合法」那一態有變時呼叫
    const ownInvalid = isEditable && localError
    const reportedInvalidRef = React.useRef(false)
    React.useEffect(() => {
      if (reportedInvalidRef.current === ownInvalid) return
      reportedInvalidRef.current = ownInvalid
      onInvalidChange?.(ownInvalid, localValue)
    })

    React.useEffect(() => {
      if (!returnFocusRef.current || editing) return
      returnFocusRef.current = false
      const active = document.activeElement
      if (active && active !== document.body && active.isConnected) return
      pencilRef.current?.focus()
    })

    // Merge refs
    const setRef = React.useCallback((el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    }, [ref])

    // 2026-05-16 audit codex Round 6:capture rAF + cancel on unmount(defensive hygiene)
    const focusRafIdRef = React.useRef<number>(0)
    React.useEffect(() => () => { if (focusRafIdRef.current) cancelAnimationFrame(focusRafIdRef.current) }, [])

    // ── mode='view' ─────────────────────────────────────────────────────
    // 純展示:無 input chrome / 無 hover affordance;編輯入口只有宿主給 `viewEditAction` 時才有(下方)。
    // 取代既有 LinkInputDisplay sub-component(2026-05-05 Phase B3 retire)。
    // Default(showDisplayEndIcon=false):無 wrapper 裸 anchor(理由:檢視態只顯示值,見 prop docblock);左側 0 與 contract (d)
    // (view×default 左側歸 0、值齊標籤)結果相同,只少 h-field 高度,見 link-input.spec.md
    // 「View 模式幾何(不包 wrapper)」。
    // Opt-in(showDisplayEndIcon=true,2026-05-08 D-path):Field naked wrapper 包覆 anchor,
    // 與 cell edit (`<Input naked>`) 同 DOM 結構消除像素偏移(沒有型別 icon)。
    // `viewEditAction`(2026-10-28 user「Q4用乙'」):外殼裡的右側槽畫「編輯連結」Button text xs(24、無框),
    // 吃外殼 `gap-2`(網址 → 鈕 8);24 高的鈕用 data-unbounded 負 margin 收進 `h-[1lh]` 槽,不撐高列(同 FileItem 列尾槽)。
    if (resolvedMode === 'view') {
      if (!showDisplayEndIcon && !viewEditAction) {
        // 2026-05-14 I2 fix(spec contract (e) view typography canonical):非 D-path bare
        // anchor / span 必套 `fieldDisplayTextClass(size)`(sm/md→text-body,lg→text-body-lg)
        // — 對齊跨 Field family view 視覺尺寸統一。原無 font-size class → 用 browser default
        // 字體 → 跟其他 Field view 不一致(user 抓 I2)。truncate 同需,長 URL ellipsis(I1)。
        if (!value) return <span className={cn(fieldDisplayTextClass(size), fieldEmptyColorClass(resolvedMode), 'block truncate')}>{emptyDisplay}</span>
        // 外層不裁:截斷由裡面的連結 / TruncatedText 自己做(見 LINK_HOST_CLASS)
        // 沒有編輯入口 → 整行開連結(見 renderLinkAnchor);`relative` = 延伸範圍到這一行為止(宿主接手時拿掉,延伸到宿主)
        return <span className={cn(fieldDisplayTextClass(size), 'block', LINK_HOST_CLASS, !linkHitAreaFromHost && 'relative')}>{renderLinkValue(value, label, true, valueIcon)}</span>
      }
      return (
        <div
          // 整個外殼開連結(Pencil 以外,能不能編輯都一樣;見 renderLinkAnchor);`relative` = 延伸範圍到外殼為止(宿主接手時拿掉,延伸到宿主)
          className={cn(fieldWrapperStyles({ mode: 'view', variant: resolvedVariant, size, width: fieldWidthVariant(width) }), !linkHitAreaFromHost && 'relative', className)}
          style={fieldWidthStyle(width)}
          data-field-mode="view"
        >
          <span className={cn('flex-1', LINK_HOST_CLASS)}>
            {value
              ? renderLinkValue(value, label, true, valueIcon)
              : <span className={cn('block truncate', fieldEmptyColorClass(resolvedMode))}>{emptyDisplay}</span>
            }
          </span>
          {viewEditAction && (
            <ItemSuffix
              {...{ [LINK_INPUT_EDIT_ENTRY_ATTR]: '' }}
              hoverReveal={viewEditAction.revealGroup != null}
              hoverGroup={viewEditAction.revealGroup}
              // `relative`:Pencil 畫在連結延伸區上面(照樹的順序),點得到 = 滑鼠唯一的編輯入口
              className="relative [&>[data-unbounded]]:my-[calc((1lh-var(--field-height-xs))/2)]"
            >
              <Button
                variant="text"
                size="xs"
                iconOnly
                startIcon={Pencil}
                aria-label="編輯連結" // i18n-allow: DS default inline-action label(同編輯態那顆鉛筆)
                onClick={(e) => { e.stopPropagation(); viewEditAction.onClick() }}
              />
            </ItemSuffix>
          )}
        </div>
      )
    }

    const hasValidValue = !!value && toWebUrl(value) != null
    const showLink = isEditable && hasValidValue && !editing && !localError
    const error = fieldInvalid || localError

    const handleEdit = () => {
      setEditing(true)
      if (focusRafIdRef.current) cancelAnimationFrame(focusRafIdRef.current)
      focusRafIdRef.current = requestAnimationFrame(() => {
        focusRafIdRef.current = 0
        inputRef.current?.focus()
      })
    }

    /** 結算草稿(blur / Enter 共用):空白 = 清值;合法 = 提交;不合法 = 紅框、留在輸入框。回傳是否離開了編輯態。 */
    const settleDraft = () => {
      const trimmed = localValue.trim()
      if (!trimmed) {
        // Empty is OK — clear value
        setLocalError(false)
        setEditing(false)
        onChange?.('')
        return true
      }
      // 看起來像網址的字提交時補上 https://(toWebUrl;與顯示同一支判斷,F2 乙)
      const webUrl = toWebUrl(trimmed)
      if (webUrl) {
        setLocalError(false)
        setEditing(false)
        onChange?.(webUrl)
        return true
      }
      setLocalError(true)
      return false
    }

    // 離開欄位就結算。焦點搬到**同一個欄位裡**的清除 ×(鍵盤 Tab、Chrome 滑鼠按下 ×)不算離開 —— 否則 × 還沒按到,這一下 blur 就先把草稿結算掉:
    // 合法的網址直接提交、切回連結狀態,× 跟著卸載,點擊落空(提案 A ②;同 React Aria useComboBox「Ignore blur if focused moved to the button」,
    // https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/combobox/useComboBox.ts#L269-L280 ;
    // 判準與 Select / DatePicker 的「觸發欄位 + 零件 = 同一個欄位」同一支 lib/composite-field-focus.ts)。沒開 clearable 時框裡沒有別的可聚焦零件,結果與修前相同。
    // consumer 的 onBlur 跟結算同一個時點(composite-field-focus.ts「真的離開這個欄位才轉呼叫,一次離開只一次」,Select / DatePicker 同一條):
    // 輸入框 ↔ × 之間移動不轉;從 × 離開時轉一個 currentTarget / target 換成輸入框的事件殼(consumer 的 onBlur 是掛在輸入框上的;殼的做法同該檔 withFieldTarget)。
    const leaveField = (e: React.FocusEvent<HTMLElement>) => {
      settleDraft()
      const input = inputRef.current
      if (!onBlurProp) return
      if (!input || e.currentTarget === input) { onBlurProp(e as React.FocusEvent<HTMLInputElement>); return }
      onBlurProp(Object.assign(Object.create(Object.getPrototypeOf(e) as object) as React.FocusEvent<HTMLInputElement>, e, { currentTarget: input, target: input }))
    }
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (!isWithinCompositeField(e.relatedTarget, { trigger: e.currentTarget.parentElement })) leaveField(e)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value)
      // Clear error on edit (blur validation)
      if (localError) setLocalError(false)
    }

    // Esc 層(ds-canonical/references/keyboard-model-canonical.md「焦點所在的控件自己那一層也算一層」):正在編輯、或有打了還沒存的字,
    // 這一下 Esc 歸本元件(放在 Dialog / Sheet 裡第一下只取消編輯、不關浮層);乾淨的輸入框沒有這一層。
    const ownsEscape = editing || localError || localValue !== (value ?? '')
    // Enter / Esc 走全 DS 就地編輯鍵盤結算 SSOT(Field/field-edit-keys.ts:IME guard + preventDefault + Esc 分層);2026-10-01 前這裡自己寫
    const settleKeys = editSettleKeyProps({
      onCommit: () => { returnFocusRef.current = true; settleDraft() },
      onCancel: () => {
        returnFocusRef.current = true
        setLocalValue(value ?? '')
        setLocalError(false)
        setEditing(false)
      },
      escapeLayer: ownsEscape,
    })
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // 自己的草稿 / 編輯態是同一個 `<input>` 上更內層的那一層:Esc 先歸它,consumer 自己接的 onKeyDown 下一下才輪到
      //(LinkInput 不是 useFormValidation getInputProps 的支援對象:連結狀態不渲 input,表單的 props 到不了 —— 待辦總帳 N85)
      if (e.key === 'Escape' && ownsEscape) { settleKeys.onKeyDown(e); return }
      // 其餘鍵 consumer 先跑、擋了預設就不走元件的(同 Rating / Select / NumberInput 的寫法;2026-10-01 前 `{...props}` 在後,consumer 的 onKeyDown 整支蓋掉元件的)
      onKeyDownProp?.(e)
      if (e.defaultPrevented) return
      settleKeys.onKeyDown(e)
    }

    // readonly — 顯示藍色連結（可點擊);值不是合法 http(s) 網址時畫成一般文字(renderLinkValue)
    // disabled — 顯示純文字 fg-disabled（不可點擊）
    if (!isEditable) {
      const displayText = value ? linkDisplayText(value, label) : null
      return (
        <div
          // readonly:整個外殼開連結(見 renderLinkAnchor;`relative` = 延伸範圍到外殼為止)
          className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: resolvedVariant, size, width: fieldWidthVariant(width) }), resolvedMode === 'readonly' && !linkHitAreaFromHost && 'relative', className)}
          style={fieldWidthStyle(width)}
          data-field-mode={resolvedMode}
          // 2026-09-29 a11y(待辦總帳 OE21):disabled 的純展示殼明告 inactive(對齊 FieldLabel 2026-06-10 同修),
          // 否則 axe 把灰化連結文字當一般文字誤報 color-contrast(modes / 色彩對照 / 尺寸對照三則 story)
          aria-disabled={resolvedMode === 'disabled' || undefined}
        >
          <span className={cn('flex-1', LINK_HOST_CLASS)}>
            {resolvedMode === 'disabled'
              ? (displayText
                  // 停用:圖示跟字一起是停用色(M24;同 Select 值圖示停用時 fg-disabled 勝出)
                  ? (valueIcon
                      ? renderIconRow(valueIcon, <span className="block truncate min-w-0">{displayText}</span>, 'text-fg-disabled')
                      : <span className="block truncate text-fg-disabled">{displayText}</span>)
                  : <span className={cn('block truncate', fieldEmptyColorClass(resolvedMode))}>{emptyDisplay}</span>)
              : (value
                  ? renderLinkValue(value, label, true, valueIcon)
                  : <span className={cn('block truncate', fieldEmptyColorClass(resolvedMode))}>{emptyDisplay}</span>)
            }
          </span>
        </div>
      )
    }

    // edit — link 顯示分支（有合法 URL 且未在編輯中）
    if (showLink) {
      return (
        <div
          // 2026-07-05 D4:link 顯示分支同樣接 error(errorProp / fieldCtx.invalid)紅框,
          // 否則 <Field invalid> 下 link state 完全無 error 呈現
          // 框裡 Pencil 以外都開連結(2026-11-06 user「照①乙②b」,link-input.spec.md「Link 狀態」):連結延伸鋪滿外框(含看得見的 1px 邊框,
          // 見 renderLinkAnchor `coverBorder`),游標 = 連結的手形;Pencil(ItemInlineAction 自己 `relative`)畫在上面 = 滑鼠唯一的編輯入口。
          // 2026-09-26 – 11-06 這裡是「外框空白處 = 按 Pencil」(文字游標 + onClick 進編輯)。外框滑過變深是 Field 家族共用外觀,照留(變色的地方點得開)。
          className={cn(fieldWrapperStyles({ mode: 'edit', variant: resolvedVariant, size, error, width: fieldWidthVariant(width) }), 'relative', className)}
          style={fieldWidthStyle(width)}
          data-field-mode="edit"
          data-error={error ? '' : undefined}
        >
          {/* 連結盒子 = 文字本身、太長時縮到欄寬截斷 —— 由連結自己保證(renderLinkAnchor 的 inline-block + max-w-full),所有模式同一句;
              點擊範圍另由延伸區鋪滿外框。flex 外層保留:讓截斷吃得到外框扣掉鉛筆後的寬度。 */}
          <span className="flex-1 min-w-0 flex">
            {value && renderLinkAnchor(value, label, true, true, valueIcon)}
          </span>
          <ItemInlineAction
            ref={pencilRef}
            size={size ?? 'md'}
            action={{ icon: Pencil, label: '編輯連結', onClick: handleEdit }} // i18n-allow: DS default inline-action label
          />
        </div>
      )
    }

    // 清除 ×(`clearable`,link-input.spec.md「可清除(clearable)」):打字狀態、框裡有字才出現。按下 = 清草稿、留在輸入框,不提交;
    // 錯誤一併清掉(開始編輯就清錯誤,form-validation.spec.md 規則 5,同 handleChange)。
    // 焦點:鍵盤 / Chrome 滑鼠按下時焦點在 × 上 → FieldClearButton 先交回輸入框(field-wrapper.tsx keepFieldFocusBeforeUnmount,× 隨清空卸載);
    // 焦點本來不在欄位裡(Safari 點按鈕不給焦點)也一律放回輸入框 —— 草稿已經跟值不同,得有一次離開才會結算,不能留一個沒人結算的空框。
    // **按 × 跟原生輸入框清空一樣送出 `input` 事件**(2026-11-22 LINK-ERRTEXT 第 3 次修正):按 × 是「開始編輯」,使用端自己給的錯
    // (`<Field invalid>` + `<FieldError>`、表單層的錯)也要當下清掉(規則 5)—— 跟打字同一條路:使用端接的 `onInput` 收得到,
    // 不另開 prop。2026-11-22 前只清元件自己的草稿與紅框,使用端什麼都收不到,它給的錯一直留到結算(當時展示頁「可清除」第二則實測;那個範例 2026-11-23 起是「儲存時查出的錯」)。
    const showClear = clearable && localValue !== ''
    const clearDraft = () => {
      const input = inputRef.current
      if (input) {
        input.focus({ preventScroll: true })
        // 寫值走 HTMLInputElement 原型上的 setter:React 受控輸入框記著上次的值,直接 `input.value = ''` 會被當成「沒變」而不送 React 的
        // onChange(本元件的 handleChange 就收不到;同 Testing Library fireEvent 的做法)。事件冒泡,使用端的 onInput、
        // React 的 onChange(= 本元件 handleChange:清草稿、清紅框)都經它
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      // 事件沒走到 React(被外層攔下)時草稿與紅框照樣清 —— 與事件那條路同一個結果
      setLocalValue('')
      if (localError) setLocalError(false)
    }

    // edit — text input mode（正在編輯、無值、或格式錯誤）
    const inputFrame = (
      <div
        className={cn(
          fieldWrapperStyles({ mode: 'edit', variant: resolvedVariant, size, error, width: fieldWidthVariant(width) }),
          // 打字狀態的整個外框都是輸入處:文字游標 + 點內距 / 邊框就聚焦 input(同 Input / NumberInput;待辦總帳 N53③,
          // input.spec.md 已寫三者同一條;共用實作 field-wrapper.tsx focusFieldInputFromChrome)
          FIELD_TEXT_ENTRY_CURSOR,
          className,
        )}
        style={fieldWidthStyle(width)}
        onMouseDown={focusFieldInputFromChrome}
        // 焦點從清除 × 離開整個欄位(Tab 走、點別處)= 離開欄位,照既有規則結算、轉呼叫 consumer 的 onBlur(輸入框自己的 blur 由 handleBlur 處理;× 只有開了 clearable 才有)
        onBlur={showClear ? (e) => {
          if (e.target === inputRef.current || isWithinCompositeField(e.relatedTarget, { trigger: e.currentTarget })) return
          leaveField(e)
        } : undefined}
        data-field-mode="edit"
        data-error={error ? '' : undefined}
      >
        <input
          ref={setRef}
          type="url"
          id={idProp ?? fieldCtx?.id}
          placeholder={placeholder}
          aria-invalid={error || undefined}
          aria-required={fieldCtx?.required || undefined}
          // 錯誤說明那一行也掛進 aria-describedby(WCAG 3.3.1;link-input.spec.md「錯誤說明」):讀屏聚焦就念得到,不只靠 aria-errormessage
          aria-describedby={[ariaDescribedByProp ?? fieldCtx?.descriptionId, errorLineId].filter(Boolean).join(' ') || undefined}
          aria-errormessage={ariaErrorMessageProp ?? (error ? (fieldCtx?.errorId ?? errorLineId) : undefined)}
          className={bareInputStyles}
          {...props}
          // 元件自己的 handler 列在 {...props} 之後(consumer 的在 handler 內先跑);settleKeys 帶的 Esc 層宣告(data-escape-layer)一起掛,
          // 它的 onKeyDown 由下一行的 handleKeyDown 包住(先分 Esc 歸誰、再 consumer、再結算)
          {...settleKeys}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {showClear && (
          <span
            className="contents"
            // 輸入框握著焦點時按 ×:焦點不動(擋 mousedown 預設,click 照常)—— 不 blur 就不會搶先結算;Safari 按按鈕本來就不給焦點,
            // 不擋的話焦點落到 body、照樣 blur 結算(lib/pointer-press.ts keepFocusOnPointerPress,Select / Combobox 欄位內搜尋框同一支)
            onMouseDown={(e) => { keepFocusOnPointerPress(e, e.currentTarget, inputRef.current) }}
            // 焦點在 × 上按 Esc 與在輸入框裡按同一層(正在編輯、或有打了還沒存的字):還原原值。焦點先回輸入框(× 可能隨還原卸載),
            // 浮層裡第一下只還原、第二下才關浮層(同輸入框的 data-escape-layer;lib/overlay-escape.ts)。
            // 這一下已被更內層用掉(鍵盤聚焦 × 時開著的 tooltip 先收,Radix 擋了預設)→ 不動,焦點也不搬(Esc 一次只收一層)
            {...escapeLayerProps(ownsEscape)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || !ownsEscape || isEscapeTakenElsewhere(e)) return
              inputRef.current?.focus({ preventScroll: true })
              settleKeys.onKeyDown(e)
            }}
          >
            <FieldClearButton
              size={size ?? 'md'}
              label="清除網址" // i18n-allow: DS default inline-action label(「清除 + 清掉的是什麼」,同清除日期 / 清除時間)
              focusOwner={() => inputRef.current}
              onClear={clearDraft}
            />
          </span>
        )}
      </div>
    )
    // 包在 Field 裡(說明由 Field 的錯誤區畫)、或表格格(naked,不畫說明):只有框,DOM 跟修前一樣
    if (registerControlError || resolvedVariant === 'naked') return inputFrame
    // 單獨用:框 + 錯誤說明包在同一層 `flex-col gap-1`(= Field 欄內的排法,框下 4px),寬度跟框同一套(fill = 撐滿 / 數字 = 固定寬)。
    // 這一層一律存在(不是有錯才包):說明出現 / 消失時框與輸入框不重掛,Enter 結算出不合法時焦點照舊留在輸入框;
    // 不用 Fragment 讓說明當框的兄弟 —— 放在有 gap 的 flex 容器裡,容器的 gap 會疊進框與說明之間(實測展示頁 16 / 12px 疊成 20 / 16px)。
    // 說明本身 = Field 家族同一個 FieldError(字級 / 顏色 / role="alert")。
    return (
      <div className={cn('flex flex-col gap-1 min-w-0', typeof width === 'number' ? 'max-w-full' : 'w-full')} style={fieldWidthStyle(width)}>
        {inputFrame}
        {errorLineText != null && <FieldError id={standaloneErrorId}>{errorLineText}</FieldError>}
      </div>
    )
  }
)
LinkInput.displayName = 'LinkInput'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const linkInputMeta = {
  component: 'LinkInput',
  family: 4,
  variants: {

  },
  sizes: {

  },
  // states 對齊真實 state 集:text-input 家族無 'active'(按下)專屬視覺態(同 textareaMeta 修法);
  //   readonly / error 為 fieldWrapperStyles mode + errorProp/localError 實有狀態(2026-07-04 audit 對齊)。
  states: ['default', 'hover', 'focus-visible', 'readonly', 'disabled', 'error'],
  tokens: {
    // bg 經 fieldWrapperStyles 實渲:edit bg-surface / readonly bg-readonly / disabled bg-disabled(field-wrapper.tsx)。
    bg: ['bg-surface', 'bg-readonly', 'bg-disabled'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-primary'],
    ring: [],
  },
} as const

export { LinkInput }
