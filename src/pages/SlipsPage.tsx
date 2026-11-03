import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Printer } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useClassrooms, useStudents } from '@/hooks/queries'
import { formatAccessCode, portalUrl } from '@/lib/access'
import { ARTIFACT } from '@/lib/env'
import { classroomLabel, studentName, termLabel } from '@/lib/utils'
import { QrCode } from '@/components/QrCode'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { Select } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/Misc'

/** ใบรหัสดูคะแนน พิมพ์แล้วตัดแจกนักเรียน (A4 ได้ 10 ใบ) */
export default function SlipsPage() {
  const { term, settings } = useApp()
  const [params, setParams] = useSearchParams()
  const classroomsQ = useClassrooms(term.id)
  const studentsQ = useStudents(term.id)
  const classrooms = useMemo(() => classroomsQ.data ?? [], [classroomsQ.data])
  const roomId = params.get('room') ?? classrooms[0]?.id ?? ''
  const room = classrooms.find((c) => c.id === roomId)
  const students = useMemo(() => (studentsQ.data ?? []).filter((s) => s.classroom_id === roomId), [studentsQ.data, roomId])

  if (classroomsQ.isPending || studentsQ.isPending) return <PageLoader />

  return (
    <>
      <style>{'@media print { @page { size: A4 portrait; margin: 8mm; } }'}</style>
      <PageHeader
        back="/students"
        title="ใบรหัสดูคะแนน"
        subtitle={`พิมพ์แล้วตัดตามเส้นประ แจกนักเรียนคนละใบ · ภาค ${termLabel(term)}`}
        actions={
          <>
            <Select className="w-32" value={roomId} onChange={(e) => setParams({ room: e.target.value }, { replace: true })} aria-label="ห้อง">
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {classroomLabel(c)}
                </option>
              ))}
            </Select>
            {!ARTIFACT && (
              <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={students.length === 0}>
                พิมพ์
              </Button>
            )}
          </>
        }
      />
      {students.length === 0 ? (
        <EmptyState title="ห้องนี้ยังไม่มีนักเรียน" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-0">
          {students.map((s) => (
            <div
              key={s.id}
              className="flex break-inside-avoid items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-3 print:rounded-none print:p-[4mm]"
            >
              <QrCode value={portalUrl(s.access_code)} className="size-28 shrink-0 print:size-[30mm]" label={`QR ของ ${s.first_name}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-slate-500">
                  {settings.school_name || 'ดูคะแนนการส่งงาน'}
                  {settings.teacher_name && ` · ${settings.teacher_name}`}
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">{studentName(s)}</div>
                <div className="text-xs text-slate-500">
                  {room && `ชั้น ${classroomLabel(room)}`}
                  {s.number != null && ` · เลขที่ ${s.number}`}
                </div>
                <div className="mt-1.5 text-[10px] text-slate-400">รหัสดูคะแนน</div>
                <div className="font-mono text-xl leading-tight font-bold tracking-widest text-slate-900">{formatAccessCode(s.access_code)}</div>
                <div className="mt-1 truncate text-[10px] text-slate-500">สแกน QR หรือเข้า {portalUrl()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
