import type { Assignment, DueDate, ISODate, LatePolicy, Student, Submission, UUID } from './api/types'
import { scoreSubmission, type ScoreResult } from './scoring'

export interface GradeCell {
  assignment: Assignment
  due: ISODate
  sub?: Submission
  result?: ScoreResult
}

export interface GradeRow {
  student: Student
  cells: GradeCell[]
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

export function buildGradebook(
  students: Student[],
  assignments: Assignment[],
  subs: Submission[],
  dueDates: DueDate[],
  classroomId: UUID,
  fallback: LatePolicy,
): { rows: GradeRow[]; stats: AssignmentStat[]; maxTotal: number } {
  const subMap = indexSubmissions(subs)
  const dues = assignments.map((a) => dueDateFor(a, classroomId, dueDates))
  const maxTotal = assignments.reduce((n, a) => n + a.max_score, 0)
  const statAcc = assignments.map(() => ({ submitted: 0, late: 0, sum: 0 }))

  const rows = students.map((student): GradeRow => {
    let total = 0
    let submitted = 0
    let late = 0
    const cells = assignments.map((assignment, i): GradeCell => {
      const due = dues[i]
      const sub = subMap.get(subKey(assignment.id, student.id))
      if (!sub) return { assignment, due }
      const result = scoreSubmission(sub, assignment, due, fallback)
      total += result.final
      submitted++
      statAcc[i].submitted++
      statAcc[i].sum += result.final
      if (result.lateDays > 0) {
        late++
        statAcc[i].late++
      }
      return { assignment, due, sub, result }
    })
    return {
      student,
      cells,
      total: Math.round(total * 100) / 100,
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

  return { rows, stats, maxTotal }
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
