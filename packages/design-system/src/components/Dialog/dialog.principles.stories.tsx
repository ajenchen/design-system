// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from './dialog'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'

const meta: Meta = {
  title: 'Design System/Components/Dialog/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── WhenToUse — 何時使用 Dialog ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Dialog 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Dialog/展示" name="表單"><span className="text-primary hover:underline font-medium cursor-pointer">表單</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Dialog/展示" name="長內容"><span className="text-primary hover:underline font-medium cursor-pointer">長內容</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Dialog/展示" name="危險操作"><span className="text-primary hover:underline font-medium cursor-pointer">危險操作</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Dialog/展示" name="主體放清單"><span className="text-primary hover:underline font-medium cursor-pointer">主體放清單</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
      <Rule
        title="Dialog 的 sweet spot — 需要使用者聚焦的操作流程、阻斷背景互動"
        note="建立 / 編輯複雜表單、破壞性動作確認、重要公告。Overlay + 居中 modal 強制使用者完成或取消才能回到頁面"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="primary">建立新專案</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={480}>
            <DialogHeader>
              <DialogTitle>建立新專案</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-3">
                <Input placeholder="專案名稱" />
                <Input placeholder="專案描述" />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">建立</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Rule>

      <Rule
        title="❌ 操作結果短暫回饋：用 Toast"
        note="儲存成功 / 刪除失敗等結果回饋是「短暫非阻斷」的——使用者不需要按「確定」關閉，也不該被流程打斷。Dialog 會阻斷流程，Toast 自動消失"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="primary">❌ 「儲存成功」用 Dialog</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={400}>
            <DialogHeader>
              <DialogTitle>儲存成功</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">您的變更已儲存至伺服器</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="primary">確定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Label warn>↑ 儲存成功應該 Toast 閃一下就消失，不該打斷使用者再按「確定」</Label>
      </Rule>

      <Rule
        title="❌ 持久性頁面通知：用 Alert"
        note="「方案即將到期」「帳號未驗證」這類需要 persistent 顯示 + 使用者主動處理的訊息，Alert 嵌入在頁面中，不阻斷流程但持續可見"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="primary">❌ 方案到期提示用 Dialog</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={420}>
            <DialogHeader>
              <DialogTitle>方案即將到期</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">您的方案將在 3 天後到期</p>
            </DialogBody>
          </DialogContent>
        </Dialog>
        <Label warn>↑ 到期提示每次進首頁都跳 Dialog → 反覆阻斷；應該用 Alert 持久 inline 通知</Label>
      </Rule>

      <Rule
        title="❌ 側邊工作流程：用 Sheet"
        note="檢視某項目詳情、側邊 filter panel、編輯 inspector——這類與主頁面平行的工作，使用者仍需看到主頁 context。Sheet 從邊緣滑入、較輕，不完全阻斷視線"
      >
        <div className="text-footnote text-fg-muted">（範例：task 詳情側邊編輯 — 應該用 Sheet，不用 Dialog 完全阻斷主清單）</div>
      </Rule>

      <Rule
        title="✅ 破壞性動作確認（Dialog 的典型用途）"
        note="刪除、登出多裝置、放棄變更等動作必須 Dialog 確認——這種動作不該用 Toast（沒有確認流程）、不該用 Sheet（視覺不夠強調）、必須 modal 強制聚焦"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="primary" danger startIcon={Trash2}>永久刪除專案</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={440}>
            <DialogHeader>
              <DialogTitle>確定要永久刪除此專案？</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">此動作無法復原，所有相關資料將一併刪除。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary" danger>永久刪除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Rule>
    </div>
    </div>
  ),
}

export const HeightBehaviorRule: Story = {
  name: '高度行為選擇',
  render: () => (
    <div>
      <Rule
        title="預設（填滿 viewport）— 內容量動態可能變化"
        note="`height = 100vh - inset*2`，body 區捲動。防止動態內容（非同步載入、展開 section）造成 dialog 跳動。適合內容不確定大小的場景"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary">預設高度（填滿）</Button>
          </DialogTrigger>
          <DialogContent maxWidth={520}>
            <DialogHeader>
              <DialogTitle>設定</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-4">
                {[
                  '桌面通知音效',
                  '頻道訊息通知',
                  '直接訊息通知',
                  '@提及推播',
                  '@頻道全員推播',
                  '執行緒回覆通知',
                  '關鍵字監控',
                  '行動裝置推播',
                  '推播延遲(秒)',
                  '推播閒置觸發',
                  '訊息預覽顯示',
                  '勿擾時段開始',
                  '勿擾時段結束',
                  '週末勿擾',
                  '假日勿擾',
                  'Email 摘要頻率',
                  'Email 摘要時段',
                  '未讀提醒週期',
                  '靜音指定頻道',
                  '通知摘要訂閱',
                ].map((label, i) => (
                  <Input key={i} placeholder={label} />
                ))}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">儲存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Label>↑ 填滿 viewport + body 捲動，穩定不跳動</Label>
      </Rule>

      <Rule
        title="autoHeight — 內容量已知且穩定"
        note="高度隨內容，超過 viewport 時才套 max-height。適合確認框、短表單、訊息提示——避免短內容撐滿整個螢幕的尷尬視覺"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary">autoHeight（短內容）</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={440}>
            <DialogHeader>
              <DialogTitle>確認操作</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">您確定要繼續嗎？此動作會影響所有訂閱使用者。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">繼續</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Label>↑ 只有一句話 + 兩顆按鈕，autoHeight 讓 dialog 剛好貼合內容</Label>
      </Rule>
    </div>
  ),
}

export const FooterActionRule: Story = {
  name: '頁尾按鈕配對',
  render: () => (
    <div>
      <Rule
        title="Primary + Tertiary 是預設配對（儲存 + 取消 / 確認 + 取消）"
        note="確認類動作用 primary，取消類動作用 tertiary。按鈕靠右對齊（justify-end），primary 在最右（使用者動線終點）"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary">標準配對</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={420}>
            <DialogHeader>
              <DialogTitle>儲存變更</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">變更將儲存到雲端，其他協作者將看到更新。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">儲存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Rule>

      <Rule
        title="破壞性動作：Primary + danger"
        note="刪除 / 永久移除等動作用 primary + danger（立即且不可逆）。必須搭配 Cancel button 讓使用者反悔"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary" startIcon={AlertTriangle}>刪除動作確認</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={420}>
            <DialogHeader>
              <DialogTitle>確定要刪除？</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">此動作無法復原。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary" danger startIcon={Trash2}>永久刪除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Rule>

      <Rule
        title="❌ 只有一顆「確定」按鈕的 Dialog 是反模式"
        note="單一「確定」按鈕的 Dialog 等於強迫使用者 acknowledge 訊息——這類訊息應該用 Toast（短暫非阻斷）或 Alert（持久顯示）。Dialog 的阻斷成本太高"
      >
        <Label warn>↑ 改用 Toast 或 Alert，Dialog 保留給有決策 / 動作選擇的場景</Label>
      </Rule>
    </div>
  ),
}
