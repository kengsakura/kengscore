import { useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, ExternalLink, Eye, Link2, Printer, RotateCcw, TriangleAlert } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { qk } from '@/hooks/queries'
import { getApi } from '@/lib/api'
import type { Classroom, Student } from '@/lib/api/types'
import { formatAccessCode, portalUrl } from '@/lib/access'
import { ARTIFACT } from '@/lib/env'
import { classroomLabel, copyText, errorMessage, studentName } from '@/lib/utils'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Modal, useConfirm } from '@/components/ui/Modal'

/** เปิดหน้าของนักเรียน: แท็บใหม่ (เวอร์ชันจริง) หรือเปลี่ยนหน้าในแอป (หน้าตัวอย่าง) */
export function StudentViewLink({ code, className, children }: { code: string; className?: string; children: React.ReactNode }) {
  if (ARTIFACT) {
    return (
      <Link to={`/s/${code}`} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <a href={portalUrl(code)} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  )
}

export function AccessCodesModal({
  open,
  onClose,
  students,
  classrooms,
  room,
}: {
  open: boolean
  onClose: () => void
  students: Student[]
  classrooms: Classroom[]
  room?: Classroom
}) {
  const { settings, term } = useApp()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const roomOf = new Map(classrooms.map((c) => [c.id, c]))

  async function regenerate(ids: string[], label: string) {
    const ok = await confirm({
      title: `สร้างรหัสใหม่ให้ ${label}?`,
      message: 'รหัสเดิมและ QR เดิมจะใช้ไม่ได้ทันที ต้องแจกรหัสใหม่ให้นักเรียน',
      confirmText: 'สร้างรหัสใหม่',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await getApi().regenerateAccessCodes(ids)
      await qc.invalidateQueries({ queryKey: qk.students(term.id) })
      toast.success('สร้างรหัสใหม่แล้ว')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const listText = () =>
    [
      `ดูคะแนนได้ที่ ${portalUrl()}`,
      ...students.map((s) => `${s.number ?? '-'} ${studentName(s)}  รหัส ${formatAccessCode(s.access_code)}  ${portalUrl(s.access_code)}`),
    ].join('\n')

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="รหัสดูคะแนนของนักเรียน"
      description={room ? `ห้อง ${classroomLabel(room)} · ${students.length} คน` : `ทุกห้อง · ${students.length} คน`}
    >
      <div className="space-y-4">
        {!settings.portal_enabled && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              ตอนนี้ปิดการดูคะแนนอยู่ นักเรียนจะเข้าไม่ได้ —{' '}
              <Link to="/settings#portal" onClick={onClose} className="font-medium underline">
                เปิดในหน้าตั้งค่า
              </Link>
            </span>
          </div>
        )}
        <div className="rounded-2xl bg-indigo-50/60 p-3.5 ring-1 ring-indigo-100">
          <p className="text-sm text-slate-700">
            นักเรียนสแกน QR บนใบรหัส หรือเข้าเว็บด้านล่างแล้วกรอกรหัสของตัวเอง ไม่ต้องสมัคร
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-white px-2.5 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-100 select-all">{portalUrl()}</code>
            <Button size="sm" icon={<Copy className="size-4" />} onClick={() => copyText(portalUrl(), 'คัดลอกลิงก์แล้ว')}>
              คัดลอก
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/students/slips${room ? `?room=${room.id}` : ''}`} variant="primary" icon={<Printer className="size-4" />} onClick={onClose}>
            พิมพ์ใบรหัส + QR
          </ButtonLink>
          <Button icon={<Copy className="size-4" />} onClick={() => copyText(listText(), 'คัดลอกรายชื่อพร้อมรหัสแล้ว — วางใน LINE ได้เลย')} disabled={students.length === 0}>
            คัดลอกรายชื่อ + รหัส
          </Button>
          <Button
            variant="ghost"
            icon={<RotateCcw className="size-4" />}
            loading={busy}
            disabled={students.length === 0}
            onClick={() => regenerate(students.map((s) => s.id), room ? `ทั้งห้อง ${classroomLabel(room)}` : `ทั้ง ${students.length} คน`)}
          >
            สร้างรหัสใหม่ทั้งหมด
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-12 px-2 py-2 text-center font-medium">ที่</th>
                <th className="px-2 py-2 text-left font-medium">ชื่อ-สกุล</th>
                <th className="px-2 py-2 text-left font-medium">รหัส</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="tabular px-2 py-2 text-center text-slate-500">{s.number ?? '–'}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-slate-900">{studentName(s)}</div>
                    {!room && <div className="text-xs text-slate-400">{classroomLabel(roomOf.get(s.classroom_id))}</div>}
                  </td>
                  <td className="px-2 py-2 font-mono font-semibold tracking-wider text-slate-800 select-all">{formatAccessCode(s.access_code)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        title="คัดลอกลิงก์ของนักเรียนคนนี้"
                        aria-label={`คัดลอกลิงก์ ${s.first_name}`}
                        onClick={() => copyText(portalUrl(s.access_code), `คัดลอกลิงก์ของ ${s.first_name} แล้ว`)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Link2 className="size-4" />
                      </button>
                      <StudentViewLink code={s.access_code} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <span className="sr-only">ดูหน้าของ {s.first_name}</span>
                        {ARTIFACT ? <Eye className="size-4" /> : <ExternalLink className="size-4" />}
                      </StudentViewLink>
                      <button
                        type="button"
                        title="สร้างรหัสใหม่"
                        aria-label={`สร้างรหัสใหม่ ${s.first_name}`}
                        onClick={() => regenerate([s.id], s.first_name)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <RotateCcw className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
