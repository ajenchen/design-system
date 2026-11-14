import * as React from 'react'
import {
  AgentConversation,
  AgentDecisionSummary,
  AgentMessage,
  AgentToolbar,
  type AgentAttachment,
  type AgentConversationSummary,
  type AgentDecisionQuestion,
  type AgentPromptAttachment,
} from '@/design-system/components/AgentPanel/agent-panel'
import { AgentLogo } from '@/design-system/components/AgentPanel/agent-panel-logo'
import { Empty } from '@/design-system/components/Empty/empty'
import { toast } from '@/design-system/components/Toast/toast'

/**
 * 智慧代理範例的對話模型(2026-10-28;稽核 H23 / M058、範例依據 E1 清單外同族、規格層標本 Q-specimen)。
 *
 * 根因:各則範例把輸入盒寫成 `value="" onValueChange={noop}`、送出 / 加附件 / 工具列 / 決策卡 / 標題列的 + 與歷史都接空函式,
 * 讀者點了沒反應(user 2026-09-08 點名代理示意「一堆按鈕都無法正常反應」;ssot F-S2:畫面上看得到的按鈕都要能動)。
 * 只有網址註冊表那則有一份能動的對話模型(原 agent-panel.stories.tsx `useSessions`),其餘各自擺死值。
 * 這裡把那一份模型收成一支(行為照原樣),AgentPanel 展示 / 設計規格、AppShell 展示 / 設計規格的代理範例都消費它:
 * - 輸入盒:打得進字;送出 = 這則訊息(連同附件)加進目前的對話、輸入盒清空;`reply` 有給才另外接一則代理回覆。
 * - 加附件:開瀏覽器的檔案選擇器,選到的檔名變成輸入盒裡的 Tag(× 移除);沒選就不變。
 * - 標題列:歷史浮層列出有訊息的對話,點了切換;改名 / 刪除照 `onDeleteConversation` 契約(刪目前的 → 切到最近一則;全刪 → 開新的空對話);
 *   「+」開新的空對話(送出第一則之前不進歷史、標題是「新對話」)。
 * - 工具列:複製 = 那則回覆的文字放進剪貼簿 + Toast「已複製到剪貼簿」;讚 / 倒讚 = Toast「已送出回饋」
 *   (`components/Toast/toast.spec.md`「何時用」:操作結果短暫回饋 —— 已複製到剪貼簿、訊息已送出)。
 * - 決策卡:送出或跳過(= 用預設繼續)→ 卡片收起,答案以決策回執(`AgentDecisionSummary`)記進對話。
 *
 * 範例要 Toast 時,story root 掛一個 `<Toaster />`(toast.spec.md:每個獨立 story root 一個)。
 */

export interface DemoMessage {
  role: 'user' | 'agent'
  content: React.ReactNode
  /** 我方訊息帶的附件(氣泡裡的 Chip) */
  attachments?: AgentAttachment[]
  /** 代理訊息的工具列(複製 / 讚 / 倒讚):複製時放進剪貼簿的字;省略 = 這則沒有工具列 */
  copyText?: string
}

export interface DemoSession {
  id: string
  title: string
  group: string
  /** 歷史浮層列首換成進度圈(代理還在回覆那一則) */
  thinking?: boolean
  messages: DemoMessage[]
}

/** 標題最多取第一則訊息的前 16 字(網址註冊表示意原本的規則) */
const TITLE_MAX = 16

/** 開瀏覽器的檔案選擇器;選到檔案才回呼(取消 = 不動) */
function pickFiles(onPick: (names: string[]) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.addEventListener('change', () => {
    const names = Array.from(input.files ?? []).map((file) => file.name)
    if (names.length) onPick(names)
  })
  input.click()
}

/** 決策卡的答案 → 決策回執的列(複選以「、」接;「其他」是使用者打的字,原樣留下) */
export function decisionEntries(questions: AgentDecisionQuestion[], answers: Record<string, string>) {
  return questions.map((q) => {
    const values = (answers[q.id] ?? '').split('\n').filter(Boolean)
    const labels = values.map((v) => q.options.find((o) => o.value === v)?.label ?? v)
    return { question: q.label, answer: labels.join('、') || '—' }
  })
}

interface State {
  sessions: DemoSession[]
  activeId: string
  drafts: Record<string, string>
  attachments: Record<string, AgentPromptAttachment[]>
  seq: number
}

export interface UseAgentDemoOptions {
  sessions: DemoSession[]
  /** 一開始停在哪一則;省略 = 第一則 */
  activeId?: string
  /** 一開始就停在新的空對話(「新對話(空狀態)」那種) */
  startEmpty?: boolean
  /** 一開始就在輸入盒裡的附件(附件溢出那種範例) */
  attachments?: AgentPromptAttachment[]
  /** 一開始就打在輸入盒裡的字 */
  draft?: string
  /** 送出後接的代理回覆;省略 = 只把使用者的訊息加進對話 */
  reply?: (text: string) => React.ReactNode
}

const emptySession = (seq: number): DemoSession => ({ id: `s${seq}`, title: '', group: '今天', messages: [] })

export function useAgentDemo({ sessions: initialSessions, activeId, startEmpty, attachments: initialAttachments, draft: initialDraft, reply }: UseAgentDemoOptions) {
  const [state, setState] = React.useState<State>(() => {
    const seq = initialSessions.length
    const first = startEmpty ? emptySession(seq + 1) : null
    const sessions = first ? [first, ...initialSessions] : initialSessions
    const active = first?.id ?? activeId ?? initialSessions[0].id
    return {
      sessions,
      activeId: active,
      drafts: initialDraft ? { [active]: initialDraft } : {},
      attachments: initialAttachments ? { [active]: initialAttachments } : {},
      seq: first ? seq + 1 : seq,
    }
  })
  const active = state.sessions.find((s) => s.id === state.activeId) ?? state.sessions[0]
  const empty = active.messages.length === 0
  const draft = state.drafts[active.id] ?? ''
  const attachments = state.attachments[active.id] ?? []

  const update = (id: string, patch: (s: DemoSession) => DemoSession) =>
    setState((st) => ({ ...st, sessions: st.sessions.map((s) => (s.id === id ? patch(s) : s)) }))

  const submit = () => {
    const text = draft.trim()
    if (!text && attachments.length === 0) return
    const sent: DemoMessage = { role: 'user', content: text, attachments: attachments.length ? attachments : undefined }
    const answer = reply && text ? [{ role: 'agent' as const, content: reply(text) }] : []
    setState((st) => ({
      ...st,
      sessions: st.sessions.map((s) =>
        s.id === st.activeId
          ? { ...s, title: s.title || (text || attachments[0]?.label || '').slice(0, TITLE_MAX), messages: [...s.messages, sent, ...answer] }
          : s,
      ),
      drafts: { ...st.drafts, [st.activeId]: '' },
      attachments: { ...st.attachments, [st.activeId]: [] },
    }))
  }
  const create = () =>
    setState((st) => {
      const next = emptySession(st.seq + 1)
      return { ...st, sessions: [next, ...st.sessions], activeId: next.id, seq: st.seq + 1 }
    })
  /** 刪的是目前對話 → 切到最近一則;全部刪光 → 開新的空對話(agent-panel.tsx `onDeleteConversation` 契約) */
  const remove = (id: string) =>
    setState((st) => {
      const sessions = st.sessions.filter((s) => s.id !== id)
      if (st.activeId !== id) return { ...st, sessions }
      const nextActive = sessions.find((s) => s.messages.length > 0) ?? sessions[0]
      if (nextActive) return { ...st, sessions, activeId: nextActive.id }
      const fresh = emptySession(st.seq + 1)
      return { ...st, sessions: [fresh], activeId: fresh.id, seq: st.seq + 1 }
    })
  /** 重新整理 = 回到新的空對話(歷史留著,當前對話與草稿不保留;網址註冊表示意 v14 條 F) */
  const reset = () =>
    setState((st) => {
      const fresh = emptySession(st.seq + 1)
      return { ...st, sessions: [fresh, ...st.sessions.filter((s) => s.messages.length > 0)], activeId: fresh.id, seq: st.seq + 1 }
    })

  const history = state.sessions
    .filter((s) => s.messages.length > 0)
    .map(({ id, title, group, thinking }): AgentConversationSummary => ({ id, title, group, thinking }))

  return {
    active,
    empty,
    messages: active.messages,
    /** 把幾則訊息接到目前的對話後面(決策卡送出後的回執) */
    addMessages: (messages: DemoMessage[]) => update(active.id, (s) => ({ ...s, messages: [...s.messages, ...messages] })),
    reset,
    /** 歷史列首的進度圈(代理還在回覆那一則):停止回覆時關掉 */
    setThinking: (id: string, thinking: boolean) => update(id, (s) => ({ ...s, thinking })),
    /** `<AgentPanelHeader {...header} />`;標題 = 目前對話,空的時候是「新對話」 */
    header: {
      title: empty ? '新對話' : active.title,
      conversations: history,
      activeConversationId: active.id,
      conversationEmpty: empty,
      onSelectConversation: (id: string) => setState((st) => ({ ...st, activeId: id })),
      onRenameConversation: (id: string, title: string) => update(id, (s) => ({ ...s, title })),
      onDeleteConversation: remove,
      onNewConversation: create,
    },
    /** `<AgentPromptInput {...prompt} />` */
    prompt: {
      value: draft,
      onValueChange: (value: string) => setState((st) => ({ ...st, drafts: { ...st.drafts, [st.activeId]: value } })),
      onSubmit: submit,
      attachments,
      onRemoveAttachment: (a: AgentPromptAttachment) =>
        setState((st) => ({ ...st, attachments: { ...st.attachments, [st.activeId]: (st.attachments[st.activeId] ?? []).filter((x) => x.id !== a.id) } })),
      onAddAttachment: () =>
        pickFiles((names) =>
          setState((st) => {
            const list = st.attachments[st.activeId] ?? []
            const added = names.map((label, i) => ({ id: `${st.activeId}-f${list.length + i + 1}`, label }))
            return { ...st, attachments: { ...st.attachments, [st.activeId]: [...list, ...added] } }
          }),
        ),
    },
  }
}

/** `<AgentToolbar {...toolbarActions(text)} />`:複製放進剪貼簿、讚 / 倒讚送出回饋,三顆都有看得到的結果(Toast) */
export function toolbarActions(text: string) {
  return {
    onCopy: () => {
      void navigator.clipboard?.writeText(text).catch(() => {})
      toast({ title: '已複製到剪貼簿' })
    },
    onLike: () => toast({ title: '已送出回饋' }),
    onDislike: () => toast({ title: '已送出回饋' }),
  }
}

/** 決策卡送出 / 跳過後記進對話的那一則(代理訊息 + 決策回執) */
export function decisionReceipt(questions: AgentDecisionQuestion[], answers: Record<string, string>): DemoMessage {
  return {
    role: 'agent',
    content: (
      <>
        已按你的選擇繼續:
        {/* @layout-space-magic-ok: 同一則代理訊息的內文段距 8px(思考塊 / 回執 / 清單 / 段落之間),沿用展示頁「決策回執」既有值;規格沒寫這個值(agent-panel.spec.md「4. AgentMessage(訊息)」沒有定義代理訊息的段距),不由 AI 補進規格(F-S7) */}
        <AgentDecisionSummary className="mt-2" entries={decisionEntries(questions, answers)} />
      </>
    ),
  }
}

/**
 * 一則範例的對話內容:空的(新對話)= 招喚態標誌 + Empty(「新對話(空狀態)」範例同一套),在標頭與輸入框之間的可用範圍正中 ——
 * 包層上下不給內距(垂直置中的狀態不是從上往下排到底的內容,不套規則 2 / 4 的上下距離;user 2026-11-14 在 A5 成品頁的留言 ②
 * 「這種 result 或是 empty 就不是撐滿高度的元素，且當初定位就是把它放在正中間」),左右留 loose:只在面板很窄、說明很長時擋住字貼邊
 * (empty.spec.md「文字不限寬」:行寬由容器 padding 控制;現況字到面板邊 86,看不出差別 ——【AI 推導 2026-11-14】)。
 * 【更正 2026-11-14】2026-11-13(A5)包層補過上 tight / 下 bottom,空狀態因此往上 18 / 16px,已拿掉。agent-panel.spec.md「附:空狀態」。
 * 有訊息就照順序畫,代理訊息有 `copyText` 才帶工具列。
 */
export function DemoConversation({ messages }: { messages: DemoMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-[var(--layout-space-loose)]">
        <Empty
          icon={<AgentLogo state="attract" size={48} label="智慧代理" />}
          title="開始第一個對話"
          description="丟一個任務給代理,或把檔案拖進來。"
        />
      </div>
    )
  }
  return (
    <AgentConversation>
      {messages.map((m, i) => (
        <AgentMessage
          key={i}
          role={m.role}
          attachments={m.attachments}
          toolbar={m.copyText !== undefined ? <AgentToolbar {...toolbarActions(m.copyText)} /> : undefined}
        >
          {m.content}
        </AgentMessage>
      ))}
    </AgentConversation>
  )
}
