import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronRight, ClipboardList, Pencil, Plus, Sheet, Trash2 } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { qk, useAssignments, useClassrooms, useDueDates, useRoomStudents, useRoomSubmissions, useSubjects } from '@/hooks/queries'
import { getApi } from '@/lib/api'
import type { Assignment } from '@/lib/api/types'
import { buildGradebook } from '@/lib/gradebook'
import { classroomLabel, cn, errorMessage, fmtDateWeekday, fmtScore, parseISODate, todayISO } from '@/lib/utils'
import { AssignmentFormModal } from '@/components/AssignmentForm'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { Badge, Card, Menu, PageHeader, ProgressBar, Segmented, subjectColor } from '@/components/ui/Misc'
import { useConfirm } from '@/components/ui/Modal'
import NotFoundPage from './NotFoundPage'

export default function RoomPage() {
  const { subjectId = '', classroomId = '' } = useParams()
  const { term, settings } = useApp()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const qc = useQueryClient()

  const subjectsQ = useSubjects(term.id)
  const classroomsQ = useClassrooms(term.id)
  const studentsQ = useRoomStudents(term.id, classroomId)
  const assignmentsQ = useAssignments(subjectId)
  const dueDatesQ = useDueDates(subjectId)
  const subsQ = useRoomSubmissions(subjectId, classroomId, studentsQ.data, studentsQ.isSuccess)

  const [category, setCategory] = useState('__all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Assignment | undefined>()

  const assignments = useMemo(() => assignmentsQ.data ?? [], [assignmentsQ.data])
  const students = studentsQ.data
  const { stats } = useMemo(
    () => buildGradebook(students, assignments, subsQ.data ?? [], dueDatesQ.data ?? [], classroomId, settings.late_policy),
    [students, assignments, subsQ.data, dueDatesQ.data, classroomId, settings.late_policy],
  )

  if (subjectsQ.isPending || classroomsQ.isPending || studentsQ.isPending || assignmentsQ.isPending) return <PageLoader />
  const subject = subjectsQ.data?.find((s) => s.id === subjectId)
  const room = classroomsQ.data?.find((c) => c.id === classroomId)
  if (!subject || !room) return <NotFoundPage />

  const rooms = (classroomsQ.data ?? []).filter((c) => subject.classroom_ids.includes(c.id))
  const categories = [...new Set(assignments.map((a) => a.category))]
  const list = stats
    .filter((s) => category === '__all' || s.assignment.category === category)
    .sort((a, b) => b.due.localeCompare(a.due) || b.assignment.created_at.localeCompare(a.assignment.created_at))
  const overrideIds = new Set((dueDatesQ.data ?? []).filter((d) => d.classroom_id === classroomId).map((d) => d.assignment_id))
  const today = todayISO()
  const color = subjectColor(subject.color)

  async function remove(a: Assignment) {
    const ok = await confirm({
      title: `ลบ "${a.title}"?`,
      message: 'คะแนนที่บันทึกไว้ของงานนี้ในทุกห้องจะถูกลบด้วย และกู้คืนไม่ได้',
      confirmText: 'ลบงาน',
      danger: true,
    })
    if (!ok) return
    try {
      await getApi().deleteAssignment(a.id)
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.assignments(subjectId) }),
        qc.invalidateQueries({ queryKey: ['termAssignments'] }),
        qc.invalidateQueries({ queryKey: qk.groups(subjectId) }),
        qc.invalidateQueries({ queryKey: ['submissions', subjectId] }),
        qc.invalidateQueries({ queryKey: qk.dueDates(subjectId) }),
      ])
      toast.success('ลบงานแล้ว')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        back="/scores"
        title={
          <span className="flex items-center gap-2">
            <span className={cn('size-2.5 rounded-full', color.dot)} />
            {subject.name} <span className="text-slate-400">·</span> {classroomLabel(room)}
          </span>
        }
        subtitle={`${subject.code ? subject.code + ' · ' : ''}${students.length} คน · ${assignments.length} งาน`}
        actions={
          <>
            <ButtonLink to={`/summary?subject=${subject.id}&room=${room.id}`} icon={<Sheet className="size-4" />}>
              คะแนนรวม
            </ButtonLink>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(undefined)
                setFormOpen(true)
              }}
            >
              สร้างงาน
            </Button>
          </>
        }
      />

      {rooms.length > 1 && (
        <div className="scrollbar-thin -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {rooms.map((r) => (
            <Link
              key={r.id}
              to={`/scores/${subject.id}/${r.id}`}
              replace
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset',
                r.id === room.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {classroomLabel(r)}
            </Link>
          ))}
        </div>
      )}

      {assignments.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="ยังไม่มีงานในรายวิชานี้"
          description="สร้างงานแรก เช่น สมุด ใบงาน หรือสอบเก็บคะแนน แล้วเริ่มบันทึกการส่งงาน"
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setFormOpen(true)}>
              สร้างงาน
            </Button>
          }
        />
      ) : (
        <>
          {categories.length > 1 && (
            <Segmented
              className="mb-3 w-fit max-w-full"
              value={category}
              onChange={setCategory}
              options={[
                { value: '__all', label: 'ทั้งหมด', count: assignments.length },
                ...categories.map((c) => ({ value: c, label: c, count: assignments.filter((a) => a.category === c).length })),
              ]}
            />
          )}
          <Card className="divide-y divide-slate-100 overflow-visible">
            {list.map(({ assignment: a, due, submitted, late, average }) => {
              const d = parseISODate(due)
              const isToday = due === today
              const done = students.length > 0 && submitted === students.length
              return (
                <div key={a.id} className="group flex items-center gap-1 pr-2 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50/80">
                  <Link to={`/scores/${subject.id}/${room.id}/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 sm:gap-4 sm:pl-4">
                    <div
                      className={cn(
                        'flex size-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none ring-1 ring-inset',
                        isToday ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-slate-50 text-slate-700 ring-slate-200',
                      )}
                    >
                      <span className="text-lg font-semibold">{d.getDate()}</span>
                      <span className={cn('mt-0.5 text-[10px]', isToday ? 'text-indigo-100' : 'text-slate-500')}>
                        {d.toLocaleDateString('th-TH', { month: 'short' })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge tone="indigo" className="hidden sm:inline-flex">
                          {a.category}
                        </Badge>
                        <span className="truncate font-medium text-slate-900">{a.title}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span className="sm:hidden">{a.category} ·</span>
                        <span>เต็ม {fmtScore(a.max_score)}</span>
                        <span>· ส่ง {fmtDateWeekday(due)}</span>
                        {overrideIds.has(a.id) && <span className="text-indigo-600">(เฉพาะห้องนี้)</span>}
                        {average != null && <span className="hidden sm:inline">· เฉลี่ย {fmtScore(average)}</span>}
                      </div>
                    </div>
                    <div className="w-20 shrink-0 text-right sm:w-36">
                      <div className="flex items-baseline justify-end gap-1.5">
                        {late > 0 && <span className="hidden text-xs text-amber-600 sm:inline">ช้า {late}</span>}
                        <span className={cn('tabular text-sm font-semibold', done ? 'text-emerald-600' : 'text-slate-900')}>
                          {submitted}/{students.length}
                        </span>
                      </div>
                      <ProgressBar className="mt-1.5" value={submitted} max={students.length} tone={done ? 'green' : 'indigo'} />
                    </div>
                    <ChevronRight className="hidden size-4 shrink-0 text-slate-300 group-hover:text-indigo-500 sm:block" />
                  </Link>
                  <Menu
                    items={[
                      {
                        label: 'แก้ไขงาน',
                        icon: <Pencil />,
                        onClick: () => {
                          setEditing(a)
                          setFormOpen(true)
                        },
                      },
                      { label: 'ลบงาน', icon: <Trash2 />, danger: true, onClick: () => remove(a) },
                    ]}
                  />
                </div>
              )
            })}
          </Card>
        </>
      )}

      <AssignmentFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        subjectId={subject.id}
        assignment={editing}
        existing={assignments}
        onSaved={(a) => {
          if (!editing) navigate(`/scores/${subject.id}/${room.id}/${a.id}`)
        }}
      />
    </>
  )
}
