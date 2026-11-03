import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { qk } from '@/hooks/queries'
import { getApi } from '@/lib/api'
import type { Assignment, ScoreGroup } from '@/lib/api/types'
import { cn, errorMessage, fmtDateShort, fmtScore, parseNumber } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { Modal, useConfirm } from '@/components/ui/Modal'

/** จัดการ "กลุ่มคะแนน": รวมคะแนนเก็บย่อยหลายงานเป็นคะแนนหลักก้อนเดียว */
export function ScoreGroupsModal({
  open,
  onClose,
  subjectId,
  assignments,
  groups,
}: {
  open: boolean
  onClose: () => void
  subjectId: string
  assignments: Assignment[]
  groups: ScoreGroup[]
}) {
  const [editing, setEditing] = useState<ScoreGroup | 'new' | null>(null)
  const qc = useQueryClient()
  const confirm = useConfirm()

  const close = () => {
    setEditing(null)
    onClose()
  }
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.groups(subjectId) }),
      qc.invalidateQueries({ queryKey: qk.assignments(subjectId) }),
      qc.invalidateQueries({ queryKey: ['termAssignments'] }),
    ])

  async function remove(g: ScoreGroup) {
    const ok = await confirm({
      title: `ยกเลิกกลุ่ม "${g.name}"?`,
      message: 'งานในกลุ่มจะกลับเป็นงานเดี่ยว คะแนนที่กรอกไว้ไม่หาย',
      confirmText: 'ยกเลิกกลุ่ม',
      danger: true,
    })
    if (!ok) return
    try {
      await getApi().deleteGroup(g.id)
      await refresh()
      toast.success('ยกเลิกกลุ่มแล้ว')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={editing ? (editing === 'new' ? 'รวมคะแนนเป็นกลุ่มใหม่' : `แก้ไขกลุ่ม "${editing.name}"`) : 'รวมคะแนนย่อยเป็นคะแนนหลัก'}
      description={
        editing
          ? 'คะแนนกลุ่ม = (ผลรวมคะแนนที่ได้ ÷ ผลรวมคะแนนเต็ม) × คะแนนเต็มของกลุ่ม · งานที่ไม่ส่งนับเป็น 0'
          : 'เช่น รวม สมุด 1–10 เป็น "สมุด (ก่อนกลางภาค)" เต็ม 20 · คะแนนย่อยยังอยู่ครบ ดูได้ที่มุมมอง "รายงาน"'
      }
    >
      {editing ? (
        <GroupForm
          key={editing === 'new' ? 'new' : editing.id}
          subjectId={subjectId}
          group={editing === 'new' ? undefined : editing}
          assignments={assignments}
          groups={groups}
          onDone={async () => {
            await refresh()
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="space-y-3">
          {groups.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              <Layers className="mx-auto mb-2 size-8 text-slate-300" />
              ยังไม่มีกลุ่มคะแนน
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {groups.map((g) => {
                const members = assignments.filter((a) => a.group_id === g.id)
                const sumMax = members.reduce((n, a) => n + a.max_score, 0)
                return (
                  <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {g.name} <span className="text-slate-400">· เต็ม {fmtScore(g.max_score)}</span>
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {members.length} งาน (เต็มรวม {fmtScore(sumMax)}) · {members.map((a) => a.title).join(', ') || 'ยังไม่มีงาน'}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(g)}>
                      แก้ไข
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => remove(g)} aria-label="ยกเลิกกลุ่ม" />
                  </li>
                )
              })}
            </ul>
          )}
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')} disabled={assignments.length === 0}>
            สร้างกลุ่มคะแนน
          </Button>
        </div>
      )}
    </Modal>
  )
}

function GroupForm({
  subjectId,
  group,
  assignments,
  groups,
  onDone,
  onCancel,
}: {
  subjectId: string
  group?: ScoreGroup
  assignments: Assignment[]
  groups: ScoreGroup[]
  onDone: () => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group ? assignments.filter((a) => a.group_id === group.id).map((a) => a.id) : []),
  )
  const [name, setName] = useState(group?.name ?? '')
  const [max, setMax] = useState(group ? String(group.max_score) : '')
  const [busy, setBusy] = useState(false)
  const groupName = new Map(groups.map((g) => [g.id, g.name]))

  const byCategory = useMemo(() => {
    const m = new Map<string, Assignment[]>()
    for (const a of assignments) m.set(a.category, [...(m.get(a.category) ?? []), a])
    return [...m]
  }, [assignments])

  const chosen = assignments.filter((a) => selected.has(a.id))
  const sumMax = chosen.reduce((n, a) => n + a.max_score, 0)
  const maxNum = parseNumber(max)

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
      return next
    })

  async function save() {
    if (!name.trim()) return toast.error('ตั้งชื่อกลุ่มก่อน')
    if (maxNum == null || maxNum <= 0) return toast.error('ใส่คะแนนเต็มของกลุ่ม')
    if (chosen.length === 0) return toast.error('เลือกงานอย่างน้อย 1 งาน')
    setBusy(true)
    try {
      await getApi().saveGroup({ subject_id: subjectId, name: name.trim(), max_score: maxNum, assignment_ids: [...selected] }, group?.id)
      toast.success(group ? 'แก้ไขกลุ่มแล้ว' : 'สร้างกลุ่มแล้ว')
      onDone()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Field label="ชื่อกลุ่ม">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สมุด (ก่อนกลางภาค)" autoFocus />
        </Field>
        <Field label="คะแนนเต็ม">
          <Input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder={sumMax ? fmtScore(sumMax) : '20'} />
        </Field>
      </div>

      <div className="space-y-3">
        {byCategory.map(([category, items]) => {
          const ids = items.map((a) => a.id)
          const all = ids.every((id) => selected.has(id))
          return (
            <div key={category} className="rounded-xl ring-1 ring-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-sm font-semibold text-indigo-700">{category}</span>
                <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => toggle(ids, !all)}>
                  {all ? 'ไม่เลือกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
              </div>
              <div className="divide-y divide-slate-50">
                {items.map((a) => {
                  const other = a.group_id && a.group_id !== group?.id ? groupName.get(a.group_id) : undefined
                  return (
                    <label key={a.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="size-4 accent-indigo-600"
                        checked={selected.has(a.id)}
                        onChange={(e) => toggle([a.id], e.target.checked)}
                      />
                      <span className="min-w-0 flex-1 truncate">{a.title}</span>
                      {other && <span className={cn('text-xs', selected.has(a.id) ? 'text-amber-600' : 'text-slate-400')}>{selected.has(a.id) ? `ย้ายจาก "${other}"` : `อยู่ใน "${other}"`}</span>}
                      <span className="tabular text-xs text-slate-400">
                        {fmtDateShort(a.due_date)} · /{fmtScore(a.max_score)}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
        เลือก {chosen.length} งาน เต็มรวม <b>{fmtScore(sumMax)}</b> → แปลงเป็นเต็ม <b>{maxNum ? fmtScore(maxNum) : '?'}</b>
        {sumMax > 0 && maxNum ? (
          <span className="text-indigo-700"> (เช่น ได้ {fmtScore(sumMax / 2)} → {fmtScore(Math.round((maxNum / 2) * 100) / 100)})</span>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>ย้อนกลับ</Button>
        <Button variant="primary" loading={busy} onClick={save}>
          บันทึกกลุ่ม
        </Button>
      </div>
    </div>
  )
}
