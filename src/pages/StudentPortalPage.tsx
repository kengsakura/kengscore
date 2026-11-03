import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, CalendarClock, Check, Clock, EyeOff, LogOut, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { getApi } from '@/lib/api'
import type { StudentReport } from '@/lib/api/types'
import { formatAccessCode, isValidAccessCode, normalizeAccessCode } from '@/lib/access'
import { summarizeReport, type ReportItem, type SubjectSummary } from '@/lib/report'
import { describePolicy } from '@/lib/scoring'
import { cn, errorMessage, fmtDateShort, fmtDateWeekday, fmtScore, studentName, termLongLabel, todayISO } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { FullScreenLoader, Logo } from '@/components/ui/Feedback'
import { Badge, ProgressBar, subjectColor } from '@/components/ui/Misc'

const SAVED_KEY = 'kengscore:student-code'
const readSaved = () => {
  try {
    return localStorage.getItem(SAVED_KEY) ?? ''
  } catch {
    return ''
  }
}
const writeSaved = (code: string | null) => {
  try {
    if (code) localStorage.setItem(SAVED_KEY, code)
    else localStorage.removeItem(SAVED_KEY)
  } catch {
    /* ไม่เป็นไร */
  }
}

/** หน้าสำหรับนักเรียน: กรอกรหัสดูคะแนนแล้วเห็นคะแนนของตัวเอง (ไม่ต้องสมัคร) */
export default function StudentPortalPage() {
  const { code: paramCode } = useParams()
  const navigate = useNavigate()
  const [code, setCode] = useState(() => normalizeAccessCode(paramCode ?? readSaved()))

  useEffect(() => {
    if (paramCode) setCode(normalizeAccessCode(paramCode))
  }, [paramCode])

  const valid = isValidAccessCode(code)
  const q = useQuery({
    queryKey: ['student-report', code],
    queryFn: () => getApi().getStudentReport(code),
    enabled: valid,
    staleTime: 60_000,
    retry: 1,
  })

  useEffect(() => {
    if (q.data?.status === 'ok') writeSaved(code)
    if (q.data?.status === 'not_found') writeSaved(null)
  }, [q.data, code])

  const submit = (c: string) => {
    setCode(c)
    navigate(`/s/${c}`, { replace: true })
  }
  const logout = () => {
    writeSaved(null)
    setCode('')
    navigate('/s', { replace: true })
  }

  if (!valid) return <CodeForm onSubmit={submit} error={code && paramCode ? 'รหัสในลิงก์ไม่ถูกต้อง' : undefined} />
  if (q.isPending) return <FullScreenLoader label="กำลังโหลดคะแนน…" />
  if (q.isError) return <CodeForm initial={code} onSubmit={submit} error={errorMessage(q.error)} />
  if (q.data.status === 'not_found')
    return <CodeForm initial={code} onSubmit={submit} error="ไม่พบรหัสนี้ ตรวจตัวอักษรอีกครั้ง หรือถามครูว่ามีการเปลี่ยนรหัสหรือไม่" />
  if (q.data.status === 'disabled')
    return (
      <Shell>
        <div className="rounded-3xl bg-white p-6 text-center shadow-pop ring-1 ring-slate-200/80">
          <EyeOff className="mx-auto size-10 text-slate-400" />
          <h1 className="mt-3 text-lg font-semibold">ครูปิดการดูคะแนนไว้ชั่วคราว</h1>
          <p className="mt-1 text-sm text-slate-500">ลองเข้ามาใหม่ภายหลัง หรือสอบถามครูประจำวิชา</p>
          <Button className="mt-5" onClick={logout} icon={<LogOut className="size-4" />}>
            ใช้รหัสอื่น
          </Button>
        </div>
      </Shell>
    )
  return <ReportView report={q.data.report} onLogout={logout} onRefresh={() => q.refetch()} refreshing={q.isFetching} />
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const demo = getApi().mode === 'local'
  return (
    <div className="min-h-dvh px-4 pt-6 pb-12">
      <div className={cn('mx-auto w-full', wide ? 'max-w-3xl' : 'max-w-sm pt-6 sm:pt-12')}>
        {demo && (
          <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600">
            <ArrowLeft className="size-4" /> กลับหน้าครู (โหมดสาธิต)
          </Link>
        )}
        {children}
      </div>
    </div>
  )
}

function CodeForm({ initial = '', error, onSubmit }: { initial?: string; error?: string; onSubmit: (code: string) => void }) {
  const [value, setValue] = useState(formatAccessCode(initial))
  const [touched, setTouched] = useState(false)
  const ok = isValidAccessCode(value)

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (ok) onSubmit(normalizeAccessCode(value))
  }

  return (
    <Shell>
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo className="size-14 drop-shadow-lg" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">ดูคะแนนของฉัน</h1>
        <p className="mt-1 text-sm text-slate-500">กรอกรหัสดูคะแนน 8 ตัวที่ได้จากครู หรือสแกน QR บนใบรหัส</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-6 shadow-pop ring-1 ring-slate-200/80">
        <label htmlFor="access-code" className="block text-sm font-medium text-slate-700">
          รหัสดูคะแนน
        </label>
        <input
          id="access-code"
          value={value}
          onChange={(e) => setValue(formatAccessCode(normalizeAccessCode(e.target.value).slice(0, 8)))}
          placeholder="XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          autoFocus
          className="block h-14 w-full rounded-2xl border-0 bg-slate-50 text-center font-mono text-2xl font-semibold tracking-[0.2em] text-slate-900 uppercase ring-1 ring-slate-200 ring-inset placeholder:text-slate-300 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        {(error || (touched && !ok)) && (
          <p className="flex items-start gap-1.5 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {touched && !ok ? 'รหัสต้องมี 8 ตัว (ตัวอักษรภาษาอังกฤษและตัวเลข)' : error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full">
          ดูคะแนน
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-slate-400">ไม่มีรหัสหรือรหัสหาย ให้ติดต่อครูประจำวิชา</p>
    </Shell>
  )
}

function StatusPill({ item }: { item: ReportItem }) {
  switch (item.status) {
    case 'done':
      return (
        <Badge tone="green">
          <Check className="size-3" /> ส่งแล้ว
        </Badge>
      )
    case 'late':
      return item.assignment.submission?.exempt ? (
        <Badge tone="sky">
          <ShieldCheck className="size-3" /> ส่งช้า (ไม่หัก)
        </Badge>
      ) : (
        <Badge tone="amber">ส่งช้า {item.result?.lateDays} วัน</Badge>
      )
    case 'overdue':
      return <Badge tone="red">ค้างส่ง · เลย {item.overdueDays} วัน</Badge>
    case 'today':
      return <Badge tone="amber">ส่งภายในวันนี้</Badge>
    default:
      return <Badge tone="gray">ส่งภายใน {fmtDateShort(item.assignment.due_date)}</Badge>
  }
}

function ReportView({
  report,
  onLogout,
  onRefresh,
  refreshing,
}: {
  report: StudentReport
  onLogout: () => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const today = todayISO()
  const sum = useMemo(() => summarizeReport(report, today), [report, today])
  const s = report.student

  return (
    <Shell wide>
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-pop sm:p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-indigo-100">คะแนนการส่งงาน · {termLongLabel(report.term)}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{studentName(s)}</h1>
            <p className="mt-1 text-sm text-indigo-100">
              ชั้น {s.grade}/{s.room}
              {s.number != null && ` · เลขที่ ${s.number}`}
              {s.student_code && ` · เลขประจำตัว ${s.student_code}`}
            </p>
            {(report.school_name || report.teacher_name) && (
              <p className="mt-0.5 text-xs text-indigo-200">
                {[report.school_name, report.teacher_name && `ครูผู้สอน ${report.teacher_name}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={onRefresh} className="rounded-xl p-2 text-indigo-100 hover:bg-white/15 hover:text-white" aria-label="โหลดใหม่" title="โหลดใหม่">
              <RefreshCw className={cn('size-5', refreshing && 'animate-spin')} />
            </button>
            <button type="button" onClick={onLogout} className="rounded-xl p-2 text-indigo-100 hover:bg-white/15 hover:text-white" aria-label="ออก" title="ออก">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { label: 'ส่งแล้ว', value: `${sum.submitted}/${sum.total}` },
            { label: 'ต้องรีบส่ง', value: sum.todo.length, alert: sum.todo.length > 0 },
            { label: 'ส่งช้า', value: sum.late },
          ].map((x) => (
            <div key={x.label} className={cn('rounded-2xl px-3 py-2.5 text-center', x.alert ? 'bg-rose-500/90' : 'bg-white/15')}>
              <div className="tabular text-xl font-semibold">{x.value}</div>
              <div className="text-[11px] text-indigo-100">{x.label}</div>
            </div>
          ))}
        </div>
      </header>

      {sum.todo.length > 0 && (
        <section className="mt-5 rounded-3xl bg-rose-50 p-4 ring-1 ring-rose-100 sm:p-5">
          <h2 className="flex items-center gap-2 font-semibold text-rose-800">
            <TriangleAlert className="size-5" /> งานที่ต้องรีบส่ง ({sum.todo.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {sum.todo.map((i) => (
              <li key={i.assignment.id} className="rounded-2xl bg-white px-3.5 py-3 ring-1 ring-rose-100">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-slate-900">{i.assignment.title}</span>
                  <StatusPill item={i} />
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {i.subject.name} · {i.assignment.category} · กำหนดส่ง {fmtDateWeekday(i.assignment.due_date)}
                </div>
                {i.bestIfToday != null && i.bestIfToday < i.assignment.max_score && (
                  <div className="mt-1 text-xs font-medium text-rose-700">
                    ถ้าส่งวันนี้ได้สูงสุด {fmtScore(i.bestIfToday)}/{fmtScore(i.assignment.max_score)} — ยิ่งช้ายิ่งได้น้อยลง
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sum.subjects.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">ยังไม่มีรายวิชาที่บันทึกคะแนน</p>
      ) : (
        <div className="mt-5 space-y-4">
          {sum.subjects.map((ss) => (
            <SubjectCard key={ss.subject.id} summary={ss} />
          ))}
        </div>
      )}

      <p className="mt-6 flex items-start gap-1.5 text-xs text-slate-400">
        <Clock className="mt-0.5 size-3.5 shrink-0" />
        คะแนนเป็นคะแนนสุทธิหลังหักส่งช้า ({describePolicy(report.late_policy)}) · บางงานครูอาจตั้งเงื่อนไขต่างจากนี้ · ถ้าคะแนนไม่ตรง ให้สอบถามครู
      </p>
    </Shell>
  )
}

function SubjectCard({ summary }: { summary: SubjectSummary }) {
  const { subject, items } = summary
  const color = subjectColor(subject.color)
  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-slate-200/80">
      <div className={cn('h-1.5 bg-gradient-to-r', color.strip)} />
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-slate-500">{subject.code || 'รายวิชา'}</div>
          <h2 className="text-lg font-semibold text-slate-900">{subject.name}</h2>
        </div>
        <div className="text-right">
          <div className="tabular text-2xl leading-none font-bold text-slate-900">
            {fmtScore(summary.total)}
            <span className="text-sm font-medium text-slate-400">/{fmtScore(summary.maxTotal)}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {summary.percent}%{summary.scaled != null && ` · คิดเป็น ${fmtScore(summary.scaled)}/${fmtScore(subject.full_score)}`}
          </div>
        </div>
        <ProgressBar className="w-full" value={summary.total} max={summary.maxTotal} tone={summary.pending === 0 ? 'green' : 'indigo'} />
      </div>
      {items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-slate-500">ยังไม่มีงานในรายวิชานี้</p>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {[...items].reverse().map((i) => (
            <li key={i.assignment.id} className={cn('flex items-center gap-3 px-4 py-3 sm:px-5', i.status === 'overdue' && 'bg-rose-50/50')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-slate-900">{i.assignment.title}</span>
                  <StatusPill item={i} />
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <CalendarClock className="size-3" />
                  {i.assignment.category} · กำหนด {fmtDateShort(i.assignment.due_date)}
                  {i.assignment.submission && ` · ส่ง ${fmtDateShort(i.assignment.submission.submitted_on)}`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={cn('tabular text-base font-semibold', i.result ? 'text-slate-900' : 'text-slate-300')}>
                  {i.result ? fmtScore(i.result.final) : '–'}
                  <span className="text-xs font-normal text-slate-400">/{fmtScore(i.assignment.max_score)}</span>
                </div>
                {i.result && i.result.deducted > 0 && (
                  <div className="text-[11px] text-amber-700">
                    ทำได้ {fmtScore(i.assignment.submission!.raw_score)} หัก {fmtScore(i.result.deducted)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
