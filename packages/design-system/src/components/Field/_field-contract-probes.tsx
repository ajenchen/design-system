// Field「展示」頁的 test-only 契約 probe 元件(2026-10-13 自 field.stories.tsx 搬出,待辦 K9:該檔 851 行超過 800 行過渡上限)。
// 不是 story 檔:story 匯出(`InlineSearchYieldWidthContract`,test-only)留在 field.stories.tsx,story id 與文件頁不變。
// 為什麼不另開一個同 title 的 `*.stories.tsx`:Storybook 把同 title 的檔併成一頁,文件頁(autodocs)會挑其中一個檔當入口 ——
// 挑到只放 probe 的那一個時,整頁「Field/展示」文件只剩 probe、側欄也把它當 test-only 藏掉(2026-10-13 獨立驗證抓到)。
// 慣例同 `AppShell/_demo-helpers.tsx`(`_` 前綴 = demo / private helper,naming-structure-invariant R2)。
import * as React from 'react'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import type { PersonValue } from '@/design-system/components/PeoplePicker/person-display'

// ── 欄位內搜尋讓位 × 欄寬(test-only 契約 probe,2026-10-07 待辦總帳 K4 驗證回報;2026-10-13 加 K6 / K7) ──────────────────────
// 欄位上用文字畫的值(只選「不限」、PeoplePicker 多人只選 1 位的名字)打開時讓位給欄位內搜尋框;讓位**不改欄寬**——
// 它原本的寬留在搜尋框那一格,依內容寬(owner = field-controls.spec.md「寬度軸(width: fill / hug)」)的欄位打開前後、
// 打的字沒超過值之前欄寬都不變;關著時與不可搜尋的「不限」、同寬的單人欄位長得一樣(窄欄位長標籤的截斷點、名字放得下就完整)。
// 規則住 select-menu-unrestricted.spec.md「欄位顯示」與 people-picker.spec.md §C;閘 `scripts/searchable-field-keys-invariant.mjs` 逐格量。
// K7(2026-10-13):單選的 Select / PeoplePicker 依內容寬,打開前後欄寬不變(修前打開時撐成搜尋框的固有寬,151 → 204px)—— 同一支閘量。
// K6(2026-10-13):依內容寬的多選文字標籤不再縮成只剩「+N」(修前標籤可見數用自己的 hug 寬量,互為因果)——
// 三顆放得下就三顆都在;容器真的放不下才收進 +N,容器再變寬就放回來。閘 `scripts/tag-overflow-room-invariant.mjs`
//(逐格畫面、兩種時序;「窄容器」那一欄另把父層拉成 192 → 400 → 120 → 400px 逐格看)。
// 放在 Field 而不是 Combobox / PeoplePicker:量的是寬度軸,而且可搜尋選單焦點閘(searchable-menu-focus,掃那幾個元件目錄)
// 會在這些依內容寬 / 窄欄位上挑選多項。關著的長相與既有範例相同、互動後的欄寬沒有新畫面,所以 test-only(story-rules「Technical probe visibility」)。
const yieldCategoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
]
const yieldReviewers: PersonValue[] = [{ name: 'Alice Chen' }, { name: 'Bob Lin' }, { name: 'Charlie Wu' }]
const shipCountries = [
  { value: 'jp', label: '日本' },
  { value: 'us', label: '美國' },
  { value: 'tw', label: '台灣' },
]
export function InlineSearchYieldWidthProbe() {
  const [hug, setHug] = React.useState<string[]>(['__unrestricted__'])
  const [hugPlain, setHugPlain] = React.useState<string[]>(['__unrestricted__'])
  const [long, setLong] = React.useState<string[]>(['__unrestricted__'])
  const [longPlain, setLongPlain] = React.useState<string[]>(['__unrestricted__'])
  const [reviewerHug, setReviewerHug] = React.useState<PersonValue[]>([yieldReviewers[0]])
  const [reviewerNarrow, setReviewerNarrow] = React.useState<PersonValue[]>([yieldReviewers[0]])
  const [owner, setOwner] = React.useState<PersonValue | null>(yieldReviewers[0])
  const [ownerHug, setOwnerHug] = React.useState<PersonValue | null>(yieldReviewers[0])
  const [country, setCountry] = React.useState<string | null>('jp')
  const [tagsHug, setTagsHug] = React.useState<string[]>(['electronics', 'furniture', 'food'])
  const [tagsHugNarrow, setTagsHugNarrow] = React.useState<string[]>(['electronics', 'furniture', 'food'])
  const longLabel = '不限(全部商品類別都可以)'
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-sm">
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">只選「不限」· 依內容寬(欄位內搜尋 / 不可搜尋對照)</h3>
        <Combobox width="hug" unrestricted searchable searchIn="trigger" options={yieldCategoryOptions} value={hug} onChange={setHug}
          aria-label="商品類別(依內容寬,欄位內搜尋)" />
        <Combobox width="hug" unrestricted options={yieldCategoryOptions} value={hugPlain} onChange={setHugPlain} aria-label="商品類別(依內容寬,對照)" />
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">只選「不限」· 窄欄位長標籤(欄位內搜尋 / 不可搜尋對照)</h3>
        <div className="w-40 flex flex-col gap-[var(--layout-space-tight)]">
          <Combobox unrestricted unrestrictedLabel={longLabel} searchable searchIn="trigger" options={yieldCategoryOptions} value={long} onChange={setLong}
            aria-label="商品類別(窄欄位長標籤,欄位內搜尋)" />
          <Combobox unrestricted unrestrictedLabel={longLabel} options={yieldCategoryOptions} value={longPlain} onChange={setLongPlain}
            aria-label="商品類別(窄欄位長標籤,對照)" />
        </div>
      </div>
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">PeoplePicker 多人只選 1 位 · 依內容寬 / 窄欄位(單人對照)</h3>
        <PeoplePicker width="hug" searchIn="trigger" value={reviewerHug} people={yieldReviewers} onChange={setReviewerHug} aria-label="審核人(依內容寬,欄位內搜尋)" />
        <div className="w-48">
          <PeoplePicker searchIn="trigger" value={reviewerNarrow} people={yieldReviewers} onChange={setReviewerNarrow} aria-label="審核人(窄欄位,欄位內搜尋)" />
        </div>
        <div className="w-48">
          <PeoplePicker value={owner} people={yieldReviewers} onChange={(v) => setOwner(v[0] ?? null)} aria-label="負責人(窄欄位,單人對照)" />
        </div>
      </div>
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">單選 · 依內容寬(打開前後欄寬不變)</h3>
        <PeoplePicker width="hug" value={ownerHug} people={yieldReviewers} onChange={(v) => setOwnerHug(v[0] ?? null)} aria-label="負責人(依內容寬,單人)" />
        <Select width="hug" searchable options={shipCountries} value={country} onChange={(v) => setCountry(v || null)} aria-label="出貨國家(依內容寬,可搜尋)" />
      </div>
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">多選文字標籤 · 依內容寬(放得下 / 容器放不下)</h3>
        <Combobox width="hug" options={yieldCategoryOptions} value={tagsHug} onChange={setTagsHug} aria-label="商品類別(依內容寬,多選三顆)" />
        <div className="w-48">
          <Combobox width="hug" options={yieldCategoryOptions} value={tagsHugNarrow} onChange={setTagsHugNarrow} aria-label="商品類別(依內容寬,窄容器)" />
        </div>
      </div>
    </div>
  )
}
