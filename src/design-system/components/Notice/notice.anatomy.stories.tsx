// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-rationale:
//   ColorMatrix represented as VariantIconMap — Notice 不擁有底色 / 邊框,只
//     負責 layout + status icon 選擇。色彩由消費方(Alert subtle shell、Toast
//     solid bg + data-theme)決定;icon 色 token 由 SUBTLE_ICON_COLOR 對照表
//     提供。VariantIconMap(6.)展示 5 variant × icon × subtle text token,
//     等同於 ColorMatrix 的功能。Solid 色彩請查 alert.anatomy / toast.anatomy。
//   SizeMatrix N/A — Notice 是 Toast / Alert 共用的 layout primitive,固定
//     md tier(text-body 14px、px-4 py-3、gap-2、icon 16px),不隨 density 縮放
//     ——通知是跨 density 一致的訊息載體,業界共識(Polaris / Material 同樣
//     單一 size)。Inspector 已展示尺寸藍圖。
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import {
  Info,
  CircleCheck,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { Notice, SUBTLE_ICON_COLOR, type NoticeVariant } from './notice'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th, Swatch } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Internal/Notice/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

/* ═══════════════════════════════════════════════════════════════════════════
   Data
   ═══════════════════════════════════════════════════════════════════════════ */

const VARIANTS: NoticeVariant[] = ['neutral', 'info', 'success', 'warning', 'error']

const VARIANT_LABEL: Record<NoticeVariant, string> = {
  neutral: '一般訊息',
  info: '資訊提示',
  success: '操作成功',
  warning: '警告',
  error: '錯誤',
}

const VARIANT_ICON: Record<NoticeVariant, LucideIcon | null> = {
  neutral: null,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: XCircle,
}

const SUBTLE_CONTAINER: Record<NoticeVariant, string> = {
  neutral: 'bg-muted border border-border',
  info: 'bg-info-subtle border border-[var(--info-hover)]',
  success: 'bg-success-subtle border border-[var(--success-hover)]',
  warning: 'bg-warning-subtle border border-[var(--warning-hover)]',
  error: 'bg-error-subtle border border-[var(--error-hover)]',
}

function SubtleShell({ variant, children }: { variant: NoticeVariant; children: React.ReactNode }) {
  return (
    <div className={`rounded-md overflow-hidden text-foreground ${SUBTLE_CONTAINER[variant]}`}>
      {children}
    </div>
  )
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
          Notice 是 Toast / Alert 共用的視覺佈局 primitive,只負責 layout 和 icon 選擇——色彩由消費者透過
          <code className="font-mono text-footnote mx-1">data-theme</code>
          控制。4-slot 結構:status icon · content (title + description) · endContent · dismiss X。Typography
          固定 md tier,padding 固定
          <code className="font-mono text-footnote mx-1">px-4 py-3</code>
          (不隨 density 變)。
        </Desc>
        <SubtleShell variant="info">
          <Notice
            variant="info"
            iconClassName={SUBTLE_ICON_COLOR.info}
            title="Audit log 僅限 Business 方案"
            description="升級後可回溯 90 天內所有成員的操作紀錄。"
            endContent={
              <Button variant="tertiary" size="xs">
                升級方案
              </Button>
            }
          />
        </SubtleShell>
      </div>

      <div>
        <H3>Slot 對照</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Slot</Th>
                <Th>內容</Th>
                <Th>對齊</Th>
                <Th>尺寸</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>status icon</Td>
                <Td>variant 決定 icon(neutral 無 icon)</Td>
                <Td mono>h-[1lh] items-center</Td>
                <Td mono>16px</Td>
              </tr>
              <tr>
                <Td mono>title</Td>
                <Td>單行必填</Td>
                <Td mono>text-body leading-compact</Td>
                <Td mono>14px / 有 desc 時 font-medium</Td>
              </tr>
              <tr>
                <Td mono>description</Td>
                <Td>可選輔助文字</Td>
                <Td mono>text-fg-secondary</Td>
                <Td mono>14px leading-compact</Td>
              </tr>
              <tr>
                <Td mono>endContent</Td>
                <Td>action Button(tertiary xs)</Td>
                <Td mono>h-[1lh] items-center</Td>
                <Td>由 Button 控制</Td>
              </tr>
              <tr>
                <Td mono>dismiss X</Td>
                <Td>關閉按鈕(可關)</Td>
                <Td mono>h-[1lh] items-center</Td>
                <Td mono>16px icon / 18px hover bg</Td>
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
                <Td mono>variant</Td>
                <Td mono>'neutral' | 'info' | 'success' | 'warning' | 'error'</Td>
                <Td mono>'neutral'</Td>
                <Td>決定 status icon 與語意</Td>
              </tr>
              <tr>
                <Td mono>title</Td>
                <Td mono>string</Td>
                <Td>—(必填)</Td>
                <Td>主要訊息,單行 truncate</Td>
              </tr>
              <tr>
                <Td mono>description</Td>
                <Td mono>string</Td>
                <Td mono>undefined</Td>
                <Td>輔助文字,有值時 title 加粗</Td>
              </tr>
              <tr>
                <Td mono>endContent</Td>
                <Td mono>ReactNode</Td>
                <Td mono>undefined</Td>
                <Td>通常放 Button tertiary xs(見 spec)</Td>
              </tr>
              <tr>
                <Td mono>dismissible</Td>
                <Td mono>boolean</Td>
                <Td mono>true</Td>
                <Td>顯示關閉按鈕</Td>
              </tr>
              <tr>
                <Td mono>onDismiss</Td>
                <Td mono>() =&gt; void</Td>
                <Td mono>undefined</Td>
                <Td>關閉按鈕 callback</Td>
              </tr>
              <tr>
                <Td mono>iconClassName</Td>
                <Td mono>string</Td>
                <Td mono>undefined</Td>
                <Td>覆寫 icon 顏色(consumer 套 SUBTLE_ICON_COLOR)</Td>
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
  render: () => {
    return <NoticeInspector />
  },
}

function NoticeInspector() {
  const [variant, setVariant] = useState<NoticeVariant>('warning')
  const [hasDescription, setHasDescription] = useState(true)
  const [hasEndContent, setHasEndContent] = useState(true)
  const [dismissible, setDismissible] = useState(true)

  return (
    <div className="grid grid-cols-[1fr_320px] gap-8 max-w-5xl">
      {/* Left: live preview */}
      <div className="flex flex-col gap-6">
        <div>
          <H3>即時預覽</H3>
          <SubtleShell variant={variant}>
            <Notice
              variant={variant}
              iconClassName={SUBTLE_ICON_COLOR[variant]}
              title="上傳的檔案格式不受支援"
              description={hasDescription ? '僅接受 PNG / JPG / SVG 格式,檔案大小上限 10 MB。' : undefined}
              endContent={
                hasEndContent ? (
                  <Button variant="tertiary" size="xs">
                    重新上傳
                  </Button>
                ) : undefined
              }
              dismissible={dismissible}
            />
          </SubtleShell>
        </div>

        <div>
          <H3>尺寸藍圖</H3>
          <div className="border border-divider rounded-md p-4 bg-muted">
            <pre className="text-footnote font-mono text-fg-secondary leading-relaxed whitespace-pre">
{`┌─ Notice container ──────────────────────────────────────────────┐
│  px-4 (16px)     py-3 (12px)     gap-2 (8px)                    │
│  ┌───┐ ┌────────────────────────┐ ┌──────────┐ ┌─┐               │
│  │ ⚠ │ │ title  text-body fm    │ │ Button   │ │X│               │
│  │16 │ │ desc   text-body fs    │ │ xs       │ │16│              │
│  └───┘ └────────────────────────┘ └──────────┘ └─┘               │
│  h-[1lh]      min-w-0 flex-1                   h-[1lh]           │
└──────────────────────────────────────────────────────────────────┘

text-body = 14px   leading-compact = 1.3
固定 md tier — 不隨 density 變(通知是跨 density 一致的訊息載體)`}
            </pre>
          </div>
        </div>
      </div>

      {/* Right: inspect panel */}
      <div className="flex flex-col gap-6">
        <div>
          <H3>Variant</H3>
          <div className="flex flex-wrap gap-2">
            {VARIANTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className={`px-2.5 py-1 text-caption rounded-md font-mono cursor-pointer ${
                  v === variant
                    ? 'bg-primary text-white'
                    : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <H3>Props</H3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-caption">
              <input
                type="checkbox"
                checked={hasDescription}
                onChange={(e) => setHasDescription(e.target.checked)}
              />
              <span className="font-mono">description</span>
            </label>
            <label className="flex items-center gap-2 text-caption">
              <input
                type="checkbox"
                checked={hasEndContent}
                onChange={(e) => setHasEndContent(e.target.checked)}
              />
              <span className="font-mono">endContent</span>
            </label>
            <label className="flex items-center gap-2 text-caption">
              <input
                type="checkbox"
                checked={dismissible}
                onChange={(e) => setDismissible(e.target.checked)}
              />
              <span className="font-mono">dismissible</span>
            </label>
          </div>
        </div>

        <div>
          <H3>Layout tokens</H3>
          <table className="text-caption border-collapse w-full">
            <tbody>
              <tr>
                <Td mono>px</Td>
                <Td mono>px-4 / 16px</Td>
              </tr>
              <tr>
                <Td mono>py</Td>
                <Td mono>py-3 / 12px</Td>
              </tr>
              <tr>
                <Td mono>gap</Td>
                <Td mono>gap-2 / 8px</Td>
              </tr>
              <tr>
                <Td mono>icon size</Td>
                <Td mono>16px</Td>
              </tr>
              <tr>
                <Td mono>dismiss hover bg</Td>
                <Td mono>18px · rounded-md</Td>
              </tr>
              <tr>
                <Td mono>title font</Td>
                <Td mono>text-body · leading-compact</Td>
              </tr>
              <tr>
                <Td mono>desc font</Td>
                <Td mono>text-body · text-fg-secondary</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. VariantIconMap — 元件特有(取代 ColorMatrix,見 spec「為何無 ColorMatrix」)
   ═══════════════════════════════════════════════════════════════════════════ */

export const VariantIconMap: Story = {
  name: '變體 × icon 對照',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>變體 × icon × 語意</H3>
        <Desc>
          每個 variant 搭配固定 status icon 與 subtle text color token。Consumer(Alert subtle)透過
          <code className="font-mono text-footnote mx-1">iconClassName={`{SUBTLE_ICON_COLOR[variant]}`}</code>
          套用對應色彩。Solid appearance 時由 consumer 的
          <code className="font-mono text-footnote mx-1">data-theme</code>
          控制,icon 不需再套色。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Variant</Th>
                <Th>Icon</Th>
                <Th>語意</Th>
                <Th>Subtle icon token</Th>
                <Th>使用情境</Th>
              </tr>
            </thead>
            <tbody>
              {VARIANTS.map((v) => {
                const Icon = VARIANT_ICON[v]
                return (
                  <tr key={v}>
                    <Td mono>{v}</Td>
                    <Td>
                      {Icon ? (
                        <Icon size={16} className={SUBTLE_ICON_COLOR[v]} aria-hidden />
                      ) : (
                        <span className="text-fg-muted font-mono">—</span>
                      )}
                    </Td>
                    <Td>{VARIANT_LABEL[v]}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <Swatch
                          value={
                            v === 'neutral'
                              ? '--fg-muted'
                              : v === 'info'
                                ? '--info-text'
                                : v === 'success'
                                  ? '--success-text'
                                  : v === 'warning'
                                    ? '--warning-text'
                                    : '--error-text'
                          }
                          size="sm"
                        />
                        <span className="font-mono">{SUBTLE_ICON_COLOR[v]}</span>
                      </span>
                    </Td>
                    <Td>
                      {
                        {
                          neutral: '中性公告(維護、一般提醒)',
                          info: '未來事件、功能說明、進階方案提示',
                          success: '操作成功回饋(儲存、部署、複製)',
                          warning: '尚可繼續但需要注意(配額、期限)',
                          error: '阻斷性失敗(付款、上傳、權限)',
                        }[v]
                      }
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Subtle 樣式視覺</H3>
        <Desc>
          Notice 本身不設 bg / border。此處 shell 為 Alert consumer 提供的 subtle container(
          <code className="font-mono text-footnote mx-1">bg-*-subtle + border {`{hue}-hover`}</code>
          ),展示 icon 色彩在 subtle surface 上的對比。Solid(dark bg + 白字 icon)對照請查
          <code className="font-mono text-footnote mx-1">alert.anatomy.stories.tsx</code>
          。
        </Desc>
        <div className="flex flex-col gap-3 max-w-2xl">
          {VARIANTS.map((v) => (
            <SubtleShell key={v} variant={v}>
              <Notice
                variant={v}
                iconClassName={SUBTLE_ICON_COLOR[v]}
                title={`${VARIANT_LABEL[v]} — 標題文字`}
                description="本例展示 subtle surface 上的 icon / text 對比。"
              />
            </SubtleShell>
          ))}
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. StateBehavior
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Dismissible 行為</H3>
        <Desc>
          Alert 預設可 dismiss(持久通知,使用者需主動關);Toast 通常不 dismiss(計時器自動關)。兩者共用 Notice,僅透過
          <code className="font-mono text-footnote mx-1">dismissible</code>
          prop 控制。
        </Desc>
        <div className="grid grid-cols-2 gap-3 max-w-3xl">
          <div>
            <p className="text-caption text-fg-muted mb-2">dismissible (default)</p>
            <SubtleShell variant="info">
              <Notice
                variant="info"
                iconClassName={SUBTLE_ICON_COLOR.info}
                title="Audit log 僅限 Business 方案"
                dismissible
              />
            </SubtleShell>
          </div>
          <div>
            <p className="text-caption text-fg-muted mb-2">dismissible=false</p>
            <SubtleShell variant="info">
              <Notice
                variant="info"
                iconClassName={SUBTLE_ICON_COLOR.info}
                title="變更已儲存"
                dismissible={false}
              />
            </SubtleShell>
          </div>
        </div>
      </div>

      <div>
        <H3>Dismiss button 互動</H3>
        <Desc>
          16px X icon / 18px hover bg / rounded-md——對齊 item-anatomy 的 inline-action pattern。Hover 時
          <code className="font-mono text-footnote mx-1">text-fg-muted → text-foreground</code>
          ,背景由 transparent 進
          <code className="font-mono text-footnote mx-1">bg-neutral-hover</code>
          。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>State</Th>
                <Th>Icon color</Th>
                <Th>Hover bg (18×18)</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>default</Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch value="--fg-muted" size="sm" />
                    <span className="font-mono">--fg-muted</span>
                  </span>
                </Td>
                <Td mono>transparent</Td>
              </tr>
              <tr>
                <Td mono>hover</Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch value="--foreground" size="sm" />
                    <span className="font-mono">--foreground</span>
                  </span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch value="--neutral-hover" size="sm" />
                    <span className="font-mono">--neutral-hover</span>
                  </span>
                </Td>
              </tr>
              <tr>
                <Td mono>active</Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch value="--foreground" size="sm" />
                    <span className="font-mono">--foreground</span>
                  </span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch value="--neutral-active" size="sm" />
                    <span className="font-mono">--neutral-active</span>
                  </span>
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Title truncate 行為</H3>
        <Desc>
          title 超過一行時走
          <code className="font-mono text-footnote mx-1">truncate</code>
          (不換行,尾端省略)。description 不 truncate——重要脈絡不可截斷。
        </Desc>
        <div className="max-w-md">
          <SubtleShell variant="warning">
            <Notice
              variant="warning"
              iconClassName={SUBTLE_ICON_COLOR.warning}
              title="本月已使用 95% 儲存配額,預估 3 天後將耗盡並停止所有上傳動作"
              description="建議立即清理 Trash 資料夾或升級到 Team 方案,避免 CI pipeline 因上傳失敗而中斷。"
            />
          </SubtleShell>
        </div>
      </div>
    </div>
  ),
}
