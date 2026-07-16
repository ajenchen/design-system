// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { ChevronDown } from 'lucide-react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './accordion'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Accordion/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

/* ═══════════════════════════════════════════════════════════════════════════
   1. Overview — Anatomy + Variant 一覽 + Props 速查
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>
          Accordion 由 Root(Accordion)+ AccordionItem(單一區塊)+ AccordionTrigger(可點擊 header,含 chevron)+ AccordionContent(展開內容)組成。基於 Radix Accordion primitive,視覺套用本 DS token。
        </Desc>
        <div className="border border-border rounded-lg p-4 max-w-[640px]">
          <Accordion type="single" collapsible defaultValue="anatomy">
            <AccordionItem value="anatomy">
              <AccordionTrigger>AccordionTrigger(可點擊 header + chevron)</AccordionTrigger>
              <AccordionContent>
                AccordionContent 區域——展開時顯示,收合時隱藏(animate-accordion-down / up)。
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>下一個 AccordionItem</AccordionTrigger>
              <AccordionContent>每個 Item(含最後一個)底部都有 border-b border-divider——divider 在 item 底緣,非僅 item 之間(shadcn 同款)。</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          結構:<span className="font-mono">[trigger: label + chevron(16px, rotate 180deg when open)] / [content: pb-4 + text-fg-secondary]</span>
        </p>
      </div>

      <div>
        <H3>Variant 一覽</H3>
        <Desc>Accordion 的 variant 是 type 行為(非視覺 variant)——`single` / `multiple` 決定「同時可展開幾個 item」。視覺無差異,差在互動邏輯。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>type</Th>
                <Th>行為</Th>
                <Th>搭配 prop</Th>
                <Th>場景</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>single(預設推薦)</Td>
                <Td>一次只能展開一個 item,展開新的自動收合前一個</Td>
                <Td mono>collapsible?: boolean</Td>
                <Td>FAQ / 使用教學(讀者一段一段看)</Td>
              </tr>
              <tr>
                <Td mono>multiple</Td>
                <Td>多個 item 可同時展開</Td>
                <Td mono>defaultValue?: string[]</Td>
                <Td>設定頁(同時比對多段)</Td>
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
              {[
                ['Accordion', '', '', ''],
                ['  type', "'single' | 'multiple'", '必填', '一次可展開一個 / 多個'],
                ['  collapsible', 'boolean', 'false', '(搭配 single)已展開的可再點收合'],
                ['  defaultValue', 'string | string[]', '—', '預設展開的 item value'],
                ['  value / onValueChange', 'string | string[]', '—', '受控模式(跟 default 擇一)'],
                ['AccordionItem', '', '', ''],
                ['  value', 'string', '必填', '唯一識別碼'],
                ['  disabled', 'boolean', 'false', '停用此 item(不可展開)'],
                ['AccordionTrigger', '', '', ''],
                ['  children', 'ReactNode', '必填', 'header 文字(chevron 自動加在右側)'],
                ['AccordionContent', '', '', ''],
                ['  children', 'ReactNode', '必填', '展開內容'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}>
                  <Td mono>{p}</Td>
                  <Td mono>{t}</Td>
                  <Td mono>{d}</Td>
                  <Td>{desc}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Inspector — 即時預覽 + 藍圖 + Inspect 面板
   ═══════════════════════════════════════════════════════════════════════════ */

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => {
    return <InspectorView />
  },
}

const InspectorView = () => {
  const [open, setOpen] = useState<string>('item-1')
  const state = open === 'item-1' ? 'expanded' : 'collapsed'

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[1fr_320px] gap-6">
        {/* 左:即時預覽 + 藍圖 */}
        <div className="flex flex-col gap-6">
          <div>
            <H3>即時預覽</H3>
            <div className="border border-border rounded-lg p-4">
              <Accordion
                type="single"
                collapsible
                value={open}
                onValueChange={(v) => setOpen(v)}
              >
                <AccordionItem value="item-1">
                  <AccordionTrigger>如何更改訂閱方案?</AccordionTrigger>
                  <AccordionContent>
                    於「設定 → 帳單」頁面切換方案。升級立即生效,降級於下週期生效。
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>支援 SSO 嗎?</AccordionTrigger>
                  <AccordionContent>企業方案支援 SAML 2.0。</AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <p className="text-footnote text-fg-muted mt-2">
              當前狀態:<span className="font-mono">{state}</span>(item-1 = {open === 'item-1' ? 'open' : 'closed'})
            </p>
          </div>

          <div>
            <H3>藍圖(Blueprint)</H3>
            <Desc>Trigger 為 `py-4`(vertical padding),水平寬度由父容器決定。Chevron 16px + transition 200ms。Content 有 `pb-4` 與 `data-[state=closed]:animate-accordion-up` / `data-[state=open]:animate-accordion-down`。</Desc>
            <div className="border border-border rounded-lg p-4 max-w-[520px] bg-muted/40">
              <div className="border border-dashed border-primary-hover py-1 px-2 rounded mb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body font-medium text-foreground">Trigger label</span>
                  <ChevronDown size={16} className="text-fg-muted shrink-0" aria-hidden />
                </div>
                <p className="text-footnote text-fg-muted mt-1 font-mono">
                  py-4 · text-body · font-medium · flex items-center justify-between · gap-2
                </p>
              </div>
              <div className="border border-dashed border-fg-muted py-2 px-2 rounded">
                <p className="text-body text-fg-secondary">Content 區</p>
                <p className="text-footnote text-fg-muted mt-1 font-mono">
                  pb-4 · text-body · text-fg-secondary · overflow-hidden
                </p>
              </div>
              <p className="text-footnote text-fg-muted mt-3 font-mono">
                AccordionItem: border-b border-divider
              </p>
            </div>
          </div>
        </div>

        {/* 右:Inspect 面板 */}
        <div>
          <H3>Inspect 面板</H3>
          <div className="border border-border rounded-lg p-4 flex flex-col gap-4 text-caption">
            <section>
              <p className="font-mono text-fg-muted mb-2">LAYOUT</p>
              <ul className="flex flex-col gap-1">
                <li><span className="font-mono">trigger padding-y</span> · <span className="font-mono">py-4</span> (16px)</li>
                <li><span className="font-mono">content padding-bottom</span> · <span className="font-mono">pb-4</span> (16px)</li>
                <li><span className="font-mono">trigger gap</span> · <span className="font-mono">gap-2</span> (8px)</li>
                <li><span className="font-mono">chevron size</span> · <span className="font-mono">16px</span></li>
                <li><span className="font-mono">item border</span> · <span className="font-mono">border-b</span></li>
              </ul>
            </section>
            <section>
              <p className="font-mono text-fg-muted mb-2">COLOR</p>
              <ul className="flex flex-col gap-1">
                <li><TokenCell token="--foreground" display="trigger · text-foreground" /></li>
                <li><TokenCell token="--fg-secondary" display="hover · text-fg-secondary" /></li>
                <li><TokenCell token="--fg-muted" display="chevron · text-fg-muted" /></li>
                <li><TokenCell token="--fg-secondary" display="content · text-fg-secondary" /></li>
                <li><TokenCell token="--divider" display="item border · border-divider" /></li>
                <li><TokenCell token="--ring" display="focus ring · ring" /></li>
              </ul>
            </section>
            <section>
              <p className="font-mono text-fg-muted mb-2">TYPOGRAPHY</p>
              <ul className="flex flex-col gap-1">
                <li><span className="font-mono">trigger</span> · <span className="font-mono">text-body</span> + <span className="font-mono">font-medium</span></li>
                <li><span className="font-mono">content</span> · <span className="font-mono">text-body</span> (regular)</li>
              </ul>
            </section>
            <section>
              <p className="font-mono text-fg-muted mb-2">MOTION</p>
              <ul className="flex flex-col gap-1">
                <li><span className="font-mono">chevron rotate</span> · <span className="font-mono">200ms</span></li>
                <li><span className="font-mono">content open</span> · <span className="font-mono">animate-accordion-down</span></li>
                <li><span className="font-mono">content close</span> · <span className="font-mono">animate-accordion-up</span></li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. Color Matrix — state × token
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Trigger 五態色彩</H3>
        <Desc>
          Trigger 預設為 foreground(正常閱讀色),hover 走 fg-secondary(文字色 tint 弱化;不用 underline,對齊 Notion / Linear / Stripe 現代 SaaS 慣例)。focus-visible 疊加 ring,disabled 時 trigger 文字切換為語義 disabled 色(對齊 Button variant=text,非降透明度),且 pointer-events-none。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>狀態</Th>
                <Th>Text</Th>
                <Th>Chevron</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>collapsed(default)</Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--fg-muted" display="fg-muted" /></Td>
                <Td>閱讀態,chevron 朝下</Td>
              </tr>
              <tr>
                <Td mono>hover</Td>
                <Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td>
                <Td><TokenCell token="--fg-muted" display="fg-muted" /></Td>
                <Td>文字色 tint 弱化,無 underline</Td>
              </tr>
              <tr>
                <Td mono>expanded</Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--fg-muted" display="fg-muted(rotate 180°)" /></Td>
                <Td>chevron 旋轉 180° 朝上</Td>
              </tr>
              <tr>
                <Td mono>focus-visible</Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--fg-muted" display="fg-muted" /></Td>
                <Td>
                  外加 <span className="font-mono">ring-2 ring-ring ring-offset-2</span>
                </Td>
              </tr>
              <tr>
                <Td mono>disabled</Td>
                <Td>
                  <TokenCell token="--fg-disabled" display="text-fg-disabled" />
                </Td>
                <Td>
                  <TokenCell token="--fg-disabled" display="text-fg-disabled" />
                </Td>
                <Td>pointer-events-none + 語義 disabled fg 色(對齊 Button variant=text,非 opacity)</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>結構 token</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>區塊</Th>
                <Th>Token</Th>
                <Th>Class</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>AccordionItem 底線</Td>
                <Td><TokenCell token="--divider" display="divider" /></Td>
                <Td mono>border-b border-divider</Td>
              </tr>
              <tr>
                <Td>Content 文字</Td>
                <Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td>
                <Td mono>text-body text-fg-secondary</Td>
              </tr>
              <tr>
                <Td>Focus ring</Td>
                <Td><TokenCell token="--ring" display="ring" /></Td>
                <Td mono>ring-2 ring-ring ring-offset-2</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. Size — 本元件無 size 切換
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>Accordion 無 size 切換</H3>
        <Desc>
          Accordion 是 content-level 收合容器,**typography 固定為 text-body**(trigger font-medium / content regular),不提供 size variant。理由:accordion 的視覺重量由內容本身承擔,不靠 size 分層——真的需要更大或更小的 header 字級,應該改用 Tabs / DescriptionList / 自組 section heading。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>屬性</Th>
                <Th>固定值</Th>
                <Th>Token</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Trigger 字級</Td>
                <Td>14px / medium</Td>
                <Td mono>text-body + font-medium</Td>
              </tr>
              <tr>
                <Td>Content 字級</Td>
                <Td>14px / regular</Td>
                <Td mono>text-body</Td>
              </tr>
              <tr>
                <Td>垂直 padding</Td>
                <Td>16px · 16px</Td>
                <Td mono>py-4 / pb-4</Td>
              </tr>
              <tr>
                <Td>Chevron 尺寸</Td>
                <Td>16px</Td>
                <Td mono>size={16}</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Dark mode 由 semantic token 自動切換(見 `tokens/color/color.spec.md`);density 不影響 accordion(固定 padding)。
        </p>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. State 行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>collapsed ↔ expanded</H3>
        <Desc>點擊 trigger 切換狀態。Chevron 旋轉 180°(transition 200ms),content 套用 `animate-accordion-down` / `animate-accordion-up`(高度動畫由 Radix 提供的 CSS var 驅動)。</Desc>
        <div className="grid grid-cols-2 gap-4 max-w-[800px]">
          <div>
            <p className="text-footnote text-fg-muted mb-2 font-mono">data-state="closed"</p>
            <div className="border border-border rounded-lg p-4">
              <Accordion type="single" collapsible>
                <AccordionItem value="q1">
                  <AccordionTrigger>如何更改訂閱方案?</AccordionTrigger>
                  <AccordionContent>內容預設隱藏。</AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
          <div>
            <p className="text-footnote text-fg-muted mb-2 font-mono">data-state="open"</p>
            <div className="border border-border rounded-lg p-4">
              <Accordion type="single" collapsible defaultValue="q1">
                <AccordionItem value="q1">
                  <AccordionTrigger>如何更改訂閱方案?</AccordionTrigger>
                  <AccordionContent>
                    於「設定 → 帳單」頁面切換方案。升級立即生效,降級於下週期生效。
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </div>
      </div>

      <div>
        <H3>disabled item</H3>
        <Desc>AccordionItem 設 disabled 後,對應 trigger 切語義 disabled 文字色(`text-fg-disabled`,非 opacity)且 pointer-events-none;Radix 將 disabled 設在原生 `&lt;button&gt;` 上,故鍵盤 Tab 會跳過該 trigger(原生 disabled 不可聚焦),ArrowUp/Down 也會略過它。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-[640px]">
          <Accordion type="single" collapsible>
            <AccordionItem value="a">
              <AccordionTrigger>可用區塊</AccordionTrigger>
              <AccordionContent>正常展開。</AccordionContent>
            </AccordionItem>
            <AccordionItem value="b" disabled>
              <AccordionTrigger>已停用區塊(尚未開放)</AccordionTrigger>
              <AccordionContent>點不開。</AccordionContent>
            </AccordionItem>
            <AccordionItem value="c">
              <AccordionTrigger>另一個可用區塊</AccordionTrigger>
              <AccordionContent>正常展開。</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      <div>
        <H3>Keyboard navigation(Radix 預設 a11y)</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>按鍵</Th>
                <Th>行為</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td mono>Tab</Td><Td>聚焦下一個 trigger</Td></tr>
              <tr><Td mono>Shift + Tab</Td><Td>聚焦上一個 trigger</Td></tr>
              <tr><Td mono>Enter / Space</Td><Td>切換當前 trigger 的展開狀態</Td></tr>
              <tr><Td mono>ArrowDown</Td><Td>移至下一個 trigger(不切換狀態)</Td></tr>
              <tr><Td mono>ArrowUp</Td><Td>移至上一個 trigger</Td></tr>
              <tr><Td mono>Home / End</Td><Td>移至第一 / 最後一個 trigger</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          ARIA 由 Radix 自動處理:trigger 帶 `aria-expanded` / `aria-controls`,content 是 `role="region"` + `aria-labelledby`。
        </p>
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
      <p className="whitespace-pre-line">{"詳 `accordion.spec.md` 「A11y 預設」段。摘要:\n\nRadix Accordion 自動處理:\n-   鍵盤  ：Tab 到 trigger → Enter/Space 切換;ArrowUp/Down 在 trigger 間移動\n-   ARIA  ：trigger  aria-expanded  /  aria-controls  自動設置,content  role=\"region\"  +  aria-labelledby \n-   焦點  ：收合時焦點停在 trigger,不會跳到隱藏 content 內\n\nConsumer 無需額外處理,保留 Radix  data-state  屬性即可。"}</p>
    </div>
  ),
}
