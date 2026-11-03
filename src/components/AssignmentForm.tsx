import { useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useApp } from '@/context/AppContext'
import { qk } from '@/hooks/queries'
import { getApi } from '@/lib/api'
import type { Assignment, LatePolicy } from '@/lib/api/types'
import { describePolicy, normalizePolicy } from '@/lib/scoring'
import { cn, errorMessage, parseNumber, suggestTitle, todayISO } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { LatePolicyForm } from './LatePolicyForm'

export function AssignmentFormModal({
  open,
  onClose,
  subjectId,
  assignment,
  existing,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  subjectId: string
  assignment?: Assignment
  existing: Assignment[]
  onSaved?: (a: Assignment) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={assignment ? 'แก้ไขงาน' : 'สร้างงานใหม่'} size="lg">
      {open && <AssignmentForm subjectId={subjectId} assignment={assignment} existing={existing} onDone={onClose} onSaved={onSaved} />}
    </Modal>
  )
}

function AssignmentForm({
  subjectId,
  assignment,
  existing,
  onDone,
  onSaved,
}: {
  subjectId: string
  assignment?: Assignment
  existing: Assignment[]
  onDone: () => void
  onSaved?: (a: Assignment) => void
}) {
  const { settings } = useApp()
  const qc = useQueryClient()
  const categories = useMemo(() => {
    const set = new Set(settings.categories)
    existing.forEach((a) => set.add(a.category))
    return [...set]
  }, [settings.categories, existing])
  const lastMax = (cat: string) => [...existing].reverse().find((a) => a.category === cat)?.max_score

  const initialCategory = assignment?.category ?? categories[1] ?? categories[0] ?? 'ใบงาน'
  const [category, setCategory] = useState(initialCategory)
  const [custom, setCustom] = useState('')
  const [title, setTitle] = useState(
    assignment?.title ?? suggestTitle(initialCategory, existing.filter((a) => a.category === initialCategory).map((a) => a.title)),
  )
  const [titleTouched, setTitleTouched] = useState(!!assignment)
  const [max, setMax] = useState(String(assignment?.max_score ?? lastMax(initialCategory) ?? 10))
  const [due, setDue] = useState(assignment?.due_date ?? todayISO())
  const [customPolicy, setCustomPolicy] = useState(!!assignment?.late_policy)
  const [policy, setPolicy] = useState<LatePolicy>(normalizePolicy(assignment?.late_policy ?? settings.late_policy))
  const [busy, setBusy] = useState(false)

  const effectiveCategory = category === '__custom' ? custom.trim() : category

  function pickCategory(c: string) {
    setCategory(c)
    if (c === '__custom') return
    if (!titleTouched) setTitle(suggestTitle(c, existing.filter((a) => a.category === c).map((a) => a.title)))
    const m = lastMax(c)
    if (!assignment && m) setMax(String(m))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const maxScore = parseNumber(max)
    if (!effectiveCategory) return toast.error('ระบุประเภทงาน')
    if (!title.trim()) return toast.error('ระบุชื่องาน')
    if (maxScore == null || maxScore <= 0) return toast.error('คะแนนเต็มต้องมากกว่า 0')
    setBusy(true)
    try {
      const api = getApi()
      const payload = {
        subject_id: subjectId,
        category: effectiveCategory,
        title: title.trim(),
        max_score: maxScore,
        due_date: due || todayISO(),
        late_policy: customPolicy ? policy : null,
      }
      let saved: Assignment
      if (assignment) {
        await api.updateAssignment(assignment.id, payload)
        saved = { ...assignment, ...payload }
      } else {
        saved = await api.createAssignment(payload)
      }
      await qc.invalidateQueries({ queryKey: qk.assignments(subjectId) })
      toast.success(assignment ? 'บันทึกการแก้ไขแล้ว' : `สร้าง "${saved.title}" แล้ว`)
      onDone()
      onSaved?.(saved)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="ประเภทงาน">
        <div className="flex flex-wrap gap-2">
          {[...categories, '__custom'].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pickCategory(c)}
              className={cn(
                'h-9 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors',
                category === c ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {c === '__custom' ? '+ อื่น ๆ' : c}
            </button>
          ))}
        </div>
        {category === '__custom' && (
          <Input className="mt-2" autoFocus placeholder="เช่น รายงาน, การบ้าน, โครงงาน" value={custom} onChange={(e) => setCustom(e.target.value)} />
        )}
      </Field>

      <Field label="ชื่องาน" htmlFor="title">
        <Input
          id="title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setTitleTouched(true)
          }}
          placeholder="เช่น ใบงานที่ 1 เรื่องเซลล์"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="คะแนนเต็ม" htmlFor="max">
          <div className="flex gap-2">
            <Input id="max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} className="w-24" required />
            <div className="flex gap-1.5">
              {[5, 10, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMax(String(n))}
                  className={cn(
                    'h-10 w-11 rounded-xl text-sm font-medium ring-1 ring-inset',
                    max === String(n) ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'text-slate-600 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </Field>
        <Field label="กำหนดส่ง" htmlFor="due" hint="แต่ละห้องปรับวันกำหนดส่งเองได้ในหน้ากรอกคะแนน">
          <Input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
        </Field>
      </div>

      <div className="rounded-2xl ring-1 ring-slate-200 ring-inset">
        <label className="flex cursor-pointer items-start gap-3 p-4">
          <input
            type="checkbox"
            className="mt-0.5 size-4.5 accent-indigo-600"
            checked={customPolicy}
            onChange={(e) => setCustomPolicy(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium">กำหนดการหักคะแนนส่งช้าเฉพาะงานนี้</span>
            <span className="block text-xs text-slate-500">
              {customPolicy ? 'ตั้งค่าด้านล่าง' : `ใช้ค่าเริ่มต้น: ${describePolicy(settings.late_policy)}`}
            </span>
          </span>
        </label>
        {customPolicy && (
          <div className="border-t border-slate-100 p-4">
            <LatePolicyForm value={policy} onChange={setPolicy} />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onDone}>ยกเลิก</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {assignment ? 'บันทึก' : 'สร้างงาน'}
        </Button>
      </div>
    </form>
  )
}
