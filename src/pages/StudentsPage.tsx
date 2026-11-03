import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowRightLeft, Copy, DoorOpen, Download, KeyRound, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/context/AppContext'
import { qk, useClassrooms, useStudents } from '@/hooks/queries'
import { getApi } from '@/lib/api'
import type { Student } from '@/lib/api/types'
import { toCSV } from '@/lib/csv'
import { classroomLabel, cn, downloadFile, errorMessage, studentName, termLabel, termLongLabel } from '@/lib/utils'
import { ClassroomsModal, CopyStudentsModal, ImportStudentsModal, StudentFormModal } from '@/components/StudentModals'
import { AccessCodesModal } from '@/components/AccessCodes'
import { formatAccessCode, portalUrl } from '@/lib/access'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Form'
import { Card, PageHeader } from '@/components/ui/Misc'
import { useConfirm } from '@/components/ui/Modal'

type ModalName = 'add' | 'edit' | 'import' | 'copy' | 'rooms' | 'codes' | null

export default function StudentsPage() {
  const { term, terms } = useApp()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const classroomsQ = useClassrooms(term.id)
  const studentsQ = useStudents(term.id)
  const classrooms = useMemo(() => classroomsQ.data ?? [], [classroomsQ.data])
  const students = useMemo(() => studentsQ.data ?? [], [studentsQ.data])

  const [roomId, setRoomId] = useState<string>('__all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalName>(null)
  const [editing, setEditing] = useState<Student | undefined>()

  const roomOf = useMemo(() => new Map(classrooms.map((c) => [c.id, c])), [classrooms])
  const currentRoom = roomId === '__all' ? undefined : roomOf.get(roomId)
  const q = search.trim().toLowerCase()
  const list = useMemo(() => {
    const inRoom = roomId === '__all' ? students : students.filter((s) => s.classroom_id === roomId)
    const sorted =
      roomId === '__all'
        ? [...inRoom].sort((a, b) => {
            const ra = roomOf.get(a.classroom_id)
            const rb = roomOf.get(b.classroom_id)
            return classrooms.indexOf(ra!) - classrooms.indexOf(rb!) || (a.number ?? 999) - (b.number ?? 999)
          })
        : inRoom
    if (!q) return sorted
    return sorted.filter(
      (s) => String(s.number ?? '') === q || s.student_code.includes(q) || studentName(s).toLowerCase().includes(q),
    )
  }, [students, roomId, q, roomOf, classrooms])

  if (classroomsQ.isPending || studentsQ.isPending) return <PageLoader />

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.students(term.id) }),
      qc.invalidateQueries({ queryKey: ['submissions'] }),
    ])

  const allChecked = list.length > 0 && list.every((s) => selected.has(s.id))
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(list.map((s) => s.id)))
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function removeStudents(ids: string[]) {
    const ok = await confirm({
      title: `ลบนักเรียน ${ids.length} คน?`,
      message: 'คะแนนการส่งงานทั้งหมดของนักเรียนเหล่านี้จะถูกลบด้วย',
      confirmText: 'ลบ',
      danger: true,
    })
    if (!ok) return
    try {
      await getApi().deleteStudents(ids)
      await invalidate()
      setSelected(new Set())
      toast.success(`ลบแล้ว ${ids.length} คน`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function moveTo(targetId: string) {
    const target = roomOf.get(targetId)
    if (!target) return
    const rows = students.filter((s) => selected.has(s.id)).map((s) => ({ ...s, classroom_id: target.id }))
    try {
      await getApi().updateStudents(rows)
      await invalidate()
      setSelected(new Set())
      toast.success(`ย้าย ${rows.length} คนไป ${classroomLabel(target)} แล้ว`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  function exportCSV() {
    const rows = list.map((s) => {
      const c = roomOf.get(s.classroom_id)
      return [
        c?.grade ?? '',
        c?.room ?? '',
        s.number ?? '',
        s.student_code,
        s.prefix,
        s.first_name,
        s.last_name,
        formatAccessCode(s.access_code),
        portalUrl(s.access_code),
      ]
    })
    downloadFile(
      `รายชื่อนักเรียน_${currentRoom ? classroomLabel(currentRoom).replace('/', '-') + '_' : ''}${term.semester}-${term.academic_year}.csv`,
      toCSV([['ชั้น', 'ห้อง', 'เลขที่', 'เลขประจำตัว', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'รหัสดูคะแนน', 'ลิงก์ดูคะแนน'], ...rows]),
    )
  }

  const countIn = (id: string) => students.filter((s) => s.classroom_id === id).length

  return (
    <>
      <PageHeader
        title="นักเรียน"
        subtitle={`${termLongLabel(term)} · ${students.length} คน · ${classrooms.length} ห้อง`}
        actions={
          <>
            {terms.length > 1 && (
              <Button icon={<Copy className="size-4" />} onClick={() => setModal('copy')}>
                คัดลอกจากภาคอื่น
              </Button>
            )}
            <Button icon={<Upload className="size-4" />} onClick={() => setModal('import')}>
              นำเข้า / วางจาก Excel
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(undefined)
                setModal('add')
              }}
            >
              เพิ่มนักเรียน
            </Button>
          </>
        }
      />

      {students.length === 0 && classrooms.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={`ยังไม่มีนักเรียนในภาค ${termLabel(term)}`}
          description="วางรายชื่อจาก Excel ได้ทีเดียวทั้งห้อง หรือเพิ่มทีละคน"
          action={
            <>
              <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setModal('import')}>
                นำเข้าจาก Excel
              </Button>
              {terms.length > 1 && (
                <Button icon={<Copy className="size-4" />} onClick={() => setModal('copy')}>
                  คัดลอกจากภาคอื่น
                </Button>
              )}
              <Button icon={<Plus className="size-4" />} onClick={() => setModal('add')}>
                เพิ่มทีละคน
              </Button>
            </>
          }
        />
      ) : (
        <>
          <div className="scrollbar-thin -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {[{ id: '__all', label: 'ทั้งหมด', n: students.length }, ...classrooms.map((c) => ({ id: c.id, label: classroomLabel(c), n: countIn(c.id) }))].map(
              (r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRoomId(r.id)
                    setSelected(new Set())
                  }}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset',
                    roomId === r.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  {r.label}
                  <span className={cn('tabular text-xs', roomId === r.id ? 'text-slate-300' : 'text-slate-400')}>{r.n}</span>
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => setModal('rooms')}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-indigo-600 ring-1 ring-indigo-200 ring-inset hover:bg-indigo-50"
            >
              <DoorOpen className="size-4" /> จัดการห้อง
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา เลขที่ / ชื่อ / เลขประจำตัว" className="pl-9" />
            </div>
            {selected.size > 0 ? (
              <div className="flex items-center gap-2 rounded-xl bg-indigo-50 py-1 pr-1 pl-3 ring-1 ring-indigo-100">
                <span className="text-sm font-medium text-indigo-700">เลือก {selected.size} คน</span>
                <Select
                  className="w-36"
                  value=""
                  onChange={(e) => e.target.value && moveTo(e.target.value)}
                  aria-label="ย้ายไปห้อง"
                >
                  <option value="">ย้ายไปห้อง…</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {classroomLabel(c)}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => removeStudents([...selected])}>
                  ลบ
                </Button>
              </div>
            ) : (
              <>
                <Button icon={<KeyRound className="size-4" />} onClick={() => setModal('codes')} disabled={list.length === 0}>
                  รหัสดูคะแนน
                </Button>
                <Button icon={<Download className="size-4" />} onClick={exportCSV} disabled={list.length === 0}>
                  ส่งออก CSV
                </Button>
              </>
            )}
          </div>

          {list.length === 0 ? (
            <EmptyState
              title={q ? 'ไม่พบนักเรียนที่ค้นหา' : 'ห้องนี้ยังไม่มีนักเรียน'}
              action={
                !q && (
                  <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setModal('import')}>
                    นำเข้ารายชื่อ
                  </Button>
                )
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-10 py-2.5 pl-4">
                      <input type="checkbox" className="accent-indigo-600" checked={allChecked} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
                    </th>
                    <th className="w-14 px-2 py-2.5 text-center font-medium">เลขที่</th>
                    <th className="hidden px-2 py-2.5 text-left font-medium sm:table-cell">เลขประจำตัว</th>
                    <th className="px-2 py-2.5 text-left font-medium">ชื่อ-สกุล</th>
                    {roomId === '__all' && <th className="px-2 py-2.5 text-left font-medium">ห้อง</th>}
                    <th className="w-20 py-2.5 pr-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((s) => (
                    <tr key={s.id} className={cn('group', selected.has(s.id) ? 'bg-indigo-50/50' : 'hover:bg-slate-50/70')}>
                      <td className="py-2.5 pl-4">
                        <input type="checkbox" className="accent-indigo-600" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`เลือก ${s.first_name}`} />
                      </td>
                      <td className="tabular px-2 py-2.5 text-center text-slate-500">{s.number ?? '–'}</td>
                      <td className="tabular hidden px-2 py-2.5 text-slate-600 sm:table-cell">{s.student_code || '–'}</td>
                      <td className="px-2 py-2.5">
                        <div className="font-medium text-slate-900">{studentName(s)}</div>
                        {s.student_code && <div className="text-xs text-slate-400 sm:hidden">{s.student_code}</div>}
                      </td>
                      {roomId === '__all' && <td className="px-2 py-2.5 text-slate-600">{classroomLabel(roomOf.get(s.classroom_id))}</td>}
                      <td className="py-2 pr-3">
                        <div className="flex justify-end opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                          <button
                            type="button"
                            aria-label="แก้ไข"
                            onClick={() => {
                              setEditing(s)
                              setModal('edit')
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="ลบ"
                            onClick={() => removeStudents([s.id])}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {selected.size === 0 && list.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <ArrowRightLeft className="size-3.5" /> ติ๊กเลือกเพื่อย้ายห้องหรือลบหลายคนพร้อมกัน
            </p>
          )}
        </>
      )}

      <StudentFormModal
        open={modal === 'add' || modal === 'edit'}
        onClose={() => setModal(null)}
        student={modal === 'edit' ? editing : undefined}
        classrooms={classrooms}
        students={students}
        defaultRoom={currentRoom}
      />
      <ImportStudentsModal open={modal === 'import'} onClose={() => setModal(null)} classrooms={classrooms} students={students} defaultRoom={currentRoom} />
      <CopyStudentsModal open={modal === 'copy'} onClose={() => setModal(null)} classrooms={classrooms} students={students} />
      <AccessCodesModal open={modal === 'codes'} onClose={() => setModal(null)} students={list} classrooms={classrooms} room={currentRoom} />
      <ClassroomsModal open={modal === 'rooms'} onClose={() => setModal(null)} classrooms={classrooms} students={students} />
    </>
  )
}
