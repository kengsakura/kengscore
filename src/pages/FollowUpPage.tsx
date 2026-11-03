import { Fragment, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQueries } from '@tanstack/react-query'
import { ChevronDown, Download, FileText, ListChecks, Printer } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { qk, useClassrooms, useRoomStudents, useSubjects } from '@/hooks/queries'
import { getApi } from '@/lib/api'
import { toCSV } from '@/lib/csv'
import { buildFollowUp, type SubjectData } from '@/lib/followup'
import { ARTIFACT } from '@/lib/env'
import { classroomLabel, cn, downloadFile, fmtDate, studentName, termLongLabel, todayISO } from '@/lib/utils'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { Checkbox, Select } from '@/components/ui/Form'
import { Card, PageHeader } from '@/components/ui/Misc'

type PrintMode = 'table' | 'letters'

/** ติดตามงานค้าง: นักเรียนแต่ละคนค้างงานอะไรบ้าง ในทุกรายวิชาของห้อง */
export default function FollowUpPage() {
  const { term, settings } = useApp()
  const [params, setParams] = useSearchParams()
  const [includeNotDue, setIncludeNotDue] = useState(false)
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [sortByMost, setSortByMost] = useState(false)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [printMode, setPrintMode] = useState<PrintMode>('table')

  const classroomsQ = useClassrooms(term.id)
  const subjectsQ = useSubjects(term.id)
  const rooms = classroomsQ.data ?? []
  const room = rooms.find((r) => r.id === params.get('room')) ?? rooms[0]
  const studentsQ = useRoomStudents(term.id, room?.id)
  const subjects = useMemo(() => (subjectsQ.data ?? []).filter((s) => room && s.classroom_ids.includes(room.id)), [subjectsQ.data, room])
  const studentIds = studentsQ.data.map((s) => s.id)

  const api = getApi()
  const perSubject = useQueries({
    queries: subjects.flatMap((s) => [
      { queryKey: qk.assignments(s.id), queryFn: () => api.listAssignments(s.id) },
      { queryKey: qk.dueDates(s.id), queryFn: () => api.listDueDates(s.id) },
      {
        queryKey: qk.submissions(s.id, room?.id),
        queryFn: () => api.listSubmissions(s.id, studentIds),
        enabled: !!room && studentsQ.isSuccess,
      },
    ]),
  })
  const loading = classroomsQ.isPending || subjectsQ.isPending || studentsQ.isPending || perSubject.some((q) => q.isPending)
  const failed = perSubject.find((q) => q.isError)

  const today = todayISO()
  const data: SubjectData[] = subjects.map((subject, i) => ({
    subject,
    assignments: (perSubject[i * 3]?.data as SubjectData['assignments']) ?? [],
    dueDates: (perSubject[i * 3 + 1]?.data as SubjectData['dueDates']) ?? [],
    submissions: (perSubject[i * 3 + 2]?.data as SubjectData['submissions']) ?? [],
  }))
  const dataKey = perSubject.map((q) => q.dataUpdatedAt).join()
  const all = useMemo(
    () => (loading || !room ? [] : buildFollowUp(studentsQ.data, data, room.id, settings.late_policy, today, includeNotDue)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, room?.id, studentsQ.data, dataKey, settings.late_policy, today, includeNotDue],
  )
  let rows = onlyMissing ? all.filter((r) => r.missing.length > 0) : all
  if (sortByMost) rows = [...rows].sort((a, b) => b.missing.length - a.missing.length)
  const totalMissing = all.reduce((n, r) => n + r.missing.length, 0)
  const withMissing = all.filter((r) => r.missing.length > 0).length

  if (classroomsQ.isPending || subjectsQ.isPending) return <PageLoader />
  if (!room)
    return (
      <>
        <PageHeader title="ติดตามงานค้าง" />
        <EmptyState icon={<ListChecks />} title="ยังไม่มีห้องเรียน" action={<ButtonLink to="/students" variant="primary">เพิ่มห้องและนักเรียน</ButtonLink>} />
      </>
    )

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function print(mode: PrintMode) {
    setPrintMode(mode)
    setTimeout(() => window.print(), 50)
  }

  function exportCSV() {
    if (!room) return
    const header = ['เลขที่', 'เลขประจำตัว', 'ชื่อ-สกุล', ...subjects.map((s) => `${s.code || s.name} (ค้าง)`), 'ค้างรวม', 'ส่งช้า', 'งานที่ค้าง']
    const body = rows.map((r) => [
      r.student.number ?? '',
      r.student.student_code,
      studentName(r.student),
      ...r.perSubject,
      r.missing.length,
      r.late,
      r.missing.map((m) => `${m.subject.code || m.subject.name}: ${m.assignment.title} (ส่ง ${fmtDate(m.due)})`).join(' | '),
    ])
    downloadFile(`งานค้าง_${classroomLabel(room).replace('/', '-')}_${term.semester}-${term.academic_year}.csv`, toCSV([header, ...body]))
  }

  return (
    <>
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm; } }'}</style>
      <div className={cn(printMode === 'letters' && 'print:hidden')}>
      <PageHeader
        title="ติดตามงานค้าง"
        subtitle={`ใครยังไม่ส่งงานอะไร ในทุกรายวิชา · ${termLongLabel(term)}`}
        actions={
          <>
            {!ARTIFACT && (
              <>
                <Button icon={<Printer className="size-4" />} onClick={() => print('table')} disabled={rows.length === 0}>
                  พิมพ์ตาราง
                </Button>
                <Button icon={<FileText className="size-4" />} onClick={() => print('letters')} disabled={withMissing === 0}>
                  พิมพ์ใบแจ้งผู้ปกครอง
                </Button>
              </>
            )}
            <Button variant="primary" icon={<Download className="size-4" />} onClick={exportCSV} disabled={rows.length === 0}>
              ส่งออก CSV
            </Button>
          </>
        }
      />
      </div>

      <div className="no-print mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select className="w-32" value={room.id} onChange={(e) => setParams({ room: e.target.value }, { replace: true })} aria-label="ห้อง">
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {classroomLabel(r)}
            </option>
          ))}
        </Select>
        <Checkbox label="เฉพาะคนที่ค้าง" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
        <Checkbox label="รวมงานที่ยังไม่ถึงกำหนดส่ง" checked={includeNotDue} onChange={(e) => setIncludeNotDue(e.target.checked)} />
        <Checkbox label="เรียงคนค้างมากก่อน" checked={sortByMost} onChange={(e) => setSortByMost(e.target.checked)} />
      </div>

      {failed ? (
        <EmptyState title="โหลดข้อมูลไม่สำเร็จ" description={String((failed.error as Error)?.message ?? failed.error)} />
      ) : loading ? (
        <PageLoader />
      ) : subjects.length === 0 ? (
        <EmptyState title="ห้องนี้ยังไม่มีรายวิชา" action={<ButtonLink to="/subjects">จับคู่รายวิชากับห้อง</ButtonLink>} />
      ) : (
        <>
          <div className={cn(printMode === 'letters' && 'print:hidden')}>
            <div className="mb-3 hidden text-sm print:block">
              <div className="text-base font-semibold">รายงานงานค้าง ชั้น {classroomLabel(room)}</div>
              <div>
                {termLongLabel(term)} · ข้อมูล ณ {fmtDate(today)} {settings.teacher_name && `· ครู${settings.teacher_name}`}
              </div>
            </div>
            <div className="no-print mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <div className="text-xs text-slate-500">นักเรียนที่ค้างงาน</div>
                <div className="text-2xl font-bold text-rose-600">
                  {withMissing}
                  <span className="text-base font-normal text-slate-400"> / {all.length} คน</span>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-slate-500">งานค้างรวม</div>
                <div className="text-2xl font-bold">{totalMissing} <span className="text-base font-normal text-slate-400">งาน</span></div>
              </Card>
              <Card className="hidden p-4 sm:block">
                <div className="text-xs text-slate-500">รายวิชาในห้องนี้</div>
                <div className="text-2xl font-bold">{subjects.length} <span className="text-base font-normal text-slate-400">วิชา</span></div>
              </Card>
            </div>

            <div className="print-full scrollbar-thin overflow-auto rounded-2xl bg-white shadow-card ring-1 ring-slate-200/80">
              <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="w-12 border-b border-slate-200 px-2 py-2 text-center font-medium">ที่</th>
                    <th className="min-w-44 border-b border-slate-200 px-3 py-2 text-left font-medium">ชื่อ-สกุล</th>
                    {subjects.map((s) => (
                      <th key={s.id} className="min-w-16 border-b border-l border-slate-200 px-2 py-2 font-medium" title={s.name}>
                        <div className="text-slate-700">{s.code || s.name}</div>
                        {s.code && <div className="max-w-24 truncate font-normal text-slate-400">{s.name}</div>}
                      </th>
                    ))}
                    <th className="min-w-16 border-b border-l border-slate-200 bg-rose-50 px-2 py-2 font-semibold text-rose-700">ค้างรวม</th>
                    <th className="min-w-14 border-b border-slate-200 px-2 py-2 font-medium">ส่งช้า</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = open.has(r.student.id) || printMode === 'table'
                    return (
                      <Fragment key={r.student.id}>
                        <tr className="cursor-pointer hover:bg-slate-50" onClick={() => r.missing.length && toggle(r.student.id)}>
                          <td className="tabular border-b border-slate-100 px-2 py-2 text-center text-slate-500">{r.student.number ?? '–'}</td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <div className="flex items-center gap-1.5 font-medium text-slate-900">
                              {r.missing.length > 0 && (
                                <ChevronDown className={cn('no-print size-4 text-slate-400 transition-transform', open.has(r.student.id) && 'rotate-180')} />
                              )}
                              {studentName(r.student)}
                            </div>
                          </td>
                          {r.perSubject.map((n, i) => (
                            <td key={i} className={cn('tabular border-b border-l border-slate-100 px-2 py-2 text-center', n ? 'font-semibold text-rose-600' : 'text-slate-300')}>
                              {n || '–'}
                            </td>
                          ))}
                          <td className="tabular border-b border-l border-slate-100 bg-rose-50/40 px-2 py-2 text-center">
                            {r.missing.length ? <span className="font-bold text-rose-600">{r.missing.length}</span> : <span className="text-emerald-600">✓</span>}
                          </td>
                          <td className="tabular border-b border-slate-100 px-2 py-2 text-center text-amber-700">{r.late || ''}</td>
                        </tr>
                        {r.missing.length > 0 && (
                          <tr className={cn(!open.has(r.student.id) && 'hidden', isOpen && 'print:table-row')}>
                            <td />
                            <td colSpan={subjects.length + 3} className="border-b border-slate-100 bg-slate-50/60 px-3 py-2">
                              <ul className="grid gap-x-6 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2">
                                {r.missing.map((m) => (
                                  <li key={m.assignment.id}>
                                    <span className="font-medium text-slate-800">{m.subject.code || m.subject.name}</span> · {m.assignment.title}{' '}
                                    <span className={m.overdue ? 'text-rose-500' : 'text-slate-400'}>
                                      ({m.overdue ? 'กำหนดส่ง' : 'ส่งภายใน'} {fmtDate(m.due)})
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              {rows.length === 0 && <div className="p-8 text-center text-sm text-slate-500">ไม่มีนักเรียนค้างงาน 🎉</div>}
            </div>
            <p className="no-print mt-2 text-xs text-slate-500">กดที่ชื่อเพื่อดูรายการงานที่ค้าง · นับเฉพาะงานที่{includeNotDue ? 'ยังไม่ส่งทั้งหมด' : 'เลยกำหนดส่งแล้ว'}</p>
          </div>

          {/* ใบแจ้งผู้ปกครอง: พิมพ์คนละใบ */}
          <div className={cn('hidden', printMode === 'letters' && 'print:block')}>
            {all
              .filter((r) => r.missing.length > 0)
              .map((r) => (
                <div key={r.student.id} className="break-after-page break-inside-avoid py-2 text-[13pt] leading-relaxed">
                  <div className="text-center font-semibold">{settings.school_name || 'แจ้งงานค้าง'}</div>
                  <div className="mb-4 text-center">แจ้งงานค้างส่ง · {termLongLabel(term)}</div>
                  <p>เรียน ผู้ปกครองของ <b>{studentName(r.student)}</b> ชั้น {classroomLabel(room)} เลขที่ {r.student.number ?? '–'}</p>
                  <p className="mt-2">ณ วันที่ {fmtDate(today)} นักเรียนยังไม่ได้ส่งงาน {r.missing.length} รายการ ดังนี้</p>
                  <table className="mt-3 w-full border-collapse text-[11pt]">
                    <thead>
                      <tr>
                        <th className="border border-slate-400 px-2 py-1">ที่</th>
                        <th className="border border-slate-400 px-2 py-1 text-left">รายวิชา</th>
                        <th className="border border-slate-400 px-2 py-1 text-left">งาน</th>
                        <th className="border border-slate-400 px-2 py-1">กำหนดส่ง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.missing.map((m, i) => (
                        <tr key={m.assignment.id}>
                          <td className="border border-slate-400 px-2 py-1 text-center">{i + 1}</td>
                          <td className="border border-slate-400 px-2 py-1">
                            {m.subject.code} {m.subject.name}
                          </td>
                          <td className="border border-slate-400 px-2 py-1">{m.assignment.title}</td>
                          <td className="border border-slate-400 px-2 py-1 text-center">{fmtDate(m.due)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3">จึงเรียนมาเพื่อโปรดกำกับติดตามให้นักเรียนส่งงานให้ครบ</p>
                  <div className="mt-10 ml-auto w-64 text-center">
                    <div>ลงชื่อ ......................................</div>
                    <div className="mt-1">({settings.teacher_name || '......................................'})</div>
                    <div>ครูผู้สอน</div>
                  </div>
                  <div className="mt-8 border-t border-dashed border-slate-400 pt-3 text-[11pt]">
                    ได้รับทราบแล้ว ลงชื่อผู้ปกครอง ...................................... วันที่ ...................
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </>
  )
}
