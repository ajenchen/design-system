import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  CarouselDots,
} from './carousel'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Carousel/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Sample slides ────────────────────────────────────────────────────────────
// 2026-05-16 audit Round 6:三層(展示 / 設計規格 / 設計原則)一致用真實 picsum seeded photo
// 取代 gradient 色塊 — gradient 抽象 block 教不到真實裁切 / 內容裁切 / 視覺層次,
// 且要與主展示頁(carousel.stories.tsx)同源,讓設計師看到的 slide 內容跨三層一致。
// Picsum.photos 提供 stable seeded photos(免登入 / 免 API key / 跨環境一致)。
// 註:ColorMatrix「視覺樣本」cell 刻意保留純色 swatch(bg-foreground)——那是 token 色票
// 非 slide 內容,用純色才能精準標 dot 的 bg-on-emphasis/60 · /80 · 全(--on-emphasis = white)token。

const slides = [
  { label: '京都',       image: 'https://picsum.photos/seed/kyoto/720/360' },
  { label: '雷克雅維克', image: 'https://picsum.photos/seed/reykjavik/720/360' },
  { label: '里斯本',     image: 'https://picsum.photos/seed/lisbon/720/360' },
  { label: '峇里島',     image: 'https://picsum.photos/seed/bali/720/360' },
]

const SampleSlide = ({ label, image, height = 240 }: { label: string; image: string; height?: number }) => (
  <div
    className="rounded-lg overflow-hidden flex items-end p-6 text-white bg-cover bg-center"
    style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.6) 100%), url(${image})`, height }}
  >
    <div className="relative z-10">
      <div className="text-caption opacity-90">推薦目的地</div>
      <div className="text-h3 font-bold">{label}</div>
    </div>
  </div>
)

/* ═══════════════════════════════════════════════════════════════════════════
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>
          Carousel 由五個子元件組成:Content(overflow-hidden 容器)+ Item(單張 slide)+ Previous/Next(hover-only 箭頭)+ Dots(底部中央指示器)。基於 embla-carousel-react v8 + shadcn API 結構。
        </Desc>
        <div className="max-w-[640px]">
          <Carousel opts={{ loop: true }}>
            <CarouselContent>
              {slides.map((s) => (
                <CarouselItem key={s.label}>
                  <SampleSlide label={s.label} image={s.image} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
            <CarouselDots />
          </Carousel>
        </div>
        <p className="text-footnote text-fg-muted mt-3">↑ hover 圖片區域即顯示左右箭頭</p>
      </div>

      <div>
        <H3>結構說明</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>區塊</Th><Th>角色</Th><Th>關鍵 CSS</Th></tr></thead>
            <tbody>
              <tr><Td mono>Carousel</Td><Td>根容器(role=region),onKeyDownCapture 鍵盤導覽,提供 context</Td><Td mono>relative · group/carousel</Td></tr>
              <tr><Td mono>CarouselContent</Td><Td>掛 Embla ref 的 overflow-hidden 視窗,內層 flex 排列 slides</Td><Td mono>overflow-hidden + flex(-ml-4)</Td></tr>
              <tr><Td mono>CarouselItem</Td><Td>單張 slide(role=group, aria-roledescription=slide)</Td><Td mono>shrink-0 grow-0 basis-full · pl-4</Td></tr>
              <tr><Td mono>CarouselPrevious</Td><Td>左箭頭,hover-only 顯示</Td><Td mono>absolute left-3 top-1/2 · opacity-0 → hover 100%</Td></tr>
              <tr><Td mono>CarouselNext</Td><Td>右箭頭,hover-only 顯示</Td><Td mono>absolute right-3 top-1/2 · opacity-0 → hover 100%</Td></tr>
              <tr><Td mono>CarouselDots</Td><Td>底部中央指示器(scrollSnaps &gt; 1 才渲染)</Td><Td mono>absolute bottom-3 left-1/2</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['orientation', "'horizontal'|'vertical'", "'horizontal'", '99% 用 horizontal;vertical 供 story feed 等少見場景'],
                ['opts', 'EmblaOptionsType', '—', 'Embla options(`loop`、`align`、`dragFree` 等)'],
                ['plugins', 'EmblaPluginType[]', '—', 'Embla plugins(consumer 可自行引入 Autoplay,但必須提供暫停機制)'],
                ['setApi', '(api: CarouselApi) => void', '—', '向外部暴露 api 實例(自訂控制 / 外部指示器)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p as string}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. 元件檢閱器 — hover 顯示行為藍圖
   ═══════════════════════════════════════════════════════════════════════════ */

const InspectorInner = () => {
  const [simulateHover, setSimulateHover] = useState(false)

  return (
    <div className="flex gap-6 items-start">
      {/* Left: preview + blueprint */}
      <div className="flex flex-col gap-5 min-w-[420px]">
        <div className="flex items-center gap-3">
          <span className="text-caption text-fg-muted">Arrow visibility:</span>
          <button
            type="button"
            onClick={() => setSimulateHover(false)}
            className={`px-2.5 py-1 text-[12px] font-mono rounded-md ${!simulateHover ? 'bg-primary text-white font-semibold' : 'bg-neutral-hover text-fg-secondary'}`}
          >
            default(隱藏)
          </button>
          <button
            type="button"
            onClick={() => setSimulateHover(true)}
            className={`px-2.5 py-1 text-[12px] font-mono rounded-md ${simulateHover ? 'bg-primary text-white font-semibold' : 'bg-neutral-hover text-fg-secondary'}`}
          >
            hover / focus(顯示)
          </button>
        </div>

        {/* Preview with forced hover */}
        <div className="px-6 py-6 rounded-lg bg-canvas border border-divider">
          <div className={simulateHover ? 'group/carousel-force' : ''}>
            <style>{`
              .group\\/carousel-force [class*="opacity-0"] { opacity: 1 !important; }
            `}</style>
            <Carousel opts={{ loop: true }}>
              <CarouselContent>
                {slides.slice(0, 3).map((s) => (
                  <CarouselItem key={s.label}>
                    <SampleSlide label={s.label} image={s.image} height={200} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
              <CarouselDots />
            </Carousel>
          </div>
        </div>

        {/* Blueprint */}
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-fg-muted">
            關鍵區域(藍圖)
          </div>
          <div className="relative h-[200px] rounded-md border-2 border-dashed border-primary/30 bg-neutral-hover/40">
            {/* Arrow positions */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-md border-2 border-dashed border-info flex items-center justify-center text-[9px] text-info font-mono">
              Prev
            </div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-md border-2 border-dashed border-info flex items-center justify-center text-[9px] text-info font-mono">
              Next
            </div>
            {/* Dots */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 border-2 border-dashed border-success rounded-md">
              <span className="w-6 h-1.5 rounded-full bg-foreground/60" />
              <span className="w-1.5 h-1.5 rounded-full bg-foreground/30" />
              <span className="w-1.5 h-1.5 rounded-full bg-foreground/30" />
              <span className="text-[9px] text-success font-mono ml-1">Dots</span>
            </div>
          </div>
          <p className="text-[10px] text-fg-muted font-mono">
            Arrow:size="md"(h-field-md,default 32px / loose 36px,iconOnly 方形)· left/right-3 · top-1/2 · opacity 0 → hover/focus-within 100%<br />
            Dots:bottom-3 · gap-1.5 · inactive 6px × 6px / active 24px × 6px
          </p>
        </div>
      </div>

      {/* Right: inspect panel */}
      <div className="w-[320px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
          <span className="text-[12px] font-semibold text-foreground">Inspect</span>
        </div>

        {/* Arrow */}
        <div className="px-4 py-3 border-b border-divider">
          <div className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-2">Arrow(Previous / Next)</div>
          <div className="flex flex-col gap-1.5 text-[12px] font-mono">
            <div className="flex justify-between"><span className="text-fg-muted">Component</span><span>&lt;Button variant="tertiary" size="md" iconOnly /&gt;</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Size</span><span>h-field-md(field-height-md,iconOnly 方形)</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Shape</span><span>rounded-full(documented 例外)</span></div>
            <div className="flex justify-between items-center"><span className="text-fg-muted">Fill</span><TokenCell token="--surface" /></div>
            <div className="flex justify-between items-center"><span className="text-fg-muted">Stroke</span><TokenCell token="--border" /></div>
            <div className="flex justify-between items-center"><span className="text-fg-muted">Hover</span><span>text/border → --primary-hover(Button tertiary)</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Icon</span><span>16px(Button 程式化)</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Opacity</span><span>0 → 100(group-hover / focus-within)</span></div>
          </div>
        </div>

        {/* Dots */}
        <div className="px-4 py-3 border-b border-divider">
          <div className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-2">Dots</div>
          <div className="flex flex-col gap-1.5 text-[12px] font-mono">
            <div className="flex justify-between"><span className="text-fg-muted">Position</span><span>absolute bottom-3</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Gap</span><span>gap-1.5(6px)</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Inactive</span><span>w-1.5 h-1.5 / bg-on-emphasis/60</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Hover</span><span>bg-on-emphasis/80</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Active</span><span>w-6 h-1.5 / bg-on-emphasis</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Render</span><span>scrollSnaps &gt; 1</span></div>
          </div>
        </div>

        {/* A11y */}
        <div className="px-4 py-3">
          <div className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-2">A11y</div>
          <div className="flex flex-col gap-1.5 text-[12px] font-mono">
            <div className="flex justify-between"><span className="text-fg-muted">Root</span><span>role="region"</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Item</span><span>role="group"</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Dots</span><span>role="group" + button</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Keyboard</span><span>ArrowLeft / ArrowRight</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => (
    <div className="flex flex-col gap-4">
      <div>
        <H3>元件檢閱器</H3>
        <Desc>切換 default / hover 狀態,查看 arrow 出現的視覺差異與 token。</Desc>
      </div>
      <InspectorInner />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Arrow(浮層按鈕)</H3>
        <Desc>Arrow 為 `&lt;Button variant="tertiary"&gt;`——`bg-surface` + `border-border`,無 elevation shadow,rounded-full 圓形,疊在照片或內容上仍清晰可見。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>State</Th><Th>Fill</Th><Th>Stroke</Th><Th>Shadow</Th><Th>Opacity</Th></tr></thead>
            <tbody>
              <tr>
                <Td mono>default</Td>
                <Td mono><TokenCell token="--surface" /></Td>
                <Td mono><TokenCell token="--border" /></Td>
                <Td mono>—</Td>
                <Td mono>0(隱藏)</Td>
              </tr>
              <tr>
                <Td mono>group-hover</Td>
                <Td mono><TokenCell token="--surface" /></Td>
                <Td mono><TokenCell token="--border" /></Td>
                <Td mono>—</Td>
                <Td mono>1(顯示)</Td>
              </tr>
              <tr>
                <Td mono>hover(button 自身)</Td>
                <Td mono><TokenCell token="--surface" /></Td>
                <Td mono>text/border → --primary-hover</Td>
                <Td mono>—</Td>
                <Td mono>1</Td>
              </tr>
              <tr>
                <Td mono>focus-visible</Td>
                <Td mono><TokenCell token="--surface" /></Td>
                <Td mono>ring-2 ring-ring ring-offset-1</Td>
                <Td mono>—</Td>
                <Td mono>1(強制顯示 / a11y)</Td>
              </tr>
              <tr>
                <Td mono>disabled(邊界)</Td>
                <Td mono>—</Td>
                <Td mono>—</Td>
                <Td mono>—</Td>
                <Td mono>0 + pointer-events-none</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Dots(photo overlay convention)</H3>
        <Desc>
          Dots 採「白點於照片上」慣例(Instagram / Airbnb / Ant Carousel)——active 不靠變色而是**加寬至 24px**,對色弱使用者更友善。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>State</Th><Th>Width × Height</Th><Th>Fill</Th><Th>視覺樣本</Th></tr></thead>
            <tbody>
              <tr>
                <Td mono>inactive</Td>
                <Td mono>6 × 6 px</Td>
                <Td mono>bg-on-emphasis/60</Td>
                <Td>
                  <div className="bg-foreground p-4 rounded-md inline-block">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-on-emphasis/60" />
                  </div>
                </Td>
              </tr>
              <tr>
                <Td mono>hover</Td>
                <Td mono>6 × 6 px</Td>
                <Td mono>bg-on-emphasis/80</Td>
                <Td>
                  <div className="bg-foreground p-4 rounded-md inline-block">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-on-emphasis/80" />
                  </div>
                </Td>
              </tr>
              <tr>
                <Td mono>active</Td>
                <Td mono>24 × 6 px</Td>
                <Td mono>bg-on-emphasis</Td>
                <Td>
                  <div className="bg-foreground p-4 rounded-md inline-block">
                    <span className="inline-block w-6 h-1.5 rounded-full bg-on-emphasis" />
                  </div>
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. 尺寸對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>固定尺寸</H3>
        <Desc>
          Carousel 沒有 size prop——arrow / dots 視覺尺寸固定,適合疊於任何尺寸 slide 上。Slide 本身尺寸由 consumer 決定(aspect-ratio / fixed height)。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>元素</Th><Th>Size</Th><Th>理由</Th></tr></thead>
            <tbody>
              <tr>
                <Td mono>Arrow button</Td>
                <Td mono>size="md"(h-field-md,default 32px / loose 36px)</Td>
                <Td>iconOnly 方形,繼承 Button md 尺寸;rounded-full 圓形於照片 overlay 上的世界級慣例(Airbnb / Instagram / Netflix)</Td>
              </tr>
              <tr>
                <Td mono>Arrow icon</Td>
                <Td mono>size={'{16}'}</Td>
                <Td>與 Button size sm/md 的 icon size 一致</Td>
              </tr>
              <tr>
                <Td mono>Arrow offset</Td>
                <Td mono>left-3 / right-3(12px)</Td>
                <Td>離 slide 邊緣 12px,不貼邊也不過度侵入內容</Td>
              </tr>
              <tr>
                <Td mono>Dot inactive</Td>
                <Td mono>6 × 6 px</Td>
                <Td>小到不搶主視覺,大到仍可點擊(符合 minimum touch target 配合 hit-area)</Td>
              </tr>
              <tr>
                <Td mono>Dot active</Td>
                <Td mono>24 × 6 px</Td>
                <Td>寬度變化 4× 提供明確焦點;對色弱友善</Td>
              </tr>
              <tr>
                <Td mono>Dot gap</Td>
                <Td mono>gap-1.5(6px)</Td>
                <Td>dot 間距與 dot 尺寸同值,視覺節奏平均</Td>
              </tr>
              <tr>
                <Td mono>Dots offset</Td>
                <Td mono>bottom-3(12px)</Td>
                <Td>與 arrow offset 對稱</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. 狀態行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Arrow hover-only 顯示</H3>
        <Desc>
          預設 opacity-0,父容器 `group-hover/carousel` 時顯示。focus-within 時強制顯示(鍵盤 focus 進 arrow,不需 hover)。邊界時(canScrollPrev / Next = false)直接消失,不顯示 disabled 視覺。
        </Desc>
        <div className="max-w-[560px]">
          <Carousel>
            <CarouselContent>
              {slides.slice(0, 3).map((s) => (
                <CarouselItem key={s.label}>
                  <SampleSlide label={s.label} image={s.image} height={200} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
            <CarouselDots />
          </Carousel>
          <p className="text-footnote text-fg-muted mt-2">
            ↑ 非 loop 模式 · 第一張時左箭頭消失 / 最後一張時右箭頭消失(opacity-0 + pointer-events-none)
          </p>
        </div>
      </div>

      <div>
        <H3>Dots click 跳 snap</H3>
        <Desc>點 dot 直接跳該張;active dot 加寬 24px 與 inactive 形成明確對比。</Desc>
        <div className="max-w-[560px]">
          <Carousel>
            <CarouselContent>
              {slides.map((s) => (
                <CarouselItem key={s.label}>
                  <SampleSlide label={s.label} image={s.image} height={200} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
            <CarouselDots />
          </Carousel>
          <p className="text-footnote text-fg-muted mt-2">↑ 點底部 dot 直接跳至該張</p>
        </div>
      </div>

      <div>
        <H3>鍵盤操作</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>按鍵</Th><Th>行為</Th></tr></thead>
            <tbody>
              <tr><Td mono>ArrowLeft / ArrowUp</Td><Td>上一張(horizontal 用 ←,vertical 用 ↑;onKeyDownCapture 於根容器)</Td></tr>
              <tr><Td mono>ArrowRight / ArrowDown</Td><Td>下一張(horizontal 用 →,vertical 用 ↓)</Td></tr>
              <tr><Td mono>Tab</Td><Td>循序 Tab(sequential Tab)進入 Previous → Next → 每個 Dot;邊界時 disabled 的箭頭自動跳出 Tab 順序</Td></tr>
              <tr><Td mono>Enter / Space</Td><Td>觸發當前 focus 的 arrow / dot</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>單一項目不渲染 dots</H3>
        <Desc>`scrollSnaps.length &lt;= 1` 時 `CarouselDots` 自動 return null——consumer 不必手動判斷。</Desc>
        <div className="max-w-[560px]">
          <Carousel>
            <CarouselContent>
              <CarouselItem>
                <SampleSlide label={slides[0].label} image={slides[0].image} height={200} />
              </CarouselItem>
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
            <CarouselDots />
          </Carousel>
          <p className="text-footnote text-fg-muted mt-2">↑ 只有 1 張 · dots 不渲染 · arrow 也會因無處可去而隱藏</p>
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
      <p className="whitespace-pre-line">{"詳 `carousel.spec.md` 「A11y 預設」段。摘要(對應 carousel.tsx 實作):\n\n  ARIA  :\n\n- 根容器 `role=\"region\"` + `aria-roledescription=\"carousel\"` + `aria-label=\"輪播\"`(consumer 可覆寫)\n- 每個 `CarouselItem` `role=\"group\"` + `aria-roledescription=\"slide\"`\n- Arrow 為 DS Button,`aria-label` 預設「上一張」/「下一張」(prop 可覆寫供 i18n);邊界時 native `disabled`,wrapper 同時 `opacity-0` + `pointer-events-none`——整顆按鈕從畫面與 Tab 順序消失,不顯示 disabled 樣式\n- Dots 容器 `role=\"group\"` + `aria-label=\"輪播指示器\"`;每個 dot 為原生 `<button>` + `aria-label=\"跳至第 N 張\"`,目前這張的 dot `aria-current=\"true\"`(對齊 FileViewer filmstrip canonical;為何不用 tabs 模型詳 spec「A11y 預設」)\n\n  Keyboard 行為  :\n\n- ←/→(horizontal)或 ↑/↓(vertical) — 上一張 / 下一張(鍵盤方向對齊內容捲動方向;根容器 `onKeyDownCapture` + `preventDefault` 避免頁面捲動)。根容器本身無 tabIndex,方向鍵在焦點位於 carousel 內任一控制項(arrow / dot)時生效\n- Tab — 各控制項為原生 `<button>`,各自獨立 tab stop;邊界時 disabled 的箭頭不可聚焦,自動跳出 Tab 順序\n- Enter / Space — 觸發當前 focus 的 arrow / dot(原生 `<button>` 預設行為)\n\n  Focus  :arrow wrapper 預設 `opacity-0`,`focus-within` 時強制顯示(鍵盤 focus 進 arrow,不需 hover,焦點必可見),Button 自身 focus-visible ring(`ring-2 ring-ring ring-offset-1`);dot focus-visible 走 ring token(`ring-2 ring-ring ring-offset-2`)。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;不靠滑鼠即可完整切張與跳張。"}</p>
    </div>
  ),
}
