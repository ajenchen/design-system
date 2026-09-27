// @story-history: hasInteractiveStates trait — TreeView interactive states(hover / focus / selected / disabled)由 TreeItem 內部處理(spec.md state machine + anatomy StateBehavior story 已 cover),showcase 層 manual Disabled/States story retired per F migration(2026-05-15)— anatomy.stories.tsx auto-compile owns StateBehavior 6-canonical。AllSizes 同理 retired(SizeMatrix anatomy auto-compile owns)。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from '@storybook/test'
import {
  Folder, FileText, FileCode, Image, Settings,
  CheckCircle2, Circle, Minus, MoreVertical, Plus,
  type LucideIcon,
} from 'lucide-react'
import { TreeView, TreeItem } from './tree-view'
import { Button } from '@/design-system/components/Button/button'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'

const meta: Meta = {
  title: 'Design System/Components/TreeView/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '呈現可展開的階層資料，支援選取、鍵盤導覽與拖放重排。資料具有父子關係且使用者需要逐層瀏覽資料夾、文件或分類時使用。' } },
  },
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

// beta.97 直接修改的 TreeItem expand/collapse chevron hover 證據。
// Chevron 是 tabIndex=-1 的視覺件(不在 Tab 路上,也不在方向鍵路上;鍵盤展開收合走 → / ←),因此以 node data id 精準取真實 button。
export const ActionHoverState: Story = {
  name: '展開動作懸停狀態',
  tags: ['test-only'],
  render: () => (
    <div className="w-[300px] overflow-hidden rounded-lg border border-divider bg-surface py-2">
      <TreeView aria-label="專案檔案">
        <TreeItem id="product-roadmap" icon={Folder} label="產品路線圖">
          <TreeItem id="q3-plan" icon={FileText} label="Q3-plan.pdf" />
        </TreeItem>
      </TreeView>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const action = canvasElement.querySelector<HTMLElement>(
      '[data-tree-id="product-roadmap"] button[aria-hidden="true"]',
    )
    if (!action) throw new Error('TreeView 展開動作不存在')
    action.setAttribute('data-visual-hover-target', '')
  },
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

const PERMISSION_GROUPS: Record<string, readonly string[]> = {
  read: ['read-docs', 'read-media'],
  write: ['write-docs', 'write-media'],
}

const CheckboxTree = () => {
  const [selectedIds, setSelectedIds] = React.useState(
    () => new Set(['read', 'read-docs', 'read-media', 'write-docs'])
  )

  const handleSelectedChange = React.useCallback((proposedIds: Set<string>) => {
    setSelectedIds((previousIds) => {
      const nextIds = new Set(proposedIds)
      const changedId = [...new Set([...previousIds, ...proposedIds])]
        .find((id) => previousIds.has(id) !== proposedIds.has(id))

      // 點 parent 時整組 cascade；點 child 時再由 children 真實狀態推導 parent。
      const changedChildren = changedId ? PERMISSION_GROUPS[changedId] : undefined
      if (changedId && changedChildren) {
        for (const childId of changedChildren) {
          if (proposedIds.has(changedId)) nextIds.add(childId)
          else nextIds.delete(childId)
        }
      }

      for (const [parentId, childIds] of Object.entries(PERMISSION_GROUPS)) {
        if (childIds.every((childId) => nextIds.has(childId))) nextIds.add(parentId)
        else nextIds.delete(parentId)
      }
      return nextIds
    })
  }, [])

  // parent 的 indeterminate 邏輯
  const readAll = PERMISSION_GROUPS.read.every((id) => selectedIds.has(id))
  const readSome = PERMISSION_GROUPS.read.some((id) => selectedIds.has(id))
  const writeAll = PERMISSION_GROUPS.write.every((id) => selectedIds.has(id))
  const writeSome = PERMISSION_GROUPS.write.some((id) => selectedIds.has(id))

  return (
    <div>
      <button type="button" className="sr-only">樹狀清單之前</button>
      <div className="w-[300px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
        <TreeView
          selectionMode="multiple"
          aria-label="權限選擇"
          selectedIds={selectedIds}
          onSelectedChange={handleSelectedChange}
          defaultExpandedIds={['read', 'write']}
        >
          <TreeItem
            id="read"
            icon={Folder}
            label="讀取權限"
            checkbox={
              <Checkbox
                size="md"
                checked={readAll ? true : readSome ? 'indeterminate' : false}
                aria-label="讀取權限"
              />
            }
          >
            <TreeItem id="read-docs" icon={FileText} label="文件" />
            <TreeItem id="read-media" icon={Image} label="媒體檔案" />
          </TreeItem>
          <TreeItem
            id="write"
            icon={Folder}
            label="寫入權限"
            checkbox={
              <Checkbox
                size="md"
                checked={writeAll ? true : writeSome ? 'indeterminate' : false}
                aria-label="寫入權限"
              />
            }
          >
            <TreeItem id="write-docs" icon={FileText} label="文件" />
            <TreeItem id="write-media" icon={Image} label="媒體檔案" />
          </TreeItem>
        </TreeView>
      </div>
      <button type="button" className="sr-only">樹狀清單之後</button>
    </div>
  )
}

export const WithCheckbox: Story = {
  name: '多選',
  // 示範焦點是本則的主題(story-rules「示範 = 滑鼠使用者」):不放掉 play 造出的鍵盤焦點
  parameters: { demoFocus: 'keep' },
  render: () => <CheckboxTree />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getByRole('button', { name: '樹狀清單之前' })
    // 2026-09-25 總帳 B9:tree → treegrid,焦點由容器上的虛擬焦點改為列上的 roving tabindex(真焦點)
    const tree = canvas.getByRole('treegrid', { name: '權限選擇' })
    const after = canvas.getByRole('button', { name: '樹狀清單之後' })
    const visualCheckboxes = canvasElement.querySelectorAll('[role="checkbox"]')

    await expect(visualCheckboxes).toHaveLength(6)
    for (const checkbox of visualCheckboxes) {
      await expect(checkbox).toHaveAttribute('aria-hidden', 'true')
      await expect(checkbox).toHaveAttribute('tabindex', '-1')
    }
    // 容器本身不可聚焦 —— 唯一的 Tab 停靠點在列上
    await expect(tree).not.toHaveAttribute('tabindex')

    const readRow = canvasElement.querySelector<HTMLElement>('[data-tree-row="read"]')
    const readDocsRow = canvasElement.querySelector<HTMLElement>('[data-tree-row="read-docs"]')
    if (!readRow || !readDocsRow) throw new Error('TreeView 多選測試節點不存在')

    await userEvent.click(readRow)
    await expect(readRow).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(readDocsRow).toHaveFocus()

    // 離開再回來:落在上次停的那一列;再按一下 Tab 就離開整棵樹
    before.focus()
    await userEvent.tab()
    await expect(readDocsRow).toHaveFocus()
    await userEvent.tab()
    await expect(after).toHaveFocus()
  },
}

// ── Row actions + keyboard route(2026-09-25 總帳 B9)──────────────────
// 列上的「更多動作」「新增頁面」:平常隱藏、滑過或鍵盤焦點在這一列時出現;
// 鍵盤走法 = ↑↓ 換列、→ 進這一列的按鈕、← 回列、Tab 一下離開整棵樹(SSOT:tree-view.spec.md「鍵盤導覽」)。

const RowActionsTree = () => {
  const [lastAction, setLastAction] = React.useState<string | null>(null)
  // 資料夾:⋯ + ＋;檔案:⋯(tree-view.spec.md「Uniform 規則」:⋯ 全部都有、＋ 同類型統一)
  const more = (name: string) => ({ icon: MoreVertical, label: '更多動作', onClick: () => setLastAction(`更多動作 —「${name}」`) })
  const add = (name: string) => ({ icon: Plus, label: '新增頁面', onClick: () => setLastAction(`新增頁面 —「${name}」`) })
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="sr-only">樹狀清單之前</button>
      <div className="w-[320px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
        <TreeView aria-label="產品文件" defaultExpandedIds={['requirements']} defaultSelectedIds={['checkout-prd']}>
          <TreeItem id="requirements" icon={Folder} label="產品需求" inlineActions={[more('產品需求'), add('產品需求')]}>
            <TreeItem id="roadmap" icon={FileText} label="2026 Q4 路線圖" inlineActions={[more('2026 Q4 路線圖')]} />
            <TreeItem id="checkout-prd" icon={FileText} label="付款流程改版 PRD" inlineActions={[more('付款流程改版 PRD')]} />
          </TreeItem>
          <TreeItem id="design" icon={Folder} label="設計交付" inlineActions={[more('設計交付'), add('設計交付')]}>
            <TreeItem id="component-spec" icon={FileText} label="元件規格" inlineActions={[more('元件規格')]} />
          </TreeItem>
          <TreeItem id="meeting-notes" icon={FileText} label="週會紀錄" inlineActions={[more('週會紀錄')]} />
        </TreeView>
      </div>
      <p className="text-caption text-fg-muted" aria-live="polite">
        {lastAction ? `最近一次動作:${lastAction}` : '尚未執行任何動作'}
      </p>
      <button type="button" className="sr-only">樹狀清單之後</button>
    </div>
  )
}

export const RowActions: Story = {
  name: '列上的動作',
  parameters: {
    // play 用鍵盤走完整條路線(story-rules「示範 = 滑鼠使用者」:示範焦點的 story 必須標 keep)
    demoFocus: 'keep',
    docs: {
      description: {
        story:
          '每一列的「更多動作」「新增頁面」平常隱藏,滑過列、或鍵盤焦點在這一列(列本身或列上的按鈕)時出現。' +
          '鍵盤:Tab 進到樹(落在選中的那一列)→ ↑↓ 換列 → → 進這一列的按鈕,→ / ← 在按鈕之間走,第一顆再按 ← 回到列;' +
          '收著的資料夾按 → 先展開,已展開的資料夾再按 → 才進按鈕。不論停在列上或按鈕上,Tab 一下就離開整棵樹 —— 別列的按鈕不在 Tab 路上。',
      },
    },
  },
  render: () => <RowActionsTree />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getByRole('button', { name: '樹狀清單之前' })
    const after = canvas.getByRole('button', { name: '樹狀清單之後' })
    const tree = canvas.getByRole('treegrid', { name: '產品文件' })
    const row = (id: string) => {
      const el = canvasElement.querySelector<HTMLElement>(`[data-tree-row="${id}"]`)
      if (!el) throw new Error(`找不到列 ${id}`)
      return el
    }
    const actionsOf = (id: string) => Array.from(row(id).querySelectorAll<HTMLElement>('[data-tree-actions] button'))

    // 1. Tab 路上只有一站:唯一 tabIndex ≥ 0 的是選中的那一列;列上按鈕全是 -1 而且都有名稱(總帳 B9)
    const stops = Array.from(tree.querySelectorAll<HTMLElement>('[tabindex]')).filter((el) => el.tabIndex >= 0)
    await expect(stops).toEqual([row('checkout-prd')])
    for (const button of tree.querySelectorAll<HTMLElement>('[data-tree-actions] button')) {
      await expect(button).toHaveAttribute('tabindex', '-1')
      await expect(button.getAttribute('aria-label')?.trim()).toBeTruthy()
    }

    // 2. Tab 進來落在選中的列;再按一下 Tab 就離開整棵樹;Shift+Tab 回到同一列
    before.focus()
    await userEvent.tab()
    await expect(row('checkout-prd')).toHaveFocus()
    await userEvent.tab()
    await expect(after).toHaveFocus()
    await userEvent.tab({ shift: true })
    await expect(row('checkout-prd')).toHaveFocus()

    // 3. 葉節點:→ 進這一列唯一的按鈕,再 → 不動;Enter 執行按鈕自己的動作、焦點留在按鈕;Tab 一下離開
    const [prdMore] = actionsOf('checkout-prd')
    await userEvent.keyboard('{ArrowRight}')
    await expect(prdMore).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(prdMore).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByText('最近一次動作:更多動作 —「付款流程改版 PRD」')).toBeInTheDocument()
    await expect(prdMore).toHaveFocus()
    await userEvent.tab()
    await expect(after).toHaveFocus()

    // 4. 回來後 ↑↑ 到展開的資料夾:→ 第一顆、→ 第二顆、→ 不動、← 第一顆、← 回列
    await userEvent.tab({ shift: true })
    await expect(row('checkout-prd')).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    await expect(row('requirements')).toHaveFocus()
    const [folderMore, folderAdd] = actionsOf('requirements')
    await userEvent.keyboard('{ArrowRight}')
    await expect(folderMore).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(folderAdd).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(folderAdd).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(folderMore).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(row('requirements')).toHaveFocus()

    // 5. 列上 ← / → 維持樹的語意(收合、再展開,焦點不離開這一列);按鈕上 ↓ 換到下一列
    await userEvent.keyboard('{ArrowLeft}')
    await expect(row('requirements')).toHaveAttribute('aria-expanded', 'false')
    await userEvent.keyboard('{ArrowRight}')
    await expect(row('requirements')).toHaveAttribute('aria-expanded', 'true')
    await expect(row('requirements')).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    await expect(row('roadmap')).toHaveFocus()

    // 收尾:焦點放回樹外(sr-only 哨兵),畫面回到滑鼠使用者看到的樣子
    after.focus()
  },
}

// ── Long label (wrap test) ──────────────────────────────────────────────

export const LongLabel: Story = {
  name: '長標籤',
  render: () => (
    <div className="flex gap-8 items-start">
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-fg-muted">預設 truncate</span>
        <div className="w-[220px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
          <TreeView aria-label="產品設計檔案樹（截斷）" defaultExpandedIds={['proj']}>
            <TreeItem id="proj" icon={Folder} label="2026 產品品牌識別設計提案">
              <TreeItem id="f1" icon={FileText} label="首頁主視覺設計稿-桌面版-v3.fig" />
              <TreeItem id="f2" icon={FileText} label="logo.svg" />
            </TreeItem>
          </TreeView>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-fg-muted">label 換行（移除 truncate）</span>
        <div className="w-[220px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
          <TreeView aria-label="產品設計檔案樹（換行）" defaultExpandedIds={['proj2']}>
            <TreeItem id="proj2" icon={Folder} label={<span className="break-words whitespace-normal">2026 產品品牌識別設計提案完整版</span>}>
              <TreeItem id="f3" icon={FileText} label={<span className="break-words whitespace-normal">首頁主視覺設計稿-桌面版與行動版對照-v3-最終定稿.fig</span>} />
              <TreeItem id="f4" icon={FileText} label="logo.svg" />
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
            鍵盤同樣可重排:Tab 聚焦樹、↑↓ 移到目標後,Cmd/Ctrl+Shift+↑↓ 同層移動、→ 移入資料夾、← 移出到上層(每按一下立即生效,結果會播報給螢幕閱讀器)。
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
          {/* 2026-09-25:原本是手刻的原生按鈕元素(展示層禁原生控件,story-rules「禁止」);單獨的輔助動作一律 tertiary(button.spec.md Variant 表) */}
          <Button variant="tertiary" size="sm" className="self-start" onClick={() => setTree(INITIAL_TREE)}>
            重設
          </Button>
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

// @story-history: AllSizes retired per F migration(2026-05-15)— anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。
// @story-history: IndentAlignment retired per Dim 24 dedup(2026-07-17)— indentStep=chevronSize+gap-2 幾何三重重複(showcase / anatomy IndentMatrix / principles IndentRule)。geometry 歸 anatomy.stories.tsx IndentMatrix、縮排原則 + icon 混用反例(唯一在此的內容)已遷入 principles.stories.tsx IndentRule;showcase 層不重複教 geometry(同 AllSizes / States 退役先例)。
