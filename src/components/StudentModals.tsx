import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ClipboardPaste, Download, FileUp, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { qk } from '@/hooks/queries'
import { getApi } from '@/lib/api'
import type { Classroom, Student } from '@/lib/api/types'
import { normalizeGrade, parseStudents, promoteGrade, STUDENT_FIELD_LABELS, toCSV } from '@/lib/csv'
import { copyRoster, ensureClassrooms, planImport, roomKey, runImport } from '@/lib/roster'
import { classroomLabel, cn, compareClassrooms, downloadFile, errorMessage, termLabel } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Badge } from '@/components/ui/Misc'
import { Modal, useConfirm } from '@/components/ui/Modal'

const PREFIX_CHOICES = ['ด.ช.', 'ด.ญ.', 'นาย', 'นางสาว']

function useInvalidateRoster() {
  const qc = useQueryClient()
  const { term } = useApp()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.students(term.id) }),
      qc.invalidateQueries({ queryKey: qk.classrooms(term.id) }),
      qc.invalidateQueries({ queryKey: ['submissions'] }),
    ])
}

/* ------------------------------------------------------------------ */
/* เพิ่ม / แก้ไขนักเรียนทีละคน                                          */
/* ------------------------------------------------------------------ */

export function StudentFormModal({
  open,
  onClose,
  student,
  classrooms,
  students,
  defaultRoom,
}: {
  open: boolean
  onClose: () => void
  student?: Student
  classrooms: Classroom[]
  students: Student[]
  defaultRoom?: Classroom
}) {
  return (
    <Modal open={open} onClose={onClose} title={student ? 'แก้ไขข้อมูลนักเรียน' : 'เพิ่มนักเรียน'} size="md">
      {open && <StudentForm student={student} classrooms={classrooms} students={students} defaultRoom={defaultRoom} onDone={onClose} />}
    </Modal>
  )
}

function StudentForm({
  student,
  classrooms,
  students,
  defaultRoom,
  onDone,
}: {
  student?: Student
  classrooms: Classroom[]
  students: Student[]
  defaultRoom?: Classroom
  onDone: () => void
}) {
  const { term } = useApp()
  const invalidate = useInvalidateRoster()
  const current = classrooms.find((c) => c.id === student?.classroom_id) ?? defaultRoom ?? classrooms[0]
  const nextNumber = (g: string, r: string) => {
    const c = classrooms.find((x) => x.grade === g && x.room === r)
    const nums = students.filter((s) => s.classroom_id === c?.id).map((s) => s.number ?? 0)
    return nums.length ? Math.max(...nums) + 1 : 1
  }
  const [grade, setGrade] = useState(current?.grade ?? 'ม.1')
  const [room, setRoom] = useState(current?.room ?? '1')
  const [number, setNumber] = useState(String(student?.number ?? nextNumber(grade, room)))
  const [code, setCode] = useState(student?.student_code ?? '')
  const [prefix, setPrefix] = useState(student?.prefix ?? '')
  const [first, setFirst] = useState(student?.first_name ?? '')
  const [last, setLast] = useState(student?.last_name ?? '')
  const [busy, setBusy] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)
  const grades = [...new Set(classrooms.map((c) => c.grade))]

  async function save(addAnother: boolean) {
    if (!first.trim()) return toast.error('กรอกชื่อนักเรียน')
    if (!grade.trim() || !room.trim()) return toast.error('กรอกชั้นและห้อง')
    const g = normalizeGrade(grade)
    setBusy(true)
    try {
      const api = getApi()
      const rooms = await ensureClassrooms(api, term.id, [{ grade: g, room }], classrooms)
      const payload = {
        term_id: term.id,
        classroom_id: rooms.get(roomKey(g, room))!,
        number: number.trim() ? Number(number) : null,
        student_code: code.trim(),
        prefix: prefix.trim(),
        first_name: first.trim(),
        last_name: last.trim(),
      }
      if (student) await api.updateStudents([{ ...payload, id: student.id }])
      else await api.insertStudents([payload])
      await invalidate()
      toast.success(student ? 'บันทึกแล้ว' : `เพิ่ม ${payload.first_name} แล้ว`)
      if (addAnother) {
        setNumber(String((payload.number ?? 0) + 1))
        setCode(/^\d+$/.test(code) ? String(Number(code) + 1).padStart(code.length, '0') : '')
        setFirst('')
        setLast('')
        firstRef.current?.focus()
      } else onDone()
    } catch (e) {
      toast.error(errorMessage(e).includes('ซ้ำ') ? 'เลขประจำตัวนี้มีอยู่แล้วในภาคเรียนนี้' : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        save(!student)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="ชั้น">
          <Input list="grade-list" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="ม.1" required />
          <datalist id="grade-list">
            {grades.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field label="ห้อง">
          <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="1" required />
        </Field>
        <Field label="เลขที่">
          <Input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} />
        </Field>
      </div>
      <Field label="เลขประจำตัวนักเรียน">
        <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น 36001" />
      </Field>
      <Field label="คำนำหน้า">
        <div className="flex flex-wrap gap-2">
          {PREFIX_CHOICES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrefix(p)}
              className={cn(
                'h-9 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset',
                prefix === p ? 'bg-indigo-600 text-white ring-indigo-600' : 'text-slate-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {p}
            </button>
          ))}
          <Input className="w-28" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="อื่น ๆ" />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ชื่อ">
          <Input ref={firstRef} value={first} onChange={(e) => setFirst(e.target.value)} required autoFocus />
        </Field>
        <Field label="นามสกุล">
          <Input value={last} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button onClick={onDone}>ปิด</Button>
        {!student && (
          <Button onClick={() => save(false)} loading={busy}>
            บันทึก
          </Button>
        )}
        <Button type="submit" variant="primary" loading={busy}>
          {student ? 'บันทึก' : 'บันทึกและเพิ่มคนถัดไป'}
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* นำเข้าจาก Excel / CSV                                              */
/* ------------------------------------------------------------------ */

export function ImportStudentsModal({
  open,
  onClose,
  classrooms,
  students,
  defaultRoom,
}: {
  open: boolean
  onClose: () => void
  classrooms: Classroom[]
  students: Student[]
  defaultRoom?: Classroom
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="นำเข้ารายชื่อนักเรียน"
      description="คัดลอกจาก Excel / Google Sheets มาวาง หรือเลือกไฟล์ CSV"
    >
      {open && <ImportForm classrooms={classrooms} students={students} defaultRoom={defaultRoom} onDone={onClose} />}
    </Modal>
  )
}

function ImportForm({
  classrooms,
  students,
  defaultRoom,
  onDone,
}: {
  classrooms: Classroom[]
  students: Student[]
  defaultRoom?: Classroom
  onDone: () => void
}) {
  const { term } = useApp()
  const invalidate = useInvalidateRoster()
  const [text, setText] = useState('')
  const [grade, setGrade] = useState(defaultRoom?.grade ?? '')
  const [room, setRoom] = useState(defaultRoom?.room ?? '')
  const [updateExisting, setUpdateExisting] = useState(true)
  const [busy, setBusy] = useState(false)

  const parsed = useMemo(() => parseStudents(text, { grade: normalizeGrade(grade), room: room.trim() }), [text, grade, room])
  const plan = useMemo(() => planImport(parsed.rows, students, updateExisting), [parsed.rows, students, updateExisting])
  const newRooms = useMemo(() => {
    const have = new Set(classrooms.map((c) => roomKey(c.grade, c.room)))
    return [...new Set([...plan.inserts, ...plan.updates.map((u) => u.row)].map((r) => roomKey(r.grade, r.room)))].filter((k) => !have.has(k))
  }, [plan, classrooms])

  async function onFile(file: File) {
    const buf = await file.arrayBuffer()
    let content = new TextDecoder('utf-8').decode(buf)
    // ไฟล์ CSV จาก Excel ภาษาไทยรุ่นเก่ามักเป็น TIS-620 / Windows-874
    if (content.split('').some((c) => c.charCodeAt(0) === 0xfffd)) {
      try {
        content = new TextDecoder('windows-874').decode(buf)
      } catch {
        /* ใช้ utf-8 ต่อ */
      }
    }
    setText(content)
  }

  function template() {
    downloadFile(
      'แม่แบบรายชื่อนักเรียน.csv',
      toCSV([
        ['ชั้น', 'ห้อง', 'เลขที่', 'เลขประจำตัว', 'คำนำหน้า', 'ชื่อ', 'นามสกุล'],
        ['ม.1', '1', 1, '36001', 'ด.ช.', 'ตัวอย่าง', 'นามสกุลตัวอย่าง'],
      ]),
    )
  }

  async function submit() {
    if (plan.inserts.length + plan.updates.length === 0) return
    setBusy(true)
    try {
      await runImport(getApi(), term.id, plan, classrooms)
      await invalidate()
      toast.success(`นำเข้าแล้ว: เพิ่ม ${plan.inserts.length} คน${plan.updates.length ? ` · อัปเดต ${plan.updates.length} คน` : ''}`)
      onDone()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const preview = parsed.rows.slice(0, 200)
  const errorOf = new Map(plan.errors.map((e) => [e.row, e.error]))
  const updateSet = new Set(plan.updates.map((u) => u.row))
  const skipSet = new Set(plan.skipped)
  const usedCols = parsed.columns.filter((c) => c in STUDENT_FIELD_LABELS || c === 'full_name')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-40 font-mono text-xs"
            placeholder={'ชั้น\tห้อง\tเลขที่\tเลขประจำตัว\tคำนำหน้า\tชื่อ\tนามสกุล\nม.1\t1\t1\t36001\tด.ช.\tสมชาย\tใจดี'}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<ClipboardPaste className="size-4" />}
              onClick={async () => {
                try {
                  setText(await navigator.clipboard.readText())
                } catch {
                  toast.error('เบราว์เซอร์ไม่อนุญาตให้อ่านคลิปบอร์ด กด Ctrl+V ในช่องแทน')
                }
              }}
            >
              วางจากคลิปบอร์ด
            </Button>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-slate-700 shadow-card ring-1 ring-slate-200 ring-inset hover:bg-slate-50">
              <FileUp className="size-4" /> เลือกไฟล์ CSV
              <input type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={template}>
              ดาวน์โหลดแม่แบบ
            </Button>
          </div>
        </div>
        <div className="space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/70 ring-inset">
          <p className="text-xs text-slate-600">
            ถ้าข้อมูลไม่มีคอลัมน์ <b>ชั้น/ห้อง</b> ให้ใช้ค่านี้:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="ชั้น เช่น ม.1" />
            <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="ห้อง" />
          </div>
          <Checkbox
            label="อัปเดตคนที่มีเลขประจำตัวซ้ำ"
            description="ไม่ติ๊ก = ข้ามคนที่มีอยู่แล้ว"
            checked={updateExisting}
            onChange={(e) => setUpdateExisting(e.target.checked)}
          />
        </div>
      </div>

      {parsed.rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="green">เพิ่มใหม่ {plan.inserts.length}</Badge>
            {plan.updates.length > 0 && <Badge tone="indigo">อัปเดต {plan.updates.length}</Badge>}
            {plan.skipped.length > 0 && <Badge tone="gray">ข้าม {plan.skipped.length}</Badge>}
            {plan.errors.length > 0 && <Badge tone="red">ข้อมูลไม่ครบ {plan.errors.length}</Badge>}
            {newRooms.length > 0 && <Badge tone="amber">สร้างห้องใหม่: {newRooms.join(', ')}</Badge>}
            <span className="text-xs text-slate-500">
              {parsed.hasHeader ? 'พบหัวตาราง' : 'ไม่มีหัวตาราง — เดาคอลัมน์:'} {usedCols.map((c) => (c === 'full_name' ? 'ชื่อ-สกุล' : STUDENT_FIELD_LABELS[c as keyof typeof STUDENT_FIELD_LABELS])).join(' · ')}
            </span>
          </div>
          <div className="scrollbar-thin max-h-72 overflow-auto rounded-xl ring-1 ring-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  {['', 'ชั้น/ห้อง', 'เลขที่', 'เลขประจำตัว', 'คำนำหน้า', 'ชื่อ', 'นามสกุล'].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map((r, i) => {
                  const isUpdate = updateSet.has(r)
                  const isSkip = skipSet.has(r)
                  const err = errorOf.get(r)
                  return (
                    <tr key={i} className={cn(err && 'bg-rose-50', isSkip && 'text-slate-400')}>
                      <td className="px-2 py-1">
                        {err ? (
                          <span className="text-rose-600" title={err}>
                            <X className="size-3.5" />
                          </span>
                        ) : isUpdate ? (
                          <Pencil className="size-3.5 text-indigo-500" />
                        ) : isSkip ? (
                          '–'
                        ) : (
                          <Check className="size-3.5 text-emerald-500" />
                        )}
                      </td>
                      <td className="px-2 py-1">{r.grade && r.room ? `${r.grade}/${r.room}` : <span className="text-rose-600">{err}</span>}</td>
                      <td className="px-2 py-1">{r.number ?? ''}</td>
                      <td className="px-2 py-1">{r.student_code}</td>
                      <td className="px-2 py-1">{r.prefix}</td>
                      <td className="px-2 py-1">{r.first_name || <span className="text-rose-600">ไม่มีชื่อ</span>}</td>
                      <td className="px-2 py-1">{r.last_name}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > preview.length && <p className="text-xs text-slate-500">แสดง {preview.length} จาก {parsed.rows.length} แถว</p>}
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>ยกเลิก</Button>
        <Button variant="primary" onClick={submit} loading={busy} disabled={plan.inserts.length + plan.updates.length === 0}>
          นำเข้า {plan.inserts.length + plan.updates.length > 0 && `${plan.inserts.length + plan.updates.length} คน`}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* คัดลอกจากภาคเรียนอื่น                                               */
/* ------------------------------------------------------------------ */

export function CopyStudentsModal({
  open,
  onClose,
  classrooms,
  students,
}: {
  open: boolean
  onClose: () => void
  classrooms: Classroom[]
  students: Student[]
}) {
  return (
    <Modal open={open} onClose={onClose} title="คัดลอกรายชื่อจากภาคเรียนอื่น" size="md">
      {open && <CopyForm classrooms={classrooms} students={students} onDone={onClose} />}
    </Modal>
  )
}

function CopyForm({ classrooms, students, onDone }: { classrooms: Classroom[]; students: Student[]; onDone: () => void }) {
  const { term, terms } = useApp()
  const invalidate = useInvalidateRoster()
  const others = terms.filter((t) => t.id !== term.id)
  const [from, setFrom] = useState(others[0]?.id ?? '')
  const fromYear = terms.find((t) => t.id === from)?.academic_year ?? term.academic_year
  const [srcRooms, setSrcRooms] = useState<Classroom[] | null>(null)
  const [srcCounts, setSrcCounts] = useState<Map<string, number>>(new Map())
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [promote, setPromote] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!from) return
    let cancelled = false
    setSrcRooms(null)
    const api = getApi()
    Promise.all([api.listClassrooms(from), api.listStudents(from)])
      .then(([rooms, stu]) => {
        if (cancelled) return
        const sorted = [...rooms].sort(compareClassrooms)
        setSrcRooms(sorted)
        setChosen(new Set(sorted.map((r) => r.id)))
        const counts = new Map<string, number>()
        stu.forEach((s) => counts.set(s.classroom_id, (counts.get(s.classroom_id) ?? 0) + 1))
        setSrcCounts(counts)
        // ข้ามปีการศึกษา → แนะนำให้เลื่อนชั้น
        setPromote(fromYear < term.academic_year)
      })
      .catch((e) => !cancelled && toast.error(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [from, fromYear, term.academic_year])

  async function submit() {
    setBusy(true)
    try {
      const r = await copyRoster(getApi(), {
        fromTermId: from,
        toTermId: term.id,
        classroomIds: [...chosen],
        promote,
        targetClassrooms: classrooms,
        targetStudents: students,
      })
      await invalidate()
      toast.success(`คัดลอกแล้ว ${r.added} คน${r.skipped ? ` (ข้ามที่มีอยู่แล้ว ${r.skipped} คน)` : ''}`)
      onDone()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (others.length === 0)
    return <p className="text-sm text-slate-600">ยังไม่มีภาคเรียนอื่น — เพิ่มภาคเรียนได้ที่หน้าตั้งค่า</p>

  return (
    <div className="space-y-4">
      <Field label={`คัดลอกมาที่ภาค ${termLabel(term)} จาก`}>
        <Select value={from} onChange={(e) => setFrom(e.target.value)}>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              ภาค {termLabel(t)}
            </option>
          ))}
        </Select>
      </Field>
      {srcRooms == null ? (
        <p className="text-sm text-slate-500">กำลังโหลด…</p>
      ) : srcRooms.length === 0 ? (
        <p className="text-sm text-slate-500">ภาคเรียนนั้นไม่มีห้องเรียน</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">เลือกห้อง</span>
            <button
              type="button"
              className="text-xs text-indigo-600 hover:underline"
              onClick={() => setChosen(chosen.size === srcRooms.length ? new Set() : new Set(srcRooms.map((r) => r.id)))}
            >
              {chosen.size === srcRooms.length ? 'ไม่เลือกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {srcRooms.map((r) => (
              <label
                key={r.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 ring-inset',
                  chosen.has(r.id) ? 'bg-indigo-50 ring-indigo-200' : 'ring-slate-200',
                )}
              >
                <input
                  type="checkbox"
                  className="accent-indigo-600"
                  checked={chosen.has(r.id)}
                  onChange={(e) => {
                    const next = new Set(chosen)
                    if (e.target.checked) next.add(r.id)
                    else next.delete(r.id)
                    setChosen(next)
                  }}
                />
                <span className="font-medium">{classroomLabel(r)}</span>
                {promote && <span className="text-xs text-indigo-600">→ {promoteGrade(r.grade)}/{r.room}</span>}
                <span className="ml-auto text-xs text-slate-500">{srcCounts.get(r.id) ?? 0}</span>
              </label>
            ))}
          </div>
          <Checkbox
            label="เลื่อนชั้นอัตโนมัติ (ม.1 → ม.2)"
            description="ใช้เมื่อคัดลอกข้ามปีการศึกษา"
            checked={promote}
            onChange={(e) => setPromote(e.target.checked)}
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>ยกเลิก</Button>
        <Button variant="primary" onClick={submit} loading={busy} disabled={!srcRooms || chosen.size === 0}>
          คัดลอก
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* จัดการห้องเรียน                                                     */
/* ------------------------------------------------------------------ */

export function ClassroomsModal({
  open,
  onClose,
  classrooms,
  students,
}: {
  open: boolean
  onClose: () => void
  classrooms: Classroom[]
  students: Student[]
}) {
  const { term } = useApp()
  const invalidate = useInvalidateRoster()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [grade, setGrade] = useState('')
  const [room, setRoom] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [eg, setEg] = useState('')
  const [er, setEr] = useState('')

  const count = (id: string) => students.filter((s) => s.classroom_id === id).length

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!grade.trim() || !room.trim()) return
    try {
      await getApi().createClassrooms([{ term_id: term.id, grade: normalizeGrade(grade), room: room.trim() }])
      await invalidate()
      setRoom(/^\d+$/.test(room) ? String(Number(room) + 1) : '')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function rename(c: Classroom) {
    try {
      await getApi().updateClassroom(c.id, { grade: normalizeGrade(eg), room: er.trim() })
      await invalidate()
      setEditing(null)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function remove(c: Classroom) {
    const n = count(c.id)
    const ok = await confirm({
      title: `ลบห้อง ${classroomLabel(c)}?`,
      message: n > 0 ? `นักเรียน ${n} คนในห้องนี้และคะแนนทั้งหมดของพวกเขาจะถูกลบด้วย` : 'ห้องนี้ไม่มีนักเรียน',
      confirmText: 'ลบห้อง',
      danger: true,
      typeToConfirm: n > 0 ? classroomLabel(c) : undefined,
    })
    if (!ok) return
    try {
      await getApi().deleteClassroom(c.id)
      await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: qk.subjects(term.id) })])
      toast.success('ลบห้องแล้ว')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ห้องเรียน" description={`ภาค ${termLabel(term)}`} size="md">
      <form onSubmit={add} className="mb-4 flex gap-2">
        <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="ชั้น เช่น ม.1" className="w-32" />
        <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="ห้อง" className="w-20" />
        <Button type="submit" variant="primary" icon={<Plus className="size-4" />}>
          เพิ่มห้อง
        </Button>
      </form>
      {classrooms.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีห้องเรียน</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {classrooms.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editing === c.id ? (
                <>
                  <Input value={eg} onChange={(e) => setEg(e.target.value)} className="h-8 w-24" />
                  <span className="text-slate-400">/</span>
                  <Input value={er} onChange={(e) => setEr(e.target.value)} className="h-8 w-16" />
                  <Button size="sm" variant="primary" onClick={() => rename(c)}>
                    บันทึก
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    ยกเลิก
                  </Button>
                </>
              ) : (
                <>
                  <span className="font-medium">{classroomLabel(c)}</span>
                  <span className="text-xs text-slate-500">{count(c.id)} คน</span>
                  <div className="ml-auto flex">
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="แก้ไข"
                      onClick={() => {
                        setEditing(c.id)
                        setEg(c.grade)
                        setEr(c.room)
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="ลบ"
                      onClick={() => remove(c)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
