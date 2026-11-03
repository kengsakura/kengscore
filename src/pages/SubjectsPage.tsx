import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpen, ClipboardCheck, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { qk, useClassrooms, useStudents, useSubjects } from '@/hooks/queries'
import { getApi } from '@/lib/api'
import type { Classroom, Subject } from '@/lib/api/types'
import { normalizeGrade } from '@/lib/csv'
import { classroomLabel, cn, errorMessage, fmtScore, parseNumber, termLongLabel } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { Card, Menu, PageHeader, SUBJECT_COLORS, subjectColor } from '@/components/ui/Misc'
import { Modal, useConfirm } from '@/components/ui/Modal'

export default function SubjectsPage() {
  const { term } = useApp()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const subjectsQ = useSubjects(term.id)
  const classroomsQ = useClassrooms(term.id)
  const studentsQ = useStudents(term.id)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Subject | undefined>()

  if (subjectsQ.isPending || classroomsQ.isPending) return <PageLoader />
  const subjects = subjectsQ.data ?? []
  const classrooms = classroomsQ.data ?? []
  const students = studentsQ.data ?? []

  async function remove(s: Subject) {
    const ok = await confirm({
      title: `ลบรายวิชา ${s.code} ${s.name}?`,
      message: 'งานและคะแนนทั้งหมดของรายวิชานี้จะถูกลบ และกู้คืนไม่ได้',
      confirmText: 'ลบรายวิชา',
      danger: true,
      typeToConfirm: s.code || s.name,
    })
    if (!ok) return
    try {
      await getApi().deleteSubject(s.id)
      await qc.invalidateQueries({ queryKey: qk.subjects(term.id) })
      toast.success('ลบรายวิชาแล้ว')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const openForm = (s?: Subject) => {
    setEditing(s)
    setOpen(true)
  }

  return (
    <>
      <PageHeader
        title="รายวิชาและห้อง"
        subtitle={termLongLabel(term)}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openForm()}>
            เพิ่มรายวิชา
          </Button>
        }
      />
      {subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="ยังไม่มีรายวิชา"
          description="เพิ่มรายวิชาที่สอนในภาคเรียนนี้ แล้วเลือกห้องที่สอนวิชานั้น"
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openForm()}>
              เพิ่มรายวิชา
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {subjects.map((s) => {
            const color = subjectColor(s.color)
            const rooms = classrooms.filter((c) => s.classroom_ids.includes(c.id))
            const n = students.filter((st) => s.classroom_ids.includes(st.classroom_id)).length
            return (
              <Card key={s.id} className="overflow-visible">
                <div className={cn('h-1.5 rounded-t-2xl bg-gradient-to-r', color.strip)} />
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', color.soft, color.text)}>
                      <BookOpen className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-500">{s.code || 'ไม่มีรหัสวิชา'}</div>
                      <h3 className="truncate font-semibold text-slate-900">{s.name}</h3>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {rooms.length} ห้อง · {n} คน{s.full_score ? ` · คะแนนเก็บ ${fmtScore(s.full_score)}` : ''}
                      </div>
                    </div>
                    <Menu
                      items={[
                        { label: 'แก้ไข / จับคู่ห้อง', icon: <Pencil />, onClick: () => openForm(s) },
                        { label: 'ลบรายวิชา', icon: <Trash2 />, danger: true, onClick: () => remove(s) },
                      ]}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {rooms.length === 0 ? (
                      <button type="button" onClick={() => openForm(s)} className="text-sm font-medium text-indigo-600 hover:underline">
                        + เลือกห้องที่สอน
                      </button>
                    ) : (
                      rooms.map((r) => (
                        <Link
                          key={r.id}
                          to={`/scores/${s.id}/${r.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200 ring-inset hover:bg-indigo-50 hover:text-indigo-700 hover:ring-indigo-200"
                        >
                          <ClipboardCheck className="size-3.5" />
                          {classroomLabel(r)}
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขรายวิชา' : 'เพิ่มรายวิชา'} size="md">
        {open && <SubjectForm subject={editing} classrooms={classrooms} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  )
}

function SubjectForm({ subject, classrooms, onDone }: { subject?: Subject; classrooms: Classroom[]; onDone: () => void }) {
  const { term } = useApp()
  const qc = useQueryClient()
  const [code, setCode] = useState(subject?.code ?? '')
  const [name, setName] = useState(subject?.name ?? '')
  const [color, setColor] = useState(subject?.color ?? 'indigo')
  const [full, setFull] = useState(subject?.full_score != null ? String(subject.full_score) : '')
  const [rooms, setRooms] = useState<Set<string>>(new Set(subject?.classroom_ids ?? []))
  const [newGrade, setNewGrade] = useState('')
  const [newRoom, setNewRoom] = useState('')
  const [busy, setBusy] = useState(false)

  const grades = [...new Set(classrooms.map((c) => c.grade))]

  async function addRoom() {
    if (!newGrade.trim() || !newRoom.trim()) return
    try {
      const [c] = await getApi().createClassrooms([{ term_id: term.id, grade: normalizeGrade(newGrade), room: newRoom.trim() }])
      await qc.invalidateQueries({ queryKey: qk.classrooms(term.id) })
      setRooms((r) => new Set(r).add(c.id))
      setNewRoom(/^\d+$/.test(newRoom) ? String(Number(newRoom) + 1) : '')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast.error('กรอกชื่อวิชา')
    const fullScore = full.trim() ? parseNumber(full) : null
    if (full.trim() && (fullScore == null || fullScore <= 0)) return toast.error('คะแนนเก็บต้องเป็นตัวเลขมากกว่า 0')
    setBusy(true)
    try {
      const payload = {
        term_id: term.id,
        code: code.trim(),
        name: name.trim(),
        color,
        full_score: fullScore,
        classroom_ids: [...rooms],
      }
      if (subject) await getApi().updateSubject(subject.id, payload)
      else await getApi().createSubject(payload)
      await qc.invalidateQueries({ queryKey: qk.subjects(term.id) })
      toast.success(subject ? 'บันทึกแล้ว' : `เพิ่ม ${payload.name} แล้ว`)
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <Field label="รหัสวิชา">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ว21102" />
        </Field>
        <Field label="ชื่อวิชา">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="วิทยาศาสตร์ 2" required autoFocus />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="สี">
          <div className="flex flex-wrap gap-2">
            {Object.entries(SUBJECT_COLORS).map(([k, v]) => (
              <button
                key={k}
                type="button"
                aria-label={k}
                onClick={() => setColor(k)}
                className={cn('size-8 rounded-full ring-offset-2 transition', v.dot, color === k ? 'ring-2 ring-slate-900' : 'hover:scale-110')}
              />
            ))}
          </div>
        </Field>
        <Field label="คะแนนเก็บเต็ม (ไม่บังคับ)" hint="เช่น 70 — หน้าคะแนนรวมจะแปลงคะแนนเป็นสัดส่วนนี้ให้">
          <Input inputMode="decimal" value={full} onChange={(e) => setFull(e.target.value)} placeholder="เช่น 70" />
        </Field>
      </div>
      <Field label={`ห้องที่สอน (${rooms.size})`}>
        {classrooms.length === 0 ? (
          <p className="text-sm text-slate-500">ยังไม่มีห้องเรียน — เพิ่มด้านล่าง หรือนำเข้านักเรียนก่อน</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {classrooms.map((c) => (
              <label
                key={c.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ring-1 ring-inset select-none',
                  rooms.has(c.id) ? 'bg-indigo-50 text-indigo-800 ring-indigo-200' : 'text-slate-600 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <input
                  type="checkbox"
                  className="accent-indigo-600"
                  checked={rooms.has(c.id)}
                  onChange={(e) => {
                    const next = new Set(rooms)
                    if (e.target.checked) next.add(c.id)
                    else next.delete(c.id)
                    setRooms(next)
                  }}
                />
                {classroomLabel(c)}
              </label>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Input list="subject-grade-list" value={newGrade} onChange={(e) => setNewGrade(e.target.value)} placeholder="ชั้น" className="h-9 w-24" />
          <datalist id="subject-grade-list">
            {grades.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <Input
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addRoom()
              }
            }}
            placeholder="ห้อง"
            className="h-9 w-20"
          />
          <Button size="sm" icon={<Plus className="size-4" />} onClick={addRoom}>
            เพิ่มห้อง
          </Button>
        </div>
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onDone}>ยกเลิก</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {subject ? 'บันทึก' : 'เพิ่มรายวิชา'}
        </Button>
      </div>
    </form>
  )
}
