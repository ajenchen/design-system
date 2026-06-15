// @story-trait-rationale: hasInteractiveStates trait — TreeView interactive states(hover / focus / selected / disabled)由 TreeItem 內部處理(spec.md state machine + anatomy StateBehavior story 已 cover),showcase 層 manual Disabled/States story retired per F migration(2026-05-15)— anatomy.stories.tsx auto-compile owns StateBehavior 6-canonical。AllSizes 同理 retired(SizeMatrix anatomy auto-compile owns)。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Folder, FileText, FileCode, Image, Settings,
  CheckCircle2, Circle, Minus,
  type LucideIcon,
} from 'lucide-react'
import { TreeView, TreeItem } from './tree-view'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'

const meta: Meta = {
  title: 'Design System/Components/TreeView/展示',
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj

// ── File Browser ────────────────────────────────────────────────────────

export const FileBrowser: Story = {
  name: '檔案瀏覽',
  render: () => (
    <div className="w-[300px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
      <TreeView aria-label="檔案瀏覽" defaultExpandedIds={['src', 'components']}>
        <TreeItem id="src" icon={Folder} label="src">
          <TreeItem id="components" icon={Folder} label="components">
            <TreeItem id="button" icon={FileCode} label="Button.tsx" />
            <TreeItem id="input" icon={FileCode} label="Input.tsx" />
            <TreeItem id="dialog" icon={FileCode} label="Dialog.tsx" />
          </TreeItem>
          <TreeItem id="utils" icon={Folder} label="utils">
            <TreeItem id="cn" icon={FileCode} label="cn.ts" />
          </TreeItem>
          <TreeItem id="app" icon={FileCode} label="App.tsx" />
          <TreeItem id="main" icon={FileCode} label="main.tsx" />
        </TreeItem>
        <TreeItem id="public" icon={Folder} label="public">
          <TreeItem id="favicon" icon={Image} label="favicon.svg" />
        </TreeItem>
        <TreeItem id="pkg" icon={FileText} label="package.json" />
        <TreeItem id="readme" icon={FileText} label="README.md" />
      </TreeView>
    </div>
  ),
}

// ── Stepper ─────────────────────────────────────────────────────────────

const StepDone = () => <CheckCircle2 size={16} className="text-success" />
const StepActive = () => <Circle size={16} className="text-primary" />
const StepPending = () => <Minus size={16} className="text-fg-muted" />

export const Stepper: Story = {
  name: '步驟引導',
  render: () => (
    <div className="w-[300px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
      <TreeView
        aria-label="申請流程"
        expandOnSelect
        defaultExpandedIds={['step1', 'step2']}
        defaultSelectedIds={['step2-card']}
      >
        <TreeItem id="step1" indicator={<StepDone />} label="1. 個人資料">
          <TreeItem id="step1-name" indicator={<StepDone />} label="姓名" />
          <TreeItem id="step1-addr" indicator={<StepDone />} label="地址" />
          <TreeItem id="step1-contact" indicator={<StepDone />} label="聯絡方式" />
        </TreeItem>
        <TreeItem id="step2" indicator={<StepActive />} label="2. 付款方式">
          <TreeItem id="step2-card" indicator={<StepActive />} label="信用卡號碼" />
          <TreeItem id="step2-billing" indicator={<StepPending />} label="帳單地址" />
        </TreeItem>
        <TreeItem id="step3" indicator={<StepPending />} label="3. 確認送出" />
      </TreeView>
    </div>
  ),
}

// ── Multi-select with Checkbox ───────────────────────────────────────────

const CheckboxTree = () => {
  const [checked, setChecked] = React.useState<Record<string, boolean>>({
    'read': true, 'read-docs': true, 'read-media': true,
    'write': false, 'write-docs': true, 'write-media': false,
  })

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // parent 的 indeterminate 邏輯
  const readAll = checked['read-docs'] && checked['read-media']
  const readNone = !checked['read-docs'] && !checked['read-media']
  const writeAll = checked['write-docs'] && checked['write-media']
  const writeNone = !checked['write-docs'] && !checked['write-media']

  return (
    <div className="w-[300px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
      <TreeView selectionMode="multiple" aria-label="權限選擇" defaultExpandedIds={['read', 'write']}>
        <TreeItem
          id="read"
          icon={Folder}
          label="讀取權限"
          checkbox={<Checkbox size="md" checked={readAll ? true : readNone ? false : 'indeterminate'} />}
          onClick={() => { const next = !readAll; setChecked((p) => ({ ...p, read: next, 'read-docs': next, 'read-media': next })) }}
        >
          <TreeItem id="read-docs" icon={FileText} label="文件" checkbox={<Checkbox size="md" checked={checked['read-docs']} />} onClick={() => toggle('read-docs')} />
          <TreeItem id="read-media" icon={Image} label="媒體檔案" checkbox={<Checkbox size="md" checked={checked['read-media']} />} onClick={() => toggle('read-media')} />
        </TreeItem>
        <TreeItem
          id="write"
          icon={Folder}
          label="寫入權限"
          checkbox={<Checkbox size="md" checked={writeAll ? true : writeNone ? false : 'indeterminate'} />}
          onClick={() => { const next = !writeAll; setChecked((p) => ({ ...p, write: next, 'write-docs': next, 'write-media': next })) }}
        >
          <TreeItem id="write-docs" icon={FileText} label="文件" checkbox={<Checkbox size="md" checked={checked['write-docs']} />} onClick={() => toggle('write-docs')} />
          <TreeItem id="write-media" icon={Image} label="媒體檔案" checkbox={<Checkbox size="md" checked={checked['write-media']} />} onClick={() => toggle('write-media')} />
        </TreeItem>
      </TreeView>
    </div>
  )
}

export const WithCheckbox: Story = {
  name: '多選',
  render: () => <CheckboxTree />,
}

// ── Long label (wrap test) ──────────────────────────────────────────────

export const LongLabel: Story = {
  name: '長標籤',
  render: () => (
    <div className="flex gap-8 items-start">
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-fg-muted">預設 truncate</span>
        <div className="w-[220px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
          <TreeView aria-label="truncate test" defaultExpandedIds={['proj']}>
            <TreeItem id="proj" icon={Folder} label="這是一個很長的專案名稱會被截斷">
              <TreeItem id="f1" icon={FileText} label="這是一個很長的檔案名稱也會被截斷.tsx" />
              <TreeItem id="f2" icon={FileText} label="短檔名.ts" />
            </TreeItem>
          </TreeView>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-fg-muted">label 換行（移除 truncate）</span>
        <div className="w-[220px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
          <TreeView aria-label="wrap test" defaultExpandedIds={['proj2']}>
            <TreeItem id="proj2" icon={Folder} label={<span className="break-words whitespace-normal">這是一個很長的專案名稱會自然換行到下一行</span>}>
              <TreeItem id="f3" icon={FileText} label={<span className="break-words whitespace-normal">這是一個很長的檔案名稱也會自然換行到下一行顯示完整內容.tsx</span>} />
              <TreeItem id="f4" icon={FileText} label="短檔名.ts" />
            </TreeItem>
          </TreeView>
        </div>
      </div>
    </div>
  ),
}

// ── Drag and Drop (functional — items actually move) ────────────────────

interface DemoNode { id: string; label: string; icon: LucideIcon; children?: DemoNode[] }

function removeNode(nodes: DemoNode[], id: string): [DemoNode[], DemoNode | null] {
  let removed: DemoNode | null = null
  const result = nodes.filter(n => {
    if (n.id === id) { removed = n; return false }
    return true
  }).map(n => {
    if (!n.children) return n
    const [newChildren, found] = removeNode(n.children, id)
    if (found) removed = found
    return { ...n, children: newChildren }
  })
  return [result, removed]
}

function insertNode(nodes: DemoNode[], targetId: string, node: DemoNode, position: 'before' | 'after' | 'inside'): DemoNode[] {
  if (position === 'inside') {
    return nodes.map(n => {
      if (n.id === targetId) return { ...n, children: [...(n.children ?? []), node] }
      if (!n.children) return n
      return { ...n, children: insertNode(n.children, targetId, node, position) }
    })
  }
  const result: DemoNode[] = []
  for (const n of nodes) {
    if (n.id === targetId && position === 'before') result.push(node)
    result.push(n.children ? { ...n, children: insertNode(n.children, targetId, node, position) } : n)
    if (n.id === targetId && position === 'after') result.push(node)
  }
  return result
}

function renderNodes(nodes: DemoNode[]) {
  return nodes.map(n => (
    <TreeItem key={n.id} id={n.id} icon={n.icon} label={n.label}>
      {n.children && n.children.length > 0 && renderNodes(n.children)}
    </TreeItem>
  ))
}

const INITIAL_TREE: DemoNode[] = [
  { id: 'pages', label: 'Pages', icon: Folder, children: [
    { id: 'home', label: 'Home', icon: FileText },
    { id: 'about', label: 'About', icon: FileText },
    { id: 'contact', label: 'Contact', icon: FileText },
  ]},
  { id: 'docs', label: 'Docs', icon: Folder, children: [
    { id: 'intro', label: 'Introduction', icon: FileCode },
    { id: 'guide', label: 'Getting Started', icon: FileCode },
  ]},
  { id: 'settings', label: 'Settings', icon: Settings },
]

export const DragAndDrop: Story = {
  name: '拖曳重排',
  render: () => {
    const [tree, setTree] = React.useState(INITIAL_TREE)
    const [log, setLog] = React.useState<string[]>([])

    return (
      <div className="flex gap-6 items-start">
        <div className="flex flex-col gap-2">
          <p className="text-caption text-fg-muted max-w-xs">
            Figma 風格:整列拖曳,items 真的會移動。拖到其他 node 上方(before) / 下方(after) / 中間(inside 成為子項)。
          </p>
          <div className="w-[280px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
            <TreeView
              aria-label="拖曳排序"
              draggable
              defaultExpandedIds={['pages', 'docs']}
              onDragEnd={(e) => {
                setTree(prev => {
                  const [without, node] = removeNode(prev, e.sourceId)
                  if (!node) return prev
                  return insertNode(without, e.targetId, node, e.position)
                })
                setLog(prev => [`${e.sourceId} → ${e.targetId} (${e.position})`, ...prev].slice(0, 10))
              }}
            >
              {renderNodes(tree)}
            </TreeView>
          </div>
          <button type="button" onClick={() => setTree(INITIAL_TREE)} className="text-caption text-primary hover:underline cursor-pointer self-start">
            重設
          </button>
        </div>
        <div className="w-[240px]">
          <p className="text-caption font-medium text-fg-muted mb-2">移動紀錄</p>
          <div className="flex flex-col gap-1 text-[11px] font-mono text-fg-secondary">
            {log.length === 0 && <span className="text-fg-muted">拖曳 node 後這裡會顯示</span>}
            {log.map((l, i) => <span key={i}>{l}</span>)}
          </div>
        </div>
      </div>
    )
  },
}

// @story-trait-rationale: AllSizes retired per F migration(2026-05-15)— anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。
// ── Indent 結構對齊驗證 ─────────────────────────────────────────────────

export const IndentAlignment: Story = {
  name: '縮排結構對齊驗證',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-h6 font-semibold">indentStep = chevronSize + gap-2</h3>
        <p className="text-caption text-fg-muted max-w-xl">
          子 chevron 應對齊父 icon 的起始位置,子 icon 應對齊父 label 的起始位置。
          這裡混合有 / 無 children 的 node 驗證 chevron placeholder 佔位(leaf 無條件留等寬空白);
          icon 無自動佔位——無 icon 的 node(README.md / public)label 起點前移,屬「Icon 使用策略」
          的混用反例,此處僅作 indent 結構驗證。
        </p>
      </div>
      <div className="w-[300px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
        <TreeView aria-label="專案檔案樹" defaultExpandedIds={['src', 'components', 'public']}>
          <TreeItem id="src" icon={Folder} label="src">
            <TreeItem id="app" icon={FileCode} label="App.tsx" />
            <TreeItem id="readme" label="README.md" />
          </TreeItem>
          <TreeItem id="public" label="public">
            <TreeItem id="favicon" icon={Image} label="favicon.ico" />
          </TreeItem>
          <TreeItem id="components" icon={Folder} label="components">
            <TreeItem id="button" icon={Folder} label="Button">
              <TreeItem id="button-tsx" icon={FileCode} label="Button.tsx" />
              <TreeItem id="button-test" label="Button.test.tsx" />
            </TreeItem>
          </TreeItem>
        </TreeView>
      </div>
    </div>
  ),
}
