import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudCheck,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import {
  qk,
  useAssignments,
  useClassrooms,
  useDeleteSubmissions,
  useDueDates,
  useRoomStudents,
  useRoomSubmissions,
  useSaveSubmissions,
  useSubjects,
} from '@/hooks/queries'
import { getApi } from '@/lib/api'
import type { DueDate, ISODate, LatePolicy, Student, Submission, SubmissionInput } from '@/lib/api/types'
import { computeScore, describePolicy, effectivePolicy, type ScoreResult } from '@/lib/scoring'
import {
  classroomLabel,
  cn,
  errorMessage,
  fmtDateShort,
  fmtDateWeekday,
  fmtScore,
  parseNumber,
  studentName,
  todayISO,
} from '@/lib/utils'
import { AssignmentFormModal } from '@/components/AssignmentForm'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Form'
import { Badge, Card, Menu, PageHeader, ProgressBar, Segmented } from '@/components/ui/Misc'
import { useConfirm } from '@/components/ui/Modal'
import NotFoundPage from './NotFoundPage'

type Filter = 'all' | 'missing' | 'done' | 'late'

export default function EntryPage() {
  const { subjectId = '', classroomId = '', assignmentId = '' } = useParams()
  const { term, settings } = useApp()
  const confirm = useConfirm()
  const qc = useQueryClient()

  const subjectsQ = useSubjects(term.id)
  const classroomsQ = useClassrooms(term.id)
  const studentsQ = useRoomStudents(term.id, classroomId)
  const assignmentsQ = useAssignments(subjectId)
  const dueDatesQ = useDueDates(subjectId)
  const subsQ = useRoomSubmissions(subjectId, classroomId, studentsQ.data, studentsQ.isSuccess)
  const save = useSaveSubmissions(subjectId, classroomId)
  const del = useDeleteSubmissions(subjectId, classroomId)
  const saving = useIsMutating() > 0

  const [entryDate, setEntryDate] = useState<ISODate>(todayISO)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [sticky, setSticky] = useState<Set<string>>(() => new Set())
  const [editOpen, setEditOpen] = useState(false)
  const inputs = useRef(new Map<string, HTMLInputElement>())

  // แถวที่เพิ่งแก้ไขยังคงแสดงอยู่จนกว่าจะเปลี่ยนตัวกรอง (ไม่ให้หายไปทันทีระหว่างกรอก)
  useEffect(() => setSticky(new Set()), [filter, search, assignmentId])

  const students = studentsQ.data
  const assignments = useMemo(() => assignmentsQ.data ?? [], [assignmentsQ.data])
  const assignment = assignments.find((a) => a.id === assignmentId)
  const dueOverride = dueDatesQ.data?.find((d) => d.assignment_id === assignmentId && d.classroom_id === classroomId)
  const due = dueOverride?.due_date ?? assignment?.due_date ?? todayISO()
  const policy = useMemo(
    () => (assignment ? effectivePolicy(assignment, settings.late_policy) : settings.late_policy),
    [assignment, settings.late_policy],
  )

  const subMap = useMemo(() => {
    const m = new Map<string, Submission>()
    for (const s of subsQ.data ?? []) if (s.assignment_id === assignmentId) m.set(s.student_id, s)
    return m
  }, [subsQ.data, assignmentId])

  const results = useMemo(() => {
    const m = new Map<string, ScoreResult>()
    subMap.forEach((s, id) => m.set(id, computeScore(s.raw_score, due, s.submitted_on, policy, s.exempt)))
    return m
  }, [subMap, due, policy])

  const q = search.trim().toLowerCase()
  const matches = useCallback(
    (s: Student) => {
      const sub = subMap.get(s.id)
      if (filter === 'missing' && sub) return false
      if (filter === 'done' && !sub) return false
      if (filter === 'late' && !((results.get(s.id)?.lateDays ?? 0) > 0)) return false
      if (q) {
        if (/^\d+$/.test(q) && q.length <= 3) return String(s.number ?? '') === q
        return (
          s.student_code.includes(q) ||
          studentName(s).toLowerCase().includes(q) ||
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q)
        )
      }
      return true
    },
    [subMap, results, filter, q],
  )
  const visible = useMemo(() => students.filter((s) => sticky.has(s.id) || matches(s)), [students, sticky, matches])

  const doneCount = students.filter((s) => subMap.has(s.id)).length
  const lateCount = students.filter((s) => (results.get(s.id)?.lateDays ?? 0) > 0).length
  const finals = students.map((s) => results.get(s.id)?.final).filter((x): x is number => x != null)
  const average = finals.length ? finals.reduce((a, b) => a + b, 0) / finals.length : null

  const focusRow = useCallback(
    (studentId: string, delta: number) => {
      const i = visible.findIndex((s) => s.id === studentId)
      const target = visible[i + delta]
      if (!target) return false
      const el = inputs.current.get(target.id)
      el?.focus()
      el?.select()
      return true
    },
    [visible],
  )

  const saveRow = useCallback(
    (student: Student, patch: Partial<SubmissionInput>) => {
      if (!assignment) return
      const existing = subMap.get(student.id)
      const row: SubmissionInput = {
        assignment_id: assignment.id,
        student_id: student.id,
        raw_score: existing?.raw_score ?? assignment.max_score,
        submitted_on: existing?.submitted_on ?? entryDate,
        exempt: existing?.exempt ?? false,
        note: existing?.note ?? '',
        ...patch,
      }
      setSticky((prev) => (prev.has(student.id) ? prev : new Set(prev).add(student.id)))
      save.mutate([row])
    },
    [assignment, subMap, entryDate, save],
  )

  const deleteRow = useCallback(
    (student: Student) => {
      const existing = subMap.get(student.id)
      if (!existing) return
      setSticky((prev) => new Set(prev).add(student.id))
      del.mutate({ assignmentId, studentIds: [student.id] })
      const { id: _id, ...restore } = existing
      toast(`ลบการส่งของ ${student.first_name} แล้ว`, {
        action: { label: 'เลิกทำ', onClick: () => save.mutate([restore]) },
      })
    },
    [subMap, del, save, assignmentId],
  )

  if (subjectsQ.isPending || classroomsQ.isPending || studentsQ.isPending || assignmentsQ.isPending) return <PageLoader />
  const subject = subjectsQ.data?.find((s) => s.id === subjectId)
  const room = classroomsQ.data?.find((c) => c.id === classroomId)
  if (!subject || !room || !assignment) return <NotFoundPage />

  const idx = assignments.findIndex((a) => a.id === assignmentId)
  const prev = assignments[idx - 1]
  const next = assignments[idx + 1]
  const base = `/scores/${subject.id}/${room.id}`
  const today = todayISO()
  const preview = computeScore(assignment.max_score, due, entryDate, policy)
  const missingVisible = visible.filter((s) => !subMap.has(s.id))

  async function setRoomDue(date: ISODate) {
    if (!date || !assignment) return
    const value = date === assignment.due_date ? null : date
    const key = qk.dueDates(subjectId)
    qc.setQueryData<DueDate[]>(key, (old = []) => {
      const rest = old.filter((d) => !(d.assignment_id === assignment.id && d.classroom_id === classroomId))
      return value ? [...rest, { assignment_id: assignment.id, classroom_id: classroomId, due_date: value }] : rest
    })
    try {
      await getApi().setDueDate(assignment.id, classroomId, value)
    } catch (e) {
      toast.error(errorMessage(e))
      qc.invalidateQueries({ queryKey: key })
    }
  }

  async function fillMissing() {
    if (!assignment || missingVisible.length === 0) return
    const ok = await confirm({
      title: `ให้คะแนนเต็ม ${fmtScore(assignment.max_score)} กับ ${missingVisible.length} คน?`,
      message: (
        <>
          บันทึกเป็น <b>ส่งวันที่ {fmtDateWeekday(entryDate)}</b>
          {preview.lateDays > 0 && <> (ช้า {preview.lateDays} วัน ได้สุทธิ {fmtScore(preview.final)})</>} สำหรับนักเรียนที่ยังไม่ส่งในรายการนี้
        </>
      ),
      confirmText: 'ให้คะแนน',
    })
    if (!ok) return
    setSticky((p) => new Set([...p, ...missingVisible.map((s) => s.id)]))
    save.mutate(
      missingVisible.map((s) => ({
        assignment_id: assignment.id,
        student_id: s.id,
        raw_score: assignment.max_score,
        submitted_on: entryDate,
        exempt: false,
        note: '',
      })),
      { onSuccess: () => toast.success(`บันทึก ${missingVisible.length} คนแล้ว`) },
    )
  }

  return (
    <>
      <PageHeader
        back={base}
        title={assignment.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone="indigo">{assignment.category}</Badge>
            <span>
              {subject.name} · {classroomLabel(room)} · เต็ม <b className="text-slate-700">{fmtScore(assignment.max_score)}</b>
            </span>
          </span>
        }
        actions={
          <>
            <span className="mr-1 hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> กำลังบันทึก…
                </>
              ) : (
                <>
                  <CloudCheck className="size-3.5 text-emerald-500" /> บันทึกอัตโนมัติ
                </>
              )}
            </span>
            {prev ? (
              <Link to={`${base}/${prev.id}`} replace className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-900" title={prev.title}>
                <ChevronLeft className="size-5" />
              </Link>
            ) : (
              <span className="p-2 text-slate-300">
                <ChevronLeft className="size-5" />
              </span>
            )}
            {next ? (
              <Link to={`${base}/${next.id}`} replace className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-900" title={next.title}>
                <ChevronRight className="size-5" />
              </Link>
            ) : (
              <span className="p-2 text-slate-300">
                <ChevronRight className="size-5" />
              </span>
            )}
            <Button icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
              แก้ไขงาน
            </Button>
          </>
        }
      />

      {/* วันที่ + สถิติ */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-[1fr_1fr_1.1fr]">
        <Card className="p-3 sm:p-3.5">
          <label className="text-xs font-medium text-slate-500" htmlFor="entry-date">
            วันที่ส่ง<span className="hidden sm:inline"> (ใช้กับการบันทึกใหม่)</span> · <span className="text-slate-800">{fmtDateWeekday(entryDate)}</span>
          </label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="entry-date"
              type="date"
              value={entryDate}
              onChange={(e) => e.target.value && setEntryDate(e.target.value)}
              className={cn(entryDate !== today && 'bg-amber-50 ring-amber-300')}
            />
            {entryDate !== today && (
              <Button onClick={() => setEntryDate(today)} icon={<RotateCcw className="size-4" />} title="กลับเป็นวันนี้" className="px-3">
                <span className="hidden sm:inline">วันนี้</span>
              </Button>
            )}
          </div>
          <p className={cn('mt-1.5 text-xs', preview.lateDays > 0 ? 'text-amber-700' : 'text-emerald-700')}>
            {preview.lateDays > 0
              ? `ช้ากว่ากำหนด ${preview.lateDays} วัน → เต็ม ${fmtScore(assignment.max_score)} ได้สุทธิ ${fmtScore(preview.final)}`
              : 'ตรงเวลา ไม่หักคะแนน'}
          </p>
        </Card>
        <Card className="p-3 sm:p-3.5">
          <label className="text-xs font-medium text-slate-500" htmlFor="due-date">
            กำหนดส่ง<span className="hidden sm:inline">ของห้อง {classroomLabel(room)}</span> · <span className="text-slate-800">{fmtDateWeekday(due)}</span>
          </label>
          <div className="mt-1.5 flex gap-2">
            <Input id="due-date" type="date" value={due} onChange={(e) => setRoomDue(e.target.value)} />
            {dueOverride && (
              <Button onClick={() => setRoomDue(assignment.due_date)} title="ใช้กำหนดส่งหลัก" icon={<RotateCcw className="size-4" />} className="px-3">
                <span className="hidden sm:inline">ค่าหลัก</span>
              </Button>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">
            {dueOverride ? `เฉพาะห้องนี้ (กำหนดหลัก ${fmtDateShort(assignment.due_date)}) · ` : ''}
            {describePolicy(policy)}
          </p>
        </Card>
        <Card className="col-span-2 grid grid-cols-3 divide-x divide-slate-100 p-3 text-center sm:p-3.5 lg:col-span-1">
          <div>
            <div className="text-xs text-slate-500">ส่งแล้ว</div>
            <div className="tabular mt-1 text-xl font-semibold">
              {doneCount}
              <span className="text-sm font-normal text-slate-400">/{students.length}</span>
            </div>
            <ProgressBar className="mx-3 mt-1.5" value={doneCount} max={students.length} tone={doneCount === students.length ? 'green' : 'indigo'} />
          </div>
          <div>
            <div className="text-xs text-slate-500">ส่งช้า</div>
            <div className={cn('tabular mt-1 text-xl font-semibold', lateCount > 0 && 'text-amber-600')}>{lateCount}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">เฉลี่ยสุทธิ</div>
            <div className="tabular mt-1 text-xl font-semibold">{average == null ? '–' : fmtScore(Math.round(average * 100) / 100)}</div>
          </div>
        </Card>
      </div>

      {/* แถบเครื่องมือ */}
      <div className="sticky top-14 z-20 -mx-4 mb-3 flex flex-wrap items-center gap-2 bg-[#f6f7fb]/90 px-4 py-2 backdrop-blur-md sm:mx-0 sm:px-0 lg:top-0">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'ทั้งหมด', count: students.length },
            { value: 'missing', label: 'ยังไม่ส่ง', count: students.length - doneCount },
            { value: 'done', label: 'ส่งแล้ว', count: doneCount },
            { value: 'late', label: 'ส่งช้า', count: lateCount },
          ]}
        />
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visible.length > 0) {
                e.preventDefault()
                const el = inputs.current.get(visible[0].id)
                el?.focus()
                el?.select()
              }
            }}
            placeholder="ค้นหา เลขที่ / ชื่อ / เลขประจำตัว"
            className="pl-9"
            enterKeyHint="go"
          />
        </div>
        <Button variant="soft" icon={<Zap className="size-4" />} onClick={fillMissing} disabled={missingVisible.length === 0}>
          เต็มทุกคนที่ยังไม่ส่ง
        </Button>
      </div>

      {students.length === 0 ? (
        <EmptyState title="ห้องนี้ยังไม่มีนักเรียน" description="เพิ่มรายชื่อนักเรียนในหน้านักเรียนก่อน" />
      ) : visible.length === 0 ? (
        <EmptyState icon={<Check />} title="ไม่มีรายชื่อตามเงื่อนไข" description={filter === 'missing' ? 'ทุกคนส่งงานครบแล้ว 🎉' : 'ลองเปลี่ยนตัวกรองหรือคำค้นหา'} />
      ) : (
        <Card className="divide-y divide-slate-100">
          {visible.map((s) => (
            <EntryRow
              key={`${assignmentId}:${s.id}`}
              student={s}
              sub={subMap.get(s.id)}
              result={results.get(s.id)}
              max={assignment.max_score}
              entryDate={entryDate}
              due={due}
              policy={policy}
              registerInput={(el) => (el ? inputs.current.set(s.id, el) : inputs.current.delete(s.id))}
              onSave={saveRow}
              onDelete={deleteRow}
              onNav={focusRow}
            />
          ))}
        </Card>
      )}
      <p className="mt-3 hidden text-center text-xs text-slate-400 sm:block">
        พิมพ์คะแนนแล้วกด Enter เพื่อบันทึกและไปคนถัดไป · ↑ ↓ เลื่อนแถว · ลบคะแนนให้ว่างแล้ว Enter = ยกเลิกการส่ง
      </p>

      <AssignmentFormModal open={editOpen} onClose={() => setEditOpen(false)} subjectId={subject.id} assignment={assignment} existing={assignments} />
    </>
  )
}

interface RowProps {
  student: Student
  sub?: Submission
  result?: ScoreResult
  max: number
  entryDate: ISODate
  due: ISODate
  policy: LatePolicy
  registerInput: (el: HTMLInputElement | null) => void
  onSave: (s: Student, patch: Partial<SubmissionInput>) => void
  onDelete: (s: Student) => void
  onNav: (studentId: string, delta: number) => boolean
}

const EntryRow = memo(function EntryRow({ student, sub, result, max, entryDate, due, policy, registerInput, onSave, onDelete, onNav }: RowProps) {
  const shown = sub ? fmtScore(sub.raw_score) : ''
  const [draft, setDraft] = useState(shown)
  const [flash, setFlash] = useState(0)
  const focused = useRef(false)
  const first = useRef(true)

  useEffect(() => {
    if (!focused.current) setDraft(shown)
    if (first.current) first.current = false
    else setFlash((f) => f + 1)
  }, [shown, sub?.submitted_on, sub?.exempt]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit(): boolean {
    const v = draft.trim()
    if (v === shown) return true
    if (v === '') {
      if (sub) onDelete(student)
      return true
    }
    const n = parseNumber(v)
    if (n == null || n < 0) {
      toast.error('คะแนนไม่ถูกต้อง')
      setDraft(shown)
      return false
    }
    let raw = n
    if (raw > max) {
      toast.warning(`คะแนนเกินเต็ม ${fmtScore(max)} — ปรับเป็น ${fmtScore(max)}`)
      raw = max
      setDraft(fmtScore(max))
    }
    if (sub && sub.raw_score === raw) return true
    onSave(student, { raw_score: raw })
    return true
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (commit() && !onNav(student.id, 1)) e.currentTarget.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      onNav(student.id, 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      onNav(student.id, -1)
    } else if (e.key === 'Escape') {
      setDraft(shown)
      e.currentTarget.blur()
    }
  }

  const isLate = (result?.lateDays ?? 0) > 0
  const isFull = sub?.raw_score === max
  const changedFinal = sub && result && result.final !== sub.raw_score
  const wouldBeLate = !sub && computeScore(max, due, entryDate, policy).lateDays > 0

  return (
    <div className="relative flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4">
      {flash > 0 && <div key={flash} className="flash-ok pointer-events-none absolute inset-0" />}
      <div
        className={cn(
          'tabular flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
          sub ? (isLate && !sub.exempt ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800') : 'bg-slate-100 text-slate-500',
        )}
      >
        {student.number ?? '–'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">{studentName(student)}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
          {sub ? (
            <>
              <label className="relative inline-flex cursor-pointer items-center gap-1 rounded px-0.5 hover:bg-slate-100 hover:text-slate-800">
                <CalendarDays className="size-3" />
                ส่ง {fmtDateShort(sub.submitted_on)}
                <input
                  type="date"
                  aria-label="แก้วันที่ส่ง"
                  value={sub.submitted_on}
                  onChange={(e) => e.target.value && onSave(student, { submitted_on: e.target.value })}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker()
                    } catch {
                      /* เบราว์เซอร์เก่า */
                    }
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              {isLate &&
                (sub.exempt ? (
                  <Badge tone="sky">
                    <ShieldCheck className="size-3" /> ยกเว้นหัก
                  </Badge>
                ) : (
                  <Badge tone="amber">
                    ช้า {result!.lateDays} วัน{result!.deducted > 0 && ` −${fmtScore(result!.deducted)}`}
                  </Badge>
                ))}
            </>
          ) : (
            <span className="text-rose-500">ยังไม่ส่ง</span>
          )}
          {student.student_code && <span className="hidden text-slate-400 sm:inline">· {student.student_code}</span>}
        </div>
      </div>

      {changedFinal && (
        <div className="hidden text-right leading-tight sm:block">
          <div className="text-[10px] text-slate-400">สุทธิ</div>
          <div className="tabular text-sm font-semibold text-amber-700">{fmtScore(result!.final)}</div>
        </div>
      )}
      <div className="relative">
        <input
          ref={registerInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => {
            focused.current = true
            e.currentTarget.select()
          }}
          onBlur={() => {
            focused.current = false
            commit()
          }}
          onKeyDown={onKeyDown}
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          placeholder="–"
          aria-label={`คะแนน ${studentName(student)}`}
          className={cn(
            'tabular h-11 w-16 rounded-xl border-0 bg-white text-center text-base font-semibold ring-1 ring-inset transition-shadow placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:w-20',
            sub ? 'ring-slate-200' : wouldBeLate ? 'ring-amber-200' : 'ring-slate-200',
          )}
        />
        {changedFinal && (
          <span className="tabular absolute -top-1.5 -right-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-semibold text-white sm:hidden">
            {fmtScore(result!.final)}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => !isFull && onSave(student, { raw_score: max })}
        className={cn(
          'flex h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold transition-colors',
          isFull ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200',
        )}
        aria-label={`ให้คะแนนเต็ม ${studentName(student)}`}
      >
        <Check className="size-4" />
        <span className="hidden sm:inline">เต็ม</span>
      </button>
      {sub ? (
        <Menu
          items={[
            {
              label: sub.exempt ? 'ยกเลิกการยกเว้นหักคะแนน' : 'ยกเว้นการหักคะแนนส่งช้า',
              icon: <ShieldCheck />,
              onClick: () => onSave(student, { exempt: !sub.exempt }),
              hidden: !isLate && !sub.exempt,
            },
            {
              label: `เปลี่ยนเป็นส่ง ${fmtDateShort(entryDate)}`,
              icon: <CalendarDays />,
              onClick: () => onSave(student, { submitted_on: entryDate }),
              hidden: sub.submitted_on === entryDate,
            },
            { label: 'ยกเลิกการส่ง (ลบคะแนน)', icon: <Trash2 />, danger: true, onClick: () => onDelete(student) },
          ]}
        />
      ) : (
        <span className="size-8 shrink-0" aria-hidden />
      )}
    </div>
  )
})
