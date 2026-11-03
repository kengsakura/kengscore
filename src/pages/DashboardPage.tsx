import { useMemo } from 'react'
import { Link } from 'react-router'
import { useQueries } from '@tanstack/react-query'
import { BookOpen, Check, ClipboardList, DoorOpen, Plus, Upload, Users } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { qk, useClassrooms, useStudents, useSubjects } from '@/hooks/queries'
import { getApi } from '@/lib/api'
import type { Assignment } from '@/lib/api/types'
import { classroomLabel, cn, fmtDateWeekday, termLongLabel, todayISO } from '@/lib/utils'
import { ClassCards } from '@/components/ClassCards'
import { ButtonLink } from '@/components/ui/Button'
import { PageLoader } from '@/components/ui/Feedback'
import { Badge, Card, subjectColor } from '@/components/ui/Misc'

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn('rounded-xl p-2.5 [&>svg]:size-5', tone)}>{icon}</div>
      <div>
        <div className="tabular text-2xl leading-none font-semibold">{value}</div>
        <div className="mt-1 text-xs text-slate-500">{label}</div>
      </div>
    </Card>
  )
}

export default function DashboardPage() {
  const { term, settings } = useApp()
  const classroomsQ = useClassrooms(term.id)
  const studentsQ = useStudents(term.id)
  const subjectsQ = useSubjects(term.id)
  const subjects = subjectsQ.data ?? []
  const classrooms = classroomsQ.data ?? []
  const students = studentsQ.data ?? []

  const assignmentQs = useQueries({
    queries: subjects.map((s) => ({
      queryKey: qk.assignments(s.id),
      queryFn: () => getApi().listAssignments(s.id),
    })),
  })
  const allAssignments = useMemo(() => assignmentQs.flatMap((q) => q.data ?? []), [assignmentQs])
  const recent = useMemo(
    () =>
      [...allAssignments]
        .sort((a, b) => b.due_date.localeCompare(a.due_date) || b.created_at.localeCompare(a.created_at))
        .slice(0, 6),
    [allAssignments],
  )

  if (classroomsQ.isPending || studentsQ.isPending || subjectsQ.isPending) return <PageLoader />

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'
  const steps = [
    { done: students.length > 0, label: 'เพิ่มรายชื่อนักเรียน', hint: 'พิมพ์เองหรือวางจาก Excel', to: '/students', icon: <Upload /> },
    { done: subjects.length > 0, label: 'เพิ่มรายวิชา', hint: 'รหัสวิชา ชื่อวิชา', to: '/subjects', icon: <BookOpen /> },
    {
      done: subjects.some((s) => s.classroom_ids.length > 0),
      label: 'จับคู่ห้องที่สอน',
      hint: 'เลือกห้องของแต่ละวิชา',
      to: '/subjects',
      icon: <DoorOpen />,
    },
  ]
  const setupDone = steps.every((s) => s.done)
  const subjectOf = (a: Assignment) => subjects.find((s) => s.id === a.subject_id)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          {greet} · {fmtDateWeekday(todayISO())}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">{settings.teacher_name || 'คุณครู'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {termLongLabel(term)}
          {settings.school_name && ` · ${settings.school_name}`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Users />} label="นักเรียน" value={students.length} tone="bg-indigo-50 text-indigo-600" />
        <Stat icon={<DoorOpen />} label="ห้องเรียน" value={classrooms.length} tone="bg-sky-50 text-sky-600" />
        <Stat icon={<BookOpen />} label="รายวิชา" value={subjects.length} tone="bg-emerald-50 text-emerald-600" />
        <Stat icon={<ClipboardList />} label="งานที่สั่ง" value={allAssignments.length} tone="bg-amber-50 text-amber-600" />
      </div>

      {!setupDone && (
        <Card className="p-5">
          <h2 className="font-semibold">เริ่มต้นใช้งาน</h2>
          <p className="mt-0.5 text-sm text-slate-500">ทำ 3 ขั้นตอนนี้ แล้วเริ่มกรอกคะแนนได้เลย</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {steps.map((s, i) => (
              <Link
                key={i}
                to={s.to}
                className={cn(
                  'flex items-center gap-3 rounded-xl p-3 ring-1 transition-colors ring-inset',
                  s.done ? 'bg-emerald-50/60 ring-emerald-100' : 'bg-white ring-slate-200 hover:bg-indigo-50/50 hover:ring-indigo-200',
                )}
              >
                <div
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold [&>svg]:size-4',
                    s.done ? 'bg-emerald-500 text-white' : 'bg-indigo-50 text-indigo-600',
                  )}
                >
                  {s.done ? <Check /> : s.icon}
                </div>
                <div className="min-w-0">
                  <div className={cn('text-sm font-medium', s.done && 'text-emerald-800')}>
                    {i + 1}. {s.label}
                  </div>
                  <div className="text-xs text-slate-500">{s.hint}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {subjects.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">กรอกคะแนน</h2>
            <ButtonLink to="/subjects" size="sm" variant="ghost" icon={<Plus className="size-4" />}>
              เพิ่มรายวิชา
            </ButtonLink>
          </div>
          <ClassCards subjects={subjects} classrooms={classrooms} students={students} />
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">งานล่าสุด</h2>
          <Card className="divide-y divide-slate-100">
            {recent.map((a) => {
              const subject = subjectOf(a)
              if (!subject) return null
              const rooms = classrooms.filter((c) => subject.classroom_ids.includes(c.id))
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <span className={cn('size-2 shrink-0 rounded-full', subjectColor(subject.color).dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="indigo">{a.category}</Badge>
                      <span className="truncate text-sm font-medium">{a.title}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {subject.code} {subject.name} · กำหนดส่ง {fmtDateWeekday(a.due_date)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rooms.map((r) => (
                      <Link
                        key={r.id}
                        to={`/scores/${subject.id}/${r.id}/${a.id}`}
                        className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 ring-inset hover:bg-indigo-50 hover:text-indigo-700 hover:ring-indigo-200"
                      >
                        {classroomLabel(r)}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </Card>
        </div>
      )}
    </div>
  )
}
