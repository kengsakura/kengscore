import type { Assignment, DueDate, ISODate, LatePolicy, ScoreGroup, Student, Submission, UUID } from './api/types'
import { scoreSubmission, type ScoreResult } from './scoring'

export interface GradeCell {
  assignment: Assignment
  due: ISODate
  sub?: Submission
  result?: ScoreResult
}

/** คอลัมน์ของ "คะแนนหลัก": กลุ่มคะแนน หรือ งานเดี่ยวที่ไม่ได้อยู่ในกลุ่ม */
export type MainColumn =
  | { kind: 'group'; group: ScoreGroup; members: Assignment[] }
  | { kind: 'assignment'; assignment: Assignment }

export interface MainCell {
  score: number
  max: number
  /** จำนวนงานในคอลัมน์นี้ที่ยังไม่ส่ง */
  missing: number
}

export interface GradeRow {
  student: Student
  cells: GradeCell[]
  /** คะแนนตามคอลัมน์ของ mainColumns (เรียงตรงกัน) */
  main: MainCell[]
  /** คะแนนรวม: ถ้ามีกลุ่มคะแนน = รวมจากคะแนนหลัก */
  total: number
  max: number
  submitted: number
  missing: number
  late: number
}

export interface AssignmentStat {
  assignment: Assignment
  due: ISODate
  submitted: number
  late: number
  average: number | null
}

export const subKey = (assignmentId: UUID, studentId: UUID) => `${assignmentId}:${studentId}`

export function dueDateFor(assignment: Assignment, classroomId: UUID, dueDates: DueDate[]): ISODate {
  return dueDates.find((d) => d.assignment_id === assignment.id && d.classroom_id === classroomId)?.due_date ?? assignment.due_date
}

export function indexSubmissions(subs: Submission[]) {
  const map = new Map<string, Submission>()
  for (const s of subs) map.set(subKey(s.assignment_id, s.student_id), s)
  return map
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** จัดคอลัมน์คะแนนหลัก ตามลำดับงาน: กลุ่มอยู่ตรงตำแหน่งงานแรกของกลุ่ม */
export function mainColumns(assignments: Assignment[], groups: ScoreGroup[]): MainColumn[] {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const out: MainColumn[] = []
  const placed = new Map<UUID, Extract<MainColumn, { kind: 'group' }>>()
  for (const a of assignments) {
    const g = a.group_id ? byId.get(a.group_id) : undefined
    if (!g) {
      out.push({ kind: 'assignment', assignment: a })
      continue
    }
    let col = placed.get(g.id)
    if (!col) {
      col = { kind: 'group', group: g, members: [] }
      placed.set(g.id, col)
      out.push(col)
    }
    col.members.push(a)
  }
  return out
}

export const columnMax = (c: MainColumn) => (c.kind === 'group' ? c.group.max_score : c.assignment.max_score)

/**
 * คะแนนกลุ่ม = (ผลรวมคะแนนที่ได้ ÷ ผลรวมคะแนนเต็มของงานในกลุ่ม) × คะแนนเต็มของกลุ่ม
 * งานที่ไม่ส่งนับเป็น 0
 */
export function groupScore(members: { final: number; max: number }[], groupMax: number): number {
  const max = members.reduce((n, m) => n + m.max, 0)
  if (max <= 0) return 0
  return r2((members.reduce((n, m) => n + m.final, 0) / max) * groupMax)
}

export function buildGradebook(
  students: Student[],
  assignments: Assignment[],
  subs: Submission[],
  dueDates: DueDate[],
  classroomId: UUID,
  fallback: LatePolicy,
  groups: ScoreGroup[] = [],
): { rows: GradeRow[]; stats: AssignmentStat[]; maxTotal: number; columns: MainColumn[] } {
  const subMap = indexSubmissions(subs)
  const dues = assignments.map((a) => dueDateFor(a, classroomId, dueDates))
  const columns = mainColumns(assignments, groups)
  const maxTotal = r2(columns.reduce((n, c) => n + columnMax(c), 0))
  const indexOf = new Map(assignments.map((a, i) => [a.id, i]))
  const statAcc = assignments.map(() => ({ submitted: 0, late: 0, sum: 0 }))

  const rows = students.map((student): GradeRow => {
    let submitted = 0
    let late = 0
    const cells = assignments.map((assignment, i): GradeCell => {
      const due = dues[i]
      const sub = subMap.get(subKey(assignment.id, student.id))
      if (!sub) return { assignment, due }
      const result = scoreSubmission(sub, assignment, due, fallback)
      submitted++
      statAcc[i].submitted++
      statAcc[i].sum += result.final
      if (result.lateDays > 0) {
        late++
        statAcc[i].late++
      }
      return { assignment, due, sub, result }
    })
    const main = columns.map((c): MainCell => {
      if (c.kind === 'assignment') {
        const cell = cells[indexOf.get(c.assignment.id)!]
        return { score: cell.result?.final ?? 0, max: c.assignment.max_score, missing: cell.sub ? 0 : 1 }
      }
      const mem = c.members.map((a) => cells[indexOf.get(a.id)!])
      return {
        score: groupScore(mem.map((m) => ({ final: m.result?.final ?? 0, max: m.assignment.max_score })), c.group.max_score),
        max: c.group.max_score,
        missing: mem.filter((m) => !m.sub).length,
      }
    })
    return {
      student,
      cells,
      main,
      total: r2(main.reduce((n, m) => n + m.score, 0)),
      max: maxTotal,
      submitted,
      missing: assignments.length - submitted,
      late,
    }
  })

  const stats = assignments.map((assignment, i): AssignmentStat => ({
    assignment,
    due: dues[i],
    submitted: statAcc[i].submitted,
    late: statAcc[i].late,
    average: statAcc[i].submitted ? Math.round((statAcc[i].sum / statAcc[i].submitted) * 100) / 100 : null,
  }))

  return { rows, stats, maxTotal, columns }
}

/** เรียงงานตามลำดับประเภทในตั้งค่า แล้วตามกำหนดส่ง */
export function sortByCategory(assignments: Assignment[], categories: string[]): Assignment[] {
  const order = (c: string) => {
    const i = categories.indexOf(c)
    return i < 0 ? categories.length : i
  }
  return [...assignments].sort(
    (a, b) =>
      order(a.category) - order(b.category) ||
      a.category.localeCompare(b.category, 'th') ||
      a.due_date.localeCompare(b.due_date) ||
      a.created_at.localeCompare(b.created_at),
  )
}
