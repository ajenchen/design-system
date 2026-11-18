# 參考程式碼：Batch import 對話框（原型）

原型的實作，供 DS 實作時參考。`matchAs`、`splitTokens`、`ListKindField`、`FormField`、`PAvatar`、`L`／`tx`（中英文字）是原型自己的工具，不屬於 DS。

```tsx
// Batch import (2026-11-18: proposal A, tags like an email "To" field, replacing the verify-on-Add compromise), shared
// by the send flow (and the Detail modal's audience) and the Audience group editor.
// Large (2026-11-18): lists can run to thousands (sign-up lists for staff events), so the dialog is 1120 wide and fills
// the window's height (DS height="fill": it doesn't jump as tags are added); the list field takes the rest and scrolls.
//   1. Choose the data type, then paste or type into the field: each entry becomes a tag as soon as it's entered
//      (Enter, a comma, a new line, or a paste of a whole list) and is looked up right away.
//   2. Found: a gray tag with the person's avatar and name (an org or outside contact: its icon and value).
//      Not found: a red tag with what was entered, listed before the gray ones; hover for why. Any tag, gray or red, is edited in place when clicked
//      (it shows what was entered; Enter looks it up again). Every tag has ✕. Entries twice in the list, or already added, aren't shown (with many repeats it looked messy).
//      Once there are tags, the hint counts the valid ones: "{n} valid audiences. Click a tag to edit it." (no summary tags)
//   3. Proceed adds the found ones; red ones are left out (the toast says how many).
// The DS Tag has no editable state yet (the DS owner hasn't designed one): editing swaps the tag for a small DS Input.
import * as React from 'react'
import { Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Tag, Tooltip, TooltipContent, TooltipTrigger, cn } from '@qijenchen/design-system'
import { Building2, Mail, Phone } from 'lucide-react'
import { PMAP, matchAs, splitTokens, type ListKind, type Match, type Tag as RTag } from '../lib/data'
import { L, tx } from '../lib/i18n'
import { FormField, ListKindField, PAvatar, listKindExample, pname } from './ui'

export type ImportOk = { i: number; v: string; mm: Match; tag: RTag }
type Opts = { allowExt?: boolean; noExtEmail?: boolean; noExtPhone?: boolean }
// one entry as shown: found (ok) or not (why)
type Hit = { i: number; v: string; ok?: ImportOk; why?: string }

// noun: what is added ('audience' in the send flow, 'member' in a group); has: already added
export function BatchImportDialog({ open, onClose, onAdd, has, opts, noun = 'audience' }: {
  open: boolean; onClose: () => void; onAdd: (ok: ImportOk[], left: number) => void; has: (key: string) => boolean; opts: Opts; noun?: 'audience' | 'member'
}) {
  const [kind, setKind] = React.useState<ListKind | null>(null)
  const [vals, setVals] = React.useState<string[]>([]), [draft, setDraft] = React.useState('')
  const [edit, setEdit] = React.useState<{ i: number; v: string } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => { if (open) { setKind(null); setVals([]); setDraft(''); setEdit(null) } }, [open])

  // look every entry up (the prototype's matching stands in for the server); repeats and ones already added drop out
  const hits: Hit[] = []
  if (kind) {
    const seen: Record<string, boolean> = {}
    vals.forEach((v, i) => {
      const mm = matchAs(v, kind, opts)
      if (mm.kind === 'one' || mm.kind === 'org' || mm.kind === 'ext') {
        const tag: RTag = mm.kind === 'one' ? { key: 'p:' + mm.p.id, type: 'person', id: mm.p.id } : mm.kind === 'org' ? { key: 'o:' + mm.org.code, type: 'org', id: mm.org.code } : { key: 'e:' + mm.email, type: 'ext', email: mm.email }
        if (seen[tag.key] || has(tag.key)) return
        seen[tag.key] = true; hits.push({ i, v, ok: { i, v, mm, tag } })
      } else {
        const k = 'x:' + v.toLowerCase()
        if (seen[k]) return
        seen[k] = true; hits.push({ i, v, why: mm.kind === 'miss' ? mm.why : 'More than one match' })
      }
    })
  }
  const found = hits.filter(h => h.ok).map(h => h.ok!), bad = hits.filter(h => h.why)
  // red tags first (2026-11-18): in a list of thousands the few to fix are at the top; fixed ones join the gray ones
  const shown = bad.concat(hits.filter(h => h.ok))

  const take = (t: string) => { const l = splitTokens(t).map(x => x.trim()).filter(Boolean); if (l.length) setVals(v => v.concat(l)); setDraft('') }
  const drop = (i: number) => setVals(l => l.filter((_, j) => j !== i))
  const saveEdit = () => { if (!edit) return; const l = splitTokens(edit.v).map(x => x.trim()).filter(Boolean); setVals(v => { const n = v.slice(); n.splice(edit.i, 1, ...l); return n }); setEdit(null); setTimeout(() => inputRef.current && inputRef.current.focus(), 0) }
  const word = noun === 'member' ? L('members', '位成員') : L('audiences', '位收件人')

  // every tag, gray or red, opens for editing when clicked (2026-11-18); its ✕ only removes it
  const editable = (h: Hit, name: string) => ({
    role: 'button', tabIndex: 0, className: 'cursor-text',
    'aria-label': L('Edit ', '修改 ') + name + (h.why ? ': ' + tx(h.why) : ''),
    onClick: (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('button')) setEdit({ i: h.i, v: h.v }) },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setEdit({ i: h.i, v: h.v }) } },
  })
  const label = (h: Hit) => {
    const t = h.ok!.tag
    // a person: the DS Tag with an avatar and the name (the DS PersonAvatarTag shows the avatar only)
    if (t.type === 'person') { const p = PMAP[t.id!]; return <Tag unbounded avatar={<PAvatar p={p} size={16} />} {...editable(h, pname(p))} onRemove={() => drop(h.i)} removeAriaLabel={pname(p)}>{pname(p)}</Tag> }
    const phone = t.type === 'ext' && t.email!.indexOf('@') < 0, name = (t.type === 'org' ? t.id : t.email) || ''
    return <Tag icon={t.type === 'org' ? Building2 : phone ? Phone : Mail} {...editable(h, name)} onRemove={() => drop(h.i)} removeAriaLabel={name}>{name}</Tag>
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      {open ? (
        <DialogContent maxWidth={1120} height="fill" onEscapeKeyDown={e => { if (edit) { e.preventDefault(); setEdit(null) } }}>
          <DialogHeader><DialogTitle>{L('Batch import', '批次匯入')}</DialogTitle><DialogDescription className="sr-only">{L('Batch import', '批次匯入')}</DialogDescription></DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-[var(--layout-space-tight)]">
              <ListKindField id="imp-kind" value={kind} onChange={k => { setKind(k); setEdit(null) }} />
              <FormField id="imp-text" label={L('List', '名單')} hint={hits.length ? L(found.length + ' valid ' + (found.length === 1 ? word.replace(/s$/, '') : word) + '. Click a tag to edit it.', found.length + ' ' + word + '有效。點標籤可以修改。') : L('Separate with commas or new lines.', '用逗號或換行分隔。')}>
                {/* the DS field frame (border, hover, focus), holding DS Tags and a bare input for the next entry */}
                <div className={cn('flex h-[calc(100svh-384px)] min-h-[200px] w-full flex-wrap content-start items-center gap-1 overflow-y-auto rounded-md border px-[var(--field-px)] py-[var(--field-control-py-md)]',
                  kind ? 'cursor-text border-border bg-surface hover:border-border-hover focus-within:!border-primary' : 'cursor-not-allowed border-transparent bg-disabled')}
                  onClick={e => { if (e.target === e.currentTarget && inputRef.current) inputRef.current.focus() }}>
                  {shown.map(h => edit && edit.i === h.i
                      ? <div key={h.i} className="w-48"><Input size="sm" autoFocus aria-label={L('Edit ', '修改 ') + h.v} value={edit.v} onChange={e => setEdit({ i: h.i, v: e.target.value })}
                          onBlur={saveEdit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } if (e.key === 'Escape') { e.stopPropagation(); setEdit(null) } }} /></div>
                      : h.ok ? <React.Fragment key={h.i}>{label(h)}</React.Fragment> : (
                        <Tooltip key={h.i}>
                          <TooltipTrigger asChild>
                            <Tag color="red" {...editable(h, h.v)} onRemove={() => drop(h.i)} removeAriaLabel={h.v}>{h.v}</Tag>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" align="start">{tx(h.why!)}</TooltipContent>
                        </Tooltip>
                      ))}
                  <input ref={inputRef} id="imp-text" disabled={!kind} className="min-w-[200px] flex-1 bg-transparent py-0.5 text-body outline-none placeholder:text-fg-muted disabled:cursor-not-allowed"
                    placeholder={!kind ? L('Choose a data type first', '請先選擇資料類型') : vals.length ? '' : L('e.g. ', '例如：') + listKindExample(kind)}
                    value={draft} onChange={e => (/[\n,，;；]/.test(e.target.value) ? take(e.target.value) : setDraft(e.target.value))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); take(draft) }
                      else if (e.key === 'Backspace' && !draft && shown.length) drop(shown[shown.length - 1].i)
                    }}
                    onBlur={() => take(draft)} onPaste={e => { e.preventDefault(); take(draft + e.clipboardData.getData('text')) }} />
                </div>
              </FormField>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="tertiary" onClick={onClose}>{L('Cancel', '取消')}</Button>
            {/* adds the found ones; the red ones are left out */}
            <Button variant="primary" disabled={!found.length || !!edit} aria-label={L('Proceed: add ' + found.length + ' ' + word, '繼續：加入 ' + found.length + ' ' + word)} onClick={() => onAdd(found, bad.length)}>{L('Proceed', '繼續')}</Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
```
