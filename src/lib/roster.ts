import type { Api, Classroom, Student, StudentInput, UUID } from './api/types'
import { promoteGrade, type ParsedStudentRow } from './csv'

export const roomKey = (grade: string, room: string) => `${grade.trim()}/${room.trim()}`

/** หา/สร้างห้องเรียนที่ต้องใช้ คืนค่า map "ชั้น/ห้อง" → classroom id */
export async function ensureClassrooms(
  api: Api,
  termId: UUID,
  pairs: { grade: string; room: string }[],
  existing: Classroom[],
): Promise<Map<string, UUID>> {
  const map = new Map(existing.map((c) => [roomKey(c.grade, c.room), c.id]))
  const missing = new Map<string, { term_id: UUID; grade: string; room: string }>()
  for (const p of pairs) {
    const k = roomKey(p.grade, p.room)
    if (!map.has(k) && !missing.has(k)) missing.set(k, { term_id: termId, grade: p.grade.trim(), room: p.room.trim() })
  }
  if (missing.size) {
    const created = await api.createClassrooms([...missing.values()])
    for (const c of created) map.set(roomKey(c.grade, c.room), c.id)
  }
  return map
}

export interface ImportPlan {
  inserts: ParsedStudentRow[]
  updates: { row: ParsedStudentRow; existing: Student }[]
  skipped: ParsedStudentRow[]
  errors: { row: ParsedStudentRow; error: string }[]
}

export function planImport(rows: ParsedStudentRow[], existing: Student[], updateExisting: boolean): ImportPlan {
  const byCode = new Map(existing.filter((s) => s.student_code).map((s) => [s.student_code, s]))
  const seen = new Set<string>()
  const plan: ImportPlan = { inserts: [], updates: [], skipped: [], errors: [] }
  for (const row of rows) {
    if (row.error) {
      plan.errors.push({ row, error: row.error })
      continue
    }
    if (row.student_code) {
      if (seen.has(row.student_code)) {
        plan.errors.push({ row, error: 'เลขประจำตัวซ้ำในข้อมูลที่วาง' })
        continue
      }
      seen.add(row.student_code)
      const ex = byCode.get(row.student_code)
      if (ex) {
        if (updateExisting) plan.updates.push({ row, existing: ex })
        else plan.skipped.push(row)
        continue
      }
    }
    plan.inserts.push(row)
  }
  return plan
}

export async function runImport(api: Api, termId: UUID, plan: ImportPlan, classrooms: Classroom[]) {
  const all = [...plan.inserts, ...plan.updates.map((u) => u.row)]
  const rooms = await ensureClassrooms(api, termId, all, classrooms)
  const toInput = (r: ParsedStudentRow): StudentInput => ({
    term_id: termId,
    classroom_id: rooms.get(roomKey(r.grade, r.room))!,
    number: r.number,
    student_code: r.student_code,
    prefix: r.prefix,
    first_name: r.first_name,
    last_name: r.last_name,
  })
  if (plan.inserts.length) await api.insertStudents(plan.inserts.map(toInput))
  if (plan.updates.length) await api.updateStudents(plan.updates.map((u) => ({ ...toInput(u.row), id: u.existing.id })))
}

/** คัดลอกห้อง + นักเรียนจากภาคเรียนอื่น */
export async function copyRoster(
  api: Api,
  opts: {
    fromTermId: UUID
    toTermId: UUID
    classroomIds: UUID[]
    promote: boolean
    targetClassrooms: Classroom[]
    targetStudents: Student[]
  },
): Promise<{ added: number; skipped: number }> {
  const [srcRooms, srcStudents] = await Promise.all([api.listClassrooms(opts.fromTermId), api.listStudents(opts.fromTermId)])
  const chosen = srcRooms.filter((c) => opts.classroomIds.includes(c.id))
  const gradeOf = (g: string) => (opts.promote ? promoteGrade(g) : g)
  const rooms = await ensureClassrooms(
    api,
    opts.toTermId,
    chosen.map((c) => ({ grade: gradeOf(c.grade), room: c.room })),
    opts.targetClassrooms,
  )
  const codes = new Set(opts.targetStudents.map((s) => s.student_code).filter(Boolean))
  const roomById = new Map(chosen.map((c) => [c.id, c]))
  let skipped = 0
  const inserts: StudentInput[] = []
  for (const s of srcStudents) {
    const c = roomById.get(s.classroom_id)
    if (!c) continue
    if (s.student_code && codes.has(s.student_code)) {
      skipped++
      continue
    }
    inserts.push({
      term_id: opts.toTermId,
      classroom_id: rooms.get(roomKey(gradeOf(c.grade), c.room))!,
      number: s.number,
      student_code: s.student_code,
      prefix: s.prefix,
      first_name: s.first_name,
      last_name: s.last_name,
    })
  }
  if (inserts.length) await api.insertStudents(inserts)
  return { added: inserts.length, skipped }
}
