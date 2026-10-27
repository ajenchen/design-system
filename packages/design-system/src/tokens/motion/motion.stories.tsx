// @story-baseline: components/HoverCard/hover-card.stories.tsx#LinkPreview — 延遲體感 demo 消費真實 consumer(Button iconOnly auto-Tooltip + HoverCard 預設 delay),非手刻浮層
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Download } from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  HOVER_CARD_SURFACE_CLASS,
} from '@/design-system/components/HoverCard/hover-card'
import { TutorialPage, TutorialSection, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { samplePersonCard } from '@/design-system/stories-helpers/scene/person-card'

// 規則的內容是一段示範,子節點照順序以 tight 排
const TutorialRule = createTutorialRule()

const meta: Meta = {
  title: 'Design System/Tokens/Motion',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
Motion token 系統。\`--motion-*\` 統一前綴下**兩個 sub-family**(2026-07-11 Phase 1-4 起;原「唯一家族 = hover delay」敘述已過時):

**(A) delay 3-tier**(「hover 觸發 → 延遲 N ms → overlay 顯示」)——目的不是動畫長度,是「user 真的想看」過濾器。

**(B) 進出場動畫**(overlay fade/zoom/slide 與原地展開收合的 duration / easing / 幾何)——\`--motion-duration-{overlay,surface,disclosure}\` + \`--motion-easing-{enter,exit}\` + \`--motion-enter-{distance,scale}\`,由 tw-animate-css 的 \`--tw-duration\` / \`--tw-ease\` 變數綁定;共用 SSOT = \`overlay-motion.ts\`(overlayMotion / surfaceMotion)與 \`disclosure-motion.ts\`(disclosureMotion)—— 何時播(只在沒有要求減少動態時)、關閉後保持最後一格,也都在這兩份裡。

**JS mirror**:Radix props(\`delayDuration\` / \`openDelay\` / \`closeDelay\`)只吃 number 不認 CSS var,故 consumer 消費 \`motion.ts\` 的 \`MOTION_DELAY_PLAIN_MS\` / \`MOTION_DELAY_RICH_MS\` / \`MOTION_DELAY_CLOSE_MS\`(與 \`motion.css\` 同值鏡像)。
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


function DelayRow({ token, value, usage, consumers }: {
  token: string; value: string; usage: string; consumers: string
}) {
  return (
    // @layout-space-magic-ok: token 表的每一列(TokenRow,同質列:欄距 / 列內距屬列幾何) —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值)
    <div className="grid items-center gap-x-6 gap-y-1 border-b border-border py-4 last:border-0"
      style={{ gridTemplateColumns: '200px 80px 1fr 220px' }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{token}</code>
      </div>
      <div className="text-caption font-mono text-fg-muted">{value}</div>
      <div className="text-body text-foreground">{usage}</div>
      <div className="text-caption text-fg-muted">{consumers}</div>
    </div>
  )
}


export const Overview: Story = {
  name: '總覽',
  render: () => (
    <TutorialPage className="max-w-4xl">
      <TutorialSection title="Hover Delay Tokens">
        <div>
          <p className="text-body text-fg-secondary mb-[var(--layout-space-tight)]">
            三層 tier:<code>plain</code>(被動文字提示)/ <code>rich</code>(含 fetch 的內容預覽,門檻更高)/
            <code>close</code>(通用關閉緩衝)。命名對齊 Material 3「plain / rich tooltip」術語 +
            DS 既有 <code>compact / rich</code> mode 詞彙。
          </p>

          <DelayRow
            token="--motion-delay-plain"
            value="500ms"
            usage="純文字提示——被動 hint,user 真停留才觸發,避免滑過列表時 N 次視覺擾動"
            consumers="Tooltip / OverflowIndicator"
          />
          <DelayRow
            token="--motion-delay-rich"
            value="700ms"
            usage="內容預覽——含 fetch / multi-section,避免列表掃視誤觸發 fetch waterfall"
            consumers="HoverCard / ProfileCard / Avatar"
          />
          <DelayRow
            token="--motion-delay-close"
            value="200ms"
            usage="通用關閉緩衝——mouse leave 後 200ms 內移回不會關(誤滑出容錯)"
            consumers="所有 hover overlay"
          />
        </div>
      </TutorialSection>

      {/* 2026-07-14 Dim 68 修:補 (B) 進出場動畫 sub-family 展示 — 原頁只列 delay,
          與 motion.css / motion.spec.md 兩 sub-family 現況 drift(「系統無 duration/easing token」已過時)。
          世界級對照值 cite:tokens/motion/motion.spec.md「進出場動畫 token」表(m3.material.io/styles/motion/easing-and-duration
          + carbondesignsystem.com/guidelines/motion/overview,spec frontmatter benchmark 段)。 */}
      <TutorialSection title="進出場動畫 Tokens">
        <div>
          <p className="text-body text-fg-secondary mb-[var(--layout-space-tight)]">
            Overlay fade/zoom/slide 與原地展開收合的 duration / easing / 幾何,由 tw-animate-css 的
            <code>--tw-duration</code> / <code>--tw-ease</code> 變數綁定;共用 SSOT =
            <code>overlay-motion.ts</code>(overlayMotion / surfaceMotion)與 <code>disclosure-motion.ts</code>(disclosureMotion),
            系統設定「減少動態」時不播、關閉後保持最後一格。
          </p>

          <DelayRow
            token="--motion-duration-overlay"
            value="150ms"
            usage="輕量浮層進出場"
            consumers="Tooltip / Popover / HoverCard / DropdownMenu"
          />
          <DelayRow
            token="--motion-duration-surface"
            value="250ms"
            usage="模態面板進出場——面積大、位移遠,慢一階"
            consumers="Dialog / Sheet / FileViewer"
          />
          <DelayRow
            token="--motion-duration-disclosure"
            value="200ms"
            usage="原地展開收合的高度動畫——值沿用三個消費者現況實際渲染的時長"
            consumers="TreeView / Accordion / AgentPanel 思考塊"
          />
          <DelayRow
            token="--motion-easing-enter"
            value="0,0,0,1"
            usage="進場減速曲線——快起、平滑落定"
            consumers="所有 overlay 進場"
          />
          <DelayRow
            token="--motion-easing-exit"
            value="0.3,0,1,1"
            usage="出場加速曲線"
            consumers="所有 overlay 出場"
          />
          <DelayRow
            token="--motion-enter-distance"
            value="0.5rem"
            usage="slide 進場位移(沿用現行 slide-*-2 幾何)"
            consumers="slide 型進場 overlay"
          />
          <DelayRow
            token="--motion-enter-scale"
            value="0.95"
            usage="zoom 進場 scale(沿用現行 zoom-95 幾何)"
            consumers="zoom 型進場 overlay"
          />

        </div>
      </TutorialSection>
    </TutorialPage>
  ),
}


/* 延遲體感 — 用真實 consumer 展示三個 token 的實際時序(非模擬動畫):
   Tooltip 走全域 TooltipProvider delayDuration=500(= plain);
   HoverCard Root 預設 openDelay=700 / closeDelay=200(= rich / close)。
   示範裡看得到的按鈕與連結都有反應(登記簿 A16「一堆按鈕都無法正常反應」):下載 = 跳 Toast;
   人名連結 = 在 Storybook「Actions」面板記一筆要去哪(讀者點了不會真的離開 Storybook;稽核 M102「展示層可以接 Storybook action」)。 */
const openMeihuiProfile = fn().mockName('前往 陳美惠 的個人頁')

export const DelayFeel: Story = {
  name: '延遲體感',
  render: () => (
    <>
    {/* 規則外框 = 共用教學頁元件(2026-10-20 T7 甲 / T8:原本手寫 section + h3 + 說明段落的教學框) */}
    <TutorialPage className="max-w-2xl">
      <TutorialRule
        paragraph={false}
        title="plain(500ms)— 工具列 icon 按鈕的文字提示"
        note="hover 下方按鈕停留 500ms 才出現 tooltip;快速滑過不觸發。移開後 tooltip 立即依全域 Provider 收合節奏消失。"
      >
        <div>
          <Button
            iconOnly
            variant="text"
            size="sm"
            startIcon={Download}
            aria-label="下載簡報"
            onClick={() => toast({ title: '已開始下載', description: 'Q3 產品簡報.pdf' })}
          />
        </div>
      </TutorialRule>

      <TutorialRule
        title="rich(700ms)+ close(200ms)— 留言裡的人名預覽卡"
        note="rich 內容(可能含 fetch)門檻比 plain 高 200ms——必須「真的想看」才停留 700ms; 移開後 200ms 內移回卡片不會關(close 緩衝)。"
      >
        <p className="text-body">
          這版 onboarding 流程的視覺稿請找
          {/* defaultOpen:讓 visual snapshot 看得到卡片(M15 OpenSnapshot);移開再 hover 即體驗 700/200ms 時序 */}
          <HoverCard defaultOpen>
            <HoverCardTrigger asChild>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  openMeihuiProfile()
                }}
                // 連結長相照 color.spec.md「連結 hover = 換色(`text-primary-hover`),不用底線」
                // @layout-space-magic-ok: 句子裡的行內人名連結左右 4px(行內文字 micro) —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值)
                className="text-primary hover:text-primary-hover mx-1 cursor-pointer"
              >
                陳美惠
              </a>
            </HoverCardTrigger>
            {/* 人員預覽卡 = 全 DS 同一張名片(登記簿 B22「所有地方的namecard預設都是秀一樣的資訊的」):走共用樣本
                samplePersonCard(建構器 buildPersonProfileCard,與 Avatar / PeoplePicker / DataTable 人員格同一支),
                欄位只有預設的帳號 ID / 員工編號,不另加「所在地 / 上班時間」。
                外殼 = hover-card.tsx HOVER_CARD_SURFACE_CLASS(與 Avatar hoverCard 內建同一份):不設內距、不設寬度 —— 寬度由 ProfileCard 自己決定 */}
            <HoverCardContent className={HOVER_CARD_SURFACE_CLASS}>
              {samplePersonCard({ name: '陳美惠', subtitle: 'Design｜MEIHUI｜2048731', id: 'MEIHUI', employeeNumber: '2048731' })}
            </HoverCardContent>
          </HoverCard>
          確認,她負責這一季的設計系統整合。
        </p>
      </TutorialRule>
    </TutorialPage>
    {/* 「下載簡報」的回饋 Toast(toast.spec.md:每個獨立 story root 一個 Toaster) */}
    <Toaster />
    </>
  ),
}
