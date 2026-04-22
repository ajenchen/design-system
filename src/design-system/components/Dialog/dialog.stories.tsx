import type { Meta } from '@storybook/react'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogClose,
} from './dialog'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldDescription } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'

const meta: Meta = {
  title: 'Design System/Components/Dialog/展示',
  parameters: { layout: 'centered' },
}
export default meta

export const Basic = {
  name: '基本',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>開啟 Modal</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modal</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-body">Modal 內容區域</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">Cancel</Button>
          </DialogClose>
          <Button>Next</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const WithForm = {
  name: '表單',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>開啟 Modal</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>建立專案</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            <Field>
              <FieldLabel>專案名稱</FieldLabel>
              <Input placeholder="輸入專案名稱" />
            </Field>
            <Field>
              <FieldLabel>描述</FieldLabel>
              <Input placeholder="輸入描述" />
              <FieldDescription>選填，簡述專案用途</FieldDescription>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button>建立</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const LongContent = {
  name: '長內容（body 捲動）',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>開啟 Modal</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>成員列表</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col">
            {Array.from({ length: 30 }, (_, i) => (
              <div key={i} className="py-2 border-b border-divider text-body">
                成員 {i + 1}
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">關閉</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const Destructive = {
  name: '危險操作',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="primary" danger>刪除</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>確認刪除</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-body">此操作無法復原。確定要刪除嗎？</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary" danger>刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

/**
 * ListBody — body 放 list 的 canonical pattern。
 *
 * **世界級對照**(每家 benchmark,對齊 CLAUDE.md Meta-Pattern M8):
 * - Material M3 Dialog with List:body 移除 pt/pb,item py-3 (48-56px row)
 *   ref https://m3.material.io/components/dialogs/specs
 * - Polaris Modal + ResourceList:body px only,list 接頂接底 flush,item 44-52px
 *   ref https://polaris.shopify.com/components/overlays/modal
 * - Atlassian Modal + OptionList:body padding 全移除,item 40-56px
 * - Linear Cmd+K:body 0 padding,item dense py-1 (密集 palette)
 * - GitHub Primer ActionList in Dialog:body 0 vertical padding
 *
 * **共識**:overlay body 裝 list 時,**body 不加 vertical padding**;list item 自己的
 * py 是節奏源。我方採同 pattern,用 `<DialogBody variant="list">` 一鍵切換。
 *
 * 以下三個 item-size 範例對應不同 list-item tier(item-anatomy Family 1 reading mode):
 */
export const ListBody = {
  name: 'Body 放 list(3 種 item 尺寸)',
  render: () => (
    <div className="flex flex-col gap-6 items-start">
      {/* 大 item:avatar 40 + title + description(對齊 user 期望 + Material M3 + FileItem rich) */}
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <Button variant="tertiary">開啟成員列表(大 item:avatar+desc)</Button>
        </DialogTrigger>
        <DialogContent autoHeight maxWidth={520}>
          <DialogHeader>
            <DialogTitle>成員列表</DialogTitle>
          </DialogHeader>
          <DialogBody variant="list">
            <div className="flex flex-col">
              {[
                { name: 'Alan Chen', org: 'ACME Corp', id: 'EMP-00427' },
                { name: 'Betty Wu', org: 'ACME Corp', id: 'EMP-00831' },
                { name: 'Charlie Lee', org: 'Nebula Inc', id: 'EMP-01204' },
                { name: 'Diana Kim', org: 'ACME Corp', id: 'EMP-00558' },
                { name: 'Ethan Park', org: 'Nebula Inc', id: 'EMP-01093' },
                { name: 'Fiona Lin', org: 'ACME Corp', id: 'EMP-00672' },
              ].map((m) => (
                <button
                  key={m.id}
                  className="flex items-center gap-3 px-[var(--layout-space-loose)] py-3 hover:bg-neutral-hover text-left border-b border-divider last:border-b-0"
                >
                  <div className="w-10 h-10 rounded-full bg-primary-subtle text-primary flex items-center justify-center text-body-lg font-medium shrink-0">
                    {m.name.charAt(0)}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-body font-medium truncate">{m.name}</span>
                    <span className="text-caption text-fg-muted truncate">{m.org} · {m.id}</span>
                  </div>
                </button>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="tertiary">關閉</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 中 item:icon + title + description 2 行 */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="tertiary">開啟通知設定(中 item:icon+desc)</Button>
        </DialogTrigger>
        <DialogContent autoHeight maxWidth={480}>
          <DialogHeader>
            <DialogTitle>通知設定</DialogTitle>
          </DialogHeader>
          <DialogBody variant="list">
            <div className="flex flex-col">
              {[
                { title: '電子郵件通知', desc: '接收每日摘要到信箱' },
                { title: '推播通知', desc: '即時推送到桌面與手機' },
                { title: 'Slack 整合', desc: '提及時自動發送到 #notifications' },
              ].map((n) => (
                <button
                  key={n.title}
                  className="flex flex-col gap-0.5 px-[var(--layout-space-loose)] py-2 hover:bg-neutral-hover text-left border-b border-divider last:border-b-0"
                >
                  <span className="text-body font-medium">{n.title}</span>
                  <span className="text-caption text-fg-muted">{n.desc}</span>
                </button>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="tertiary">關閉</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 小 item:純文字 label(對齊 Linear Cmd+K 密集) */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="tertiary">開啟標籤選擇(小 item:text only)</Button>
        </DialogTrigger>
        <DialogContent autoHeight maxWidth={360}>
          <DialogHeader>
            <DialogTitle>選擇標籤</DialogTitle>
          </DialogHeader>
          <DialogBody variant="list">
            <div className="flex flex-col">
              {['Bug', 'Feature', 'Improvement', 'Research', 'Documentation', 'Refactor', 'Test'].map((t) => (
                <button
                  key={t}
                  className="flex px-[var(--layout-space-loose)] py-1.5 hover:bg-neutral-hover text-left text-body border-b border-divider last:border-b-0"
                >
                  {t}
                </button>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="tertiary">關閉</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  ),
}

/**
 * OpenSnapshot — visual-audit 專用 story(非 consumer-facing 教學範例)。
 *
 * 用 `defaultOpen` 讓 overlay 在 render 當下就開著,Playwright 截圖才抓得到
 * Dialog chrome(Header/Body/Footer)。不用 play() + userEvent,是因為
 * Radix `defaultOpen` 對 Portal 自動生效,不需額外互動觸發 — 世界級 DS
 * (Polaris / Atlassian)的 chromatic 稽核也走同 pattern。
 *
 * 情境選用「確認刪除專案」— Jira / Linear 常見的 destructive confirmation,
 * 涵蓋 title + description + footer 雙 action 的完整 chrome。
 */
export const OpenSnapshot = {
  name: '開啟狀態(視覺稽核用)',
  tags: ['!autodocs'],
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>打開 Dialog</Button>
      </DialogTrigger>
      <DialogContent autoHeight maxWidth={480}>
        <DialogHeader>
          <DialogTitle>確認刪除專案</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-body">這個操作無法復原。專案內的所有 task、討論與附件都會被永久刪除。</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary" danger>確認刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
