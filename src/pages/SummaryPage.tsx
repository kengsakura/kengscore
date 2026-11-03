import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { BookOpen, Download, Layers, Printer } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAssignments, useClassrooms, useDueDates, useGroups, useRoomStudents, useRoomSubmissions, useSubjects } from '@/hooks/queries'
import type { Assignment } from '@/lib/api/types'
import { toCSV } from '@/lib/csv'
import { buildGradebook, columnMax, sortByCategory, type GradeCell, type GradeRow, type MainColumn } from '@/lib/gradebook'
import { ScoreGroupsModal } from '@/components/ScoreGroupsModal'
import { classroomLabel, cn, downloadFile, fmtDate, fmtDateShort, fmtScore, studentName, termLongLabel } from '@/lib/utils'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ARTIFACT } from '@/lib/env'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { Checkbox, Select } from '@/components/ui/Form'
import { PageHeader, Segmented } from '@/components/ui/Misc'

type View = 'main' | 'detail' | 'category'

const pct = (v: number, max: number) => (max > 0 ? Math.round((v / max) * 1000) / 10 : 0)

function gradeTone(p: number) {
  if (p >= 80) return 'text-emerald-700'
  if (p >= 50) return 'text-slate-900'
  return 'text-rose-600'
}

export default function SummaryPage() {
  const { term, settings } = useApp()
  const [params, setParams] = useSearchParams()
  const [viewChoice, setView] = useState<View | null>(null)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [onlyMissing, setOnlyMissing] = useState(false)

  const subjectsQ = useSubjects(term.id)
  const classroomsQ = useClassrooms(term.id)
  const subjects = subjectsQ.data ?? []
  const subject = subjects.find((s) => s.id === params.get('subject')) ?? subjects[0]
  const rooms = (classroomsQ.data ?? []).filter((c) => subject?.classroom_ids.includes(c.id))
  const room = rooms.find((r) => r.id === params.get('room')) ?? rooms[0]

  const studentsQ = useRoomStudents(term.id, room?.id)
  const assignmentsQ = useAssignments(subject?.id)
  const dueDatesQ = useDueDates(subject?.id)
  const subsQ = useRoomSubmissions(subject?.id, room?.id, studentsQ.data, studentsQ.isSuccess)
  const groupsQ = useGroups(subject?.id)
  const scoreGroups = useMemo(() => groupsQ.data ?? [], [groupsQ.data])

  const assignments = useMemo(
    () => sortByCategory(assignmentsQ.data ?? [], settings.categories),
    [assignmentsQ.data, settings.categories],
  )
  const book = useMemo(
    () =>
      buildGradebook(studentsQ.data, assignments, subsQ.data ?? [], dueDatesQ.data ?? [], room?.id ?? '', settings.late_policy, scoreGroups),
    [studentsQ.data, assignments, subsQ.data, dueDatesQ.data, room?.id, settings.late_policy, scoreGroups],
  )
  const groups = useMemo(() => {
    const out: { category: string; items: Assignment[] }[] = []
    for (const a of assignments) {
      const last = out[out.length - 1]
      if (last && last.category === a.category) last.items.push(a)
      else out.push({ category: a.category, items: [a] })
    }
    return out
  }, [assignments])

  if (subjectsQ.isPending || classroomsQ.isPending) return <PageLoader />
  if (!subject)
    return (
      <>
        <PageHeader title="คะแนนรวม" />
        <EmptyState
          icon={<BookOpen />}
          title="ยังไม่มีรายวิชา"
          description="เพิ่มรายวิชาและจับคู่ห้องก่อน"
          action={<ButtonLink to="/subjects" variant="primary">ไปหน้ารายวิชา</ButtonLink>}
        />
      </>
    )

  const select = (key: 'subject' | 'room', value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    if (key === 'subject') next.delete('room')
    setParams(next, { replace: true })
  }

  const hasGroups = book.columns.some((c) => c.kind === 'group')
  const view: View = viewChoice === 'main' && !hasGroups ? 'detail' : (viewChoice ?? (hasGroups ? 'main' : 'detail'))
  const colLabel = (c: MainColumn) => (c.kind === 'group' ? c.group.name : c.assignment.title)
  const full = subject.full_score
  const rows = onlyMissing ? book.rows.filter((r) => r.missing > 0) : book.rows
  const loading = studentsQ.isPending || assignmentsQ.isPending || subsQ.isPending

  const categoryTotals = (r: GradeRow) =>
    groups.map((g) => {
      const cells = r.cells.filter((c) => c.assignment.category === g.category)
      return {
        score: cells.reduce((n, c) => n + (c.result?.final ?? 0), 0),
        max: cells.reduce((n, c) => n + c.assignment.max_score, 0),
        missing: cells.filter((c) => !c.sub).length,
      }
    })

  function exportCSV() {
    if (!subject || !room) return
    const header = ['เลขที่', 'เลขประจำตัว', 'ชื่อ-สกุล']
    if (view === 'detail') assignments.forEach((a) => header.push(`${a.title} (${fmtScore(a.max_score)})`))
    else if (view === 'main') book.columns.forEach((c) => header.push(`${colLabel(c)} (${fmtScore(columnMax(c))})`))
    else groups.forEach((g) => header.push(`${g.category} (${fmtScore(g.items.reduce((n, a) => n + a.max_score, 0))})`))
    header.push(`รวม (${fmtScore(book.maxTotal)})`, 'ร้อยละ')
    if (full) header.push(`คิดเป็น (${fmtScore(full)})`)
    header.push('ค้างส่ง', 'ส่งช้า')
    const body = rows.map((r) => {
      const line: (string | number)[] = [r.student.number ?? '', r.student.student_code, studentName(r.student)]
      if (view === 'detail') r.cells.forEach((c) => line.push(c.result ? c.result.final : ''))
      else if (view === 'main') r.main.forEach((m) => line.push(m.score))
      else categoryTotals(r).forEach((t) => line.push(Math.round(t.score * 100) / 100))
      line.push(r.total, pct(r.total, r.max))
      if (full) line.push(book.maxTotal ? Math.round((r.total / book.maxTotal) * full * 100) / 100 : 0)
      line.push(r.missing, r.late)
      return line
    })
    const name = `คะแนน_${subject.code || subject.name}_${classroomLabel(room).replace('/', '-')}_${term.semester}-${term.academic_year}.csv`
    downloadFile(name, toCSV([header, ...body]))
  }

  return (
    <>
      <PageHeader
        title="คะแนนรวม"
        subtitle={termLongLabel(term)}
        actions={
          <>
            <Button icon={<Layers className="size-4" />} onClick={() => setGroupsOpen(true)} disabled={assignments.length === 0}>
              รวมคะแนนย่อย
            </Button>
            {!ARTIFACT && (
              <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
                พิมพ์
              </Button>
            )}
            <Button variant="primary" icon={<Download className="size-4" />} onClick={exportCSV} disabled={!room}>
              ส่งออก Excel (CSV)
            </Button>
          </>
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Select className="w-full sm:w-72" value={subject.id} onChange={(e) => select('subject', e.target.value)} aria-label="รายวิชา">
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code ? `${s.code} ` : ''}
              {s.name}
            </option>
          ))}
        </Select>
        {rooms.length > 0 && (
          <Select className="w-32" value={room?.id} onChange={(e) => select('room', e.target.value)} aria-label="ห้อง">
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {classroomLabel(r)}
              </option>
            ))}
          </Select>
        )}
        <Segmented
          value={view}
          onChange={setView}
          options={[
            ...(hasGroups ? [{ value: 'main' as const, label: 'คะแนนหลัก' }] : []),
            { value: 'detail' as const, label: 'รายงาน' },
            { value: 'category' as const, label: 'ตามประเภท' },
          ]}
        />
        <Checkbox className="ml-1" label="เฉพาะคนที่ค้างงาน" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
      </div>

      <ScoreGroupsModal open={groupsOpen} onClose={() => setGroupsOpen(false)} subjectId={subject.id} assignments={assignments} groups={scoreGroups} />

      {/* หัวกระดาษตอนพิมพ์ */}
      <div className="mb-3 hidden text-sm print:block">
        <div className="text-base font-semibold">
          แบบบันทึกคะแนน {subject.code} {subject.name} ชั้น {classroomLabel(room)}
        </div>
        <div>
          {termLongLabel(term)} {settings.school_name && `· ${settings.school_name}`} {settings.teacher_name && `· ผู้สอน ${settings.teacher_name}`}
        </div>
      </div>

      {!room ? (
        <EmptyState title="รายวิชานี้ยังไม่ได้จับคู่ห้อง" action={<ButtonLink to="/subjects">จับคู่ห้อง</ButtonLink>} />
      ) : loading ? (
        <PageLoader />
      ) : assignments.length === 0 ? (
        <EmptyState title="ยังไม่มีงานในรายวิชานี้" action={<ButtonLink to={`/scores/${subject.id}/${room.id}`} variant="primary">สร้างงาน</ButtonLink>} />
      ) : (
        <>
          <div className="print-full scrollbar-thin max-h-[calc(100dvh-15rem)] overflow-auto rounded-2xl bg-white shadow-card ring-1 ring-slate-200/80 lg:max-h-[calc(100dvh-13rem)]">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20 bg-slate-50 text-xs text-slate-600">
                {view === 'detail' && (
                  <tr>
                    <th colSpan={2} className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50" />
                    {groups.map((g) => (
                      <th
                        key={g.category}
                        colSpan={g.items.length}
                        className="border-b border-l border-slate-200 px-2 py-1.5 text-center font-semibold text-indigo-700"
                      >
                        {g.category}
                      </th>
                    ))}
                    <th colSpan={full ? 4 : 3} className="border-b border-l border-slate-200 bg-indigo-50 px-2 py-1.5 font-semibold text-indigo-800">
                      สรุป
                    </th>
                  </tr>
                )}
                <tr>
                  <th className="sticky left-0 z-10 w-12 border-b border-slate-200 bg-slate-50 px-2 py-2 text-center font-medium">ที่</th>
                  <th className="sticky left-12 z-10 min-w-44 border-r border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium sm:min-w-56">
                    ชื่อ-สกุล
                  </th>
                  {view === 'main'
                    ? book.columns.map((c) => (
                        <th
                          key={c.kind === 'group' ? c.group.id : c.assignment.id}
                          className={cn('min-w-20 border-b border-l border-slate-200 px-2 py-2 align-bottom font-medium', c.kind === 'group' && 'bg-violet-50')}
                          title={c.kind === 'group' ? c.members.map((a) => a.title).join(', ') : c.assignment.title}
                        >
                          <div className={cn('line-clamp-2 leading-tight', c.kind === 'group' ? 'text-violet-800' : 'text-slate-700')}>{colLabel(c)}</div>
                          <div className="mt-0.5 font-normal text-slate-400">
                            {c.kind === 'group' ? `${c.members.length} งาน · ` : ''}/{fmtScore(columnMax(c))}
                          </div>
                        </th>
                      ))
                    : view === 'detail'
                    ? book.stats.map((st) => (
                        <th key={st.assignment.id} className="w-20 max-w-24 border-b border-l border-slate-200 px-1.5 py-2 align-bottom font-medium" title={`${st.assignment.title} · ส่ง ${fmtDate(st.due)}`}>
                          <div className="line-clamp-2 leading-tight text-slate-700">{st.assignment.title}</div>
                          <div className="mt-0.5 font-normal text-slate-400">
                            {fmtDateShort(st.due)} · /{fmtScore(st.assignment.max_score)}
                          </div>
                        </th>
                      ))
                    : groups.map((g) => (
                        <th key={g.category} className="min-w-24 border-b border-l border-slate-200 px-2 py-2 font-medium">
                          <div className="text-slate-700">{g.category}</div>
                          <div className="font-normal text-slate-400">
                            {g.items.length} งาน · /{fmtScore(g.items.reduce((n, a) => n + a.max_score, 0))}
                          </div>
                        </th>
                      ))}
                  <th className="min-w-16 border-b border-l border-slate-200 bg-indigo-50 px-2 py-2 font-semibold text-indigo-800">
                    รวม
                    <div className="font-normal text-indigo-500">/{fmtScore(book.maxTotal)}</div>
                  </th>
                  <th className="min-w-14 border-b border-slate-200 bg-indigo-50 px-2 py-2 font-semibold text-indigo-800">%</th>
                  {full && (
                    <th className="min-w-16 border-b border-slate-200 bg-indigo-50 px-2 py-2 font-semibold text-indigo-800">
                      คิดเป็น
                      <div className="font-normal text-indigo-500">/{fmtScore(full)}</div>
                    </th>
                  )}
                  <th className="min-w-14 border-b border-slate-200 bg-indigo-50 px-2 py-2 font-semibold text-indigo-800">ค้าง</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = pct(r.total, r.max)
                  return (
                    <tr key={r.student.id} className="group">
                      <td className="tabular sticky left-0 z-10 border-b border-slate-100 bg-white px-2 py-2 text-center text-slate-500 group-hover:bg-slate-50">
                        {r.student.number ?? '–'}
                      </td>
                      <td className="sticky left-12 z-10 border-r border-b border-slate-100 bg-white px-3 py-2 group-hover:bg-slate-50">
                        <div className="truncate font-medium text-slate-900">{studentName(r.student)}</div>
                        {r.student.student_code && <div className="text-[11px] text-slate-400">{r.student.student_code}</div>}
                      </td>
                      {view === 'main'
                        ? r.main.map((m, i) => (
                            <td key={i} className={cn('tabular border-b border-l border-slate-100 px-2 py-2 text-center group-hover:bg-slate-50', book.columns[i].kind === 'group' && 'bg-violet-50/40')}>
                              {book.columns[i].kind === 'assignment' && m.missing ? (
                                <span className="text-rose-400">–</span>
                              ) : (
                                <span className="font-medium">{fmtScore(m.score)}</span>
                              )}
                              {book.columns[i].kind === 'group' && m.missing > 0 && <div className="text-[11px] text-rose-500">ขาด {m.missing}</div>}
                            </td>
                          ))
                        : view === 'detail'
                        ? r.cells.map((c) => <ScoreCell key={c.assignment.id} cell={c} />)
                        : categoryTotals(r).map((t, i) => (
                            <td key={i} className="tabular border-b border-l border-slate-100 px-2 py-2 text-center group-hover:bg-slate-50">
                              <span className="font-medium">{fmtScore(Math.round(t.score * 100) / 100)}</span>
                              <span className="text-slate-400">/{fmtScore(t.max)}</span>
                              {t.missing > 0 && <div className="text-[11px] text-rose-500">ขาด {t.missing}</div>}
                            </td>
                          ))}
                      <td className="tabular border-b border-l border-slate-100 bg-indigo-50/40 px-2 py-2 text-center font-semibold">{fmtScore(r.total)}</td>
                      <td className={cn('tabular border-b border-slate-100 bg-indigo-50/40 px-2 py-2 text-center font-medium', gradeTone(p))}>{p}</td>
                      {full && (
                        <td className="tabular border-b border-slate-100 bg-indigo-50/40 px-2 py-2 text-center font-semibold">
                          {fmtScore(book.maxTotal ? Math.round((r.total / book.maxTotal) * full * 100) / 100 : 0)}
                        </td>
                      )}
                      <td className="tabular border-b border-slate-100 bg-indigo-50/40 px-2 py-2 text-center">
                        {r.missing > 0 ? <span className="font-semibold text-rose-600">{r.missing}</span> : <span className="text-emerald-600">✓</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {view === 'detail' && rows.length > 0 && (
                <tfoot className="sticky bottom-0 z-20 bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <td colSpan={2} className="sticky left-0 z-10 border-t border-r border-slate-200 bg-slate-50 px-3 py-2 font-medium">
                      ส่งแล้ว / เฉลี่ย
                    </td>
                    {book.stats.map((st) => (
                      <td key={st.assignment.id} className="tabular border-t border-l border-slate-200 px-1.5 py-2 text-center">
                        <div className="font-medium text-slate-700">
                          {st.submitted}/{book.rows.length}
                        </div>
                        <div className="text-slate-400">{st.average == null ? '–' : fmtScore(st.average)}</div>
                      </td>
                    ))}
                    <td colSpan={full ? 4 : 3} className="border-t border-l border-slate-200 bg-indigo-50 px-2 py-2 text-center text-indigo-800">
                      เฉลี่ยห้อง{' '}
                      <b>
                        {book.rows.length
                          ? fmtScore(Math.round((book.rows.reduce((n, r) => n + r.total, 0) / book.rows.length) * 100) / 100)
                          : '–'}
                      </b>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            {rows.length === 0 && <div className="p-8 text-center text-sm text-slate-500">ไม่มีนักเรียนค้างงาน 🎉</div>}
          </div>
          <div className="no-print mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-rose-50 ring-1 ring-rose-200" /> ไม่ส่ง
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-amber-50 ring-1 ring-amber-200" /> ส่งช้า (หักแล้ว)
            </span>
            <span>คะแนนในตารางเป็นคะแนนสุทธิหลังหักส่งช้า · ชี้ที่ช่องเพื่อดูรายละเอียด</span>
            {hasGroups && <span className="text-violet-700">"รวม" คิดจากคะแนนหลัก (กลุ่มคะแนน + งานเดี่ยว)</span>}
          </div>
        </>
      )}
    </>
  )
}

function ScoreCell({ cell }: { cell: GradeCell }) {
  const { sub, result, assignment } = cell
  if (!sub || !result)
    return (
      <td className="border-b border-l border-slate-100 bg-rose-50/60 px-1.5 py-2 text-center text-rose-400" title="ยังไม่ส่ง">
        –
      </td>
    )
  const late = result.lateDays > 0
  const title = [
    `ส่ง ${fmtDate(sub.submitted_on)}`,
    late ? `ช้า ${result.lateDays} วัน${sub.exempt ? ' (ยกเว้นหัก)' : ''}` : 'ตรงเวลา',
    result.deducted > 0 ? `ทำได้ ${fmtScore(sub.raw_score)} หัก ${fmtScore(result.deducted)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <td
      className={cn(
        'tabular border-b border-l border-slate-100 px-1.5 py-2 text-center group-hover:bg-slate-50',
        late && !sub.exempt && 'bg-amber-50/70 text-amber-800',
        result.final === assignment.max_score && 'font-medium',
      )}
      title={title}
    >
      {fmtScore(result.final)}
      {result.deducted > 0 && <sup className="ml-0.5 text-[9px] text-amber-600">−{fmtScore(result.deducted)}</sup>}
    </td>
  )
}
