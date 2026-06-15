// @anatomy-rationale:
//   ColorMatrix represented as PrefixAlignment — SelectionItem 是 layout
//     primitive,本身無色彩變體;label / description 色彩繼承 foreground /
//     fg-secondary,disabled 統一 fg-disabled。實際視覺決策面向是 prefix 對齊
//     規則(24px 閾值,inline vs block),由 PrefixAlignment(3.)涵蓋。
//   StateBehavior N/A — disabled 是唯一視覺狀態(已於 Inspector 切換),hover /
//     focus 由 control(Checkbox / Radio)承擔,不在 SelectionItem layout 範疇。
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Mail, Folder, Shield } from 'lucide-react'
import { SelectionItem } from './selection-item'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Internal/SelectionControl/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

type SizeKey = 'sm' | 'md' | 'lg'

const SIZES: SizeKey[] = ['sm', 'md', 'lg']

const SIZE_SPECS: Record<
  SizeKey,
  {
    fieldHeight: string
    fieldHeightPx: number
    text: string
    textPx: number
    iconPx: number
    avatarInlinePx: number
    avatarBlockPx: number
  }
> = {
  sm: {
    fieldHeight: '--field-height-sm',
    fieldHeightPx: 28,
    text: 'text-body',
    textPx: 14,
    iconPx: 16,
    avatarInlinePx: 20,
    avatarBlockPx: 32,
  },
  md: {
    fieldHeight: '--field-height-md',
    fieldHeightPx: 32,
    text: 'text-body',
    textPx: 14,
    iconPx: 16,
    avatarInlinePx: 24,
    avatarBlockPx: 32,
  },
  lg: {
    fieldHeight: '--field-height-lg',
    fieldHeightPx: 36,
    text: 'text-body-lg',
    textPx: 16,
    iconPx: 20,
    avatarInlinePx: 24,
    avatarBlockPx: 40,
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. Overview
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>
          SelectionItem 是 Checkbox / RadioGroup 共用的 layout primitive。3-slot 結構:
          <code className="font-mono text-footnote mx-1">[control] [optional prefix (icon | avatar)] [content]</code>
          。Padding 公式
          <code className="font-mono text-footnote mx-1">py = (field-height - 1lh) / 2</code>
          讓單行高度自動對齊同 size 的 Input,density 切換時跟著算。
        </Desc>
        <div className="border border-divider rounded-md p-4 bg-muted max-w-xl">
          <SelectionItem
            control={<Checkbox defaultChecked />}
            icon={Mail}
            label="讀取 email 信箱"
            description="僅用於通知,永遠不會外流"
          />
        </div>
      </div>

      <div>
        <H3>Slot 對照</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Slot</Th>
                <Th>內容</Th>
                <Th>對齊規則</Th>
                <Th>共用容器</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>control</Td>
                <Td>Checkbox 或 RadioGroupItem(consumer 傳入)</Td>
                <Td>跟 prefix 同高度(inline 或 block)</Td>
                <Td mono>h-[1lh] · block: text-block height (1lh + gap + desc)</Td>
              </tr>
              <tr>
                <Td mono>prefix(icon)</Td>
                <Td>LucideIcon,永遠 inline</Td>
                <Td>inline(≤24px)</Td>
                <Td mono>h-[1lh]</Td>
              </tr>
              <tr>
                <Td mono>prefix(avatar)</Td>
                <Td>AvatarData,尺寸由 description 決定</Td>
                <Td>無 desc 或 ≤24px → inline · 有 desc → block</Td>
                <Td mono>h-[1lh] 或 blockAlignClass</Td>
              </tr>
              <tr>
                <Td mono>content · label</Td>
                <Td>主要文字(可 clamp)</Td>
                <Td mono>text-body / text-body-lg</Td>
                <Td mono>min-w-0 flex-1</Td>
              </tr>
              <tr>
                <Td mono>content · description</Td>
                <Td>輔助文字(reading mode,最小 14px)</Td>
                <Td mono>text-fg-secondary · line-height 1.5</Td>
                <Td mono>mt-[var(--item-gap-label-desc-reading)]（lg → -reading-lg）</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Prop</Th>
                <Th>Type</Th>
                <Th>Default</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>control</Td>
                <Td mono>ReactNode</Td>
                <Td>—(必填)</Td>
                <Td>Checkbox / Radio element</Td>
              </tr>
              <tr>
                <Td mono>label</Td>
                <Td mono>ReactNode</Td>
                <Td>—(必填)</Td>
                <Td>主要文字</Td>
              </tr>
              <tr>
                <Td mono>description</Td>
                <Td mono>ReactNode</Td>
                <Td mono>undefined</Td>
                <Td>輔助文字,有值時 avatar 進 block 模式</Td>
              </tr>
              <tr>
                <Td mono>icon</Td>
                <Td mono>LucideIcon</Td>
                <Td mono>undefined</Td>
                <Td>prefix icon(跟 avatar 互斥,永遠 inline)</Td>
              </tr>
              <tr>
                <Td mono>avatar</Td>
                <Td mono>AvatarData</Td>
                <Td mono>undefined</Td>
                <Td>prefix avatar(跟 icon 互斥,24px 閾值規則)</Td>
              </tr>
              <tr>
                <Td mono>size</Td>
                <Td mono>'sm' | 'md' | 'lg'</Td>
                <Td mono>'md'</Td>
                <Td>影響 text tier / padding / icon / avatar 尺寸</Td>
              </tr>
              <tr>
                <Td mono>disabled</Td>
                <Td mono>boolean</Td>
                <Td mono>false</Td>
                <Td>label / description / icon → text-fg-disabled(M24);label 另加 cursor-not-allowed</Td>
              </tr>
              <tr>
                <Td mono>htmlFor</Td>
                <Td mono>string</Td>
                <Td mono>undefined</Td>
                <Td>label for,指向 control 的 id</Td>
              </tr>
              <tr>
                <Td mono>labelMaxLines</Td>
                <Td mono>number | 'none'</Td>
                <Td mono>'none'</Td>
                <Td>line-clamp 行數,預設不截(form 欄位允許任意長度)</Td>
              </tr>
              <tr>
                <Td mono>descMaxLines</Td>
                <Td mono>number | 'none'</Td>
                <Td mono>'none'</Td>
                <Td>description line-clamp 行數</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Inspector
   ═══════════════════════════════════════════════════════════════════════════ */

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => <SelectionInspector />,
}

function SelectionInspector() {
  const [size, setSize] = useState<SizeKey>('md')
  const [prefix, setPrefix] = useState<'none' | 'icon' | 'avatar'>('icon')
  const [hasDesc, setHasDesc] = useState(true)
  const [disabled, setDisabled] = useState(false)

  const spec = SIZE_SPECS[size]
  const useBlock = prefix === 'avatar' && hasDesc

  return (
    <div className="grid grid-cols-[1fr_320px] gap-8 max-w-5xl">
      <div className="flex flex-col gap-6">
        <div>
          <H3>即時預覽</H3>
          <div className="border border-divider rounded-md p-4 bg-muted">
            <SelectionItem
              size={size}
              control={<Checkbox size={size} defaultChecked disabled={disabled} />}
              icon={prefix === 'icon' ? Shield : undefined}
              avatar={prefix === 'avatar' ? { alt: 'Ada Chen', color: 'indigo' } : undefined}
              label="Admin 層級操作"
              description={hasDesc ? '僅限 workspace owner 啟用此權限範圍' : undefined}
              disabled={disabled}
            />
          </div>
        </div>

        <div>
          <H3>尺寸藍圖</H3>
          <div className="border border-divider rounded-md p-4 bg-muted">
            <pre className="text-footnote font-mono text-fg-secondary leading-relaxed whitespace-pre">
{`size=${size}   prefix=${prefix}   block=${useBlock}

  ┌─ py = (${spec.fieldHeight} - 1lh) / 2 ─────────────────────────────┐
  │  flex items-start gap-2  ${spec.text} (${spec.textPx}px)           │
  │                                                                    │
  │  [control]   ${prefix !== 'none' ? `[${prefix}]` : '        '}   [content]                           │
  │   h-[1lh]     h-[1lh]${useBlock ? ' (block)' : '        '}    label (text-body${size === 'lg' ? '-lg' : ''})         │
  │                                  ${hasDesc ? 'description (text-fg-secondary 14px)' : ''}        │
  └────────────────────────────────────────────────────────────────────┘

單行總高 = ${spec.fieldHeight} = ${spec.fieldHeightPx}px
${prefix === 'avatar' ? `avatar size = ${useBlock ? spec.avatarBlockPx : spec.avatarInlinePx}px (${useBlock ? 'block' : 'inline'})` : prefix === 'icon' ? `icon size = ${spec.iconPx}px` : ''}`}
            </pre>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <H3>Size</H3>
          <div className="flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`px-2.5 py-1 text-caption rounded-md font-mono cursor-pointer ${
                  s === size
                    ? 'bg-primary text-white'
                    : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <H3>Prefix</H3>
          <div className="flex gap-2">
            {(['none', 'icon', 'avatar'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrefix(p)}
                className={`px-2.5 py-1 text-caption rounded-md font-mono cursor-pointer ${
                  p === prefix
                    ? 'bg-primary text-white'
                    : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <H3>Props</H3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-caption">
              <input type="checkbox" checked={hasDesc} onChange={(e) => setHasDesc(e.target.checked)} />
              <span className="font-mono">description</span>
            </label>
            <label className="flex items-center gap-2 text-caption">
              <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
              <span className="font-mono">disabled</span>
            </label>
          </div>
        </div>

        <div>
          <H3>Inspect</H3>
          <table className="text-caption border-collapse w-full">
            <tbody>
              <tr>
                <Td mono>field-height</Td>
                <Td mono>{spec.fieldHeight} · {spec.fieldHeightPx}px</Td>
              </tr>
              <tr>
                <Td mono>font-size</Td>
                <Td mono>{spec.text} · {spec.textPx}px</Td>
              </tr>
              <tr>
                <Td mono>gap</Td>
                <Td mono>gap-2 · 8px</Td>
              </tr>
              <tr>
                <Td mono>align</Td>
                <Td mono>items-start</Td>
              </tr>
              {prefix === 'icon' && (
                <tr>
                  <Td mono>icon size</Td>
                  <Td mono>{spec.iconPx}px</Td>
                </tr>
              )}
              {prefix === 'avatar' && (
                <tr>
                  <Td mono>avatar size</Td>
                  <Td mono>
                    {useBlock ? spec.avatarBlockPx : spec.avatarInlinePx}px · {useBlock ? 'block' : 'inline'}
                  </Td>
                </tr>
              )}
              <tr>
                <Td mono>py</Td>
                <Td mono>(field-height - 1lh) / 2</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. PrefixAlignment — 元件特有(取代 ColorMatrix,見 spec「為何無 ColorMatrix」)
   ═══════════════════════════════════════════════════════════════════════════ */

export const PrefixAlignment: Story = {
  name: 'Prefix 對齊規則（24px 閾值）',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>規則摘要</H3>
        <Desc>
          SelectionItem 跟 MenuItem 共用 item-anatomy 的 24px 閾值規則:prefix 高度 ≤ 24px → inline(跟 control
          一起對齊 label 第一行);{'>'} 24px → block(control 跟 avatar 一起走 block 高度,都在 text block
          center)。Block 模式的 control 不固定在 label 第一行是 SelectionItem 特有規則——因為「selection +
          identity」是一組視覺單元,不能歪斜。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>條件</Th>
                <Th>prefix 尺寸</Th>
                <Th>對齊模式</Th>
                <Th>control 對齊</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>icon(永遠)</Td>
                <Td mono>16 / 16 / 20px</Td>
                <Td mono>inline</Td>
                <Td mono>label 第一行</Td>
              </tr>
              <tr>
                <Td>avatar + 無 desc</Td>
                <Td mono>20 / 24 / 24px</Td>
                <Td mono>inline</Td>
                <Td mono>label 第一行</Td>
              </tr>
              <tr>
                <Td>avatar + 有 desc</Td>
                <Td mono>32 / 32 / 40px</Td>
                <Td mono>block</Td>
                <Td mono>text block center(跟 avatar 同高)</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Inline vs Block 實際對照</H3>
        <Desc>左:inline(control 在 label 第一行)· 右:block(control 跟 32px avatar 一起走 block center)。</Desc>
        <div className="grid grid-cols-2 gap-6 max-w-4xl">
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted font-mono">
              inline — avatar 20 / 24 / 24px · control 在第一行
            </span>
            <div className="border border-divider rounded-md p-4 bg-muted">
              <SelectionItem
                control={<Checkbox defaultChecked />}
                avatar={{ alt: 'Ada Chen', color: 'indigo' }}
                label="Ada Chen"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted font-mono">
              block — avatar 32 / 32 / 40px · control + avatar 在 text block center
            </span>
            <div className="border border-divider rounded-md p-4 bg-muted">
              <SelectionItem
                control={<Checkbox defaultChecked />}
                avatar={{ alt: 'Ada Chen', color: 'indigo' }}
                label="Ada Chen"
                description="Design Engineer · Frontend team"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <H3>Icon prefix 永遠 inline</H3>
        <Desc>
          icon 不走 24px 閾值——永遠 inline。因為 LucideIcon 最大 20px(lg),本來就在閾值內。
        </Desc>
        <div className="grid grid-cols-2 gap-6 max-w-4xl">
          <div className="border border-divider rounded-md p-4 bg-muted">
            <SelectionItem control={<Checkbox defaultChecked />} icon={Folder} label="存取 Drive 檔案" />
          </div>
          <div className="border border-divider rounded-md p-4 bg-muted">
            <SelectionItem
              control={<Checkbox defaultChecked />}
              icon={Folder}
              label="存取 Drive 檔案"
              description="讀取並修改你授權的資料夾"
            />
          </div>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. SizeMatrix
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Size token 對照</H3>
        <Desc>
          單行總高 = 同 size 的 field-height。Padding 公式
          <code className="font-mono text-footnote mx-1">py = (field-height - 1lh) / 2</code>
          讓 SelectionItem 永遠對齊 Input。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Size</Th>
                <Th>Field height</Th>
                <Th>Text tier</Th>
                <Th>Icon</Th>
                <Th>Avatar inline</Th>
                <Th>Avatar block</Th>
              </tr>
            </thead>
            <tbody>
              {SIZES.map((s) => {
                const spec = SIZE_SPECS[s]
                return (
                  <tr key={s}>
                    <Td mono>{s}</Td>
                    <Td mono>{spec.fieldHeight} · {spec.fieldHeightPx}px</Td>
                    <Td mono>{spec.text} · {spec.textPx}px</Td>
                    <Td mono>{spec.iconPx}px</Td>
                    <Td mono>{spec.avatarInlinePx}px</Td>
                    <Td mono>{spec.avatarBlockPx}px</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>三 size 視覺對照</H3>
        <div className="flex flex-col gap-6 max-w-lg">
          {SIZES.map((s) => (
            <div key={s} className="flex flex-col gap-2">
              <span className="text-footnote text-fg-muted font-mono">{s}</span>
              <div className="border border-divider rounded-md bg-muted flex flex-col">
                <SelectionItem
                  size={s}
                  control={<Checkbox size={s} defaultChecked />}
                  icon={Mail}
                  label="產品更新電子報"
                />
                <SelectionItem
                  size={s}
                  control={<Checkbox size={s} />}
                  icon={Shield}
                  label="安全性警告"
                  description="登入裝置變動、密碼變更等重要事件"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"SelectionItem 是純佈局元件,本身不接管鍵盤與焦點——它只渲染外層容器加上指向控件的 label(label 的 htmlFor 連到控件 id,點文字會觸發控件)。\n\n鍵盤操作、焦點環、勾選狀態都由傳入的控件(Checkbox / Radio)負責:\n\n- Tab — 焦點落在控件本身\n- Space — 由控件切換勾選狀態\n- 焦點環(outline 2px,顏色取自 var(--ring))由控件自己畫\n\n搭配建議:\n\n- 控件對齊 [W3C ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) 對應的 checkbox / radio pattern。\n- 用 label 的 htmlFor 連到控件 id,讓點擊文字也能操作。\n- 驗證:Storybook 無障礙面板應 0 項嚴重違規;不靠滑鼠也能完整操作。文字對比 ≥ 4.5:1,介面元素對比 ≥ 3:1(WCAG AA)。"}</p>
    </div>
  ),
}
